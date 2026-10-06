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
const http = require('http'), fs = require('fs'), crypto = require('crypto'), zlib = require('zlib'), path = require('path');
const nacl = require('tweetnacl'), bs58 = require('bs58');
const { Connection, Keypair, PublicKey, SystemProgram, Transaction, ComputeBudgetProgram } = require('@solana/web3.js');
const {
  TOKEN_2022_PROGRAM_ID, ExtensionType, getMintLen, createInitializeNonTransferableMintInstruction,
  createInitializeMetadataPointerInstruction, createInitializeMintInstruction, getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction, createMintToInstruction, createSetAuthorityInstruction, AuthorityType
} = require('@solana/spl-token');
const { createInitializeInstruction, createUpdateFieldInstruction, pack } = require('@solana/spl-token-metadata');

const RPC = process.env.X1_RPC || 'https://rpc.mainnet.x1.xyz';
const PUBLIC_URL = (process.env.PUBLIC_URL || 'http://localhost:8787').replace(/\/$/, '');
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const DATA_DIR = process.env.DATA_DIR || './data';
const STORE_FILE = process.env.STORE_FILE || require('path').join(DATA_DIR, 'profiles.json');
const MAX_TX = 1232;
const FIELD_ORDER = ['level', 'rank', 'kills', 'headshots', 'best_wave', 'perks', 'fingerprint', 'updated'];

/* ---------- helpers ---------- */
function canonical(v){ // stable JSON so the client and server hash the same bytes
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
const sha256hex = s => crypto.createHash('sha256').update(s).digest('hex');
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

/* ---------- transaction builders ---------- */
function splitIntoTransactions(ixs, payer, signersFor, blockhash){
  const fresh = () => new Transaction({ feePayer:payer, recentBlockhash:blockhash }).add(ComputeBudgetProgram.setComputeUnitLimit({ units:600000 }));
  const txs = []; let cur = fresh();
  for (const ix of ixs){
    const trial = new Transaction({ feePayer:payer, recentBlockhash:blockhash }); trial.add(...cur.instructions, ix);
    let size; try { size = trial.serialize({ requireAllSignatures:false, verifySignatures:false }).length + 64; } catch(e){ size = MAX_TX + 1; } // +64 for the mint's signature
    if (size > MAX_TX && cur.instructions.length > 1){ txs.push(cur); cur = fresh(); }
    cur.add(ix);
  }
  if (cur.instructions.length > 1) txs.push(cur);
  return txs.map(tx => ({ tx, signers:signersFor(tx) }));
}
async function buildMint({ server, mint, owner, username, fields, rent }){
  const meta = { mint:mint.publicKey, name:`Dust Yard: @${username}`.slice(0, 32), symbol:'DYP', uri:`${PUBLIC_URL}/card/${owner.toBase58()}.json`,
    additionalMetadata:FIELD_ORDER.map(k => [k, fields[k]]) };
  const mintLen = getMintLen([ExtensionType.NonTransferable, ExtensionType.MetadataPointer]);
  const metaLen = 4 + pack(meta).length; // TLV header + packed metadata
  const lamports = await rent(mintLen + metaLen + 512); // small headroom for later field growth
  const ata = getAssociatedTokenAddressSync(mint.publicKey, owner, false, TOKEN_2022_PROGRAM_ID);
  const ixs = [
    SystemProgram.createAccount({ fromPubkey:server.publicKey, newAccountPubkey:mint.publicKey, space:mintLen, lamports, programId:TOKEN_2022_PROGRAM_ID }),
    createInitializeNonTransferableMintInstruction(mint.publicKey, TOKEN_2022_PROGRAM_ID),
    createInitializeMetadataPointerInstruction(mint.publicKey, server.publicKey, mint.publicKey, TOKEN_2022_PROGRAM_ID),
    createInitializeMintInstruction(mint.publicKey, 0, server.publicKey, null, TOKEN_2022_PROGRAM_ID),
    createInitializeInstruction({ programId:TOKEN_2022_PROGRAM_ID, metadata:mint.publicKey, updateAuthority:server.publicKey, mint:mint.publicKey, mintAuthority:server.publicKey, name:meta.name, symbol:meta.symbol, uri:meta.uri }),
    createAssociatedTokenAccountIdempotentInstruction(server.publicKey, ata, owner, mint.publicKey, TOKEN_2022_PROGRAM_ID),
    createMintToInstruction(mint.publicKey, ata, server.publicKey, 1, [], TOKEN_2022_PROGRAM_ID),
    createSetAuthorityInstruction(mint.publicKey, server.publicKey, AuthorityType.MintTokens, null, [], TOKEN_2022_PROGRAM_ID), // supply fixed at 1
    ...FIELD_ORDER.map(k => createUpdateFieldInstruction({ programId:TOKEN_2022_PROGRAM_ID, metadata:mint.publicKey, updateAuthority:server.publicKey, field:k, value:fields[k] }))
  ];
  return { ixs, signersFor:tx => tx.instructions.some(ix => ix.keys.some(k => k.isSigner && k.pubkey.equals(mint.publicKey))) ? [server, mint] : [server] };
}
function buildUpdate({ server, mint, oldFields, fields, topUp }){
  const changed = FIELD_ORDER.filter(k => oldFields[k] !== fields[k]);
  const ixs = [];
  if (topUp > 0) ixs.push(SystemProgram.transfer({ fromPubkey:server.publicKey, toPubkey:mint, lamports:topUp })); // covers metadata growth
  for (const k of changed) ixs.push(createUpdateFieldInstruction({ programId:TOKEN_2022_PROGRAM_ID, metadata:mint, updateAuthority:server.publicKey, field:k, value:fields[k] }));
  return { ixs, changed, signersFor:() => [server] };
}

/* ---------- player card served at the metadata URI ---------- */
function esc(s){ return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])); }
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


/* ---------- Social layer: leaderboard, chat, market listings, live plaza ---------- */
// Writes are signed by the player's device key (their guest key), so nobody can edit another player's rows.
const SOCIAL_FILE = () => require('path').join(DATA_DIR, 'social.json');
let social = null;
function loadSocial(){ try { social = JSON.parse(fs.readFileSync(SOCIAL_FILE(), 'utf8')); } catch(e){ social = {}; } for (const k of ['scores','chat','market']) social[k] = social[k] || {}; }
let socialDirty = false;
function saveSocialSoon(){ if (socialDirty) return; socialDirty = true; setTimeout(() => { socialDirty = false; try { fs.writeFileSync(SOCIAL_FILE() + '.tmp', JSON.stringify(social)); fs.renameSync(SOCIAL_FILE() + '.tmp', SOCIAL_FILE()); } catch(e){ console.error('social save failed', e.message); } }, 1500); }
const lastWrite = new Map();
const str = (v, n) => String(v == null ? '' : v).slice(0, n);
const num = (v, max) => { const x = Number(v); return Number.isFinite(x) ? Math.max(0, Math.min(max, Math.round(x))) : 0; };
function cleanDoc(col, d){
  d = d || {};
  if (col === 'scores'){
    const o = { callsign:str(d.callsign, 16), level:num(d.level, 50), updated:Date.now() };
    for (const m of ['yard','neon']){ if (d['best_' + m] !== undefined) o['best_' + m] = num(d['best_' + m], 1e7); if (d['wave_' + m] !== undefined) o['wave_' + m] = num(d['wave_' + m], 999); }
    return o;
  }
  if (col === 'market'){
    const link = str(d.link, 200);
    return { name:str(d.name, 16), item:str(d.item, 40), collection:str(d.collection, 30), chain:['solana','x1','other'].includes(d.chain) ? d.chain : 'other', price:str(d.price, 24), note:str(d.note, 80), link:/^https:\/\//.test(link) ? link : '', t:Date.now() };
  }
  if (col === 'chat') return { name:str(d.name, 16), text:str(d.text, 160), col:num(d.col, 0xffffff), t:Date.now() };
  return null;
}
function verifyWrite(body){
  const { col, id, op, data, ts, sig } = body || {};
  if (!['scores','market','chat'].includes(col) || !['set','update','delete','add'].includes(op)) return 'bad request';
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(id || '')) return 'bad id';
  if (Math.abs(Date.now() - Number(ts)) > 120000) return 'expired';
  const msg = canonical({ col, id, op, data:data || null, ts:Number(ts) });
  try { if (!nacl.sign.detached.verify(Buffer.from(msg), bs58.decode(sig), bs58.decode(id))) return 'bad signature'; } catch(e){ return 'bad signature'; }
  const key = id + ':' + col, wait = col === 'chat' ? 1200 : 3000;
  if (Date.now() - (lastWrite.get(key) || 0) < wait) return 'slow down';
  lastWrite.set(key, Date.now());
  return '';
}
function socialWrite(body){
  const err = verifyWrite(body); if (err) return { status:err === 'slow down' ? 429 : 401, error:err };
  const { col, id, op, data } = body;
  if (col === 'chat'){
    if (op !== 'add') return { status:400, error:'bad op' };
    const doc = cleanDoc('chat', data); if (!doc.text.trim()) return { status:400, error:'empty' };
    doc.by = id; const key = Date.now().toString(36) + crypto.randomBytes(3).toString('hex'); social.chat[key] = doc;
    const keys = Object.keys(social.chat); if (keys.length > 200) for (const k of keys.sort().slice(0, keys.length - 200)) delete social.chat[k];
    saveSocialSoon(); broadcast({ t:'chat' }); return { status:200, ok:true, id:key };
  }
  if (op === 'delete'){ delete social[col][id]; saveSocialSoon(); broadcast({ t:col }); return { status:200, ok:true }; }
  if (op === 'add') return { status:400, error:'bad op' };
  const clean = cleanDoc(col, data);
  social[col][id] = op === 'update' ? Object.assign({}, social[col][id] || {}, clean) : clean;
  if (Object.keys(social.market).length > 500) return { status:507, error:'market full' };
  saveSocialSoon(); broadcast({ t:col }); return { status:200, ok:true };
}
function socialQuery(col, order, limit){
  const rows = Object.entries(social[col] || {}).map(([id, data]) => ({ id, data })).filter(r => order ? typeof r.data[order] === 'number' : true);
  rows.sort((a, b) => (b.data[order || 't'] || 0) - (a.data[order || 't'] || 0));
  return rows.slice(0, Math.min(100, limit || 20));
}
// live plaza over WebSocket: positions are relayed, never trusted for anything important
let wss = null; const peers = new Map(); let peerSeq = 0;
function broadcast(obj){ if (!wss) return; const m = JSON.stringify(obj); for (const ws of wss.clients) if (ws.readyState === 1) ws.send(m); }
function startPlaza(server){
  const { WebSocketServer } = require('ws');
  wss = new WebSocketServer({ server, path:'/ws', maxPayload:8192 });
  wss.on('connection', ws => {
    const id = 'p' + (++peerSeq).toString(36); peers.set(id, { ws, presence:null, at:Date.now(), n:0 });
    ws.on('message', raw => {
      const p = peers.get(id); if (!p) return;
      if (++p.n > 40){ return; }   // simple flood guard, reset every second
      try { const m = JSON.parse(raw); if (m.t === 'p' && m.d && typeof m.d === 'object'){ const d = m.d;
        p.presence = { x:+d.x || 0, y:+d.y || 0, z:+d.z || 0, yaw:+d.yaw || 0, name:str(d.name, 16), col:num(d.col, 0xffffff), x1:d.x1 === true, title:str(d.title, 20),
          pet:d.pet && typeof d.pet === 'object' ? { name:str(d.pet.name, 24), mint:str(d.pet.mint, 44), image:/^https:\/\//.test(d.pet.image || '') ? str(d.pet.image, 200) : '',
            traits:d.pet.traits && typeof d.pet.traits === 'object' ? Object.fromEntries(Object.entries(d.pet.traits).slice(0, 16).map(([k, v]) => [str(k, 24), str(v, 32)])) : null } : null };
        p.at = Date.now(); } } catch(e){}
    });
    ws.on('close', () => { peers.delete(id); broadcast({ t:'left', id }); });
    ws.send(JSON.stringify({ t:'hello', id }));
  });
  setInterval(() => {
    const list = []; for (const [id, p] of peers){ p.n = 0; if (p.presence) list.push({ peer:id, presence:p.presence }); }
    for (const [id, p] of peers) if (p.ws.readyState === 1) p.ws.send(JSON.stringify({ t:'peers', me:id, peers:list }));
  }, 100);
  setInterval(() => { for (const [id, p] of peers) if (Date.now() - p.at > 60000 && !p.presence){ try { p.ws.terminate(); } catch(e){} } }, 30000);
}

/* ---------- NFT art proxy ---------- */
// NFT images live on Arweave, IPFS and similar hosts that often don't let games draw them in 3D.
// The server fetches them and passes them on, so companions can wear the real art.
const PROXY_HOSTS = /^([a-z0-9-]+\.)*(arweave\.net|ar-io\.dev|irys\.xyz|ipfs\.io|dweb\.link|nftstorage\.link|mypinata\.cloud|pinata\.cloud|cf-ipfs\.com|cloudflare-ipfs\.com|w3s\.link|shdw-drive\.genesysgo\.net|nft\.storage|githubusercontent\.com|imgur\.com|x1\.ninja)$/i;
const proxyCache = new Map(); let proxyBytes = 0;
async function proxyFetch(u){
  let url; try { url = new URL(u); } catch(e){ return { status:400 }; }
  if (url.protocol !== 'https:' || !PROXY_HOSTS.test(url.hostname)) return { status:403 };
  const hit = proxyCache.get(url.href); if (hit) return hit;
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 10000);
  try {
    const r = await fetch(url.href, { signal:ctl.signal, redirect:'follow' });
    const type = (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!r.ok || !/^(image\/(png|jpeg|gif|webp|svg\+xml)|application\/json|text\/plain)$/.test(type)) return { status:415 };
    const buf = Buffer.from(await r.arrayBuffer()); if (buf.length > 4*1048576) return { status:413 };
    const out = { status:200, type, buf };
    proxyCache.set(url.href, out); proxyBytes += buf.length;
    while (proxyBytes > 64*1048576){ const [k, v] = proxyCache.entries().next().value; proxyCache.delete(k); proxyBytes -= v.buf.length; }
    return out;
  } catch(e){ return { status:502 }; } finally { clearTimeout(tm); }
}

/* ---------- HTTP API ---------- */
async function main(){
  if (process.argv.includes('--dry-run')) return dryRun();
  fs.mkdirSync(DATA_DIR, { recursive:true });
  const keyPath = process.env.SERVER_KEYPAIR || require('path').join(DATA_DIR, 'server-keypair.json');
  if (!fs.existsSync(keyPath)){ fs.writeFileSync(keyPath, JSON.stringify(Array.from(Keypair.generate().secretKey)), { mode:0o600 }); console.log('Created a new server keypair at ' + keyPath); }
  const server = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(keyPath, 'utf8'))));
  const conn = new Connection(RPC, 'confirmed');
  const store = loadStore(); loadSocial();
  // serve the game itself from public/index.html, so one Railway address hosts both
  let game = null; const gamePath = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(gamePath)){ const raw = fs.readFileSync(gamePath); game = { raw, gz:zlib.gzipSync(raw, { level:9 }) }; console.log(`serving the game from ${gamePath} (${(raw.length/1048576).toFixed(1)} MB, ${(game.gz.length/1048576).toFixed(1)} MB gzipped)`); }
  const send = async (built) => {
    const { blockhash } = await conn.getLatestBlockhash();
    const sigs = [];
    for (const { tx, signers } of splitIntoTransactions(built.ixs, server.publicKey, built.signersFor, blockhash)){
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
        const [col, id] = q.pathname.slice(9).split('/'); const d = social[col] && social[col][id];
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
  startPlaza(httpServer);
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
