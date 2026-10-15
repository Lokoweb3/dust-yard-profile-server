using System;
using UnityEngine;

namespace DustYard
{
    /// <summary>Hit points for the player and raiders. The player regenerates after a short pause, like the browser game.</summary>
    public class Health : MonoBehaviour
    {
        public float max = 100f;
        public bool regenerates;
        public float regenDelay = 4f, regenPerSecond = 22f;

        public float Current { get; private set; }
        public bool Dead { get; private set; }
        public event Action<float, Vector3> Damaged;   // amount, where the damage came from
        public event Action Died;

        float sinceHit;

        void Awake() { Current = max; }

        public void Damage(float amount, Vector3 from)
        {
            if (Dead || amount <= 0f) return;
            Current = Mathf.Max(0f, Current - amount);
            sinceHit = 0f;
            Damaged?.Invoke(amount, from);
            if (Current <= 0f) { Dead = true; Died?.Invoke(); }
        }

        public void Heal(float amount)
        {
            if (!Dead) Current = Mathf.Min(max, Current + amount);
        }

        void Update()
        {
            if (!regenerates || Dead) return;
            sinceHit += Time.deltaTime;
            if (sinceHit > regenDelay && Current < max) Heal(regenPerSecond * Time.deltaTime);
        }
    }
}
