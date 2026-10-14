/* ---------- Tradeable cosmetics: drops, claiming, equipping ---------- */
let itemCatalog = null, matchSid = null, bossKills = 0, myDrops = [], ownedItems = new Set();
let cosmetics = {}; try { cosmetics = JSON.parse(store.get('dy-cosmetics') || '{}') || {}; } catch(e){ cosmetics = {}; }
cosmetics.pet = cosmetics.pet || {};
function saveCosmetics(){ store.set('dy-cosmetics', JSON.stringify(cosmetics)); presT = 0; }
const RARITY_COL = { Common:'#c9c9c9', Rare:'#4f9dff', Epic:'#b45cff', Legendary:'#f0a93b', Mythic:'#ff4f7a' };
const has = id => ownedItems.has(id);
async function loadCatalog(){ if (!PROFILE_API) return null; if (itemCatalog) return itemCatalog; try { itemCatalog = await (await fetch(PROFILE_API + '/api/items/catalog', { cache:'no-store' })).json(); } catch(e){} return itemCatalog; }
async function postJSON(path, body){ const r = await fetch(PROFILE_API + path, { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(body) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'request failed'); return j; }
// The server checks each match: the game reports every cleared wave as it happens, and drops,
// leaderboard scores and profile NFT stats only count what those reports prove.
// Requests go out one at a time, in order, and each belongs to its own match object, so a quick
// restart can't mix up two matches.
let matchQ = Promise.resolve(), curMatch = null;
const matchHostSid = () => (coop && coop.host && curMatch && curMatch.sid) || '';
function matchStart(){
  bossKills = 0; curMatch = null; matchSid = null;
  if (!srvMode || !guestKey || hubMode) return;
  const m = curMatch = { sid:null, ok:true, guest:guestKey.pub }, ts = Date.now(), map = currentMap, mode = gameMode;
  matchQ = matchQ.then(async () => { try { const sig = await srvSign({ op:'start', guest:m.guest, map, mode, ts }); m.sid = matchSid = (await postJSON('/api/match/start', { guest:m.guest, map, mode, ts, sig })).sid || null; } catch(e){} });
}
function matchWave(cleared){
  const m = curMatch; if (!m) return;
  const b = { op:'wave', guest:m.guest, wave:cleared, kills, heads:headshots, bosses:bossKills, xp:gameXP, host:(coop && coop.guest && coop.hostSid) || null, ts:0 };
  matchQ = matchQ.then(async () => {
    if (!m.sid || !m.ok) return;
    try { Object.assign(b, { sid:m.sid, ts:Date.now() }); await postJSON('/api/match/wave', { ...b, sig:await srvSign(b) }); }
    catch(e){ if (/verified/.test(e.message)) m.ok = false; }
  });
}
function matchEnd(){
  const m = curMatch; curMatch = null; matchSid = null;
  if (!m) return Promise.resolve({ drops:[] });
  const b = { op:'end', guest:m.guest, wave, kills, heads:headshots, bosses:bossKills, xp:gameXP, score, ts:0 };
  return matchQ = matchQ.then(async () => {
    if (!m.sid) return { drops:[] };
    try { Object.assign(b, { sid:m.sid, ts:Date.now() }); return await postJSON('/api/match/end', { ...b, sig:await srvSign(b) }); } catch(e){ return { drops:[] }; }
  });
}
async function loadDrops(){ if (!srvMode || !guestKey) return []; try { myDrops = (await (await fetch(`${PROFILE_API}/api/drops?guest=${guestKey.pub}`, { cache:'no-store' })).json()).drops || []; } catch(e){} return myDrops; }
function claimBlocker(){
  if (!srvMode) return 'Items can be claimed on your Railway site.';
  if (!acct || !acct.claimed) return 'Claim your account (Account in the menu) to keep this item.';
  if (!x1Active || x1Addr !== acct.wallet) return `Connect your wallet ${shortAddr(acct.wallet)} in the phone to claim.`;
  return '';
}
async function claimDrop(d, onDone){
  if (!cryptoGate()) return;
  const why = claimBlocker(); if (why){ toast(why, 4500); if (srvMode && acct && acct.claimed && (!x1Active || x1Addr !== acct.wallet)){ openPhone(); phoneApp = 'wallet'; renderPhone(); } return; }
  try {
    const msg = { op:'claim', guest:guestKey.pub, dropId:d.id, wallet:acct.wallet, ts:Date.now() };
    const guestSig = await srvSign(msg), walletSig = b58(await walletSign(new TextEncoder().encode(`Dust Yard item claim\n${canonicalJSON(msg)}`)));
    toast('Minting your item on X1...', 4000);
    const j = await postJSON('/api/drops/claim', Object.assign({}, msg, { guestSig, walletSig }));
    d.status = 'claimed'; d.mint = j.mint; toast(`${d.item.name} #${d.serial} is in your wallet.`, 4500); sfx.levelUp();
    setTimeout(() => fetchBalance(), 2500);
  } catch(e){ toast(`Couldn't claim: ${String(e.message || e).slice(0, 80)}`, 4000); }
  if (onDone) onDone();
}
// items count as owned only for a verified wallet holding a genuine item from the game's collection
async function computeOwnedItems(){
  ownedItems = new Set();
  if (!x1Verified || !holder.checked || holder.addr !== x1Addr) return;
  const cat = await loadCatalog(); if (!cat || !cat.collection) return;
  const mine = holder.nfts.filter(n => n.symbol === 'DYI' && n.collection && n.collection.verified && n.collection.key === cat.collection);
  await Promise.all(mine.map(n => nftImage(n)));
  for (const n of mine) if (n.traits && n.traits.item_id) ownedItems.add(n.traits.item_id);
  WEAPONS.forEach(W => applyCamo(W));
  if (pet && Object.keys(cosmetics.pet).some(k => cosmetics.pet[k])) summonPet();
}
function petCos(){ return Object.keys(cosmetics.pet).filter(k => cosmetics.pet[k] && has(k)); }
// decorate a companion with equipped item skins (also used for other players' companions)
function decoratePet(o, cos, col){
  if (!o || !cos || !cos.length) return;
  const head = o.head, rig = o.rig;
  if (cos.includes('golden_aura')){ const a = new THREE.Sprite(new THREE.SpriteMaterial({ map:flashTex, color:0xf0c419, blending:THREE.AdditiveBlending, transparent:true, opacity:.45, depthWrite:false })); a.position.y = .85; a.scale.set(1.7, 2.3, 1); rig.add(a); }
  if (cos.includes('glowing_headband') && head){ const band = new THREE.Mesh(Bx(.34, .055, .34), new THREE.MeshBasicMaterial({ color:col || 0x2ee6ff })); band.position.y = .1; head.add(band); }
  if (cos.includes('crimson_katana') && o.blade){ o.blade.traverse(m => { if (m.isMesh && m.geometry.parameters && m.geometry.parameters.depth > .5) m.material = new THREE.MeshStandardMaterial({ color:0xd0202a, emissive:0x5a0008, roughness:.2, metalness:.7 }); }); if (o.style !== 'katana' && o.kind === 'ninja' && o.style !== 'nunchucks') o.style = 'katana'; }
}
function tagStyleOwned(){ return cosmetics.tag && has(cosmetics.tag) ? (cosmetics.tag === 'gold_tag' ? 'gold' : 'neon') : ''; }
function cardOwned(){ return cosmetics.card && has(cosmetics.card) ? cosmetics.card : ''; }
function drawCallingCard(id, name){
  const c = document.createElement('canvas'); c.width = 600; c.height = 120; const g = c.getContext('2d');
  const neon = id === 'neon_card', gr = g.createLinearGradient(0, 0, 600, 120);
  gr.addColorStop(0, neon ? '#2a0f3d' : '#3a2410'); gr.addColorStop(1, neon ? '#0b2a3d' : '#1a1410'); g.fillStyle = gr; g.fillRect(0, 0, 600, 120);
  g.strokeStyle = neon ? '#ff3cc8' : '#f0a93b'; g.lineWidth = 4; g.strokeRect(4, 4, 592, 112);
  for (let i=0;i<14;i++){ g.fillStyle = neon ? `rgba(46,230,255,${.08 + Math.random()*.15})` : `rgba(240,169,59,${.06 + Math.random()*.12})`; g.fillRect(Math.random()*600, Math.random()*120, 2 + Math.random()*40, 2); }
  g.fillStyle = '#fff'; g.font = '700 44px "Barlow Condensed", Arial'; g.fillText(name, 24, 66); g.font = '600 20px "Barlow Condensed", Arial'; g.fillStyle = neon ? '#2ee6ff' : '#f0a93b'; g.fillText(neon ? 'NEON DISTRICT' : 'DUST YARD', 26, 98);
  c.className = 'callCard'; return c;
}
function renderDropsInto(box, drops, title){
  box.innerHTML = ''; if (!drops.length) return;
  const h = document.createElement('b'); h.textContent = title; box.appendChild(h);
  for (const d of drops){
    const row = document.createElement('div'); row.className = 'dropRow';
    const t = document.createElement('span'); t.textContent = `${d.item.name} #${d.serial} of ${d.item.supply}`;
    const r = document.createElement('em'); r.textContent = d.item.rarity; r.style.color = RARITY_COL[d.item.rarity] || '#fff';
    row.append(t, r);
    if (d.status !== 'claimed'){ const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = 'Claim to wallet'; b.addEventListener('click', () => { b.disabled = true; claimDrop(d, () => { b.textContent = d.status === 'claimed' ? 'Claimed' : 'Claim to wallet'; b.disabled = d.status === 'claimed'; }); }); row.appendChild(b); }
    else { const s = document.createElement('i'); s.textContent = 'In your wallet'; row.appendChild(s); }
    box.appendChild(row);
  }
  const why = claimBlocker(); if (why){ const p = document.createElement('p'); p.className = 'dropHint'; p.textContent = why; box.appendChild(p); }
}
function renderItemsApp(body){
  const head = document.createElement('div'); head.className = 'phHead';
  head.append(phoneBtn('‹ Home', () => { phoneApp = 'home'; renderPhone(); }, 'phBack'), phoneLine('Items', 'phTitle')); body.appendChild(head);
  if (!srvMode){ body.appendChild(phoneLine('Tradeable items drop and get claimed on your Railway site.', 'phSmall')); return; }
  body.appendChild(phoneBtn('Drop rates and supplies', () => openSite(`${PROFILE_API || LEGAL_BASE_DEFAULT}/drop-rates`), 'phGhost'));
  if (itemCatalog && itemCatalog.season){ const left = Math.max(0, Math.ceil((itemCatalog.seasonEnds - Date.now())/864e5)); body.appendChild(phoneLine(`Season ${itemCatalog.season}: ${left} day${left === 1 ? '' : 's'} left. Season items never drop again after it ends.`, 'phOk')); }
  const un = myDrops.filter(d => d.status !== 'claimed');
  body.appendChild(phoneLine(un.length ? `${un.length} item${un.length === 1 ? '' : 's'} waiting to be claimed` : 'No unclaimed drops. Items drop from matches: bosses, deep waves and Neon District.', 'phSmall'));
  for (const d of un){ body.appendChild(phoneLine(`${d.item.name} #${d.serial} (${d.item.rarity})`, 'phOk')); body.appendChild(phoneBtn('Claim to wallet', () => claimDrop(d, () => { loadDrops().then(renderPhone); }), 'phMain')); }
  const owned = (itemCatalog && itemCatalog.items || []).filter(it => has(it.id));
  body.appendChild(phoneLine(owned.length ? 'Your on-chain items:' : (x1Verified ? 'No Dust Yard items in this wallet yet.' : 'Verify your wallet to use items you own.'), 'phSmall'));
  for (const it of owned){
    const on = it.type === 'petskin' ? !!cosmetics.pet[it.id] : it.type === 'tag' ? cosmetics.tag === it.id : it.type === 'card' ? cosmetics.card === it.id : it.type === 'trophy' ? cosmetics.trophies !== false : false;
    const label = it.type === 'camo' ? `${it.name}: equip in the Gunsmith` : it.type === 'trophy' ? `${it.name}: shown in the Degen Market` : `${on ? 'Unequip' : 'Equip'} ${it.name}`;
    body.appendChild(phoneBtn(label, () => {
      if (it.type === 'petskin'){ cosmetics.pet[it.id] = !cosmetics.pet[it.id]; summonPet(); }
      else if (it.type === 'tag') cosmetics.tag = on ? '' : it.id;
      else if (it.type === 'card') cosmetics.card = on ? '' : it.id;
      else return;
      saveCosmetics(); renderPhone();
    }, on ? 'phGhost' : ''));
  }
  if (itemCatalog && itemCatalog.collection) body.appendChild(phoneBtn('View collection on X1 Explorer', () => { const a = document.createElement('a'); a.href = 'https://explorer.mainnet.x1.xyz/address/' + itemCatalog.collection; a.target = '_blank'; a.rel = 'noopener noreferrer'; document.body.appendChild(a); a.click(); a.remove(); }));
}
// trophies on display next to the trade board
let trophyGroup = null;
function showTrophies(){
  if (trophyGroup){ scene.remove(trophyGroup); trophyGroup = null; }
  if (!hubMode) return;
  const ids = ['juggernaut_skull', 'raider_banner'].filter(has); if (!ids.length) return;
  trophyGroup = new THREE.Group(); trophyGroup.position.set(7, 0, -24); scene.add(trophyGroup);
  ids.forEach((id, i) => {
    const x = i*2.2, ped = new THREE.Mesh(Cy(.6, .7, 1, 16), new THREE.MeshStandardMaterial({ color:0x2b2d33, roughness:.5, metalness:.6 })); ped.position.set(x, .5, 0); ped.castShadow = true; trophyGroup.add(ped);
    if (id === 'juggernaut_skull'){ const sk = new THREE.Mesh(new THREE.SphereGeometry(.45, 18, 14), new THREE.MeshStandardMaterial({ color:0xe8e2d0, roughness:.6 })); sk.scale.set(1, .9, 1); sk.position.set(x, 1.45, 0); trophyGroup.add(sk);
      for (const sx of [-1, 1]){ const eye = new THREE.Mesh(new THREE.SphereGeometry(.09, 10, 8), new THREE.MeshBasicMaterial({ color:0xff3b2f })); eye.position.set(x + sx*.15, 1.5, .38); trophyGroup.add(eye); } }
    else { const pole = new THREE.Mesh(Cy(.04, .04, 2.2, 8), new THREE.MeshStandardMaterial({ color:0x6b4a2a })); pole.position.set(x, 2.1, 0); trophyGroup.add(pole);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1, .7), new THREE.MeshStandardMaterial({ color:0xc7364f, side:THREE.DoubleSide })); flag.position.set(x + .52, 2.8, 0); trophyGroup.add(flag); }
    const tag = nameTag(itemCatalog.items.find(t => t.id === id).name, 0xf0a93b); tag.position.set(x, 2.4 + (id === 'raider_banner' ? .9 : 0), 0); tag.scale.multiplyScalar(.75); trophyGroup.add(tag);
  });
}

/* ---------- Sign-in screen and remembered wallets ---------- */
const LOGIN_DAYS = 7;
function loginSaved(){ try { return JSON.parse(store.get('dy-login') || 'null'); } catch(e){ return null; } }
function saveLogin(o){ store.set('dy-login', o ? JSON.stringify(o) : ''); }
function signedIn(){ return !!(x1Active && isAddr(x1Addr) && x1Verified); }
function renderAcctChip(){
  const c = $('acctChip'); if (!c || !acct) return;
  const name = acct.claimed ? '@' + acct.username : acct.name;
  const sub = x1Addr ? `${shortAddr(x1Addr)}${typeof x1Bal === 'number' ? ' · ' + x1Bal.toLocaleString(undefined, { maximumFractionDigits:2 }) + ' XNT' : ''}${x1Verified ? ' ✓' : ''}` : 'Playing as guest';
  c.querySelector('.chipName').textContent = name; c.querySelector('.chipSub').textContent = sub;
  c.querySelector('.chipAct').textContent = signedIn() ? 'Account' : x1Active ? 'Verify' : 'Sign in';
}
function openLogin(){ $('loginPanel').hidden = false; $('lgMsg').textContent = ''; renderLogin(); if (padActive) setPadFocus($('loginPanel').querySelector('button')); }
function closeLogin(){ $('loginPanel').hidden = true; renderAcctChip(); }
function lgBtn(label, fn, cls, icon){
  const b = document.createElement('button'); b.type = 'button'; b.className = 'lgBtn ' + (cls || '');
  if (icon){ const i = document.createElement('img'); i.alt = ''; i.onerror = () => i.remove(); i.src = icon; b.appendChild(i); }
  const s = document.createElement('span'); s.textContent = label; b.appendChild(s); b.addEventListener('click', fn); return b;
}
function renderLogin(){
  const box = $('lgBody'); box.innerHTML = '';
  const p = (t, cls) => { const e = document.createElement('p'); e.className = cls || 'lgSub'; e.textContent = t; box.appendChild(e); };
  if (x1Active && isAddr(x1Addr)){
    p(acct.claimed ? `Signed in as @${acct.username}` : `Connected as ${acct.name}`, 'lgName');
    p(`${x1WalletName || 'Wallet'} · ${shortAddr(x1Addr)}${typeof x1Bal === 'number' ? ' · ' + x1Bal.toLocaleString(undefined, { maximumFractionDigits:3 }) + ' XNT' : ''}`);
    if (!x1Verified) box.appendChild(lgBtn('Verify ownership (free signature)', async () => { await verifyWallet(); afterSignIn(); }, 'main'));
    else p(acct.claimed && acct.wallet === x1Addr ? 'Wallet verified. Your account, perks and items are active.' : 'Wallet verified.', 'lgOk');
    if (!acct.claimed) box.appendChild(lgBtn('Claim your account with this wallet', () => { closeLogin(); openAccount('wallet'); }, 'main'));
    else if (acct.wallet !== x1Addr) p(`Your account @${acct.username} belongs to ${shortAddr(acct.wallet)}. Connect that wallet to use it.`, 'lgWarn');
    box.appendChild(lgBtn('Account', () => { closeLogin(); openAccount(); }));
    box.appendChild(lgBtn('Sign out', () => { disconnectWallet(); x1Verified = false; acctSession = false; saveLogin(null); $('lgMsg').textContent = 'Signed out. Your progress stays in this browser.'; renderLogin(); renderAcctChip(); }, 'ghost'));
    box.appendChild(lgBtn('Close', closeLogin, 'ghost'));
    return;
  }
  p('Sign in with your wallet to keep progress safe, use your NFTs and trade. Or just play as a guest.');
  const groups = walletOptions();
  for (const g of groups){ const w = g.cands.find(c => c.std); box.appendChild(lgBtn(`Continue with ${g.name}`, () => loginWith(g), g.name === 'X1 Wallet' ? 'main' : '', w && w.w.icon && /^data:image\//.test(w.w.icon) ? w.w.icon : '')); }
  if (!groups.length) p(window.claude ? 'Wallet extensions can\u2019t reach the game inside Claude. Use your Railway site, or a game wallet.' : location.protocol === 'file:' ? 'Open the game from a website to use wallet extensions.' : 'No wallet extension found. Install X1 Wallet or Backpack, or use a game wallet.', 'lgWarn');
  box.appendChild(lgBtn(gwBox ? 'Unlock my game wallet' : 'Create a game wallet', () => { closeLogin(); openPhone(); phoneApp = gwBox ? (gw.unlocked ? 'wallet' : 'gwUnlock') : 'gwCreate'; renderPhone(); }));
  box.appendChild(lgBtn('Play as guest', closeLogin, 'ghost'));
}
async function loginWith(g){
  $('lgMsg').textContent = `Approve the connection in ${g.name}...`;
  await connectWallet(g);
  if (!x1Active || !isAddr(x1Addr)){ $('lgMsg').textContent = x1Msg || 'The wallet did not connect.'; return; }
  $('lgMsg').textContent = 'Now sign the free message to prove the wallet is yours...';
  await verifyWallet();
  afterSignIn();
}
function afterSignIn(){
  if (x1Verified){
    saveLogin({ wallet:x1WalletName, addr:x1Addr, until:Date.now() + LOGIN_DAYS*864e5 });
    if (acct.claimed && acct.wallet === x1Addr) acctSession = true;
    $('lgMsg').textContent = acct.claimed && acct.wallet === x1Addr ? `Welcome back, @${acct.username}.` : 'Signed in.';
    fetchBalance();
  } else $('lgMsg').textContent = 'The signature was cancelled. You can verify later.';
  renderLogin(); renderAcctChip();
}
// reconnect a remembered wallet without popups, and keep it verified for a few days
let autoTried = false;
async function autoReconnect(){
  if (cryptoBlockReason()) return;
  const s = loginSaved(); if (autoTried || !s || !s.addr || x1Active) return; autoTried = true;
  const g = walletOptions().find(x => x.name === s.wallet); if (!g){ autoTried = false; return; }
  for (const e of g.cands){
    try {
      let addr = '';
      if (e.std){ const r = await e.w.features['standard:connect'].connect({ silent:true }); addr = r && r.accounts && r.accounts[0] ? r.accounts[0].address : ''; }
      else { const r = await e.p.connect({ onlyIfTrusted:true }); const pk = (r && r.publicKey) || e.p.publicKey; addr = pk ? String(pk.toBase58 ? pk.toBase58() : pk) : ''; }
      if (addr && addr === s.addr){
        x1Addr = addr; x1Active = e; x1WalletName = g.name; x1Bal = null; store.set('dustyard-x1addr', addr);
        x1Verified = Date.now() < (s.until || 0);
        if (x1Verified && acct && acct.claimed && acct.wallet === addr) acctSession = true;
        fetchBalance(); renderAcctChip();
        toast(acct && acct.claimed && acct.wallet === addr ? `Welcome back, @${acct.username}.` : `Wallet reconnected: ${shortAddr(addr)}`, 3000);
        return;
      }
    } catch(err){}
  }
}

/* ---------- Swap app (XDEX, XNT <-> USDC.X) ---------- */
let swapFrom = 'XNT', swapQuoteRes = null, swapQT = null, swapBusy = false;
function usdcBal(){ const t = (holder.tokens || []).find(x => x.mint === 'B69chRzqzDCmdB5WYB8NRu5Yv5ZA95ABiZcdzCgGm9Tq'); return t ? t.amount : 0; }
async function fetchSwapQuote(amt){
  if (!(amt > 0)){ swapQuoteRes = null; renderPhone(); return; }
  try { const r = await fetch(`${PROFILE_API}/api/swap/quote?from=${encodeURIComponent(swapFrom)}&amount=${amt}`, { cache:'no-store' }); swapQuoteRes = await r.json(); } catch(e){ swapQuoteRes = { error:'quote unavailable' }; }
  if (phoneApp === 'swap'){ const el = $('swOut'); if (el) el.textContent = swapQuoteRes.error ? swapQuoteRes.error : `≈ ${swapQuoteRes.amountOut.toLocaleString(undefined, { maximumFractionDigits:6 })} ${swapFrom === 'XNT' ? 'USDC.X' : 'XNT'} (fee ${swapQuoteRes.feePct}%)`; }
}
async function doSwap(amt){
  if (!cryptoGate()) return;
  if (swapBusy) return; swapBusy = true;
  const msg = t => { x1Msg = t; const el = $('swMsg'); if (el) el.textContent = t; };
  try {
    msg('Checking the swap...');
    const j = await postJSON('/api/swap/prepare', { owner:x1Addr, from:swapFrom, amount:amt, slippageBps:100 });
    msg(`Approve in your wallet: get at least ${j.minOut.toLocaleString(undefined, { maximumFractionDigits:6 })} ${swapFrom === 'XNT' ? 'USDC.X' : 'XNT'}...`);
    const signed = await signTxB64(j.tx);
    msg('Swapping on XDEX...');
    const r = await postJSON('/api/swap/submit', { id:j.id, tx:signed });
    msg('Swap complete.'); sfx.levelUp(); toast(`Swapped ${amt} ${swapFrom} on XDEX.`, 3500);
    setTimeout(() => fetchBalance(), 1500);
  } catch(e){ msg(`Couldn't swap: ${String(e.message || e).slice(0, 90)}`); }
  swapBusy = false;
}
function renderSwapApp(body){
  const head = document.createElement('div'); head.className = 'phHead';
  head.append(phoneBtn('‹ Home', () => { phoneApp = 'home'; x1Msg = ''; renderPhone(); }, 'phBack'), phoneLine('Swap', 'phTitle')); body.appendChild(head);
  if (!srvMode){ body.appendChild(phoneLine('Swaps work on your Railway site.', 'phSmall')); return; }
  if (!x1Active || !isAddr(x1Addr)){ body.appendChild(phoneLine('Connect your wallet first.', 'phSmall')); body.appendChild(phoneBtn('Open X1 Wallet', () => { phoneApp = 'wallet'; renderPhone(); }, 'phMain')); return; }
  const to = swapFrom === 'XNT' ? 'USDC.X' : 'XNT', have = swapFrom === 'XNT' ? (typeof x1Bal === 'number' ? x1Bal : 0) : usdcBal();
  body.appendChild(phoneLine(`From ${swapFrom} (you have ${have.toLocaleString(undefined, { maximumFractionDigits:4 })})`, 'phSmall'));
  const inp = document.createElement('input'); inp.id = 'swIn'; inp.inputMode = 'decimal'; inp.placeholder = `Amount of ${swapFrom}`; inp.autocomplete = 'off'; body.appendChild(inp);
  let tmr = null; inp.addEventListener('input', () => { clearTimeout(tmr); const v = parseFloat(inp.value); tmr = setTimeout(() => fetchSwapQuote(v), 350); });
  const out = phoneLine(`To ${to}`, 'phOk'); out.id = 'swOut'; body.appendChild(out);
  const row = document.createElement('div'); row.className = 'phRow';
  row.append(phoneBtn('⇅ Flip', () => { swapFrom = to; swapQuoteRes = null; renderPhone(); }), phoneBtn('Max', () => { const keep = swapFrom === 'XNT' ? .02 : 0; inp.value = Math.max(0, have - keep).toFixed(swapFrom === 'XNT' ? 4 : 2); fetchSwapQuote(parseFloat(inp.value)); }));
  body.appendChild(row);
  body.appendChild(phoneBtn(`Swap ${swapFrom} for ${to}`, () => { const v = parseFloat(inp.value); if (!(v > 0)){ x1Msg = 'Enter an amount.'; renderPhone(); return; } if (v > have){ x1Msg = `You only have ${have} ${swapFrom}.`; renderPhone(); return; } doSwap(v); }, 'phMain'));
  body.appendChild(phoneLine('Trades directly with the XNT/USDC.X pool on XDEX, signed in your own wallet. 1% slippage protection: the swap cancels itself if the price moves more than that. You pay a small network fee in XNT.', 'phSmall'));
  const m = phoneLine(x1Msg || '', 'phMsg'); m.id = 'swMsg'; body.appendChild(m);
}

