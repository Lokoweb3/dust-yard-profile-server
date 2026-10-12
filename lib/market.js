// In-game NFT marketplace: non-custodial listings and atomic purchases in XNT.
const fs = require('fs'), crypto = require('crypto'), nacl = require('tweetnacl'), bs58 = require('bs58');
const { PublicKey, SystemProgram, Transaction } = require('@solana/web3.js');
const { getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction } = require('@solana/spl-token');
const { withFittedLimit } = require('./chain');
const { DATA_DIR } = require('./config');
const { getUmi } = require('./items');
const { proxyFetch } = require('./proxy');
const { broadcast } = require('./social');
const { keys } = require('./state');
const { isB58 } = require('./util');

/* ---------- NFT marketplace: non-custodial listings, atomic purchases in XNT ---------- */
// Listing: the seller signs an approval that lets the server move exactly that NFT, so it stays in their wallet.
// Buying: one transaction pays the seller (plus creator royalties) and moves the NFT; both happen or neither does.
const { createApproveInstruction, createRevokeInstruction, createTransferInstruction, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const MEMO_PROGRAM = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
const MARKET_FEE_BPS = Math.max(0, Math.min(1000, +(process.env.MARKET_FEE_BPS || 0)));
const MARKET_FILE = () => require('path').join(DATA_DIR, 'market.json');
let market = null;
function loadMarket(){ try { market = JSON.parse(fs.readFileSync(MARKET_FILE(), 'utf8')); } catch(e){ market = {}; } market.listings = market.listings || {}; market.pending = market.pending || {}; market.sales = market.sales || []; }
function saveMarket(){ fs.writeFileSync(MARKET_FILE() + '.tmp', JSON.stringify(market)); fs.renameSync(MARKET_FILE() + '.tmp', MARKET_FILE()); }
const memoIx = (text, signer) => ({ programId:MEMO_PROGRAM, keys:[{ pubkey:signer, isSigner:true, isWritable:false }], data:Buffer.from(text) });
async function nftInfo(conn, mintStr){
  const { umi, mpl, U } = getUmi(keys.secret);
  const md = await mpl.fetchMetadataFromSeeds(umi, { mint:U.publicKey(mintStr) });
  const std = md.tokenStandard && md.tokenStandard.__option === 'Some' ? md.tokenStandard.value : 0;
  const creators = md.creators && md.creators.__option === 'Some' ? md.creators.value.map(c => ({ address:c.address.toString(), share:c.share })) : [];
  const col = md.collection && md.collection.__option === 'Some' ? { key:md.collection.value.key.toString(), verified:md.collection.value.verified } : null;
  let image = '';
  try { const r = await proxyFetch(md.uri.trim()); if (r.status === 200) image = String(JSON.parse(r.buf.toString('utf8')).image || '').slice(0, 300); } catch(e){}
  return { name:md.name.replace(/\0/g, '').trim().slice(0, 32), symbol:md.symbol.replace(/\0/g, '').trim().slice(0, 10), uri:md.uri.trim(), std, fee:Number(md.sellerFeeBasisPoints && md.sellerFeeBasisPoints.basisPoints !== undefined ? md.sellerFeeBasisPoints.basisPoints : md.sellerFeeBasisPoints) || 0, creators, collection:col, image };
}
async function nftAccount(conn, owner, mint){
  const r = await conn.getParsedTokenAccountsByOwner(new PublicKey(owner), { mint:new PublicKey(mint) });
  const a = r.value.find(x => x.account.owner.equals(TOKEN_PROGRAM_ID) && x.account.data.parsed.info.tokenAmount.amount === '1');
  return a ? { pubkey:a.pubkey, info:a.account.data.parsed.info } : null;
}
async function buildPending(conn, kind, ixs, data){
  const { blockhash } = await conn.getLatestBlockhash();
  const tx = new Transaction({ feePayer:keys.server.publicKey, recentBlockhash:blockhash }).add(...ixs);
  await withFittedLimit(conn, tx, kind === 'buy' ? 150000 : 60000);
  const id = crypto.randomBytes(8).toString('hex');
  market.pending[id] = { kind, message:tx.serializeMessage().toString('base64'), exp:Date.now() + 90000, ...data };
  for (const [k, p] of Object.entries(market.pending)) if (p.exp < Date.now()) delete market.pending[k];
  saveMarket();
  return { id, tx:tx.serialize({ requireAllSignatures:false, verifySignatures:false }).toString('base64') };
}
async function marketRoute(req, res, q, reply, conn){
  const body = async () => { let b = ''; for await (const c of req){ b += c; if (b.length > 6000) throw new Error('too large'); } return JSON.parse(b || '{}'); };
  if (req.method === 'GET' && q.pathname === '/api/market/listings'){
    return reply(200, { feeBps:MARKET_FEE_BPS, listings:Object.values(market.listings).filter(l => l.status === 'active').sort((a, b) => b.at - a.at).slice(0, 200), recent:market.sales.slice(-20).reverse() });
  }
  if (req.method !== 'POST') return false;
  const b = await body();
  if (q.pathname === '/api/market/prepare-list'){
    const { seller, mint } = b, price = Number(b.price);
    if (!isB58(seller) || !isB58(mint) || !(price >= .01 && price <= 1e6)) return reply(400, { error:'bad listing' });
    if (Object.values(market.listings).some(l => l.mint === mint && l.status === 'active')) return reply(409, { error:'already listed' });
    const acc = await nftAccount(conn, seller, mint); if (!acc) return reply(404, { error:'NFT not found in this wallet' });
    const info = await nftInfo(conn, mint);
    if (info.std === 4 || info.std === 5) return reply(422, { error:'programmable NFTs are not supported yet' });
    const lamports = Math.round(price*1e9), id = crypto.randomBytes(6).toString('hex'), sellerPk = new PublicKey(seller);
    const out = await buildPending(conn, 'list', [createApproveInstruction(acc.pubkey, keys.server.publicKey, sellerPk, 1), memoIx(`dustyard:list:${id}:${mint}:${lamports}`, sellerPk)],
      { signer:seller, listing:{ id, mint, seller, account:acc.pubkey.toBase58(), lamports, ...info, at:Date.now(), status:'pending' } });
    return reply(200, out);
  }
  if (q.pathname === '/api/market/prepare-cancel'){
    const l = market.listings[b.id]; if (!l || l.status !== 'active' || l.seller !== b.seller) return reply(404, { error:'listing not found' });
    const sellerPk = new PublicKey(l.seller);
    return reply(200, await buildPending(conn, 'cancel', [createRevokeInstruction(new PublicKey(l.account), sellerPk), memoIx(`dustyard:cancel:${l.id}`, sellerPk)], { signer:l.seller, listingId:l.id }));
  }
  if (q.pathname === '/api/market/prepare-buy'){
    const l = market.listings[b.id], buyer = b.buyer;
    if (!l || l.status !== 'active') return reply(404, { error:'listing not found' });
    if (!isB58(buyer) || buyer === l.seller) return reply(400, { error:'bad buyer' });
    const acc = await nftAccount(conn, l.seller, l.mint);
    if (!acc || acc.pubkey.toBase58() !== l.account || acc.info.delegate !== keys.server.publicKey.toBase58() || acc.info.delegatedAmount.amount !== '1'){ l.status = 'gone'; saveMarket(); return reply(410, { error:'this NFT is no longer available' }); }
    const buyerPk = new PublicKey(buyer), mintPk = new PublicKey(l.mint), ata = getAssociatedTokenAddressSync(mintPk, buyerPk);
    const royalty = Math.floor(l.lamports*l.fee/10000), fee = Math.floor(l.lamports*MARKET_FEE_BPS/10000), toSeller = l.lamports - royalty - fee;
    const ixs = [createAssociatedTokenAccountIdempotentInstruction(keys.server.publicKey, ata, buyerPk, mintPk), SystemProgram.transfer({ fromPubkey:buyerPk, toPubkey:new PublicKey(l.seller), lamports:toSeller })];
    let paid = 0; const shares = l.creators.filter(c => c.share > 0);
    shares.forEach((c, i) => { const amt = i === shares.length - 1 ? royalty - paid : Math.floor(royalty*c.share/100); paid += amt; if (amt > 0) ixs.push(SystemProgram.transfer({ fromPubkey:buyerPk, toPubkey:new PublicKey(c.address), lamports:amt })); });
    if (!shares.length && royalty > 0) ixs[1] = SystemProgram.transfer({ fromPubkey:buyerPk, toPubkey:new PublicKey(l.seller), lamports:toSeller + royalty });
    if (fee > 0) ixs.push(SystemProgram.transfer({ fromPubkey:buyerPk, toPubkey:isB58(process.env.FEE_WALLET) ? new PublicKey(process.env.FEE_WALLET) : keys.server.publicKey, lamports:fee }));
    ixs.push(createTransferInstruction(new PublicKey(l.account), ata, keys.server.publicKey, 1), memoIx(`dustyard:buy:${l.id}`, buyerPk));
    return reply(200, Object.assign(await buildPending(conn, 'buy', ixs, { signer:buyer, listingId:l.id }), { breakdown:{ price:l.lamports, seller:toSeller, royalty, fee } }));
  }
  if (q.pathname === '/api/market/submit'){
    const p = market.pending[b.id]; if (!p || p.exp < Date.now()) return reply(410, { error:'this request expired, please try again' });
    let tx; try { tx = Transaction.from(Buffer.from(String(b.tx || ''), 'base64')); } catch(e){ return reply(400, { error:'bad transaction' }); }
    if (tx.serializeMessage().toString('base64') !== p.message) return reply(400, { error:'transaction was changed' });
    const sig = tx.signatures.find(s => s.publicKey.toBase58() === p.signer);
    if (!sig || !sig.signature || !nacl.sign.detached.verify(tx.serializeMessage(), sig.signature, bs58.decode(p.signer))) return reply(401, { error:'missing wallet signature' });
    delete market.pending[b.id]; saveMarket();
    tx.partialSign(keys.server);
    let txid; try { txid = await conn.sendRawTransaction(tx.serialize()); await conn.confirmTransaction(txid, 'confirmed'); }
    catch(e){ console.error('market tx failed', e.message); return reply(502, { error:'the transaction failed on X1' }); }
    if (p.kind === 'list'){ market.listings[p.listing.id] = Object.assign(p.listing, { status:'active', txid }); }
    else if (p.kind === 'cancel'){ const l = market.listings[p.listingId]; if (l) l.status = 'cancelled'; }
    else if (p.kind === 'buy'){ const l = market.listings[p.listingId]; if (l){ l.status = 'sold'; l.buyer = p.signer; market.sales.push({ id:l.id, name:l.name, image:l.image, lamports:l.lamports, at:Date.now(), txid }); if (market.sales.length > 200) market.sales.shift(); } }
    saveMarket(); broadcast({ t:'nftmarket' });
    return reply(200, { ok:true, txid });
  }
  return false;
}

module.exports = { MARKET_FEE_BPS, loadMarket, marketRoute };
