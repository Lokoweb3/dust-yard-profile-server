/* ---------- HUD ---------- */
let vigPulse = 0, hitT = 0;
const hud = { score:-1, ammo:-1, hp:-1, left:-1, wave:-1, hint:null };
function showHitmarker(kill, head){ const h = $('hitm'); h.classList.toggle('kill', kill); h.classList.toggle('head', !!head && !kill); tone(kill ? 1900 : 2600, .03, kill ? .08 : .05, 'square'); h.style.opacity = '1'; hitT = kill ? 0.22 : 0.12; }
function feed(text, hs){
  const f = $('feed'); const d = document.createElement('div'); d.textContent = text; if (hs) d.className = 'hs';
  f.prepend(d); while (f.children.length > 5) f.lastChild.remove();
  setTimeout(() => d.classList.add('out'), 2200); setTimeout(() => d.remove(), 2800);
}
function splash(pts, label, hs){
  const el = $('splash'); el.querySelector('b').textContent = '+' + pts; el.querySelector('span').textContent = label;
  el.classList.toggle('hs', !!hs); el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
}
function banner(text){ const b = $('banner'); b.textContent = text; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); }
let toastTimer = 0;
function toast(text, ms=3500){ const t = $('toast'); t.textContent = text; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms); }
const compass = $('compass'), cctx = compass.getContext('2d');
const CDPR = Math.min(2, window.devicePixelRatio || 1);
compass.width = 360*CDPR; compass.height = 40*CDPR;
const LABELS = { 0:'N', 45:'NE', 90:'E', 135:'SE', 180:'S', 225:'SW', 270:'W', 315:'NW' };
function drawCompass(){
  const w = 360, h = 40, ctx = cctx;
  ctx.setTransform(CDPR,0,0,CDPR,0,0); ctx.clearRect(0,0,w,h);
  const heading = ((-P.yaw*180/Math.PI) % 360 + 360) % 360, ppd = w/110;
  ctx.textAlign = 'center'; ctx.font = '600 13px "Barlow Condensed", sans-serif';
  for (let d = Math.floor(heading-55); d <= heading+55; d++){
    if (d % 5) continue;
    const x = w/2 + (d-heading)*ppd, dd = ((d % 360) + 360) % 360;
    ctx.globalAlpha = Math.max(0, 1 - Math.abs(x-w/2)/(w/2)) * .9;
    ctx.fillStyle = '#f4ecdc';
    const big = dd % 15 === 0;
    ctx.fillRect(x-.5, 24, 1, big ? 9 : 5);
    if (LABELS[dd] !== undefined){ ctx.font = (dd%90===0 ? '700 16px' : '600 13px') + ' "Barlow Condensed", sans-serif'; ctx.fillText(LABELS[dd], x, 19); }
    else if (big){ ctx.font = '500 11px "Barlow Condensed", sans-serif'; ctx.fillText(String(dd), x, 18); }
  }
  ctx.globalAlpha = 1;
  for (const e of enemies){
    if (!e.alive || (uavT <= 0 && T - e.lastFire > 1.5)) continue;
    let b = Math.atan2(e.pos.x - P.pos.x, -(e.pos.z - P.pos.z)) * 180/Math.PI;
    let rel = ((b - heading + 540) % 360) - 180;
    rel = Math.max(-54, Math.min(54, rel));
    ctx.fillStyle = '#e5484d'; ctx.globalAlpha = uavT > 0 ? 1 : 1 - (T - e.lastFire)/1.5;
    ctx.beginPath(); const x = w/2 + rel*ppd; ctx.moveTo(x-5,34); ctx.lineTo(x+5,34); ctx.lineTo(x,27); ctx.fill();
  }
  ctx.globalAlpha = 1; ctx.fillStyle = '#f0a93b';
  ctx.beginPath(); ctx.moveTo(w/2-5,0); ctx.lineTo(w/2+5,0); ctx.lineTo(w/2,6); ctx.fill();
}
let pipEls = [];
function buildPips(){
  const W = cur(), box = $('pips'); box.innerHTML = ''; pipEls = [];
  for (let i=0;i<W.c.mag;i++){ const el = document.createElement('i'); if (W.c.mag <= 9) el.className = 'fat'; box.appendChild(el); pipEls.push(el); }
  $('wname').textContent = W.name; hud.res = -1;
  [...$('slots').children].forEach((el,j) => el.classList.toggle('on', j === cw));
}
const mm = $('minimap'), mctx = mm.getContext('2d');
const MMS = isTouch ? 120 : 170; mm.width = MMS*CDPR; mm.height = MMS*CDPR;
function drawMinimap(){
  const S = MMS, c = mctx, sc = S/56;
  c.setTransform(CDPR,0,0,CDPR,0,0); c.clearRect(0,0,S,S);
  c.save(); c.beginPath(); c.roundRect ? c.roundRect(0,0,S,S,8) : c.rect(0,0,S,S); c.clip();
  c.fillStyle = 'rgba(22,20,30,.62)'; c.fillRect(0,0,S,S);
  c.translate(S/2, S/2); c.rotate(P.yaw); c.translate(-P.pos.x*sc, -P.pos.z*sc);
  c.strokeStyle = 'rgba(244,236,220,.25)'; c.lineWidth = 1; c.strokeRect(-ARENA*sc, -ARENA*sc, ARENA*2*sc, ARENA*2*sc);
  c.fillStyle = 'rgba(244,236,220,.28)';
  for (const b of boxes) c.fillRect(b.minX*sc, b.minZ*sc, (b.maxX-b.minX)*sc, (b.maxZ-b.minZ)*sc);
  for (const e of enemies){
    if (!e.alive) continue;
    const fresh = uavT > 0 || T - e.lastFire < 2;
    if (!fresh) continue;
    c.globalAlpha = uavT > 0 ? 1 : 1 - (T - e.lastFire)/2; c.fillStyle = e.type === 'sniper' ? '#ffd36b' : '#e5484d';
    c.beginPath(); c.arc(e.pos.x*sc, e.pos.z*sc, 4, 0, Math.PI*2); c.fill();
  }
  for (const p of pickups){ c.fillStyle = p.kind === 'ammo' ? '#e0b23a' : p.kind === 'health' ? '#ffffff' : '#9fd36a'; c.fillRect(p.g.position.x*sc - 2.5, p.g.position.z*sc - 2.5, 5, 5); }
  c.restore(); c.globalAlpha = 1;
  c.fillStyle = 'rgba(240,169,59,.12)'; c.beginPath(); c.moveTo(S/2,S/2); c.arc(S/2,S/2,S*.7,-Math.PI/2-.55,-Math.PI/2+.55); c.fill();
  c.fillStyle = '#f0a93b'; c.beginPath(); c.moveTo(S/2,S/2-7); c.lineTo(S/2+5,S/2+5); c.lineTo(S/2,S/2+2); c.lineTo(S/2-5,S/2+5); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(244,236,220,.35)'; c.lineWidth = 1; c.beginPath(); c.roundRect ? c.roundRect(.5,.5,S-1,S-1,8) : c.rect(.5,.5,S-1,S-1); c.stroke();
}
function updateHUD(dt){
  if (hud.score !== score){ hud.score = score; $('score').textContent = score.toLocaleString(); }
  const W = cur(), ammo = W.ammo;
  if (hud.res !== W.reserve){ hud.res = W.reserve; $('ammoMax').textContent = '/ ' + W.reserve; $('ammoMax').classList.toggle('low', W.reserve === 0); }
  const eq = fragN + tacType + tacN + padActive;
  if (hud.eq !== eq){ hud.eq = eq; const kf = padActive ? 'R1' : 'G', kt = padActive ? 'L1' : 'Q';
    $('eqFrag').innerHTML = (isTouch ? '' : `<kbd>${kf}</kbd>`) + `Frag ×${fragN}`; $('eqFrag').classList.toggle('empty', fragN === 0);
    $('eqTac').innerHTML = (isTouch ? '' : `<kbd>${kt}</kbd>`) + `${tacType === 'smoke' ? 'Smoke' : 'Flash'} ×${tacN}`; $('eqTac').classList.toggle('empty', tacN === 0); }
  $('flashOv').style.opacity = Math.min(1, flashFx).toFixed(3);
  if (hud.ammo !== ammo){ hud.ammo = ammo; $('ammoNum').textContent = ammo; $('ammoNum').classList.toggle('low', ammo <= Math.max(1, W.c.mag*.27)); pipEls.forEach((el,i) => el.classList.toggle('off', i >= ammo)); }
  const hp = Math.ceil(P.hp);
  if (hud.hp !== hp){ hud.hp = hp; $('hpNum').textContent = hp; $('hpFill').style.width = (hp/maxHP()*100) + '%'; $('hpFill').classList.toggle('low', hp < 35); }
  const alive = enemies.filter(e => e.alive).length, left = toSpawn + alive;
  if (hud.left !== left || hud.wave !== wave){
    hud.left = left; hud.wave = wave; $('waveNum').textContent = `Wave ${wave}`;
    $('leftNum').textContent = waveActive ? (left === 1 ? '1 raider left' : `${left} raiders left`) : 'Next wave incoming';
  }
  const hint = airAim ? (isTouch ? 'Tap Fire to call the airstrike' : 'Fire to call the airstrike on the red marker') : aimNade ? (aimNade === 'frag' ? 'Release to throw. Holding cooks the grenade.' : 'Release to throw') : reloading ? 'Reloading' : (ammo === 0 && W.reserve === 0) ? 'Out of ammo' : scoped && W.scope ? (padActive ? '' : 'Hold Shift to steady your aim') : (ammo <= Math.max(1, W.c.mag*.27) ? (padActive ? 'Press Square to reload' : (isTouch ? 'Tap Reload' : 'Press 0 to reload')) : '');
  if (hud.hint !== hint){ hud.hint = hint; $('reloadHint').textContent = hint; }
  const gap = 7 + currentSpread()*520;
  const cross = $('cross'); cross.style.setProperty('--gap', gap.toFixed(1) + 'px');
  cross.style.opacity = ((adsF > 0.4 && tpBlend < .5) || P.sprinting || swapT > 0) ? '0' : '1';
  $('scope').style.opacity = scoped ? '1' : '0';
  if (hitT > 0){ hitT -= dt; if (hitT <= 0) $('hitm').style.opacity = '0'; }
  vigPulse = Math.max(0, vigPulse - dt*1.4);
  $('vignette').style.opacity = Math.min(1, (1 - P.hp/100)*0.85 + vigPulse).toFixed(3);
  $('lens').style.opacity = (0.55 + adsF*0.45).toFixed(3);
  const sk = streak + '|' + Object.values(sInv).join(',') + '|' + (uavT > 0) + !!drone + !!predator + (rage.t > 0) + !!pounce + stampJobs.length + padActive + STREAKS.map(S => S.k).join();
  if (hud.sk !== sk){
    hud.sk = sk; $('streakNum').textContent = `Streak ${streak}`;
    [...$('streaks').querySelectorAll('span')].forEach((el,i) => { const S = STREAKS[i], n = sInv[S.k];
      if (!S){ el.hidden = true; return; } el.hidden = false;
      const active = (S.k === 'uav' && uavT > 0) || (S.k === 'drone' && drone) || (S.k === 'predator' && predator) || (S.k === 'apex' && rage.t > 0) || (S.k === 'pounce' && !!pounce) || (S.k === 'stampede' && stampJobs.length > 0);
      el.className = n ? 'ready' : active ? 'active' : streak >= needOf(S) ? 'used' : '';
      el.innerHTML = (isTouch ? '' : `<kbd>${padActive ? ['▲','▶','▼'][i] : S.key}</kbd>`) + S.name + `<em>${n ? (n > 1 ? '×' + n : 'Ready') : active ? 'Active' : Math.max(0, needOf(S) - streak) + ' more'}</em>`; });
  }
  if (hud.xp === -1 || hud.lv !== profile.level){
    hud.xp = 0; hud.lv = profile.level;
    $('lvBadge').textContent = profile.level; $('xpFill').style.width = (profile.level >= MAX_LEVEL ? 100 : profile.xp/xpNeed(profile.level)*100) + '%';
    document.body.classList.toggle('elite', perk('elite'));
  }
  const boss = enemies.find(e => e.alive && e.type === 'boss');
  $('bossBar').hidden = !boss;
  if (boss && hud.bossN !== bossName(boss)){ hud.bossN = bossName(boss); $('bossBar').querySelector('b').textContent = hud.bossN; }
  if (boss) $('bossFill').style.width = Math.max(0, boss.hp/boss.maxHp*100) + '%';
  hud.mapT = (hud.mapT || 0) - dt; if (hud.mapT <= 0){ hud.mapT = .05; drawCompass(); drawMinimap(); }
}

