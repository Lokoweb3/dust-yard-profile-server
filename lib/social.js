// Social layer: leaderboard, chat and market posts, plus the live WebSocket rooms (Degen Market plaza and co-op squads).
const crypto = require('crypto'), nacl = require('tweetnacl'), bs58 = require('bs58');
const db = require('./db');
const { MAPS, verifiedBest } = require('./matches');
const { canonical, num, str } = require('./util');

/* ---------- Social layer: leaderboard, chat, market listings, live plaza ---------- */
// Writes are signed by the player's device key (their guest key), so nobody can edit another player's rows.
let social = null;
async function loadSocial(){
  social = await db.open('social', { maps:['scores', 'chat', 'market'], delay:1500 });
  // scores posted before matches were checked are set aside (kept as legacy_*), not shown on the leaderboard
  let n = 0;
  for (const d of Object.values(social.scores)) for (const m of MAPS) if (d['best_' + m] !== undefined && !d.verified){
    d['legacy_best_' + m] = d['best_' + m]; d['legacy_wave_' + m] = d['wave_' + m]; delete d['best_' + m]; delete d['wave_' + m]; n++;
  }
  for (const d of Object.values(social.scores)) d.verified = true;
  if (n){ console.log(`leaderboard: set aside ${n} unverified scores`); saveSocialSoon(); }
}
// chat is kept for 30 days (CHAT_RETENTION_DAYS), then deleted
const CHAT_DAYS = Math.max(1, +(process.env.CHAT_RETENTION_DAYS || 30));
function pruneChat(){
  if (!social || !social.chat) return 0;
  const cutoff = Date.now() - CHAT_DAYS*864e5; let n = 0;
  for (const [k, d] of Object.entries(social.chat)) if (!(d && d.t >= cutoff)){ delete social.chat[k]; n++; }
  if (n) saveSocialSoon();
  return n;
}
setInterval(pruneChat, 3600e3).unref();
const saveSocialSoon = () => db.save('social');
const lastWrite = new Map();

function cleanDoc(col, d){
  d = d || {};
  if (col === 'scores'){
    const o = { callsign:str(d.callsign, 16), level:num(d.level, 50), updated:Date.now() };
    for (const m of MAPS){ if (d['best_' + m] !== undefined) o['best_' + m] = num(d['best_' + m], 1e7); if (d['wave_' + m] !== undefined) o['wave_' + m] = num(d['wave_' + m], 999); }
    return o;   // checkVerified() then limits scores to what this player's checked matches reached
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
  if (col === 'scores'){ checkVerified(id, clean); clean.verified = true; }
  social[col][id] = op === 'update' ? Object.assign({}, social[col][id] || {}, clean) : clean;
  if (Object.keys(social.market).length > 500) return { status:507, error:'market full' };
  saveSocialSoon(); broadcast({ t:col }); return { status:200, ok:true };
}
// leaderboard scores and waves can't be higher than the best match the server checked for this player
function checkVerified(id, doc){
  for (const m of MAPS){
    const v = verifiedBest(id, m) || { score:0, wave:0 };
    if (doc['best_' + m] !== undefined) doc['best_' + m] = Math.min(doc['best_' + m], v.score);
    if (doc['wave_' + m] !== undefined) doc['wave_' + m] = Math.min(doc['wave_' + m], v.wave);
    if (doc['best_' + m] === 0) { delete doc['best_' + m]; delete doc['wave_' + m]; }
  }
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
    const id = 'p' + (++peerSeq).toString(36); peers.set(id, { ws, presence:null, at:Date.now(), n:0, room:'plaza' });
    ws.on('message', raw => {
      const p = peers.get(id); if (!p) return;
      if (++p.n > 40){ return; }   // simple flood guard, reset every second
      try { const m = JSON.parse(raw);
        if (m.t === 'j' && typeof m.r === 'string'){ p.room = /^dy-coop-[a-z0-9-]{1,20}$/.test(m.r) ? m.r : 'plaza'; p.presence = null; return; }
        // co-op rooms: a small game state relayed as-is to the squad; clients check everything they read
        if (m.t === 'p' && p.room !== 'plaza' && m.d && typeof m.d === 'object'){ const txt = JSON.stringify(m.d); if (txt.length <= 4096){ p.presence = m.d; p.at = Date.now(); } return; }
        if (m.t === 'p' && m.d && typeof m.d === 'object'){ const d = m.d;
        p.presence = { x:+d.x || 0, y:+d.y || 0, z:+d.z || 0, yaw:+d.yaw || 0, name:str(d.name, 16), col:num(d.col, 0xffffff), x1:d.x1 === true, title:str(d.title, 20),
          pet:d.pet && typeof d.pet === 'object' ? { name:str(d.pet.name, 24), mint:str(d.pet.mint, 44), image:/^https:\/\//.test(d.pet.image || '') ? str(d.pet.image, 200) : '',
            traits:d.pet.traits && typeof d.pet.traits === 'object' ? Object.fromEntries(Object.entries(d.pet.traits).slice(0, 16).map(([k, v]) => [str(k, 24), str(v, 32)])) : null,
            cos:Array.isArray(d.pet.cos) ? d.pet.cos.slice(0, 4).map(x => str(x, 24)) : [] } : null, tag:d.tag === 'gold' || d.tag === 'neon' ? d.tag : '',
          emote:d.emote && typeof d.emote === 'object' && ['wave','dance','salute','gm'].includes(d.emote.k) ? { k:d.emote.k, at:+d.emote.at || 0 } : null,
          op:d.op && typeof d.op === 'object' ? Object.fromEntries(['k','f','w','a','s','c','v','m','h','b'].map(k => [k, str(d.op[k], 12)])) : null };
        p.at = Date.now(); } } catch(e){}
    });
    ws.on('close', () => { peers.delete(id); broadcast({ t:'left', id }); });
    ws.send(JSON.stringify({ t:'hello', id }));
  });
  setInterval(() => {
    const rooms = new Map();
    for (const [id, p] of peers){ p.n = 0; if (!rooms.has(p.room)) rooms.set(p.room, []); if (p.presence) rooms.get(p.room).push({ peer:id, presence:p.presence }); }
    for (const [id, p] of peers) if (p.ws.readyState === 1) p.ws.send(JSON.stringify({ t:'peers', me:id, peers:rooms.get(p.room) || [] }));
  }, 100);
  setInterval(() => { for (const [id, p] of peers) if (Date.now() - p.at > 60000 && !p.presence){ try { p.ws.terminate(); } catch(e){} } }, 30000);
}
const getSocial = () => social;

module.exports = { pruneChat, broadcast, getSocial, loadSocial, socialQuery, socialWrite, startPlaza };
