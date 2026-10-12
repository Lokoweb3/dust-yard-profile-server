// Server smoke test: starts, reports healthy, serves the game and the live socket.
import { startServer, assert } from './helpers.mjs';
import WebSocket from 'ws';

const s = await startServer(8791);
try {
  const h = await (await fetch(s.base + '/health')).json();
  assert(h.ok === true, '/health should say ok:true, got ' + JSON.stringify(h));
  assert(typeof h.feePayer === 'string' && h.feePayer.length > 30, '/health should report the fee payer address');

  const page = await fetch(s.base + '/');
  const html = await page.text();
  assert(page.ok, 'GET / failed with ' + page.status);
  assert(html.length > 1_000_000, `GET / returned only ${html.length} bytes, the game build looks broken`);

  // two clients in the same co-op room see each other; a client in another room does not
  const join = room => new Promise((res, rej) => {
    const ws = new WebSocket(s.base.replace('http', 'ws') + '/ws'); let last = null;
    ws.on('open', () => { ws.send(JSON.stringify({ t:'j', r:room })); ws.send(JSON.stringify({ t:'p', d:{ name:'t-' + room, x:1, z:2 } })); res({ ws, peers:() => last }); });
    ws.on('message', m => { const j = JSON.parse(m); if (j.t === 'peers') last = j.peers; });
    ws.on('error', rej);
  });
  const a = await join('dy-coop-test1'), b = await join('dy-coop-test1'), c = await join('dy-coop-other');
  await new Promise(r => setTimeout(r, 800));
  assert(a.peers() && a.peers().length === 2, 'two players in one squad room should see 2 peers, saw ' + JSON.stringify(a.peers()));
  assert(c.peers() && c.peers().length === 1, 'a player in another room should only see themselves');
  [a, b, c].forEach(x => x.ws.close());
  console.log('Smoke test passed: health, game page and squad rooms work.');
} catch (e){
  console.error(e.message); console.error('--- server log ---\n' + s.log()); process.exitCode = 1;
} finally { s.stop(); }
