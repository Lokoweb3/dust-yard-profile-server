// Small shared helpers: stable JSON, hashing, signature checks, string limits.
const crypto = require('crypto'), nacl = require('tweetnacl'), bs58 = require('bs58');

function canonical(v){ // stable JSON so the client and server hash the same bytes
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
const sha256hex = s => crypto.createHash('sha256').update(s).digest('hex');
function esc(s){ return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])); }
const str = (v, n) => String(v == null ? '' : v).slice(0, n);
const num = (v, max) => { const x = Number(v); return Number.isFinite(x) ? Math.max(0, Math.min(max, Math.round(x))) : 0; };
function verifySigned(obj, sig, signer){ try { return nacl.sign.detached.verify(Buffer.from(canonical(obj)), bs58.decode(sig), bs58.decode(signer)); } catch(e){ return false; } }
const isB58 = s => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s || '');

module.exports = { canonical, esc, isB58, num, sha256hex, str, verifySigned };
