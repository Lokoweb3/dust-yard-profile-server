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
  assert(html.length > 300_000, `GET / returned only ${html.length} bytes, the game build looks broken`);

  // sanctions checks: region by IP, sanctioned wallets anywhere in the request
  const post = (path, body, ip) => fetch(s.base + path, { method:'POST', headers:{ 'content-type':'application/json', ...(ip ? { 'x-forwarded-for':ip } : {}) }, body:JSON.stringify(body) });
  const st = await (await fetch(s.base + '/api/compliance')).json();
  assert(st.blocked === false, '/api/compliance should not block a local request, got ' + JSON.stringify(st));
  const iran = await (await fetch(s.base + '/api/compliance', { headers:{ 'x-forwarded-for':'5.160.0.1' } })).json();
  assert(iran.blocked === true, '/api/compliance should block an Iranian IP');
  let r = await post('/api/swap/prepare', { owner:'11111111111111111111111111111111', from:'XNT', amount:1 }, '5.160.0.1');
  assert(r.status === 451, 'a swap from a blocked region should get 451, got ' + r.status);
  r = await post('/api/swap/prepare', { owner:'42RLPACwZPx3vYYmxSueqsogfynBDqXK298EDsNoyoHi', from:'XNT', amount:1 });
  assert(r.status === 451, 'a swap for a sanctioned wallet should get 451, got ' + r.status);
  r = await post('/api/market/list', { nested:{ seller:'42RLPACwZPx3vYYmxSueqsogfynBDqXK298EDsNoyoHi' } });
  assert(r.status === 451, 'a sanctioned wallet nested in a market request should get 451, got ' + r.status);
  r = await post('/api/swap/prepare', { owner:'11111111111111111111111111111111', from:'XNT', amount:1 });
  assert(r.status !== 451, 'an ordinary swap request should not be blocked by the sanctions check');

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
  console.log('Smoke test passed: health, game page, sanctions checks and squad rooms work.');
} catch (e){
  console.error(e.message); console.error('--- server log ---\n' + s.log()); process.exitCode = 1;
} finally { s.stop(); }
