/* ---------- Gun Game mode ---------- */
let gameMode = ['gungame','tdm','waves','coop'].includes(store.get('dustyard-mode')) ? store.get('dustyard-mode') : 'tdm';
const GG_ORDER = ['pistol', 'smg', 'shotgun', 'rifle', 'sniper', 'launcher', 'knife'];
let gg = { level:0, start:0, done:false };
function ggWeaponIndex(id){ return WEAPONS.findIndex(W => W.id === id); }
function ggStart(){
  gg = { level:0, start:T, done:false };
  ggEquip(); banner('Gun Game'); toast('Every kill gives you the next weapon. Finish with a knife kill.', 5000);
}
function ggEquip(){
  const id = GG_ORDER[gg.level];
  if (id === 'knife'){ $('ggLine').textContent = 'Final round: get a KNIFE kill (V)'; return; }
  const i = ggWeaponIndex(id), W = WEAPONS[i]; W.ammo = W.c.mag; W.reserve = W.c.mag*6;
  ggForce = true; if (i !== cw){ nextW = i; swapT = .0001; } ggForce = false;
  $('ggLine').textContent = `Gun Game ${gg.level + 1}/${GG_ORDER.length}: ${W.name}`;
}
let ggForce = false;
function ggKill(src){
  if (gameMode !== 'gungame' || gg.done) return;
  const want = GG_ORDER[gg.level];
  if (want === 'knife'){ if (src !== 'knife') return; gg.done = true; const secs = Math.round(T - gg.start);
    banner('Gun Game complete'); toast(`Gun Game complete in ${Math.floor(secs/60)}:${String(secs%60).padStart(2,'0')}!`, 5000); sfx.levelUp(); giveXP(2000);
    const best = +store.get('dustyard-gg-best') || 0; if (!best || secs < best) store.set('dustyard-gg-best', String(secs));
    setTimeout(() => { if (state === 'play') gameOver(); }, 2500); return; }
  if (src && src !== 'nade') return;          // kills with the current gun (rockets count for the launcher)
  if (src === 'nade' && want !== 'launcher') return;
  gg.level++; sfx.pickup(); ggEquip();
}

/* ---------- Portfolio app ---------- */
let portfolio = null, portfolioLoading = false;
async function loadPortfolio(){
  if (!srvMode || !isAddr(x1Addr) || portfolioLoading) return; portfolioLoading = true; renderPhone();
  try { portfolio = await (await fetch(`${PROFILE_API}/api/portfolio?wallet=${x1Addr}`, { cache:'no-store' })).json(); portfolio.addr = x1Addr; portfolio.at = Date.now(); } catch(e){ portfolio = { error:'Could not load your portfolio.' }; }
  portfolioLoading = false; if (phoneApp === 'portfolio') renderPhone();
}
function renderPortfolio(body){
  const head = document.createElement('div'); head.className = 'phHead';
  head.append(phoneBtn('‹ Home', () => { phoneApp = 'home'; renderPhone(); }, 'phBack'), phoneLine('Portfolio', 'phTitle')); body.appendChild(head);
  if (!srvMode){ body.appendChild(phoneLine('Your portfolio loads on your Railway site.', 'phSmall')); return; }
  if (!isAddr(x1Addr)){ body.appendChild(phoneLine('Connect your wallet first.', 'phSmall')); return; }
  if (portfolioLoading){ body.appendChild(phoneLine('Reading your wallet and XDEX prices...', 'phSmall')); return; }
  if (!portfolio || portfolio.addr !== x1Addr || Date.now() - portfolio.at > 120000){ loadPortfolio(); body.appendChild(phoneLine('Loading...', 'phSmall')); return; }
  if (portfolio.error){ body.appendChild(phoneLine(portfolio.error, 'phSmall')); body.appendChild(phoneBtn('Try again', () => { portfolio = null; loadPortfolio(); }, 'phMain')); return; }
  const card = document.createElement('div'); card.className = 'phCard';
  card.append(phoneLine('Total value', 'phSmall'), phoneLine(fmtUsd(portfolio.totalUsd || 0), 'phBal'), phoneLine(`${portfolio.tokens.length} tokens · ${portfolio.nfts} NFTs`, 'phSmall'));
  body.appendChild(card);
  for (const t of portfolio.tokens){
    const r = document.createElement('div'); r.className = 'pfRow';
    const a = document.createElement('b'); a.textContent = t.symbol; const n = document.createElement('span'); n.textContent = t.name || '';
    const amt = document.createElement('em'); amt.textContent = Number(t.amount).toLocaleString(undefined, { maximumFractionDigits:4 });
    const v = document.createElement('i'); v.textContent = t.usd != null ? fmtUsd(t.usd) : 'no price';
    r.append(a, n, amt, v); body.appendChild(r);
  }
  body.appendChild(phoneLine('Prices come from XDEX pools on X1 and are estimates. Tokens without enough liquidity show "no price".', 'phSmall'));
  body.appendChild(phoneBtn('Refresh', () => { portfolio = null; loadPortfolio(); }));
}

/* ---------- Create-a-Class ---------- */
const CLASS_PERKS = [
  [{ k:'quick', n:'Lightweight', d:'Move faster' }, { k:'scav', n:'Scavenger', d:'Kills refill your ammo' }, { k:'reload', n:'Sleight of Hand', d:'Faster reloads' }],
  [{ k:'stopping', n:'Stopping Power', d:'25% more bullet damage' }, { k:'hardline', n:'Hardline', d:'Killstreaks need one fewer kill' }, { k:'armor', n:'Flak Jacket', d:'35% less explosive damage' }],
  [{ k:'steady', n:'Steady Aim', d:'Tighter hip fire' }, { k:'commando', n:'Commando', d:'Longer knife lunge' }, { k:'regen2', n:'Iron Lungs', d:'Health comes back sooner' }]
];
const STREAK_DEFS = {
  uav:{ name:'UAV', need:3, d:'Shows every raider on your minimap' },
  care:{ name:'Care Package', need:4, d:'A crate with a random killstreak or supplies' },
  predator:{ name:'Predator Missile', need:5, d:'Steer a missile down onto the enemy' },
  air:{ name:'Precision Airstrike', need:6, d:'A jet bombs a line you mark' },
  drone:{ name:'Attack Drone', need:7, d:'Hunts raiders for 30 seconds' },
  // animal operators get these three instead of the class's streaks
  pounce:{ name:'Pounce', need:3, d:'Leap onto the raider in your sights, up to 25 m away, and knock down everyone near the landing', animal:true },
  stampede:{ name:'Stampede', need:5, d:'Mark a line: a herd of armoured war elephants charges along it, trampling every raider in the way', animal:true },
  apex:{ name:'Apex Form', need:8, d:'Grow into a giant for 20 seconds: claws, ground slams, 75% less damage', animal:true }
};
const ANIMAL_STREAKS = ['pounce', 'stampede', 'apex'];
const PRIMARIES = [0, 1, 2, 3], SECONDARIES = ['pistol', 'launcher'];
let klass;
try { klass = JSON.parse(store.get('dy-class') || 'null'); } catch(e){ klass = null; }
if (!klass || !Array.isArray(klass.perks) || !Array.isArray(klass.streaks)) klass = { primary:0, secondary:'pistol', tac:'flash', perks:['quick', 'stopping', 'steady'], streaks:['uav', 'predator', 'drone'] };
function saveClass(){ store.set('dy-class', JSON.stringify(klass)); }
function buildStreaks(list){
  const keys = ['7', '8', '9'], pads = ['D-pad up', 'D-pad right', 'D-pad down'];
  return list.filter(k => STREAK_DEFS[k]).sort((a, b) => STREAK_DEFS[a].need - STREAK_DEFS[b].need).slice(0, 3)
    .map((k, i) => ({ k, name:STREAK_DEFS[k].name, need:STREAK_DEFS[k].need, key:keys[i], pad:pads[i] }));
}
function applyClass(){
  CLASS_SET.clear(); klass.perks.forEach(k => CLASS_SET.add(k));
  // animal operators use their own three streaks (the operator settings load later than this on startup)
  let animalOp = false; try { animalOp = opMine().k === 'animal'; } catch(e){}
  STREAKS.length = 0; STREAKS.push(...buildStreaks(animalOp ? ANIMAL_STREAKS : klass.streaks));
  tacType = klass.tac === 'smoke' ? 'smoke' : 'flash';
  startW = PRIMARIES.includes(klass.primary) ? klass.primary : 0;
  hud.sk = '';
}
const secondaryIndex = () => WEAPONS.findIndex(W => W.id === (klass.secondary === 'launcher' ? 'launcher' : 'pistol'));
// Team Deathmatch uses MW2 rules: just your primary and secondary
const classLocked = () => gameMode === 'tdm' && !hubMode && !tut;
function classAllows(i){ return !classLocked() || i === startW || i === secondaryIndex(); }
function renderClass(){
  const box = $('classBody'); box.innerHTML = '';
  const group = (title, opts, isOn, pick, multi) => {
    const p = document.createElement('p'); p.className = 'pick'; p.textContent = title; box.appendChild(p);
    const row = document.createElement('div'); row.className = 'loadout clsRow'; box.appendChild(row);
    for (const o of opts){
      const b = document.createElement('button'); b.type = 'button'; b.className = isOn(o) ? 'on' : '';
      const t = document.createElement('b'); t.textContent = o.n; const s = document.createElement('span'); s.textContent = o.d; b.append(t, s);
      b.addEventListener('click', () => { pick(o); saveClass(); renderClass(); if (padActive) setPadFocus([...$('classBody').querySelectorAll('button')].find(x => x.firstChild.textContent === o.n)); });
      row.appendChild(b);
    }
  };
  group('Primary weapon', PRIMARIES.map(i => ({ i, n:WEAPONS[i].name, d:['Assault rifle', 'Fast, close range', 'Shotgun', 'Sniper rifle'][i] })), o => klass.primary === o.i, o => { klass.primary = o.i; });
  group('Secondary', [{ id:'pistol', n:'P-11 Sidearm', d:'Pistol' }, { id:'launcher', n:'RPG-X', d:'Rocket launcher' }], o => klass.secondary === o.id, o => { klass.secondary = o.id; });
  group('Tactical', [{ id:'flash', n:'Flashbang', d:'Stuns raiders' }, { id:'smoke', n:'Smoke', d:'Blocks their sight' }], o => klass.tac === o.id, o => { klass.tac = o.id; });
  CLASS_PERKS.forEach((tier, ti) => group(`Perk ${ti + 1}`, tier, o => klass.perks[ti] === o.k, o => { klass.perks[ti] = o.k; }));
  group(opMine().k === 'animal' ? 'Killstreaks (pick 3; your animal operator uses Howl, Berserker and Alpha Rage instead)' : 'Killstreaks (pick 3)', Object.entries(STREAK_DEFS).filter(([, S]) => !S.animal).map(([k, S]) => ({ k, n:`${S.name} · ${S.need}`, d:S.d })), o => klass.streaks.includes(o.k), o => {
    if (klass.streaks.includes(o.k)){ if (klass.streaks.length > 1) klass.streaks = klass.streaks.filter(x => x !== o.k); }
    else { klass.streaks.push(o.k); if (klass.streaks.length > 3) klass.streaks.shift(); }
  });
  const note = document.createElement('p'); note.className = 'stat clsNote';
  note.textContent = 'In Team Deathmatch you carry only your primary and secondary, like MW2. Changes apply at your next spawn or match.';
  box.appendChild(note);
}
let classReturn = 'menu';
function openClass(){ classReturn = state === 'paused' ? 'pausePanel' : 'menu'; show('classPanel'); renderClass(); }

/* ---------- Care Package ---------- */
const careCrates = [];
const CARE_LOOT = [['uav', 30], ['predator', 22], ['air', 16], ['drone', 10], ['ammo', 22]];
function dropCarePackage(){
  const f = new V3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw)), at = P.pos.clone().addScaledVector(f, 5);
  at.x = Math.max(-42, Math.min(42, at.x)); at.z = Math.max(-42, Math.min(42, at.z)); collide(at, .8);
  const g = new THREE.Group();
  const box = new THREE.Mesh(Bx(1.1, .8, 1.1), MS(0x4d5a35, .8, .1)); box.castShadow = true; g.add(box);
  for (const z of [-.56, .56]){ const st = new THREE.Mesh(Bx(1.12, .1, .02), MS(0x222222, .6, .2)); st.position.set(0, .2, z); g.add(st); }
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(.08, 8, 6), new THREE.MeshBasicMaterial({ color:0xff3b2f })); lamp.position.y = .45; g.add(lamp);
  g.position.set(at.x, 40, at.z); scene.add(g);
  careCrates.push({ g, at, y:40, landed:false, smokeT:0 });
  sfx.jet(); feed('Care package inbound'); toast('Care package inbound. Walk up to the crate to open it.', 3000);
}
function updateCrates(dt){
  for (let i=careCrates.length-1;i>=0;i--){
    const c = careCrates[i];
    if (!c.landed){
      c.y -= dt*18; c.smokeT -= dt;
      if (c.smokeT <= 0){ c.smokeT = .12; spawnPuff(new V3(c.at.x, c.y + .6, c.at.z), 0xff3b2f, .35, .9, .2); }
      if (c.y <= .4){ c.y = .4; c.landed = true; sfx.boom(10); spawnPuff(new V3(c.at.x, .3, c.at.z), 0xb9a27c, .9, .6, .3); }
      c.g.position.y = c.y;
    } else {
      c.smokeT -= dt; if (c.smokeT <= 0){ c.smokeT = .35; spawnPuff(new V3(c.at.x, 1, c.at.z), 0xff5040, .3, 1.4, .5); }
      if (Math.hypot(P.pos.x - c.at.x, P.pos.z - c.at.z) < 2.2){
        const loot = CARE_LOOT.filter(([k]) => k === 'ammo' || STREAKS.some(S => S.k === k)), tot = loot.reduce((a, [, w]) => a + w, 0); let r = Math.random()*tot, pick = 'ammo'; for (const [k, w] of loot){ if ((r -= w) < 0){ pick = k; break; } }
        if (pick === 'ammo'){ WEAPONS.forEach(W => { W.reserve = W.maxRes; W.ammo = W.c.mag; }); fragN = nadeCap(); tacN = nadeCap(); banner('Care package: full ammo'); }
        else { sInv[pick] = (sInv[pick] || 0) + 1; banner(`Care package: ${STREAK_DEFS[pick].name}`); toast(`${STREAK_DEFS[pick].name} ready. Press ${streakKeyFor(pick)} to use it.`, 3500); }
        sfx.pickup(); sfx.streak(); hud.sk = ''; scene.remove(c.g); careCrates.splice(i,1);
      }
    }
  }
}
// a care package can hand out a streak that's not in your class, so it gets the free slot key
function streakKeyFor(k){ const i = STREAKS.findIndex(S => S.k === k); return i >= 0 ? (padActive ? STREAKS[i].pad : STREAKS[i].key) : (padActive ? 'Triangle + D-pad' : 'the streak key'); }

/* ---------- Predator Missile ---------- */
let predator = null;
function launchPredator(){
  const f = new V3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
  predator = { x:P.pos.x + f.x*18, z:P.pos.z + f.z*18, y:95, t:0, boost:false, yaw:P.yaw, pitch:P.pitch };
  ads = false; firing = false; airAim = false; airMark.visible = false;
  $('predHud').hidden = false; sfx.radio(); feed('Predator missile away'); banner('Predator Missile');
}
function updatePredator(dt){
  const p = predator; p.t += dt;
  // steer with movement keys, the left stick, or by moving the mouse
  let sx = 0, sz = 0;
  if (keys.KeyA || keys.ArrowLeft) sx -= 1; if (keys.KeyD || keys.ArrowRight) sx += 1;
  if (keys.KeyW || keys.ArrowUp) sz -= 1; if (keys.KeyS || keys.ArrowDown) sz += 1;
  const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null;
  if (gp){ if (Math.abs(gp.axes[0]) > .15) sx += gp.axes[0]; if (Math.abs(gp.axes[1]) > .15) sz += gp.axes[1]; if (gp.buttons[7] && gp.buttons[7].pressed) p.boost = true; }
  const dyaw = P.yaw - p.yaw, dpitch = P.pitch - p.pitch; P.yaw = p.yaw; P.pitch = p.pitch;
  sx += -dyaw*40; sz += -dpitch*40;
  const steer = p.boost ? 9 : 16;
  p.x = Math.max(-46, Math.min(46, p.x + sx*steer*dt)); p.z = Math.max(-46, Math.min(46, p.z + sz*steer*dt));
  p.y -= (p.boost ? 62 : 20)*dt;
  const ground = groundAt(p.x, p.z, p.y + 1);
  if (p.y <= ground + .3 || p.t > 14) endPredator(true);
}
function predatorCam(){
  const p = predator;
  camera.position.set(p.x, p.y, p.z); camera.up.set(0, 0, -1); camera.lookAt(p.x, 0, p.z); camera.up.set(0, 1, 0);
  camera.fov = 55; camera.updateProjectionMatrix();
  const c = $('predCanvas'), g = c.getContext('2d');
  if (c.width !== innerWidth || c.height !== innerHeight){ c.width = innerWidth; c.height = innerHeight; }
  g.clearRect(0, 0, c.width, c.height); g.lineWidth = 2;
  for (const e of enemies){
    if (!e.alive) continue;
    const v = new V3(e.pos.x, (e.y || 0) + 1, e.pos.z).project(camera); if (v.z > 1) continue;
    const x = (v.x + 1)/2*c.width, y = (1 - v.y)/2*c.height; g.strokeStyle = '#ff3b2f'; g.strokeRect(x - 9, y - 9, 18, 18);
  }
  const me = new V3(P.pos.x, P.pos.y + 1, P.pos.z).project(camera);
  if (me.z <= 1){ const x = (me.x + 1)/2*c.width, y = (1 - me.y)/2*c.height; g.strokeStyle = '#5cff8a'; g.beginPath(); g.arc(x, y, 9, 0, Math.PI*2); g.stroke(); }
  $('predAlt').textContent = `ALT ${Math.max(0, Math.round(p.y))}m${p.boost ? '  ·  BOOST' : ''}`;
}
function endPredator(blow){
  if (!predator) return;
  const p = predator; predator = null;
  if (blow) explode(new V3(p.x, Math.max(.3, groundAt(p.x, p.z, p.y + 1) + .3), p.z), { noPlayer:true, src:'air', R:9 });
  P.yaw = p.yaw; P.pitch = p.pitch; $('predHud').hidden = true; camera.fov = cfg.fov; camera.updateProjectionMatrix();
}

/* ---------- Training (first-time players) ---------- */
let tut = null;
const TUT_STEPS = [
  { t:'Move with W A S D', pad:'Move with the left stick', setup:s => { s.from = P.pos.clone(); }, done:s => P.pos.distanceTo(s.from) > 4 },
  { t:'Look around with the mouse', pad:'Look around with the right stick', setup:s => { s.yaw = P.yaw; s.turn = 0; }, done:s => { s.turn += Math.abs(P.yaw - s.yaw); s.yaw = P.yaw; return s.turn > 2; } },
  { t:'Shoot the raider (left click)', pad:'Shoot the raider (R2)', setup:s => { s.dummies = tutDummies(1, 14); }, done:s => s.dummies.every(e => !e.alive) },
  { t:'Aim down sights (right click) and take out the far raider', pad:'Aim down sights (L2) and take out the far raider', setup:s => { s.dummies = tutDummies(1, 28); }, done:s => s.dummies.every(e => !e.alive) },
  { t:'Reload with R or 0', pad:'Reload with Square', setup:s => { cur().ammo = Math.min(cur().ammo, 3); }, done:() => reloading },
  { t:'Sprint with Shift, then press C to slide', pad:'Sprint with L3, then press Circle to slide', setup:() => {}, done:() => P.slideT > 0 },
  { t:'Hold G to aim a grenade at the group, release to throw', pad:'Hold R1 to aim a grenade at the group, release to throw', setup:s => { fragN = Math.max(fragN, 2); s.dummies = tutDummies(3, 15); }, done:s => s.dummies.every(e => !e.alive) },
  { t:'Killstreak ready: press 7 to call in a UAV', pad:'Killstreak ready: press D-pad up to call in a UAV', setup:() => { sInv.uav = 1; hud.sk = ''; }, done:() => uavT > 0 }
];
function tutDummies(n, dist){
  const f = new V3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw)), r = new V3(Math.cos(P.yaw), 0, -Math.sin(P.yaw)), out = [];
  for (let i=0;i<n;i++){
    const at = P.pos.clone().addScaledVector(f, dist).addScaledVector(r, (i - (n - 1)/2)*1.6);
    at.x = Math.max(-42, Math.min(42, at.x)); at.z = Math.max(-42, Math.min(42, at.z));
    const e = makeEnemy(at.x, at.z); e.type = 'grunt'; e.y = 0; applyType(e); e.speed = 0; e.hp = 60; e.maxHp = 60; e.tut = true; enemies.push(e); out.push(e);
  }
  return out;
}
function startTutorial(){
  store.set('dy-tut', '1');
  leaveHub(); removePet(); tdmStop(); setPadActive(false);
  setMap('yard'); initAudio(); applyClass(); STREAKS.length = 0; STREAKS.push(...buildStreaks(['uav', 'predator', 'drone']));
  resetGame(); state = 'play'; show(null); $('hud').hidden = false; $('touch').hidden = !isTouch;
  tut = { i:-1, wait:0 }; nextTutStep(); $('tutBox').hidden = false; banner('Training'); requestLock();
}
function nextTutStep(){
  tut.i++; tut.s = {};
  if (tut.i >= TUT_STEPS.length){ finishTutorial(); return; }
  TUT_STEPS[tut.i].setup(tut.s); renderTut();
}
function renderTut(){
  const S = TUT_STEPS[tut.i]; if (!S) return;
  $('tutStep').textContent = `Training ${tut.i + 1}/${TUT_STEPS.length}`;
  $('tutText').textContent = padActive || (!isTouch && navigator.getGamepads && [...navigator.getGamepads()].some(Boolean)) ? S.pad : S.t;
}
function updateTut(dt){
  if (!tut || tut.i >= TUT_STEPS.length) return;
  if (tut.wait > 0){ tut.wait -= dt; if (tut.wait <= 0) nextTutStep(); return; }
  if (TUT_STEPS[tut.i].done(tut.s)){ sfx.pickup(); $('tutText').textContent = '✓ Nice'; tut.wait = .9; }
}
function finishTutorial(){
  $('tutBox').hidden = true; tut = null; giveXP(500);
  banner('Training complete'); toast('You’re ready. Team Deathmatch is selected: set up your class, then press Play.', 6000);
  gameMode = 'tdm'; store.set('dustyard-mode', 'tdm');
  setTimeout(() => { if (state === 'play'){ toMenu(); [...$('modePick').children].forEach(x => x.classList.toggle('on', x.dataset.g === 'tdm')); } }, 2600);
}
function tutStop(){ tut = null; $('tutBox').hidden = true; }

/* ---------- Smoothness: dynamic resolution ---------- */
function updateDRS(fps){
  if (state !== 'play'){ return; }
  drsT += .5; if (drsT < 2) return;
  if (fps < 45 && drs > .6){ drs = Math.max(.6, +(drs - .1).toFixed(2)); drsT = 0; applyQuality(); }
  else if (fps > 58 && drs < 1){ drs = Math.min(1, +(drs + .05).toFixed(2)); drsT = 0; applyQuality(); }
}

