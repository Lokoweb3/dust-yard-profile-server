/* ---------- Weapons & first-person viewmodel ---------- */
const gun = new THREE.Group(); gunCam.add(gun);           // pose root: bob, sway, recoil
const swapG = new THREE.Group(); gun.add(swapG);           // weapon raise / lower
const MS = (c, r=.6, m=0, extra={}) => new THREE.MeshStandardMaterial(Object.assign({ color:c, roughness:r, metalness:m }, extra));
const finishTex = canvasTex(128,128,(g,w,h)=>{ g.fillStyle='#8a8a8a'; g.fillRect(0,0,w,h); speckle(g,w,h,2500,'40,40,40','230,230,230');
  for (let i=0;i<40;i++){ g.strokeStyle=`rgba(255,255,255,${Math.random()*.25})`; g.lineWidth=1; g.beginPath(); const x=Math.random()*w, y=Math.random()*h; g.moveTo(x,y); g.lineTo(x+Math.random()*20-10, y+Math.random()*6-3); g.stroke(); } });
const woodTex = canvasTex(256,64,(g,w,h)=>{ g.fillStyle='#6e4526'; g.fillRect(0,0,w,h);
  for (let y=0;y<h;y+=2){ g.fillStyle=`rgba(${30+Math.random()*30},15,5,${.15+Math.random()*.2})`; g.fillRect(0,y,w,1+Math.random()*1.5); }
  for (let i=0;i<5;i++){ g.strokeStyle='rgba(40,20,8,.4)'; g.beginPath(); g.ellipse(Math.random()*w,Math.random()*h,10+Math.random()*20,3+Math.random()*4,0,0,Math.PI*2); g.stroke(); } });
const clothTex = canvasTex(128,128,(g,w,h)=>{ g.fillStyle='#4c5240'; g.fillRect(0,0,w,h);
  for (let i=0;i<w;i+=2){ g.fillStyle='rgba(0,0,0,.07)'; g.fillRect(i,0,1,h); }
  for (let i=0;i<h;i+=2){ g.fillStyle='rgba(255,255,255,.04)'; g.fillRect(0,i,w,1); }
  for (let i=0;i<10;i++){ g.strokeStyle='rgba(20,22,15,.3)'; g.lineWidth=3; g.beginPath(); const y=Math.random()*h; g.moveTo(0,y); g.bezierCurveTo(w*.3,y+10,w*.6,y-10,w,y+5); g.stroke(); }
  speckle(g,w,h,800,'30,30,20','190,190,160'); }, [2,2]);
const gloveTex = canvasTex(64,64,(g,w,h)=>{ g.fillStyle='#6a604f'; g.fillRect(0,0,w,h); speckle(g,w,h,900,'30,26,20','190,180,160');
  for (let i=0;i<w;i+=6){ g.fillStyle='rgba(0,0,0,.12)'; g.fillRect(i,0,1,h); } });
const mMetal = MS(0x45484e,.42,.55,{ roughnessMap:finishTex }), mBlack = MS(0x2b2d31,.55,.4,{ roughnessMap:finishTex });
const mBlackDS = mBlack.clone(); mBlackDS.side = THREE.DoubleSide;
const mPoly = MS(0x3f403a,.78,.05,{ roughnessMap:finishTex }), mTan = MS(0x76664a,.8,.05,{ roughnessMap:finishTex });
const mDark = MS(0x141516,.6,.3), mBarrel = MS(0x2f3134,.3,.75), mWood = MS(0xffffff,.55,.05,{ map:woodTex });
const mGlove = MS(0xffffff,.9,0,{ map:gloveTex }), mPad = MS(0x2e2a25,.7), mSleeve = MS(0xffffff,1,0,{ map:clothTex }), mCuff = MS(0x454a37,1);
const mBrass = MS(0xc9a13b,.3,.9), mShellRed = MS(0xa3271c,.55,.1);
const mWatch = MS(0x0c0d0e,.4,.3), mWatchGlow = MS(0x6fe3a0,.4,0,{ emissive:0x6fe3a0, emissiveIntensity:.8 });
const mLens = MS(0x0b1a2e,.06,.9,{ envMapIntensity:2.5 });
const mGlass = new THREE.MeshBasicMaterial({ color:0x9fd4ff, transparent:true, opacity:.1, depthWrite:false });
const retTex = canvasTex(64,64,(g)=>{
  g.strokeStyle='rgba(255,70,50,1)'; g.lineWidth=3; g.beginPath(); g.arc(32,32,24,0,Math.PI*2); g.stroke();
  g.fillStyle='rgba(255,90,60,1)'; g.beginPath(); g.arc(32,32,3.2,0,Math.PI*2); g.fill();
  g.fillRect(30.5,2,3,8); g.fillRect(30.5,54,3,8); g.fillRect(2,30.5,8,3); g.fillRect(54,30.5,8,3);
});
const dotTex = canvasTex(32,32,(g)=>{ const gr=g.createRadialGradient(16,16,0,16,16,8); gr.addColorStop(0,'rgba(255,120,90,1)'); gr.addColorStop(.4,'rgba(255,60,40,1)'); gr.addColorStop(1,'rgba(255,40,30,0)'); g.fillStyle=gr; g.fillRect(0,0,32,32); });
const retMat = new THREE.MeshBasicMaterial({ map:retTex, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false });
const dotMat = new THREE.MeshBasicMaterial({ map:dotTex, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false });

// side-profile extrusion: points are [u (forward), v (up)], extruded across the gun's width
function prof(parent, pts, depth, mat, x=0, bevel=.0025){
  const sh = new THREE.Shape();
  pts.forEach((p,i) => { if (p[0] === 'q') sh.quadraticCurveTo(p[1],p[2],p[3],p[4]); else if (i === 0) sh.moveTo(p[0],p[1]); else sh.lineTo(p[0],p[1]); });
  const d = Math.max(.002, depth - bevel*2);
  const g = new THREE.ExtrudeGeometry(sh, { depth:d, bevelEnabled:true, bevelThickness:bevel, bevelSize:bevel, bevelSegments:2, curveSegments:8 });
  g.translate(0,0,-d/2); g.rotateY(HP);
  const m = new THREE.Mesh(g, mat); m.position.x = x; parent.add(m); return m;
}
// cylinder along the barrel axis between forward distances u0 (rear) and u1 (front)
function zc(parent, r0, r1, u0, u1, v, mat, x=0, seg=16, open=false){
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, u1-u0, seg, 1, open), mat);
  m.rotation.x = HP; m.position.set(x, v, -(u0+u1)/2); parent.add(m); return m;
}
const knuckleGeo = new THREE.SphereGeometry(1,16,12);
const mVClaw = MS(0xf1ead8,.35,.05), vmClaws = [];
function finger(parent, pts, r){
  for (let i=0;i<pts.length;i++){ const s = new THREE.Mesh(knuckleGeo, mGlove); s.position.copy(pts[i]); s.scale.setScalar(r*(1-i*.07)); parent.add(s); }
  for (let i=0;i<pts.length-1;i++) limbBetween(parent, pts[i], pts[i+1], r*(1-i*.07), r*(1-(i+1)*.07), mGlove, 14);
  // a claw on the fingertip, shown only for animal operators
  const n = pts.length, d = pts[n-1].clone().sub(pts[n-2]).normalize(), cl = new THREE.Mesh(new THREE.ConeGeometry(r*.55, r*2.4, 8), mVClaw);
  cl.position.copy(pts[n-1]).addScaledVector(d, r*1.5); cl.quaternion.setFromUnitVectors(UP, d); cl.visible = false; parent.add(cl); vmClaws.push(cl);
}
// A gloved hand closed around a grip whose axis is local +Y. side 1 = right hand, -1 = left hand.
function gripHand(R, side, trigger){
  const g = new THREE.Group(), X = v => v*side, rr = R + .0112;
  const rows = trigger ? [.008,-.016,-.04] : [.032,.008,-.016,-.04];
  const reach = trigger ? [1,.95,.8] : [.95,1,.95,.8];
  rows.forEach((y,i) => {
    const pts = [];
    for (let k=0;k<4;k++){ const a = .3 + (2.5*reach[i] - .3)*k/3; pts.push(new V3(X(Math.cos(a)*rr), y - k*.002, -Math.sin(a)*rr)); }
    finger(g, pts, .0106 - i*.0006);
  });
  if (trigger) finger(g, [new V3(X(rr*.85),.04,-.012), new V3(X(rr*.45),.045,-.04), new V3(X(.006),.043,-.066)], .0102);
  finger(g, [new V3(X(rr*.95),.032,.022), new V3(X(rr*.35),.047,.034), new V3(X(-rr*.35),.05,.026), new V3(X(-rr*.78),.046,.004)], .0114);
  // rounded palm and back of the hand (no boxes), with a padded knuckle guard
  const palm = new THREE.Mesh(knuckleGeo, mGlove); palm.scale.set(.0135,.05,.034); palm.position.set(X(R+.016),-.002,.014); g.add(palm);
  const back = new THREE.Mesh(knuckleGeo, mGlove); back.scale.set(.011,.04,.026); back.position.set(X(R+.024),.004,.006); g.add(back);
  const pad = new THREE.Mesh(knuckleGeo, mPad); pad.scale.set(.006,.03,.022); pad.position.set(X(R+.032),.008,.006); g.add(pad);
  const heel = new THREE.Mesh(knuckleGeo, mGlove); heel.scale.set(.02,.026,.022); heel.position.set(X(R+.01),-.042,.03); g.add(heel);
  return g;
}
function forearm(parent, wrist, elbow, watch){
  const dir = elbow.clone().sub(wrist).normalize();
  const cuffEnd = wrist.clone().addScaledVector(dir, .06);
  limbBetween(parent, wrist, cuffEnd, .03, .036, mGlove, 12);
  if (watch){
    const p = wrist.clone().addScaledVector(dir, .032);
    const band = new THREE.Mesh(Cy(.0375,.0375,.016,16), mWatch); band.position.copy(p); band.quaternion.setFromUnitVectors(UP, dir); parent.add(band);
    const glow = new THREE.Mesh(Cy(.038,.038,.004,16), mWatchGlow); glow.position.copy(p); glow.quaternion.setFromUnitVectors(UP, dir); parent.add(glow);
  }
  const s0 = wrist.clone().addScaledVector(dir, .05);
  const bunch = new THREE.Mesh(new THREE.TorusGeometry(.042,.013,8,18), mSleeve);
  bunch.position.copy(s0.clone().addScaledVector(dir, .018)); bunch.quaternion.setFromUnitVectors(new V3(0,0,1), dir); parent.add(bunch);
  limbBetween(parent, s0, elbow, .044, .064, mSleeve, 16);
}
function attachHand(model, armGroup, hand, pos, rx, wristLocal, elbow, watch, horizontal){
  let holder = hand;
  if (horizontal){ holder = new THREE.Group(); holder.add(hand); holder.rotation.x = -HP; }
  holder.position.copy(pos); if (!horizontal) holder.rotation.x = rx; else hand.rotation.y = rx;
  armGroup.add(holder); model.updateMatrixWorld(true);
  const w = hand.localToWorld(wristLocal.clone());
  armGroup.worldToLocal(w);
  forearm(armGroup, w, elbow, watch);
}
function muzzleFlash(parent, pos, size){
  const fm = new THREE.MeshBasicMaterial({ map:flashTex, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide });
  const f = new THREE.Group();
  for (let i=0;i<3;i++){ const p = new THREE.Mesh(new THREE.PlaneGeometry(.26*size,.26*size), fm); p.rotation.y = i*Math.PI/3; f.add(p); }
  f.add(new THREE.Mesh(new THREE.PlaneGeometry(.18*size,.18*size), fm));
  f.position.copy(pos); f.visible = false; parent.add(f); return f;
}
function marker(parent, x, y, z){ const o = new THREE.Object3D(); o.position.set(x,y,z); parent.add(o); return o; }
function pistolGrip(m, u, mat){ prof(m, [[u+.025,-.02],[u+.045,-.02],[u+.028,-.07],['q',u+.015,-.125,u-.01,-.13],[u-.035,-.125],['q',u-.02,-.07,u+.005,-.02]], .034, mat); }
function triggerGroup(m, z){ vp(m, Bx(.01,.006,.075), mBlack, 0,-.052,z); vp(m, Bx(.01,.024,.006), mBlack, 0,-.042,z-.036); vp(m, Bx(.005,.022,.006), mMetal, 0,-.036,z+.004, .25); }

function buildRifle(){
  const m = new THREE.Group(), L = new THREE.Group(), R = new THREE.Group(); m.add(L); m.add(R);
  prof(m, [[-.135,.022],[.17,.022],[.17,.071],[-.115,.071],[-.135,.058]], .058, mBlack);
  prof(m, [[-.13,-.028],[.15,-.028],[.155,-.01],[.155,.022],[-.135,.022],[-.135,-.004]], .054, mBlack);
  vp(m, Bx(.026,.012,.29), mBlack, 0,.083,-.015);
  for (let i=0;i<11;i++) vp(m, Bx(.0272,.003,.004), mDark, 0,.0885,-.15+i*.026);
  vp(m, Bx(.003,.022,.055), mDark, .03,.047,-.02);
  vp(m, Cy(.009,.009,.03,10), mBlack, .034,.055,.07, HP);
  vp(m, Bx(.05,.012,.03), mBlack, 0,.068,.15); vp(m, Bx(.012,.012,.02), mMetal, .03,.068,.15);
  triggerGroup(m, .03); pistolGrip(m, -.06, mPoly);
  prof(m, [[.17,-.002],[.47,-.002],[.48,.012],[.48,.072],[.17,.074]], .066, mTan);
  for (const u of [.22,.29,.36,.43]){ vp(m, Bx(.0675,.012,.045), mDark, 0,.038,-u); }
  vp(m, Bx(.026,.009,.3), mBlack, 0,.08,-.325);
  zc(m, .0115, .0105, .48, .62, .036, mBarrel);
  zc(m, .017, .017, .615, .68, .036, mBlack); vp(m, Bx(.036,.006,.01), mDark, 0,.036,-.64); vp(m, Bx(.036,.006,.01), mDark, 0,.036,-.66);
  zc(m, .016, .016, -.33, -.13, .038, mBlack);
  prof(m, [[-.21,.07],[-.36,.077],[-.375,.066],[-.375,-.07],[-.34,-.075],['q',-.29,-.03,-.21,.02]], .046, mTan);
  vp(m, Bx(.048,.15,.014), mDark, 0,.003,.378);
  vp(m, Bx(.044,.016,.08), mBlack, 0,.096,-.04); vp(m, Bx(.044,.02,.03), mBlack, 0,.104,-.005);
  vp(m, Bx(.054,.008,.07), mBlack, 0,.156,-.045); for (const sx of [-.0235,.0235]) vp(m, Bx(.007,.052,.07), mBlack, sx,.128,-.045);
  vp(m, new THREE.PlaneGeometry(.04,.046), mGlass, 0,.128,-.06); vp(m, new THREE.PlaneGeometry(.026,.026), retMat, 0,.128,-.058);
  const mag = new THREE.Group(); mag.position.set(0,-.028,-.075); m.add(mag);
  prof(mag, [[-.03,0],[.03,0],['q',.04,-.09,.07,-.165],[.012,-.18],['q',-.008,-.09,-.03,0]], .042, mPoly);
  vp(m, Cy(.017,.015,.085,14), mBlack, 0,-.04,-.38);
  attachHand(m, R, gripHand(.019, 1, true), new V3(0,-.075,.06), -.32, new V3(.03,-.05,.045), new V3(.16,-.42,.5), false);
  attachHand(m, L, gripHand(.016, -1, false), new V3(0,-.045,-.38), .12, new V3(-.028,-.05,.04), new V3(-.24,-.36,-.06), true);
  return { model:m, left:L, right:R, mag, scale:.78, sightY:.128, adsZ:-.3, hip:new V3(.165,-.165,-.38), sprint:new V3(.1,-.21,-.34),
    muzzle:marker(m,0,.036,-.7), eject:marker(m,.035,.047,-.02), flash:muzzleFlash(m,new V3(0,.036,-.72),1), magTarget:new V3(.0,-.06,.3) };
}
function buildSMG(){
  const m = new THREE.Group(), L = new THREE.Group(), R = new THREE.Group(); m.add(L); m.add(R);
  prof(m, [[-.12,-.022],[.19,-.022],[.2,-.005],[.2,.064],[-.11,.064],[-.12,.05]], .05, mBlack);
  vp(m, Bx(.0515,.004,.24), mDark, 0,.03,-.04);
  vp(m, Bx(.024,.01,.26), mBlack, 0,.07,-.04);
  zc(m, .021, .021, .2, .29, .03, mBlack); for (let i=0;i<3;i++) vp(m, Bx(.0425,.008,.012), mDark, 0,.03,-(.22+i*.024));
  zc(m, .024, .024, .29, .47, .03, mBlack); zc(m, .02, .024, .47, .48, .03, mBlack);
  const mag = new THREE.Group(); mag.position.set(0,-.022,-.1); m.add(mag);
  prof(mag, [[-.022,0],[.022,0],[.026,-.17],[-.018,-.17]], .034, mBlack); vp(mag, Bx(.038,.012,.05), mPoly, 0,-.174,-.004);
  triggerGroup(m, .03); pistolGrip(m, -.06, mPoly);
  zc(m, .006, .006, -.36, -.11, .045, mMetal); zc(m, .006, .006, -.36, -.11, -.002, mMetal); vp(m, Bx(.045,.085,.012), mBlack, 0,.02,.365);
  prof(m, [[.11,-.022],[.19,-.022],[.135,-.085],[.115,-.08]], .03, mPoly);
  vp(m, Bx(.03,.012,.05), mBlack, 0,.08,-.02);
  zc(m, .016, .016, -.005, .045, .1, mBlackDS, 0, 20, true);
  vp(m, new THREE.CircleGeometry(.0145,20), mGlass, 0,.1,-.035); vp(m, new THREE.PlaneGeometry(.012,.012), dotMat, 0,.1,-.033);
  attachHand(m, R, gripHand(.019, 1, true), new V3(0,-.075,.06), -.32, new V3(.03,-.05,.045), new V3(.16,-.42,.48), false);
  attachHand(m, L, gripHand(.015, -1, false), new V3(0,-.05,-.155), .55, new V3(-.028,-.05,.04), new V3(-.24,-.36,.06), true);
  return { model:m, left:L, right:R, mag, scale:.8, sightY:.1, adsZ:-.27, hip:new V3(.15,-.155,-.33), sprint:new V3(.09,-.2,-.31),
    muzzle:marker(m,0,.03,-.49), eject:marker(m,.03,.04,-.03), flash:muzzleFlash(m,new V3(0,.03,-.5),.6), magTarget:new V3(0,-.05,.26) };
}
function buildShotgun(){
  const m = new THREE.Group(), R = new THREE.Group(); m.add(R);
  prof(m, [[-.115,-.032],[.15,-.032],[.15,.046],[-.09,.05],[-.115,.035]], .052, mBlack);
  vp(m, Bx(.003,.025,.07), mDark, .0265,.015,-.03); vp(m, Bx(.03,.004,.08), mDark, 0,-.033,-.05);
  zc(m, .015, .015, .15, .66, .026, mBarrel); vp(m, Bx(.008,.006,.5), mBlack, 0,.044,-.41);
  vp(m, new THREE.SphereGeometry(.0035,8,6), mBrass, 0,.049,-.655);
  zc(m, .014, .014, .15, .58, -.013, mBlack); zc(m, .016, .016, .58, .6, -.013, mBlack);
  const pump = new THREE.Group(); pump.position.set(0,.006,-.38); m.add(pump);
  const fore = zc(pump, .031, .031, -.09, .09, 0, mWood); fore.scale.set(1,1,1.15);
  for (const u of [-.06,-.035,-.01,.015,.04,.065]) zc(pump, .0315, .0315, u, u+.006, 0, mDark).scale.set(1,1,1.15);
  prof(m, [[-.11,.04],[-.43,.012],[-.445,0],[-.445,-.1],[-.4,-.11],['q',-.25,-.07,-.14,-.12],[-.115,-.14],[-.08,-.135],['q',-.07,-.08,-.1,-.032],[-.11,-.032]], .046, mWood);
  vp(m, Bx(.048,.115,.016), mDark, 0,-.045,.448);
  triggerGroup(m, .05);
  const L = new THREE.Group(); pump.add(L);
  attachHand(m, R, gripHand(.02, 1, true), new V3(0,-.085,.1), -.45, new V3(.03,-.05,.045), new V3(.16,-.44,.52), false);
  attachHand(m, L, gripHand(.031, -1, false), new V3(0,0,0), 0, new V3(-.043,-.06,-.012), new V3(-.24,-.36,.16), true, true);
  return { model:m, left:L, right:R, pump, scale:.78, sightY:.047, adsZ:-.36, hip:new V3(.17,-.16,-.4), sprint:new V3(.1,-.21,-.36),
    muzzle:marker(m,0,.026,-.68), eject:marker(m,.03,.015,-.03), flash:muzzleFlash(m,new V3(0,.026,-.7),1.6), port:new V3(0,-.075,.32) };
}
function buildSniper(){
  const m = new THREE.Group(), L = new THREE.Group(), R = new THREE.Group(); m.add(L); m.add(R);
  prof(m, [[-.49,.04],[-.48,.05],[-.21,.05],[-.17,.012],[.36,.012],[.37,-.035],[-.05,-.04],[-.07,-.045],[-.09,-.14],['q',-.11,-.155,-.13,-.14],[-.115,-.05],[-.3,-.055],[-.46,-.1],[-.49,-.1]], .05, mTan);
  vp(m, Bx(.05,.15,.015), mDark, 0,-.025,.495); vp(m, Bx(.03,.03,.14), mBlack, 0,.065,.33);
  zc(m, .023, .023, -.12, .2, .035, mBlack);
  const bolt = new THREE.Group(); bolt.position.set(0,.035,.06); m.add(bolt);
  vp(bolt, Cy(.0065,.0065,.065,10), mMetal, .035,0,0, 0,0,HP); vp(bolt, new THREE.SphereGeometry(.013,12,10), mBlack, .07,-.004,.004);
  zc(m, .016, .012, .2, .84, .035, mBarrel); zc(m, .022, .022, .84, .92, .035, mBlack);
  for (const u of [.86,.885,.905]) vp(m, Bx(.046,.008,.012), mDark, 0,.035,-u);
  const mag = new THREE.Group(); mag.position.set(0,-.03,-.08); m.add(mag); vp(mag, Bx(.04,.07,.09), mBlack, 0,-.035,0);
  triggerGroup(m, .05);
  for (const u of [-.02,.12]) vp(m, Bx(.032,.035,.018), mBlack, 0,.07,-u);
  zc(m, .017, .017, -.12, .2, .088, mBlack); zc(m, .018, .03, .2, .29, .088, mBlack); zc(m, .025, .018, -.2, -.12, .088, mBlack);
  vp(m, Cy(.012,.012,.03,12), mBlack, 0,.115,.04); vp(m, Cy(.012,.012,.03,12), mBlack, .03,.088,.04, 0,0,HP);
  vp(m, new THREE.CircleGeometry(.027,24), mLens, 0,.088,-.2905, 0,Math.PI,0); vp(m, new THREE.CircleGeometry(.022,24), mLens, 0,.088,.2005);
  zc(m, .005, .005, .33, .55, -.012, mBlack, .012); zc(m, .005, .005, .33, .55, -.012, mBlack, -.012);
  attachHand(m, R, gripHand(.02, 1, true), new V3(0,-.09,.11), -.25, new V3(.03,-.05,.045), new V3(.16,-.44,.52), false);
  attachHand(m, L, gripHand(.03, -1, false), new V3(0,-.028,-.25), 0, new V3(-.042,-.06,-.012), new V3(-.25,-.36,-.02), true, true);
  return { model:m, left:L, right:R, mag, bolt, scale:.74, sightY:.088, adsZ:-.22, hip:new V3(.17,-.16,-.43), sprint:new V3(.1,-.21,-.38),
    muzzle:marker(m,0,.035,-.93), eject:marker(m,.03,.035,-.06), flash:muzzleFlash(m,new V3(0,.035,-.95),1.5), magTarget:new V3(0,-.03,.3), boltReach:new V3(.07,.12,-.05) };
}

const WEAPONS = [
  { id:'rifle', name:'KR-7 Carbine', mag:30, rof:.095, auto:true, dmg:34, head:110, legs:26, range:55, pellets:1, hip:.011, ads:.0018, move:.018, bloom:.0024, kickV:.011, kickH:.004, vkick:.05, reload:1.9, adsFov:52, build:buildRifle },
  { id:'smg', name:'VX-9 SMG', mag:32, rof:.066, auto:true, dmg:25, head:70, legs:20, range:22, pellets:1, hip:.008, ads:.0035, move:.01, bloom:.0015, kickV:.0065, kickH:.006, vkick:.032, reload:1.6, adsFov:58, build:buildSMG },
  { id:'shotgun', name:'M-12 Pump', mag:6, rof:.85, auto:false, dmg:22, head:32, legs:18, range:12, pellets:9, hip:.055, ads:.042, move:.008, bloom:0, kickV:.045, kickH:.012, vkick:.11, shellReload:.55, adsFov:62, action:'pump', actionTime:.55, build:buildShotgun },
  { id:'sniper', name:'LR-50 Marksman', mag:5, rof:1.25, auto:false, dmg:150, head:300, legs:110, range:300, pellets:1, hip:.06, ads:0, move:.03, bloom:0, kickV:.05, kickH:.006, vkick:.12, reload:2.6, adsFov:16, scope:true, action:'bolt', actionTime:1.05, build:buildSniper },
  { id:'pistol', name:'P-11 Sidearm', mag:12, rof:.13, auto:false, dmg:40, head:100, legs:30, range:28, pellets:1, hip:.012, ads:.003, move:.008, bloom:.003, kickV:.018, kickH:.006, vkick:.06, reload:1.25, adsFov:62, build:buildPistol },
  { id:'launcher', name:'RPG-X Launcher', mag:1, rof:.9, auto:false, dmg:0, head:0, legs:0, range:100, pellets:1, hip:.02, ads:.004, move:.02, bloom:0, kickV:.07, kickH:.012, vkick:.16, reload:2.3, adsFov:55, rocket:true, build:buildLauncher }
];
for (const W of WEAPONS){
  W.ammo = W.mag;
  const V = W.build(); W.vm = V;
  V.model.scale.setScalar(V.scale); V.model.visible = false; swapG.add(V.model);
  V.ads = new V3(0, -V.sightY*V.scale, V.adsZ);
  V.inspect = new V3(.06, -.12, -.36);
  if (V.mag) V.magRest = V.mag.position.clone();
  V.leftRest = V.left.position.clone(); V.rightRest = V.right.position.clone();
  if (V.pump) V.pumpRest = V.pump.position.z;
}
let cw = 0, startW = 0;
const cur = () => WEAPONS[cw];
WEAPONS[0].vm.model.visible = true;
gunScene.add(new THREE.AmbientLight(0xfff1e0, .2));
const fill = new THREE.DirectionalLight(0xffe6c8, .3); fill.position.set(.3,.6,1.5); gunScene.add(fill);
const rim = new THREE.DirectionalLight(0xffa860, .5); rim.position.set(-2,.6,-2); gunScene.add(rim);
const gunBase = WEAPONS[0].vm.hip.clone();
function reloadKeys(t){ return [[0,[0,0,0]],[.16,[t.x,t.y,t.z]],[.3,[t.x,t.y-.012,t.z]],[.46,[t.x+.05,-.45,t.z-.03]],[.6,[t.x+.05,-.45,t.z-.03]],[.76,[t.x,t.y-.01,t.z+.01]],[.86,[t.x,t.y,t.z]],[1,[0,0,0]]]; }
const MKEYS = [[0,0],[.3,0],[.44,-.42],[.6,-.42],[.76,0],[1,0]];

/* ---------- Sidearm ---------- */
/* ---------- RPG-X launcher ---------- */
function buildLauncher(){
  const m = new THREE.Group(), L = new THREE.Group(), R = new THREE.Group(); m.add(L); m.add(R);
  const olive = MS(0x4a5235, .7, .2);
  zc(m, .048, .048, -.32, .5, .03, olive, 0, 20);                       // tube
  zc(m, .056, .05, .44, .52, .03, mBlack, 0, 20);                         // front cone
  zc(m, .058, .052, -.36, -.28, .03, mBlack, 0, 20);                      // rear bell
  vp(m, Bx(.03,.09,.04), mPoly, 0,-.05,.03, .25);                         // rear grip
  vp(m, Bx(.03,.08,.04), mPoly, 0,-.045,-.2, .15);                        // fore grip
  vp(m, Bx(.04,.035,.09), mBlack, .055,.06,-.02);                         // side sight box
  vp(m, Bx(.006,.012,.006), mBlack, .055,.085,-.06);
  const rocketHead = new THREE.Mesh(new THREE.ConeGeometry(.04, .14, 14), MS(0x6b6f5a, .6, .3)); rocketHead.rotation.x = -HP; rocketHead.position.set(0,.03,-.57); m.add(rocketHead);
  attachHand(m, R, gripHand(.017, 1, true), new V3(0,-.085,.03), -.25, new V3(.03,-.05,.045), new V3(.17,-.42,.42), false);
  attachHand(m, L, gripHand(.017, -1, false), new V3(0,-.08,-.2), -.15, new V3(-.03,-.05,.045), new V3(-.24,-.36,.06), true);
  return { model:m, left:L, right:R, mag:rocketHead, scale:1, sightY:.09, adsZ:-.38, hip:new V3(.2,-.17,-.5), sprint:new V3(.12,-.24,-.42),
    muzzle:marker(m,0,.03,-.62), eject:marker(m,0,.03,.4), flash:muzzleFlash(m,new V3(0,.03,-.64),.9), magTarget:new V3(0,-.05,-.1), rocketHead, gripZ:.2, laserZ:.2 };
}
const rockets = [];
const rocketMat = MS(0x6b6f5a, .6, .3);
function fireRocket(W){
  const dir = new V3(0, 0, -1).applyQuaternion(camera.quaternion);
  const start = camera.localToWorld(new V3(.16, -.08, -.7));
  const g = new THREE.Group(); g.add(new THREE.Mesh(Cy(.035, .035, .3, 10), rocketMat).rotateX(HP));
  const nose = new THREE.Mesh(new THREE.ConeGeometry(.035, .1, 10), rocketMat); nose.rotation.x = -HP; nose.position.z = -.2; g.add(nose);
  const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map:flashTex, color:0xffa040, blending:THREE.AdditiveBlending, transparent:true, depthWrite:false })); fl.position.z = .2; fl.scale.setScalar(.5); g.add(fl);
  g.position.copy(start); g.lookAt(start.clone().add(dir)); g.rotateY(Math.PI); scene.add(g);
  rockets.push({ g, pos:start.clone(), vel:dir.multiplyScalar(48), life:3, smokeT:0 });
  sfx.boom(30); shake = Math.max(shake, .02); rumble(.9, .6, 160);
}
function rocketBlast(r, at, directHit){
  scene.remove(r.g);
  if (directHit && directHit.alive) damageEnemy(directHit, directHit.custom === 'gunship' ? 650 : directHit.type === 'boss' ? 420 : 250, false, r.vel.clone().normalize(), 'nade');
  explode(at.clone().setY(Math.max(.2, at.y)), { R:7 });
}
function updateRockets(dt){
  for (let i=rockets.length-1;i>=0;i--){
    const r = rockets[i], next = r.pos.clone().addScaledVector(r.vel, dt), seg = next.clone().sub(r.pos), len = seg.length(), dir = seg.clone().normalize();
    r.life -= dt; r.smokeT -= dt;
    if (r.smokeT <= 0){ r.smokeT = .03; spawnPuff(r.pos.clone(), 0x8a8478, .12, .6, .2); }
    let hitAt = null, hitE = null;
    const hh = humanHit(r.pos, dir); if (hh && hh.t <= len){ hitAt = hh.point; hitE = hh.enemy; }
    if (!hitAt){ ray.set(r.pos, dir); ray.far = len; const hs = ray.intersectObjects(solids.concat(customBossParts()), false); if (hs.length){ hitAt = hs[0].point; const en = hs[0].object.userData && hs[0].object.userData.enemy; if (en && en.alive) hitE = en; } }
    if (!hitAt && next.y < .05) hitAt = next.clone().setY(.05);
    if (hitAt || r.life <= 0){ rocketBlast(r, hitAt || next, hitE); rockets.splice(i,1); continue; }
    r.pos.copy(next); r.g.position.copy(next);
  }
}

