// Player profiles: signed sync messages, stat checks, the soulbound profile NFT and its player card.
const { STORE_FILE } = require('./config');
const db = require('./db');
const { levelForXp, verifiedForWallet, xpForLevel } = require('./matches');
const { canonical, esc, sha256hex } = require('./util');

function syncMessage(r){
  return `Dust Yard profile sync\nWallet: ${r.wallet}\nUsername: @${r.username}\nAction: ${r.action}\nSummary: ${sha256hex(canonical(r.summary))}\nFingerprint: ${r.fingerprint}\nNonce: ${r.nonce}\nIssued At: ${r.issuedAt}`;
}
function fieldsFor(summary, fingerprint){
  return {
    level: String(summary.level), rank: String(summary.rank).slice(0, 32), kills: String(summary.kills), headshots: String(summary.headshots),
    best_wave: String(summary.bestWave), perks: (summary.perks || []).join(', ').slice(0, 80), fingerprint, updated: String(summary.updated)
  };
}
let store = null;
async function loadStore(){ store = await db.open('profiles', { file:STORE_FILE, maps:['profiles', 'nonces'] }); pruneNonces(); return store; }
/** resolves once saved; await it before sending a transaction that depends on it */
const saveStore = () => db.flush('profiles');
// a signed sync is only valid for 5 minutes, so used nonces older than a day can go
function pruneNonces(){ if (!store) return; const cut = Date.now() - 864e5; let n = 0; for (const [k, t] of Object.entries(store.nonces)) if (!(t > cut)){ delete store.nonces[k]; n++; } if (n) db.save('profiles'); }
setInterval(pruneNonces, 3600e3).unref();

const levelTitle = l => l >= 50 ? 'Degen Elite' : l >= 40 ? 'Commander' : l >= 30 ? 'Veteran' : l >= 20 ? 'Sergeant' : l >= 10 ? 'Corporal' : 'Recruit';
/**
 * Limit the stats a player asks to put on their profile NFT to what the server checked.
 * Kills, headshots, best wave and level can only grow by what verified matches on the player's
 * linked devices add. Profiles minted before matches were checked keep the stats they already had.
 */
function applyVerified(prev, summary, wallet){
  const V = verifiedForWallet(wallet);
  let base = prev && prev.vbase, v0 = prev && prev.v0;
  if (!base){
    // every verified match happened after checks began, so all of it counts on top of the old stats
    base = prev ? { kills:prev.summary.kills, heads:prev.summary.headshots, wave:prev.summary.bestWave, xp:xpForLevel(prev.summary.level) } : { kills:0, heads:0, wave:0, xp:0 };
    v0 = { kills:0, heads:0, xp:0 };
  }
  const allow = { kills:base.kills + Math.max(0, V.kills - v0.kills), heads:base.heads + Math.max(0, V.heads - v0.heads), wave:Math.max(base.wave, V.bestWave), level:levelForXp(base.xp + Math.max(0, V.xp - v0.xp)) };
  const out = Object.assign({}, summary);
  if (Number.isInteger(out.kills)) out.kills = Math.min(out.kills, allow.kills);
  if (Number.isInteger(out.headshots)) out.headshots = Math.min(out.headshots, allow.heads, out.kills);
  if (Number.isInteger(out.bestWave)) out.bestWave = Math.min(out.bestWave, allow.wave);
  if (Number.isInteger(out.level)) out.level = Math.max(1, Math.min(out.level, allow.level));
  if (out.level !== summary.level && typeof out.rank === 'string'){ const extra = out.rank.split(', ').slice(1).join(', '); out.rank = levelTitle(out.level) + (extra ? ', ' + extra : ''); }
  const capped = ['kills', 'headshots', 'bestWave', 'level'].filter(k => out[k] !== summary[k]);
  return { summary:out, vbase:base, v0, capped };
}

/* ---------- validation: replace with real server-side session checks ---------- */
function validateSummary(prev, next){
  const n = next;
  for (const k of ['level', 'kills', 'headshots', 'bestWave']) if (!Number.isInteger(n[k]) || n[k] < 0) return `bad ${k}`;
  if (n.level < 1 || n.level > 50) return 'level out of range';
  if (n.headshots > n.kills) return 'more headshots than kills';
  if (!/^[a-z0-9_]{3,16}$/.test(n.username || '')) return 'bad username';
  if (prev){
    if (n.level < prev.level || n.kills < prev.kills || n.headshots < prev.headshots || n.bestWave < prev.bestWave) return 'stats went backwards';
    const hours = Math.max(0, (Date.now() - prev.syncedAt)/3.6e6);
    // allow a burst (early levels are quick) plus a steady hourly rate; tune these limits for your game
    if (n.kills - prev.kills > 60 + 1500*hours) return 'kill rate too high';
    if (n.level - prev.level > 8 + 20*hours) return 'level rate too high';
  }
  // TODO: compare against kills, waves and XP your game server recorded for this wallet's sessions.
  return '';
}

/* ---------- player card served at the metadata URI ---------- */

function cardSvg(p){
  const s = p.summary;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1b1030"/><stop offset="1" stop-color="#0a1626"/></linearGradient></defs>
<rect width="512" height="512" rx="28" fill="url(#g)"/><rect x="10" y="10" width="492" height="492" rx="22" fill="none" stroke="#f0a93b" stroke-width="3"/>
<text x="36" y="70" font-family="Arial Black,Arial" font-size="22" fill="#f0a93b">DUST YARD</text><text x="36" y="140" font-family="Arial" font-weight="bold" font-size="46" fill="#f4ecdc">@${esc(s.username)}</text>
<text x="36" y="180" font-family="Arial" font-size="24" fill="#9cc3ff">${esc(s.rank)}</text><text x="476" y="150" text-anchor="end" font-family="Arial Black,Arial" font-size="84" fill="#f0a93b">${s.level}</text><text x="476" y="180" text-anchor="end" font-family="Arial" font-size="18" fill="#f4ecdc">LEVEL</text>
<g font-family="Arial" fill="#f4ecdc"><text x="36" y="270" font-size="18" opacity=".7">KILLS</text><text x="36" y="306" font-size="36" font-weight="bold">${s.kills}</text>
<text x="196" y="270" font-size="18" opacity=".7">HEADSHOTS</text><text x="196" y="306" font-size="36" font-weight="bold">${s.headshots}</text>
<text x="370" y="270" font-size="18" opacity=".7">BEST WAVE</text><text x="370" y="306" font-size="36" font-weight="bold">${s.bestWave}</text></g>
<text x="36" y="380" font-family="Arial" font-size="20" fill="#5cff8a">${esc((s.perks || []).join('  ·  ') || 'No holder perks yet')}</text>
<text x="36" y="470" font-family="monospace" font-size="13" fill="#f4ecdc" opacity=".55">fingerprint ${esc(p.fingerprint.slice(0, 32))}…</text></svg>`;
}

module.exports = { applyVerified, cardSvg, fieldsFor, loadStore, saveStore, syncMessage, validateSummary };
