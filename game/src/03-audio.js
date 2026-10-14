/* ---------- Audio ---------- */
let ac = null, noiseBuf = null, master = null;
function initAudio(){
  if (ac){ if (ac.state === 'suspended') ac.resume(); return; }
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = 0.45*cfg.vol; master.connect(ac.destination);
    const len = ac.sampleRate * 1.2; noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i=0;i<len;i++) d[i] = Math.random()*2-1;
  } catch(e){ ac = null; }
}
function blast(vol, cutoff, dur, thump, delay=0, tf=150){
  if (!ac) return; const t = ac.currentTime + delay;
  const s = ac.createBufferSource(); s.buffer = noiseBuf;
  const f = ac.createBiquadFilter(); f.type = 'lowpass';
  f.frequency.setValueAtTime(cutoff, t); f.frequency.exponentialRampToValueAtTime(Math.max(150, cutoff*0.15), t+dur);
  const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t+dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random()*0.2); s.stop(t+dur+0.02);
  if (thump){
    const o = ac.createOscillator(), og = ac.createGain();
    o.frequency.setValueAtTime(tf, t); o.frequency.exponentialRampToValueAtTime(tf*.28, t+0.12);
    og.gain.setValueAtTime(vol*0.9, t); og.gain.exponentialRampToValueAtTime(0.001, t+0.14);
    o.connect(og); og.connect(master); o.start(t); o.stop(t+0.16);
  }
}
function tone(freq, dur, vol, type='square', delay=0){
  if (!ac) return; const t = ac.currentTime + delay;
  const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t+dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t+dur+0.02);
}
const sfx = {
  fire: (id, supp) => {
    if (supp){ blast(.16, 1300, .12, false); tone(160, .05, .05, 'triangle'); return; }
    if (id === 'smg'){ blast(.36, 5200, .13, true, 0, 190); }
    else if (id === 'shotgun'){ blast(.75, 2600, .45, true, 0, 110); blast(.18, 900, .7, false, .05); }
    else if (id === 'sniper'){ blast(.9, 3600, .55, true, 0, 95); blast(.22, 1100, .9, false, .22); blast(.1, 700, .9, false, .5); }
    else blast(0.5, 4200, 0.2, true);
  },
  pump: () => { blast(.22, 2200, .06, false, 0); tone(240, .03, .06, 'square', .01); blast(.25, 2600, .06, false, .2); tone(320, .03, .06, 'square', .21); },
  bolt: () => { tone(500, .03, .07, 'square', .05); blast(.16, 3000, .05, false, .25); tone(360, .04, .07, 'square', .55); tone(620, .03, .08, 'square', .82); },
  shellIn: () => { blast(.14, 2400, .05, false); tone(380, .03, .05, 'square', .02); },
  swap: () => { blast(.1, 1500, .08, false); tone(300, .03, .05, 'square', .12); },
  step: (run, side = 1) => { blast((run ? .075 : .048)*(side > 0 ? 1 : .85), side > 0 ? 420 : 360, run ? .08 : .09, false); if (run) blast(.02, 1400, .04, false, .02); },
  boom: d => { const v = Math.max(.15, 1.1 - d*.02); blast(v, 1600, 1.2, true, 0, 55); blast(v*.4, 500, 1.8, false, .08); },
  bang: d => { const v = Math.max(.15, 1 - d*.02); blast(v, 7000, .35, true, 0, 280); },
  smoke: () => blast(.15, 1200, 2.5, false),
  pin: () => { tone(1500, .03, .05, 'triangle'); tone(900, .04, .05, 'triangle', .06); },
  toss: () => blast(.12, 1400, .2, false),
  clink: () => tone(1100 + Math.random()*400, .04, .05, 'triangle'),
  swish: () => blast(.16, 3500, .18, false),
  stab: () => blast(.35, 800, .15, true, 0, 90),
  pickup: () => { tone(880, .06, .08, 'triangle'); tone(1320, .08, .08, 'triangle', .07); },
  ring: v => tone(3600, 2.2, .05*v, 'sine'),
  streak: () => { tone(660, .1, .1, 'triangle'); tone(880, .1, .1, 'triangle', .1); tone(1320, .18, .1, 'triangle', .2); },
  radio: () => { blast(.08, 2600, .3, false); tone(1200, .06, .05, 'square', .05); tone(900, .08, .05, 'square', .15); },
  jet: () => { blast(.25, 900, 2.2, false, .3); blast(.55, 1800, 2.6, true, 1.2, 70); },
  droneFire: () => blast(.1, 4500, .06, false),
  ping: () => { tone(2400 + Math.random()*900, .06, .035, 'triangle'); tone(1700, .05, .02, 'square', .01); },
  headshot: () => { blast(.32, 700, .1, true, 0, 120); tone(180, .08, .06, 'sine'); },
  radio2: v => { blast(.03*v + .01, 3200, .12, false); tone(1400, .04, .02*v + .006, 'square', .02); },
  distant: (v, d) => blast(v, 650 + Math.random()*300, .14, false, d),
  echo: v => { if (currentMap === 'neon'){ blast(.07*v, 2300, .18, false, .07); blast(.05*v, 1700, .24, false, .14); } else if (currentMap === 'yard'){ blast(.08*v, 900, .45, false, .17); } },
  levelUp: () => { tone(523, .12, .1, 'triangle'); tone(659, .12, .1, 'triangle', .1); tone(784, .12, .1, 'triangle', .2); tone(1047, .3, .1, 'triangle', .3); },
  horn: () => { tone(110, 1.4, .12, 'sawtooth'); tone(82, 1.6, .1, 'sawtooth', .2); blast(.3, 300, 1.5, true, 0, 50); },
  minigun: d => blast(Math.max(.05, .28 - d*.004), 2200, .07, false),
  spinUp: () => { if (!ac) return; const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(60, t); o.frequency.exponentialRampToValueAtTime(420, t + .9); g.gain.setValueAtTime(.05, t); g.gain.linearRampToValueAtTime(.08, t + .9); g.gain.exponentialRampToValueAtTime(.001, t + 1.1); o.connect(g); g.connect(master); o.start(t); o.stop(t + 1.15); },
  esniper: d => blast(Math.max(.1, .6 - d*.005), 3000, .5, true, 0, 90),
  enemy: d => blast(Math.max(0.04, 0.32 - d*0.007), 1600, 0.24, false),
  hit: () => tone(1900, 0.05, 0.1, 'triangle'),
  kill: () => { tone(1400, 0.06, 0.12, 'triangle'); tone(2100, 0.08, 0.12, 'triangle', 0.06); },
  click: () => tone(900, 0.03, 0.08),
  reloadOut: () => { tone(320, 0.05, 0.08); tone(250, 0.05, 0.08, 'square', 0.12); },
  reloadIn: () => { tone(430, 0.04, 0.1); tone(620, 0.05, 0.1, 'square', 0.09); },
  hurt: () => blast(0.28, 500, 0.18, true),
  slide: () => blast(0.22, 900, 0.55, false),
  // an elephant's trumpet: a brassy rising blare with a wobble
  trumpet: (p = 1) => {
    if (!ac) return; const t = ac.currentTime, o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain(), bp = ac.createBiquadFilter(), lfo = ac.createOscillator(), lg = ac.createGain();
    o.type = 'sawtooth'; o2.type = 'square'; const f = 420*p;
    o.frequency.setValueAtTime(f*.7, t); o.frequency.exponentialRampToValueAtTime(f*1.35, t + .25); o.frequency.exponentialRampToValueAtTime(f, t + .9);
    o2.frequency.setValueAtTime(f*.705, t); o2.frequency.exponentialRampToValueAtTime(f*1.36, t + .25); o2.frequency.exponentialRampToValueAtTime(f*1.01, t + .9);
    lfo.frequency.value = 22; lg.gain.value = 18; lfo.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency);
    bp.type = 'bandpass'; bp.frequency.value = 1200; bp.Q.value = .8;
    g.gain.setValueAtTime(.001, t); g.gain.exponentialRampToValueAtTime(.16, t + .06); g.gain.setValueAtTime(.16, t + .7); g.gain.exponentialRampToValueAtTime(.001, t + 1);
    o.connect(bp); o2.connect(bp); bp.connect(g); g.connect(master);
    for (const x of [o, o2, lfo]){ x.start(t); x.stop(t + 1.05); }
  },
  // a growl that drops in pitch, under a rush of breath; deeper for big animals
  roar: k => {
    if (!ac) return; const t = ac.currentTime, deep = k === 'bear' || k === 'ape' || k === 'lion', hi = k === 'fox' || k === 'wolf';
    const o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain(), lp = ac.createBiquadFilter();
    o.type = 'sawtooth'; o2.type = 'square'; const f0 = hi ? 330 : deep ? 120 : 180;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0*(hi ? 1.5 : .55), t + (hi ? .5 : .9)); if (hi) o.frequency.exponentialRampToValueAtTime(f0*.9, t + 1.3);
    o2.frequency.setValueAtTime(f0*.5 + 3, t); o2.frequency.exponentialRampToValueAtTime(f0*.3, t + 1.1);
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(hi ? 2400 : 1300, t); lp.frequency.exponentialRampToValueAtTime(400, t + 1.3);
    g.gain.setValueAtTime(.001, t); g.gain.exponentialRampToValueAtTime(.32, t + .08); g.gain.exponentialRampToValueAtTime(.001, t + 1.4);
    o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(master); o.start(t); o2.start(t); o.stop(t + 1.45); o2.stop(t + 1.45);
    blast(.3, deep ? 600 : 1100, 1.1, false, .02);
  }
};

