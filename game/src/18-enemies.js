/* ---------- Enemies: jointed humanoid raiders ---------- */
const EG = {
  pelvis:Bx(.3,.18,.2), thigh:Cy(.088,.072,.44,10), shin:Cy(.068,.052,.43,10), boot:Bx(.12,.1,.27),
  torso:(() => { const g = Cy(.17,.15,.48,12); g.scale(1,1,.7); return g; })(),
  vest:Bx(.36,.36,.27), pouch:Bx(.08,.1,.06), pack:Bx(.3,.36,.16), neck:Cy(.05,.056,.1,8),
  head:(() => { const g = new THREE.SphereGeometry(.11,16,12); g.scale(.92,1.08,1); return g; })(),
  helmet:new THREE.SphereGeometry(.128,16,10,0,Math.PI*2,0,Math.PI*.55), rim:Cy(.136,.136,.02,16), goggles:Bx(.17,.042,.06),
  shoulder:new THREE.SphereGeometry(.066,10,8), upper:Cy(.06,.05,.29,10), fore:Cy(.048,.04,.27,10),
  hand:(() => { const g = new THREE.SphereGeometry(.043,10,8); g.scale(1,1.3,1); return g; })(),
  rBody:Bx(.055,.08,.42), rBarrel:Cy(.01,.01,.2,8), rMag:Bx(.04,.12,.06), rStock:Bx(.045,.08,.16), rGrip:Bx(.035,.08,.04), rSight:Bx(.03,.035,.06)
};
const GOGGLE_MAT = MS(0xff8a3d,.4,0,{ emissive:0xff6a1a, emissiveIntensity:.9 });
const RIFLE_MAT = MS(0x26282b,.5,.6);
const TONES = [{ j:0x5b5a48, p:0x4a4536 }, { j:0x6b5d45, p:0x3f3c33 }, { j:0x4c5446, p:0x45433a }, { j:0x5e5040, p:0x4b4a3f }];
function solveArm(sh, el, S, Tg, l1, l2, pole){
  const dir = new V3().subVectors(Tg, S);
  const d = Math.min(dir.length(), l1+l2-0.002), dn = dir.normalize();
  const a = Math.acos(Math.max(-1, Math.min(1, (l1*l1 + d*d - l2*l2)/(2*l1*d))));
  const pn = pole.clone().sub(dn.clone().multiplyScalar(pole.dot(dn))).normalize();
  const u = dn.clone().multiplyScalar(Math.cos(a)).add(pn.multiplyScalar(Math.sin(a)));
  const E = S.clone().addScaledVector(u, l1);
  const f = new V3().subVectors(Tg, E).normalize();
  const qs = new THREE.Quaternion().setFromUnitVectors(DOWN, u);
  sh.quaternion.copy(qs);
  el.quaternion.copy(qs.clone().invert().multiply(new THREE.Quaternion().setFromUnitVectors(DOWN, f)));
}
let enemies = [];
function enemyState(x, z){
  return { alive:true, hp:100, pos:new V3(x,0,z), face:0, faceT:0, flash:0, flinch:0, recoil:0, parts:[], mats:[], sees:false, losT:Math.random()*0.2,
    reaction:0, fireT:0.4, burst:3, strafeT:0, strafeDir:1, crouching:false, cf:0, stuck:0, detourT:0, detour:{x:0,z:0}, walk:0, swing:0, dieT:0,
    seed:Math.random()*10, lastFire:-9, fallDir:Math.random()<.6 ? 1 : -1, spd:0 };
}
/* ---------- Realistic human soldiers (rigged, animated model) ---------- */
let SOLDIER = null; const _mk = new V3(), _mk2 = new V3();
function b64Buf(id){ const s = document.getElementById(id).textContent.trim(); const bin = atob(s); const u = new Uint8Array(bin.length); for (let i=0;i<bin.length;i++) u[i] = bin.charCodeAt(i); return u.buffer; }
// Big models and textures are embedded in the single-file build, and served as cached files
// (listed in window.DY_ASSETS) in the Railway build, so the first load stays small.
const DY_ASSETS = window.DY_ASSETS || {};
async function assetBuf(id){
  if (document.getElementById(id)) return b64Buf(id);
  if (!DY_ASSETS[id]) throw new Error('missing asset ' + id);
  const r = await fetch(DY_ASSETS[id]); if (!r.ok) throw new Error(`asset ${id}: HTTP ${r.status}`);
  return r.arrayBuffer();
}
const assetSrc = (id, mime) => document.getElementById(id) ? `data:${mime};base64,` + document.getElementById(id).textContent.trim() : DY_ASSETS[id];
function imgTex(id){
  return new Promise(res => {
    const img = new Image();
    img.onload = () => { const t = new THREE.Texture(img); t.flipY = false; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.needsUpdate = true; res(t); };
    img.onerror = () => res(null);
    const src = assetSrc(id, 'image/jpeg'); if (!src) return res(null); img.src = src;
  });
}
(async function loadSoldier(){
  try {
    if (!THREE.GLTFLoader || !THREE.SkeletonUtils) return;
    const [diff, norm] = await Promise.all([imgTex('soldierDiff'), imgTex('soldierNorm')]);
    const glb = await assetBuf('soldierGlb');
    new THREE.GLTFLoader().parse(glb, '', gltf => {
      gltf.scene.traverse(o => { if (o.isMesh){ o.material.map = diff; o.material.normalMap = norm; o.material.roughness = .8; o.material.metalness = .1; o.material.needsUpdate = true; } });
      const clips = {}; gltf.animations.forEach(a => clips[a.name] = a);
      SOLDIER = { scene:gltf.scene, clips };
    }, err => console.warn('Soldier model failed to load', err));
  } catch(e){ console.warn(e); }
})();
const TINTS = [new THREE.Color(1,1,1), new THREE.Color(.92,.86,.74), new THREE.Color(.8,.86,.76), new THREE.Color(.9,.88,.86)];
function findBone(root, key){ let f = null; root.traverse(o => { if (!f && o.isBone && o.name.replace(/[^A-Za-z0-9]/g,'') === 'mixamorig' + key) f = o; }); return f; }
const _q1 = new THREE.Quaternion(), _wq = new THREE.Quaternion(), _pq = new THREE.Quaternion();
function rotateBoneWorld(bone, from, to){
  if (from.lengthSq() < 1e-10 || to.lengthSq() < 1e-10) return;
  _q1.setFromUnitVectors(from.normalize(), to.normalize());
  bone.getWorldQuaternion(_wq); bone.parent.getWorldQuaternion(_pq);
  bone.quaternion.copy(_pq.invert().multiply(_q1.multiply(_wq)));
  bone.updateMatrixWorld(true);
}
function ikArm(up, fore, hand, target, pole){
  const a = up.getWorldPosition(new V3()), b = fore.getWorldPosition(new V3()), c = hand.getWorldPosition(new V3());
  const l1 = a.distanceTo(b), l2 = b.distanceTo(c);
  const dir = target.clone().sub(a); const d = Math.max(.05, Math.min(dir.length(), (l1+l2)*0.999)); dir.normalize();
  const ang = Math.acos(Math.max(-1, Math.min(1, (l1*l1 + d*d - l2*l2)/(2*l1*d))));
  const pn = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
  const elbow = a.clone().addScaledVector(dir, Math.cos(ang)*l1).addScaledVector(pn, Math.sin(ang)*l1);
  rotateBoneWorld(up, b.clone().sub(a), elbow.clone().sub(a));
  const b2 = fore.getWorldPosition(new V3()), c2 = hand.getWorldPosition(new V3());
  rotateBoneWorld(fore, c2.sub(b2), target.clone().sub(b2));
}
function makeHuman(x, z){
  const e = enemyState(x, z);
  e.model = true;
  const g = new THREE.Group(); g.rotation.order = 'YXZ';
  const fop = factionOp(nextEnemyType, nextEnemySeed), fo = fop ? buildOperator(fop, true) : null;
  let model;
  if (fo){ model = fo.model; g.add(fo.root); fo.mats.forEach(m => e.mats.push(m)); e.opSync = fo.sync; e.mixerOp = fo; }
  else {
    model = THREE.SkeletonUtils.clone(SOLDIER.scene);
    model.rotation.y = Math.PI;
    const tint = TINTS[Math.floor(Math.random()*TINTS.length)];
    model.traverse(o => { if (o.isMesh){ o.material = o.material.clone(); o.material.color.multiply(tint); e.mats.push(o.material); o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
    g.add(model);
  }
  const B = {};
  for (const k of ['Hips','Spine2','Neck','Head','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot']) B[k] = findBone(model, k);
  e.B = B;
  if (fo){ e.mixer = fo.mixer; e.acts = fo.acts; }
  else {
    e.mixer = new THREE.AnimationMixer(model);
    const act = n => { const a = e.mixer.clipAction(SOLDIER.clips[n]); a.play(); a.setEffectiveWeight(n === 'Idle' ? 1 : 0); return a; };
    e.acts = { idle:act('Idle'), walk:act('Walk'), run:act('Run') };
  }
  e.w = { idle:1, walk:0, run:0 }; e.spd = 0; e.aimK = 0; e.aimPitch = 0;
  e.mixer.update(Math.random()*2);
  const rifle = new THREE.Group(); g.add(rifle); e.rifle = rifle;
  const rp = (geo, px, py, pz, rx=0) => { const m = new THREE.Mesh(geo, RIFLE_MAT); m.position.set(px,py,pz); m.rotation.x = rx; m.castShadow = true; rifle.add(m); };
  rp(EG.rBody, 0,0,.05); rp(EG.rBarrel, 0,.005,.35, HP); rp(EG.rMag, 0,-.09,.1,-.2); rp(EG.rStock, 0,-.01,-.22); rp(EG.rGrip, 0,-.07,-.05,.3); rp(EG.rSight, 0,.06,0);
  e.muzzle = new THREE.Object3D(); e.muzzle.position.set(0,.005,.47); rifle.add(e.muzzle);
  g.position.set(x,0,z); scene.add(g); e.g = g;
  return e;
}
const _sp = new V3();
function poseHuman(e, dt, engaged){
  const run = Math.max(0, Math.min(1, (e.spd - 3)/1.4));
  const walk = Math.max(0, Math.min(1, e.spd/1.2)) * (1 - run);
  const tgt = { idle:1 - walk - run, walk, run };
  for (const k in e.acts){ e.w[k] += (tgt[k] - e.w[k]) * Math.min(1, dt*8); e.acts[k].setEffectiveWeight(e.w[k]); }
  e.acts.walk.timeScale = Math.max(.6, Math.min(1.6, e.spd/1.5));
  e.acts.run.timeScale = Math.max(.7, Math.min(1.4, e.spd/4.5));
  e.mixer.update(dt);
  e.g.updateMatrixWorld(true);
  e.aimK += ((engaged ? 1 : 0) - e.aimK) * Math.min(1, dt*6);
  const k = e.aimK, lo = 1 - k;
  e.B.Spine2.getWorldPosition(_sp); e.g.worldToLocal(_sp);
  e.rifle.position.set(_sp.x - .1, _sp.y + .02 - lo*.14, _sp.z + .22 + k*.05 - e.recoil*.8);
  e.rifle.rotation.set(-e.aimPitch*k + lo*.55 - e.recoil*.6, lo*.45, -lo*.35);
  e.rifle.updateMatrixWorld(true);
  const grip = e.rifle.localToWorld(new V3(0,-.075,-.05)), fore = e.rifle.localToWorld(new V3(0,-.045,.22));
  const m = e.g.matrixWorld;
  ikArm(e.B.RightArm, e.B.RightForeArm, e.B.RightHand, grip, new V3(-1,-1.2,-.4).transformDirection(m));
  ikArm(e.B.LeftArm, e.B.LeftForeArm, e.B.LeftHand, fore, new V3(1,-1.3,0).transformDirection(m));
  if (e.flinch > 0){ e.B.Spine2.rotateX(-e.flinch*1.2); e.B.Spine2.updateMatrixWorld(true); }
  if (e.mask){
    e.B.Neck.getWorldPosition(_mk2);
    e.B.Head.scale.setScalar(.02); e.B.Head.updateMatrixWorld(true);
    e.B.Head.getWorldPosition(_mk); e.g.worldToLocal(_mk); e.g.worldToLocal(_mk2);
    e.mask.position.set(_mk.x, _mk.y + .1, _mk.z + .01);
    e.mask.rotation.set(-e.aimPitch*e.aimK*.7 + (_mk.z - _mk2.z)*1.5 - (e.headSnap || 0)*2.2, 0, (e.headSnap || 0)*.8);
  }
  e.flinch = Math.max(0, e.flinch - dt*1.2); e.recoil = Math.max(0, e.recoil - dt*.6);
  if (e.opSync) e.opSync();
}
// analytic hit test against capsules built from the animated skeleton
const _hp = { a:new V3(), b:new V3() };
function rayCapsule(o, d, p0, p1, r){
  const v = p1.clone().sub(p0), c = v.dot(v);
  let t = 0, s;
  if (c > 1e-8){
    const w = o.clone().sub(p0), b = d.dot(v), dd = d.dot(w), e = v.dot(w), D = c - b*b;
    t = D > 1e-8 ? Math.max(0, Math.min(1, (e - b*dd)/D)) : 0;
  }
  for (let i=0;i<2;i++){
    const q = p0.clone().addScaledVector(v, t);
    s = Math.max(0, q.clone().sub(o).dot(d));
    if (c > 1e-8) t = Math.max(0, Math.min(1, o.clone().addScaledVector(d, s).sub(p0).dot(v)/c));
  }
  const q = p0.clone().addScaledVector(v, t), pt = o.clone().addScaledVector(d, s), dist = pt.distanceTo(q);
  if (dist > r) return -1;
  return Math.max(0, s - Math.sqrt(r*r - dist*dist));
}
function humanHit(o, d){
  let best = null;
  const W = b => b.getWorldPosition(new V3());
  for (const e of enemies){
    if (!e.alive || !e.model) continue;
    if (e.pos.distanceTo(new V3(o.x,0,o.z)) > 200) continue;
    const sc = e.g.scale.x, B = e.B, head = W(B.Head).add(new V3(0,.09*sc,0));
    const caps = [
      [head, head, .17*sc, 'head'],
      [W(B.Hips), W(B.Neck), .2*sc, 'body'],
      [W(B.LeftUpLeg), W(B.LeftLeg), .1, 'legs'], [W(B.LeftLeg), W(B.LeftFoot), .08, 'legs'],
      [W(B.RightUpLeg), W(B.RightLeg), .1, 'legs'], [W(B.RightLeg), W(B.RightFoot), .08, 'legs'],
      [W(B.LeftArm), W(B.LeftForeArm), .07, 'body'], [W(B.LeftForeArm), W(B.LeftHand), .06, 'body'],
      [W(B.RightArm), W(B.RightForeArm), .07, 'body'], [W(B.RightForeArm), W(B.RightHand), .06, 'body']
    ];
    for (const [p0,p1,r0,part] of caps){
      const r = part === 'head' || r0 > .19 ? r0 : r0*sc;
      const t = rayCapsule(o, d, p0, p1, r);
      if (t >= 0 && (!best || t < best.t)) best = { t, enemy:e, part, point:o.clone().addScaledVector(d, t) };
    }
  }
  return best;
}

function makeEnemy(x, z){
  if (SOLDIER) return makeHuman(x, z);
  const e = enemyState(x, z);
  const tone = TONES[Math.floor(Math.random()*TONES.length)];
  const M = (c, r=.88) => { const m = MS(c, r); e.mats.push(m); return m; };
  const mJ = M(tone.j), mP = M(tone.p), mV = M(0x2f322b), mG = M(0x24251f), mS = M(0x2a2826), mH = M(0x4a4b3c,.7), mGl = M(0x1f1e1c), mB = M(0x2a241d);
  const part = (geo, mat, p, parent, px=0, py=0, pz=0) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(px,py,pz); m.castShadow = true;
    m.userData = { enemy:e, part:p }; e.parts.push(m); parent.add(m); return m;
  };
  const g = new THREE.Group(); g.rotation.order = 'YXZ';
  const hips = new THREE.Group(); hips.position.y = .93; g.add(hips); e.hips = hips;
  part(EG.pelvis, mP, 'body', hips);
  e.thighs = []; e.knees = [];
  for (const sx of [-.1,.1]){
    const th = new THREE.Group(); th.position.set(sx,-.03,0); hips.add(th);
    part(EG.thigh, mP, 'legs', th, 0,-.22,0);
    const kn = new THREE.Group(); kn.position.y = -.44; th.add(kn);
    part(EG.shin, mP, 'legs', kn, 0,-.215,0);
    part(EG.boot, mB, 'legs', kn, 0,-.42,.04);
    e.thighs.push(th); e.knees.push(kn);
  }
  const spine = new THREE.Group(); spine.position.y = .06; hips.add(spine); e.spine = spine;
  part(EG.torso, mJ, 'body', spine, 0,.25,0);
  part(EG.vest, mV, 'body', spine, 0,.27,0);
  for (const px of [-.1,0,.1]) part(EG.pouch, mG, 'body', spine, px,.18,.16);
  part(EG.pack, mG, 'body', spine, 0,.3,-.2);
  part(EG.neck, mS, 'head', spine, 0,.53,0);
  const headG = new THREE.Group(); headG.position.y = .58; spine.add(headG); e.headG = headG;
  part(EG.head, mS, 'head', headG, 0,.1,0);
  const helmetG = new THREE.Group(); helmetG.position.y = .12; headG.add(helmetG); e.helmetG = helmetG;
  part(EG.helmet, mH, 'head', helmetG); part(EG.rim, mH, 'head', helmetG);
  part(EG.goggles, GOGGLE_MAT, 'head', headG, 0,.115,.095);
  const arms = [];
  for (const side of [-1,1]){
    const sh = new THREE.Group(); sh.position.set(side*.21,.44,0); spine.add(sh);
    part(EG.shoulder, mJ, 'body', spine, side*.21,.44,0);
    part(EG.upper, mJ, 'body', sh, 0,-.145,0);
    const el = new THREE.Group(); el.position.y = -.29; sh.add(el);
    part(EG.fore, mJ, 'body', el, 0,-.135,0);
    part(EG.hand, mGl, 'body', el, 0,-.3,0);
    arms.push({ sh, el });
  }
  const rifle = new THREE.Group(); rifle.position.set(-.09,.3,.24); spine.add(rifle);
  const rp = (geo, px, py, pz, rx=0) => { const m = new THREE.Mesh(geo, RIFLE_MAT); m.position.set(px,py,pz); m.rotation.x = rx; m.castShadow = true; rifle.add(m); };
  rp(EG.rBody, 0,0,.05); rp(EG.rBarrel, 0,.005,.35, HP); rp(EG.rMag, 0,-.09,.1,-.2); rp(EG.rStock, 0,-.01,-.22); rp(EG.rGrip, 0,-.07,-.05,.3); rp(EG.rSight, 0,.06,0);
  e.muzzle = new THREE.Object3D(); e.muzzle.position.set(0,.005,.47); rifle.add(e.muzzle);
  solveArm(arms[0].sh, arms[0].el, new V3(-.21,.44,0), new V3(-.09,.22,.19), .29, .3, new V3(-.6,-1,-.1));
  solveArm(arms[1].sh, arms[1].el, new V3(.21,.44,0), new V3(-.09,.26,.42), .29, .3, new V3(.7,-1,0));
  g.position.set(x,0,z); scene.add(g); e.g = g;
  return e;
}
const spawnPts = [];
for (let i=0;i<48;i++){
  const a = i/48*Math.PI*2;
  const x = Math.max(-42, Math.min(42, Math.sin(a)*60)), z = Math.max(-42, Math.min(42, Math.cos(a)*60));
  if (freeSpot(x,z,0.9)) spawnPts.push([x,z]);
}
function pickSpawn(){
  const eye = new V3(P.pos.x, 1.6, P.pos.z);
  const far = spawnPts.filter(([x,z]) => Math.hypot(x-P.pos.x, z-P.pos.z) > 26);
  far.sort(() => Math.random()-0.5);
  for (const s of far){ if (!lineOfSight(new V3(s[0],1.6,s[1]), eye)) return s; }
  return far[0] || spawnPts[Math.floor(Math.random()*spawnPts.length)];
}
let enemyNid = 0;
function spawnEnemy(forceType){
  let type = forceType || pickType(), x, z, y = 0;
  if (type === 'sniper'){
    const free = PERCHES.filter(p => !enemies.some(e => e.alive && e.type === 'sniper' && Math.hypot(e.pos.x - p[0], e.pos.z - p[1]) < 1));
    if (free.length){ [x, z, y] = free[Math.floor(Math.random()*free.length)]; } else type = 'grunt';
  }
  if (type !== 'sniper') [x, z] = packSpot() || pickSpawn();
  nextEnemyType = type; nextEnemySeed = ++enemyNid; const e = makeEnemy(x, z); nextEnemyType = null; e.nid = enemyNid; e.type = type; e.y = y;
  e.speed = 3.3 + Math.min(1.6, wave*0.13);
  applyType(e); enemies.push(e);
  return e;
}
function angleLerp(a, b, k){ const d = ((b - a + Math.PI) % (Math.PI*2) + Math.PI*2) % (Math.PI*2) - Math.PI; return a + d*k; }

function enemyShoot(e, dist){
  const muzzle = e.muzzle.getWorldPosition(new V3());
  let chance = 0.5 - dist*0.011 - (P.moving ? 0.12 : 0) - (P.sprinting ? 0.08 : 0) - (!P.onGround ? 0.1 : 0)
    - (P.crouch ? 0.07 : 0) - (P.slideT > 0 ? 0.15 : 0) - (e.crouching ? 0 : 0.03) + wave*0.025;
  chance = Math.max(0.05, Math.min(0.6, chance));
  if (e.type === 'rusher') chance = Math.max(.1, .8 - dist*.05 - (P.moving ? .1 : 0));
  const hit = Math.random() < chance;
  const target = new V3(P.pos.x, P.pos.y + camH - 0.35, P.pos.z);
  if (!hit){
    target.x += (Math.random()-.5)*2.4; target.y += (Math.random()-.3)*1.4; target.z += (Math.random()-.5)*2.4;
    target.sub(muzzle).multiplyScalar(1.6).add(muzzle);
  }
  spawnTracer(muzzle, target, 0xffa65c);
  spawnFlashSprite(muzzle);
  sfx.enemy(dist);
  e.recoil = .06; e.lastFire = T; e.shotN = (e.shotN || 0) + 1;
  const base = 8 + Math.floor(Math.random()*5) + Math.min(6, Math.floor(wave/2));
  if (hit) damagePlayer(e.type === 'rusher' ? 14 + Math.random()*7 : e.type === 'armored' ? base*1.25 : base, e.pos);
}

const CT = [-.15,-1.4], CK = [1.6,1.4];
function poseEnemy(e, dt){
  e.cf += ((e.crouching ? 1 : 0) - e.cf) * Math.min(1, dt*6);
  const sw = e.swing * (1 - e.cf), ph = e.walk;
  for (let i=0;i<2;i++){
    const s = i ? Math.PI : 0;
    e.thighs[i].rotation.x = -Math.sin(ph+s)*0.6*sw + e.cf*CT[i];
    e.knees[i].rotation.x = (0.08 + Math.max(0, Math.sin(ph+s+1.3))*0.95)*sw + e.cf*CK[i];
  }
  e.hips.position.y = .93 - Math.abs(Math.cos(ph))*0.035*sw - e.cf*.36;
  e.flinch = Math.max(0, e.flinch - dt*1.2); e.recoil = Math.max(0, e.recoil - dt*.6);
  e.spine.rotation.x = 0.1*sw + e.cf*0.12 + Math.sin(T*1.7 + e.seed)*0.02 - e.flinch*1.6 - e.recoil;
  e.spine.rotation.y = Math.sin(ph)*0.07*sw;
  e.headG.rotation.y = Math.sin(T*.6 + e.seed)*0.15*(e.sees ? 0 : 1);
}

function updateEnemy(e, dt){
  if (e.custom){ updateCustomBoss(e, dt); return; }
  animateSkull(e, dt);
  updateCallout(e, dt);
  if (e.alive){
    if (e.reloadT > 0){ e.reloadT -= dt; e.fireT = Math.max(e.fireT, .3); }
    if (e.retreatT > 0){ e.retreatT -= dt; e.fireT = Math.max(e.fireT, .25); }
    if (e.limpT > 0) e.limpT -= dt;
    if (e.headSnap > 0) e.headSnap = Math.max(0, e.headSnap - dt);
  }
  if (!e.alive && e.model){
    e.dieT += dt;
    const dur = e.deathType === 'crumple' ? 1.0 : e.deathType === 'blast' ? .55 : .7, k = Math.min(1, e.dieT/dur), ek = k*k;
    if (e.dieT < .25) e.mixer.update(dt*.5);
    if (e.deathType === 'blast' && e.killDir && e.dieT < .5 && !(e.y > 0)){ const sp = 5*(1 - e.dieT/.5); e.pos.x += e.killDir.x*sp*dt; e.pos.z += e.killDir.z*sp*dt; collide(e.pos, .4); }
    if (e.deathType === 'spin' && k < 1) e.g.rotation.y += dt*4*(1 - k);
    e.g.position.x = e.pos.x; e.g.position.z = e.pos.z;
    e.g.rotation.x = -ek*(e.deathType === 'blast' ? 1.6 : 1.45)*e.fallDir; e.g.rotation.z = ek*e.fallSide;
    const sink = e.deathType === 'crumple' ? -.35*Math.min(1, e.dieT/.35)*(1 - ek) : 0;
    e.g.position.y = (e.dieT > 1.9 ? -(e.dieT-1.9)*0.7 : 0) + .12*ek + sink + (e.y || 0);
    if (e.callSpr){ scene.remove(e.callSpr); e.callSpr = null; }
    if (e.glint){ scene.remove(e.glint); e.glint = null; }
    if (e.dieT > 3){ scene.remove(e.g); e.mats.forEach(m=>m.dispose()); e.gone = true; }
    return;
  }
  if (!e.alive){
    e.dieT += dt;
    const k = Math.min(1, e.dieT/0.6), ek = k*k;
    e.g.rotation.x = -ek*1.5*e.fallDir;
    e.knees[0].rotation.x = e.knees[1].rotation.x = Math.sin(Math.min(1,k*1.4)*Math.PI)*1.0 + .1;
    e.thighs[0].rotation.x = e.thighs[1].rotation.x = -Math.sin(Math.min(1,k*1.4)*Math.PI)*.5;
    e.spine.rotation.x = -.35*k*e.fallDir;
    e.hips.position.y = .93 - e.cf*.36*(1-k);
    e.g.position.y = (e.dieT > 1.8 ? -(e.dieT-1.8)*0.7 : 0) + .1*ek + (e.y || 0);
    if (e.glint){ scene.remove(e.glint); e.glint = null; }
    if (e.dieT > 2.9){ scene.remove(e.g); e.mats.forEach(m=>m.dispose()); e.gone = true; }
    return;
  }
  if (e.remote){ coopRemoteEnemy(e, dt); return; }
  if (e.type === 'boss' && e.stunT > 1) e.stunT = 1;
  if (e.type !== 'boss' || e.stunT <= 0) {} 
  if (e.stunT > 0){
    e.stunT -= dt; e.sees = false; e.reaction = .7; e.burst = 3; e.fireT = .5;
    e.face += Math.sin(T*5 + e.seed)*dt*1.6; e.spd *= .9; e.swing *= .9;
    e.g.position.set(e.pos.x, e.y || 0, e.pos.z); e.g.rotation.y = e.face;
    if (e.model) poseHuman(e, dt, false); else poseEnemy(e, dt);
    e.flash -= dt; return;
  }
  const dx = P.pos.x - e.pos.x, dz = P.pos.z - e.pos.z, dist = Math.hypot(dx,dz) || 0.001;
  e.losT -= dt;
  if (e.losT <= 0){
    e.losT = 0.15 + Math.random()*0.1;
    const fox = spPower() === 'fox' && !e.sees, hidden = specOn('fox') && !coopSwap && dist > 2.5, see = !hidden && dist < (e.type === 'sniper' ? 95 : 60)*(fox ? .62 : 1) && lineOfSight(new V3(e.pos.x, (e.y || 0) + 1.65 - e.cf*.36, e.pos.z), new V3(P.pos.x, P.pos.y + camH - .1, P.pos.z));
    if (see && !e.sees) e.reaction = Math.max(0.2, 0.6 - wave*0.03) + (fox ? .3 : 0);
    e.sees = see;
    if (!see) e.crouching = false;
  }
  if ((e.type === 'grunt' || e.type === 'armored') && wave >= 2){
    e.nadeCd -= dt; e.hidT = e.sees ? 0 : e.hidT + dt;
    if (e.nadeCd <= 0 && dist > 7 && dist < 24 && (e.hidT > 3 || Math.random() < dt*.04)){ enemyThrow(e); e.nadeCd = 14 + Math.random()*10; }
  }
  if (e.stagT > 0) e.stagT -= dt;
  let mx = 0, mz = 0, speed = e.speed*(e.stagT > 0 ? .25 : 1);
  if (e.type === 'boss' && !e.sees){ e.spinV *= .95; if (e.spinner) e.spinner.rotation.z += e.spinV*dt; if (e.mg === 'fire') { e.mg = 'cool'; e.mgT = 1.5; } }
  if (e.sees && dist < (e.type === 'sniper' ? 95 : e.type === 'boss' ? 50 : 36)){
   if (e.type === 'sniper'){
    e.faceT = Math.atan2(dx, dz); e.aimPitch = Math.atan2((P.pos.y + camH - .3) - (1.45 + e.y), dist);
    e.aimT += dt; if (e.aimT > 1.5){ sniperShoot(e, dist); e.aimT = -1.8 - Math.random(); }
   } else if (e.type === 'boss' && e.shogun){
    e.faceT = Math.atan2(dx, dz); e.aimPitch = 0;
    const r = updateShogun(e, dt, dist, dx, dz); mx = r.mx; mz = r.mz; speed = e.speed;
   } else if (e.type === 'boss'){
    if (dist > 9){ mx = dx/dist; mz = dz/dist; }
    speed = e.speed; e.faceT = Math.atan2(dx, dz); e.aimPitch = Math.atan2((P.pos.y + camH - .3) - 2.4, dist);
    updateBoss(e, dt, dist);
   } else if (e.type === 'rusher'){
    if (dist > 2.2){ mx = dx/dist; mz = dz/dist; }
    e.faceT = Math.atan2(dx, dz); e.aimPitch = Math.atan2((P.pos.y + camH - .3) - 1.45, dist);
    e.reaction -= dt; e.fireT -= dt;
    if (e.reaction <= 0 && e.fireT <= 0 && dist < 11){ enemyShoot(e, dist); e.fireT = .9; }
   } else {
    e.strafeT -= dt;
    if (e.strafeT <= 0){
      e.strafeT = 1 + Math.random()*1.6;
      const r = Math.random();
      e.crouching = !e.model && r < 0.3 && dist < 26;
      e.strafeDir = e.crouching ? 0 : (r < 0.5 ? 0 : (Math.random() < 0.5 ? -1 : 1));
    }
    const nx = dx/dist, nz = dz/dist, adv = e.crouching ? 0 : (dist > 18 ? 1 : (dist < 8 ? -0.6 : 0));
    mx = nx*adv + (-nz)*e.strafeDir*0.8; mz = nz*adv + nx*e.strafeDir*0.8;
    speed = e.speed*0.6;
    e.faceT = Math.atan2(dx, dz);
    e.aimPitch = Math.atan2((P.pos.y + camH - .3) - 1.45, dist);
    e.reaction -= dt;
    if (e.reaction <= 0 && e.cf > (e.crouching ? .7 : -1)){
      e.fireT -= dt;
      if (e.fireT <= 0){
        if (e.burst > 0){ enemyShoot(e, dist); e.burst--; e.fireT = 0.13; }
        else { e.burst = 2 + Math.floor(Math.random()*3); e.fireT = 1.1 + Math.random() - Math.min(0.5, wave*0.05);
          e.mags = (e.mags === undefined ? 2 + Math.floor(Math.random()*2) : e.mags) - 1;
          if (e.mags <= 0){ e.mags = 3; e.reloadT = 2.2; callout(e, 'Reloading!'); } }
      }
    }
   }
  } else {
    e.crouching = false;
    mx = dx/dist; mz = dz/dist;
    if (e.detourT > 0){ e.detourT -= dt; mx = e.detour.x; mz = e.detour.z; }
    e.faceT = Math.atan2(mx, mz);
  }
  if (e.flank && (e.type === 'grunt' || e.type === 'rusher') && dist > 9 && !(e.retreatT > 0)){
    if (!e.flankCalled && dist < 40){ e.flankCalled = true; callout(e, 'Flanking!'); }
    const px = -dz/dist*e.flank, pz = dx/dist*e.flank, tx = P.pos.x + px*12 - dx/dist*6, tz = P.pos.z + pz*12 - dz/dist*6;
    const fx = tx - e.pos.x, fz = tz - e.pos.z, fl = Math.hypot(fx, fz);
    if (fl < 3 || e.flankT > 14) e.flank = 0; else { mx = fx/fl; mz = fz/fl; e.flankT = (e.flankT || 0) + dt; }
  }
  if (e.retreatT > 0 && e.coverPt){
    const cx = e.coverPt.x - e.pos.x, cz = e.coverPt.z - e.pos.z, cl = Math.hypot(cx, cz);
    if (cl > .6){ mx = cx/cl; mz = cz/cl; } else { mx = mz = 0; e.crouching = true; }
  } else if (pushT > 0 && e.sees && (e.type === 'grunt' || e.type === 'armored') && dist > 5){ mx = dx/dist; mz = dz/dist; }
  speed *= (e.limpT > 0 ? .55 : 1);
  if (e.type === 'sniper'){ mx = 0; mz = 0; if (!e.sees){ e.aimT = Math.min(e.aimT, 0); e.faceT = Math.atan2(dx, dz); } }
  const ml = Math.hypot(mx, mz); if (ml > 1){ mx/=ml; mz/=ml; }
  const ox = e.pos.x, oz = e.pos.z;
  e.pos.x += mx*speed*dt; e.pos.z += mz*speed*dt;
  if (e.type !== 'sniper') collide(e.pos, 0.4);
  const pd = Math.hypot(e.pos.x-P.pos.x, e.pos.z-P.pos.z);
  if (pd < 0.9 && pd > 0.001){ e.pos.x = P.pos.x + (e.pos.x-P.pos.x)/pd*0.9; e.pos.z = P.pos.z + (e.pos.z-P.pos.z)/pd*0.9; }
  const moved = Math.hypot(e.pos.x-ox, e.pos.z-oz);
  if (ml > 0.3 && moved < speed*dt*0.3){
    e.stuck += dt;
    if (e.stuck > 0.35){
      e.stuck = 0;
      const a = Math.atan2(mx, mz) + (Math.random()<0.5?1:-1)*(Math.PI/2 + Math.random()*0.6);
      e.detour = { x:Math.sin(a), z:Math.cos(a) }; e.detourT = 0.8 + Math.random()*0.9;
    }
  } else e.stuck = Math.max(0, e.stuck - dt);
  e.face = angleLerp(e.face, e.faceT, Math.min(1, dt*10));
  e.walk += moved * 3.0;
  e.swing += (Math.min(1, moved/dt/2.5) - e.swing) * Math.min(1, dt*8);
  e.spd += (moved/dt - e.spd) * Math.min(1, dt*8);
  e.g.position.set(e.pos.x, e.y || 0, e.pos.z); e.g.rotation.y = e.face;
  if (e.model) poseHuman(e, dt, e.sees && dist < (e.type === 'sniper' ? 95 : 36) || e.type === 'boss'); else poseEnemy(e, dt);
  e.flash -= dt; const fl = e.flash > 0 ? 0.6 : 0; e.mats.forEach(m => m.emissive.setScalar(fl));
  if (e.glint){
    const k = e.sees && e.aimT > 0 ? Math.min(1, e.aimT/1.5) : 0;
    e.muzzle.getWorldPosition(e.glint.position); e.glint.position.y += .05;
    e.glint.material.opacity = k*(.7 + Math.random()*.3); e.glint.scale.setScalar(.6 + k*2.2);
  }
}
function separateEnemies(){
  for (let i=0;i<enemies.length;i++) for (let j=i+1;j<enemies.length;j++){
    const a = enemies[i], b = enemies[j]; if (!a.alive || !b.alive || a.y > 0 || b.y > 0) continue;
    const dx = b.pos.x-a.pos.x, dz = b.pos.z-a.pos.z, d = Math.hypot(dx,dz);
    if (d < 0.85 && d > 0.001){ const p = (0.85-d)/2; a.pos.x -= dx/d*p; a.pos.z -= dz/d*p; b.pos.x += dx/d*p; b.pos.z += dz/d*p; }
  }
}
function popHelmet(e, dir){
  const h = e.helmetG; scene.attach(h);
  debris.push({ obj:h, vel:new V3(dir.x*3 + (Math.random()-.5)*1.5, 3.5 + Math.random(), dir.z*3 + (Math.random()-.5)*1.5),
    spin:new V3((Math.random()-.5)*14, 0, (Math.random()-.5)*14), life:2.6 });
}

