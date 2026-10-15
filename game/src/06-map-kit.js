/* ---------- Map kit: map detail is built in batches that merge into a few meshes (one draw call per material) ---------- */
const KIT = { parts:new Map(), base:new THREE.Matrix4(), solid:new Set() };
const _kq = new THREE.Quaternion(), _ke = new THREE.Euler(), _kv = new V3(), _ks = new V3();
// add a piece of geometry at a position/rotation/scale, relative to the current frame (see kitAt)
function kitAdd(geo, mat, x=0, y=0, z=0, rx=0, ry=0, rz=0, sx=1, sy=1, sz=1){
  const m = new THREE.Matrix4().compose(_kv.set(x, y, z), _kq.setFromEuler(_ke.set(rx, ry, rz)), _ks.set(sx, sy, sz));
  const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(m.premultiply(KIT.base));
  if (!KIT.parts.has(mat)) KIT.parts.set(mat, []); KIT.parts.get(mat).push(g);
  return g;
}
// a box by its centre; tile = metres per texture repeat (so long walls don't stretch)
function kitBox(w, h, d, mat, x, y, z, ry=0, tile=0, rx=0, rz=0){
  const g = new THREE.BoxGeometry(w, h, d); if (tile) tileBox(g, w, h, d, tile);
  kitAdd(g, mat, x, y, z, rx, ry, rz); g.dispose();
}
// build inside a moved/rotated frame: kitAt(x, z, ry, () => { ...parts in local coordinates... })
function kitAt(x, z, ry, fn, y=0){
  const old = KIT.base.clone();
  KIT.base.multiply(new THREE.Matrix4().compose(_kv.set(x, y, z), _kq.setFromEuler(_ke.set(0, ry, 0)), _ks.set(1, 1, 1)));
  fn(); KIT.base.copy(old);
}
// merge everything added since the last flush into one mesh per material and put it in the world
function kitFlush(parent = worldParent){
  const out = [];
  for (const [mat, list] of KIT.parts){
    let n = 0; for (const g of list) n += g.attributes.position.count;
    const pos = new Float32Array(n*3), nor = new Float32Array(n*3), uv = new Float32Array(n*2); let o = 0;
    for (const g of list){ const c = g.attributes.position.count;
      pos.set(g.attributes.position.array, o*3);
      if (g.attributes.normal) nor.set(g.attributes.normal.array, o*3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, o*2);
      o += c; g.dispose(); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.computeBoundingSphere(); geo.computeBoundingBox();
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = !mat.userData.noShadow; m.receiveShadow = true; m.matrixAutoUpdate = false;
    if (m.castShadow && mat.alphaTest && mat.map) m.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking:THREE.RGBADepthPacking, map:mat.map, alphaTest:mat.alphaTest });
    parent.add(m); if (!mat.userData.see) solids.push(m); out.push(m);
  }
  KIT.parts.clear(); KIT.base.identity();
  return out;
}
// a round bar between two points
function kitBar(ax, ay, az, bx, by, bz, r, mat, seg=6){
  const d = new V3(bx - ax, by - ay, bz - az), l = d.length(), g = new THREE.CylinderGeometry(r, r, l, seg);
  _ke.setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize())); const e = [_ke.x, _ke.y, _ke.z];
  kitAdd(g, mat, (ax + bx)/2, (ay + by)/2, (az + bz)/2, ...e); g.dispose();
}
const kitMat = (o, extra) => Object.assign(new THREE.MeshStandardMaterial(o), { userData:extra || {} });
// a crossed pair of see-through planes (bushes, ferns, leaf cards)
function kitCross(mat, x, y, z, w, h, ry=0, n=2){
  const g = new THREE.PlaneGeometry(w, h); g.translate(0, h/2, 0);
  for (let i=0;i<n;i++) kitAdd(g, mat, x, y, z, 0, ry + i*Math.PI/n, 0);
  g.dispose();
}

/* ---------- Dust Yard: the depot warehouse, a jackknifed truck, a water tower, scrap and a desert skyline ---------- */
const YARD_EXTRA = { platforms:[], perches:[] };
(function buildYardExtra(){
  const rnd = (a, b) => a + Math.random()*(b - a);
  // corrugated sheet metal, sun-bleached with rust running down from the ribs
  const sheetTex = col => canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = col; g.fillRect(0, 0, w, h);
    for (let x=0;x<w;x+=16){ const gr = g.createLinearGradient(x, 0, x + 16, 0); gr.addColorStop(0, 'rgba(0,0,0,.28)'); gr.addColorStop(.45, 'rgba(255,255,255,.12)'); gr.addColorStop(1, 'rgba(0,0,0,.22)'); g.fillStyle = gr; g.fillRect(x, 0, 16, h); }
    for (let i=0;i<22;i++){ const x = Math.random()*w, y = Math.random()*h*.6, l = 30 + Math.random()*110, gr = g.createLinearGradient(0, y, 0, y + l);
      gr.addColorStop(0, 'rgba(120,58,24,.55)'); gr.addColorStop(1, 'rgba(120,58,24,0)'); g.fillStyle = gr; g.fillRect(x, y, 3 + Math.random()*6, l); }
    speckle(g, w, h, 2500, '60,40,25', '235,225,210');
    g.fillStyle = 'rgba(40,30,20,.35)'; g.fillRect(0, h - 4, w, 4);
  });
  const sheetNS = new THREE.Vector2(.85,.85);
  const sheetM = kitMat({ map:sheetTex('#8f8a7c'), roughness:.55, metalness:.55, normalMap:sheetNorm, normalScale:sheetNS });
  const sheetBlue = kitMat({ map:sheetTex('#4f6b7c'), roughness:.55, metalness:.55, normalMap:sheetNorm, normalScale:sheetNS });
  const steelM = kitMat({ color:0x3b3a3c, roughness:.5, metalness:.75 });
  const yellowM = kitMat({ color:0xd8a020, roughness:.5, metalness:.3 });
  const slabTex = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#9b9488'; g.fillRect(0, 0, w, h); speckle(g, w, h, 5000, '60,56,50', '210,205,195');
    g.fillStyle = 'rgba(50,46,40,.45)'; g.fillRect(0, 0, w, 2); g.fillRect(0, 0, 2, h);
    for (let i=0;i<5;i++){ const x = Math.random()*w, y = Math.random()*h, r = 15 + Math.random()*40, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(30,24,18,.35)'); gr.addColorStop(1, 'rgba(30,24,18,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); } });
  const slabM = kitMat({ map:slabTex, roughness:.85 }, { noShadow:true });
  const woodTex = canvasTex(128, 64, (g, w, h) => { g.fillStyle = '#9a7650'; g.fillRect(0, 0, w, h); for (let y=0;y<h;y+=2){ g.fillStyle = `rgba(60,38,18,${.08 + Math.random()*.18})`; g.fillRect(0, y, w, 1); } speckle(g, w, h, 300, '50,30,10', '220,190,150'); });
  const woodM = kitMat({ map:woodTex, roughness:.85 });
  const tyreM = kitMat({ color:0x1d1c1b, roughness:.9 });
  const rustM = kitMat({ map:containerTex('#6d3d22'), roughness:.8, metalness:.4, normalMap:containerNorm, normalScale:new THREE.Vector2(.9,.9) });
  const darkGlass = kitMat({ color:0x15181c, roughness:.15, metalness:.8 });

  // ---- 1. Depot 7: a two-storey warehouse with a mezzanine, racks, roll-up doors and a caved-in east side
  const X0 = -41, X1 = -27, Z0 = 3, Z1 = 19, H = 6;
  const wall = (x0, x1, z0, z1, y0=0, h=H, mat=sheetM, collide=true) => {
    const w = Math.max(.25, x1 - x0), d = Math.max(.25, z1 - z0);
    kitBox(w, h, d, mat, (x0 + x1)/2, y0 + h/2, (z0 + z1)/2, 0, 3);
    if (collide) addCollider((x0 + x1)/2, (z0 + z1)/2, w, d, y0 + h);
    else if (y0 > 0) boxes.push({ minX:(x0 + x1)/2 - w/2, maxX:(x0 + x1)/2 + w/2, minZ:(z0 + z1)/2 - d/2, maxZ:(z0 + z1)/2 + d/2, top:y0 + h, bot:y0 });   // over a door: solid above head height
  };
  const slab = new THREE.PlaneGeometry(X1 - X0 + 2, Z1 - Z0 + 4); tileBoxPlane(slab, X1 - X0 + 2, Z1 - Z0 + 4, 4);
  kitAdd(slab, slabM, (X0 + X1)/2, .012, (Z0 + Z1)/2, -HP); slab.dispose();
  wall(X0, X0 + .25, Z0, Z1);                                                        // west, solid
  wall(X0, -37, Z0, Z0 + .25); wall(-31, X1, Z0, Z0 + .25); wall(-37, -31, Z0, Z0 + .25, 3.6, H - 3.6, sheetBlue, false);   // north, roll-up door
  wall(X0, -38, Z1 - .25, Z1); wall(-33, X1, Z1 - .25, Z1); wall(-38, -33, Z1 - .25, Z1, 3.6, H - 3.6, sheetBlue, false);   // south, roll-up door
  wall(X1 - .25, X1, Z0, 7); wall(X1 - .25, X1, 15, Z1);                              // east: the middle has caved in
  wall(X1 - .25, X1, 7, 8.6, 0, 3.4); wall(X1 - .25, X1, 13.6, 15, 0, 2.2);           // jagged stubs where it tore
  // half-open roll-up shutters (the rolled part at the top of each door)
  for (const [x, z] of [[-34, Z0 - .3], [-35.5, Z1 + .3]]){ const c = new THREE.CylinderGeometry(.32, .32, x === -34 ? 6 : 5, 14); kitAdd(c, sheetBlue, x, 3.85, z, 0, 0, HP); c.dispose(); }
  // steel frame: corner posts and roof trusses
  for (const [x, z] of [[X0, Z0], [X1, Z0], [X0, Z1], [X1, Z1]]) kitBox(.35, H + .2, .35, steelM, x, (H + .2)/2, z);
  for (const z of [7, 11, 15]){ const x1 = z === 11 ? X0 + 9 : X1;      // the middle truss snapped where the roof fell in
    kitBar(X0, 5.85, z, x1, z === 11 ? 5.5 : 5.85, z, .12, steelM); kitBar(X0, 4.95, z, x1, z === 11 ? 4.7 : 4.95, z, .07, steelM);
    for (let x=X0 + 1;x<x1 - .5;x+=2) kitBar(x, 4.95, z, x + 1, 5.85, z, .05, steelM); }
  // roof: whole over the west half, only the ends over the east half (the middle fell in)
  const roof = (x0, x1, z0, z1, tilt=0) => { const w = x1 - x0, d = z1 - z0; kitBox(w, .12, d, sheetM, (x0 + x1)/2, 6.06, (z0 + z1)/2, 0, 3, 0, tilt); };
  roof(X0 - .3, -33, Z0 - .3, Z1 + .3); roof(-33, X1 + .3, Z0 - .3, 7.2); roof(-33, X1 + .3, 14.8, Z1 + .3);
  for (const [x0, x1, z0, z1] of [[X0 - .3, -33, Z0 - .3, Z1 + .3], [-33, X1 + .3, Z0 - .3, 7.2], [-33, X1 + .3, 14.8, Z1 + .3]]) YARD_EXTRA.platforms.push({ minX:x0, maxX:x1, minZ:z0, maxZ:z1, top:6.12, under:6 });
  kitBox(5, .12, 3.2, sheetM, -30.6, 4.6, 9.2, .3, 3, .35, -.55);                     // a sheet hanging down into the gap
  for (const [x, z, r] of [[-28.6, 10.5, .8], [-29.8, 12.6, 2.1], [-25.8, 11.6, -.4]]){ kitBox(rnd(1.6, 2.6), .12, rnd(1.2, 2), sheetM, x, .4, z, r, 3, rnd(-.3, .3), rnd(-.4, .4)); }
  kitBox(4.5, .3, .2, steelM, -29, 1.2, 11.2, .9, 0, 0, .45);                         // a fallen beam
  addCollider(-28.9, 11.4, 2.2, 1.8, 1.25);
  const lampM = kitMat({ color:0xfff0d0, emissive:0xffd9a0, emissiveIntensity:2.4 }, { see:true, noShadow:true });
  for (const z of [7, 15]) for (const x of [-38, -31]){ kitBox(.6, .1, .3, lampM, x, 4.8, z); kitBar(x, 4.85, z, x, 5.75, z, .015, steelM, 4); }
  const depotLight = new THREE.PointLight(0xffd9a0, 1.1, 16, 2); depotLight.position.set(-34, 4.6, 11); worldParent.add(depotLight);
  // windows high on the west wall
  for (const z of [6, 11, 16]) kitBox(.08, 1, 2.2, darkGlass, X0 + .17, 4.7, z);
  // mezzanine along the west side, with stairs up its east edge
  const MX = -35.5, MTOP = 3;
  const plateTex = canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#7d7c78'; g.fillRect(0, 0, w, h); speckle(g, w, h, 400, '40,40,40', '200,200,195');
    for (let y=4;y<h;y+=12) for (let x=(y/12|0)%2*6 + 2;x<w;x+=12){ g.fillStyle = 'rgba(230,230,225,.35)'; g.fillRect(x, y, 6, 2); g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(x, y + 2, 6, 1); } });
  const plateM = kitMat({ map:plateTex, roughness:.6, metalness:.35 });
  kitBox(MX - X0 - .25, .22, Z1 - Z0 - .5, plateM, (X0 + .25 + MX)/2, MTOP - .11, (Z0 + Z1)/2, 0, 1.5);
  YARD_EXTRA.platforms.push({ minX:X0 + .25, maxX:MX, minZ:Z0 + .25, maxZ:Z1 - .25, top:MTOP, under:MTOP - .22 });
  for (const z of [5, 12, 17.5]) { kitBox(.25, MTOP, .25, steelM, MX - .15, MTOP/2, z); addCollider(MX - .15, z, .3, .3, MTOP - .25); }
  for (let i=0;i<9;i++){ const top = .333*(i + 1), z0 = 8.8 + i*.72; kitBox(1.8, top, .72, plateM, MX + 1.0, top/2, z0 + .36, 0, 1.2); addCollider(MX + 1.0, z0 + .36, 1.8, .72, top); }
  // railings: along the mezzanine edge (gap at the stairs) and up the stairs
  const rail = (x0, z0, x1, z1, y0, y1) => { const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0)/1.5));
    kitBar(x0, y0 + 1, z0, x1, y1 + 1, z1, .035, yellowM); kitBar(x0, y0 + .5, z0, x1, y1 + .5, z1, .025, yellowM);
    for (let k=0;k<=n;k++){ const t = k/n; kitBox(.05, 1, .05, yellowM, x0 + (x1 - x0)*t, y0 + (y1 - y0)*t + .5, z0 + (z1 - z0)*t); } };
  rail(MX, Z0 + .3, MX, 8.6, MTOP, MTOP); rail(MX, 15.4, MX, Z1 - .3, MTOP, MTOP);
  rail(MX + 1.9, 8.8, MX + 1.9, 15.3, 0, MTOP);
  // pallet racks: steel uprights, orange beams, shelves stacked with boxes and sacks
  const orangeM = kitMat({ color:0xd2551e, roughness:.55, metalness:.4 });
  const boxM = kitMat({ map:crateTex, roughness:.9 });
  for (const zc of [7.4, 14.6]){
    const x = -30.4, len = 4;
    for (const dz of [-len/2, 0, len/2]) for (const dx of [-.5, .5]) kitBox(.08, 3.3, .08, steelM, x + dx, 1.65, zc + dz);
    for (const y of [.15, 1.2, 2.25, 3.25]){ for (const dx of [-.5, .5]) kitBox(.06, .12, len, orangeM, x + dx, y, zc); kitBox(1.05, .04, len, woodM, x, y + .08, zc); }
    for (const y of [.25, 1.3, 2.35]) for (let k=0;k<3;k++) if (Math.random() < .85){ const s = rnd(.6, .9); kitBox(s, s*rnd(.7, 1), s, boxM, x + rnd(-.1, .1), y + s*.45, zc - 1.3 + k*1.3, rnd(-.2, .2)); }
    addCollider(x, zc, 1.1, len + .1, 3.3);
  }
  // pallets and crates under the mezzanine, oil drums by the door
  for (const [x, z, n] of [[-39.5, 16.5, 2], [-38.6, 13.8, 1], [-39.6, 6.2, 3]]){
    for (let k=0;k<n;k++){ kitBox(1.2, .14, 1.2, woodM, x, .07 + k*.95, z, k*.2); kitBox(1.05, .8, 1.05, boxM, x, .55 + k*.95, z, k*.2); }
    addCollider(x, z, 1.25, 1.25, .95*n);
  }
  // the sign over the north door
  const sc = document.createElement('canvas'); sc.width = 512; sc.height = 128; const sg = sc.getContext('2d');
  sg.fillStyle = '#e8e0cc'; sg.fillRect(0, 0, 512, 128); sg.fillStyle = '#b8312a'; sg.fillRect(0, 0, 512, 18); sg.fillRect(0, 110, 512, 18);
  sg.font = '700 82px "Barlow Condensed", Arial, sans-serif'; sg.textAlign = 'center'; sg.textBaseline = 'middle'; sg.fillStyle = '#2a2420'; sg.fillText('DEPOT  7', 256, 66);
  for (let i=0;i<900;i++){ sg.fillStyle = `rgba(90,60,30,${Math.random()*.3})`; sg.fillRect(Math.random()*512, Math.random()*128, 2 + Math.random()*4, 1 + Math.random()*3); }
  const signM = kitMat({ map:new THREE.CanvasTexture(sc), roughness:.8 }, { see:true });
  const sp = new THREE.PlaneGeometry(5, 1.25); kitAdd(sp, signM, -34, 5.05, Z0 - .14, 0, Math.PI); sp.dispose();
  // forklift parked outside the north door
  kitAt(-28.6, .4, .6, () => {
    kitBox(1.2, .9, 2, yellowM, 0, .75, 0); kitBox(1.1, .7, .7, steelM, 0, .7, .75); kitBox(1.2, .08, 1.3, steelM, 0, 2.15, -.2);
    for (const dx of [-.55, .55]){ kitBox(.07, 1.9, .07, steelM, dx, 1.2, .4); kitBox(.07, 1.9, .07, steelM, dx, 1.2, -.75); kitBox(.1, 2.6, .1, steelM, dx*.7, 1.3, -1.1); kitBox(.12, .05, 1.1, steelM, dx*.5, .1, -1.6); }
    for (const [dx, dz] of [[-.6, -.6], [.6, -.6], [-.55, .7], [.55, .7]]){ const c = new THREE.CylinderGeometry(.3, .3, .22, 12); kitAdd(c, steelM, dx, .3, dz, 0, 0, HP); c.dispose(); }
  });
  addCollider(-28.6, .4, 1.9, 2.4, 1.6);

  // ---- 2. a jackknifed semi: flatbed trailer with a container, the cab twisted off to the side
  const trailerM = kitMat({ map:containerTex('#5b6d7a'), roughness:.75, metalness:.25, normalMap:containerNorm, normalScale:new THREE.Vector2(.9,.9) });
  const cabTex = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#a3322a'; g.fillRect(0, 0, w, h); speckle(g, w, h, 900, '60,20,10', '230,160,140');
    for (let i=0;i<40;i++){ g.fillStyle = `rgba(80,40,20,${Math.random()*.5})`; g.fillRect(Math.random()*w, Math.random()*h, 2 + Math.random()*10, 1 + Math.random()*4); } g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(0, h*.62, w, 4); });
  const cabM = kitMat({ map:cabTex, roughness:.5, metalness:.45 });
  kitAt(4.75, -15, 0, () => {
    kitBox(11.5, .35, 2.5, steelM, 0, 1.1, 0); kitBox(10.6, 2.5, 2.44, trailerM, -.3, 2.53, 0);
    for (const x of [-4.6, -3.4]) for (const z of [-1.05, 1.05]){ const c = new THREE.CylinderGeometry(.5, .5, .4, 16); kitAdd(c, steelM, x, .5, z, HP); c.dispose(); }
    kitBox(.12, .9, .12, steelM, 3.6, .5, -.9); kitBox(.12, .9, .12, steelM, 3.6, .5, .9);
  });
  addCollider(4.75, -15, 11.5, 2.5, 3.8);
  kitAt(12.4, -14.3, .55, () => {
    kitBox(3, 1, 2.4, cabM, 0, 1.2, 0); kitBox(1.8, 1.6, 2.36, cabM, .45, 2.5, 0); kitBox(.06, .9, 2, darkGlass, 1.36, 2.65, 0);
    kitBox(.5, .8, 2.42, steelM, 1.55, .95, 0); kitBox(.12, 2.2, .12, steelM, -.4, 3, 1.05);
    for (const [x, z] of [[1, -1.1], [1, 1.1], [-1, -1.1], [-1, 1.1]]){ const c = new THREE.CylinderGeometry(.52, .52, .38, 16); kitAdd(c, steelM, x, .52, z, HP); c.dispose(); }
  }, 0);
  addCollider(12.5, -14.2, 3.2, 3.2, 3.3);

  // ---- 3. a rusty water tower on stilts: a landmark you can see from anywhere
  const tankTex = canvasTex(256, 128, (g, w, h) => { g.fillStyle = '#5e7f7c'; g.fillRect(0, 0, w, h);
    for (let x=0;x<w;x+=32){ g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x, 0, 2, h); }
    for (let i=0;i<30;i++){ const x = Math.random()*w, gr = g.createLinearGradient(0, 10, 0, h); gr.addColorStop(0, 'rgba(130,60,25,.6)'); gr.addColorStop(1, 'rgba(130,60,25,0)'); g.fillStyle = gr; g.fillRect(x, 10 + Math.random()*20, 2 + Math.random()*5, h); }
    g.font = '700 46px "Barlow Condensed", Arial'; g.fillStyle = 'rgba(240,230,210,.8)'; g.textAlign = 'center'; g.fillText('DUST YARD', w*.25, h*.55); g.fillText('DUST YARD', w*.75, h*.55); });
  const tankM = kitMat({ map:tankTex, roughness:.6, metalness:.45 });
  kitAt(2, 38.5, .3, () => {
    for (const [x, z] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]){ kitBox(.3, 9, .3, steelM, x, 4.5, z); }
    for (const y of [3, 6.2]){ for (const [x0, z0, x1, z1] of [[-2, -2, 2, -2], [-2, 2, 2, 2], [-2, -2, -2, 2], [2, -2, 2, 2]]){ kitBox(Math.abs(x1 - x0) || .12, .12, Math.abs(z1 - z0) || .12, steelM, (x0 + x1)/2, y, (z0 + z1)/2); } }
    for (const s of [-2, 2]){ kitBar(-2, 3, s, 2, 6.2, s, .04, steelM); kitBar(-2, 6.2, s, 2, 3, s, .04, steelM); kitBar(s, 3, -2, s, 6.2, 2, .04, steelM); kitBar(s, 6.2, -2, s, 3, 2, .04, steelM); }
    const t = new THREE.CylinderGeometry(2.7, 2.7, 4, 24, 1, true); kitAdd(t, tankM, 0, 11, 0); t.dispose();
    const b = new THREE.CylinderGeometry(2.7, 2.7, .2, 24); kitAdd(b, steelM, 0, 9.05, 0); b.dispose();
    const r = new THREE.ConeGeometry(2.95, 1.6, 24); kitAdd(r, steelM, 0, 13.8, 0); r.dispose();
    kitBox(6.2, .1, 6.2, steelM, 0, 9, 0);
    for (let y=.4;y<9;y+=.4) kitBox(.04, .04, .5, steelM, 2.15, y, 0);
    kitBox(.04, 9, .04, steelM, 2.15, 4.5, -.25); kitBox(.04, 9, .04, steelM, 2.15, 4.5, .25);
  });
  for (const [x, z] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]){ const c = Math.cos(.3), s = Math.sin(.3); addCollider(2 + x*c + z*s, 38.5 - x*s + z*c, .4, .4, 9); }

  // container doors: lock bars and a frame on each short end
  const barM = kitMat({ color:0x2c2a28, roughness:.5, metalness:.7 });
  for (const [x, z, w, d, c, stack] of containers){ for (const level of stack ? [0, 1] : [0]){ const y0 = level*2.6, alongX = w > d, L = alongX ? w : d, W = alongX ? d : w;
    for (const e of [-1, 1]){ for (const o of [-.75, -.3, .3, .75]){ const px = alongX ? x + e*(L/2 + .03) : x + o*W/2, pz = alongX ? z + o*W/2 : z + e*(L/2 + .03); kitBox(.06, 2.3, .06, barM, px, y0 + 1.3, pz); }
      const fx = alongX ? x + e*(L/2 + .02) : x, fz = alongX ? z : z + e*(L/2 + .02);
      kitBox(alongX ? .08 : W + .04, .14, alongX ? W + .04 : .08, barM, fx, y0 + .07, fz); kitBox(alongX ? .08 : W + .04, .14, alongX ? W + .04 : .08, barM, fx, y0 + 2.53, fz); } } }
  // ---- 4. cover out in the open: a stack of concrete pipes and two scrap heaps
  const pipeM = kitMat({ map:concreteTex.clone(), roughness:.9 }); pipeM.map.repeat.set(2, 1); pipeM.map.needsUpdate = true;
  for (const [x, y, z] of [[13.25, .7, -30], [14.75, .7, -30], [14, 1.9, -30]]){ const c = new THREE.CylinderGeometry(.7, .7, 3, 18, 1, true); kitAdd(c, pipeM, x, y, z, HP); const i = new THREE.CylinderGeometry(.55, .55, 3.02, 18, 1, true); kitAdd(i, pipeM, x, y, z, HP); c.dispose(); i.dispose(); }
  addCollider(14, -30, 3.1, 3.1, 2.6);
  const scrap = (cx, cz) => {
    for (let i=0;i<14;i++){ const a = Math.random()*6.3, r = Math.random()*1.3, s = rnd(.4, 1.2), mat = Math.random() < .5 ? rustM : steelM;
      if (Math.random() < .35){ const c = new THREE.CylinderGeometry(s*.3, s*.3, s*1.8, 10); kitAdd(c, mat, cx + Math.cos(a)*r, rnd(.2, 1), cz + Math.sin(a)*r, rnd(0, 3), rnd(0, 3), rnd(0, 3)); c.dispose(); }
      else kitBox(s*1.6, s*.5, s, mat, cx + Math.cos(a)*r, rnd(.2, 1.1), cz + Math.sin(a)*r, rnd(0, 3), 0, rnd(-.5, .5), rnd(-.5, .5)); }
    const t = new THREE.TorusGeometry(.32, .12, 8, 16); for (let k=0;k<3;k++) kitAdd(t, tyreM, cx + rnd(-1.4, 1.4), .14 + k*.05, cz + rnd(-1.4, 1.4), HP + rnd(-.3, .3), 0, rnd(-.3, .3)); t.dispose();
    addCollider(cx, cz, 2.6, 2.6, 1.4);
  };
  scrap(-8, -28); scrap(22, -37.5); scrap(38.5, 28);

  // ---- 5. ground detail: dry desert shrubs, painted lines, loose planks and pallets
  const shrubTex = canvasTex(128, 128, (g, w, h) => { g.clearRect(0, 0, w, h); g.lineCap = 'round';
    for (let i=0;i<70;i++){ const a = -Math.PI/2 + (Math.random() - .5)*2.6, l = 20 + Math.random()*55; g.strokeStyle = `rgba(${110 + Math.random()*50|0},${90 + Math.random()*40|0},${55 + Math.random()*25|0},1)`; g.lineWidth = 1 + Math.random()*2;
      g.beginPath(); g.moveTo(64, 126); g.quadraticCurveTo(64 + Math.cos(a)*l*.5 + (Math.random() - .5)*20, 126 + Math.sin(a)*l*.5, 64 + Math.cos(a)*l, 126 + Math.sin(a)*l); g.stroke(); } });
  const shrubM = kitMat({ map:shrubTex, alphaTest:.4, side:THREE.DoubleSide, roughness:1 }, { see:true, noShadow:true });
  for (let i=0;i<60;i++){ const x = rnd(-43, 43), z = rnd(-43, 43); if (!freeSpot(x, z, 1.2) || (x > -42 && x < -26 && z > 2 && z < 20)) continue; const s = rnd(.5, 1.1); kitCross(shrubM, x, 0, z, 1.4*s, 1*s, Math.random()*3); }
  const lineTex = canvasTex(64, 16, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(230,190,60,.55)'; g.fillRect(0, 3, w, 10); for (let i=0;i<60;i++){ g.clearRect(Math.random()*w, Math.random()*h, 3, 2); } });
  const lineM = kitMat({ map:lineTex, transparent:true, depthWrite:false, roughness:1, polygonOffset:true, polygonOffsetFactor:-2 }, { see:true, noShadow:true });
  for (const [x, z, l, r] of [[-12, -1, 16, 0], [12, 1, 14, 0], [0, -26, 10, HP], [27, -8, 9, HP], [-20, 40, 12, 0]]){ const p = new THREE.PlaneGeometry(l, .22); kitAdd(p, lineM, x, .02, z, -HP, 0, r); p.dispose(); }
  for (let i=0;i<10;i++){ const x = rnd(-40, 40), z = rnd(-40, 40); if (!freeSpot(x, z, 1.5)) continue; kitBox(1.2, .14, 1.2, woodM, x, .07, z, Math.random()*3); if (Math.random() < .5) kitBox(1.2, .14, 1.2, woodM, x + .1, .21, z, Math.random()*3); }
  for (let i=0;i<14;i++){ const x = rnd(-42, 42), z = rnd(-42, 42); if (!freeSpot(x, z, 1)) continue; kitBox(rnd(1.5, 2.6), .05, .22, woodM, x, .03, z, Math.random()*3); }

  // ---- 6. the skyline beyond the fence: mesas, dunes, ruined houses and a power line
  const rockTex = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#a8724a'; g.fillRect(0, 0, w, h);
    for (let y=0;y<h;y+=4 + Math.random()*10){ g.fillStyle = `rgba(${Math.random() < .5 ? '90,50,30' : '220,170,120'},${.15 + Math.random()*.25})`; g.fillRect(0, y, w, 2 + Math.random()*6); }
    speckle(g, w, h, 3000, '60,35,20', '230,190,150'); });
  // far mesas drawn without fog but pre-tinted towards the haze, so they read as a distant silhouette
  const hazeTex = canvasTex(4, 64, (g, w, h) => { const gr = g.createLinearGradient(0, h, 0, 0); gr.addColorStop(0, '#d3a58c'); gr.addColorStop(.5, '#b48682'); gr.addColorStop(1, '#8c6a78'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  hazeTex.wrapS = hazeTex.wrapT = THREE.ClampToEdgeWrapping;
  const rockM = Object.assign(new THREE.MeshBasicMaterial({ map:hazeTex, fog:false }), { userData:{ see:true, noShadow:true } });
  const mesa = (x, z, w, h, d) => {
    for (let t=0;t<2;t++){ const tw = w*(t ? rnd(.35, .6) : 1), th = h*(t ? rnd(.2, .35) : 1), y0 = t ? h : 0;
      if (t === 1 && Math.random() < .5) break;
      const g = new THREE.CylinderGeometry(tw*.46, tw*.5, th, 14, 2); const a = g.attributes.position;
      for (let k=0;k<a.count;k++){ const vx = a.getX(k), vz = a.getZ(k), n = 1 + Math.sin(Math.atan2(vz, vx)*5 + x)*.12 + (Math.random() - .5)*.1; a.setX(k, vx*n); a.setZ(k, vz*n*d/w); }
      kitAdd(g, rockM, x, y0 + th/2, z, 0, Math.random()*3); g.dispose(); }
  };
  for (let i=0;i<11;i++){ const a = i/11*Math.PI*2 + rnd(-.2, .2), r = rnd(260, 340); mesa(Math.cos(a)*r, Math.sin(a)*r, rnd(90, 170), rnd(28, 55), rnd(50, 90)); }
  const adobeM = kitMat({ map:bldTex.clone(), roughness:.95 }, { see:true });
  for (const [x, z, w, d, h] of [[-62, -20, 8, 6, 4], [-58, 26, 6, 6, 3.2], [60, -52, 9, 5, 4.5], [64, 30, 6, 7, 3.6], [-30, 64, 7, 6, 4], [24, -66, 8, 6, 3.4]]){
    kitBox(w, h, d, adobeM, x, h/2, z, Math.random()*.6); kitBox(w*.5, h*.6, d*.4, adobeM, x + w*.4, h*.3, z + d*.3, Math.random()*.6); }
  const polePts = [];
  for (let z=-110;z<=110;z+=36){ const x = 58 + Math.sin(z*.02)*4; kitBox(.3, 11, .3, woodM, x, 5.5, z); kitBox(3.2, .2, .2, woodM, x, 10.4, z); polePts.push([x, z]); }
  const wire = [];
  for (const off of [-1.4, 0, 1.4]) for (let i=0;i<polePts.length - 1;i++){ const [x0, z0] = polePts[i], [x1, z1] = polePts[i + 1];
    for (let k=0;k<12;k++){ const t0 = k/12, t1 = (k + 1)/12, sag = t => 10.5 - Math.sin(t*Math.PI)*1.6;
      wire.push(x0 + (x1 - x0)*t0 + off, sag(t0), z0 + (z1 - z0)*t0, x0 + (x1 - x0)*t1 + off, sag(t1), z0 + (z1 - z0)*t1); } }
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
  worldParent.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color:0x2a2420 })));
  kitFlush(worldParent);
  YARD_EXTRA.perches.push([-38.5, 11, MTOP]);
})();
// plane UVs by real size (for floors)
function tileBoxPlane(geo, w, d, s){ const uv = geo.attributes.uv; for (let i=0;i<uv.count;i++) uv.setXY(i, uv.getX(i)*w/s, uv.getY(i)*d/s); uv.needsUpdate = true; }
