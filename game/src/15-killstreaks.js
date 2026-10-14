/* ---------- Killstreaks ---------- */
const needOf = S => S.need - (perk('hardline') ? 1 : 0) - (backGear() === 'radio' ? 1 : 0);
const STREAKS = [ { k:'uav', name:'UAV', need:3, key:'7', pad:'D-pad up' }, { k:'air', name:'Airstrike', need:5, key:'8', pad:'D-pad right' }, { k:'drone', name:'Attack drone', need:7, key:'9', pad:'D-pad down' } ];
let streak = 0, uavT = 0, airAim = false, drone = null;
const sInv = { uav:0, air:0, drone:0, care:0, predator:0, pounce:0, stampede:0, apex:0 }, airJobs = [];
let aimKind = 'air';   // what the aiming marker is for: an airstrike or a stampede
function addStreakKill(){
  streak++;
  const S = STREAKS.find(s => needOf(s) === streak);
  if (S) giveXP(100);
  if (S){ sInv[S.k]++; sfx.streak(); banner(`${S.name} ready`); toast(`${S.name} ready. Press ${padActive ? S.pad : isTouch ? 'the Streak button' : S.key} to use it.`, 3500); }
}
function useStreak(k){
  if (hubMode) return;
  if (state !== 'play') return;
  if ((k === 'air' || k === 'stampede') && airAim && aimKind === k){ airAim = false; airMark.visible = false; return; }
  if (!sInv[k]) return;
  if (predator) return;
  if (k === 'uav'){ sInv.uav--; uavT = headGear() === 'antenna' ? 45 : 30; sfx.radio(); feed('UAV online'); }
  else if (k === 'care'){ sInv.care--; dropCarePackage(); }
  else if (k === 'predator'){ sInv.predator--; launchPredator(); }
  else if (k === 'pounce'){ if (pounce) return; sInv.pounce--; usePounce(); }
  else if (k === 'stampede'){ aimKind = 'stampede'; airAim = true; ads = false; toast(isTouch ? 'Aim where the herd should run and tap Fire' : 'Aim where the herd should run and fire. Aim down sights to cancel.', 3000); }
  else if (k === 'apex'){ if (rage.t > 0) return; sInv.apex--; startRage(); }
  else if (k === 'air'){ aimKind = 'air'; airAim = true; ads = false; toast(isTouch ? 'Aim at a spot and tap Fire to call the airstrike' : 'Aim at a spot and fire to call the airstrike. Aim down sights to cancel.', 3000); }
  else if (!drone){ sInv.drone--; spawnDrone(); sfx.radio(); feed('Attack drone deployed'); }
}
