/* ---------- Maps: Dust Yard, Neon District and Jungle Ruins ---------- */
const MAP_NAMES = { yard:'Dust Yard', neon:'Neon District', jungle:'Jungle Ruins' };
const mapName = m => MAP_NAMES[m] || 'Dust Yard';
const boardCanvas = document.createElement('canvas'); boardCanvas.width = 1024; boardCanvas.height = 576;
const boardTex = new THREE.CanvasTexture(boardCanvas);

let currentMap = 'yard', selectedMap = ['neon', 'jungle'].includes(store.get('dustyard-map')) ? store.get('dustyard-map') : 'yard';
const ladders = [], platforms = [];
const MAPS = { yard:{ objs:[], boxes:[], solids:[], ladders:[], platforms:[], perches:[] }, neon:{ objs:[], boxes:[], solids:[], ladders:[], platforms:[], perches:[], spawns:[] },
  jungle:{ objs:[], boxes:[], solids:[], ladders:[], platforms:[], perches:[], spawns:[] } };
const ladderMat = new THREE.MeshStandardMaterial({ color:0x8a8f96, roughness:.5, metalness:.7 });
function makeLadder(L){
  const g = new THREE.Group(), side = new V3(-L.nz, 0, L.nx);
  for (const s of [-.28,.28]){ const r = new THREE.Mesh(Cy(.03,.03,L.top + 1,8), ladderMat); r.position.set(side.x*s, (L.top + 1)/2, side.z*s); g.add(r); }
  for (let y=.3;y<L.top + .9;y+=.32){ const r = new THREE.Mesh(Cy(.022,.022,.56,6), ladderMat); r.rotation.z = HP; r.rotation.y = Math.atan2(side.z, -side.x) ; r.position.set(0, y, 0); g.add(r); }
  g.position.set(L.x + L.nx*.12, 0, L.z + L.nz*.12);
  g.children.forEach(m => { m.castShadow = true; solids.push(m); });
  worldParent.add(g); return g;
}
function groundAt(x, z, y){
  let g = 0;
  for (const list of [boxes, platforms]) for (const b of list){
    const t = b.top || 1.2; if (t > y + .4 || t <= g) continue;
    if (x > b.minX - .2 && x < b.maxX + .2 && z > b.minZ - .2 && z < b.maxZ + .2) g = t;
  }
  return g;
}
// explosive barrels
function hitBarrel(b, dmg){ if (!b.alive) return; b.hp -= dmg; if (b.hp <= 0 && !b.chainT) b.chainT = .01; else spawnPuff(b.m.position.clone().setY(.9), 0xffa040, .08); }
function blowBarrel(b){
  if (!b.alive) return;
  b.alive = false; b.chainT = 0; b.m.visible = false;
  for (const arr of [boxes, MAPS[b.map].boxes]){ const i = arr.indexOf(b.box); if (i >= 0) arr.splice(i,1); }
  for (const arr of [solids, MAPS[b.map].solids]){ const i = arr.indexOf(b.m); if (i >= 0) arr.splice(i,1); }
  const c = b.m.position.clone(); c.y = .25;
  explode(c, { R:6.5 });
  spawnPuff(c.clone().setY(1.2), 0xff6a20, 1.2, 1.6, 1.2);
}
function resetBarrels(){
  for (const b of barrels){
    if (b.map !== currentMap) continue;
    b.alive = true; b.hp = 30; b.chainT = 0; b.m.visible = true;
    if (!boxes.includes(b.box)) boxes.push(b.box); if (!MAPS[b.map].boxes.includes(b.box)) MAPS[b.map].boxes.push(b.box);
    if (!solids.includes(b.m)) solids.push(b.m); if (!MAPS[b.map].solids.includes(b.m)) MAPS[b.map].solids.push(b.m);
  }
}
function updateBarrels(dt){
  for (const b of barrels){ if (b.alive && b.chainT > 0){ b.chainT -= dt; if (b.chainT <= 0) blowBarrel(b); } }
}

// ---- Dust Yard: capture what has been built so far, add ladders to the sniper perches
const YARD_LADDERS = [ { x:-18, z:-16.7, nx:0, nz:1, top:5.2 }, { x:20, z:11.3, nx:0, nz:1, top:5.2 }, { x:-14, z:28.7, nx:0, nz:-1, top:5.2 }, { x:27.2, z:-33, nx:1, nz:0, top:3.25 } ];
const yardLadderMeshes = YARD_LADDERS.map(makeLadder);
MAPS.yard.objs = scene.children.slice(_wStart).filter(o => o !== dust);
MAPS.yard.boxes = boxes.slice(); MAPS.yard.solids = solids.slice();
MAPS.yard.ladders = YARD_LADDERS; MAPS.yard.platforms = [{ minX:27, maxX:35, minZ:-35, maxZ:-25, top:3.25 }, ...YARD_EXTRA.platforms];
MAPS.yard.perches = [[-22,-18,5.2],[24,10,5.2],[-18,30,5.2],[31,-26.6,3.25], ...YARD_EXTRA.perches];

// ---- Neon District: a rainy night-time city block
const neonG = new THREE.Group(); neonG.visible = false; scene.add(neonG);
const neonSigns = [], neonLights = [];
let rain = null;
function buildNeon(){
  if (neonG.userData.built) return; neonG.userData.built = true;
  worldParent = neonG; buildMap = 'neon'; boxes.length = 0; solids.length = 0;
  const asphaltTex = canvasTex(256,256,(g,w,h)=>{ g.fillStyle='#17181d'; g.fillRect(0,0,w,h); speckle(g,w,h,7000,'5,5,8','70,72,80'); for (let i=0;i<6;i++){ g.strokeStyle='rgba(0,0,0,.35)'; g.lineWidth=1+Math.random()*2; g.beginPath(); let x=Math.random()*w,y=Math.random()*h; g.moveTo(x,y); for(let k=0;k<5;k++){ x+=(Math.random()-.5)*40; y+=(Math.random()-.5)*40; g.lineTo(x,y);} g.stroke(); } }, [60,60]);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400,400), new THREE.MeshStandardMaterial({ map:asphaltTex, roughness:.32, metalness:.25, envMapIntensity:1.4 }));
  // rain puddles: mirror-smooth, slightly darker patches that pick up the neon reflections
  const puddleTex = canvasTex(256,256,(g,w,h)=>{
    g.fillStyle='#fff'; g.fillRect(0,0,w,h);
    for (let i=0;i<55;i++){ const x=Math.random()*w, y=Math.random()*h, rx=5+Math.random()*18, ry=rx*(.4+Math.random()*.5), rot=Math.random()*3;
      for (const ox of [-w,0,w]) for (const oy of [-h,0,h]){ g.save(); g.translate(x+ox,y+oy); g.rotate(rot); const gr=g.createRadialGradient(0,0,0,0,0,rx); gr.addColorStop(0,'rgba(0,0,0,1)'); gr.addColorStop(.7,'rgba(0,0,0,.9)'); gr.addColorStop(1,'rgba(0,0,0,0)'); g.fillStyle=gr; g.scale(1, ry/rx); g.beginPath(); g.arc(0,0,rx,0,6.3); g.fill(); g.restore(); } }
  });
  ground.material.onBeforeCompile = sh => {
    sh.uniforms.puddleMap = { value:puddleTex };
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D puddleMap;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n float dry = smoothstep(0.25, 0.7, texture2D(puddleMap, vUv * 0.12).r);\n roughnessFactor = mix(0.03, roughnessFactor, dry);\n diffuseColor.rgb *= mix(0.55, 1.0, dry);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n metalnessFactor = mix(0.6, metalnessFactor, smoothstep(0.25, 0.7, texture2D(puddleMap, vUv * 0.12).r));');
  };
  ground.rotation.x = -HP; ground.receiveShadow = true; neonG.add(ground);
  // windows
  const winTex = [0,1,2].map(st => canvasTex(128,128,(g,w,h)=>{
    g.fillStyle = ['#16171d','#1c1820','#121820'][st]; g.fillRect(0,0,w,h); speckle(g,w,h,800,'0,0,0','60,60,70');
    for (let r=0;r<4;r++) for (let c=0;c<4;c++){
      const lit = Math.random(); g.fillStyle = lit < .35 ? (Math.random() < .5 ? 'rgba(255,196,120,.95)' : 'rgba(130,210,255,.9)') : lit < .45 ? 'rgba(255,90,200,.85)' : '#08090c';
      g.fillRect(8 + c*30, 8 + r*30, 18, 20);
    }
  }));
  const roofMat = new THREE.MeshStandardMaterial({ color:0x24252b, roughness:.85 });
  // buildings are merged by window style (one draw call each), with a plain roof cap on top
  const winMats = winTex.map(t => new THREE.MeshStandardMaterial({ map:t, emissive:0xffffff, emissiveMap:t, emissiveIntensity:.75, roughness:.75 }));
  function cityBox(x0,x1,z0,z1,h,st){
    const w = x1-x0, d = z1-z0, g = new THREE.BoxGeometry(w,h,d); tileBox(g, w, h, d, 2.2, 1.8, 0);
    kitAdd(g, winMats[st], (x0+x1)/2, h/2, (z0+z1)/2); g.dispose();
    kitBox(w + .04, .06, d + .04, roofMat, (x0+x1)/2, h + .01, (z0+z1)/2);
    boxes.push({ minX:x0, maxX:x1, minZ:z0, maxZ:z1, top:h });
  }
  const CITY = [[37,45,-45,-7,14,0],[9,37,-45,-38,10,1],[9,14,-38,-28,7,2],[22,30,-30,-22,4.2,1],
   [-45,-37,-45,-7,12,1],[-37,-9,-45,-38,16,0],[-14,-9,-38,-28,7,2],[-30,-22,-30,-22,4.2,0],
   [37,45,7,45,11,0],[9,37,38,45,13,1],[9,14,28,38,7,2],[22,30,22,30,4.2,1],
   [-45,-37,7,45,15,1],[-37,-9,38,45,9,0],[-14,-9,28,38,7,2],[-30,-22,22,30,4.2,0],
   [-9,9,-45,-41,8,2],[-9,9,41,45,8,2],[41,45,-7,7,8,2],[-45,-41,-7,7,8,2]]; CITY.forEach(b => cityBox(...b));
  // sidewalks (low curbs you can step onto)
  const walkMat = new THREE.MeshStandardMaterial({ color:0x3a3b40, roughness:.6, metalness:.1 });
  for (const [x0,x1,z0,z1] of [[9,11,-28,-9],[-11,-9,-28,-9],[9,11,9,28],[-11,-9,9,28],[11,37,-9,-7],[-37,-11,-9,-7],[11,37,7,9],[-37,-11,7,9]]){
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1-x0,.15,z1-z0), walkMat); m.position.set((x0+x1)/2,.075,(z0+z1)/2); m.receiveShadow = true; neonG.add(m);
    boxes.push({ minX:x0, maxX:x1, minZ:z0, maxZ:z1, top:.15 });
  }
  // road markings
  const lineTex = canvasTex(16,128,(g,w,h)=>{ g.clearRect(0,0,w,h); g.fillStyle='rgba(240,200,60,.85)'; g.fillRect(4,0,8,72); }, [1,20]);
  const lm = new THREE.MeshStandardMaterial({ map:lineTex, transparent:true, depthWrite:false, roughness:.5, polygonOffset:true, polygonOffsetFactor:-2 });
  const l1 = new THREE.Mesh(new THREE.PlaneGeometry(.35, 82), lm); l1.rotation.x = -HP; l1.position.y = .02; neonG.add(l1);
  const t2 = lineTex.clone(); t2.needsUpdate = true; t2.repeat.set(1,20);
  const l2 = new THREE.Mesh(new THREE.PlaneGeometry(.35, 82), new THREE.MeshStandardMaterial({ map:t2, transparent:true, depthWrite:false, polygonOffset:true, polygonOffsetFactor:-2 })); l2.rotation.set(-HP,0,HP); l2.position.y = .02; neonG.add(l2);
  const zebra = canvasTex(128,64,(g,w,h)=>{ g.clearRect(0,0,w,h); g.fillStyle='rgba(235,235,235,.8)'; for (let x=0;x<w;x+=24) g.fillRect(x,0,12,h); });
  for (const [x,z,r] of [[0,-9.5,0],[0,9.5,0],[11.5,0,HP],[-11.5,0,HP]]){ const m = new THREE.Mesh(new THREE.PlaneGeometry(14,3), new THREE.MeshStandardMaterial({ map:zebra, transparent:true, depthWrite:false, polygonOffset:true, polygonOffsetFactor:-2 })); m.rotation.set(-HP,0,r); m.position.set(x,.025,z); neonG.add(m); }
  // puddles reflect the neon
  const pudTex = canvasTex(64,64,(g)=>{ const gr = g.createRadialGradient(32,32,4,32,32,31); gr.addColorStop(0,'rgba(255,255,255,1)'); gr.addColorStop(1,'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0,0,64,64); });
  const pudMat = new THREE.MeshStandardMaterial({ color:0x0b0c12, roughness:.03, metalness:.95, alphaMap:pudTex, transparent:true, depthWrite:false, envMapIntensity:2.5, polygonOffset:true, polygonOffsetFactor:-3 });
  for (const [x,z,s] of [[2,-5,4],[-5,24,3],[18,-2,3.5],[-20,-1,3],[26,-15,4],[-3,-33,3],[30,33,3],[-28,12,3.5]]){ const m = new THREE.Mesh(new THREE.CircleGeometry(s*.5,24), pudMat); m.rotation.x = -HP; m.position.set(x,.03,z); m.scale.set(1,.65,1); neonG.add(m); }
  // cars
  const carCols = [0x7a1626,0x1d3f6e,0xd0d2d6,0x1a1a1d,0x3d6b3a,0xc79a24];
  const carBody = carCols.map(c => new THREE.MeshStandardMaterial({ color:c, roughness:.25, metalness:.75, envMapIntensity:1.5 }));
  const carGlass = new THREE.MeshStandardMaterial({ color:0x0a0c12, roughness:.05, metalness:.9, envMapIntensity:2 });
  const carHL = new THREE.MeshBasicMaterial({ color:0xfff3d0 }), carTL = new THREE.MeshBasicMaterial({ color:0xff2030 });
  function cityCar(x, z, alongZ, ci){
    const body = carBody[ci % carBody.length];
    kitAt(x, z, alongZ ? HP : 0, () => {
      kitBox(4.2, .75, 1.8, body, 0, .7, 0); kitBox(2.2, .7, 1.62, carGlass, -.2, 1.4, 0); kitBox(2, .08, 1.6, body, -.2, 1.78, 0);
      for (const [wx,wz] of [[-1.35,.9],[1.35,.9],[-1.35,-.9],[1.35,-.9]]){ const w = Cy(.36,.36,.25,14); kitAdd(w, tyreMat, wx, .36, wz, HP); w.dispose(); }
      for (const sz of [-.6,.6]){ kitBox(.05, .14, .32, carHL, 2.1, .78, sz); kitBox(.05, .12, .3, carTL, -2.1, .8, sz); }
    });
    boxes.push({ minX:x - (alongZ ? .9 : 2.1), maxX:x + (alongZ ? .9 : 2.1), minZ:z - (alongZ ? 2.1 : .9), maxZ:z + (alongZ ? 2.1 : .9), top:1.8 });
  }
  [[4,-20,1],[-4,12,1],[20,3,0],[-25,-3,0],[30,-15,0],[-18,20,1],[3,28,1],[-30,-30,1],[16,16,0]].forEach(([x,z,a],i) => cityCar(x,z,a,i));
  // dumpsters, crates, barriers, explosive barrels
  const dumpMat = new THREE.MeshStandardMaterial({ color:0x2d5a3a, roughness:.7, metalness:.4 });
  for (const [x,z] of [[16,-35],[-16,35],[34,20],[-34,-20],[33,-33]]) addBox(x, z, 2, 1.2, 1.3, dumpMat);
  for (const [x,z] of [[12,-12],[-12,12],[-33,33],[18,-30]]) addBox(x, z, 1.6, 1.6, 1.6, crateMat);
  jersey(-3,-10,false); jersey(5,18,false); jersey(30,-2,true); jersey(-30,2,true); jersey(0,-24,false);
  for (const [x,z] of [[8,-24],[7.4,-24.7],[-8,16],[-7.4,16.7],[26,-4],[-26,4],[20.3,31],[-31,-20],[6,32]]) barrel(x, z, 0);
  // street lights with warm pools of light
  [[10,-20],[-10,-20],[10,20],[-10,20],[25,8],[-25,-8]].forEach(([x,z]) => pole(x,z));
  for (const [x,z,col,i,d] of [[10,-20,0xffc98a,1.4,18],[-10,20,0xffc98a,1.4,18],[0,-38,0xff3cc8,2.2,26],[0,38,0x2ee6ff,2,24]]){
    const L = new THREE.PointLight(col, i, d, 2); L.position.set(x, 6, z); neonG.add(L); neonLights.push(L);
  }
  // neon signs
  function sign(text, col, x, y, z, ry, w, h, flick){
    const cw = 512, ch = Math.round(512*h/w), c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const g = c.getContext('2d'); g.clearRect(0,0,cw,ch);
    g.font = `700 ${Math.round(ch*.72)}px "Barlow Condensed", Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = col; g.shadowBlur = 24; g.fillStyle = col; g.fillText(text, cw/2, ch/2); g.shadowBlur = 8; g.fillStyle = '#ffffff'; g.globalAlpha = .55; g.fillText(text, cw/2, ch/2);
    g.globalAlpha = 1; g.strokeStyle = col; g.lineWidth = 6; g.shadowBlur = 18; g.strokeRect(8,8,cw-16,ch-16);
    const t = new THREE.CanvasTexture(c);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w,h), new THREE.MeshBasicMaterial({ map:t, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false }));
    m.position.set(x,y,z); m.rotation.y = ry; neonG.add(m);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(w*1.02,h*1.04), new THREE.MeshStandardMaterial({ color:0x0a0a10, roughness:.9 }));
    back.position.copy(m.position).add(new V3(-Math.sin(ry)*.02, 0, -Math.cos(ry)*.02)); back.rotation.y = ry; neonG.add(back);
    neonSigns.push({ m, flick, ph:Math.random()*10 });
  }
  sign('DEGEN', '#ff3cc8', 0, 5.4, -40.94, 0, 10, 3, false);
  sign('LFG', '#2ee6ff', 0, 5, 40.94, Math.PI, 5, 2.4, false);
  sign('RAMEN', '#ff8a2a', 8.94, 4.6, -33, -HP, 4.2, 1.6, true);
  sign('BAR', '#ff4f7a', -8.94, 4.6, -33, HP, 3.2, 1.6, false);
  sign('24/7', '#5cff8a', 8.94, 4.6, 33, -HP, 3.6, 1.6, false);
  sign('ARCADE', '#b45cff', -8.94, 4.6, 33, HP, 4.6, 1.6, true);
  sign('HOTEL', '#ff3b3b', 22, 7, -37.94, 0, 5, 1.8, false);
  sign('NOODLES', '#2ee6ff', -22, 8, -37.94, 0, 6, 1.8, true);
  sign('CLUB', '#ff3cc8', 36.94, 6, 20, -HP, 4, 1.8, false);
  sign('PAWN', '#ffd23c', -36.94, 6, -20, HP, 4, 1.8, true);
  // ladders up to the rooftop sniper nests
  MAPS.neon.ladders = [ { x:22, z:-26, nx:-1, nz:0, top:4.2 }, { x:-22, z:-26, nx:1, nz:0, top:4.2 }, { x:22, z:26, nx:-1, nz:0, top:4.2 }, { x:-22, z:26, nx:1, nz:0, top:4.2 } ];
  MAPS.neon.ladders.forEach(makeLadder);
  MAPS.neon.perches = [[26,-26,4.2],[-26,-26,4.2],[26,26,4.2],[-26,26,4.2]];
  MAPS.neon.spawns = [[0,-38],[38,0],[-38,0],[34,-34],[15,-35],[34,-12],[-34,-34],[-15,-35],[-34,-12],[34,34],[34,12],[-34,34],[-34,12],[20,34],[-20,34]];
  buildNeonExtra({ CITY, cityCar, sign });
  MAPS.neon.boxes = boxes.slice(); MAPS.neon.solids = solids.slice();
  ensureRain();
  // restore Dust Yard as the active world
  worldParent = scene; buildMap = 'yard';
  boxes.length = 0; boxes.push(...MAPS.yard.boxes); solids.length = 0; solids.push(...MAPS.yard.solids);
  ladders.push(...MAPS.yard.ladders); platforms.push(...MAPS.yard.platforms);
}
// rain (Neon District and Jungle Ruins), drawn around the camera
function ensureRain(){
  if (rain) return;
  const N = 900, pos = new Float32Array(N*6), base = [];
  for (let i=0;i<N;i++) base.push([Math.random()*40, Math.random()*14, Math.random()*40, 18 + Math.random()*8]);
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(pos,3));
  rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color:0x9fb4ff, transparent:true, opacity:.35, depthWrite:false }));
  rain.frustumCulled = false; rain.visible = false; rain.userData = { base, pos, rg }; scene.add(rain);
  // splashes: small rings that open and fade on the street around the player
  const SPL = 48, splash = new THREE.InstancedMesh(new THREE.RingGeometry(.6, 1, 16).rotateX(-HP), new THREE.MeshBasicMaterial({ color:0xb8c6ff, transparent:true, opacity:.28, depthWrite:false }), SPL);
  splash.frustumCulled = false; splash.userData.drops = Array.from({ length:SPL }, () => ({ x:0, z:0, t:Math.random(), life:.35 + Math.random()*.25 }));
  rain.userData.splash = splash; splash.visible = false; scene.add(splash);
}
// ---- Jungle Ruins: overgrown temple ruins in the rain, split by a river with two crossings
const jungleG = new THREE.Group(); jungleG.visible = false; scene.add(jungleG);
const JUNGLE_RIVER = { minZ:-3.6, maxZ:3.6 };
const jungleSway = { value:0 }, JUNGLE_PLATFORMS = [];
let jungleWater = null, jungleFall = null, thunderT = 18;
function buildJungle(){
  if (jungleG.userData.built) return; jungleG.userData.built = true;
  worldParent = jungleG; buildMap = 'jungle'; boxes.length = 0; solids.length = 0;
  // seeded, so every player in a co-op match gets the same rocks and cover
  let seed = 1337; const rnd = (a, b) => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return a + (((t ^ t >>> 14) >>> 0)/4294967296)*(b - a); };
  const SPAWNS = [[-38, -30], [-20, -40], [0, -41], [20, -41], [38, -30], [41, -10], [-41, -10], [41, 10], [-41, 12], [38, 30], [20, 41], [0, 41], [-20, 41], [-38, 30], [-30, 0], [30, 2]];
  const nearSpawn = (x, z, r) => SPAWNS.some(p => Math.hypot(p[0] - x, p[1] - z) < r);
  // textures: mossy earth, weathered temple stone, mossy stone, bark, leaves and hanging vines
  const earthTex = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#4a4a2c'; g.fillRect(0, 0, w, h);
    for (let i=0;i<90;i++){ const x = Math.random()*w, y = Math.random()*h, r = 20 + Math.random()*70, c = Math.random();
      for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]){ const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        gr.addColorStop(0, c < .4 ? 'rgba(60,82,34,.35)' : c < .7 ? 'rgba(92,70,42,.3)' : 'rgba(40,52,26,.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); } }
    speckle(g, w, h, 9000, '20,24,10', '130,140,80');
    for (let i=0;i<500;i++){ g.fillStyle = `rgba(${60 + Math.random()*50|0},${80 + Math.random()*60|0},${30 + Math.random()*20|0},.5)`; g.save(); g.translate(Math.random()*w, Math.random()*h); g.rotate(Math.random()*6);
      g.beginPath(); g.ellipse(0, 0, 4 + Math.random()*4, 1.5 + Math.random()*1.5, 0, 0, 7); g.fill(); g.restore(); }
  }, [40, 40]);
  const stoneTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#8a8470'; g.fillRect(0, 0, w, h);
    for (let y=0;y<h;y+=32) for (let x=(y/32)%2*32;x<w + 32;x+=64){ g.fillStyle = `rgb(${120 + Math.random()*30|0},${114 + Math.random()*26|0},${92 + Math.random()*22|0})`; g.fillRect(x + 2, y + 2, 60, 28); }
    speckle(g, w, h, 4000, '40,40,30', '200,195,170');
    for (let i=0;i<26;i++){ const x = Math.random()*w, y = Math.random()*h, gr = g.createRadialGradient(x, y, 0, x, y, 10 + Math.random()*30);
      gr.addColorStop(0, 'rgba(70,100,40,.55)'); gr.addColorStop(1, 'rgba(70,100,40,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
    g.strokeStyle = 'rgba(30,28,20,.5)'; for (let i=0;i<8;i++){ g.lineWidth = 1 + Math.random(); g.beginPath(); let x = Math.random()*w, y = Math.random()*h; g.moveTo(x, y); for (let k=0;k<5;k++){ x += rnd(-14, 14); y += rnd(4, 14); g.lineTo(x, y); } g.stroke(); }
  });
  const barkTex = canvasTex(128, 256, (g, w, h) => { g.fillStyle = '#4a3b2a'; g.fillRect(0, 0, w, h);
    for (let x=0;x<w;x+=3){ g.fillStyle = `rgba(${20 + Math.random()*30|0},${15 + Math.random()*20|0},8,.6)`; g.fillRect(x, 0, 1 + Math.random()*2, h); }
    for (let i=0;i<20;i++){ g.fillStyle = 'rgba(70,96,40,.45)'; g.fillRect(Math.random()*w, Math.random()*h, 6 + Math.random()*14, 10 + Math.random()*40); } });
  const leafTex = canvasTex(256, 256, (g, w, h) => { g.clearRect(0, 0, w, h);
    for (let i=0;i<260;i++){ const x = Math.random()*w, y = Math.random()*h, s = 8 + Math.random()*16, a = Math.random()*6;
      g.fillStyle = `rgb(${30 + Math.random()*40|0},${70 + Math.random()*60|0},${20 + Math.random()*25|0})`; g.save(); g.translate(x, y); g.rotate(a);
      g.beginPath(); g.ellipse(0, 0, s, s*.38, 0, 0, 7); g.fill(); g.strokeStyle = 'rgba(20,40,10,.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-s, 0); g.lineTo(s, 0); g.stroke(); g.restore(); } });
  const vineTex = canvasTex(64, 256, (g, w, h) => { g.clearRect(0, 0, w, h);
    for (const vx of [16, 34, 50]){ g.strokeStyle = '#2f4a1c'; g.lineWidth = 2; g.beginPath(); let x = vx; g.moveTo(x, 0); for (let y=0;y<=h;y+=16){ x = vx + Math.sin(y*.05 + vx)*5; g.lineTo(x, y); } g.stroke();
      for (let y=4;y<h - (vx === 34 ? 0 : 50);y+=7){ const lx = vx + Math.sin(y*.05 + vx)*5; g.fillStyle = `rgb(${40 + Math.random()*40|0},${90 + Math.random()*60|0},${30 + Math.random()*20|0})`;
        g.save(); g.translate(lx, y); g.rotate((Math.random() - .5)*2.4); g.beginPath(); g.ellipse(Math.random() < .5 ? -4 : 4, 0, 5, 2.4, 0, 0, 7); g.fill(); g.restore(); } } });
  const stoneM = new THREE.MeshStandardMaterial({ map:stoneTex, color:0xa9ad9a, bumpMap:stoneTex, bumpScale:.04, roughness:.92 }); stoneM.userData.tile = 2.6;
  const stoneDark = new THREE.MeshStandardMaterial({ map:stoneTex, color:0x7f8574, roughness:.95 }); stoneDark.userData.tile = 2.6;
  const barkM = new THREE.MeshStandardMaterial({ map:barkTex, roughness:.95 });
  const leafM = new THREE.MeshStandardMaterial({ map:leafTex, alphaTest:.45, side:THREE.DoubleSide, roughness:.8 }); leafM.userData = { see:true, noShadow:true };
  const canopyM = new THREE.MeshStandardMaterial({ color:0x2f4f26, roughness:.85 }); canopyM.userData = { see:true };
  const vineM = new THREE.MeshStandardMaterial({ map:vineTex, alphaTest:.4, side:THREE.DoubleSide, roughness:.8 }); vineM.userData = { see:true, noShadow:true };
  // vines sway in the vertex shader (they are merged into one mesh, so they can't be rotated one by one)
  vineM.onBeforeCompile = sh => { sh.uniforms.uSway = jungleSway;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uSway;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n float k = 1.0 - uv.y; transformed.x += k*k*sin(uSway*0.9 + position.x*0.37 + position.z*0.23)*0.16; transformed.z += k*k*cos(uSway*0.8 + position.x*0.21)*0.12;'); };
  // big tropical leaves (canopy cards) and palm fronds
  const cardTex = canvasTex(256, 256, (g, w, h) => { g.clearRect(0, 0, w, h);
    for (let i=0;i<16;i++){ const a = -Math.PI/2 + (Math.random() - .5)*2.7, l = 60 + Math.random()*70, bx = 128 + (Math.random() - .5)*40, by = 170 + (Math.random() - .5)*40;
      const tx = bx + Math.cos(a)*l, ty = by + Math.sin(a)*l, nx = -Math.sin(a), ny = Math.cos(a), wd = l*(.22 + Math.random()*.1);
      const col = `rgb(${30 + Math.random()*35|0},${78 + Math.random()*70|0},${24 + Math.random()*24|0})`;
      g.fillStyle = col; g.beginPath(); g.moveTo(bx, by);
      g.quadraticCurveTo(bx + Math.cos(a)*l*.5 + nx*wd, by + Math.sin(a)*l*.5 + ny*wd, tx, ty);
      g.quadraticCurveTo(bx + Math.cos(a)*l*.5 - nx*wd, by + Math.sin(a)*l*.5 - ny*wd, bx, by); g.fill();
      g.strokeStyle = 'rgba(200,230,150,.35)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(bx, by); g.lineTo(tx, ty); g.stroke();
      g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo(bx + Math.cos(a)*l*.5 - nx*wd, by + Math.sin(a)*l*.5 - ny*wd, tx, ty); g.lineTo(bx, by); g.fill(); } });
  const cardM = new THREE.MeshStandardMaterial({ map:cardTex, alphaTest:.5, side:THREE.DoubleSide, roughness:.75 }); cardM.userData = { see:true };
  const frondTex = canvasTex(64, 256, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = '#4a5a22'; g.lineWidth = 3; g.beginPath(); g.moveTo(32, 0); g.lineTo(32, h); g.stroke();
    for (let y=8;y<h - 4;y+=5){ const l = 28*Math.sin((y/h)*Math.PI)*.95 + 3; g.strokeStyle = `rgb(${50 + Math.random()*30|0},${100 + Math.random()*50|0},${30 + Math.random()*15|0})`; g.lineWidth = 3;
      g.beginPath(); g.moveTo(32, y); g.lineTo(32 - l, y + 12); g.moveTo(32, y); g.lineTo(32 + l, y + 12); g.stroke(); } });
  const frondM = new THREE.MeshStandardMaterial({ map:frondTex, alphaTest:.45, side:THREE.DoubleSide, roughness:.8 }); frondM.userData = { see:true };
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ map:earthTex, roughness:1 }));
  ground.rotation.x = -HP; ground.receiveShadow = true; jungleG.add(ground);
  // blocks go into the merged kit (one draw call per material) with a collision box
  const block = (x, z, w, d, h, mat = stoneM, y0 = 0, col = true) => { kitBox(w, h, d, mat, x, y0 + h/2, z, 0, mat.userData.tile || 0); if (col) addCollider(x, z, w, d, y0 + h); };
  const vine = (x, y, z, ry, len, wid = 1.1) => { const g = new THREE.PlaneGeometry(wid, len); kitAdd(g, vineM, x, y - len/2, z, 0, ry); g.dispose(); };
  const cyl = (r1, r2, h, seg, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const g = new THREE.CylinderGeometry(r1, r2, h, seg); kitAdd(g, mat, x, y, z, rx, ry, rz); g.dispose(); };
  // ---- the river: muddy banks, slow brown-green water you wade through, two stone bridges and stepping stones
  const waterTex = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#3d5040'; g.fillRect(0, 0, w, h);
    for (let i=0;i<60;i++){ g.strokeStyle = `rgba(190,210,190,${.05 + Math.random()*.12})`; g.lineWidth = 1 + Math.random()*2; g.beginPath(); const x = Math.random()*w, y = Math.random()*h; g.moveTo(x, y); g.bezierCurveTo(x + 20, y + 4, x + 40, y - 4, x + 60, y); g.stroke(); } }, [8, 1]);
  jungleWater = new THREE.Mesh(new THREE.PlaneGeometry(92, JUNGLE_RIVER.maxZ - JUNGLE_RIVER.minZ), new THREE.MeshStandardMaterial({ map:waterTex, color:0x587466, roughness:.14, metalness:.15, transparent:true, opacity:.92, envMapIntensity:.7 }));
  jungleWater.rotation.x = -HP; jungleWater.position.set(0, .06, 0); jungleWater.receiveShadow = true; jungleG.add(jungleWater);
  const mudM = new THREE.MeshStandardMaterial({ color:0x3e3524, roughness:.6, metalness:.05 }); mudM.userData = { see:true, noShadow:true };
  for (const s of [-1, 1]){ const b = new THREE.PlaneGeometry(92, 1.6); kitAdd(b, mudM, 0, .03, s*(JUNGLE_RIVER.maxZ + .5), -HP); b.dispose(); }
  for (const bx of [-21, 19]){
    block(bx, 0, 4, 9.4, .5, stoneM);
    for (const sx of [-1.85, 1.85]){ block(bx + sx, -2.6, .3, 2.2, 1.1, stoneDark, .5); block(bx + sx, 2.6, .3, 2.2, 1.1, stoneDark, .5); }
    for (const sz of [-4.9, 4.9]) block(bx, sz, 4, .8, .25, stoneM);
  }
  for (const [x, z] of [[-2, -2.2], [-.6, -.4], [.8, 1.3], [2.2, 2.9]]){ cyl(.6, .75, .45, 9, stoneDark, x, .22, z); addCollider(x, z, 1.1, 1.1, .45); }
  const mossyRock = (x, z, r, col) => { const g = new THREE.DodecahedronGeometry(r, 1), a = g.attributes.position;
    for (let k=0;k<a.count;k++){ const n = 1 + (Math.sin(a.getX(k)*3.1 + x) + Math.cos(a.getZ(k)*2.7 + z))*.07; a.setXYZ(k, a.getX(k)*n, a.getY(k)*n*.75, a.getZ(k)*n); }
    kitAdd(g, stoneDark, x, r*.3, z, 0, Math.random()*3); g.dispose(); if (col) addCollider(x, z, r*1.5, r*1.5, r*.95); };
  for (let i=0;i<14;i++) mossyRock(rnd(-40, 40), (Math.random() < .5 ? -1 : 1)*rnd(3.9, 5), rnd(.4, 1.1), false);
  // ---- the step pyramid north of the river: stairs up the south face, a shrine on top (a sniper perch),
  //      and a tunnel straight through it east to west
  const PZ = -25, TZ0 = -30.5, TZ1 = -27.5, T1 = 1.4, T2 = 2.9, T3 = 4.4;
  block(0, (-33 + TZ0)/2, 18, TZ0 + 33, T1); block(0, (TZ1 - 17)/2, 18, -17 - TZ1, T1);
  block(0, (-31 + TZ0)/2, 13, TZ0 + 31, T2 - T1, stoneM, T1, false); block(0, (TZ1 - 20)/2, 13, -20 - TZ1, T2 - T1, stoneM, T1, false);
  addCollider(0, (-31 + TZ0)/2, 13, TZ0 + 31, T2); addCollider(0, (TZ1 - 20)/2, 13, -20 - TZ1, T2);
  block(0, (TZ1 - 23)/2, 8, -23 - TZ1, T3 - T2, stoneM, T2, false); addCollider(0, (TZ1 - 23)/2, 8, -23 - TZ1, T3);
  block(0, (TZ0 + TZ1)/2, 13, TZ1 - TZ0, T2 - 2.6, stoneDark, 2.6, false);                 // the tunnel roof
  JUNGLE_PLATFORMS.push({ minX:-6.5, maxX:6.5, minZ:TZ0, maxZ:TZ1, top:T2 });
  for (const sx of [-1, 1]){ block(sx*6.6, TZ0 - .2, .5, .4, 2.6, stoneDark, 0, false); block(sx*6.6, TZ1 + .2, .5, .4, 2.6, stoneDark, 0, false); }   // carved door posts
  for (let i=0;i<13;i++) block(0, -23.04 + (12 - i)*.92, 3.6, .92, .34*(i + 1), stoneDark);
  block(-1.5, PZ - 1.5, .5, .5, 2.2, stoneDark, T3); block(1.5, PZ - 1.5, .5, .5, 2.2, stoneDark, T3); block(0, PZ - 1.5, 3.6, .7, .45, stoneM, T3 + 2.2, false);
  for (const [x, z] of [[-8.6, -17.4], [8.6, -17.4], [-6.3, -20], [6.3, -20]]) vine(x, Math.abs(x) > 8 ? T1 : T2, z + .02, 0, rnd(1.2, 2.2), 1.4);
  for (const sx of [-1, 1]) vine(sx*9.02, T1, PZ + 4, sx*HP, 1.2, 3);
  // ---- a carved stone arch framing the pyramid stairs
  block(-2.7, -9.6, 1.1, 1.1, 4.6, stoneM); block(2.7, -9.6, 1.1, 1.1, 4.6, stoneM);
  block(0, -9.6, 6.6, 1.2, .9, stoneM, 4.6, false); block(0, -9.6, 7.2, 1.3, .25, stoneDark, 5.5, false);
  vine(-1.4, 5.5, -8.98, 0, 2.6, 1.8); vine(2.2, 5.5, -10.22, Math.PI, 1.6, 1.2);
  // ---- giant stone heads, half sunk in the earth: good, solid cover out in the open
  const eyeM = new THREE.MeshStandardMaterial({ color:0x2a2a22, roughness:1 }); eyeM.userData = { see:true };
  const head = (x, z) => { const ry = Math.atan2(-x, -z) + rnd(-.3, .3);
    kitAt(x, z, ry, () => {
      const s = new THREE.SphereGeometry(1, 18, 14); kitAdd(s, stoneM, 0, 1.25, 0, rnd(-.08, .08), 0, rnd(-.08, .08), 1.2, 1.4, 1.05); s.dispose();
      const band = new THREE.CylinderGeometry(1.24, 1.26, .45, 18, 1, true); kitAdd(band, stoneDark, 0, 2.05, 0, 0, 0, 0, 1, 1, .9); band.dispose();
      kitBox(1.7, .26, .45, stoneDark, 0, 1.72, .86); for (const sx of [-.42, .42]){ const e = new THREE.SphereGeometry(.2, 10, 8); kitAdd(e, eyeM, sx, 1.5, .93, 0, 0, 0, 1.1, .6, .5); e.dispose(); }
      kitBox(.42, .55, .4, stoneM, 0, 1.18, 1.0, 0, 0, -.25); kitBox(.95, .24, .3, stoneDark, 0, .78, .94); for (const sx of [-1.18, 1.18]) kitBox(.25, .6, .4, stoneM, sx, 1.3, .05);
    }, -.15);
    addCollider(x, z, 2.5, 2.5, 2.6); };
  head(-21, -30); head(25, -32); head(20, 26);
  // ---- the old hall south of the river: broken walls, a doorway, fallen columns, a collapsed roof corner
  const HZ = 25;
  block(-9, HZ + 7, 8, 1, 4.2); block(9, HZ + 7, 8, 1, 4.2); block(0, HZ + 7, 10, 1, .8, stoneM, 3.4, false);
  block(-12.5, HZ, 1, 13, 3.6); block(12.5, HZ + 2, 1, 9, 2.6); block(-6, HZ - 6.5, 6, 1, 2.2); block(7, HZ - 6.5, 4, 1, 3.2);
  block(-9, HZ + 3, 7, 6, .25, stoneDark, 3.6, false);
  for (const [x, z, h] of [[-4, HZ - 2, 3.4], [4, HZ - 2, 1.6], [-4, HZ + 3, 2.4], [4, HZ + 3, 3.4]]){
    cyl(.55, .62, h, 14, stoneM, x, h/2, z); addCollider(x, z, 1.2, 1.2, h);
    if (h > 3) vine(x + .63, h, z, HP, h*.7, .9);
  }
  for (const [x, z, ry] of [[1, HZ + 1, .4], [-17, -12, 1.2], [16, -14, -.3]]){ cyl(.55, .55, 5, 14, stoneM, x, .55, z, 0, ry, HP);
    const dx = Math.abs(Math.cos(ry))*2.5 + .5, dz = Math.abs(Math.sin(ry))*2.5 + .5; addCollider(x, z, dx*2, dz*2, 1.1); }
  vine(-9, 4.2, HZ + 6.48, 0, 3, 2.2); vine(9, 4.2, HZ + 6.48, 0, 2.4, 2.6); vine(-11.98, 3.6, HZ - 3, HP, 2.6, 2);
  // ---- watchtowers in two corners with ladders (sniper perches), and scattered ruin walls for cover
  for (const [x, z, s] of [[-32, -32, 1], [32, 32, -1]]){
    block(x, z, 5, 5, 4.2, stoneM);
    for (const [ox, oz] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) block(x + ox, z + oz, .6, .6, 1, stoneDark, 4.2, false);
    vine(x + 2.52*s, 4.2, z, s*HP, 3.2, 2.4);
  }
  for (const [x, z, w, d, h] of [[-26, -12, 6, 1, 1.6], [-30, 14, 1, 7, 2.4], [26, -14, 1, 6, 2.2], [30, 10, 7, 1, 1.4], [-18, 16, 4, 1, 1.3], [17, 15, 5, 1, 2.8],
    [-34, -20, 1, 5, 3.2], [35, -24, 6, 1, 1.5], [-6, -12, 5, 1, 1.2], [8, -11, 1, 4, 1.6], [-24, 34, 6, 1, 2], [22, 36, 1, 5, 1.3], [-38, 2, 3, 1, 1.2], [38, -6, 1, 4, 2.6]]){
    block(x, z, w, d, h);
    for (let k=0;k<Math.round(Math.max(w, d)/2);k++) block(x + (d > w ? 0 : rnd(-w/2 + .4, w/2 - .4)), z + (d > w ? rnd(-d/2 + .4, d/2 - .4) : 0), rnd(.4, .8), rnd(.4, .8), rnd(.2, .45), stoneDark, h, false);
    if (h > 2) vine(x + (d > w ? w/2 + .02 : 0), h, z + (d > w ? 0 : d/2 + .02), d > w ? HP : 0, h*.7, Math.min(2.4, Math.max(w, d)*.5));
  }
  // ---- jungle trees: buttressed trunks under layered crowns of big leaves, with vines hanging down
  const tree = (x, z, s = 1) => {
    const h = 7*s, lean = rnd(-.06, .06);
    cyl(.32*s, .6*s, h, 10, barkM, x, h/2, z, lean, 0, lean); addCollider(x, z, 1.4*s, 1.4*s, h);
    for (let i=0;i<5;i++){ const a = i/5*Math.PI*2 + Math.random(); kitAt(x + Math.sin(a)*.55*s, z + Math.cos(a)*.55*s, a, () => kitBox(.16*s, 1.4*s, 1.3*s, barkM, 0, .55*s, .25*s, 0, 0, -.35)); }
    for (let i=0;i<3;i++){ const a = Math.random()*6.3, len = rnd(1.6, 2.6)*s; kitBar(x, h*rnd(.7, .9), z, x + Math.sin(a)*len, h*rnd(.92, 1.05), z + Math.cos(a)*len, .1*s, barkM, 5); }
    const cy = h + .8*s, R = 4.3*s;
    const blob = new THREE.SphereGeometry(R*.7, 12, 8); kitAdd(blob, canopyM, x, cy + .2*s, z, 0, 0, 0, 1, .42, 1); blob.dispose();
    const card = new THREE.PlaneGeometry(3.6*s, 3.6*s); card.translate(0, 1.1*s, 0);
    for (let i=0;i<30;i++){ const a = Math.random()*Math.PI*2, r = R*Math.sqrt(Math.random())*.9, y = cy + rnd(-.7, 1.3)*s;
      kitAt(x + Math.cos(a)*r, z + Math.sin(a)*r, -a + HP + rnd(-.5, .5), () => kitAdd(card, cardM, 0, 0, 0, rnd(.5, 1.25)), y - .6*s); }
    card.dispose();
    for (let i=0;i<3;i++){ const a = Math.random()*6, r = rnd(1, 2.2)*s; vine(x + Math.sin(a)*r, h - .1, z + Math.cos(a)*r, Math.random()*3, rnd(2.5, 4.5)*s, .8); }
  };
  [[-40, -40, 1.3], [-24, -38, 1.1], [-8, -40, 1.2], [10, -39, 1.3], [26, -40, 1.1], [40, -38, 1.2], [-40, -22, 1.2], [40, -18, 1.3], [-40, 22, 1.2], [41, 20, 1.1], [-38, 40, 1.3], [-10, 40, 1.2], [8, 41, 1.1], [40, 40, 1.3],
   [-15, -20, .9], [17, -24, 1], [-24, 8, .9], [26, 22, 1], [-28, 26, .85], [31, -6, .9], [-11, 12, .8], [12, 9, .85]].forEach(([x, z, s]) => tree(x, z, s));
  // palms leaning over the river banks
  const frondGeo = new THREE.PlaneGeometry(1.2, 4.4, 1, 8), fa = frondGeo.attributes.position;
  for (let k=0;k<fa.count;k++){ const t = fa.getY(k)/4.4 + .5; fa.setXYZ(k, fa.getX(k)*(.4 + Math.sin(t*Math.PI)*.8), .9*t - 2.2*t*t, t*4.2); }
  const palm = (x, z, lx, lz) => {
    const H = rnd(7, 9); let px = x, pz = z, py = 0;
    for (let k=0;k<6;k++){ const t = (k + 1)/6, nx = x + lx*t*t*2.6, nz = z + lz*t*t*2.6, ny = H*t; kitBar(px, py, pz, nx, ny + .05, nz, .26 - k*.025, barkM, 7); px = nx; pz = nz; py = ny; }
    for (let i=0;i<9;i++){ const a = i/9*Math.PI*2 + rnd(-.2, .2); kitAt(px, pz, a, () => kitAdd(frondGeo, frondM, 0, 0, 0, rnd(-.25, .2)), py); }
    addCollider(x, z, .7, .7, 3);
  };
  for (const [x, z, lx, lz] of [[-36, -6, .2, .6], [-9, 6.4, -.3, -.6], [6, -6.6, .3, .6], [35.5, 6.2, -.2, -.6], [-25, -5.8, -.3, .5]]) if (freeSpot(x, z, .8) && !nearSpawn(x, z, 2.5)) palm(x, z, lx, lz);
  frondGeo.dispose();
  // ferns and bushes (soft cover you can see through a little)
  const fernGeo = new THREE.PlaneGeometry(1.6, 1.1); fernGeo.translate(0, .55, 0);
  for (let i=0;i<80;i++){ const x = rnd(-42, 42), z = rnd(-42, 42); if (Math.abs(z) < 4.5 || !freeSpot(x, z, 1.2)) continue;
    const sc = rnd(.8, 1.5); for (let k=0;k<3;k++) kitAdd(fernGeo, Math.random() < .5 ? leafM : cardM, x, 0, z, rnd(-.2, .2), k/3*Math.PI + Math.random(), 0, sc, sc, sc); }
  fernGeo.dispose();
  for (let i=0;i<16;i++){ const x = rnd(-40, 40), z = rnd(-40, 40), r = rnd(.5, 1.3); if (Math.abs(z) < 5 || !freeSpot(x, z, r + 1) || nearSpawn(x, z, 3)) continue; mossyRock(x, z, r, r > .8); }
  // ---- mist over the river
  const mistTex = canvasTex(128, 128, (g, w, h) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(230,240,230,.55)'); gr.addColorStop(1, 'rgba(230,240,230,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  const mistM = new THREE.MeshBasicMaterial({ map:mistTex, transparent:true, opacity:.35, depthWrite:false }); mistM.userData = { see:true, noShadow:true };
  for (let x=-42;x<=42;x+=7){ const p = new THREE.PlaneGeometry(rnd(9, 13), rnd(4, 6)); kitAdd(p, mistM, x + rnd(-2, 2), .55 + rnd(0, .3), rnd(-1.5, 1.5), -HP, 0, rnd(0, 3)); p.dispose(); }
  // ---- a waterfall pours into the river at the west wall; the river leaves through a culvert in the east wall
  for (const [z0, z1, h] of [[-26, -2.8, 15], [2.8, 26, 14]]) block(-48, (z0 + z1)/2, 5, z1 - z0, h, stoneDark, 0, false);
  block(-48, 0, 5, 5.6, 2.4, stoneDark, 13.4, false);
  for (let i=0;i<10;i++){ const z = rnd(-14, 14); if (Math.abs(z) > 3.5) mossyRock(-46.3, z, rnd(1, 2), true); }
  const fallTex = canvasTex(64, 256, (g, w, h) => { g.fillStyle = '#5d7a70'; g.fillRect(0, 0, w, h);
    for (let i=0;i<50;i++){ g.fillStyle = `rgba(20,40,34,${.2 + Math.random()*.3})`; g.fillRect(Math.random()*w, Math.random()*h, 2 + Math.random()*4, 30 + Math.random()*80); }
    for (let i=0;i<80;i++){ g.fillStyle = `rgba(235,245,240,${.15 + Math.random()*.45})`; g.fillRect(Math.random()*w, Math.random()*h, 1 + Math.random()*2, 20 + Math.random()*60); } });
  fallTex.repeat.set(2, 3);
  const fallM = new THREE.MeshStandardMaterial({ map:fallTex, color:0xb8c8c0, transparent:true, opacity:.82, roughness:.25, side:THREE.DoubleSide });
  jungleFall = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 13.4), fallM); jungleFall.position.set(-44.92, 6.7, 0); jungleFall.rotation.y = HP; jungleG.add(jungleFall);
  plume(-44.2, .2, 0, 1.8, 2.6, 12, 0xcfdad4, .16, jungleG);
  const culvM = new THREE.MeshBasicMaterial({ color:0x050605 }); culvM.userData = { see:true, noShadow:true };
  const cg = new THREE.CircleGeometry(3.4, 20, 0, Math.PI); kitAdd(cg, culvM, 44.96, 0, 0, 0, -HP); cg.dispose();
  for (let i=0;i<=10;i++){ const a = i/10*Math.PI; kitAt(44.9, Math.cos(a)*3.8, -HP, () => kitBox(.9, .6, .6, stoneM, 0, 0, 0, 0, 0, 0, a - HP), Math.sin(a)*3.8); }
  // perimeter: overgrown temple walls with vines, too high to climb
  for (const [x, z, w, d] of [[0, -ARENA - .5, ARENA*2 + 2, 1], [0, ARENA + .5, ARENA*2 + 2, 1], [-ARENA - .5, 0, 1, ARENA*2 + 2], [ARENA + .5, 0, 1, ARENA*2 + 2]]){
    kitBox(w, 4.5, d, stoneDark, x, 2.25, z, 0, 2.6);
    for (let i=0;i<12;i++){ const t = (i + .5)/12 - .5, along = d > w; if (along && Math.abs(t*d) < 4) continue; vine(along ? x - Math.sign(x)*.52 : x + t*w, 4.5, along ? z + t*d : z - Math.sign(z)*.52, along ? HP : 0, rnd(1.5, 3.8), rnd(1.5, 3)); }
  }
  MAPS.jungle.ladders = [ { x:-29.5, z:-32, nx:1, nz:0, top:4.2 }, { x:29.5, z:32, nx:-1, nz:0, top:4.2 } ];
  MAPS.jungle.ladders.forEach(makeLadder);
  MAPS.jungle.platforms = JUNGLE_PLATFORMS;
  MAPS.jungle.perches = [[-32, -32, 4.2], [32, 32, 4.2], [0, PZ, T3], [-9, HZ + 3, 3.85]];
  MAPS.jungle.spawns = SPAWNS;
  kitFlush(jungleG);
  MAPS.jungle.boxes = boxes.slice(); MAPS.jungle.solids = solids.slice();
  // restore Dust Yard as the active world
  worldParent = scene; buildMap = 'yard';
  boxes.length = 0; boxes.push(...MAPS.yard.boxes); solids.length = 0; solids.push(...MAPS.yard.solids);
}
const inRiver = p => currentMap === 'jungle' && p.z > JUNGLE_RIVER.minZ && p.z < JUNGLE_RIVER.maxZ && (p.y || 0) < .3;
// a lightning flash and a roll of thunder now and then
function updateJungleFx(dt, t){
  if (!jungleG.visible) return;
  jungleSway.value = t;
  if (jungleWater) jungleWater.material.map.offset.x = (t*.03) % 1;
  if (jungleFall) jungleFall.material.map.offset.y = (t*1.1) % 1;
  if (state !== 'play') return;
  thunderT -= dt;
  if (thunderT <= 0){ thunderT = 22 + Math.random()*25; boomLight.color.setHex(0xcfe0ff); boomLight.position.set(camera.position.x + 20, 30, camera.position.z - 20); boomLight.intensity = 3;
    gl2.intensity = 1.6; setTimeout(() => { if (currentMap === 'jungle') gl2.intensity = .45; }, 140);
    blast(.35, 380, 2.6, true, .6, 42); blast(.2, 200, 3.2, false, 1.2); }
}
// ---- Degen Market: a peaceful plaza where players meet, chat and trade
const hubG = new THREE.Group(); hubG.visible = false; scene.add(hubG);
const HUB_STALLS = [];
let hubBoard = null, hubCrystal = null;
function buildHub(){
  if (hubG.userData.built) return; hubG.userData.built = true;
  worldParent = hubG; buildMap = 'hub'; boxes.length = 0; solids.length = 0;
  const stoneTex = canvasTex(256,256,(g,w,h)=>{ g.fillStyle='#bba98a'; g.fillRect(0,0,w,h);
    for (let y=0;y<h;y+=32) for (let x=(y/32)%2*16;x<w;x+=32){ g.fillStyle=`rgb(${170+Math.random()*30|0},${150+Math.random()*25|0},${118+Math.random()*20|0})`; g.fillRect(x+1,y+1,30,30); }
    speckle(g,w,h,3000,'90,75,55','240,225,200'); }, [36,36]);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400,400), new THREE.MeshStandardMaterial({ map:stoneTex, roughness:.9 }));
  ground.rotation.x = -HP; ground.receiveShadow = true; hubG.add(ground);
  const wm = new THREE.MeshStandardMaterial({ map:concreteTex, roughness:.95 });
  addBox(0,-45.5,92,1,4,wm,0,false); addBox(0,45.5,92,1,4,wm,0,false); addBox(-45.5,0,1,92,4,wm,0,false); addBox(45.5,0,1,92,4,wm,0,false);
  // fountain with a slowly turning crystal
  const basin = new THREE.Mesh(Cy(3.6,3.8,.7,32), new THREE.MeshStandardMaterial({ color:0x9d8f78, roughness:.8 })); basin.position.y = .35; basin.castShadow = basin.receiveShadow = true; hubG.add(basin); solids.push(basin);
  const water = new THREE.Mesh(new THREE.CircleGeometry(3.3,32), new THREE.MeshStandardMaterial({ color:0x2a6f9a, roughness:.05, metalness:.6, emissive:0x0a3550, emissiveIntensity:.6, envMapIntensity:2 })); water.rotation.x = -HP; water.position.y = .62; hubG.add(water);
  const pillar = new THREE.Mesh(Cy(.35,.5,2.2,16), new THREE.MeshStandardMaterial({ color:0xb7a88f, roughness:.7 })); pillar.position.y = 1.4; pillar.castShadow = true; hubG.add(pillar); solids.push(pillar);
  hubCrystal = new THREE.Mesh(new THREE.OctahedronGeometry(.8,0), new THREE.MeshStandardMaterial({ color:0x7fe8ff, emissive:0x2bc8ff, emissiveIntensity:1.4, roughness:.1, metalness:.3, transparent:true, opacity:.9 }));
  hubCrystal.position.y = 3.4; hubG.add(hubCrystal);
  boxes.push({ minX:-3.7, maxX:3.7, minZ:-3.7, maxZ:3.7, top:.7 });
  // market stalls in a ring around the fountain
  const awnCols = [['#d8423a','#f4ecdc'],['#2f6bff','#f4ecdc'],['#e0a020','#3a2a18'],['#2e9e6a','#f4ecdc'],['#8e44c8','#f4ecdc'],['#ff6a2a','#2a1a10'],['#1d9fb5','#f4ecdc'],['#c7364f','#ffd36b']];
  const hubWoodTex = canvasTex(128,64,(g,w,h)=>{ g.fillStyle='#7a5032'; g.fillRect(0,0,w,h); for (let y=0;y<h;y+=2){ g.fillStyle=`rgba(40,20,8,${.1+Math.random()*.2})`; g.fillRect(0,y,w,1); } });
  const woodM = new THREE.MeshStandardMaterial({ map:hubWoodTex, roughness:.7 });
  for (let i=0;i<8;i++){
    const a = i/8*Math.PI*2 + Math.PI/8, r = 17, x = Math.sin(a)*r, z = Math.cos(a)*r;
    const g = new THREE.Group(); g.position.set(x,0,z); g.rotation.y = a + Math.PI; hubG.add(g);
    const counter = new THREE.Mesh(Bx(3.2,1.05,1.1), woodM); counter.position.set(0,.525,0); g.add(counter);
    for (const sx of [-1.5,1.5]) for (const sz of [-.45,1.3]){ const p = new THREE.Mesh(Cy(.06,.06,2.6,8), woodM); p.position.set(sx,1.3,sz); g.add(p); }
    const at = canvasTex(64,64,(c,w,h)=>{ for (let k=0;k<8;k++){ c.fillStyle = awnCols[i][k%2]; c.fillRect(k*8,0,8,h); } });
    const awn = new THREE.Mesh(Bx(3.5,.08,2.2), new THREE.MeshStandardMaterial({ map:at, roughness:.8, side:THREE.DoubleSide })); awn.position.set(0,2.65,.45); awn.rotation.x = -.18; g.add(awn);
    for (let k=0;k<5;k++){ const it = new THREE.Mesh(k%2 ? Bx(.35,.3,.35) : new THREE.SphereGeometry(.18,10,8), new THREE.MeshStandardMaterial({ color:new THREE.Color().setHSL(Math.random(),.6,.5), roughness:.6 })); it.position.set(-1.2 + k*.6, 1.2, 0); g.add(it); }
    g.traverse(o => { if (o.isMesh){ o.castShadow = o.receiveShadow = true; solids.push(o); } });
    boxes.push({ minX:x-1.7, maxX:x+1.7, minZ:z-1.7, maxZ:z+1.7, top:1.05 });
    HUB_STALLS.push(new V3(x,0,z));
  }
  // trade board
const board = new THREE.Mesh(new THREE.PlaneGeometry(9,5), new THREE.MeshBasicMaterial({ map:boardTex })); board.position.set(0,3.4,-27.9); hubG.add(board);
  const frame = new THREE.Mesh(Bx(9.6,5.6,.4), new THREE.MeshStandardMaterial({ color:0x1a1c22, roughness:.6, metalness:.5 })); frame.position.set(0,3.4,-28.15); hubG.add(frame); solids.push(frame);
  for (const sx of [-4,4]){ const leg = new THREE.Mesh(Bx(.4,1.2,.4), frame.material); leg.position.set(sx,.6,-28.15); hubG.add(leg); }
  boxes.push({ minX:-4.8, maxX:4.8, minZ:-28.4, maxZ:-27.9, top:6.2 });
  hubBoard = new V3(0,0,-26.5);
  // entrance arch with a neon sign
  const archM = new THREE.MeshStandardMaterial({ color:0x2b2d33, roughness:.5, metalness:.6 });
  for (const sx of [-6.5,6.5]) addBox(sx, 32, .8, .8, 6, archM);
  addBox(0, 32, 14, .8, .8, archM, 6, false);
  const sc = document.createElement('canvas'); sc.width = 1024; sc.height = 160; const sg = sc.getContext('2d');
  sg.textAlign = 'center'; sg.textBaseline = 'middle'; sg.font = '700 120px "Barlow Condensed", Arial'; sg.shadowColor = '#ff3cc8'; sg.shadowBlur = 30; sg.fillStyle = '#ff3cc8'; sg.fillText('DEGEN MARKET', 512, 84); sg.shadowBlur = 8; sg.globalAlpha = .6; sg.fillStyle = '#fff'; sg.fillText('DEGEN MARKET', 512, 84);
  const signM = new THREE.MeshBasicMaterial({ map:new THREE.CanvasTexture(sc), transparent:true, blending:THREE.AdditiveBlending, depthWrite:false });
  for (const [z, ry] of [[32.45,0],[31.55,Math.PI]]){ const s = new THREE.Mesh(new THREE.PlaneGeometry(12,1.9), signM); s.position.set(0,5.3,z); s.rotation.y = ry; hubG.add(s); }
  // trees, benches and lamps
  const trunkM = new THREE.MeshStandardMaterial({ color:0x5a4030, roughness:.9 }), leafM = new THREE.MeshStandardMaterial({ color:0x4f7a3a, roughness:.9 });
  for (const [x,z] of [[-28,-20],[28,-20],[-28,20],[28,20],[-12,-34],[12,-34],[-34,0],[34,0]]){
    const t = new THREE.Mesh(Cy(.25,.35,3,8), trunkM); t.position.set(x,1.5,z); t.castShadow = true; hubG.add(t); solids.push(t);
    const c = new THREE.Mesh(new THREE.SphereGeometry(2.2,12,10), leafM); c.position.set(x,4,z); c.castShadow = true; hubG.add(c);
    boxes.push({ minX:x-.4, maxX:x+.4, minZ:z-.4, maxZ:z+.4, top:3 });
  }
  for (const [x,z,r] of [[0,-8,0],[0,8,0],[-8,0,HP],[8,0,HP]]){ const b = new THREE.Mesh(Bx(2.2,.45,.6), woodM); b.position.set(x,.45,z); b.rotation.y = r; b.castShadow = true; hubG.add(b); solids.push(b); }
  [[22,-30],[-22,-30],[22,30],[-22,30]].forEach(([x,z]) => pole(x,z));
  MAPS.hub = { objs:[], boxes:boxes.slice(), solids:solids.slice(), ladders:[], platforms:[], perches:[], spawns:[] };
  worldParent = scene; buildMap = 'yard';
  boxes.length = 0; boxes.push(...MAPS.yard.boxes); solids.length = 0; solids.push(...MAPS.yard.solids);
}
// night lighting
const hemiLight = scene.children.find(o => o.isHemisphereLight);
const envDay = scene.environment;
let envNight = envDay;
try {
  const eq = document.createElement('canvas'); eq.width = 256; eq.height = 128; const g = eq.getContext('2d');
  const gr = g.createLinearGradient(0,0,0,128); gr.addColorStop(0,'#05060f'); gr.addColorStop(.45,'#2a1440'); gr.addColorStop(.52,'#3a1d55'); gr.addColorStop(1,'#0c0a12'); g.fillStyle = gr; g.fillRect(0,0,256,128);
  for (const [x,y,c] of [[40,60,'rgba(255,60,200,.9)'],[120,62,'rgba(46,230,255,.9)'],[200,58,'rgba(255,140,40,.7)'],[80,70,'rgba(180,90,255,.7)']]){ const r = g.createRadialGradient(x,y,0,x,y,22); r.addColorStop(0,c); r.addColorStop(1,'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0,0,256,128); }
  const et = new THREE.CanvasTexture(eq); et.mapping = THREE.EquirectangularReflectionMapping;
  const pm = new THREE.PMREMGenerator(renderer); envNight = pm.fromEquirectangular(et).texture; pm.dispose(); et.dispose();
} catch(e){}
const DAY = { top:sky.material.uniforms.top.value.clone(), mid:sky.material.uniforms.mid.value.clone(), bot:sky.material.uniforms.bot.value.clone(), sun:sky.material.uniforms.sun.value.clone(),
  sunCol:sun.color.clone(), sunI:sun.intensity, sunPos:sun.position.clone(), hCol:hemiLight.color.clone(), hGround:hemiLight.groundColor.clone(), hI:hemiLight.intensity, fog:scene.fog.color.clone(), near:scene.fog.near, far:scene.fog.far };
function applyTheme(night){
  const U = sky.material.uniforms, jungle = night === 'jungle'; if (jungle) night = false;
  if (jungle){
    // heavy grey-green overcast, close fog, soft light
    U.top.value.setHex(0x46524b); U.mid.value.setHex(0x7d8a7c); U.bot.value.setHex(0x5b6656); U.sun.value.set(.2,.85,-.4).normalize();
    sun.color.setHex(0xd8e6d0); sun.intensity = .55; sun.position.copy(U.sun.value).multiplyScalar(80);
    hemiLight.color.setHex(0xa8bca0); hemiLight.groundColor.setHex(0x2c3322); hemiLight.intensity = .62;
    scene.fog.color.setHex(0x5f6b5d); scene.fog.near = 14; scene.fog.far = 95;
    scene.environment = envDay; gunScene.environment = envDay;
  } else if (night){
    U.top.value.setHex(0x04050c); U.mid.value.setHex(0x2a1440); U.bot.value.setHex(0x150c20); U.sun.value.set(-.3,.55,-.78).normalize();
    sun.color.setHex(0x8ea2ff); sun.intensity = .3; sun.position.copy(U.sun.value).multiplyScalar(80);
    hemiLight.color.setHex(0x7a6ab0); hemiLight.groundColor.setHex(0x15121e); hemiLight.intensity = .34;
    scene.fog.color.setHex(0x1c1430); scene.fog.near = 22; scene.fog.far = 118;
    scene.environment = envNight; gunScene.environment = envNight;
  } else {
    U.top.value.copy(DAY.top); U.mid.value.copy(DAY.mid); U.bot.value.copy(DAY.bot); U.sun.value.copy(DAY.sun);
    sun.color.copy(DAY.sunCol); sun.intensity = DAY.sunI; sun.position.copy(DAY.sunPos);
    hemiLight.color.copy(DAY.hCol); hemiLight.groundColor.copy(DAY.hGround); hemiLight.intensity = DAY.hI;
    scene.fog.color.copy(DAY.fog); scene.fog.near = DAY.near; scene.fog.far = DAY.far;
    scene.environment = envDay; gunScene.environment = envDay;
  }
  if (typeof bloomPass !== 'undefined' && bloomPass) bloomPass.strength = night ? .75 : jungle ? .3 : .38;
  if (typeof GRADES !== 'undefined'){ gradeNow = GRADES[currentMap] || (night ? GRADES.neon : GRADES.yard); applyGrade(); setHaze((night ? .42 : jungle ? .36 : .2) * QUALITY[cfg.quality].haze); }
  gl2.intensity = night ? .35 : jungle ? .45 : .65;
}
function setMap(name){
  if (name === 'neon') buildNeon(); if (name === 'hub') buildHub(); if (name === 'jungle') buildJungle();
  currentMap = name; const M = MAPS[name];
  MAPS.yard.objs.forEach(o => { o.visible = name === 'yard'; }); neonG.visible = name === 'neon'; hubG.visible = name === 'hub'; jungleG.visible = name === 'jungle';
  boxes.length = 0; boxes.push(...M.boxes); solids.length = 0; solids.push(...M.solids);
  ladders.length = 0; ladders.push(...M.ladders); platforms.length = 0; platforms.push(...M.platforms);
  PERCHES.length = 0; PERCHES.push(...M.perches);
  spawnPts.length = 0;
  if (M.spawns) M.spawns.forEach(p => { if (freeSpot(p[0], p[1], .9)) spawnPts.push(p); });
  else for (let i=0;i<48;i++){ const a = i/48*Math.PI*2, x = Math.max(-42, Math.min(42, Math.sin(a)*60)), z = Math.max(-42, Math.min(42, Math.cos(a)*60)); if (freeSpot(x,z,.9)) spawnPts.push([x,z]); }
  applyTheme(name === 'neon' ? true : name === 'jungle' ? 'jungle' : false);
  const wet = name === 'neon' || name === 'jungle'; if (wet) ensureRain();
  dust.visible = !wet && QUALITY[cfg.quality].dust;
  if (rain){ rain.visible = rain.userData.splash.visible = wet; rain.material.color.setHex(name === 'jungle' ? 0xc8d4c8 : 0x9fb4ff); rain.material.opacity = name === 'jungle' ? .3 : .35; }
  resetBarrels();
}
function updateMapFx(dt, t){
  updateJungleFx(dt, t);
  if (rain && rain.visible){
    // no rain inside the jungle pyramid's tunnel
    const cp = camera.position, covered = currentMap === 'jungle' && Math.abs(cp.x) < 6.5 && cp.z > -30.5 && cp.z < -27.5 && cp.y < 2.6;
    rain.material.opacity = covered ? 0 : currentMap === 'jungle' ? .3 : .35; rain.userData.splash.material.opacity = covered ? 0 : .28;
    const { base, pos, rg } = rain.userData, cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    const wrap = (v, c, span) => c - span/2 + ((((v - (c - span/2)) % span) + span) % span);
    for (let i=0;i<base.length;i++){
      const b = base[i], x = wrap(b[0] + t*1.5, cx, 40), z = wrap(b[2], cz, 40), y = wrap(b[1] - t*b[3], cy + 4, 16);
      pos[i*6] = x; pos[i*6+1] = y; pos[i*6+2] = z; pos[i*6+3] = x - .02; pos[i*6+4] = y - .55; pos[i*6+5] = z;
    }
    rg.attributes.position.needsUpdate = true;
    const sp = rain.userData.splash;
    if (sp){
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new V3(), sc = new V3();
      sp.userData.drops.forEach((d, i) => {
        d.t += dt/d.life; if (d.t >= 1){ d.t = 0; d.x = cx + (Math.random() - .5)*22; d.z = cz + (Math.random() - .5)*22; }
        const r = .02 + d.t*.16; m.compose(v.set(d.x, groundAt(d.x, d.z, 9) + .02, d.z), q, sc.set(r, r, r)); sp.setMatrixAt(i, m);
      });
      sp.instanceMatrix.needsUpdate = true;
    }
  }
  if (neonG.visible) updateNeonExtra(dt, t);
  if (neonG.visible) for (const s of neonSigns){
    if (!s.flick) continue;
    const k = Math.sin(t*1.7 + s.ph) > .93 ? (Math.random() < .5 ? .15 : 1) : 1;
    s.m.material.opacity = k;
  }
}

