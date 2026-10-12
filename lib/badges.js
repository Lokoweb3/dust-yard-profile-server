// Achievement badges: free soulbound NFTs for milestones.
const nacl = require('tweetnacl'), bs58 = require('bs58');
const { Keypair, PublicKey } = require('@solana/web3.js');
const { buildMint } = require('./chain');
const { PUBLIC_URL } = require('./config');
const { getItems, saveItems, saveItemsNow } = require('./items');
const { keys } = require('./state');
const { esc, isB58 } = require('./util');

/* ---------- Achievement badges: free soulbound NFTs for milestones ---------- */
// Eligibility comes from the stats this server has already validated during profile syncs.
const BADGES = [
  { id:'level10', name:'Level 10', test:s => s.level >= 10, desc:'Reached level 10.' },
  { id:'level25', name:'Level 25', test:s => s.level >= 25, desc:'Reached level 25.' },
  { id:'level50', name:'Level 50 Elite', test:s => s.level >= 50, desc:'Reached the level cap.' },
  { id:'wave10', name:'Wave 10 Survivor', test:s => s.bestWave >= 10, desc:'Survived to wave 10.' },
  { id:'wave20', name:'Wave 20 Legend', test:s => s.bestWave >= 20, desc:'Survived to wave 20.' },
  { id:'kills500', name:'500 Kills', test:s => s.kills >= 500, desc:'500 raiders down.' },
  { id:'kills2500', name:'2,500 Kills', test:s => s.kills >= 2500, desc:'2,500 raiders down.' },
  { id:'heads100', name:'Sharpshooter', test:s => s.headshots >= 100, desc:'100 headshots.' },
  { id:'heads500', name:'Deadeye', test:s => s.headshots >= 500, desc:'500 headshots.' }
];
const BADGE_BY_ID = Object.fromEntries(BADGES.map(b => [b.id, b]));
function badgeSvg(b){
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><defs><radialGradient id="g" cx=".5" cy=".4" r=".7"><stop offset="0" stop-color="#3b2a10"/><stop offset="1" stop-color="#0b0b12"/></radialGradient></defs><rect width="512" height="512" rx="30" fill="url(#g)"/>
<polygon points="256,70 410,150 410,330 256,420 102,330 102,150" fill="#1a1a24" stroke="#f0a93b" stroke-width="10"/><text x="256" y="250" text-anchor="middle" font-family="Arial Black,Arial" font-size="44" fill="#f0a93b">${esc(b.name.toUpperCase())}</text>
<text x="256" y="300" text-anchor="middle" font-family="Arial" font-size="24" fill="#f4ecdc">${esc(b.desc)}</text><text x="256" y="470" text-anchor="middle" font-family="Arial" font-size="22" fill="#f0a93b">DUST YARD ACHIEVEMENT</text></svg>`;
}
async function badgesRoute(req, res, q, reply, conn, store, send){
  if (req.method === 'GET' && q.pathname === '/api/badges'){
    const w = q.searchParams.get('wallet'), p = store.profiles[w]; if (!isB58(w)) return reply(400, { error:'bad wallet' });
    const owned = (getItems().badges || {})[w] || {};
    return reply(200, { synced:!!p, badges:BADGES.map(b => ({ id:b.id, name:b.name, desc:b.desc, eligible:!!(p && b.test(p.summary)), claimed:!!owned[b.id], mint:owned[b.id] || null })) });
  }
  const art = q.pathname.match(/^\/badge-art\/([a-z0-9]+)\.svg$/);
  if (req.method === 'GET' && art && BADGE_BY_ID[art[1]]) return reply(200, badgeSvg(BADGE_BY_ID[art[1]]), 'image/svg+xml');
  const meta = q.pathname.match(/^\/badge\/([a-z0-9]+)\/([1-9A-HJ-NP-Za-km-z]{32,44})\.json$/);
  if (req.method === 'GET' && meta && BADGE_BY_ID[meta[1]]){ const b = BADGE_BY_ID[meta[1]]; return reply(200, { name:`Dust Yard: ${b.name}`, symbol:'DYA', description:`${b.desc} Soulbound achievement earned in Dust Yard.`, image:`${PUBLIC_URL}/badge-art/${b.id}.svg`, attributes:[{ trait_type:'achievement', value:b.id }, { trait_type:'owner', value:meta[2] }] }); }
  if (req.method === 'POST' && q.pathname === '/api/badges/claim'){
    let raw = ''; for await (const c of req){ raw += c; if (raw.length > 3000) return reply(413, { error:'too large' }); }
    const r = JSON.parse(raw || '{}'), b = BADGE_BY_ID[r.id], p = store.profiles[r.wallet];
    if (!b || !isB58(r.wallet) || !Number.isFinite(r.ts) || Math.abs(Date.now() - r.ts) > 300000) return reply(400, { error:'bad request' });
    const msg = `Dust Yard achievement claim\nWallet: ${r.wallet}\nAchievement: ${b.id}\nIssued At: ${r.ts}`;
    if (!nacl.sign.detached.verify(Buffer.from(msg), bs58.decode(r.sig || '1'), bs58.decode(r.wallet))) return reply(401, { error:'signature did not verify' });
    if (!p || !b.test(p.summary)) return reply(403, { error:'not earned yet. Sync your profile NFT first' });
    getItems().badges = getItems().badges || {}; const owned = getItems().badges[r.wallet] = getItems().badges[r.wallet] || {};
    if (owned[b.id]) return reply(409, { error:'already claimed' });
    owned[b.id] = 'pending';
    try { await saveItemsNow(); } catch(e){ delete owned[b.id]; return reply(500, { error:'try again' }); }   // reserve before sending
    let sent = false;
    try {
      const mintKp = Keypair.generate(), owner = new PublicKey(r.wallet);
      const fields = { achievement:b.id, earned:String(Math.floor(Date.now()/1000)), level:String(p.summary.level), fingerprint:p.fingerprint || '', kills:'', headshots:'', best_wave:'', perks:'', rank:'', updated:'' };
      const built = await buildMint({ server:keys.server, mint:mintKp, owner, username:p.summary.username, fields, rent:n => conn.getMinimumBalanceForRentExemption(n),
        name:`Dust Yard: ${b.name}`.slice(0, 32), symbol:'DYA', uri:`${PUBLIC_URL}/badge/${b.id}/${r.wallet}.json`, fieldOrder:['achievement', 'earned', 'level'] });
      owned[b.id] = 'pending:' + mintKp.publicKey.toBase58();
      try { await send(built); sent = true; }
      catch(e){ sent = (await conn.getAccountInfo(mintKp.publicKey).catch(() => undefined)) !== null; if (!sent) throw e; }   // it may have landed anyway
      // sent: never undone, even if saving needs a retry
      owned[b.id] = mintKp.publicKey.toBase58(); saveItems();
      return reply(200, { ok:true, mint:owned[b.id] });
    } catch(e){ console.error('badge mint failed', e.message); if (!sent){ delete owned[b.id]; saveItems(); } return reply(500, { error:'mint failed, try again' }); }
  }
  return false;
}

module.exports = { badgesRoute };
