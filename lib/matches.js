// Server-checked matches.
// The game reports every cleared wave while a match runs. Each report is checked against the game's own
// wave rules: how many raiders a wave has, how fast they can spawn, which waves have a boss. Drops,
// leaderboard scores and profile NFT stats come only from what passed those checks, never from the
// player's own totals.
const crypto = require('crypto');
const db = require('./db');
const { isB58, verifySigned } = require('./util');

let M = null;
const active = new Map();   // device key -> its running match id (memory only, rebuilt on start)
async function loadMatches(){
  M = await db.open('matches', { maps:['sessions', 'stats', 'links'] });
  for (const s of Object.values(M.sessions)) if (!s.ended) active.set(s.guest, s.id);
  sweep();
}
// save only the records that changed: matches are written on every wave, so this stays cheap
const save = (sid, guest) => db.save('matches', ...(sid ? [['sessions', sid]] : []), ...(guest ? [['stats', guest]] : []));

/* ---------- the game's wave rules: keep in step with startWave/updateWaves in game/dust-yard.html ---------- */
const BOSS_EVERY = 5, INTERMISSION = 4, SPAWN_FIRST = .8, SPAWN_GAP = 1.1, BOSS_GAP = 2.5;
const isBossWave = w => w > 0 && w % BOSS_EVERY === 0;
const regulars = w => isBossWave(w) ? Math.round((2 + 2*w)*.6) : 2 + 2*w;
/** raiders in a wave, boss included */
const waveEnemies = w => regulars(w) + (isBossWave(w) ? 1 : 0);
/** fastest a wave can possibly be cleared: the last raider can't spawn sooner than this */
const waveMinSecs = w => isBossWave(w) ? SPAWN_FIRST + BOSS_GAP + (regulars(w) - 1)*SPAWN_GAP : SPAWN_FIRST + (regulars(w) - 1)*SPAWN_GAP;
function minSecs(from, to){ let t = 0; for (let w = from; w <= to; w++) t += waveMinSecs(w) + (w > from ? INTERMISSION : 0); return t; }
function sumEnemies(from, to){ let n = 0; for (let w = from; w <= to; w++) n += waveEnemies(w); return n; }
function bossWaves(from, to){ let n = 0; for (let w = from; w <= to; w++) if (isBossWave(w)) n++; return n; }
// leeway for network delay and timer rounding
const TIME_SLACK = .85, TIME_GRACE = 3;
// best possible score per kill (armored raider headshot) and per boss, from damageEnemy in the game
const MAX_PTS_KILL = 375, MAX_PTS_BOSS = 6250, MAX_REVIVE_PTS = 2000;
// best possible XP per kill and per match (challenges, match bonuses), from giveXP calls in the game
const MAX_XP_KILL = 500, MAX_XP_BOSS = 2600, MAX_XP_MATCH = 6000;
const xpNeed = l => 400 + l*150, MAX_LEVEL = 50;
function levelForXp(xp){ let l = 1; while (l < MAX_LEVEL && xp >= xpNeed(l)){ xp -= xpNeed(l); l++; } return l; }
function xpForLevel(level){ let t = 0; for (let l = 1; l < level; l++) t += xpNeed(l); return t; }

const MODES = ['waves', 'gungame', 'coop', 'tdm'];
const MAPS = ['yard', 'neon', 'jungle'];

/* ---------- limits per connection, kept in memory only and forgotten within a day ---------- */
const perIp = new Map();
function ipCount(ip, kind, limit, windowMs){
  if (!ip) return true;
  const key = kind + '|' + crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16), now = Date.now();
  let e = perIp.get(key); if (!e || now - e.t > windowMs){ e = { t:now, n:0 }; perIp.set(key, e); }
  if (e.n >= limit) return false; e.n++; return true;
}
setInterval(() => { const now = Date.now(); for (const [k, e] of perIp) if (now - e.t > 864e5) perIp.delete(k); }, 3600e3).unref();
const START_LIMIT_HOUR = +(process.env.MATCH_STARTS_PER_HOUR || 60);
const DROP_MATCHES_PER_DAY = +(process.env.DROP_MATCHES_PER_IP_DAY || 40);
const MAX_OPEN = +(process.env.MAX_OPEN_MATCHES || 20000);
const fresh = ts => Number.isFinite(ts) && Math.abs(Date.now() - ts) <= 120000;
const int = v => Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;

/* ---------- verified totals ---------- */
function stat(guest){
  return M.stats[guest] = M.stats[guest] || { matches:0, kills:0, heads:0, bosses:0, xp:0, best:{}, at:0 };
}
function credit(s, kills, heads, bosses, xp){
  const c = s.credited = s.credited || { kills:0, heads:0, bosses:0, xp:0 }, st = stat(s.guest);
  st.kills += Math.max(0, kills - c.kills); st.heads += Math.max(0, heads - c.heads); st.bosses += Math.max(0, bosses - c.bosses); st.xp += Math.max(0, xp - c.xp); st.at = Date.now();
  Object.assign(c, { kills:Math.max(c.kills, kills), heads:Math.max(c.heads, heads), bosses:Math.max(c.bosses, bosses), xp:Math.max(c.xp, xp) });
}
/** the most XP the game could have given for this much play; the player's own XP is counted up to this */
function xpCap(s, kills, bosses, clearedTo){
  let x = kills*MAX_XP_KILL + bosses*MAX_XP_BOSS + MAX_XP_MATCH;
  for (let w = s.base + 1; w <= clearedTo; w++) x += 250 + 50*w;
  return x;
}
/** what a device key has really done: used for the leaderboard */
function verifiedBest(guest, map){ const st = M && M.stats[guest]; return st && st.best[map] || null; }
/** totals for a wallet across every device linked to it: used for the profile NFT and badges */
function verifiedForWallet(wallet){
  const v = { kills:0, heads:0, bosses:0, xp:0, bestWave:0, matches:0 };
  for (const [guest, w] of Object.entries(M.links)) if (w === wallet && M.stats[guest]){
    const st = M.stats[guest];
    v.kills += st.kills; v.heads += st.heads; v.bosses += st.bosses; v.xp += st.xp; v.matches += st.matches;
    for (const b of Object.values(st.best)) v.bestWave = Math.max(v.bestWave, b.wave || 0);
  }
  return v;
}
/** link a device key to a wallet. A device belongs to the first wallet it was linked to. */
function linkDevice(guest, wallet, nonce, sig){
  if (!isB58(guest) || !isB58(wallet) || typeof nonce !== 'string' || !verifySigned({ op:'link', guest, wallet, nonce }, sig, guest)) return false;
  if (M.links[guest] && M.links[guest] !== wallet) return false;
  if (!M.links[guest]){ M.links[guest] = wallet; db.save('matches', ['links', guest]); }
  return true;
}

function flag(s, why){ if (!s.flag){ s.flag = why; console.log(`match ${s.id} for ${s.guest} not verified: ${why}`); } }
function close(s, why){ s.ended = Date.now(); if (why) flag(s, why); if (active.get(s.guest) === s.id) active.delete(s.guest); }

function startSession(b, ip){
  const { guest, map, mode, ts, sig } = b;
  if (!isB58(guest) || !fresh(ts) || !verifySigned({ op:'start', guest, map, mode, ts }, sig, guest)) return { status:401, error:'bad signature' };
  if (!ipCount(ip, 'start', START_LIMIT_HOUR, 3600e3)) return { status:429, error:'too many matches, try again later' };
  if (active.size >= MAX_OPEN) return { status:503, error:'server busy, try again soon' };
  // one match at a time per device: starting a new one closes the old one
  const old = M.sessions[active.get(guest)]; if (old && !old.ended){ close(old, 'replaced by a newer match'); save(old.id); }
  const id = crypto.randomBytes(8).toString('hex'), now = Date.now();
  M.sessions[id] = { id, guest, map:MAPS.includes(map) ? map : 'yard', mode:MODES.includes(mode) ? mode : 'waves', start:now, base:0, wave:0, kills:0, heads:0, bosses:0, xp:0, partial:false, at:now };
  active.set(guest, id); save(id);
  return { status:200, sid:id };
}

/**
 * One cleared wave. A co-op player who joins a running match names the host's match (`host`):
 * their first wave may then be later than 1, but no later than the host has really reached.
 */
function checkWave(b){
  const { guest, sid, wave, kills, heads, bosses, xp, host, ts, sig } = b, s = M.sessions[sid];
  if (!s || s.guest !== guest || s.ended || !fresh(ts) || !verifySigned({ op:'wave', guest, sid, wave, kills, heads, bosses, xp, host, ts }, sig, guest)) return { status:401, error:'bad session' };
  const no = why => { flag(s, why); save(sid); return { status:409, flagged:s }; };
  if (s.flag) return { status:409, flagged:s };
  if (s.mode === 'tdm') return no('team deathmatch has no waves');
  const w = int(wave), k = int(kills), h = int(heads), bo = int(bosses), x = int(xp);
  if (w === s.wave && w > 0) return { status:200, ok:true, dup:true };       // a repeat of the last report
  if (s.wave === 0 && s.base === 0 && w > 1){
    const hs = M.sessions[host];
    if (s.mode !== 'coop' || !hs || hs.mode !== 'coop' || hs.ended || hs.flag || hs.guest === guest) return no(`started on wave ${w} without a host match`);
    if (w > hs.wave + 1) return no(`joined on wave ${w}, host only reached wave ${hs.wave + 1}`);
    s.base = s.wave = w - 1; s.partial = true; s.host = host;
  }
  if (w !== s.wave + 1) return no(`wave ${w} reported after wave ${s.wave}`);
  if (k < s.kills || h < s.heads || bo < s.bosses || x < s.xp || h > k) return no('totals went backwards');
  const fullFrom = s.base + (s.partial ? 2 : 1);
  const need = w >= fullFrom ? minSecs(fullFrom, w)*TIME_SLACK - TIME_GRACE : 0, took = (Date.now() - s.start)/1000;
  if (took < need) return no(`wave ${w} cleared after ${took.toFixed(1)}s, fastest possible is ${need.toFixed(1)}s`);
  // a co-op guest can hear about a cleared wave late, after the next one began, so allow one wave ahead
  if (k > sumEnemies(s.base + 1, w + 1)) return no(`${k} kills by wave ${w}, only ${sumEnemies(s.base + 1, w + 1)} raiders`);
  if (bo > bossWaves(s.base + 1, w + 1)) return no(`${bo} bosses by wave ${w}`);
  Object.assign(s, { wave:w, kills:k, heads:h, bosses:bo, xp:x, at:Date.now() });
  // bosses only count from waves played from the start
  const okBosses = Math.min(bo, bossWaves(fullFrom, w));
  credit(s, k, h, okBosses, Math.min(x, xpCap(s, k, okBosses, w)));
  save(sid, guest);
  return { status:200, ok:true };
}

/** End of match: returns what was verified, or null if nothing can be trusted. */
function endSession(b, ip){
  const { guest, sid, wave, kills, heads, bosses, xp, score, ts, sig } = b, s = M.sessions[sid];
  if (!s || s.guest !== guest || s.ended || !fresh(ts) || !verifySigned({ op:'end', guest, sid, wave, kills, heads, bosses, xp, score, ts }, sig, guest)) return { status:401, error:'bad session' };
  close(s);
  const st = stat(guest); st.matches++;
  if (s.flag){ save(sid, guest); return { status:200, verified:null }; }
  const w = int(wave), k = int(kills), h = Math.min(k, int(heads)), bo = int(bosses), x = int(xp), sc = int(score), mins = (s.ended - s.start)/60000;
  let v;
  if (s.mode === 'tdm'){
    // team deathmatch: raiders respawn, so kills are limited by time instead
    if (k > 5 + 25*mins || k > 150) flag(s, `${k} team deathmatch kills in ${mins.toFixed(1)} min`);
    else v = { wave:Math.min(10, 1 + Math.floor(k/8)), kills:k, heads:h, bosses:0, score:Math.min(sc, 8000), xp:Math.min(x, k*MAX_XP_KILL + MAX_XP_MATCH) };
  } else {
    // you can die in the wave after the last one you cleared, not later
    const reached = Math.min(w, s.wave + 1), upTo = Math.max(reached, s.base + 1);
    if (w > s.wave + 1) flag(s, `ended on wave ${w} after clearing wave ${s.wave}`);
    else if (k < s.kills || k > sumEnemies(s.base + 1, upTo)) flag(s, `${k} kills by wave ${reached}`);
    else if (bo > bossWaves(s.base + 1, upTo)) flag(s, `${bo} bosses by wave ${reached}`);
    else {
      const fullFrom = s.base + (s.partial ? 2 : 1), okBosses = Math.min(bo, bossWaves(fullFrom, Math.max(reached, fullFrom - 1)));
      let cap = MAX_REVIVE_PTS + k*MAX_PTS_KILL + okBosses*MAX_PTS_BOSS; for (let n = s.base + 1; n <= s.wave; n++) cap += 100*n;
      // waves count from the first one you played in full
      v = { wave:Math.max(0, reached - s.base - (s.partial ? 1 : 0)), kills:k, heads:h, bosses:okBosses, score:Math.min(sc, cap), xp:Math.min(Math.max(x, s.xp), xpCap(s, k, okBosses, s.wave)) };
    }
  }
  if (!v){ save(sid, guest); return { status:200, verified:null }; }
  credit(s, v.kills, v.heads, v.bosses, v.xp);
  const best = st.best[s.map] = st.best[s.map] || { wave:0, score:0 };
  best.wave = Math.max(best.wave, v.wave); best.score = Math.max(best.score, v.score);
  save(sid, guest);
  const dropsAllowed = ipCount(ip, 'drops', DROP_MATCHES_PER_DAY, 864e5);
  return { status:200, verified:{ ...v, map:s.map, mode:s.mode }, dropsAllowed };
}

// finished matches are kept a day for support questions, then removed
function sweep(){
  const now = Date.now();
  for (const [id, s] of Object.entries(M.sessions)){
    if (!s.ended && now - s.at > 3*3600e3){ close(s, 'abandoned'); save(id); }
    if (s.ended && now - s.ended > 864e5){ delete M.sessions[id]; save(id); }
  }
}
setInterval(() => M && sweep(), 600e3).unref();

const getMatches = () => M;
module.exports = { MAPS, checkWave, endSession, getMatches, levelForXp, linkDevice, loadMatches, minSecs, startSession, sumEnemies, verifiedBest, verifiedForWallet, waveEnemies, xpForLevel };
