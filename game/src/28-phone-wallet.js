/* ---------- NFT marketplace screen ---------- */
let mkView = 'browse', mkFilter = 'all', mkSearch = '', mkSel = null;
const artCache = new Map();
function hashStr(s){ let h = 2166136261; for (let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
// generated card art for a listing (outside images can't load here)
function nftArtCanvas(L){
  const key = `${L.collection}|${L.item}`;
  if (artCache.has(key)) return artCache.get(key);
  const h = hashStr(key), c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  const h1 = h % 360, h2 = (h1 + 40 + (h >> 9) % 140) % 360;
  const gr = g.createLinearGradient(0,0,256,256); gr.addColorStop(0, `hsl(${h1},70%,32%)`); gr.addColorStop(1, `hsl(${h2},75%,18%)`); g.fillStyle = gr; g.fillRect(0,0,256,256);
  g.globalAlpha = .18; const k = (h >> 5) % 3;
  for (let i=0;i<14;i++){ g.fillStyle = `hsl(${(h1 + i*25) % 360},80%,65%)`; const x = (h >> (i % 20)) % 256, y = (i*53 + (h >> 11)) % 256, r = 20 + (i*37 % 60);
    g.beginPath(); if (k === 0) g.arc(x,y,r,0,Math.PI*2); else if (k === 1) g.rect(x - r/2, y - r/2, r, r); else { g.moveTo(x, y - r); g.lineTo(x + r, y + r); g.lineTo(x - r, y + r); } g.fill(); }
  g.globalAlpha = 1;
  const num = String(L.item || '').match(/#\s?\d+/), label = num ? num[0].replace(/\s/,'') : String(L.item || L.collection || '?').split(/\s+/).map(w => w[0]).join('').slice(0,3).toUpperCase();
  g.fillStyle = 'rgba(255,255,255,.92)'; g.font = `700 ${label.length > 4 ? 56 : 76}px "Barlow Condensed", Arial`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 12; g.fillText(label, 128, 120);
  g.shadowBlur = 0; g.font = '600 22px "Barlow Condensed", Arial'; g.fillStyle = 'rgba(255,255,255,.75)'; g.fillText(String(L.collection || 'NFT').slice(0,22).toUpperCase(), 128, 200);
  artCache.set(key, c); return c;
}
const CHAIN_LABEL = { solana:'Solana', x1:'X1', other:'Other' };
function safeLink(u){ try { const x = new URL(String(u || '')); return x.protocol === 'https:' ? x : null; } catch(e){ return null; } }
// the in-world trade board shows the newest listings live
const boardArt = new Map();
function drawBoard(){
  const g = boardCanvas.getContext('2d');
  g.fillStyle = '#0b1020'; g.fillRect(0,0,1024,576); g.strokeStyle = '#2ee6ff'; g.lineWidth = 8; g.shadowColor = '#2ee6ff'; g.shadowBlur = 24; g.strokeRect(16,16,992,544); g.shadowBlur = 0;
  g.textAlign = 'center'; g.fillStyle = '#2ee6ff'; g.font = '700 64px "Barlow Condensed", Arial'; g.fillText('NFT TRADE BOARD', 512, 92);
  // NFTs for sale on your server first, then board posts
  const forSale = (typeof nftListings !== 'undefined' ? nftListings : []).map(l => ({ item:l.name, collection:l.symbol, chain:'x1', price:`${(l.lamports/1e9).toLocaleString(undefined, { maximumFractionDigits:2 })} XNT`, image:l.image }));
  const list = forSale.concat(myListings).slice(0,4);
  if (!list.length){ g.fillStyle = '#f4ecdc'; g.font = '600 44px "Barlow Condensed", Arial'; g.fillText('No listings yet. Be the first to sell.', 512, 300); }
  list.forEach((L,i) => {
    const x = 52 + i*236, y = 130; g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(x, y, 216, 330);
    const art = L.image && boardArt.get(L.image);
    if (art && art.ok) g.drawImage(art.img, x + 8, y + 8, 200, 200); else g.drawImage(nftArtCanvas(L), x + 8, y + 8, 200, 200);
    if (L.image && !art){ const img = new Image(); img.crossOrigin = 'anonymous'; const rec = { img, ok:false }; boardArt.set(L.image, rec); img.onload = () => { rec.ok = true; drawBoard(); }; img.src = viaProxy(L.image); }
    g.textAlign = 'left'; g.fillStyle = '#f4ecdc'; g.font = '600 28px "Barlow Condensed", Arial'; g.fillText(String(L.item || '').slice(0,16), x + 10, y + 244);
    g.fillStyle = '#9cc3ff'; g.font = '500 22px "Barlow Condensed", Arial'; g.fillText(`${CHAIN_LABEL[L.chain] || 'NFT'}  ${String(L.collection || '').slice(0,14)}`, x + 10, y + 274);
    g.fillStyle = '#f0a93b'; g.font = '700 30px "Barlow Condensed", Arial'; g.fillText(String(L.price || '').slice(0,14), x + 10, y + 314);
  });
  g.textAlign = 'center'; g.fillStyle = 'rgba(244,236,220,.8)'; g.font = '500 30px "Barlow Condensed", Arial';
  g.fillText(padActive ? 'Walk up and press Square to browse' : isTouch ? 'Walk up and tap Trade to browse' : 'Walk up and click or press E to browse', 512, 530);
  boardTex.needsUpdate = true;
}
function drawMarket(){
  $('mkTabs').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === mkView));
  $('mkBrowse').hidden = mkView !== 'browse'; $('mkSell').hidden = mkView !== 'sell'; $('mkDetail').hidden = mkView !== 'detail';
  const nftv = mkView === 'nftbuy' || mkView === 'nftsell'; $('mkNft').hidden = !nftv; $('mkTabs').querySelectorAll('.srvOnly').forEach(b => { b.hidden = !srvMode; });
  const warn = document.querySelector('#marketPanel .mkWarn');
  if (warn) warn.textContent = nftv ? 'Buy and sell NFTs for XNT, signed in your own wallet. Your NFT stays in your wallet until it sells, and payment and NFT move together in one transaction. Never share your seed phrase.' : 'Board posts are messages from other players. Trades arranged here happen outside the game, so only deal with people you trust and never share your seed phrase.';
  if (nftv){ drawNftMarket($('mkNft')); return; }
  $('mkFilters').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.f === mkFilter));
  if (mkView === 'browse'){
    const grid = $('mkGrid'); grid.innerHTML = '';
    const q = mkSearch.toLowerCase();
    const shown = myListings.filter(L => (mkFilter === 'all' || L.chain === mkFilter) && (!q || `${L.item} ${L.collection} ${L.name}`.toLowerCase().includes(q)));
    $('mkEmpty').textContent = !net.db ? 'The marketplace is unavailable in this view.' : !myListings.length ? 'No listings yet. Open the Sell tab to post the first one.' : !shown.length ? 'Nothing matches that filter.' : '';
    for (const L of shown){
      const b = document.createElement('button'); b.className = 'nftCard' + (L.id === lbId ? ' me' : '');
      const img = document.createElement('img'); img.alt = ''; img.src = nftArtCanvas(L).toDataURL('image/jpeg', .8);
      const t = document.createElement('b'); t.textContent = String(L.item || 'Untitled').slice(0,40);
      const m = document.createElement('span'); m.textContent = `${CHAIN_LABEL[L.chain] || 'NFT'}${L.collection ? ', ' + String(L.collection).slice(0,30) : ''}`;
      const p = document.createElement('em'); p.textContent = String(L.price || 'Make an offer').slice(0,24);
      b.append(img, t, m, p); b.addEventListener('click', () => { mkSel = L; mkView = 'detail'; drawMarket(); }); grid.appendChild(b);
    }
  } else if (mkView === 'detail' && mkSel){
    const L = mkSel;
    $('mkDImg').src = nftArtCanvas(L).toDataURL('image/jpeg', .9);
    $('mkDName').textContent = String(L.item || 'Untitled').slice(0,40);
    $('mkDCol').textContent = `${String(L.collection || 'Unknown collection').slice(0,30)} on ${CHAIN_LABEL[L.chain] || 'another chain'}`;
    $('mkDPrice').textContent = String(L.price || 'Make an offer').slice(0,24);
    $('mkDSeller').textContent = `Listed by ${String(L.name || 'Degen').slice(0,16)}, ${ago(L.t || 0)}`;
    $('mkDNote').textContent = L.note ? String(L.note).slice(0,80) : '';
    const u = safeLink(L.link);
    $('mkDLink').hidden = !u; if (u){ $('mkDLink').href = u.href; $('mkDLink').textContent = `View on ${u.hostname}`; }
  } else if (mkView === 'sell'){
    const mine = myListings.find(L => L.id === lbId);
    $('mkItem').value = mine ? mine.item || '' : ''; $('mkCol').value = mine ? mine.collection || '' : ''; $('mkChain').value = mine ? mine.chain || 'solana' : 'solana';
    $('mkPrice').value = mine ? mine.price || '' : ''; $('mkLink').value = mine ? mine.link || '' : ''; $('mkNote').value = mine ? mine.note || '' : '';
    $('mkRemove').hidden = !mine; $('mkPost').textContent = mine ? 'Update listing' : 'Post listing';
    $('mkForm').hidden = !(net.db && lbId); $('mkNoPost').hidden = !!(net.db && lbId);
  }
}
async function postListing(){
  if (acct && !acct.claimed){ maybePrompt('market'); return; }
  if (!net.db || !lbId) return;
  const item = $('mkItem').value.trim().slice(0,40), collection = $('mkCol').value.trim().slice(0,30), chain = ['solana','x1','other'].includes($('mkChain').value) ? $('mkChain').value : 'other';
  const price = $('mkPrice').value.trim().slice(0,24), note = $('mkNote').value.trim().slice(0,80), linkRaw = $('mkLink').value.trim().slice(0,200);
  if (!item){ $('mkMsg').textContent = 'Add the NFT name first, for example Degen Skull #503.'; return; }
  if (linkRaw && !safeLink(linkRaw)){ $('mkMsg').textContent = 'The marketplace link must start with https://'; return; }
  try { await net.db.doc('market/' + lbId).set({ name:callsign(), item, collection, chain, price, note, link:linkRaw, t:Date.now() }); $('mkMsg').textContent = 'Your listing is live.'; mkView = 'browse'; drawMarket(); }
  catch(e){ $('mkMsg').textContent = "Couldn't post. Listing needs contributor access to this page."; }
}

/* ---------- In-game phone with X1 wallet ---------- */
let phoneApp = 'home', x1Addr = store.get('dustyard-x1addr') || '', x1Verified = false, x1WalletName = '', x1Active = null, x1Bal = null, x1Msg = '';
const x1Wallets = [];
function addWallet(w){
  if (!w || !w.name || x1Wallets.some(x => x.w === w)) return;
  if (!w.features || !w.features['standard:connect']) return;
  const ch = (w.chains || []).map(String), feats = Object.keys(w.features || {});
  if (ch.length && !ch.some(c => /^(solana|x1|svm)[:-]/i.test(c)) && !feats.some(f => /^(solana|x1|svm):/i.test(f))) return;
  x1Wallets.push({ name:String(w.name).slice(0,24), w, std:true });
  if (phoneApp === 'wallet' && !$('phone').hidden) renderPhone();
}
// Wallet Standard discovery (Backpack, X1 Wallet and other Solana-family wallets announce themselves this way)
try {
  const api = { register:(...ws) => { ws.forEach(addWallet); return () => {}; } };
  addEventListener('wallet-standard:register-wallet', e => { try { e.detail(api); } catch(err){} });
  dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail:api }));
} catch(e){}
function legacyWallets(){
  const out = [], seen = new Set(x1Wallets.map(x => x.w));
  const add = (name, p, src) => { if (p && typeof p === 'object' && typeof p.connect === 'function' && (typeof p.signMessage === 'function' || 'publicKey' in p || typeof p.signTransaction === 'function') && !seen.has(p) && !out.some(x => x.p === p)) out.push({ name, p, std:false, src:src || name }); };
  const g = window;
  try {
    add('X1 Wallet', g.x1Wallet, 'window.x1Wallet'); add('X1 Wallet', g.x1wallet, 'window.x1wallet'); add('X1 Wallet', g.x1 && (g.x1.solana || g.x1), 'window.x1'); add('X1 Wallet', g.x1Wallet && g.x1Wallet.solana, 'window.x1Wallet.solana');
    add('Backpack', g.backpack && (g.backpack.solana || g.backpack), 'window.backpack'); add('Backpack', g.xnft && g.xnft.solana, 'window.xnft.solana');
    add('Phantom', g.phantom && g.phantom.solana, 'window.phantom.solana'); add('Solflare', g.solflare, 'window.solflare');
    // any other injected wallet object that looks like a Solana-style provider
    for (const k of Object.keys(g)){
      if (!/wallet|solana|x1|xnt|backpack/i.test(k)) continue;
      let v; try { v = g[k]; } catch(e){ continue; }
      if (v && typeof v === 'object'){ add(k, v, 'window.' + k); if (v.solana) add(k, v.solana, 'window.' + k + '.solana'); }
    }
    add(g.solana && g.solana.isX1 ? 'X1 Wallet' : 'Solana wallet', g.solana, 'window.solana');
  } catch(e){}
  return out;
}
const isAddr = a => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a || '');
const shortAddr = a => a ? a.slice(0,4) + '...' + a.slice(-4) : '';
let x1Wait = 0, x1Ticket = 0;
function walletBrand(w){
  const n = String(w.name || '').toLowerCase(), p = w.p || {};
  if (/x1/.test(n) || p.isX1 || p.isX1Wallet) return 'X1 Wallet';
  if (/backpack|xnft/.test(n) || p.isBackpack) return 'Backpack';
  if (/phantom/.test(n) || p.isPhantom) return 'Phantom';
  if (/solflare/.test(n) || p.isSolflare) return 'Solflare';
  return w.name;
}
// group every way a wallet announced itself under one button, Wallet Standard first
function walletOptions(){
  const groups = new Map();
  for (const w of [...x1Wallets, ...legacyWallets()]){
    const b = walletBrand(w); if (!groups.has(b)) groups.set(b, { name:b, cands:[] });
    const g = groups.get(b); if (!g.cands.some(c => (c.w && c.w === w.w) || (c.p && c.p === w.p))) g.cands.push(w);
  }
  const order = ['X1 Wallet','Backpack','Phantom','Solflare'];
  return [...groups.values()].sort((a,b) => (order.indexOf(a.name) + 1 || 9) - (order.indexOf(b.name) + 1 || 9));
}
async function connectOne(entry){
  requireCrypto();
  const ask = entry.std ? entry.w.features['standard:connect'].connect() : entry.p.connect();
  const r = await Promise.race([ask, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 60000))]);
  let addr = '';
  if (entry.std){ const acc = (r && r.accounts) || entry.w.accounts || []; addr = acc[0] ? acc[0].address : ''; }
  else { const pk = (r && r.publicKey) || entry.p.publicKey; addr = pk ? String(pk.toBase58 ? pk.toBase58() : pk) : ''; }
  if (!isAddr(addr)) throw new Error('The wallet did not share an address');
  return addr;
}
async function connectWallet(group){
  const ticket = ++x1Ticket; x1Wait = ticket;
  const name = group.name, cands = group.cands || [group];
  x1Msg = `Waiting for ${name}... Approve the request in the wallet window. If no window appeared, click the ${name} icon in your browser toolbar (it may be under the puzzle-piece icon) and make sure it is unlocked.`;
  renderPhone();
  let lastErr = null;
  for (const entry of cands){
    try {
      const addr = await connectOne(entry);
      if (ticket !== x1Wait) return;
      x1Addr = addr; x1Active = entry; x1WalletName = name; x1Verified = false; x1Bal = null; x1Msg = '';
      store.set('dustyard-x1addr', addr); x1Wait = 0; fetchBalance(); renderPhone(); return;
    } catch(e){
      if (ticket !== x1Wait) return;
      lastErr = e; const m = String((e && (e.message || e.code)) || '');
      if (m === 'timeout' || /reject|cancel|denied|declin/i.test(m)) break;   // the wallet answered or the player gave up: don't open a second request
    }
  }
  const m = String((lastErr && (lastErr.message || lastErr.code)) || '').slice(0,120);
  x1Msg = m === 'timeout' ? `${name} didn't respond. Open it from your browser toolbar, unlock it, then tap Connect again.`
    : /reject|cancel|denied|declin/i.test(m) ? 'The connection was declined in your wallet.'
    : `Couldn't connect${m ? ': ' + m : ''}. Make sure ${name} is unlocked, then try again.`;
  x1Wait = 0; renderPhone();
}
function cancelConnect(){ x1Wait = 0; x1Msg = 'Connection cancelled.'; renderPhone(); }
async function verifyWallet(){
  if (!x1Active) return;
  const text = `Dust Yard: verify wallet ownership\nCallsign: ${callsign()}\nAddress: ${x1Addr}\nNonce: ${Math.random().toString(36).slice(2)}\nTime: ${new Date().toISOString()}`;
  const bytes = new TextEncoder().encode(text);
  x1Msg = 'Approve the signature in your wallet. It is free and moves no funds.'; renderPhone();
  try {
    if (x1Active.std){
      const f = x1Active.w.features['solana:signMessage']; if (!f) throw new Error('unsupported');
      const acct = x1Active.w.accounts.find(a => a.address === x1Addr) || x1Active.w.accounts[0];
      await f.signMessage({ account:acct, message:bytes });
    } else await x1Active.p.signMessage(bytes, 'utf8');
    x1Verified = true; x1Msg = 'Wallet verified. Players now see an X1 badge on your name tag.'; presT = 0;
  } catch(e){ x1Msg = 'Signature was cancelled.'; }
  renderPhone();
}
// XNT/USD from the XNT/USDC.X pool on XDEX, read straight from the X1 chain
const XDEX_PROG = 'sEsYH97wqmfnkzHedjNcw3zyJdPvUmsa9AixhS4b4fN', USDCX_MINT = 'B69chRzqzDCmdB5WYB8NRu5Yv5ZA95ABiZcdzCgGm9Tq', WXNT_MINT = 'So11111111111111111111111111111111111111112';
const XNT_POOL_FALLBACK = { xnt:'8wvV4HKBDFMLEUkVWp1WPNa5ano99XCm3f9t3troyLb', usd:'7iw2adw8Af7x3pY7gj5RwczFXuGjCoX92Gfy3avwXQtg' };
let xntUsd = null, xntUsdAt = 0, xntVaults = null;
async function findXntPool(){
  const pairs = [];
  for (const [a, b, flip] of [[WXNT_MINT, USDCX_MINT, false], [USDCX_MINT, WXNT_MINT, true]]){
    const r = await x1rpc('getProgramAccounts', [XDEX_PROG, { encoding:'base64', dataSlice:{ offset:72, length:64 }, filters:[{ memcmp:{ offset:168, bytes:a } }, { memcmp:{ offset:200, bytes:b } }] }], 20000);
    for (const acc of r){ const d = b64bytes(acc.account.data[0]), v0 = b58(d.subarray(0,32)), v1 = b58(d.subarray(32,64)); pairs.push(flip ? { xnt:v1, usd:v0 } : { xnt:v0, usd:v1 }); }
  }
  if (!pairs.length) return XNT_POOL_FALLBACK;
  const r = await x1rpc('getMultipleAccounts', [pairs.map(p => p.usd), { encoding:'jsonParsed' }]);
  let best = pairs[0], bu = -1;
  r.value.forEach((acc, i) => { const u = acc ? +acc.data.parsed.info.tokenAmount.uiAmount : 0; if (u > bu){ bu = u; best = pairs[i]; } });
  return best;
}
async function fetchXntPrice(){
  if (xntUsd !== null && Date.now() - xntUsdAt < 120000) return xntUsd;
  try {
    if (!xntVaults){ try { xntVaults = await findXntPool(); } catch(e){ xntVaults = XNT_POOL_FALLBACK; } }
    const r = await x1rpc('getMultipleAccounts', [[xntVaults.xnt, xntVaults.usd], { encoding:'jsonParsed' }]);
    const x = +r.value[0].data.parsed.info.tokenAmount.uiAmount, u = +r.value[1].data.parsed.info.tokenAmount.uiAmount;
    if (x > 0 && u > 0){ xntUsd = u/x; xntUsdAt = Date.now(); }
  } catch(e){}
  return xntUsd;
}
function fmtUsd(v){ return '$' + v.toLocaleString(undefined, { minimumFractionDigits:2, maximumFractionDigits:v < 1 ? 4 : 2 }); }
async function fetchBalance(){
  if (!isAddr(x1Addr)) return;
  x1Bal = 'loading'; holder.loading = true; renderPhone();
  const addr = x1Addr;
  try { const h = await x1Holdings(addr); if (addr !== x1Addr) return; Object.assign(holder, h, { addr, checked:true }); x1Bal = h.xnt; }
  catch(e){ x1Bal = 'na'; holder.checked = false; }
  holder.loading = false; computePerks(); renderPhone(); renderAcctChip();
  computeOwnedItems().then(() => { if (phoneApp === 'items') renderPhone(); showTrophies(); });
  if (typeof x1Bal === 'number') fetchXntPrice().then(p => { if (p) renderPhone(); });
}
function disconnectWallet(){
  try { if (x1Active && x1Active.std && x1Active.w.features['standard:disconnect']) x1Active.w.features['standard:disconnect'].disconnect(); else if (x1Active && x1Active.p && x1Active.p.disconnect) x1Active.p.disconnect(); } catch(e){}
  x1Active = null; x1Addr = ''; x1Verified = false; x1Bal = null; x1Msg = ''; store.set('dustyard-x1addr', ''); presT = 0; renderPhone();
}
function phoneBtn(label, fn, cls){ const b = document.createElement('button'); b.type = 'button'; b.className = 'phBtn' + (cls ? ' ' + cls : ''); b.textContent = label; b.addEventListener('click', fn); return b; }
function phoneLine(text, cls){ const p = document.createElement('p'); if (cls) p.className = cls; p.textContent = text; return p; }
function renderPhone(){
  try { computePerks(); } catch(e){}
  const now = new Date(); $('phTime').textContent = now.getHours() + ':' + String(now.getMinutes()).padStart(2,'0');
  const body = $('phBody'); body.innerHTML = '';
  if (phoneApp === 'home'){
    const grid = document.createElement('div'); grid.className = 'phGrid';
    for (const [icon, name, fn] of [['👛','X1 Wallet',() => { phoneApp = 'wallet'; renderPhone(); }], ['🖼️','My NFTs',() => { galSel = null; phoneApp = 'gallery'; renderPhone(); if (isAddr(x1Addr) && !holder.checked && !holder.loading) fetchBalance(); }], ['📊','Portfolio',() => { phoneApp = 'portfolio'; renderPhone(); }], ['💱','Swap',() => { phoneApp = 'swap'; x1Msg = ''; renderPhone(); }], ['🌐','Browser',() => { phoneApp = 'browser'; x1Msg = ''; renderPhone(); }], ['🎁','Items',() => { phoneApp = 'items'; loadCatalog().then(() => loadDrops()).then(() => renderPhone()); renderPhone(); }], ['🐾','Companion',() => { phoneApp = 'companion'; x1Msg = ''; renderPhone(); }], ['👤','Account',() => { closeUI(true); openAccount(); }], ['🛒','NFT Market',() => { closeUI(true); openMarket(); }], ['💬','Chat',() => { if (!hubMode){ toast('Chat is in the Degen Market. Open it from the main menu.', 3000); return; } closeUI(true); openChat(); }], ['🔎','X1 Explorer',() => openExplorer()]]){
      const b = document.createElement('button'); b.type = 'button'; b.className = 'phApp';
      const i = document.createElement('span'); i.textContent = icon; const n = document.createElement('b'); n.textContent = name; b.append(i, n); b.addEventListener('click', fn); grid.appendChild(b);
    }
    body.appendChild(grid);
    body.appendChild(phoneLine(x1Addr ? `Wallet ${shortAddr(x1Addr)}${x1Verified ? ', verified' : ''}` : 'No wallet connected', 'phFoot'));
    return;
  }
  if (phoneApp.startsWith('gw')){ renderGW(body); return; }
  if (phoneApp === 'qr'){ renderQR(body); return; }
  if (phoneApp === 'gallery'){ renderGallery(body); return; }
  if (phoneApp === 'companion'){ renderCompanionApp(body); return; }
  if (phoneApp === 'items'){ renderItemsApp(body); return; }
  if (phoneApp !== 'web') $('phone').classList.remove('phWide');
  if (phoneApp === 'web'){ renderWeb(body); return; }
  if (phoneApp === 'browser'){ renderBrowser(body); return; }
  if (phoneApp === 'swap'){ renderSwapApp(body); return; }
  if (phoneApp === 'portfolio'){ renderPortfolio(body); return; }
  if (phoneApp === 'diag'){ renderDiag(body); return; }
  // wallet app
  const head = document.createElement('div'); head.className = 'phHead';
  head.append(phoneBtn('‹ Home', () => { phoneApp = 'home'; renderPhone(); }, 'phBack'), phoneLine('X1 Wallet', 'phTitle')); body.appendChild(head);
  if (x1Addr){
    const card = document.createElement('div'); card.className = 'phCard';
    card.append(phoneLine(isGame() ? (gw.unlocked ? 'Dust Yard game wallet, unlocked' : 'Dust Yard game wallet, locked') : x1WalletName ? `Connected with ${x1WalletName}` : 'Saved address', 'phSmall'), phoneLine(shortAddr(x1Addr), 'phAddr'));
    const bal = x1Bal === 'loading' ? 'Checking balance...' : typeof x1Bal === 'number' ? `${x1Bal.toLocaleString(undefined, { maximumFractionDigits:4 })} XNT` + (xntUsd ? `  ≈ ${fmtUsd(x1Bal*xntUsd)}` : '') : 'Balance unavailable here';
    card.appendChild(phoneLine(bal, typeof x1Bal === 'number' ? 'phBal' : 'phSmall'));
    if (typeof x1Bal === 'number') card.appendChild(phoneLine(xntUsd ? `1 XNT ≈ ${fmtUsd(xntUsd)} (XDEX pool price)` : 'Checking XNT price...', 'phSmall'));
    if (x1Verified) card.appendChild(phoneLine('Ownership verified' + (holderTitle() ? ', ' + holderTitle() : ''), 'phOk'));
    body.appendChild(card);
    if (x1Bal === 'na') body.appendChild(phoneLine(location.protocol === 'file:' ? "Balances can't load from a file opened directly. Put the game on a website, or open it through a local server, to see your balance here." : window.claude ? 'Balances cannot load inside Claude. Use X1 Explorer to see your balance and NFTs.' : "The X1 network didn't answer. Try Refresh in a moment.", 'phSmall'));
    if (x1Bal !== 'loading' && !window.claude) body.appendChild(phoneBtn('Refresh balance', () => fetchBalance()));
    const row = document.createElement('div'); row.className = 'phRow';
    row.append(phoneBtn('Copy address', () => { try { navigator.clipboard.writeText(x1Addr); x1Msg = 'Address copied.'; } catch(e){ x1Msg = "Couldn't copy here."; } renderPhone(); }), phoneBtn('X1 Explorer', () => openExplorer()));
    body.appendChild(phoneBtn('Receive (QR code)', () => { phoneApp = 'qr'; x1Msg = ''; renderPhone(); }, 'phMain'));
    perkLines(body);
    body.appendChild(row);
    if (isGame()){
      if (!gw.unlocked) body.appendChild(phoneBtn('Unlock wallet', () => { phoneApp = 'gwUnlock'; x1Msg = ''; renderPhone(); }, 'phMain'));
      else { body.appendChild(phoneBtn('Show recovery phrase', () => { phoneApp = 'gwRevealPass'; x1Msg = ''; renderPhone(); })); body.appendChild(phoneBtn('Lock wallet', gwLock)); }
      body.appendChild(phoneBtn(gw.delArm ? 'Tap again to delete' : 'Delete from this browser', gwDelete, 'phGhost phDanger'));
    } else {
      if (x1Active && !x1Verified) body.appendChild(phoneBtn('Verify ownership (free signature)', verifyWallet, 'phMain'));
      body.appendChild(phoneBtn('Disconnect', disconnectWallet, 'phGhost'));
      if (gwBox) body.appendChild(phoneBtn('Switch to my game wallet', () => { x1Addr = gwBox.addr; store.set('dustyard-x1addr', x1Addr); x1Active = gw.unlocked ? { game:true } : null; x1Verified = gw.unlocked; x1Bal = null; presT = 0; renderPhone(); }, 'phGhost'));
    }
  } else {
    if (gwBox) body.appendChild(phoneBtn('Use my game wallet', () => { x1Addr = gwBox.addr; store.set('dustyard-x1addr', x1Addr); phoneApp = gw.unlocked ? 'wallet' : 'gwUnlock'; x1Msg = ''; renderPhone(); }, 'phMain'));
    else body.appendChild(phoneBtn('Create a new X1 wallet', () => { phoneApp = 'gwCreate'; x1Msg = ''; renderPhone(); }, 'phMain'));
    body.appendChild(phoneLine('Or connect a wallet you already have:', 'phSmall'));
    const found = walletOptions();
    if (found.length){
      for (const g of found) body.appendChild(phoneBtn(x1Wait ? 'Waiting for wallet...' : `Connect ${g.name}`, () => { if (!x1Wait) connectWallet(g); }, g.name === 'X1 Wallet' ? 'phMain' : ''));
      if (x1Wait) body.appendChild(phoneBtn('Cancel', cancelConnect, 'phGhost'));
    } else {
      body.appendChild(phoneLine(window.claude ? 'No wallet extension can reach the game here. Browser wallets usually cannot connect to games running inside Claude. Use the standalone copy on a website instead, or create a game wallet above.'
        : location.protocol === 'file:' ? 'No wallet extension detected. Wallet extensions do not work on files opened directly. Open the game from a website or a local server.'
        : 'No wallet extension detected. Make sure X1 Wallet or Backpack is installed, enabled for this site and unlocked, then tap Scan again.', 'phSmall'));
    }
    body.appendChild(phoneBtn('Wallet details (for help)', () => { phoneApp = 'diag'; renderPhone(); }, 'phGhost'));
    body.appendChild(phoneBtn('Scan again for wallets', () => { try { dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail:{ register:(...ws) => { ws.forEach(addWallet); return () => {}; } } })); } catch(e){} x1Msg = ''; setTimeout(renderPhone, 300); }, 'phGhost'));
    body.appendChild(phoneLine('Or add an address to view it in X1 Explorer:', 'phSmall'));
    const inp = document.createElement('input'); inp.id = 'phAddrIn'; inp.placeholder = 'X1 wallet address'; inp.maxLength = 44; inp.setAttribute('aria-label','X1 wallet address'); body.appendChild(inp);
    body.appendChild(phoneBtn('Save address', () => { const a = inp.value.trim(); if (!isAddr(a)){ x1Msg = "That doesn't look like an X1 address."; renderPhone(); return; } x1Addr = a; x1WalletName = ''; x1Active = null; x1Verified = false; store.set('dustyard-x1addr', a); x1Msg = ''; fetchBalance(); }));
  }
  if (x1Msg) body.appendChild(phoneLine(x1Msg, 'phMsg'));
  body.appendChild(phoneLine('Dust Yard never asks for your seed phrase or private key.', 'phWarn'));
}
// receive screen: QR code for the wallet address
function qrCanvas(text){
  const qr = qrcode(0, 'M'); qr.addData(text); qr.make();
  const n = qr.getModuleCount(), q = 4, px = Math.max(4, Math.floor(232/(n + q*2))), c = document.createElement('canvas');
  c.width = c.height = (n + q*2)*px; const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0,0,c.width,c.height); g.fillStyle = '#000000';
  for (let r=0;r<n;r++) for (let k=0;k<n;k++) if (qr.isDark(r,k)) g.fillRect((k + q)*px, (r + q)*px, px, px);
  c.className = 'phQr'; c.setAttribute('role','img'); c.setAttribute('aria-label','QR code of your X1 wallet address');
  return c;
}
function renderDiag(body){
  const head = document.createElement('div'); head.className = 'phHead';
  head.append(phoneBtn('‹ Back', () => { phoneApp = 'wallet'; renderPhone(); }, 'phBack'), phoneLine('Wallet details', 'phTitle')); body.appendChild(head);
  const where = window.claude ? 'Inside Claude' : location.protocol === 'file:' ? 'Opened as a file (wallets and balances will not work)' : location.protocol === 'https:' ? 'Website (https)' : location.protocol + ' page';
  const lines = [`Page: ${where}`, `Secure page: ${window.isSecureContext ? 'yes' : 'no'}`];
  x1Wallets.forEach(w => lines.push(`Standard wallet: ${w.name}; chains ${(w.w.chains || []).join(', ').slice(0,60) || 'none'}; ${Object.keys(w.w.features || {}).filter(f => /connect|sign/.test(f)).join(', ').slice(0,90)}`));
  legacyWallets().forEach(w => lines.push(`Injected wallet: ${w.name} at ${w.src}${w.p.isX1 ? ' (isX1)' : ''}${w.p.isBackpack ? ' (isBackpack)' : ''}${w.p.isPhantom ? ' (isPhantom)' : ''}`));
  if (!x1Wallets.length && !legacyWallets().length) lines.push('No wallets found on this page.');
  const pre = document.createElement('div'); pre.className = 'phDiag'; pre.textContent = lines.join('\n'); body.appendChild(pre);
  body.appendChild(phoneLine('Take a screenshot of this screen and share it if you need help connecting.', 'phSmall'));
}
function renderQR(body){
  const head = document.createElement('div'); head.className = 'phHead';
  head.append(phoneBtn('‹ Back', () => { phoneApp = 'wallet'; x1Msg = ''; renderPhone(); }, 'phBack'), phoneLine('Receive', 'phTitle')); body.appendChild(head);
  if (!isAddr(x1Addr)){ body.appendChild(phoneLine('No wallet address yet.', 'phSmall')); return; }
  body.appendChild(phoneLine('Scan to send XNT or X1 tokens to this wallet.', 'phSmall'));
  const wrap = document.createElement('div'); wrap.className = 'phQrWrap'; wrap.appendChild(qrCanvas(x1Addr)); body.appendChild(wrap);
  const full = document.createElement('p'); full.className = 'phFull'; full.textContent = x1Addr; body.appendChild(full);
  body.appendChild(phoneBtn('Copy address', () => { try { navigator.clipboard.writeText(x1Addr); x1Msg = 'Address copied.'; } catch(e){ x1Msg = "Couldn't copy here."; } renderPhone(); }, 'phMain'));
  body.appendChild(phoneLine('Only send assets on the X1 network to this address. Tokens sent from another chain may be lost.', 'phWarn2'));
  if (x1Msg) body.appendChild(phoneLine(x1Msg, 'phMsg'));
}
function openExplorer(){
  const url = 'https://explorer.mainnet.x1.xyz/' + (isAddr(x1Addr) ? 'address/' + x1Addr : '');
  const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; document.body.appendChild(a); a.click(); a.remove();
}
const BIP39 = 'abandon ability able about above absent absorb abstract absurd abuse access accident account accuse achieve acid acoustic acquire across act action actor actress actual adapt add addict address adjust admit adult advance advice aerobic affair afford afraid again age agent agree ahead aim air airport aisle alarm album alcohol alert alien all alley allow almost alone alpha already also alter always amateur amazing among amount amused analyst anchor ancient anger angle angry animal ankle announce annual another answer antenna antique anxiety any apart apology appear apple approve april arch arctic area arena argue arm armed armor army around arrange arrest arrive arrow art artefact artist artwork ask aspect assault asset assist assume asthma athlete atom attack attend attitude attract auction audit august aunt author auto autumn average avocado avoid awake aware away awesome awful awkward axis baby bachelor bacon badge bag balance balcony ball bamboo banana banner bar barely bargain barrel base basic basket battle beach bean beauty because become beef before begin behave behind believe below belt bench benefit best betray better between beyond bicycle bid bike bind biology bird birth bitter black blade blame blanket blast bleak bless blind blood blossom blouse blue blur blush board boat body boil bomb bone bonus book boost border boring borrow boss bottom bounce box boy bracket brain brand brass brave bread breeze brick bridge brief bright bring brisk broccoli broken bronze broom brother brown brush bubble buddy budget buffalo build bulb bulk bullet bundle bunker burden burger burst bus business busy butter buyer buzz cabbage cabin cable cactus cage cake call calm camera camp can canal cancel candy cannon canoe canvas canyon capable capital captain car carbon card cargo carpet carry cart case cash casino castle casual cat catalog catch category cattle caught cause caution cave ceiling celery cement census century cereal certain chair chalk champion change chaos chapter charge chase chat cheap check cheese chef cherry chest chicken chief child chimney choice choose chronic chuckle chunk churn cigar cinnamon circle citizen city civil claim clap clarify claw clay clean clerk clever click client cliff climb clinic clip clock clog close cloth cloud clown club clump cluster clutch coach coast coconut code coffee coil coin collect color column combine come comfort comic common company concert conduct confirm congress connect consider control convince cook cool copper copy coral core corn correct cost cotton couch country couple course cousin cover coyote crack cradle craft cram crane crash crater crawl crazy cream credit creek crew cricket crime crisp critic crop cross crouch crowd crucial cruel cruise crumble crunch crush cry crystal cube culture cup cupboard curious current curtain curve cushion custom cute cycle dad damage damp dance danger daring dash daughter dawn day deal debate debris decade december decide decline decorate decrease deer defense define defy degree delay deliver demand demise denial dentist deny depart depend deposit depth deputy derive describe desert design desk despair destroy detail detect develop device devote diagram dial diamond diary dice diesel diet differ digital dignity dilemma dinner dinosaur direct dirt disagree discover disease dish dismiss disorder display distance divert divide divorce dizzy doctor document dog doll dolphin domain donate donkey donor door dose double dove draft dragon drama drastic draw dream dress drift drill drink drip drive drop drum dry duck dumb dune during dust dutch duty dwarf dynamic eager eagle early earn earth easily east easy echo ecology economy edge edit educate effort egg eight either elbow elder electric elegant element elephant elevator elite else embark embody embrace emerge emotion employ empower empty enable enact end endless endorse enemy energy enforce engage engine enhance enjoy enlist enough enrich enroll ensure enter entire entry envelope episode equal equip era erase erode erosion error erupt escape essay essence estate eternal ethics evidence evil evoke evolve exact example excess exchange excite exclude excuse execute exercise exhaust exhibit exile exist exit exotic expand expect expire explain expose express extend extra eye eyebrow fabric face faculty fade faint faith fall false fame family famous fan fancy fantasy farm fashion fat fatal father fatigue fault favorite feature february federal fee feed feel female fence festival fetch fever few fiber fiction field figure file film filter final find fine finger finish fire firm first fiscal fish fit fitness fix flag flame flash flat flavor flee flight flip float flock floor flower fluid flush fly foam focus fog foil fold follow food foot force forest forget fork fortune forum forward fossil foster found fox fragile frame frequent fresh friend fringe frog front frost frown frozen fruit fuel fun funny furnace fury future gadget gain galaxy gallery game gap garage garbage garden garlic garment gas gasp gate gather gauge gaze general genius genre gentle genuine gesture ghost giant gift giggle ginger giraffe girl give glad glance glare glass glide glimpse globe gloom glory glove glow glue goat goddess gold good goose gorilla gospel gossip govern gown grab grace grain grant grape grass gravity great green grid grief grit grocery group grow grunt guard guess guide guilt guitar gun gym habit hair half hammer hamster hand happy harbor hard harsh harvest hat have hawk hazard head health heart heavy hedgehog height hello helmet help hen hero hidden high hill hint hip hire history hobby hockey hold hole holiday hollow home honey hood hope horn horror horse hospital host hotel hour hover hub huge human humble humor hundred hungry hunt hurdle hurry hurt husband hybrid ice icon idea identify idle ignore ill illegal illness image imitate immense immune impact impose improve impulse inch include income increase index indicate indoor industry infant inflict inform inhale inherit initial inject injury inmate inner innocent input inquiry insane insect inside inspire install intact interest into invest invite involve iron island isolate issue item ivory jacket jaguar jar jazz jealous jeans jelly jewel job join joke journey joy judge juice jump jungle junior junk just kangaroo keen keep ketchup key kick kid kidney kind kingdom kiss kit kitchen kite kitten kiwi knee knife knock know lab label labor ladder lady lake lamp language laptop large later latin laugh laundry lava law lawn lawsuit layer lazy leader leaf learn leave lecture left leg legal legend leisure lemon lend length lens leopard lesson letter level liar liberty library license life lift light like limb limit link lion liquid list little live lizard load loan lobster local lock logic lonely long loop lottery loud lounge love loyal lucky luggage lumber lunar lunch luxury lyrics machine mad magic magnet maid mail main major make mammal man manage mandate mango mansion manual maple marble march margin marine market marriage mask mass master match material math matrix matter maximum maze meadow mean measure meat mechanic medal media melody melt member memory mention menu mercy merge merit merry mesh message metal method middle midnight milk million mimic mind minimum minor minute miracle mirror misery miss mistake mix mixed mixture mobile model modify mom moment monitor monkey monster month moon moral more morning mosquito mother motion motor mountain mouse move movie much muffin mule multiply muscle museum mushroom music must mutual myself mystery myth naive name napkin narrow nasty nation nature near neck need negative neglect neither nephew nerve nest net network neutral never news next nice night noble noise nominee noodle normal north nose notable note nothing notice novel now nuclear number nurse nut oak obey object oblige obscure observe obtain obvious occur ocean october odor off offer office often oil okay old olive olympic omit once one onion online only open opera opinion oppose option orange orbit orchard order ordinary organ orient original orphan ostrich other outdoor outer output outside oval oven over own owner oxygen oyster ozone pact paddle page pair palace palm panda panel panic panther paper parade parent park parrot party pass patch path patient patrol pattern pause pave payment peace peanut pear peasant pelican pen penalty pencil people pepper perfect permit person pet phone photo phrase physical piano picnic picture piece pig pigeon pill pilot pink pioneer pipe pistol pitch pizza place planet plastic plate play please pledge pluck plug plunge poem poet point polar pole police pond pony pool popular portion position possible post potato pottery poverty powder power practice praise predict prefer prepare present pretty prevent price pride primary print priority prison private prize problem process produce profit program project promote proof property prosper protect proud provide public pudding pull pulp pulse pumpkin punch pupil puppy purchase purity purpose purse push put puzzle pyramid quality quantum quarter question quick quit quiz quote rabbit raccoon race rack radar radio rail rain raise rally ramp ranch random range rapid rare rate rather raven raw razor ready real reason rebel rebuild recall receive recipe record recycle reduce reflect reform refuse region regret regular reject relax release relief rely remain remember remind remove render renew rent reopen repair repeat replace report require rescue resemble resist resource response result retire retreat return reunion reveal review reward rhythm rib ribbon rice rich ride ridge rifle right rigid ring riot ripple risk ritual rival river road roast robot robust rocket romance roof rookie room rose rotate rough round route royal rubber rude rug rule run runway rural sad saddle sadness safe sail salad salmon salon salt salute same sample sand satisfy satoshi sauce sausage save say scale scan scare scatter scene scheme school science scissors scorpion scout scrap screen script scrub sea search season seat second secret section security seed seek segment select sell seminar senior sense sentence series service session settle setup seven shadow shaft shallow share shed shell sheriff shield shift shine ship shiver shock shoe shoot shop short shoulder shove shrimp shrug shuffle shy sibling sick side siege sight sign silent silk silly silver similar simple since sing siren sister situate six size skate sketch ski skill skin skirt skull slab slam sleep slender slice slide slight slim slogan slot slow slush small smart smile smoke smooth snack snake snap sniff snow soap soccer social sock soda soft solar soldier solid solution solve someone song soon sorry sort soul sound soup source south space spare spatial spawn speak special speed spell spend sphere spice spider spike spin spirit split spoil sponsor spoon sport spot spray spread spring spy square squeeze squirrel stable stadium staff stage stairs stamp stand start state stay steak steel stem step stereo stick still sting stock stomach stone stool story stove strategy street strike strong struggle student stuff stumble style subject submit subway success such sudden suffer sugar suggest suit summer sun sunny sunset super supply supreme sure surface surge surprise surround survey suspect sustain swallow swamp swap swarm swear sweet swift swim swing switch sword symbol symptom syrup system table tackle tag tail talent talk tank tape target task taste tattoo taxi teach team tell ten tenant tennis tent term test text thank that theme then theory there they thing this thought three thrive throw thumb thunder ticket tide tiger tilt timber time tiny tip tired tissue title toast tobacco today toddler toe together toilet token tomato tomorrow tone tongue tonight tool tooth top topic topple torch tornado tortoise toss total tourist toward tower town toy track trade traffic tragic train transfer trap trash travel tray treat tree trend trial tribe trick trigger trim trip trophy trouble truck true truly trumpet trust truth try tube tuition tumble tuna tunnel turkey turn turtle twelve twenty twice twin twist two type typical ugly umbrella unable unaware uncle uncover under undo unfair unfold unhappy uniform unique unit universe unknown unlock until unusual unveil update upgrade uphold upon upper upset urban urge usage use used useful useless usual utility vacant vacuum vague valid valley valve van vanish vapor various vast vault vehicle velvet vendor venture venue verb verify version very vessel veteran viable vibrant vicious victory video view village vintage violin virtual virus visa visit visual vital vivid vocal voice void volcano volume vote voyage wage wagon wait walk wall walnut want warfare warm warrior wash wasp waste water wave way wealth weapon wear weasel weather web wedding weekend weird welcome west wet whale what wheat wheel when where whip whisper wide width wife wild will win window wine wing wink winner winter wire wisdom wise wish witness wolf woman wonder wood wool word work world worry worth wrap wreck wrestle wrist write wrong yard year yellow you young youth zebra zero zone zoo'.split(' ');
// X1 game wallet core: BIP39 12-word phrase, SLIP-0010 ed25519 derivation (m/44'/501'/0'/0', the standard Solana/X1 path), encrypted storage
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58(bytes){
  let n = 0n; for (const b of bytes) n = n*256n + BigInt(b);
  let s = ''; while (n > 0n){ s = B58[Number(n % 58n)] + s; n /= 58n; }
  for (const b of bytes){ if (b === 0) s = '1' + s; else break; }
  return s;
}
const subtle = (globalThis.crypto || {}).subtle;
async function sha256(b){ return new Uint8Array(await subtle.digest('SHA-256', b)); }
async function hmac512(key, data){ const k = await subtle.importKey('raw', key, { name:'HMAC', hash:'SHA-512' }, false, ['sign']); return new Uint8Array(await subtle.sign('HMAC', k, data)); }
async function entropyToPhrase(ent){
  const h = await sha256(ent), bits = [...ent].map(b => b.toString(2).padStart(8,'0')).join('') + h[0].toString(2).padStart(8,'0').slice(0, ent.length/4);
  const out = []; for (let i=0;i<bits.length;i+=11) out.push(BIP39[parseInt(bits.slice(i,i+11),2)]); return out;
}
async function phraseToSeed(words){
  const enc = new TextEncoder(), k = await subtle.importKey('raw', enc.encode(words.join(' ').normalize('NFKD')), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await subtle.deriveBits({ name:'PBKDF2', salt:enc.encode('mnemonic'), iterations:2048, hash:'SHA-512' }, k, 512));
}
async function deriveKeypair(seed){
  let I = await hmac512(new TextEncoder().encode('ed25519 seed'), seed), key = I.slice(0,32), chain = I.slice(32);
  for (const idx of [44, 501, 0, 0]){
    const d = new Uint8Array(37); d[0] = 0; d.set(key, 1); const v = (idx | 0x80000000) >>> 0; d[33] = v >>> 24; d[34] = (v >>> 16) & 255; d[35] = (v >>> 8) & 255; d[36] = v & 255;
    I = await hmac512(chain, d); key = I.slice(0,32); chain = I.slice(32);
  }
  return nacl.sign.keyPair.fromSeed(key);
}
async function walletFromEntropy(ent){ requireCrypto(); const words = await entropyToPhrase(ent), kp = await deriveKeypair(await phraseToSeed(words)); return { words, kp, address:b58(kp.publicKey) }; }
async function passKey(pass, salt){ const k = await subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']); return subtle.deriveKey({ name:'PBKDF2', salt, iterations:250000, hash:'SHA-256' }, k, { name:'AES-GCM', length:256 }, false, ['encrypt','decrypt']); }
const toHex = b => [...b].map(x => x.toString(16).padStart(2,'0')).join(''), fromHex = h => new Uint8Array(h.match(/../g).map(x => parseInt(x,16)));
async function sealEntropy(ent, pass){ const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)); const ct = new Uint8Array(await subtle.encrypt({ name:'AES-GCM', iv }, await passKey(pass, salt), ent)); return { salt:toHex(salt), iv:toHex(iv), ct:toHex(ct) }; }
async function openEntropy(box, pass){ return new Uint8Array(await subtle.decrypt({ name:'AES-GCM', iv:fromHex(box.iv) }, await passKey(pass, fromHex(box.salt)), fromHex(box.ct))); }

// X1 NFT + token reader (works wherever the page can reach the X1 RPC)
const X1_RPC = 'https://rpc.mainnet.x1.xyz';
const TOKEN_PROG = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', TOKEN22_PROG = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', META_PROG = 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s';
async function x1rpc(method, params, ms){
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), ms || 12000);
  try {
    const r = await fetch(X1_RPC, { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ jsonrpc:'2.0', id:1, method, params }), signal:ctl.signal });
    const j = await r.json(); if (j.error) throw new Error(j.error.message || 'rpc error'); return j.result;
  } finally { clearTimeout(tm); }
}
function b58dec(s){
  let n = 0n; for (const ch of s){ const i = B58.indexOf(ch); if (i < 0) throw new Error('bad base58'); n = n*58n + BigInt(i); }
  const out = []; while (n > 0n){ out.unshift(Number(n & 255n)); n >>= 8n; }
  for (const ch of s){ if (ch === '1') out.unshift(0); else break; }
  return new Uint8Array(out);
}
// ed25519 "is this 32-byte value a curve point?" (program addresses must be off the curve)
const ED_P = (1n << 255n) - 19n;
function modpow(b, e, m){ let r = 1n; b %= m; while (e > 0n){ if (e & 1n) r = r*b % m; b = b*b % m; e >>= 1n; } return r; }
const ED_D = ((-121665n * modpow(121666n, ED_P - 2n, ED_P)) % ED_P + ED_P) % ED_P;
function onCurve(b){
  let y = 0n; for (let i=31;i>=0;i--) y = (y << 8n) | BigInt(i === 31 ? b[i] & 0x7f : b[i]);
  if (y >= ED_P) return false;
  const y2 = y*y % ED_P, u = (y2 - 1n + ED_P) % ED_P, v = (ED_D*y2 + 1n) % ED_P;
  const x2 = u * modpow(v, ED_P - 2n, ED_P) % ED_P;
  if (x2 === 0n) return true;
  return modpow(x2, (ED_P - 1n)/2n, ED_P) === 1n;
}
async function findPda(seeds, prog){
  const pb = b58dec(prog), tail = new TextEncoder().encode('ProgramDerivedAddress');
  for (let bump=255; bump>=0; bump--){
    const parts = [...seeds, Uint8Array.of(bump), pb, tail], len = parts.reduce((a,p) => a + p.length, 0), buf = new Uint8Array(len);
    let o = 0; for (const p of parts){ buf.set(p, o); o += p.length; }
    const h = await sha256(buf);
    if (!onCurve(h)) return b58(h);
  }
  throw new Error('no pda');
}
function parseMeta(bytes){
  let o = 65; const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), td = new TextDecoder();
  const str = () => { const n = dv.getUint32(o, true); o += 4; const s = td.decode(bytes.subarray(o, o + n)).replace(/\0+$/,'').trim(); o += n; return s; };
  const name = str(), symbol = str(), uri = str();
  o += 2; if (bytes[o++]){ const n = dv.getUint32(o, true); o += 4 + n*34; }
  o += 2; if (bytes[o++]) o += 1; if (bytes[o++]) o += 1;
  let collection = null; if (o < bytes.length && bytes[o++]){ const verified = !!bytes[o++]; collection = { verified, key:b58(bytes.subarray(o, o + 32)) }; }
  return { name, symbol, uri, collection };
}
const b64bytes = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
function gatewayUrl(u){ u = String(u || '').trim(); if (u.startsWith('ipfs://')) return 'https://ipfs.io/ipfs/' + u.slice(7).replace(/^ipfs\//,''); if (u.startsWith('ar://')) return 'https://arweave.net/' + u.slice(5); return /^https:\/\//.test(u) ? u : ''; }
async function x1Holdings(owner){
  const out = { xnt:0, tokens:[], nfts:[] };
  const [bal, a1, a2] = await Promise.all([
    x1rpc('getBalance', [owner]),
    x1rpc('getTokenAccountsByOwner', [owner, { programId:TOKEN_PROG }, { encoding:'jsonParsed' }]),
    x1rpc('getTokenAccountsByOwner', [owner, { programId:TOKEN22_PROG }, { encoding:'jsonParsed' }]).catch(() => ({ value:[] }))
  ]);
  out.xnt = (bal.value || 0)/1e9;
  for (const [acc, t22] of [[a1, false], [a2, true]]) for (const a of (acc.value || [])){
    const info = a.account.data.parsed.info, amt = info.tokenAmount;
    if (amt.amount === '0') continue;
    const item = { mint:info.mint, amount:amt.uiAmount, decimals:amt.decimals, t22 };
    if (amt.decimals === 0 && amt.amount === '1') out.nfts.push(item); else out.tokens.push(item);
  }
  out.nfts = out.nfts.slice(0, 60);
  // names and art: Metaplex metadata for classic tokens, built-in metadata for Token-2022
  const classic = out.nfts.filter(n => !n.t22), t22 = out.nfts.filter(n => n.t22);
  const pdas = await Promise.all(classic.map(n => findPda([new TextEncoder().encode('metadata'), b58dec(META_PROG), b58dec(n.mint)], META_PROG)));
  for (let i=0;i<pdas.length;i+=100){
    const r = await x1rpc('getMultipleAccounts', [pdas.slice(i, i + 100), { encoding:'base64' }]);
    r.value.forEach((acc, k) => { if (acc && acc.data) try { Object.assign(classic[i + k], parseMeta(b64bytes(acc.data[0]))); } catch(e){} });
  }
  if (t22.length){
    const r = await x1rpc('getMultipleAccounts', [t22.map(n => n.mint), { encoding:'jsonParsed' }]);
    r.value.forEach((acc, k) => { try { const ext = (acc.data.parsed.info.extensions || []).find(e => e.extension === 'tokenMetadata'); if (ext) Object.assign(t22[k], { name:ext.state.name, symbol:ext.state.symbol, uri:ext.state.uri }); } catch(e){} });
  }
  return out;
}
// on your own server, NFT art and metadata go through its proxy so the game can use them in 3D
function viaProxy(u){ return u && PROFILE_API && /^https:\/\//.test(u) && !u.startsWith(PROFILE_API) ? PROFILE_API + '/proxy?u=' + encodeURIComponent(u) : u; }
async function nftImage(n){
  if (n.image !== undefined) return n.image;
  n.image = '';
  const u = gatewayUrl(n.uri); if (!u) return '';
  try { const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 8000); const j = await (await fetch(viaProxy(u), { signal:ctl.signal })).json(); clearTimeout(tm);
    n.image = gatewayUrl(j.image || (j.properties && j.properties.files && j.properties.files[0] && j.properties.files[0].uri)); n.desc = String(j.description || '').slice(0,200); if (Array.isArray(j.attributes)) n.traits = Object.fromEntries(j.attributes.slice(0,24).filter(a => a && a.trait_type).map(a => [String(a.trait_type).slice(0,24), String(a.value == null ? '' : a.value).slice(0,32)])); if (!n.name && j.name) n.name = String(j.name); } catch(e){}
  return n.image;
}

/* ---------- Holder perks and NFT gallery ---------- */
// Perks need a verified wallet (signature or an unlocked game wallet) so nobody can borrow a whale's address.
const HOLDER_PERKS = [
  { k:'holder', title:'XNT Holder', test:h => h.xnt >= 1, need:'Hold 1+ XNT', camo:'aurora' },
  { k:'collector', title:'NFT Collector', test:h => h.nfts.length >= 1, need:'Hold any NFT on X1', camo:'obsidian' },
  { k:'whale', title:'XNT Whale', test:h => h.xnt >= 1000, need:'Hold 1,000+ XNT' }
];
let holder = { addr:'', checked:false, loading:false, xnt:0, nfts:[], tokens:[], perks:{}, lastKey:'' };
let galSel = null;
function computePerks(){
  const ok = x1Verified && holder.checked && holder.addr === x1Addr;
  const perks = {}; for (const P of HOLDER_PERKS) perks[P.k] = ok && P.test(holder);
  holder.perks = perks;
  const key = HOLDER_PERKS.filter(P => perks[P.k]).map(P => P.k).join(',');
  if (key !== holder.lastKey){
    const gained = HOLDER_PERKS.filter(P => perks[P.k] && !holder.lastKey.split(',').includes(P.k));
    holder.lastKey = key; presT = 0;
    if (typeof WEAPONS !== 'undefined') WEAPONS.forEach(W => applyCamo(W));
    if (gained.length) toast(`Holder perks unlocked: ${gained.map(P => P.title + (P.camo ? ' title and ' + CAMOS.find(c => c.k === P.camo).name + ' camo' : ' title')).join(', ')}.`, 5000);
  }
}
function holderTitle(){ const p = holder.perks || {}; return p.whale ? 'XNT Whale' : p.collector ? 'NFT Collector' : p.holder ? 'XNT Holder' : ''; }
function perkLines(body){
  const box = document.createElement('div'); box.className = 'phPerks';
  const head = document.createElement('b'); head.textContent = 'Holder perks'; box.appendChild(head);
  for (const P of HOLDER_PERKS){
    const row = document.createElement('div'); const on = !!holder.perks[P.k];
    row.className = on ? 'on' : ''; row.textContent = `${on ? '✓' : '○'} ${P.title}${P.camo ? ' + ' + CAMOS.find(c => c.k === P.camo).name + ' camo' : ''}: ${P.need}`;
    box.appendChild(row);
  }
  if (!x1Verified) box.appendChild(phoneLine(isGame() ? 'Unlock your game wallet to activate perks.' : 'Verify ownership to activate perks.', 'phSmall'));
  else if (!holder.checked) box.appendChild(phoneLine(window.claude ? 'Perks are checked on your website version, where the game can read the X1 network.' : 'Checking your wallet...', 'phSmall'));
  body.appendChild(box);
}
function renderGallery(body){
  const head = document.createElement('div'); head.className = 'phHead';
  head.append(phoneBtn('‹ ' + (galSel ? 'Back' : 'Home'), () => { if (galSel){ galSel = null; } else phoneApp = 'home'; renderPhone(); }, 'phBack'), phoneLine(galSel ? 'NFT' : 'My NFTs', 'phTitle'));
  body.appendChild(head);
  if (!isAddr(x1Addr)){ body.appendChild(phoneLine('Connect or create a wallet in the X1 Wallet app first.', 'phSmall')); body.appendChild(phoneBtn('Open X1 Wallet', () => { phoneApp = 'wallet'; renderPhone(); }, 'phMain')); return; }
  if (holder.loading || x1Bal === 'loading'){ body.appendChild(phoneLine('Loading your NFTs...', 'phSmall')); return; }
  if (!holder.checked || holder.addr !== x1Addr){
    body.appendChild(phoneLine(window.claude ? 'Your NFTs can only load on your website version of the game, where it can read the X1 network.' : "Couldn't read your wallet from the X1 network.", 'phSmall'));
    if (!window.claude) body.appendChild(phoneBtn('Try again', () => fetchBalance(), 'phMain'));
    return;
  }
  if (galSel){
    const n = galSel, img = document.createElement('img'); img.className = 'phNftBig'; img.alt = ''; img.referrerPolicy = 'no-referrer';
    img.src = nftArtCanvas({ item:n.name || 'NFT', collection:n.symbol || '' }).toDataURL('image/jpeg', .85);
    nftImage(n).then(u => { if (u) img.src = viaProxy(u); }); body.appendChild(img);
    body.append(phoneLine(n.name || 'Unnamed NFT', 'phTitle2'), phoneLine(`${n.symbol || 'NFT'}${n.collection ? (n.collection.verified ? ', verified collection' : ', unverified collection') : ''}`, 'phSmall'));
    if (n.desc) body.appendChild(phoneLine(n.desc, 'phSmall'));
    body.appendChild(phoneLine(`Mint ${shortAddr(n.mint)}`, 'phSmall'));
    body.appendChild(phoneBtn('View on X1 Brains market', () => openInPhone(X1BRAINS_URL)));
    if (srvMode && !n.t22 && x1Active) body.appendChild(phoneBtn('Sell in the Degen Market', () => { closeUI(true); openMarket(); mkView = 'nftsell'; nftSel = n; drawMarket(); }));
    if (x1Verified && holder.addr === x1Addr) body.appendChild(phoneBtn(petCfg && petCfg.mint === n.mint ? 'Your companion' : 'Make companion', () => { if (!petCfg || petCfg.mint !== n.mint) nftImage(n).then(() => setCompanion(n)); }, 'phMain'));
    else body.appendChild(phoneLine(isGame() ? 'Unlock your game wallet to use this NFT as a companion.' : 'Verify ownership in X1 Wallet to use this NFT as a companion.', 'phSmall'));
    body.appendChild(phoneBtn('View on X1 Explorer', () => { const a = document.createElement('a'); a.href = 'https://explorer.mainnet.x1.xyz/address/' + n.mint; a.target = '_blank'; a.rel = 'noopener noreferrer'; document.body.appendChild(a); a.click(); a.remove(); }, 'phMain'));
    return;
  }
  body.appendChild(phoneLine(`${holder.nfts.length} NFT${holder.nfts.length === 1 ? '' : 's'}, ${holder.xnt.toLocaleString(undefined, { maximumFractionDigits:3 })} XNT${xntUsd ? ' (' + fmtUsd(holder.xnt*xntUsd) + ')' : ''}, ${holder.tokens.length} other token${holder.tokens.length === 1 ? '' : 's'}`, 'phSmall'));
  if (!holder.nfts.length){ body.appendChild(phoneLine('No NFTs found in this wallet on X1.', 'phSmall')); }
  const grid = document.createElement('div'); grid.className = 'phGal';
  for (const n of holder.nfts){
    const b = document.createElement('button'); b.type = 'button'; b.className = 'phNft';
    const img = document.createElement('img'); img.alt = ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
    img.src = nftArtCanvas({ item:n.name || 'NFT', collection:n.symbol || '' }).toDataURL('image/jpeg', .7);
    nftImage(n).then(u => { if (u) img.src = viaProxy(u); });
    const t = document.createElement('span'); t.textContent = n.name || shortAddr(n.mint);
    b.append(img, t); b.addEventListener('click', () => { galSel = n; renderPhone(); }); grid.appendChild(b);
  }
  body.appendChild(grid);
}

/* ---------- Game wallet: create an X1 wallet right on the phone ---------- */
let gwBox = null; try { gwBox = JSON.parse(store.get('dustyard-x1game') || 'null'); } catch(e){ gwBox = null; }
const gw = { unlocked:false, ent:null, words:null, kp:null, check:[], delArm:false, busy:false };
if (gwBox && gwBox.addr && !x1Addr) x1Addr = gwBox.addr;
const isGame = () => gwBox && x1Addr === gwBox.addr;
function gwInput(id, ph, type){ const i = document.createElement('input'); i.id = id; i.placeholder = ph; i.type = type || 'text'; i.autocomplete = 'off'; i.spellcheck = false; i.setAttribute('aria-label', ph); return i; }
function gwWordsGrid(words){ const g = document.createElement('div'); g.className = 'phWords'; words.forEach((w,i) => { const d = document.createElement('div'); const n = document.createElement('span'); n.textContent = (i + 1) + '.'; const b = document.createElement('b'); b.textContent = w; d.append(n, b); g.appendChild(d); }); return g; }
async function gwStart(){
  gw.ent = crypto.getRandomValues(new Uint8Array(16));
  const w = await walletFromEntropy(gw.ent); gw.words = w.words; gw.kp = w.kp; gw.addr = w.address;
  phoneApp = 'gwWords'; x1Msg = ''; renderPhone();
}
function gwClearSecrets(){ if (gw.ent) gw.ent.fill(0); gw.ent = null; gw.words = null; gw.kp = null; }
async function gwSave(p1, p2){
  if (p1.length < 8){ x1Msg = 'Use a password with at least 8 characters.'; renderPhone(); return; }
  if (p1 !== p2){ x1Msg = "The passwords don't match."; renderPhone(); return; }
  gw.busy = true; x1Msg = 'Encrypting your wallet...'; renderPhone();
  const box = await sealEntropy(gw.ent, p1); box.addr = gw.addr; box.v = 1;
  gwBox = box; store.set('dustyard-x1game', JSON.stringify(box));
  x1Addr = gw.addr; store.set('dustyard-x1addr', x1Addr); x1Active = { game:true }; x1WalletName = 'Dust Yard game wallet';
  gw.unlocked = true; x1Verified = true; presT = 0; gw.words = null; gw.busy = false;
  x1Msg = 'Your X1 wallet is ready. You can import the same recovery phrase into X1 Wallet or Backpack any time.';
  phoneApp = 'wallet'; x1Bal = null; fetchBalance(); renderPhone();
}
async function gwUnlock(pass, reveal){
  gw.busy = true; x1Msg = 'Unlocking...'; renderPhone();
  try {
    const ent = await openEntropy(gwBox, pass), w = await walletFromEntropy(ent);
    if (w.address !== gwBox.addr) throw new Error('mismatch');
    gw.ent = ent; gw.kp = w.kp; gw.unlocked = true; x1Addr = gwBox.addr; x1Active = { game:true }; x1WalletName = 'Dust Yard game wallet'; x1Verified = true; presT = 0;
    if (reveal){ gw.words = w.words; phoneApp = 'gwReveal'; x1Msg = ''; } else { phoneApp = 'wallet'; x1Msg = 'Wallet unlocked and verified.'; }
  } catch(e){ x1Msg = 'Wrong password.'; }
  gw.busy = false; renderPhone();
}
function gwLock(){ gwClearSecrets(); gw.unlocked = false; x1Verified = false; x1Active = null; presT = 0; x1Msg = 'Wallet locked.'; renderPhone(); }
function gwDelete(){
  if (!gw.delArm){ gw.delArm = true; x1Msg = 'Tap Delete again to permanently remove this wallet from this browser. Without your recovery phrase, anything in it is lost forever.'; renderPhone(); return; }
  gw.delArm = false; gwClearSecrets(); store.set('dustyard-x1game', ''); gwBox = null; gw.unlocked = false;
  x1Addr = ''; x1Active = null; x1Verified = false; x1Bal = null; store.set('dustyard-x1addr', ''); presT = 0; x1Msg = 'Game wallet removed from this browser.'; phoneApp = 'wallet'; renderPhone();
}
function renderGW(body){
  const head = document.createElement('div'); head.className = 'phHead';
  head.append(phoneBtn('‹ Back', () => { if (phoneApp !== 'gwReveal') gwClearSecrets(); else gw.words = null; phoneApp = 'wallet'; x1Msg = ''; renderPhone(); }, 'phBack'), phoneLine('New X1 wallet', 'phTitle'));
  body.appendChild(head);
  if (phoneApp === 'gwCreate'){
    if (head.lastChild) head.lastChild.textContent = 'Create wallet';
    body.append(phoneLine('Before you start:', 'phTitle2'),
      phoneLine('Your wallet is created on this device and saved in this browser, protected by a password you choose.', 'phSmall'),
      phoneLine('You will get a 12-word recovery phrase. It is the only way to recover the wallet. Write it on paper. Anyone who sees it can take everything in the wallet.', 'phSmall'),
      phoneLine('A game is a less secure place to keep money than a dedicated wallet app. Use this for small amounts, or move the phrase into X1 Wallet or Backpack.', 'phWarn2'),
      phoneBtn('I understand, create my wallet', () => { x1Msg = 'Creating...'; renderPhone(); gwStart(); }, 'phMain'));
  } else if (phoneApp === 'gwWords' || phoneApp === 'gwReveal'){
    if (head.lastChild) head.lastChild.textContent = 'Recovery phrase';
    body.append(phoneLine('Make sure nobody can see your screen. Write these 12 words down in order and keep them offline.', 'phSmall'), gwWordsGrid(gw.words || []));
    if (phoneApp === 'gwWords'){
      body.appendChild(phoneLine('Never type this phrase into a website, chat or game, and never share it.', 'phWarn2'));
      body.appendChild(phoneBtn("I've written it down", () => { const a = Math.floor(Math.random()*12); let b = Math.floor(Math.random()*11); if (b >= a) b++; gw.check = [Math.min(a,b), Math.max(a,b)]; phoneApp = 'gwCheck'; x1Msg = ''; renderPhone(); }, 'phMain'));
    } else body.appendChild(phoneBtn('Hide phrase', () => { gw.words = null; phoneApp = 'wallet'; renderPhone(); }, 'phMain'));
  } else if (phoneApp === 'gwCheck'){
    if (head.lastChild) head.lastChild.textContent = 'Check your backup';
    body.appendChild(phoneLine('Type the requested words from your written copy.', 'phSmall'));
    const i1 = gwInput('gwC1', `Word #${gw.check[0] + 1}`), i2 = gwInput('gwC2', `Word #${gw.check[1] + 1}`); body.append(i1, i2); if (!padActive) setTimeout(() => i1.focus(), 30);
    i1.addEventListener('keydown', e => { if (e.code === 'Enter'){ e.preventDefault(); i2.focus(); } });
    body.appendChild(phoneBtn('Continue', () => {
      const ok = i1.value.trim().toLowerCase() === gw.words[gw.check[0]] && i2.value.trim().toLowerCase() === gw.words[gw.check[1]];
      if (!ok){ x1Msg = "Those words don't match. Check your written copy, or go back to view the phrase again."; renderPhone(); return; }
      phoneApp = 'gwPass'; x1Msg = ''; renderPhone();
    }, 'phMain'));
    body.appendChild(phoneBtn('Show the phrase again', () => { phoneApp = 'gwWords'; x1Msg = ''; renderPhone(); }));
  } else if (phoneApp === 'gwPass'){
    if (head.lastChild) head.lastChild.textContent = 'Set a password';
    body.appendChild(phoneLine('This password unlocks the wallet in this browser. It cannot be recovered, but your 12 words can always restore the wallet.', 'phSmall'));
    const p1 = gwInput('gwP1', 'Password (8+ characters)', 'password'), p2 = gwInput('gwP2', 'Repeat password', 'password'); body.append(p1, p2); if (!padActive) setTimeout(() => p1.focus(), 30);
    body.appendChild(phoneBtn(gw.busy ? 'Saving...' : 'Save wallet', () => { if (!gw.busy) gwSave(p1.value, p2.value); }, 'phMain'));
  } else if (phoneApp === 'gwUnlock' || phoneApp === 'gwRevealPass'){
    if (head.lastChild) head.lastChild.textContent = phoneApp === 'gwUnlock' ? 'Unlock wallet' : 'Show recovery phrase';
    body.appendChild(phoneLine(phoneApp === 'gwUnlock' ? 'Enter your wallet password.' : 'Enter your password to show your 12 words. Make sure nobody can see your screen.', 'phSmall'));
    const p = gwInput('gwPU', 'Password', 'password'); body.appendChild(p); if (!padActive) setTimeout(() => p.focus(), 30);
    p.addEventListener('keydown', e => { if (e.code === 'Enter' || e.code === 'NumpadEnter'){ e.preventDefault(); if (!gw.busy) gwUnlock(p.value, phoneApp === 'gwRevealPass'); } });
    body.appendChild(phoneBtn(gw.busy ? 'Working...' : (phoneApp === 'gwUnlock' ? 'Unlock' : 'Show phrase'), () => { if (!gw.busy) gwUnlock(p.value, phoneApp === 'gwRevealPass'); }, 'phMain'));
  }
  if (x1Msg) body.appendChild(phoneLine(x1Msg, 'phMsg'));
}

let walletScanT = null;
function startWalletScan(){
  if (walletScanT) return;
  let last = '';
  walletScanT = setInterval(() => {
    if ($('phone').hidden){ clearInterval(walletScanT); walletScanT = null; return; }
    if (phoneApp !== 'wallet' || x1Addr || x1Wait) return;
    const key = walletOptions().map(g => g.name + g.cands.length).join('|');
    if (key !== last){ last = key; renderPhone(); }
  }, 1000);
}
/* ---------- Phone browser: open dApps like a DEX in a new tab ---------- */
const DEFAULT_BOOKMARKS = [
  { name:'X1 Explorer', url:'https://explorer.mainnet.x1.xyz/' },
  { name:'X1 Ninja', url:'https://nft.x1.ninja/' },
  { name:'X1 Brains NFT market', url:'https://x1brains.io/labwork' }
];
const X1BRAINS_URL = 'https://x1brains.io/labwork';
// add the X1 Brains bookmark once for players who already have a saved list
try { const b = JSON.parse(store.get('dy-bookmarks') || 'null'); if (Array.isArray(b) && !store.get('dy-bm-x1brains') && !b.some(k => k.url === X1BRAINS_URL)){ b.push({ name:'X1 Brains NFT market', url:X1BRAINS_URL }); store.set('dy-bookmarks', JSON.stringify(b)); } store.set('dy-bm-x1brains', '1'); } catch(e){}
function bookmarks(){ try { const b = JSON.parse(store.get('dy-bookmarks') || 'null'); return Array.isArray(b) ? b : DEFAULT_BOOKMARKS.slice(); } catch(e){ return DEFAULT_BOOKMARKS.slice(); } }
function saveBookmarks(b){ store.set('dy-bookmarks', JSON.stringify(b.slice(0, 20))); }
function cleanUrl(raw){
  let u = String(raw || '').trim(); if (!u) return null;
  if (!/^[a-z]+:\/\//i.test(u)) u = 'https://' + u;
  try { const x = new URL(u); return x.protocol === 'https:' ? x : null; } catch(e){ return null; }
}
function openSite(u){
  const x = cleanUrl(u); if (!x){ x1Msg = 'Only https:// links can be opened.'; renderPhone(); return; }
  const a = document.createElement('a'); a.href = x.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; document.body.appendChild(a); a.click(); a.remove();
  x1Msg = `Opened ${x.hostname} in a new tab. Connect the same wallet there, then come back to the game.`; renderPhone();
}
let webUrl = '';
function openInPhone(u){
  const x = cleanUrl(u); if (!x){ x1Msg = 'Only https:// links can be opened.'; renderPhone(); return; }
  // wallet sites only connect in a full tab, so send them straight there
  if (/(^|\.)x1brains\.io$/i.test(x.hostname)){ openSite(x.href); toast(`X1 Brains opened in a new tab. Connect the same wallet there${x1Addr ? ' (' + shortAddr(x1Addr) + ')' : ''} to buy or sell.`, 5000); return; }
  if ($('phone').hidden){ openPhone(); }
  webUrl = x.href; phoneApp = 'web'; renderPhone();
}
function renderWeb(body){
  $('phone').classList.add('phWide');
  const x = new URL(webUrl), head = document.createElement('div'); head.className = 'phHead';
  head.append(phoneBtn('‹ Back', () => { $('phone').classList.remove('phWide'); phoneApp = 'browser'; renderPhone(); }, 'phBack'), phoneLine(x.hostname.replace(/^www\./, ''), 'phTitle'), phoneBtn('↗ New tab', () => openSite(webUrl), 'phBack'));
  body.appendChild(head);
  const f = document.createElement('iframe'); f.className = 'phWeb'; f.src = webUrl; f.referrerPolicy = 'no-referrer';
  f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox');
  body.appendChild(f);
  body.appendChild(phoneLine('Blank page? Some sites don\u2019t allow being shown inside other pages. Wallets also usually only connect in a full tab, so use \u2197 New tab to buy or sell.', 'phSmall'));
}
function renderBrowser(body){
  const head = document.createElement('div'); head.className = 'phHead';
  head.append(phoneBtn('‹ Home', () => { phoneApp = 'home'; x1Msg = ''; renderPhone(); }, 'phBack'), phoneLine('Browser', 'phTitle')); body.appendChild(head);
  const inp = document.createElement('input'); inp.id = 'brUrl'; inp.placeholder = 'Type a site, for example app.example.xyz'; inp.autocomplete = 'off'; inp.spellcheck = false; inp.setAttribute('aria-label', 'Website address');
  inp.addEventListener('keydown', e => { if (e.code === 'Enter'){ e.preventDefault(); openInPhone(inp.value); } });
  body.appendChild(inp);
  const row = document.createElement('div'); row.className = 'phRow';
  row.append(phoneBtn('Open', () => openInPhone(inp.value), 'phMain'), phoneBtn('Bookmark', () => {
    const x = cleanUrl(inp.value); if (!x){ x1Msg = 'Type a valid https:// address first.'; renderPhone(); return; }
    const b = bookmarks(); if (!b.some(k => k.url === x.href)) b.unshift({ name:x.hostname.replace(/^www\./, ''), url:x.href }); saveBookmarks(b); x1Msg = `Saved ${x.hostname}.`; renderPhone();
  }));
  body.appendChild(row);
  body.appendChild(phoneLine('Bookmarks', 'phTitle2'));
  const bm = bookmarks();
  for (const k of bm){
    const r = document.createElement('div'); r.className = 'phRow';
    r.append(phoneBtn(`${k.name}`, () => openInPhone(k.url)), phoneBtn('↗', () => openSite(k.url), 'phGhost phX'), phoneBtn('✕', () => { saveBookmarks(bookmarks().filter(x => x.url !== k.url)); renderPhone(); }, 'phGhost phX'));
    body.appendChild(r);
  }
  if (!bm.length) body.appendChild(phoneLine('No bookmarks yet. Type your DEX address above and tap Bookmark.', 'phSmall'));
  body.appendChild(phoneLine('Sites open in a new browser tab, where your wallet extension works normally. Check the address carefully: fake DEX sites are a common scam.', 'phWarn2'));
  if (x1Msg) body.appendChild(phoneLine(x1Msg, 'phMsg'));
}

function openPhone(){
  if (state === 'play' && !hubMode) return;
  if (!$('phone').hidden) return;
  openUI(); phoneApp = 'home'; $('phone').hidden = false; renderPhone(); sfx.pickup(); startWalletScan();
  try { dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail:{ register:(...ws) => { ws.forEach(addWallet); return () => {}; } } })); } catch(e){}
  if (x1Addr && x1Bal === null) fetchBalance();
}

/* ---------- NFT marketplace: buy and sell NFTs for XNT ---------- */
let nftListings = [], nftRecent = [], nftFeeBps = 0, nftSel = null, nftBuyPrep = null, nftBusy = false;
async function loadNftListings(){ if (!srvMode) return; try { const j = await (await fetch(PROFILE_API + '/api/market/listings', { cache:'no-store' })).json(); nftListings = j.listings || []; nftRecent = j.recent || []; nftFeeBps = j.feeBps || 0; if (hubMode) drawBoard(); } catch(e){} }
const b64ToBytes = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
function bytesToB64(b){ let s = ''; for (let i=0;i<b.length;i+=8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192)); return btoa(s); }
// sign a server-built transaction with whichever wallet is connected
function signTxLocal(bytes, kp){
  const n = bytes[0], msg = bytes.slice(1 + 64*n), numReq = msg[0], keyCount = msg[3], pub = kp.publicKey;
  for (let i=0;i<numReq && i<keyCount;i++){ const k = msg.slice(4 + 32*i, 4 + 32*(i + 1)); if (k.every((v, j) => v === pub[j])){ const out = bytes.slice(); out.set(nacl.sign.detached(msg, kp.secretKey), 1 + 64*i); return out; } }
  throw new Error('This wallet is not part of the transaction.');
}
async function signTxB64(b64){
  requireCrypto();
  const bytes = b64ToBytes(b64);
  if (x1Active && x1Active.game){ if (!gw.unlocked || !gw.kp) throw new Error('Unlock your game wallet first.'); return bytesToB64(signTxLocal(bytes, gw.kp)); }
  if (x1Active && x1Active.std){
    const f = x1Active.w.features['solana:signTransaction']; if (!f) throw new Error("This wallet can't sign marketplace transactions.");
    const acc = x1Active.w.accounts.find(a => a.address === x1Addr) || x1Active.w.accounts[0], chains = x1Active.w.chains || [];
    const chain = chains.find(c => /x1/i.test(c)) || chains.find(c => /solana:mainnet/.test(c)) || chains[0];
    const r = await f.signTransaction({ account:acc, transaction:bytes, chain }); return bytesToB64(new Uint8Array((r[0] || r).signedTransaction));
  }
  throw new Error(x1Active ? "This wallet connection can't sign marketplace transactions. Disconnect and connect again using X1 Wallet." : 'Connect a wallet in the phone first.');
}
async function nftFlow(prepPath, prepBody, okMsg){
  if (!cryptoGate()) return;
  if (nftBusy) return; nftBusy = true; $('mkMsg').textContent = 'Preparing...';
  try {
    const j = await postJSON(prepPath, prepBody);
    $('mkMsg').textContent = 'Approve the transaction in your wallet...';
    const signed = await signTxB64(j.tx);
    $('mkMsg').textContent = 'Confirming on X1...';
    await postJSON('/api/market/submit', { id:j.id, tx:signed });
    $('mkMsg').textContent = okMsg; sfx.levelUp(); nftSel = null; nftBuyPrep = null;
    await loadNftListings(); setTimeout(() => fetchBalance(), 1500);
  } catch(e){ $('mkMsg').textContent = `Couldn't complete: ${String(e.message || e).slice(0, 100)}`; }
  nftBusy = false; drawMarket();
}
const xnt = l => (l/1e9).toLocaleString(undefined, { maximumFractionDigits:4 });
function nftCardEl(name, sub, price, image, onClick, mine){
  const b = document.createElement('button'); b.type = 'button'; b.className = 'nftCard' + (mine ? ' me' : '');
  const img = document.createElement('img'); img.alt = ''; img.referrerPolicy = 'no-referrer'; img.src = nftArtCanvas({ item:name, collection:sub }).toDataURL('image/jpeg', .7);
  if (image){ const real = new Image(); real.referrerPolicy = 'no-referrer'; real.onload = () => { img.src = real.src; }; real.src = viaProxy(image); }
  const t = document.createElement('b'); t.textContent = name; const m = document.createElement('span'); m.textContent = sub; const p = document.createElement('em'); p.textContent = price;
  b.append(img, t, m, p); b.addEventListener('click', onClick); return b;
}
function drawNftMarket(box){
  box.innerHTML = '';
  const line = (t, cls) => { const p = document.createElement('p'); p.className = cls || 'mkSub'; p.textContent = t; box.appendChild(p); return p; };
  const btn = (t, fn, cls) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ' + (cls || ''); b.textContent = t; b.addEventListener('click', fn); box.appendChild(b); return b; };
  if (!srvMode){ line('Buying and selling NFTs works on your Railway site.'); return; }
  const usd = v => xntUsd ? `  ≈ ${fmtUsd(v/1e9*xntUsd)}` : '';
  if (mkView === 'nftbuy'){
    if (nftBuyPrep){
      const l = nftBuyPrep.l, bd = nftBuyPrep.breakdown;
      line(`Buy ${l.name} for ${xnt(l.lamports)} XNT${usd(l.lamports)}`, 'mkBig');
      line(`Seller receives ${xnt(bd.seller)} XNT, creator royalties ${xnt(bd.royalty)} XNT${bd.fee ? `, market fee ${xnt(bd.fee)} XNT` : ''}. The NFT and payment move together in one transaction.`);
      btn('Confirm and sign', () => nftFlow('/api/market/prepare-buy', { id:l.id, buyer:x1Addr }, `You bought ${l.name}. It's in your wallet.`), '');
      btn('Back', () => { nftBuyPrep = null; drawMarket(); }, 'ghost');
      return;
    }
    line(nftListings.length ? `${nftListings.length} NFTs for sale. Prices in XNT.` : 'Nothing is for sale yet. Open "Sell NFTs" to list one.');
    const grid = document.createElement('div'); grid.id = 'mkGrid2'; grid.className = 'mkGridX'; box.appendChild(grid);
    for (const l of nftListings){
      const mine = l.seller === x1Addr;
      grid.appendChild(nftCardEl(l.name, `${l.symbol || 'NFT'} · seller ${shortAddr(l.seller)}${mine ? ' (you)' : ''}`, `${xnt(l.lamports)} XNT`, l.image, () => {
        if (mine){ $('mkMsg').textContent = 'This is your listing. Cancel it from "Sell NFTs".'; return; }
        if (!x1Active || !isAddr(x1Addr)){ $('mkMsg').textContent = 'Connect your wallet in the phone first.'; return; }
        const bd = { seller:l.lamports - Math.floor(l.lamports*l.fee/10000) - Math.floor(l.lamports*nftFeeBps/10000), royalty:Math.floor(l.lamports*l.fee/10000), fee:Math.floor(l.lamports*nftFeeBps/10000) };
        nftBuyPrep = { l, breakdown:bd }; drawMarket();
      }, mine));
    }
    btn('Browse more on X1 Brains', () => { closeUI(true); openInPhone(X1BRAINS_URL); }, 'ghost');
    if (nftRecent.length){ line('Recent sales:', 'mkSub'); for (const r of nftRecent.slice(0, 5)) line(`${r.name} sold for ${xnt(r.lamports)} XNT, ${ago(r.at)}`, 'mkMeta'); }
    return;
  }
  // sell view
  if (!x1Active || !isAddr(x1Addr)){ line('Connect your wallet in the phone to list NFTs for sale.'); return; }
  if (acct && !acct.claimed){ line('Claim your account first (Account in the menu) to sell on the market.'); return; }
  if (!holder.checked || holder.addr !== x1Addr){ line('Loading your NFTs...'); if (!holder.loading) fetchBalance().then(drawMarket); return; }
  const mine = nftListings.filter(l => l.seller === x1Addr);
  if (mine.length){ line('Your listings:', 'mkSub'); for (const l of mine) btn(`Cancel ${l.name} (${xnt(l.lamports)} XNT)`, () => nftFlow('/api/market/prepare-cancel', { id:l.id, seller:x1Addr }, `${l.name} is no longer for sale.`), 'ghost'); }
  if (nftSel){
    line(`List ${nftSel.name || shortAddr(nftSel.mint)} for sale`, 'mkBig');
    const inp = document.createElement('input'); inp.id = 'nftPrice'; inp.placeholder = 'Price in XNT, for example 12.5'; inp.inputMode = 'decimal'; inp.className = 'mkPriceIn'; box.appendChild(inp);
    const hint = line(''); inp.addEventListener('input', () => { const v = parseFloat(inp.value); hint.textContent = v > 0 && xntUsd ? `≈ ${fmtUsd(v*xntUsd)}` : ''; });
    line('Your NFT stays in your wallet until it sells. Listing lets the market move only this NFT, and only when a buyer pays your price.');
    btn('List for sale', () => { const v = parseFloat(inp.value); if (!(v >= .01)){ $('mkMsg').textContent = 'Enter a price of at least 0.01 XNT.'; return; } nftFlow('/api/market/prepare-list', { seller:x1Addr, mint:nftSel.mint, price:v }, `${nftSel.name} is listed for ${v} XNT.`); }, '');
    btn('Back', () => { nftSel = null; drawMarket(); }, 'ghost');
    return;
  }
  const listed = new Set(mine.map(l => l.mint)), sellable = holder.nfts.filter(n => !n.t22 && !listed.has(n.mint));
  line(sellable.length ? 'Pick an NFT to sell:' : 'No sellable NFTs in this wallet. Soulbound profile NFTs can\u2019t be sold.');
  const grid = document.createElement('div'); grid.className = 'mkGridX'; box.appendChild(grid);
  for (const n of sellable) grid.appendChild(nftCardEl(n.name || shortAddr(n.mint), n.symbol || 'NFT', 'Sell', n.image || '', () => { nftSel = n; drawMarket(); }));
  const need = sellable.filter(n => n.image === undefined); if (need.length) Promise.all(need.map(n => nftImage(n))).then(() => { if (mkView === 'nftsell' && !nftSel && !$('marketPanel').hidden) drawMarket(); });
}

function openMarket(){ openUI(); mkView = srvMode ? 'nftbuy' : 'browse'; nftSel = null; nftBuyPrep = null; if (srvMode) loadNftListings().then(() => { if (!$('marketPanel').hidden) drawMarket(); }); $('mkMsg').textContent = ''; $('marketPanel').hidden = false; drawMarket(); }
async function removeListing(){
  if (!net.db || !lbId) return;
  try { await net.db.doc('market/' + lbId).delete(); $('mkMsg').textContent = 'Listing removed.'; } catch(e){ $('mkMsg').textContent = "Couldn't remove the listing."; }
}

