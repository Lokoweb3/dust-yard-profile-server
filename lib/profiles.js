// Player profiles: signed sync messages, stat checks, the soulbound profile NFT and its player card.
const fs = require('fs');
const { STORE_FILE } = require('./config');
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
function loadStore(){ try { return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')); } catch(e){ return { profiles:{}, nonces:{} }; } }
function saveStore(s){ fs.writeFileSync(STORE_FILE + '.tmp', JSON.stringify(s, null, 2)); fs.renameSync(STORE_FILE + '.tmp', STORE_FILE); }

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

module.exports = { cardSvg, fieldsFor, loadStore, saveStore, syncMessage, validateSummary };
