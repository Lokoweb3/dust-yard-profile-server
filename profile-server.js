/*
 * Dust Yard profile NFT server (reference implementation)
 * -------------------------------------------------------
 * Mints one soulbound (non-transferable) Token-2022 NFT per claimed player on X1 and keeps its
 * on-chain stats in sync at milestones. The server pays all fees, so players never need XNT.
 *
 *   npm install @solana/web3.js@1 @solana/spl-token@0.4 @solana/spl-token-metadata@0.1 tweetnacl bs58@5
 *   node profile-server.js --dry-run        builds sample transactions offline and prints their sizes
 *   SERVER_KEYPAIR=./server.json PUBLIC_URL=https://your-api.example node profile-server.js
 *
 * Environment:
 *   X1_RPC          default https://rpc.mainnet.x1.xyz
 *   SERVER_KEYPAIR  path to a Solana-format keypair JSON (the fee payer and NFT authority). Keep a small XNT float only.
 *                   If it doesn't exist yet, one is created there on first start and its address is printed in the logs.
 *   DATA_DIR        folder for the keypair and profile store, default ./data (mount a Railway volume here: /data)
 *   PUBLIC_URL      public base URL of this server, used in each NFT's metadata URI
 *   ALLOWED_ORIGIN  your game's origin, for example https://your-game.netlify.app
 *   PORT            default 8787
 *
 * Production notes: replace the JSON file store with a real database, put this behind HTTPS,
 * and replace validateSummary() with checks against your server-recorded match sessions.
 */
// Each part of the server lives in lib/: see the README for a map.
const http = require('http'), fs = require('fs'), crypto = require('crypto'), zlib = require('zlib'), path = require('path'), nacl = require('tweetnacl'), bs58 = require('bs58');
const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { badgesRoute } = require('./lib/badges');
const { buildMint, buildUpdate, splitIntoTransactions, withFittedLimit } = require('./lib/chain');
const { ALLOWED_ORIGIN, DATA_DIR, PUBLIC_URL, RPC } = require('./lib/config');
const { itemsRoute, loadItems } = require('./lib/items');
const { loadMarket, marketRoute } = require('./lib/market');
const { portfolioRoute } = require('./lib/portfolio');
const { cardSvg, fieldsFor, loadStore, saveStore, syncMessage, validateSummary } = require('./lib/profiles');
const { proxyFetch } = require('./lib/proxy');
const { getSocial, loadSocial, pruneChat, socialQuery, socialWrite, startPlaza } = require('./lib/social');
const { keys } = require('./lib/state');
const { screen, status:complianceStatus, startSanctionsRefresh } = require('./lib/compliance');
const { swapRoute } = require('./lib/swap');
const { sha256hex } = require('./lib/util');

/* ---------- HTTP API ---------- */
async function main(){
  if (process.argv.includes('--dry-run')) return dryRun();
  fs.mkdirSync(DATA_DIR, { recursive:true });
  const keyPath = process.env.SERVER_KEYPAIR || require('path').join(DATA_DIR, 'server-keypair.json');
  if (!fs.existsSync(keyPath)){ fs.writeFileSync(keyPath, JSON.stringify(Array.from(Keypair.generate().secretKey)), { mode:0o600 }); console.log('Created a new server keypair at ' + keyPath); }
  const server = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(keyPath, 'utf8'))));
  const conn = new Connection(RPC, 'confirmed');
  const store = loadStore(); loadSocial(); pruneChat(); loadItems(); loadMarket();
  keys.server = server; keys.secret = server.secretKey;
  // serve the game itself from public/index.html, so one Railway address hosts both
  let game = null; const gamePath = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(gamePath)){ const raw = fs.readFileSync(gamePath); game = { raw, gz:zlib.gzipSync(raw, { level:9 }) }; console.log(`serving the game from ${gamePath} (${(raw.length/1048576).toFixed(1)} MB, ${(game.gz.length/1048576).toFixed(1)} MB gzipped)`); }
  const assetCache = new Map();
  const send = async (built) => {
    const { blockhash } = await conn.getLatestBlockhash();
    const sigs = [];
    for (const { tx, signers } of splitIntoTransactions(built.ixs, server.publicKey, built.signersFor, blockhash)){
      await withFittedLimit(conn, tx, 200000);
      tx.sign(...signers); const sig = await conn.sendRawTransaction(tx.serialize()); await conn.confirmTransaction(sig, 'confirmed'); sigs.push(sig);
    }
    return sigs;
  };
  const httpServer = http.createServer(async (req, res) => {
    const reply = (code, obj, type) => { res.writeHead(code, { 'Content-Type':type || 'application/json', 'Access-Control-Allow-Origin':ALLOWED_ORIGIN, 'Access-Control-Allow-Headers':'content-type', 'Cache-Control':'no-store' }); res.end(type ? obj : JSON.stringify(obj)); };
    try {
      if (req.method === 'OPTIONS') return reply(204, '', 'text/plain');
      if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?') || req.url === '/index.html') && game){
        const gz = /gzip/.test(req.headers['accept-encoding'] || '');
        res.writeHead(200, { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-cache', ...(gz ? { 'Content-Encoding':'gzip' } : {}) });
        return res.end(gz ? game.gz : game.raw);
      }
      // models and textures, named by content hash, so browsers may cache them forever
      const asset = req.method === 'GET' && req.url.match(/^\/assets\/([\w-]+\.[0-9a-f]{10}\.(glb|jpg|png))$/);
      if (asset){
        let a = assetCache.get(asset[1]);
        if (!a){
          const file = path.join(__dirname, 'public', 'assets', asset[1]);
          if (!fs.existsSync(file)) return reply(404, { error:'not found' });
          const raw = fs.readFileSync(file); a = { raw, gz:asset[2] === 'glb' ? zlib.gzipSync(raw, { level:9 }) : null, type:{ glb:'model/gltf-binary', jpg:'image/jpeg', png:'image/png' }[asset[2]] };
          assetCache.set(asset[1], a);
        }
        const gz = a.gz && /gzip/.test(req.headers['accept-encoding'] || '');
        res.writeHead(200, { 'Content-Type':a.type, 'Cache-Control':'public, max-age=31536000, immutable', 'Access-Control-Allow-Origin':'*', ...(gz ? { 'Content-Encoding':'gzip' } : {}) });
        return res.end(gz ? a.gz : a.raw);
      }
      if (req.method === 'GET' && (req.url === '/' || req.url === '/health')){
        let xnt = null; try { xnt = (await conn.getBalance(server.publicKey))/1e9; } catch(e){}
        return reply(200, { ok:true, feePayer:server.publicKey.toBase58(), feePayerXnt:xnt, profiles:Object.keys(store.profiles).length });
      }
      const card = req.url.match(/^\/card\/([1-9A-HJ-NP-Za-km-z]{32,44})\.(json|svg)$/);
      if (card){
        const p = store.profiles[card[1]]; if (!p) return reply(404, { error:'not found' });
        if (card[2] === 'svg') return reply(200, cardSvg(p), 'image/svg+xml');
        return reply(200, { name:`Dust Yard: @${p.summary.username}`, symbol:'DYP', description:'Soulbound Dust Yard player profile. Stats are updated by the game server at milestones.',
          image:`${PUBLIC_URL}/card/${card[1]}.svg`, attributes:Object.entries(fieldsFor(p.summary, p.fingerprint)).map(([trait_type, value]) => ({ trait_type, value })) });
      }
      const q = new URL(req.url, 'http://x');
      // sanctions checks before anything that builds or signs a transaction
      if (req.method === 'GET' && q.pathname === '/api/compliance') return reply(200, complianceStatus(req));
      const screened = await screen(req, q.pathname);
      if (screened.blocked) return reply(screened.blocked.status, { error:screened.blocked.error });
      req = screened.req;
      if (q.pathname === '/api/portfolio'){
        try { const handled = await portfolioRoute(req, res, q, reply, conn); if (handled !== false) return; } catch(e){ console.error('portfolio error', e.message); return reply(400, { error:'portfolio unavailable right now' }); }
      }
      if (q.pathname.startsWith('/api/swap/')){
        try { const handled = await swapRoute(req, res, q, reply, conn); if (handled !== false) return; } catch(e){ console.error('swap error', e.message); return reply(400, { error:'swap unavailable right now' }); }
      }
      if (q.pathname.startsWith('/api/badges') || q.pathname.startsWith('/badge')){
        try { const handled = await badgesRoute(req, res, q, reply, conn, store, send); if (handled !== false) return; } catch(e){ return reply(400, { error:'bad request' }); }
      }
      if (q.pathname.startsWith('/api/market/')){
        try { const handled = await marketRoute(req, res, q, reply, conn); if (handled !== false) return; } catch(e){ console.error('market error', e.message); return reply(400, { error:'bad request' }); }
      }
      if (q.pathname.startsWith('/api/items') || q.pathname.startsWith('/api/match') || q.pathname.startsWith('/api/drops') || q.pathname.startsWith('/item')){
        try { const handled = await itemsRoute(req, res, q, reply, server); if (handled !== false) return; } catch(e){ return reply(400, { error:'bad request' }); }
      }
      if (req.method === 'GET' && q.pathname === '/proxy'){
        const r = await proxyFetch(q.searchParams.get('u') || '');
        if (r.status !== 200) return reply(r.status, { error:'cannot load that file' });
        res.writeHead(200, { 'Content-Type':r.type, 'Cache-Control':'public, max-age=86400', 'Access-Control-Allow-Origin':'*', 'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'", 'X-Content-Type-Options':'nosniff' });
        return res.end(r.buf);
      }
      if (req.method === 'GET' && q.pathname.startsWith('/api/col/')){
        const col = q.pathname.slice(9); if (!['scores','market','chat'].includes(col)) return reply(404, { error:'not found' });
        return reply(200, { rows:socialQuery(col, q.searchParams.get('order'), +q.searchParams.get('limit') || 20) });
      }
      if (req.method === 'GET' && q.pathname.startsWith('/api/doc/')){
        const [col, id] = q.pathname.slice(9).split('/'); const d = getSocial()[col] && getSocial()[col][id];
        return reply(200, { exists:!!d, data:d || null });
      }
      if (req.method === 'POST' && q.pathname === '/api/write'){
        let b = ''; for await (const c of req){ b += c; if (b.length > 8000) return reply(413, { error:'too large' }); }
        let body; try { body = JSON.parse(b); } catch(e){ return reply(400, { error:'bad json' }); }
        const r = socialWrite(body); return reply(r.status, r.error ? { error:r.error } : r);
      }
      if (req.method !== 'POST' || req.url !== '/profile/sync') return reply(404, { error:'not found' });
      let body = ''; for await (const c of req){ body += c; if (body.length > 20000) return reply(413, { error:'too large' }); }
      const { request:r, walletSig } = JSON.parse(body);
      // 1. signature, freshness, replay
      if (!r || !['mint','update'].includes(r.action)) return reply(400, { error:'bad request' });
      const owner = new PublicKey(r.wallet);
      if (!nacl.sign.detached.verify(Buffer.from(syncMessage(r)), bs58.decode(walletSig), owner.toBytes())) return reply(401, { error:'signature did not verify' });
      if (Math.abs(Date.now() - Date.parse(r.issuedAt)) > 5*60000) return reply(401, { error:'request expired' });
      if (store.nonces[r.nonce]) return reply(409, { error:'nonce already used' });
      store.nonces[r.nonce] = Date.now();
      // 2. stats sanity (replace with session checks)
      const prev = store.profiles[r.wallet];
      const summary = Object.assign({}, r.summary, { username:r.username, updated:Math.floor(Date.now()/1000) });
      const err = validateSummary(prev && Object.assign({}, prev.summary, { syncedAt:prev.syncedAt }), summary);
      if (err){ console.log(`sync rejected for ${r.wallet}: ${err}`); return reply(422, { error:err }); }
      if (prev && prev.summary.username !== r.username) return reply(409, { error:'username mismatch' });
      if (!prev && Object.values(store.profiles).some(p => p.summary.username === r.username)) return reply(409, { error:'username taken' });
      const fields = fieldsFor(summary, r.fingerprint);
      // 3. mint once, then update only changed fields
      let sigs, mint;
      if (!prev){
        const mintKp = Keypair.generate(); mint = mintKp.publicKey.toBase58();
        store.profiles[r.wallet] = { mint, summary, fingerprint:r.fingerprint, fields, syncedAt:Date.now(), pending:true }; saveStore(store); // reserve before sending
        sigs = await send(await buildMint({ server, mint:mintKp, owner, username:r.username, fields, rent:n => conn.getMinimumBalanceForRentExemption(n) }));
      } else {
        mint = prev.mint;
        const info = await conn.getAccountInfo(new PublicKey(mint));
        const need = await conn.getMinimumBalanceForRentExemption(info.data.length + 256);
        const built = buildUpdate({ server, mint:new PublicKey(mint), oldFields:prev.fields, fields, topUp:Math.max(0, need - info.lamports) });
        sigs = built.changed.length ? await send(built) : [];
      }
      store.profiles[r.wallet] = { mint, summary, fingerprint:r.fingerprint, fields, syncedAt:Date.now() }; saveStore(store);
      reply(200, { ok:true, mint, signatures:sigs });
    } catch(e){ console.error(e); reply(500, { error:'server error' }); }
  });
  startPlaza(httpServer); startSanctionsRefresh();
  httpServer.listen(+process.env.PORT || 8787, '0.0.0.0', () => console.log(`profile server on ${PUBLIC_URL}, fee payer ${server.publicKey.toBase58()}`));
}

/* ---------- offline check: builds sample transactions without touching the network ---------- */
async function dryRun(){
  const server = Keypair.generate(), mint = Keypair.generate(), owner = Keypair.generate().publicKey, bh = bs58.encode(crypto.randomBytes(32));
  const summary = { username:'skullking', level:12, rank:'Corporal', kills:4821, headshots:1310, bestWave:17, perks:['XNT Holder','NFT Collector'], updated:1760000000 };
  const fields = fieldsFor(summary, sha256hex('example-detail-record'));
  const m = await buildMint({ server, mint, owner, username:summary.username, fields, rent:async n => n*6960 });
  const mtx = splitIntoTransactions(m.ixs, server.publicKey, m.signersFor, bh);
  mtx.forEach(({ tx, signers }, i) => { tx.sign(...signers); console.log(`mint tx ${i + 1}: ${tx.instructions.length} instructions, ${tx.serialize().length} bytes, signers ${signers.length}`); });
  const next = Object.assign({}, summary, { level:13, kills:5200, bestWave:18, updated:1760003600 });
  const u = buildUpdate({ server, mint:mint.publicKey, oldFields:fields, fields:fieldsFor(next, sha256hex('example-detail-record-2')), topUp:20000 });
  splitIntoTransactions(u.ixs, server.publicKey, u.signersFor, bh).forEach(({ tx, signers }, i) => { tx.sign(...signers); console.log(`update tx ${i + 1}: ${tx.instructions.length} instructions, ${tx.serialize().length} bytes, fields ${u.changed.join(', ')}`); });
  console.log('validation (good):', validateSummary(Object.assign({}, summary, { syncedAt:Date.now() - 3.6e6 }), next) || 'ok');
  console.log('validation (backwards):', validateSummary(Object.assign({}, next, { syncedAt:Date.now() }), summary));
  const msg = syncMessage({ wallet:owner.toBase58(), username:'skullking', action:'update', summary:next, fingerprint:'ab'.repeat(32), nonce:'n1', issuedAt:new Date().toISOString() });
  console.log('signed message preview:\n' + msg);
}
main();
