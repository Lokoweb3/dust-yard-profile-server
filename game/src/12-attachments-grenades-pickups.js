/* ---------- Attachments ---------- */
const ATT = [
  { k:'grip', name:'Grip', unlock:2, desc:'Less recoil' },
  { k:'laser', name:'Laser', unlock:5, desc:'Tighter hip fire' },
  { k:'mag', name:'Extended mag', unlock:9, desc:'+50% capacity' },
  { k:'supp', name:'Suppressor', unlock:14, desc:'Quiet, no muzzle flash' }
];
const RES = { rifle:[90,210], smg:[96,224], shotgun:[18,42], sniper:[15,30], pistol:[36,84], launcher:[3,8] };
let gunSave = {}; try { gunSave = JSON.parse(store.get('dustyard-guns') || '{}') || {}; } catch(e){ gunSave = {}; }
function saveGuns(){ const o = {}; WEAPONS.forEach(W => { o[W.id] = { kills:W.kills, att:W.att, hs:W.hs, camo:W.camo }; }); store.set('dustyard-guns', JSON.stringify(o)); }
function addAttachVisuals(V){
  const mp = V.muzzle.position;
  V.suppMesh = zc(V.model, .02, .02, -mp.z, -mp.z + .15, mp.y, mBlack, 0, 16);
  V.laserG = new THREE.Group(); V.laserG.position.set(.03, mp.y - .03, mp.z + (V.laserZ || .14)); V.model.add(V.laserG);
  vp(V.laserG, Bx(.016,.02,.05), mBlack); vp(V.laserG, new THREE.SphereGeometry(.004,8,6), new THREE.MeshBasicMaterial({ color:0xff2a1a }), 0,0,-.026);
  V.gripMesh = vp(V.model, Bx(.03,.012,.08), mPad, 0, mp.y - .042, mp.z + (V.gripZ || .24));
}
function applyAtt(W){
  const a = W.att, V = W.vm;
  W.c = { mag:Math.round(W.mag*(a.mag ? 1.5 : 1)), reload:(W.reload || 0)*(a.mag ? 1.12 : 1)*(perk('reload') ? .85 : 1), kickV:W.kickV*(a.grip ? .68 : 1), kickH:W.kickH*(a.grip ? .6 : 1),
    move:W.move*(a.grip ? .8 : 1), hip:W.hip*(a.laser ? .6 : 1), range:W.range*(a.supp ? .85 : 1), supp:!!a.supp };
  W.ammo = Math.min(W.ammo, W.c.mag);
  V.suppMesh.visible = !!a.supp; V.laserG.visible = !!a.laser; V.gripMesh.visible = !!a.grip;
  if (V.mag) V.mag.scale.y = a.mag ? 1.35 : 1;
}
WEAPONS.forEach(W => {
  const sv = gunSave[W.id] || {};
  W.kills = sv.kills || 0; W.att = Object.assign({}, sv.att || {}); W.hs = sv.hs || 0; W.camo = sv.camo || null;
  W.res = RES[W.id][0]; W.maxRes = RES[W.id][1]; W.reserve = W.res;
  addAttachVisuals(W.vm); applyAtt(W); W.ammo = W.c.mag;
});

/* ---------- Grenades, smoke, flashbangs ---------- */
const nades = [], smokes = [], pickups = [];
let fragN = 2, tacN = 2, tacType = 'smoke', aimNade = null, cookT = 0, throwT = 0, meleeT = 0, meleeHit = false, flashFx = 0, slideKick = 0;
const NADE = { frag:{ fuse:2.6 }, smoke:{ fuse:1.3 }, flash:{ fuse:1.6 } };
const nadeGeo = { frag:new THREE.SphereGeometry(.07,12,10), smoke:Cy(.045,.045,.14,12), flash:Cy(.04,.04,.12,12) };
const nadeMat = { frag:MS(0x4a5235,.6,.2), smoke:MS(0x8a8a84,.6,.3), flash:MS(0x2a2c30,.5,.4) };
const arcGeo = new THREE.BufferGeometry(); arcGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(90*3), 3));
const arcLine = new THREE.Line(arcGeo, new THREE.LineBasicMaterial({ color:0xf0a93b, transparent:true, opacity:.9, depthTest:false }));
arcLine.visible = false; arcLine.frustumCulled = false; arcLine.renderOrder = 10; scene.add(arcLine);
const arcRing = new THREE.Mesh(new THREE.RingGeometry(.35,.5,28), new THREE.MeshBasicMaterial({ color:0xf0a93b, transparent:true, opacity:.85, side:THREE.DoubleSide, depthWrite:false }));
arcRing.rotation.x = -HP; arcRing.visible = false; scene.add(arcRing);
const boomLight = new THREE.PointLight(0xffa050, 0, 24); scene.add(boomLight);
function nadeStep(p, v, dt){
  v.y -= 16*dt; p.addScaledVector(v, dt); let hit = false;
  if (p.y < .07){ p.y = .07; if (v.y < 0){ if (v.y < -1.5) hit = true; v.y = -v.y*.35; v.x *= .65; v.z *= .65; } }
  const L = ARENA - .1;
  if (Math.abs(p.x) > L){ p.x = Math.sign(p.x)*L; v.x *= -.4; hit = true; }
  if (Math.abs(p.z) > L){ p.z = Math.sign(p.z)*L; v.z *= -.4; hit = true; }
  for (const b of boxes){
    const top = b.top || 1.2, r = .07;
    if ((b.bot !== undefined && p.y < b.bot - r) || p.y > top + r || p.x < b.minX - r || p.x > b.maxX + r || p.z < b.minZ - r || p.z > b.maxZ + r) continue;
    const pen = [p.x - (b.minX - r), (b.maxX + r) - p.x, p.z - (b.minZ - r), (b.maxZ + r) - p.z, (top + r) - p.y];
    let k = 0; for (let i=1;i<5;i++) if (pen[i] < pen[k]) k = i;
    if (k === 0){ p.x = b.minX - r; v.x = -Math.abs(v.x)*.4; } else if (k === 1){ p.x = b.maxX + r; v.x = Math.abs(v.x)*.4; }
    else if (k === 2){ p.z = b.minZ - r; v.z = -Math.abs(v.z)*.4; } else if (k === 3){ p.z = b.maxZ + r; v.z = Math.abs(v.z)*.4; }
    else { p.y = top + r; if (v.y < 0){ v.y = -v.y*.35; v.x *= .65; v.z *= .65; } }
    hit = true;
  }
  return hit;
}
function throwPos(){ return camera.localToWorld(new V3(.18,-.12,-.4)); }
function throwVel(){ const v = new V3(0,0,-1).applyQuaternion(camera.quaternion).multiplyScalar(15); v.y += 3.5; v.x += P.vel.x*.5; v.z += P.vel.z*.5; return v; }
function startNade(slot){
  if (hubMode) return;
  if (state !== 'play' || aimNade || throwT > 0 || meleeT > 0 || swapT > 0) return;
  if (slot === 'frag' ? fragN <= 0 : tacN <= 0){ sfx.click(); toast(slot === 'frag' ? 'No frag grenades left' : 'No tactical grenades left', 1500); return; }
  aimNade = slot === 'frag' ? 'frag' : tacType; cookT = 0; reloading = false; inspectT = 0; sfx.pin();
}
function releaseNade(){
  if (!aimNade) return;
  const k = aimNade; aimNade = null; arcLine.visible = arcRing.visible = false;
  if (k === 'frag') fragN--; else tacN--;
  const mesh = new THREE.Mesh(nadeGeo[k], nadeMat[k]); mesh.castShadow = true; scene.add(mesh);
  const pos = throwPos(); mesh.position.copy(pos);
  nades.push({ kind:k, mesh, pos, vel:throwVel(), fuse:NADE[k].fuse - (k === 'frag' ? cookT : 0) });
  throwT = .45; sfx.toss();
}
function explode(c, o={}){
  const pd = Math.hypot(c.x - P.pos.x, c.z - P.pos.z);
  sfx.boom(pd);
  const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map:flashTex, blending:THREE.AdditiveBlending, depthWrite:false, transparent:true, color:0xffc070 }));
  fl.position.copy(c); fl.position.y += .6; fl.scale.setScalar(7); scene.add(fl); effects.push({ obj:fl, life:.2, max:.2 });
  for (let i=0;i<7;i++) spawnPuff(c.clone().add(new V3((Math.random()-.5)*1.6, Math.random()*1.2, (Math.random()-.5)*1.6)), i < 2 ? 0xff9a3c : 0x5a5048, .6 + Math.random()*.5, 1.3 + Math.random(), .8);
  for (let i=0;i<14;i++){ const d = new V3(Math.random()-.5, Math.random()*.9 + .1, Math.random()-.5).normalize(); spawnTracer(c, c.clone().addScaledVector(d, 1 + Math.random()*2.5), 0xffb060); }
  boomLight.color.setHex(0xffa050); boomLight.position.copy(c); boomLight.position.y += 1; boomLight.intensity = 6;
  if (c.y < 2) decal(c.x, c.z, 2.6, 2.6, oilTex, Math.random()*6);
  const R = o.R || 7.5, from = c.clone(); from.y += .4;
  for (const b of barrels) if (b.alive && b.map === currentMap && !b.chainT && Math.hypot(b.m.position.x - c.x, b.m.position.z - c.z) < 3.6) b.chainT = .2 + Math.random()*.2;
  for (const e of enemies){
    if (!e.alive || o.noEnemies) continue;
    const d = Math.hypot(e.pos.x - c.x, e.pos.z - c.z); if (d > R) continue;
    if (e.air && Math.abs(c.y - e.y) > 4) continue;   // a blast on the ground can't reach the gunship
    if (!lineOfSight(from, new V3(e.pos.x, (e.y || 0) + 1, e.pos.z), true)) continue;
    damageEnemy(e, 230*(1 - d/R) + 20, false, new V3(e.pos.x - c.x, 0, e.pos.z - c.z).normalize(), o.src || 'nade');
  }
  if (!o.noPlayer && pd < 6.5 && Math.abs(c.y - P.pos.y) < 6 && lineOfSight(from, camera.position, true)) damagePlayer(100*(1 - pd/6.5) + 5, c, true);
  shake = Math.max(shake, .06*Math.max(0, 1 - pd/25)); rumble(1, 1, 400);
}
function makeSmoke(c){
  sfx.smoke();
  const sprites = [];
  for (let i=0;i<22;i++){
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map:smokeTex, color:0xd6d1c8, transparent:true, depthWrite:false, opacity:0 }));
    s.userData.o = new V3((Math.random()-.5)*7, Math.random()*3.2, (Math.random()-.5)*7); s.userData.sc = 3.5 + Math.random()*2.5;
    s.position.copy(c); scene.add(s); sprites.push(s);
  }
  smokes.push({ c:c.clone(), r:4.3, t:0, life:15, sprites });
}
function smokeBlocks(a, b){
  for (const s of smokes){
    if (s.t < .6 || s.t > s.life - 1.5) continue;
    const ctr = new V3(s.c.x, 1.4, s.c.z), ab = new V3().subVectors(b, a), t = Math.max(0, Math.min(1, new V3().subVectors(ctr, a).dot(ab)/ab.lengthSq()));
    if (a.clone().addScaledVector(ab, t).distanceTo(ctr) < s.r) return true;
  }
  return false;
}
function flashBang(c){
  const pd = c.distanceTo(P.pos);
  sfx.bang(pd);
  const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map:flashTex, blending:THREE.AdditiveBlending, depthWrite:false, transparent:true, color:0xffffff }));
  fl.position.copy(c); fl.position.y += .4; fl.scale.setScalar(9); scene.add(fl); effects.push({ obj:fl, life:.3, max:.3 });
  boomLight.color.setHex(0xffffff); boomLight.position.copy(c); boomLight.position.y += 1; boomLight.intensity = 9;
  const from = c.clone(); from.y += .3;
  for (const e of enemies){
    if (!e.alive || e.air) continue;
    const d = Math.hypot(e.pos.x - c.x, e.pos.z - c.z);
    if (d < 13 && lineOfSight(from, new V3(e.pos.x, 1.5, e.pos.z), true)){ e.stunT = 4.5*(1 - d/16); e.sees = false; e.crouching = false; e.flinch = .25; }
  }
  if (pd < 14 && lineOfSight(from, camera.position, true)){
    const dir = new V3().subVectors(c, camera.position).normalize(), fwd = new V3(0,0,-1).applyQuaternion(camera.quaternion);
    const amt = (1 - pd/14)*(.35 + .65*Math.max(0, fwd.dot(dir)));
    flashFx = Math.max(flashFx, amt*3.2); sfx.ring(amt);
  }
}
function detonate(n){
  scene.remove(n.mesh);
  if (n.kind === 'frag') explode(n.pos, n.enemy ? { noEnemies:true } : {}); else if (n.kind === 'smoke') makeSmoke(n.pos); else flashBang(n.pos);
}

/* ---------- Pickups ---------- */
const crossTex = canvasTex(64,64,(g)=>{ g.fillStyle='#f2f2ee'; g.fillRect(0,0,64,64); g.fillStyle='#d42b2b'; g.fillRect(24,10,16,44); g.fillRect(10,24,44,16); });
const ammoTex = canvasTex(64,64,(g)=>{ g.fillStyle='#4f5636'; g.fillRect(0,0,64,64); g.fillStyle='#e0b23a'; g.fillRect(0,24,64,16); g.fillStyle='#1d1d1d'; g.font='bold 13px sans-serif'; g.fillText('AMMO',14,37); });
const PK = {
  ammo:{ geo:Bx(.42,.26,.26), mat:MS(0xffffff,.8,0,{ map:ammoTex }), ring:0xe0b23a },
  health:{ geo:Bx(.32,.24,.32), mat:MS(0xffffff,.7,0,{ map:crossTex }), ring:0xff5050 },
  nade:{ geo:new THREE.SphereGeometry(.13,12,10), mat:MS(0x4a5235,.6,.2), ring:0x9fd36a },
  rocket:{ geo:new THREE.CylinderGeometry(.09,.09,.7,12).rotateZ(Math.PI/2), mat:rocketMat, ring:0xff7a30 }
};
function spawnPickup(kind, x, z){
  const g = new THREE.Group(), m = new THREE.Mesh(PK[kind].geo, PK[kind].mat); m.castShadow = true; g.add(m);
  const ring = new THREE.Mesh(new THREE.RingGeometry(.35,.46,24), new THREE.MeshBasicMaterial({ color:PK[kind].ring, transparent:true, opacity:.75, side:THREE.DoubleSide, depthWrite:false, blending:THREE.AdditiveBlending }));
  ring.rotation.x = -HP; ring.position.y = -.33; g.add(ring);
  g.position.set(x, .4, z); scene.add(g); pickups.push({ kind, g, m, t:0, life:30 });
}
function collect(p){
  if (p.kind === 'ammo'){ WEAPONS.forEach(W => { W.reserve = Math.min(W.maxRes, W.reserve + Math.round(W.c.mag*(perk('scav') ? 1.5 : 1))); }); feed('+Ammo'); }
  else if (p.kind === 'health'){ P.hp = Math.min(maxHP(), P.hp + 50); feed('+Health'); }
  else if (p.kind === 'rocket'){ const W = WEAPONS.find(w => w.id === 'launcher'); if (W) W.reserve = Math.min(W.maxRes, W.reserve + 3); feed('+3 rockets', true); }
  else { fragN = Math.min(nadeCap(), fragN + 1); tacN = Math.min(nadeCap(), tacN + 1); feed('+Grenades'); }
  sfx.pickup();
}
function dropLoot(e){
  const W = cur(), low = W.ammo + W.reserve < W.c.mag*1.5, r = Math.random();
  const kind = low || r < .5 ? 'ammo' : r < .75 ? 'health' : r < .9 ? 'nade' : null;
  let x = e.pos.x, z = e.pos.z;
  if (e.y > 0){ const d = Math.hypot(P.pos.x - x, P.pos.z - z) || 1; x += (P.pos.x - x)/d*4; z += (P.pos.z - z)/d*4; }
  if (kind) spawnPickup(kind, x, z);
}
function autoSwitch(){
  const order = [4, 0, 1, 2, 3, 5].filter(i => i !== cw && WEAPONS[i].ammo + WEAPONS[i].reserve > 0);
  if (order.length){ toast('Out of ammo. Switching weapon.', 1500); selectWeapon(order[0]); }
  else toast('Out of ammo. Find ammo drops from enemies.', 2000);
}

