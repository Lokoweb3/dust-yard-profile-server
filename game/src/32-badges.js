/* ---------- Achievement badges ---------- */
let badgeList = null;
async function loadBadges(){ if (!srvMode || !acct || !acct.claimed) return; try { badgeList = await (await fetch(`${PROFILE_API}/api/badges?wallet=${acct.wallet}`, { cache:'no-store' })).json(); } catch(e){} }
async function claimBadge(b){
  if (!cryptoGate()) return;
  try {
    if (!x1Active || x1Addr !== acct.wallet) throw new Error(`connect ${shortAddr(acct.wallet)} first`);
    const ts = Date.now(), msg = `Dust Yard achievement claim\nWallet: ${acct.wallet}\nAchievement: ${b.id}\nIssued At: ${ts}`;
    const sig = b58(await walletSign(new TextEncoder().encode(msg)));
    acctMsg = `Minting ${b.name}...`; renderAccount();
    await postJSON('/api/badges/claim', { wallet:acct.wallet, id:b.id, ts, sig });
    acctMsg = `${b.name} badge is in your wallet.`; sfx.levelUp(); await loadBadges(); setTimeout(() => fetchBalance(), 2000);
  } catch(e){ acctMsg = `Couldn't claim: ${String(e.message || e).slice(0, 90)}`; }
  renderAccount();
}
function renderBadges(box){
  if (!srvMode) return;
  const h = document.createElement('b'); h.className = 'badgeHead'; h.textContent = 'Achievement badges'; box.appendChild(h);
  if (!badgeList){ box.appendChild(aLine('Loading...', 'acctSub')); loadBadges().then(renderAccount); return; }
  if (!badgeList.synced) box.appendChild(aLine('Mint or sync your profile NFT first. Badges unlock from your synced stats.', 'acctSub'));
  const grid = document.createElement('div'); grid.className = 'badgeGrid'; box.appendChild(grid);
  for (const b of badgeList.badges){
    const c = document.createElement('div'); c.className = 'badge' + (b.claimed ? ' got' : b.eligible ? ' ready' : '');
    const t = document.createElement('b'); t.textContent = b.name; const d = document.createElement('span'); d.textContent = b.desc; c.append(t, d);
    if (b.eligible && !b.claimed){ const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn'; btn.textContent = 'Claim'; btn.addEventListener('click', () => claimBadge(b)); c.appendChild(btn); }
    else { const s = document.createElement('i'); s.textContent = b.claimed ? 'Claimed' : 'Locked'; c.appendChild(s); }
    grid.appendChild(c);
  }
}

