/* ---------- Neon District detail: shopfronts, an elevated train line, rooftops, a skyline and four themed lots ---------- */
const NEON_FX = { train:null, trainT:6, lights:[], beacons:null, signal:null, signalT:0 };
function buildNeonExtra({ CITY, cityCar, sign }){
  const rnd = (a, b) => a + Math.random()*(b - a);
  const inCity = (x, z) => CITY.some(([x0, x1, z0, z1]) => x > x0 - .05 && x < x1 + .05 && z > z0 - .05 && z < z1 + .05);
  const metalM = kitMat({ color:0x2a2c33, roughness:.45, metalness:.8 });
  const concreteM = kitMat({ map:concreteTex.clone(), color:0x8a8a96, roughness:.85 }); concreteM.map.needsUpdate = true;

  // ---- shopfronts: lit windows, doors and striped awnings along the street level of every building that faces the open
  const shopTex = (hue, k) => canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#121218'; g.fillRect(0, 0, w, h);
    g.fillStyle = `hsl(${hue},70%,55%)`; g.fillRect(0, 0, w, 22); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 20, w, 3);
    g.font = '700 17px "Barlow Condensed", Arial'; g.fillStyle = '#fff'; g.textAlign = 'center'; g.fillText(['NOODLE BAR', 'PHONE FIX', 'LIQUOR', 'TATTOO', 'DUMPLINGS', 'PAWN & GOLD', 'LAUNDRY', 'ARCADE'][k % 8], w/2, 17);
    const win = (x0, x1) => { const gr = g.createLinearGradient(0, 30, 0, h - 8); gr.addColorStop(0, `hsla(${hue + 20},80%,72%,1)`); gr.addColorStop(1, `hsla(${hue},70%,38%,1)`); g.fillStyle = gr; g.fillRect(x0, 30, x1 - x0, h - 40);
      g.fillStyle = 'rgba(10,8,14,.55)'; for (let y=52;y<h - 12;y+=22) g.fillRect(x0 + 4, y, x1 - x0 - 8, 3);
      for (let i=0;i<10;i++){ g.fillStyle = `hsla(${Math.random()*360},60%,${40 + Math.random()*30}%,.9)`; g.fillRect(x0 + 6 + Math.random()*(x1 - x0 - 18), 36 + Math.floor(Math.random()*4)*22, 6 + Math.random()*8, 12); }
      g.strokeStyle = '#2b2b33'; g.lineWidth = 4; g.strokeRect(x0, 30, x1 - x0, h - 40); g.beginPath(); g.moveTo((x0 + x1)/2, 30); g.lineTo((x0 + x1)/2, h - 10); g.stroke(); };
    win(8, 96); win(160, 248);
    g.fillStyle = '#1d1b22'; g.fillRect(104, 34, 48, h - 34); const gd = g.createLinearGradient(0, 40, 0, h); gd.addColorStop(0, `hsla(${hue},60%,60%,.55)`); gd.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gd; g.fillRect(110, 40, 36, h - 40);
    g.fillStyle = '#2f2c36'; g.fillRect(0, h - 8, w, 8);
  });
  const shopMats = [320, 190, 35, 280, 0, 50, 205, 130].map((hue, k) => { const t = shopTex(hue, k); return kitMat({ map:t, emissive:0xffffff, emissiveMap:t, emissiveIntensity:.85, roughness:.4 }); });
  const awnMats = [['#d8423a', '#f2e6d8'], ['#2a6fd8', '#f2e6d8'], ['#1f9e6a', '#f2e6d8'], ['#7b3ec8', '#ffd36b']].map(([a, b]) =>
    kitMat({ map:canvasTex(64, 16, (g, w, h) => { for (let k=0;k<8;k++){ g.fillStyle = k % 2 ? b : a; g.fillRect(k*8, 0, 8, h); } }), roughness:.8, side:THREE.DoubleSide }));
  const front = (x, z, nx, nz, len) => {          // one stretch of shops on a face whose outward normal is (nx, nz)
    const n = Math.max(1, Math.round(len/5)), seg = len/n, ry = Math.atan2(nx, nz);
    for (let i=0;i<n;i++){ const t = -len/2 + seg*(i + .5), ox = x + nz*t, oz = z - nx*t;
      kitAt(ox, oz, ry, () => {
        const p = new THREE.PlaneGeometry(seg - .3, 3.1); kitAdd(p, shopMats[(Math.abs(Math.round(x*3 + z*7)) + i) % shopMats.length], 0, 1.7, .04); p.dispose();
        if (Math.random() < .7){ const aw = new THREE.PlaneGeometry(seg - .5, 1.2); kitAdd(aw, awnMats[(i + Math.abs(x|0)) % awnMats.length], 0, 3.5, .55, -1.05); aw.dispose(); }
      });
    }
  };
  for (const [x0, x1, z0, z1, h] of CITY){
    if (h < 5) continue;
    for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]){
      const fx = nx ? (nx > 0 ? x1 : x0) : (x0 + x1)/2, fz = nz ? (nz > 0 ? z1 : z0) : (z0 + z1)/2, len = nx ? z1 - z0 : x1 - x0;
      // keep only the parts of the face that look out onto open ground inside the arena
      const cuts = []; let run = null;
      for (let t=-len/2 + .5;t<=len/2 - .5;t+=1){ const sx = fx + nx*1.2 + (nx ? 0 : t), sz = fz + nz*1.2 + (nz ? 0 : t);
        const open = Math.abs(sx) < 44.5 && Math.abs(sz) < 44.5 && !inCity(sx, sz);
        if (open){ if (!run) run = [t, t]; else run[1] = t; } else if (run){ cuts.push(run); run = null; } }
      if (run) cuts.push(run);
      for (const [a, b] of cuts){ const l = b - a + 1; if (l < 3) continue; const m = (a + b)/2; front(fx + (nx ? 0 : m), fz + (nz ? 0 : m), nx, nz, l); }
    }
  }

  // ---- rooftops: air-con units, vents, water tanks, antennas and billboards
  const acM = kitMat({ color:0x9a9ca4, roughness:.6, metalness:.5 });
  const tankM = kitMat({ map:canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#5a4636'; g.fillRect(0, 0, w, h); for (let x=0;x<w;x+=6){ g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(x, 0, 2, h); } g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(0, 14, w, 3); g.fillRect(0, 44, w, 3); }), roughness:.8 });
  for (const [x0, x1, z0, z1, h] of CITY){
    if (h < 7) continue;
    const area = (x1 - x0)*(z1 - z0), n = Math.min(6, Math.max(1, Math.round(area/40)));
    for (let i=0;i<n;i++){ const x = rnd(x0 + 1.2, x1 - 1.2), z = rnd(z0 + 1.2, z1 - 1.2), r = Math.random();
      if (r < .5){ kitBox(1.4, .9, 1, acM, x, h + .45, z, Math.random()*.2); const f = new THREE.CylinderGeometry(.35, .35, .05, 14); kitAdd(f, metalM, x, h + .92, z); f.dispose(); }
      else if (r < .75){ const c = new THREE.CylinderGeometry(.25, .25, 1.4, 10); kitAdd(c, metalM, x, h + .7, z); kitAdd(c, metalM, x, h + 1.4, z + .4, HP); c.dispose(); }
      else { for (const [dx, dz] of [[-.8, -.8], [.8, -.8], [-.8, .8], [.8, .8]]) kitBox(.1, 1.6, .1, metalM, x + dx, h + .8, z + dz);
        const t = new THREE.CylinderGeometry(1.1, 1.1, 2.2, 14); kitAdd(t, tankM, x, h + 2.7, z); t.dispose(); const c = new THREE.ConeGeometry(1.15, .7, 14); kitAdd(c, tankM, x, h + 4.15, z); c.dispose(); }
    }
    if (Math.random() < .5){ const x = rnd(x0 + 1, x1 - 1), z = rnd(z0 + 1, z1 - 1); kitBar(x, h, z, x, h + 6, z, .05, metalM, 5); kitBar(x - .6, h + 4.5, z, x + .6, h + 4.5, z, .03, metalM, 4); }
  }
  // two rooftop billboards facing the main streets
  const adTex = (txt, a, b) => canvasTex(512, 192, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, a); gr.addColorStop(1, b); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    let fs = 92; g.font = `700 ${fs}px "Barlow Condensed", Arial`; while (g.measureText(txt).width > w - 60 && fs > 30){ fs -= 4; g.font = `700 ${fs}px "Barlow Condensed", Arial`; }
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(0,0,0,.35)'; g.fillText(txt, w/2 + 4, h/2 + 4); g.fillStyle = '#fff'; g.fillText(txt, w/2, h/2);
    g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12); });
  for (const [x, z, ry, txt, a, b] of [[23, -41.5, 0, 'X1 · HOLD THE LINE', '#ff3cc8', '#3b1ed8'], [-23, 41.5, Math.PI, 'DRINK DUST COLA', '#ff8a2a', '#d8233a']]){
    const t = adTex(txt, a, b), m = kitMat({ map:t, emissive:0xffffff, emissiveMap:t, emissiveIntensity:.9, roughness:.5 }, { see:true });
    const p = new THREE.PlaneGeometry(12, 4.5); kitAdd(p, m, x, 15.2, z + (ry ? -.06 : .06), 0, ry); p.dispose();
    kitBox(12.4, 4.9, .25, metalM, x, 15.2, z + (ry ? .1 : -.1)); for (const dx of [-4, 4]) kitBox(.25, 3, .25, metalM, x + dx, 11.5, z + (ry ? .4 : -.4));
  }

  // ---- fire escapes zig-zagging down a few tall faces
  const escape = (x, z, nx, nz, top) => { const ry = Math.atan2(nx, nz), sx = nz, sz = -nx;
    for (let y=3.2;y<top - 1;y+=3){ kitBox(3.2*Math.abs(sx) + 1.1*Math.abs(nx), .08, 3.2*Math.abs(sz) + 1.1*Math.abs(nz), metalM, x + nx*.6, y, z + nz*.6);
      kitBar(x + nx*1.15 - sx*1.6, y + .9, z + nz*1.15 - sz*1.6, x + nx*1.15 + sx*1.6, y + .9, z + nz*1.15 + sz*1.6, .03, metalM, 4);
      const d = (Math.round(y/3) % 2) ? 1 : -1; kitBar(x + nx*.6 - sx*1.4*d, y, z + nz*.6 - sz*1.4*d, x + nx*.6 + sx*1.2*d, y + 3, z + nz*.6 + sz*1.2*d, .09, metalM, 4); }
    void ry; };
  escape(37, -20, -1, 0, 14); escape(-37, 24, 1, 0, 15); escape(-20, -38, 0, 1, 16); escape(26, 38, 0, -1, 13);

  // ---- the elevated train line over the east-west street, with a train that roars past now and then
  const railM = kitMat({ map:concreteTex.clone(), color:0x6c6a78, roughness:.8 }); railM.map.needsUpdate = true;
  kitBox(96, .7, 4.2, railM, 0, 9.35, 0, 0, 4); kitBox(96, .5, .3, railM, 0, 9.95, -2, 0, 4); kitBox(96, .5, .3, railM, 0, 9.95, 2, 0, 4);
  for (const z of [-.75, .75]) kitBox(96, .12, .12, metalM, 0, 9.76, z);
  for (const x of [-34, -16, 16, 34]){ kitBox(1.3, 9, 1.3, railM, x, 4.5, 0, 0, 3); kitBox(1.6, .8, 4.2, railM, x, 8.6, 0, 0, 3); addCollider(x, 0, 1.3, 1.3, 9); }
  const train = new THREE.Group(); train.visible = false; neonG.add(train);
  const trainBody = new THREE.MeshStandardMaterial({ color:0xb8bcc8, roughness:.3, metalness:.8 });
  const trainWin = new THREE.MeshStandardMaterial({ color:0x111, emissive:0xfff0c8, emissiveIntensity:1.6 });
  const stripe = new THREE.MeshStandardMaterial({ color:0x111, emissive:0xff3cc8, emissiveIntensity:2 });
  for (let c=0;c<3;c++){ const g = new THREE.Group(); g.position.x = c*14.6; train.add(g);
    vp(g, Bx(14, 3, 2.9), trainBody, 0, 1.6, 0); vp(g, Bx(13.4, .9, 2.94), trainWin, 0, 2, 0); vp(g, Bx(14.02, .14, 2.95), stripe, 0, .7, 0);
    for (const x of [-5, 5]) vp(g, Bx(2, .5, 2.4), metalM, x, .1, 0); }
  vp(train, Bx(.1, .5, 2), new THREE.MeshBasicMaterial({ color:0xfff6d0 }), -7.05, 1.3, 0);
  train.position.set(-140, 9.8, 0); NEON_FX.train = train;

  // ---- traffic lights on the four corners of the crossroads, cycling
  const sigMats = ['#ff2a2a', '#ffb020', '#2aff6a'].map(c => [0, 1].map(() => kitMat({ color:0x111111, emissive:new THREE.Color(c), emissiveIntensity:.05 }, { see:true, noShadow:true })));
  for (const [x, z, ns] of [[10.4, -8.4, 1], [-10.4, 8.4, 1], [10.4, 8.4, 0], [-10.4, -8.4, 0]]){
    kitBar(x, 0, z, x, 4.6, z, .08, metalM, 6); kitBox(.4, 1.2, .35, metalM, x, 4.2, z);
    for (let k=0;k<3;k++){ const s = new THREE.SphereGeometry(.11, 8, 6); for (const f of [-1, 1]) kitAdd(s, sigMats[k][ns], x + (ns ? 0 : f*.19), 4.58 - k*.36, z + (ns ? f*.19 : 0)); s.dispose(); }
    addCollider(x, z, .3, .3, 4.6);
  }
  NEON_FX.signal = sigMats;

  // ---- street furniture: a bus shelter, vending machines, hydrants, bin bags, and cables strung across the streets
  const glassM = kitMat({ color:0x8fb4d8, roughness:.05, metalness:.2, transparent:true, opacity:.25 }, { see:true, noShadow:true });
  kitAt(22, -8.1, 0, () => { kitBox(3.4, .08, 1.3, metalM, 0, 2.5, 0); for (const x of [-1.6, 1.6]) kitBox(.08, 2.5, .08, metalM, x, 1.25, -.55);
    kitBox(3.2, 2.2, .04, glassM, 0, 1.3, -.58); kitBox(1.4, .1, .4, metalM, 0, .5, -.3); });
  const adT = adTex('LFG', '#2ee6ff', '#2a3bd8'), adM = kitMat({ map:adT, emissive:0xffffff, emissiveMap:adT, emissiveIntensity:.8 }, { see:true });
  const ap = new THREE.PlaneGeometry(1.2, 1.9); kitAdd(ap, adM, 23.75, 1.3, -8.1, 0, HP); ap.dispose();
  addCollider(22, -8.65, 3.4, .2, 2.5);
  for (const [x, z, ry, hue] of [[-12.4, -24, HP, 190], [12.4, 24, -HP, 330], [-14.6, 30, HP, 35]]){
    const t = canvasTex(64, 128, (g, w, h) => { g.fillStyle = `hsl(${hue},70%,45%)`; g.fillRect(0, 0, w, h); g.fillStyle = '#0d0d12'; g.fillRect(6, 10, 34, 80);
      for (let r=0;r<5;r++) for (let c=0;c<3;c++){ g.fillStyle = `hsl(${Math.random()*360},70%,60%)`; g.fillRect(9 + c*11, 14 + r*15, 7, 10); } g.fillStyle = '#ddd'; g.fillRect(44, 30, 14, 20); g.fillStyle = '#0d0d12'; g.fillRect(8, 100, 32, 14); });
    const m = kitMat({ map:t, emissive:0xffffff, emissiveMap:t, emissiveIntensity:.7, roughness:.4 });
    kitAt(x, z, ry, () => kitBox(1, 1.9, .8, m, 0, .95, 0)); addCollider(x, z, .9, .9, 1.9);
  }
  const hydM = kitMat({ color:0xc22a2a, roughness:.5, metalness:.3 });
  for (const [x, z] of [[11.6, -14], [-11.6, 18], [18, 9.6], [-24, -9.6]]){ const c = new THREE.CylinderGeometry(.14, .17, .7, 10); kitAdd(c, hydM, x, .5, z); c.dispose(); const t = new THREE.SphereGeometry(.15, 10, 6); kitAdd(t, hydM, x, .86, z); t.dispose(); }
  const bagM = kitMat({ color:0x15151a, roughness:.35, metalness:.1 });
  for (const [x, z] of [[17.5, -35], [-17.5, 35], [34, 22], [-34, -22], [31, -33]]) for (let k=0;k<5;k++){ const s = new THREE.SphereGeometry(rnd(.28, .42), 8, 6); kitAdd(s, bagM, x + rnd(-.7, .7), .25, z + rnd(-.6, .6), 0, 0, 0, 1, .75, 1); s.dispose(); }
  const cable = [];
  for (const [ax, az, bx, bz, y] of [[-9, -18, 9, -14, 7.5], [-9, -33, 9, -31, 6.6], [-9, 20, 9, 24, 7], [-9, 34, 9, 30, 6.8], [-30, -7, -28, 7, 7.6], [26, -7, 28, 7, 7.4], [-40, -7, -36, 7, 7.5]]){
    for (let k=0;k<10;k++){ const t0 = k/10, t1 = (k + 1)/10, sag = t => y - Math.sin(t*Math.PI)*1.1; cable.push(ax + (bx - ax)*t0, sag(t0), az + (bz - az)*t0, ax + (bx - ax)*t1, sag(t1), az + (bz - az)*t1); } }
  const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(cable, 3));
  neonG.add(new THREE.LineSegments(cg, new THREE.LineBasicMaterial({ color:0x07070a })));
  for (const [x, z] of [[-2.5, -17], [4, 22], [-24, 3], [28, -2.5]]){ const m = new THREE.Mesh(new THREE.CircleGeometry(.45, 16), metalM); m.rotation.x = -HP; m.position.set(x, .035, z); neonG.add(m); plume(x, .1, z, .9, 4, 9, 0xd8d0f0, .22, neonG); }

  // ---- the four lots, each with its own character
  const fruitM = kitMat({ color:0xf09030, roughness:.6 });
  // NW: night market. Stalls with striped awnings under strings of lanterns
  for (const [i, x] of [-29, -24.5, -20, -15.5].entries()){
    kitAt(x, -13.2, 0, () => { kitBox(3, 1.05, 1.1, concreteM, 0, .53, 0, 0, 2); kitBox(3.2, .06, 1.6, awnMats[i % 4], 0, 2.5, -.25, 0, 0, -.12);
      for (const [dx, dz] of [[-1.45, .45], [1.45, .45], [-1.45, -.9], [1.45, -.9]]) kitBox(.07, 2.5, .07, metalM, dx, 1.25, dz);
      for (let k=0;k<5;k++){ const s = new THREE.SphereGeometry(.16, 8, 6); kitAdd(s, fruitM, -1.1 + k*.55, 1.17, .1); s.dispose(); } });
    addCollider(x, -13.2, 3, 1.1, 1.05);
  }
  const lanternM = kitMat({ color:0x331, emissive:0xff6a3a, emissiveIntensity:2.2 }, { see:true, noShadow:true });
  const string = [];
  for (const [ax, az, bx, bz] of [[-31, -15.5, -14, -15.5], [-31, -11, -14, -11], [-31, -15.5, -14, -11]]){
    for (let k=0;k<=16;k++){ const t = k/16, x = ax + (bx - ax)*t, z = az + (bz - az)*t, y = 3.6 - Math.sin(t*Math.PI)*.7;
      if (k < 16) string.push(x, y, z, ax + (bx - ax)*(k + 1)/16, 3.6 - Math.sin((k + 1)/16*Math.PI)*.7, az + (bz - az)*(k + 1)/16);
      if (k % 2 === 0){ const s = new THREE.SphereGeometry(.13, 8, 6); kitAdd(s, lanternM, x, y - .18, z, 0, 0, 0, 1, 1.3, 1); s.dispose(); } } }
  const sg2 = new THREE.BufferGeometry(); sg2.setAttribute('position', new THREE.Float32BufferAttribute(string, 3)); neonG.add(new THREE.LineSegments(sg2, new THREE.LineBasicMaterial({ color:0x111 })));
  for (const x of [-31, -14]) for (const z of [-15.5, -11]) { kitBar(x, 0, z, x, 3.7, z, .05, metalM, 5); }
  const marketLight = new THREE.PointLight(0xff8a50, 1.2, 16, 2); marketLight.position.set(-22, 3.2, -13); neonG.add(marketLight);

  // NE: parking lot. Painted bays, more parked cars, a pay booth and a lit P sign
  const bayTex = canvasTex(256, 64, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(235,235,235,.6)'; for (let x=2;x<w;x+=42) g.fillRect(x, 0, 4, h); g.fillRect(0, 0, w, 3); });
  const bayM = kitMat({ map:bayTex, transparent:true, depthWrite:false, roughness:.6, polygonOffset:true, polygonOffsetFactor:-2 }, { see:true, noShadow:true });
  for (const [x, z, ry] of [[22, -35, 0], [17, -24, HP], [33.5, -20, -HP]]){ const p = new THREE.PlaneGeometry(14, 4.8); kitAdd(p, bayM, x, .03, z, -HP, 0, ry); p.dispose(); }
  cityCar(17, -21, true, 4); cityCar(17, -27.5, true, 1); cityCar(33.5, -22, true, 5); cityCar(24.5, -35, true, 2);
  kitAt(34.5, -16.5, 0, () => { kitBox(1.6, 2.3, 1.6, concreteM, 0, 1.15, 0, 0, 2); kitBox(1.62, .8, 1.62, glassM, 0, 1.6, 0); kitBox(1.9, .15, 1.9, metalM, 0, 2.35, 0); });
  addCollider(34.5, -16.5, 1.6, 1.6, 2.4);
  sign('P', '#4a8cff', 36.94, 5.2, -30, -HP, 1.6, 1.6, false);

  // SW: basketball court with hoops and bleachers
  const courtTex = canvasTex(512, 256, (g, w, h) => { g.fillStyle = '#2b4a6a'; g.fillRect(0, 0, w, h); g.fillStyle = '#b8562a'; g.fillRect(20, 16, w - 40, h - 32);
    g.strokeStyle = 'rgba(240,240,240,.85)'; g.lineWidth = 4; g.strokeRect(20, 16, w - 40, h - 32); g.beginPath(); g.moveTo(w/2, 16); g.lineTo(w/2, h - 16); g.stroke();
    g.beginPath(); g.arc(w/2, h/2, 34, 0, 7); g.stroke(); for (const s of [0, 1]){ const x = s ? w - 20 : 20, d = s ? -1 : 1; g.strokeRect(s ? x - 90 : x, h/2 - 40, 90, 80); g.beginPath(); g.arc(x, h/2, 110, -HP*d - HP + (s ? Math.PI : 0), HP*d - HP + (s ? Math.PI : 0) + Math.PI); g.stroke(); }
    speckle(g, w, h, 4000, '0,0,0', '255,255,255'); });
  const courtM = kitMat({ map:courtTex, roughness:.6, polygonOffset:true, polygonOffsetFactor:-2 }, { see:true, noShadow:true });
  const cp = new THREE.PlaneGeometry(16, 9); kitAdd(cp, courtM, -26, .03, 14, -HP); cp.dispose();
  const hoopM = kitMat({ color:0xff5a1a, roughness:.4, metalness:.5 }), boardM = kitMat({ color:0xf0f0f0, roughness:.3 });
  for (const s of [-1, 1]){ const x = -26 + s*8.6; kitBar(x, 0, 14, x, 3.4, 14, .09, metalM, 8); kitBar(x, 3.4, 14, x - s*.9, 3.4, 14, .06, metalM, 6);
    kitBox(.08, 1.1, 1.7, boardM, x - s*.95, 3.45, 14); const r = new THREE.TorusGeometry(.24, .025, 6, 16); kitAdd(r, hoopM, x - s*1.3, 3.05, 14, HP); r.dispose(); addCollider(x, 14, .3, .3, 3.4); }
  for (let k=0;k<3;k++) kitBox(7, .45, .8, concreteM, -27, .22 + k*.45, 20.2 + k*.55, 0, 2);
  addCollider(-27, 20.75, 7, 1.9, 1.35);

  // SE: construction site. A tower crane over the lot, scaffolding on the half-built block, girders and a cement mixer
  const craneY = kitMat({ color:0xe0a81c, roughness:.5, metalness:.4 });
  const lattice = (ax, ay, az, bx, by, bz, w) => {        // a square lattice beam between two points
    const d = new V3(bx - ax, by - ay, bz - az), L = d.length(), n = Math.max(2, Math.round(L/1.6)), u = d.clone().normalize();
    const side = Math.abs(u.y) > .9 ? new V3(1, 0, 0) : new V3(0, 1, 0), p1 = new V3().crossVectors(u, side).normalize().multiplyScalar(w/2), p2 = new V3().crossVectors(u, p1).normalize().multiplyScalar(w/2);
    const corners = [p1.clone().add(p2), p1.clone().sub(p2), p1.clone().negate().sub(p2), p1.clone().negate().add(p2)];
    for (const c of corners) kitBar(ax + c.x, ay + c.y, az + c.z, bx + c.x, by + c.y, bz + c.z, .07, craneY, 4);
    for (let k=0;k<n;k++){ const a = k/n, b = (k + 1)/n; for (let q=0;q<4;q++){ const c0 = corners[q], c1 = corners[(q + 1) % 4];
      kitBar(ax + d.x*a + c0.x, ay + d.y*a + c0.y, az + d.z*a + c0.z, ax + d.x*b + c1.x, ay + d.y*b + c1.y, az + d.z*b + c1.z, .035, craneY, 3); } }
  };
  const CX = 31, CZ = 35.5;
  lattice(CX, 0, CZ, CX, 30, CZ, 1.4); lattice(CX - 34, 30.7, CZ, CX + 10, 30.7, CZ, 1.1);
  kitBox(3, 2.4, 2.6, craneY, CX, 31.6, CZ); kitBox(2.2, 1.6, 2, kitMat({ color:0x111, emissive:0xffe8b0, emissiveIntensity:.6 }), CX - .3, 31.4, CZ + .4);
  kitBox(4, 2, 2.2, concreteM, CX + 8, 29.2, CZ, 0, 2);
  kitBar(CX - 20, 30.2, CZ, CX - 20, 18, CZ, .03, metalM, 4); kitBox(1.4, .25, .9, metalM, CX - 20, 17.9, CZ); kitBox(2.6, .3, .4, craneY, CX - 20, 17.3, CZ);
  addCollider(CX, CZ, 1.6, 1.6, 30);
  const scafM = kitMat({ color:0x9aa0aa, roughness:.4, metalness:.7 }), plankM = kitMat({ map:canvasTex(128, 32, (g, w, h) => { g.fillStyle = '#a07a48'; g.fillRect(0, 0, w, h); for (let y=0;y<h;y+=8){ g.fillStyle = 'rgba(40,20,5,.4)'; g.fillRect(0, y, w, 1); } }), roughness:.8 });
  for (const [x0, x1, z0, z1] of [[21.2, 21.2, 22, 30], [22, 30, 21.2, 21.2]]){
    const along = x0 === x1 ? 'z' : 'x', L = along === 'z' ? z1 - z0 : x1 - x0;
    for (let t=0;t<=L;t+=2){ const x = along === 'z' ? x0 : x0 + t, z = along === 'z' ? z0 + t : z0; kitBar(x, 0, z, x, 6.6, z, .04, scafM, 5); }
    for (const y of [2.2, 4.4]){ kitBox(along === 'z' ? .7 : L, .06, along === 'z' ? L : .7, plankM, along === 'z' ? x0 + .1 : (x0 + x1)/2, y, along === 'z' ? (z0 + z1)/2 : z0 + .1);
      kitBar(along === 'z' ? x0 - .25 : x0, y + 1, along === 'z' ? z0 : z0 - .25, along === 'z' ? x0 - .25 : x1, y + 1, along === 'z' ? z1 : z0 - .25, .025, scafM, 4); }
  }
  const girderM = kitMat({ color:0x8a3b20, roughness:.7, metalness:.6 });
  for (let k=0;k<5;k++){ const y = .15 + Math.floor(k/2)*.3, z = 25 + (k % 2)*.5 + (k > 3 ? .25 : 0); kitBox(5, .28, .22, girderM, 17.8, y, z - .6); }
  addCollider(17.8, 25.1, 5, 1.6, .9);
  kitAt(31.5, 15, .5, () => { const d = new THREE.CylinderGeometry(.7, .9, 1.6, 14); kitAdd(d, kitMat({ color:0xe86a1a, roughness:.5, metalness:.3 }), 0, 1.6, 0, .5); d.dispose();
    kitBox(1.2, .9, 2.6, metalM, 0, .55, .2); for (const dz of [-.8, 1]){ const w = new THREE.CylinderGeometry(.35, .35, 1.3, 12); kitAdd(w, metalM, 0, .35, dz, 0, 0, HP); w.dispose(); } });
  addCollider(31.5, 15, 1.8, 2.6, 2.2);
  for (const [x, z, a] of [[14.5, 12, false], [14.5, 33, false], [36, 27, true]]) jersey(x, z, a);

  // ---- skyline beyond the arena: tall towers with lit windows and blinking red beacons on top
  const skyTex = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#0d0e16'; g.fillRect(0, 0, w, h);
    for (let r=0;r<8;r++) for (let c=0;c<8;c++){ const l = Math.random(); g.fillStyle = l < .3 ? 'rgba(255,200,130,.9)' : l < .42 ? 'rgba(120,200,255,.85)' : l < .47 ? 'rgba(255,80,200,.8)' : '#07080c'; g.fillRect(3 + c*16, 3 + r*16, 9, 10); } });
  const skyM = kitMat({ map:skyTex, emissive:0xffffff, emissiveMap:skyTex, emissiveIntensity:.8, roughness:.8 }, { see:true, noShadow:true });
  const beacons = [];
  for (let i=0;i<26;i++){ const a = i/26*Math.PI*2 + rnd(-.1, .1), r = rnd(62, 120), x = Math.cos(a)*r, z = Math.sin(a)*r, w = rnd(9, 18), d = rnd(9, 18), h = rnd(26, 78);
    kitBox(w, h, d, skyM, x, h/2, z, rnd(-.3, .3), 7);
    if (Math.random() < .5) kitBox(w*.6, h*.25, d*.6, skyM, x, h + h*.125, z, 0, 7);
    beacons.push(x, h + (Math.random() < .5 ? h*.25 : 0) + .8, z); }
  const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(beacons, 3));
  NEON_FX.beacons = new THREE.Points(bg, new THREE.PointsMaterial({ color:0xff2a2a, size:1.4, sizeAttenuation:true, fog:false }));
  neonG.add(NEON_FX.beacons);
  kitFlush(neonG);
}
function updateNeonExtra(dt, t){
  const F = NEON_FX;
  if (F.beacons) F.beacons.visible = (t % 2) < 1.2;
  // traffic lights: north-south green then amber, then east-west
  if (F.signal){ const c = t % 16, ns = c < 6 ? 2 : c < 8 ? 1 : 0, ew = c >= 8 && c < 14 ? 2 : c >= 14 ? 1 : 0;
    for (let k=0;k<3;k++){ F.signal[2 - k][1].emissiveIntensity = (k === ns) ? 3 : .05; F.signal[2 - k][0].emissiveIntensity = (k === ew) ? 3 : .05; } }
  // the train: every 30-45 s it crosses the whole district in about 7 s
  if (F.train){
    if (!F.train.visible){ F.trainT -= dt; if (F.trainT <= 0){ F.train.visible = true; F.dir = Math.random() < .5 ? 1 : -1; F.train.position.x = -F.dir*150; F.train.rotation.y = F.dir > 0 ? Math.PI : 0;
      if (state === 'play') blast(.12, 260, 5, false, 2.6); } }
    else { F.train.position.x += F.dir*42*dt; if (Math.abs(F.train.position.x) > 160){ F.train.visible = false; F.trainT = 30 + Math.random()*15; } }
  }
}
