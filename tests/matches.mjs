// Match checks: honest play is accepted, and each kind of faked result is caught.
// Runs the server modules directly with a fake clock, so a 10-wave match takes milliseconds.
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assert } from './helpers.mjs';

const dataDir = mkdtempSync(join(tmpdir(), 'dy-match-'));
process.env.DATA_DIR = dataDir; delete process.env.DATABASE_URL;
const require = createRequire(import.meta.url);
const nacl = require('tweetnacl'), bs58 = require('bs58');
const { canonical } = require('../lib/util');
const M = require('../lib/matches');
const { applyVerified } = require('../lib/profiles');
const social = require('../lib/social');
await M.loadMatches();

let clock = Date.parse('2026-10-12T12:00:00Z');
const realNow = Date.now; Date.now = () => clock;
const wait = secs => { clock += secs*1000; };

const device = () => { const k = nacl.sign.keyPair(); return { pub:bs58.encode(k.publicKey), sign:o => bs58.encode(nacl.sign.detached(Buffer.from(canonical(o)), k.secretKey)) }; };
const start = (d, mode = 'waves', map = 'yard') => { const b = { op:'start', guest:d.pub, map, mode, ts:clock }; return M.startSession({ ...b, sig:d.sign(b) }, '10.0.0.' + (Math.random()*250|0)); };
const waveRep = (d, sid, wave, kills, heads = 0, bosses = 0, host = null) => { const b = { op:'wave', guest:d.pub, sid, wave, kills, heads, bosses, xp:kills*120, host, ts:clock }; return M.checkWave({ ...b, sig:d.sign(b) }); };
const end = (d, sid, wave, kills, heads = 0, bosses = 0, score = 0) => { const b = { op:'end', guest:d.pub, sid, wave, kills, heads, bosses, xp:kills*120 + 500, score, ts:clock }; return M.endSession({ ...b, sig:d.sign(b) }, '10.1.0.1'); };
// plays waves honestly: each wave takes its real minimum time plus some fighting
function playWaves(d, sid, from, to, kills0 = 0, bosses0 = 0, host = null){
  let k = kills0, b = bosses0;
  for (let w = from; w <= to; w++){
    wait(M.minSecs(w, w) + (w > from || from > 1 ? 4 : 0) + 6);
    k += M.waveEnemies(w); if (w % 5 === 0) b++;
    const r = waveRep(d, sid, w, k, Math.floor(k/4), b, host); if (r.status !== 200) return { r, k, b };
  }
  return { r:{ status:200 }, k, b };
}
const checks = [];
const check = (name, fn) => checks.push([name, fn]);

check('honest solo match is verified and can drop items', () => {
  const d = device(), { sid } = start(d);
  const p = playWaves(d, sid, 1, 6); assert(p.r.status === 200, 'honest waves were rejected: ' + JSON.stringify(p.r));
  wait(10); const e = end(d, sid, 7, p.k + 3, 5, p.b, 9000);
  assert(e.verified && e.verified.wave === 7 && e.verified.bosses === 1, 'honest end should verify wave 7 with 1 boss, got ' + JSON.stringify(e));
  assert(e.dropsAllowed, 'honest match should be allowed drops');
  const best = M.verifiedBest(d.pub, 'yard'); assert(best.wave === 7 && best.score === 9000, 'best should be recorded, got ' + JSON.stringify(best));
});
check('Jungle Ruins matches are recorded on their own leaderboard', () => {
  const d = device(), { sid } = start(d, 'waves', 'jungle');
  const p = playWaves(d, sid, 1, 5); assert(p.r.status === 200, 'honest jungle waves were rejected: ' + JSON.stringify(p.r));
  wait(10); const e = end(d, sid, 6, p.k + 2, 4, p.b, 7000);
  assert(e.verified && e.verified.wave === 6, 'jungle match should verify, got ' + JSON.stringify(e));
  const best = M.verifiedBest(d.pub, 'jungle'); assert(best && best.wave === 6 && best.score === 7000, 'jungle best should be recorded, got ' + JSON.stringify(best));
  assert(!M.verifiedBest(d.pub, 'yard'), 'a jungle match should not count for Dust Yard');
});
check('waves cleared faster than raiders can spawn are rejected', () => {
  const d = device(), { sid } = start(d);
  wait(6); assert(waveRep(d, sid, 1, 4).status === 200, 'wave 1 in 6s should be fine');
  wait(2); const r = waveRep(d, sid, 2, 10); assert(r.status === 409, 'wave 2 two seconds later should be rejected');
  wait(60); const e = end(d, sid, 3, 10); assert(e.verified === null, 'a flagged match should verify nothing');
});
check('skipping waves is rejected', () => {
  const d = device(), { sid } = start(d); wait(300);
  assert(waveRep(d, sid, 5, 20).status === 409, 'reporting wave 5 first should be rejected');
});
check('more kills than raiders is rejected', () => {
  const d = device(), { sid } = start(d); wait(10);
  // a late co-op report may include the next wave's kills, so the limit is waves 1 and 2
  assert(waveRep(d, sid, 1, M.waveEnemies(1) + M.waveEnemies(2) + 1).status === 409, 'more kills than waves 1 and 2 have should be rejected');
});
check('a boss outside boss waves is rejected', () => {
  const d = device(), { sid } = start(d); wait(10);
  assert(waveRep(d, sid, 1, 2, 0, 1).status === 409, 'a boss in wave 1 should be rejected');
});
check('ending far past the last checked wave gives nothing', () => {
  const d = device(), { sid } = start(d); const p = playWaves(d, sid, 1, 2);
  wait(20); assert(end(d, sid, 20, p.k).verified === null, 'ending on wave 20 after clearing 2 should not verify');
});
check('ending with no checkpoints only counts wave 1', () => {
  const d = device(), { sid } = start(d); wait(600);
  const e = end(d, sid, 12, 3); assert(e.verified === null, 'claiming wave 12 with no wave reports should not verify');
  const d2 = device(), s2 = start(d2).sid; wait(30);
  const e2 = end(d2, s2, 1, 3); assert(e2.verified && e2.verified.wave === 1, 'dying in wave 1 should verify wave 1');
});
check('changed numbers break the signature', () => {
  const d = device(), { sid } = start(d); wait(10);
  const b = { op:'wave', guest:d.pub, sid, wave:1, kills:4, heads:0, bosses:0, ts:clock };
  assert(M.checkWave({ ...b, sig:d.sign(b), kills:5 }).status === 401, 'editing a signed report should fail');
});
check('someone else cannot report on your match', () => {
  const d = device(), x = device(), { sid } = start(d); wait(10);
  const b = { op:'wave', guest:d.pub, sid, wave:1, kills:4, heads:0, bosses:0, ts:clock };
  assert(M.checkWave({ ...b, sig:x.sign(b) }).status === 401, 'a report signed by another device should fail');
});
check('starting a new match closes the old one', () => {
  const d = device(), a = start(d).sid; wait(10); const b = start(d).sid;
  wait(10); assert(waveRep(d, a, 1, 4).status === 401, 'the replaced match should no longer accept reports');
  assert(waveRep(d, b, 1, 4).status === 200, 'the new match should work');
});
check('co-op drop-in counts only waves played in full', () => {
  const h = device(), hs = start(h, 'coop').sid; const hp = playWaves(h, hs, 1, 6); assert(hp.r.status === 200, 'host waves should pass');
  const d = device(), { sid } = start(d, 'coop'); wait(5);
  assert(waveRep(d, sid, 7, 6, 0, 0, hs).status === 200, 'joining part-way through wave 7 of a real host match should be accepted');
  const p = playWaves(d, sid, 8, 10, 6, 0, hs); assert(p.r.status === 200, 'later co-op waves should pass: ' + JSON.stringify(p.r));
  wait(10); const e = end(d, sid, 11, p.k, 0, p.b);
  assert(e.verified && e.verified.wave === 4, 'joined in wave 7, died in wave 11: should count as wave 4, got ' + JSON.stringify(e.verified));
  assert(e.verified.bosses === 1, 'the wave 10 boss was played in full and should count');
});
check('co-op drop-in cannot skip ahead of a real host', () => {
  const d = device(), { sid } = start(d, 'coop'); wait(1);
  assert(waveRep(d, sid, 1000, 1202).status === 409, 'a drop-in with no host match should be rejected');
  const h = device(), hs = start(h, 'coop').sid; playWaves(h, hs, 1, 3);
  const d2 = device(), s2 = start(d2, 'coop').sid; wait(1);
  assert(waveRep(d2, s2, 50, 10, 0, 0, hs).status === 409, 'joining on wave 50 when the host is on wave 4 should be rejected');
  const d3 = device(), s3 = start(d3, 'waves').sid; wait(1);
  assert(waveRep(d3, s3, 4, 10, 0, 0, hs).status === 409, 'a solo match cannot claim to be a drop-in');
  const x = device(), xs = start(x, 'coop').sid; wait(1);
  assert(waveRep(x, xs, 2, 4, 0, 0, xs).status === 409, 'a player cannot be their own host');
});
check('missing or odd numbers do not slip through', () => {
  const d = device(), { sid } = start(d); wait(10);
  const b = { op:'wave', guest:d.pub, sid, wave:'1', kills:'NaN', heads:-5, bosses:null, xp:1e9, host:null };
  assert(M.checkWave({ ...b, sig:d.sign(b) }).status === 401, 'a report with no timestamp should be refused');
  const b2 = { ...b, ts:clock }; const r = M.checkWave({ ...b2, sig:d.sign(b2) });
  assert(r.status === 409, 'a wave given as text is not wave 1 and should be rejected, got ' + JSON.stringify(r.status));
});
check('team deathmatch kills are limited by time', () => {
  const d = device(), { sid } = start(d, 'tdm'); wait(60);
  assert(end(d, sid, 10, 200).verified === null, '200 kills in a minute should not verify');
  const d2 = device(), s2 = start(d2, 'tdm').sid; wait(8*60);
  const e = end(d2, s2, 10, 60, 10, 0, 7500); assert(e.verified && e.verified.wave === 8 && e.verified.kills === 60, 'a normal deathmatch should verify, got ' + JSON.stringify(e.verified));
});
check('score is capped at what the kills could earn', () => {
  const d = device(), { sid } = start(d); wait(30);
  const e = end(d, sid, 1, 2, 0, 0, 999999); assert(e.verified.score < 5000, 'a huge score with 2 kills should be capped, got ' + e.verified.score);
});

// ---- profile NFT stats ----
check('profile stats are limited to verified matches on linked devices', () => {
  const d = device(), wallet = bs58.encode(nacl.sign.keyPair().publicKey), { sid } = start(d);
  const p = playWaves(d, sid, 1, 5); wait(10); end(d, sid, 6, p.k + 2, 3, p.b, 5000);
  const ask = { username:'tester', level:50, rank:'Degen Elite', kills:99999, headshots:5000, bestWave:60, perks:[] };
  let r = applyVerified(null, ask, wallet);
  assert(r.summary.kills === 0 && r.summary.level === 1, 'before linking a device nothing is verified');
  const nonce = 'n1', link = { op:'link', guest:d.pub, wallet, nonce };
  assert(M.linkDevice(d.pub, wallet, nonce, d.sign(link)), 'linking should work');
  r = applyVerified(null, ask, wallet);
  assert(r.summary.kills === p.k + 2 && r.summary.bestWave === 6 && r.summary.level > 1 && r.summary.level < 50, 'stats should be the verified ones, got ' + JSON.stringify(r.summary));
  assert(r.summary.rank === (r.summary.level >= 10 ? 'Corporal' : 'Recruit'), 'rank should follow the verified level, got ' + r.summary.rank);
  const other = bs58.encode(nacl.sign.keyPair().publicKey);
  assert(!M.linkDevice(d.pub, other, 'n2', d.sign({ op:'link', guest:d.pub, wallet:other, nonce:'n2' })), 'a device can only be linked to its first wallet');
  // a profile minted before matches were checked keeps its old stats and grows by verified play
  const legacy = { summary:{ level:20, kills:3000, headshots:900, bestWave:15 } };
  const r2 = applyVerified(legacy, { ...ask, kills:3100 }, wallet);
  assert(r2.summary.kills === 3000 + p.k + 2 && r2.summary.bestWave === 15 && r2.summary.level >= 20, 'legacy stats should be kept and grow only by verified play, got ' + JSON.stringify(r2.summary));
  const r3 = applyVerified(legacy, { ...ask, kills:3001 }, wallet); assert(r3.summary.kills === 3001, 'asking for less than allowed is fine');
});

// ---- leaderboard ----
check('leaderboard only shows verified scores', async () => {
  await social.loadSocial();
  const d = device(), { sid } = start(d); const p = playWaves(d, sid, 1, 3); wait(10); end(d, sid, 4, p.k, 2, 0, 2500);
  const post = data => { clock += 4000; const b = { col:'scores', id:d.pub, op:'set', data, ts:clock }; return social.socialWrite({ ...b, sig:d.sign({ col:b.col, id:b.id, op:b.op, data, ts:b.ts }) }); };
  let w = post({ callsign:'cheat', level:5, best_yard:999999, wave_yard:99 }); assert(w.ok, 'posting should work: ' + JSON.stringify(w));
  const row = social.getSocial().scores[d.pub]; assert(row.best_yard === 2500 && row.wave_yard === 4, 'leaderboard should hold the verified score, got ' + JSON.stringify(row));
  const x = device(); clock += 4000; const b = { col:'scores', id:x.pub, op:'set', data:{ callsign:'nobody', level:1, best_yard:5000, wave_yard:9 }, ts:clock };
  social.socialWrite({ ...b, sig:x.sign(b) }); assert(social.getSocial().scores[x.pub].best_yard === undefined, 'a player with no verified match gets no score');
});

let failed = 0;
for (const [name, fn] of checks){
  try { await fn(); console.log('ok   ' + name); } catch(e){ failed++; console.error('FAIL ' + name + '\n     ' + e.message); }
}
Date.now = realNow;
const db = require('../lib/db'); await db.close();
rmSync(dataDir, { recursive:true, force:true });
if (failed){ console.error(`${failed} match check(s) failed`); process.exit(1); }
console.log('All match checks passed.');
process.exit(0);
