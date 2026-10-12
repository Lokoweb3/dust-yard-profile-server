// Tradeable cosmetics: catalog, server-rolled match drops and Metaplex item NFTs with royalties.
const crypto = require('crypto'), nacl = require('tweetnacl'), bs58 = require('bs58');
const { Connection, VersionedTransaction } = require('@solana/web3.js');
const { PUBLIC_URL, RPC } = require('./config');
const db = require('./db');
const { checkWave, endSession, startSession } = require('./matches');
const { canonical, clientIp, esc, isB58, verifySigned } = require('./util');

/* ---------- Tradeable cosmetics: catalog, server-rolled drops, Metaplex NFTs with royalties ---------- */
const ITEMS = [
  { id:'juggernaut_slayer', name:'Juggernaut Slayer Camo', type:'camo', rarity:'Legendary', supply:500, source:'boss', chance:.25, color:'#8b1a1a', desc:'Only drops from Juggernaut kills.' },
  { id:'void_ninja', name:'Void Ninja Camo', type:'camo', rarity:'Epic', supply:1000, source:'wave8', chance:.1, color:'#3d1d6b', desc:'Survive to wave 8 for a chance at this camo.' },
  { id:'x1_circuit', name:'X1 Circuit Camo', type:'camo', rarity:'Rare', supply:2000, source:'wave3', chance:.06, color:'#1e7a4a', desc:'Glowing X1 circuit lines.' },
  { id:'crimson_katana', name:'Crimson Katana', type:'petskin', rarity:'Rare', supply:1000, source:'wave3', chance:.05, color:'#c0392b', desc:'A blood-red blade for your companion.' },
  { id:'glowing_headband', name:'Glowing Headband', type:'petskin', rarity:'Epic', supply:750, source:'wave6', chance:.06, color:'#2ee6ff', desc:'Your companion\u2019s headband glows in its clan color.' },
  { id:'golden_aura', name:'Golden Aura', type:'petskin', rarity:'Legendary', supply:250, source:'boss', chance:.08, color:'#f0c419', desc:'A golden aura around your companion.' },
  { id:'juggernaut_skull', name:'Juggernaut Skull', type:'trophy', rarity:'Mythic', supply:100, source:'boss', chance:.03, color:'#e8e2d0', desc:'A trophy from a fallen Juggernaut.' },
  { id:'raider_banner', name:'Raider Banner', type:'trophy', rarity:'Rare', supply:1000, source:'wave10', chance:.1, color:'#c7364f', desc:'Planted after surviving wave 10.' },
  { id:'neon_tag', name:'Neon Name Tag', type:'tag', rarity:'Common', supply:3000, source:'wave3', chance:.1, color:'#2ee6ff', desc:'A glowing cyan name tag.' },
  { id:'gold_tag', name:'Gold Name Tag', type:'tag', rarity:'Epic', supply:600, source:'wave8', chance:.06, color:'#d8a93a', desc:'A gold-trimmed name tag.' },
  { id:'neon_card', name:'Neon District Card', type:'card', rarity:'Rare', supply:1500, source:'neon', chance:.06, color:'#ff3cc8', desc:'A calling card from the rainy city.' },
  { id:'dust_card', name:'Dust Yard Card', type:'card', rarity:'Common', supply:3000, source:'wave3', chance:.1, color:'#f0a93b', desc:'A calling card from the shipping yard.' }
];
ITEMS.push({ id:'s1_veteran', name:'Season 1 Veteran Camo', type:'camo', rarity:'Epic', supply:1500, source:'wave5', chance:.08, color:'#b8862b', desc:'Only drops during Season 1.', season:1 });
const SEASON = +(process.env.SEASON || 1), SEASON_ENDS = Date.parse(process.env.SEASON_ENDS || '2026-12-31T23:59:59Z');
const seasonOpen = it => !it.season || (it.season === SEASON && Date.now() < SEASON_ENDS);
const ITEM_BY_ID = Object.fromEntries(ITEMS.map(i => [i.id, i]));
const ROYALTY_BPS = Math.max(0, Math.min(1000, +(process.env.ROYALTY_BPS || 500)));
let items = null;
async function loadItems(){
  items = await db.open('items', { maps:['minted', 'drops', 'daily', 'byMint', 'badges'] });
  if (items.sessions){ delete items.sessions; await db.flush('items'); }   // matches moved to lib/matches.js
}
/** mark items changed; await it (or saveItemsNow) before sending a transaction that depends on it */
const saveItems = () => db.save('items');
const saveItemsNow = () => db.flush('items');
// claims per wallet per day, on top of drops per device per day
const CLAIMS_PER_WALLET_DAY = +(process.env.CLAIMS_PER_WALLET_DAY || 12);

function itemArt(it){
  const icon = { camo:'<path d="M150 210 L362 210 L362 250 L190 250 L170 300 L140 300 L150 250 Z" fill="#111" stroke="#fff" stroke-width="4"/>',
    petskin:'<circle cx="256" cy="230" r="70" fill="#111" stroke="#fff" stroke-width="4"/><rect x="186" y="215" width="140" height="22" fill="' + it.color + '"/>',
    trophy:'<path d="M196 170 h120 v60 a60 60 0 0 1 -120 0 z M236 290 h40 v40 h30 v20 h-100 v-20 h30 z" fill="#111" stroke="#fff" stroke-width="4"/>',
    tag:'<rect x="146" y="200" width="220" height="70" rx="10" fill="#111" stroke="' + it.color + '" stroke-width="8"/><text x="256" y="246" text-anchor="middle" font-family="Arial" font-weight="bold" font-size="30" fill="#fff">@degen</text>',
    card:'<rect x="146" y="160" width="220" height="150" rx="12" fill="#111" stroke="#fff" stroke-width="4"/><circle cx="200" cy="215" r="26" fill="' + it.color + '"/>' }[it.type] || '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><defs><radialGradient id="g" cx=".5" cy=".4" r=".7"><stop offset="0" stop-color="${it.color}"/><stop offset="1" stop-color="#0b0b12"/></radialGradient></defs><rect width="512" height="512" rx="30" fill="url(#g)"/><rect x="12" y="12" width="488" height="488" rx="24" fill="none" stroke="#f0a93b" stroke-width="3"/>${icon}<text x="256" y="400" text-anchor="middle" font-family="Arial" font-weight="bold" font-size="34" fill="#fff">${esc(it.name)}</text><text x="256" y="440" text-anchor="middle" font-family="Arial" font-size="22" fill="#f0a93b">${esc(it.rarity.toUpperCase())} · DUST YARD</text></svg>`;
}
function eligible(it, m){
  if (it.source === 'boss') return m.bosses > 0;
  if (it.source === 'neon') return m.map === 'neon' && m.wave >= 3;
  const w = +String(it.source).replace('wave', ''); return m.wave >= (w || 1);
}
function rollDrops(guest, m){
  const day = new Date().toISOString().slice(0, 10), d = items.daily[guest] = items.daily[guest] && items.daily[guest].day === day ? items.daily[guest] : { day, n:0 };
  const out = [];
  for (const it of ITEMS){
    if (out.length >= 2 || d.n >= 6) break;
    const left = it.supply - (items.minted[it.id] || 0); if (left <= 0 || !eligible(it, m) || !seasonOpen(it)) continue;
    const rolls = it.source === 'boss' ? Math.min(3, m.bosses) : 1;
    for (let r=0;r<rolls && out.length < 2;r++) if (crypto.randomInt(1000000) < it.chance*1000000){
      const serial = (items.minted[it.id] = (items.minted[it.id] || 0) + 1);
      const id = crypto.randomBytes(8).toString('hex');
      items.drops[id] = { id, item:it.id, serial, guest, status:'unclaimed', at:Date.now() }; d.n++; out.push(items.drops[id]); break;
    }
  }
  return out;
}
let umiCtx = null;
function cuIx(units){ const d = new Uint8Array(5); d[0] = 2; new DataView(d.buffer).setUint32(1, units, true); return { programId:'ComputeBudget111111111111111111111111111111', keys:[], data:d }; }
async function sendFitted(umi, builder){
  const { U } = umiCtx;
  let units = 250000;
  try {
    const probe = await builder.prepend({ instruction:{ ...cuIx(400000), programId:U.publicKey('ComputeBudget111111111111111111111111111111') }, signers:[], bytesCreatedOnChain:0 }).buildAndSign(umi);
    const vtx = VersionedTransaction.deserialize(umi.transactions.serialize(probe));
    const conn = new Connection(RPC, 'confirmed'), sim = await conn.simulateTransaction(vtx, { sigVerify:false, replaceRecentBlockhash:true });
    if (!sim.value.err && sim.value.unitsConsumed) units = Math.min(1400000, Math.ceil(sim.value.unitsConsumed*1.15) + 5000);
  } catch(e){}
  return builder.prepend({ instruction:{ ...cuIx(units), programId:U.publicKey('ComputeBudget111111111111111111111111111111') }, signers:[], bytesCreatedOnChain:0 }).sendAndConfirm(umi);
}
function getUmi(secret){
  if (umiCtx) return umiCtx;
  const { createUmi } = require('@metaplex-foundation/umi-bundle-defaults');
  const mpl = require('@metaplex-foundation/mpl-token-metadata'), U = require('@metaplex-foundation/umi');
  const umi = createUmi(RPC).use(mpl.mplTokenMetadata()); umi.use(U.keypairIdentity(umi.eddsa.createKeypairFromSecretKey(secret)));
  umiCtx = { umi, mpl, U }; return umiCtx;
}
async function ensureCollection(secret){
  if (items.collection) return items.collection;
  const { umi, mpl, U } = getUmi(secret), col = U.generateSigner(umi);
  await sendFitted(umi, mpl.createNft(umi, { mint:col, name:'Dust Yard Items', symbol:'DYI', uri:`${PUBLIC_URL}/item/collection.json`, sellerFeeBasisPoints:U.percentAmount(ROYALTY_BPS/100), isCollection:true }));
  items.collection = col.publicKey.toString(); await saveItemsNow(); console.log('created item collection', items.collection);
  return items.collection;
}
async function mintItem(secret, drop, wallet){
  const { umi, mpl, U } = getUmi(secret), it = ITEM_BY_ID[drop.item], col = await ensureCollection(secret), mint = U.generateSigner(umi);
  const payTo = isB58(process.env.ROYALTY_WALLET) ? process.env.ROYALTY_WALLET : null;
  const creators = payTo ? [{ address:umi.identity.publicKey, verified:true, share:0 }, { address:U.publicKey(payTo), verified:false, share:100 }] : [{ address:umi.identity.publicKey, verified:true, share:100 }];
  const b = mpl.createNft(umi, { mint, name:`${it.name} #${drop.serial}`.slice(0, 32), symbol:'DYI', uri:`${PUBLIC_URL}/item/${mint.publicKey}.json`,
      sellerFeeBasisPoints:U.percentAmount(ROYALTY_BPS/100), tokenOwner:U.publicKey(wallet), collection:U.some({ key:U.publicKey(col), verified:false }), creators:U.some(creators) })
    .add(mpl.verifyCollectionV1(umi, { metadata:mpl.findMetadataPda(umi, { mint:mint.publicKey }), collectionMint:U.publicKey(col), authority:umi.identity }));
  items.byMint[mint.publicKey.toString()] = drop.id; Object.assign(drop, { mint:mint.publicKey.toString(), status:'pending', wallet, pendingAt:Date.now() });
  try { await saveItemsNow(); }   // reserve before sending
  catch(e){ e.notSent = true; throw e; }
  try { await sendFitted(umi, b); }
  catch(e){
    // a transaction can land even when confirming it fails, so look before letting the drop be claimed again
    if (await mintExists(drop.mint) === false){ e.notSent = true; throw e; }
  }
  // sent: from here on the drop is never handed out again, even if saving needs a retry
  drop.status = 'claimed'; saveItems();
  return drop.mint;
}
/** true if the NFT exists on-chain, false if it doesn't, null if the network couldn't say */
async function mintExists(mint){
  try { const { umi, U } = getUmi(require('./state').keys.secret); return !!(await umi.rpc.getAccount(U.publicKey(mint))).exists; } catch(e){ return null; }
}
/** a claim left pending (for example by a restart mid-mint) is settled by looking at the chain */
async function settlePending(d){
  if (d.status !== 'pending' || !d.mint) return;
  const there = await mintExists(d.mint);
  if (there === true){ d.status = 'claimed'; saveItems(); }
  else if (there === false && Date.now() - (d.pendingAt || 0) > 5*60000){ delete items.byMint[d.mint]; Object.assign(d, { status:'unclaimed', mint:null }); saveItems(); }
}
async function itemsRoute(req, res, q, reply, server){
  const body = async () => { let b = ''; for await (const c of req){ b += c; if (b.length > 4000) throw new Error('too large'); } return JSON.parse(b || '{}'); };
  if (req.method === 'GET' && q.pathname === '/api/items/catalog') return reply(200, { collection:items.collection || null, royaltyBps:ROYALTY_BPS, season:SEASON, seasonEnds:SEASON_ENDS, items:ITEMS.map(i => ({ ...i, minted:items.minted[i.id] || 0, available:seasonOpen(i) })) });
  if (req.method === 'GET' && q.pathname === '/api/drops'){
    const g = q.searchParams.get('guest'); if (!isB58(g)) return reply(400, { error:'bad guest' });
    return reply(200, { drops:Object.values(items.drops).filter(d => d.guest === g).map(d => ({ ...d, item:ITEM_BY_ID[d.item] })) });
  }
  const art = q.pathname.match(/^\/item-art\/([a-z0-9_]+)\.svg$/);
  if (req.method === 'GET' && art && ITEM_BY_ID[art[1]]) return reply(200, itemArt(ITEM_BY_ID[art[1]]), 'image/svg+xml');
  if (req.method === 'GET' && q.pathname === '/item/collection.json') return reply(200, { name:'Dust Yard Items', symbol:'DYI', description:'Cosmetics earned in Dust Yard. Server-rolled drops with fixed supplies.', image:`${PUBLIC_URL}/item-art/juggernaut_skull.svg`, seller_fee_basis_points:ROYALTY_BPS });
  const meta = q.pathname.match(/^\/item\/([1-9A-HJ-NP-Za-km-z]{32,44})\.json$/);
  if (req.method === 'GET' && meta){
    const d = items.drops[items.byMint[meta[1]]]; if (!d) return reply(404, { error:'not found' }); const it = ITEM_BY_ID[d.item];
    return reply(200, { name:`${it.name} #${d.serial}`, symbol:'DYI', description:`${it.desc} ${d.serial} of ${it.supply}.`, image:`${PUBLIC_URL}/item-art/${it.id}.svg`, seller_fee_basis_points:ROYALTY_BPS,
      attributes:[{ trait_type:'item_id', value:it.id }, { trait_type:'Type', value:it.type }, { trait_type:'Rarity', value:it.rarity }, { trait_type:'Serial', value:String(d.serial) }, { trait_type:'Supply', value:String(it.supply) }],
      properties:{ category:'image', files:[{ uri:`${PUBLIC_URL}/item-art/${it.id}.svg`, type:'image/svg+xml' }] } });
  }
  const ip = clientIp(req);
  if (req.method === 'POST' && q.pathname === '/api/match/start'){
    const r = startSession(await body(), ip);
    return reply(r.status, r.error ? { error:r.error } : { sid:r.sid });
  }
  if (req.method === 'POST' && q.pathname === '/api/match/wave'){
    const r = checkWave(await body());
    if (r.flagged) return reply(409, { ok:false, error:'match could not be verified', why:r.flagged.flag });
    return reply(r.status, r.error ? { error:r.error } : { ok:true });
  }
  if (req.method === 'POST' && q.pathname === '/api/match/end'){
    const b = await body(), r = endSession(b, ip);
    if (r.error) return reply(r.status, { error:r.error });
    if (!r.verified) return reply(200, { drops:[], verified:null, note:'this match could not be verified, so it gives no drops' });
    const drops = r.dropsAllowed ? rollDrops(b.guest, r.verified) : [];
    if (drops.length) await saveItemsNow();
    return reply(200, { verified:r.verified, drops:drops.map(d => ({ ...d, item:ITEM_BY_ID[d.item] })) });
  }
  if (req.method === 'POST' && q.pathname === '/api/drops/claim'){
    const b = await body(), { guest, dropId, wallet, ts, guestSig, walletSig } = b, d = items.drops[dropId];
    if (!d || d.guest !== guest || d.status === 'claimed') return reply(409, { error:'not claimable' });
    if (!isB58(wallet) || !Number.isFinite(ts) || Math.abs(Date.now() - ts) > 300000) return reply(400, { error:'bad request' });
    const msg = { op:'claim', guest, dropId, wallet, ts };
    if (!verifySigned(msg, guestSig, guest)) return reply(401, { error:'bad device signature' });
    if (!nacl.sign.detached.verify(Buffer.from(`Dust Yard item claim\n${canonical(msg)}`), bs58.decode(walletSig), bs58.decode(wallet))) return reply(401, { error:'bad wallet signature' });
    await settlePending(d);
    if (d.status === 'claimed') return reply(200, { ok:true, mint:d.mint });
    if (d.status === 'pending' && d.mint) return reply(202, { pending:true, mint:d.mint });
    const day = new Date().toISOString().slice(0, 10), wk = 'wallet:' + wallet, wd = items.daily[wk] = items.daily[wk] && items.daily[wk].day === day ? items.daily[wk] : { day, n:0 };
    if (wd.n >= CLAIMS_PER_WALLET_DAY) return reply(429, { error:'daily claim limit reached for this wallet, try again tomorrow' });
    wd.n++;
    try { const mint = await mintItem(server.secretKey, d, wallet); return reply(200, { ok:true, mint }); }
    catch(e){
      console.error('item mint failed', e.message);
      if (!e.notSent) return reply(202, { pending:true, mint:d.mint });   // it may have gone through: settled on the next try
      wd.n--; delete items.byMint[d.mint]; Object.assign(d, { status:'unclaimed', mint:null }); saveItems();
      return reply(500, { error:'mint failed, try again' });
    }
  }
  return false;
}
const getItems = () => items;

const mintedCount = id => (items && items.minted && items.minted[id]) || 0;

module.exports = { ITEMS, ROYALTY_BPS, getItems, getUmi, itemsRoute, loadItems, mintedCount, saveItems, saveItemsNow, seasonOpen };
