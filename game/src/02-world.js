/* ---------- World ---------- */
const ARENA = 45;
const solids = [];
const boxes = [];
let worldParent = scene, buildMap = 'yard';
const _wStart = scene.children.length;
const barrels = [];
function registerBarrel(m, box){ const b = { m, box, hp:30, map:buildMap, alive:true, chainT:0 }; m.userData.barrel = b; barrels.push(b); }
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400,400), new THREE.MeshStandardMaterial({ map:groundTex, roughness:1 }));
groundTex.repeat.set(120,120);
ground.material.onBeforeCompile = sh => {
  sh.uniforms.macroMap = { value:groundMacro };
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D macroMap;')
    .replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb *= mix(0.74, 1.16, texture2D(macroMap, vUv * 0.045).r);');
};
ground.rotation.x = -Math.PI/2; ground.receiveShadow = true; scene.add(ground);

// texture a box by real size (one repeat every s metres), so big blocks don't stretch their texture
function tileBox(geo, w, h, d, s, sy = s, o = Math.random()){
  const uv = geo.attributes.uv, dims = [[d,h],[d,h],[w,d],[w,d],[w,h],[w,h]];
  for (let f=0;f<6;f++) for (let k=0;k<4;k++){ const i = f*4 + k, vy = f === 2 || f === 3 ? s : sy; uv.setXY(i, uv.getX(i)*dims[f][0]/s + o, uv.getY(i)*dims[f][1]/vy); }
  uv.needsUpdate = true; return geo;
}
function addBox(x, z, w, d, h, mat, y0=0, collide=true){
  const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
  if (mat.userData && mat.userData.tile) tileBox(m.geometry, w, h, d, mat.userData.tile);
  m.position.set(x, y0 + h/2, z); m.castShadow = true; m.receiveShadow = true;
  worldParent.add(m); solids.push(m);
  if (collide) boxes.push({ minX:x-w/2, maxX:x+w/2, minZ:z-d/2, maxZ:z+d/2, top:y0+h });
  return m;
}
const wallMat = new THREE.MeshStandardMaterial({ map:concreteTex, roughness:.95 });
addBox(0, -ARENA-0.5, ARENA*2+2, 1, 3.6, wallMat, 0, false);
addBox(0,  ARENA+0.5, ARENA*2+2, 1, 3.6, wallMat, 0, false);
addBox(-ARENA-0.5, 0, 1, ARENA*2, 3.6, wallMat, 0, false);
addBox( ARENA+0.5, 0, 1, ARENA*2, 3.6, wallMat, 0, false);

const cMats = {
  teal: new THREE.MeshStandardMaterial({ map:containerTex('#2f6f73'), roughness:.75, metalness:.25 }),
  rust: new THREE.MeshStandardMaterial({ map:containerTex('#8a4b2f'), roughness:.8,  metalness:.2 }),
  mustard: new THREE.MeshStandardMaterial({ map:containerTex('#b88a2c'), roughness:.78, metalness:.2 }),
  slate: new THREE.MeshStandardMaterial({ map:containerTex('#4d5566'), roughness:.78, metalness:.25 })
};
const containers = [
  [-22,-18,12,2.6,'teal',true], [20,-22,2.6,12,'rust'], [4,-6,12,2.6,'mustard'], [-6,8,2.6,12,'slate'],
  [24,10,12,2.6,'teal',true], [10,26,12,2.6,'rust'], [-12,-34,12,2.6,'mustard'],
  [33,-6,2.6,12,'mustard'], [-35,-4,12,2.6,'teal'], [-18,30,12,2.6,'slate',true], [30,34,2.6,12,'slate']
];
for (const [x,z,w,d,c,stack] of containers){
  addBox(x,z,w,d,2.6,cMats[c]);
  if (stack){ addBox(x,z,w,d,2.6,cMats[stack===true ? (c==='teal'?'rust':'mustard') : c],2.6,false); boxes[boxes.length-1].top = 5.2; }
}
const crateMat = new THREE.MeshStandardMaterial({ map:crateTex, roughness:.9 });
const crates = [[14,4,1],[-14,-6,2],[28,30,1],[-30,32,1],[0,18,2],[-2,-22,1],[8,-38,1],[-38,-30,1],[16,-12,1],[-20,0,1],[38,20,1]];
for (const [x,z,n] of crates){
  addBox(x,z,1.6,1.6,1.6,crateMat);
  if (n>1){ const m = addBox(x+0.1,z-0.05,1.4,1.4,1.4,crateMat,1.6,false); m.rotation.y = 0.3; }
}
// Distant gantry cranes for the skyline (decorative only)
const craneMat = new THREE.MeshStandardMaterial({ color:0x4a3f4f, roughness:.9 });
function crane(x,z,rot){
  const g = new THREE.Group();
  for (const [lx,lz] of [[-5,-3],[5,-3],[-5,3],[5,3]]){ const l = new THREE.Mesh(new THREE.BoxGeometry(.9,24,.9), craneMat); l.position.set(lx,12,lz); g.add(l); }
  const top = new THREE.Mesh(new THREE.BoxGeometry(12,1.6,7.5), craneMat); top.position.y = 24; g.add(top);
  const boom = new THREE.Mesh(new THREE.BoxGeometry(1.2,1.2,40), craneMat); boom.position.set(0,25.5,6); g.add(boom);
  g.position.set(x,0,z); g.rotation.y = rot; scene.add(g);
}
crane(-70,-60,0.4); crane(75,-40,-0.9); crane(20,85,2.8);

/* ---------- Collision ---------- */
function collide(p, r, y=0){
  const L = ARENA - r;
  p.x = Math.max(-L, Math.min(L, p.x)); p.z = Math.max(-L, Math.min(L, p.z));
  for (const b of boxes){
    if ((b.top || 1.2) <= y + .35) continue;
    if (b.bot !== undefined && y + 1.8 <= b.bot) continue;   // a wall that starts above head height (over a doorway)
    const cx = Math.max(b.minX, Math.min(p.x, b.maxX)), cz = Math.max(b.minZ, Math.min(p.z, b.maxZ));
    const dx = p.x-cx, dz = p.z-cz, d2 = dx*dx+dz*dz;
    if (d2 < r*r){
      if (d2 > 1e-8){ const d = Math.sqrt(d2); p.x = cx + dx/d*r; p.z = cz + dz/d*r; }
      else {
        const l=p.x-b.minX, rr=b.maxX-p.x, t=p.z-b.minZ, bb=b.maxZ-p.z, m=Math.min(l,rr,t,bb);
        if (m===l) p.x=b.minX-r; else if (m===rr) p.x=b.maxX+r; else if (m===t) p.z=b.minZ-r; else p.z=b.maxZ+r;
      }
    }
  }
}
function freeSpot(x, z, r){
  for (const b of boxes){
    if (b.bot !== undefined) continue;
    const cx = Math.max(b.minX, Math.min(x, b.maxX)), cz = Math.max(b.minZ, Math.min(z, b.maxZ));
    if ((x-cx)**2 + (z-cz)**2 < r*r) return false;
  }
  return true;
}
const losRay = new THREE.Raycaster();
function lineOfSight(a, b, noSmoke){
  if (!noSmoke && smokes.length && smokeBlocks(a, b)) return false;
  const dir = new V3().subVectors(b, a); const dist = dir.length(); dir.normalize();
  losRay.set(a, dir); losRay.far = dist;
  return losRay.intersectObjects(solids, false).length === 0;
}

