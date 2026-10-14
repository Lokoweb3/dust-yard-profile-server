/* ---------- Weapon camos ---------- */
const CAMOS = [
  { k:'gold', name:'Gold', need:10 },
  { k:'diamond', name:'Diamond', need:25 },
  { k:'inferno', name:'Inferno', need:50, desc:'Animated' },
  { k:'aurora', name:'X1 Aurora', perk:'holder', desc:'XNT holders' },
  { k:'obsidian', name:'Obsidian Neon', perk:'collector', desc:'NFT holders' },
  { k:'jslayer', name:'Juggernaut Slayer', item:'juggernaut_slayer', desc:'On-chain item' },
  { k:'voidninja', name:'Void Ninja', item:'void_ninja', desc:'On-chain item' },
  { k:'x1circuit', name:'X1 Circuit', item:'x1_circuit', desc:'On-chain item' },
  { k:'s1vet', name:'S1 Veteran', item:'s1_veteran', desc:'Season 1 item' }
];
// Diamond camo: a faceted crystal pattern with per-facet normals so it sparkles as the gun moves
const diamondTex = (() => {
  const N = 256, cells = 9, cs = N/cells, col = document.createElement('canvas'), nrm = document.createElement('canvas'), spk = document.createElement('canvas');
  col.width = col.height = nrm.width = nrm.height = spk.width = spk.height = N;
  const gc = col.getContext('2d'), gn = nrm.getContext('2d'), gs = spk.getContext('2d');
  gc.fillStyle = '#123a5c'; gc.fillRect(0,0,N,N); gn.fillStyle = 'rgb(128,128,255)'; gn.fillRect(0,0,N,N); gs.fillStyle = '#000'; gs.fillRect(0,0,N,N);
  // jittered grid points that wrap, so the pattern tiles seamlessly
  const pts = [];
  for (let j=0;j<=cells;j++){ pts[j] = []; for (let i=0;i<=cells;i++){
    const wi = i % cells, wj = j % cells;
    const seedX = Math.sin((wi*12.9898 + wj*78.233))*43758.5453, seedY = Math.sin((wi*93.989 + wj*67.345))*24634.6345;
    pts[j][i] = [i*cs + (seedX - Math.floor(seedX) - .5)*cs*.7, j*cs + (seedY - Math.floor(seedY) - .5)*cs*.7];
  } }
  const tri = (a, b, c) => {
    const l = Math.random(), hue = 190 + Math.random()*30 + (Math.random() < .06 ? 120 : 0);
    const light = l < .1 ? 70 + Math.random()*12 : 18 + l*36, sat = 60 + Math.random()*30;
    for (const [ox,oy] of [[0,0],[-N,0],[0,-N],[-N,-N],[N,0],[0,N],[N,N],[N,-N],[-N,N]]){
      gc.beginPath(); gc.moveTo(a[0]+ox,a[1]+oy); gc.lineTo(b[0]+ox,b[1]+oy); gc.lineTo(c[0]+ox,c[1]+oy); gc.closePath();
      const gr = gc.createLinearGradient(a[0]+ox, a[1]+oy, c[0]+ox, c[1]+oy);
      gr.addColorStop(0, `hsl(${hue},${sat}%,${Math.min(96, light + 14)}%)`); gr.addColorStop(1, `hsl(${hue},${sat}%,${light*.7}%)`);
      gc.fillStyle = gr; gc.fill(); gc.strokeStyle = 'rgba(170,225,255,.45)'; gc.lineWidth = 1; gc.stroke();
      const nx = (Math.random()-.5)*.9, ny = (Math.random()-.5)*.9, nz = Math.sqrt(Math.max(.1, 1 - nx*nx - ny*ny));
      gn.beginPath(); gn.moveTo(a[0]+ox,a[1]+oy); gn.lineTo(b[0]+ox,b[1]+oy); gn.lineTo(c[0]+ox,c[1]+oy); gn.closePath();
      gn.fillStyle = `rgb(${(nx*.5+.5)*255|0},${(ny*.5+.5)*255|0},${(nz*.5+.5)*255|0})`; gn.fill();
    }
  };
  for (let j=0;j<cells;j++) for (let i=0;i<cells;i++){
    const p00 = pts[j][i], p10 = pts[j][i+1], p01 = pts[j+1][i], p11 = pts[j+1][i+1];
    if ((i + j) % 2){ tri(p00,p10,p11); tri(p00,p11,p01); } else { tri(p00,p10,p01); tri(p10,p11,p01); }
  }
  // a few tiny glints that catch the bloom
  for (let k=0;k<26;k++){ const x = Math.random()*N, y = Math.random()*N, r = 1 + Math.random()*1.8;
    const gr = gs.createRadialGradient(x,y,0,x,y,r*3); gr.addColorStop(0,'rgba(255,255,255,1)'); gr.addColorStop(1,'rgba(255,255,255,0)'); gs.fillStyle = gr; gs.fillRect(x-r*3,y-r*3,r*6,r*6); }
  const mk = c => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3,3); t.anisotropy = 8; return t; };
  return { map:mk(col), normal:mk(nrm), sparkle:mk(spk) };
})();
const infernoCanvas = document.createElement('canvas'); infernoCanvas.width = infernoCanvas.height = 128;
(() => {
  const g = infernoCanvas.getContext('2d'); g.fillStyle = '#140604'; g.fillRect(0,0,128,128);
  for (let i=0;i<26;i++){
    const x = Math.random()*128;
    g.strokeStyle = `rgba(${230 + Math.random()*25|0},${70 + Math.random()*110|0},20,${.6 + Math.random()*.4})`; g.lineWidth = 2 + Math.random()*5;
    g.beginPath(); g.moveTo(x, 0); for (let y=0;y<=128;y+=16) g.lineTo(x + Math.sin(y*.08 + i)*10, y); g.stroke();
  }
  for (const dx of [-128,128]) g.drawImage(infernoCanvas, dx, 0);
})();
const infernoTex = new THREE.CanvasTexture(infernoCanvas); infernoTex.wrapS = infernoTex.wrapT = THREE.RepeatWrapping; infernoTex.repeat.set(4,4);
const auroraCanvas = document.createElement('canvas'); auroraCanvas.width = 256; auroraCanvas.height = 128;
(() => { const g = auroraCanvas.getContext('2d'); g.fillStyle = '#040a14'; g.fillRect(0,0,256,128);
  for (let k=0;k<5;k++){ const hue = [150,175,195,280,130][k]; g.strokeStyle = `hsla(${hue},95%,60%,.75)`; g.lineWidth = 10 + k*4; g.shadowColor = `hsl(${hue},95%,60%)`; g.shadowBlur = 18;
    g.beginPath(); for (let x=-10;x<=266;x+=8){ const y = 64 + Math.sin(x*.025 + k*1.3)*30*Math.cos(k + x*.01); x === -10 ? g.moveTo(x,y) : g.lineTo(x,y); } g.stroke(); } })();
const auroraTex = new THREE.CanvasTexture(auroraCanvas); auroraTex.wrapS = auroraTex.wrapT = THREE.RepeatWrapping; auroraTex.repeat.set(3,3);
const obsidianTex = canvasTex(256,256,(g,w,h)=>{ g.fillStyle = '#07070b'; g.fillRect(0,0,w,h); g.lineWidth = 2; g.lineCap = 'square';
  for (let i=0;i<34;i++){ g.strokeStyle = i % 3 ? 'rgba(46,230,255,.9)' : 'rgba(255,60,200,.9)'; g.shadowColor = g.strokeStyle; g.shadowBlur = 6;
    let x = Math.random()*w, y = Math.random()*h; g.beginPath(); g.moveTo(x,y); for (let s=0;s<4;s++){ if (s % 2) y += (Math.random() < .5 ? -1 : 1)*(10 + Math.random()*30); else x += (Math.random() < .5 ? -1 : 1)*(10 + Math.random()*30); g.lineTo(x,y); } g.stroke();
    g.fillStyle = g.strokeStyle; g.fillRect(x-2.5,y-2.5,5,5); } }, [3,3]);
const camoMats = {
  gold: MS(0xd8a93a, .22, 1, { roughnessMap:finishTex, envMapIntensity:1.4 }),
  diamond: new THREE.MeshPhysicalMaterial({ color:0xffffff, map:diamondTex.map, normalMap:diamondTex.normal, normalScale:new THREE.Vector2(.9,.9),
    metalness:.3, roughness:.2, clearcoat:.55, clearcoatRoughness:.08, envMapIntensity:.9, emissive:0xbfe8ff, emissiveMap:diamondTex.sparkle, emissiveIntensity:.3 }),
  inferno: MS(0x332222, .5, .3, { map:infernoTex, emissive:0xffffff, emissiveMap:infernoTex, emissiveIntensity:1.1 }),
  aurora: MS(0x223344, .35, .4, { map:auroraTex, emissive:0xffffff, emissiveMap:auroraTex, emissiveIntensity:.9 }),
  jslayer: MS(0x3a0a0a, .45, .5, { map:canvasTex(128,128,(g,w,h)=>{ g.fillStyle='#3a0a0a'; g.fillRect(0,0,w,h); for (let i=0;i<9;i++){ const x=(i%3)*43+20, y=Math.floor(i/3)*43+20; g.fillStyle='#e8e2d0'; g.beginPath(); g.arc(x,y,11,0,Math.PI*2); g.fill(); g.fillStyle='#3a0a0a'; g.fillRect(x-6,y-3,4,4); g.fillRect(x+2,y-3,4,4); } }, [4,4]), emissive:0x2a0000 }),
  voidninja: MS(0x0b0614, .3, .5, { map:canvasTex(128,128,(g,w,h)=>{ g.fillStyle='#0b0614'; g.fillRect(0,0,w,h); for (let i=0;i<60;i++){ g.fillStyle=`rgba(${150+Math.random()*100|0},90,255,${Math.random()})`; g.fillRect(Math.random()*w, Math.random()*h, 2, 2); } }, [4,4]), emissive:0xffffff, emissiveIntensity:.6 }),
  x1circuit: MS(0x06140c, .35, .4, { map:canvasTex(128,128,(g,w,h)=>{ g.fillStyle='#06140c'; g.fillRect(0,0,w,h); g.strokeStyle='#5cff8a'; g.lineWidth=2; for (let i=0;i<12;i++){ let x=Math.random()*w, y=Math.random()*h; g.beginPath(); g.moveTo(x,y); x+=(Math.random()<.5?-1:1)*30; g.lineTo(x,y); y+=(Math.random()<.5?-1:1)*30; g.lineTo(x,y); g.stroke(); g.fillStyle='#5cff8a'; g.fillRect(x-3,y-3,6,6); } }, [4,4]), emissive:0xffffff, emissiveIntensity:.5 }),
  s1vet: MS(0x2a2418, .4, .6, { map:canvasTex(128,128,(g,w,h)=>{ g.fillStyle='#2a2418'; g.fillRect(0,0,w,h); g.strokeStyle='#d8a93a'; g.lineWidth=3; for (let i=-w;i<w*2;i+=22){ g.beginPath(); g.moveTo(i,0); g.lineTo(i+h,h); g.stroke(); } g.fillStyle='#d8a93a'; g.font='bold 28px Arial'; g.fillText('S1', 44, 72); }, [3,3]), emissive:0x2a1a00 }),
  obsidian: new THREE.MeshPhysicalMaterial({ color:0xffffff, map:obsidianTex, emissive:0xffffff, emissiveMap:obsidianTex, emissiveIntensity:.8, roughness:.15, metalness:.6, clearcoat:1, clearcoatRoughness:.05 })
};
function applyCamo(W){
  W.vm.model.traverse(o => {
    if (!o.isMesh) return;
    if (o.userData.orig === undefined) o.userData.orig = (o.material === mBlack || o.material === mTan || o.material === mPoly || o.material === mWood) ? o.material : null;
    const C = CAMOS.find(c => c.k === W.camo), ok = C && (C.item ? (typeof ownedItems !== 'undefined' && ownedItems.has(C.item)) : true) && (!C.perk || (typeof holder !== 'undefined' && holder.perks && holder.perks[C.perk]));
    if (o.userData.orig) o.material = ok && camoMats[W.camo] ? camoMats[W.camo] : o.userData.orig;
  });
}
function addHeadshot(W){
  W.hs = (W.hs || 0) + 1;
  const C = CAMOS.find(c => c.need === W.hs);
  if (C){ queuePrompt('camo'); feed(`${C.name} camo unlocked for ${W.name}`, true); toast(`${C.name} camo unlocked for the ${W.name}. Equip it in the Gunsmith.`, 4500); sfx.levelUp(); }
  saveGuns();
}

