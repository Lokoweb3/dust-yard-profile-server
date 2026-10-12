# Dust Yard profile server

Mints one soulbound profile NFT per claimed player on X1 and updates its stats at milestones. The server pays all fees.

It also hosts the game: `public/index.html` is served at your Railway address, so players open that one address to play, and the game connects to the server automatically. To update the game, replace `public/index.html` and commit.

## Deploy on Railway

1. Put this folder in a new **GitHub repository** (upload the files on github.com, or push with git).
2. On **railway.com**, create a project with **New → GitHub Repo** and pick the repository. Railway detects Node.js and runs `npm start`.
3. **Add a volume** so profiles and the server wallet survive redeploys: in the project, **New → Volume**, attach it to this service, mount path **`/data`**.
4. In the service's **Variables** tab, add:
   - `DATA_DIR` = `/data`
   - `PUBLIC_URL` = your Railway address from step 5 (for example `https://dust-yard-profile.up.railway.app`)
   - optional: `X1_RPC` if you use a private X1 RPC
5. In **Settings → Networking**, click **Generate Domain**. Copy it into `PUBLIC_URL` (step 4) and redeploy.
6. Open `https://YOUR-DOMAIN/health`. It shows `feePayer`, the server wallet created on first start.
7. Send a **small** amount of XNT to that `feePayer` address. Check `/health` again to see `feePayerXnt`.
8. Open `https://YOUR-DOMAIN` to play. The game finds the server by itself.

Railway sets `PORT` automatically; the server already uses it.

## Check it before deploying

```
npm install
npm run dry-run
```

This builds sample mint and update transactions offline and prints their sizes.

## Keep it safe

- The server wallet key lives in `/data/server-keypair.json` on the volume. Never commit it to GitHub.
- Keep only a small XNT balance in the fee payer and top it up as needed.
- `profiles.json` on the volume is fine for testing. Move to a database (Railway offers Postgres) before you have many players.
- Replace `validateSummary()` with checks against match sessions recorded by your server before rewards have real value.

## Checks before every deploy (CI)

Every push and pull request runs `.github/workflows/ci.yml` on GitHub:

1. **Repo safety checks** (`npm run check`): no wallet keys, `data/` files or `.env` committed; `public/index.html` is a real game build (not an empty upload); the server code parses.
2. **Server smoke test** (`npm run test:smoke`): the server starts, `/health` answers, the game page is served, and co-op squad rooms keep players apart.
3. **Game in a real browser** (`npm run test:e2e`): a solo wave match starts with no errors, and two players form a co-op squad and start a match together. Screenshots are kept with each run.

In Railway, open the service → Settings → turn on **Wait for CI**, so a deploy only goes out when these pass.

Run everything locally with `npm test` (the browser test needs `npx playwright install chromium` once).

## Code map

`profile-server.js` starts the server and routes each request. Everything else lives in `lib/`:

| File | What it does |
|---|---|
| `lib/config.js` | Settings read from environment variables (RPC, public URL, data folder) |
| `lib/state.js` | The server keypair, shared by the modules that sign transactions |
| `lib/util.js` | Small shared helpers: stable JSON, hashing, signature checks, string limits |
| `lib/chain.js` | X1 transaction helpers: fitting compute limits, building profile NFT transactions |
| `lib/profiles.js` | Player profiles: signed sync messages, stat checks, the player card image |
| `lib/social.js` | Leaderboard, chat and market posts, plus live WebSocket rooms (plaza and co-op squads) |
| `lib/proxy.js` | Fetches NFT art from allowlisted hosts so the game can draw it in 3D |
| `lib/items.js` | Tradeable cosmetics: catalog, match drops, item NFTs with royalties |
| `lib/market.js` | In-game NFT marketplace: non-custodial listings and purchases in XNT |
| `lib/swap.js` | XDEX swaps between XNT and USDC.X |
| `lib/badges.js` | Achievement badges: free soulbound NFTs for milestones |
| `lib/portfolio.js` | Wallet portfolio with dollar values |

## The game

- **Source:** `game/dust-yard.html`. It's a single self-contained file (it also runs on its own as the claude.ai version), so edit this one.
- **Build:** `npm run build` writes what Railway serves: `public/index.html` (minified, about 1.2 MB) and `public/assets/` (models and textures, named by content hash so browsers cache them until they change).
- Commit both the source and the build. CI fails if `public/` is out of date with the source.
- The HD wolf head (0.8 MB) only downloads when someone picks it or meets armored Wolf Pack raiders.

## Compliance features

Not legal advice; have a lawyer confirm the settings below.

- **Age check:** a neutral date-of-birth screen on first visit. Under 13 can't play; 13 to 17 can play but wallets, swaps, the NFT market and NFT claims are turned off. Only the result (`u13`, `teen`, `adult`) is stored in the player's browser, never the birthday.
- **Sanctions screening** (`lib/compliance.js`): requests that build or sign transactions (swaps, market, item and badge claims, profile NFT) are refused with HTTP 451 when:
  - the player's IP is in a blocked country (`BLOCKED_COUNTRIES`, default `CU,IR,KP,RU`), using a local GeoLite2 database with no outside lookups; or
  - any wallet address in the request is on the US Treasury (OFAC) sanctioned-address list (refreshed every 12 hours, with a bundled copy as fallback; `SANCTIONS_LIST_URL` to change the source).
  - Limitation: Crimea, Donetsk and Luhansk can't be told apart from the rest of Ukraine with country-level data.
  - Nothing is stored: IPs and addresses are checked and forgotten.
- **Chat retention:** chat messages are deleted after 30 days (`CHAT_RETENTION_DAYS`).

This product includes GeoLite2 data created by MaxMind, available from https://www.maxmind.com.

### Legal and transparency pages
`/terms`, `/privacy`, `/risk` (drafts in `legal/`, marked for legal review) and `/drop-rates` (built live from the item catalog). Set `CONTACT_EMAIL` in Railway so the pages show your contact address. The game links to them from the main menu, the age check and the Items app.
