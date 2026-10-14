/* ---------- Ninja Shogun: the boss on every 10th wave ---------- */
const shogunStars = [];
function makeShogun(e){
  e.shogun = true; e.hp = Math.round(e.hp*.7); e.maxHp = e.hp; e.speed *= 1.6; e.dashCd = 3; e.starCd = 2; e.slashT = 0;
  const steel = new THREE.MeshStandardMaterial({ color:0xd8dde4, roughness:.2, metalness:.95 }), red = new THREE.MeshStandardMaterial({ color:0x9b1c1c, roughness:.6 });
  const sw = new THREE.Group(); sw.position.set(.32, 1.05, .1); e.g.add(sw);
  const blade = new THREE.Mesh(Bx(.03, 1.1, .01), steel); blade.position.y = .55; sw.add(blade);
  const hilt = new THREE.Mesh(Bx(.04, .25, .04), red); hilt.position.y = -.1; sw.add(hilt);
  const guard = new THREE.Mesh(Bx(.14, .02, .08), new THREE.MeshStandardMaterial({ color:0x111111 })); sw.add(guard);
  sw.rotation.x = -.6; e.sword = sw;
  for (const sx of [-1, 1]){ const plate = new THREE.Mesh(Bx(.32, .1, .26), red); plate.position.set(sx*.3, 1.42, 0); plate.rotation.z = sx*.35; e.g.add(plate); }
}
function updateShogun(e, dt, dist, dx, dz){
  e.dashCd -= dt; e.starCd -= dt;
  if (e.slashT > 0){
    e.slashT -= dt; const p = 1 - e.slashT/.55;
    e.sword.rotation.x = -2.4 + p*3.2;
    if (!e.slashHit && p > .6){ e.slashHit = true; ninjaSlashFx(new V3(e.pos.x + dx/dist*1.2, 1.3, e.pos.z + dz/dist*1.2), 0xff4040); sfx.swish();
      if (dist < 3.4){ damagePlayer(28 + Math.min(14, wave), e.pos); shake = Math.max(shake, .25); } }
    if (e.slashT <= 0) e.sword.rotation.x = -.6;
    return { mx:0, mz:0 };
  }
  if (e.dashCd <= 0 && dist > 3.5 && dist < 26){
    // vanish in smoke and reappear next to the player, then wind up a slash
    spawnPuff(new V3(e.pos.x, 1, e.pos.z), 0x444444, .9, .7, .4);
    const ang = Math.atan2(e.pos.x - P.pos.x, e.pos.z - P.pos.z) + (Math.random() - .5)*1.2;
    e.pos.x = P.pos.x + Math.sin(ang)*2.3; e.pos.z = P.pos.z + Math.cos(ang)*2.3; collide(e.pos, .5);
    spawnPuff(new V3(e.pos.x, 1, e.pos.z), 0x444444, .9, .7, .4); sfx.swish();
    e.dashCd = 4.5 + Math.random()*2; e.slashT = .55; e.slashHit = false; callout(e, 'Your head is mine!');
    return { mx:0, mz:0 };
  }
  if (e.starCd <= 0 && dist > 5){
    e.starCd = 2.2 + Math.random();
    const from = new V3(e.pos.x, 1.5, e.pos.z);
    for (const off of [-.12, 0, .12]){
      const to = new V3(P.pos.x, P.pos.y + camH - .3, P.pos.z), dir = to.sub(from).normalize(); dir.applyAxisAngle(new V3(0, 1, 0), off);
      const m = new THREE.Mesh(starGeo, new THREE.MeshStandardMaterial({ color:0xff5050, emissive:0x550000, roughness:.3, metalness:.8 })); m.position.copy(from); scene.add(m);
      shogunStars.push({ m, v:dir.multiplyScalar(22), life:2 });
    }
    sfx.swish();
  }
  return dist > 2.6 ? { mx:dx/dist, mz:dz/dist, fast:true } : { mx:0, mz:0 };
}
/* ---------- More wave bosses: War Elephant, Gunship and Alpha Beast ----------
   Boss waves rotate through five bosses. The three new ones are built here, each with its own model,
   invisible hit shapes (head, body, legs) and its own way of fighting. Each is still the wave's one boss,
   and the Alpha's pack is the wave's normal raiders, who spawn around it. */
const BOSS_ROTA = ['jugg', 'elephant', 'gunship', 'alpha', 'shogun'];
const BOSS_NAMES = { jugg:'Degen Juggernaut', shogun:'Ninja Shogun', elephant:'War Elephant', gunship:'Gunship', alpha:'Alpha Beast' };
const CUSTOM_BOSS = ['elephant', 'gunship', 'alpha'];
function bossKindFor(w){ return BOSS_ROTA[(Math.max(1, Math.round(w/5)) - 1) % BOSS_ROTA.length]; }
function packWave(){ return wave > 0 && wave % 5 === 0 && bossKindFor(wave) === 'alpha'; }
const bossName = e => e.bossName || (e.shogun ? 'Ninja Shogun' : 'Degen Juggernaut');
const HIT_MAT = new THREE.MeshBasicMaterial({ color:0xff00ff, transparent:true, opacity:0, depthWrite:false });
const BOSS_TIPS = {
  elephant:'A War Elephant is coming. Dodge sideways when it trumpets and charges; if it hits a wall it is dazed and takes double damage. Aim for the head.',
  gunship:'A Gunship is overhead. Bullets barely scratch it: switch to the RPG-X (6). Rockets are dropped near you while it flies.',
  alpha:'The Alpha Beast leads the pack. It leaps at you and its howl drives the pack wild. Keep your distance and aim for the head.'
};
let gsMats = null, alphaM = null;
function gunshipMats(){
  if (gsMats) return gsMats;
  gsMats = { hull:MS(0x5a6142, .62, .3), dark:MS(0x26281f, .5, .55), glass:MS(0x10202a, .08, .7, { envMapIntensity:1.5 }), red:MS(0xa8261e, .6, .2), metal:MS(0x5c5f63, .35, .85),
    blade:MS(0x1b1c1a, .55, .4), lamp:new THREE.MeshBasicMaterial({ color:0xff2a1a }) };
  if (typeof OP_PATTERNS !== 'undefined' && OP_PATTERNS.woodland){ gsMats.hull.map = OP_PATTERNS.woodland.map; gsMats.hull.color.set(0xb8bea6); }
  return gsMats;
}
function alphaMats(){
  if (alphaM) return alphaM;
  const fur = canvasTex(256, 256, c => {
    c.fillStyle = '#4e4238'; c.fillRect(0, 0, 256, 256);
    for (let i=0;i<5200;i++){ const v = 40 + Math.random()*70 | 0, x = Math.random()*256, y = Math.random()*256, l = 5 + Math.random()*9;
      c.strokeStyle = `rgb(${v + 8},${v},${v - 8})`; c.lineWidth = .6 + Math.random()*1.1; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (Math.random() - .5)*4, y + l); c.stroke(); }
  });
  fur.repeat.set(3, 3);
  alphaM = { fur:MS(0xffffff, .95, 0, { map:fur, bumpMap:fur, bumpScale:.03 }), mane:MS(0xb8b0a6, .95, 0, { map:fur }), belly:MS(0xc4b8a6, .95, 0, { map:fur }), dark:MS(0x111012, .7), eye:new THREE.MeshBasicMaterial({ color:0xff3a1c }),
    fang:MS(0xe8e2d0, .45), gum:MS(0x5a1a1c, .6), armor:MS(0x3a3d33, .45, .65), red:MS(0xa8261e, .6), claw:MS(0x1c1a18, .4, .2) };
  return alphaM;
}

function makeCustomBoss(kind, x, z){
  const e = enemyState(x, z); e.type = 'boss'; e.custom = kind; e.bossName = BOSS_NAMES[kind]; e.y = 0; e.scoreMul = TYPES.boss.score;
  const g = new THREE.Group(); g.rotation.order = 'YXZ'; g.position.set(x, 0, z); scene.add(g); e.g = g;
  const hit = (geo, part, parent, px = 0, py = 0, pz = 0) => { const m = new THREE.Mesh(geo, HIT_MAT); m.position.set(px, py, pz); m.userData = { enemy:e, part }; m.visible = false; e.parts.push(m); parent.add(m); return m; };
  const add = (geo, mat, parent, px = 0, py = 0, pz = 0, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); m.rotation.set(rx, ry, rz); m.castShadow = true; parent.add(m); return m; };
  const base = TYPES.boss.hp + wave*220;
  if (kind === 'elephant'){
    const b = makeBeast(); b.scale.setScalar(1.3); g.add(b); e.body = b; const U = b.userData;
    // heavier armour: plates down both flanks and over the rump, studded with rivets
    for (const sx of [-1, 1]){
      add(Bx(.1, 1.15, 2.3), eleArmor, b, sx*1.3, 2.55, .15, 0, 0, sx*.22);
      for (const zz of [-.8, 0, .8]) add(new THREE.SphereGeometry(.06, 8, 6), eleMetal, b, sx*1.37, 2.9, .15 + zz);
      add(Bx(.11, .1, 2.32), eleRed, b, sx*1.43, 2.0, .15, 0, 0, sx*.22);
    }
    add(new THREE.SphereGeometry(1.1, 20, 12, 0, Math.PI*2, 0, Math.PI*.35), eleArmor, b, 0, 2.9, -1.35, -1.3).scale.set(1.05, 1, .8);
    // a twin machine gun turret on the back, which turns to follow its target
    const tur = new THREE.Group(); tur.position.set(0, 4.15, .55); b.add(tur); e.turret = tur;
    add(new THREE.CylinderGeometry(.42, .5, .3, 16), eleMetal, tur);
    add(Bx(.7, .5, .6), eleMetal, tur, 0, .38, 0);
    add(Bx(.8, .55, .06), eleArmor, tur, 0, .45, .38);
    for (const sx of [-.13, .13]) add(new THREE.CylinderGeometry(.045, .045, 1.1, 8), eleMetal, tur, sx, .42, .9, HP);
    e.muzzle = new THREE.Object3D(); e.muzzle.position.set(0, .42, 1.48); tur.add(e.muzzle);
    hit(new THREE.SphereGeometry(.85, 12, 8), 'head', U.head, 0, .05, .25);
    hit(Bx(2.4, 2.2, 3.8), 'body', b, 0, 2.7, -.15);
    hit(Bx(1, .8, 1), 'body', tur, 0, .4, 0);
    U.legs.forEach(L => hit(new THREE.CylinderGeometry(.48, .48, 1.95, 8), 'legs', L.l, 0, -.9, 0));
    e.hp = Math.round(base*1.1); e.speed = 3.4; e.act = 'walk'; e.actT = 0; e.chargeCd = 4; e.stompCd = 3; e.gunT = 2; e.ph = 0;
  } else if (kind === 'gunship'){
    const M = gunshipMats(), h = new THREE.Group(); g.add(h); e.body = h;
    add(new THREE.SphereGeometry(1, 28, 18), M.hull, h, 0, 0, .3).scale.set(1.2, 1.1, 2.6);
    add(new THREE.SphereGeometry(1, 24, 14, 0, Math.PI*2, 0, Math.PI*.5), M.glass, h, 0, .3, 1.75, .45).scale.set(.85, .75, 1.15);
    add(Bx(1.3, .65, 2.6), M.dark, h, 0, 1.1, -.3);
    for (const sx of [-1, 1]){ add(new THREE.CylinderGeometry(.24, .28, .5, 14), M.dark, h, sx*.5, 1.15, -1.75, HP); add(new THREE.CylinderGeometry(.18, .18, .06, 14), M.red, h, sx*.5, 1.15, -2.02, HP); }
    add(new THREE.CylinderGeometry(.36, .17, 5.4, 14), M.hull, h, 0, .4, -4.2, HP);
    add(new THREE.CylinderGeometry(.33, .3, .35, 14), M.red, h, 0, .4, -3.2, HP);
    add(Bx(.12, 1.7, 1.1), M.hull, h, 0, 1.15, -6.5, -.25);
    add(Bx(2.2, .08, .6), M.hull, h, 0, .45, -5.9);
    const tr = new THREE.Group(); tr.position.set(.16, 1.3, -6.6); h.add(tr); e.tailRotor = tr;
    for (let i=0;i<2;i++) add(Bx(.04, 1.4, .14), M.blade, tr, 0, 0, 0, i*HP);
    add(new THREE.CylinderGeometry(.12, .14, .5, 10), M.metal, h, 0, 1.6, 0);
    const rot = new THREE.Group(); rot.position.set(0, 1.9, 0); h.add(rot); e.rotor = rot;
    add(new THREE.CylinderGeometry(.22, .22, .18, 12), M.metal, rot);
    for (let i=0;i<4;i++){ const bl = add(Bx(4.2, .05, .36), M.blade, rot, 0, .02, 0, 0, i*HP); bl.geometry.translate(2.1, 0, 0); }
    // stub wings with rocket pods, a chin gun, landing skids
    add(Bx(4.6, .12, .9), M.hull, h, 0, -.15, .2);
    e.pods = [];
    for (const sx of [-1, 1]){
      add(new THREE.CylinderGeometry(.28, .28, 1.4, 14), M.dark, h, sx*2.05, -.42, .3, HP);
      add(new THREE.CylinderGeometry(.22, .22, .04, 14), M.red, h, sx*2.05, -.42, 1.01, HP);
      const mz = new THREE.Object3D(); mz.position.set(sx*2.05, -.42, 1.1); h.add(mz); e.pods.push(mz);
      add(new THREE.CylinderGeometry(.06, .06, 4.3, 8), M.metal, h, sx*.95, -1.55, .2, HP);
      for (const zz of [-.9, 1.1]) add(new THREE.CylinderGeometry(.04, .04, .55, 6), M.metal, h, sx*.82, -1.3, zz, 0, 0, sx*.35);
    }
    const chin = new THREE.Group(); chin.position.set(0, -.9, 2.3); h.add(chin); e.turret = chin;
    add(new THREE.SphereGeometry(.3, 14, 10), M.dark, chin);
    for (let i=0;i<3;i++){ const a = i/3*Math.PI*2; add(new THREE.CylinderGeometry(.035, .035, 1, 8), M.metal, chin, Math.cos(a)*.07, Math.sin(a)*.07, .55, HP); }
    e.muzzle = new THREE.Object3D(); e.muzzle.position.set(0, 0, 1.08); chin.add(e.muzzle);
    const lamp = add(new THREE.SphereGeometry(.07, 8, 6), M.lamp, h, 0, 2.05, -6.7); e.lamp = lamp;
    hit(Bx(2.5, 2.3, 5.4), 'body', h, 0, 0, .3);
    hit(Bx(.9, .9, 5.6), 'body', h, 0, .4, -4.2);
    hit(new THREE.SphereGeometry(.85, 10, 8), 'head', h, 0, .35, 1.85);
    hit(new THREE.SphereGeometry(.55, 10, 8), 'head', h, 0, 1.75, 0);
    e.hp = 1600 + wave*90; e.air = true; e.y = 15; e.orb = Math.atan2(x - P.pos.x, z - P.pos.z); e.orbDir = Math.random() < .5 ? -1 : 1;
    e.gunT = 3; e.mg = 'idle'; e.rocketCd = 6; e.salvo = 0; e.salvoT = 0; e.supT = 4; e.rotorT = 0;
  } else {
    const A = alphaMats(), body = new THREE.Group(); g.add(body); e.body = body;
    // a dire wolf the size of a truck: deep chest, narrow waist, thick shaggy ruff
    const torso = new THREE.Group(); torso.position.set(0, 1.95, 0); body.add(torso); e.torso = torso;
    add(new THREE.SphereGeometry(1, 26, 18), A.fur, torso, 0, -.05, .65).scale.set(.92, 1.08, 1.05);
    add(new THREE.SphereGeometry(1, 22, 16), A.belly, torso, 0, -.45, .75).scale.set(.7, .7, .85);
    add(new THREE.SphereGeometry(1, 22, 16), A.fur, torso, 0, .02, -.45).scale.set(.68, .78, 1.0);
    add(new THREE.SphereGeometry(1, 22, 16), A.fur, torso, 0, .08, -1.25).scale.set(.74, .8, .78);
    add(new THREE.SphereGeometry(1, 22, 16), A.mane, torso, 0, .25, 1.1).scale.set(.98, 1.0, .74);
    for (let i=0;i<9;i++){ const sp = add(new THREE.ConeGeometry(.15, .5, 7), A.mane, torso, (i % 2 ? .3 : -.3)*(i < 5 ? 1 : .6), 1.1 - i*.05, 1.3 - i*.12, -.9); sp.rotation.z = (i % 2 ? -.5 : .5); }
    for (let i=0;i<7;i++) add(new THREE.ConeGeometry(.11, .45 - i*.035, 7), A.dark, torso, 0, .86 - i*.04, .55 - i*.33, -.55);
    // armour saddle with the raiders' red stripe
    add(Bx(1.3, .14, 1.15), A.armor, torso, 0, .8, -.35, -.06);
    add(Bx(1.33, .05, .16), A.red, torso, 0, .88, -.35, -.06);
    for (const sx of [-1, 1]) add(Bx(.12, .65, 1.1), A.armor, torso, sx*.66, .45, -.35, 0, 0, sx*.32);
    // neck and head (the head is swapped for the detailed 3D wolf head once it has loaded)
    add(new THREE.SphereGeometry(.62, 18, 14), A.mane, body, 0, 2.45, 1.75).scale.set(1, 1.1, 1.1);
    const head = new THREE.Group(); head.position.set(0, 2.7, 2.15); body.add(head); e.headG2 = head;
    const prim = new THREE.Group(); head.add(prim); e.primHead = prim;
    add(new THREE.SphereGeometry(.55, 22, 16), A.fur, prim).scale.set(1, .9, 1.05);
    add(new THREE.CylinderGeometry(.2, .32, .85, 16), A.fur, prim, 0, -.14, .68, HP);
    add(new THREE.SphereGeometry(.12, 10, 8), A.dark, prim, 0, -.06, 1.1).scale.set(1.2, .8, 1);
    const jaw = new THREE.Group(); jaw.position.set(0, -.3, .2); prim.add(jaw); e.jaw = jaw;
    add(Bx(.38, .12, .8), A.belly, jaw, 0, 0, .4);
    add(Bx(.32, .03, .76), A.gum, jaw, 0, .07, .4);
    for (const sx of [-1, 1]){
      add(new THREE.ConeGeometry(.045, .2, 8), A.fang, jaw, sx*.13, .14, .72);
      add(new THREE.ConeGeometry(.05, .24, 8), A.fang, prim, sx*.14, -.33, .92, Math.PI);
      add(new THREE.ConeGeometry(.16, .55, 10), A.fur, prim, sx*.28, .58, -.12, -.15, 0, -sx*.2);
      add(new THREE.SphereGeometry(.07, 10, 8), A.eye, prim, sx*.23, .14, .48);
    }
    add(new THREE.TorusGeometry(.6, .08, 8, 22), A.armor, body, 0, 2.3, 1.65, HP*.7);
    for (let i=0;i<8;i++){ const a = i/8*Math.PI*2; add(new THREE.ConeGeometry(.06, .25, 6), A.fang, body, Math.cos(a)*.66, 2.3 + Math.sin(a)*.5, 1.65 + Math.sin(a)*.36, 0, 0, a - HP); }
    e.legs = [];
    for (const [lx, lz, back] of [[-.52, 1.0, 0], [.52, 1.0, 0], [-.5, -1.3, 1], [.5, -1.3, 1]]){
      const l = new THREE.Group(); l.position.set(lx, 1.85, lz); body.add(l);
      add(new THREE.SphereGeometry(.4, 14, 10), A.fur, l).scale.set(.9, 1.35, 1.2);
      add(new THREE.CylinderGeometry(.3, .2, 1.0, 12), A.fur, l, 0, -.5, back ? -.08 : 0);
      const knee = new THREE.Group(); knee.position.set(0, -.98, back ? -.12 : 0); l.add(knee);
      add(new THREE.SphereGeometry(.19, 12, 8), A.fur, knee);
      add(new THREE.CylinderGeometry(.17, .13, .82, 12), A.fur, knee, 0, -.4, 0);
      add(new THREE.SphereGeometry(.24, 12, 8), A.fur, knee, 0, -.8, .1).scale.set(1, .5, 1.35);
      for (const cx of [-.11, 0, .11]) add(new THREE.ConeGeometry(.035, .16, 6), A.claw, knee, cx, -.84, .4, HP);
      e.legs.push({ l, knee, back });
      hit(new THREE.CylinderGeometry(.3, .3, 1.85, 8), 'legs', l, 0, -.9, 0);
    }
    // a big bushy tail
    const tail = []; let tp = body, tr = .26;
    for (let i=0;i<6;i++){ const s = new THREE.Group(); s.position.set(0, i ? 0 : 2.2, i ? -.34 : -1.9); s.rotation.x = i ? -.1 : .75; tp.add(s);
      add(new THREE.SphereGeometry(tr, 12, 10), i > 3 ? A.mane : A.fur, s, 0, 0, -.12).scale.set(1, 1, 1.8); tail.push(s); tp = s; tr *= i < 2 ? 1.08 : .86; }
    e.tail = tail;
    hit(new THREE.SphereGeometry(.75, 10, 8), 'head', head, 0, 0, .3);
    hit(Bx(1.9, 1.9, 3.9), 'body', body, 0, 1.95, -.15);
    e.hp = Math.round(base*.8); e.speed = 8; e.act = 'run'; e.actT = 0; e.leapCd = 3; e.howlCd = 4; e.biteCd = 0; e.ph = 0;
  }
  e.maxHp = e.hp; e.reaction = 0; e.losT = 0;
  return e;
}
function spawnCustomBoss(kind){
  const [x, z] = pickSpawn(), e = makeCustomBoss(kind, x, z);
  e.nid = ++enemyNid; enemies.push(e);
  banner(BOSS_NAMES[kind]); toast(BOSS_TIPS[kind], 6000); sfx.horn();
  if (kind === 'elephant') sfx.trumpet(.7); else if (kind === 'alpha') sfx.roar('wolf');
  if (kind === 'gunship') supplyRockets();
  return e;
}
function supplyRockets(){
  const W = WEAPONS.find(w => w.id === 'launcher'); if (!W) return;
  W.reserve = Math.max(W.reserve, Math.min(W.maxRes, 6)); if (W.ammo < 1) W.ammo = 1;
}
// the Alpha's pack spawns close around it
function packSpot(){
  if (!packWave()) return null;
  const a = enemies.find(e => e.alive && e.custom === 'alpha'); if (!a) return null;
  for (let i=0;i<12;i++){ const ang = Math.random()*Math.PI*2, r = 3 + Math.random()*5, x = a.pos.x + Math.sin(ang)*r, z = a.pos.z + Math.cos(ang)*r;
    if (Math.abs(x) < ARENA - 2 && Math.abs(z) < ARENA - 2 && freeSpot(x, z, .9)) return [x, z]; }
  return null;
}
// a ring of dust that grows and fades (stomps and landings)
function dustRing(at, R, col = 0xc9ad83){
  const m = new THREE.Mesh(new THREE.RingGeometry(.6, 1, 40), new THREE.MeshBasicMaterial({ color:col, transparent:true, opacity:.8, side:THREE.DoubleSide, depthWrite:false }));
  m.rotation.x = -HP; m.position.set(at.x, .08, at.z); scene.add(m); effects.push({ obj:m, life:.6, max:.6, grow:R*1.6 });
  for (let i=0;i<10;i++){ const a = i/10*Math.PI*2; spawnPuff(new V3(at.x + Math.sin(a)*R*.5, .3, at.z + Math.cos(a)*R*.5), col, .9, 1.2, .9); }
}
// damage players near a point: me, and teammates (only the host runs bosses in co-op)
function blastPlayers(c, R, max){
  const pd = Math.hypot(c.x - P.pos.x, c.z - P.pos.z);
  if (pd < R && Math.abs(c.y - P.pos.y) < 4) damagePlayer(max*(1 - pd/R) + 4, c, true);
  if (coop && coop.started && coop.host) for (const m of coop.mates.values()){ if (!m.pr || m.pr.dn) continue; const d = Math.hypot(c.x - m.pos.x, c.z - m.pos.z); if (d < R) m.hurt += max*(1 - d/R) + 4; }
}
function bossShot(e, dist, chance, dmg){
  const muzzle = e.muzzle.getWorldPosition(new V3());
  if (smokes.length && smokeBlocks(muzzle, camera.position)) chance = .03;
  const hit = Math.random() < Math.max(.04, chance), target = new V3(P.pos.x, P.pos.y + camH - .35, P.pos.z);
  if (!hit){ target.x += (Math.random()-.5)*3; target.y += (Math.random()-.3)*1.4; target.z += (Math.random()-.5)*3; target.sub(muzzle).multiplyScalar(1.5).add(muzzle); }
  spawnTracer(muzzle, target, 0xffb060); if (Math.random() < .5) spawnFlashSprite(muzzle);
  sfx.minigun(dist); e.lastFire = T; e.shotN = (e.shotN || 0) + 1;
  if (hit) damagePlayer(dmg, e.pos);
}
const gsRockets = [];
function gunshipRocket(e, mz, to){
  const from = mz.getWorldPosition(new V3()), dir = to.clone().sub(from).normalize();
  const g = new THREE.Group(); g.add(new THREE.Mesh(Cy(.06, .06, .5, 8), rocketMat).rotateX(HP));
  const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map:flashTex, color:0xffa040, blending:THREE.AdditiveBlending, transparent:true, depthWrite:false })); fl.position.z = -.35; fl.scale.setScalar(.7); g.add(fl);
  g.position.copy(from); g.lookAt(from.clone().add(dir)); scene.add(g);
  gsRockets.push({ g, pos:from, vel:dir.multiplyScalar(30), life:4, smokeT:0 });
  sfx.boom(e.pos.distanceTo(P.pos) + 20); spawnFlashSprite(from);
}
function updateBossFx(dt){
  for (let i=gsRockets.length-1;i>=0;i--){
    const r = gsRockets[i], next = r.pos.clone().addScaledVector(r.vel, dt), seg = next.clone().sub(r.pos), len = seg.length();
    r.life -= dt; r.smokeT -= dt;
    if (r.smokeT <= 0){ r.smokeT = .03; spawnPuff(r.pos.clone(), 0x8a8478, .14, .7, .2); }
    let at = null; ray.set(r.pos, seg.normalize()); ray.far = len; const hs = ray.intersectObjects(solids, false); if (hs.length) at = hs[0].point;
    if (!at && next.y < .1) at = next.clone().setY(.1);
    if (at || r.life <= 0){ at = at || next; scene.remove(r.g); explode(at.clone().setY(Math.max(.2, at.y)), { noEnemies:true, noPlayer:true, R:5 }); if (!(coop && coop.guest)) blastPlayers(at, 5.5, 38); gsRockets.splice(i, 1); continue; }
    r.pos.copy(next); r.g.position.copy(next);
  }
}
function clearBossFx(){ for (const r of gsRockets) scene.remove(r.g); gsRockets.length = 0; }
// rocket hits on custom bosses (their hit shapes are plain meshes, not the soldier capsules)
function customBossParts(){ const out = []; for (const e of enemies) if (e.alive && e.custom) out.push(...e.parts); return out; }

function updateCustomBoss(e, dt){
  const K = e.custom;
  if (K === 'gunship'){ e.rotorT += dt; if (e.rotor) e.rotor.rotation.y += dt*(e.alive ? 26 : 9); if (e.tailRotor) e.tailRotor.rotation.x += dt*(e.alive ? 40 : 12); if (e.lamp) e.lamp.visible = Math.sin(T*6) > 0; }
  if (!e.alive){ customBossDeath(e, dt); return; }
  if (K === 'gunship'){
    // rockets are dropped near every player while the gunship is up
    e.supT -= dt;
    if (e.supT <= 0){ e.supT = 16; if (pickups.filter(p => p.kind === 'rocket').length < 2){ for (let i=0;i<10;i++){ const a = Math.random()*Math.PI*2, r = 3 + Math.random()*4, x = P.pos.x + Math.sin(a)*r, z = P.pos.z + Math.cos(a)*r; if (freeSpot(x, z, .6) && Math.abs(x) < ARENA - 2 && Math.abs(z) < ARENA - 2){ spawnPickup('rocket', x, z); break; } } } }
  }
  if (e.remote){ customBossRemote(e, dt); return; }
  e.stunT = 0;   // bosses shrug off stuns
  const dx = P.pos.x - e.pos.x, dz = P.pos.z - e.pos.z, dist = Math.hypot(dx, dz) || .001;
  e.losT -= dt;
  const eyeY = K === 'gunship' ? e.y : K === 'elephant' ? 4.5 : 2.6;
  if (e.losT <= 0){ e.losT = .2; e.sees = lineOfSight(new V3(e.pos.x, eyeY, e.pos.z), new V3(P.pos.x, P.pos.y + camH - .1, P.pos.z)) || dist < 6; }
  if (K === 'elephant') updateWarElephant(e, dt, dx, dz, dist);
  else if (K === 'gunship') updateGunship(e, dt, dx, dz, dist);
  else updateAlpha(e, dt, dx, dz, dist);
  e.g.position.set(e.pos.x, e.y || 0, e.pos.z); e.g.rotation.y = e.face;
}
function steer(e, tx, tz, spd, dt, r){
  const dx = tx - e.pos.x, dz = tz - e.pos.z, d = Math.hypot(dx, dz) || 1;
  let vx = dx/d, vz = dz/d;
  if (e.detourT > 0){ e.detourT -= dt; vx = e.detour.x; vz = e.detour.z; }
  const ox = e.pos.x, oz = e.pos.z;
  e.pos.x += vx*spd*dt; e.pos.z += vz*spd*dt; collide(e.pos, r, e.custom === 'elephant' ? 1 : 0);
  const moved = Math.hypot(e.pos.x - ox, e.pos.z - oz);
  if (spd > .5 && moved < spd*dt*.3){ e.stuck += dt; if (e.stuck > .35){ e.stuck = 0; const s = Math.random() < .5 ? 1 : -1; e.detour = { x:-vz*s, z:vx*s }; e.detourT = .9; } } else e.stuck = Math.max(0, e.stuck - dt);
  return moved/Math.max(dt, 1e-3);
}
function updateWarElephant(e, dt, dx, dz, dist){
  const U = e.body.userData, want = Math.atan2(dx, dz);
  let spd = 0;
  e.actT -= dt; e.chargeCd -= dt; e.stompCd -= dt;
  if (e.act === 'walk'){
    e.face = angleLerp(e.face, want, Math.min(1, dt*2));
    if (dist > 9) spd = steer(e, P.pos.x, P.pos.z, e.speed + Math.min(1.5, wave*.04), dt, 2.2);
    if (e.chargeCd <= 0 && e.sees && dist > 9 && dist < 38){ e.act = 'wind'; e.actT = 1.1; sfx.trumpet(.75); }
    else if (e.stompCd <= 0 && dist < 8){ e.act = 'stomp'; e.actT = 1.15; e.stomped = false; sfx.trumpet(.9); }
  } else if (e.act === 'wind'){
    e.face = angleLerp(e.face, want, Math.min(1, dt*5));
    if (e.actT <= 0){ e.act = 'charge'; e.actT = 2.6; e.cdir = new V3(Math.sin(e.face), 0, Math.cos(e.face)); e.hitP = false; }
  } else if (e.act === 'charge'){
    const ox = e.pos.x, oz = e.pos.z, sp = 16;
    e.pos.addScaledVector(e.cdir, sp*dt); collide(e.pos, 2.2, 1);
    spd = Math.hypot(e.pos.x - ox, e.pos.z - oz)/Math.max(dt, 1e-3);
    if (Math.random() < dt*14) spawnPuff(new V3(e.pos.x, .4, e.pos.z), 0xc9ad83, 1, 1.1, 1);
    shake = Math.max(shake, .05*Math.max(0, 1 - dist/26));
    if (!e.hitP && dist < 3.4){ e.hitP = true; damagePlayer(42 + Math.min(18, wave), e.pos); if (!coopSwap){ P.vel.x += e.cdir.x*14; P.vel.z += e.cdir.z*14; P.vel.y = Math.max(P.vel.y, 5); } }
    if (spd < sp*.35 && e.actT < 2.45){ e.act = 'dazed'; e.actT = 2.4; sfx.boom(dist); shake = Math.max(shake, .08*Math.max(0, 1 - dist/30)); dustRing(e.pos, 4); feed('The War Elephant is dazed: double damage!', true); }
    else if (e.actT <= 0){ e.act = 'walk'; e.chargeCd = 6 + Math.random()*3; }
  } else if (e.act === 'dazed'){
    if (e.actT <= 0){ e.act = 'walk'; e.chargeCd = 7; }
  } else if (e.act === 'stomp'){
    e.face = angleLerp(e.face, want, Math.min(1, dt*3));
    if (!e.stomped && e.actT < .4){ e.stomped = true; dustRing(e.pos, 9); sfx.boom(dist); shake = Math.max(shake, .1*Math.max(0, 1 - dist/20)); if (dist < 9 && P.onGround) damagePlayer(30*(1 - dist/9) + 8, e.pos, true); }
    if (e.actT <= 0){ e.act = 'walk'; e.stompCd = 6; }
  }
  // the turret keeps firing bursts whenever it can see its target
  if (e.turret){ const tw = want - e.face; e.turret.rotation.y = angleLerp(e.turret.rotation.y, tw, Math.min(1, dt*4)); }
  e.gunT -= dt;
  if (e.gunT <= 0 && e.sees && e.act !== 'dazed'){ e.burst = (e.burst || 0) + 1; e.gunT = e.burst % 14 ? .09 : 2.6; bossShot(e, dist, .34 - dist*.006 - (P.moving ? .12 : 0) - (P.sprinting ? .06 : 0), 5 + Math.min(5, wave*.3)); }
  e.actCode = e.act === 'charge' || e.act === 'wind' ? 1 : e.act === 'stomp' ? 2 : e.act === 'dazed' ? 3 : 0;
  animElephant(e, dt, spd);
}
function animElephant(e, dt, spd){
  const U = e.body.userData, run = Math.min(1, spd/5);
  e.ph += dt*(2 + spd*.75);
  U.legs.forEach((L, j) => { const a = e.ph + [0, Math.PI, Math.PI*.5, Math.PI*1.5][j], sw = Math.sin(a)*(.12 + run*.3);
    L.l.rotation.x = sw; L.knee.rotation.x = -Math.max(0, Math.cos(a))*(.15 + run*.4); });
  const k = e.actCode;
  // rearing up for a stomp, head down when charging, swaying when dazed
  let rx = 0; if (k === 2) rx = e.actT > .4 ? -Math.min(1, (1.15 - e.actT)/.5)*.38 : -(e.actT/.4)*.38; else if (k === 1) rx = .06;
  e.body.rotation.x += (rx - e.body.rotation.x)*Math.min(1, dt*10);
  e.body.rotation.z = k === 3 ? Math.sin(T*3)*.06 : 0;
  if (k === 2){ U.legs[0].l.rotation.x = U.legs[1].l.rotation.x = rx*1.6; }
  U.trunk.forEach((t, j) => { t.rotation.x = (k === 1 ? (j > 4 ? .2 : -.05) : (j > 5 ? -.22 : -.06)) + Math.sin(e.ph*.5 - j*.45)*.08; t.rotation.z = Math.sin(e.ph*.3 - j*.4)*.06; });
  U.ears.forEach((ea, j) => { ea.rotation.y = (j ? -1 : 1)*(k === 1 ? .9 : .35 + Math.sin(e.ph*.3)*.1); });
  U.head.rotation.x = k === 1 ? .15 : Math.sin(e.ph*.5)*.04; U.tail.rotation.z = Math.sin(e.ph*.6)*.3;
}
function updateGunship(e, dt, dx, dz, dist){
  // circles the target, nose pointed at it, and changes direction now and then
  e.orb += e.orbDir*.3*dt; if (Math.random() < dt*.05) e.orbDir *= -1;
  const R = 19 + Math.sin(T*.23)*4, L = ARENA - 5;
  const tx = Math.max(-L, Math.min(L, P.pos.x + Math.sin(e.orb)*R)), tz = Math.max(-L, Math.min(L, P.pos.z + Math.cos(e.orb)*R));
  const vx = tx - e.pos.x, vz = tz - e.pos.z, vd = Math.hypot(vx, vz) || 1, sp = Math.min(12, vd*1.5);
  const mx = vx/vd*sp, mz = vz/vd*sp;
  e.pos.x += mx*dt; e.pos.z += mz*dt;
  e.y += (14 + Math.sin(T*.7)*1.2 - e.y)*Math.min(1, dt*.8);
  e.face = angleLerp(e.face, Math.atan2(dx, dz), Math.min(1, dt*2.5));
  // bank into the turn and tip the nose when moving
  const fwd = mx*Math.sin(e.face) + mz*Math.cos(e.face), side = mx*Math.cos(e.face) - mz*Math.sin(e.face);
  e.body.rotation.x += (fwd*.02 - e.body.rotation.x)*Math.min(1, dt*3); e.body.rotation.z += (side*.03 - e.body.rotation.z)*Math.min(1, dt*3);
  if (e.turret){ const d3 = Math.hypot(dist, e.y - P.pos.y); e.turret.rotation.x = Math.atan2(e.y - (P.pos.y + 1.2), dist) - e.body.rotation.x; }
  // chin gun: spin up, fire a long burst, cool down
  e.gunT -= dt;
  if (e.mg === 'idle' && e.gunT <= 0 && e.sees){ e.mg = 'fire'; e.gunT = 2.4; e.fireT = 0; sfx.spinUp(); }
  else if (e.mg === 'fire'){
    e.fireT -= dt;
    if (e.fireT <= 0 && e.sees){ e.fireT = .1; bossShot(e, Math.hypot(dist, e.y), .2 - (P.moving ? .08 : 0) - (P.sprinting ? .05 : 0) - (P.slideT > 0 ? .1 : 0), 4 + Math.min(4, wave*.15)); }
    if (e.gunT <= 0){ e.mg = 'idle'; e.gunT = 3; }
  }
  // rocket salvo: four rockets at where the target is standing
  e.rocketCd -= dt;
  if (e.rocketCd <= 0 && e.sees && e.salvo === 0){ e.salvo = 4; e.salvoT = 0; e.rocketCd = 9; }
  if (e.salvo > 0){ e.salvoT -= dt; if (e.salvoT <= 0){ e.salvoT = .28; e.salvo--; gunshipRocket(e, e.pods[e.salvo % 2], new V3(P.pos.x + (Math.random() - .5)*5, 0, P.pos.z + (Math.random() - .5)*5)); } }
  e.rotorSfx = (e.rotorSfx || 0) - dt; if (e.rotorSfx <= 0){ e.rotorSfx = .13; blast(Math.max(.02, .16 - Math.hypot(dist, e.y)*.003), 260, .1, false); }
  e.actCode = e.mg === 'fire' ? 1 : e.salvo > 0 ? 2 : 0;
}
function updateAlpha(e, dt, dx, dz, dist){
  const want = Math.atan2(dx, dz);
  let spd = 0;
  e.actT -= dt; e.leapCd -= dt; e.howlCd -= dt; e.biteCd -= dt;
  if (e.act === 'run'){
    e.face = angleLerp(e.face, want, Math.min(1, dt*6));
    if (dist > 3.7) spd = steer(e, P.pos.x, P.pos.z, e.speed + Math.min(2, wave*.05), dt, 1.1);
    if (e.howlCd <= 0 && dist > 10){ e.act = 'howl'; e.actT = 1.7; e.howled = false; }
    else if (e.leapCd <= 0 && e.sees && dist > 6 && dist < 17){ e.act = 'leap'; e.actT = .85; e.from = e.pos.clone(); e.to = new V3(P.pos.x, 0, P.pos.z).addScaledVector(new V3(-dx/dist, 0, -dz/dist), 3); e.hitP = false; sfx.roar('wolf'); }
    else if (dist < 4.4 && e.biteCd <= 0){ e.act = 'bite'; e.actT = .5; e.bit = false; }
  } else if (e.act === 'leap'){
    const k = 1 - Math.max(0, e.actT)/.85;
    e.pos.lerpVectors(e.from, e.to, k); collide(e.pos, 1.1); e.y = Math.sin(k*Math.PI)*3.2;
    e.face = angleLerp(e.face, want, Math.min(1, dt*4)); spd = 0;
    if (e.actT <= 0){ e.y = 0; e.act = 'run'; e.leapCd = 5 + Math.random()*2; dustRing(e.pos, 4, 0x9a8a70); sfx.boom(dist + 10);
      if (dist < 4.4){ damagePlayer(30 + Math.min(12, wave*.4), e.pos); if (!coopSwap){ P.vel.x += dx/dist*9; P.vel.z += dz/dist*9; P.vel.y = Math.max(P.vel.y, 4); } } }
  } else if (e.act === 'bite'){
    e.face = angleLerp(e.face, want, Math.min(1, dt*8));
    if (!e.bit && e.actT < .3){ e.bit = true; sfx.stab(); if (dist < 4.6) damagePlayer(16 + Math.min(8, wave*.3), e.pos); }
    if (e.actT <= 0){ if (Math.random() < .55){ e.act = 'prowl'; e.actT = 1.6; const s = Math.random() < .5 ? 1 : -1; e.prowl = { x:e.pos.x - dx/dist*6 + dz/dist*6*s, z:e.pos.z - dz/dist*6 - dx/dist*6*s }; } else e.act = 'run'; e.biteCd = 1.3; }
  } else if (e.act === 'prowl'){
    // hit and run: it circles off after a bite, then comes back in
    spd = steer(e, e.prowl.x, e.prowl.z, e.speed*.8, dt, 1.1);
    e.face = angleLerp(e.face, Math.atan2(e.prowl.x - e.pos.x, e.prowl.z - e.pos.z), Math.min(1, dt*6));
    if (e.actT <= 0) e.act = 'run';
  } else if (e.act === 'howl'){
    if (!e.howled && e.actT < 1.3){ e.howled = true; sfx.roar('wolf'); feed('The Alpha howls: the pack is enraged!', true);
      // the pack hunts harder: they all know where you are and move faster for a while
      for (const o of enemies) if (o.alive && o !== e && !o.remote && o.type !== 'boss'){ o.sees = true; o.reaction = Math.min(o.reaction, .2); if (!o.howled){ o.howled = true; o.speed *= 1.25; } } }
    if (e.actT <= 0){ e.act = 'run'; e.howlCd = 15; }
  }
  e.actCode = e.act === 'leap' ? 1 : e.act === 'howl' ? 2 : e.act === 'bite' ? 3 : 0;
  animAlpha(e, dt, spd);
}
function animAlpha(e, dt, spd){
  // swap in the detailed wolf head once it has loaded
  if (!e.hdHead && ensureHD('wolf')){ const h = OP_HD.wolf.clone(); h.scale.multiplyScalar(6); h.position.set(0, .05, .35); e.headG2.add(h); e.primHead.visible = false; e.hdHead = h; }
  const run = Math.min(1, spd/7), k = e.actCode;
  e.ph += dt*(3 + spd*1.1);
  e.legs.forEach((L, j) => { const a = e.ph + [0, Math.PI*.15, Math.PI, Math.PI*1.15][j], s = Math.sin(a)*(.15 + run*.6);
    L.l.rotation.x = k === 1 ? (L.back ? .7 : -.9) : s; L.knee.rotation.x = k === 1 ? (L.back ? -.9 : .6) : (L.back ? -1 : 1)*Math.max(0, Math.cos(a))*(.2 + run*.6); });
  e.torso.position.y = 1.95 + Math.abs(Math.sin(e.ph))*.1*run;
  const hx = k === 2 ? -.7 : k === 3 ? .25 : k === 1 ? -.2 : Math.sin(e.ph*2)*.04*run;
  e.headG2.rotation.x += (hx - e.headG2.rotation.x)*Math.min(1, dt*10);
  e.jaw.rotation.x = k === 2 ? .55 : k === 3 ? Math.max(0, Math.sin((.5 - e.actT)/.5*Math.PI))*.7 : k === 1 ? .4 : .05;
  e.body.rotation.x = k === 2 ? -.15 : 0;
  e.tail.forEach((s, j) => { s.rotation.y = Math.sin(e.ph*.8 - j*.5)*.25*(1 + run); });
}
function customBossRemote(e, dt){
  const n = e.net; if (!n) return;
  const k = 1 - Math.exp(-dt*8), ox = e.pos.x, oz = e.pos.z;
  e.pos.x += (n.x - ox)*k; e.pos.z += (n.z - oz)*k; e.y += (n.y - (e.y || 0))*k;
  if (Math.hypot(n.x - e.pos.x, n.z - e.pos.z) > 8){ e.pos.x = n.x; e.pos.z = n.z; }
  const spd = Math.hypot(e.pos.x - ox, e.pos.z - oz)/Math.max(dt, 1e-3);
  e.face = angleLerp(e.face, n.face, Math.min(1, dt*8)); e.sees = n.sees; e.actCode = n.act || 0;
  e.g.position.set(e.pos.x, e.y || 0, e.pos.z); e.g.rotation.y = e.face;
  if (e.custom === 'elephant') animElephant(e, dt, spd); else if (e.custom === 'alpha'){ e.actT = .25; animAlpha(e, dt, spd); }
}
function customBossDeath(e, dt){
  e.dieT += dt;
  if (e.custom === 'gunship'){
    // spins down out of the sky trailing smoke, then blows up where it lands
    if (!e.crashed){
      e.fallV = (e.fallV || 0) + 9*dt; e.y = Math.max(.4, e.y - e.fallV*dt); e.face += dt*3.2; e.body.rotation.z = Math.min(.5, e.body.rotation.z + dt*.3);
      if (Math.random() < dt*30) spawnPuff(new V3(e.pos.x, e.y + .5, e.pos.z), 0x2a2622, .8, 1.6, .6);
      if (e.y <= .4){ e.crashed = true; explode(new V3(e.pos.x, .5, e.pos.z), { noEnemies:true, R:6 }); shake = Math.max(shake, .1); }
    } else if (Math.random() < dt*8) spawnPuff(new V3(e.pos.x + (Math.random() - .5)*2, 1, e.pos.z + (Math.random() - .5)*2), 0x2a2622, 1, 2, .4);
    e.g.position.set(e.pos.x, e.y, e.pos.z); e.g.rotation.y = e.face;
    if (e.crashed) e.body.position.y -= dt*.08;
    if (e.dieT > 7){ scene.remove(e.g); e.gone = true; }
    return;
  }
  // the beasts tip over onto their side, then sink away
  if (!e.fellSfx){ e.fellSfx = true; if (e.custom === 'elephant') sfx.trumpet(.6); else sfx.roar('wolf'); }
  const k = Math.min(1, e.dieT/1.2);
  e.y = 0; e.body.rotation.z = k*k*1.45*e.fallDir; e.body.rotation.x *= .9;
  if (e.dieT > 1.15 && !e.thud){ e.thud = true; dustRing(e.pos, e.custom === 'elephant' ? 6 : 4); sfx.boom(e.pos.distanceTo(P.pos) + 10); }
  e.g.position.set(e.pos.x, e.dieT > 4 ? -(e.dieT - 4)*.6 : 0, e.pos.z);
  if (e.dieT > 7){ scene.remove(e.g); e.gone = true; }
}
function updateShogunStars(dt){
  for (let i=shogunStars.length-1;i>=0;i--){
    const s = shogunStars[i]; s.life -= dt; s.m.position.addScaledVector(s.v, dt); s.m.rotation.z += dt*25;
    const eye = new V3(P.pos.x, P.pos.y + camH - .4, P.pos.z);
    if (s.m.position.distanceTo(eye) < .8){ damagePlayer(9, s.m.position); scene.remove(s.m); shogunStars.splice(i,1); continue; }
    if (s.life <= 0 || s.m.position.y < 0){ scene.remove(s.m); shogunStars.splice(i,1); }
  }
}

