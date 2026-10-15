using System.Collections.Generic;
using UnityEngine;
using UnityEngine.AI;

namespace DustYard
{
    /// <summary>Waves of raiders from the map's spawn points: more per wave, a few alive at a time, a breather between waves.</summary>
    public class WaveSpawner : MonoBehaviour
    {
        public GameObject raiderPrefab;
        public Transform[] spawnPoints;
        public float minSpawnDistance = 18f;
        public int maxAlive = 8;
        public float spawnInterval = 1.2f, breakBetweenWaves = 5f;

        public int Wave { get; private set; }
        public int Kills { get; private set; }
        public int LeftThisWave => toSpawn + alive.Count;
        public float BreakLeft => breakT;
        public event System.Action<int> WaveStarted;

        readonly List<RaiderAI> alive = new List<RaiderAI>();
        int toSpawn; float spawnT, breakT = 3f;
        Transform player;

        void Start() { var p = FindFirstObjectByType<PlayerController>(); if (p) player = p.transform; }

        void Update()
        {
            if (toSpawn == 0 && alive.Count == 0)
            {
                breakT -= Time.deltaTime;
                if (breakT <= 0f) { Wave++; toSpawn = 4 + Wave * 2; breakT = breakBetweenWaves; WaveStarted?.Invoke(Wave); }
                return;
            }
            spawnT -= Time.deltaTime;
            if (toSpawn > 0 && alive.Count < maxAlive && spawnT <= 0f && TrySpawn()) { toSpawn--; spawnT = spawnInterval; }
        }

        bool TrySpawn()
        {
            if (spawnPoints == null || spawnPoints.Length == 0) return false;
            for (int tries = 0; tries < 8; tries++)
            {
                var sp = spawnPoints[Random.Range(0, spawnPoints.Length)];
                if (player && Vector3.Distance(sp.position, player.position) < minSpawnDistance) continue;
                if (!NavMesh.SamplePosition(sp.position, out NavMeshHit hit, 2f, NavMesh.AllAreas)) continue;
                var go = Instantiate(raiderPrefab, hit.position, sp.rotation);
                var ai = go.GetComponent<RaiderAI>();
                // a little tougher each wave
                var h = go.GetComponent<Health>(); h.max *= 1f + (Wave - 1) * 0.08f; h.Heal(h.max);
                ai.accuracy = Mathf.Min(0.75f, ai.accuracy + Wave * 0.02f);
                ai.Killed += r => { alive.Remove(r); Kills++; };
                alive.Add(ai);
                return true;
            }
            return false;
        }
    }
}
