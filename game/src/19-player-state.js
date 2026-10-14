/* ---------- Player & game state ---------- */
const P = { pos:new V3(0,0,36), vel:new V3(), yaw:0, pitch:0, onGround:true, hp:100, lastHit:-99, r:0.4, moving:false, sprinting:false,
  crouch:false, slideT:0, slideDir:new V3() };
const SENS = 0.0022, SLIDE = 0.8;
let state = 'menu', T = 0;
let reloading = false, reloadT = 0, lastShot = -9, shotsInRow = 0, recoilAcc = 0, kick = 0, kickR = 0, flashT = 0;
let coyoteT = 0, jumpBuf = 0, mantle = null, sprintRamp = 0, stepSide = 1;
const jet = { fuel:1, on:false, fx:0, ground:0, boost:true };
// Back gear with an ability: activate it, use it for a while, then it recharges
const GEAR_AB = { jetpack:{ name:'Jetpack', dur:10, cd:30, col:'#7fd3ff' }, tanks:{ name:'Air tanks', dur:12, cd:25, col:'#dfe8f0' }, katana:{ name:'Katana', dur:30, cd:45, col:'#ffd08a' } };
const gearAb = { t:0, cd:0, k:'' };
const gearActive = k => gearAb.t > 0 && gearAb.k === k;
const katanaOn = () => gearActive('katana');
function useGear(){
  const k = backGear(), d = GEAR_AB[k];
  if (!d || state !== 'play' || hubMode || P.dead || P.down) return false;
  if (gearAb.t > 0) return true;
  if (gearAb.cd > 0){ toast(`${d.name} recharging: ${Math.ceil(gearAb.cd)} s`, 1500); return true; }
  gearAb.k = k; gearAb.t = d.dur; gearAb.cd = 0;
  banner(d.name); sfx.swap(); blast(.2, 1800, .3, true, 0, 90);
  if (k === 'katana'){ reloading = false; ads = false; inspectT = 0; toast(isTouch ? 'Katana! Tap Fire to slash.' : padActive ? 'Katana! R2 to slash.' : 'Katana! Click to slash.', 2500); }
  if (k === 'jetpack') toast(padActive ? 'Jetpack! Jump, then hold X to fly.' : 'Jetpack! Jump, then hold Space to fly.', 2500);
  if (k === 'tanks') toast(padActive ? 'Air tanks! Press X again in mid-air to boost.' : 'Air tanks! Press Space again in mid-air to boost.', 2500);
  return true;
}
function updateGearAb(dt){
  if (gearAb.t > 0){
    gearAb.t -= dt;
    if (gearAb.t <= 0){ gearAb.t = 0; gearAb.cd = GEAR_AB[gearAb.k].cd; feed(`${GEAR_AB[gearAb.k].name} recharging`); }
  } else if (gearAb.cd > 0){ gearAb.cd = Math.max(0, gearAb.cd - dt); if (!gearAb.cd) feed(`${GEAR_AB[gearAb.k].name} ready`, true); }
  // HUD: what the ability is doing, and a bar for the time left or the recharge
  const d = GEAR_AB[backGear()];
  if (!gearAb.hud){ gearAb.hud = document.createElement('div'); gearAb.hud.style.cssText = 'position:absolute;left:50%;top:104px;width:220px;margin-left:-110px;text-align:center;pointer-events:none;font:700 15px "Barlow Condensed",sans-serif;letter-spacing:.06em;color:#f4ecdc;text-shadow:0 1px 3px #000';
    gearAb.txt = document.createElement('div'); const bg = document.createElement('div'); bg.style.cssText = 'height:6px;margin-top:3px;background:rgba(255,255,255,.2);border-radius:3px;overflow:hidden';
    gearAb.bar = document.createElement('div'); gearAb.bar.style.cssText = 'height:100%;width:0'; bg.appendChild(gearAb.bar); gearAb.hud.append(gearAb.txt, bg); $('hud').appendChild(gearAb.hud); }
  gearAb.hud.style.display = d && !hubMode ? 'block' : 'none';
  if (gearAb.touch) gearAb.touch.style.display = d && !hubMode ? '' : 'none';
  if (!d) return;
  const key = isTouch ? 'GEAR' : padActive ? 'HOLD △' : 'F';
  const on = gearAb.t > 0 && gearAb.k === backGear(), cd = gearAb.cd > 0 && gearAb.k === backGear();
  gearAb.txt.textContent = on ? `${d.name.toUpperCase()} · ${Math.ceil(gearAb.t)} s` : cd ? `${d.name.toUpperCase()} · RECHARGING ${Math.ceil(gearAb.cd)} s` : `${key} · ${d.name.toUpperCase()} READY`;
  gearAb.bar.style.width = (on ? gearAb.t/d.dur*100 : cd ? (1 - gearAb.cd/d.cd)*100 : 100).toFixed(1) + '%';
  gearAb.bar.style.background = on ? d.col : cd ? 'rgba(255,255,255,.45)' : '#f0a93b';
  if (gearAb.touch) gearAb.touch.style.opacity = on || cd ? .45 : 1;
}
let fireQueued = false, actionT = 0, actionDone = 0, swapT = 0, nextW = 0, inspectT = 0, relEnv = 0, breath = 4, lastStep = 0, scoped = false, steadyF = 0;
const _mz = new V3(), _iq = new THREE.Quaternion();
let firing = false, ads = false, bobT = 0, sprintF = 0, adsF = 0, slideF = 0;
let camH = 1.62, landDip = 0, rollZ = 0, shake = 0, strafeF = 0, mdx = 0, mdy = 0;
const sway = { x:0, y:0 };
let wave = 0, toSpawn = 0, spawnT = 0, waveActive = false, intermission = 0, score = 0, kills = 0, headshots = 0;
const keys = {};
const touch = { moveId:null, sx:0, sy:0, mx:0, my:0, lookId:null, lx:0, ly:0, jump:false };
const ray = new THREE.Raycaster();
let padAdsWas = false;
// controller aim assist: find the enemy closest to the crosshair
function aimAssist(){
  const fwd = new V3(0,0,-1).applyQuaternion(camera.quaternion); let best = null, ba = .09;
  for (const e of enemies){
    if (!e.alive || !e.sees) continue;
    const c = new V3(e.pos.x, (e.y || 0) + 1.3*e.g.scale.x, e.pos.z), d = c.clone().sub(camera.position), dist = d.length();
    if (dist > 60) continue; d.normalize();
    const ang = Math.acos(Math.max(-1, Math.min(1, fwd.dot(d))));
    if (ang < ba){ ba = ang; best = { dy:Math.atan2(-d.x, -d.z) - P.yaw, dp:Math.asin(d.y) - P.pitch }; }
  }
  if (best){ best.dy = ((best.dy + Math.PI*3) % (Math.PI*2)) - Math.PI; }
  return best;
}
