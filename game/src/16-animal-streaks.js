/* ---------- Animal operators: war cry, Berserker and Alpha Rage ---------- */
const rage = { t:0, max:0, cd:0, swing:0, side:1 };
let rageFx = 0;   // 0..1, drives the red grade, the body glow and the claws
function animalSpecies(){ const o = opMine(); let sp = OP_ANIMAL.find(x => x[0] === o.f) || OP_ANIMAL[0]; if (sp[4]) sp = OP_ANIMAL.find(x => x[0] === sp[4]); return sp; }
const ARENA_EDGE = 44;
/* Pounce (3 kills): one huge leap onto the raider under your crosshair, up to 25 m away. You can't be hurt in
   the air, the target takes a heavy hit, and everyone near the landing is knocked down. */
let pounce = null;
function usePounce(){
  const f = new V3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw)), eye = new V3(P.pos.x, P.pos.y + 1.5, P.pos.z);
  let best = null, bestDot = .82;
  for (const e of enemies){
    if (!e.alive || e.air || e.type === 'boss' && e.pos.distanceTo(P.pos) < 3) continue;
    const d = new V3(e.pos.x - P.pos.x, 0, e.pos.z - P.pos.z), dist = d.length();
    if (dist > 25 || dist < 2) continue;
    const dot = d.normalize().dot(f);
    if (dot > bestDot && lineOfSight(eye, new V3(e.pos.x, (e.y || 0) + 1.2, e.pos.z), true)){ best = e; bestDot = dot; }
  }
  let to;
  if (best){ const d = new V3(best.pos.x - P.pos.x, 0, best.pos.z - P.pos.z), l = d.length(); to = P.pos.clone().addScaledVector(d.normalize(), l - 1.2); to.y = best.y || 0; }
  else { to = P.pos.clone().addScaledVector(f, 14); to.x = Math.max(-ARENA_EDGE, Math.min(ARENA_EDGE, to.x)); to.z = Math.max(-ARENA_EDGE, Math.min(ARENA_EDGE, to.z)); to.y = groundAt(to.x, to.z, 9); }
  const dist = P.pos.distanceTo(to);
  pounce = { from:P.pos.clone(), to, t:0, dur:.4 + dist/38, h:1.6 + dist*.13, target:best };
  reloading = false; ads = false; P.slideT = 0; P.crouch = false;
  sfx.roar(animalSpecies()[0]); rumble(.6, .5, 200);
  banner('Pounce');
}
function updatePounce(dt){
  const J = pounce; J.t += dt/J.dur;
  const k = Math.min(1, J.t), e = k < .5 ? 2*k*k : 1 - Math.pow(-2*k + 2, 2)/2;
  P.pos.lerpVectors(J.from, J.to, e); P.pos.y = J.from.y + (J.to.y - J.from.y)*k + 4*J.h*k*(1 - k);
  P.vel.set(0, 0, 0); P.onGround = false;
  if (k < 1) return;
  pounce = null; P.onGround = true; collide(P.pos, P.r, P.pos.y);
  const f = new V3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
  if (J.target && J.target.alive) damageEnemy(J.target, 170, false, f, 'claw');
  shockwave(P.pos, 4.5, 70, 1.8);
}
// knocks down and hurts every raider in a ring around a point
function shockwave(at, R, dmg, stun){
  for (const e of enemies){
    if (!e.alive || e.air) continue;
    const d = new V3(e.pos.x - at.x, 0, e.pos.z - at.z), dist = d.length();
    if (dist > R || Math.abs((e.y || 0) - at.y) > 2) continue;
    if (!e.remote){ e.stunT = Math.max(e.stunT || 0, stun*(1 - dist/(R*1.5))); e.flinch = .35; }
    damageEnemy(e, dmg*(1 - dist/(R*1.6)), false, d.normalize(), 'claw');
  }
  spawnPuff(at.clone().setY(at.y + .3), 0xc9ad83, 1.4, 1.2, 1); shake = Math.max(shake, .07); rumble(1, .9, 300); sfx.boom(2);
}

/* Stampede (5 kills): mark a line like an airstrike; a herd of glowing spirit beasts charges along it,
   through walls, trampling every raider in the way. */
const stampJobs = [];
// elephants: realistic shapes and wrinkled skin, wearing the game's war gear
const eleSkinTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#7a756f'; g.fillRect(0, 0, 256, 256);
  for (let i=0;i<5000;i++){ const v = 95 + Math.random()*40 | 0; g.fillStyle = `rgba(${v},${v - 4},${v - 8},.25)`; g.fillRect(Math.random()*256, Math.random()*256, 2, 2); }
  // elephant skin: a network of fine cracks (a jittered grid of cells), plus a few soft folds
  const N = 22, pts = [];
  for (let i=0;i<N;i++) for (let j=0;j<N;j++) pts.push([(i + .2 + Math.random()*.6)*256/N, (j + .2 + Math.random()*.6)*256/N]);
  const P = (i, j) => pts[((i + N) % N)*N + ((j + N) % N)], wrapPt = (i, j) => { const q = P(i, j); return [q[0] + (i < 0 ? -256 : i >= N ? 256 : 0), q[1] + (j < 0 ? -256 : j >= N ? 256 : 0)]; };
  g.lineCap = 'round';
  for (let i=-1;i<=N;i++) for (let j=-1;j<=N;j++){
    const a = wrapPt(i, j);
    for (const [di, dj] of [[1, 0], [0, 1]]){ const b = wrapPt(i + di, j + dj);
      g.strokeStyle = `rgba(38,34,31,${.28 + Math.random()*.25})`; g.lineWidth = .7 + Math.random()*.9; g.beginPath(); g.moveTo(a[0], a[1]);
      g.quadraticCurveTo((a[0] + b[0])/2 + (Math.random() - .5)*5, (a[1] + b[1])/2 + (Math.random() - .5)*5, b[0], b[1]); g.stroke(); }
  }
  for (let i=0;i<14;i++){ const y = Math.random()*256, ph = Math.random()*6;
    g.strokeStyle = 'rgba(40,36,33,.22)'; g.lineWidth = 2.2; g.beginPath(); for (let x = -4; x <= 260; x += 6){ const yy = y + Math.sin(x*.04 + ph)*3; x < 0 ? g.moveTo(x, yy) : g.lineTo(x, yy); } g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); return t; })();
const eleSkin = new THREE.MeshStandardMaterial({ color:0xb0aaa3, map:eleSkinTex, bumpMap:eleSkinTex, bumpScale:.025, roughness:1 });
const eleDark = new THREE.MeshStandardMaterial({ color:0x8a847d, map:eleSkinTex, bumpMap:eleSkinTex, bumpScale:.03, roughness:1 });
const eleEar = new THREE.MeshStandardMaterial({ color:0xa59c96, map:eleSkinTex, bumpMap:eleSkinTex, bumpScale:.02, roughness:1, side:THREE.DoubleSide });
const eleNail = new THREE.MeshStandardMaterial({ color:0xd9d0bd, roughness:.6 }), eleTuft = new THREE.MeshStandardMaterial({ color:0x2a2622, roughness:1 });
// war gear in the game's colours: desert armour, olive cloth, red stripes, dark metal
const eleArmor = new THREE.MeshStandardMaterial({ color:0xc9b48a, roughness:.55, metalness:.25 }), eleCloth = new THREE.MeshStandardMaterial({ color:0x58663a, roughness:.9 });
const eleRed = new THREE.MeshStandardMaterial({ color:0xb8322a, roughness:.7 }), eleMetal = new THREE.MeshStandardMaterial({ color:0x2b2e31, roughness:.4, metalness:.7 });
const eleCrate = new THREE.MeshStandardMaterial({ color:0x4d5733, roughness:.8 }), eleRope = new THREE.MeshStandardMaterial({ color:0x6b5a3e, roughness:1 });
const eleTusk = new THREE.MeshStandardMaterial({ color:0xeee5d0, roughness:.35 }), eleEye = new THREE.MeshStandardMaterial({ color:0x1a120c, roughness:.15 });
// a sphere reshaped by a function, for smooth organic forms
function shapedSphere(wSeg, hSeg, fn){
  const geo = new THREE.SphereGeometry(1, wSeg, hSeg), p = geo.attributes.position, v = new V3();
  for (let i=0;i<p.count;i++){ v.fromBufferAttribute(p, i); fn(v); p.setXYZ(i, v.x, v.y, v.z); }
  geo.computeVertexNormals(); return geo;
}
// shared shapes (z is forward)
const eleBodyGeo = shapedSphere(40, 28, v => {
  const z = v.z, up = Math.max(0, v.y);
  v.y += .2*Math.exp(-((z - .35)**2)/.12)*up;                 // high shoulders
  v.y -= .14*Math.max(0, -z)*up;                              // back slopes down to the rump
  if (v.y < 0) v.y -= .12*(1 - z*z);                          // belly hangs low
  v.x *= 1 - .12*Math.max(0, z - .55) - .08*Math.max(0, -z - .6);
  v.set(v.x*1.12, v.y*1.12, v.z*1.85);
});
const eleHeadGeo = shapedSphere(32, 24, v => {
  if (v.y > .3) v.y += .1*Math.exp(-(v.x*v.x)/.15);           // domed forehead
  if (v.z > .2 && v.y < .2) v.z += .25*(v.z - .2);            // muzzle pushes forward into the trunk
  if (v.y < -.4) v.z *= .85;                                   // narrow chin
  v.set(v.x*.78, v.y*.86, v.z*.8);
});
// a fan-shaped ear, cupped slightly, hanging from its top front edge
const eleEarGeo = (() => {
  const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.bezierCurveTo(-.25, .35, -1.0, .45, -1.25, .05); sh.bezierCurveTo(-1.45, -.45, -1.15, -1.25, -.75, -1.45);
  sh.bezierCurveTo(-.45, -1.6, -.15, -1.2, -.12, -.85); sh.bezierCurveTo(-.1, -.5, .05, -.3, 0, 0);
  const geo = new THREE.ExtrudeGeometry(sh, { depth:.05, bevelEnabled:true, bevelThickness:.02, bevelSize:.025, bevelSegments:2, curveSegments:16 });
  const p = geo.attributes.position, v = new V3();
  for (let i=0;i<p.count;i++){ v.fromBufferAttribute(p, i); v.z += .12*Math.sin(Math.min(1, -v.x/1.3)*Math.PI); p.setXYZ(i, v.x, v.y, v.z); }
  geo.computeVertexNormals(); return geo;
})();
// a curved, tapering tusk
const eleTuskGeo = (() => {
  const curve = new THREE.QuadraticBezierCurve3(new V3(0, 0, 0), new V3(0, -.55, .35), new V3(.05, -.35, .95));
  const geo = new THREE.TubeGeometry(curve, 16, .09, 10, false), p = geo.attributes.position, v = new V3();
  for (let i=0;i<p.count;i++){ const t = Math.floor(i/11)/16, c = curve.getPoint(t); v.fromBufferAttribute(p, i).sub(c).multiplyScalar(1 - t*.8).add(c); p.setXYZ(i, v.x, v.y, v.z); }
  geo.computeVertexNormals(); return geo;
})();
function makeBeast(){
  // the armour wears the game's desert camo and the blanket its woodland camo (made later in the script, so set on first use)
  if (!eleArmor.map && typeof OP_PATTERNS !== 'undefined'){
    if (OP_PATTERNS.desertc){ eleArmor.map = OP_PATTERNS.desertc.map; eleArmor.color.set(0xffffff); eleArmor.needsUpdate = true; }
    if (OP_PATTERNS.woodland){ eleCloth.map = OP_PATTERNS.woodland.map; eleCloth.color.set(0xd8dccc); eleCloth.needsUpdate = true; }
  }
  const g = new THREE.Group(), mesh = (geo, mat, parent, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  mesh(eleBodyGeo, eleSkin, g, 0, 2.15, -.1);
  // head hangs low and forward from the shoulders
  const head = new THREE.Group(); head.position.set(0, 2.45, 1.75); g.add(head);
  mesh(eleHeadGeo, eleSkin, head);
  for (const sx of [-1, 1]){ const e = mesh(new THREE.SphereGeometry(.055, 10, 8), eleEye, head, sx*.5, .02, .45); e.scale.set(1, .7, 1); }
  // ears: big fans that flare out when charging
  const ears = [];
  for (const sx of [-1, 1]){ const e = new THREE.Group(); e.position.set(sx*.55, .35, -.25); head.add(e); const m = mesh(eleEarGeo, eleEar, e); m.rotation.y = sx > 0 ? Math.PI : 0; m.scale.set(1, 1, sx); ears.push(e); }
  // tusks
  for (const sx of [-1, 1]){ const t = mesh(eleTuskGeo, eleTusk, head, sx*.3, -.38, .45); t.rotation.y = -sx*.15;
    const cap = mesh(new THREE.ConeGeometry(.035, .16, 8), eleMetal, t, .05, -.33, .98); cap.rotation.x = 1.25; }   // metal tip caps
  // trunk: tapering segments with rounded joints, long enough to reach near the ground
  const trunk = []; let parent = head, r = .26;
  for (let i=0;i<9;i++){
    const seg = new THREE.Group(); seg.position.set(0, i ? -.24 : -.25, i ? 0 : .62); parent.add(seg);
    mesh(new THREE.CylinderGeometry(r*.9, r, .26, 14), eleSkin, seg, 0, -.12, 0);
    mesh(new THREE.SphereGeometry(r*.92, 14, 10), eleSkin, seg, 0, -.24, 0);
    trunk.push(seg); parent = seg; r *= .88;
  }
  // legs: thick columns with a knee, wide round feet and toenails
  const legs = [];
  for (const [x, z] of [[-.62, .75], [.62, .75], [-.6, -1.05], [.6, -1.05]]){
    const l = new THREE.Group(); l.position.set(x, 1.75, z); g.add(l);
    mesh(new THREE.SphereGeometry(.46, 16, 12), eleSkin, l, 0, 0, 0).scale.set(1, 1.2, 1.1);
    mesh(new THREE.CylinderGeometry(.4, .36, .9, 16), eleSkin, l, 0, -.5, 0);
    const knee = new THREE.Group(); knee.position.y = -.95; l.add(knee);
    mesh(new THREE.SphereGeometry(.37, 14, 10), eleSkin, knee);
    mesh(new THREE.CylinderGeometry(.36, .4, .75, 16), eleSkin, knee, 0, -.4, 0);
    mesh(new THREE.CylinderGeometry(.43, .45, .1, 16), eleDark, knee, 0, -.77, 0);
    for (const a of [-.5, 0, .5]){ const n = mesh(new THREE.SphereGeometry(.09, 8, 6), eleNail, knee, Math.sin(a)*.4, -.75, Math.cos(a)*.4); n.scale.set(1, .6, .6); }
    legs.push({ l, knee });
  }
  // ---- war gear ----
  const bx = (w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0, parent = g) => { const m = new THREE.Mesh(Bx(w, h, d), mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; parent.add(m); return m; };
  // saddle blanket over the back, draped down both sides, red stripe along the edge, held on by a girth rope
  bx(1.6, .08, 2.0, eleCloth, 0, 3.42, .05);
  for (const sx of [-1, 1]){ bx(.07, 1.05, 2.0, eleCloth, sx*.98, 2.95, .05, 0, 0, sx*.42); bx(.08, .12, 2.02, eleRed, sx*1.2, 2.47, .05, 0, 0, sx*.42); }
  const girth = new THREE.Mesh(new THREE.TorusGeometry(1.18, .045, 6, 32), eleRope); girth.position.set(0, 2.25, .35); girth.scale.set(1.02, 1.12, 1); g.add(girth);
  // cargo: ammo crates and a red flag on a pole
  bx(.62, .42, .5, eleCrate, -.36, 3.67, -.25); bx(.62, .42, .5, eleCrate, .36, 3.67, -.25); bx(.64, .05, .52, eleMetal, -.36, 3.89, -.25); bx(.64, .05, .52, eleMetal, .36, 3.89, -.25);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, 1.5, 6), eleMetal); pole.position.set(.5, 4.35, -.7); g.add(pole);
  bx(.04, .36, .58, eleRed, .5, 4.9, -1.0);
  // an armoured plate on the forehead, metal caps on the tusk tips
  const plate = mesh(new THREE.SphereGeometry(.66, 24, 14, 0, Math.PI*2, 0, Math.PI*.42), eleArmor, head, 0, .2, .2); plate.rotation.x = 1.05; plate.scale.set(1, 1, .55);
  bx(.95, .07, .08, eleRed, 0, .62, .32, -.3, 0, 0, head);
  mergeParts(g); mergeParts(head);
  // tail with a dark tuft
  const tail = new THREE.Group(); tail.position.set(0, 2.55, -2.05); g.add(tail);
  mesh(new THREE.CylinderGeometry(.04, .06, .9, 8), eleDark, tail, 0, -.45, 0); mesh(new THREE.SphereGeometry(.08, 8, 6), eleTuft, tail, 0, -.95, 0).scale.set(1, 1.6, 1); tail.rotation.x = -.25;
  g.scale.setScalar(.92 + Math.random()*.2);
  g.userData = { legs, head, ears, trunk, tail };
  return g;
}
function callStampede(p){
  airAim = false; airMark.visible = false; sInv.stampede--;
  const dir = new V3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw)).normalize(), side = new V3(-dir.z, 0, dir.x);
  const beasts = [];
  for (let i=0;i<8;i++){
    const g = makeBeast(), off = (i % 3 - 1)*3.6 + (Math.random() - .5), back = Math.floor(i/3)*4.6 + Math.random()*2;
    g.position.copy(p).addScaledVector(dir, -48 - back).addScaledVector(side, off); g.position.y = 0;
    g.lookAt(g.position.clone().add(dir)); scene.add(g); beasts.push({ g, hit:new Set(), ph:Math.random()*6 });
  }
  stampJobs.push({ beasts, dir, p:p.clone(), run:0, puffT:0 });
  sfx.trumpet(); setTimeout(() => sfx.trumpet(1.15), 450); banner('Stampede'); feed('War elephants incoming', true);
}
function updateStampedes(dt){
  for (let i=stampJobs.length-1;i>=0;i--){
    const S = stampJobs[i]; S.run += 22*dt; S.puffT -= dt;
    for (const b of S.beasts){
      b.g.position.addScaledVector(S.dir, 22*dt); b.ph += dt*14;
      const U = b.g.userData;
      // a lumbering gait: each leg swings from the hip and bends at the knee as it lifts
      U.legs.forEach((L, j) => { const a = b.ph*.7 + [0, Math.PI, Math.PI*.5, Math.PI*1.5][j], sw = Math.sin(a);
        L.l.rotation.x = sw*.38; L.knee.rotation.x = Math.max(0, Math.cos(a))*-.55; });
      // trunk swings and curls up a little at the tip; ears flared out as they charge
      U.trunk.forEach((t, j) => { t.rotation.x = (j > 5 ? -.22 : -.04) + Math.sin(b.ph*.35 - j*.45)*.09; t.rotation.z = Math.sin(b.ph*.25 - j*.4)*.07; });
      U.ears.forEach((e, j) => { e.rotation.y = (j ? -1 : 1)*(.75 + Math.sin(b.ph*.5)*.18); });
      U.head.rotation.x = Math.sin(b.ph*.7*2)*.04; U.tail.rotation.z = Math.sin(b.ph*.8)*.35;
      b.g.position.y = Math.abs(Math.sin(b.ph*.7))*.12;
      for (const e of enemies){
        if (!e.alive || e.air || b.hit.has(e)) continue;
        if (Math.hypot(e.pos.x - b.g.position.x, e.pos.z - b.g.position.z) < 2.4){ b.hit.add(e); if (!e.remote) e.flinch = .4; damageEnemy(e, 400, false, S.dir, 'stampede'); }
      }
    }
    if (S.puffT <= 0){ S.puffT = .08; const b = S.beasts[(Math.random()*S.beasts.length)|0]; spawnPuff(b.g.position.clone().setY(.4), 0xc9ad83, .9, 1.1, 1); }
    S.callT = (S.callT || 1.5) - dt; if (S.callT <= 0){ S.callT = 1.6 + Math.random()*1.5; sfx.trumpet(.9 + Math.random()*.3); }
    const near = Math.min(...S.beasts.map(b => b.g.position.distanceTo(P.pos)));
    if (near < 24){ shake = Math.max(shake, .04*(1 - near/24)); }
    if (S.run > 105){ for (const b of S.beasts) scene.remove(b.g); stampJobs.splice(i, 1); }
  }
}
function clearStampedes(){ for (const S of stampJobs) for (const b of S.beasts) scene.remove(b.g); stampJobs.length = 0; }

/* Apex Form (8 kills): grow into a giant for 20 s, seen in third person. Claws hit everything in front of you,
   landing a jump slams the ground, you take 75% less damage and kills heal you. */
function startRage(){
  rage.t = rage.max = 20; rage.cd = 0;
  reloading = false; ads = false; inspectT = 0;
  sfx.roar(animalSpecies()[0]); shake = Math.max(shake, .08); rumble(1, .9, 600);
  banner('Apex Form'); toast(isTouch ? 'Apex Form! Tap Fire to claw, jump to slam the ground.' : 'Apex Form! Fire to claw, jump and land to slam the ground.', 3500);
}
function rageKill(){ if (rage.t > 0) P.hp = Math.min(100, P.hp + 20); }
function clawSwipe(){
  if (rage.cd > 0 || P.down || P.dead || state !== 'play') return;
  rage.cd = .34; rage.swing = 1; rage.side = -rage.side; sfx.swish();
  const f = new V3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw)); let near = null, nd = 7, hits = 0;
  for (const e of enemies){
    if (!e.alive || e.air) continue;
    const d = new V3(e.pos.x - P.pos.x, 0, e.pos.z - P.pos.z), dist = d.length();
    if (Math.abs((e.y || 0) - P.pos.y) > 2.4) continue;
    const dot = d.normalize().dot(f);
    if (dist < 4.8 && dot > .2){ damageEnemy(e, 220, false, f, 'claw'); hits++; }
    else if (dist < nd && dot > .75){ near = e; nd = dist; }
  }
  if (!hits && near){ const d = new V3(near.pos.x - P.pos.x, 0, near.pos.z - P.pos.z), l = d.length(); P.pos.addScaledVector(d.normalize(), Math.max(0, l - 2.6)); collide(P.pos, .4); damageEnemy(near, 220, false, f, 'claw'); hits++; }
  if (hits){ sfx.stab(); shake = Math.max(shake, .04); rumble(.8, .6, 140); }
}
// first-person paws: furred forearms with three claws each, swiping in turn
const clawG = new THREE.Group(); clawG.visible = false; gunCam.add(clawG);
const clawPaws = [];
function buildClaws(){
  for (const c of [...clawG.children]) clawG.remove(c);
  clawPaws.length = 0;
  const sp = animalSpecies(), furC = furColor(sp);
  const fur = new THREE.MeshStandardMaterial({ color:furC, roughness:1, map:furTex }), claw = new THREE.MeshStandardMaterial({ color:0xf1ead8, roughness:.3, emissive:0xff3010, emissiveIntensity:0 });
  for (const side of [-1, 1]){
    const g = new THREE.Group();
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(.055, .07, .5, 12), fur); arm.rotation.x = HP; arm.position.set(0, 0, .22); g.add(arm);
    const paw = new THREE.Mesh(new THREE.SphereGeometry(.075, 14, 10), fur); paw.scale.set(1.1, .7, 1.2); g.add(paw);
    for (const o of [-.035, 0, .035]){ const c = new THREE.Mesh(new THREE.ConeGeometry(.011, sp[0] === 'ape' ? .06 : .13, 6), claw); c.rotation.x = -HP + .25; c.position.set(o, .01, -.13); g.add(c); }
    g.scale.setScalar(.85);
    g.userData = { side, rest:new V3(side*.23, -.21, -.46), claw };
    clawG.add(g); clawPaws.push(g);
  }
}
let apexK = 0;   // 0..1 while growing into or out of Apex Form
function updateRage(dt){
  if (rage.cd > 0) rage.cd -= dt;
  rage.swing = Math.max(0, rage.swing - dt*4.5);
  if (rage.t > 0){ rage.t -= dt; if (rage.t <= 0){ rage.t = 0; feed('Apex Form over'); } }
  apexK += ((rage.t > 0 ? 1 : 0) - apexK)*Math.min(1, dt*3);
  rageFx = rage.t > 0 ? Math.min(1, rage.t/1.5, (rage.max - rage.t)*3) : 0;
  clawG.visible = false;
  updateStampedes(dt);
}
function useBestStreak(){ if (airAim){ useStreak(aimKind); return; } for (const S of STREAKS.slice().reverse()) if (sInv[S.k] && !(S.k === 'drone' && drone)){ useStreak(S.k); return; } }
const airMark = new THREE.Group(); airMark.visible = false; scene.add(airMark);
const stampPath = new THREE.Mesh(new THREE.PlaneGeometry(10, 70), new THREE.MeshBasicMaterial({ color:0xffb340, transparent:true, opacity:.22, depthWrite:false, side:THREE.DoubleSide }));
stampPath.rotation.x = -Math.PI/2; stampPath.position.y = .07; stampPath.visible = false; airMark.add(stampPath);
{
  const r = new THREE.Mesh(new THREE.RingGeometry(2.6,3.1,40), new THREE.MeshBasicMaterial({ color:0xff3b2f, transparent:true, opacity:.85, side:THREE.DoubleSide, depthWrite:false }));
  r.rotation.x = -HP; r.position.y = .06; airMark.add(r);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(.08,.08,40,8,1,true), new THREE.MeshBasicMaterial({ color:0xff3b2f, transparent:true, opacity:.35, blending:THREE.AdditiveBlending, depthWrite:false }));
  beam.position.y = 20; airMark.add(beam);
}
function airTarget(){
  const dir = new V3(0,0,-1).applyQuaternion(camera.quaternion), o = camera.position.clone();
  ray.set(o, dir); ray.far = 150;
  const h = ray.intersectObjects(solids, false);
  let p = h.length ? h[0].point.clone() : null;
  if (dir.y < -.01){ const t = -o.y/dir.y; if (t < 150 && (!p || t < h[0].distance)) p = o.clone().addScaledVector(dir, t); }
  if (!p) p = o.clone().addScaledVector(new V3(dir.x, 0, dir.z).normalize(), 60);
  p.y = 0; p.x = Math.max(-44, Math.min(44, p.x)); p.z = Math.max(-44, Math.min(44, p.z));
  return p;
}
function makeJet(){
  const g = new THREE.Group(), mat = MS(0x55595e,.5,.5);
  const body = new THREE.Mesh(Cy(.6,.35,9,12), mat); body.rotation.x = HP; g.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(.6,2.2,12), mat); nose.rotation.x = HP; nose.position.z = 5.6; g.add(nose);
  const wing = new THREE.Mesh(Bx(9,.15,2.6), mat); wing.position.z = .3; g.add(wing);
  const tail = new THREE.Mesh(Bx(3.4,.12,1.2), mat); tail.position.z = -4; g.add(tail);
  const fin = new THREE.Mesh(Bx(.12,1.8,1.4), mat); fin.position.set(0,.9,-4); g.add(fin);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map:flashTex, color:0xffa040, blending:THREE.AdditiveBlending, transparent:true, depthWrite:false }));
  glow.position.z = -4.8; glow.scale.setScalar(2.5); g.add(glow);
  return g;
}
function callAirstrike(p){
  chalEvent('air');
  airAim = false; airMark.visible = false; sInv.air--;
  const dir = new V3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw)).normalize();
  const jet = makeJet(); jet.position.copy(p).addScaledVector(dir, -190); jet.position.y = 55;
  jet.lookAt(jet.position.clone().add(dir)); scene.add(jet);
  airJobs.push({ jet, dir, p:p.clone(), bombs:[-10,-5,0,5,10].map(k => ({ k, done:false })) });
  sfx.jet(); feed('Airstrike inbound');
}
function spawnDrone(){
  const g = new THREE.Group(), mat = MS(0x3a3d41,.5,.5);
  g.add(new THREE.Mesh(Bx(.6,.18,.6), mat));
  const rotors = [];
  for (const [x,z] of [[.45,.45],[-.45,.45],[.45,-.45],[-.45,-.45]]){
    const arm = new THREE.Mesh(Bx(.08,.05,.62), mat); arm.position.set(x/2,0,z/2); arm.rotation.y = Math.atan2(x,z); g.add(arm);
    const r = new THREE.Mesh(Cy(.26,.26,.01,16), new THREE.MeshBasicMaterial({ color:0x111111, transparent:true, opacity:.45 })); r.position.set(x,.08,z); g.add(r); rotors.push(r);
  }
  const eye = new THREE.Mesh(new THREE.SphereGeometry(.1,10,8), MS(0x111111,.2,.8)); eye.position.y = -.14; g.add(eye);
  const led = new THREE.Mesh(new THREE.SphereGeometry(.035,8,6), new THREE.MeshBasicMaterial({ color:0xff3b2f })); led.position.set(0,-.05,.31); g.add(led);
  g.position.set(P.pos.x, 8, P.pos.z); scene.add(g);
  drone = { g, t:30, cd:1, burst:0, target:null, scanT:0 };
}
function updateStreaks(dt){
  if (uavT > 0) uavT = Math.max(0, uavT - dt);
  if (airAim){
    airMark.visible = true; airMark.position.copy(airTarget()); stampPath.visible = aimKind === 'stampede';
    if (aimKind === 'stampede') airMark.rotation.y = P.yaw; else airMark.rotation.y += dt;
    if (ads){ airAim = false; airMark.visible = false; }
    else if (firing && fireQueued){ fireQueued = false; if (aimKind === 'stampede') callStampede(airMark.position.clone()); else callAirstrike(airMark.position); }
  }
  for (let i=airJobs.length-1;i>=0;i--){
    const j = airJobs[i];
    j.jet.position.addScaledVector(j.dir, 120*dt);
    const s = new V3().subVectors(j.jet.position, j.p).dot(j.dir);
    for (const b of j.bombs){
      if (!b.done && s >= b.k + 14){ b.done = true; const c = j.p.clone().addScaledVector(j.dir, b.k); c.x += (Math.random()-.5)*2; c.z += (Math.random()-.5)*2; explode(c, { noPlayer:true, src:'air', R:9 }); }
    }
    if (s > 220){ scene.remove(j.jet); airJobs.splice(i,1); }
  }
  if (drone){
    const d = drone; d.t -= dt;
    const want = new V3(P.pos.x + Math.sin(T*.5)*3, 5.5 + Math.sin(T*1.3)*.3, P.pos.z + Math.cos(T*.5)*3);
    if (d.t < 0) want.y = 40;
    d.g.position.lerp(want, Math.min(1, dt*1.5));
    d.scanT -= dt;
    if (d.scanT <= 0){
      d.scanT = .3; d.target = null; let bd = 42;
      for (const e of enemies){
        if (!e.alive) continue;
        const chest = new V3(e.pos.x, (e.y || 0) + 1.2, e.pos.z), dist = chest.distanceTo(d.g.position);
        if (dist < bd && lineOfSight(d.g.position, chest)){ bd = dist; d.target = e; }
      }
    }
    if (d.target && d.target.alive && d.t > 0){
      d.g.rotation.y = Math.atan2(d.target.pos.x - d.g.position.x, d.target.pos.z - d.g.position.z);
      d.cd -= dt;
      if (d.cd <= 0){
        if (d.burst <= 0) d.burst = 5;
        const chest = new V3(d.target.pos.x, (d.target.y || 0) + 1.2, d.target.pos.z), hit = Math.random() < .65;
        const end = hit ? chest : chest.clone().add(new V3((Math.random()-.5)*1.5, (Math.random()-.5), (Math.random()-.5)*1.5));
        spawnTracer(d.g.position.clone().setY(d.g.position.y - .15), end, 0xff6040); sfx.droneFire();
        if (hit) damageEnemy(d.target, 20, false, new V3().subVectors(chest, d.g.position).normalize(), 'drone');
        d.burst--; d.cd = d.burst > 0 ? .1 : .9;
      }
    }
    if (d.t < -3){ scene.remove(d.g); drone = null; }
  }
  // incoming grenade warning
  let near = null, nd = 9;
  for (const n of nades){ if (!n.enemy) continue; const dd = Math.hypot(n.pos.x - P.pos.x, n.pos.z - P.pos.z); if (dd < nd){ nd = dd; near = n; } }
  const w = $('nadeWarn');
  if (near){
    const ang = Math.atan2(near.pos.x - P.pos.x, near.pos.z - P.pos.z), rel = ang - (P.yaw + Math.PI);
    w.style.opacity = '1'; w.style.transform = `translate(-50%,-50%) rotate(${-rel}rad)`; w.firstElementChild.style.transform = `rotate(${rel}rad)`;
  } else w.style.opacity = '0';
}


function updateCombat(dt){
  // grenade aiming & cooking
  if (aimNade){
    cookT += dt;
    if (aimNade === 'frag' && cookT >= NADE.frag.fuse){ aimNade = null; fragN--; arcLine.visible = arcRing.visible = false; explode(P.pos.clone().setY(1)); }
    else {
      const p = throwPos(), v = throwVel(), arr = arcGeo.attributes.position.array; let n = 0;
      for (let i=0;i<90;i++){ arr[i*3] = p.x; arr[i*3+1] = p.y; arr[i*3+2] = p.z; n = i + 1; nadeStep(p, v, .033); if (p.y < .1 && v.lengthSq() < .4) break; }
      arcGeo.setDrawRange(0, n); arcGeo.attributes.position.needsUpdate = true;
      arcRing.position.set(p.x, p.y - .05, p.z); arcLine.visible = arcRing.visible = true;
    }
  }
  if (throwT > 0) throwT = Math.max(0, throwT - dt);
  for (let i=nades.length-1;i>=0;i--){
    const n = nades[i];
    for (let s=0;s<2;s++){ const sp = n.vel.length(); if (nadeStep(n.pos, n.vel, dt/2) && sp > 2.5) sfx.clink(); }
    n.mesh.position.copy(n.pos); n.mesh.rotation.x += n.vel.length()*dt*2; n.mesh.rotation.z += n.vel.x*dt;
    n.fuse -= dt; if (n.fuse <= 0){ detonate(n); nades.splice(i,1); }
  }
  for (let i=smokes.length-1;i>=0;i--){
    const s = smokes[i]; s.t += dt;
    const k = Math.min(1, s.t/1.2), fade = s.t > s.life - 3 ? Math.max(0, (s.life - s.t)/3) : 1;
    s.sprites.forEach((sp,j) => {
      sp.material.opacity = .92*k*fade*(headGear() === 'nvg' ? .3 : 1); sp.scale.setScalar(sp.userData.sc*(.4 + .6*k));
      sp.position.set(s.c.x + sp.userData.o.x*k + Math.sin(s.t*.3 + j)*.3, s.c.y + .8 + sp.userData.o.y*k + s.t*.04, s.c.z + sp.userData.o.z*k);
    });
    if (s.t > s.life){ s.sprites.forEach(sp => { scene.remove(sp); sp.material.dispose(); }); smokes.splice(i,1); }
  }
  boomLight.intensity = Math.max(0, boomLight.intensity - dt*30);
  flashFx = Math.max(0, flashFx - dt);
  // pickups
  for (let i=pickups.length-1;i>=0;i--){
    const p = pickups[i]; p.t += dt;
    p.m.rotation.y += dt*1.6; p.g.position.y = .4 + Math.sin(p.t*3)*.06;
    p.g.visible = p.life - p.t > 5 || Math.floor(p.t*6) % 2 === 0;
    if (Math.hypot(p.g.position.x - P.pos.x, p.g.position.z - P.pos.z) < 1.5 && P.pos.y < 1.5){ collect(p); scene.remove(p.g); pickups.splice(i,1); continue; }
    if (p.t > p.life){ scene.remove(p.g); pickups.splice(i,1); }
  }
  // knife
  if (meleeT > 0){
    meleeT -= dt;
    const kat = katanaOn(), G = kat ? katanaG : knifeG, p = Math.min(1, 1 - meleeT/meleeLen()), k = keyframe(kat ? KATANA_KEYS : KNIFE_KEYS, p);
    G.visible = true; G.position.set(k[0],k[1],k[2]); G.rotation.set(k[3],k[4],k[5]);
    slashArc.visible = kat && p > .3 && p < .75; if (slashArc.visible) slashArc.material.opacity = Math.sin((p - .3)/.45*Math.PI)*.55;
    if (!meleeHit && p > (kat ? .42 : .3)){ meleeHit = true; meleeStrike(); }
    if (meleeT <= 0){ meleeT = 0; knifeG.visible = false; katanaG.visible = false; slashArc.visible = false; }
  } else if (katanaOn() && !scoped){
    // between swings the sword is held ready at your right side
    katanaG.visible = true; const b = Math.sin(T*2)*.006, s2 = P.sprinting ? .08 : 0;
    katanaG.position.set(.22, -.32 + b - s2, -.46); katanaG.rotation.set(-.7 - s2*2, -.15, .25);
  } else katanaG.visible = false;
}


