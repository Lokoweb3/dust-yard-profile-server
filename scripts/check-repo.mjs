// Safety checks that run before every deploy:
// 1. no wallet keys or server data are committed
// 2. the game file is really there (a failed upload once left it empty)
// 3. the server code parses
import { execSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

const fail = [];
const files = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean);

// keys and server data must never be in git
for (const f of files) {
  // keypair source code (the vendored ed25519 library's keypair.cs) is fine; keypair data files are not
  if (/^data\//.test(f) || (/keypair/i.test(f) && !/\.cs(\.meta)?$/.test(f)) || /\.env($|\.)/.test(f)) fail.push(`${f}: server data, keys and .env files must not be committed`);
}
const KEY_ARRAY = /\[\s*(\d{1,3}\s*,\s*){63}\d{1,3}\s*\]/;          // a Solana/X1 secret key saved as a 64-number array
const PEM = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;
for (const f of files) {
  if (!/\.(js|mjs|cjs|json|md|txt|yml|yaml|env)$/.test(f) || f === 'package-lock.json') continue;
  const text = readFileSync(f, 'utf8');
  if (KEY_ARRAY.test(text)) fail.push(`${f}: looks like it contains a wallet secret key (64-number array)`);
  if (PEM.test(text)) fail.push(`${f}: contains a private key block`);
}

// the game file must be a real build, not an empty or half upload
try {
  const size = statSync('public/index.html').size;
  if (size < 300_000) fail.push(`public/index.html is only ${(size / 1e6).toFixed(2)} MB; the game page is about 1.2 MB, so the build or upload probably failed`);
  const html = readFileSync('public/index.html', 'utf8');
  if (!html.includes('<canvas') && !html.includes('id="game"')) fail.push('public/index.html does not look like the Dust Yard game');
  // every model and texture the page asks for must exist
  const m = html.match(/window\.DY_ASSETS=(\{[^<]*\})/);
  if (!m) fail.push('public/index.html has no asset list; run npm run build');
  else for (const [id, p] of Object.entries(JSON.parse(m[1]))){ try { if (statSync('public/' + p).size < 1000) fail.push(`${p} (${id}) is nearly empty`); } catch(e){ fail.push(`${p} (${id}) is missing from public/assets`); } }
} catch (e) { fail.push('public/index.html is missing'); }

// the server must at least parse
try { execSync('node --check profile-server.js', { stdio:'pipe' }); }
catch (e) { fail.push('profile-server.js has a syntax error:\n' + String(e.stderr || e.message)); }

if (fail.length){ console.error('Repo checks failed:\n- ' + fail.join('\n- ')); process.exit(1); }
console.log(`Repo checks passed (${files.length} files scanned).`);
