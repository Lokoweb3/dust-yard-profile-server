/* ---------- Animal specials: one active move per species ----------
   Keyboard E, controller D-pad left, touch "Special". Each one recharges, and kills shorten the wait.
   Wolf howl marks raiders; fox vanishes and leaves a decoy; bear's hide soaks damage and draws fire;
   tiger dashes through raiders; gorilla throws a barrel or a boulder; lion's roar heals and revives;
   panda rolls through raiders and leaves a healing bamboo patch. */
const SPECIALS = {
  wolf:{ name:"Hunter's Howl", cd:25, dur:6, col:'#a0d2ff' },
  fox:{ name:'Vanish', cd:22, dur:4, col:'#ffb27a' },
  bear:{ name:'Iron Hide', cd:28, dur:5, col:'#f0c070' },
  tiger:{ name:'Shadow Dash', cd:14, dur:.28, col:'#ff8a2e' },
  ape:{ name:'Rip and Throw', cd:20, dur:0, col:'#ff9a7a' },
  lion:{ name:'Rallying Roar', cd:30, dur:0, col:'#e8b04a' },
  panda:{ name:'Rolling Thunder', cd:25, dur:3, col:'#e8f4ea' }
};
const spec = { t:0, cd:0, k:'', hit:new Set(), dir:new V3(), decoy:null, decoyFx:0, patch:null, throws:[], roarN:0, seenRoar:new Map(), howlT:0 };
const specOn = k => spec.t > 0 && spec.k === k;
function mySpecial(){ const sp = spPower(); return sp && SPECIALS[sp] ? sp : ''; }
function useSpecial(){
  const k = mySpecial(), d = SPECIALS[k];
  if (!d || state !== 'play' || hubMode || P.dead || P.down || predator || rage.t > 0) return false;
  if (spec.t > 0) return true;
  if (spec.cd > 0){ toast(`${d.name} recharging: ${Math.ceil(spec.cd)} s`, 1400); return true; }
  spec.k = k; spec.t = d.dur; spec.hit.clear();
  banner(d.name); rumble(.6, .5, 160);
  const f = new V3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
  if (k === 'wolf'){
    sfx.roar('wolf'); dustRing(P.pos, 10, 0xa0d2ff); spec.howlT = 6;
    let n = 0; for (const e of enemies) if (e.alive && e.pos.distanceTo(P.pos) < 35){ e.markT = 6; n++; }
    feed(`${n} raider${n === 1 ? '' : 's'} marked`, true);
  } else if (k === 'fox'){
    // a decoy fox where you stand; raiders lose you and shoot it instead
    const g = new THREE.Group(), fur = MS(0xd8762e, .9), cream = MS(0xf2e2cc, .9);
    const body = new THREE.Mesh(new THREE.SphereGeometry(.32, 14, 10), fur); body.scale.set(.8, .75, 1.5); body.position.y = .55; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(.2, 12, 10), fur); head.position.set(0, .82, .48); g.add(head);
    const snout = new THREE.Mesh(new THREE.ConeGeometry(.09, .22, 10), cream); snout.rotation.x = HP; snout.position.set(0, .78, .68); g.add(snout);
    for (const sx of [-1, 1]){ const ear = new THREE.Mesh(new THREE.ConeGeometry(.06, .16, 8), fur); ear.position.set(sx*.1, 1.02, .44); g.add(ear); }
    const tail = new THREE.Mesh(new THREE.SphereGeometry(.14, 10, 8), fur); tail.scale.set(1, 1, 2.6); tail.position.set(0, .6, -.62); tail.rotation.x = .5; g.add(tail);
    for (const [x, z] of [[-.15, .3], [.15, .3], [-.15, -.3], [.15, -.3]]){ const l = new THREE.Mesh(new THREE.CylinderGeometry(.045, .04, .4, 8), MS(0x3a2418, .9)); l.position.set(x, .2, z); g.add(l); }
    g.position.set(P.pos.x, P.pos.y, P.pos.z); g.rotation.y = P.yaw + Math.PI; g.traverse(o => { if (o.isMesh) o.castShadow = true; }); scene.add(g);
    spec.decoy = { g, pos:new V3(P.pos.x, P.pos.y + .6, P.pos.z) };
    for (const e of enemies) if (e.alive && !e.remote){ e.sees = false; e.reaction = .8; }
    blast(.15, 3000, .3, false); spec.decoyFx = 0;
  } else if (k === 'bear'){
    sfx.roar('bear'); shake = Math.max(shake, .05);
    for (const e of enemies) if (e.alive && !e.remote && e.pos.distanceTo(P.pos) < 20){ e.sees = true; e.reaction = Math.min(e.reaction, .15); if (coop && coop.host){ e.ctgt = 'me'; e.ctT = 5; } }
  } else if (k === 'tiger'){
    spec.dir.copy(f); sfx.swish(); sfx.roar('tiger');
  } else if (k === 'ape'){
    throwProp(f);
  } else if (k === 'lion'){
    lionRoar(f);
  } else if (k === 'panda'){
    spec.dir.copy(f); spec.patchAt = P.pos.clone(); blast(.2, 900, .4, true, 0, 70);
  }
  if (!d.dur) endSpecial();
  return true;
}
function endSpecial(){
  const d = SPECIALS[spec.k]; spec.t = 0; spec.cd = d ? d.cd : 0;
  if (spec.decoy){ scene.remove(spec.decoy.g); spec.decoy = null; }
  if (spec.k === 'panda' && spec.patchAt) bambooPatch(spec.patchAt);
}
// kills shorten the recharge
function specialKill(){ if (spec.cd > 0) spec.cd = Math.max(0, spec.cd - 2); if (specOn('tiger')) spec.refund = true; }
// wolf howl: you, and teammates near a howling wolf, sprint 15% faster for 6 s
function howlBoost(){
  if (spec.howlT > 0) return true;
  if (coop && coop.mates) for (const m of coop.mates.values()) if (m.pr && m.pr.hw && m.pos.distanceTo(P.pos) < 15) return true;
  return false;
}
// a teammate in co-op: the roar heals you (and revives you if you are down) when you are close
function specialFromMate(m){
  const pr = m.pr; if (!pr || !pr.roar) return;
  if (spec.seenRoar.get(m.peer) === pr.roar) return; const first = !spec.seenRoar.has(m.peer); spec.seenRoar.set(m.peer, pr.roar); if (first) return;
  if (m.pos.distanceTo(P.pos) > 15) return;
  if (P.down && !P.dead){ P.down = false; P.hp = 50; P.crouch = false; feed(`${m.name}'s roar revived you`, true); sfx.levelUp(); }
  else if (!P.dead){ P.hp = Math.min(maxHP(), P.hp + 40); feed(`${m.name}'s roar: +40 health`, true); }
}
function lionRoar(f){
  sfx.roar('lion'); shake = Math.max(shake, .08); dustRing(P.pos, 12, 0xe8b04a); rumble(1, .8, 400);
  P.hp = Math.min(maxHP(), P.hp + 40);
  spec.roarN++;   // teammates see this through co-op presence
  let n = 0;
  for (const e of enemies){
    if (!e.alive || e.remote || e.type === 'boss') continue;
    const d = new V3(e.pos.x - P.pos.x, 0, e.pos.z - P.pos.z), dist = d.length();
    if (dist < 14 && d.normalize().dot(f) > .35){ e.stunT = Math.max(e.stunT || 0, 2); e.sees = false; n++; callout(e, 'Run!'); }
  }
  feed(`Roar: +40 health${n ? `, ${n} raider${n === 1 ? '' : 's'} panicked` : ''}`, true);
}
// gorilla: throw the nearest barrel (it explodes) or tear up a boulder
function throwProp(f){
  let bar = null, bd = 6;
  for (const b of barrels) if (b.alive && b.map === currentMap){ const d = b.m.position.distanceTo(P.pos); if (d < bd){ bd = d; bar = b; } }
  if (bar){
    bar.alive = false; bar.m.visible = false;
    for (const arr of [boxes, MAPS[bar.map].boxes]){ const i = arr.indexOf(bar.box); if (i >= 0) arr.splice(i, 1); }
    for (const arr of [solids, MAPS[bar.map].solids]){ const i = arr.indexOf(bar.m); if (i >= 0) arr.splice(i, 1); }
  }
  const mesh = bar ? new THREE.Mesh(new THREE.CylinderGeometry(.3, .3, .85, 14), MS(0xb3352a, .5, .3)) : new THREE.Mesh(new THREE.DodecahedronGeometry(.45, 0), MS(0x8a8470, .95));
  mesh.castShadow = true;
  const dir = new V3(0, 0, -1).applyQuaternion(camera.quaternion), from = camera.position.clone().addScaledVector(dir, .9).add(new V3(0, -.2, 0));
  mesh.position.copy(from); scene.add(mesh);
  spec.throws.push({ mesh, pos:from, vel:dir.multiplyScalar(24).add(new V3(0, 4, 0)), barrel:!!bar, life:4, spin:new V3(Math.random()*8, Math.random()*8, 0) });
  sfx.roar('ape'); blast(.25, 600, .3, true, 0, 60); shake = Math.max(shake, .04);
}
function updateThrows(dt){
  for (let i=spec.throws.length-1;i>=0;i--){
    const t = spec.throws[i]; t.life -= dt; t.vel.y -= 18*dt;
    const next = t.pos.clone().addScaledVector(t.vel, dt), seg = next.clone().sub(t.pos), len = seg.length();
    ray.set(t.pos, seg.normalize()); ray.far = len;
    const parts = []; for (const e of enemies) if (e.alive) parts.push(...e.parts);
    const hs = ray.intersectObjects(solids.concat(parts), false);
    let at = hs.length ? hs[0].point : null;
    if (!at){ const hh = humanHit(t.pos, seg); if (hh && hh.t <= len) at = hh.point; }
    if (!at && next.y <= groundAt(next.x, next.z, next.y + .5) + .2) at = next.clone();
    t.mesh.rotation.x += t.spin.x*dt; t.mesh.rotation.y += t.spin.y*dt;
    if (at || t.life <= 0){
      at = at || next; scene.remove(t.mesh); spec.throws.splice(i, 1);
      if (t.barrel) explode(at.clone().setY(Math.max(.25, at.y)), { R:7, noPlayer:true });
      else {
        dustRing(at, 6, 0x9a8a70); sfx.boom(at.distanceTo(P.pos)); shake = Math.max(shake, .05);
        for (const e of enemies){ if (!e.alive || e.air) continue; const d = new V3(e.pos.x - at.x, 0, e.pos.z - at.z), dist = d.length();
          if (dist < 3.8){ damageEnemy(e, 170*(1 - dist/5.5) + 40, false, d.normalize(), 'nade'); if (e.alive && !e.remote && e.type !== 'boss'){ e.stagT = 1.2; e.flinch = .5; } } }
      }
      continue;
    }
    t.pos.copy(next); t.mesh.position.copy(next);
  }
}
// panda: a patch of bamboo where the roll began, healing anyone standing in it
function bambooPatch(at){
  const g = new THREE.Group(), ring = new THREE.Mesh(new THREE.RingGeometry(2.6, 3, 36), new THREE.MeshBasicMaterial({ color:0x7fe0a8, transparent:true, opacity:.6, side:THREE.DoubleSide, depthWrite:false }));
  ring.rotation.x = -HP; ring.position.y = .06; g.add(ring);
  const stem = MS(0x5fae4e, .7);
  for (let i=0;i<9;i++){ const a = Math.random()*6.28, r = .6 + Math.random()*2, h = 1 + Math.random()*1.6, s = new THREE.Mesh(new THREE.CylinderGeometry(.05, .06, h, 7), stem);
    s.position.set(Math.cos(a)*r, h/2, Math.sin(a)*r); s.rotation.z = (Math.random() - .5)*.2; s.castShadow = true; g.add(s); }
  g.position.set(at.x, at.y, at.z); scene.add(g);
  if (spec.patch) scene.remove(spec.patch.g);
  spec.patch = { g, at:at.clone(), t:6, fx:0 };
}
function clearSpecials(){
  if (spec.decoy){ scene.remove(spec.decoy.g); spec.decoy = null; }
  if (spec.patch){ scene.remove(spec.patch.g); spec.patch = null; }
  for (const t of spec.throws) scene.remove(t.mesh); spec.throws.length = 0;
  spec.t = 0; spec.cd = 0; spec.howlT = 0; spec.refund = false;
  for (const e of enemies) e.markT = 0;
}
// movement overrides while dashing or rolling (called from updatePlayer)
function specialMove(){
  if (specOn('tiger')){ P.vel.x = spec.dir.x*38; P.vel.z = spec.dir.z*38; return true; }
  if (specOn('panda')){ const f = new V3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw)); spec.dir.lerp(f, .08).normalize(); P.vel.x = spec.dir.x*11; P.vel.z = spec.dir.z*11; return true; }
  return false;
}
function updateSpecial(dt){
  if (spec.t > 0){
    spec.t -= dt;
    if (spec.k === 'tiger' || spec.k === 'panda'){
      // claw or bowl over everything you pass through
      for (const e of enemies){
        if (!e.alive || e.air || spec.hit.has(e) || Math.abs((e.y || 0) - P.pos.y) > 1.6) continue;
        const d = new V3(e.pos.x - P.pos.x, 0, e.pos.z - P.pos.z);
        if (d.length() < (spec.k === 'tiger' ? 1.9 : 1.7)){
          spec.hit.add(e);
          damageEnemy(e, spec.k === 'tiger' ? 230 : 130, false, d.normalize(), 'claw');
          if (e.alive && !e.remote && e.type !== 'boss'){ e.pos.addScaledVector(d, spec.k === 'panda' ? 2.2 : .8); collide(e.pos, .4); e.stagT = 1; e.flinch = .5; }
          sfx.stab(); shake = Math.max(shake, .03);
        }
      }
      if (spec.k === 'tiger' && Math.random() < .6) spawnPuff(new V3(P.pos.x, P.pos.y + .9, P.pos.z), 0xff8a2e, .25, .25);
      if (spec.k === 'panda'){ rollZ += dt*9; if (Math.random() < dt*20) spawnPuff(new V3(P.pos.x, P.pos.y + .2, P.pos.z), 0xc9ad83, .4, .5, .4); }
    }
    if (spec.k === 'fox' && spec.decoy){
      // raiders shoot at the decoy; you stay hidden
      spec.decoyFx -= dt;
      if (spec.decoyFx <= 0){ spec.decoyFx = .18 + Math.random()*.2;
        const shooters = enemies.filter(e => e.alive && e.muzzle && !e.air && e.pos.distanceTo(spec.decoy.pos) < 45);
        const e = shooters[(Math.random()*shooters.length) | 0];
        if (e){ const m = e.muzzle.getWorldPosition(new V3()); spawnTracer(m, spec.decoy.pos.clone().add(new V3((Math.random() - .5)*.6, Math.random()*.4, (Math.random() - .5)*.6)), 0xffa65c); spawnFlashSprite(m); sfx.enemy(e.pos.distanceTo(P.pos)); e.face = Math.atan2(spec.decoy.pos.x - e.pos.x, spec.decoy.pos.z - e.pos.z); } }
      spec.decoy.g.position.y = spec.decoy.pos.y - .6 + Math.abs(Math.sin(T*9))*.04;
    }
    if (spec.t <= 0){
      if (spec.k === 'tiger' && spec.refund){ spec.refund = false; spec.t = 0; spec.cd = 0; feed('Shadow Dash refunded', true); }
      else endSpecial();
    }
  } else if (spec.cd > 0){ spec.cd = Math.max(0, spec.cd - dt); if (!spec.cd && mySpecial()) feed(`${SPECIALS[mySpecial()].name} ready`, true); }
  if (spec.howlT > 0) spec.howlT -= dt;
  for (const e of enemies) if (e.markT > 0) e.markT -= dt;
  if (spec.patch){
    const p = spec.patch; p.t -= dt;
    if (P.pos.distanceTo(p.at) < 3.2 && !P.dead && !P.down) P.hp = Math.min(maxHP(), P.hp + 8*dt);
    p.fx -= dt; if (p.fx <= 0){ p.fx = .3; spawnPuff(p.at.clone().add(new V3((Math.random() - .5)*4, .3, (Math.random() - .5)*4)), 0x7fe0a8, .2, .9, .8); }
    if (p.t <= 0){ scene.remove(p.g); spec.patch = null; }
  }
  updateThrows(dt);
  specialHud();
}
// HUD: the special's state, plus outlines for raiders the howl has marked
function specialHud(){
  const k = mySpecial(), d = SPECIALS[k];
  if (!spec.hud){ spec.hud = document.createElement('div'); spec.hud.style.cssText = 'position:absolute;left:22px;bottom:calc(178px + env(safe-area-inset-bottom,0px));width:210px;text-align:left;pointer-events:none;font:700 15px "Barlow Condensed",sans-serif;letter-spacing:.06em;color:#f4ecdc;text-shadow:0 1px 3px #000';
    spec.txt = document.createElement('div'); const bg = document.createElement('div'); bg.style.cssText = 'height:6px;margin-top:3px;background:rgba(255,255,255,.2);border-radius:3px;overflow:hidden';
    spec.bar = document.createElement('div'); spec.bar.style.cssText = 'height:100%;width:0'; bg.appendChild(spec.bar); spec.hud.append(spec.txt, bg); $('hud').appendChild(spec.hud);
    spec.cv = document.createElement('canvas'); spec.cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none'; $('hud').appendChild(spec.cv);
    spec.edge = document.createElement('div'); spec.edge.style.cssText = 'position:absolute;inset:0;pointer-events:none;transition:opacity .25s;opacity:0'; $('hud').appendChild(spec.edge); }
  spec.hud.style.display = d && !hubMode ? 'block' : 'none';
  if (spec.touch) spec.touch.style.display = d && !hubMode ? '' : 'none';
  if (d){
    const key = isTouch ? 'SPECIAL' : padActive ? 'D-PAD ◀' : 'E', on = spec.t > 0 && spec.k === k, cd = spec.cd > 0;
    spec.txt.textContent = on ? `${d.name.toUpperCase()} · ${spec.t.toFixed(1)} s` : cd ? `${d.name.toUpperCase()} · ${Math.ceil(spec.cd)} s` : `${key} · ${d.name.toUpperCase()} READY`;
    spec.bar.style.width = (on && d.dur ? spec.t/d.dur*100 : cd ? (1 - spec.cd/d.cd)*100 : 100).toFixed(1) + '%';
    spec.bar.style.background = on ? d.col : cd ? 'rgba(255,255,255,.45)' : '#f0a93b';
    if (spec.touch) spec.touch.style.opacity = on || cd ? .45 : 1;
  }
  // screen edge: blue shimmer while hidden, amber plating with Iron Hide
  spec.edge.style.opacity = specOn('fox') || specOn('bear') ? 1 : 0;
  spec.edge.style.boxShadow = specOn('fox') ? 'inset 0 0 140px 40px rgba(120,190,255,.45)' : 'inset 0 0 0 8px rgba(240,169,59,.5), inset 0 0 120px 30px rgba(240,169,59,.35)';
  // marked raiders and (with night vision at night) nearby raiders are outlined, even through walls for the howl
  const c = spec.cv, g = c.getContext('2d');
  if (c.width !== innerWidth || c.height !== innerHeight){ c.width = innerWidth; c.height = innerHeight; }
  g.clearRect(0, 0, c.width, c.height);
  const nvg = headGear() === 'nvg' && (currentMap === 'neon' || currentMap === 'jungle' || smokes.length);
  for (const e of enemies){
    if (!e.alive) continue;
    const marked = e.markT > 0, night = nvg && e.nvgSeen;
    if (!marked && !night) continue;
    const v = new V3(e.pos.x, (e.y || 0) + 1.1*e.g.scale.x, e.pos.z).project(camera); if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) continue;
    const x = (v.x + 1)/2*c.width, y = (1 - v.y)/2*c.height, s = Math.max(8, 60/Math.max(1, e.pos.distanceTo(P.pos)))*e.g.scale.x;
    g.strokeStyle = marked ? 'rgba(255,74,58,.95)' : 'rgba(92,255,138,.85)'; g.lineWidth = 2;
    g.strokeRect(x - s*.6, y - s*1.4, s*1.2, s*2.8);
    if (marked){ g.fillStyle = '#ff4a3a'; g.save(); g.translate(x, y - s*1.4 - 9); g.rotate(Math.PI/4); g.fillRect(-4, -4, 8, 8); g.restore(); }
  }
}
// night vision: which raiders you can actually see (checked a few times a second)
let nvgT = 0;
function updateNvg(dt){
  nvgT -= dt; if (nvgT > 0) return; nvgT = .25;
  if (headGear() !== 'nvg') return;
  const eye = camera.position;
  for (const e of enemies) if (e.alive) e.nvgSeen = e.pos.distanceTo(P.pos) < 30 && lineOfSight(eye, new V3(e.pos.x, (e.y || 0) + 1.2, e.pos.z), true);
}
