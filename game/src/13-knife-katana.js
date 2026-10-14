/* ---------- Knife ---------- */
const knifeG = new THREE.Group(); gunCam.add(knifeG); knifeG.visible = false;
(function buildKnife(){
  const h = gripHand(.016, 1, false); knifeG.add(h);
  vp(h, Cy(.016,.018,.1,12), MS(0x1e1f1c,.8), 0,0,0);
  vp(h, Bx(.012,.008,.05), mBlack, 0,.053,0);
  const sh = new THREE.Shape(); sh.moveTo(-.012,.056); sh.lineTo(.012,.056); sh.lineTo(.01,.17); sh.lineTo(-.002,.215); sh.lineTo(-.012,.18); sh.lineTo(-.012,.056);
  const bg = new THREE.ExtrudeGeometry(sh, { depth:.003, bevelEnabled:true, bevelThickness:.001, bevelSize:.001, bevelSegments:1 }); bg.translate(0,0,-.0015); bg.rotateY(HP);
  h.add(new THREE.Mesh(bg, MS(0xb8bcc2,.22,.9)));
  knifeG.updateMatrixWorld(true);
  const w = h.localToWorld(new V3(.03,-.05,.045)); knifeG.worldToLocal(w);
  forearm(knifeG, w, new V3(.2,-.45,.42), false);
})();
const katanaG = new THREE.Group(); gunCam.add(katanaG); katanaG.visible = false;
(function buildKatana(){
  const h = gripHand(.017, 1, false); katanaG.add(h);
  const wrap = MS(0x1a1a1e,.85), guardM = MS(0xc9a13b,.3,.9), steel = MS(0xd6dade,.18,.95);
  vp(h, Cy(.017,.018,.32,12), wrap, 0,-.08,0);
  vp(h, Cy(.02,.02,.02,12), guardM, 0,-.245,0);   // pommel cap
  // held in two hands: the left hand grips the handle just below the right
  const h2 = gripHand(.017, -1, false); h2.position.y = -.135; h.add(h2);
  vp(h, Cy(.04,.04,.008,20), guardM, 0,.085,0);
  const sh = new THREE.Shape(); sh.moveTo(-.018,.09); sh.lineTo(.018,.09); sh.quadraticCurveTo(.024,.5,.008,.86); sh.lineTo(-.008,.93); sh.quadraticCurveTo(-.016,.5,-.018,.09);
  const bg = new THREE.ExtrudeGeometry(sh, { depth:.004, bevelEnabled:true, bevelThickness:.0015, bevelSize:.001, bevelSegments:1, curveSegments:10 }); bg.translate(0,0,-.002); bg.rotateY(HP);
  h.add(new THREE.Mesh(bg, steel));
  katanaG.updateMatrixWorld(true);
  const w = h.localToWorld(new V3(.03,-.05,.045)); katanaG.worldToLocal(w);
  forearm(katanaG, w, new V3(.18,-.42,-.2), false);   // set so the arms trail back and down while the blade sweeps forward
  const w2 = h2.localToWorld(new V3(-.03,-.05,.045)); katanaG.worldToLocal(w2);
  forearm(katanaG, w2, new V3(-.14,-.5,-.18), true);
})();
// the sweep's trail: a pale arc that flashes across the view
const slashArc = new THREE.Mesh(new THREE.RingGeometry(.5, .6, 32, 1, Math.PI*.08, Math.PI*.84), new THREE.MeshBasicMaterial({ color:0xeaf4ff, transparent:true, opacity:0, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide }));
slashArc.position.set(0, -.1, -.75); slashArc.rotation.z = -.2; slashArc.visible = false; gunCam.add(slashArc);
const KATANA_KEYS = [[0,[.3,-.28,-.36, -.6,-.9,-.9]],[.3,[.28,-.14,-.46, -1.15,-.8,-.6]],[.5,[.02,-.18,-.54, -1.35,0,0]],[.7,[-.24,-.24,-.46, -1.2,.9,.6]],[1,[.28,-.58,-.3, -.4,0,-.6]]];
const KNIFE_KEYS = [[0,[.3,-.42,-.25, .4,0,-1.0]],[.25,[.08,-.16,-.42, -.5,.2,.3]],[.5,[-.15,-.18,-.4, -.9,.5,1.1]],[1,[.32,-.52,-.2, 0,0,-.6]]];
const meleeLen = () => (spPower() === 'tiger' ? .32 : .5) + (katanaOn() ? .12 : 0);
// the katana hits everything in a wide arc in front of you, not just one raider
function katanaStrike(){
  const f = new V3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw)), reach = (perk('commando') ? 4.8 : 3.4) + (spPower() === 'tiger' ? .8 : 0);
  let hits = 0;
  for (const e of enemies){
    if (!e.alive || e.air) continue;
    const d = new V3(e.pos.x - P.pos.x, 0, e.pos.z - P.pos.z), dist = d.length();
    if (Math.abs((e.y || 0) - P.pos.y) > 1.6 || dist > reach || d.normalize().dot(f) < .25) continue;
    damageEnemy(e, 280, false, d, 'knife'); hits++;
  }
  sfx.swish(); if (hits){ sfx.stab(); shake = Math.max(shake, .03); rumble(.7, .5, 140); }
}
function startMelee(){
  if (hubMode) return;
  if (state !== 'play' || meleeT > 0 || throwT > 0 || aimNade || swapT > 0) return;
  meleeT = meleeLen(); meleeHit = false; reloading = false; inspectT = 0; sfx.swish();
  const f = new V3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
  for (const e of enemies){
    if (!e.alive) continue;
    const d = new V3(e.pos.x - P.pos.x, 0, e.pos.z - P.pos.z), dist = d.length();
    if (Math.abs((e.y || 0) - P.pos.y) > 1.2) continue;
    if (dist > 2.4 && dist < 5 && d.normalize().dot(f) > .75){ P.vel.x = d.x*14; P.vel.z = d.z*14; break; }
  }
}
function meleeStrike(){
  if (katanaOn()) return katanaStrike();
  const f = new V3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw)); let best = null, bd = (perk('commando') ? 4.4 : 2.6) + (spPower() === 'tiger' ? .8 : 0);
  for (const e of enemies){
    if (!e.alive) continue;
    const d = new V3(e.pos.x - P.pos.x, 0, e.pos.z - P.pos.z), dist = d.length();
    if (Math.abs((e.y || 0) - P.pos.y) > 1.2) continue;
    if (dist < bd && d.normalize().dot(f) > .45){ best = e; bd = dist; }
  }
  if (best && bd > 2.2){ const d = new V3(best.pos.x - P.pos.x, 0, best.pos.z - P.pos.z), l = d.length(); P.pos.addScaledVector(d.normalize(), Math.max(0, l - 1.2)); collide(P.pos, .4); }   // Commando lunge
  if (best){ damageEnemy(best, 250, false, f, 'knife'); sfx.stab(); shake = Math.max(shake, .02); rumble(.6, .4, 120); }
}


