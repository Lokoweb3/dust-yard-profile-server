/* ---------- Pointer lock & input ---------- */
let locked = false, everLocked = false, fallback = false;
function enableFallback(){
  if (everLocked || fallback) return;
  fallback = true;
  toast('Mouse capture is blocked here. Move the mouse to aim, or turn with Z and X. Esc pauses.', 6000);
}
function requestLock(){
  if (isTouch || fallback) return;
  try { const r = cv.requestPointerLock(); if (r && r.catch) r.catch(() => enableFallback()); } catch(e){ enableFallback(); }
}
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === cv;
  if (locked) everLocked = true;
  else if (state === 'play' && !fallback && !uiOpen) pause();
});
document.addEventListener('pointerlockerror', () => enableFallback());
addEventListener('mousemove', e => {
  if (state !== 'play' || isTouch || (!locked && !fallback)) return;
  const s = SENS * cfg.sens * (camera.fov/cfg.fov) * (ads ? cfg.adsSens : 1);
  P.yaw -= e.movementX * s; P.pitch -= e.movementY * s; clampPitch();
  mdx += e.movementX; mdy += e.movementY;
});
addEventListener('mousedown', e => {
  if (state !== 'play' || isTouch || uiOpen) return;
  if (!locked && !fallback){ requestLock(); return; }
  if (hubMode){ if (e.button === 0 && !$('hubPrompt').hidden) openMarket(); return; }
  if (e.button === 0){ firing = true; fireQueued = true; }
  if (e.button === 2) ads = true;
});
addEventListener('wheel', e => { if (state !== 'play') return; const now = performance.now(); if (now - (window.__wh||0) < 180) return; window.__wh = now; cycleWeapon(e.deltaY > 0 ? 1 : -1); }, { passive:true });
addEventListener('mouseup', e => { if (e.button === 0) firing = false; if (e.button === 2) ads = false; });
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('keydown', e => {
  const tag = e.target && e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA'){
    if (e.code === 'Escape'){ e.preventDefault(); closeUI(); }
    else if (e.target.id === 'chatInput' && (e.code === 'Enter' || e.code === 'NumpadEnter')){ e.preventDefault(); sendChat(); }
    return;
  }
  if (uiOpen){ if (e.code === 'Escape'){ e.preventDefault(); closeUI(); } return; }
  if (hubMode && state === 'play'){
    if (e.code === 'Enter' || e.code === 'NumpadEnter'){ e.preventDefault(); openChat(); return; }
    if (e.code === 'KeyQ'){ e.preventDefault(); openPhone(); return; }
    if (/^Digit[1-4]$/.test(e.code)){ doEmote(+e.code.slice(5) - 1); return; }
    if (e.code === 'KeyE' || e.code === 'KeyM'){ if (e.code === 'KeyM' || !$('hubPrompt').hidden) openMarket(); }
  }
  keys[e.code] = true; if (padActive && state === 'play') setPadActive(false);
  if (state === 'play'){
    if (e.code === 'Digit0' || e.code === 'Numpad0' || e.code === 'KeyR') reload();
    if (/^Digit[1-6]$/.test(e.code)) selectWeapon(+e.code.slice(5) - 1);
    if (!e.repeat && e.code === 'KeyG') startNade('frag');
    if (!e.repeat && e.code === 'KeyQ') startNade('tac');
    if (e.code === 'KeyT') tacType = tacType === 'smoke' ? 'flash' : 'smoke';
    if (!e.repeat && e.code === 'KeyV') startMelee();
    const si = { Digit7:0, Digit8:1, Digit9:2 }[e.code]; if (si !== undefined && STREAKS[si]) useStreak(STREAKS[si].k);
    if (e.code === 'KeyB' && !e.repeat) toggleView();
    if (e.code === 'KeyF' && !e.repeat && !useGear() && !reloading && swapT === 0 && actionT <= 0) inspectT = 2.6;
    if (e.code === 'KeyC' && !e.repeat) crouchPress();
    if (e.code === 'Escape' || e.code === 'KeyP') pause();
    if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
  } else if (state === 'paused' && e.code === 'KeyP') resume();
});
addEventListener('keydown', e => { if (e.code === 'Tab' && tdm && state === 'play'){ e.preventDefault(); tabHeld = true; showBoard(true); } }, true);
addEventListener('keyup', e => { if (e.code === 'Tab'){ tabHeld = false; showBoard(false); } keys[e.code] = false; if (e.code === 'KeyG' || e.code === 'KeyQ') releaseNade(); });
addEventListener('blur', () => { if (state === 'play' && !uiOpen) pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') pause(); });

/* Touch */
const knob = $('stickKnob'), base = $('stickBase');
function onTouchStart(e){
  if (state !== 'play') return; e.preventDefault();
  for (const t of e.changedTouches){
    if (t.clientX < innerWidth*0.45 && touch.moveId === null){
      touch.moveId = t.identifier; touch.sx = t.clientX; touch.sy = t.clientY; touch.mx = touch.my = 0;
      base.style.left = t.clientX + 'px'; base.style.top = t.clientY + 'px'; base.style.opacity = '1'; knob.style.transform = '';
    } else if (touch.lookId === null){ touch.lookId = t.identifier; touch.lx = t.clientX; touch.ly = t.clientY; }
  }
}
function onTouchMove(e){
  if (state !== 'play') return; e.preventDefault();
  for (const t of e.changedTouches){
    if (t.identifier === touch.moveId){
      let dx = t.clientX - touch.sx, dy = t.clientY - touch.sy; const d = Math.hypot(dx,dy), R = 55;
      if (d > R){ dx = dx/d*R; dy = dy/d*R; }
      touch.mx = dx/R; touch.my = dy/R; knob.style.transform = `translate(${dx}px,${dy}px)`;
    } else if (t.identifier === touch.lookId){
      const k = 0.0065 * cfg.sens * (camera.fov/cfg.fov) * (ads ? cfg.adsSens : 1);
      P.yaw -= (t.clientX - touch.lx)*k; P.pitch -= (t.clientY - touch.ly)*k; clampPitch();
      mdx += (t.clientX - touch.lx)*.6; mdy += (t.clientY - touch.ly)*.6;
      touch.lx = t.clientX; touch.ly = t.clientY;
    }
  }
}
function onTouchEnd(e){
  for (const t of e.changedTouches){
    if (t.identifier === touch.moveId){ touch.moveId = null; touch.mx = touch.my = 0; base.style.opacity = '0'; }
    if (t.identifier === touch.lookId) touch.lookId = null;
  }
}
$('lookPad').addEventListener('touchstart', onTouchStart, { passive:false });
addEventListener('touchmove', onTouchMove, { passive:false });
addEventListener('touchend', onTouchEnd); addEventListener('touchcancel', onTouchEnd);
function tbtn(id, down, up){
  const el = $(id);
  el.addEventListener('touchstart', e => { e.preventDefault(); if (state !== 'play') return; down(e); }, { passive:false });
  if (up) el.addEventListener('touchend', e => { e.preventDefault(); up(e); }, { passive:false });
}
tbtn('tFire', e => { firing = true; fireQueued = true; const t = e.changedTouches[0]; if (touch.lookId === null){ touch.lookId = t.identifier; touch.lx = t.clientX; touch.ly = t.clientY; } }, () => { firing = false; });
tbtn('tAim', () => { ads = !ads; $('tAim').classList.toggle('on', ads); });
tbtn('tReload', () => reload());
tbtn('tJump', () => { touch.jump = true; });
tbtn('tGear', () => { useGear(); });
gearAb.touch = $('tGear');
// the touch Jump button can be held too (jetpack)
$('tJump').addEventListener('pointerdown', () => { touch.jumpHeld = true; });
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) $('tJump').addEventListener(ev, () => { touch.jumpHeld = false; });
tbtn('tCrouch', () => crouchPress());
tbtn('tSwap', () => cycleWeapon(1));
tbtn('tNade', () => startNade('frag'), () => releaseNade());
tbtn('tTac', () => startNade('tac'), () => releaseNade());
tbtn('tKnife', () => startMelee());
tbtn('tStreak', () => useBestStreak());
tbtn('tChat', () => openChat());
tbtn('tTrade', () => openMarket());
tbtn('tPhone', () => openPhone());
$('eqTac').addEventListener('touchstart', e => { e.preventDefault(); tacType = tacType === 'smoke' ? 'flash' : 'smoke'; }, { passive:false });
$('eqTac').addEventListener('mousedown', e => { e.stopPropagation(); tacType = tacType === 'smoke' ? 'flash' : 'smoke'; });
tbtn('tPause', () => pause());

$('deployBtn').addEventListener('click', () => { if (gameMode === 'coop') openCoop(); else if (!store.get('dy-tut')) startTutorial(); else startGame(); });
$('classBtn').addEventListener('click', openClass);
$('classPauseBtn').addEventListener('click', openClass);
$('tutBtn').addEventListener('click', startTutorial);
$('classBack').addEventListener('click', () => show(classReturn));
$('opBtn').addEventListener('click', openOp); $('coopBack').addEventListener('click', () => show('menu'));
['touchstart','touchend','touchcancel'].forEach(ev => $('tRevive').addEventListener(ev, e => { e.preventDefault(); if (coop) coop.touchRev = ev === 'touchstart'; })); $('opPauseBtn').addEventListener('click', openOp); $('opBack').addEventListener('click', () => show(opReturn));
$('gsMenuBtn').addEventListener('click', () => openGunsmith('menu'));
$('gsPauseBtn').addEventListener('click', () => openGunsmith('pause'));
$('setMenuBtn').addEventListener('click', () => openSettings('menu'));
$('lbPost').addEventListener('click', postScore);
$('hubBtn').addEventListener('click', () => startHub());
$('mkPost').addEventListener('click', postListing);
$('phClose').addEventListener('click', () => closeUI());
loadDaily(); renderDailyBox();
$('acctChip').addEventListener('click', () => { if (signedIn()) openAccount(); else openLogin(); });
setTimeout(autoReconnect, 1200); setTimeout(autoReconnect, 3500); setTimeout(() => { if (state === 'menu'){ $('acctChip').hidden = false; renderAcctChip(); } }, 500);
$('acctMenuBtn').addEventListener('click', () => openAccount());
$('acctPauseBtn').addEventListener('click', () => openAccount());
$('cpClaim').addEventListener('click', () => openAccount('intro'));
$('cpLater').addEventListener('click', closePrompt);
$('cpNever').addEventListener('click', () => { acct.promptsOff = true; saveAcct(); closePrompt(); toast('Got it. You can still claim from Account in the menu.', 3000); });
initGuest();
$('phoneMenuBtn').addEventListener('click', () => openPhone());
$('phonePauseBtn').addEventListener('click', () => openPhone());
$('phoneChip').addEventListener('mousedown', e => { e.stopPropagation(); openPhone(); });
$('phoneChip').addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); openPhone(); }, { passive:false });
$('mkTabs').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { mkView = b.dataset.v; $('mkMsg').textContent = ''; drawMarket(); }));
$('mkFilters').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { mkFilter = b.dataset.f; drawMarket(); }));
$('mkSearch').addEventListener('input', () => { mkSearch = $('mkSearch').value.trim().slice(0,40); drawMarket(); });
$('mkBack').addEventListener('click', () => { mkView = 'browse'; drawMarket(); }); $('mkRemove').addEventListener('click', removeListing); $('mkClose').addEventListener('click', () => closeUI());
$('chatSend').addEventListener('click', sendChat);
[...$('modePick').children].forEach(b => { b.classList.toggle('on', b.dataset.g === gameMode); b.addEventListener('click', () => { gameMode = b.dataset.g; store.set('dustyard-mode', gameMode); [...$('modePick').children].forEach(x => x.classList.toggle('on', x === b)); }); });
[...$('mapPick').children].forEach(b => {
  b.classList.toggle('on', b.dataset.m === selectedMap);
  b.addEventListener('click', () => { selectedMap = b.dataset.m; store.set('dustyard-map', selectedMap); preloadHeads(selectedMap); [...$('mapPick').children].forEach(x => x.classList.toggle('on', x === b)); refreshBoard(); });
});
$('setPauseBtn').addEventListener('click', () => openSettings('pause'));
$('setBack').addEventListener('click', () => show(settingsReturn === 'pause' ? 'pausePanel' : 'menu'));
$('gsBack').addEventListener('click', () => show(gsReturn === 'pause' ? 'pausePanel' : 'menu'));
[...$('loadout').children].forEach(b => b.addEventListener('click', () => {
  startW = +b.dataset.w; [...$('loadout').children].forEach(x => x.classList.toggle('on', x === b));
}));
[...$('slots').children].forEach((el,i) => {
  el.addEventListener('mousedown', e => { e.stopPropagation(); selectWeapon(i); });
  el.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); selectWeapon(i); }, { passive:false });
});
$('againBtn').addEventListener('click', () => { if (gameMode === 'coop'){ state = 'menu'; openCoop(); } else startGame(); });
$('shareBtn').addEventListener('click', shareScore);
$('resumeBtn').addEventListener('click', () => resume());
$('quitBtn').addEventListener('click', toMenu);
$('menuBtn').addEventListener('click', toMenu);
$('bestLine').textContent = bestText();

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = gunCam.aspect = innerWidth/innerHeight;
  camera.updateProjectionMatrix(); gunCam.updateProjectionMatrix();
  if (composer){ composer.setSize(innerWidth, innerHeight); postSized(renderer.getPixelRatio()); }
});


/* ---------- Gamepad (PS5 DualSense / any standard controller) ---------- */
// Standard mapping: 0 Cross, 1 Circle, 2 Square, 3 Triangle, 4 L1, 5 R1, 6 L2, 7 R2, 9 Options, 10 L3, 11 R3
let padJumpHeld = false, padTriT = 0, padTriUsed = false;
let padPrev = [], padActive = false, padSprint = false, padMove = { x:0, y:0 }, padIndex = null;
function dz(v, d=.14){ const a = Math.abs(v); if (a < d) return 0; return Math.sign(v) * Math.pow((a-d)/(1-d), 1.6); }
function rumble(strong, weak, ms){
  if (!padActive || padIndex === null) return;
  try {
    const gp = navigator.getGamepads()[padIndex];
    if (gp && gp.vibrationActuator) gp.vibrationActuator.playEffect('dual-rumble', { duration:ms, strongMagnitude:strong, weakMagnitude:weak });
  } catch(e){}
}
function setPadActive(on){
  if (padActive === on) return;
  padActive = on; hud.hint = null;
  $('padLine').textContent = on ? 'Controller ready. Press X to deploy.' : padHelp();
}
// Browsers only share controllers with secure pages (https:// or localhost), and only after a button press
function padHelp(){
  if (!('getGamepads' in navigator) || !window.isSecureContext)
    return location.protocol === 'http:' ? 'Controller blocked: browsers only allow controllers on https:// pages or http://localhost. Open the game from an https:// address (for example your Netlify link).' : 'This browser is not sharing controllers with the game. Try Chrome or Edge, and open the game from an https:// address.';
  return 'Using a controller? Connect it, then press any button on it.';
}
setTimeout(() => { if (!padActive) $('padLine').textContent = padHelp(); }, 0);
if (location.protocol === 'file:') $('fileNote').hidden = false;
addEventListener('gamepadconnected', e => { padIndex = e.gamepad.index; toast('Controller connected. Press X to play.'); $('padLine').textContent = 'Controller ready. Press X to deploy.'; });
addEventListener('gamepaddisconnected', () => { padIndex = null; setPadActive(false); if (state === 'play') pause(); toast('Controller disconnected'); });
/* ---------- Controller menu navigation ---------- */
let padNavT = 0, padNavDir = '', padFocusEl = null, padClicking = false;
function padPanel(){
  if (!$('osk').hidden) return $('osk');
  if (!$('ageGate').hidden) return $('ageGate');
  if (!$('claimPrompt').hidden) return $('claimPrompt');
  if (!$('loginPanel').hidden) return $('loginPanel');
  if (uiOpen && !$('marketPanel').hidden) return $('marketPanel');
  if (uiOpen && !$('phone').hidden) return $('phone');
  if ($('overlay').hidden) return null;
  for (const id of ['coopPanel','opPanel','classPanel','account','settings','gunsmith','pausePanel','overPanel','menu']) if (!$(id).hidden) return $(id);
  return null;
}
function padItems(panel){
  return [...panel.querySelectorAll('button, input[type=range], input[type=checkbox], input[type=text], input[type=password], input:not([type]), textarea')]
    .filter(el => !el.disabled && el.offsetParent !== null && !el.closest('[hidden]'));
}
function setPadFocus(el){
  if (padFocusEl) padFocusEl.classList.remove('padFocus');
  padFocusEl = el;
  if (el){ el.classList.add('padFocus'); if (!/^(INPUT|TEXTAREA)$/.test(el.tagName) || el.type === 'range' || el.type === 'checkbox') el.focus({ preventScroll:true }); el.scrollIntoView({ block:'nearest', inline:'nearest' }); }
}
function padDefault(panel, items){
  const pref = { pausePanel:'resumeBtn', overPanel:'againBtn', menu:'deployBtn', gunsmith:'gsBack', settings:'setBack', marketPanel:'mkClose', phone:'phClose', claimPrompt:'cpClaim' }[panel.id];
  return (pref && items.find(el => el.id === pref)) || items[0];
}
function padMove2(dir, items){
  const cur = padFocusEl.getBoundingClientRect(), cx = cur.left + cur.width/2, cy = cur.top + cur.height/2;
  let best = null, bs = Infinity;
  for (const el of items){
    if (el === padFocusEl) continue;
    const r = el.getBoundingClientRect(), x = r.left + r.width/2, y = r.top + r.height/2, dx = x - cx, dy = y - cy;
    let main, side;
    if (dir === 'down'){ if (dy <= 4) continue; main = dy; side = Math.abs(dx); }
    else if (dir === 'up'){ if (dy >= -4) continue; main = -dy; side = Math.abs(dx); }
    else if (dir === 'right'){ if (dx <= 4) continue; main = dx; side = Math.abs(dy); }
    else { if (dx >= -4) continue; main = -dx; side = Math.abs(dy); }
    const sc = main + side*2.2;
    if (sc < bs){ bs = sc; best = el; }
  }
  if (!best && (dir === 'down' || dir === 'up')){ const i = items.indexOf(padFocusEl); best = items[(i + (dir === 'down' ? 1 : -1) + items.length) % items.length]; }
  if (best) setPadFocus(best);
}
function padMenu(pressed, lx, ly, dt){
  const panel = padPanel();
  if (!panel){ setPadFocus(null); return; }
  const items = padItems(panel);
  if (!items.length) return;
  const typing = document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) && document.activeElement.type !== 'range' && document.activeElement.type !== 'checkbox';
  if ((!padFocusEl || !items.includes(padFocusEl)) && !typing) setPadFocus(padDefault(panel, items));
  // direction from the D-pad or the left stick, with hold-to-repeat
  const dir = pressed(12) ? 'up' : pressed(13) ? 'down' : pressed(14) ? 'left' : pressed(15) ? 'right' : '';
  const held = ly < -.5 ? 'up' : ly > .5 ? 'down' : lx < -.5 ? 'left' : lx > .5 ? 'right' : '';
  let go = typing ? '' : dir;
  if (!go && held && !typing){ if (held !== padNavDir){ padNavDir = held; padNavT = .35; go = held; } else { padNavT -= dt; if (padNavT <= 0){ padNavT = .14; go = held; } } }
  if (!held) padNavDir = '';
  if (go){
    const el = padFocusEl;
    if (el.type === 'range' && (go === 'left' || go === 'right')){
      const st = +el.step || 1; el.value = Math.min(+el.max, Math.max(+el.min, +el.value + (go === 'right' ? st : -st))); el.dispatchEvent(new Event('input', { bubbles:true }));
    } else padMove2(go, items);
  }
  if (pressed(0) && padFocusEl && ((padFocusEl.tagName === 'INPUT' && !['range','checkbox'].includes(padFocusEl.type)) || (padFocusEl.tagName === 'TEXTAREA' && !padFocusEl.readOnly))){ openOSK(padFocusEl); return; }
  if (pressed(0)){ const el = padFocusEl; if (el && el.type !== 'range'){ padClicking = true; try { el.click(); } finally { padClicking = false; } } }
  if (pressed(1)){
    if (panel.id === 'osk') closeOSK();
    else if (panel.id === 'claimPrompt') closePrompt();
    else if (panel.id === 'loginPanel') closeLogin();
    else if (panel.id === 'classPanel') show(classReturn);
    else if (panel.id === 'opPanel') show(opReturn);
    else if (panel.id === 'coopPanel') show('menu');
    else if (panel.id === 'account'){ if (acctStep === 'home' || acctStep === 'done') show(acctReturn); else { acctStep = 'home'; acctMsg = ''; renderAccount(); } }
    else if (panel.id === 'gunsmith') $('gsBack').click();
    else if (panel.id === 'settings') $('setBack').click();
    else if (panel.id === 'pausePanel') resume(true);
    else if (panel.id === 'overPanel') toMenu();
    else if (panel.id === 'marketPanel' || panel.id === 'phone'){ if (panel.id === 'phone' && phoneApp !== 'home'){ phoneApp = 'home'; renderPhone(); } else closeUI(true); }
  }
  if (pressed(9)){ if (panel.id === 'pausePanel') resume(true); else if (panel.id === 'menu') startGame(true); }
}

function pollPad(dt){
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  let gp = null;
  for (const p of pads) if (p && p.connected){ gp = p; break; }
  padMove.x = padMove.y = 0;
  if (!gp){ padJumpHeld = false; return; }
  padIndex = gp.index;
  const held = i => !!gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.35);
  const now = gp.buttons.map((_, i) => held(i));
  const pressed = i => now[i] && !padPrev[i];
  const released = i => !now[i] && padPrev[i];
  const lx = dz(gp.axes[0] || 0), ly = dz(gp.axes[1] || 0), rx = dz(gp.axes[2] || 0), ry = dz(gp.axes[3] || 0);
  if (now.some(Boolean) || lx || ly || rx || ry) setPadActive(true);

  if (state !== 'play' || uiOpen) padMenu(pressed, lx, ly, dt);
  else if (state === 'play'){
    padMove.x = lx; padMove.y = ly;
    let k = cfg.padSens * (camera.fov/cfg.fov) * (ads ? cfg.adsSens : 1);
    if (cfg.aimAssist){ const a = aimAssist(); if (a){ k *= .5; if (ads && !padAdsWas){ P.yaw += a.dy*.45; P.pitch += a.dp*.45; clampPitch(); } } }
    padAdsWas = ads;
    P.yaw -= rx * 3.4 * k * dt; P.pitch -= ry * 2.5 * k * dt; clampPitch();
    mdx += rx * 14; mdy += ry * 10;
    if (pressed(7)){ firing = true; fireQueued = true; }  if (released(7)) firing = false;   // R2 shoot
    if (hubMode){ if (pressed(3)) openPhone(); }                     // Triangle: phone in the market
    else {                                                              // Triangle: tap to swap weapon, hold to use back gear
      if (now[3]){ padTriT += dt; if (padTriT > .4 && !padTriUsed){ padTriUsed = true; if (!useGear()) cycleWeapon(1); } }
      if (released(3)){ if (!padTriUsed) cycleWeapon(1); padTriT = 0; padTriUsed = false; }
    }
    if (pressed(8) && !reloading) inspectT = 2.6;                       // Create button inspect
    if (hubMode){ if (pressed(12)) doEmote(0); if (pressed(15)) doEmote(1); if (pressed(13)) doEmote(2); if (pressed(14)) doEmote(3); }
    else { [[12, 0], [15, 1], [13, 2]].forEach(([b, i]) => { if (pressed(b) && STREAKS[i]) useStreak(STREAKS[i].k); }); }
    if (pressed(6)) ads = true;     if (released(6)) ads = false;      // L2 aim
    if (pressed(0)) touch.jump = true;                                  // Cross jump (hold it in the air to fly with the jetpack)
    padJumpHeld = held(0);
    if (pressed(1)) crouchPress();                                      // Circle crouch + slide
    if (pressed(11)) startMelee();                                      // R3 melee
    if (pressed(5)) startNade('frag'); if (released(5)) releaseNade();  // R1 frag
    if (pressed(4)) startNade('tac'); if (released(4)) releaseNade();   // L1 tactical
    if (pressed(14)) tacType = tacType === 'smoke' ? 'flash' : 'smoke'; // D-pad left
    if (coop) coop.padRev = held(2);
    if (pressed(2)){ if (hubMode){ if (!$('hubPrompt').hidden) openMarket(); } else reload(); } // Square reload / open market
    if (pressed(10)) padSprint = true;                                  // L3 sprint
    if (pressed(9)) pause();                                            // Options pause
    if (pressed(17)) toggleView();                                      // touchpad camera
  }
  padPrev = now;
}


