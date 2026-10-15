using System;
using UnityEngine;
using UnityEngine.InputSystem;

namespace DustYard
{
    /// <summary>
    /// Hitscan rifle (the KR-7 Carbine from the browser game): 30-round mag, reload, spread that grows
    /// while firing or moving, recoil, tracers, muzzle flash, headshots.
    /// </summary>
    public class Weapon : MonoBehaviour
    {
        [Header("References")]
        public PlayerController player;
        public Transform muzzle;          // tip of the gun model
        public Transform gunModel;        // moved for recoil / reload animation

        [Header("Stats")]
        public float damage = 34f;
        public float roundsPerMinute = 600f;
        public int magazine = 30;
        public int reserve = 90;
        public float reloadTime = 2.0f;
        public float range = 200f;
        public float baseSpread = 0.4f, moveSpread = 1.6f, spreadPerShot = 0.35f, maxSpread = 4f;   // degrees
        public float recoilKick = 0.9f;
        public float triggerThreshold = 0.5f;   // gamepad trigger pull needed to fire (drift guard)

        public int Ammo { get; private set; }
        public int Reserve => reserve;
        public bool Reloading => reloadT > 0f;
        public float SpreadNow => spread;
        public event Action<bool, bool> Hit;   // (killed, headshot)

        float cooldown, reloadT, spread;
        bool wasUnlocked;
        AudioSource audioSrc;
        Light flash;
        LineRenderer[] tracers; int nextTracer;
        Vector3 gunRest;

        void Awake()
        {
            Ammo = magazine;
            audioSrc = gameObject.AddComponent<AudioSource>();
            audioSrc.playOnAwake = false; audioSrc.spatialBlend = 0f;
            var fl = new GameObject("MuzzleFlash"); fl.transform.SetParent(muzzle, false);
            flash = fl.AddComponent<Light>(); flash.type = LightType.Point; flash.range = 6f; flash.intensity = 0f; flash.color = new Color(1f, 0.72f, 0.38f);
            tracers = new LineRenderer[6];
            var mat = new Material(Shader.Find("Sprites/Default"));
            for (int i = 0; i < tracers.Length; i++)
            {
                var t = new GameObject("Tracer").AddComponent<LineRenderer>();
                t.material = mat; t.widthMultiplier = 0.025f; t.positionCount = 2; t.enabled = false;
                t.startColor = new Color(1f, 0.85f, 0.5f, 0.9f); t.endColor = new Color(1f, 0.85f, 0.5f, 0f);
                tracers[i] = t;
            }
            if (gunModel) gunRest = gunModel.localPosition;
        }

        void Update()
        {
            float dt = Time.deltaTime;
            var mouse = Mouse.current; var kb = Keyboard.current; var pad = Gamepad.current;
            bool locked = Cursor.lockState == CursorLockMode.Locked;
            if (!locked) wasUnlocked = true;
            if (locked && wasUnlocked && mouse != null && mouse.leftButton.isPressed) return;   // the click that grabbed the mouse doesn't fire
            wasUnlocked = false;
            bool trigger = (locked && mouse != null && mouse.leftButton.isPressed) || (pad != null && pad.rightTrigger.ReadValue() >= triggerThreshold);
            bool reloadPressed = (kb != null && kb.rKey.wasPressedThisFrame) || (pad != null && pad.buttonWest.wasPressedThisFrame);

            cooldown -= dt;
            flash.intensity = Mathf.MoveTowards(flash.intensity, 0f, dt * 60f);
            foreach (var t in tracers)
                if (t.enabled) { var c = t.startColor; c.a -= dt * 8f; t.startColor = c; if (c.a <= 0f) t.enabled = false; }
            float rest = baseSpread + (player.IsMoving ? moveSpread : 0f) + (player.IsGrounded ? 0f : 2f);
            spread = Mathf.MoveTowards(spread, rest, dt * 6f);

            if (reloadT > 0f)
            {
                reloadT -= dt;
                if (gunModel) gunModel.localPosition = gunRest + new Vector3(0f, -0.12f * Mathf.Sin(Mathf.Clamp01(1f - reloadT / reloadTime) * Mathf.PI), 0f);
                if (reloadT <= 0f) { int take = Mathf.Min(magazine - Ammo, reserve); Ammo += take; reserve -= take; }
                return;
            }
            if ((reloadPressed && Ammo < magazine && reserve > 0) || (Ammo == 0 && reserve > 0 && trigger)) { reloadT = reloadTime; return; }

            if (trigger && cooldown <= 0f && Ammo > 0) Fire();

            if (gunModel) gunModel.localPosition = Vector3.Lerp(gunModel.localPosition, gunRest, 1f - Mathf.Exp(-14f * dt));
        }

        void Fire()
        {
            cooldown = 60f / roundsPerMinute;
            Ammo--;
            Transform cam = player.cameraPivot;
            // random direction inside the current spread cone
            Vector2 r = UnityEngine.Random.insideUnitCircle * Mathf.Tan(spread * Mathf.Deg2Rad);
            Vector3 dir = (cam.forward + cam.right * r.x + cam.up * r.y).normalized;
            Vector3 end = cam.position + dir * range;

            if (RaycastSkippingSelf(cam.position, dir, out RaycastHit hit))
            {
                end = hit.point;
                var hb = hit.collider.GetComponent<Hitbox>();
                Health target = hb ? hb.owner : hit.collider.GetComponentInParent<Health>();
                if (target && target.gameObject != player.gameObject && !target.Dead)
                {
                    target.Damage(damage * (hb ? hb.multiplier : 1f), cam.position);
                    Hit?.Invoke(target.Dead, hb && hb.IsHead);
                }
                else SpawnImpact(hit);
            }

            var tr = tracers[nextTracer++ % tracers.Length];
            tr.enabled = true; tr.SetPosition(0, muzzle.position); tr.SetPosition(1, end);
            tr.startColor = new Color(1f, 0.85f, 0.5f, 0.9f);
            flash.intensity = 3f;
            audioSrc.pitch = UnityEngine.Random.Range(0.92f, 1.06f); audioSrc.PlayOneShot(SynthAudio.Shot, 0.8f);
            spread = Mathf.Min(maxSpread, spread + spreadPerShot);
            player.AddRecoil(recoilKick);
            if (gunModel) gunModel.localPosition += new Vector3(0f, 0.01f, -0.06f);
        }

        // the first hit that isn't the player's own body
        bool RaycastSkippingSelf(Vector3 from, Vector3 dir, out RaycastHit best)
        {
            best = default(RaycastHit); float bestD = float.MaxValue; bool found = false;
            foreach (var h in Physics.RaycastAll(from, dir, range, ~0, QueryTriggerInteraction.Ignore))
            {
                if (h.collider.transform.IsChildOf(player.transform)) continue;
                if (h.distance < bestD) { bestD = h.distance; best = h; found = true; }
            }
            return found;
        }

        static void SpawnImpact(RaycastHit hit)
        {
            var p = GameObject.CreatePrimitive(PrimitiveType.Quad);
            Destroy(p.GetComponent<Collider>());
            p.transform.position = hit.point + hit.normal * 0.01f;
            p.transform.rotation = Quaternion.LookRotation(-hit.normal);
            p.transform.localScale = Vector3.one * 0.12f;
            var r = p.GetComponent<Renderer>();
            r.material.color = new Color(0.12f, 0.1f, 0.08f);
            Destroy(p, 8f);
        }
    }
}
