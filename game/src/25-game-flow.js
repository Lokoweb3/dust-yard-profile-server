/* ---------- State changes ---------- */
function show(id){ for (const s of ['menu','pausePanel','overPanel','gunsmith','settings','account','classPanel','opPanel','coopPanel']) $(s).hidden = s !== id; $('overlay').hidden = !id;
  const chip = $('acctChip'); if (chip){ chip.hidden = !['menu','pausePanel','overPanel'].includes(id); if (!chip.hidden && typeof renderAcctChip === 'function') renderAcctChip(); } }
let gsReturn = 'menu';
function openGunsmith(from){ gsReturn = from; renderGunsmith(); show('gunsmith'); }
function renderGunsmith(){
  const list = $('gsList'); list.innerHTML = '';
  WEAPONS.forEach(W => {
    const row = document.createElement('div'); row.className = 'gsRow';
    row.innerHTML = `<div class="gsName"><b>${W.name}</b><span>${W.kills} ${W.kills === 1 ? 'kill' : 'kills'}, ${W.hs || 0} headshots</span></div>`;
    const opts = document.createElement('div'); opts.className = 'gsOpts';
    ATT.forEach(A => {
      const locked = W.kills < A.unlock, on = !!W.att[A.k];
      const b = document.createElement('button'); b.className = 'gsBtn' + (on ? ' on' : '') + (locked ? ' locked' : '') + (A.skull ? ' skull' : ''); b.disabled = locked;
      b.innerHTML = `<b>${A.name}</b><span>${locked ? `Unlocks at ${A.unlock} kills` : on ? 'Equipped' : A.desc}</span>`;
      b.addEventListener('click', () => { W.att[A.k] = !W.att[A.k]; applyAtt(W); saveGuns(); renderGunsmith(); hud.ammo = -1; buildPips(); });
      opts.appendChild(b);
    });
    const camoRow = document.createElement('div'); camoRow.className = 'gsCamo';
    [{ k:null, name:'No camo', need:0 }, ...CAMOS].forEach(C => {
      const locked = C.item ? !ownedItems.has(C.item) : C.perk ? !(holder.perks && holder.perks[C.perk]) : (W.hs || 0) < C.need, on = (W.camo || null) === C.k;
      const b = document.createElement('button'); b.className = 'gsBtn camo-' + (C.k || 'none') + (on ? ' on' : '') + (locked ? ' locked' : ''); b.disabled = locked;
      b.innerHTML = `<b>${C.name}</b><span>${locked ? (C.item ? 'Own the NFT' : C.perk ? `Verified ${C.desc}` : `${W.hs || 0} / ${C.need} headshots`) : on ? 'Equipped' : C.desc || (C.k ? 'Unlocked' : 'Default finish')}</span>`;
      b.addEventListener('click', () => { W.camo = C.k; applyCamo(W); saveGuns(); renderGunsmith(); });
      camoRow.appendChild(b);
    });
    opts.appendChild(camoRow);
    row.appendChild(opts); list.appendChild(row);
  });
}
function bestText(){
  try { renderProfile(); } catch(e){}
  try { const b = JSON.parse(store.get('dustyard-best') || 'null'); return b ? `Best score ${b.score.toLocaleString()}, reached wave ${b.wave}` : ''; } catch(e){ return ''; }
}
function clearEnemies(){
  for (const e of enemies){ scene.remove(e.g); if (e.glint) scene.remove(e.glint); if (e.callSpr) scene.remove(e.callSpr); e.mats.forEach(m=>m.dispose()); } enemies = [];
  for (const j of airJobs) scene.remove(j.jet); airJobs.length = 0; if (drone){ scene.remove(drone.g); drone = null; }
  for (const d of debris) scene.remove(d.obj); debris.length = 0;
  for (const sh of shells) gunScene.remove(sh.obj); shells.length = 0;
  for (const h of holes) scene.remove(h); holes.length = 0;
  for (const d of drops) scene.remove(d.m); drops.length = 0; pushT = 0; pushCd = 14;
  for (const r of rockets) scene.remove(r.g); rockets.length = 0;
  for (const st of shogunStars) scene.remove(st.m); shogunStars.length = 0; clearBossFx();
  for (const n of nades) scene.remove(n.mesh); nades.length = 0;
  for (const sm of smokes) sm.sprites.forEach(sp => scene.remove(sp)); smokes.length = 0;
  for (const p of pickups) scene.remove(p.g); pickups.length = 0;
}
function resetGame(){
  clearEnemies(); mantle = null; sprintRamp = 0; jumpBuf = 0;
  Object.assign(P, { yaw:0, pitch:0, onGround:true, hp:maxHP(), lastHit:-99, moving:false, sprinting:false, crouch:false, slideT:0, ladder:null });
  camH = 1.62; landDip = 0; rollZ = 0; shake = 0; strafeF = 0; mdx = mdy = 0; sway.x = sway.y = 0; slideF = 0; $('tCrouch').classList.remove('on');
  P.pos.set(0,0,36); P.vel.set(0,0,0);
  WEAPONS.forEach(W => { applyAtt(W); W.ammo = W.c.mag; W.reserve = W.res; });
  streak = 0; uavT = 0; airAim = false; airMark.visible = false; sInv.uav = sInv.air = sInv.drone = sInv.care = sInv.predator = sInv.pounce = sInv.stampede = sInv.apex = 0; rage.t = 0; rageFx = 0; apexK = 0; pounce = null; clearStampedes(); endPredator(false); for (const c of careCrates) scene.remove(c.g); careCrates.length = 0;
  fragN = (perk('frag3') ? 3 : 2) + (backGear() === 'pack' ? 1 : 0); tacN = (perk('tac3') ? 3 : 2) + (backGear() === 'pack' ? 1 : 0); gameXP = 0; jet.on = false; jet.boost = true; gearAb.t = 0; gearAb.cd = 0;
  if (perk('uavstart')) sInv.uav = 1; if (perk('airstart')) sInv.air = 1;
  WEAPONS.forEach(W => { const m = (perk('reserve') ? 1.3 : 1)*(backGear() === 'pack' ? 1.25 : 1); W.res = Math.round(RES[W.id][0]*m); W.maxRes = Math.round(RES[W.id][1]*m); W.reserve = W.res; applyCamo(W); }); aimNade = null; throwT = 0; meleeT = 0; flashFx = 0; katanaG.visible = false; slashArc.visible = false; knifeG.visible = false; arcLine.visible = arcRing.visible = false; reloading = false; shotsInRow = 0; recoilAcc = 0; kick = 0; kickR = 0; firing = false; ads = false; $('tAim').classList.remove('on');
  actionT = 0; swapT = 0; inspectT = 0; fireQueued = false; breath = 4; lastShot = -9; setWeapon(startW); gunBase.copy(cur().vm.hip);
  wave = 0; toSpawn = 0; waveActive = false; intermission = 0; score = 0; kills = 0; headshots = 0;
  for (const k in hud) hud[k] = -1; $('feed').innerHTML = ''; $('dmgLayer').innerHTML = '';
  camera.fov = 75; camera.updateProjectionMatrix();
}
function startGame(fromPad){
  if (padClicking) fromPad = true;
  leaveHub(); removePet(); tutStop(); applyClass();
  if (fromPad !== true) setPadActive(false);
  setMap(selectedMap); initAudio(); resetGame(); headWait = 0; preloadHeads(selectedMap);
  state = 'play'; show(null); $('hud').hidden = false; $('touch').hidden = !isTouch;
  tdmStop(); if (gameMode === 'tdm'){ wave = 1; tdmStart(); } else if (!(coop && coop.guest)) startWave(); summonPet(); matchStart(); $('ggLine').textContent = ''; if (gameMode === 'gungame') ggStart(); if (pet) setTimeout(() => petSay('LFG'), 1200); if (fromPad !== true) requestLock();
  toast(isTouch ? 'Tap Swap or the weapon bar to change guns' : padActive ? 'Press Triangle to switch weapons' : 'Press 1 to 6 (or scroll) to switch weapons', 5000);
}
function pause(){
  if (state !== 'play') return;
  state = 'paused'; firing = false; ads = false; for (const k in keys) keys[k] = false;
  $('pauseStat').textContent = hubMode ? 'Degen Market' : `Wave ${wave}, ${score.toLocaleString()} points`;
  show('pausePanel'); $('touch').hidden = true;
  if (document.pointerLockElement) document.exitPointerLock();
  setTimeout(() => { if (state === 'paused') maybePrompt(); }, 400);
}
function resume(fromPad){ if (padClicking) fromPad = true; state = 'play'; show(null); $('touch').hidden = !isTouch; initAudio(); if (fromPad !== true){ setPadActive(false); requestLock(); } }
function toMenu(){ if (typeof coopLeave === 'function') coopLeave(); leaveHub(); removePet(); tdmStop(); tutStop(); endPredator(false); $('ggLine').textContent = ''; try { loadDaily(); renderDailyBox(); } catch(e){} state = 'menu'; clearEnemies(); $('hud').hidden = true; $('touch').hidden = true; $('bestLine').textContent = bestText(); show('menu'); setTimeout(() => maybePrompt(), 600); }
