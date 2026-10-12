// Storage for everything the server remembers (profiles, items, drops, market, chat, match records).
// Each group is kept in memory as one object. Its top-level maps (drops, profiles, scores...) are saved
// record by record, and only records that changed since the last save are written.
//   DATABASE_URL set  -> Postgres, one table (dy_docs). On first boot the old JSON files are imported.
//   no DATABASE_URL   -> JSON files in DATA_DIR, as before (local development and tests).
const fs = require('fs'), path = require('path');
const { DATA_DIR } = require('./config');

const groups = new Map();
let pool = null, closed = false;
const usingPostgres = () => !!pool;

async function init(){
  if (!process.env.DATABASE_URL || pool) return;
  const { Pool } = require('pg');
  pool = new Pool({ connectionString:process.env.DATABASE_URL, max:5, ssl:/^(1|true|require)$/i.test(process.env.PGSSL || '') ? { rejectUnauthorized:false } : undefined });
  pool.on('error', e => console.error('database connection error', e.message));
  await pool.query(`CREATE TABLE IF NOT EXISTS dy_docs (
    grp text NOT NULL, ns text NOT NULL, id text NOT NULL, doc jsonb NOT NULL, updated timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (grp, ns, id))`);
  console.log('storage: Postgres');
}

// Postgres can't store the NUL character or half of an emoji (a lone surrogate), so both are cleaned
// out of every string before saving. Doing it per string keeps the JSON valid whatever players type.
const clean = s => s.replace(/\0/g, '').replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '�');
const toJson = v => v === undefined ? undefined : JSON.stringify(v, (k, x) => typeof x === 'string' ? clean(x) : x);
const SEP = '\u0001';
const rowKey = (ns, id) => ns + SEP + id;
const splitKey = k => { const i = k.indexOf(SEP); return [k.slice(0, i), k.slice(i + 1)]; };

function rowOf(g, ns, id){
  if (ns){ const m = g.obj[ns]; return m && typeof m === 'object' ? toJson(m[id]) : undefined; }
  return toJson(g.obj[id]);
}
function allRows(g){
  const out = new Map();
  for (const [k, v] of Object.entries(g.obj)){
    if (g.maps.includes(k)){
      if (v && typeof v === 'object') for (const [id, doc] of Object.entries(v)){ const j = toJson(doc); if (j !== undefined) out.set(rowKey(k, id), j); }
    } else { const j = toJson(v); if (j !== undefined) out.set(rowKey('', k), j); }
  }
  return out;
}

/**
 * Open a group. `maps` lists the top-level keys that are maps of records; anything else is saved whole.
 * `file` is the JSON file used without Postgres, and imported into Postgres the first time.
 */
async function open(name, { maps = [], file, delay = 250 } = {}){
  file = file || path.join(DATA_DIR, name + '.json');
  const g = { name, maps, file, delay, obj:{}, snap:new Map(), timer:null, chain:Promise.resolve(), waiters:[], hints:new Set(), full:false };
  if (pool){
    const r = await pool.query('SELECT ns, id, doc FROM dy_docs WHERE grp = $1', [name]);
    for (const { ns, id, doc } of r.rows){
      if (ns){ (g.obj[ns] = g.obj[ns] || {})[id] = doc; } else g.obj[id] = doc;
      g.snap.set(rowKey(ns, id), toJson(doc));
    }
    // import the old JSON file once; a marker row stops it coming back if the group is later emptied
    const done = (await pool.query(`SELECT 1 FROM dy_docs WHERE grp = '_meta' AND ns = 'imported' AND id = $1`, [name])).rows.length;
    if (!done && !r.rows.length && fs.existsSync(file)){
      g.obj = JSON.parse(fs.readFileSync(file, 'utf8'));
      groups.set(name, g); g.full = true; await flush(name);
      console.log(`storage: imported ${g.snap.size} ${name} records from ${file}`);
    }
    if (!done) await pool.query(`INSERT INTO dy_docs (grp, ns, id, doc) VALUES ('_meta', 'imported', $1, $2::jsonb) ON CONFLICT DO NOTHING`, [name, JSON.stringify({ at:Date.now() })]);
  } else {
    try { g.obj = JSON.parse(fs.readFileSync(file, 'utf8')); } catch(e){ g.obj = {}; }
  }
  for (const m of maps) if (!g.obj[m] || typeof g.obj[m] !== 'object') g.obj[m] = {};
  groups.set(name, g);
  return g.obj;
}

async function upsert(q, name, rows){
  await q.query(`INSERT INTO dy_docs (grp, ns, id, doc) SELECT $1, ns, id, doc::jsonb FROM unnest($2::text[], $3::text[], $4::text[]) AS t(ns, id, doc)
    ON CONFLICT (grp, ns, id) DO UPDATE SET doc = EXCLUDED.doc, updated = now()`, [name, rows.map(([k]) => splitKey(k)[0]), rows.map(([k]) => splitKey(k)[1]), rows.map(([, j]) => j)]);
}
async function remove(q, name, keys){
  await q.query('DELETE FROM dy_docs d USING unnest($2::text[], $3::text[]) AS t(ns, id) WHERE d.grp = $1 AND d.ns = t.ns AND d.id = t.id', [name, keys.map(k => splitKey(k)[0]), keys.map(k => splitKey(k)[1])]);
}

async function writeGroup(g){
  if (closed) throw new Error('storage is closed');
  if (!pool){
    fs.mkdirSync(path.dirname(g.file), { recursive:true });
    fs.writeFileSync(g.file + '.tmp', JSON.stringify(g.obj)); fs.renameSync(g.file + '.tmp', g.file);
    g.full = false; g.hints.clear();
    return;
  }
  // Work out the changes now, so edits made while this save runs go into the next one.
  // With hints (the records a caller says it changed) only those are compared; otherwise everything is.
  const up = [], del = [];
  if (g.full){
    const now = allRows(g);
    for (const [k, j] of now) if (g.snap.get(k) !== j) up.push([k, j]);
    for (const k of g.snap.keys()) if (!now.has(k)) del.push(k);
  } else {
    for (const k of g.hints){ const [ns, id] = splitKey(k), j = rowOf(g, ns, id); if (j === undefined){ if (g.snap.has(k)) del.push(k); } else if (g.snap.get(k) !== j) up.push([k, j]); }
  }
  g.full = false; g.hints.clear();
  if (!up.length && !del.length) return;
  const failed = [];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < up.length; i += 500) await upsert(client, g.name, up.slice(i, i + 500));
    for (let i = 0; i < del.length; i += 500) await remove(client, g.name, del.slice(i, i + 500));
    await client.query('COMMIT');
  } catch(e){
    await client.query('ROLLBACK').catch(() => {});
    // one bad record must not block the rest: save them one at a time and keep only the failures for a retry
    for (const row of up){ try { await upsert(client, g.name, [row]); } catch(err){ failed.push(row[0]); console.error(`saving ${g.name} record ${row[0].replace(SEP, '/')} failed: ${err.message}`); } }
    if (del.length) try { await remove(client, g.name, del); } catch(err){ failed.push(...del); }
    if (failed.length === up.length + del.length) { client.release(); for (const k of failed) g.hints.add(k); throw e; }
  }
  client.release();
  const bad = new Set(failed);
  for (const [k, j] of up) if (!bad.has(k)) g.snap.set(k, j);
  for (const k of del) if (!bad.has(k)) g.snap.delete(k);
  for (const k of bad) g.hints.add(k);
  if (bad.size) throw new Error(`${bad.size} record(s) not saved`);
}

/** Save a group now; resolves once everything changed so far is stored. Use before sending a transaction. */
function flush(name){
  const g = groups.get(name); if (!g) return Promise.resolve();
  if (g.timer){ clearTimeout(g.timer); g.timer = null; }
  if (!g.hints.size) g.full = true;   // a direct flush compares everything
  const waiters = g.waiters; g.waiters = [];
  const p = g.chain = g.chain.then(() => writeGroup(g));
  p.then(() => waiters.forEach(w => w.ok()), e => {
    waiters.forEach(w => w.fail(e));
    if (closed) return;
    console.error(`saving ${name} failed: ${e.message}; will retry`);
    setTimeout(() => save(name), 2000);
  });
  g.chain = p.catch(() => {});
  return p;
}
/**
 * Mark a group changed; it's saved shortly after. Pass the records that changed as [map, id] pairs
 * (or [null, key] for a top-level value) to save only those; with none, the whole group is compared.
 * The returned promise can be awaited but usually isn't.
 */
function save(name, ...records){
  const g = groups.get(name); if (!g) return Promise.resolve();
  if (closed){ console.error(`ignored a save of ${name} after shutdown`); return Promise.resolve(); }
  if (records.length) for (const [ns, id] of records) g.hints.add(rowKey(ns || '', String(id))); else g.full = true;
  const p = new Promise((ok, fail) => g.waiters.push({ ok, fail }));
  p.catch(() => {});
  if (!g.timer) g.timer = setTimeout(() => { g.timer = null; flush(name); }, g.delay);
  return p;
}
async function flushAll(){ await Promise.all([...groups.keys()].map(n => flush(n).catch(() => {}))); }
/** save everything, then refuse further writes (shutdown) */
async function close(){ for (const g of groups.values()) g.full = true; await flushAll(); closed = true; if (pool){ await pool.end(); pool = null; } }

module.exports = { close, flush, flushAll, init, open, save, usingPostgres };
