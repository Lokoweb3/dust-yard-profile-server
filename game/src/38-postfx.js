/* ---------- Post-processing: bloom + colour grade + grain ---------- */
let composer = null, gunPass = null, gradePass = null, bloomPass = null, aoPass = null, fxaaPass = null, postMode = '';
// Color grade per map: exposure for the film curve, saturation, contrast, and tints pushed into the
// shadows (lift) and the highlights (gain). The yard is warm with cool shadows; Neon is cold and punchy.
const GRADES = {
  yard:{ exposure:.82, sat:1.1, contrast:1.08, lift:[-.035, .002, .04], gain:[.03, .01, -.035] },
  neon:{ exposure:1.15, sat:1.2, contrast:1.08, lift:[.01, -.012, .045], gain:[.02, -.01, .03] },
  hub:{ exposure:.9, sat:1.06, contrast:1.05, lift:[-.02, 0, .03], gain:[.025, .01, -.02] },
  jungle:{ exposure:.95, sat:1.04, contrast:1.1, lift:[-.025, .008, .005], gain:[-.02, .015, -.005] }
};
let gradeNow = GRADES.yard;
const GradeShader = {
  uniforms: { tDiffuse:{ value:null }, time:{ value:0 }, vign:{ value:1 }, ca:{ value:.0018 }, res:{ value:new THREE.Vector2(innerWidth, innerHeight) }, hurt:{ value:0 }, rage:{ value:0 },
    exposure:{ value:1 }, sat:{ value:1 }, contrast:{ value:1 }, lift:{ value:new THREE.Vector3() }, gain:{ value:new THREE.Vector3() } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: [
    'uniform sampler2D tDiffuse; uniform float time; uniform float vign; uniform float ca; uniform vec2 res; uniform float hurt;',
    'uniform float exposure; uniform float sat; uniform float contrast; uniform vec3 lift; uniform vec3 gain; uniform float rage; varying vec2 vUv;',
    'float rnd(vec2 co){ return fract(sin(dot(co, vec2(12.9898,78.233))) * 43758.5453); }',
    'void main(){',
    '  vec2 d = vUv - 0.5; float r2 = dot(d,d);',
    '  vec2 off = d * (ca + hurt*0.02) * r2 * 4.0;',   // color fringing only toward the edges
    '  vec3 col = max(vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b), 0.0);',
    // film curve (ACES): deeper shadows, richer midtones, bright light rolls off instead of clipping
    '  vec3 x = pow(col, vec3(2.2)) * exposure;',
    '  x = (x*(2.51*x + 0.03)) / (x*(2.43*x + 0.59) + 0.14);',
    '  col = pow(clamp(x, 0.0, 1.0), vec3(1.0/2.2));',
    '  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));',
    '  col = mix(vec3(l), col, sat * (1.0 - hurt*0.6));',
    '  col = (col - 0.5) * contrast + 0.5;',
    '  col += lift * (1.0 - l) + gain * l;',
    '  col = mix(col, col * vec3(1.3, 0.78, 0.72), rage * 0.55);',   // berserker: the world runs red at the edges
    '  col = mix(col, vec3(0.45, 0.02, 0.0), rage * smoothstep(0.08, 0.5, r2) * 0.6);',
    '  col *= 1.0 - vign * r2 * 1.4;',
    '  col += (rnd(vUv * res + fract(time)) - 0.5) * 0.03;',
    '  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);',
    '}'
  ].join('\n')
};
function applyGrade(){
  if (!gradePass) return; const U = gradePass.uniforms, G = gradeNow;
  U.exposure.value = G.exposure; U.sat.value = G.sat; U.contrast.value = G.contrast; U.lift.value.fromArray(G.lift); U.gain.value.fromArray(G.gain);
}

/* Contact shadows (ambient occlusion, High quality only): darkens creases, corners and the ground under
   objects, worked out from the depth of the rendered frame at half resolution, then blurred. */
const AO_SAMPLES = 12;
class AOPass extends THREE.Pass {
  constructor(){
    super();
    const opt = { minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter, format:THREE.RGBAFormat };
    this.rtA = new THREE.WebGLRenderTarget(2, 2, opt); this.rtB = new THREE.WebGLRenderTarget(2, 2, opt);
    const vs = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
    this.aoMat = new THREE.ShaderMaterial({ depthTest:false, depthWrite:false,
      uniforms:{ tDepth:{ value:null }, projInv:{ value:new THREE.Matrix4() }, proj:{ value:new THREE.Matrix4() }, texel:{ value:new THREE.Vector2() }, radius:{ value:1.5 }, strength:{ value:2.0 } },
      vertexShader:vs, fragmentShader:[
        'uniform sampler2D tDepth; uniform mat4 projInv; uniform mat4 proj; uniform vec2 texel; uniform float radius; uniform float strength; varying vec2 vUv;',
        'vec3 viewPos(vec2 uv){ float d = texture2D(tDepth, uv).x; vec4 v = projInv * vec4(uv*2.0 - 1.0, d*2.0 - 1.0, 1.0); return v.xyz / v.w; }',
        'void main(){',
        '  float d = texture2D(tDepth, vUv).x; if (d >= 0.99999){ gl_FragColor = vec4(1.0); return; }',
        '  vec3 p = viewPos(vUv);',
        // surface direction from the neighbours, using the closer one on each axis so edges stay clean
        '  vec3 px1 = viewPos(vUv + vec2(texel.x, 0.0)) - p, px2 = p - viewPos(vUv - vec2(texel.x, 0.0));',
        '  vec3 py1 = viewPos(vUv + vec2(0.0, texel.y)) - p, py2 = p - viewPos(vUv - vec2(0.0, texel.y));',
        '  vec3 dx = abs(px1.z) < abs(px2.z) ? px1 : px2, dy = abs(py1.z) < abs(py2.z) ? py1 : py2;',
        '  vec3 n = normalize(cross(dx, dy));',
        '  vec2 rad = vec2(proj[0][0], proj[1][1]) * radius / -p.z * 0.5;',
        '  float spin = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453) * 6.2832;',
        '  float occ = 0.0;',
        '  for (int i = 0; i < ' + AO_SAMPLES + '; i++){',
        '    float t = (float(i) + 0.5) / ' + AO_SAMPLES + '.0, a = float(i) * 2.3998 + spin;',
        '    vec3 v = viewPos(vUv + vec2(cos(a), sin(a)) * rad * t) - p;',
        '    float vv = dot(v, v);',
        '    occ += max(dot(v, n) - 0.02 * -p.z * 0.05, 0.0) / (vv + 0.02) * (1.0 - smoothstep(radius*radius, radius*radius*4.0, vv));',
        '  }',
        '  float ao = clamp(1.0 - strength * occ / ' + AO_SAMPLES + '.0 * radius, 0.0, 1.0);',
        '  ao = mix(ao, 1.0, smoothstep(40.0, 80.0, -p.z));',     // fade out in the distance
        '  gl_FragColor = vec4(ao, ao, ao, 1.0);',
        '}'].join('\n') });
    this.blurMat = new THREE.ShaderMaterial({ depthTest:false, depthWrite:false,
      uniforms:{ tAO:{ value:null }, dir:{ value:new THREE.Vector2() } }, vertexShader:vs,
      fragmentShader:'uniform sampler2D tAO; uniform vec2 dir; varying vec2 vUv; void main(){ float s = 0.0; for (int i = -3; i <= 3; i++) s += texture2D(tAO, vUv + dir*float(i)).r; s /= 7.0; gl_FragColor = vec4(s, s, s, 1.0); }' });
    this.compMat = new THREE.ShaderMaterial({ depthTest:false, depthWrite:false,
      uniforms:{ tDiffuse:{ value:null }, tAO:{ value:null }, amount:{ value:.7 } }, vertexShader:vs,
      fragmentShader:'uniform sampler2D tDiffuse; uniform sampler2D tAO; uniform float amount; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); c.rgb *= mix(1.0, texture2D(tAO, vUv).r, amount); gl_FragColor = c; }' });
    this.quad = new THREE.FullScreenQuad(null);
  }
  setSize(w, h){ const hw = Math.max(2, Math.round(w/2)), hh = Math.max(2, Math.round(h/2)); this.rtA.setSize(hw, hh); this.rtB.setSize(hw, hh); this.aoMat.uniforms.texel.value.set(1/w, 1/h); this.hw = hw; this.hh = hh; }
  render(r, writeBuffer, readBuffer){
    const U = this.aoMat.uniforms;
    U.tDepth.value = readBuffer.depthTexture; U.proj.value.copy(camera.projectionMatrix); U.projInv.value.copy(camera.projectionMatrixInverse);
    this.quad.material = this.aoMat; r.setRenderTarget(this.rtA); this.quad.render(r);
    this.quad.material = this.blurMat;
    this.blurMat.uniforms.tAO.value = this.rtA.texture; this.blurMat.uniforms.dir.value.set(1/this.hw, 0); r.setRenderTarget(this.rtB); this.quad.render(r);
    this.blurMat.uniforms.tAO.value = this.rtB.texture; this.blurMat.uniforms.dir.value.set(0, 1/this.hh); r.setRenderTarget(this.rtA); this.quad.render(r);
    this.compMat.uniforms.tDiffuse.value = readBuffer.texture; this.compMat.uniforms.tAO.value = this.rtA.texture;
    this.quad.material = this.compMat; r.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.quad.render(r);
  }
  dispose(){ this.rtA.dispose(); this.rtB.dispose(); }
}

// Effects chain: scene → contact shadows (High) → weapon → bloom → film curve and grade → smoothing (High).
// The frame is kept in high range (half-float) where the device allows, so bright light isn't clipped.
function setupPost(){
  const Q = QUALITY[cfg.quality], mode = !Q.post ? 'off' : Q.ao ? 'ao' : 'msaa';
  if (mode === postMode) return; postMode = mode;
  if (composer){ composer.renderTarget1.dispose(); composer.renderTarget2.dispose(); if (aoPass) aoPass.dispose(); }
  composer = gunPass = gradePass = bloomPass = aoPass = fxaaPass = null;
  if (mode === 'off' || !THREE.EffectComposer || !THREE.RenderPass || !THREE.UnrealBloomPass || !THREE.ShaderPass) return;
  try {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2()), isGL2 = renderer.capabilities.isWebGL2;
    const hdr = isGL2 && renderer.extensions.has('EXT_color_buffer_float');
    const opt = { format:THREE.RGBAFormat, type:hdr ? THREE.HalfFloatType : THREE.UnsignedByteType };
    let rt;
    if (mode === 'ao' && (isGL2 || renderer.extensions.has('WEBGL_depth_texture'))){
      rt = new THREE.WebGLRenderTarget(size.x, size.y, opt);
      rt.depthTexture = new THREE.DepthTexture(size.x, size.y); rt.depthTexture.type = THREE.UnsignedIntType;
    } else if (isGL2 && THREE.WebGLMultisampleRenderTarget){
      rt = new THREE.WebGLMultisampleRenderTarget(size.x, size.y, opt); rt.samples = isTouch ? 2 : 4;
    } else rt = new THREE.WebGLRenderTarget(size.x, size.y, opt);
    composer = new THREE.EffectComposer(renderer, rt);
    composer.addPass(new THREE.RenderPass(scene, camera));
    if (rt.depthTexture){ aoPass = new AOPass(); composer.addPass(aoPass); }
    gunPass = new THREE.RenderPass(gunScene, gunCam); gunPass.clear = false; gunPass.clearDepth = true;
    composer.addPass(gunPass);
    bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(innerWidth/2, innerHeight/2), currentMap === 'neon' ? .75 : .38, .55, .8); composer.addPass(bloomPass);
    const bloomSet = bloomPass.setSize.bind(bloomPass);
    bloomPass.setSize = (w, h) => { const k = (QUALITY[cfg.quality] && QUALITY[cfg.quality].bloomScale) || .5; bloomSet(Math.max(64, Math.round(w*k)), Math.max(64, Math.round(h*k))); };
    gradePass = new THREE.ShaderPass(GradeShader); applyGrade();
    composer.addPass(gradePass);
    // edge smoothing for High, where the depth-readable frame can't use multisampling
    if (rt.depthTexture && THREE.SMAAPass){ fxaaPass = new THREE.SMAAPass(size.x, size.y); composer.addPass(fxaaPass); }
    const pr = renderer.getPixelRatio(); composer.setPixelRatio(pr); composer.setSize(innerWidth, innerHeight); postSized(pr);
  } catch(e){ console.warn('effects unavailable', e); composer = null; }
}
function postSized(pr){
  if (gradePass) gradePass.uniforms.res.value.set(innerWidth, innerHeight);
}
setupPost();
applyQuality();

