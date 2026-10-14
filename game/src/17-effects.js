/* ---------- Effects ---------- */
const effects = [], shells = [], debris = [];
/* ---------- Combat feel: hit effects, callouts, echoes ---------- */
const dropGeo = new THREE.SphereGeometry(.025, 5, 4), dropMat = new THREE.MeshBasicMaterial({ color:0x5a0c0c });
const drops = [];
function hitFx(e, p, part, dir){
  const armored = (e.type === 'armored' || e.type === 'boss' && e.custom !== 'alpha') && part !== 'head';
  if (armored){
    spawnPuff(p, 0xffd27a, .05, .12);
    for (let i=0;i<5;i++){ const d = new V3(Math.random()-.5, Math.random()*.8, Math.random()-.5).normalize(); spawnTracer(p, p.clone().addScaledVector(d, .25 + Math.random()*.35), 0xffd060); }
    sfx.ping();
    return;
  }
  spawnPuff(p, 0x7a1414, part === 'head' ? .2 : .12, .3);
  spawnPuff(p.clone().addScaledVector(dir || new V3(), .25), 0x4a0d0d, part === 'head' ? .35 : .2, .55, .1);
  for (let i=0;i<(part === 'head' ? 7 : 4) && drops.length < 80;i++){
    const m = new THREE.Mesh(dropGeo, dropMat); m.position.copy(p); scene.add(m);
    const v = (dir ? dir.clone() : new V3()).multiplyScalar(1.5 + Math.random()*2).add(new V3((Math.random()-.5)*1.6, Math.random()*1.6, (Math.random()-.5)*1.6));
    drops.push({ m, v, t:1.2 });
  }
  if (part === 'head') sfx.headshot();
}
function updateDrops(dt){
  for (let i=drops.length-1;i>=0;i--){
    const d = drops[i]; d.t -= dt; d.v.y -= 14*dt; d.m.position.addScaledVector(d.v, dt);
    if (d.m.position.y < .02 || d.t <= 0){ if (d.m.position.y < .05 && Math.random() < .25 && holes.length < 200) bloodDot(d.m.position); scene.remove(d.m); drops.splice(i,1); }
  }
}
const bloodTex = canvasTex(64,64,(g)=>{ g.clearRect(0,0,64,64); g.fillStyle = 'rgba(70,8,8,.85)'; for (let i=0;i<7;i++){ g.beginPath(); g.arc(32 + (Math.random()-.5)*26, 32 + (Math.random()-.5)*26, 4 + Math.random()*9, 0, Math.PI*2); g.fill(); } });
const bloodMat = new THREE.MeshBasicMaterial({ map:bloodTex, transparent:true, depthWrite:false, polygonOffset:true, polygonOffsetFactor:-3 });
function bloodDot(p){ const m = new THREE.Mesh(new THREE.PlaneGeometry(.35,.35), bloodMat); m.rotation.set(-HP, 0, Math.random()*6); m.position.set(p.x, .025, p.z); scene.add(m); holes.push(m); }
// raider callouts float above their heads
const calloutTex = new Map(); let lastCallout = -99;
function callout(e, text){
  if (!e.alive || T - lastCallout < 1.1) return;
  lastCallout = T;
  let t = calloutTex.get(text);
  if (!t){ const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
    g.fillStyle = 'rgba(15,10,10,.72)'; g.fillRect(4,8,248,48); g.strokeStyle = '#ff6a50'; g.lineWidth = 3; g.strokeRect(4,8,248,48);
    g.fillStyle = '#ffd9c8'; g.font = '700 30px "Barlow Condensed", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 33);
    t = new THREE.CanvasTexture(c); calloutTex.set(text, t); }
  if (e.callSpr) scene.remove(e.callSpr);
  e.callSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map:t, transparent:true, depthWrite:false })); e.callSpr.scale.set(1.5,.375,1); scene.add(e.callSpr); e.callT = 1.6;
  const d = Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z); if (d < 35) sfx.radio2(1 - d/35);
}
function updateCallout(e, dt){
  if (!e.callSpr) return;
  e.callT -= dt; e.callSpr.position.set(e.pos.x, (e.y || 0) + 2.45*e.g.scale.x, e.pos.z); e.callSpr.material.opacity = Math.min(1, e.callT*2);
  if (e.callT <= 0 || !e.alive){ scene.remove(e.callSpr); e.callSpr = null; }
}
// squad behaviour: occasional coordinated pushes
let pushT = 0, pushCd = 14;
function updateSquad(dt){
  if (pushT > 0) pushT -= dt;
  pushCd -= dt;
  if (pushCd <= 0){
    pushCd = 14 + Math.random()*8;
    const eng = enemies.filter(e => e.alive && e.sees && (e.type === 'grunt' || e.type === 'armored') && !(e.retreatT > 0));
    if (eng.length >= 3){ pushT = 3.5; callout(eng[Math.floor(Math.random()*eng.length)], 'Push! Push!'); }
  }
}
function coverPoint(e){
  let best = null, bd = 30;
  for (const b of boxes){
    const top = b.top || 1.2; if (top < .8 || top > 6) continue;
    const cx = (b.minX + b.maxX)/2, cz = (b.minZ + b.maxZ)/2, d = Math.hypot(cx - e.pos.x, cz - e.pos.z);
    if (d > bd) continue;
    const ax = cx - P.pos.x, az = cz - P.pos.z, al = Math.hypot(ax, az) || 1, half = Math.max(b.maxX - b.minX, b.maxZ - b.minZ)/2 + 1.1;
    const px = cx + ax/al*half, pz = cz + az/al*half;
    if (!freeSpot(px, pz, .45)) continue;
    bd = d; best = new V3(px, 0, pz);
  }
  return best;
}
// distant battle sounds and gunshot echoes
let ambT = 6;
function updateAmbience(dt){
  if (state !== 'play' || hubMode) return;
  ambT -= dt;
  if (ambT <= 0){ ambT = 7 + Math.random()*9; const n = 2 + Math.floor(Math.random()*5), v = .035 + Math.random()*.04; for (let i=0;i<n;i++) sfx.distant(v, i*(.09 + Math.random()*.05)); }
}

const puffGeo = new THREE.SphereGeometry(1, 8, 6);
const tracerGeo = new THREE.BoxGeometry(.018,.018,1); tracerGeo.translate(0,0,.5);
const shellGeo = Cy(.005,.005,.024,6);
function spawnPuff(p, color, size, life=.35, rise=0){
  if (effects.length > 260) return;
  const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color, transparent:true, opacity:.85, depthWrite:false }));
  m.position.copy(p); m.scale.setScalar(size*0.4); scene.add(m);
  effects.push({ obj:m, life, max:life, grow:size*3*(.35/life), rise });
}
function spawnTracer(a, b, color=0xffd38a){
  if (effects.length > 300) return;
  const m = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({ color, transparent:true, opacity:.9, depthWrite:false }));
  m.position.copy(a); m.lookAt(b); m.scale.z = a.distanceTo(b); scene.add(m);
  effects.push({ obj:m, life:.07, max:.07 });
}
function spawnFlashSprite(p){
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map:flashTex, blending:THREE.AdditiveBlending, depthWrite:false, transparent:true }));
  s.position.copy(p); s.scale.setScalar(.7); scene.add(s);
  effects.push({ obj:s, life:.06, max:.06 });
}
const shellGeoBig = Cy(.008,.008,.04,8), shellGeoLong = Cy(.006,.006,.05,8);
function spawnShell(pos, kind){
  const m = new THREE.Mesh(kind === 'shotgun' ? shellGeoBig : kind === 'sniper' ? shellGeoLong : shellGeo, kind === 'shotgun' ? mShellRed : mBrass);
  m.position.copy(pos); m.rotation.z = HP;
  gunScene.add(m);
  shells.push({ obj:m, vel:new V3(.7+Math.random()*.35, .55+Math.random()*.35, .12+Math.random()*.1), spin:new V3(Math.random()*20, Math.random()*20, 10), life:.5 });
}
function updateEffects(dt){
  for (let i=effects.length-1;i>=0;i--){
    const e = effects[i]; e.life -= dt;
    e.obj.material.opacity = Math.max(0, e.life/e.max) * 0.9;
    if (e.grow) e.obj.scale.addScalar(e.grow*dt);
    if (e.rise) e.obj.position.y += e.rise*dt;
    if (e.life <= 0){ scene.remove(e.obj); e.obj.material.dispose(); effects.splice(i,1); }
  }
  for (let i=shells.length-1;i>=0;i--){
    const s = shells[i]; s.life -= dt; s.vel.y -= 5*dt;
    s.obj.position.addScaledVector(s.vel, dt);
    s.obj.rotation.x += s.spin.x*dt; s.obj.rotation.y += s.spin.y*dt;
    if (s.life <= 0){ gunScene.remove(s.obj); shells.splice(i,1); }
  }
  for (let i=debris.length-1;i>=0;i--){
    const d = debris[i]; d.life -= dt;
    if (!d.rest){
      d.vel.y -= 14*dt; d.obj.position.addScaledVector(d.vel, dt);
      d.obj.rotation.x += d.spin.x*dt; d.obj.rotation.z += d.spin.z*dt;
      if (d.obj.position.y < .12){ d.obj.position.y = .12; if (Math.abs(d.vel.y) < 2) d.rest = true; d.vel.y *= -.35; d.vel.x *= .5; d.vel.z *= .5; d.spin.multiplyScalar(.5); }
    }
    if (d.life <= 0){ scene.remove(d.obj); debris.splice(i,1); }
  }
}

const holeTex = canvasTex(32,32,(g)=>{ g.clearRect(0,0,32,32); const gr=g.createRadialGradient(16,16,0,16,16,15); gr.addColorStop(0,'rgba(0,0,0,.95)'); gr.addColorStop(.35,'rgba(20,16,12,.8)'); gr.addColorStop(1,'rgba(40,32,24,0)'); g.fillStyle=gr; g.fillRect(0,0,32,32); });
const holeMat = new THREE.MeshBasicMaterial({ map:holeTex, transparent:true, depthWrite:false, polygonOffset:true, polygonOffsetFactor:-4 });
const holeGeo = new THREE.PlaneGeometry(.11,.11), holes = [];
function impact(h){
  if (h.face){
    const n = h.face.normal.clone().transformDirection(h.object.matrixWorld);
    const m = new THREE.Mesh(holeGeo, holeMat); m.position.copy(h.point).addScaledVector(n, .012); m.lookAt(h.point.clone().add(n)); m.rotation.z = Math.random()*6;
    scene.add(m); holes.push(m); if (holes.length > 90) scene.remove(holes.shift());
    for (let i=0;i<4;i++){ const d = n.clone().add(new V3((Math.random()-.5)*1.4,(Math.random()-.2)*1.4,(Math.random()-.5)*1.4)).normalize(); spawnTracer(h.point, h.point.clone().addScaledVector(d, .15+Math.random()*.35), 0xffc070); }
  }
}

