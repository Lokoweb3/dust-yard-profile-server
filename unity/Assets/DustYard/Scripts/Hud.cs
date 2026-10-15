using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.SceneManagement;
using UnityEngine.UI;

namespace DustYard
{
    /// <summary>Health bar, ammo, wave and kills, crosshair that opens with spread, hit markers, damage flash, and a restart screen.</summary>
    public class Hud : MonoBehaviour
    {
        public Health playerHealth;
        public Weapon weapon;
        public WaveSpawner spawner;
        public Text healthText, ammoText, waveText, centerText;
        public Image healthFill, damageFlash, hitMarker;
        public RectTransform[] crosshair;   // up, down, left, right

        float hitT, dmgT, bannerT;
        AudioSource audioSrc;

        void Start()
        {
            audioSrc = gameObject.AddComponent<AudioSource>();
            weapon.Hit += (killed, head) => { hitT = 0.18f; hitMarker.color = killed ? new Color(1f, 0.3f, 0.25f) : head ? new Color(1f, 0.85f, 0.3f) : Color.white; audioSrc.PlayOneShot(SynthAudio.Tick, 0.6f); };
            playerHealth.Damaged += (a, from) => { dmgT = 0.35f; };
            playerHealth.Died += () => { PlayerController.LockCursor(false); weapon.enabled = false; playerHealth.GetComponent<PlayerController>().enabled = false; };
            spawner.WaveStarted += w => { bannerT = 2.5f; };
        }

        void Update()
        {
            float dt = Time.deltaTime;
            healthText.text = Mathf.CeilToInt(playerHealth.Current).ToString();
            healthFill.fillAmount = playerHealth.Current / playerHealth.max;
            ammoText.text = weapon.Reloading ? "Reloading..." : $"{weapon.Ammo} / {weapon.Reserve}";
            waveText.text = spawner.Wave == 0 ? "Get ready" : $"Wave {spawner.Wave}   ·   {spawner.LeftThisWave} raiders left   ·   {spawner.Kills} kills";

            float gap = 10f + weapon.SpreadNow * 9f;
            Vector2[] dirs = { Vector2.up, Vector2.down, Vector2.left, Vector2.right };
            for (int i = 0; i < crosshair.Length; i++) crosshair[i].anchoredPosition = dirs[i] * gap;

            hitT -= dt; var hc = hitMarker.color; hc.a = Mathf.Clamp01(hitT / 0.18f); hitMarker.color = hc;
            dmgT -= dt; damageFlash.color = new Color(0.6f, 0f, 0f, Mathf.Clamp01(dmgT) * 0.5f + (1f - playerHealth.Current / playerHealth.max) * 0.25f);

            bannerT -= dt;
            if (playerHealth.Dead)
            {
                centerText.text = $"You went down on wave {spawner.Wave} with {spawner.Kills} kills\n\nPress R or Start to deploy again";
                var kb = Keyboard.current; var pad = Gamepad.current;
                if ((kb != null && kb.rKey.wasPressedThisFrame) || (pad != null && pad.startButton.wasPressedThisFrame))
                    SceneManager.LoadScene(SceneManager.GetActiveScene().name);
            }
            else centerText.text = bannerT > 0f ? $"WAVE {spawner.Wave}" : "";
        }
    }
}
