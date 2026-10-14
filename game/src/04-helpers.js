/* ---------- Shared helpers ---------- */
const UP = new V3(0,1,0), DOWN = new V3(0,-1,0), HP = Math.PI/2;
const Bx = (x,y,z) => new THREE.BoxGeometry(x,y,z);
const Cy = (r1,r2,h,s=12) => new THREE.CylinderGeometry(r1,r2,h,s);
function vp(parent, geo, mat, x=0, y=0, z=0, rx=0, ry=0, rz=0){
  const m = new THREE.Mesh(geo, mat); m.position.set(x,y,z); m.rotation.set(rx,ry,rz); parent.add(m); return m;
}
function limbBetween(parent, a, b, r1, r2, mat, seg=10){
  const d = new V3().subVectors(b, a), len = d.length();
  const m = new THREE.Mesh(Cy(r2, r1, len, seg), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(UP, d.normalize());
  parent.add(m); return m;
}
function smooth(k){ k = Math.max(0, Math.min(1, k)); return k*k*(3-2*k); }
function keyframe(keys, p){
  if (p <= keys[0][0]) return keys[0][1];
  for (let i=1;i<keys.length;i++){
    if (p <= keys[i][0]){
      const [t0,a] = keys[i-1], [t1,b] = keys[i], k = smooth((p-t0)/(t1-t0));
      return Array.isArray(a) ? a.map((v,j) => v + (b[j]-v)*k) : a + (b-a)*k;
    }
  }
  return keys[keys.length-1][1];
}


