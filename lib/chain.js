// X1 transaction helpers: fitting compute limits and building the profile NFT transactions.
const { SystemProgram, Transaction, ComputeBudgetProgram, VersionedTransaction } = require('@solana/web3.js');
const { TOKEN_2022_PROGRAM_ID, ExtensionType, getMintLen, createInitializeNonTransferableMintInstruction, createInitializeMetadataPointerInstruction, createInitializeMintInstruction, getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction, createMintToInstruction, createSetAuthorityInstruction, AuthorityType } = require('@solana/spl-token');
const { createInitializeInstruction, createUpdateFieldInstruction, pack } = require('@solana/spl-token-metadata');
const { FIELD_ORDER, MAX_TX, PUBLIC_URL } = require('./config');

/* ---------- compute limits ---------- */
// On X1 the fee follows the compute units a transaction REQUESTS (about 10 lamports per unit,
// measured on this server's own transactions), so every transaction asks for what it needs.
async function fitUnits(conn, tx, fallback = 200000){
  try {
    const probe = new VersionedTransaction(tx.compileMessage());   // legacy message, simulated without signatures
    const sim = await conn.simulateTransaction(probe, { sigVerify:false, replaceRecentBlockhash:true, commitment:'confirmed' });
    if (sim.value.err || !sim.value.unitsConsumed) return fallback;
    return Math.min(1400000, Math.ceil(sim.value.unitsConsumed*1.15) + 5000);
  } catch(e){ return fallback; }
}
async function withFittedLimit(conn, tx, fallback){
  const first = tx.instructions[0], isBudget = first && first.programId.equals(ComputeBudgetProgram.programId);
  if (!isBudget) tx.instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({ units:fallback || 200000 }));
  tx.instructions[0] = ComputeBudgetProgram.setComputeUnitLimit({ units:await fitUnits(conn, tx, fallback) });
  return tx;
}

/* ---------- transaction builders ---------- */
function splitIntoTransactions(ixs, payer, signersFor, blockhash){
  const fresh = () => new Transaction({ feePayer:payer, recentBlockhash:blockhash }).add(ComputeBudgetProgram.setComputeUnitLimit({ units:600000 }));
  const txs = []; let cur = fresh();
  for (const ix of ixs){
    const trial = new Transaction({ feePayer:payer, recentBlockhash:blockhash }); trial.add(...cur.instructions, ix);
    let size; try { size = trial.serialize({ requireAllSignatures:false, verifySignatures:false }).length + 64; } catch(e){ size = MAX_TX + 1; } // +64 for the mint's signature
    if (size > MAX_TX && cur.instructions.length > 1){ txs.push(cur); cur = fresh(); }
    cur.add(ix);
  }
  if (cur.instructions.length > 1) txs.push(cur);
  return txs.map(tx => ({ tx, signers:signersFor(tx) }));
}
async function buildMint({ server, mint, owner, username, fields, rent, name, symbol, uri, fieldOrder }){
  const order = fieldOrder || FIELD_ORDER;
  const meta = { mint:mint.publicKey, name:name || `Dust Yard: @${username}`.slice(0, 32), symbol:symbol || 'DYP', uri:uri || `${PUBLIC_URL}/card/${owner.toBase58()}.json`,
    additionalMetadata:order.map(k => [k, fields[k]]) };
  const mintLen = getMintLen([ExtensionType.NonTransferable, ExtensionType.MetadataPointer]);
  const metaLen = 4 + pack(meta).length; // TLV header + packed metadata
  const lamports = await rent(mintLen + metaLen + 512); // small headroom for later field growth
  const ata = getAssociatedTokenAddressSync(mint.publicKey, owner, false, TOKEN_2022_PROGRAM_ID);
  const ixs = [
    SystemProgram.createAccount({ fromPubkey:server.publicKey, newAccountPubkey:mint.publicKey, space:mintLen, lamports, programId:TOKEN_2022_PROGRAM_ID }),
    createInitializeNonTransferableMintInstruction(mint.publicKey, TOKEN_2022_PROGRAM_ID),
    createInitializeMetadataPointerInstruction(mint.publicKey, server.publicKey, mint.publicKey, TOKEN_2022_PROGRAM_ID),
    createInitializeMintInstruction(mint.publicKey, 0, server.publicKey, null, TOKEN_2022_PROGRAM_ID),
    createInitializeInstruction({ programId:TOKEN_2022_PROGRAM_ID, metadata:mint.publicKey, updateAuthority:server.publicKey, mint:mint.publicKey, mintAuthority:server.publicKey, name:meta.name, symbol:meta.symbol, uri:meta.uri }),
    createAssociatedTokenAccountIdempotentInstruction(server.publicKey, ata, owner, mint.publicKey, TOKEN_2022_PROGRAM_ID),
    createMintToInstruction(mint.publicKey, ata, server.publicKey, 1, [], TOKEN_2022_PROGRAM_ID),
    createSetAuthorityInstruction(mint.publicKey, server.publicKey, AuthorityType.MintTokens, null, [], TOKEN_2022_PROGRAM_ID), // supply fixed at 1
    ...order.map(k => createUpdateFieldInstruction({ programId:TOKEN_2022_PROGRAM_ID, metadata:mint.publicKey, updateAuthority:server.publicKey, field:k, value:fields[k] }))
  ];
  return { ixs, signersFor:tx => tx.instructions.some(ix => ix.keys.some(k => k.isSigner && k.pubkey.equals(mint.publicKey))) ? [server, mint] : [server] };
}
function buildUpdate({ server, mint, oldFields, fields, topUp }){
  const changed = FIELD_ORDER.filter(k => oldFields[k] !== fields[k]);
  const ixs = [];
  if (topUp > 0) ixs.push(SystemProgram.transfer({ fromPubkey:server.publicKey, toPubkey:mint, lamports:topUp })); // covers metadata growth
  for (const k of changed) ixs.push(createUpdateFieldInstruction({ programId:TOKEN_2022_PROGRAM_ID, metadata:mint, updateAuthority:server.publicKey, field:k, value:fields[k] }));
  return { ixs, changed, signersFor:() => [server] };
}

module.exports = { buildMint, buildUpdate, splitIntoTransactions, withFittedLimit };
