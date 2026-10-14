/* ---------- Loop ---------- */
const clock = new THREE.Clock();
function loop(){
  requestAnimationFrame(loop);
  const rawDt = clock.getDelta(), dt = Math.min(0.05, rawDt);
  watchFps(rawDt);
  updateMapFx(dt, performance.now()/1000);
  pollPad(dt); coopLobbyTick();
  if (state === 'play'){ T += dt; update(dt); updateEffects(dt); tpEye.copy(camera.position); opBodyUpdate(dt); if (predator) predatorCam(); }
  if (state === 'play' || state === 'paused') tpFrame(dt);
  else if (state === 'menu'){
    const a = performance.now()*0.00005;
    camera.position.set(Math.sin(a)*34, 12, Math.cos(a)*34); camera.lookAt(0, 1, 0);
  }
  sky.position.copy(camera.position);
  updateAtmos(performance.now()/1000);
  shadowTick++; if (shadowTick % 2 === 0) renderer.shadowMap.needsUpdate = true;   // shadows every other frame
  if (composer && QUALITY[cfg.quality].post){
    gunPass.enabled = (state === 'play' || state === 'paused') && tpBlend < .3;
    gradePass.uniforms.time.value = performance.now()/1000;
    gradePass.uniforms.vign.value = .9 + adsF*.5;
    gradePass.uniforms.rage.value = rageFx;
    gradePass.uniforms.hurt.value = state === 'play' ? Math.max(0, 1 - P.hp/60) * .6 + vigPulse*.4 : 0;
    composer.render(dt);
  } else {
    renderer.clear();
    renderer.render(scene, camera);
    if ((state === 'play' || state === 'paused') && tpBlend < .3){ renderer.clearDepth(); renderer.render(gunScene, gunCam); }
  }
}
loop();
})();
