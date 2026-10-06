# Dust Yard profile server

Mints one soulbound profile NFT per claimed player on X1 and updates its stats at milestones. The server pays all fees.

## Deploy on Railway

1. Put this folder in a new **GitHub repository** (upload the files on github.com, or push with git).
2. On **railway.com**, create a project with **New → GitHub Repo** and pick the repository. Railway detects Node.js and runs `npm start`.
3. **Add a volume** so profiles and the server wallet survive redeploys: in the project, **New → Volume**, attach it to this service, mount path **`/data`**.
4. In the service's **Variables** tab, add:
   - `DATA_DIR` = `/data`
   - `PUBLIC_URL` = your Railway address from step 5 (for example `https://dust-yard-profile.up.railway.app`)
   - `ALLOWED_ORIGIN` = your game's address (for example `https://your-game.netlify.app`)
   - optional: `X1_RPC` if you use a private X1 RPC
5. In **Settings → Networking**, click **Generate Domain**. Copy it into `PUBLIC_URL` (step 4) and redeploy.
6. Open `https://YOUR-DOMAIN/health`. It shows `feePayer`, the server wallet created on first start.
7. Send a **small** amount of XNT to that `feePayer` address. Check `/health` again to see `feePayerXnt`.
8. Put `https://YOUR-DOMAIN` into `PROFILE_API` in the game, then redeploy the game.

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
