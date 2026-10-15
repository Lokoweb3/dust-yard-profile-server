using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using Chaos.NaCl;
using UnityEngine;
using UnityEngine.Networking;

namespace DustYard
{
    /// <summary>
    /// Reports matches to the Dust Yard profile server the same way the browser game does
    /// (game/src/31-cosmetics-signin-swap.js): a device-local ed25519 guest key signs
    /// start / wave / end reports over canonical (key-sorted) JSON. Verified results feed
    /// the leaderboard and, once the wallet claims this device, the profile NFT.
    /// </summary>
    public class ProfileClient : MonoBehaviour
    {
        public string serverUrl = "https://dust-yard-profile-server-production.up.railway.app";
        public bool report = true;
        public string map = "yard";
        public string mode = "waves";

        public string GuestId => guestPub;

        WaveSpawner spawner; Health playerHealth; Weapon weapon;
        string guestPub; byte[] expandedKey;
        string sid; int heads; bool ended;
        readonly Queue<Func<IEnumerator>> queue = new Queue<Func<IEnumerator>>();
        bool running;

        void Start()
        {
            if (!LoadOrCreateKey()) { enabled = false; return; }
            spawner = FindFirstObjectByType<WaveSpawner>();
            weapon = FindFirstObjectByType<Weapon>();
            var pc = FindFirstObjectByType<PlayerController>();
            playerHealth = pc ? pc.GetComponent<Health>() : null;
            if (!spawner || !weapon || !playerHealth) { Debug.LogWarning("ProfileClient: scene refs missing, reporting off"); enabled = false; return; }
            spawner.WaveStarted += w => { if (w == 1) BeginMatch(); };
            spawner.WaveCleared += w => QueueWave(w, spawner.Kills, heads);
            weapon.Hit += (killed, head) => { if (killed && head) heads++; };
            playerHealth.Died += () => QueueEnd(spawner.Wave, spawner.Kills, heads);
        }

        bool LoadOrCreateKey()
        {
            try
            {
                byte[] seed;
                var stored = PlayerPrefs.GetString("dy-guest-seed", "");
                if (stored.Length > 0) seed = Convert.FromBase64String(stored);
                else
                {
                    seed = new byte[32];
                    using (var rng = System.Security.Cryptography.RandomNumberGenerator.Create()) rng.GetBytes(seed);
                    PlayerPrefs.SetString("dy-guest-seed", Convert.ToBase64String(seed));
                    PlayerPrefs.Save();
                }
                byte[] pub;
                Ed25519.KeyPairFromSeed(out pub, out expandedKey, seed);
                guestPub = Base58.Encode(pub);
                return true;
            }
            catch (Exception e) { Debug.LogWarning("ProfileClient: no guest key: " + e.Message); return false; }
        }

        /* ---------- canonical JSON + signing, matching lib/util.js canonical() ---------- */
        static string JsonValue(object v)
        {
            if (v == null) return "null";
            if (v is string s)
            {
                var sb = new StringBuilder("\"");
                foreach (var c in s)
                {
                    if (c == '"' || c == '\\') sb.Append('\\').Append(c);
                    else if (c < ' ') sb.Append("\\u").Append(((int)c).ToString("x4"));
                    else sb.Append(c);
                }
                return sb.Append('"').ToString();
            }
            if (v is long l) return l.ToString(System.Globalization.CultureInfo.InvariantCulture);
            if (v is int i) return i.ToString(System.Globalization.CultureInfo.InvariantCulture);
            throw new ArgumentException("unsupported json value");
        }

        static string Canonical((string k, object v)[] fields) =>
            "{" + string.Join(",", fields.OrderBy(f => f.k, StringComparer.Ordinal)
                .Select(f => JsonValue(f.k) + ":" + JsonValue(f.v))) + "}";

        string Sign(string canonicalJson) =>
            Base58.Encode(Ed25519.Sign(Encoding.UTF8.GetBytes(canonicalJson), expandedKey));

        static string Body((string k, object v)[] fields, string sig) =>
            "{" + string.Join(",", fields.Select(f => JsonValue(f.k) + ":" + JsonValue(f.v)))
                + "," + JsonValue("sig") + ":" + JsonValue(sig) + "}";

        static long Now() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        /* ---------- reports, sent one at a time in order like the browser's matchQ ---------- */
        void BeginMatch()
        {
            sid = null; heads = 0; ended = false;
            if (!report || string.IsNullOrEmpty(serverUrl)) return;
            Enqueue(() => PostStart());
        }

        void QueueWave(int wave, int kills, int headCount)
        {
            if (!report || ended) return;
            Enqueue(() => PostWave(wave, kills, headCount, Now()));
        }

        void QueueEnd(int wave, int kills, int headCount)
        {
            if (!report || ended) return;
            ended = true;
            Enqueue(() => PostEnd(wave, kills, headCount, Now()));
        }

        void Enqueue(Func<IEnumerator> step)
        {
            queue.Enqueue(step);
            if (!running) StartCoroutine(Run());
        }

        IEnumerator Run()
        {
            running = true;
            while (queue.Count > 0) yield return StartCoroutine(queue.Dequeue()());
            running = false;
        }

        IEnumerator PostStart()
        {
            long ts = Now();
            var signed = new (string, object)[] { ("op", "start"), ("guest", guestPub), ("map", map), ("mode", mode), ("ts", ts) };
            var body = new (string, object)[] { ("guest", guestPub), ("map", map), ("mode", mode), ("ts", ts) };
            string resp = null;
            yield return Post("/api/match/start", Body(body, Sign(Canonical(signed))), r => resp = r);
            if (resp != null)
            {
                var m = System.Text.RegularExpressions.Regex.Match(resp, "\"sid\"\\s*:\\s*\"([0-9a-f]+)\"");
                if (m.Success) { sid = m.Groups[1].Value; Debug.Log($"ProfileClient: match {sid} started as {guestPub}"); }
            }
        }

        IEnumerator PostWave(int wave, int kills, int headCount, long ts)
        {
            if (sid == null) yield break;
            var f = new (string, object)[] { ("op", "wave"), ("guest", guestPub), ("sid", sid), ("wave", wave),
                ("kills", kills), ("heads", headCount), ("bosses", 0), ("xp", 0), ("host", null), ("ts", ts) };
            yield return Post("/api/match/wave", Body(f, Sign(Canonical(f))), null);
        }

        IEnumerator PostEnd(int wave, int kills, int headCount, long ts)
        {
            if (sid == null) yield break;
            var f = new (string, object)[] { ("op", "end"), ("guest", guestPub), ("sid", sid), ("wave", wave),
                ("kills", kills), ("heads", headCount), ("bosses", 0), ("xp", 0), ("score", 0), ("ts", ts) };
            string resp = null;
            yield return Post("/api/match/end", Body(f, Sign(Canonical(f))), r => resp = r);
            if (resp != null) Debug.Log("ProfileClient: match ended, server said: " + resp);
        }

        IEnumerator Post(string path, string json, Action<string> onOk)
        {
            using (var req = new UnityWebRequest(serverUrl + path, "POST"))
            {
                req.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(json));
                req.downloadHandler = new DownloadHandlerBuffer();
                req.SetRequestHeader("Content-Type", "application/json");
                req.timeout = 10;
                yield return req.SendWebRequest();
                if (req.result == UnityWebRequest.Result.Success) onOk?.Invoke(req.downloadHandler.text);
                else Debug.LogWarning($"ProfileClient: {path} failed: {req.responseCode} {req.downloadHandler.text}");
            }
        }
    }
}
