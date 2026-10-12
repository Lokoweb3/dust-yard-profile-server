// XDEX swaps between XNT and USDC.X, signed and paid by the player.
const crypto = require('crypto');
const { PublicKey, SystemProgram, Transaction, VersionedTransaction } = require('@solana/web3.js');
const { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const { withFittedLimit } = require('./chain');
const { isB58 } = require('./util');

/* ---------- XDEX swaps (XNT <-> USDC.X), signed and paid by the player ---------- */
// The server only builds and checks the transaction; it never signs or holds funds.
const { createSyncNativeInstruction, createCloseAccountInstruction, NATIVE_MINT } = require('@solana/spl-token');
const XDEX = new PublicKey('sEsYH97wqmfnkzHedjNcw3zyJdPvUmsa9AixhS4b4fN'), USDCX = new PublicKey('B69chRzqzDCmdB5WYB8NRu5Yv5ZA95ABiZcdzCgGm9Tq');
const SWAP_DISC = Buffer.from('8fbe5adac41e33de', 'hex');   // swap_base_input
let poolCache = null;
async function xdexPool(conn){
  if (poolCache && Date.now() - poolCache.at < 600000) return poolCache;
  const pairs = [];
  for (const [a, b] of [[NATIVE_MINT, USDCX], [USDCX, NATIVE_MINT]]){
    const r = await conn.getProgramAccounts(XDEX, { filters:[{ memcmp:{ offset:168, bytes:a.toBase58() } }, { memcmp:{ offset:200, bytes:b.toBase58() } }] });
    for (const acc of r) pairs.push(acc);
  }
  let best = null, bestUsd = -1;
  for (const acc of pairs){
    const d = acc.account.data, pk = o => new PublicKey(d.subarray(o, o + 32));
    const p = { id:acc.pubkey, config:pk(8), vault0:pk(72), vault1:pk(104), mint0:pk(168), mint1:pk(200), prog0:pk(232), prog1:pk(264), observation:pk(296) };
    const usdVault = p.mint0.equals(USDCX) ? p.vault0 : p.vault1, bal = await conn.getTokenAccountBalance(usdVault);
    if (+bal.value.uiAmount > bestUsd){ bestUsd = +bal.value.uiAmount; best = p; }
  }
  if (!best) throw new Error('no XNT/USDC.X pool found');
  const cfg = await conn.getAccountInfo(best.config); best.feeRate = Number(cfg.data.readBigUInt64LE(12));
  best.authority = PublicKey.findProgramAddressSync([Buffer.from('vault_and_lp_mint_auth_seed')], XDEX)[0];
  best.at = Date.now(); poolCache = best; return best;
}
async function swapQuote(conn, from, amountIn){
  const p = await xdexPool(conn), xntIn = from === 'XNT';
  const [b0, b1] = await Promise.all([conn.getTokenAccountBalance(p.vault0), conn.getTokenAccountBalance(p.vault1)]);
  // vaults also hold fees owed to the protocol and fund; the swap math uses what's left
  const st = (await conn.getAccountInfo(p.id)).data, fee = o => st.readBigUInt64LE(o);
  const r0 = BigInt(b0.value.amount) - fee(341) - fee(357), r1 = BigInt(b1.value.amount) - fee(349) - fee(365), xntIs0 = p.mint0.equals(NATIVE_MINT);
  const [rIn, rOut] = (xntIn === xntIs0) ? [r0, r1] : [r1, r0];
  const inAfterFee = amountIn - amountIn*BigInt(p.feeRate)/1000000n, out = inAfterFee*rOut/(rIn + inAfterFee);
  return { pool:p, out, rIn, rOut, xntIs0 };
}
const pendingSwaps = new Map();
async function swapRoute(req, res, q, reply, conn){
  const body = async () => { let b = ''; for await (const c of req){ b += c; if (b.length > 4000) throw new Error('too large'); } return JSON.parse(b || '{}'); };
  if (req.method === 'GET' && q.pathname === '/api/swap/quote'){
    const from = q.searchParams.get('from') === 'USDC.X' ? 'USDC.X' : 'XNT', amt = Number(q.searchParams.get('amount'));
    if (!(amt > 0 && amt < 1e9)) return reply(400, { error:'bad amount' });
    const inRaw = BigInt(Math.round(amt*(from === 'XNT' ? 1e9 : 1e6))), qt = await swapQuote(conn, from, inRaw);
    return reply(200, { from, amountIn:amt, amountOut:Number(qt.out)/(from === 'XNT' ? 1e6 : 1e9), feePct:qt.pool.feeRate/10000, pool:qt.pool.id.toBase58(), priceImpactPct:Number(inRaw*10000n/(qt.rIn + inRaw))/100 });
  }
  if (req.method === 'POST' && q.pathname === '/api/swap/prepare'){
    const b = await body(), from = b.from === 'USDC.X' ? 'USDC.X' : 'XNT', amt = Number(b.amount), slip = Math.max(10, Math.min(500, +b.slippageBps || 100));
    if (!isB58(b.owner) || !(amt > 0 && amt < 1e9)) return reply(400, { error:'bad request' });
    const owner = new PublicKey(b.owner), xntIn = from === 'XNT', inRaw = BigInt(Math.round(amt*(xntIn ? 1e9 : 1e6)));
    const qt = await swapQuote(conn, from, inRaw), p = qt.pool, minOut = qt.out*BigInt(10000 - slip)/10000n;
    if (minOut <= 0n) return reply(400, { error:'amount too small' });
    const wAta = getAssociatedTokenAddressSync(NATIVE_MINT, owner, false, TOKEN_PROGRAM_ID), uAta = getAssociatedTokenAddressSync(USDCX, owner, false, TOKEN_2022_PROGRAM_ID);
    const [inAcc, outAcc] = xntIn ? [wAta, uAta] : [uAta, wAta];
    const inVault = (xntIn === qt.xntIs0) ? p.vault0 : p.vault1, outVault = (xntIn === qt.xntIs0) ? p.vault1 : p.vault0;
    const progOf = m => m.equals(USDCX) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID, inMint = xntIn ? NATIVE_MINT : USDCX, outMint = xntIn ? USDCX : NATIVE_MINT;
    const data = Buffer.alloc(24); SWAP_DISC.copy(data, 0); data.writeBigUInt64LE(inRaw, 8); data.writeBigUInt64LE(minOut, 16);
    const swapIx = { programId:XDEX, data, keys:[
      { pubkey:owner, isSigner:true, isWritable:false }, { pubkey:p.authority, isSigner:false, isWritable:false }, { pubkey:p.config, isSigner:false, isWritable:false },
      { pubkey:p.id, isSigner:false, isWritable:true }, { pubkey:inAcc, isSigner:false, isWritable:true }, { pubkey:outAcc, isSigner:false, isWritable:true },
      { pubkey:inVault, isSigner:false, isWritable:true }, { pubkey:outVault, isSigner:false, isWritable:true },
      { pubkey:progOf(inMint), isSigner:false, isWritable:false }, { pubkey:progOf(outMint), isSigner:false, isWritable:false },
      { pubkey:inMint, isSigner:false, isWritable:false }, { pubkey:outMint, isSigner:false, isWritable:false }, { pubkey:p.observation, isSigner:false, isWritable:true } ] };
    const ixs = [createAssociatedTokenAccountIdempotentInstruction(owner, wAta, owner, NATIVE_MINT, TOKEN_PROGRAM_ID)];
    if (xntIn) ixs.push(SystemProgram.transfer({ fromPubkey:owner, toPubkey:wAta, lamports:Number(inRaw) }), createSyncNativeInstruction(wAta, TOKEN_PROGRAM_ID));
    ixs.push(createAssociatedTokenAccountIdempotentInstruction(owner, uAta, owner, USDCX, TOKEN_2022_PROGRAM_ID), swapIx, createCloseAccountInstruction(wAta, owner, owner, [], TOKEN_PROGRAM_ID));
    const { blockhash } = await conn.getLatestBlockhash();
    const tx = new Transaction({ feePayer:owner, recentBlockhash:blockhash }).add(...ixs);
    await withFittedLimit(conn, tx, 200000);
    // dry run first so players see a clear error instead of a failed transaction
    const sim = await conn.simulateTransaction(new VersionedTransaction(tx.compileMessage()), { sigVerify:false, replaceRecentBlockhash:true, commitment:'confirmed' });
    if (sim.value.err){
      const logs = (sim.value.logs || []).join(' '); console.log('swap simulation failed', JSON.stringify(sim.value.err), (sim.value.logs || []).slice(-6).join(' | ')); const msg = /insufficient (lamports|funds)/i.test(logs) || /0x1\b/.test(logs) ? 'not enough balance for this swap and its fee' : /slippage|ExceededSlippage|0x1771/i.test(logs) ? 'price moved, try again' : 'the swap would fail right now';
      return reply(422, { error:msg });
    }
    const id = crypto.randomBytes(8).toString('hex'); pendingSwaps.set(id, { message:tx.serializeMessage().toString('base64'), owner:b.owner, exp:Date.now() + 90000 });
    for (const [k, v] of pendingSwaps) if (v.exp < Date.now()) pendingSwaps.delete(k);
    return reply(200, { id, tx:tx.serialize({ requireAllSignatures:false, verifySignatures:false }).toString('base64'), expectedOut:Number(qt.out)/(xntIn ? 1e6 : 1e9), minOut:Number(minOut)/(xntIn ? 1e6 : 1e9) });
  }
  if (req.method === 'POST' && q.pathname === '/api/swap/submit'){
    const b = await body(), p = pendingSwaps.get(b.id); if (!p || p.exp < Date.now()) return reply(410, { error:'this quote expired, please try again' });
    let tx; try { tx = Transaction.from(Buffer.from(String(b.tx || ''), 'base64')); } catch(e){ return reply(400, { error:'bad transaction' }); }
    if (tx.serializeMessage().toString('base64') !== p.message) return reply(400, { error:'transaction was changed' });
    if (!tx.verifySignatures()) return reply(401, { error:'missing wallet signature' });
    pendingSwaps.delete(b.id);
    try { const txid = await conn.sendRawTransaction(tx.serialize()); await conn.confirmTransaction(txid, 'confirmed'); return reply(200, { ok:true, txid }); }
    catch(e){ console.error('swap failed', e.message); return reply(502, { error:'the swap failed on X1' }); }
  }
  return false;
}

module.exports = { USDCX, XDEX, swapQuote, swapRoute };
