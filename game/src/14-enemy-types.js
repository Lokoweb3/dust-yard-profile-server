/* ---------- Enemy types ---------- */
const TYPES = {
  grunt:{ hp:100, spd:1, score:1, tint:[.6,.66,.88], scale:1 },
  rusher:{ hp:70, spd:1.65, score:1.2, tint:[1,.6,.5], scale:.96 },
  armored:{ hp:260, spd:.72, score:2.5, tint:[.42,.44,.5], scale:1.12 },
  sniper:{ hp:100, spd:0, score:2, tint:[.72,.8,.6], scale:1 },
  boss:{ hp:2600, spd:.55, score:25, tint:[.32,.34,.42], scale:1.75 }
};
const PERCHES = [[-22,-18,5.2],[24,10,5.2],[-18,30,5.2],[31,-26.6,3.25]];
function pickType(){
  const snipers = enemies.filter(e => e.alive && e.type === 'sniper').length, r = Math.random();
  if (packWave()) return r < .35 ? 'rusher' : r < .55 ? 'armored' : 'grunt';   // the Alpha's pack runs with it, no snipers
  if (wave >= 3 && snipers < Math.min(2, 1 + Math.floor(wave/5)) && r < .18) return 'sniper';
  if (wave >= 3 && r < .36) return 'armored';
  if (wave >= 2 && r < .58) return 'rusher';
  return 'grunt';
}
const faceImg = new Image();
const faceTex = new THREE.Texture(faceImg); faceTex.anisotropy = 4;
faceImg.onload = () => { faceTex.needsUpdate = true; };
faceImg.src = 'data:image/png;base64,' + document.getElementById('skullFace').textContent.trim();
// skull-shaped head: wide cranium, narrower jaw, face art projected onto the front
const skullGeo = (() => {
  const g = new THREE.SphereGeometry(.15, 40, 30);
  const pos = g.attributes.position, uv = g.attributes.uv, nrm = g.attributes.normal;
  for (let i=0;i<pos.count;i++){
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    y *= 1.12;
    if (y < -.01){ const t = Math.min(1, (-.01 - y)/.16); x *= 1 - .3*t; z *= 1 - .18*t; y *= 1 + .22*t; }
    if (z > 0) z *= .9 + .1*(1 - Math.abs(y)/.2);
    z -= .01;
    pos.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  for (let i=0;i<pos.count;i++){
    const x = pos.getX(i), y = pos.getY(i), nz = nrm.getZ(i);
    if (nz > -.05) uv.setXY(i, .5 + x*1.75, .075 + (y + .205)*1.96);
    else uv.setXY(i, .5 + x*.4, .9);
  }
  uv.needsUpdate = true;
  return g;
})();
const flameTex = canvasTex(64,96,(g,w,h)=>{
  g.clearRect(0,0,w,h);
  const gr = g.createRadialGradient(32,66,2,32,60,34); gr.addColorStop(0,'rgba(220,240,255,1)'); gr.addColorStop(.35,'rgba(90,160,255,.95)'); gr.addColorStop(1,'rgba(30,80,255,0)');
  g.fillStyle = gr; g.beginPath(); g.moveTo(32,2); g.bezierCurveTo(52,30,62,52,56,74); g.bezierCurveTo(50,94,14,94,8,74); g.bezierCurveTo(2,52,12,30,32,2); g.fill();
});
const MASK_TINT = { grunt:0xffffff, rusher:0xffc0b4, armored:0xc4cad8, sniper:0xd8f0c8, boss:0xffffff };
const FLAME_TINT = { grunt:0x4f8dff, rusher:0xff5a3c, armored:0x9fb4ff, sniper:0x63ff9c, boss:0x2f6bff };
const skullMats = {};
for (const k in MASK_TINT) skullMats[k] = new THREE.MeshStandardMaterial({ map:faceTex, color:MASK_TINT[k], roughness:.55, metalness:.05, emissive:0x223355, emissiveMap:faceTex, emissiveIntensity:.18 });
const eyeTex = canvasTex(32,32,(g)=>{ const gr = g.createRadialGradient(16,16,0,16,16,16); gr.addColorStop(0,'rgba(220,255,255,1)'); gr.addColorStop(.3,'rgba(80,220,255,.9)'); gr.addColorStop(1,'rgba(20,120,255,0)'); g.fillStyle = gr; g.fillRect(0,0,32,32); });
const FLAME_SPOTS = [[0,.22,-.02,.26],[-.1,.18,-.03,.22],[.1,.18,-.03,.22],[-.15,.08,-.05,.18],[.15,.08,-.05,.18],[0,.16,-.11,.24],[-.07,.13,-.13,.2],[.07,.13,-.13,.2]];
function addSkullMask(e){
  const m = new THREE.Group();
  const head = new THREE.Mesh(skullGeo, skullMats[e.type]); head.castShadow = true; m.add(head);
  e.eyes = [];
  for (const ex of [-.08,.075]){
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map:eyeTex, blending:THREE.AdditiveBlending, transparent:true, depthWrite:false, color:0xffffff }));
    s.position.set(ex, .012, .128); s.scale.setScalar(.07); m.add(s); e.eyes.push(s);
  }
  e.flames = FLAME_SPOTS.map(([x,y,z,sc], i) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map:flameTex, color:FLAME_TINT[e.type], blending:THREE.AdditiveBlending, transparent:true, depthWrite:false, opacity:.85 }));
    s.position.set(x,y,z); s.userData = { sc, ph:Math.random()*6, y }; s.scale.set(sc*.7, sc, 1); m.add(s); return s;
  });
  if (e.model) e.g.add(m); else { m.position.set(0,.1,0); e.headG.add(m); e.headG.children.forEach(c => { if (c !== m) c.visible = false; }); }
  e.mask = m;
}
function animateSkull(e, dt){
  if (!e.flames) return;
  const dying = !e.alive;
  e.flames.forEach(f => {
    const u = f.userData, k = dying ? Math.max(0, 1 - e.dieT*.8) : 1;
    const fl = .8 + Math.sin(T*14 + u.ph)*.12 + Math.sin(T*23 + u.ph*2)*.08;
    f.scale.set(u.sc*.7*fl*k, u.sc*(fl + .1)*k, 1); f.position.y = u.y + (fl - .8)*.04;
    f.material.opacity = .85*k;
  });
  e.eyes.forEach(s => { s.material.opacity = dying ? Math.max(0, 1 - e.dieT*2) : .85 + Math.sin(T*9 + e.seed)*.15; });
}
function applyType(e){
  const t = TYPES[e.type];
  e.hp = e.type === 'boss' ? t.hp + wave*220 : t.hp; e.speed *= t.spd; e.scoreMul = t.score;
  if (t.tint){ const c = new THREE.Color(t.tint[0], t.tint[1], t.tint[2]); e.mats.forEach(m => m.color.multiply(c)); }
  e.g.scale.setScalar(t.scale); e.g.position.y = e.y;
  e.nadeCd = 8 + Math.random()*8; e.hidT = 0; e.aimT = 0; e.maxHp = e.hp;
  if ((e.type === 'grunt' || e.type === 'rusher') && wave >= 2 && Math.random() < .35) e.flank = Math.random() < .5 ? -1 : 1;
  if (!e.opSync) addSkullMask(e);
  if (e.type === 'sniper'){
    e.glint = new THREE.Sprite(new THREE.SpriteMaterial({ map:flashTex, color:0xcfe6ff, blending:THREE.AdditiveBlending, transparent:true, depthWrite:false, opacity:0 }));
    scene.add(e.glint);
  }
}
function sniperShoot(e, dist){
  const muzzle = e.muzzle.getWorldPosition(new V3());
  let chance = .78 - (P.moving ? .22 : 0) - (P.sprinting ? .15 : 0) - (P.crouch ? .1 : 0) - (P.slideT > 0 ? .2 : 0) - (!P.onGround ? .15 : 0);
  if (smokes.length && smokeBlocks(muzzle, camera.position)) chance = 0;
  const hit = Math.random() < chance, target = new V3(P.pos.x, P.pos.y + camH - .3, P.pos.z);
  if (!hit){ target.x += (Math.random()-.5)*1.6; target.y += Math.random() - .3; target.z += (Math.random()-.5)*1.6; target.sub(muzzle).multiplyScalar(1.4).add(muzzle); }
  spawnTracer(muzzle, target, 0xfff0c8); spawnFlashSprite(muzzle); sfx.esniper(dist);
  e.recoil = .12; e.lastFire = T; e.shotN = (e.shotN || 0) + 1;
  if (hit) damagePlayer(42 + Math.min(18, wave*2), new V3(e.pos.x, 0, e.pos.z));
}
function enemyThrow(e){
  const from = new V3(e.pos.x, 1.8, e.pos.z), tgt = new V3(P.pos.x + (Math.random()-.5)*2.5, .1, P.pos.z + (Math.random()-.5)*2.5);
  const t = 1.25, v = new V3((tgt.x - from.x)/t, (tgt.y - from.y)/t + 8*t, (tgt.z - from.z)/t);
  const mesh = new THREE.Mesh(nadeGeo.frag, nadeMat.frag); mesh.castShadow = true; mesh.position.copy(from); scene.add(mesh);
  nades.push({ kind:'frag', mesh, pos:from, vel:v, fuse:2.9, enemy:true });
  sfx.toss(); e.lastFire = T; callout(e, 'Grenade out!');
}

