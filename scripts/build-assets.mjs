// Runs every Blender generator in tools/blender/ headless and exports GLB models for the
// browser game into build/glb/ (a staging area; wire a model into game/assets/ + assets.json
// when the game actually uses it). The same generators export FBX for the Unity project when
// given a .fbx path.
//
//   npm run assets                        build all GLBs
//   BLENDER=path/to/blender.exe npm run assets
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const CANDIDATES = [
  process.env.BLENDER,
  'C:/Users/lokot/Downloads/blender-5.4.0-alpha+main.0161c1707142-windows.amd64-release/blender-5.4.0-alpha+main.0161c1707142-windows.amd64-release/blender.exe',
  'C:/Program Files/Blender Foundation/Blender 4.2/blender.exe',
  '/usr/bin/blender',
].filter(Boolean);
const blender = CANDIDATES.find(p => existsSync(p));
if (!blender){ console.error('Blender not found; set BLENDER=path/to/blender'); process.exit(1); }

const OUT = 'build/glb'; mkdirSync(OUT, { recursive:true });
const gens = readdirSync('tools/blender').filter(f => /^gen_.*\.py$/.test(f));
for (const gen of gens){
  const name = gen.replace(/^gen_|\.py$/g, '');
  const out = resolve(join(OUT, name + '.glb'));
  execFileSync(blender, ['-b', '--factory-startup', '-P', join('tools/blender', gen), '--', out], { stdio:'pipe' });
  console.log(`${gen} -> ${OUT}/${name}.glb (${(statSync(out).size/1024).toFixed(0)} KB)`);
}
console.log(`${gens.length} models built with ${blender}`);
