/* ---------- Shared leaderboard ---------- */
let lbDb = null, lbId = null, lastGame = null, lbRows = [];
(async () => {
  try {
    if (!window.claude || !window.claude.use) return;
    lbDb = await window.claude.use('db');
    const user = await window.claude.use('user');
    if (user) lbId = await user.id();
    refreshBoard();
  } catch(e){ lbDb = null; }
})();
async function refreshBoard(){
  for (const id of ['lbBox','lbBox2']) $(id).hidden = !lbDb;
  if (!lbDb) return;
  const field = 'best_' + selectedMap;
  try {
    const snap = await lbDb.collection('scores').orderBy(field, 'desc').limit(10).get();
    lbRows = snap.docs.filter(d => d.exists).map(d => ({ id:d.id, ...d.data() })).filter(r => typeof r[field] === 'number');
  } catch(e){ lbRows = null; }
  for (const id of ['lbList','lbList2']){
    const box = $(id); box.innerHTML = '';
    $(id === 'lbList' ? 'lbTitle' : 'lbTitle2').textContent = `Leaderboard: ${mapName(selectedMap)}`;
    if (!lbRows){ box.textContent = 'The leaderboard is unavailable right now.'; continue; }
    if (!lbRows.length){ box.textContent = 'No scores yet. Be the first.'; continue; }
    lbRows.forEach((r,i) => {
      const row = document.createElement('div'); row.className = 'lbRow' + (r.id === lbId ? ' me' : '');
      const a = document.createElement('span'); a.textContent = i + 1;
      const b = document.createElement('b'); b.textContent = String(r.callsign || 'Operator').slice(0,16);
      const c = document.createElement('em'); c.textContent = `${Number(r['best_' + selectedMap]).toLocaleString()}  wave ${r['wave_' + selectedMap] || '-'}`;
      row.append(a, b, c); box.appendChild(row);
    });
  }
}
async function postScore(){
  if (!lbDb || !lbId || !lastGame) return;
  const cs = acctName(); if (acct && !acct.claimed) queuePrompt('ranked');
  $('lbPost').disabled = true; $('lbMsg').textContent = 'Posting...';
  try {
    if (srvMode) await matchQ;   // the server only accepts scores from matches it has finished checking
    const ref = lbDb.doc('scores/' + lbId), cur0 = await ref.get(), d = cur0.exists ? cur0.data() : {};
    const f = 'best_' + lastGame.map, upd = { callsign:cs, level:profile.level, updated:Date.now() };
    if (!(typeof d[f] === 'number') || lastGame.score > d[f]){ upd[f] = lastGame.score; upd['wave_' + lastGame.map] = lastGame.wave; }
    if (cur0.exists) await ref.update(upd); else await ref.set(upd);
    $('lbMsg').textContent = upd[f] ? 'Score posted.' : `Posted. Your best on this map is still ${Number(d[f]).toLocaleString()}.`;
    refreshBoard();
  } catch(e){ $('lbMsg').textContent = "Couldn't post your score. Posting needs contributor access to this page."; $('lbPost').disabled = false; }
}


/* ---------- Degen Market: multiplayer plaza, chat and listings ---------- */
let hubMode = false, uiOpen = false, net = { room:null, plaza:null, db:null, chatUnsub:null, marketUnsub:null }, presT = 0, myListings = [];
const avatars = new Map();
const myColor = [0x2f6bff,0xff3cc8,0x2ee6ff,0xffd23c,0x5cff8a,0xff8a2a,0xb45cff][Math.floor(Math.random()*7)];
function callsign(){ return acctName(); }
function nameTag(text, col, x1, title, style){
  const c = document.createElement('canvas'); c.width = 256; c.height = title ? 92 : 64; const g = c.getContext('2d');
  if (title){ g.fillStyle = 'rgba(10,12,20,.65)'; g.fillRect(40,60,176,28); g.fillStyle = '#ffd36b'; g.font = '600 22px "Barlow Condensed", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(title, 128, 75); }
  g.fillStyle = 'rgba(10,12,20,.65)'; g.fillRect(8,10,240,44); g.fillStyle = '#' + col.toString(16).padStart(6,'0'); g.fillRect(8,10,6,44);
  g.fillStyle = '#f4ecdc'; g.font = '600 30px "Barlow Condensed", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(text).slice(0,16), x1 ? 118 : 132, 33);
  if (style){ g.strokeStyle = style === 'gold' ? '#f0c419' : '#2ee6ff'; g.lineWidth = 4; g.shadowColor = g.strokeStyle; g.shadowBlur = 12; g.strokeRect(10,12,236,40); g.shadowBlur = 0; }
  if (x1){ g.fillStyle = '#5cff8a'; g.fillRect(196,18,44,28); g.fillStyle = '#0b1020'; g.font = '700 20px "Barlow Condensed", Arial'; g.fillText('X1', 218, 33); }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map:new THREE.CanvasTexture(c), depthWrite:false, transparent:true })); s.scale.set(1.6, title ? .575 : .4, 1); s.position.y = title ? 2.17 : 2.25; return s;
}
function makeAvatar(col, name, x1, title, style, op){
  const g = new THREE.Group(), a = { g, pos:new V3(), target:new V3(), yaw:0, tyaw:0, name, col, spd:0, x1, title };
  const ob = op && SOLDIER ? buildOperator(op) : null;
  if (ob){ ob.root.rotation.y = 0; g.add(ob.root); a.mixer = ob.mixer; a.acts = { Idle:ob.acts.idle, Walk:ob.acts.walk, Run:ob.acts.run }; a.opSync = ob.sync; }
  else if (SOLDIER){
    const model = THREE.SkeletonUtils.clone(SOLDIER.scene); model.rotation.y = Math.PI;
    const tint = new THREE.Color(col).lerp(new THREE.Color(0xffffff), .45);
    model.traverse(o => { if (o.isMesh){ o.material = o.material.clone(); o.material.color.multiply(tint); o.castShadow = true; o.frustumCulled = false; } });
    g.add(model); a.mixer = new THREE.AnimationMixer(model);
    a.acts = {}; for (const n of ['Idle','Walk','Run']){ const ac = a.mixer.clipAction(SOLDIER.clips[n]); ac.play(); ac.setEffectiveWeight(n === 'Idle' ? 1 : 0); a.acts[n] = ac; }
  } else { const b = new THREE.Mesh(Cy(.3,.3,1.7,12), MS(col,.6)); b.position.y = .85; g.add(b); }
  a.tag = nameTag(name, col, x1, title, style); g.add(a.tag); scene.add(g); return a;
}
function removeAvatar(id){ const a = avatars.get(id); if (a){ scene.remove(a.g); if (a.pet) scene.remove(a.pet.g); avatars.delete(id); } }
function onPlazaPeers(ch){
  for (const p of ch.left) removeAvatar(p.peer);
  for (const p of ch.peers){
    if (p.isMe) continue;
    const pr = p.presence || {};
    if (typeof pr.x !== 'number' || typeof pr.z !== 'number') continue;
    let a = avatars.get(p.peer);
    const name = String(pr.name || 'Degen').slice(0,16), col = Number(pr.col) || 0x2f6bff, x1 = pr.x1 === true, title = ['XNT Holder','NFT Collector','XNT Whale'].includes(pr.title) ? pr.title : '';
    const petKey = pr.pet && pr.pet.name ? pr.pet.name + '|' + (pr.pet.image || '') + '|' + (pr.pet.cos || []).join(',') : '', tstyle = pr.tag === 'gold' || pr.tag === 'neon' ? pr.tag : '';
    const opk = pr.op ? JSON.stringify(sanitizeOp(pr.op)) : '';
    if (a && (a.name !== name || a.col !== col || a.x1 !== x1 || a.title !== title || a.petKey !== petKey || a.tstyle !== tstyle || a.opk !== opk)){ removeAvatar(p.peer); a = null; }
    if (!a){ a = makeAvatar(col, name, x1, title, tstyle, opk ? sanitizeOp(pr.op) : null); a.opk = opk; a.tstyle = tstyle; a.petKey = petKey; if (petKey) a.pet = otherPet(pr.pet); a.pos.set(pr.x, pr.y || 0, pr.z); avatars.set(p.peer, a); }
    if (pr.emote && pr.emote.at && pr.emote.at !== a.emoteAt){ a.emoteAt = pr.emote.at; if (Date.now() - pr.emote.at < 6000) emoteBubble(a, String(pr.emote.k)); }
    a.target.set(Math.max(-45, Math.min(45, pr.x)), Math.max(0, Math.min(10, pr.y || 0)), Math.max(-45, Math.min(45, pr.z))); a.tyaw = Number(pr.yaw) || 0;
  }
  const others = ch.peers.filter(p => !p.isMe && p.presence && typeof p.presence.x === 'number').length;
  $('plazaCount').textContent = others ? `${others + 1} players in the market` : 'You are the only one here right now';
}
/* ---------- NFT companions in the Degen Market ---------- */
let pet = null, petCfg = null;
try { petCfg = JSON.parse(store.get('dy-companion') || 'null'); } catch(e){ petCfg = null; }
const PET_LINES = ['gm', 'LFG', 'ser, this is a market', 'nice camo', 'any skulls for sale?', 'watch your six', 'raiders incoming?', 'one more wave?', 'gn soon?'];
function petColors(img){
  // average the most colorful pixels of the NFT art for the body color
  try {
    const c = document.createElement('canvas'); c.width = c.height = 24; const g = c.getContext('2d'); g.drawImage(img, 0, 0, 24, 24);
    const d = g.getImageData(0, 0, 24, 24).data; let r = 0, gg = 0, b = 0, n = 0;
    for (let i=0;i<d.length;i+=4){ const mx = Math.max(d[i], d[i+1], d[i+2]), mn = Math.min(d[i], d[i+1], d[i+2]); if (mx - mn > 40 && mx > 60){ r += d[i]; gg += d[i+1]; b += d[i+2]; n++; } }
    if (n > 8) return new THREE.Color(r/n/255, gg/n/255, b/n/255);
  } catch(e){}
  return null;
}
