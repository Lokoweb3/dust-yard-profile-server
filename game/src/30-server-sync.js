/* ---------- Your own server: leaderboard, chat, market and live plaza ---------- */
let srvMode = false;
const srvListeners = { chat:new Set(), market:new Set(), scores:new Set() };
function srvNotify(col){ (srvListeners[col] || new Set()).forEach(fn => fn()); }
async function srvSign(obj){ return b58(await guestSign(new TextEncoder().encode(canonicalJSON(obj)))); }
function makeSrvDb(base){
  const getCol = async (col, order, limit) => {
    const r = await fetch(`${base}/api/col/${col}?order=${order || ''}&limit=${limit || 20}`, { cache:'no-store' }); const j = await r.json();
    return { docs:(j.rows || []).map(x => ({ id:x.id, exists:true, data:() => x.data })) };
  };
  const write = async (col, id, op, data) => {
    const ts = Date.now(), body = { col, id, op, data:data || null, ts }; body.sig = await srvSign({ col, id, op, data:data || null, ts });
    const r = await fetch(`${base}/api/write`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(body) });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'write failed'); return j;
  };
  return {
    collection(col){
      let order = null, limit = 20;
      const q = {
        orderBy(f){ order = f === 't' ? null : f; return q; }, limit(n){ limit = n; return q; },
        get(){ return getCol(col, order, limit); },
        onSnapshot(cb, err){
          let alive = true; const run = () => { if (alive) getCol(col, order, limit).then(s => { if (alive) cb(s); }).catch(e => { if (err) err(e); }); };
          run(); const iv = setInterval(run, 15000); srvListeners[col].add(run);
          return () => { alive = false; clearInterval(iv); srvListeners[col].delete(run); };
        },
        doc(){ return { set:(d) => write(col, guestKey.pub, 'add', d) }; }
      };
      return q;
    },
    doc(path){
      const [col, id] = path.split('/');
      return {
        get: async () => { const r = await fetch(`${base}/api/doc/${col}/${id}`, { cache:'no-store' }); const j = await r.json(); return { exists:!!j.exists, data:() => j.data }; },
        set:(d) => write(col, id, 'set', d), update:(d) => write(col, id, 'update', d), delete:() => write(col, id, 'delete')
      };
    }
  };
}
function makeSrvRoom(base){
  return { join: async (name) => {
    const url = base.replace(/^http/, 'ws') + '/ws'; let ws = null, closed = false, pending = null, known = new Set(); const cbs = new Set();
    const connect = () => {
      ws = new WebSocket(url);
      ws.onopen = () => { ws.send(JSON.stringify({ t:'j', r:name || 'plaza' })); if (pending) ws.send(pending); };
      ws.onmessage = ev => {
        let m; try { m = JSON.parse(ev.data); } catch(e){ return; }
        if (m.t === 'peers'){
          const ids = new Set(m.peers.map(p => p.peer)), left = [...known].filter(id => !ids.has(id)).map(peer => ({ peer })); known = ids;
          const ch = { peers:m.peers.map(p => ({ peer:p.peer, isMe:p.peer === m.me, presence:p.presence })), left };
          cbs.forEach(cb => cb(ch));
        } else if (m.t === 'chat' || m.t === 'market' || m.t === 'scores') srvNotify(m.t);
        else if (m.t === 'nftmarket'){ loadNftListings().then(() => { if (!$('marketPanel').hidden && mkView === 'nftbuy' && !nftBuyPrep) drawMarket(); }); }
      };
      ws.onclose = () => { if (!closed) setTimeout(connect, 2000); };
    };
    connect();
    return {
      presence: async d => { pending = JSON.stringify({ t:'p', d }); if (ws && ws.readyState === 1) ws.send(pending); },
      onPeers: cb => { cbs.add(cb); return () => cbs.delete(cb); },
      leave: async () => { closed = true; try { ws.close(); } catch(e){} }
    };
  } };
}
/* ---------- Age check and regional limits for the wallet features ---------- */
// A neutral date-of-birth screen on first visit. Only the result is stored ('adult', 'teen' or 'u13').
// Players under 13 can't play; players under 18 can play but can't use wallets, swaps, the NFT market
// or NFT claims. In regions the server blocks for US sanctions, those features are off too.
let regionBlocked = false;
const ageBand = () => store.get('dy-age') || '';
function cryptoBlockReason(){
  if (ageBand() !== 'adult') return 'Wallet, swap, market and NFT features are for players 18 and older.';
  if (regionBlocked) return 'Wallet, swap, market and NFT features are not available in your region.';
  return '';
}
function cryptoGate(){ const why = cryptoBlockReason(); if (why){ toast(why, 4500); return false; } return true; }
function requireCrypto(){ const why = cryptoBlockReason(); if (why) throw new Error(why); }
function showAgeGate(){
  const g = $('ageGate'); g.hidden = false;
  if (ageBand() === 'u13'){ $('agMsg').textContent = 'Sorry, Dust Yard is for players 13 and older.'; $('agGo').hidden = true; $('agMonth').disabled = $('agYear').disabled = true; return; }
  setTimeout(() => { if (padActive) setPadFocus($('agMonth')); else $('agMonth').focus(); }, 50);
}
$('agGo').addEventListener('click', () => {
  const m = parseInt($('agMonth').value, 10), y = parseInt($('agYear').value, 10), now = new Date();
  if (!(m >= 1 && m <= 12) || !(y >= now.getFullYear() - 120 && y <= now.getFullYear())){ $('agMsg').textContent = 'Please enter a month (1 to 12) and a 4-digit year.'; return; }
  // age at the start of the birth month, so anyone it could round up is treated as younger
  const age = now.getFullYear() - y - (now.getMonth() + 1 < m ? 1 : 0) - (now.getMonth() + 1 === m ? 1 : 0);
  const band = age >= 18 ? 'adult' : age >= 13 ? 'teen' : 'u13';
  store.set('dy-age', band); $('agMonth').value = $('agYear').value = '';
  if (band === 'u13'){ showAgeGate(); return; }
  $('ageGate').hidden = true;
  if (band === 'teen') toast('Have fun! Wallet, swap, market and NFT features are for players 18 and older, so they are turned off.', 6000);
});
for (const id of ['agMonth','agYear']) $(id).addEventListener('keydown', e => { if (e.key === 'Enter') $('agGo').click(); });
if (ageBand() !== 'adult' && ageBand() !== 'teen') showAgeGate();
const LEGAL_BASE_DEFAULT = 'https://dust-yard-profile-server-production.up.railway.app';
function setLegalLinks(base){ document.querySelectorAll('a[data-legal]').forEach(a => { a.href = `${base || LEGAL_BASE_DEFAULT}/${a.dataset.legal}`; }); }
setLegalLinks('');
function enableServerSocial(base){
  if (window.claude || srvMode) return;
  setLegalLinks(base);
  fetch(base + '/api/compliance', { cache:'no-store' }).then(r => r.json()).then(j => { regionBlocked = !!(j && j.blocked); }).catch(() => {});
  srvMode = true; lbDb = makeSrvDb(base); net.db = lbDb; net.room = makeSrvRoom(base);
  const ready = () => { if (guestKey && guestKey.pub){ lbId = guestKey.pub; refreshBoard(); } else setTimeout(ready, 300); };
  ready();
}
// companions of other players
const PET_HOSTS = /^https:\/\/([a-z0-9-]+\.)*(arweave\.net|irys\.xyz|ipfs\.io|nftstorage\.link|mypinata\.cloud|cf-ipfs\.com|dweb\.link|up\.railway\.app|x1\.ninja)\//i;
function otherPet(p){
  const tr = {}; if (p.traits && typeof p.traits === 'object') for (const [k, v] of Object.entries(p.traits).slice(0, 16)) tr[String(k).slice(0,24)] = String(v).slice(0,32);
  const cfg = { mint:String(p.mint || p.name || 'pet'), name:String(p.name || 'Companion').slice(0,24), image:PET_HOSTS.test(p.image || '') ? p.image : '', traits:tr };
  const o = buildPet(cfg); o.other = true; decoratePet(o, Array.isArray(p.cos) ? p.cos.filter(x => ['golden_aura','glowing_headband','crimson_katana'].includes(x)) : [], o.traits ? CLAN_COL[o.traits.clan] : null); return o;
}

/* ---------- Share on X ---------- */
const GAME_URL_DEFAULT = 'https://dust-yard-profile-server-production.up.railway.app/';
function gameUrl(){ return !window.claude && /^https:$/.test(location.protocol) && PROFILE_API ? location.origin + '/' : GAME_URL_DEFAULT; }
function shareX(text){
  const u = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(gameUrl())}&hashtags=${encodeURIComponent('DustYard,X1')}`;
  const a = document.createElement('a'); a.href = u; a.target = '_blank'; a.rel = 'noopener noreferrer'; document.body.appendChild(a); a.click(); a.remove();
}
function shareScore(){
  const g = lastGame || { score, wave, map:currentMap };
  shareX(`I survived wave ${g.wave} in Dust Yard with ${Number(g.score).toLocaleString()} points${g.map === 'neon' || g.map === 'jungle' ? ' on ' + mapName(g.map) : ''} 💀 Can you beat it?`);
}
function shareProfile(){
  const s = profileSummary();
  shareX(`I'm @${acct.username}, level ${s.level} in Dust Yard: ${s.kills} kills, ${s.headshots} headshots, best wave ${s.bestWave} 💀 My player card lives on X1 as a soulbound NFT.`);
}
function shareCompanion(){ shareX(`Meet my Dust Yard companion: ${petCfg.name} 🐾 Turn your X1 NFTs into companions that fight beside you.`); }

/* ---------- Companions in battle ---------- */
const PET_BATTLE_LINES = ['contact!', 'behind you!', 'nice shot', 'I got you', 'LFG', 'reload, I cover', 'raider spotted'];
// nearest visible raider; line-of-sight checks only for the closest few, and only when the companion can act
function petTarget(from, range){
  const c = [];
  for (const e of enemies){ if (!e.alive) continue; const chest = new V3(e.pos.x, (e.y || 0) + 1.2*e.g.scale.x, e.pos.z), d = chest.distanceTo(from); if (d < range) c.push({ e, chest, d }); }
  c.sort((a, b) => a.d - b.d);
  for (let i=0;i<Math.min(3, c.length);i++) if (lineOfSight(from, c[i].chest)) return c[i];
  return null;
}
function petCombat(dt){
  if (!pet || hubMode || state !== 'play') return;
  if (pet.kind === 'ninja'){ ninjaCombat(dt); pet.spotCd = (pet.spotCd || 3) - dt; if (pet.spotCd <= 0){ pet.spotCd = 7; let near = null, nd = 40; for (const e of enemies){ if (!e.alive) continue; const d = Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z); if (d < nd){ nd = d; near = e; } } if (near) near.lastFire = Math.max(near.lastFire || 0, T); } return; }
  pet.zapCd = (pet.zapCd || 1.5) - dt; pet.spotCd = (pet.spotCd || 3) - dt;
  const from = pet.g.position.clone(); from.y += .95;
  const best = pet.zapCd <= 0 ? petTarget(from, 22) : null;
  if (best && pet.zapCd <= 0){
    pet.zapCd = 2.2 + Math.random()*.6;
    spawnTracer(from.clone(), best.chest, 0x6ff0ff); sfx.droneFire();
    damageEnemy(best.e, 14, false, new V3().subVectors(best.chest, from).normalize(), 'pet');
    if (Math.random() < .15) petSay(PET_BATTLE_LINES[Math.floor(Math.random()*PET_BATTLE_LINES.length)]);
  }
  if (pet.spotCd <= 0){
    // spot the nearest raider so it shows on your minimap and compass
    pet.spotCd = 7; let near = null, nd = 40;
    for (const e of enemies){ if (!e.alive) continue; const d = Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z); if (d < nd){ nd = d; near = e; } }
    if (near){ near.lastFire = Math.max(near.lastFire || 0, T); if (Math.random() < .3) petSay('raider spotted'); }
  }
}

