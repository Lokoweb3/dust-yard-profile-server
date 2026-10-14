/* ---------- Waves ---------- */
function startWave(){
  wave++; toSpawn = 2 + wave*2; spawnT = 0.8; waveActive = true; chalEvent('wave', wave);
  bossPending = wave % 5 === 0;
  if (bossPending) toSpawn = Math.round(toSpawn*.6);
  banner(bossPending ? `Wave ${wave}: boss wave` : `Wave ${wave}`);
}
// which detailed heads a map's raiders use, and loading them early (in the menu) so no raider shows the old head
function factionHeads(map){
  const fk = map ? raiderFactionFor(map) : raiderFaction();
  return fk === 'wolves' ? ['wolfT', 'fox', 'wolf'] : fk === 'gorillas' ? ['ape', 'bear'] : [];
}
function preloadHeads(map){
  try { for (const k of factionHeads(map)) ensureHD(k); const o = opMine(); if (o.k === 'animal'){ const sp = animalSpecies(); ensureHD(OP_HD_SPECIES[sp[0]]); if (o.f === 'wolfhd') ensureHD('wolf'); } else if (o.k === 'human') ensureHD(OP_HD_SKIN[o.f]); } catch(e){}
}
let headWait = 0;
function updateWaves(dt){
  // hold the first raiders back (up to 6 s) until their detailed heads have arrived
  if (waveActive && wave <= 1 && headWait < 6 && factionHeads().some(hdPending)){ headWait += dt; return; }
  const alive = enemies.filter(e => e.alive).length;
  if (waveActive){
    if (bossPending){ spawnT -= dt; if (spawnT <= 0){ bossPending = false; spawnBoss(); spawnT = 2.5; } }
    else if (toSpawn > 0){
      spawnT -= dt;
      if (spawnT <= 0 && alive < Math.min(4 + Math.floor(wave/2), 9)){ spawnEnemy(); toSpawn--; spawnT = 1.1; }
    } else if (alive === 0){
      waveActive = false; intermission = 4; matchWave(wave);
      const bonus = wave*100; score += bonus; feed(`Wave cleared +${bonus}`, true); banner('Wave cleared'); giveXP(250 + wave*50);
      fragN = Math.min(nadeCap(), fragN + 1); tacN = Math.min(nadeCap(), tacN + 1); feed('+1 frag, +1 tactical');
    }
  } else if (intermission > 0){
    intermission -= dt; if (intermission <= 0) startWave();
  }
}

