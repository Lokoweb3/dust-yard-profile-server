// Legal and transparency pages: Terms, Privacy, Risks (drafts in legal/) and the live drop-rate table.
const fs = require('fs'), path = require('path');
const { esc } = require('./util');
const { ITEMS, ROYALTY_BPS, mintedCount, seasonOpen } = require('./items');
const { MARKET_FEE_BPS } = require('./market');

const DIR = path.join(__dirname, '..', 'legal');
const UPDATED = 'October 12, 2026';
// set CONTACT_EMAIL in Railway; until then the pages show a placeholder
const contact = () => process.env.CONTACT_EMAIL ? `<a href="mailto:${esc(process.env.CONTACT_EMAIL)}">${esc(process.env.CONTACT_EMAIL)}</a>` : '[contact email]';
const pct = bps => `${(bps/100).toFixed(bps % 100 ? 1 : 0)}%`;
const PAGES = { '/terms':['terms', 'Terms of Service'], '/privacy':['privacy', 'Privacy Policy'], '/risk':['risk', 'Risks'], '/drop-rates':['drop', 'Drop rates'] };

function sourceText(it){
  if (it.source === 'boss') return 'Kill a boss in a match (one roll per boss, up to 3)';
  if (it.source === 'neon') return 'Reach wave 3 on Neon District';
  return `Reach wave ${String(it.source).replace('wave', '')} in a match`;
}
function dropRatesBody(){
  const rows = ITEMS.map(it => {
    const left = Math.max(0, it.supply - mintedCount(it.id)), open = seasonOpen(it);
    return `<tr><td><b>${esc(it.name)}</b><br><span style="color:var(--muted)">${esc(it.rarity)}${it.season ? ` · Season ${it.season} only` : ''}</span></td><td>${esc(sourceText(it))}</td><td>${(it.chance*100).toFixed(it.chance < .1 ? 1 : 0)}%</td><td>${left.toLocaleString('en-US')} of ${it.supply.toLocaleString('en-US')}${open ? '' : ' (closed)'}</td></tr>`;
  }).join('');
  return `<h1>Drop rates</h1>
<p class="meta">Live from the game server.</p>
<p>Items are earned by playing. You can't buy a chance at an item. After each match, the server rolls once for every item you qualified for, using the chances below.</p>
<table><tr><th>Item</th><th>How to qualify</th><th>Chance per roll</th><th>Left to drop</th></tr>${rows}</table>
<h2>Rules</h2>
<ul>
  <li>At most <b>2 items per match</b> and <b>6 per player per day</b>.</li>
  <li>Items are rolled in the order listed above, so once a match has dropped 2 items, the rest aren't rolled.</li>
  <li>When an item's supply runs out, it stops dropping for good. Season items stop dropping when their season ends.</li>
  <li>Drops are rolled on the server with a secure random number generator.</li>
  <li>Only matches the server could check count. While you play, the game reports each wave you clear, and the server checks it against the game's rules (how many raiders a wave has and how fast they can appear). A match that fails those checks gets no drops.</li>
  <li>If you join a co-op match that's already running, waves count from the first one you play from the start.</li>
</ul>`;
}
function page(key, title, body){
  const layout = fs.readFileSync(path.join(DIR, '_layout.html'), 'utf8');
  return layout.replace('{{TITLE}}', esc(title)).replace('{{BODY}}', body)
    .replace(/\{\{NAV_(\w+)\}\}/g, (_, k) => k === key ? ' aria-current="page"' : '')
    .replace(/\{\{CONTACT\}\}/g, contact()).replace(/\{\{UPDATED\}\}/g, UPDATED)
    .replace(/\{\{ROYALTY\}\}/g, pct(ROYALTY_BPS)).replace(/\{\{MARKET_FEE\}\}/g, pct(MARKET_FEE_BPS))
    .replace(/\{\{CHAT_DAYS\}\}/g, String(Math.max(1, +(process.env.CHAT_RETENTION_DAYS || 30))));
}
// returns true if it answered the request
function legalRoute(req, res, pathname){
  if (req.method !== 'GET' || !PAGES[pathname]) return false;
  const [key, title] = PAGES[pathname];
  const body = key === 'drop' ? dropRatesBody() : fs.readFileSync(path.join(DIR, `${key}.html`), 'utf8');
  res.writeHead(200, { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-cache', 'X-Content-Type-Options':'nosniff' });
  res.end(page(key, title, body));
  return true;
}

module.exports = { legalRoute };
