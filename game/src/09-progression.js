/* ---------- Player progression: XP, levels, perks ---------- */
let profile = { xp:0, level:1 };
try { profile = Object.assign(profile, JSON.parse(store.get('dustyard-profile') || '{}') || {}); } catch(e){}
let gameXP = 0;
const MAX_LEVEL = 50;
function xpNeed(l){ return 400 + l*150; }
const UNLOCKS = [
  { lv:2,  k:'frag3',   text:'Extra frag grenade at the start of each game' },
  { lv:4,  k:'regen',   text:'Faster health regeneration' },
  { lv:6,  k:'tac3',    text:'Extra tactical grenade at the start of each game' },
  { lv:8,  k:'reload',  text:'Sleight of hand: 15% faster reloads' },
  { lv:10, k:'hardline',text:'Hardline: killstreaks need one fewer kill' },
  { lv:13, k:'scav',    text:'Scavenger: ammo pickups give 50% more ammo' },
  { lv:16, k:'tough',   text:'Tough: 120 max health' },
  { lv:20, k:'carry',   text:'Bandolier: carry up to 5 of each grenade' },
  { lv:24, k:'reserve', text:'Deep pockets: 30% more starting and max reserve ammo' },
  { lv:28, k:'quick',   text:'Lightweight: 6% faster movement' },
  { lv:32, k:'uavstart',text:'Recon: start every game with a UAV' },
  { lv:36, k:'armor',   text:'Flak jacket: 35% less explosive damage' },
  { lv:40, k:'airstart',text:'Air support: start every game with an airstrike' },
  { lv:45, k:'regen2',  text:'Iron lungs: health regen starts after 2 seconds' },
  { lv:50, k:'elite',   text:'Degen Elite: gold XP bar and title' }
];
const CLASS_SET = new Set();
const perk = k => CLASS_SET.has(k) || UNLOCKS.some(u => u.k === k && profile.level >= u.lv);
// Species powers: each animal operator gets one small passive bonus.
const SP_POWERS = { wolf:['Pack runner','Sprints 15% faster'], bear:['Thick hide','+30 max health'], fox:['Light paws','Raiders spot you later'],
  tiger:['Quick claws','Faster, longer melee'], ape:['Brute','Melee and big hits knock raiders further'], lion:['Pride','+15% damage for you and teammates near you'],
  panda:['Bamboo rest','Health comes back sooner and faster'] };
let spCache = { t:-1e9, v:'' };
function spPower(){
  const now = performance.now(); if (now - spCache.t < 250) return spCache.v;
  let v = ''; try { const o = opMine(); if (o.k === 'animal') v = animalSpecies()[0]; } catch(e){}
  spCache = { t:now, v }; return v;
}
// Pride: a lion operator (you or a teammate within 15 m) gives the team +15% damage
function prideAura(){
  if (spPower() === 'lion') return true;
  if (!coop || !coop.mates) return false;
  for (const m of coop.mates.values()){ const o = m.pr && m.pr.op; if (o && o.k === 'animal' && o.f === 'lion' && !(m.pr.dn) && m.pos && m.pos.distanceTo(P.pos) < 15) return true; }
  return false;
}
let bgCache = { t:-1e9, v:'' }, hgCache = { t:-1e9, v:'' };
function headGear(){
  const now = performance.now(); if (now - hgCache.t < 250) return hgCache.v;
  let v = ''; try { v = opMine().h || ''; } catch(e){} hgCache = { t:now, v }; return v;
}
function backGear(){
  const now = performance.now(); if (now - bgCache.t < 250) return bgCache.v;
  let v = ''; try { v = opMine().b || ''; } catch(e){} bgCache = { t:now, v }; return v;
}
const maxHP = () => (perk('tough') ? 120 : 100) + (spPower() === 'bear' ? 30 : 0);
const nadeCap = () => (perk('carry') ? 5 : 4) + (backGear() === 'pack' ? 1 : 0);
function saveProfile(){ store.set('dustyard-profile', JSON.stringify(profile)); }
function giveXP(n, why){
  if (state !== 'play' || n <= 0) return;
  n = Math.round(n); gameXP += n;
  if (profile.level >= MAX_LEVEL){ profile.xp += n; saveProfile(); hud.xp = -1; return; }
  profile.xp += n;
  while (profile.level < MAX_LEVEL && profile.xp >= xpNeed(profile.level)){
    profile.xp -= xpNeed(profile.level); profile.level++; if (profile.level >= 5) queuePrompt('level5'); addMilestone(`Level ${profile.level}`);
    const u = UNLOCKS.find(x => x.lv === profile.level);
    banner(`Level ${profile.level}`); sfx.levelUp();
    toast(u ? `Level ${profile.level} unlocked: ${u.text}` : `Level ${profile.level} reached`, 4500);
    if (u && u.k === 'tough') P.hp = Math.min(maxHP(), P.hp + 20);
  }
  saveProfile(); hud.xp = -1;
}
function levelTitle(){ return profile.level >= 50 ? 'Degen Elite' : profile.level >= 40 ? 'Commander' : profile.level >= 30 ? 'Veteran' : profile.level >= 20 ? 'Sergeant' : profile.level >= 10 ? 'Corporal' : 'Recruit'; }
function profileText(){
  const next = profile.level >= MAX_LEVEL ? 'Max level' : `${profile.xp.toLocaleString()} / ${xpNeed(profile.level).toLocaleString()} XP`;
  const nu = UNLOCKS.find(u => u.lv > profile.level);
  return { head:(typeof acct !== 'undefined' && acct ? (acct.claimed ? '@' + acct.username : acct.name) + ', ' : '') + `Level ${profile.level} ${levelTitle()}` + (typeof holderTitle === 'function' && holderTitle() ? `, ${holderTitle()}` : ''), sub: next + (nu ? `. Next unlock at level ${nu.lv}: ${nu.text}` : '') };
}
function renderProfile(){
  const t = profileText(); $('profHead').textContent = t.head; $('profSub').textContent = t.sub;
  $('profFill').style.width = (profile.level >= MAX_LEVEL ? 100 : profile.xp/xpNeed(profile.level)*100) + '%';
}

