using UnityEngine;

namespace DustYard
{
    /// <summary>Put on a collider that belongs to a raider. Head hitboxes take extra damage.</summary>
    public class Hitbox : MonoBehaviour
    {
        public Health owner;
        public float multiplier = 1f;   // 2.5 on heads
        public bool IsHead => multiplier > 1.5f;
    }
}
