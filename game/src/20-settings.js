/* ---------- Settings & graphics quality ---------- */
function applyQuality(){
  const Q = QUALITY[cfg.quality], pr = qPR();
  renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight);
  if (typeof setupPost === 'function') setupPost();
  if (composer){ composer.setPixelRatio(pr); composer.setSize(innerWidth, innerHeight); if (bloomPass) bloomPass.setSize(innerWidth*pr, innerHeight*pr); postSized(pr); }
  setHaze((currentMap === 'neon' ? .42 : currentMap === 'jungle' ? .36 : .2) * Q.haze);
  sun.castShadow = Q.shadows;
  if (sun.shadow.mapSize.x !== Q.shadowSize){ if (sun.shadow.map){ sun.shadow.map.dispose(); sun.shadow.map = null; } sun.shadow.mapSize.set(Q.shadowSize, Q.shadowSize); }
  dust.visible = Q.dust && currentMap === 'yard';
}
function saveCfg(){ store.set('dustyard-settings', JSON.stringify(cfg)); }
let settingsReturn = 'menu';
const SETTINGS = [
  { k:'sens', label:'Mouse / touch sensitivity', min:.2, max:3, step:.05, fmt:v => v.toFixed(2) + '×' },
  { k:'adsSens', label:'Aiming sensitivity', min:.3, max:1.5, step:.05, fmt:v => Math.round(v*100) + '%' },
  { k:'padSens', label:'Controller sensitivity', min:.3, max:2.5, step:.05, fmt:v => v.toFixed(2) + '×' },
  { k:'fov', label:'Field of view', min:60, max:100, step:1, fmt:v => v + '°' },
  { k:'vol', label:'Volume', min:0, max:1.5, step:.05, fmt:v => Math.round(v*100) + '%' },
  { k:'view', label:'Camera', options:[['fp','First person'],['tp','Third person']] },
  { k:'raiders', label:'Raider faction', options:[['map','By map'],['wolves','Wolves'],['aliens','Aliens'],['gorillas','Gorillas'],['classic','Classic']] },
  { k:'quality', label:'Graphics quality', options:[['low','Low'],['medium','Medium'],['high','High']], note:'High adds contact shadows and sharper shadows. Low is best for phones.' },
  { k:'auto', label:'Lower graphics automatically if the game runs slowly', toggle:true },
  { k:'aimAssist', label:'Controller aim assist', toggle:true },
  { k:'fps', label:'Show frame rate', toggle:true }
];
function renderSettings(){
  const box = $('setList'); box.innerHTML = '';
  for (const S of SETTINGS){
    const row = document.createElement('label'); row.className = 'setRow';
    const name = document.createElement('span'); name.textContent = S.label; if (S.note) name.title = S.note; row.appendChild(name);
    if (S.options){
      const sel = document.createElement('div'); sel.className = 'seg';
      S.options.forEach(([v,t]) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; if (cfg[S.k] === v) b.className = 'on';
        b.addEventListener('click', () => { cfg[S.k] = v; saveCfg(); applyQuality(); renderSettings(); }); sel.appendChild(b); });
      row.appendChild(sel);
    } else if (S.toggle){
      const c = document.createElement('input'); c.type = 'checkbox'; c.checked = !!cfg[S.k];
      c.addEventListener('change', () => { cfg[S.k] = c.checked; saveCfg(); }); row.appendChild(c);
    } else {
      const wrap = document.createElement('div'); wrap.className = 'rng';
      const r = document.createElement('input'); r.type = 'range'; r.min = S.min; r.max = S.max; r.step = S.step; r.value = cfg[S.k];
      const v = document.createElement('em'); v.textContent = S.fmt(cfg[S.k]);
      r.addEventListener('input', () => { cfg[S.k] = +r.value; v.textContent = S.fmt(cfg[S.k]); saveCfg(); if (S.k === 'vol' && master) master.gain.value = .45*cfg.vol; });
      wrap.appendChild(r); wrap.appendChild(v); row.appendChild(wrap);
    }
    box.appendChild(row);
  }
}
function openSettings(from){ settingsReturn = from; renderSettings(); show('settings'); }
// frame-rate watch for the FPS display and automatic quality drop
let fpsAcc = 0, fpsN = 0, fpsShown = 0, slowT = 0;
function watchFps(dt){
  fpsAcc += dt; fpsN++;
  if (fpsAcc >= .5){
    fpsShown = Math.round(fpsN/fpsAcc); fpsAcc = 0; fpsN = 0; updateDRS(fpsShown);
    $('fps').hidden = !cfg.fps; if (cfg.fps) $('fps').textContent = fpsShown + ' FPS';
    if (state === 'play' && cfg.auto && cfg.quality !== 'low'){
      slowT = fpsShown < 40 ? slowT + .5 : 0;
      if (slowT >= 4){ slowT = 0; cfg.quality = cfg.quality === 'high' ? 'medium' : 'low'; saveCfg(); applyQuality(); toast(`The game was running slowly, so graphics were lowered to ${cfg.quality}. You can change this in Settings.`, 4500); }
    }
  }
}

function clampPitch(){ P.pitch = Math.max(-1.45, Math.min(1.45, P.pitch)); }
function currentSpread(){
  const W = cur();
  let s = W.c.hip + (W.ads - W.c.hip)*adsF;
  if (perk('steady')) s *= 1 - .35*(1 - adsF);
  if (P.moving && P.slideT <= 0) s += W.c.move*(1 - adsF*.7);
  if (P.slideT > 0) s += 0.012;
  if (P.crouch && !P.moving) s *= 0.75;
  if (!P.onGround) s += 0.05;
  s += Math.min(shotsInRow, 10) * W.bloom * (1 - adsF*.6);
  if (W.scope && !scoped) s = Math.max(s, W.c.hip);
  return s;
}
function crouchPress(){
  if (state !== 'play') return;
  if (P.sprinting && P.onGround && P.slideT <= 0){
    P.slideT = SLIDE; P.crouch = true;
    P.slideDir.set(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
    sfx.slide();
  } else if (P.slideT <= 0) P.crouch = !P.crouch;
  $('tCrouch').classList.toggle('on', P.crouch);
}

function canFire(){ const W = cur(); return !hubMode && swapT === 0 && actionT <= 0 && throwT <= 0 && meleeT <= 0 && !aimNade && !airAim && !P.sprinting && T - lastShot >= W.rof; }
function shoot(){
  const W = cur(), V = W.vm;
  if (reloading){ if (W.shellReload && W.ammo > 0) reloading = false; else return; }
  if (W.ammo <= 0){ lastShot = T; if (W.reserve > 0) reload(); else { sfx.click(); autoSwitch(); } return; }
  if (P.down || P.dead) return;
  W.ammo--; lastShot = T; shotsInRow++; inspectT = 0; if (coop) coop.shots = (coop.shots || 0) + 1;
  if (W.rocket){ fireRocket(W); P.pitch += W.c.kickV; clampPitch(); flashT = .07; return; }
  sfx.fire(W.id, W.c.supp); if (V.slide) slideKick = 1; rumble(W.id === 'smg' ? .2 : .35, W.id === 'sniper' || W.id === 'shotgun' ? .8 : .5, W.id === 'smg' ? 45 : 80);
  const spread = currentSpread();
  const targets = solids.slice();
  for (const e of enemies) if (e.alive) targets.push(...e.parts);
  gunScene.updateMatrixWorld(true);
  const tpOn = tpBlend >= .5 && opBody && opBody.gun;
  const muzzle = tpOn ? opBody.gun.userData.mz.getWorldPosition(new V3()) : camera.localToWorld(V.muzzle.getWorldPosition(_mz).clone());
  if (tpOn) opBody.recoil = Math.min(.12, opBody.recoil + .05);
  const hitMap = new Map();
  let holesLeft = W.pellets > 1 ? 3 : 1;
  for (let i=0;i<W.pellets;i++){
    let dx = (Math.random()*2-1)*spread, dy = (Math.random()*2-1)*spread;
    if (W.pellets > 1){ const a = Math.random()*Math.PI*2, r = Math.sqrt(Math.random())*spread; dx = Math.cos(a)*r; dy = Math.sin(a)*r; }
    const dir = new V3(dx, dy, -1).normalize().applyQuaternion(camera.quaternion);
    const O = (tpOn && tpShotOrigin(dir)) || camera.position;
    ray.set(O, dir); ray.far = 300;
    const hits = ray.intersectObjects(targets, false);
    const end = O.clone().addScaledVector(dir, 160);
    const hh = humanHit(O, dir);
    let enemy = null, part = null, dist = 0;
    if (hh && (!hits.length || hh.t < hits[0].distance)){ enemy = hh.enemy; part = hh.part; dist = hh.t; end.copy(hh.point); }
    else if (hits.length){
      const h = hits[0]; end.copy(h.point); dist = h.distance;
      const en = h.object.userData && h.object.userData.enemy;
      if (en && en.alive){ enemy = en; part = h.object.userData.part; }
      else { spawnPuff(h.point, 0xb9a27c, W.pellets > 1 ? .08 : .16); if (holesLeft-- > 0) impact(h); if (h.object.userData.barrel) hitBarrel(h.object.userData.barrel, W.dmg*.8); }
    }
    if (enemy && enemy.alive){
      const fall = dist <= W.c.range ? 1 : Math.max(.3, 1 - (dist - W.c.range)/(W.c.range*1.5));
      const base = part === 'head' ? W.head : part === 'legs' ? W.legs : W.dmg;
      const rec = hitMap.get(enemy) || { dmg:0, head:false, part:'legs' };
      rec.dmg += base*fall; rec.head = rec.head || part === 'head'; if (part === 'head' || (part === 'body' && rec.part !== 'head')) rec.part = part; hitMap.set(enemy, rec);
      hitFx(enemy, end.clone(), part, dir);
    }
    if (i < 3 && !W.c.supp) spawnTracer(muzzle, end, W.id === 'sniper' ? 0xfff0c8 : 0xffd38a);
    if (i === 0) var firstDir = dir;
  }
  hitMap.forEach((r, e) => damageEnemy(e, r.dmg, r.head, firstDir, undefined, r.part, W.pellets > 1));
  sfx.echo(W.c.supp ? .3 : W.id === 'sniper' ? 1.3 : W.pellets > 1 ? 1.1 : W.id === 'pistol' ? .6 : .85);
  if (Math.random() < (W.pellets > 1 || W.id === 'sniper' ? 1 : .35)) spawnPuff(muzzle, 0xd8cfc0, W.pellets > 1 || W.id === 'sniper' ? .12 : .05, 1.2, .4);
  if (!W.action) spawnShell(V.eject.getWorldPosition(new V3()), W.id);
  const k = W.c.kickV*(.8 + Math.random()*.4)*(1 - adsF*.35);
  P.pitch += k; recoilAcc += k; P.yaw += (Math.random()-.5)*2*W.c.kickH; clampPitch();
  kick = W.vkick*(1 - adsF*.45); kickR = (Math.random()-.5)*W.vkick*.6;
  flashT = W.c.supp ? 0 : W.id === 'smg' ? .03 : .05; shake = W.vkick*.07*(1 - adsF*.5);
  V.flash.rotation.z = Math.random()*Math.PI; V.flash.scale.setScalar(0.8 + Math.random()*0.5);
  muzzleLight.intensity = W.c.supp ? 0 : W.id === 'smg' ? 1.2 : 2.4;
  if (W.action && W.ammo > 0){ actionT = W.actionTime; actionDone = 0; (W.action === 'pump' ? sfx.pump : sfx.bolt)(); }
}
function reload(){
  if (hubMode || katanaOn()) return;
  const W = cur();
  if (state !== 'play' || reloading || W.ammo >= W.c.mag || W.reserve <= 0 || swapT > 0 || meleeT > 0 || aimNade) return;
  reloading = true; actionT = 0; inspectT = 0;
  reloadT = W.shellReload ? .4 : W.c.reload;
  sfx.reloadOut();
}
function selectWeapon(i){
  if (gameMode === 'gungame' && !hubMode && !ggForce) return;
  if (state !== 'play' || i === cw || i < 0 || i >= WEAPONS.length || swapT > 0) return;
  if (!classAllows(i)) return;
  nextW = i; swapT = 0.0001; reloading = false; actionT = 0; inspectT = 0; fireQueued = false; sfx.swap();
}
function cycleWeapon(d){ if (classLocked()){ selectWeapon(cw === startW ? secondaryIndex() : startW); return; } selectWeapon(((cw + d) % WEAPONS.length + WEAPONS.length) % WEAPONS.length); }
function setWeapon(i){
  WEAPONS.forEach((W,j) => { W.vm.model.visible = j === i; });
  cw = i; gunBase.copy(cur().vm.hip).add(new V3(0,-.12,0)); shotsInRow = 0; hud.ammo = -1; hud.wpn = -1; buildPips();
}
function updateWeapon(dt){
  const W = cur(), V = W.vm;
  if (swapT > 0){ const before = swapT; swapT += dt*(nextW === 4 || cw === 4 ? 1.5 : 1); if (before < .22 && swapT >= .22) setWeapon(nextW); if (swapT > .48) swapT = 0; }
  if (reloading){
    reloadT -= dt*(headGear() === 'band' ? 1.25 : 1);
    if (reloadT <= 0){
      if (W.shellReload){
        if (W.ammo < W.c.mag && W.reserve > 0){ W.ammo++; W.reserve--; sfx.shellIn(); }
        if (W.ammo >= W.c.mag || W.reserve <= 0){ reloading = false; actionT = W.actionTime; actionDone = 0; sfx.pump(); } else reloadT = W.shellReload;
      } else {
        reloading = false; const take = Math.min(W.c.mag - W.ammo, W.reserve); W.ammo += take; W.reserve -= take; sfx.reloadIn();
        if (W.action === 'bolt'){ actionT = W.actionTime; actionDone = 0; sfx.bolt(); }
      }
    }
  }
  if (actionT > 0){
    const p = 1 - actionT/W.actionTime;
    if (!actionDone && p > .42){ actionDone = 1; gunScene.updateMatrixWorld(true); spawnShell(V.eject.getWorldPosition(new V3()), W.id); }
    actionT -= dt; if (actionT < 0) actionT = 0;
  }
  if (inspectT > 0) inspectT = Math.max(0, inspectT - dt);
  if (predator){ if (firing) predator.boost = true; }
  else if (rage.t > 0){ if (firing) clawSwipe(); fireQueued = false; }
  else if (katanaOn()){ if (firing && meleeT <= 0) startMelee(); fireQueued = false; ads = false; }
  else if (firing && (W.auto || fireQueued) && canFire()){ shoot(); fireQueued = false; }
  if (!firing && T - lastShot > 0.25) shotsInRow = 0;
}
