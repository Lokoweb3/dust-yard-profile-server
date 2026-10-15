// Dev loop: rebuilds the game whenever game/ changes and serves it locally.
//   npm run dev     then open the printed address; refresh the browser after each rebuild
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import net from 'node:net';

const can = (port, host) => new Promise(res => {
  const s = net.createServer().once('error', () => res(false)).listen(port, host, () => s.close(() => res(true)));
});
let port = 8793;
while (!(await can(port, '127.0.0.1')) || !(await can(port, '0.0.0.0'))) port++;

mkdirSync('data/dev', { recursive:true });
const env = { ...process.env, PORT:String(port), DATA_DIR:'data/dev', PUBLIC_URL:`http://localhost:${port}` };
delete env.DATABASE_URL;
const watcher = spawn(process.execPath, ['scripts/build-game.mjs', '--watch'], { stdio:'inherit' });
const server = spawn(process.execPath, ['profile-server.js'], { env, stdio:'inherit' });
console.log(`\n  Dust Yard dev server: http://localhost:${port}\n  (game data in data/dev, rebuilds on every change in game/)\n`);
const stop = () => { watcher.kill(); server.kill(); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
