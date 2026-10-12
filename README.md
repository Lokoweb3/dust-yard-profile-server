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
