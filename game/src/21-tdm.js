/* ---------- Team Deathmatch (you and your companion vs a raider squad) ---------- */
const TDM_LIMIT = 7500, TDM_TIME = 600, TDM_SQUAD = 6;
let tdm = null, tabHeld = false;
function tdmStart(){
  tdm = { us:0, them:0, t:TDM_TIME, deaths:0, kills:0, petKills:0, spawnT:.5, over:false, protT:3, streakBest:0 };
  document.body.classList.add('tdm'); $('tdmBar').hidden = false; tdmHud();
  banner('Team Deathmatch'); toast(`First team to ${TDM_LIMIT.toLocaleString()} points wins. 100 per kill. Hold Tab for the scoreboard.`, 5000);
}
function tdmPickType(){ const r = Math.random(); return r < .7 ? 'grunt' : r < .9 ? 'rusher' : 'sniper'; }
function updateTDM(dt){
  if (!tdm || tdm.over) return;
  tdm.t -= dt; if (tdm.protT > 0) tdm.protT -= dt;
  const alive = enemies.filter(e => e.alive).length;
  tdm.spawnT -= dt;
  if (alive < TDM_SQUAD && tdm.spawnT <= 0){ const e = spawnEnemy(tdmPickType()); e.speed = 4 + Math.random()*.6; tdm.spawnT = alive < 3 ? .4 : 1.4; }
  // clear corpses so the squad keeps respawning
  for (let i=enemies.length-1;i>=0;i--){ const e = enemies[i]; if (!e.alive && e.dieT > 6){ scene.remove(e.g); if (e.glint) scene.remove(e.glint); if (e.callSpr) scene.remove(e.callSpr); enemies.splice(i,1); } }
  tdmHud();
  const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null, padBoard = !!(gp && gp.buttons[8] && gp.buttons[8].pressed);
  if (padBoard !== tdm.padBoard){ tdm.padBoard = padBoard; showBoard(padBoard || tabHeld); } else if (tabHeld && !$('scoreboard').hidden) showBoard(true);
  if (tdm.us >= TDM_LIMIT) tdmEnd(true); else if (tdm.them >= TDM_LIMIT) tdmEnd(false);
  else if (tdm.t <= 0) tdmEnd(tdm.us > tdm.them ? true : tdm.us < tdm.them ? false : null);
}
function tdmHud(){
  const m = Math.max(0, Math.ceil(tdm.t)), lead = tdm.us >= tdm.them;
  $('tdmUs').textContent = tdm.us.toLocaleString(); $('tdmThem').textContent = tdm.them.toLocaleString();
  $('tdmTime').textContent = `${Math.floor(m/60)}:${String(m%60).padStart(2,'0')}`;
  $('tdmUsBar').style.width = (tdm.us/TDM_LIMIT*100) + '%'; $('tdmThemBar').style.width = (tdm.them/TDM_LIMIT*100) + '%';
  $('tdmBar').classList.toggle('losing', !lead);
}
function tdmKill(src){
  if (!tdm || tdm.over) return;
  tdm.us += 100; if (src === 'pet') tdm.petKills++; else tdm.kills++;
  tdm.streakBest = Math.max(tdm.streakBest, streak);
  if (tdm.us === TDM_LIMIT - 1000) { toast('1,000 points to win', 2500); }
}
function tdmDeath(from){
  tdm.them += 100; tdm.deaths++;
  // respawn far from raiders, MW2 style: brief fade, full health, short spawn protection
  let best = spawnPts[0], bd = -1;
  for (const s of spawnPts){ let md = 1e9; for (const e of enemies) if (e.alive) md = Math.min(md, Math.hypot(e.pos.x - s[0], e.pos.z - s[1])); if (md > bd){ bd = md; best = s; } }
  P.pos.set(best[0], 0, best[1]); P.vel.set(0,0,0); P.hp = maxHP(); P.lastHit = -99; P.slideT = 0; P.ladder = null; P.onGround = true;
  let nx = 0, nz = 0, n = 0; for (const e of enemies) if (e.alive){ nx += e.pos.x; nz += e.pos.z; n++; }
  if (n) P.yaw = Math.atan2(-(nx/n - P.pos.x), -(nz/n - P.pos.z));
  WEAPONS.forEach(W => { W.ammo = W.c.mag; W.reserve = Math.max(W.reserve, W.res); });
  fragN = Math.max(fragN, perk('frag3') ? 3 : 2); tacN = Math.max(tacN, perk('tac3') ? 3 : 2);
  streak = 0; tdm.protT = 3; reloading = false;
  applyClass(); WEAPONS.forEach(W => applyAtt(W)); swapT = 0; setWeapon(startW);
  const d = $('deathFlash'); d.textContent = `Killed by ${from || 'Raider'} · respawning`; d.classList.remove('go'); void d.offsetWidth; d.classList.add('go');
  tdmHud(); if (tdm.them >= TDM_LIMIT) tdmEnd(false);
}
function tdmEnd(win){
  if (tdm.over) return; tdm.over = true;
  banner(win === true ? 'Victory' : win === false ? 'Defeat' : 'Draw'); win ? sfx.levelUp() : sfx.horn();
  if (win) giveXP(2500); else giveXP(1000);
  tdm.result = win; score = tdm.us; wave = Math.min(10, 1 + Math.floor(tdm.kills/8));
  setTimeout(() => { if (state === 'play' || state === 'paused') gameOver(); }, 2600);
}
function tdmStop(){ tdm = null; document.body.classList.remove('tdm'); $('tdmBar').hidden = true; $('scoreboard').hidden = true; }
function showBoard(on){
  const b = $('scoreboard'); if (!tdm || !on){ b.hidden = true; return; }
  const kd = (tdm.kills/Math.max(1, tdm.deaths)).toFixed(2);
  const rows = [[acctName(), tdm.kills, tdm.deaths, kd, tdm.kills*100, 'me']];
  if (pet && petCfg) rows.push([petCfg.name, tdm.petKills, 0, '-', tdm.petKills*100, '']);
  b.innerHTML = `<h3>Team Deathmatch <span>${$('tdmTime').textContent}</span></h3>
  <div class="sbTeam us"><b>Your team</b><em>${tdm.us.toLocaleString()}</em></div>
  <table><tr><th>Player</th><th>K</th><th>D</th><th>K/D</th><th>Score</th></tr>${rows.map(r => `<tr class="${r[5]}"><td>${escHTML(r[0])}</td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td><td>${r[4]}</td></tr>`).join('')}</table>
  <div class="sbTeam them"><b>Raider squad</b><em>${tdm.them.toLocaleString()}</em></div>
  <p>Best streak this match: ${Math.max(tdm.streakBest, streak)} · First to ${TDM_LIMIT.toLocaleString()}</p>`;
  b.hidden = false;
}
function escHTML(s){ return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])); }

function damageEnemy(e, dmg, head, dir, src, part, blast){
  if (!e.alive) return;
  if (!src && perk('stopping')) dmg *= 1.25;
  if ((!src || src === 'knife' || src === 'claw') && prideAura()) dmg *= 1.15;
  if (e.type === 'armored' && !head && src !== 'knife' && src !== 'nade' && src !== 'air') dmg *= .5;
  if (e.custom === 'gunship'){ if (src === 'knife' || src === 'claw' || src === 'stampede') dmg = 0; else if (src !== 'nade' && src !== 'air') dmg *= head ? .25 : .1; }
  else if (e.type === 'boss'){ if (src === 'knife') dmg = 120; else if (src === 'claw') dmg = Math.min(dmg, 200); else if (!head && src !== 'nade' && src !== 'air') dmg *= .4; }
  if (e.custom && e.actCode === 3 && e.custom === 'elephant') dmg *= 2;   // a dazed War Elephant takes double damage
  if (coop && coop.guest && e.remote) coopNoteHit(e, dmg);
  e.hp -= dmg; e.flash = 0.08; e.flinch = 0.18; e.sees = true; e.reaction = Math.min(e.reaction, 0.25);
  const killed = e.hp <= 0;
  if (!killed && dir && e.type !== 'boss' && !(e.y > 0) && dmg >= 38){
    const ape = spPower() === 'ape' && (src === 'knife' || src === 'claw' || dmg >= 60), kb = Math.min(ape ? 2.2 : .7, dmg*(ape ? .015 : .006)); e.pos.x += dir.x*kb; e.pos.z += dir.z*kb; collide(e.pos, .4);
    e.flinch = Math.max(e.flinch, .35); e.stagT = ape ? .9 : .45; e.reaction = Math.max(e.reaction, .4);
  }
  if (killed && dir){ e.killDir = new V3(dir.x, 0, dir.z).normalize(); }
  if (!killed){
    if (part === 'legs' && e.type !== 'boss'){ e.limpT = 3; e.stagT = Math.max(e.stagT || 0, .5); }
    if (head) e.headSnap = .35;
    if (!e.retreated && e.maxHp && e.hp < e.maxHp*.35 && (e.type === 'grunt' || e.type === 'armored') && !(e.y > 0)){
      const cp = coverPoint(e); if (cp){ e.retreated = true; e.retreatT = 3.5; e.coverPt = cp; callout(e, 'Taking fire!'); }
    }
  } else {
    e.deathType = src === 'nade' || src === 'air' || blast || dmg >= 120 ? 'blast' : head ? 'crumple' : Math.random() < .35 ? 'spin' : 'fall';
  }
  showHitmarker(killed, head);
  if (killed){
    e.alive = false; kills++; sfx.kill();
    e.fallDir = 1;
    if (head && e.helmetG) popHelmet(e, dir);
    if (e.model){
      e.fallSide = (Math.random()-.5)*.6; e.fallDir = Math.random() < .7 ? 1 : -1;
      if (e.deathType === 'blast'){ e.fallDir = -1; e.fallSide = (Math.random()-.5)*.9; } else if (e.deathType === 'crumple'){ e.fallDir = 1; e.fallSide = (Math.random()-.5)*.25; } else if (e.deathType === 'spin') e.fallSide = (Math.random() < .5 ? -1 : 1)*.8;
      const r = e.rifle; scene.attach(r);
      debris.push({ obj:r, vel:new V3(dir.x*1.5 + (Math.random()-.5), 1.5, dir.z*1.5 + (Math.random()-.5)), spin:new V3((Math.random()-.5)*6, 0, (Math.random()-.5)*6), life:2.9 });
    }
    if (src === 'claw' || rage.t > 0) rageKill();
    const LBL = { stampede:'Stampede kill', claw:'Claw kill', knife:'Knife kill', nade:'Grenade kill', air:'Airstrike kill', drone:'Drone kill', pet:'Companion kill' };
    const pts = Math.round((src === 'knife' || src === 'claw' ? 150 : src === 'nade' ? 120 : src === 'air' || src === 'drone' || src === 'pet' || src === 'stampede' ? 75 : head ? 150 : 100)*(e.scoreMul || 1)); if (head) headshots++;
    const tn = e.type === 'armored' ? 'Armored down' : e.type === 'sniper' ? 'Sniper down' : e.type === 'rusher' ? 'Rusher down' : 'Enemy down';
    let xp = 100*(e.scoreMul || 1)*(src === 'air' || src === 'drone' || src === 'pet' || src === 'stampede' ? .5 : 1) + (head ? 50 : 0) + (src === 'knife' || src === 'claw' ? 50 : 0);
    if (e.type === 'boss'){
      bossKills++; queuePrompt('boss'); addMilestone(`${bossName(e)} kill, wave ${wave}`); xp = 2500; score += 2500; sInv.air++; feed(`${bossName(e)} down: +2500 and a free airstrike`, true); banner(`${bossName(e)} down`);
      for (const k of ['ammo','health','nade']) spawnPickup(k, e.pos.x + (Math.random()-.5)*3, e.pos.z + (Math.random()-.5)*3);
    }
    score += pts; splash(pts, (LBL[src] || (head ? 'Headshot' : e.type === 'boss' ? bossName(e) + ' down' : tn)) + `  +${Math.round(xp)} XP`, head || src === 'knife');
    giveXP(xp);
    if (head && !src) addHeadshot(cur());
    if (src !== 'air' && src !== 'drone' && src !== 'pet' && src !== 'stampede') addStreakKill();
    ggKill(src); if (gameMode === 'tdm') tdmKill(src);
    if (!src && CLASS_SET.has('scav')){ const SW = cur(); SW.reserve = Math.min(SW.maxRes, SW.reserve + SW.c.mag); }
    chalEvent('kill'); if (head && !src) chalEvent('head'); if (src === 'knife') chalEvent('knife'); if (src === 'nade'){ chalEvent('nade'); if (cur().rocket) chalEvent('rocket'); }
    if (src === 'pet') chalEvent('pet'); if (currentMap === 'neon') chalEvent('neonkill'); if (!src && cur().id === 'pistol') chalEvent('pistol'); if (e.type === 'boss') chalEvent('boss');
    dropLoot(e);
    if (!src){
      const W = cur(); W.kills++;
      const A = ATT.find(a => a.unlock === W.kills);
      if (A){ feed(`Unlocked ${A.name} for ${W.name}`, true); toast(`New attachment unlocked: ${A.name}. Equip it in the Gunsmith from the pause menu.`, 4500); }
      saveGuns();
    }
  } else sfx.hit();
}
function damagePlayer(d, from, explosive){
  if (coopSwap){ coopHurt(explosive && perk('armor') ? d : d); return; }
  if (P.down || P.dead) return;
  if (hubMode) return;
  if (state !== 'play') return;
  if (tdm && (tdm.protT > 0 || tdm.over)) return;
  if (pounce) return;                 // can't be hit mid-leap
  if (rage.t > 0) d *= .25;           // Apex Form: 75% less damage
  if (tut) return;
  if (explosive && perk('armor')) d *= .65;
  P.hp -= d; P.lastHit = T; sfx.hurt(); rumble(.8, .3, 160);
  if (P.hp < 30 && streak > 0){ streak = 0; feed('Streak lost (health too low)'); }
  vigPulse = 0.5; shake = Math.max(shake, .006);
  const ang = Math.atan2(from.x - P.pos.x, from.z - P.pos.z);
  const rel = ang - (P.yaw + Math.PI);
  const el = document.createElement('div'); el.className = 'dmg'; el.style.transform = `rotate(${-rel}rad)`;
  $('dmgLayer').appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => { el.style.opacity = '0'; }));
  setTimeout(() => el.remove(), 1100);
  if (P.hp <= 0){ P.hp = 0; if (gameMode === 'tdm' && tdm && !tdm.over){ tdmDeath(); return; } if (coop && coop.started){ if (coopAliveMates() > 0 || coop.guest){ coopDown(); return; } coopEnd(); return; } gameOver(); }
}

