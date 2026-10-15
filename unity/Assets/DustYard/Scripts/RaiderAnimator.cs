using UnityEngine;
using UnityEngine.AI;

namespace DustYard
{
    /// <summary>
    /// Procedural walk for the raider: hip-pivoted leg swing, body bob and roll,
    /// head counter-nod, all driven by NavMeshAgent velocity. No rig, no clips.
    /// </summary>
    public class RaiderAnimator : MonoBehaviour
    {
        public Transform body, head, gun, legL, legR;
        public float phasePerMeter = 7f;    // stride cadence (2*pi / stride length)
        public float legSwing = 34f;        // degrees at full walk
        public float bobAmount = 0.035f;
        public float rollAmount = 2.5f;

        NavMeshAgent agent;
        float phase, smoothedSpeed;
        Vector3 bodyRest, headRest, gunRest;

        void Awake()
        {
            agent = GetComponent<NavMeshAgent>();
            if (body) bodyRest = body.localPosition;
            if (head) headRest = head.localPosition;
            if (gun) gunRest = gun.localPosition;
        }

        void Update()
        {
            float dt = Time.deltaTime;
            float speed = agent ? agent.velocity.magnitude : 0f;
            smoothedSpeed = Mathf.Lerp(smoothedSpeed, speed, 1f - Mathf.Exp(-8f * dt));
            float w = Mathf.Clamp01(smoothedSpeed / 2f);
            phase += smoothedSpeed * phasePerMeter * dt;
            float s = Mathf.Sin(phase);

            if (legL) legL.localRotation = Quaternion.Euler(s * legSwing * w, 0f, 0f);
            if (legR) legR.localRotation = Quaternion.Euler(-s * legSwing * w, 0f, 0f);

            float bob = Mathf.Abs(Mathf.Cos(phase)) * bobAmount * w;
            float roll = s * rollAmount * w;
            if (body) { body.localPosition = bodyRest + Vector3.up * bob; body.localRotation = Quaternion.Euler(0f, 0f, roll); }
            if (head) { head.localPosition = headRest + Vector3.up * bob * 0.8f; head.localRotation = Quaternion.Euler(s * 2f * w, 0f, roll * 0.6f); }
            if (gun) { gun.localPosition = gunRest + Vector3.up * bob; gun.localRotation = Quaternion.Euler(0f, 0f, roll); }
        }
    }
}
