using UnityEngine;
using UnityEngine.AI;

namespace DustYard
{
    /// <summary>
    /// A raider grunt: walks the NavMesh towards you, and once it can see you it stops at a good range,
    /// strafes and fires bursts. Accuracy drops with distance and when you're moving.
    /// </summary>
    [RequireComponent(typeof(NavMeshAgent), typeof(Health))]
    public class RaiderAI : MonoBehaviour
    {
        public Transform muzzle;
        public float engageRange = 26f, preferredRange = 12f;
        public float damage = 7f;
        public float accuracy = 0.45f;       // hit chance at point blank, standing still
        public float reactionTime = 0.6f;
        public float shotInterval = 0.13f;
        public Vector2Int burstSize = new Vector2Int(2, 5);
        public Vector2 burstPause = new Vector2(0.9f, 1.8f);

        public System.Action<RaiderAI> Killed;

        NavMeshAgent agent;
        Health health, targetHealth;
        Transform target; PlayerController targetMove;
        float reactT, shotT, pauseT, strafeT, repathT;
        int burstLeft, strafeDir;
        AudioSource audioSrc;
        LineRenderer tracer;
        float chaseSpeed;
        static Material tracerMat;

        void Awake()
        {
            agent = GetComponent<NavMeshAgent>();
            chaseSpeed = agent.speed;
            if (tracerMat == null) tracerMat = new Material(Shader.Find("Sprites/Default"));
            health = GetComponent<Health>();
            health.Died += OnDied;
            audioSrc = gameObject.AddComponent<AudioSource>();
            audioSrc.spatialBlend = 1f; audioSrc.maxDistance = 60f; audioSrc.rolloffMode = AudioRolloffMode.Linear;
            tracer = new GameObject("RaiderTracer").AddComponent<LineRenderer>();
            tracer.transform.SetParent(transform, false);
            tracer.sharedMaterial = tracerMat; tracer.widthMultiplier = 0.02f; tracer.positionCount = 2; tracer.enabled = false;
        }

        void Start()
        {
            var p = FindFirstObjectByType<PlayerController>();
            if (p) { target = p.transform; targetMove = p; targetHealth = p.GetComponent<Health>(); }
            reactT = reactionTime;
        }

        void Update()
        {
            if (health.Dead || target == null) return;
            float dt = Time.deltaTime;
            if (tracer.enabled) { var c = tracer.startColor; c.a -= dt * 6f; tracer.startColor = c; tracer.endColor = c; if (c.a <= 0f) tracer.enabled = false; }
            if (targetHealth && targetHealth.Dead) { agent.isStopped = true; return; }

            Vector3 eye = transform.position + Vector3.up * 1.95f;   // above its own head, so it can't block the view
            Vector3 aimAt = targetMove.cameraPivot.position - Vector3.up * 0.25f;
            float dist = Vector3.Distance(transform.position, target.position);
            bool sees = dist < engageRange && CanSee(eye, aimAt);
            agent.updateRotation = !sees;   // while engaging we turn to face the player ourselves

            if (!sees)
            {
                reactT = reactionTime;
                agent.isStopped = false; agent.speed = chaseSpeed;
                repathT -= dt;
                if (repathT <= 0f) { agent.SetDestination(target.position); repathT = 0.5f; }
                return;
            }

            // face the player
            Vector3 flat = target.position - transform.position; flat.y = 0f;
            if (flat.sqrMagnitude > 0.01f) transform.rotation = Quaternion.Slerp(transform.rotation, Quaternion.LookRotation(flat), 1f - Mathf.Exp(-10f * dt));

            // hold a good distance, strafing now and then
            strafeT -= dt;
            if (strafeT <= 0f) { strafeT = Random.Range(1f, 2.6f); strafeDir = Random.value < 0.5f ? 0 : (Random.value < 0.5f ? -1 : 1); }
            Vector3 dest = transform.position;
            if (dist > preferredRange + 6f) dest = target.position;
            else if (dist < preferredRange - 4f) dest = transform.position - flat.normalized * 3f;
            dest += transform.right * strafeDir * 2.5f;
            agent.isStopped = false; agent.speed = 2.4f;
            repathT -= dt;
            if (repathT <= 0f) { agent.SetDestination(dest); repathT = 0.35f; }

            // shoot in bursts after a short reaction time
            reactT -= dt;
            if (reactT > 0f) return;
            if (pauseT > 0f) { pauseT -= dt; return; }
            shotT -= dt;
            if (shotT > 0f) return;
            if (burstLeft <= 0) burstLeft = Random.Range(burstSize.x, burstSize.y + 1);
            Shoot(eye, aimAt, dist);
            shotT = shotInterval;
            if (--burstLeft <= 0) pauseT = Random.Range(burstPause.x, burstPause.y);
        }

        bool CanSee(Vector3 eye, Vector3 point)
        {
            Vector3 d = point - eye;
            if (Physics.Raycast(eye, d.normalized, out RaycastHit hit, d.magnitude, ~0, QueryTriggerInteraction.Ignore))
                return hit.collider.transform.IsChildOf(target) || hit.collider.transform == target;
            return true;
        }

        void Shoot(Vector3 eye, Vector3 aimAt, float dist)
        {
            float chance = accuracy * Mathf.Clamp01(1f - dist / 55f) * (targetMove.IsMoving ? 0.6f : 1f) * (targetMove.IsSprinting ? 0.7f : 1f);
            bool hits = Random.value < chance;
            Vector3 end = hits ? aimAt : aimAt + Random.insideUnitSphere * 1.4f;
            if (hits) targetHealth.Damage(damage, transform.position);
            audioSrc.pitch = Random.Range(0.85f, 1f); audioSrc.PlayOneShot(SynthAudio.Shot, 0.5f);
            tracer.enabled = true; tracer.SetPosition(0, muzzle ? muzzle.position : eye); tracer.SetPosition(1, end);
            tracer.startColor = tracer.endColor = new Color(1f, 0.6f, 0.3f, 0.8f);
        }

        void OnDied()
        {
            agent.isStopped = true; agent.enabled = false;
            foreach (var c in GetComponentsInChildren<Collider>()) c.enabled = false;
            // fall over, then clean up
            StartCoroutine(FallOver());
            Killed?.Invoke(this);
        }

        System.Collections.IEnumerator FallOver()
        {
            Quaternion from = transform.rotation, to = from * Quaternion.Euler(-85f, 0f, 0f);
            for (float t = 0f; t < 1f; t += Time.deltaTime * 2.5f) { transform.rotation = Quaternion.Slerp(from, to, t * t); yield return null; }
            yield return new WaitForSeconds(3f);
            Destroy(gameObject);
        }
    }
}
