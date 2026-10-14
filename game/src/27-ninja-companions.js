/* ---------- X1 Ninja companions, built from each NFT's traits ---------- */
const isNinja = cfg => /ninja|x1nja|shinobi/i.test(String(cfg.name || '') + ' ' + String(cfg.symbol || ''));
const NINJA_LINES = ['gm, sensei', 'the shadows are quiet', 'hai!', 'X1 Ninjas never sleep', 'my blade is ready', 'silent but deadly'];
const NINJA_BATTLE = ['hai!', 'shadow strike!', 'too slow', 'behind you!', 'for the clan'];
const CLAN_COL = { violet:0x8e44c8, purple:0x8e44c8, teal:0x1fb5a8, jade:0x2e9e6a, green:0x3fae4f, silver:0xb8bec8, blue:0x2f6bff, orange:0xff8a2a, crimson:0xc7364f, red:0xe0453a, yellow:0xf0c419, gold:0xd8a93a, pink:0xff6fae, white:0xeeeeee, black:0x2a2a2e, cyan:0x2ee6ff };
const CLOTH_COL = { whiteout:0xe6e6ea, white:0xe6e6ea, 'dark blue':0x1d2a52, blue:0x2a4b9a, 'dark gray':0x3a3c42, gray:0x6a6d75, gold:0xc9a227, black:0x17181c, red:0x8a1f2a, green:0x234f33, purple:0x3d2160 };
const SKIN_COL = { light:0xf1c9a5, pale:0xf6dcc3, medium:0xc99872, tan:0xb07a52, deep:0x6e4a32, dark:0x5a3a26 };
const HAIR_COL = { black:0x121214, blonde:0xe8c25a, brown:0x6b4226, white:0xeeeeee, red:0xb8402a, silver:0xb8bec8, blue:0x2f6bff, pink:0xff6fae };
const RARITY_POWER = { common:1, rare:1.05, epic:1.1, legendary:1.15, mythic:1.25 };
function ninjaTraits(cfg){
  const t = {}, seed = hashStr(cfg.mint || cfg.name || 'ninja');
  for (const [k, v] of Object.entries(cfg.traits || {})) t[String(k).toLowerCase()] = String(v).toLowerCase();
  // fill anything missing from the NFT's id, so every ninja is consistent
  const pick = (k, list, s) => { if (!t[k]) t[k] = list[(seed >> s) % list.length]; };
  pick('clan', Object.keys(CLAN_COL), 0); pick('cloth', ['black', 'dark gray', 'dark blue'], 3); pick('outfit', ['vest', 'gi wrap', 'chest plate', 'suit & scarf'], 6);
  pick('head', ['hood', 'hood', 'masked kunoichi', 'ronin'], 9); pick('hand weapon', ['shuriken', 'none', 'sai'], 12); pick('back weapon', ['katana', 'none'], 15);
  return t;
}
function buildNinja(cfg){
  const t = ninjaTraits(cfg), g = new THREE.Group();
  const M = (c, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color:c, roughness:.8, flatShading:true }, o));
  const clanC = CLAN_COL[t.clan] || 0x8e44c8, clothC = CLOTH_COL[t.cloth] || 0x17181c, skinC = SKIN_COL[t.skin] || 0xc99872;
  const clan = M(clanC), cloth = M(clothC), under = M(new THREE.Color(clothC).multiplyScalar(.6).getHex() || 0x111111), skin = M(skinC), dark = M(0x101114), metal = M(0xc8ced8, { roughness:.25, metalness:.9 });
  const add = (parent, w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(Bx(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  const rig = new THREE.Group(); g.add(rig);
  // blocky pixel-art body to match the collection
  const legs = [-1, 1].map(sx => { const hip = new THREE.Group(); hip.position.set(sx*.09, .6, 0); rig.add(hip);
    add(hip, .13, .46, .15, cloth, 0, -.23, 0); add(hip, .14, .1, .2, dark, 0, -.53, .02); return hip; });
  add(rig, .36, .42, .2, cloth, 0, .84, 0);
  add(rig, .38, .07, .22, clan, 0, .66, 0);                                            // sash
  add(rig, .08, .18, .03, clan, .12, .56, .1);                                         // sash knot
  const outfit = t.outfit || '';
  if (/vest/.test(outfit)){ add(rig, .38, .36, .22, clan, 0, .87, 0).scale.set(1, 1, 1); add(rig, .14, .36, .23, cloth, 0, .87, 0); }
  else if (/plate/.test(outfit)){ add(rig, .3, .24, .06, metal, 0, .9, .11); add(rig, .32, .04, .07, dark, 0, .79, .11); }
  else if (/scarf/.test(outfit)){ add(rig, .3, .08, .24, clan, 0, 1.07, 0); add(rig, .08, .3, .04, clan, .09, .92, -.12); }
  else { const a = add(rig, .06, .46, .02, clan, 0, .86, .105); a.rotation.z = .6; const b = add(rig, .06, .46, .02, clan, 0, .86, .107); b.rotation.z = -.6; }
  const arms = [-1, 1].map(sx => { const sh = new THREE.Group(); sh.position.set(sx*.24, 1.02, 0); rig.add(sh);
    add(sh, .11, .4, .13, /vest/.test(outfit) ? under : cloth, 0, -.2, 0); add(sh, .11, .1, .13, /skull|oni|iron/.test(t.head || '') ? dark : skin, 0, -.44, 0); return sh; });
  // head by trait
  const head = new THREE.Group(); head.position.set(0, 1.25, 0); rig.add(head);
  const h = t.head || 'hood', glowEyes = /glow/.test(t['eye fx'] || ''), eyeMat = glowEyes ? new THREE.MeshBasicMaterial({ color:clanC }) : dark;
  const eyes = (y, z, mat) => { for (const sx of [-1, 1]) add(head, .05, .04, .02, mat || eyeMat, sx*.065, y, z); };
  if (/skull/.test(h)){
    const bone = M(/jade/.test(h) ? 0x8fd6a8 : /blood/.test(h) ? 0xd86a5e : 0xe8e2d0); add(head, .3, .3, .3, bone, 0, 0, 0);
    for (const sx of [-1, 1]) add(head, .08, .08, .02, glowEyes ? eyeMat : dark, sx*.07, .02, .151);
    add(head, .04, .05, .02, dark, 0, -.05, .151); for (let i=0;i<4;i++) add(head, .03, .04, .02, dark, -.06 + i*.04, -.11, .151);
    if (/crack/.test(h)){ const c = add(head, .02, .14, .02, dark, .1, .07, .152); c.rotation.z = .5; }
  } else if (/(^|\s)oni(\s|$)|menpo/.test(h)){   // careful: 'ronin' also contains 'oni'
    const face = M(/blue/.test(h) ? 0x3a5bd8 : 0xc0392b); add(head, .3, .3, .3, /menpo/.test(h) ? cloth : face, 0, 0, 0);
    if (/menpo/.test(h)){ add(head, .3, .16, .04, face, 0, -.06, .14); eyes(.06, .152, M(skinC)); eyes(.06, .162); } else eyes(.04, .152, M(0xffe066));
    for (const sx of [-1, 1]){ const horn = add(head, .05, .12, .05, M(0xf2e6c8), sx*.1, .2, 0); horn.rotation.z = -sx*.3; add(head, .03, .05, .02, M(0xffffff), sx*.05, -.1, .16); }
  } else if (/kitsune|fox/.test(h)){
    add(head, .3, .3, .3, M(0xf4f1ea), 0, 0, 0); eyes(.03, .152); for (const sx of [-1, 1]){ add(head, .07, .1, .05, M(0xf4f1ea), sx*.09, .19, 0); add(head, .03, .06, .02, M(0xd8342c), sx*.09, -.02, .152); }
  } else if (/kabuki/.test(h)){
    add(head, .3, .3, .3, M(0xf6f2ea), 0, 0, 0); eyes(.03, .152); add(head, .26, .03, .02, M(0xc0392b), 0, .1, .152); add(head, .1, .03, .02, M(0xc0392b), 0, -.08, .152);
  } else if (/respirator/.test(h)){
    add(head, .3, .3, .3, cloth, 0, 0, 0); add(head, .22, .08, .02, skin, 0, .04, .151); eyes(.04, .162); add(head, .2, .12, .08, dark, 0, -.08, .15);
    for (const sx of [-1, 1]){ const f = new THREE.Mesh(Cy(.035, .035, .06, 8), metal); f.rotation.x = HP; f.position.set(sx*.08, -.1, .2); head.add(f); }
  } else if (/iron/.test(h)){
    add(head, .3, .3, .3, metal, 0, 0, 0); add(head, .24, .03, .02, glowEyes ? eyeMat : dark, 0, .03, .152);
  } else if (/ronin/.test(h) || (t.hair && t.hair !== 'none' && !/hood|kunoichi/.test(h))){
    add(head, .28, .28, .28, skin, 0, -.01, 0); eyes(.02, .142);
    add(head, .3, .1, .3, M(HAIR_COL[t.hair] || 0x121214), 0, .14, -.01); add(head, .1, .08, .08, M(HAIR_COL[t.hair] || 0x121214), 0, .16, -.17);
  } else {
    add(head, .3, .3, .3, cloth, 0, 0, 0); add(head, .22, .08, .02, skin, 0, .03, .151); eyes(.03, .162);
    if (/kunoichi/.test(h)) add(head, .22, .1, .02, clan, 0, -.06, .152);
  }
  if (/shades/.test(t.eyewear || '')) add(head, .26, .06, .03, M(0x050505, { roughness:.1, metalness:.6 }), 0, .03, .17);
  if (t.headband && t.headband !== 'none'){
    add(head, .32, .05, .32, M(/white/.test(t.headband) ? 0xf2f2f2 : clanC), 0, .1, 0);
    if (/x/.test(t.headband)){ for (const r of [.7, -.7]){ const b = add(head, .02, .07, .02, dark, 0, .1, .165); b.rotation.z = r; } }
    for (const sx of [-1, 1]) add(head, .03, .02, .18, M(/white/.test(t.headband) ? 0xf2f2f2 : clanC), sx*.04, .1, -.24).rotation.x = .3;
  }
  // back weapon
  const back = t['back weapon'] || '';
  if (/katana/.test(back)){ const sh = add(rig, .05, .78, .04, dark, 0, .96, -.14); sh.rotation.z = .55; const hl = add(rig, .04, .18, .04, clan, -.24, 1.32, -.14); hl.rotation.z = .55; }
  else if (/staff/.test(back)){ const st = add(rig, .04, 1.1, .04, M(0x6b4a2a), 0, 1, -.14); st.rotation.z = .4; const orb = new THREE.Mesh(new THREE.SphereGeometry(.07, 10, 8), new THREE.MeshBasicMaterial({ color:clanC })); orb.position.set(-.21, 1.52, -.14); rig.add(orb); }
  // hand weapon (right hand) and the blade it draws for melee
  const hw = t['hand weapon'] || 'none', hand = new THREE.Group(); hand.position.set(0, -.46, 0); arms[1].add(hand);
  if (/sai/.test(hw)){ add(hand, .02, .02, .4, metal, 0, 0, .22); for (const sx of [-1, 1]) add(hand, .02, .02, .1, metal, sx*.05, 0, .06); }
  else if (/nunchuck|nunchaku/.test(hw)){ add(hand, .04, .04, .2, M(0x6b4a2a), 0, 0, .1); const s2 = add(hand, .04, .04, .2, M(0x6b4a2a), .06, -.12, .18); s2.rotation.x = .9; }
  else if (/shuriken/.test(hw)){ const st = new THREE.Mesh(starGeo, /gold/.test(hw) ? starGold : starMat); st.position.set(0, 0, .06); hand.add(st); }
  const blade = new THREE.Group(); hand.add(blade); blade.visible = false;
  add(blade, .03, .03, .16, clan, 0, 0, .06); add(blade, .09, .015, .05, dark, 0, 0, .15); add(blade, .015, .03, .62, metal, 0, 0, .47);
  const jet = new THREE.Sprite(new THREE.SpriteMaterial({ map:flashTex, transparent:true, opacity:0, depthWrite:false })); rig.add(jet);
  const rarity = t.rarity || t.tier || '', power = RARITY_POWER[rarity] || 1;
  if (power >= 1.15){ const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map:flashTex, color:clanC, blending:THREE.AdditiveBlending, transparent:true, opacity:.35, depthWrite:false })); aura.position.y = .9; aura.scale.set(1.6, 2.2, 1); rig.add(aura); }
  const tag = nameTag(cfg.name || 'Ninja', clanC); tag.position.y = 1.72; tag.scale.multiplyScalar(.7); g.add(tag);
  g.position.set(P.pos.x - Math.sin(P.yaw)*2.4 + Math.cos(P.yaw)*.9, P.pos.y, P.pos.z - Math.cos(P.yaw)*2.4 - Math.sin(P.yaw)*.9); scene.add(g);
  const style = /sai/.test(hw) ? 'sai' : /nunchuck|nunchaku/.test(hw) ? 'nunchucks' : /gold/.test(hw) ? 'gold' : /shuriken/.test(hw) ? 'shuriken' : /staff/.test(back) ? 'staff' : 'katana';
  return { kind:'ninja', style, power, traits:t, g, rig, legs, arms, head, jet, blade, tails:[], vel:new V3(), say:null, sayT:0, nextSay:6 + Math.random()*8, trick:0, phase:0, cfg, mode:'follow', slashCd:1.5, starCd:1, stars:[] };
}
const starGeo = (() => { const s = new THREE.Shape(); for (let i=0;i<8;i++){ const r = i % 2 ? .035 : .1, a = i/8*Math.PI*2; i ? s.lineTo(Math.cos(a)*r, Math.sin(a)*r) : s.moveTo(Math.cos(a)*r, Math.sin(a)*r); } return new THREE.ExtrudeGeometry(s, { depth:.01, bevelEnabled:false }); })();
const starMat = new THREE.MeshStandardMaterial({ color:0xc9ced6, roughness:.25, metalness:.9 });
const starGold = new THREE.MeshStandardMaterial({ color:0xf0c419, roughness:.25, metalness:.9 });
function ninjaSlashFx(at, col){
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map:flashTex, color:col || 0xdff6ff, blending:THREE.AdditiveBlending, transparent:true, depthWrite:false }));
  s.position.copy(at); s.scale.set(1.4, .35, 1); scene.add(s); effects.push({ obj:s, life:.18, max:.18 });
}
// fighting style follows the NFT's weapons: blades dash in, shuriken and staffs fight from range
function ninjaCombat(dt){
  const o = pet; o.slashCd -= dt; o.starCd -= dt;
  for (let i=o.stars.length-1;i>=0;i--){
    const s = o.stars[i]; s.life -= dt; s.m.position.addScaledVector(s.v, dt); s.m.rotation.z += dt*30;
    const tgt = s.e.alive ? new V3(s.e.pos.x, (s.e.y || 0) + 1.2*s.e.g.scale.x, s.e.pos.z) : null;
    if (tgt && s.m.position.distanceTo(tgt) < .7){ damageEnemy(s.e, s.dmg, false, s.v.clone().normalize(), 'pet'); sfx.ping(); scene.remove(s.m); o.stars.splice(i,1); continue; }
    if (s.life <= 0 || !tgt){ scene.remove(s.m); o.stars.splice(i,1); }
  }
  if (o.mode !== 'follow') return;
  const from = o.g.position.clone(); from.y += 1.1;
  if (o.slashCd > 0 && o.starCd > 0) return;
  const best = petTarget(from, 24);
  if (!best) return;
  const ranged = o.style === 'shuriken' || o.style === 'gold' || o.style === 'staff';
  const flat = Math.hypot(best.e.pos.x - o.g.position.x, best.e.pos.z - o.g.position.z);
  if (flat < (ranged ? 4 : 13) && o.slashCd <= 0 && !(best.e.y > 1)){
    o.mode = 'dash'; o.target = best.e; o.dashT = 1.4;
    if (Math.random() < .5) petSay(NINJA_BATTLE[Math.floor(Math.random()*NINJA_BATTLE.length)]);
  } else if (o.starCd <= 0){
    if (o.style === 'staff'){
      o.starCd = 2.4; spawnTracer(from.clone(), best.chest, CLAN_COL[o.traits.clan] || 0xb45cff); spawnPuff(best.chest, CLAN_COL[o.traits.clan] || 0xb45cff, .25, .35);
      damageEnemy(best.e, Math.round(24*o.power), false, new V3().subVectors(best.chest, from).normalize(), 'pet'); sfx.droneFire();
    } else {
      o.starCd = (ranged ? 1.1 : 1.8) + Math.random()*.5;
      const m = new THREE.Mesh(starGeo, o.style === 'gold' ? starGold : starMat); m.position.copy(from); scene.add(m);
      o.stars.push({ m, e:best.e, dmg:Math.round((o.style === 'gold' ? 20 : ranged ? 14 : 12)*o.power), v:new V3().subVectors(best.chest, from).normalize().multiplyScalar(24), life:1.2 });
      sfx.swish();
    }
    o.arms[1].rotation.x = -1.6;
  }
}
function ninjaMove(dt){
  const o = pet, gp = o.g.position, e = o.target;
  if (!e || !e.alive){ o.mode = 'follow'; o.blade.visible = false; return false; }
  if (o.mode === 'dash'){
    o.dashT -= dt;
    const dx = e.pos.x - gp.x, dz = e.pos.z - gp.z, d = Math.hypot(dx, dz) || 1;
    o.g.rotation.y = Math.atan2(dx, dz); o.blade.visible = o.style === 'katana';
    if (d < 1.4 || o.dashT <= 0){ o.mode = 'slash'; o.slashT = o.style === 'nunchucks' ? .6 : .45; o.hits = 0; o.vel.set(0,0,0); }
    else { const sp = 15; gp.x += dx/d*sp*dt; gp.z += dz/d*sp*dt; collide(gp, .3, gp.y); animatePet(o, sp*.6, dt); o.arms[1].rotation.x = -.6; }
    return true;
  }
  if (o.mode === 'slash'){
    const dur = o.style === 'nunchucks' ? .6 : .45; o.slashT -= dt; const p = 1 - o.slashT/dur;
    const dir = new V3(e.pos.x - gp.x, 0, e.pos.z - gp.z).normalize(), near = Math.hypot(e.pos.x - gp.x, e.pos.z - gp.z) < 2.3;
    const at = new V3(e.pos.x, (e.y || 0) + 1.1, e.pos.z), col = CLAN_COL[o.traits.clan];
    if (o.style === 'nunchucks'){
      o.rig.rotation.y += dt*22; o.arms[1].rotation.x = -1.5;
      if (!o.hits && p > .5){ o.hits = 1; sfx.stab(); for (const x of enemies){ if (x.alive && !x.air && Math.hypot(x.pos.x - gp.x, x.pos.z - gp.z) < 2.7){ damageEnemy(x, Math.round(30*o.power), false, new V3(x.pos.x - gp.x, 0, x.pos.z - gp.z).normalize(), 'pet'); ninjaSlashFx(new V3(x.pos.x, 1.1, x.pos.z), col); } } }
    } else if (o.style === 'sai' || o.style === 'shuriken' || o.style === 'gold' || o.style === 'staff'){
      o.arms[1].rotation.x = -1.6 + Math.sin(p*Math.PI*4)*.9; o.arms[0].rotation.x = -1.6 - Math.sin(p*Math.PI*4)*.9;
      for (const mark of [.3, .7]) if (o.hits < (mark === .3 ? 1 : 2) && p > mark){ o.hits++; if (near){ damageEnemy(e, Math.round(22*o.power), false, dir, 'pet'); sfx.stab(); ninjaSlashFx(at, col); } }
    } else {
      o.arms[1].rotation.x = -2.6 + p*3.6; o.arms[1].rotation.z = .5 - p*.9; o.rig.rotation.y = -.4 + p*.8;
      if (!o.hits && p > .45){ o.hits = 1; if (near){ damageEnemy(e, Math.round(40*o.power), false, dir, 'pet'); sfx.stab(); ninjaSlashFx(at, col); } }
    }
    if (o.slashT <= 0){ o.mode = 'follow'; o.slashCd = (o.style === 'katana' ? 3 : 3.6) + Math.random(); o.rig.rotation.y = 0; o.arms[1].rotation.z = .15; setTimeout(() => { if (pet === o && o.mode === 'follow') o.blade.visible = false; }, 600); }
    return true;
  }
  return false;
}

function buildPet(cfg){
  if (isNinja(cfg)) return buildNinja(cfg);
  // a little walking robot: legs, arms, torso, and a screen head that shows the NFT
  const g = new THREE.Group(), base = new THREE.Color().setHSL((hashStr(cfg.mint) % 360)/360, .65, .5);
  const bodyMat = new THREE.MeshStandardMaterial({ color:base, roughness:.35, metalness:.35 });
  const darkMat = new THREE.MeshStandardMaterial({ color:0x1d1f26, roughness:.5, metalness:.6 });
  const glowMat = new THREE.MeshBasicMaterial({ color:base.clone().offsetHSL(0, 0, .25) });
  const add = (parent, geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  const rig = new THREE.Group(); g.add(rig);                      // everything above the feet bobs with the walk
  // legs (pivot at the hip)
  const legs = [-1, 1].map(sx => {
    const hip = new THREE.Group(); hip.position.set(sx*.09, .32, 0); rig.add(hip);
    add(hip, Cy(.05, .045, .24, 10), darkMat, 0, -.12, 0);
    add(hip, new THREE.SphereGeometry(.07, 12, 8), bodyMat, 0, -.27, .02).scale.set(1, .6, 1.4);
    return hip;
  });
  // torso, belly light and backpack thruster
  const torso = add(rig, new THREE.SphereGeometry(.2, 20, 14), bodyMat, 0, .5, 0); torso.scale.set(1, 1.05, .82);
  add(rig, new THREE.SphereGeometry(.05, 10, 8), glowMat, 0, .5, .16);
  add(rig, Bx(.18, .2, .1), darkMat, 0, .52, -.17);
  const jet = new THREE.Sprite(new THREE.SpriteMaterial({ map:flashTex, color:glowMat.color, blending:THREE.AdditiveBlending, transparent:true, depthWrite:false, opacity:0 }));
  jet.position.set(0, .36, -.2); jet.scale.set(.22, .38, 1); rig.add(jet);
  // arms (pivot at the shoulder)
  const arms = [-1, 1].map(sx => {
    const sh = new THREE.Group(); sh.position.set(sx*.23, .62, 0); rig.add(sh);
    add(sh, Cy(.035, .03, .22, 8), darkMat, 0, -.11, 0);
    add(sh, new THREE.SphereGeometry(.05, 10, 8), bodyMat, 0, -.24, 0);
    return sh;
  });
  // head with the NFT on its face screen
  const head = new THREE.Group(); head.position.set(0, .9, 0); rig.add(head);
  const skull = add(head, new THREE.SphereGeometry(.24, 22, 16), bodyMat, 0, 0, 0); skull.scale.set(1.08, .92, .76);   // flatter front so the face screen isn't covered
  const art = nftArtCanvas({ item:cfg.name || 'NFT', collection:cfg.symbol || '' });
  const screenMat = new THREE.MeshBasicMaterial({ map:new THREE.CanvasTexture(art), toneMapped:false });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(.3, .3), screenMat); screen.position.set(0, 0, .2); screen.renderOrder = 2; head.add(screen);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(.17, .016, 8, 32), darkMat); rim.position.set(0, 0, .198); head.add(rim);
  for (const sx of [-1, 1]){
    const ant = add(head, Cy(.01, .01, .16, 6), darkMat, sx*.11, .26, -.02); ant.rotation.z = -sx*.35;
    add(head, new THREE.SphereGeometry(.03, 10, 8), glowMat, sx*.145, .34, -.02);
  }
  const tag = nameTag(cfg.name || 'Companion', base.getHex()); tag.position.y = 1.45; tag.scale.multiplyScalar(.7); g.add(tag);
  if (cfg.image){
    const img = new Image(); img.crossOrigin = 'anonymous'; img.referrerPolicy = 'no-referrer';
    img.onload = () => { try { const t = new THREE.Texture(img); t.needsUpdate = true; screenMat.map = t; screenMat.needsUpdate = true; const col = petColors(img); if (col){ bodyMat.color.copy(col); glowMat.color.copy(col).offsetHSL(0, 0, .25); } } catch(e){} };
    img.src = viaProxy(cfg.image);
  }
  g.position.set(P.pos.x - Math.sin(P.yaw)*2.4 + Math.cos(P.yaw)*.9, P.pos.y, P.pos.z - Math.cos(P.yaw)*2.4 - Math.sin(P.yaw)*.9); scene.add(g);
  return { g, rig, legs, arms, head, screen, jet, vel:new V3(), say:null, sayT:0, nextSay:6 + Math.random()*8, trick:0, phase:0, cfg };
}
// walk cycle shared by your companion and other players' companions
function animatePet(o, speed, dt){
  const k = Math.min(1, speed/3.5);
  o.phase += dt*(4 + speed*2.2);
  const sw = Math.sin(o.phase)*.75*k;
  o.legs[0].rotation.x = sw; o.legs[1].rotation.x = -sw;
  o.arms[0].rotation.x = -sw*.8; o.arms[1].rotation.x = sw*.8;
  o.arms[0].rotation.z = -.15; o.arms[1].rotation.z = .15;
  const hop = o.trick > 0 ? Math.sin((1 - o.trick)*Math.PI)*.55 : 0;
  o.rig.position.y = Math.abs(Math.cos(o.phase))*.04*k + Math.sin(T*2)*.01*(1 - k) + hop;
  o.rig.rotation.x = .12*k;
  o.head.rotation.z = Math.sin(T*1.3 + o.phase*.1)*.06;
  o.jet.material.opacity = o.trick > 0 ? .9 : 0;
}
function summonPet(){
  removePet(); if (!petCfg || !(hubMode || state === 'play')) return;
  pet = buildPet(petCfg); decoratePet(pet, petCos(), pet.traits ? CLAN_COL[pet.traits.clan] : null);
  if (isNinja(petCfg) && !petCfg.traits && petCfg.uri && PROFILE_API){
    const n = { uri:petCfg.uri }; nftImage(n).then(() => { if (n.traits && petCfg){ petCfg.traits = n.traits; store.set('dy-companion', JSON.stringify(petCfg)); if (pet) summonPet(); } });
  }
}
function removePet(){ if (pet){ if (pet.say) scene.remove(pet.say); if (pet.stars) pet.stars.forEach(s => scene.remove(s.m)); scene.remove(pet.g); pet = null; } }
function petSay(text){
  if (!pet) return;
  if (pet.say) pet.g.remove(pet.say);
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,255,255,.92)'; g.beginPath(); g.roundRect(4, 6, 248, 44, 16); g.fill(); g.beginPath(); g.moveTo(110, 50); g.lineTo(128, 62); g.lineTo(134, 50); g.fill();
  g.fillStyle = '#1b1030'; g.font = '700 26px "Barlow Condensed", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 29);
  pet.say = new THREE.Sprite(new THREE.SpriteMaterial({ map:new THREE.CanvasTexture(c), transparent:true, depthWrite:false })); pet.say.scale.set(1.2, .3, 1); pet.say.position.y = pet.kind === 'ninja' ? 2.02 : 1.78; pet.g.add(pet.say); pet.sayT = 2.6;
}
function updatePet(dt){
  if (!pet) return;
  if (pet.kind === 'ninja'){ for (const t of pet.tails) t.rotation.x = .25 + Math.sin(T*6 + t.position.x*20)*.12 + Math.min(.5, Math.hypot(pet.vel.x, pet.vel.z)*.05); if (!hubMode && ninjaMove(dt)){ if (pet.say){ pet.sayT -= dt; if (pet.sayT <= 0){ pet.g.remove(pet.say); pet.say = null; } } return; } }
  const fwd = new V3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw)), right = new V3(Math.cos(P.yaw), 0, -Math.sin(P.yaw));
  const idle = !P.moving && hubMode;
  const want = idle ? P.pos.clone().addScaledVector(fwd, 2.4 + Math.sin(T*.5)*.3).addScaledVector(right, .8 + Math.sin(T*.35)*.4) : P.pos.clone().addScaledVector(right, 1.1).addScaledVector(fwd, hubMode ? .4 : -.6);
  const gp = pet.g.position, dx = want.x - gp.x, dz = want.z - gp.z, dist = Math.hypot(dx, dz);
  if (dist > 14){ gp.set(want.x, P.pos.y, want.z); pet.vel.set(0,0,0); }        // fell far behind: catch up instantly
  const spd = dist > .25 ? Math.min(10, dist*2.6) : 0;
  pet.vel.x += ((dist > .01 ? dx/dist*spd : 0) - pet.vel.x)*Math.min(1, dt*6); pet.vel.z += ((dist > .01 ? dz/dist*spd : 0) - pet.vel.z)*Math.min(1, dt*6);
  gp.x += pet.vel.x*dt; gp.z += pet.vel.z*dt;
  const ground = typeof groundAt === 'function' ? groundAt(gp.x, gp.z, P.pos.y + .3) : 0;
  gp.y += (ground - gp.y)*Math.min(1, dt*10);
  const v = Math.hypot(pet.vel.x, pet.vel.z);
  const look = v > .4 ? Math.atan2(pet.vel.x, pet.vel.z) : Math.atan2(P.pos.x - gp.x, P.pos.z - gp.z);
  pet.g.rotation.y = angleLerp(pet.g.rotation.y, look, Math.min(1, dt*8)) + (pet.trick > 0 ? dt*12 : 0);
  animatePet(pet, v, dt);
  if (pet.trick > 0) pet.trick = Math.max(0, pet.trick - dt*1.4);
  if (pet.say){ pet.sayT -= dt; pet.say.material.opacity = Math.min(1, pet.sayT*2); if (pet.sayT <= 0){ pet.g.remove(pet.say); pet.say = null; } }
  pet.nextSay -= dt;
  if (pet.nextSay <= 0){ pet.nextSay = 14 + Math.random()*16; if (hubMode) petSay((pet.kind === 'ninja' ? NINJA_LINES : PET_LINES)[Math.floor(Math.random()*(pet.kind === 'ninja' ? NINJA_LINES : PET_LINES).length)]); if (Math.random() < .5) pet.trick = 1; }
}
function petTrick(){ if (pet){ pet.trick = 1; if (pet.kind === 'ninja'){ pet.blade.visible = true; setTimeout(() => { if (pet) pet.blade.visible = false; }, 1400); } petSay(['wheee', 'gm!', 'LFG!', 'hi :)'][Math.floor(Math.random()*4)]); sfx.pickup(); } }
function setCompanion(n){
  petCfg = { mint:n.mint, name:String(n.name || 'Companion').slice(0, 24), symbol:String(n.symbol || '').slice(0, 10), image:n.image && /^https:\/\//.test(n.image) ? n.image : '', uri:n.uri || '', traits:n.traits || null, owner:x1Addr, at:Date.now() };
  store.set('dy-companion', JSON.stringify(petCfg));
  if (hubMode) summonPet();
  x1Msg = hubMode ? `${petCfg.name} is now your companion.` : `${petCfg.name} will join you in the Degen Market.`;
  toast(x1Msg, 3500); renderPhone();
}
function renderCompanionApp(body){
  const head = document.createElement('div'); head.className = 'phHead';
  head.append(phoneBtn('‹ Home', () => { phoneApp = 'home'; renderPhone(); }, 'phBack'), phoneLine('Companion', 'phTitle')); body.appendChild(head);
  if (!petCfg){
    body.appendChild(phoneLine('Turn one of your NFTs into a companion that follows you around the Degen Market.', 'phSmall'));
    body.appendChild(phoneLine('Open My NFTs, pick an NFT, and tap "Make companion". You need to verify wallet ownership first.', 'phSmall'));
    body.appendChild(phoneBtn('Open My NFTs', () => { galSel = null; phoneApp = 'gallery'; renderPhone(); if (isAddr(x1Addr) && !holder.checked && !holder.loading) fetchBalance(); }, 'phMain'));
    return;
  }
  const card = document.createElement('div'); card.className = 'phCard';
  card.append(phoneLine('Your companion', 'phSmall'), phoneLine(petCfg.name, 'phAddr'), phoneLine(hubMode ? (pet ? 'Hanging out with you now' : 'Resting') : 'Waiting for you in the Degen Market', 'phOk'));
  body.appendChild(card);
  if (hubMode && pet) body.appendChild(phoneBtn('Do a trick', () => { closeUI(); petTrick(); }, 'phMain'));
  body.appendChild(phoneBtn('Share on X', shareCompanion));
  body.appendChild(phoneLine('Your companion also fights beside you on every battle map: it zaps raiders it can see and spots the nearest one on your minimap.', 'phSmall'));
  body.appendChild(phoneBtn('Choose a different NFT', () => { galSel = null; phoneApp = 'gallery'; renderPhone(); if (isAddr(x1Addr) && !holder.checked && !holder.loading) fetchBalance(); }));
  body.appendChild(phoneBtn('Dismiss companion', () => { removePet(); petCfg = null; store.set('dy-companion', ''); x1Msg = ''; renderPhone(); }, 'phGhost'));
}

function updateHub(dt){
  updatePet(dt);
  for (const a of avatars.values()){
    if (a.emoteT > 0){ a.emoteT -= dt; a.emoteSpr.position.y = 2.75 + Math.sin(T*6)*.05; if (a.emoteT <= 0){ a.g.remove(a.emoteSpr); a.emoteSpr = null; } }
    if (a.danceT > 0){ a.danceT -= dt; a.tyaw += dt*6; }
    if (a.pet){ const pg = a.pet.g, ry = a.yaw, tx = a.pos.x + Math.cos(ry)*1.1 - Math.sin(ry)*.4, tz = a.pos.z - Math.sin(ry)*1.1 - Math.cos(ry)*.4;
      const ox = pg.position.x, oz = pg.position.z;
      pg.position.x += (tx - ox)*Math.min(1, dt*3); pg.position.z += (tz - oz)*Math.min(1, dt*3); pg.position.y = a.pos.y;
      const pv = Math.hypot(pg.position.x - ox, pg.position.z - oz)/Math.max(dt, 1e-3);
      pg.rotation.y = angleLerp(pg.rotation.y, pv > .4 ? Math.atan2(pg.position.x - ox, pg.position.z - oz) : ry, Math.min(1, dt*6)); animatePet(a.pet, pv, dt); }
    const before = a.pos.clone(); a.pos.lerp(a.target, Math.min(1, dt*8)); a.g.position.copy(a.pos);
    a.yaw = angleLerp(a.yaw, a.tyaw + Math.PI, Math.min(1, dt*10)); a.g.rotation.y = a.yaw;
    a.spd += ((a.pos.distanceTo(before)/Math.max(dt,1e-3)) - a.spd)*Math.min(1, dt*6);
    if (a.mixer){ const run = Math.min(1, Math.max(0, (a.spd - 6)/2)), walk = Math.min(1, a.spd/1.5)*(1 - run);
      a.acts.Idle.setEffectiveWeight(1 - walk - run); a.acts.Walk.setEffectiveWeight(walk); a.acts.Run.setEffectiveWeight(run); a.mixer.update(dt); if (a.opSync) a.opSync(); }
  }
  if (hubCrystal){ hubCrystal.rotation.y += dt*.8; hubCrystal.position.y = 3.4 + Math.sin(T*1.5)*.15; }
  presT -= dt;
  if (net.plaza && presT <= 0){ presT = .1; net.plaza.presence({ x:+P.pos.x.toFixed(2), y:+P.pos.y.toFixed(2), z:+P.pos.z.toFixed(2), yaw:+P.yaw.toFixed(3), name:callsign(), col:myColor, x1:x1Verified, title:holderTitle(), pet:pet && petCfg ? { name:petCfg.name, mint:petCfg.mint, image:petCfg.image, traits:petCfg.traits || null, cos:petCos() } : null, tag:tagStyleOwned(), emote:myEmote, op:opMine() }).catch(() => {}); }
  $('chatHint').textContent = padActive ? 'Triangle opens your phone, D-pad for emotes, Square at the trade board opens the NFT market' : isTouch ? 'Use the Phone, Chat and Trade buttons' : 'Enter to chat, Q for your phone, 1 to 4 for emotes, E or click at the trade board to trade';
  $('phoneKey').textContent = padActive ? 'Triangle' : 'Q';
  const near = (hubBoard && P.pos.distanceTo(hubBoard) < 5) || HUB_STALLS.some(s => Math.hypot(s.x - P.pos.x, s.z - P.pos.z) < 3.8);
  $('hubPrompt').hidden = !near || uiOpen;
  if (near) $('hubPrompt').textContent = padActive ? 'Press Square to open the NFT market' : isTouch ? 'Tap Trade to open the NFT market' : 'Click or press E to open the NFT market';
}
async function startHub(){
  hubMode = true; setMap('hub'); initAudio(); resetGame();
  document.body.classList.add('hub'); state = 'play'; show(null); $('hud').hidden = false; $('touch').hidden = !isTouch; $('chatBox').hidden = false;
  if (!padClicking && !padActive) requestLock();
  toast(isTouch ? 'Welcome to the Degen Market. Use the Chat and Trade buttons.' : 'Welcome to the Degen Market. Press Enter to chat, E at a stall or the trade board to trade.', 5000);
  $('plazaCount').textContent = 'Connecting to the market...';
  summonPet(); if (pet) setTimeout(() => petSay('gm!'), 1500); showTrophies(); setTimeout(() => loadNftListings(), 800);
  try {
    if (!net.room && window.claude && window.claude.use) net.room = await window.claude.use('room');
    if (!net.db && window.claude && window.claude.use) net.db = await window.claude.use('db');
  } catch(e){}
  if (!hubMode) return;
  if (net.room){
    try { net.plaza = await net.room.join('degen-market'); net.plazaUnsub = net.plaza.onPeers(onPlazaPeers, () => {}); }
    catch(e){ net.plaza = null; $('plazaCount').textContent = 'Live players are unavailable here'; }
  } else $('plazaCount').textContent = 'Live players are unavailable here';
  drawBoard();
  if (net.db){
    try { net.chatUnsub = net.db.collection('chat').orderBy('t','desc').limit(40).onSnapshot(renderChat, () => { $('chatLog').textContent = 'Chat is unavailable right now.'; }); } catch(e){}
    try { net.marketUnsub = net.db.collection('market').orderBy('t','desc').limit(60).onSnapshot(renderMarket, () => {}); } catch(e){}
  } else $('chatLog').textContent = 'Chat is unavailable in this view.';
}
function leaveHub(){
  if (!hubMode) return;
  removePet(); if (trophyGroup){ scene.remove(trophyGroup); trophyGroup = null; }
  hubMode = false; document.body.classList.remove('hub'); $('chatBox').hidden = true; closeUI(true);
  if (net.plazaUnsub) net.plazaUnsub(); if (net.plaza) net.plaza.leave().catch(() => {}); net.plaza = null;
  if (net.chatUnsub) net.chatUnsub(); if (net.marketUnsub) net.marketUnsub(); net.chatUnsub = net.marketUnsub = null;
  for (const id of [...avatars.keys()]) removeAvatar(id);
}
function renderChat(snap){
  const log = $('chatLog'); log.innerHTML = '';
  const docs = snap.docs.filter(d => d.exists).map(d => d.data()).reverse();
  if (!docs.length){ log.textContent = 'No messages yet. Press Enter to say hi.'; return; }
  for (const m of docs.slice(-14)){
    const row = document.createElement('div'); const n = document.createElement('b'); n.textContent = String(m.name || 'Degen').slice(0,16) + ': ';
    const t = document.createElement('span'); t.textContent = String(m.text || '').slice(0,160); row.append(n, t); log.appendChild(row);
  }
  log.scrollTop = log.scrollHeight;
}
function openUI(){ uiOpen = true; for (const k in keys) keys[k] = false; firing = false; if (document.pointerLockElement) document.exitPointerLock(); }
function closeUI(noLock){
  uiOpen = false; $('chatInput').blur(); $('chatEntry').hidden = true; $('marketPanel').hidden = true; $('phone').hidden = true; $('phone').classList.remove('phWide');
  if ($('account') && !$('account').hidden) renderAccount();
  if (!noLock && state === 'play' && !isTouch && !padClicking && !padActive) requestLock();
}
function openChat(){ if (!hubMode) return; openUI(); $('chatEntry').hidden = false; $('chatInput').value = ''; setTimeout(() => $('chatInput').focus(), 0); }
async function sendChat(){
  const text = $('chatInput').value.trim().slice(0,160);
  closeUI();
  if (!text) return;
  if (!net.db){ toast('Chat is unavailable in this view.', 2500); return; }
  try { await net.db.collection('chat').doc().set({ name:callsign(), text, t:Date.now(), col:myColor }); }
  catch(e){ toast("Your message couldn't be sent. Chatting needs contributor access to this page.", 4000); }
}
function renderMarket(snap){
  myListings = snap.docs.filter(d => d.exists).map(d => ({ id:d.id, ...d.data() }));
  if (!$('marketPanel').hidden && mkView !== 'sell' && mkView !== 'nftsell' && mkView !== 'nftbuy') drawMarket();
  drawBoard();
}
function ago(t){ const s = Math.max(0, (Date.now() - t)/1000); return s < 90 ? 'just now' : s < 5400 ? Math.round(s/60) + ' min ago' : s < 129600 ? Math.round(s/3600) + ' h ago' : Math.round(s/86400) + ' days ago'; }
