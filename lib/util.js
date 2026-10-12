// Small shared helpers: stable JSON, hashing, signature checks, string limits.
const crypto = require('crypto'), nacl = require('tweetnacl'), bs58 = require('bs58');

function canonical(v){ // stable JSON so the client and server hash the same bytes
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
const sha256hex = s => crypto.createHash('sha256').update(s).digest('hex');
function esc(s){ return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])); }
// cut by characters, not UTF-16 units, so an emoji is never split in half
const str = (v, n) => { const t = String(v == null ? '' : v); return t.length <= n ? t : Array.from(t).slice(0, n).join(''); };
const num = (v, max) => { const x = Number(v); return Number.isFinite(x) ? Math.max(0, Math.min(max, Math.round(x))) : 0; };
function verifySigned(obj, sig, signer){ try { return nacl.sign.detached.verify(Buffer.from(canonical(obj)), bs58.decode(sig), bs58.decode(signer)); } catch(e){ return false; } }
/**
 * The player's IP address. Behind Railway's proxy it is the last X-Forwarded-For entry: the proxy adds it,
 * while anything before it was sent by the player and can be faked. PROXY_HOPS counts proxies in front
 * of the server (default 1); TRUST_PROXY=0 ignores the header entirely.
 */
const PROXY_HOPS = Math.max(1, +(process.env.PROXY_HOPS || 1)), TRUST_PROXY = process.env.TRUST_PROXY !== '0';
function clientIp(req){
  const parts = TRUST_PROXY ? String(req.headers['x-forwarded-for'] || '').split(',').map(x => x.trim()).filter(Boolean) : [];
  const ip = parts.length ? parts[Math.max(0, parts.length - PROXY_HOPS)] : (req.socket && req.socket.remoteAddress) || '';
  return ip.replace(/^::ffff:/, '');
}
const isB58 = s => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s || '');

module.exports = { canonical, clientIp, esc, isB58, num, sha256hex, str, verifySigned };
