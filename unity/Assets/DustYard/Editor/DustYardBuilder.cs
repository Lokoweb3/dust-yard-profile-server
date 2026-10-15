using System.Collections.Generic;
using Unity.AI.Navigation;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.AI;
using UnityEngine.UI;

namespace DustYard.EditorTools
{
    /// <summary>
    /// Menu: Dust Yard > Build ... Reads a map layout exported from the browser game (Assets/DustYard/Data/*.json)
    /// and builds a playable greybox scene: every wall, container, crate and floor as a block with collision,
    /// a baked NavMesh, the spawn points, the player with a rifle, a raider prefab, waves and a HUD.
    /// Re-run it any time; it overwrites the scene.
    /// </summary>
    public static class DustYardBuilder
    {
        const string Root = "Assets/DustYard";

        [MenuItem("Dust Yard/Build Dust Yard (greybox)")] static void BuildYard() => Build("yard");
        [MenuItem("Dust Yard/Build Neon District (greybox)")] static void BuildNeon() => Build("neon");
        [MenuItem("Dust Yard/Build Jungle Ruins (greybox)")] static void BuildJungle() => Build("jungle");

        [System.Serializable] class Box { public float minX, maxX, minZ, maxZ, top, bot, under = -1; }
        [System.Serializable] class P2 { public float x, z; }
        [System.Serializable] class P3 { public float x, y, z; }
        [System.Serializable]
        class MapData
        {
            public string id, name, sky, sun, ambient, ground;
            public float fogNear, fogFar, sunPitch, sunYaw, arena = 45;
            public Box[] boxes, platforms; public P2[] spawns; public P3[] perches;
        }

        static readonly Dictionary<string, Material> mats = new Dictionary<string, Material>();

        public static void Build(string map)
        {
            var json = AssetDatabase.LoadAssetAtPath<TextAsset>($"{Root}/Data/{map}.json");
            if (json == null) { Debug.LogError($"Missing {Root}/Data/{map}.json"); return; }
            var d = JsonUtility.FromJson<MapData>(json.text);
            if (!EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;
            mats.Clear();
            foreach (var dir in new[] { "Scenes", "Materials", "Prefabs" })
                if (!AssetDatabase.IsValidFolder($"{Root}/{dir}")) AssetDatabase.CreateFolder(Root, dir);

            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            // ---- light, fog, sky colour
            var sunGo = new GameObject("Sun");
            var sun = sunGo.AddComponent<Light>(); sun.type = LightType.Directional; sun.shadows = LightShadows.Soft;
            sun.color = Hex(d.sun); sun.intensity = map == "neon" ? 0.4f : 1.2f;
            sunGo.transform.rotation = Quaternion.Euler(d.sunPitch, d.sunYaw, 0f);
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Flat;
            RenderSettings.ambientLight = Hex(d.ambient);
            RenderSettings.fog = true; RenderSettings.fogMode = FogMode.Linear;
            RenderSettings.fogColor = Hex(d.sky); RenderSettings.fogStartDistance = d.fogNear; RenderSettings.fogEndDistance = d.fogFar;

            // ---- the map: ground, perimeter walls, every block and floor from the layout
            var mapRoot = new GameObject("Map");
            var ground = GameObject.CreatePrimitive(PrimitiveType.Plane);
            ground.name = "Ground"; ground.transform.SetParent(mapRoot.transform);
            ground.transform.localScale = new Vector3(d.arena * 2f / 10f + 2f, 1f, d.arena * 2f / 10f + 2f);
            ground.GetComponent<Renderer>().sharedMaterial = Mat("Ground_" + map, Hex(d.ground));
            float A = d.arena;
            Block(mapRoot.transform, "PerimeterN", -A - 1, A + 1, A, A + 1, 0, 5, Mat("Perimeter", new Color(0.55f, 0.5f, 0.45f)));
            Block(mapRoot.transform, "PerimeterS", -A - 1, A + 1, -A - 1, -A, 0, 5, Mat("Perimeter", Color.gray));
            Block(mapRoot.transform, "PerimeterE", A, A + 1, -A - 1, A + 1, 0, 5, Mat("Perimeter", Color.gray));
            Block(mapRoot.transform, "PerimeterW", -A - 1, -A, -A - 1, A + 1, 0, 5, Mat("Perimeter", Color.gray));

            var blocks = new GameObject("Blocks").transform; blocks.SetParent(mapRoot.transform);
            int i = 0;
            foreach (var b in d.boxes)
            {
                float h = b.top - b.bot;
                if (h < 0.05f) continue;
                Block(blocks, $"Block{i++}", b.minX, b.maxX, b.minZ, b.maxZ, b.bot, b.top, MatFor(b, map));
            }
            var floors = new GameObject("Floors").transform; floors.SetParent(mapRoot.transform);
            foreach (var p in d.platforms)
            {
                float under = p.under >= 0 ? p.under : p.top - 0.2f;
                Block(floors, "Floor", p.minX, p.maxX, p.minZ, p.maxZ, under, p.top, Mat("Floor", new Color(0.45f, 0.45f, 0.47f)));
            }
            foreach (Transform t in mapRoot.GetComponentsInChildren<Transform>())
                GameObjectUtility.SetStaticEditorFlags(t.gameObject, StaticEditorFlags.BatchingStatic | StaticEditorFlags.OccluderStatic | StaticEditorFlags.OccludeeStatic | StaticEditorFlags.ContributeGI);

            // ---- NavMesh for the raiders
            var surface = mapRoot.AddComponent<NavMeshSurface>();
            surface.collectObjects = CollectObjects.Children;
            surface.useGeometry = NavMeshCollectGeometry.PhysicsColliders;
            surface.BuildNavMesh();
            string navPath = $"{Root}/Scenes/{d.name.Replace(" ", "")}_NavMesh.asset";   // saved as an asset so it survives reloads and builds
            AssetDatabase.DeleteAsset(navPath);
            AssetDatabase.CreateAsset(surface.navMeshData, navPath);

            // ---- spawn points
            var spawnRoot = new GameObject("Spawns").transform;
            var spawns = new List<Transform>();
            foreach (var s in d.spawns)
            {
                var sp = new GameObject("Spawn").transform; sp.SetParent(spawnRoot);
                sp.position = new Vector3(s.x, 0f, s.z); sp.rotation = Quaternion.LookRotation(new Vector3(-s.x, 0f, -s.z) + Vector3.forward * 0.001f);
                spawns.Add(sp);
            }

            // ---- player, raider prefab, waves, HUD
            var player = BuildPlayer(out var weapon);
            player.transform.position = SafeStart(d);
            var raider = BuildRaiderPrefab();
            var spawnerGo = new GameObject("Waves");
            var spawner = spawnerGo.AddComponent<WaveSpawner>();
            spawner.raiderPrefab = raider; spawner.spawnPoints = spawns.ToArray();
            BuildHud(player.GetComponent<Health>(), weapon, spawner);

            string path = $"{Root}/Scenes/{d.name.Replace(" ", "")}.unity";
            EditorSceneManager.SaveScene(scene, path);
            AddToBuildSettings(path);
            AssetDatabase.SaveAssets();
            Debug.Log($"Built {d.name}: {d.boxes.Length} blocks, {d.platforms.Length} floors, {spawns.Count} spawn points. Press Play.");
        }

        // ---------------------------------------------------------------- pieces

        static GameObject Block(Transform parent, string name, float x0, float x1, float z0, float z1, float y0, float y1, Material m)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            go.name = name; go.transform.SetParent(parent);
            go.transform.position = new Vector3((x0 + x1) / 2f, (y0 + y1) / 2f, (z0 + z1) / 2f);
            go.transform.localScale = new Vector3(Mathf.Max(0.05f, x1 - x0), Mathf.Max(0.05f, y1 - y0), Mathf.Max(0.05f, z1 - z0));
            go.GetComponent<Renderer>().sharedMaterial = m;
            return go;
        }

        // colour blocks by what they probably are, so the greybox reads like the real map
        static Material MatFor(Box b, string map)
        {
            float h = b.top - b.bot, w = Mathf.Min(b.maxX - b.minX, b.maxZ - b.minZ), l = Mathf.Max(b.maxX - b.minX, b.maxZ - b.minZ);
            if (b.bot > 0.5f) return Mat("Overhead", new Color(0.42f, 0.44f, 0.46f));
            if (h < 1.0f) return Mat("LowCover", new Color(0.62f, 0.55f, 0.42f));
            if (map == "yard" && (Mathf.Abs(h - 2.6f) < 0.05f || Mathf.Abs(h - 5.2f) < 0.05f))
            {
                Color[] c = { new Color(0.18f, 0.43f, 0.45f), new Color(0.54f, 0.29f, 0.18f), new Color(0.72f, 0.54f, 0.17f), new Color(0.3f, 0.33f, 0.4f) };
                int k = Mathf.Abs(Mathf.RoundToInt(b.minX * 7 + b.minZ * 3)) % c.Length;
                return Mat("Container" + k, c[k]);
            }
            if (map == "neon" && h > 6f) return Mat("Building", new Color(0.16f, 0.15f, 0.22f));
            if (map == "jungle") return Mat(h > 3f ? "Stone" : "StoneLow", h > 3f ? new Color(0.55f, 0.55f, 0.47f) : new Color(0.48f, 0.5f, 0.42f));
            if (w < 0.6f && l > 2f) return Mat("Wall", new Color(0.66f, 0.64f, 0.6f));
            return Mat("Cover", new Color(0.55f, 0.42f, 0.28f));
        }

        static Material Mat(string name, Color c)
        {
            if (mats.TryGetValue(name, out var m)) return m;
            string path = $"{Root}/Materials/{name}.mat";
            m = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (m == null)
            {
                var shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
                m = new Material(shader) { color = c };
                if (m.HasProperty("_Smoothness")) m.SetFloat("_Smoothness", 0.15f);
                AssetDatabase.CreateAsset(m, path);
            }
            mats[name] = m; return m;
        }

        static GameObject BuildPlayer(out Weapon weapon)
        {
            var player = new GameObject("Player");
            player.transform.position = new Vector3(0f, 0.1f, 0f);
            var cc = player.AddComponent<CharacterController>();
            var hp = player.AddComponent<Health>(); hp.regenerates = true;
            var pc = player.AddComponent<PlayerController>();

            var pivot = new GameObject("CameraPivot").transform; pivot.SetParent(player.transform, false); pivot.localPosition = new Vector3(0f, 1.62f, 0f);
            var camGo = new GameObject("Main Camera"); camGo.tag = "MainCamera"; camGo.transform.SetParent(pivot, false);
            var cam = camGo.AddComponent<Camera>(); cam.fieldOfView = 75f; cam.nearClipPlane = 0.03f; cam.farClipPlane = 600f;
            camGo.AddComponent<AudioListener>();
            pc.cameraPivot = pivot;

            // a simple rifle in view
            var gun = new GameObject("Rifle").transform; gun.SetParent(camGo.transform, false); gun.localPosition = new Vector3(0.22f, -0.2f, 0.42f);
            var dark = Mat("GunMetal", new Color(0.16f, 0.16f, 0.17f)); var tan = Mat("GunTan", new Color(0.72f, 0.62f, 0.45f));
            Part(gun, "Receiver", new Vector3(0f, 0f, 0f), new Vector3(0.07f, 0.09f, 0.42f), dark);
            Part(gun, "Barrel", new Vector3(0f, 0.015f, 0.32f), new Vector3(0.03f, 0.03f, 0.3f), dark);
            Part(gun, "Stock", new Vector3(0f, -0.02f, -0.3f), new Vector3(0.06f, 0.1f, 0.22f), tan);
            Part(gun, "Mag", new Vector3(0f, -0.11f, 0.06f), new Vector3(0.05f, 0.14f, 0.07f), dark);
            Part(gun, "Grip", new Vector3(0f, -0.09f, -0.1f), new Vector3(0.045f, 0.12f, 0.05f), tan);
            Part(gun, "Sight", new Vector3(0f, 0.075f, 0.02f), new Vector3(0.04f, 0.05f, 0.08f), dark);
            var muzzle = new GameObject("Muzzle").transform; muzzle.SetParent(gun, false); muzzle.localPosition = new Vector3(0f, 0.015f, 0.48f);

            weapon = camGo.AddComponent<Weapon>();
            weapon.player = pc; weapon.muzzle = muzzle; weapon.gunModel = gun;
            return player;
        }

        static void Part(Transform parent, string name, Vector3 pos, Vector3 size, Material m)
        {
            var p = GameObject.CreatePrimitive(PrimitiveType.Cube);
            Object.DestroyImmediate(p.GetComponent<Collider>());
            p.name = name; p.transform.SetParent(parent, false); p.transform.localPosition = pos; p.transform.localScale = size;
            var r = p.GetComponent<Renderer>(); r.sharedMaterial = m; r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
        }

        static GameObject BuildRaiderPrefab()
        {
            var root = new GameObject("Raider");
            var hp = root.AddComponent<Health>(); hp.max = 100f;
            var agent = root.AddComponent<NavMeshAgent>(); agent.radius = 0.4f; agent.height = 1.8f; agent.speed = 3.6f; agent.acceleration = 12f; agent.angularSpeed = 360f; agent.stoppingDistance = 0.5f;
            var ai = root.AddComponent<RaiderAI>();

            var body = GameObject.CreatePrimitive(PrimitiveType.Capsule); body.name = "Body"; body.transform.SetParent(root.transform, false);
            body.transform.localPosition = new Vector3(0f, 0.8f, 0f); body.transform.localScale = new Vector3(0.7f, 0.8f, 0.5f);
            body.GetComponent<Renderer>().sharedMaterial = Mat("RaiderCloth", new Color(0.3f, 0.26f, 0.22f));
            var bh = body.AddComponent<Hitbox>(); bh.owner = hp; bh.multiplier = 1f;

            var head = GameObject.CreatePrimitive(PrimitiveType.Sphere); head.name = "Head"; head.transform.SetParent(root.transform, false);
            head.transform.localPosition = new Vector3(0f, 1.72f, 0f); head.transform.localScale = Vector3.one * 0.34f;
            head.GetComponent<Renderer>().sharedMaterial = Mat("RaiderMask", new Color(0.15f, 0.13f, 0.12f));
            var hh = head.AddComponent<Hitbox>(); hh.owner = hp; hh.multiplier = 2.5f;

            var gun = GameObject.CreatePrimitive(PrimitiveType.Cube); gun.name = "Gun"; Object.DestroyImmediate(gun.GetComponent<Collider>());
            gun.transform.SetParent(root.transform, false); gun.transform.localPosition = new Vector3(0.25f, 1.25f, 0.4f); gun.transform.localScale = new Vector3(0.07f, 0.09f, 0.7f);
            gun.GetComponent<Renderer>().sharedMaterial = Mat("GunMetal", Color.gray);
            var muzzle = new GameObject("Muzzle").transform; muzzle.SetParent(root.transform, false); muzzle.localPosition = new Vector3(0.25f, 1.27f, 0.78f);
            ai.muzzle = muzzle;

            string path = $"{Root}/Prefabs/Raider.prefab";
            var prefab = PrefabUtility.SaveAsPrefabAsset(root, path);
            Object.DestroyImmediate(root);
            return prefab;
        }

        static void BuildHud(Health hp, Weapon weapon, WaveSpawner spawner)
        {
            var canvasGo = new GameObject("HUD", typeof(Canvas), typeof(CanvasScaler));
            var canvas = canvasGo.GetComponent<Canvas>(); canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            var scaler = canvasGo.GetComponent<CanvasScaler>(); scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize; scaler.referenceResolution = new Vector2(1600, 900); scaler.matchWidthOrHeight = 0.5f;
            var font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            var hud = canvasGo.AddComponent<Hud>();
            hud.playerHealth = hp; hud.weapon = weapon; hud.spawner = spawner;

            hud.damageFlash = Img(canvasGo.transform, "DamageFlash", Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero, new Color(0.6f, 0f, 0f, 0f));
            hud.damageFlash.raycastTarget = false;

            // health bar, bottom left
            Img(canvasGo.transform, "HealthBack", new Vector2(0, 0), new Vector2(0, 0), new Vector2(40, 40), new Vector2(300, 52), new Color(1, 1, 1, 0.2f));
            hud.healthFill = Img(canvasGo.transform, "HealthFill", new Vector2(0, 0), new Vector2(0, 0), new Vector2(40, 40), new Vector2(300, 52), new Color(0.96f, 0.93f, 0.86f));
            hud.healthFill.type = Image.Type.Filled; hud.healthFill.fillMethod = Image.FillMethod.Horizontal;
            hud.healthText = Txt(canvasGo.transform, "Health", font, 34, TextAnchor.LowerLeft, new Vector2(0, 0), new Vector2(350, 30), new Vector2(120, 50));

            hud.ammoText = Txt(canvasGo.transform, "Ammo", font, 44, TextAnchor.LowerRight, new Vector2(1, 0), new Vector2(-40, 30), new Vector2(420, 60));
            hud.waveText = Txt(canvasGo.transform, "Wave", font, 26, TextAnchor.UpperCenter, new Vector2(0.5f, 1), new Vector2(0, -30), new Vector2(900, 40));
            hud.centerText = Txt(canvasGo.transform, "Center", font, 48, TextAnchor.MiddleCenter, new Vector2(0.5f, 0.5f), new Vector2(0, 120), new Vector2(1200, 300));

            // crosshair: four ticks that spread apart, and a hit marker
            var ch = new List<RectTransform>();
            string[] names = { "Up", "Down", "Left", "Right" };
            for (int k = 0; k < 4; k++)
            {
                var size = k < 2 ? new Vector2(2, 10) : new Vector2(10, 2);
                var img = Img(canvasGo.transform, "Cross" + names[k], new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, size, Color.white);
                img.raycastTarget = false; ch.Add(img.rectTransform);
            }
            hud.crosshair = ch.ToArray();
            hud.hitMarker = Img(canvasGo.transform, "HitMarker", new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(16, 16), new Color(1, 1, 1, 0));
            hud.hitMarker.rectTransform.localRotation = Quaternion.Euler(0, 0, 45);
        }

        static Image Img(Transform parent, string name, Vector2 anchorMin, Vector2 anchorMax, Vector2 pos, Vector2 size, Color c)
        {
            var go = new GameObject(name, typeof(RectTransform), typeof(Image));
            go.transform.SetParent(parent, false);
            var rt = go.GetComponent<RectTransform>();
            rt.anchorMin = anchorMin; rt.anchorMax = anchorMax; rt.pivot = anchorMin == anchorMax ? new Vector2(anchorMin.x == 0.5f ? 0.5f : anchorMin.x, anchorMin.y == 0.5f ? 0.5f : anchorMin.y) : new Vector2(0.5f, 0.5f);
            rt.anchoredPosition = pos; rt.sizeDelta = size;
            var img = go.GetComponent<Image>(); img.color = c;
            if (name.StartsWith("Health") && name.EndsWith("Fill")) img.sprite = AssetDatabase.GetBuiltinExtraResource<Sprite>("UI/Skin/UISprite.psd");
            return img;
        }

        static Text Txt(Transform parent, string name, Font font, int size, TextAnchor align, Vector2 anchor, Vector2 pos, Vector2 box)
        {
            var go = new GameObject(name, typeof(RectTransform), typeof(Text));
            go.transform.SetParent(parent, false);
            var rt = go.GetComponent<RectTransform>(); rt.anchorMin = rt.anchorMax = rt.pivot = anchor; rt.anchoredPosition = pos; rt.sizeDelta = box;
            var t = go.GetComponent<Text>(); t.font = font; t.fontSize = size; t.alignment = align; t.color = Color.white; t.raycastTarget = false;
            t.horizontalOverflow = HorizontalWrapMode.Overflow;
            var sh = go.AddComponent<Shadow>(); sh.effectColor = new Color(0, 0, 0, 0.6f); sh.effectDistance = new Vector2(2, -2);
            return t;
        }

        static void AddToBuildSettings(string path)
        {
            var list = new List<EditorBuildSettingsScene>(EditorBuildSettings.scenes);
            if (!list.Exists(s => s.path == path)) list.Add(new EditorBuildSettingsScene(path, true));
            EditorBuildSettings.scenes = list.ToArray();
        }

        // the middle of the map, or the nearest clear spot to it
        static Vector3 SafeStart(MapData d)
        {
            for (float r = 0f; r < 30f; r += 1f)
                for (int a = 0; a < 12; a++)
                {
                    float x = Mathf.Cos(a * Mathf.PI / 6f) * r, z = Mathf.Sin(a * Mathf.PI / 6f) * r;
                    bool clear = true;
                    foreach (var b in d.boxes)
                        if (b.bot < 1.8f && x > b.minX - 0.8f && x < b.maxX + 0.8f && z > b.minZ - 0.8f && z < b.maxZ + 0.8f) { clear = false; break; }
                    if (clear) return new Vector3(x, 0.1f, z);
                }
            return new Vector3(0f, 0.1f, 0f);
        }

        static Color Hex(string hex) => ColorUtility.TryParseHtmlString(hex, out var c) ? c : Color.gray;
    }
}
