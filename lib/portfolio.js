// Wallet portfolio: token balances with dollar values from XDEX pools.
const { PublicKey } = require('@solana/web3.js');
const { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, NATIVE_MINT } = require('@solana/spl-token');
const { getUmi } = require('./items');
const { keys } = require('./state');
const { USDCX, XDEX, swapQuote } = require('./swap');
const { isB58 } = require('./util');

/* ---------- Portfolio: token balances with dollar values from XDEX pools ---------- */
const priceCache = new Map(), metaCache = new Map();
async function xntUsdPrice(conn){
  const c = priceCache.get('XNT'); if (c && Date.now() - c.at < 120000) return c.usd;
  const q = await swapQuote(conn, 'XNT', 1000000000n); const usd = Number(q.out)/1e6;   // 1 XNT -> USDC.X
  priceCache.set('XNT', { usd, at:Date.now() }); return usd;
}
async function tokenUsd(conn, mint, decimals, xntUsd){
  if (mint === USDCX.toBase58()) return 1;
  const c = priceCache.get(mint); if (c && Date.now() - c.at < 600000) return c.usd;
  let usd = null;
  try {
    const m = new PublicKey(mint); let best = null, bestX = -1n;
    for (const [a, b] of [[NATIVE_MINT, m], [m, NATIVE_MINT]]){
      const r = await conn.getProgramAccounts(XDEX, { filters:[{ memcmp:{ offset:168, bytes:a.toBase58() } }, { memcmp:{ offset:200, bytes:b.toBase58() } }] });
      for (const acc of r){
        const d = acc.account.data, x0 = new PublicKey(d.subarray(168, 200)).equals(NATIVE_MINT), v0 = new PublicKey(d.subarray(72, 104)), v1 = new PublicKey(d.subarray(104, 136));
        const [b0, b1] = await Promise.all([conn.getTokenAccountBalance(v0), conn.getTokenAccountBalance(v1)]);
        const f = o => d.readBigUInt64LE(o), r0 = BigInt(b0.value.amount) - f(341) - f(357), r1 = BigInt(b1.value.amount) - f(349) - f(365);
        const [rx, rt] = x0 ? [r0, r1] : [r1, r0]; if (rx > bestX){ bestX = rx; best = { rx, rt }; }
      }
    }
    if (best && best.rt > 0n && best.rx > 1000000000n) usd = (Number(best.rx)/1e9)/(Number(best.rt)/10**decimals)*xntUsd;   // needs at least 1 XNT of liquidity
  } catch(e){}
  priceCache.set(mint, { usd, at:Date.now() }); return usd;
}
async function tokenMeta(conn, mint, t22info){
  if (metaCache.has(mint)) return metaCache.get(mint);
  let name = '', symbol = '';
  try {
    if (t22info){ const ext = (t22info.extensions || []).find(e => e.extension === 'tokenMetadata'); if (ext){ name = ext.state.name; symbol = ext.state.symbol; } }
    if (!symbol){ const { umi, mpl, U } = getUmi(keys.secret); const md = await mpl.fetchMetadataFromSeeds(umi, { mint:U.publicKey(mint) }); name = md.name.replace(/\0/g, '').trim(); symbol = md.symbol.replace(/\0/g, '').trim(); }
  } catch(e){}
  const out = { name:name.slice(0, 32), symbol:symbol.slice(0, 12) }; metaCache.set(mint, out); return out;
}
async function portfolioRoute(req, res, q, reply, conn){
  if (req.method !== 'GET' || q.pathname !== '/api/portfolio') return false;
  const w = q.searchParams.get('wallet'); if (!isB58(w)) return reply(400, { error:'bad wallet' });
  const owner = new PublicKey(w), xntUsd = await xntUsdPrice(conn).catch(() => null);
  const lamports = await conn.getBalance(owner), rows = [{ mint:'XNT', name:'X1 Native Token', symbol:'XNT', amount:lamports/1e9, usd:xntUsd != null ? lamports/1e9*xntUsd : null, price:xntUsd }];
  let nfts = 0;
  for (const prog of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]){
    const r = await conn.getParsedTokenAccountsByOwner(owner, { programId:prog });
    for (const a of r.value){
      const i = a.account.data.parsed.info, amt = i.tokenAmount; if (amt.amount === '0') continue;
      if (amt.decimals === 0 && amt.amount === '1'){ nfts++; continue; }
      if (rows.length >= 40) continue;
      let t22 = null; if (prog.equals(TOKEN_2022_PROGRAM_ID)){ try { t22 = (await conn.getParsedAccountInfo(new PublicKey(i.mint))).value.data.parsed.info; } catch(e){} }
      const meta = await tokenMeta(conn, i.mint, t22), price = xntUsd != null ? await tokenUsd(conn, i.mint, amt.decimals, xntUsd) : null;
      rows.push({ mint:i.mint, name:meta.name, symbol:meta.symbol || i.mint.slice(0, 4) + '…', amount:amt.uiAmount, price, usd:price != null ? amt.uiAmount*price : null });
    }
  }
  rows.sort((a, b) => (b.usd || 0) - (a.usd || 0));
  const total = rows.reduce((s, r) => s + (r.usd || 0), 0);
  return reply(200, { wallet:w, totalUsd:total, nfts, tokens:rows });
}

module.exports = { portfolioRoute };
