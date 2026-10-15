using UnityEngine;

namespace DustYard
{
    /// <summary>Makes simple sounds in code (gunshots, hits) so the prototype needs no audio files.</summary>
    public static class SynthAudio
    {
        static AudioClip shot, thud, tick;

        public static AudioClip Shot { get { if (shot == null) shot = Noise("shot", 0.32f, 18f, 0.9f); return shot; } }
        public static AudioClip Thud { get { if (thud == null) thud = Noise("thud", 0.18f, 30f, 0.5f); return thud; } }
        public static AudioClip Tick { get { if (tick == null) tick = Noise("tick", 0.05f, 80f, 0.35f); return tick; } }

        // decaying noise, low-passed a little for weight
        static AudioClip Noise(string name, float seconds, float decay, float volume)
        {
            const int rate = 44100;
            int n = Mathf.CeilToInt(seconds * rate);
            var data = new float[n];
            var rng = new System.Random(name.GetHashCode());
            float lp = 0f;
            for (int i = 0; i < n; i++)
            {
                float t = i / (float)rate;
                float white = (float)(rng.NextDouble() * 2.0 - 1.0);
                lp += (white - lp) * 0.35f;
                data[i] = lp * Mathf.Exp(-t * decay) * volume;
            }
            var clip = AudioClip.Create(name, n, 1, rate, false);
            clip.SetData(data, 0);
            return clip;
        }
    }
}
