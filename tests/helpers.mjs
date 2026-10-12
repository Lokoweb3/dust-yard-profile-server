// Starts a throwaway copy of the server with its own empty data folder.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function startServer(port = 8790){
  const dataDir = mkdtempSync(join(tmpdir(), 'dy-data-'));
  const proc = spawn(process.execPath, ['profile-server.js'], {
    env:{ ...process.env, PORT:String(port), DATA_DIR:dataDir, PUBLIC_URL:`http://localhost:${port}` },
    stdio:['ignore', 'pipe', 'pipe']
  });
  let log = '';
  proc.stdout.on('data', d => { log += d; }); proc.stderr.on('data', d => { log += d; });
  const base = `http://localhost:${port}`;
  for (let i = 0; i < 60; i++){
    if (proc.exitCode !== null) throw new Error('Server exited early:\n' + log);
    try { const r = await fetch(base + '/health'); if (r.ok) return { base, proc, stop:() => { proc.kill(); rmSync(dataDir, { recursive:true, force:true }); }, log:() => log }; } catch(e){}
    await new Promise(r => setTimeout(r, 500));
  }
  proc.kill(); throw new Error('Server did not answer /health within 30 s:\n' + log);
}

export function assert(cond, msg){ if (!cond) throw new Error(msg); }
