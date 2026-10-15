/* ---------- Renderer & scenes ---------- */
const renderer = new THREE.WebGLRenderer({ antialias:true, powerPreference:'high-performance' });
const CFG_DEFAULT = { sens:1, adsSens:.9, padSens:1, fov:75, quality:isTouch ? 'low' : 'medium', vol:1, fps:false, aimAssist:true, auto:true, view:'fp', raiders:'map' };
let cfg = Object.assign({}, CFG_DEFAULT);
try { cfg = Object.assign(cfg, JSON.parse(store.get('dustyard-settings') || '{}') || {}); } catch(e){}
// Low: phones. Medium: most laptops. High adds contact shadows (ambient occlusion) and sharper shadows.
const QUALITY = {
  low:{ pr:.75, shadows:false, shadowSize:512, post:false, dust:false, haze:.6 },
  medium:{ pr:1, shadows:true, shadowSize:1024, post:true, dust:true, bloomScale:.35, haze:1 },
  high:{ pr:1.5, shadows:true, shadowSize:2048, post:true, dust:true, bloomScale:.5, haze:1, ao:true }
};
let drs = 1, drsT = 0;   // dynamic resolution: drops a little when the frame rate dips
const qPR = () => Math.min(window.devicePixelRatio || 1, QUALITY[cfg.quality].pr)*drs;
renderer.setPixelRatio(qPR());
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false; let shadowTick = 0;
renderer.autoClear = false;
$('game').appendChild(renderer.domElement);
const cv = renderer.domElement;

/* ---------- Atmosphere in every material ---------- */
// three.js fog, extended: distance fog, plus haze that hangs low over the ground, plus a warm glow
// when looking toward the sun (light scattering in the dust). Night maps have a dark fog color,
// which turns the sun glow off by itself.
const FOG_SUN = new THREE.Vector3(50, 22, 35).normalize();   // same direction as the sun below
THREE.ShaderChunk.fog_pars_vertex = '#ifdef USE_FOG\n varying float fogDepth; varying vec3 vFogRay;\n#endif';
THREE.ShaderChunk.fog_vertex = '#ifdef USE_FOG\n fogDepth = - mvPosition.z;\n vFogRay = vec3(dot(viewMatrix[0].xyz, mvPosition.xyz), dot(viewMatrix[1].xyz, mvPosition.xyz), dot(viewMatrix[2].xyz, mvPosition.xyz));\n#endif';
THREE.ShaderChunk.fog_pars_fragment = ['#ifdef USE_FOG',
  ' uniform vec3 fogColor; varying float fogDepth; varying vec3 vFogRay;',
  ' #ifdef FOG_EXP2', ' uniform float fogDensity;', ' #else', ' uniform float fogNear; uniform float fogFar;', ' #endif',
  '#endif'].join('\n');
const fogFragment = haze => ['#ifdef USE_FOG',
  ' #ifdef FOG_EXP2', '  float fogFactor = 1.0 - exp( - fogDensity * fogDensity * fogDepth * fogDepth );',
  ' #else', '  float fogFactor = smoothstep( fogNear, fogFar, fogDepth );', ' #endif',
  ' float fogDist = length(vFogRay), fogY = cameraPosition.y + vFogRay.y;',
  ` float fogHaze = ${haze.toFixed(3)} * exp(-max(fogY, 0.0) * 0.16) * (1.0 - exp(-fogDist * 0.028));`,
  ' fogFactor = clamp(fogFactor + fogHaze * (1.0 - fogFactor), 0.0, 1.0);',
  ' float fogLum = dot(fogColor, vec3(0.299, 0.587, 0.114));',
  ` float fogSun = pow(max(dot(vFogRay / max(fogDist, 0.001), vec3(${FOG_SUN.x.toFixed(4)}, ${FOG_SUN.y.toFixed(4)}, ${FOG_SUN.z.toFixed(4)})), 0.0), 5.0) * smoothstep(0.2, 0.5, fogLum);`,
  ' gl_FragColor.rgb = mix( gl_FragColor.rgb, mix(fogColor, vec3(1.0, 0.84, 0.6), fogSun * 0.6), fogFactor );',
  '#endif'].join('\n');
THREE.ShaderChunk.fog_fragment = fogFragment(.32);
let fogHazeNow = .32;
/** change the haze amount; every material is rebuilt, so only call this on a quality or map change */
function setHaze(h){
  if (Math.abs(h - fogHazeNow) < .001) return; fogHazeNow = h;
  THREE.ShaderChunk.fog_fragment = fogFragment(h);
  scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.needsUpdate = true; }); });
}

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xd9a982, 38, 150);
const camera = new THREE.PerspectiveCamera(75, innerWidth/innerHeight, 0.05, 600);
camera.rotation.order = 'YXZ';
scene.add(camera);

const gunScene = new THREE.Scene();
const gunCam = new THREE.PerspectiveCamera(62, innerWidth/innerHeight, 0.01, 10);
gunScene.add(gunCam);
gunScene.add(new THREE.HemisphereLight(0xf6dcb8, 0x4a3e36, 0.9));
const gl2 = new THREE.DirectionalLight(0xffd6a8, 0.65); gl2.position.set(2, 3, 1); gunScene.add(gl2);

/* ---------- Sky ---------- */
const sunDir = new V3(50, 22, 35).normalize();
const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top:{value:new THREE.Color(0x3c4270)}, mid:{value:new THREE.Color(0xe59a68)}, bot:{value:new THREE.Color(0xd9a982)}, sun:{value:sunDir} },
  vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 bot; uniform vec3 sun; varying vec3 vP; void main(){ float h=vP.y; vec3 c = h>0.0 ? mix(mid, top, pow(clamp(h*1.5,0.0,1.0),0.65)) : bot; float s=max(dot(vP,sun),0.0); c += vec3(1.0,0.82,0.55)*(pow(s,350.0)*1.2 + pow(s,9.0)*0.22); gl_FragColor=vec4(c,1.0); }'
}));
scene.add(sky);
try {
  const eq = document.createElement('canvas'); eq.width = 256; eq.height = 128; const eg = eq.getContext('2d');
  const gr = eg.createLinearGradient(0,0,0,128); gr.addColorStop(0,'#3c4270'); gr.addColorStop(.42,'#c98a66'); gr.addColorStop(.5,'#e59a68'); gr.addColorStop(.52,'#b89670'); gr.addColorStop(1,'#6d5a45');
  eg.fillStyle = gr; eg.fillRect(0,0,256,128);
  const sg = eg.createRadialGradient(40,52,0,40,52,40); sg.addColorStop(0,'rgba(255,230,180,1)'); sg.addColorStop(1,'rgba(255,200,140,0)'); eg.fillStyle = sg; eg.fillRect(0,0,256,128);
  const et = new THREE.CanvasTexture(eq); et.mapping = THREE.EquirectangularReflectionMapping;
  const pm = new THREE.PMREMGenerator(renderer); const envRT = pm.fromEquirectangular(et);
  scene.environment = envRT.texture; gunScene.environment = envRT.texture; pm.dispose(); et.dispose();
} catch(e){}

/* ---------- Lights ---------- */
scene.add(new THREE.HemisphereLight(0xf6dcb8, 0x5a4a3c, 0.34));
const sun = new THREE.DirectionalLight(0xffcf9a, 1.3);
sun.position.copy(sunDir).multiplyScalar(80);
sun.castShadow = true;
sun.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left:-62, right:62, top:62, bottom:-62, near:1, far:220 });
sun.shadow.bias = -0.0006;
scene.add(sun); scene.add(sun.target);
const muzzleLight = new THREE.PointLight(0xffb060, 0, 9);
muzzleLight.position.set(0.2, -0.1, -0.9);
camera.add(muzzleLight);

/* ---------- Textures ---------- */
function canvasTex(w, h, draw, rep){
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (rep) t.repeat.set(rep[0], rep[1]);
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}
function speckle(g, w, h, n, dark, light){
  for (let i=0;i<n;i++){
    g.fillStyle = Math.random()<0.5 ? `rgba(${dark},${Math.random()*0.2})` : `rgba(${light},${Math.random()*0.18})`;
    const s = Math.random()*3+1; g.fillRect(Math.random()*w, Math.random()*h, s, s);
  }
}
const groundTex = canvasTex(512,512,(g,w,h)=>{
  g.fillStyle='#c6a97f'; g.fillRect(0,0,w,h);
  // soft drifts, wrapped so the tile repeats without seams
  for (let i=0;i<70;i++){ const x=Math.random()*w, y=Math.random()*h, r=20+Math.random()*60, dark=Math.random()<.5;
    for (const ox of [-w,0,w]) for (const oy of [-h,0,h]){ const gr=g.createRadialGradient(x+ox,y+oy,0,x+ox,y+oy,r); gr.addColorStop(0,dark?'rgba(120,92,62,.10)':'rgba(240,222,188,.10)'); gr.addColorStop(1,'rgba(0,0,0,0)'); g.fillStyle=gr; g.fillRect(x+ox-r,y+oy-r,r*2,r*2); } }
  speckle(g,w,h,16000,'105,80,55','245,225,190');
  // pebbles with a lit top and a shadow underneath
  for (let i=0;i<260;i++){ const x=Math.random()*w, y=Math.random()*h, r=1+Math.random()*2.2;
    g.fillStyle='rgba(70,55,40,.45)'; g.beginPath(); g.ellipse(x+.8,y+1,r,r*.75,0,0,6.3); g.fill();
    g.fillStyle=`rgba(${150+Math.random()*60|0},${125+Math.random()*50|0},${95+Math.random()*40|0},.9)`; g.beginPath(); g.ellipse(x,y,r,r*.75,0,0,6.3); g.fill(); }
}, [28,28]);
// large patches of darker and lighter ground, so the repeated sand tile isn't noticeable from a distance
const groundMacro = canvasTex(128,128,(g,w,h)=>{
  g.fillStyle='rgb(128,128,128)'; g.fillRect(0,0,w,h);
  for (let i=0;i<40;i++){ const x=Math.random()*w, y=Math.random()*h, r=8+Math.random()*30, v=Math.random()<.5?60:200;
    for (const ox of [-w,0,w]) for (const oy of [-h,0,h]){ const gr=g.createRadialGradient(x+ox,y+oy,0,x+ox,y+oy,r); gr.addColorStop(0,`rgba(${v},${v},${v},.35)`); gr.addColorStop(1,`rgba(${v},${v},${v},0)`); g.fillStyle=gr; g.fillRect(x+ox-r,y+oy-r,r*2,r*2); } }
});
const concreteTex = canvasTex(256,128,(g,w,h)=>{ g.fillStyle='#a69c8b'; g.fillRect(0,0,w,h); speckle(g,w,h,3000,'70,64,56','220,210,190');
  g.fillStyle='rgba(60,52,44,.35)'; for(let x=0;x<w;x+=64) g.fillRect(x,0,2,h); g.fillRect(0,h-10,w,10); }, [12,1]);
function containerTex(base){
  return canvasTex(256,128,(g,w,h)=>{
    g.fillStyle=base; g.fillRect(0,0,w,h);
    for (let x=0;x<w;x+=10){ g.fillStyle='rgba(0,0,0,.2)'; g.fillRect(x,0,3,h); g.fillStyle='rgba(255,255,255,.07)'; g.fillRect(x+4,0,2,h); }
    for (let i=0;i<350;i++){ g.fillStyle=`rgba(95,52,25,${Math.random()*.3})`; g.fillRect(Math.random()*w,Math.random()*h,Math.random()*7+1,Math.random()*3+1); }
    g.fillStyle='rgba(0,0,0,.3)'; g.fillRect(0,0,w,5); g.fillRect(0,h-5,w,5); g.fillRect(0,0,5,h); g.fillRect(w-5,0,5,h);
  });
}
const crateTex = canvasTex(128,128,(g,w,h)=>{
  g.fillStyle='#8d6b44'; g.fillRect(0,0,w,h);
  g.fillStyle='rgba(50,32,15,.35)'; for(let y=0;y<h;y+=21) g.fillRect(0,y,w,2);
  g.strokeStyle='#5e4428'; g.lineWidth=10; g.strokeRect(5,5,w-10,h-10);
  g.beginPath(); g.moveTo(8,8); g.lineTo(w-8,h-8); g.moveTo(w-8,8); g.lineTo(8,h-8); g.stroke();
  speckle(g,w,h,600,'40,25,10','200,160,110');
});
const flashTex = canvasTex(64,64,(g,w,h)=>{
  const gr = g.createRadialGradient(32,32,0,32,32,32);
  gr.addColorStop(0,'rgba(255,250,220,1)'); gr.addColorStop(.25,'rgba(255,190,90,.9)'); gr.addColorStop(1,'rgba(255,120,30,0)');
  g.fillStyle=gr; g.fillRect(0,0,w,h);
});

/* ---------- Normal maps ----------
   The albedo textures paint their relief (ribs, grooves, ripples); these height-derived normal
   maps make the sun actually rake across it. Heights are drawn in greyscale (mid-grey = flat),
   converted with a wrap-around Sobel so tiles stay seamless. */
function normalTex(w, h, drawHeight, strength, rep){
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
  drawHeight(g, w, h);
  const src = g.getImageData(0, 0, w, h).data;
  const out = g.createImageData(w, h), d = out.data;
  const hv = (x, y) => src[((((y % h) + h) % h)*w + (((x % w) + w) % w))*4]/255;
  for (let y=0;y<h;y++) for (let x=0;x<w;x++){
    const dx = (hv(x - 1, y) - hv(x + 1, y))*strength, dy = (hv(x, y + 1) - hv(x, y - 1))*strength;
    const inv = 1/Math.hypot(dx, dy, 1), i = (y*w + x)*4;
    d[i] = (dx*inv*.5 + .5)*255; d[i+1] = (dy*inv*.5 + .5)*255; d[i+2] = (inv*.5 + .5)*255; d[i+3] = 255;
  }
  g.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (rep) t.repeat.set(rep[0], rep[1]);
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}
const colGrey = v => { const b = Math.max(0, Math.min(255, Math.round(v))); return `rgb(${b},${b},${b})`; };
// sand: wind ripples warped by larger drifts, plus grain and pebble bumps
const groundNorm = normalTex(256,256,(g,w,h)=>{
  for (let y=0;y<h;y++){
    const warp = Math.sin(y*.045)*9 + Math.sin(y*.013 + 2)*16;
    for (let x=0;x<w;x+=2){
      const v = 128 + 42*Math.sin((x + warp + Math.sin(x*.05 + y*.02)*6)*2*Math.PI/34);
      g.fillStyle = colGrey(v); g.fillRect(x, y, 2, 1);
    }
  }
  for (let i=0;i<2600;i++){ g.fillStyle = colGrey(128 + (Math.random() - .5)*70); const s = Math.random()*2 + 1; g.fillRect(Math.random()*w, Math.random()*h, s, s); }
  for (let i=0;i<130;i++){ const x = Math.random()*w, y = Math.random()*h, r = 1 + Math.random()*2.2;
    const gr = g.createRadialGradient(x, y, 0, x, y, r*1.4); gr.addColorStop(0, 'rgba(230,230,230,.9)'); gr.addColorStop(1, 'rgba(128,128,128,0)');
    g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, r*1.4, r, 0, 0, 6.3); g.fill(); }
}, 2.0, [120,120]);
// container walls: ribs every 10px, aligned with containerTex's painted shading, raised frame
const containerNorm = normalTex(256,128,(g,w,h)=>{
  for (let x=0;x<w;x++){ g.fillStyle = colGrey(128 + 96*Math.sin(2*Math.PI*x/10 - .3*Math.PI)); g.fillRect(x, 0, 1, h); }
  g.fillStyle = '#c8c8c8'; g.fillRect(0, 0, w, 5); g.fillRect(0, h - 5, w, 5); g.fillRect(0, 0, 5, h); g.fillRect(w - 5, 0, 5, h);
}, 2.6);
// corrugated sheet: 16px period, aligned with sheetTex's gradient (bright at ~45%)
const sheetNorm = normalTex(256,256,(g,w,h)=>{
  for (let x=0;x<w;x++){ g.fillStyle = colGrey(128 + 96*Math.sin(2*Math.PI*x/16 - .375*Math.PI)); g.fillRect(x, 0, 1, h); }
}, 2.6);
// concrete: panel grooves every 64px plus surface noise
const concreteNorm = normalTex(256,128,(g,w,h)=>{
  for (let i=0;i<1400;i++){ g.fillStyle = colGrey(128 + (Math.random() - .5)*46); const s = Math.random()*3 + 1; g.fillRect(Math.random()*w, Math.random()*h, s, s); }
  g.fillStyle = '#3c3c3c'; for (let x=0;x<w;x+=64) g.fillRect(x, 0, 2, h);
  g.fillStyle = '#5a5a5a'; g.fillRect(0, h - 10, w, 2);
}, 2.2, [12,1]);
// crate: plank grooves, raised frame and cross braces
const crateNorm = normalTex(128,128,(g,w,h)=>{
  g.fillStyle = '#4a4a4a'; for (let y=0;y<h;y+=21) g.fillRect(0, y, w, 2);
  g.strokeStyle = '#b4b4b4'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
  g.beginPath(); g.moveTo(8, 8); g.lineTo(w - 8, h - 8); g.moveTo(w - 8, 8); g.lineTo(8, h - 8); g.stroke();
  for (let i=0;i<300;i++){ g.fillStyle = colGrey(128 + (Math.random() - .5)*36); g.fillRect(Math.random()*w, Math.random()*h, 2, 2); }
}, 2.0);

