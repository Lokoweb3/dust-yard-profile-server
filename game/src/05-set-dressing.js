/* ---------- Set dressing: building, sandbags, barriers, barrels, poles, fence ---------- */
function addCollider(x, z, w, d, top=1.2){ boxes.push({ minX:x-w/2, maxX:x+w/2, minZ:z-d/2, maxZ:z+d/2, top }); }
const bldTex = canvasTex(256,256,(g,w,h)=>{
  g.fillStyle='#b3a893'; g.fillRect(0,0,w,h); speckle(g,w,h,5000,'70,62,52','230,220,200');
  for (let i=0;i<14;i++){ const x=Math.random()*w; const gr=g.createLinearGradient(x,0,x,h*0.7); gr.addColorStop(0,'rgba(60,50,40,.35)'); gr.addColorStop(1,'rgba(60,50,40,0)'); g.fillStyle=gr; g.fillRect(x,0,6+Math.random()*14,h*0.7); }
  g.strokeStyle='rgba(50,42,34,.5)'; g.lineWidth=1.5;
  for (let i=0;i<6;i++){ let x=Math.random()*w, y=Math.random()*h; g.beginPath(); g.moveTo(x,y); for(let j=0;j<6;j++){ x+=(Math.random()-.5)*30; y+=Math.random()*22; g.lineTo(x,y);} g.stroke(); }
  g.fillStyle='rgba(60,52,44,.4)'; g.fillRect(0,h*0.48,w,6);
}, [2,1]);
const bMat = new THREE.MeshStandardMaterial({ map:bldTex, roughness:.95 });
function wallX(x0, x1, z, h, y0=0, collide=true){ addBox((x0+x1)/2, z, Math.abs(x1-x0), .4, h, bMat, y0, collide); }
function wallZ(z0, z1, x, h, y0=0, collide=true){ addBox(x, (z0+z1)/2, .4, Math.abs(z1-z0), h, bMat, y0, collide); }
// Ruined two-storey building (33,-30)
wallX(27,32,-25,3); wallX(34.4,39,-25,3); addBox(33.2,-25,2.4,.4,.7,bMat,2.3,false);
wallX(27,28.5,-25,2.3,3,false); addBox(29.25,-25,1.5,.4,.8,bMat,3,false); wallX(30,33.5,-25,2.3,3,false); addBox(34.25,-25,1.5,.4,.8,bMat,3,false); wallX(35,39,-25,1.2,3,false);
wallX(27,39,-35,3); wallX(27,32,-35,2.4,3,false); wallX(32,39,-35,1,3,false);
wallZ(-35,-31,27,3); wallZ(-29,-25,27,3); addBox(27,-30,.4,2,.7,bMat,2.3,false); wallZ(-35,-25,27,1.8,3,false);
wallZ(-35,-25,39,3); wallZ(-35,-29,39,2.6,3,false);
addBox(31,-30,8,10,.25,bMat,3,false);
for (let i=0;i<7;i++){ const m = addBox(29+Math.random()*9, -33+Math.random()*6, .3+Math.random()*.6, .3+Math.random()*.6, .2+Math.random()*.4, bMat, 0, false); m.rotation.set(Math.random()*.4, Math.random()*3, Math.random()*.4); }
for (let i=0;i<5;i++){ const m = addBox(26+Math.random()*1.2, -27+Math.random()*-6, .4+Math.random()*.5, .3+Math.random()*.5, .25+Math.random()*.3, bMat, 0, false); m.rotation.y = Math.random()*3; }

// Sandbags (one instanced mesh for all bags)
const bagTex = canvasTex(64,64,(g,w,h)=>{ g.fillStyle='#8f7d5a'; g.fillRect(0,0,w,h); g.strokeStyle='rgba(60,48,30,.35)'; for(let i=0;i<w;i+=3){ g.beginPath(); g.moveTo(i,0); g.lineTo(i,h); g.stroke(); g.beginPath(); g.moveTo(0,i); g.lineTo(w,i); g.stroke(); } speckle(g,w,h,300,'50,40,25','200,180,140'); });
const bagGeo = new THREE.SphereGeometry(1,12,7); bagGeo.scale(.3,.12,.18);
const bagMats = [];
function sandbagWall(x, z, len, alongX, layers=4){
  const n = Math.floor(len/.56);
  for (let l=0;l<layers;l++){
    const off = (l%2) ? .28 : 0;
    for (let i=0;i<n - (l%2);i++){
      const t = -len/2 + .28 + i*.56 + off;
      const m = new THREE.Matrix4().compose(
        new V3(alongX ? x+t : x + (Math.random()-.5)*.04, .11 + l*.21, alongX ? z + (Math.random()-.5)*.04 : z+t),
        new THREE.Quaternion().setFromEuler(new THREE.Euler((Math.random()-.5)*.08, (alongX ? 0 : Math.PI/2) + (Math.random()-.5)*.15, (Math.random()-.5)*.08)),
        new V3(1,1,1));
      bagMats.push(m);
    }
  }
  addCollider(x, z, alongX ? len : .42, alongX ? .42 : len, .11 + layers*.21);
}
sandbagWall(8,-24,3.6,true); sandbagWall(6.2,-25.9,3,false); sandbagWall(9.8,-25.9,3,false);
sandbagWall(0,30,4.4,true); sandbagWall(-30,-24,4.4,true); sandbagWall(22,-2,3.6,false); sandbagWall(-40,10,3.4,true,3);
const bags = new THREE.InstancedMesh(bagGeo, new THREE.MeshStandardMaterial({ map:bagTex, roughness:1 }), bagMats.length);
bagMats.forEach((m,i) => bags.setMatrixAt(i, m)); bags.castShadow = bags.receiveShadow = true;
scene.add(bags); solids.push(bags);

// Concrete jersey barriers
const jShape = new THREE.Shape();
[[.33,0],[.33,.08],[.16,.3],[.1,.82],[-.1,.82],[-.16,.3],[-.33,.08],[-.33,0]].forEach(([a,b],i)=>{ if(!i) jShape.moveTo(-.33,0); jShape.lineTo(a,b); });
const jGeo = new THREE.ExtrudeGeometry(jShape, { depth:3, bevelEnabled:false }); jGeo.translate(0,0,-1.5);
const jMat = new THREE.MeshStandardMaterial({ color:0xb8ad99, roughness:.95 });
function jersey(x, z, alongZ){
  const m = new THREE.Mesh(jGeo, jMat); m.position.set(x,0,z); m.rotation.y = alongZ ? 0 : Math.PI/2;
  m.castShadow = m.receiveShadow = true; worldParent.add(m); solids.push(m);
  addCollider(x, z, alongZ ? .66 : 3, alongZ ? 3 : .66, .82);
}
jersey(-14,12,true); jersey(18,18,false); jersey(-36,24,true); jersey(40,8,true); jersey(-24,-28,false);

// Barrels
function barrelTex(base){ return canvasTex(128,64,(g,w,h)=>{ g.fillStyle=base; g.fillRect(0,0,w,h);
  for (let i=0;i<260;i++){ g.fillStyle=`rgba(${70+Math.random()*40},40,20,${Math.random()*.45})`; g.fillRect(Math.random()*w,Math.random()*h,Math.random()*6+1,Math.random()*4+1); }
  g.fillStyle='rgba(0,0,0,.35)'; g.fillRect(0,h*.3,w,3); g.fillRect(0,h*.68,w,3); }); }
const barrelGeo = Cy(.3,.3,.9,18);
const barrelMats = [new THREE.MeshStandardMaterial({ map:barrelTex('#8b2a20'), roughness:.7, metalness:.3 }), new THREE.MeshStandardMaterial({ map:barrelTex('#2a4f7a'), roughness:.7, metalness:.3 })];
function barrel(x, z, c, tipped){
  const m = new THREE.Mesh(barrelGeo, barrelMats[c]); m.castShadow = m.receiveShadow = true;
  if (tipped){ m.rotation.set(0, Math.random()*3, HP); m.position.set(x,.3,z); } else { m.position.set(x,.45,z); m.rotation.y = Math.random()*3; }
  worldParent.add(m); solids.push(m); addCollider(x, z, tipped ? .9 : .6, tipped ? .9 : .6, tipped ? .6 : .9);
  if (c === 0 && !tipped) registerBarrel(m, boxes[boxes.length-1]);
}
barrel(-24,-8,0); barrel(-24.7,-7.3,0); barrel(-23.3,-7.2,1); barrel(26,22,1); barrel(26.7,22.6,0); barrel(-4,-14,0); barrel(-4.6,-13.3,1);
barrel(38,-18,0); barrel(11,13,1,true); barrel(-31,36,0); barrel(-30.3,36.7,0); barrel(36,40,1);

// Tyre stacks
const tyreGeo = new THREE.TorusGeometry(.3,.12,8,18); const tyreMat = new THREE.MeshStandardMaterial({ color:0x1d1c1b, roughness:.9 });
function tyres(x, z, n){ for (let i=0;i<n;i++){ const m = new THREE.Mesh(tyreGeo, tyreMat); m.rotation.x = HP; m.position.set(x+(Math.random()-.5)*.06, .12+i*.23, z+(Math.random()-.5)*.06); m.castShadow = true; worldParent.add(m); solids.push(m); } addCollider(x,z,.85,.85); }
tyres(-40,40,4); tyres(14,40,3); tyres(15,40.9,2); tyres(41,-41,4); tyres(-40,-14,3);

// Burnt-out car
const carMat = new THREE.MeshStandardMaterial({ map:containerTex('#3b2f29'), roughness:.9, metalness:.3 });
const carDark = new THREE.MeshStandardMaterial({ color:0x111111, roughness:.6 });
const car = new THREE.Group(); car.position.set(-10,0,21); scene.add(car);
const cbody = new THREE.Mesh(Bx(4.2,.85,1.8), carMat); cbody.position.y = .72; car.add(cbody);
const ccab = new THREE.Mesh(Bx(2.1,.75,1.62), carMat); ccab.position.set(-.3,1.5,0); car.add(ccab);
const cwin = new THREE.Mesh(Bx(2.14,.5,1.4), carDark); cwin.position.set(-.3,1.55,0); car.add(cwin);
for (const [wx,wz] of [[-1.35,.9],[1.35,.9],[-1.35,-.9],[1.35,-.9]]){ const w = new THREE.Mesh(Cy(.36,.36,.25,14), tyreMat); w.rotation.x = HP; w.position.set(wx,.36,wz); car.add(w); }
car.traverse(o => { if (o.isMesh){ o.castShadow = o.receiveShadow = true; solids.push(o); } });
car.rotation.z = .04; addCollider(-10,21,4.2,1.8,1.9);

// Light poles with glowing lamps
const poleMat = new THREE.MeshStandardMaterial({ color:0x55504a, roughness:.7, metalness:.4 });
const lampMat = new THREE.MeshStandardMaterial({ color:0xffe2b0, emissive:0xffd59a, emissiveIntensity:2.2 });
function pole(x, z){
  const g = new THREE.Group(); g.position.set(x,0,z); worldParent.add(g);
  const p = new THREE.Mesh(Cy(.07,.11,8,8), poleMat); p.position.y = 4; p.castShadow = true; g.add(p);
  const a = new THREE.Mesh(Bx(.08,.08,1.4), poleMat); a.position.set(0,7.9,.65); g.add(a);
  const l = new THREE.Mesh(Bx(.32,.12,.5), lampMat); l.position.set(0,7.82,1.3); g.add(l);
  g.rotation.y = Math.atan2(-x, -z); solids.push(p); addCollider(x,z,.3,.3,8);
}
pole(-43.3,-43.3); pole(43.3,43.3); pole(-43.3,43.3); pole(0,-43.5); pole(43.5,0); pole(-43.5,0);

// Chain-link fence on top of the perimeter wall
const fenceTex = canvasTex(32,32,(g,w,h)=>{ g.clearRect(0,0,w,h); g.strokeStyle='rgba(170,170,165,1)'; g.lineWidth=2; g.beginPath(); g.moveTo(0,0); g.lineTo(w,h); g.moveTo(w,0); g.lineTo(0,h); g.stroke(); });
const fenceMat = new THREE.MeshStandardMaterial({ map:fenceTex, transparent:true, alphaTest:.35, side:THREE.DoubleSide, roughness:.6, metalness:.5 });
for (const [x,z,ry] of [[0,-ARENA-.5,0],[0,ARENA+.5,0],[-ARENA-.5,0,HP],[ARENA+.5,0,HP]]){
  const t = fenceTex.clone(); t.needsUpdate = true; t.repeat.set(ARENA*2*2.5, 2.2*2.5);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(ARENA*2+1, 2.2), fenceMat.clone()); m.material.map = t;
  m.position.set(x,3.6+1.1,z); m.rotation.y = ry; scene.add(m);
  for (let i=-ARENA;i<=ARENA;i+=7.5){ const p = new THREE.Mesh(Cy(.05,.05,2.4,6), poleMat); p.position.set(ry ? x : i, 4.8, ry ? i : z); scene.add(p); }
}

// Ground decals: oil stains and tyre tracks
const oilTex = canvasTex(128,128,(g,w,h)=>{ g.clearRect(0,0,w,h); for(let i=0;i<9;i++){ const x=40+Math.random()*48, y=40+Math.random()*48, r=12+Math.random()*26; const gr=g.createRadialGradient(x,y,0,x,y,r); gr.addColorStop(0,'rgba(25,18,12,.55)'); gr.addColorStop(1,'rgba(25,18,12,0)'); g.fillStyle=gr; g.fillRect(0,0,w,h);} });
const trackTex = canvasTex(64,256,(g,w,h)=>{ g.clearRect(0,0,w,h); for (const x of [10,44]){ for(let y=0;y<h;y+=6){ g.fillStyle=`rgba(80,62,42,${.18+Math.random()*.12})`; g.fillRect(x+(Math.random()-.5)*2,y,10,4); } } });
function decal(x, z, w, d, tex, rot){
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w,d), new THREE.MeshStandardMaterial({ map:tex, transparent:true, depthWrite:false, roughness:1, polygonOffset:true, polygonOffsetFactor:-2 }));
  m.rotation.set(-Math.PI/2, 0, rot); m.position.set(x,.015,z); m.receiveShadow = true; scene.add(m);
}
decal(-10,21,6,6,oilTex,0); decal(8,-30,4,4,oilTex,1); decal(-24,-8,3,3,oilTex,2); decal(30,-20,5,5,oilTex,.5);
decal(-2,4,3,40,trackTex,.15); decal(14,-14,3,30,trackTex,1.2); decal(-30,0,3,34,trackTex,-.3);

/* ---------- Atmosphere: smoke plumes and drifting dust ---------- */
const smokeTex = canvasTex(64,64,(g,w,h)=>{ g.clearRect(0,0,w,h); for(let i=0;i<6;i++){ const x=20+Math.random()*24, y=20+Math.random()*24, r=14+Math.random()*12; const gr=g.createRadialGradient(x,y,0,x,y,r); gr.addColorStop(0,'rgba(255,255,255,.5)'); gr.addColorStop(1,'rgba(255,255,255,0)'); g.fillStyle=gr; g.fillRect(0,0,w,h);} });
const plumes = [];
function plume(x, y, z, scale, height, count, color, op){
  const sprites = [];
  for (let i=0;i<count;i++){
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map:smokeTex, color, transparent:true, depthWrite:false, opacity:0 }));
    s.userData.phase = i/count; s.userData.rot = Math.random()*6; scene.add(s); sprites.push(s);
  }
  plumes.push({ x, y, z, scale, height, sprites, op, speed:.05 + Math.random()*.02 });
}
plume(-10.6,1.6,21,1.4,14,22,0x3b3631,.55);
plume(-70,4,-90,10,70,26,0x4a4440,.5);
plume(95,4,40,8,60,24,0x585048,.45);
const DUST = 260, dustPos = new Float32Array(DUST*3), dustBase = [];
for (let i=0;i<DUST;i++) dustBase.push([Math.random()*30, Math.random()*8, Math.random()*30, Math.random()*.4+.1]);
const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos,3));
const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color:0xffe6bf, size:.045, transparent:true, opacity:.55, depthWrite:false }));
dust.frustumCulled = false; scene.add(dust);
function updateAtmos(t){
  for (const p of plumes){
    for (const s of p.sprites){
      const k = (t*p.speed + s.userData.phase) % 1;
      s.position.set(p.x + k*k*p.height*.35 + Math.sin(k*6+s.userData.rot)*p.scale*.3, p.y + k*p.height, p.z + k*p.height*.12);
      s.scale.setScalar(p.scale*(.6 + k*2.6));
      s.material.opacity = Math.sin(Math.min(1,k*1.15)*Math.PI) * p.op;
      s.material.rotation = s.userData.rot + k;
    }
  }
  const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
  for (let i=0;i<DUST;i++){
    const b = dustBase[i];
    const wrap = (v, c, span) => c - span/2 + ((((v - (c - span/2)) % span) + span) % span);
    dustPos[i*3]   = wrap(b[0] + t*b[3]*.6, cx, 30);
    dustPos[i*3+1] = wrap(b[1] + Math.sin(t*.3 + i)*.4, cy, 8);
    dustPos[i*3+2] = wrap(b[2] + t*b[3]*.25, cz, 30);
  }
  dustGeo.attributes.position.needsUpdate = true;
}

