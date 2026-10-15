# Dust Yard — Unity 6 prototype

A first playable of Dust Yard in Unity 6, built alongside the browser game (which keeps running as it is).

What's here:

| Folder | What it is |
|---|---|
| `Assets/DustYard/Data/` | The layouts of Dust Yard, Neon District and Jungle Ruins, exported from the browser game: every wall, container, crate, floor and spawn point. |
| `Assets/DustYard/Scripts/` | Player movement (walk, sprint, crouch, slide, jump with coyote time), the KR-7 rifle (spread, recoil, headshots, reload), health with regen, raider AI on the NavMesh, waves, HUD. |
| `Assets/DustYard/Editor/` | **Dust Yard** menu: builds a playable greybox scene of any of the three maps in one click. |

## 1. Install (once)

1. Install **Unity Hub**, then **Unity 6** (6000.0 or later) from the Hub.
2. In the Hub: **New project → Universal 3D (URP)**. Name it `DustYardUnity`.
3. Copy this repo's `unity/Assets/DustYard` folder into the new project's `Assets` folder.
4. In Unity: **Window → Package Manager → Unity Registry**, and make sure these are installed:
   - **Input System** (`com.unity.inputsystem`). If Unity asks to restart to enable the new input backend, say yes.
   - **AI Navigation** (`com.unity.ai.navigation`).
5. **Edit → Project Settings → Player → Active Input Handling**: `Input System Package (New)` or `Both`.

## 2. Build a map and play

**Dust Yard → Build Dust Yard (greybox)**, then press **Play**.

Controls: WASD, mouse, Shift sprint, C or Ctrl crouch (crouch while sprinting to slide), Space jump,
left click fire, R reload, Esc frees the mouse. Gamepad: sticks, R2 fire, Square/X reload,
Cross/A jump, Circle/B crouch, L3 sprint.

Re-run the menu item any time; it rebuilds the scene from the layout file.

## 3. Connect Claude through Unity MCP

So Claude can build scenes, edit scripts and read the console in your editor:

1. Package Manager: install **AI Assistant** (`com.unity.ai.assistant`). It needs a Unity AI (beta) trial
   or subscription and the project connected to Unity Cloud.
2. **Edit → Project Settings → AI → Unity MCP**: turn on the bridge. The page shows the settings for
   MCP clients.
3. Add Unity's MCP server to **Claude Code** or the **Claude desktop app** on the same computer, using those settings.
4. Keep the Unity editor open while you work with Claude.

## 4. Next steps for the prototype

- Import the operator and HD head models from `game/assets/*.glb` (install **glTFast**, `com.unity.cloud.gltfast`), replace the capsule raiders.
- Swap the greybox blocks for real models (containers, the Depot 7 warehouse, the pyramid).
- Lighting pass: baked lights, post-processing (bloom, colour grading per map), skyboxes.
- Port the rest: other weapons, grenades, killstreaks, animal specials, bosses, co-op, the server-checked
  matches and wallet.
- Web build (**File → Build Profiles → Web**) to keep the play-in-the-browser link.
