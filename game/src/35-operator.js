/* ---------- Operator: character customization + third-person camera ---------- */
const OP_ARMOR = [['sand','Sand',0xd9c4a0], ['olive','Olive',0x8a9566], ['urban','Urban',0xa7abb0], ['night','Night',0x3d4046], ['arctic','Arctic',0xf0f2f4],
  ['navy','Navy',0x41557f], ['crimson','Crimson',0xa63c3c], ['x1','X1 Blue',0x2f6bff], ['violet','Violet',0x7b52c7], ['gold','Gold',0xd8a93a,'holder']];
const OP_SUIT = [['olive','Olive',0x56603e], ['black','Black',0x22252a], ['grey','Grey',0x6c7076], ['tan','Tan',0x9c8a68], ['navy','Navy',0x2a3552], ['forest','Forest',0x2f4a33], ['wine','Wine',0x5a2430]];
const OP_ACCENT = [['red','Red',0xd23c3c], ['orange','Orange',0xff8a2a], ['yellow','Yellow',0xf0c419], ['green','Green',0x5cff8a], ['cyan','Cyan',0x2ee6ff],
  ['blue','Blue',0x2f6bff], ['pink','Pink',0xff3cc8], ['white','White',0xeeeeee], ['black','Black',0x1a1a1a]];
const OP_VISOR = [['smoke','Smoke',0x1c2026], ['mirror','Gold mirror',0xd8a93a], ['cyan','Cyan glow',0x2ee6ff,0,1], ['red','Red glow',0xff3344,0,1], ['green','Green glow',0x5cff8a,0,1], ['purple','Purple glow',0xb45cff,0,1]];
const OP_HEAD = [['none','None','Clean helmet'], ['nvg','Night vision','Flipped-up goggles'], ['antenna','Comms','Radio antenna'], ['band','Ninja band','X1 Ninja headband'], ['kabuto','Shogun crest','Golden horns']];
const OP_BACK = [['none','None','Nothing on the back'], ['jetpack','Jetpack','Activate (F / hold Triangle) to fly for 10 s'], ['katana','Katana','Activate (F / hold Triangle) to fight with the sword for 30 s'], ['pack','Assault pack','+1 grenade of each kind, 25% more spare ammo'], ['radio','Radio','Killstreaks need 1 kill less'], ['tanks','Air tanks','Activate (F / hold Triangle) for mid-air boosts for 12 s']];
// ---- operator types: armored, human soldier, alien, animal ----
const OP_KIND = [['armor','Armored','Sci-fi battle armor'], ['human','Soldier','Human special forces'], ['alien','Alien','Space suit and glass dome'], ['animal','Animal','Animal in combat gear']];
const OP_SKIN = [['light','Light',0xf1c9a5], ['tan','Tan',0xc99872], ['brown','Brown',0x8d5a3b], ['dark','Dark',0x5a3a26]];
const OP_ALIEN = [['green','Green',0x7bd36b], ['grey','Grey',0xa3abb5], ['purple','Purple',0x9b6bd3], ['blue','Blue',0x5aa0e0], ['red','Red',0xd8584f]];
const OP_ANIMAL = [['wolf','Wolf','Grey wolf',0x7d7f86], ['fox','Fox','Red fox',0xd8762e], ['bear','Bear','Brown bear',0x6b4a32], ['tiger','Tiger','Striped tiger',0xe08a2e], ['ape','Gorilla','Silverback',0x2c2a2a], ['panda','Panda','Panda',0xf2f2f2], ['lion','Lion','Maned lion',0xc6904a], ['wolfhd','Wolf (realistic)','Realistic 3D wolf head',0x7d7f86,'wolf']];
// detailed AI-made 3D heads, loaded only the first time someone needs one
// Each species (and each soldier skin tone) has a detailed 3D head; h is its height including the neck.
// Animal heads are then drawn 28% larger (see opHead), so their h is smaller here.
const OP_HD = {}, OP_HD_LOADING = {}, HD_FAIL = {};
// a detailed head that is still on its way (the operator is held back until it arrives, so the old head never flashes up)
const hdPending = k => !!(k && OP_HD_IDS[k] && THREE.GLTFLoader && !OP_HD[k] && !HD_FAIL[k]);
let opHeadWait = false;
const OP_HD_IDS = { wolf:'hdWolf', wolfT:'hdWolfToon', ape:'hdApe', fox:'hdFox', bear:'hdBear', tiger:'hdTiger', panda:'hdPanda', lion:'hdLion',
  hLight:'hdHumanLight', hTan:'hdHumanTan', hBrown:'hdHumanBrown', hDark:'hdHumanDark' };
const OP_HD_FIT = { wolf:{ h:.31, y:.01, z:0, ry:0 }, wolfT:{ h:.3, y:.02, z:0, ry:0 }, ape:{ h:.28, y:.01, z:.01, ry:0 }, fox:{ h:.3, y:.02, z:0, ry:0 }, bear:{ h:.29, y:.02, z:0, ry:0 },
  tiger:{ h:.29, y:.02, z:0, ry:0 }, panda:{ h:.29, y:.02, z:0, ry:0 }, lion:{ h:.34, y:.02, z:-.01, ry:0 },
  hLight:{ h:.3, y:-.01, z:0, ry:0, hr:.12 }, hTan:{ h:.3, y:-.01, z:0, ry:0, hr:.12 }, hBrown:{ h:.3, y:-.01, z:0, ry:0, hr:.12 }, hDark:{ h:.3, y:-.01, z:0, ry:0, hr:.12 } };
// which head each species and skin tone uses by default
const OP_HD_SPECIES = { wolf:'wolfT', ape:'ape', fox:'fox', bear:'bear', tiger:'tiger', panda:'panda', lion:'lion' };
const OP_HD_SKIN = { light:'hLight', tan:'hTan', brown:'hBrown', dark:'hDark' };
function ensureHD(k){
  if (OP_HD[k] || OP_HD_LOADING[k] || !THREE.GLTFLoader || !OP_HD_IDS[k]) return !!OP_HD[k];
  OP_HD_LOADING[k] = true;
  assetBuf(OP_HD_IDS[k]).then(buf => {
    new THREE.GLTFLoader().parse(buf, '', g => {
      const sc = g.scene, F = OP_HD_FIT[k], box = new THREE.Box3().setFromObject(sc), sz = box.getSize(new V3()), c = box.getCenter(new V3());
      const s = F.h/sz.y; sc.scale.setScalar(s); sc.position.set(-c.x*s, -c.y*s, -c.z*s); sc.rotation.y = F.ry;
      sc.traverse(o => { if (o.isMesh){ o.castShadow = true; o.material.roughness = k === 'wolf' ? .85 : .7; o.material.metalness = 0; } });
      const wrap = new THREE.Group(); wrap.add(sc); OP_HD[k] = wrap; opVer++;
    }, e => { console.warn('HD head failed', e); HD_FAIL[k] = true; opVer++; });
  }).catch(e => { console.warn('HD head failed', e); HD_FAIL[k] = true; opVer++; });
  return false;
}
const OP_WEAR = [['helmet','Combat helmet','Military helmet'], ['beret','Beret','Special forces beret'], ['cap','Patrol cap','Soft cap'], ['dome','Space dome','Glass space helmet'], ['none','Nothing','Bare head']];
const opVariants = k => k === 'human' ? OP_SKIN : k === 'alien' ? OP_ALIEN : k === 'animal' ? OP_ANIMAL : [];
// animals go bare-headed: their detailed heads have ears and manes that headwear can't fit over
const opWearFor = k => OP_WEAR.filter(w => k === 'alien' ? ['dome','none'].includes(w[0]) : k === 'animal' ? w[0] === 'none' : w[0] !== 'dome');
// free military camo patterns
const OP_PATTERNS = (() => {
  const mk = (name, bg, cols, draw) => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, 128, 128); draw(g, cols);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return { map:t, name }; };
  let seed = 7; const rnd = () => (seed = (seed*16807) % 2147483647)/2147483647;
  const blobs = (g, cols, n, r) => { for (const col of cols){ g.fillStyle = col; for (let i=0;i<n;i++){ const x = rnd()*128, y = rnd()*128, rr = r*(.5 + rnd());
    for (const dx of [-128,0,128]) for (const dy of [-128,0,128]){ g.beginPath(); g.ellipse(x + dx, y + dy, rr, rr*(.4 + rnd()*.6), rnd()*3, 0, 7); g.fill(); } } } };
  return {
    woodland: mk('Woodland', '#5d6b3a', ['#3b4a26','#6e5235','#1d1f17'], (g, c) => blobs(g, c, 9, 16)),
    desertc: mk('Desert', '#c9b48a', ['#a8875a','#8a6a45','#e0d0aa'], (g, c) => blobs(g, c, 9, 15)),
    urbanc: mk('Urban', '#9a9ea3', ['#6c7076','#3e4146','#c8cbcf'], (g, c) => blobs(g, c, 9, 14)),
    tigerc: mk('Tiger stripe', '#6f7a45', ['#262a1a','#4a5230'], (g, c) => { for (const col of c){ g.fillStyle = col; for (let i=0;i<14;i++){ const y = rnd()*128; g.beginPath(); g.moveTo(0, y); for (let x=0;x<=128;x+=16) g.lineTo(x, y + Math.sin(x*.08 + i)*6); for (let x=128;x>=0;x-=16) g.lineTo(x, y + 4 + rnd()*5 + Math.sin(x*.08 + i)*6); g.fill(); } } }),
    digital: mk('Digital', '#7a8466', ['#4f5a3d','#a3a47c','#2f3527'], (g, c) => { for (let i=0;i<500;i++){ g.fillStyle = c[i % 3]; g.fillRect((rnd()*32|0)*4, (rnd()*32|0)*4, 4 + (rnd()*2|0)*4, 4); } })
  };
})();
const KIND_PRESET = { human:{ m:'woodland', s:'olive', a:'olive', w:'helmet', f:'tan' }, alien:{ m:'none', a:'arctic', s:'grey', c:'cyan', w:'dome', f:'green', b:'tanks' }, animal:{ m:'desertc', s:'tan', w:'none', f:'wolf' }, armor:{ m:'none' } };
function opHead(op, H, Hp, add, M, at){
  if (op.k === 'armor') return;
  const sph = (r, mat, sx = 1, sy = 1, sz = 1, ws = 18, hs = 14, th = Math.PI) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs, 0, Math.PI*2, 0, th), mat); m.scale.set(sx, sy, sz); return m; };
  const box = (w, h, d, mat) => new THREE.Mesh(Bx(w, h, d), mat), cyl = (r1, r2, h, mat, seg = 12) => new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mat);
  // animal heads are drawn larger, so they read as animals at a distance
  const K = op.k === 'animal' ? 1.28 : 1;
  const P = [], put = (m, x, y, z, rx, ry, rz) => { if (K !== 1) m.scale.multiplyScalar(K); P.push(at(m, H.x + x*K, H.y + y*K, H.z + z*K, rx, ry, rz)); };
  const black = M(0x0d0d10, { roughness:.3 }), white = M(0xf4f1ea, { roughness:.5 }), acc = opEntry('c', op.c)[2], suit = opEntry('s', op.s)[2];
  const pat = OP_PATTERNS[op.m] ? M(0xffffff, { map:OP_PATTERNS[op.m].map, roughness:.85 }) : M(new THREE.Color(suit).multiplyScalar(1.15).getHex(), { roughness:.75 });
  let crown = .1, hr = .11;
  const hdHuman = op.k === 'human' && OP_HD_SKIN[op.f];
  if (hdHuman && ensureHD(hdHuman)){
    const F = OP_HD_FIT[hdHuman]; put(OP_HD[hdHuman].clone(), 0, F.y, F.z); hr = F.hr;
  } else if (op.k === 'human'){
    if (hdPending(hdHuman)) opHeadWait = true;
    const skinC = (OP_SKIN.find(s => s[0] === op.f) || OP_SKIN[1])[2], skin = M(skinC, { roughness:.6 }), hair = M(0x2a1f18, { roughness:.9 });
    put(sph(.105, skin, .92, 1.08, 1), 0, 0, 0); put(sph(.08, skin, 1, .8, 1), 0, -.055, .02);
    put(box(.022, .04, .03, skin), 0, -.005, .1, -.2); put(cyl(.05, .056, .12, skin), 0, -.13, -.01);
    for (const sx of [-1, 1]){ put(sph(.016, white), sx*.037, .02, .086); put(sph(.009, black), sx*.037, .02, .1); put(box(.036, .009, .012, hair), sx*.037, .045, .096); put(sph(.025, skin, .5, 1, .8), sx*.1, 0, 0); }
    put(box(.04, .007, .01, M(0x7a3a32)), 0, -.062, .09);
    if (op.w !== 'helmet') put(sph(.11, hair, .95, 1.06, 1.03, 18, 10, Math.PI*.42), 0, .008, -.008);
  } else if (op.k === 'alien'){
    const skin = M((OP_ALIEN.find(s => s[0] === op.f) || OP_ALIEN[0])[2], { roughness:.45 }), eye = M(0x050508, { roughness:.05, metalness:.4 });
    put(sph(.125, skin, 1, 1.18, 1.05), 0, .045, -.01); hr = .13; put(sph(.068, skin, 1, 1.15, 1), 0, -.065, .04); put(cyl(.04, .05, .12, skin), 0, -.15, -.01);
    for (const sx of [-1, 1]){ put(sph(.038, eye, 1.5, .85, .6), sx*.05, .0, .092, 0, 0, sx*.4); put(sph(.004, black), sx*.01, -.055, .1);
      put(cyl(.005, .005, .12, skin, 5), sx*.045, .2, -.02, 0, 0, -sx*.3); put(sph(.016, M(acc, { emissive:acc, emissiveIntensity:1.2 })), sx*.064, .255, -.02); }
    put(box(.035, .005, .01, M(0x222222)), 0, -.085, .1); crown = .17;
  } else {
    let sp = (OP_ANIMAL.find(s => s[0] === op.f) || OP_ANIMAL[0]), fur = sp[3];
    const hdk = sp[4] ? null : OP_HD_SPECIES[sp[0]];
    const hdDrawn = !!(hdk && ensureHD(hdk));
    if (!hdDrawn && hdPending(hdk)) opHeadWait = true;
    if (hdDrawn){ const F = OP_HD_FIT[hdk]; put(OP_HD[hdk].clone(), 0, F.y, F.z); hdTail(sp); hr = .15; }
    else if (sp[4]){
      if (ensureHD(sp[4])){ const F = OP_HD_FIT[sp[4]]; put(OP_HD[sp[4]].clone(), 0, F.y, F.z); add('Head', (() => { const grp = new THREE.Group(); for (const p of P) grp.add(p); return grp; })());
        P.length = 0; op = Object.assign({}, op, { w:'none' }); sp = OP_ANIMAL.find(s => s[0] === sp[4]); hdTail(sp); return; }
      if (hdPending(sp[4])) opHeadWait = true;
      sp = OP_ANIMAL.find(s => s[0] === sp[4]);
    }
    if (!hdDrawn){
    let furM = M(fur, { roughness:.95 }); hr = .125;
    if (sp[0] === 'tiger'){ const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#e08a2e'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#1a1410';
      for (let i=0;i<9;i++){ const x = i*7 + 2; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 3, 0); g.lineTo(x + 1, 30); g.fill(); } furM = M(0xffffff, { map:new THREE.CanvasTexture(c), roughness:.95 }); }
    const light = M(sp[0] === 'fox' || sp[0] === 'tiger' ? 0xf6efe4 : sp[0] === 'lion' ? 0xe8d2a8 : sp[0] === 'wolf' ? 0xb9bcc2 : sp[0] === 'ape' ? 0x5b5450 : sp[0] === 'panda' ? 0xf6f6f6 : 0x9a7556, { roughness:.95 });
    const eyeM = M(sp[0] === 'tiger' || sp[0] === 'wolf' || sp[0] === 'lion' ? 0xffb52e : 0x111111, { roughness:.2, emissive:sp[0] === 'wolf' ? 0x553300 : 0 }), noseM = M(sp[0] === 'tiger' || sp[0] === 'lion' ? 0xd9828a : 0x141414, { roughness:.3 });
    put(cyl(.05, .056, .12, furM), 0, -.13, -.01);
    if (sp[0] === 'wolf' || sp[0] === 'fox'){
      put(sph(.108, furM, 1, .95, 1.02), 0, 0, 0); const sn = cyl(.032, .055, .13, sp[0] === 'fox' ? light : furM); put(sn, 0, -.035, .115, Math.PI/2);
      put(sph(.045, light, 1, .7, 1.1), 0, -.06, .1); put(sph(.02, noseM), 0, -.025, .18);
      const er = sp[0] === 'fox' ? [.05, .13] : [.04, .1];
      for (const sx of [-1, 1]){ put(new THREE.Mesh(new THREE.ConeGeometry(er[0], er[1], 4), furM), sx*.06, .12, -.02, 0, Math.PI/4, -sx*.25); put(sph(.014, eyeM), sx*.042, .03, .092); }
      
    } else if (sp[0] === 'bear' || sp[0] === 'panda'){
      put(sph(.12, furM, 1.05, .98, 1), 0, 0, 0); put(sph(.055, light, 1, .8, 1), 0, -.04, .1); put(sph(.022, noseM), 0, -.02, .155);
      for (const sx of [-1, 1]){ put(sph(.04, sp[0] === 'panda' ? black : furM, 1, 1, .6), sx*.085, .095, -.02);
        if (sp[0] === 'panda') put(sph(.03, black, 1, 1.35, .5), sx*.045, .025, .092, 0, 0, sx*.4); put(sph(.012, sp[0] === 'panda' ? white : eyeM), sx*.045, .03, .1); }
      
    } else if (sp[0] === 'tiger' || sp[0] === 'lion'){
      put(sph(.118, furM, 1.06, .95, 1), 0, 0, 0); put(sph(.055, light, 1.2, .8, .9), 0, -.045, .095); put(sph(.016, noseM), 0, -.02, .14);
      for (const sx of [-1, 1]){ put(sph(.035, furM, 1, 1, .5), sx*.08, .1, -.01); put(sph(.014, eyeM), sx*.042, .03, .097); put(box(.06, .003, .003, white), sx*.07, -.045, .12, 0, 0, sx*.15); }
      
    } else {
      put(sph(.12, furM, 1, 1.05, .95), 0, .01, -.01); put(sph(.085, light, 1, 1.1, .6), 0, -.015, .07); put(box(.17, .03, .05, furM), 0, .045, .092);
      for (const sx of [-1, 1]){ put(sph(.012, eyeM), sx*.035, .02, .118); put(sph(.006, black), sx*.012, -.04, .12); put(sph(.026, light, .5, 1, .8), sx*.112, 0, 0); }
    }
    hdTail(sp);
    }
  }
  function hdTail(sp){
    // a bushy tail that hangs from the hips and sways (see opTailSway); built around its base so it can swing
    const k = sp[0], furM = M(furColor(sp), { roughness:.95 }), white = M(k === 'lion' ? 0x4a2c16 : 0xf4f1ea, { roughness:.9 });
    const len = { fox:.5, wolf:.46, tiger:.62, lion:.6, bear:.08, panda:.08 }[k] || 0;
    if (!len) return;
    const tg = new THREE.Group(), bushy = k === 'fox' || k === 'wolf', segs = len < .1 ? 1 : 7;
    for (let i=0;i<segs;i++){
      const t = (i + .5)/segs, r = len < .1 ? .06 : bushy ? .035 + Math.sin(t*Math.PI)*.05 + t*.02 : .022;
      const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), k === 'fox' && t > .8 ? white : furM);
      ball.scale.set(1, 1.6, 1); ball.position.set(0, -t*len, 0); ball.castShadow = true; tg.add(ball);
    }
    if (k === 'lion' || k === 'tiger'){ const tip = new THREE.Mesh(new THREE.SphereGeometry(.045, 10, 8), k === 'lion' ? white : M(0x1a1410)); tip.scale.set(1, 1.4, 1); tip.position.set(0, -len, 0); tg.add(tip); }
    tg.userData.tail = true;
    const grp = new THREE.Group(); grp.add(at(tg, Hp.x, Hp.y - .04, Hp.z - .13, .95)); add('Hips', grp);
  }
  // headwear
  if (op.w === 'helmet'){ const y = hr*.45; put(sph(hr + .028, pat, 1, .95, 1.08, 20, 10, Math.PI*.5), 0, y, -.012); put(cyl(hr + .032, hr + .036, .016, pat, 20), 0, y, -.012);
    for (const sx of [-1, 1]) put(box(.008, .11, .01, black), sx*(hr - .01), y - .06, .02); }
  else if (op.w === 'beret'){ const y = hr*.82; put(sph(hr + .03, M(acc, { roughness:.9 }), 1.05, .35, 1.05, 18, 8), .015, y, -.01, .1, 0, .22); put(box(.025, .03, .006, M(0xe8b94a, { metalness:.6, roughness:.3 })), -.06, y - .005, hr + .01, 0, 0, .22); }
  else if (op.w === 'cap'){ const y = hr*.62; put(cyl(hr + .006, hr + .01, .075, pat, 18), 0, y, -.005); put(box(hr + .01, .012, .08, pat), 0, y - .03, hr + .01); }
  else if (op.w === 'dome'){ put(sph(.21, new THREE.MeshPhysicalMaterial({ color:0xddeeff, roughness:.05, metalness:.1, transparent:true, opacity:.2, depthWrite:false, clearcoat:1 }), 1, 1.05, 1, 24, 16), 0, .04, 0);
    put(cyl(.15, .17, .05, M(0xc8ced8, { metalness:.7, roughness:.3 }), 20), 0, -.15, 0); put(box(.03, .03, .02, M(acc, { emissive:acc, emissiveIntensity:1 })), .08, -.15, .14); }
  if (P.length){ const grp = new THREE.Group(); for (const p of P) grp.add(p); add('Head', grp); }
}

const OP_DEFAULT = { k:'armor', f:'', w:'helmet', a:'sand', s:'olive', c:'red', v:'smoke', m:'none', h:'none', b:'none' };
const opList = { a:OP_ARMOR, s:OP_SUIT, c:OP_ACCENT, v:OP_VISOR, h:OP_HEAD, b:OP_BACK };
function sanitizeOp(o){
  const r = Object.assign({}, OP_DEFAULT);
  if (!o || typeof o !== 'object') return r;
  for (const k in opList) if (opList[k].some(x => x[0] === o[k])) r[k] = o[k];
  if (o.m === 'none' || OP_PATTERNS[o.m] || CAMOS.some(c => c.k === o.m)) r.m = o.m;
  if (OP_KIND.some(x => x[0] === o.k)) r.k = o.k;
  const vs = opVariants(r.k); r.f = vs.some(x => x[0] === o.f) ? o.f : (vs[0] ? vs[0][0] : '');
  const ws = opWearFor(r.k); r.w = ws.some(x => x[0] === o.w) ? o.w : ws[0][0];
  return r;
}
let opCfg = sanitizeOp((() => { try { return JSON.parse(store.get('dy-op') || 'null'); } catch(e){ return null; } })());
let opVer = 0;
const opEntry = (k, v) => opList[k].find(x => x[0] === v) || opList[k][0];
function opCamoOk(k){
  if (OP_PATTERNS[k]) return true;
  const C = CAMOS.find(c => c.k === k); if (!C) return k === 'none';
  if (C.item) return typeof ownedItems !== 'undefined' && ownedItems.has(C.item);
  if (C.perk) return typeof holder !== 'undefined' && !!(holder.perks && holder.perks[C.perk]);
  return WEAPONS.some(W => (W.hs || 0) >= C.need);
}
const opArmorOk = k => { const e = opEntry('a', k); return !e[3] || (typeof holder !== 'undefined' && !!(holder.perks && holder.perks[e[3]])); };
// what you actually wear: locked picks fall back to the defaults
function opMine(){ const o = Object.assign({}, opCfg); if (!opArmorOk(o.a)) o.a = OP_DEFAULT.a; if (o.m !== 'none' && !opCamoOk(o.m)) o.m = 'none'; return o; }
function saveOp(){ store.set('dy-op', JSON.stringify(opCfg)); opVer++; bgCache.t = spCache.t = -1e9; tintSleeves(); if (typeof applyClass === 'function' && state !== 'play') applyClass(); }
function tintSleeves(){ try { viewHands(); } catch(e){} try { const c = new THREE.Color(opEntry('s', opMine().s)[2]).lerp(new THREE.Color(0xffffff), .35); mSleeve.color.copy(c); mCuff.color.copy(new THREE.Color(opEntry('s', opMine().s)[2]).multiplyScalar(.8)); } catch(e){} }

// The soldier's texture has tan armor plates, olive cloth and red stripes; a shader recolors each by hue.
const OP_MATS = new Map();
// body fur colour per species, matched to the detailed heads
const FUR_COL = { wolf:0x5d6068, fox:0xd8641e, bear:0x6e4226, tiger:0xe08a2e, lion:0xc98a3e, ape:0x2e2b2a, panda:0x1c1c1e };
const furColor = sp => FUR_COL[sp[0]] !== undefined ? FUR_COL[sp[0]] : sp[3];
// first-person hands: furry paws with claws for animal operators, gloves for everyone else
function viewHands(){
  const o = opMine(), animal = o.k === 'animal';
  if (animal){ const sp = animalSpecies(); mGlove.map = furTex; mGlove.color.setHex(furColor(sp)).multiplyScalar(sp[0] === 'panda' ? 1.4 : .95); mGlove.roughness = 1; mPad.color.setHex(sp[0] === 'ape' ? 0x2a2624 : 0x3a2c26); }
  else { mGlove.map = gloveTex; mGlove.color.setHex(0xffffff); mGlove.roughness = .9; mPad.color.setHex(0x2e2a25); }
  mGlove.needsUpdate = true;
  const tiny = animal && animalSpecies()[0] === 'ape';
  for (const c of vmClaws){ c.visible = animal; c.scale.setScalar(tiny ? .55 : 1); }
}
// fine strands, tiled over the arms of animal operators
const furTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#808080'; g.fillRect(0, 0, 128, 128);
  for (let i=0;i<2200;i++){ const x = Math.random()*128, y = Math.random()*128, l = 3 + Math.random()*7, v = 60 + Math.random()*170 | 0;
    g.strokeStyle = `rgba(${v},${v},${v},.55)`; g.lineWidth = .8 + Math.random(); g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - .5)*2, y + l); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; })();
function opBodyMat(op, base, fresh){
  let sp = op.k === 'animal' ? (OP_ANIMAL.find(s => s[0] === op.f) || OP_ANIMAL[0]) : null; if (sp && sp[4]) sp = OP_ANIMAL.find(s => s[0] === sp[4]);
  const key = [op.a, op.s, op.c, op.m, sp ? sp[0] : ''].join('|');
  if (!fresh && OP_MATS.has(key)) return OP_MATS.get(key);
  const m = base.clone(), C = OP_PATTERNS[op.m] || camoMats[op.m];
  const camoTex = op.m !== 'none' && C ? (C.map || null) : null;
  const u = {
    uArmor:{ value:new THREE.Color(op.m !== 'none' && C && !C.map && C.color ? C.color.getHex() : opEntry('a', op.a)[2]) },
    uSuit:{ value:new THREE.Color(opEntry('s', op.s)[2]) }, uAccent:{ value:new THREE.Color(opEntry('c', op.c)[2]) },
    uCamo:{ value:camoTex || base.map }, uCamoOn:{ value:camoTex ? 1 : 0 },
    uGlow:{ value:C && C.emissiveMap && op.m !== 'none' ? .7 : 0 },
    // animals: furred arms and hands instead of armored sleeves
    uFurOn:{ value:sp ? 1 : 0 }, uFur:{ value:new THREE.Color(sp ? furColor(sp) : 0) }, uFurTex:{ value:furTex }, uStripe:{ value:sp && sp[0] === 'tiger' ? 1 : 0 },
    uRage:{ value:0 }
  };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'varying vec3 vRestP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vRestP = position;');
    sh.fragmentShader = 'uniform vec3 uArmor; uniform vec3 uSuit; uniform vec3 uAccent; uniform sampler2D uCamo; uniform float uCamoOn; uniform float uGlow;\n' +
      'uniform float uFurOn; uniform vec3 uFur; uniform sampler2D uFurTex; uniform float uStripe; uniform float uRage; varying vec3 vRestP;\n' +
      sh.fragmentShader.replace('#include <map_fragment>', `
      vec3 opGlow = vec3(0.0); float furAmt = 0.0;
      #ifdef USE_MAP
        vec4 texelColor = texture2D( map, vUv );
        vec3 c = texelColor.rgb;
        float mx = max(c.r, max(c.g, c.b));
        float lum = dot(c, vec3(.3, .59, .11));
        float wA = smoothstep(.05, .15, c.r - c.b) * smoothstep(.32, .52, mx) * (1. - smoothstep(.24, .38, c.r - c.g));
        float wR = smoothstep(.22, .36, c.r - c.g) * smoothstep(.25, .4, mx);
        float wC = smoothstep(-.015, .02, c.g - c.r) * smoothstep(.015, .06, c.g - c.b) * smoothstep(.1, .2, mx);
        vec3 cam = texture2D(uCamo, vUv * 3.0).rgb;
        vec3 armor = mix(uArmor, cam, uCamoOn) * clamp(lum / .74, 0., 1.25);
        c = mix(c, armor, wA);
        c = mix(c, uSuit * clamp(lum / .3, 0., 1.6), wC * (1. - wA));
        c = mix(c, uAccent * clamp(lum / .3, 0., 1.5), wR);
        opGlow = cam * uGlow * wA * uCamoOn + uAccent * wR * uGlow * .6;
        // the model is in its arms-out rest pose here (centimetres): arms are wide of the body, above the hips
        float furArms = smoothstep(19.0, 26.0, abs(vRestP.x)) * smoothstep(100.0, 112.0, vRestP.z);
        float furLegs = smoothstep(60.0, 66.0, vRestP.z) * (1.0 - smoothstep(86.0, 92.0, vRestP.z)) * (1.0 - smoothstep(18.0, 22.0, abs(vRestP.x)));
        furAmt = uFurOn * max(furArms, furLegs);
        vec3 strand = texture2D(uFurTex, vUv * 9.0).rgb;
        vec3 fur = uFur * (0.5 + 0.8 * strand.r);
        fur *= mix(1.0, 0.18, uStripe * smoothstep(0.6, 0.85, sin(abs(vRestP.x) * 0.42 + strand.r * 2.5) * 0.5 + 0.5));
        c = mix(c, fur, furAmt);
        diffuseColor *= vec4(c, texelColor.a);
      #endif`).replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, 1.0, furAmt);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n  metalnessFactor = mix(metalnessFactor, 0.0, furAmt);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += opGlow;\n' +
        // soft sheen at the edges of fur, and a red glow in berserker mode
        '  float furRim = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 3.0);\n' +
        '  totalEmissiveRadiance += uFur * furAmt * furRim * 0.45 + vec3(1.0, 0.12, 0.05) * uRage * (0.25 + furRim * 1.2);');
  };
  m.customProgramCacheKey = () => 'dy-op-body';
  m.userData.opU = u;
  if (!fresh) OP_MATS.set(key, m);
  return m;
}
function opVisorMat(op){
  const e = opEntry('v', op.v), key = 'v|' + e[0];
  if (OP_MATS.has(key)) return OP_MATS.get(key);
  const m = new THREE.MeshStandardMaterial({ color:e[2], roughness:e[0] === 'mirror' ? .15 : .25, metalness:e[0] === 'mirror' ? .9 : .4,
    emissive:e[4] ? e[2] : 0x000000, emissiveIntensity:e[4] ? 1.4 : 0 });
  OP_MATS.set(key, m); return m;
}

// Gear built from simple shapes, positioned around the rest pose and then glued to a bone each frame
function opGear(op, H, S, add, Hp, R){
  if (op.k !== 'armor') H = H.clone().add(new V3(0, .055, .012));
  const acc = opEntry('c', op.c)[2], suit = opEntry('s', op.s)[2];
  const M = (c, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color:c, roughness:.7, metalness:.1 }, o));
  const dark = M(0x1d1f22, { roughness:.5, metalness:.5 }), accM = M(acc), gold = M(0xe8b94a, { roughness:.3, metalness:.35, emissive:0x5a3e08, emissiveIntensity:.6 });
  const box = (w, h, d, mat) => new THREE.Mesh(Bx(w, h, d), mat), cyl = (r1, r2, h, mat, seg = 10, open = false) => new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg, 1, open), mat);
  const g = (bone, parts) => { const grp = new THREE.Group(); for (const p of parts) grp.add(p); add(bone, grp); return grp; };
  const at = (m, x, y, z, rx = 0, ry = 0, rz = 0) => { m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; return m; };
  if (op.h === 'nvg') g('Head', [
    at(box(.06, .05, .04, dark), H.x, H.y + .1, H.z + .12),
    at(cyl(.024, .024, .085, dark), H.x - .036, H.y + .15, H.z + .12, -.35), at(cyl(.024, .024, .085, dark), H.x + .036, H.y + .15, H.z + .12, -.35),
    at(cyl(.02, .02, .005, M(0x5cff8a, { emissive:0x5cff8a, emissiveIntensity:.8 })), H.x - .036, H.y + .195, H.z + .105, -.35),
    at(cyl(.02, .02, .005, M(0x5cff8a, { emissive:0x5cff8a, emissiveIntensity:.8 })), H.x + .036, H.y + .195, H.z + .105, -.35)]);
  if (op.h === 'antenna') g('Head', [at(box(.045, .07, .05, dark), H.x - .13, H.y + .02, H.z - .03), at(cyl(.004, .004, .36, dark, 5), H.x - .135, H.y + .22, H.z - .05, -.12, 0, .08), at(box(.01, .01, .01, accM), H.x - .14, H.y + .4, H.z - .07)]);
  if (op.h === 'band') g('Head', [at(cyl(.152, .152, .045, accM, 18, true), H.x, H.y + .05, H.z), at(box(.03, .12, .008, accM), H.x - .03, H.y - .02, H.z - .16, .3, 0, .15), at(box(.03, .14, .008, accM), H.x + .03, H.y - .03, H.z - .16, .25, 0, -.2)]);
  if (op.h === 'kabuto') g('Head', [at(box(.022, .24, .012, gold), H.x - .07, H.y + .2, H.z + .13, 0, 0, .45), at(box(.022, .24, .012, gold), H.x + .07, H.y + .2, H.z + .13, 0, 0, -.45), at(cyl(.035, .035, .012, gold, 16), H.x, H.y + .1, H.z + .15, Math.PI/2)]);
  if (op.b === 'pack') g('Spine2', [at(box(.3, .36, .14, M(suit)), S.x, S.y - .06, S.z - .21), at(cyl(.06, .06, .32, M(new THREE.Color(suit).multiplyScalar(.7).getHex()), 10), S.x, S.y + .16, S.z - .22, 0, 0, Math.PI/2), at(box(.2, .02, .02, accM), S.x, S.y - .02, S.z - .285)]);
  if (op.b === 'jetpack'){
    const steel = M(0x5c6168, { metalness:.75, roughness:.35 }), flameM = new THREE.MeshBasicMaterial({ color:0xffa040, transparent:true, opacity:.85, blending:THREE.AdditiveBlending, depthWrite:false });
    const parts = [at(box(.24, .3, .1, dark), S.x, S.y - .05, S.z - .2), at(box(.25, .03, .105, accM), S.x, S.y + .06, S.z - .2)];
    for (const sx of [-1, 1]){
      parts.push(at(cyl(.052, .052, .3, steel, 14), S.x + sx*.1, S.y - .1, S.z - .27), at(cyl(.052, .034, .07, dark, 14), S.x + sx*.1, S.y - .285, S.z - .27),
        at(cyl(.054, .054, .02, accM, 14), S.x + sx*.1, S.y + .03, S.z - .27));
      const fl = at(new THREE.Mesh(new THREE.ConeGeometry(.04, .34, 10), flameM), S.x + sx*.1, S.y - .49, S.z - .27, Math.PI); fl.castShadow = false; fl.visible = false; fl.userData.jetFlame = true; parts.push(fl);
    }
    g('Spine2', parts);
  }
  if (op.b === 'katana') g('Spine2', [at(cyl(.022, .022, .78, M(0x17181c), 8), S.x, S.y - .02, S.z - .19, 0, 0, .75), at(cyl(.018, .018, .22, accM, 8), S.x + .33, S.y + .3, S.z - .19, 0, 0, .75), at(cyl(.045, .045, .012, gold, 12), S.x + .26, S.y + .23, S.z - .19, 0, 0, .75 + Math.PI/2)]);
  opHead(op, H, Hp, add, M, at);
  if (op.k === 'animal' && R) opAnimalBody(op, H, R, add, M, at);
  if (op.b === 'tanks') g('Spine2', [at(cyl(.055, .055, .4, M(0xc8ced8, { metalness:.7, roughness:.3 }), 14), S.x - .07, S.y - .05, S.z - .2), at(cyl(.055, .055, .4, M(0xc8ced8, { metalness:.7, roughness:.3 }), 14), S.x + .07, S.y - .05, S.z - .2),
    at(cyl(.03, .03, .05, accM, 10), S.x - .07, S.y + .17, S.z - .2), at(cyl(.03, .03, .05, accM, 10), S.x + .07, S.y + .17, S.z - .2), at(cyl(.012, .012, .2, dark, 6), S.x, S.y + .2, S.z - .13, .9)]);
  if (op.b === 'radio') g('Spine2', [at(box(.2, .3, .1, M(0x3a3d33)), S.x + .04, S.y - .06, S.z - .19), at(cyl(.005, .005, .6, dark, 5), S.x - .04, S.y + .38, S.z - .2, 0, 0, .1), at(box(.06, .03, .012, accM), S.x + .04, S.y + .02, S.z - .245)]);
}

// Animal operators: a fur ruff (or a lion's mane), claws on both hands and fur cuffs at the wrists
function opAnimalBody(op, H, R, add, M, at){
  let sp = OP_ANIMAL.find(s => s[0] === op.f) || OP_ANIMAL[0]; if (sp[4]) sp = OP_ANIMAL.find(s => s[0] === sp[4]);
  const k = sp[0], fur = M(k === 'lion' ? 0x5a3010 : furColor(sp), { roughness:1 });
  const claw = M(0xe9e1cf, { roughness:.35 }), cone = (r, h) => new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), fur);
  const Y = new V3(0, 1, 0), q = new THREE.Quaternion(), aim = (m, dir) => { m.quaternion.copy(q.setFromUnitVectors(Y, dir)); return m; };
  if (k === 'lion' && OP_HD.lion){
    // the detailed lion head has its own mane: just a ruff below it
    const P = [];
    for (let i=0;i<12;i++){ const a = i/12*Math.PI*2 + .2, d = new V3(Math.cos(a)*.9, -.6 + Math.sin(a)*.3, Math.sin(a)*.8).normalize(), m = aim(cone(.07, .22), d);
      m.position.copy(R.neck).addScaledVector(d, .1); m.castShadow = true; P.push(m); }
    const g = new THREE.Group(); P.forEach(m => g.add(m)); add('Head', g);
  } else if (k === 'lion'){
    // a full mane around the face, swept back
    // two rings of tufts framing the face, the back one larger, plus a fringe on top
    const P = [], c = H.clone().add(new V3(0, 0, -.03));
    for (const [ring, r, h, back, rad] of [[0, .085, .17, .2, .15], [1, .1, .22, .7, .13]]) for (let i=0;i<20;i++){
      const a = (i + ring*.5)/20*Math.PI*2, d = new V3(Math.cos(a)*1.05, Math.sin(a)*1.15, -back).normalize(), m = aim(cone(r, h), d);
      m.position.copy(c).add(new V3(Math.cos(a)*rad*1.05, Math.sin(a)*rad*1.15, -back*.06)); m.castShadow = true; P.push(m); }
    for (let i=0;i<12;i++){ const a = i/12*Math.PI*2 + .2, d = new V3(Math.cos(a)*.9, -.6 + Math.sin(a)*.3, Math.sin(a)*.8).normalize(), m = aim(cone(.07, .22), d);
      m.position.copy(R.neck).addScaledVector(d, .1); m.castShadow = true; P.push(m); }
    const g = new THREE.Group(); P.forEach(m => g.add(m)); add('Head', g);
  } else if (k !== 'ape'){
    // a ruff of fur around the neck, over the collar
    const P = [], n = k === 'bear' || k === 'panda' ? 12 : 16, len = k === 'fox' ? .12 : .14;
    for (let i=0;i<n;i++){ const a = i/n*Math.PI*2, d = new V3(Math.cos(a), -.35, Math.sin(a)*.85).normalize(), m = aim(cone(.045, len), d);
      m.position.copy(R.neck).add(new V3(0, -.03, 0)).addScaledVector(d, .1); m.castShadow = true; P.push(m); }
    const g = new THREE.Group(); P.forEach(m => g.add(m)); add('Neck', g);
  }
  for (const [hand, fore, bone] of [[R.lh, R.lf, 'LeftHand'], [R.rh, R.rf, 'RightHand']]){
    const dir = hand.clone().sub(fore).normalize(), side = new V3().crossVectors(dir, Y).normalize(), P = [];
    for (const o of [-.028, 0, .028]){ const m = aim(new THREE.Mesh(new THREE.ConeGeometry(.009, k === 'ape' ? .035 : .065, 5), claw), dir);
      m.position.copy(hand).addScaledVector(dir, .1).addScaledVector(side, o).add(new V3(0, -.012, 0)); m.castShadow = true; m.userData.claw = true; P.push(m); }
    const cuff = aim(new THREE.Mesh(new THREE.CylinderGeometry(.06, .052, .1, 10), fur), dir); cuff.position.copy(hand).addScaledVector(dir, -.07); cuff.castShadow = true; P.push(cuff);
    const g = new THREE.Group(); P.forEach(m => g.add(m)); add(bone, g);
  }
}
// Joins a glued group's simple parts into one mesh per material, so a detailed operator stays cheap to draw.
function mergeParts(grp){
  const byMat = new Map(), keep = [];
  for (const c of grp.children){
    if (!c.isMesh || c.children.length || c.userData.tail || c.userData.claw || c.userData.jetFlame){ keep.push(c); continue; }
    const m = c.material, key = [m.color && m.color.getHex(), m.roughness, m.metalness, m.emissive && m.emissive.getHex(), m.emissiveIntensity, m.map && m.map.uuid, m.transparent].join('|');
    if (!byMat.has(key)) byMat.set(key, { m, list:[] }); byMat.get(key).list.push(c);
  }
  const out = [...keep];
  for (const { m, list } of byMat.values()){
    if (list.length < 2){ out.push(...list); continue; }
    const pos = [], nor = [], uv = [];
    for (const c of list){
      c.updateMatrix(); const g = (c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone()).applyMatrix4(c.matrix);
      pos.push(g.attributes.position.array); nor.push(g.attributes.normal.array); uv.push(g.attributes.uv ? g.attributes.uv.array : new Float32Array(g.attributes.position.count*2));
    }
    const cat = arrs => { const n = arrs.reduce((a, b) => a + b.length, 0), o = new Float32Array(n); let i = 0; for (const a of arrs){ o.set(a, i); i += a.length; } return o; };
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(cat(pos), 3)); geo.setAttribute('normal', new THREE.BufferAttribute(cat(nor), 3)); geo.setAttribute('uv', new THREE.BufferAttribute(cat(uv), 2));
    const mesh = new THREE.Mesh(geo, m); mesh.castShadow = true; out.push(mesh);
  }
  grp.children.length = 0; for (const c of out){ c.parent = grp; grp.children.push(c); }
}
// tails swing side to side, more when running
function opTailSway(o, t){
  if (!o.tails.length) return;
  const run = Math.min(1, (o.spd || 0)/6), a = Math.sin(t*(2.2 + run*5))*(.22 + run*.25), lift = run*.5;
  for (const tg of o.tails){ tg.quaternion.multiply(_tq.setFromEuler(_te.set(lift, 0, a))); }
}
const _tq = new THREE.Quaternion(), _te = new THREE.Euler();
const OP_BONES = ['Hips','Spine','Spine2','Neck','Head','HeadTop_End','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot'];
function buildOperator(op, unique, mine, waitHD){
  if (!SOLDIER) return null;
  op = sanitizeOp(op);
  const root = new THREE.Group(), model = THREE.SkeletonUtils.clone(SOLDIER.scene);
  model.rotation.y = Math.PI; root.add(model);
  // species build: bears and gorillas are bigger with heavier arms, foxes are lighter
  const spc = op.k === 'animal' ? ((OP_ANIMAL.find(s => s[0] === op.f) || [])[4] || op.f) : '';
  const BUILD = { bear:[1.1, 1.12], ape:[1.07, 1.18], panda:[1.06, 1.1], lion:[1.04, 1.06], tiger:[1.03, 1.05], fox:[.96, 1], wolf:[1, 1.04] }[spc] || [1, 1];
  model.scale.multiplyScalar(BUILD[0]);
  let base = null;
  SOLDIER.scene.traverse(o => { if (o.isMesh && !/visor/i.test(o.name)) base = o.material; });
  const mats = [], own = m => { if (!unique) return m; const c = m.clone(); c.onBeforeCompile = m.onBeforeCompile; c.customProgramCacheKey = m.customProgramCacheKey; mats.push(c); return c; };
  let bodyU = null;
  model.traverse(o => { if (o.isMesh){ o.material = own(/visor/i.test(o.name) ? opVisorMat(op) : opBodyMat(op, base, mine)); if (mine && !/visor/i.test(o.name)) bodyU = o.material.userData.opU; o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; if (op.k !== 'armor' && /visor/i.test(o.name)) o.visible = false; } });
  const B = {}; for (const k of OP_BONES) B[k] = findBone(model, k);
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), _m = new THREE.Matrix4();
  const local = b => { _m.multiplyMatrices(inv, b.matrixWorld); const p = new V3(), q = new THREE.Quaternion(), s = new V3(); _m.decompose(p, q, s); return { p, q }; };
  const head = local(B.Head).p.clone().lerp(local(B.HeadTop_End || B.Head).p, .45), sp = local(B.Spine2).p, hp = local(B.Hips).p;
  const R = { neck:local(B.Neck).p, lh:local(B.LeftHand).p, lf:local(B.LeftForeArm).p, rh:local(B.RightHand).p, rf:local(B.RightForeArm).p };
  const glued = [], tails = [];
  opHeadWait = false;
  opGear(op, head, sp, (bone, grp) => { mergeParts(grp); const r = local(B[bone]); root.add(grp); grp.traverse(c => { if (c.userData.tail) tails.push(c); });
    glued.push({ b:B[bone], grp, p0:r.p.clone(), q0i:r.q.clone().invert(), kids:grp.children.map(c => ({ c, p:c.position.clone().sub(r.p), q:c.quaternion.clone() })) }); }, hp, R);
  if (waitHD && opHeadWait) root.userData.waitHD = true;
  const mixer = new THREE.AnimationMixer(model);
  const act = n => { const a = mixer.clipAction(SOLDIER.clips[n]); a.play(); a.setEffectiveWeight(n === 'Idle' ? 1 : 0); return a; };
  const armBones = BUILD[1] !== 1 ? [B.LeftArm, B.RightArm].filter(Boolean) : [];
  for (const b of armBones) b.scale.setScalar(BUILD[1]);
  const o = { root, model, B, mixer, op, mats, tails, bodyU, acts:{ idle:act('Idle'), walk:act('Walk'), run:act('Run') }, w:{ idle:1, walk:0, run:0 }, cf:0, aimK:0, recoil:0, spd:0, gun:null, gunId:'' };
  const _q = new THREE.Quaternion(), _rq = new THREE.Quaternion();
  const hideHead = op.k !== 'armor';
  o.sync = () => {
    if (hideHead){ B.Head.scale.setScalar(.02); }
    for (const b of armBones) b.scale.setScalar(BUILD[1]);
    root.updateMatrixWorld(true);
    inv.copy(root.matrixWorld).invert();
    for (const G of glued){
      _m.multiplyMatrices(inv, G.b.matrixWorld); const p = new V3(), s = new V3(); _m.decompose(p, _q, s);
      _rq.copy(_q).multiply(G.q0i);
      for (const k of G.kids){ k.c.position.copy(k.p).applyQuaternion(_rq).add(p); k.c.quaternion.copy(_rq).multiply(k.q); }
    }
    opTailSway(o, performance.now()/1000);
  };
  o.sync();
  return o;
}

// A third-person gun for each weapon, with where the hands go
const TPG = {};
function tpGun(id){
  const g = new THREE.Group(), M = RIFLE_MAT, wood = MS(0x6b4a2c, .7);
  const bx = (w, h, d, x, y, z, mat = M, rx = 0) => { const m = new THREE.Mesh(Bx(w, h, d), mat); m.position.set(x, y, z); m.rotation.x = rx; m.castShadow = true; m.userData.body = mat === M; g.add(m); return m; };
  const cy = (r, len, x, y, z, mat = M) => { const m = new THREE.Mesh(Cy(r, r, len, 8), mat); m.position.set(x, y, z); m.rotation.x = HP; m.castShadow = true; g.add(m); return m; };
  let muzzle = .47, grip = new V3(0, -.075, -.05), fore = new V3(0, -.045, .22), off = new V3();
  if (id === 'smg'){ bx(.05, .08, .3, 0, 0, .02); cy(.012, .1, 0, .005, .22); bx(.035, .16, .045, 0, -.11, .08, M, -.1); bx(.04, .06, .14, 0, -.01, -.18); bx(.035, .08, .04, 0, -.07, -.06, M, .3); muzzle = .28; fore = new V3(0, -.045, .13); }
  else if (id === 'shotgun'){ bx(.055, .075, .32, 0, 0, 0); cy(.016, .42, 0, .01, .36); cy(.013, .34, 0, -.03, .3); bx(.05, .05, .14, 0, -.03, .3, wood); bx(.045, .09, .2, 0, -.02, -.25, wood); bx(.035, .08, .04, 0, -.07, -.08, M, .3); muzzle = .58; fore = new V3(0, -.06, .3); }
  else if (id === 'sniper'){ bx(.055, .08, .48, 0, 0, .04); cy(.012, .45, 0, .005, .5); cy(.028, .26, 0, .085, .04); bx(.05, .1, .22, 0, -.02, -.3); bx(.035, .08, .04, 0, -.07, -.08, M, .3); bx(.04, .1, .06, 0, -.09, .1, M, -.2); muzzle = .73; fore = new V3(0, -.05, .28); }
  else if (id === 'pistol'){ bx(.035, .045, .19, 0, 0, .02); bx(.032, .1, .045, 0, -.065, -.04, M, .25); muzzle = .12; grip = new V3(0, -.08, -.04); fore = new V3(.01, -.1, -.02); off = new V3(.02, .1, .2); }
  else if (id === 'launcher'){ const t = MS(0x4a5236, .8); cy(.065, 1.05, 0, 0, .05, t); bx(.08, .1, .12, 0, .07, .05, t); bx(.035, .1, .045, 0, -.1, -.02, M, .2); bx(.035, .1, .045, 0, -.1, .25, M, .2); muzzle = .6; grip = new V3(0, -.12, -.02); fore = new V3(0, -.12, .25); off = new V3(-.08, .2, -.02); }
  else { bx(.055, .08, .42, 0, 0, .05); cy(.01, .2, 0, .005, .35); bx(.04, .12, .06, 0, -.09, .1, M, -.2); bx(.045, .08, .16, 0, -.01, -.22); bx(.035, .08, .04, 0, -.07, -.05, M, .3); bx(.03, .035, .06, 0, .06, 0); }
  const mz = new THREE.Object3D(); mz.position.set(0, .005, muzzle); g.add(mz);
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ color:0xffc070, transparent:true, opacity:.95, blending:THREE.AdditiveBlending, depthWrite:false }));
  flash.scale.setScalar(.32); flash.visible = false; mz.add(flash);
  g.userData = { grip, fore, off, mz, flash };
  return g;
}
function opSetGun(o, id){
  if (o.gunId === id) return;
  if (o.gun) o.root.remove(o.gun);
  o.gunId = id; o.gun = id ? tpGun(id) : null;
  if (o.gun) o.root.add(o.gun);
}
function opGunCamo(o, W){
  if (!o.gun) return;
  const C = W && W.camo && camoMats[W.camo], D = C && CAMOS.find(c => c.k === W.camo), ok = !!D && (D.need ? (W.hs || 0) >= D.need : opCamoOk(W.camo));
  o.gun.traverse(m => { if (m.isMesh && m.userData.body) m.material = ok ? C : RIFLE_MAT; });
}

// world-axis bone rotation, used for crouching and looking up or down
function boneTurn(bone, axis, ang){
  if (!bone || !ang) return;
  _q1.setFromAxisAngle(axis, ang); bone.getWorldQuaternion(_wq); bone.parent.getWorldQuaternion(_pq);
  bone.quaternion.copy(_pq.invert().multiply(_q1.multiply(_wq))); bone.updateMatrixWorld(true);
}
const _ax = new V3(), _gp = new V3();
function poseOp(o, dt, s){
  o.spd = s.spd;
  const run = Math.max(0, Math.min(1, (s.spd - 5)/1.8)), walk = Math.max(0, Math.min(1, s.spd/1.2))*(1 - run);
  const tgt = { idle:1 - walk - run, walk, run };
  for (const k in o.acts){ o.w[k] += (tgt[k] - o.w[k])*Math.min(1, dt*10); o.acts[k].setEffectiveWeight(o.w[k]); }
  o.acts.walk.timeScale = Math.max(.6, Math.min(1.7, s.spd/1.6)) * (s.back ? -1 : 1);
  o.acts.run.timeScale = Math.max(.7, Math.min(1.4, s.spd/6));
  o.mixer.update(dt);
  o.cf += ((s.crouch || 0) - o.cf)*Math.min(1, dt*10);
  const drop = o.cf*.42;
  o.model.position.y = -drop;
  o.root.updateMatrixWorld(true);
  _ax.set(1, 0, 0).applyQuaternion(o.root.quaternion);
  if (drop > .01){
    const a = Math.acos(Math.max(-1, Math.min(1, 1 - drop/.88)));
    for (const sd of ['Left','Right']){ boneTurn(o.B[sd + 'UpLeg'], _ax, -a); boneTurn(o.B[sd + 'Leg'], _ax, a*2); boneTurn(o.B[sd + 'Foot'], _ax, -a); }
    boneTurn(o.B.Spine, _ax, -o.cf*.25);
  }
  const pitch = s.pitch || 0;
  boneTurn(o.B.Spine, _ax, -pitch*.25); boneTurn(o.B.Spine2, _ax, -pitch*.35); boneTurn(o.B.Neck, _ax, -pitch*.25);
  if (o.gun){
    const U = o.gun.userData;
    o.aimK += ((s.aim ? 1 : 0) - o.aimK)*Math.min(1, dt*9);
    const k = o.aimK, lo = 1 - k, r = o.recoil;
    o.B.Spine2.getWorldPosition(_gp); o.root.worldToLocal(_gp);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    o.gun.position.set(_gp.x - .1 + U.off.x, _gp.y + .04 - lo*.16 + U.off.y + sp*.32*k, _gp.z + .2 + k*.08 - r*.6 + U.off.z - (1 - cp)*.25*k);
    o.gun.rotation.set(-pitch*k + lo*.6 - r*.5 - (s.reload ? .5 : 0), lo*.45, -lo*.35);
    o.gun.updateMatrixWorld(true);
    const grip = o.gun.localToWorld(U.grip.clone()), fore = o.gun.localToWorld(U.fore.clone()), m = o.root.matrixWorld;
    ikArm(o.B.RightArm, o.B.RightForeArm, o.B.RightHand, grip, new V3(-1, -1.2, -.4).transformDirection(m));
    if (!s.reload) ikArm(o.B.LeftArm, o.B.LeftForeArm, o.B.LeftHand, fore, new V3(1, -1.3, 0).transformDirection(m));
    o.recoil = Math.max(0, o.recoil - dt*.8);
    U.flash.visible = (s.flash || 0) > 0; if (U.flash.visible){ U.flash.material.rotation = Math.random()*6.28; U.flash.scale.setScalar(.25 + Math.random()*.2); }
  }
  o.sync();
}

// ---- the player's own body ----
let opBody = null, opBodyVer = -1;
function ensureOpBody(){
  if (!SOLDIER) return null;
  if (opBody && opBodyVer === opVer) return opBody;
  if (opBody) scene.remove(opBody.root);
  opBody = buildOperator(opMine(), false, true, true); opBodyVer = opVer;
  opBody.root.visible = false; scene.add(opBody.root);
  return opBody;
}
function opJetFlames(o, on){
  if (!o.jetFlames){ o.jetFlames = []; o.root.traverse(c => { if (c.userData.jetFlame) o.jetFlames.push(c); }); }
  for (const f of o.jetFlames){ f.visible = on; if (on) f.scale.set(1, .75 + Math.random()*.5, 1); }
}
function opBodyUpdate(dt){
  const o = (tpBlend > .01 || cfg.view === 'tp') ? ensureOpBody() : opBody;
  if (!o) return;
  o.root.visible = tpBlend > .3 && !predator && !o.root.userData.waitHD;
  if (!o.root.visible) return;
  const W = cur();
  opSetGun(o, hubMode || rage.t > 0 || katanaOn() ? '' : W.id);
  if (o.bodyU) o.bodyU.uRage.value = rageFx;
  if (o.gun && o.gunCamo !== W.camo + '|' + W.id){ o.gunCamo = W.camo + '|' + W.id; opGunCamo(o, W); }
  o.root.position.set(P.pos.x, P.pos.y, P.pos.z);
  o.root.rotation.y = P.yaw + Math.PI;
  o.root.scale.setScalar(1 + apexK*.75);
  opJetFlames(o, jet.on);
  const fwd = -(P.vel.x*Math.sin(P.yaw) + P.vel.z*Math.cos(P.yaw));
  poseOp(o, dt, { spd:Math.hypot(P.vel.x, P.vel.z), back:fwd < -.5 && !P.sprinting, crouch:P.slideT > 0 ? 1 : P.crouch ? .75 : 0, pitch:P.pitch,
    aim:!hubMode && !P.sprinting && swapT === 0, reload:reloading, flash:flashT });
}

// ---- third-person camera ----
const tpEye = new V3(), _t1 = new V3(), _t2 = new V3(), _t3 = new V3(), _tpC = new V3();
let tpBlend = 0, tpDist = 2.7, tpHint = false;
function tpWanted(){
  if (rage.t > 0 && !predator) return true;      // Apex Form is always seen from behind
  if (cfg.view !== 'tp' || predator) return false;
  if (!hubMode){ const W = cur(); if (W.scope && adsF > .5) return false; }
  return true;
}
function tpPlace(out, eye){
  const q = camera.quaternion, right = _t1.set(1, 0, 0).applyQuaternion(q), back = _t2.set(0, 0, 1).applyQuaternion(q);
  const big = 1 + apexK*.75;   // the camera backs off as the player grows
  const side = (.72 - adsF*.06)*big, dist = (2.75 - adsF*1.05)*(1 + apexK*1.1), lift = (.32 - adsF*.08) + apexK*1.1;
  const piv = _t3.copy(eye); piv.y += lift;
  let s = side; ray.set(piv, right); ray.far = side + .3; let h = ray.intersectObjects(solids, false); if (h.length) s = Math.max(0, h[0].distance - .3);
  piv.addScaledVector(right, s);
  let d = dist; ray.set(piv, back); ray.far = dist + .3; h = ray.intersectObjects(solids, false); if (h.length) d = Math.max(.4, h[0].distance - .3);
  return out.copy(piv).addScaledVector(back, d);
}
function tpFrame(dt){
  if (predator){ tpBlend = 0; return; }
  tpBlend += ((tpWanted() ? 1 : 0) - tpBlend)*Math.min(1, dt*9);
  if (tpBlend < .002){ tpBlend = 0; return; }
  tpPlace(_tpC, tpEye);
  const want = _tpC.distanceTo(tpEye);
  tpDist = want < tpDist ? want : tpDist + (want - tpDist)*Math.min(1, dt*5);
  _tpC.sub(tpEye).setLength(tpDist).add(tpEye);
  const e = tpBlend*tpBlend*(3 - 2*tpBlend);
  camera.position.lerpVectors(tpEye, _tpC, e);
}
// where a bullet starts in third person: on the crosshair line, level with the player
function tpShotOrigin(dir){
  if (tpBlend < .5) return null;
  const c = camera.position.clone(); tpPlace(c, camera.position);
  return c.addScaledVector(dir, Math.max(0, camera.position.clone().sub(c).dot(dir)));
}
function toggleView(){
  cfg.view = cfg.view === 'tp' ? 'fp' : 'tp'; saveCfg();
  toast(cfg.view === 'tp' ? 'Third person on' : 'First person on', 1400);
  if (!$('opPanel').hidden) renderOp();
}

// ---- Operator screen with a live 3D preview ----
let opReturn = 'menu', opPrev = null, opTab = 'type';
function renderOp(){
  const box = $('opBody'); box.innerHTML = '';
  const tabs = document.createElement('div'); tabs.className = 'seg opTabs';
  for (const [k, t] of [['type','Type'], ['look','Colors'], ['gear','Gear'], ['camo','Camo'], ['view','Camera']]){
    const b = document.createElement('button'); b.type = 'button'; b.textContent = t; if (opTab === k) b.className = 'on';
    b.addEventListener('click', () => { opTab = k; renderOp(); if (padActive) setPadFocus([...$('opBody').querySelectorAll('.opTabs button')].find(x => x.textContent === t)); }); tabs.appendChild(b);
  }
  box.appendChild(tabs);
  const refocus = sel => { if (padActive){ const el = $('opBody').querySelector(sel); if (el) setPadFocus(el); } };
  const swatches = (title, k, list, locked) => {
    const p = document.createElement('p'); p.className = 'pick'; p.textContent = title; box.appendChild(p);
    const row = document.createElement('div'); row.className = 'opSw'; box.appendChild(row);
    for (const e of list){
      const b = document.createElement('button'); b.type = 'button'; b.title = e[1]; b.setAttribute('aria-label', e[1]); b.dataset.k = k + e[0];
      b.style.setProperty('--c', '#' + new THREE.Color(e[2]).getHexString());
      const lk = locked && locked(e);
      b.className = (opCfg[k] === e[0] ? 'on' : '') + (lk ? ' lock' : '');
      b.addEventListener('click', () => { if (lk){ toast(lk, 2600); return; } opCfg[k] = e[0]; saveOp(); renderOp(); refocus(`[data-k="${k + e[0]}"]`); });
      row.appendChild(b);
    }
    const nm = document.createElement('span'); nm.className = 'opName'; nm.textContent = (list.find(x => x[0] === opCfg[k]) || list[0])[1]; row.appendChild(nm);
  };
  const cards = (title, k, list) => {
    const p = document.createElement('p'); p.className = 'pick'; p.textContent = title; box.appendChild(p);
    const row = document.createElement('div'); row.className = 'loadout clsRow'; box.appendChild(row);
    for (const e of list){
      const b = document.createElement('button'); b.type = 'button'; b.className = opCfg[k] === e[0] ? 'on' : ''; b.dataset.k = k + e[0];
      const t = document.createElement('b'); t.textContent = e[1]; const s = document.createElement('span'); s.textContent = e[2]; b.append(t, s);
      b.addEventListener('click', () => { opCfg[k] = e[0]; saveOp(); renderOp(); refocus(`[data-k="${k + e[0]}"]`); });
      row.appendChild(b);
    }
  };
  if (opTab === 'type'){
    const p = document.createElement('p'); p.className = 'pick'; p.textContent = 'Operator type'; box.appendChild(p);
    const row = document.createElement('div'); row.className = 'loadout clsRow'; box.appendChild(row);
    for (const e of OP_KIND){
      const b = document.createElement('button'); b.type = 'button'; b.className = opCfg.k === e[0] ? 'on' : ''; b.dataset.k = 'k' + e[0];
      const t = document.createElement('b'); t.textContent = e[1]; const s = document.createElement('span'); s.textContent = e[2]; b.append(t, s);
      b.addEventListener('click', () => { if (opCfg.k !== e[0]){ opCfg = sanitizeOp(Object.assign({}, opCfg, KIND_PRESET[e[0]], { k:e[0] })); saveOp(); } renderOp(); refocus(`[data-k="k${e[0]}"]`); });
      row.appendChild(b);
    }
    if (opCfg.k === 'animal') cards('Animal', 'f', OP_ANIMAL.map(a => { const sp = SP_POWERS[a[4] || a[0]]; return [a[0], a[1], sp ? sp[0] + ': ' + sp[1] : a[2]]; }));
    else if (opCfg.k === 'human') swatches('Skin tone', 'f', OP_SKIN);
    else if (opCfg.k === 'alien') swatches('Skin', 'f', OP_ALIEN);
    if (opCfg.k !== 'armor' && opCfg.k !== 'animal') cards('Headwear', 'w', opWearFor(opCfg.k));
  } else if (opTab === 'look'){
    swatches('Armor', 'a', OP_ARMOR, e => e[3] && !opArmorOk(e[0]) ? 'Gold armor is for XNT holders. Connect a wallet that holds XNT.' : '');
    swatches('Undersuit', 's', OP_SUIT); swatches('Stripes and details', 'c', OP_ACCENT); if (opCfg.k === 'armor') swatches('Visor', 'v', OP_VISOR);
  } else if (opTab === 'gear'){
    cards('Helmet gear', 'h', OP_HEAD); cards('Back', 'b', OP_BACK);
  } else if (opTab === 'camo'){
    const p = document.createElement('p'); p.className = 'pick'; p.textContent = 'Armor camo (unlock camos with headshots, items or holder perks)'; box.appendChild(p);
    const row = document.createElement('div'); row.className = 'loadout clsRow'; box.appendChild(row);
    for (const C of [{ k:'none', name:'None', desc:'Plain armor color' }].concat(Object.entries(OP_PATTERNS).map(([k, v]) => ({ k, name:v.name, desc:'Military pattern' })), CAMOS)){
      const ok = C.k === 'none' || opCamoOk(C.k), b = document.createElement('button'); b.type = 'button'; b.dataset.k = 'm' + C.k;
      b.className = (opCfg.m === C.k ? 'on' : '') + (ok ? '' : ' locked');
      const t = document.createElement('b'); t.textContent = C.name; const s = document.createElement('span');
      s.textContent = ok ? (C.desc || 'Unlocked') : C.item ? 'Own the on-chain item' : C.perk ? (C.desc || 'Holders') : `${C.need} headshots with any gun`;
      b.append(t, s);
      b.addEventListener('click', () => { if (!ok){ toast(`${C.name} is locked. ${s.textContent}.`, 2600); return; } opCfg.m = C.k; saveOp(); renderOp(); refocus(`[data-k="m${C.k}"]`); });
      row.appendChild(b);
    }
  } else {
    const p = document.createElement('p'); p.className = 'pick'; p.textContent = 'Camera'; box.appendChild(p);
    const row = document.createElement('div'); row.className = 'loadout clsRow'; box.appendChild(row);
    for (const [v, n, d] of [['fp', 'First person', 'Classic view down the sights'], ['tp', 'Third person', 'Over the shoulder, see your operator']]){
      const b = document.createElement('button'); b.type = 'button'; b.className = (cfg.view || 'fp') === v ? 'on' : ''; b.dataset.k = 'view' + v;
      const t = document.createElement('b'); t.textContent = n; const s = document.createElement('span'); s.textContent = d; b.append(t, s);
      b.addEventListener('click', () => { cfg.view = v; saveCfg(); renderOp(); refocus(`[data-k="view${v}"]`); }); row.appendChild(b);
    }
    const n = document.createElement('p'); n.className = 'stat clsNote';
    n.textContent = (padActive ? 'Press the touchpad' : isTouch ? 'Switch here or in Settings' : 'Press B') + (isTouch ? '.' : ' during a match to switch views.') + ' Snipers switch to the scope when you aim.';
    box.appendChild(n);
  }
  opPreviewRebuild();
}
function opPreviewRebuild(){
  if (!opPrev) return;
  const key = JSON.stringify(opMine()) + (SOLDIER ? 1 : 0) + Object.keys(OP_HD).join() + Object.keys(HD_FAIL).join();
  if (opPrev.key === key) return;
  opPrev.key = key;
  if (opPrev.o) opPrev.sc.remove(opPrev.o.root);
  opPrev.o = buildOperator(opMine(), false, false, true);
  $('opLoading').hidden = !!(opPrev.o && !opPrev.o.root.userData.waitHD);
  if (opPrev.o && !opPrev.o.root.userData.waitHD){ opPrev.sc.add(opPrev.o.root); opSetGun(opPrev.o, WEAPONS[klass.primary] ? WEAPONS[klass.primary].id : 'rifle'); opGunCamo(opPrev.o, WEAPONS[klass.primary]); }
}
function openOp(){
  opReturn = state === 'paused' ? 'pausePanel' : 'menu'; show('opPanel');
  if (!opPrev){
    const cv = $('opCanvas');
    let r = null; try { r = new THREE.WebGLRenderer({ canvas:cv, antialias:true, alpha:true }); } catch(e){}
    if (r){
      r.outputEncoding = renderer.outputEncoding; r.toneMapping = renderer.toneMapping; r.toneMappingExposure = renderer.toneMappingExposure;
      r.setPixelRatio(Math.min(2, devicePixelRatio || 1));
      const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(28, 1, .1, 40);
      sc.add(new THREE.HemisphereLight(0xfff1dc, 0x3a3346, 1.1));
      const key = new THREE.DirectionalLight(0xffe2b8, 1.6); key.position.set(2, 4, 3); sc.add(key);
      const rim = new THREE.DirectionalLight(0x8fb4ff, 1.1); rim.position.set(-3, 2.5, -3); sc.add(rim);
      const floor = new THREE.Mesh(new THREE.CircleGeometry(.9, 40), new THREE.MeshBasicMaterial({ color:0x000000, transparent:true, opacity:.35 })); floor.rotation.x = -HP; floor.position.y = .002; sc.add(floor);
      opPrev = { r, sc, cam, yaw:.45, zoom:0, zs:0, drag:null, key:'', o:null, raf:0 };
      cv.addEventListener('wheel', e => { e.preventDefault(); opPrev.zoom = Math.max(0, Math.min(1, opPrev.zoom - e.deltaY*.002)); }, { passive:false });
      cv.addEventListener('dblclick', () => { opPrev.zoom = opPrev.zoom > .5 ? 0 : 1; });
      cv.addEventListener('pointerdown', e => { opPrev.drag = e.clientX; cv.setPointerCapture(e.pointerId); });
      cv.addEventListener('pointermove', e => { if (opPrev.drag !== null){ opPrev.yaw += (e.clientX - opPrev.drag)*.012; opPrev.drag = e.clientX; } });
      cv.addEventListener('pointerup', () => { opPrev.drag = null; });
    }
  }
  renderOp();
  if (opPrev && !opPrev.raf){
    let last = performance.now();
    const tick = () => {
      if ($('opPanel').hidden){ opPrev.raf = 0; return; }
      opPrev.raf = requestAnimationFrame(tick);
      const now = performance.now(), dt = Math.min(.05, (now - last)/1000); last = now;
      if (!opPrev.o) opPrev.key = ''; opPreviewRebuild();   // also picks up detailed heads as they finish loading
      const cv = $('opCanvas'), w = cv.clientWidth, h = cv.clientHeight;
      if (w && (cv.width !== Math.round(w*opPrev.r.getPixelRatio()) || cv.height !== Math.round(h*opPrev.r.getPixelRatio()))){ opPrev.r.setSize(w, h, false); opPrev.cam.aspect = w/h; opPrev.cam.updateProjectionMatrix(); }
      const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null;
      if (gp && Math.abs(gp.axes[2] || 0) > .2) opPrev.yaw += gp.axes[2]*dt*3;
      if (gp && Math.abs(gp.axes[3] || 0) > .2) opPrev.zoom = Math.max(0, Math.min(1, opPrev.zoom - gp.axes[3]*dt*2));
      if (opPrev.drag === null && !(gp && Math.abs(gp.axes[2] || 0) > .2)) opPrev.yaw += dt*.25;
      if (opPrev.o){ opPrev.o.root.rotation.y = opPrev.yaw; poseOp(opPrev.o, dt, { spd:0, aim:false, pitch:0 }); }
      const z = opPrev.zs += ((opPrev.zoom || 0) - opPrev.zs)*Math.min(1, dt*8); opPrev.cam.position.set(0, 1.25 + z*.45, 4.6 - z*3.2); opPrev.cam.lookAt(0, .95 + z*.6, 0);
      opPrev.r.render(opPrev.sc, opPrev.cam);
    };
    opPrev.raf = requestAnimationFrame(tick);
  }
}
tintSleeves();
// start fetching the heads this player will see soon after the page has settled
setTimeout(() => preloadHeads(selectedMap), 1200);

// ---- raider factions: one per map, picked in Settings ----
function raiderFaction(){ const v = cfg.raiders || 'map'; if (v !== 'map') return v; if (packWave()) return 'wolves'; return currentMap === 'neon' ? 'aliens' : currentMap === 'yard' ? 'wolves' : 'gorillas'; }
const FACTION_NAME = { wolves:'Wolf Pack', aliens:'Alien Invaders', gorillas:'Silverback Brigade' };
let nextEnemyType = null, nextEnemySeed = 0;
function factionOp(type, seed){
  const fk = raiderFaction();
  if (!type || type === 'boss' || fk === 'classic' || !FACTION_NAME[fk]) return null;
  let r = (Math.abs(seed | 0) * 2654435761) >>> 0; const pick = a => { r = (r * 1103515245 + 12345) >>> 0; return a[(r >>> 8) % a.length]; };
  const armored = type === 'armored', sniper = type === 'sniper', rusher = type === 'rusher';
  if (fk === 'wolves') return sanitizeOp({ k:'animal', f:armored && ensureHD('wolf') ? 'wolfhd' : pick(['wolf','wolf','fox']), w:sniper ? 'cap' : rusher ? 'none' : 'helmet',
    a:armored ? 'night' : 'sand', s:'tan', c:'red', m:armored ? 'none' : pick(['desertc','desertc','tigerc']), h:sniper ? 'antenna' : 'none', b:sniper ? 'radio' : armored ? 'none' : pick(['pack','none']) });
  if (fk === 'aliens') return sanitizeOp({ k:'alien', f:pick(['green','grey','purple','blue']), w:rusher ? 'none' : 'dome', a:armored ? 'violet' : pick(['arctic','urban']), s:'black',
    c:pick(['cyan','green','pink']), m:'none', h:sniper ? 'antenna' : 'none', b:armored ? 'tanks' : 'none', v:'cyan' });
  return sanitizeOp({ k:'animal', f:armored ? 'bear' : pick(['ape','ape','bear']), w:sniper ? 'beret' : rusher ? 'none' : 'helmet', a:'olive', s:'forest', c:pick(['red','orange']),
    m:pick(['woodland','digital']), h:'none', b:armored ? 'pack' : 'none' });
}

