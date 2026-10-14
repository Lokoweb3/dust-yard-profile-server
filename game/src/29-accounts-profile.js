/* ---------- Guest-first accounts: guest key, upgrade prompts, two-signature claim ---------- */
let acct = null, guestKey = null, acctStep = 'home', acctName2 = '', acctPending = null, acctMsg = '', promptQueue = [], promptAt = -1e9, acctSession = false;
const RESERVED = ['admin','administrator','mod','moderator','official','x1','xnt','support','staff','dev','developer','degen','dustyard','system','guest','null','root','claude','anthropic'];
const BADWORDS = ['fuck','shit','bitch','cunt','nigg','fag','rape','nazi','hitler','porn','slut','whore','retard'];
const idb = {
  open(){ return new Promise((res, rej) => { const r = indexedDB.open('dustyard', 1); r.onupgradeneeded = () => r.result.createObjectStore('keys'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
  async get(k){ const db = await this.open(); return new Promise((res, rej) => { const q = db.transaction('keys').objectStore('keys').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); },
  async set(k, v){ const db = await this.open(); return new Promise((res, rej) => { const q = db.transaction('keys', 'readwrite').objectStore('keys').put(v, k); q.onsuccess = () => res(); q.onerror = () => rej(q.error); }); }
};
function saveAcct(){ store.set('dy-account', JSON.stringify(acct)); }
function acctName(){ return acct ? (acct.claimed ? acct.username : acct.name) : 'Guest'; }
function guestNameFor(id){ return 'Guest-' + String(1000 + (hashStr(id) % 9000)); }
async function initGuest(){
  try { acct = JSON.parse(store.get('dy-account') || 'null'); } catch(e){ acct = null; }
  try { guestKey = await idb.get('guest'); } catch(e){ guestKey = null; }
  if (!guestKey){
    let pub = '';
    try {
      // non-extractable: the game can sign with it, but nothing can copy the private key out
      const kp = await crypto.subtle.generateKey({ name:'Ed25519' }, false, ['sign','verify']);
      pub = b58(new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey))); guestKey = { wc:kp, pub };
    } catch(e){
      const k = nacl.sign.keyPair(); pub = b58(k.publicKey); guestKey = { sk:Array.from(k.secretKey), pub };
    }
    try { await idb.set('guest', guestKey); } catch(e){}
    if (!acct || !acct.claimed) acct = Object.assign(acct || {}, { guestId:pub, name:guestNameFor(pub), created:Date.now() });
    else acct.guestId = pub;
  }
  if (!acct) acct = { guestId:guestKey.pub, name:guestNameFor(guestKey.pub), created:Date.now() };
  acct = Object.assign({ claimed:false, wallet:'', username:'', promptsOff:false, shown:{}, claimedAt:0, keyType:guestKey.wc ? 'secure' : 'basic' }, acct);
  acct.last = Date.now(); saveAcct();
  try { renderAcctChip(); } catch(e){}
  try { renderProfile(); } catch(e){}
}
async function guestSign(bytes){
  if (guestKey.wc) return new Uint8Array(await crypto.subtle.sign({ name:'Ed25519' }, guestKey.wc.privateKey, bytes));
  return nacl.sign.detached(bytes, Uint8Array.from(guestKey.sk));
}
async function guestVerify(bytes, sig){
  if (guestKey.wc) return crypto.subtle.verify({ name:'Ed25519' }, guestKey.wc.publicKey, sig, bytes);
  return nacl.sign.detached.verify(bytes, sig, b58dec(guestKey.pub));
}
async function walletSign(bytes){
  requireCrypto();
  if (!x1Active) throw new Error('No wallet is connected.');
  if (x1Active.game){ if (!gw.unlocked || !gw.kp) throw new Error('Unlock your game wallet first.'); return nacl.sign.detached(bytes, gw.kp.secretKey); }
  if (x1Active.std){
    const f = x1Active.w.features['solana:signMessage']; if (!f) throw new Error('This wallet cannot sign messages.');
    const acc = x1Active.w.accounts.find(a => a.address === x1Addr) || x1Active.w.accounts[0];
    const r = await f.signMessage({ account:acc, message:bytes }); return new Uint8Array((r[0] || r).signature);
  }
  const r = await x1Active.p.signMessage(bytes, 'utf8'); return new Uint8Array(r.signature || r);
}
function normName(s){ return String(s || '').normalize('NFKC').toLowerCase().trim(); }
function nameError(n){
  if (!/^[a-z0-9_]{3,16}$/.test(n)) return 'Use 3 to 16 letters, numbers or underscores.';
  if (/^guest/.test(n)) return 'Names starting with "guest" are kept for guest players.';
  if (RESERVED.includes(n) || RESERVED.some(r => r.length > 2 && (n.startsWith(r + '_') || n.endsWith('_' + r)))) return 'That name is reserved.';
  const flat = n.replace(/_/g,'').replace(/0/g,'o').replace(/1/g,'i').replace(/3/g,'e').replace(/4/g,'a').replace(/5/g,'s').replace(/7/g,'t');
  if (BADWORDS.some(w => flat.includes(w))) return 'Please choose a different name.';
  const prof = acctProfiles(); for (const w in prof) if (w !== x1Addr && prof[w].username === n) return 'That name is already taken on this device.';
  return '';
}
function acctProfiles(){ try { return JSON.parse(store.get('dy-profiles') || '{}') || {}; } catch(e){ return {}; } }
function snapshot(){ let guns = {}; try { guns = JSON.parse(store.get('dustyard-guns') || '{}'); } catch(e){} return { profile:{ xp:profile.xp, level:profile.level }, guns, best:store.get('dustyard-best') || null }; }
function claimMessage(){
  const now = new Date(), exp = new Date(now.getTime() + 5*60000), nonce = b58(crypto.getRandomValues(new Uint8Array(12)));
  const domain = location.host || 'dust-yard.local', uri = location.origin && location.origin !== 'null' ? location.origin : 'file://dust-yard';
  return `${domain} wants you to sign in with your X1 account:\n${x1Addr}\n\nClaim Dust Yard guest progress as @${acctName2}.\n\nURI: ${uri}\nVersion: 1\nChain ID: x1:mainnet\nNonce: ${nonce}\nIssued At: ${now.toISOString()}\nExpiration Time: ${exp.toISOString()}\nGuest ID: ${acct.guestId}`;
}
async function doClaim(){
  acctMsg = 'Sign the message in your wallet...'; renderAccount();
  try {
    const text = claimMessage(), bytes = new TextEncoder().encode(text);
    const gsig = await guestSign(bytes), wsig = await walletSign(bytes);
    // the checks a game server would run before creating the on-chain profile
    const exp = new Date(text.match(/Expiration Time: (.+)/)[1]).getTime();
    if (Date.now() > exp) throw new Error('The claim expired. Please try again.');
    if (!(await guestVerify(bytes, gsig))) throw new Error("The guest signature didn't verify.");
    if (!nacl.sign.detached.verify(bytes, wsig, b58dec(x1Addr))) throw new Error("The wallet signature didn't verify.");
    if (acct.claimed && acct.wallet !== x1Addr) throw new Error('This guest progress is already claimed by another wallet.');
    const prof = acctProfiles(), existing = prof[x1Addr];
    if (existing && (existing.guests || []).length >= 3 && !(existing.guests || []).includes(acct.guestId)) throw new Error('This wallet has already claimed the maximum of 3 guest profiles.');
    acctPending = { text, gsig:b58(gsig), wsig:b58(wsig) };
    if (existing && existing.snapshot && existing.username){ acctStep = 'conflict'; acctMsg = ''; renderAccount(); return; }
    finishClaim('guest');
  } catch(e){ acctMsg = String((e && e.message) || e).slice(0,160); renderAccount(); }
}
function mergeGuns(a, b){
  const out = JSON.parse(JSON.stringify(a || {}));
  for (const id in (b || {})){ const x = out[id] || {}, y = b[id]; out[id] = { kills:Math.max(x.kills || 0, y.kills || 0), hs:Math.max(x.hs || 0, y.hs || 0), att:Object.assign({}, y.att || {}, x.att || {}), camo:x.camo || y.camo || null }; }
  return out;
}
function finishClaim(choice){
  const prof = acctProfiles(), existing = prof[x1Addr];
  let snap = snapshot(), reload = false;
  if (existing && existing.snapshot){
    const old = existing.snapshot;
    if (choice === 'account'){ snap = old; reload = true; }
    else if (choice === 'merge'){
      const totalXP = s => { let t = s.profile.xp || 0; for (let l=1;l<(s.profile.level || 1);l++) t += xpNeed(l); return t; };
      const keep = totalXP(old) > totalXP(snap) ? old.profile : snap.profile;
      snap = { profile:keep, guns:mergeGuns(snap.guns, old.guns), best:snap.best || old.best }; reload = true;
    }
  }
  const username = existing && existing.username && choice !== 'guest' ? existing.username : acctName2;
  prof[x1Addr] = { username, claimedAt:Date.now(), guests:[...new Set([...((existing && existing.guests) || []), acct.guestId])], snapshot:snap, proof:acctPending };
  store.set('dy-profiles', JSON.stringify(prof));
  Object.assign(acct, { claimed:true, wallet:x1Addr, username, claimedAt:Date.now() }); saveAcct(); acctSession = true; presT = 0;
  if (reload){
    store.set('dustyard-profile', JSON.stringify(snap.profile)); store.set('dustyard-guns', JSON.stringify(snap.guns || {})); if (snap.best) store.set('dustyard-best', snap.best);
    acctStep = 'done'; acctMsg = 'Loading your combined progress...'; renderAccount(); setTimeout(() => location.reload(), 1200); return;
  }
  acctStep = 'done'; acctMsg = ''; renderAccount(); try { renderProfile(); } catch(e){}
  sfx.levelUp(); toast(`Account claimed. Welcome, @${username}.`, 4000);
}
async function signIn(){
  acctMsg = 'Approve the sign-in in your wallet...'; renderAccount();
  try {
    if (x1Addr !== acct.wallet) throw new Error(`Connect the wallet this account belongs to (${shortAddr(acct.wallet)}) in the phone first.`);
    const text = `${location.host || 'dust-yard.local'} wants you to sign in with your X1 account:\n${acct.wallet}\n\nSign in to Dust Yard as @${acct.username}.\n\nNonce: ${b58(crypto.getRandomValues(new Uint8Array(12)))}\nIssued At: ${new Date().toISOString()}`;
    const bytes = new TextEncoder().encode(text), sig = await walletSign(bytes);
    if (!nacl.sign.detached.verify(bytes, sig, b58dec(acct.wallet))) throw new Error("The signature didn't verify.");
    acctSession = true; acctMsg = `Signed in as @${acct.username}.`;
  } catch(e){ acctMsg = String((e && e.message) || e).slice(0,160); }
  renderAccount();
}
function backupCode(){ const s = snapshot(); s.name = acctName(); s.t = Date.now(); return 'DY1.' + btoa(unescape(encodeURIComponent(JSON.stringify(s)))); }
function restoreBackup(code){
  try {
    const s = JSON.parse(decodeURIComponent(escape(atob(String(code).trim().replace(/^DY1\./,'')))));
    if (!s.profile || typeof s.profile.level !== 'number') throw 0;
    store.set('dustyard-profile', JSON.stringify(s.profile)); store.set('dustyard-guns', JSON.stringify(s.guns || {})); if (s.best) store.set('dustyard-best', s.best);
    acctMsg = 'Progress restored. Reloading...'; renderAccount(); setTimeout(() => location.reload(), 1000);
  } catch(e){ acctMsg = "That backup code isn't valid."; renderAccount(); }
}
// upgrade prompts at moments where claiming is clearly worth it
const PROMPTS = {
  boss:{ title:'You took down a Juggernaut', text:'Save your progress so you never lose it. Claim your account with an X1 wallet. It is free and needs no XNT.' },
  level5:{ title:'Level 5 reached', text:'Your progress only lives in this browser. Claim your account to keep it safe and play on any device.' },
  camo:{ title:'New camo unlocked', text:'Claim your account to keep your camos and progress safe.' },
  ranked:{ title:'Ranked scores', text:'Claimed accounts post scores under their own username. Guests post as their guest name.' },
  market:{ title:'Claim your account to trade', text:'To list an item on the Degen Market, claim your account first. It takes a minute and needs no XNT.', block:true }
};
function queuePrompt(k){
  if (!acct || acct.claimed || acct.promptsOff || acct.shown[k]) return;
  if (!promptQueue.includes(k)) promptQueue.push(k);
  if (state !== 'play') maybePrompt();
}
function maybePrompt(force){
  if (!acct || acct.claimed || !$('claimPrompt').hidden) return;
  const k = force || promptQueue[0]; if (!k) return;
  if (!force && (acct.promptsOff || performance.now() - promptAt < 600000)) return;
  promptQueue = promptQueue.filter(x => x !== k); acct.shown[k] = true; saveAcct(); promptAt = performance.now();
  const P = PROMPTS[k]; $('cpTitle').textContent = P.title; $('cpText').textContent = P.text;
  $('cpNever').hidden = !!P.block; $('cpLater').textContent = P.block ? 'Cancel' : 'Not now';
  $('claimPrompt').hidden = false; if (padActive) setPadFocus($('cpClaim'));
}
function closePrompt(){ $('claimPrompt').hidden = true; }
function openAccount(step){
  closePrompt();
  if (uiOpen) closeUI(true);
  if (state === 'play') pause();
  acctStep = step || 'home'; acctMsg = ''; acctReturn = state === 'paused' ? 'pausePanel' : state === 'over' ? 'overPanel' : 'menu';
  show('account'); renderAccount();
}
let acctReturn = 'menu';
function aBtn(label, fn, cls){ const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ' + (cls || 'ghost'); b.textContent = label; b.addEventListener('click', fn); return b; }
function aLine(text, cls){ const p = document.createElement('p'); p.className = cls || 'stat'; p.textContent = text; return p; }
function renderAccount(){
  const box = $('acctBody'); if (!box) return; box.innerHTML = '';
  const row = (...els) => { const d = document.createElement('div'); d.className = 'acctRow'; d.append(...els); box.appendChild(d); };
  const back = () => aBtn('Back', () => { if (acctStep === 'home' || acctStep === 'done') show(acctReturn); else { acctStep = 'home'; acctMsg = ''; renderAccount(); } });
  $('acctTitle').textContent = acct.claimed ? `@${acct.username}` : acct.name;
  if (acctStep === 'home'){
    box.appendChild(aLine(acct.claimed ? `Claimed account, linked to wallet ${shortAddr(acct.wallet)}${acctSession ? '. Signed in this session.' : '.'}` : "You're playing as a guest. Your progress is saved only in this browser, so clearing it or losing the device loses your progress."));
    box.appendChild(aLine(`Level ${profile.level} ${levelTitle()}, ${WEAPONS.reduce((a,W) => a + (W.kills || 0), 0)} kills, ${WEAPONS.reduce((a,W) => a + (W.hs || 0), 0)} headshots`, 'acctSub'));
    if (!acct.claimed) row(aBtn('Claim your account', () => { acctStep = 'intro'; acctMsg = ''; renderAccount(); }, ''), aBtn('Backup code', () => { acctStep = 'backup'; acctMsg = ''; renderAccount(); }), back());
    else { const pend = (acct.nft && acct.nft.pending.length) || 0; row(aBtn(acct.nft && acct.nft.mint ? `Profile NFT${pend ? ' (' + pend + ' updates)' : ''}` : 'Profile NFT', () => { acctStep = 'nft'; acctMsg = ''; nftView = null; renderAccount(); }, '')); }
    if (acct.claimed) row(aBtn(acctSession ? 'Signed in' : 'Sign in with wallet', () => { if (!acctSession) signIn(); }, acctSession ? 'ghost' : ''), aBtn('Backup code', () => { acctStep = 'backup'; acctMsg = ''; renderAccount(); }), back());
    if (!acct.claimed){ const c = document.createElement('label'); c.className = 'acctCheck'; const i = document.createElement('input'); i.type = 'checkbox'; i.checked = !acct.promptsOff; i.addEventListener('change', () => { acct.promptsOff = !i.checked; saveAcct(); }); c.append(i, document.createTextNode(' Remind me to claim at good moments')); box.appendChild(c); }
  } else if (acctStep === 'intro'){
    box.appendChild(aLine('Claiming links this guest progress to your X1 wallet. Then you can:'));
    const ul = document.createElement('ul'); ul.className = 'acctList';
    for (const t of ['Keep your progress safe and pick a username','List items on the Degen Market','Post ranked scores under your own name','Do it all without needing any XNT']){ const li = document.createElement('li'); li.textContent = t; ul.appendChild(li); }
    box.appendChild(ul); row(aBtn('Continue', () => { acctStep = 'wallet'; renderAccount(); }, ''), back());
  } else if (acctStep === 'wallet'){
    box.appendChild(aLine('Step 1 of 3: choose the wallet that will own this account.'));
    const usable = x1Active && isAddr(x1Addr) && (!x1Active.game || gw.unlocked);
    if (usable) row(aBtn(`Use ${shortAddr(x1Addr)} (${x1Active.game ? 'game wallet' : x1WalletName || 'wallet'})`, () => { acctStep = 'name'; acctName2 = ''; renderAccount(); }, ''));
    else box.appendChild(aLine(isGame() && !gw.unlocked ? 'Your game wallet is locked. Unlock it in the phone first.' : 'No wallet is connected yet.', 'acctSub'));
    row(aBtn('Open phone wallet', () => { openPhone(); phoneApp = 'wallet'; renderPhone(); }), aBtn('Create a game wallet', () => { openPhone(); phoneApp = 'gwCreate'; renderPhone(); }), back());
    box.appendChild(aLine('Connect or create a wallet in the phone, put it away, then come back here.', 'acctSub'));
  } else if (acctStep === 'name'){
    box.appendChild(aLine('Step 2 of 3: pick your username. Only claimed accounts can reserve names.'));
    const i = document.createElement('input'); i.id = 'acctNameIn'; i.maxLength = 16; i.placeholder = 'username'; i.autocomplete = 'off'; i.value = acctName2; i.className = 'acctInput';
    const err = aLine('', 'acctErr'); const upd = () => { acctName2 = normName(i.value); err.textContent = acctName2 ? (nameError(acctName2) || `@${acctName2} is available`) : ''; err.className = acctName2 && !nameError(acctName2) ? 'acctOk' : 'acctErr'; };
    i.addEventListener('input', upd); box.append(i, err); upd();
    if (padActive) box.appendChild(aLine('Controller: highlight the box and press X to type.', 'acctSub')); else setTimeout(() => i.focus(), 30);
    row(aBtn('Continue', () => { upd(); if (!acctName2 || nameError(acctName2)) return; acctStep = 'sign'; acctMsg = ''; renderAccount(); }, ''), aBtn('Back', () => { acctStep = 'wallet'; renderAccount(); }));
  } else if (acctStep === 'sign'){
    box.appendChild(aLine(`Step 3 of 3: sign to claim. Your guest key and your wallet both sign the same message, proving you own this progress and this wallet. Nothing is sent on-chain and no XNT is needed.`));
    const pre = document.createElement('pre'); pre.className = 'acctMsg'; pre.textContent = `Account: @${acctName2}\nWallet: ${x1Addr}\nGuest: ${acct.guestId}`; box.appendChild(pre);
    row(aBtn('Sign and claim', doClaim, ''), aBtn('Back', () => { acctStep = 'name'; renderAccount(); }));
  } else if (acctStep === 'conflict'){
    const ex = acctProfiles()[x1Addr], o = ex.snapshot.profile;
    box.appendChild(aLine(`This wallet already has an account, @${ex.username} (level ${o.level}). This guest is level ${profile.level}. Which progress should the account keep?`));
    row(aBtn(`Keep @${ex.username}'s progress`, () => finishClaim('account'), ''), aBtn('Combine both', () => finishClaim('merge')), aBtn('Keep this guest\'s progress', () => finishClaim('guest')));
    box.appendChild(aLine('Combining keeps the higher level and each weapon\'s best kills, headshots, attachments and camos. The account keeps its existing username.', 'acctSub'));
  } else if (acctStep === 'done'){
    box.appendChild(aLine(`Your account @${acct.username} is linked to ${shortAddr(acct.wallet)}. Your progress is now tied to this wallet, and your username shows on name tags, the leaderboard and the Degen Market.`));
    row(back());
  } else if (acctStep === 'nft'){
    renderNftStep(box, row, () => aBtn('Back', () => { acctStep = 'home'; acctMsg = ''; renderAccount(); }));
  } else if (acctStep === 'backup'){
    box.appendChild(aLine('This code restores your level, weapons and best score in another browser. Anyone with it can copy your progress, so keep it private.'));
    const t = document.createElement('textarea'); t.className = 'acctCode'; t.readOnly = true; t.value = backupCode(); box.appendChild(t);
    row(aBtn('Copy code', () => { try { navigator.clipboard.writeText(t.value); acctMsg = 'Backup code copied.'; } catch(e){ acctMsg = "Couldn't copy here. Select the code and copy it."; } renderAccount(); }, ''), back());
    box.appendChild(aLine('Restore from a code:', 'acctSub'));
    const r = document.createElement('textarea'); r.className = 'acctCode'; r.placeholder = 'Paste a DY1 backup code'; box.appendChild(r);
    row(aBtn('Restore progress', () => restoreBackup(r.value)));
  }
  if (acctMsg) box.appendChild(aLine(acctMsg, 'acctNote'));
}
/* ---------- On-screen keyboard for controllers ---------- */
let oskTarget = null, oskShift = false;
const OSK_ROWS = ['1234567890', 'qwertyuiop', 'asdfghjkl_', 'zxcvbnm-.@'];
function openOSK(input){ oskTarget = input; oskShift = false; $('osk').hidden = false; drawOSK(); setPadFocus($('osk').querySelector('button')); }
function drawOSK(){
  const o = $('oskKeys'); o.innerHTML = '';
  const add = (label, k, cls) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; if (cls) b.className = cls; b.addEventListener('click', () => oskPress(k)); o.appendChild(b); return b; };
  OSK_ROWS.forEach(r => { for (const ch of r) add(oskShift ? ch.toUpperCase() : ch, ch); });
  add(oskShift ? 'Shift on' : 'Shift', 'shift', 'wide'); add('Space', ' ', 'wide'); add('Delete', 'del', 'wide'); add('Done', 'done', 'wide done');
  oskShow();
}
function oskShow(){ const i = oskTarget; $('oskShow').textContent = i ? (i.type === 'password' ? '•'.repeat(i.value.length) : i.value) || (i.placeholder || '') : ''; }
function oskPress(k){
  const i = oskTarget; if (!i) return;
  if (k === 'done'){ closeOSK(); return; }
  if (k === 'shift'){ oskShift = !oskShift; const f = padFocusEl && padFocusEl.textContent; drawOSK(); const b = [...$('oskKeys').children].find(x => x.textContent.startsWith('Shift')); setPadFocus(b); return; }
  if (k === 'del') i.value = i.value.slice(0, -1);
  else if (i.value.length < (i.maxLength > 0 ? i.maxLength : 200)) i.value += oskShift ? k.toUpperCase() : k;
  i.dispatchEvent(new Event('input', { bubbles:true })); oskShow();
}
function closeOSK(){ $('osk').hidden = true; const t = oskTarget; oskTarget = null; if (t && document.body.contains(t)) setPadFocus(t); }

/* ---------- Profile NFT: on-chain summary, fingerprint, milestones, player card ---------- */
// Set this to your profile server's URL (see profile-server.js), for example 'https://api.your-game.com'
let PROFILE_API = '';
// When the game is served by the profile server itself (for example on Railway), use it automatically
(async () => {
  if (window.claude || !/^https?:$/.test(location.protocol)) return;
  try { const r = await fetch('/health', { cache:'no-store' }); const j = await r.json(); if (j && j.ok && j.feePayer){ PROFILE_API = location.origin; enableServerSocial(location.origin); } } catch(e){}
})();
function canonicalJSON(v){
  if (Array.isArray(v)) return '[' + v.map(canonicalJSON).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonicalJSON(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
async function sha256hex(str){ const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)); return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2,'0')).join(''); }
function bestWaveNow(){ try { const b = JSON.parse(store.get('dustyard-best') || 'null'); return b ? b.wave : 0; } catch(e){ return 0; } }
function profileSummary(){
  return { username:acct && acct.claimed ? acct.username : '', level:profile.level, rank:levelTitle() + (holderTitle() ? ', ' + holderTitle() : ''),
    kills:WEAPONS.reduce((a,W) => a + (W.kills || 0), 0), headshots:WEAPONS.reduce((a,W) => a + (W.hs || 0), 0), bestWave:bestWaveNow(),
    perks:HOLDER_PERKS.filter(P => holder.perks && holder.perks[P.k]).map(P => P.title) };
}
function detailRecord(){
  const weapons = {}; WEAPONS.forEach(W => { weapons[W.id] = { kills:W.kills || 0, headshots:W.hs || 0, attachments:Object.keys(W.att || {}).filter(k => W.att[k]).sort(), camo:W.camo || null }; });
  return { v:1, wallet:acct.wallet, username:acct.username, xp:profile.xp, level:profile.level, bestWave:bestWaveNow(), weapons,
    settings:{ fov:cfg.fov, sens:cfg.sens, adsSens:cfg.adsSens, padSens:cfg.padSens, quality:cfg.quality } };
}
function nftState(){ if (!acct.nft) acct.nft = { mint:'', synced:null, syncedAt:0, pending:[] }; return acct.nft; }
function addMilestone(text){
  if (!acct || !acct.claimed) return;
  const n = nftState(); if (n.pending[n.pending.length - 1] === text) return;
  n.pending.push(text); if (n.pending.length > 12) n.pending.shift(); saveAcct();
}
function drawPlayerCard(sum, fp){
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0,0,512,512); gr.addColorStop(0,'#1b1030'); gr.addColorStop(1,'#0a1626'); g.fillStyle = gr; g.beginPath(); g.roundRect(0,0,512,512,28); g.fill();
  g.strokeStyle = '#f0a93b'; g.lineWidth = 3; g.beginPath(); g.roundRect(10,10,492,492,22); g.stroke();
  g.fillStyle = '#f0a93b'; g.font = '900 22px "Barlow Condensed", Arial'; g.fillText('DUST YARD', 36, 70);
  g.fillStyle = '#f4ecdc'; g.font = '700 46px "Barlow Condensed", Arial'; g.fillText('@' + (sum.username || 'guest'), 36, 140);
  g.fillStyle = '#9cc3ff'; g.font = '500 24px "Barlow Condensed", Arial'; g.fillText(sum.rank, 36, 180);
  g.textAlign = 'right'; g.fillStyle = '#f0a93b'; g.font = '900 84px "Barlow Condensed", Arial'; g.fillText(sum.level, 476, 150);
  g.fillStyle = '#f4ecdc'; g.font = '600 18px "Barlow Condensed", Arial'; g.fillText('LEVEL', 476, 180); g.textAlign = 'left';
  [['KILLS', sum.kills, 36], ['HEADSHOTS', sum.headshots, 196], ['BEST WAVE', sum.bestWave, 370]].forEach(([l, v, x]) => {
    g.globalAlpha = .7; g.font = '600 18px "Barlow Condensed", Arial'; g.fillText(l, x, 270); g.globalAlpha = 1; g.font = '700 36px "Barlow Condensed", Arial'; g.fillText(String(v), x, 306); });
  g.fillStyle = '#5cff8a'; g.font = '600 20px "Barlow Condensed", Arial'; g.fillText(sum.perks.length ? sum.perks.join('  ·  ') : 'No holder perks yet', 36, 380);
  g.fillStyle = 'rgba(244,236,220,.55)'; g.font = '500 13px ui-monospace, Menlo, Consolas, monospace'; g.fillText('fingerprint ' + (fp || '').slice(0,32) + '…', 36, 470);
  return c;
}
function syncMessageFor(r){
  return `Dust Yard profile sync\nWallet: ${r.wallet}\nUsername: @${r.username}\nAction: ${r.action}\nSummary: ${r.summaryHash}\nFingerprint: ${r.fingerprint}\nNonce: ${r.nonce}\nIssued At: ${r.issuedAt}`;
}
let nftView = null;
async function prepareNftView(){
  const sum = profileSummary(), fp = await sha256hex(canonicalJSON(detailRecord()));
  const fields = { level:String(sum.level), rank:sum.rank.slice(0,32), kills:String(sum.kills), headshots:String(sum.headshots), best_wave:String(sum.bestWave), perks:sum.perks.join(', ') || 'none', fingerprint:fp };
  const n = nftState(), sumHash = await sha256hex(canonicalJSON(sum));
  nftView = { sum, fp, fields, sumHash, changed:!n.synced || n.synced.sumHash !== sumHash || n.synced.fp !== fp };
  return nftView;
}
async function syncProfileNft(){
  if (!cryptoGate()) return;
  const v = await prepareNftView(), n = nftState();
  if (!acct.claimed){ acctMsg = 'Claim your account first.'; renderAccount(); return; }
  if (!x1Active || x1Addr !== acct.wallet){ acctMsg = `Connect the wallet this account belongs to (${shortAddr(acct.wallet)}) in the phone first.`; renderAccount(); return; }
  acctMsg = 'Approve the signature in your wallet. It is free and moves no funds.'; renderAccount();
  try {
    const req = { v:1, action:n.mint ? 'update' : 'mint', wallet:acct.wallet, username:acct.username, summary:v.sum, summaryHash:v.sumHash, fingerprint:v.fp,
      nonce:b58(crypto.getRandomValues(new Uint8Array(16))), issuedAt:new Date().toISOString(), milestones:n.pending.slice() };
    const sig = await walletSign(new TextEncoder().encode(syncMessageFor(req)));
    const payload = { request:req, walletSig:b58(sig) };
    // link this device, so the matches the server checked on it count toward this wallet's profile
    if (guestKey) try { payload.device = { guest:guestKey.pub, sig:await srvSign({ op:'link', guest:guestKey.pub, wallet:req.wallet, nonce:req.nonce }) }; } catch(e){}
    if (!PROFILE_API){
      nftView.payload = JSON.stringify(payload, null, 1);
      acctMsg = "Signed. Your game server isn't connected yet, so nothing was sent on-chain. Below is the exact signed request the server will receive.";
      renderAccount(); return;
    }
    acctMsg = n.mint ? 'Updating your profile NFT...' : 'Minting your profile NFT...'; renderAccount();
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 60000);
    const res = await fetch(PROFILE_API.replace(/\/$/, '') + '/profile/sync', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(payload), signal:ctl.signal });
    clearTimeout(tm); const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.ok) throw new Error(j.error || `server error ${res.status}`);
    Object.assign(n, { mint:j.mint, synced:{ sumHash:v.sumHash, fp:v.fp }, syncedAt:Date.now(), pending:[] }); saveAcct();
    acctMsg = req.action === 'mint' ? 'Your soulbound profile NFT is minted. Find it in the phone under My NFTs.' : 'Profile NFT updated on X1.';
    if (Array.isArray(j.capped) && j.capped.length) acctMsg += ` On-chain stats only count matches the server checked, so ${j.capped.map(k => ({ kills:'kills', headshots:'headshots', bestWave:'best wave', level:'level' }[k] || k)).join(', ')} ${j.capped.length > 1 ? 'are' : 'is'} lower than in your game for now. They catch up as you play.`;
    sfx.levelUp();
  } catch(e){ acctMsg = `Couldn't sync: ${String((e && e.message) || e).slice(0,140)}`; }
  renderAccount();
}
function renderNftStep(box, row, back){
  const v = nftView, n = nftState();
  if (!v){ box.appendChild(aLine('Preparing your profile...')); prepareNftView().then(() => renderAccount()); return; }
  box.appendChild(aLine('Your profile NFT is soulbound: it stays in your wallet and can\'t be sold. Key stats live on-chain, and a fingerprint proves your full record wasn\'t altered.', 'acctSub'));
  const wrap = document.createElement('div'); wrap.className = 'nftWrap';
  const card = drawPlayerCard(v.sum, v.fp); card.className = 'nftCard2'; wrap.appendChild(card);
  const tbl = document.createElement('div'); tbl.className = 'nftFields';
  const head = document.createElement('b'); head.textContent = 'On-chain metadata'; tbl.appendChild(head);
  for (const [k, val] of [['name', `Dust Yard: @${acct.username}`], ['symbol', 'DYP'], ...Object.entries(v.fields)]){
    const r = document.createElement('div'); const kk = document.createElement('span'); kk.textContent = k; const vv = document.createElement('em'); vv.textContent = k === 'fingerprint' ? val.slice(0,16) + '…' : val; r.append(kk, vv); tbl.appendChild(r);
  }
  wrap.appendChild(tbl); box.appendChild(wrap);
  box.appendChild(aLine(n.mint ? `Minted: ${shortAddr(n.mint)}${n.syncedAt ? ', last synced ' + ago(n.syncedAt) : ''}. ${v.changed ? 'Your stats changed since the last sync.' : 'On-chain stats are up to date.'}` : 'Not minted yet.', 'acctSub'));
  if (n.pending.length) box.appendChild(aLine('Milestones waiting to sync: ' + n.pending.slice(-5).join(', '), 'acctOk'));
  row(aBtn('Share on X', shareProfile));
  row(aBtn(n.mint ? (v.changed ? 'Sync to X1' : 'Up to date') : 'Mint profile NFT', () => { if (!n.mint || v.changed) syncProfileNft(); }, n.mint && !v.changed ? 'ghost' : ''), aBtn('Download card', () => { const a = document.createElement('a'); a.href = card.toDataURL('image/png'); a.download = `dust-yard-${acct.username}.png`; document.body.appendChild(a); a.click(); a.remove(); }), back());
  if (v.payload){ const t = document.createElement('textarea'); t.className = 'acctCode'; t.readOnly = true; t.value = v.payload; box.appendChild(t); }
  if (!PROFILE_API) box.appendChild(aLine('Minting needs your game server (profile-server.js). Until it is connected, you can preview the card and sign test requests.', 'acctSub'));
  else box.appendChild(aLine('Connected to your profile server.', 'acctOk'));
  renderBadges(box);
}

