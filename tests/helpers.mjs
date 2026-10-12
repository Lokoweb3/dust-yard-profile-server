// Starts a throwaway copy of the server with its own empty data folder.
// With TEST_DATABASE_URL set, each server also gets its own fresh Postgres database.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import pg from 'pg';

async function admin(sql){
  const c = new pg.Client({ connectionString:process.env.TEST_DATABASE_URL }); await c.connect();
  try { await c.query(sql); } finally { await c.end(); }
}
/** a fresh, empty test database; returns its connection string */
export async function freshDatabase(){
  if (!process.env.TEST_DATABASE_URL) return null;
  const name = 'dyt_' + randomBytes(5).toString('hex');
  await admin(`CREATE DATABASE ${name}`);
  const u = new URL(process.env.TEST_DATABASE_URL); u.pathname = '/' + name;
  return u.toString();
}
export async function dropDatabase(url){
  if (!url) return;
  const name = new URL(url).pathname.slice(1);
  await admin(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`).catch(() => {});
}

/**
 * options: dataDir (reuse a data folder), databaseUrl (reuse a database), env (extra variables)
 * stop() ends the server; cleanup() also removes the data folder and database it created.
 */
export async function startServer(port = 8790, options = {}){
  const ownDir = !options.dataDir, dataDir = options.dataDir || mkdtempSync(join(tmpdir(), 'dy-data-'));
  const ownDb = options.databaseUrl === undefined, databaseUrl = ownDb ? await freshDatabase() : options.databaseUrl;
  const env = { ...process.env, PORT:String(port), DATA_DIR:dataDir, PUBLIC_URL:`http://localhost:${port}`, ...(options.env || {}) };
  delete env.DATABASE_URL; if (databaseUrl) env.DATABASE_URL = databaseUrl;
  const proc = spawn(process.execPath, ['profile-server.js'], { env, stdio:['ignore', 'pipe', 'pipe'] });
  let log = '';
  proc.stdout.on('data', d => { log += d; }); proc.stderr.on('data', d => { log += d; });
  const base = `http://localhost:${port}`;
  const stop = () => new Promise(res => { if (proc.exitCode !== null) return res(); proc.once('exit', res); proc.kill('SIGTERM'); setTimeout(() => { proc.kill('SIGKILL'); res(); }, 5000); });
  const cleanup = async () => { await stop(); if (ownDir) rmSync(dataDir, { recursive:true, force:true }); if (ownDb) await dropDatabase(databaseUrl); };
  for (let i = 0; i < 60; i++){
    if (proc.exitCode !== null) throw new Error('Server exited early:\n' + log);
    try { const r = await fetch(base + '/health'); if (r.ok) return { base, proc, dataDir, databaseUrl, stop:cleanup, halt:stop, log:() => log }; } catch(e){}
    await new Promise(r => setTimeout(r, 500));
  }
  await cleanup(); throw new Error('Server did not answer /health within 30 s:\n' + log);
}

export function assert(cond, msg){ if (!cond) throw new Error(msg); }
