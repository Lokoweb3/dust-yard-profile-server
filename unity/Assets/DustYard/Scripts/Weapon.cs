using System;
using UnityEngine;
using UnityEngine.InputSystem;

namespace DustYard
{
    /// <summary>
    /// Hitscan rifle (the KR-7 Carbine from the browser game): 30-round mag, reload, spread that grows
    /// while firing or moving, recoil, tracers, muzzle flash, headshots. Procedural feel layer:
    /// aim-down-sights, look sway, walk bob, sprint pose, gun kick, mag reload motion, flash sprite,
    /// shell ejection, and per-surface impact particles.
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

        [Header("Feel")]
        public float adsFov = 52f;
        public float adsSpreadMul = 0.35f;
        public float swayAmount = 0.35f;        // degrees of gun lag per degree of look speed
        public float bobAmount = 0.012f;

        public int Ammo { get; private set; }
        public int Reserve => reserve;
        public void Resupply(int rounds) { reserve = Mathf.Min(reserve + rounds, 270); }
        public bool Reloading => reloadT > 0f;
        public float SpreadNow => spread;
        public float AdsAmount => ads;
        public event Action<bool, bool> Hit;   // (killed, headshot)

        float cooldown, reloadT, spread, ads, flashT, bobT, kickPitch, prevYaw, prevPitch, sprintCur, baseFov;
        Vector2 swayCur;
        Vector3 kickPos, bobCur, gunRest, adsPos, magRest;
        Quaternion gunRestRot, magRestRot;
        bool wasUnlocked;
        AudioSource audioSrc;
        Camera cam;
        Light flash;
        GameObject flashQuad;
        Transform mag;
        Material shellMat;
        ParticleSystem dustPS, sparkPS;
        LineRenderer[] tracers; int nextTracer;
        const int ShellLayer = 2;   // Ignore Raycast: shells must not eat bullets
        const int HitMask = ~(1 << ShellLayer);

        void Awake()
        {
            Ammo = magazine;
            cam = GetComponent<Camera>();
            baseFov = cam ? cam.fieldOfView : 60f;
            audioSrc = gameObject.AddComponent<AudioSource>();
            audioSrc.playOnAwake = false; audioSrc.spatialBlend = 0f;
            var fl = new GameObject("MuzzleFlash"); fl.transform.SetParent(muzzle, false);
            flash = fl.AddComponent<Light>(); flash.type = LightType.Point; flash.range = 6f; flash.intensity = 0f; flash.color = new Color(1f, 0.72f, 0.38f);
            tracers = new LineRenderer[6];
            var mat = new Material(Shader.Find("Sprites/Default"));
            for (int i = 0; i < tracers.Length; i++)
            {
                var t = new GameObject("Tracer").AddComponent<LineRenderer>();
                t.material = mat; t.widthMultiplier = 0.03f; t.positionCount = 2; t.enabled = false;
                t.startColor = new Color(1f, 0.85f, 0.5f, 0.9f); t.endColor = new Color(1f, 0.85f, 0.5f, 0f);
                tracers[i] = t;
            }
            if (gunModel)
            {
                gunRest = gunModel.localPosition; gunRestRot = gunModel.localRotation;
                mag = gunModel.Find("Mag");
                if (mag) { magRest = mag.localPosition; magRestRot = mag.localRotation; }
                // ADS pose: shift the gun so the sight lands just under screen center
                var sight = gunModel.Find("Sight");
                adsPos = gunRest + new Vector3(-gunRest.x, 0.06f, 0.05f);
                if (sight)
                {
                    Vector3 sightInCam = transform.InverseTransformPoint(sight.position);
                    adsPos = gunRest - new Vector3(sightInCam.x, sightInCam.y + 0.004f, -0.04f);   // dot sits on the point of impact
                }
            }
            BuildEffects();
        }

        void BuildEffects()
        {
            // muzzle flash sprite: procedural 6-spoke star, alpha-blended, lives ~2 frames
            int S = 64; var tx = new Texture2D(S, S, TextureFormat.RGBA32, false);
            for (int y = 0; y < S; y++) for (int x = 0; x < S; x++)
            {
                float dx = (x - S / 2f) / (S / 2f), dy = (y - S / 2f) / (S / 2f);
                float r = Mathf.Sqrt(dx * dx + dy * dy);
                float spokes = 0.55f + 0.45f * Mathf.Abs(Mathf.Sin(3f * Mathf.Atan2(dy, dx)));
                float a = Mathf.Clamp01(1f - r / Mathf.Max(0.15f, spokes));
                tx.SetPixel(x, y, new Color(1f, 0.9f, 0.6f, a * a));
            }
            tx.Apply();
            flashQuad = GameObject.CreatePrimitive(PrimitiveType.Quad);
            Destroy(flashQuad.GetComponent<Collider>());
            flashQuad.name = "FlashSprite";
            flashQuad.transform.SetParent(muzzle, false);
            flashQuad.transform.localPosition = new Vector3(0f, 0f, 0.04f);
            var fr = flashQuad.GetComponent<Renderer>();
            fr.material = new Material(Shader.Find("Sprites/Default")) { mainTexture = tx };
            fr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            flashQuad.SetActive(false);

            shellMat = new Material(Shader.Find("Universal Render Pipeline/Lit"));
            shellMat.SetColor("_BaseColor", new Color(0.78f, 0.62f, 0.26f));
            shellMat.SetFloat("_Metallic", 0.8f); shellMat.SetFloat("_Smoothness", 0.6f);

            dustPS = MakeImpactPS("DustPS", new Color(0.62f, 0.52f, 0.38f, 0.75f), 0.14f, 1.8f, 0.5f, 0.15f, false);
            sparkPS = MakeImpactPS("SparkPS", new Color(1f, 0.8f, 0.35f, 1f), 0.025f, 7f, 0.22f, 1.2f, true);
        }

        static ParticleSystem MakeImpactPS(string name, Color color, float size, float speed, float life, float gravity, bool stretch)
        {
            var go = new GameObject(name);
            var ps = go.AddComponent<ParticleSystem>();
            ps.Stop();
            var main = ps.main;
            main.startColor = color; main.startSize = size; main.startSpeed = speed;
            main.startLifetime = life; main.gravityModifier = gravity; main.playOnAwake = false;
            main.maxParticles = 200;
            var em = ps.emission; em.enabled = false;
            var shape = ps.shape; shape.shapeType = ParticleSystemShapeType.Cone; shape.angle = 30f; shape.radius = 0.01f;
            var col = ps.colorOverLifetime; col.enabled = true;
            col.color = new ParticleSystem.MinMaxGradient(color, new Color(color.r, color.g, color.b, 0f));
            var r = go.GetComponent<ParticleSystemRenderer>();
            r.material = new Material(Shader.Find("Sprites/Default"));
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            if (stretch) { r.renderMode = ParticleSystemRenderMode.Stretch; r.lengthScale = 5f; }
            return ps;
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
            bool adsHeld = (locked && mouse != null && mouse.rightButton.isPressed) || (pad != null && pad.leftTrigger.ReadValue() >= triggerThreshold);
            bool reloadPressed = (kb != null && kb.rKey.wasPressedThisFrame) || (pad != null && pad.buttonWest.wasPressedThisFrame);

            cooldown -= dt;
            flash.intensity = Mathf.MoveTowards(flash.intensity, 0f, dt * 60f);
            flashT -= dt;
            if (flashQuad.activeSelf && flashT <= 0f) flashQuad.SetActive(false);
            foreach (var t in tracers)
                if (t.enabled) { var c = t.startColor; c.a -= dt * 8f; t.startColor = c; if (c.a <= 0f) t.enabled = false; }

            ads = Mathf.MoveTowards(ads, adsHeld && reloadT <= 0f ? 1f : 0f, dt * 7f);
            if (cam) cam.fieldOfView = Mathf.Lerp(baseFov, adsFov, ads);
            float rest = (baseSpread + (player.IsMoving ? moveSpread : 0f) + (player.IsGrounded ? 0f : 2f)) * Mathf.Lerp(1f, adsSpreadMul, ads);
            spread = Mathf.MoveTowards(spread, rest, dt * 6f);

            if (reloadT > 0f)
            {
                reloadT -= dt;
                if (reloadT <= 0f) { int take = Mathf.Min(magazine - Ammo, reserve); Ammo += take; reserve -= take; }
            }
            else if ((reloadPressed && Ammo < magazine && reserve > 0) || (Ammo == 0 && reserve > 0 && trigger)) reloadT = reloadTime;
            else if (trigger && cooldown <= 0f && Ammo > 0) Fire();

            ApplyPose(dt, trigger);
        }

        // composes ADS, sway, bob, sprint pose, gun kick, and the reload dip into the gun transform
        void ApplyPose(float dt, bool trigger)
        {
            if (!gunModel) return;
            float yawNow = player.transform.eulerAngles.y, pitchNow = player.Pitch;
            Vector2 lookDelta = new Vector2(Mathf.DeltaAngle(prevYaw, yawNow), pitchNow - prevPitch);
            prevYaw = yawNow; prevPitch = pitchNow;
            Vector2 swayTarget = Vector2.ClampMagnitude(lookDelta * -swayAmount, 4f) * (1f - ads * 0.85f);
            swayCur = Vector2.Lerp(swayCur, swayTarget, 1f - Mathf.Exp(-10f * dt));

            bool bobbing = player.IsMoving && player.IsGrounded;
            if (bobbing) bobT += dt * (player.IsSprinting ? 11f : 7.5f);
            Vector3 bobTarget = bobbing
                ? new Vector3(Mathf.Sin(bobT), -Mathf.Abs(Mathf.Cos(bobT)) * 0.8f, 0f) * (bobAmount * (1f - ads * 0.85f) * (player.IsSprinting ? 1.7f : 1f))
                : Vector3.zero;
            bobCur = Vector3.Lerp(bobCur, bobTarget, 1f - Mathf.Exp(-12f * dt));

            float sprintTarget = player.IsSprinting && !trigger && ads < 0.1f && reloadT <= 0f ? 1f : 0f;
            sprintCur = Mathf.MoveTowards(sprintCur, sprintTarget, dt * 5f);

            kickPos = Vector3.Lerp(kickPos, Vector3.zero, 1f - Mathf.Exp(-9f * dt));
            kickPitch = Mathf.Lerp(kickPitch, 0f, 1f - Mathf.Exp(-11f * dt));

            float p = reloadT > 0f ? Mathf.Clamp01(1f - reloadT / reloadTime) : 0f;
            float dip = Mathf.Sin(p * Mathf.PI) * 0.12f;
            if (mag)
            {
                // mag drops out over the first phase, is gone mid-reload, slots back in at the end
                float magOut = p <= 0f ? 0f
                    : p < 0.45f ? Mathf.SmoothStep(0f, 1f, p / 0.45f)
                    : p < 0.55f ? 1f
                    : 1f - Mathf.SmoothStep(0f, 1f, (p - 0.55f) / 0.45f);
                mag.localPosition = magRest + new Vector3(0f, -0.22f, -0.03f) * magOut;
                mag.localRotation = magRestRot * Quaternion.Euler(-25f * magOut, 0f, 8f * magOut);
            }

            gunModel.localPosition = Vector3.Lerp(gunRest, adsPos, ads)
                + bobCur + kickPos
                + new Vector3(0f, -dip, 0f)
                + new Vector3(-0.04f, -0.04f, -0.06f) * sprintCur;
            gunModel.localRotation = gunRestRot
                * Quaternion.Euler(swayCur.y * 1.2f, swayCur.x, swayCur.x * 0.6f)
                * Quaternion.Euler(-kickPitch, 0f, 0f)
                * Quaternion.Euler(12f * sprintCur, -24f * sprintCur, 10f * sprintCur);
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
            flashT = 0.045f;
            flashQuad.SetActive(true);
            flashQuad.transform.localRotation = Quaternion.Euler(0f, 0f, UnityEngine.Random.Range(0f, 360f));
            flashQuad.transform.localScale = Vector3.one * UnityEngine.Random.Range(0.16f, 0.28f) * Mathf.Lerp(1f, 0.7f, ads);
            EjectShell();
            audioSrc.pitch = UnityEngine.Random.Range(0.92f, 1.06f); audioSrc.PlayOneShot(SynthAudio.Shot, 0.8f);
            spread = Mathf.Min(maxSpread, spread + spreadPerShot);
            player.AddRecoil(recoilKick);
            kickPos += new Vector3(UnityEngine.Random.Range(-0.005f, 0.005f), 0.012f, -0.07f);
            kickPitch += UnityEngine.Random.Range(1.3f, 2.3f);
        }

        void EjectShell()
        {
            var s = GameObject.CreatePrimitive(PrimitiveType.Cube);
            s.name = "Shell"; s.layer = ShellLayer;
            s.transform.localScale = new Vector3(0.016f, 0.016f, 0.05f);
            s.transform.position = muzzle.position - muzzle.forward * 0.45f + muzzle.up * 0.03f;
            s.transform.rotation = muzzle.rotation;
            s.GetComponent<Renderer>().material = shellMat;
            var rb = s.AddComponent<Rigidbody>();
            rb.mass = 0.01f;
            rb.linearVelocity = transform.right * UnityEngine.Random.Range(1.6f, 2.6f)
                + transform.up * UnityEngine.Random.Range(1.2f, 2f)
                + transform.forward * UnityEngine.Random.Range(-0.3f, 0.3f);
            rb.angularVelocity = UnityEngine.Random.insideUnitSphere * 40f;
            Destroy(s, 3f);
        }

        // the first hit that isn't the player's own body
        bool RaycastSkippingSelf(Vector3 from, Vector3 dir, out RaycastHit best)
        {
            best = default(RaycastHit); float bestD = float.MaxValue; bool found = false;
            foreach (var h in Physics.RaycastAll(from, dir, range, HitMask, QueryTriggerInteraction.Ignore))
            {
                if (h.collider.transform.IsChildOf(player.transform)) continue;
                if (h.distance < bestD) { bestD = h.distance; best = h; found = true; }
            }
            return found;
        }

        void SpawnImpact(RaycastHit hit)
        {
            bool metal = hit.collider.name.Contains("Container");
            var ps = metal ? sparkPS : dustPS;
            ps.transform.SetPositionAndRotation(hit.point + hit.normal * 0.02f, Quaternion.LookRotation(hit.normal));
            ps.Emit(metal ? 12 : 8);

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
