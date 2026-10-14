/* ---------- Main update ---------- */
function updatePlayer(dt){
  if (predator){ P.vel.set(0, 0, 0); return; }
  if (P.down || P.dead){ P.vel.x = P.vel.z = 0; P.crouch = true; P.moving = false; P.sprinting = false; return; }
  let fx = 0, fz = 0;
  if (keys.KeyW || keys.ArrowUp) fz += 1; if (keys.KeyS || keys.ArrowDown) fz -= 1;
  if (keys.KeyD || keys.ArrowRight) fx += 1; if (keys.KeyA || keys.ArrowLeft) fx -= 1;
  if (touch.moveId !== null){ fx += touch.mx; fz -= touch.my; }
  fx += padMove.x; fz -= padMove.y;
  if (fz <= 0.5) padSprint = false;
  if (keys.KeyZ){ P.yaw += 2.2*dt; mdx -= 4; } if (keys.KeyX){ P.yaw -= 2.2*dt; mdx += 4; }
  const len = Math.hypot(fx, fz); if (len > 1){ fx/=len; fz/=len; }
  const wantSprint = (keys.ShiftLeft || keys.ShiftRight || padSprint || (touch.moveId !== null && touch.my < -0.92)) && fz > 0.5;
  if (wantSprint && P.crouch && P.slideT <= 0){ P.crouch = false; $('tCrouch').classList.remove('on'); }
  const sprint = wantSprint && !ads && !firing && !P.crouch;
  // sprinting builds up over half a second instead of snapping to full speed
  sprintRamp = sprint ? Math.min(1, sprintRamp + dt*2.2) : Math.max(0, sprintRamp - dt*4);
  const runSpd = 5.6 + (9*(spPower() === 'wolf' ? 1.15 : 1) - 5.6)*(sprint ? .55 + .45*smooth(sprintRamp) : 0);
  const speed = (ads ? 3.2 : (P.crouch ? 2.8 : runSpd))*(perk('quick') ? 1.06 : 1)*(inRiver(P.pos) ? .62 : 1)*(sprint && howlBoost() ? 1.15 : 1)*(rage.t > 0 ? 1.25 : 1);
  const s = Math.sin(P.yaw), c = Math.cos(P.yaw), s0 = s, c0 = c, fz0 = Math.max(.6, fz);
  const jumpKey = keys.Space || touch.jump || padJumpHeld || touch.jumpHeld; touch.jump = false;
  // jump buffering (a press just before landing still counts) and coyote time (just after walking off an edge)
  const jumpPress = jumpKey && !P.jumpHeld;
  if (jumpPress) jumpBuf = .14; P.jumpHeld = jumpKey; jumpBuf = Math.max(0, jumpBuf - dt);
  coyoteT = P.onGround ? .12 : Math.max(0, coyoteT - dt);
  const jump = jumpBuf > 0 && coyoteT > 0;
  if (mantle){
    // climbing up onto low cover: a quick lift then a step forward
    mantle.t += dt/mantle.dur; const k = Math.min(1, mantle.t), up = smooth(Math.min(1, k/.65)), fw = smooth(Math.max(0, (k - .35)/.65));
    P.pos.set(mantle.from.x + (mantle.to.x - mantle.from.x)*fw, mantle.from.y + (mantle.to.y - mantle.from.y)*up, mantle.from.z + (mantle.to.z - mantle.from.z)*fw);
    P.vel.set(0, 0, 0); P.onGround = false; P.moving = false; P.sprinting = false; landDip = Math.max(landDip, Math.sin(k*Math.PI)*.06);
    if (k >= 1){ mantle = null; P.onGround = true; P.vel.set(-s0*fz0*3, 0, -c0*fz0*3); }
    return;
  }
  if (P.slideT > 0){
    P.slideT -= dt;
    const sp = 3 + 10.5*Math.max(0, P.slideT/SLIDE);
    P.vel.x = P.slideDir.x*sp; P.vel.z = P.slideDir.z*sp;
    if (jump){ jumpBuf = 0; coyoteT = 0; P.slideT = 0; P.crouch = false; P.vel.y = rage.t > 0 ? 9.5 : 7.2; P.onGround = false; $('tCrouch').classList.remove('on'); }
  } else {
    const tx = (-s*fz + c*fx)*speed, tz = (-c*fz - s*fx)*speed;
    // quick to start and stop on the ground, heavier when changing direction at a sprint, little control in the air
    const turning = tx*P.vel.x + tz*P.vel.z < 0, stopping = Math.hypot(tx, tz) < .1;
    const acc = P.onGround ? (stopping ? 18 : turning ? 9 : 13) : jet.on ? 5 : 2.6;
    P.vel.x += (tx - P.vel.x)*Math.min(1, acc*dt); P.vel.z += (tz - P.vel.z)*Math.min(1, acc*dt);
    specialMove();   // Shadow Dash / Rolling Thunder take over your movement
    if (jump){
      jumpBuf = 0;
      const ledge = !P.crouch && fz > .3 && findMantle(s, c);
      if (ledge){ mantle = { t:0, dur:.32 + (ledge.y - P.pos.y)*.12, from:P.pos.clone(), to:ledge }; sfx.step(true); return; }
      if (P.crouch){ P.crouch = false; $('tCrouch').classList.remove('on'); }
      else { P.vel.y = rage.t > 0 ? 9.5 : 7.2; P.onGround = false; coyoteT = 0; }
    }
    const gear = backGear();
    // Jetpack: hold Jump in the air to fly until the fuel runs out; it refills on the ground
    jet.on = gear === 'jetpack' && gearActive('jetpack') && jumpKey && !P.onGround && coyoteT <= 0 && !P.ladder && rage.t <= 0;
    if (jet.on) P.vel.y = Math.min(5.5, P.vel.y + 30*dt);
    if (P.onGround) jet.boost = true;
    // Air tanks: one extra boost per jump, up and in the direction you're moving
    if (gear === 'tanks' && gearActive('tanks') && jumpPress && !P.onGround && coyoteT <= 0 && jet.boost && rage.t <= 0){
      jet.boost = false; P.vel.y = 7; const l = Math.hypot(tx, tz) || 1, k = Math.min(1, l); P.vel.x += tx/l*4*k; P.vel.z += tz/l*4*k;
      for (let i=0;i<6;i++) spawnPuff(new V3(P.pos.x + (Math.random() - .5)*.6, P.pos.y + .3, P.pos.z + (Math.random() - .5)*.6), 0xdfe8f0, .35, .5, -.6);
      blast(.12, 2600, .22, false); landDip = .04;
    }
  }
  // ladders
  if (!P.ladder){
    for (const L of ladders){
      const bx = L.x + L.nx*.4, bz = L.z + L.nz*.4;
      if (Math.hypot(P.pos.x - bx, P.pos.z - bz) < .7 && P.pos.y < L.top - .05 && fz > .3 && (-s*-L.nx + -c*-L.nz) > .2){ P.ladder = L; P.slideT = 0; break; }
    }
  }
  if (P.ladder){
    const L = P.ladder, dir = fz > .3 ? 1 : fz < -.3 ? -1 : 0;
    P.vel.set(0,0,0); P.pos.x = L.x + L.nx*.42; P.pos.z = L.z + L.nz*.42; P.pos.y += dir*3.4*dt;
    if (dir && Math.floor(P.pos.y/.65) !== P.ladderStep){ P.ladderStep = Math.floor(P.pos.y/.65); tone(220 + Math.random()*60, .04, .05, 'square'); }
    if (P.pos.y >= L.top){ P.pos.y = L.top + .02; P.pos.x = L.x - L.nx*.9; P.pos.z = L.z - L.nz*.9; P.ladder = null; P.onGround = true; }
    else if (P.pos.y <= 0 && dir < 0){ P.pos.y = 0; P.ladder = null; P.onGround = true; }
    else if (jump){ P.ladder = null; P.vel.set(L.nx*3, 2, L.nz*3); }
    P.moving = false; P.sprinting = false; strafeF *= .8;
    if (P.ladder) return;
  }
  P.vel.y -= 22*dt;
  const vyBefore = P.vel.y, wasGround = P.onGround;
  if (pounce){ updatePounce(dt); return; }
  P.pos.addScaledVector(P.vel, dt);
  const gy = groundAt(P.pos.x, P.pos.z, P.pos.y);
  if (P.pos.y <= gy){
    P.pos.y = gy; P.vel.y = 0;
    if (!wasGround && vyBefore < -3) landDip = Math.min(.14, -vyBefore*0.014);
    if (!wasGround && vyBefore < -12.5 && rage.t <= 0) damagePlayer((-vyBefore - 12.5)*9, P.pos.clone().add(new V3(0,0,1)));
    if (!wasGround && vyBefore < -4 && rage.t > 0) shockwave(P.pos, 6.5, 120, 2);   // Apex Form: landing slams the ground
    P.onGround = true;
  } else if (P.pos.y > gy + .06) P.onGround = false;
  collide(P.pos, P.r, P.pos.y);
  P.moving = Math.hypot(P.vel.x, P.vel.z) > 1;
  P.sprinting = sprint && P.moving && P.slideT <= 0;
  strafeF += (((P.vel.x*c - P.vel.z*s)/9) - strafeF) * Math.min(1, dt*8);
}
// low cover just ahead (waist to chest high) that you can climb onto instead of jumping into it
function findMantle(s, c){
  const fx = -s, fz = -c, y = P.pos.y;
  for (const d of [.55, .8]){
    const px = P.pos.x + fx*d, pz = P.pos.z + fz*d;
    for (const b of boxes){
      const t = b.top || 1.2; if (t < y + .55 || t > y + 1.65) continue;
      if (px < b.minX - .05 || px > b.maxX + .05 || pz < b.minZ - .05 || pz > b.maxZ + .05) continue;
      // stand a little way onto the top, and only if nothing taller is in the way there
      const to = new V3(P.pos.x + fx*(d + .45), t, P.pos.z + fz*(d + .45));
      if (groundAt(to.x, to.z, t + .1) > t + .05) return null;
      if (boxes.some(o => o !== b && (o.top || 1.2) > t + .35 && to.x > o.minX - .35 && to.x < o.maxX + .35 && to.z > o.minZ - .35 && to.z < o.maxZ + .35)) return null;
      return to;
    }
  }
  return null;
}
function updateJet(dt){
  updateGearAb(dt);
  if (!jet.on) return;
  jet.fx -= dt;
  if (jet.fx <= 0){ jet.fx = .05;
    const b = new V3(P.pos.x + Math.sin(P.yaw)*.25, P.pos.y + .55, P.pos.z + Math.cos(P.yaw)*.25);
    spawnPuff(b.clone().add(new V3(0, -.3, 0)), 0xff9a40, .22, .25, -2); spawnPuff(b.clone().add(new V3(0, -.6, 0)), 0x8a8580, .35, .8, -1);
    blast(.07, 700, .08, false); }
  shake = Math.max(shake, .004);
}
function update(dt){
  updatePlayer(dt); updateJet(dt); updateSpecial(dt); updateNvg(dt);
  if (!P.down && !P.dead && T - P.lastHit > (perk('regen2') ? 2 : perk('regen') ? 3 : 4)*(spPower() === 'panda' ? .6 : 1) && P.hp < maxHP()) P.hp = Math.min(maxHP(), P.hp + (perk('regen') ? 45 : 35)*(spPower() === 'panda' ? 1.5 : 1)*dt);
  const mv = P.moving && P.onGround && P.slideT <= 0;
  bobT += dt * (mv ? (P.sprinting ? 13 : (P.crouch ? 6 : 9)) : 0);
  const targetH = P.slideT > 0 ? 0.95 : (P.crouch ? 1.12 : 1.62);
  camH += (targetH - camH) * Math.min(1, dt*12);
  landDip *= Math.exp(-dt*9);
  const bobAmp = mv ? (P.sprinting ? 1.35 : P.crouch ? .6 : 1)*(1-adsF*.7) : 0;
  const bobY = Math.sin(bobT)*0.034*bobAmp, bobX = Math.cos(bobT*.5)*0.028*bobAmp;
  camera.position.set(P.pos.x + Math.cos(P.yaw)*bobX, P.pos.y + camH - landDip + bobY, P.pos.z - Math.sin(P.yaw)*bobX);
  adsF += ((ads ? 1 : 0) - adsF) * Math.min(1, dt*14);
  sprintF += ((P.sprinting ? 1 : 0) - sprintF) * Math.min(1, dt*10);
  slideF += ((P.slideT > 0 ? 1 : 0) - slideF) * Math.min(1, dt*10);
  const WW = cur();
  scoped = !!WW.scope && adsF > .82 && swapT === 0 && !reloading;
  const fov = cfg.fov - adsF*(cfg.fov - (WW.scope ? (adsF > .82 ? WW.adsFov : 55) : WW.adsFov)) + sprintF*(4 + 5*sprintRamp) + slideF*8;
  const steady = scoped && (keys.ShiftLeft || keys.ShiftRight) && breath > 0;
  breath = steady ? Math.max(0, breath - dt) : Math.min(4, breath + dt*.8);
  steadyF += ((steady ? 1 : 0) - steadyF) * Math.min(1, dt*6);
  if (Math.abs(camera.fov - fov) > 0.01){ camera.fov = fov; camera.updateProjectionMatrix(); }
  if (!firing && recoilAcc > 0){ const r = Math.min(recoilAcc, 0.3*dt); P.pitch -= r; recoilAcc -= r; }
  shake *= Math.exp(-dt*22);
  rollZ += ((-strafeF*0.02 + slideF*0.07 + (mv ? Math.sin(bobT*.5)*0.004 : 0)) - rollZ) * Math.min(1, dt*8);
  const sAmp = scoped ? (1 - steadyF*.85) * (P.moving ? 2 : 1) : 0;
  const sx = (Math.sin(T*.9)*.0035 + Math.sin(T*2.1)*.0012)*sAmp, sy = (Math.sin(T*1.3)*.0025 + Math.cos(T*.7)*.0015)*sAmp;
  camera.rotation.set(P.pitch + (Math.random()-.5)*shake + sy - sprintF*.025 - landDip*.35, P.yaw + (Math.random()-.5)*shake + sx, rollZ);
  scene.updateMatrixWorld();

  updateWeapon(dt); updateRage(dt);
  updateCombat(dt);
  updateStreaks(dt);
  updateBarrels(dt);
  updateDrops(dt);
  if (!hubMode && state === 'play') updateSquad(dt);
  updateAmbience(dt);
  infernoTex.offset.y -= dt*.35; auroraTex.offset.x += dt*.06; auroraTex.offset.y = Math.sin(T*.3)*.1; camoMats.aurora.emissiveIntensity = .75 + Math.sin(T*1.7)*.2; camoMats.inferno.emissiveIntensity = 1 + Math.sin(T*3)*.25; camoMats.diamond.emissiveIntensity = .2 + Math.max(0, Math.sin(T*2.3))*.35;
  const stepIdx = Math.floor(bobT/Math.PI);
  if (mv && stepIdx !== lastStep && !(spPower() === 'fox' && !P.sprinting)){ if (inRiver(P.pos)) blast(.09, 1800, .22, false); else { stepSide = -stepSide; sfx.step(P.sprinting, stepSide); } }
  lastStep = stepIdx;

  for (const e of enemies){ if (coop && coop.started) coopEnemy(e, dt); else updateEnemy(e, dt); }
  separateEnemies();
  enemies = enemies.filter(e => !e.gone);
  if (hubMode) updateHub(dt); else { if (predator) updatePredator(dt); updateCrates(dt); if (tut) updateTut(dt); else if (gameMode === 'tdm') updateTDM(dt); else if (!(coop && coop.guest && coop.started)) updateWaves(dt); coopTick(dt); updatePet(dt); petCombat(dt); updateRockets(dt); updateShogunStars(dt); updateBossFx(dt); }

  // viewmodel: position, bob, sway, inertia, recoil, reload, actions
  const W = cur(), V = W.vm;
  const ie = inspectT > 0 ? smooth((2.6 - inspectT)/.45) * smooth(inspectT/.45) : 0;
  const target = ads ? V.ads : (P.sprinting ? V.sprint : V.hip);
  gunBase.lerp(target, Math.min(1, dt*(ads ? 16 : 12)));
  const sw = 1 - adsF*0.85;
  sway.x += (Math.max(-.045, Math.min(.045, -mdx*0.0007))*sw - sway.x) * Math.min(1, dt*9);
  sway.y += (Math.max(-.035, Math.min(.035, mdy*0.0007))*sw - sway.y) * Math.min(1, dt*9);
  mdx = 0; mdy = 0;
  const bAmt = mv ? sw : 0, pumpB = 1 + sprintF*.8;
  const bx = Math.cos(bobT*0.5)*0.013*bAmt*pumpB, by = -Math.abs(Math.sin(bobT*0.5))*0.014*bAmt*pumpB;
  const brth = (Math.sin(T*1.3)*0.0015 + (P.moving ? 0 : Math.sin(T*.7)*0.001))*(1 - adsF*.7);
  relEnv += ((reloading ? 1 : 0) - relEnv) * Math.min(1, dt*8);
  const renv = W.shellReload ? relEnv*.6 : relEnv;
  kick *= Math.exp(-dt*15); kickR *= Math.exp(-dt*12);
  const air = Math.max(-.03, Math.min(.03, P.vel.y*0.004));
  gun.position.set(
    gunBase.x + bx + sway.x - renv*.02 - ie*.09,
    gunBase.y + by + sway.y + brth - renv*.03 - air - landDip*.35 - slideF*.02 + ie*.03,
    gunBase.z + kick + renv*.02 + ie*.04);
  gun.rotation.set(
    kick*1.6 + renv*.3 + sprintF*.15 + sway.y*2 + air*1.5 - ie*.15,
    sprintF*.6 + sway.x*2.2 + renv*.2 + ie*1.0 + kickR*.5,
    -renv*.55 - sprintF*.3 - strafeF*.07*sw + slideF*.25 + kickR + ie*.45);
  let low = swapT > 0 ? (swapT < .22 ? smooth(swapT/.22) : 1 - smooth((swapT - .22)/.26)) : 0;
  if (throwT > 0) low = Math.max(low, Math.sin(Math.min(1, (.45 - throwT)/.45)*Math.PI)*.9);
  if (meleeT > 0) low = Math.max(low, Math.sin(Math.min(1, (.5 - meleeT)/.5)*Math.PI));
  if (aimNade) low = Math.max(low, .5);
  swapG.position.set(0, -low*.28, low*.05); swapG.rotation.set(-low*.8, 0, low*.3);
  // left hand / magazine reload
  const rp = reloading && !W.shellReload ? 1 - reloadT/W.c.reload : 0;
  if (V.mag){
    const la = keyframe(reloadKeys(V.magTarget), rp);
    V.left.position.set(V.leftRest.x + la[0], V.leftRest.y + la[1], V.leftRest.z + la[2]);
    V.mag.position.y = V.magRest.y + keyframe(MKEYS, rp);
  }
  if (V.pump){
    let pz = 0;
    if (actionT > 0){ const p = 1 - actionT/W.actionTime; pz = Math.sin(Math.min(1, p*1.15)*Math.PI)*.085; }
    V.pump.position.z = V.pumpRest + pz;
    const cyc = reloading ? 1 - Math.max(0, reloadT)/W.shellReload : 0;
    const ins = reloading ? Math.sin(Math.min(1, Math.max(0, cyc))*Math.PI) : 0;
    V.left.position.set(V.port.x*relEnv, V.port.y*relEnv + ins*.035, (V.port.z - pz)*relEnv - ins*.02);
  }
  if (V.bolt){
    let lift = 0, back = 0, reach = 0;
    if (actionT > 0){
      const p = 1 - actionT/W.actionTime;
      reach = smooth(p/.14) * smooth((1 - p)/.14);
      lift = smooth((p - .1)/.15) * (1 - smooth((p - .8)/.12));
      back = smooth((p - .28)/.18) * (1 - smooth((p - .56)/.2));
    }
    V.bolt.rotation.z = lift*1.15; V.bolt.position.z = .06 + back*.08;
    V.right.position.set(V.rightRest.x + V.boltReach.x*reach, V.rightRest.y + V.boltReach.y*reach, V.rightRest.z + V.boltReach.z*reach + back*.08*reach);
    gun.rotation.z += reach*.12; gun.rotation.x += reach*.05;
  }
  gun.visible = !scoped && !hubMode && !predator && rage.t <= 0 && !katanaOn(); if (V.rocketHead) V.rocketHead.visible = W.ammo > 0;
  if (V.slide){ slideKick *= Math.exp(-dt*28); V.slide.position.z = W.ammo === 0 ? .035 : slideKick*.035; }
  flashT -= dt; V.flash.visible = flashT > 0;
  muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt*40);
  mWatchGlow.emissiveIntensity = reloading ? 1.4 : .8;
  gl2.position.copy(sunDir).applyQuaternion(_iq.copy(camera.quaternion).invert()).multiplyScalar(5);
  updateHUD(dt);
}

