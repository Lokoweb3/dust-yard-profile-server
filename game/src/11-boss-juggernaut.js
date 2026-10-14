/* ---------- Boss: Degen Juggernaut ---------- */
let bossPending = false;
function makeMinigun(e){
  if (!e.rifle) return;
  while (e.rifle.children.length) e.rifle.remove(e.rifle.children[0]);
  const mat = MS(0x2a2c30,.45,.7), add = (geo, x, y, z, rx=0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x,y,z); m.rotation.x = rx; m.castShadow = true; e.rifle.add(m); return m; };
  add(Bx(.14,.14,.3), 0,0,.02);
  add(Bx(.12,.16,.14), .1,-.1,.02);
  add(Bx(.04,.1,.04), 0,.1,-.06);
  const spin = new THREE.Group(); spin.position.set(0,0,.17); e.rifle.add(spin);
  for (let i=0;i<6;i++){ const a = i/6*Math.PI*2, b = new THREE.Mesh(Cy(.013,.013,.6,8), mat); b.rotation.x = HP; b.position.set(Math.cos(a)*.035, Math.sin(a)*.035, .3); spin.add(b); }
  const ring = new THREE.Mesh(Cy(.055,.055,.03,14), mat); ring.rotation.x = HP; ring.position.z = .5; spin.add(ring);
  e.spinner = spin; e.muzzle = new THREE.Object3D(); e.muzzle.position.set(0,0,.82); e.rifle.add(e.muzzle);
}
function spawnBoss(){
  const kind = bossKindFor(wave);
  if (CUSTOM_BOSS.includes(kind)) return spawnCustomBoss(kind);
  const e = spawnEnemy('boss');
  e.maxHp = e.hp; e.mg = 'idle'; e.mgT = 2; e.spinV = 0;
  if (kind === 'shogun'){ makeShogun(e); banner('Ninja Shogun'); toast('The Ninja Shogun has arrived. He vanishes and strikes up close: keep moving and listen for the swoosh.', 5000); sfx.horn(); return e; }
  makeMinigun(e);
  banner('Degen Juggernaut'); toast('A Degen Juggernaut has entered the yard. Aim for the skull.', 4000); sfx.horn();
  return e;
}
function bossShoot(e, dist){
  const muzzle = e.muzzle.getWorldPosition(new V3());
  let chance = .42 - dist*.006 - (P.moving ? .14 : 0) - (P.sprinting ? .08 : 0) - (P.slideT > 0 ? .15 : 0) - (P.crouch ? .05 : 0);
  if (smokes.length && smokeBlocks(muzzle, camera.position)) chance = .03;
  const hit = Math.random() < Math.max(.04, chance), target = new V3(P.pos.x, P.pos.y + camH - .35, P.pos.z);
  if (!hit){ target.x += (Math.random()-.5)*2.6; target.y += (Math.random()-.3)*1.4; target.z += (Math.random()-.5)*2.6; target.sub(muzzle).multiplyScalar(1.5).add(muzzle); }
  spawnTracer(muzzle, target, 0xffb060); if (Math.random() < .5) spawnFlashSprite(muzzle);
  sfx.minigun(dist); e.recoil = .03; e.lastFire = T; e.shotN = (e.shotN || 0) + 1;
  if (hit) damagePlayer(6 + Math.min(6, wave*.4), e.pos);
}
function updateBoss(e, dt, dist){
  // state machine: idle -> spin up -> fire -> cool down
  e.mgT -= dt;
  if (e.mg === 'idle' && e.sees && e.mgT <= 0){ e.mg = 'spin'; e.mgT = .9; sfx.spinUp(); }
  else if (e.mg === 'spin' && e.mgT <= 0){ e.mg = 'fire'; e.mgT = 3.2; e.fireT = 0; }
  else if (e.mg === 'fire'){
    e.fireT -= dt;
    if (e.fireT <= 0 && e.sees){ bossShoot(e, dist); e.fireT = .065; }
    if (e.mgT <= 0){ e.mg = 'cool'; e.mgT = 2.4; }
  } else if (e.mg === 'cool' && e.mgT <= 0){ e.mg = 'idle'; e.mgT = .3; }
  e.spinV += ((e.mg === 'spin' || e.mg === 'fire' ? 40 : 0) - e.spinV) * Math.min(1, dt*3);
  if (e.spinner) e.spinner.rotation.z += e.spinV*dt;
}

