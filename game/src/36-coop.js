/* ---------- Co-op: 2 to 4 players against raider waves ---------- */
// The host runs the raiders and the waves; everyone shares state through live presence.
// Guests send the damage they deal; the host sends raider positions, health and the damage each guest takes.
const COOP_MAX = 4, COOP_TYPES = ['grunt','armored','rusher','sniper','boss'];
let coop = null, coopSwap = null, coopLobby = null, coopLobbyList = [];
const coopCodeOk = c => /^[a-z0-9]{4,6}$/.test(c);
function coopName(){ return String(callsign() || 'Degen').slice(0, 16); }
async function coopNet(){
  if (!net.room && window.claude && window.claude.use){ try { net.room = await window.claude.use('room'); } catch(e){} }
  return net.room;
}
function coopPetInfo(){ return pet && petCfg ? { name:String(petCfg.name || '').slice(0, 24), mint:String(petCfg.mint || '').slice(0, 44), image:String(petCfg.image || '').slice(0, 200) } : null; }
// ---- lobby list of open squads ----
async function coopWatchLobby(){
  if (coopLobby) return;
  const room = await coopNet(); if (!room) return;
  try {
    coopLobby = await room.join('dy-coop-lobby');
    coopLobby.unsub = coopLobby.onPeers(ch => {
      coopLobbyList = ch.peers.filter(p => !p.isMe && p.presence && coopCodeOk(p.presence.code || '') && p.presence.st === 'lobby').map(p => p.presence);
      if (!$('coopPanel').hidden && !coop) coopRenderIfChanged();
    }, () => {});
  } catch(e){ coopLobby = null; }
}
function coopLeaveLobby(){ if (coopLobby){ try { coopLobby.unsub && coopLobby.unsub(); coopLobby.leave(); } catch(e){} coopLobby = null; } }
// ---- squad room ----
async function coopJoin(code, host){
  const room = await coopNet(); if (!room){ toast('Co-op needs a live connection. Play on your Railway site, or sign in to claude.ai.', 4000); return; }
  if (coop) coopLeave();
  coop = { code, host, guest:!host, started:false, mates:new Map(), me:null, sendT:0, wave:0, st:'lobby', hostPeer:null, ens:new Map(), dmg:new Map(), hurtSeen:0,
    revT:0, revPeer:null, revDone:0, nid:0, over:false, map:selectedMap, joinedAt:Date.now() };
  try {
    coop.r = await room.join('dy-coop-' + code);
    coop.unsub = coop.r.onPeers(coopPeers, () => {});
  } catch(e){ toast('Could not join that squad.', 3000); coop = null; return; }
  if (host) coopWatchLobby();
  coopSend(true); renderCoop();
}
function coopLeave(){
  if (!coop) return;
  try { coop.unsub && coop.unsub(); coop.r && coop.r.leave(); } catch(e){}
  for (const m of coop.mates.values()) coopRemoveMate(m);
  if (coopLobby && coop.host){ try { coopLobby.presence({ code:null, st:null, name:null, n:null, map:null }); } catch(e){} }
  coop = null; P.down = false; P.dead = false; $('coopPrompt').hidden = true; $('coopStatus').textContent = '';
}
function coopPeers(ch){
  if (!coop) return;
  const seen = new Set();
  for (const p of ch.peers){
    if (p.isMe){ coop.me = p.peer; continue; }
    const pr = p.presence || {}; if (!pr.name) continue;
    seen.add(p.peer);
    let m = coop.mates.get(p.peer);
    if (!m){ if (coop.mates.size >= COOP_MAX - 1) continue; m = { peer:p.peer, pos:new V3(+pr.x || 0, +pr.y || 0, +pr.z || 0), yaw:0, dmgSeen:new Map(), hurt:0, sh:pr.sh || 0, o:null, opk:'' }; coop.mates.set(p.peer, m); if (coop.started) feed(`${String(pr.name).slice(0, 16)} joined`); }
    m.pr = pr; m.name = String(pr.name).slice(0, 16);
    if (pr.host) coop.hostPeer = p.peer;
  }
  for (const [id, m] of coop.mates) if (!seen.has(id)){
    coop.mates.delete(id); coopRemoveMate(m);
    if (id === coop.hostPeer && coop.guest){ coop.hostPeer = null; if (coop.started && state === 'play'){ toast('The host left, so the match ended.', 4000); coopEnd(); } }
    else if (coop.started) feed(`${m.name} left`);
  }
  if (!$('coopPanel').hidden) coopRenderIfChanged();
}
function coopRemoveMate(m){ if (m.o) scene.remove(m.o.root); if (m.tag) scene.remove(m.tag); if (m.pet) scene.remove(m.pet.g); m.o = null; }
const coopHostPr = () => { const h = coop && coop.hostPeer && coop.mates.get(coop.hostPeer); return h ? h.pr : null; };
// ---- what I share ----
function coopSend(force){
  if (!coop || !coop.r) return;
  const W = cur(), pr = { name:coopName(), col:myColor, op:opMine(), pet:coopPetInfo(), host:coop.host ? 1 : 0,
    x:+P.pos.x.toFixed(2), y:+P.pos.y.toFixed(2), z:+P.pos.z.toFixed(2), yaw:+P.yaw.toFixed(2), pt:+P.pitch.toFixed(2),
    cr:P.slideT > 0 ? 2 : P.crouch ? 1 : 0, sp:P.sprinting ? 1 : 0, jt:jet.on ? 1 : 0, roar:spec.roarN, hw:spec.howlT > 0 ? 1 : 0, w:W ? W.id : 'rifle', sh:coop.shots || 0, hp:Math.round(P.hp), dn:P.dead ? 2 : P.down ? 1 : 0,
    rev:coop.revPeer ? [coop.revPeer, +coop.revT.toFixed(2)] : null, sc:score, k:kills };
  if (coop.guest){ const d = []; for (const [nid, v] of coop.dmg){ const e = coop.ens.get(nid); if (e && e.alive !== undefined) d.push([nid, Math.round(v)]); if (d.length >= 24) break; } pr.dmg = d; }
  if (coop.host){
    const pl = [coop.me || ''], en = [];
    for (const m of coop.mates.values()) pl.push(m.peer);
    for (const e of enemies){ if (!e.nid || e.tut) continue; if (en.length >= 18) break;
      const t = e.ctgt === undefined ? 0 : Math.max(0, pl.indexOf(e.ctgt === 'me' ? coop.me : e.ctgt));
      en.push([e.nid, COOP_TYPES.indexOf(e.type), Math.round(e.pos.x*10), Math.round(e.pos.z*10), Math.round((e.y || 0)*10), Math.round((e.face || 0)*100),
        Math.max(0, Math.round(e.alive ? e.hp : 0)), (e.sees ? 1 : 0) | (e.crouching ? 2 : 0) | (e.shogun ? 4 : 0) | (e.custom ? (CUSTOM_BOSS.indexOf(e.custom) + 1) << 3 : 0) | ((e.actCode || 0) << 6), (e.shotN || 0) % 1000, t]); }
    pr.co = { st:coop.st, map:selectedMap,   // the host's games always start on selectedMap (currentMap still shows the menu backdrop when the match starts)
      wave, wa:waveActive ? 1 : 0, en, pl,
      hurt:[...coop.mates.values()].map(m => [m.peer, Math.round(m.hurt)]), ms:matchHostSid() };
  }
  coop.r.presence(pr).catch(() => {});
  if (coop.host && coopLobby) coopLobby.presence({ code:coop.code, st:coop.st, name:coopName(), n:coop.mates.size + 1, map:selectedMap }).catch(() => {});
}
// ---- starting and ending ----
function coopStart(){
  if (!coop || !coop.host) return;
  coop.st = 'play'; coop.started = true; coop.over = false; coopSend(true); coopBegin();
}
function coopBegin(){
  coop.started = true; coop.over = false; coop.ens.clear(); coop.dmg.clear(); coop.hurtSeen = 0; coop.wave = 0; coop.shots = 0;
  for (const m of coop.mates.values()){ m.dmgSeen.clear(); m.hurt = 0; }
  P.down = false; P.dead = false;
  gameMode = 'coop'; startGame(true);
  // spread the squad out so nobody spawns inside a teammate
  const ids = [coop.me, ...coop.mates.keys()].filter(Boolean).sort(), i = Math.max(0, ids.indexOf(coop.me));
  if (i > 0){ P.pos.x += (i % 2 ? 1 : -1)*Math.ceil(i/2)*2.6; collide(P.pos, P.r, P.pos.y); }
  const n = coop.mates.size + 1;
  toast(`Co-op: ${n} player${n === 1 ? '' : 's'}. Hold the line together. Revive downed teammates by holding ${padActive ? 'Square' : isTouch ? 'the Revive button' : 'E'} next to them.`, 6000);
}
function coopEnd(){
  if (!coop || coop.over) return;
  coop.over = true;
  if (coop.host){ coop.st = 'over'; coopSend(true); }
  for (const m of coop.mates.values()) coopRemoveMate(m);
  if (state === 'play' || state === 'paused') gameOver();
  coop.started = false;
  if (coop.host) setTimeout(() => { if (coop && coop.host){ coop.st = 'lobby'; coopSend(true); } }, 1500);
}
// ---- host: raiders hunt whichever player is closest ----
const _sv = new V3();
function coopTargets(){
  const t = []; if (!P.down && !P.dead) t.push({ id:'me', pos:P.pos });
  for (const m of coop.mates.values()) if (m.pr && !m.pr.dn) t.push({ id:m.peer, pos:m.pos, m });
  return t;
}
function coopEnemy(e, dt){
  if (e.remote){ updateEnemy(e, dt); return; }
  if (!e.alive || e.tut){ updateEnemy(e, dt); return; }
  e.ctT = (e.ctT || 0) - dt;
  if (e.ctT <= 0 || e.ctgt === undefined){
    e.ctT = 1 + Math.random(); let best = null, bd = 1e9;
    for (const t of coopTargets()){ const d = Math.hypot(t.pos.x - e.pos.x, t.pos.z - e.pos.z); if (d < bd){ bd = d; best = t; } }
    e.ctgt = best ? best.id : 'me';
  }
  const m = e.ctgt !== 'me' && coop.mates.get(e.ctgt);
  if (!m || !m.pr){ e.ctgt = 'me'; updateEnemy(e, dt); return; }
  const s = { x:P.pos.x, y:P.pos.y, z:P.pos.z, mv:P.moving, sp:P.sprinting, cr:P.crouch, sl:P.slideT, g:P.onGround };
  P.pos.set(m.pos.x, m.pos.y, m.pos.z); P.moving = m.spd > 1; P.sprinting = !!m.pr.sp; P.crouch = m.pr.cr === 1; P.slideT = m.pr.cr === 2 ? .3 : 0; P.onGround = true;
  coopSwap = m;
  try { updateEnemy(e, dt); } finally {
    coopSwap = null; P.pos.set(s.x, s.y, s.z); P.moving = s.mv; P.sprinting = s.sp; P.crouch = s.cr; P.slideT = s.sl; P.onGround = s.g;
  }
}
function coopHurt(d){ if (coopSwap) coopSwap.hurt += d; }
// ---- guest: raiders mirror the host ----
function coopApplyHost(){
  const pr = coopHostPr(); if (!pr || !pr.co) return;
  const co = pr.co;
  if (co.st === 'over' && coop.started && !coop.over){ coopEnd(); return; }
  if (typeof co.ms === 'string' && /^[0-9a-f]{16}$/.test(co.ms)) coop.hostSid = co.ms;
  if (typeof co.wave === 'number' && co.wave !== wave){
    if (co.wave > wave && wave > 0){ for (let w = wave; w < co.wave; w++) matchWave(w); const bonus = wave*100; score += bonus; feed(`Wave cleared +${bonus}`, true); giveXP(250 + wave*50); fragN = Math.min(nadeCap(), fragN + 1); tacN = Math.min(nadeCap(), tacN + 1); }
    wave = co.wave; if (wave > 0) banner(`Wave ${wave}`);
  }
  waveActive = !!co.wa;
  const pl = Array.isArray(co.pl) ? co.pl : [], seen = new Set();
  for (const row of Array.isArray(co.en) ? co.en.slice(0, 24) : []){
    if (!Array.isArray(row) || row.length < 10) continue;
    const [nid, ti, x, z, y, face, hp, fl, shn, tg] = row.map(Number), type = COOP_TYPES[ti] || 'grunt';
    if (!(nid > 0)) continue; seen.add(nid);
    let e = coop.ens.get(nid);
    if (!e){
      if (hp <= 0) continue;
      const ck = type === 'boss' ? CUSTOM_BOSS[((fl >> 3) & 7) - 1] : null;
      if (ck){ e = makeCustomBoss(ck, x/10, z/10); e.y = y/10; e.remote = true; e.nid = nid; e.shotN = shn; if (ck === 'gunship') supplyRockets(); banner(BOSS_NAMES[ck]); toast(BOSS_TIPS[ck], 6000); }
      else {
      nextEnemyType = type; nextEnemySeed = nid;
      e = makeEnemy(x/10, z/10); nextEnemyType = null;
      e.type = type; e.y = y/10; applyType(e); e.remote = true; e.nid = nid; e.shotN = shn;
      }
      if (type === 'boss' && !ck){ e.maxHp = e.hp; e.mg = 'idle'; e.mgT = 2; e.spinV = 0; if (fl & 4) makeShogun(e); else makeMinigun(e); }
      e.face = face/100; enemies.push(e); coop.ens.set(nid, e);
    }
    e.net = { x:x/10, z:z/10, y:y/10, face:face/100, sees:!!(fl & 1), cr:!!(fl & 2), act:(fl >> 6) & 3 };
    if (e.alive){
      e.hp = Math.min(e.hp, hp);
      if (hp <= 0) coopSilentKill(e);
      else if (shn !== e.shotN){ e.shotN = shn; coopRemoteShot(e, pl[tg]); }
    }
  }
  for (const [nid, e] of coop.ens) if (!seen.has(nid)){ if (e.alive) coopSilentKill(e); coop.ens.delete(nid); coop.dmg.delete(nid); }
  // damage the host says I took
  const mine = (Array.isArray(co.hurt) ? co.hurt : []).find(h => Array.isArray(h) && h[0] === coop.me);
  if (mine){ const tot = +mine[1] || 0; if (tot > coop.hurtSeen){ const d = tot - coop.hurtSeen; coop.hurtSeen = tot; coopTakeHit(d); } }
}
function coopTakeHit(d){
  let src = null, bd = 1e9; for (const e of enemies) if (e.alive){ const dd = e.pos.distanceTo(P.pos); if (dd < bd){ bd = dd; src = e.pos; } }
  damagePlayer(d, src || P.pos.clone().add(new V3(0, 0, -1)));
}
function coopRemoteShot(e, tgtPeer){
  if (!e.muzzle) return;
  const muzzle = e.muzzle.getWorldPosition(new V3());
  let to = null;
  if (tgtPeer === coop.me) to = new V3(P.pos.x, P.pos.y + camH - .35, P.pos.z);
  else { const m = coop.mates.get(tgtPeer); if (m) to = new V3(m.pos.x, m.pos.y + 1.3, m.pos.z); }
  if (!to) return;
  to.x += (Math.random() - .5)*1.2; to.y += (Math.random() - .5)*.6; to.z += (Math.random() - .5)*1.2;
  spawnTracer(muzzle, to, e.type === 'sniper' ? 0xfff0c8 : 0xffa65c); spawnFlashSprite(muzzle);
  const dist = e.pos.distanceTo(P.pos); if (e.type === 'sniper') sfx.esniper(dist); else if (e.type === 'boss') sfx.minigun(dist); else sfx.enemy(dist);
  e.lastFire = T; e.recoil = .06;
}
function coopRemoteEnemy(e, dt){
  const n = e.net; if (!n) return;
  const k = 1 - Math.exp(-dt*10), ox = e.pos.x, oz = e.pos.z;
  e.pos.x += (n.x - ox)*k; e.pos.z += (n.z - oz)*k; e.y = n.y;
  if (Math.hypot(n.x - e.pos.x, n.z - e.pos.z) > 6){ e.pos.x = n.x; e.pos.z = n.z; }
  e.spd += (Math.hypot(e.pos.x - ox, e.pos.z - oz)/Math.max(dt, 1e-3) - e.spd)*Math.min(1, dt*6);
  e.face = angleLerp(e.face, n.face, Math.min(1, dt*10)); e.sees = n.sees; e.crouching = n.cr;
  if (n.sees){ const d = Math.hypot(P.pos.x - e.pos.x, P.pos.z - e.pos.z); e.aimPitch = Math.atan2((P.pos.y + camH - .3) - 1.45, d); }
  e.g.position.set(e.pos.x, e.y || 0, e.pos.z); e.g.rotation.y = e.face;
  if (e.model) poseHuman(e, dt, n.sees); else poseEnemy(e, dt);
  e.flash -= dt; const fl = e.flash > 0 ? .6 : 0; e.mats.forEach(m => m.emissive && m.emissive.setScalar(fl));
}
function coopNoteHit(e, dmg){ if (e.nid) coop.dmg.set(e.nid, (coop.dmg.get(e.nid) || 0) + dmg); }
function coopSilentKill(e, dir){
  if (!e.alive) return;
  e.alive = false; e.hp = 0; e.dieT = 0; e.deathType = 'fall';
  e.fallDir = Math.random() < .7 ? 1 : -1; e.fallSide = (Math.random() - .5)*.6;
  if (e.model && e.rifle){ const r = e.rifle; scene.attach(r); debris.push({ obj:r, vel:new V3((Math.random() - .5)*2, 1.5, (Math.random() - .5)*2), spin:new V3((Math.random() - .5)*6, 0, (Math.random() - .5)*6), life:2.9 }); }
}
// host: damage that guests dealt
function coopApplyGuestDamage(){
  for (const m of coop.mates.values()){
    const list = m.pr && Array.isArray(m.pr.dmg) ? m.pr.dmg : [];
    for (const row of list){
      if (!Array.isArray(row)) continue;
      const nid = +row[0], tot = Math.min(1e6, +row[1] || 0), prev = m.dmgSeen.get(nid) || 0;
      if (!(tot > prev)) continue;
      m.dmgSeen.set(nid, tot);
      const e = enemies.find(x => x.nid === nid); if (!e || !e.alive) continue;
      e.hp -= tot - prev; e.flash = .08; e.flinch = .18; e.sees = true; e.reaction = Math.min(e.reaction, .25);
      if (e.hp <= 0){ coopSilentKill(e); feed(`${m.name}: ${e.type === 'boss' ? 'boss down!' : 'raider down'}`, e.type === 'boss'); if (e.type === 'boss') banner('Boss down'); }
    }
  }
}
// ---- downed, revive, bleed out ----
function coopAliveMates(){ let n = 0; if (coop) for (const m of coop.mates.values()) if (m.pr && !m.pr.dn) n++; return n; }
function coopDown(){
  P.down = true; P.dead = false; P.hp = 0; P.bleed = 30; firing = false; ads = false; P.crouch = true; streak = 0;
  toast('You are down. A teammate can revive you before you bleed out.', 3500); sfx.hurt();
  coopSend(true);
}
function coopRespawn(){
  P.down = false; P.dead = false; P.hp = maxHP(); P.crouch = false;
  let best = null; for (const m of coop.mates.values()) if (m.pr && !m.pr.dn){ best = m; break; }
  if (best){ P.pos.set(best.pos.x + 1.5, best.pos.y, best.pos.z + 1.5); collide(P.pos, P.r, P.pos.y); }
  feed('Back in the fight', true);
}
function coopTick(dt){
  if (!coop || !coop.started || coop.over) return;
  if (coop.guest) coopApplyHost(); else coopApplyGuestDamage();
  if (!coop || !coop.started || coop.over) return;
  // wave change brings the fallen back
  if (coop.wave !== wave){ if ((P.down || P.dead) && coop.wave > 0) coopRespawn(); coop.wave = wave; }
  // bleeding out
  if (P.down && !P.dead){
    P.bleed -= dt; firing = false; ads = false;
    for (const m of coop.mates.values()){ const r = m.pr && m.pr.rev; if (Array.isArray(r) && r[0] === coop.me && +r[1] >= 3){ P.down = false; P.hp = 50; P.crouch = false; feed(`${m.name} revived you`, true); sfx.levelUp(); break; } }
    if (P.down && P.bleed <= 0){ P.dead = true; toast('You bled out. You will be back when this wave ends.', 3500); }
  }
  // reviving a teammate
  let near = null;
  if (!P.down && !P.dead) for (const m of coop.mates.values()) if (m.pr && m.pr.dn === 1 && m.pos.distanceTo(P.pos) < 2.3){ near = m; break; }
  const holding = near && (keys.KeyE || coop.padRev || coop.touchRev);
  if (holding){ coop.revPeer = near.peer; coop.revT = Math.min(3, coop.revT + dt); if (coop.revT >= 3 && !coop.revDone){ coop.revDone = 1; score += 100; giveXP(150); feed(`Revived ${near.name} +100`, true); } }
  else if (coop.revDone > 0){ coop.revDone += dt; if (coop.revDone > 1.2){ coop.revDone = 0; coop.revPeer = null; coop.revT = 0; } }
  else { coop.revPeer = null; coop.revT = 0; }
  const pe = $('coopPrompt');
  pe.hidden = !near; if (near) pe.textContent = holding ? `Reviving ${near.name}... ${Math.round(coop.revT/3*100)}%` : `Hold ${padActive ? 'Square' : isTouch ? 'Revive' : 'E'} to revive ${near.name}`;
  $('tRevive').hidden = !(isTouch && near);
  // status line
  const sq = [`You ${score.toLocaleString()}`].concat([...coop.mates.values()].map(m => `${m.name} ${(+m.pr.sc || 0).toLocaleString()}${m.pr.dn === 1 ? ' (down)' : m.pr.dn === 2 ? ' (out)' : ''}`));
  $('coopStatus').textContent = (P.dead ? 'Out until the wave ends · ' : P.down ? `DOWN · bleeding out ${Math.ceil(P.bleed)}s · ` : '') + sq.join(' · ');
  // team wiped?
  if (coop.host && (P.down || P.dead) && coopAliveMates() === 0){ coop.wipeT = (coop.wipeT || 0) + dt; if (coop.wipeT > 1.5){ coop.wipeT = 0; coopEnd(); return; } } else coop.wipeT = 0;
  // teammates
  for (const m of coop.mates.values()){ coopDrawMate(m, dt); specialFromMate(m); }
  coop.sendT -= dt; if (coop.sendT <= 0){ coop.sendT = .1; coopSend(); }
}
function coopDrawMate(m, dt){
  const pr = m.pr; if (!pr) return;
  const opk = JSON.stringify(sanitizeOp(pr.op));
  if ((!m.o || m.opk !== opk) && SOLDIER){
    coopRemoveMate(m); m.opk = opk; m.o = buildOperator(sanitizeOp(pr.op)); scene.add(m.o.root);
    m.tag = nameTag(m.name, Number(pr.col) || 0x2f6bff, false, '', ''); scene.add(m.tag);
    if (pr.pet && pr.pet.name){ try { m.pet = otherPet(pr.pet); scene.add(m.pet.g); } catch(e){ m.pet = null; } }
  }
  const ox = m.pos.x, oz = m.pos.z, k = 1 - Math.exp(-dt*12);
  m.pos.x += ((+pr.x || 0) - m.pos.x)*k; m.pos.y += ((+pr.y || 0) - m.pos.y)*k; m.pos.z += ((+pr.z || 0) - m.pos.z)*k;
  if (Math.hypot((+pr.x || 0) - m.pos.x, (+pr.z || 0) - m.pos.z) > 8) m.pos.set(+pr.x || 0, +pr.y || 0, +pr.z || 0);
  m.spd = (m.spd || 0) + (Math.hypot(m.pos.x - ox, m.pos.z - oz)/Math.max(dt, 1e-3) - (m.spd || 0))*Math.min(1, dt*6);
  m.yaw = angleLerp(m.yaw, +pr.yaw || 0, Math.min(1, dt*14));
  if (!m.o) return;
  const o = m.o; o.root.visible = pr.dn !== 2 && (m.pos.distanceTo(P.pos) > .9 || tpBlend > .5); opJetFlames(o, !!pr.jt); opSetGun(o, ['rifle','smg','shotgun','sniper','pistol','launcher'].includes(pr.w) ? pr.w : 'rifle');
  o.root.position.copy(m.pos); o.root.rotation.y = m.yaw + Math.PI;
  if ((pr.sh || 0) !== m.sh){ m.sh = pr.sh || 0; m.flashT = .05; o.recoil = Math.min(.12, o.recoil + .05);
    const mz = o.gun && o.gun.userData.mz.getWorldPosition(new V3()), dir = new V3(0, 0, -1).applyEuler(new THREE.Euler(+pr.pt || 0, m.yaw, 0, 'YXZ'));
    if (mz){ spawnTracer(mz, mz.clone().addScaledVector(dir, 40), 0xffd38a); sfx.enemy(m.pos.distanceTo(P.pos) + 6); } }
  m.flashT = Math.max(0, (m.flashT || 0) - dt);
  poseOp(o, dt, { spd:m.spd, crouch:pr.dn === 1 ? 1 : pr.cr === 2 ? 1 : pr.cr === 1 ? .75 : 0, pitch:+pr.pt || 0, aim:!pr.sp && !pr.dn, flash:m.flashT });
  if (m.tag){ m.tag.position.set(m.pos.x, m.pos.y + (pr.dn === 1 ? 1.4 : 2.25), m.pos.z); m.tag.material.color.set(pr.dn === 1 ? 0xff5a4a : 0xffffff); }
  if (m.pet){ const pg = m.pet.g, ry = m.yaw, tx = m.pos.x + Math.cos(ry)*1.1 - Math.sin(ry)*.4, tz = m.pos.z - Math.sin(ry)*1.1 - Math.cos(ry)*.4;
    const px = pg.position.x, pz = pg.position.z; pg.position.x += (tx - px)*Math.min(1, dt*3); pg.position.z += (tz - pz)*Math.min(1, dt*3); pg.position.y = m.pos.y;
    const pv = Math.hypot(pg.position.x - px, pg.position.z - pz)/Math.max(dt, 1e-3);
    pg.rotation.y = angleLerp(pg.rotation.y, pv > .4 ? Math.atan2(pg.position.x - px, pg.position.z - pz) : ry, Math.min(1, dt*6)); animatePet(m.pet, pv, dt); }
}
// ---- the Co-op screen ----
// the live connection reports peers about 10 times a second; only redraw when something visible changed
let coopSig = '';
function coopRenderIfChanged(){
  const h = coop && coopHostPr();
  const sig = JSON.stringify(coop ? [coop.code, coop.host, [...coop.mates.values()].map(m => [m.name, !!(m.pr && m.pr.host)]), h && h.co ? [h.co.st, h.co.map] : null, selectedMap]
    : coopLobbyList.map(l => [l.code, l.name, l.n, l.map]));
  if (sig !== coopSig) renderCoop();
}
function openCoop(){ show('coopPanel'); coopWatchLobby(); renderCoop(); }
function renderCoop(){
  const box = $('coopBody'), typed = $('coopCode') ? $('coopCode').value : '', hadFocus = document.activeElement && document.activeElement.id === 'coopCode';
  box.innerHTML = '';
  coopSig = '';
  setTimeout(() => { const h = coop && coopHostPr(); coopSig = JSON.stringify(coop ? [coop.code, coop.host, [...coop.mates.values()].map(m => [m.name, !!(m.pr && m.pr.host)]), h && h.co ? [h.co.st, h.co.map] : null, selectedMap] : coopLobbyList.map(l => [l.code, l.name, l.n, l.map])); }, 0);
  const p = (t, c) => { const e = document.createElement('p'); e.className = c || 'stat clsNote'; e.textContent = t; box.appendChild(e); return e; };
  const btn = (t, fn, cls) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ' + (cls || ''); b.textContent = t; b.addEventListener('click', fn); return b; };
  const row = () => { const d = document.createElement('div'); d.className = 'acctRow'; box.appendChild(d); return d; };
  if (!net.room && !(window.claude && window.claude.use)){ p('Co-op needs the live connection. Open the game from your Railway site to play with friends.'); return; }
  if (!coop){
    p('Team up with up to three friends against the raider waves. Revive each other when someone goes down.', 'acctSub');
    row().append(btn('Host a squad', () => { const c = Math.random().toString(36).slice(2, 7).replace(/[^a-z0-9]/g, 'x'); coopJoin(c, true); }));
    p('Have a squad code?', 'pick');
    const r = row(), inp = document.createElement('input'); inp.className = 'acctInput'; inp.placeholder = 'Squad code'; inp.maxLength = 6; inp.id = 'coopCode'; inp.setAttribute('aria-label', 'Squad code'); inp.value = typed;
    r.append(inp, btn('Join', () => { const c = inp.value.trim().toLowerCase(); if (!coopCodeOk(c)){ toast('Enter the 4 to 6 letter squad code.', 2500); return; } coopJoin(c, false); }, 'ghost'));
    if (hadFocus) setTimeout(() => { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }, 0);
    p('Open squads', 'pick');
    if (!coopLobbyList.length) p('No open squads right now. Host one and share the code.');
    else { const r2 = row(); for (const s of coopLobbyList.slice(0, 8)) r2.append(btn(`${String(s.name || 'Degen').slice(0, 16)} · ${Math.min(4, +s.n || 1)}/4 · ${mapName(s.map)}`, () => coopJoin(String(s.code), false), 'ghost')); }
    return;
  }
  const hpr = coopHostPr();
  p(`Squad code: ${coop.code.toUpperCase()}`, 'lgName');
  p(coop.host ? 'Share this code with friends. Start whenever your squad is ready.' : hpr ? 'You are in. Waiting for the host to start the match.' : 'Connecting to the squad...', 'acctSub');
  const list = document.createElement('div'); list.className = 'acctList';
  const line = (t) => { const d = document.createElement('div'); d.textContent = t; list.appendChild(d); };
  line(`${coopName()} (you)${coop.host ? ' · host' : ''}`);
  for (const m of coop.mates.values()) line(`${m.name}${m.pr && m.pr.host ? ' · host' : ''}`);
  box.appendChild(list);
  if (coop.host){
    p('Map', 'pick');
    const r = row();
    for (const [k, n] of Object.entries(MAP_NAMES)){ const b = btn(n, () => { selectedMap = k; store.set('dustyard-map', k); coopSend(true); renderCoop(); }, selectedMap === k ? '' : 'ghost'); r.append(b); }
    p(`Raiders: ${FACTION_NAME[raiderFactionFor(selectedMap)] || 'Classic raiders'}`);
    row().append(btn('Start match', coopStart), btn('Leave squad', () => { coopLeave(); renderCoop(); }, 'ghost'));
  } else {
    if (hpr && hpr.co) p(`Map: ${mapName(hpr.co.map)}`);
    if (hpr && hpr.co && hpr.co.st === 'play') p('This match is already running. Wait for the next one.');
    row().append(btn('Leave squad', () => { coopLeave(); renderCoop(); }, 'ghost'));
  }
}
function raiderFactionFor(map){ const v = cfg.raiders || 'map'; return v !== 'map' ? v : map === 'neon' ? 'aliens' : map === 'jungle' ? 'gorillas' : 'wolves'; }
// guests start when the host does
function coopLobbyTick(){
  if (!coop || coop.started || !coop.guest) return;
  const h = coopHostPr();
  if (h && h.co && h.co.st === 'play' && !coop.seenPlay){
    if (Date.now() - coop.joinedAt < 1500 && !coop.waitedHost){ coop.waitedHost = true; }
    coop.seenPlay = true; selectedMap = MAP_NAMES[h.co.map] ? h.co.map : 'yard'; coopBegin();
  }
  if (h && h.co && h.co.st !== 'play') coop.seenPlay = false;
}

function gameOver(){
  endPredator(false); tutStop();
  $('ggLine').textContent = '';
  $('overTitle').textContent = tdm ? (tdm.result === true ? 'Victory' : tdm.result === false ? 'Defeat' : 'Match over') : 'Overrun';
  if (tdm){ const t = tdm; setTimeout(() => { $('finalStat').textContent = `Team ${t.us.toLocaleString()} – ${t.them.toLocaleString()} Raiders · ${t.kills} kills, ${t.deaths} deaths, K/D ${(t.kills/Math.max(1,t.deaths)).toFixed(2)}`; }, 0); $('tdmBar').hidden = true; $('scoreboard').hidden = true; }
  lastGame = { score, wave, map:currentMap };
  $('dropBox').innerHTML = ''; matchEnd().then(j => {
    const d = (j && j.drops) || [];
    if (d.length){ renderDropsInto($('dropBox'), d, 'You found:'); sfx.levelUp(); }
    else if (j && j.verified === null){ const n = document.createElement('div'); n.className = 'dropNote'; n.textContent = "This match couldn't be verified by the server, so it doesn't count toward drops or the leaderboard."; $('dropBox').appendChild(n); }
  });
  const cc = cardOwned(); $('ovCard').innerHTML = ''; if (cc) $('ovCard').appendChild(drawCallingCard(cc, acctName()));
  $('lbPostRow').hidden = !(lbDb && lbId && score > 0); $('lbPost').disabled = false; $('lbMsg').textContent = '';
  $('callsign').value = acctName(); $('callsign').readOnly = true;
  if (acct && acct.claimed){ try { const pr = acctProfiles(); if (pr[acct.wallet]){ pr[acct.wallet].snapshot = snapshot(); store.set('dy-profiles', JSON.stringify(pr)); } } catch(e){} }
  setTimeout(() => maybePrompt(), 1200);
  if (lbDb) refreshBoard();
  state = 'over'; firing = false; ads = false;
  if (document.pointerLockElement) document.exitPointerLock();
  let best = null; try { best = JSON.parse(store.get('dustyard-best') || 'null'); } catch(e){}
  const isBest = !best || score > best.score;
  if (isBest) store.set('dustyard-best', JSON.stringify({ score, wave }));
  if (isBest && best && wave > (best.wave || 0)) addMilestone(`Best wave ${wave}`);
  $('finalScore').textContent = score.toLocaleString();
  $('finalStat').textContent = `You held out until wave ${wave} with ${kills} ${kills===1?'kill':'kills'} and ${headshots} ${headshots===1?'headshot':'headshots'}.`;
  $('bestLine2').textContent = isBest && score > 0 ? 'New best score' : bestText();
  $('xpLine').textContent = `+${gameXP.toLocaleString()} XP this game. Level ${profile.level} ${levelTitle()}.`;
  $('touch').hidden = true; show('overPanel');
}

