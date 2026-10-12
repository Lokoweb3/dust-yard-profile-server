// US sanctions checks for the features that move value (swaps, market, item and badge claims,
// profile NFT minting). Nothing here is stored: each request is checked and forgotten.
//
//  - Region: the request's IP address is mapped to a country with a local GeoLite2 database
//    (no outside service is called). Countries are configurable with BLOCKED_COUNTRIES.
//  - Wallets: any wallet address in the request is compared with the US Treasury (OFAC)
//    sanctioned-address list for Solana-format addresses, which X1 shares. The list is refreshed
//    twice a day from a public mirror of OFAC data; a bundled copy is used if that fails.
//
// This product includes GeoLite2 data created by MaxMind, available from https://www.maxmind.com.
const fs = require('fs'), path = require('path');
const geoip = require('geoip-country');
const { clientIp } = require('./util');
const { Readable } = require('stream');

// Default: countries under broad US embargo (Cuba, Iran, North Korea) plus Russia, which many
// US crypto services block. Have counsel confirm; change with BLOCKED_COUNTRIES=CU,IR,KP,RU
// Note: the occupied regions of Ukraine (Crimea, Donetsk, Luhansk) can't be told apart from the
// rest of Ukraine with country-level data, so they are not covered by this check.
const BLOCKED_COUNTRIES = new Set((process.env.BLOCKED_COUNTRIES || 'CU,IR,KP,RU').split(',').map(s => s.trim().toUpperCase()).filter(Boolean));
const SANCTIONS_URL = process.env.SANCTIONS_LIST_URL || 'https://raw.githubusercontent.com/0xB10C/ofac-sanctioned-digital-currency-addresses/lists/sanctioned_addresses_SOL.txt';

const parseList = text => new Set(String(text).split(/\s+/).filter(a => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a)));
let sanctioned = parseList(fs.readFileSync(path.join(__dirname, 'sanctioned-addresses.txt'), 'utf8'));
let listUpdated = 0;
async function refreshSanctions(){
  try {
    const r = await fetch(SANCTIONS_URL, { signal:AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const next = parseList(await r.text());
    if (next.size) { sanctioned = next; listUpdated = Date.now(); }
  } catch(e){ console.warn('sanctions list refresh failed, keeping the current copy:', e.message); }
}
function startSanctionsRefresh(){ refreshSanctions(); setInterval(refreshSanctions, 12*3600e3).unref(); }

function countryOf(req){ const g = geoip.lookup(clientIp(req)); return g ? g.country : null; }
const regionBlocked = req => BLOCKED_COUNTRIES.has(countryOf(req) || '');

// every base58 string anywhere in a JSON value
function addressesIn(v, out = []){
  if (typeof v === 'string'){ if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v)) out.push(v); }
  else if (Array.isArray(v)) v.forEach(x => addressesIn(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach(x => addressesIn(x, out));
  return out;
}

// requests that create or sign transactions
const GUARDED = /^\/(api\/swap\/(prepare|submit)|api\/market\/|api\/drops\/claim|api\/badges\/claim|profile\/sync)/;
const REGION_MSG = 'Wallet, swap, market and NFT features are not available in your region.';
const WALLET_MSG = 'This wallet can\'t use Dust Yard\'s wallet features.';

// Checks a request. Returns { blocked:{ status, error } } or { req } with the body still readable.
async function screen(req, pathname, maxBody = 20000){
  if (req.method !== 'POST' || !GUARDED.test(pathname)) return { req };
  if (regionBlocked(req)) return { blocked:{ status:451, error:REGION_MSG } };
  const chunks = []; let size = 0;
  for await (const c of req){ size += c.length; if (size > maxBody) return { blocked:{ status:413, error:'too large' } }; chunks.push(c); }
  const buf = Buffer.concat(chunks);
  let body = null; try { body = JSON.parse(buf.toString('utf8') || 'null'); } catch(e){}
  if (addressesIn(body).some(a => sanctioned.has(a))) return { blocked:{ status:451, error:WALLET_MSG } };
  // hand the route handler a fresh copy of the body to read
  const copy = Readable.from(buf.length ? [buf] : []);
  Object.assign(copy, { method:req.method, url:req.url, headers:req.headers, socket:req.socket });
  return { req:copy };
}
const status = req => ({ blocked:regionBlocked(req) });
const info = () => ({ blockedCountries:[...BLOCKED_COUNTRIES], sanctionedAddresses:sanctioned.size, listUpdated });

module.exports = { screen, status, info, startSanctionsRefresh, addressesIn };
