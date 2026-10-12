// Postgres storage: old JSON data is imported on first boot, changes survive a restart,
// and only changed records are written. Needs TEST_DATABASE_URL (CI starts a Postgres for it).
import { mkdtempSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import pg from 'pg';
import { startServer, freshDatabase, dropDatabase, assert } from './helpers.mjs';

if (!process.env.TEST_DATABASE_URL){ console.log('TEST_DATABASE_URL not set: skipping the Postgres test.'); process.exit(0); }
const require = createRequire(import.meta.url);
const nacl = require('tweetnacl'), bs58 = require('bs58');
const { canonical } = require('../lib/util');

const dataDir = mkdtempSync(join(tmpdir(), 'dy-db-')), url = await freshDatabase();
const guest = nacl.sign.keyPair(), gpub = bs58.encode(guest.publicKey), wallet = bs58.encode(nacl.sign.keyPair().publicKey);
const sign = o => bs58.encode(nacl.sign.detached(Buffer.from(canonical(o)), guest.secretKey));
// what a server that ran on JSON files left behind
writeFileSync(join(dataDir, 'items.json'), JSON.stringify({ collection:'Coll111111111111111111111111111111111111111', minted:{ neon_tag:7 }, drops:{ d1:{ id:'d1', item:'neon_tag', serial:7, guest:gpub, status:'unclaimed', at:1 } }, sessions:{ old:{ guest:gpub } }, daily:{}, byMint:{}, badges:{ [wallet]:{ level10:'Mint11111111111111111111111111111111111111' } } }));
writeFileSync(join(dataDir, 'social.json'), JSON.stringify({ scores:{ [gpub]:{ callsign:'old', level:3, best_yard:4000, wave_yard:6 } }, chat:{ a1:{ name:'old', text:'hello from before', col:1, t:Date.now() - 1000, by:gpub } }, market:{} }));
writeFileSync(join(dataDir, 'market.json'), JSON.stringify({ listings:{}, pending:{}, sales:[{ id:'s1', name:'x', lamports:1, at:1 }] }));
writeFileSync(join(dataDir, 'profiles.json'), JSON.stringify({ profiles:{ [wallet]:{ mint:'Mint22222222222222222222222222222222222222', summary:{ username:'oldtimer', level:12, rank:'Corporal', kills:900, headshots:100, bestWave:9, perks:[] }, fingerprint:'ab', fields:{}, syncedAt:1 } }, nonces:{ n:Date.now() } }));

const rows = async (sql, args) => { const c = new pg.Client({ connectionString:url }); await c.connect(); try { return (await c.query(sql, args)).rows; } finally { await c.end(); } };
let s;
try {
  s = await startServer(8794, { dataDir, databaseUrl:url });
  const h = await (await fetch(s.base + '/health')).json();
  assert(h.storage === 'postgres', 'server should report Postgres storage, got ' + JSON.stringify(h));
  assert(/imported 1 items|imported \d+ items/.test(s.log()), 'server log should mention the import');
  const drops = (await (await fetch(`${s.base}/api/drops?guest=${gpub}`)).json()).drops;
  assert(drops.length === 1 && drops[0].serial === 7, 'imported drop should be served, got ' + JSON.stringify(drops));
  const cat = await (await fetch(s.base + '/api/items/catalog')).json();
  assert(cat.collection.startsWith('Coll') && cat.items.find(i => i.id === 'neon_tag').minted === 7, 'imported supply counts and collection should be kept');
  const card = await (await fetch(`${s.base}/card/${wallet}.json`)).json();
  assert(card.name === 'Dust Yard: @oldtimer', 'imported profile should be served');
  const chat = (await (await fetch(s.base + '/api/col/chat')).json()).rows;
  assert(chat.some(r => r.data.text === 'hello from before'), 'imported chat should be served');
  const lb = (await (await fetch(s.base + '/api/col/scores?order=best_yard')).json()).rows;
  assert(lb.length === 0, 'unverified scores from before should be set aside, not shown');
  const r1 = await rows(`SELECT ns, count(*)::int AS n FROM dy_docs WHERE grp = 'items' GROUP BY ns ORDER BY ns`);
  assert(r1.find(r => r.ns === 'drops').n === 1, 'items should be stored one record per row: ' + JSON.stringify(r1));
  assert(!(await rows(`SELECT 1 FROM dy_docs WHERE grp = 'items' AND id = 'sessions'`)).length, 'old match sessions should not be carried over');

  // a change made now is written as one row and survives a restart
  const before = (await rows(`SELECT id, updated FROM dy_docs WHERE grp = 'items' AND ns = 'drops'`))[0].updated;
  const b = { col:'chat', id:gpub, op:'add', data:{ name:'new', text:'hello after the move \u0000', col:2 }, ts:Date.now() };
  const w = await fetch(s.base + '/api/write', { method:'POST', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ ...b, sig:sign(b) }) });
  assert(w.ok, 'chat write failed: ' + w.status + ' ' + await w.text());
  // text Postgres can't store as-is (a typed "\u0000", half an emoji) must not block saving
  await new Promise(r => setTimeout(r, 1300));
  const b2 = { col:'chat', id:gpub, op:'add', data:{ name:'odd', text:'typed \\u0000 and half an emoji ' + '\u{1F600}'.slice(0, 1), col:3 }, ts:Date.now() };
  const w2 = await fetch(s.base + '/api/write', { method:'POST', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ ...b2, sig:sign(b2) }) });
  assert(w2.ok, 'odd chat write failed: ' + w2.status);
  await new Promise(r => setTimeout(r, 2500));
  assert(!/failed/.test(s.log()), 'no save should have failed:\n' + s.log());
  await s.halt();   // a normal stop saves everything first
  for (const f of readdirSync(dataDir)) if (f.endsWith('.json') && !f.includes('keypair')) rmSync(join(dataDir, f));   // the JSON files are no longer needed

  s = await startServer(8794, { dataDir, databaseUrl:url });
  assert(!/imported/.test(s.log()), 'a second start should not import again');
  const chat2 = (await (await fetch(s.base + '/api/col/chat')).json()).rows;
  assert(chat2.some(r => r.data.text.startsWith('hello after the move')), 'chat written before the restart should still be there');
  assert(chat2.some(r => r.data.text.startsWith('typed ')), 'odd text should be saved too');
  const after = (await rows(`SELECT updated FROM dy_docs WHERE grp = 'items' AND ns = 'drops'`))[0].updated;
  assert(+after === +before, 'records that did not change should not be rewritten');
  console.log('Postgres storage test passed: import, per-record saves and restart all work.');
} catch(e){
  console.error(e.message); if (s) console.error('--- server log ---\n' + s.log()); process.exitCode = 1;
} finally {
  if (s) await s.halt();
  await dropDatabase(url); rmSync(dataDir, { recursive:true, force:true });
}
