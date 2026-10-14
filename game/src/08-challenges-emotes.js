/* ---------- Daily challenges ---------- */
const CHALLENGES = [
  { id:'kills', text:'Get 60 kills', goal:60, ev:'kill' },
  { id:'heads', text:'Get 15 headshots', goal:15, ev:'head' },
  { id:'knife', text:'Get 3 knife kills', goal:3, ev:'knife' },
  { id:'nades', text:'Get 5 explosive kills', goal:5, ev:'nade' },
  { id:'boss', text:'Kill a boss', goal:1, ev:'boss' },
  { id:'wave8', text:'Reach wave 8', goal:8, ev:'wave', max:true },
  { id:'neon', text:'Get 25 kills on Neon District', goal:25, ev:'neonkill' },
  { id:'pet', text:'Get 5 companion kills', goal:5, ev:'pet' },
  { id:'air', text:'Call in an airstrike', goal:1, ev:'air' },
  { id:'pistol', text:'Get 10 pistol kills', goal:10, ev:'pistol' },
  { id:'rocket', text:'Get 4 launcher kills', goal:4, ev:'rocket' }
];
const CHAL_XP = 750, CHAL_BONUS = 1500;
let daily = null;
function dayKey(){ return new Date().toISOString().slice(0, 10); }
function loadDaily(){
  try { daily = JSON.parse(store.get('dy-daily') || 'null'); } catch(e){ daily = null; }
  const today = dayKey();
  if (!daily || daily.day !== today){
    const prevDay = daily && daily.day, streak = daily && daily.allDone && prevDay === new Date(Date.now() - 864e5).toISOString().slice(0, 10) ? (daily.streak || 0) : (daily && prevDay === today ? daily.streak : 0);
    let seed = hashStr(today), pool = CHALLENGES.slice(), pick = [];
    while (pick.length < 3){ seed = (seed*1103515245 + 12345) >>> 0; pick.push(pool.splice(seed % pool.length, 1)[0].id); }
    daily = { day:today, ids:pick, prog:{}, done:{}, allDone:false, streak };
    saveDaily();
  }
  return daily;
}
function saveDaily(){ store.set('dy-daily', JSON.stringify(daily)); }
function chalEvent(ev, n = 1){
  if (!daily || daily.day !== dayKey()) loadDaily();
  if (hubMode) return;
  for (const id of daily.ids){
    const c = CHALLENGES.find(x => x.id === id); if (!c || c.ev !== ev || daily.done[id]) continue;
    daily.prog[id] = c.max ? Math.max(daily.prog[id] || 0, n) : (daily.prog[id] || 0) + n;
    if (daily.prog[id] >= c.goal){
      daily.done[id] = true; giveXP(CHAL_XP); feed(`Challenge complete: ${c.text}`, true); toast(`Daily challenge complete: ${c.text}. +${CHAL_XP} XP`, 3500); sfx.levelUp();
      if (daily.ids.every(x => daily.done[x]) && !daily.allDone){ daily.allDone = true; daily.streak = (daily.streak || 0) + 1; giveXP(CHAL_BONUS); banner('All dailies done'); toast(`All daily challenges done. +${CHAL_BONUS} XP. Streak: ${daily.streak} day${daily.streak === 1 ? '' : 's'}`, 4500); }
    }
  }
  saveDaily(); renderDailyBox();
}
function renderDailyBox(){
  const box = $('dailyBox'); if (!box || !daily) return; box.innerHTML = '';
  const h = document.createElement('b'); h.textContent = `Daily challenges${daily.streak ? `  · ${daily.streak}-day streak` : ''}`; box.appendChild(h);
  for (const id of daily.ids){
    const c = CHALLENGES.find(x => x.id === id), p = Math.min(c.goal, daily.prog[id] || 0), row = document.createElement('div'); row.className = 'dailyRow' + (daily.done[id] ? ' done' : '');
    const t = document.createElement('span'); t.textContent = (daily.done[id] ? '✓ ' : '') + c.text; const n = document.createElement('em'); n.textContent = `${p}/${c.goal}`;
    const bar = document.createElement('i'); bar.style.width = (p/c.goal*100) + '%'; row.append(t, n, bar); box.appendChild(row);
  }
  const f = document.createElement('small'); f.textContent = `+${CHAL_XP} XP each, +${CHAL_BONUS} XP for all three. New challenges every day.`; box.appendChild(f);
}

/* ---------- Emotes in the Degen Market ---------- */
const EMOTES = [{ k:'wave', label:'👋', text:'waves' }, { k:'dance', label:'💃', text:'dances' }, { k:'salute', label:'🫡', text:'salutes' }, { k:'gm', label:'gm', text:'says gm' }];
let myEmote = null;
function doEmote(i){
  if (!hubMode) return;
  const e = EMOTES[i]; if (!e) return;
  myEmote = { k:e.k, at:Date.now() }; presT = 0;
  toast(`You ${e.text}`, 1400);
  if (pet){ petSay(e.k === 'gm' ? 'gm!' : e.label); if (e.k === 'dance') pet.trick = 1; if (e.k === 'wave') pet.waveT = 1.4; }
}
function emoteBubble(a, k){
  const e = EMOTES.find(x => x.k === k); if (!e) return;
  if (a.emoteSpr) a.g.remove(a.emoteSpr);
  const c = document.createElement('canvas'); c.width = 128; c.height = 128; const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,255,255,.92)'; g.beginPath(); g.arc(64, 58, 52, 0, Math.PI*2); g.fill();
  g.font = k === 'gm' ? '700 52px "Barlow Condensed", Arial' : '64px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#1b1030'; g.fillText(e.label, 64, 62);
  a.emoteSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map:new THREE.CanvasTexture(c), transparent:true, depthWrite:false })); a.emoteSpr.scale.set(.7, .7, 1); a.emoteSpr.position.y = 2.75; a.g.add(a.emoteSpr); a.emoteT = 3;
  if (k === 'dance') a.danceT = 3;
}

function buildPistol(){
  const m = new THREE.Group(), L = new THREE.Group(), R = new THREE.Group(); m.add(L); m.add(R);
  const slide = new THREE.Group(); m.add(slide);
  prof(slide, [[-.09,0],[.11,0],[.115,.012],[.115,.045],[-.08,.045],[-.09,.035]], .03, mBlack);
  for (let i=0;i<5;i++) vp(slide, Bx(.0305,.026,.003), mDark, 0,.024,.06+i*.007);
  vp(slide, Bx(.003,.016,.035), mDark, .0155,.03,0);
  vp(slide, Bx(.004,.009,.006), mBlack, 0,.05,-.105);
  for (const sx of [-.007,.007]) vp(slide, Bx(.004,.009,.006), mBlack, sx,.05,.075);
  zc(m, .0075, .0075, .1, .118, .022, mBarrel);
  prof(m, [[-.075,-.022],[.1,-.022],[.1,.002],[-.08,.002]], .028, mPoly);
  vp(m, Bx(.01,.006,.05), mPoly, 0,-.045,-.005); vp(m, Bx(.004,.018,.005), mMetal, 0,-.032,.01, .25);
  prof(m, [[-.03,-.02],[.012,-.02],[-.004,-.062],['q',-.012,-.112,-.036,-.118],[-.064,-.112],['q',-.054,-.062,-.04,-.02]], .032, mPoly);
  const mag = new THREE.Group(); mag.position.set(0,-.115,.05); m.add(mag); vp(mag, Bx(.026,.012,.04), mBlack, 0,-.004,0);
  attachHand(m, R, gripHand(.017, 1, true), new V3(0,-.065,.035), -.28, new V3(.03,-.05,.045), new V3(.17,-.42,.42), false);
  attachHand(m, L, gripHand(.02, -1, false), new V3(-.016,-.075,.03), -.28, new V3(-.03,-.05,.045), new V3(-.2,-.42,.36), true);
  return { model:m, left:L, right:R, mag, slide, scale:1, sightY:.0545, adsZ:-.34, hip:new V3(.13,-.135,-.34), sprint:new V3(.08,-.22,-.3),
    muzzle:marker(m,0,.022,-.125), eject:marker(m,.02,.035,0), flash:muzzleFlash(m,new V3(0,.022,-.13),.5), magTarget:new V3(0,-.1,.04), gripZ:.07, laserZ:.08 };
}

/* ---------- Degen Skull #503 assets ---------- */
const SKULL_ALPHA = 'data:image/png;base64,' + document.getElementById('skullAlpha').textContent.trim();
const SKULL_CARD = 'data:image/jpeg;base64,' + document.getElementById('skullCard').textContent.trim();
const skullImg = new Image();
const skullTex = new THREE.Texture(skullImg); skullTex.anisotropy = 4;
const camoCanvas = document.createElement('canvas'); camoCanvas.width = camoCanvas.height = 256;
const camoTex = new THREE.CanvasTexture(camoCanvas); camoTex.wrapS = camoTex.wrapT = THREE.RepeatWrapping; camoTex.repeat.set(5,5); camoTex.anisotropy = 4;
const posterCanvas = document.createElement('canvas'); posterCanvas.width = 256; posterCanvas.height = 320;
const posterTex = new THREE.CanvasTexture(posterCanvas);
skullImg.onload = () => {
  skullTex.needsUpdate = true;
  const g = camoCanvas.getContext('2d'); g.fillStyle = '#121826'; g.fillRect(0,0,256,256);
  speckle(g,256,256,1500,'0,0,0','60,90,160');
  for (let i=0;i<5;i++){ g.strokeStyle = `rgba(40,90,200,${.25 + Math.random()*.2})`; g.lineWidth = 6 + Math.random()*10; g.beginPath(); g.moveTo(Math.random()*256, 0); g.bezierCurveTo(Math.random()*256, 90, Math.random()*256, 170, Math.random()*256, 256); g.stroke(); }
  for (const [x,y,r,sc] of [[64,64,-.3,92],[192,192,.25,92],[192,58,.5,54],[60,196,-.6,54],[128,128,0,40]]){ g.save(); g.translate(x,y); g.rotate(r); g.globalAlpha = .9; g.drawImage(skullImg,-sc/2,-sc/2,sc,sc); g.restore(); }
  camoTex.needsUpdate = true;
  const q = posterCanvas.getContext('2d'); q.fillStyle = '#e9e2d0'; q.fillRect(0,0,256,320); q.fillStyle = '#0a0d16'; q.fillRect(14,14,228,228);
  q.drawImage(skullImg, 24, 24, 208, 208);
  q.fillStyle = '#0a0d16'; q.font = '700 30px "Barlow Condensed", sans-serif'; q.textAlign = 'center'; q.fillText('DEGEN SKULL', 128, 276); q.font = '600 22px "Barlow Condensed", sans-serif'; q.fillStyle = '#2f6bff'; q.fillText('#503', 128, 304);
  speckle(q,256,320,600,'60,50,40','255,255,255');
  posterTex.needsUpdate = true;
};
skullImg.src = SKULL_ALPHA;
const mCamo = MS(0xffffff,.55,.35,{ map:camoTex });
// graffiti and posters around the yard
const graffitiMat = new THREE.MeshStandardMaterial({ map:skullTex, transparent:true, alphaTest:.25, roughness:.9, polygonOffset:true, polygonOffsetFactor:-2, emissive:0x1a3cff, emissiveIntensity:.08 });
const posterMat = new THREE.MeshStandardMaterial({ map:posterTex, roughness:.85, polygonOffset:true, polygonOffsetFactor:-2 });


