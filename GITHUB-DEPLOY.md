# Quick GitHub Deployment Guide

Since your repository is connected to GitHub (`Mo-420/maria-art-portfolio`), here's the simplest workflow:

## One-Time Setup (if not done already)

1. **Push your code to GitHub**:
   ```bash
   git push origin main
   ```

2. **Connect Cloudflare to GitHub** (if not already connected):
   - Go to https://dash.cloudflare.com → Pages
   - Click your project or "Create a project"
   - Select "Connect to Git" → GitHub
   - Choose `Mo-420/maria-art-portfolio`
   - Build settings:
     - Build command: `npm run build`
     - Build output directory: `dist`
   - Click "Save and Deploy"

## Daily Workflow (After Setup)

1. **Make changes** to your files locally
2. **Test locally**: `./start-local.sh`
3. **Run the safe local package/runtime proof** while `./start-local.sh` is still running: `npm run verify:launch-local`
4. **Run the full local verify before handoff or deploy prep**: `npm run verify:local`
5. **Run readiness check**: `npm run check:readiness`
   - Before the first live launch, this should clearly show what is still missing: usually live site deployment, `portfolio.maryilu.com` DNS, Stripe secrets/webhook, and Instagram credentials.
   - After launch, treat any failing production, DNS, Stripe, or Instagram check as a blocker.
6. **Generate the launch report**: `npm run launch:report`
   - This prints the passing local evidence, the exact production blockers, and the safe launch order.
   - It never prints secret values; it only shows the `wrangler secret put ...` commands and deployment steps.
7. **Check Cloudflare inventory** when you have a Cloudflare token:
   ```bash
   export CLOUDFLARE_ACCOUNT_ID=...
   export CLOUDFLARE_API_TOKEN=...
   npm run status:cloudflare -- --write
   ```
   - This is read-only. It verifies the Pages project, latest deployment, Worker, visible secret names, and DNS records.
   - It writes `CLOUDFLARE-STATUS.md` when `--write` is provided.
8. **Commit and push when GitHub is the deploy source**:
   ```bash
   git add .
   git commit -m "Update Maryilu store"
   git push origin main
   ```
9. **Or deploy directly when Cloudflare API deploys are configured**:
   ```bash
   export CLOUDFLARE_API_TOKEN=...
   export CLOUDFLARE_PAGES_PROJECT=maria-art-portfolio
   npm run deploy
   ```
10. **Check** https://maryilu.com and `npm run check:readiness`.

## Worker + Store Data

The website deploy and the commerce/data Worker are separate:

1. Deploy the Worker with `npm run deploy:worker` (`wrangler.toml` deploys `maria-art-data-api`).
2. Configure Worker secrets for `ADMIN_TOKEN`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `INSTAGRAM_ACCESS_TOKEN`, and `INSTAGRAM_USER_ID`.
3. Configure Stripe to send Checkout webhooks to `/stripe-webhook`.
4. Optional but recommended: set `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` and `INSTAGRAM_APP_SECRET`, then subscribe Meta to `/instagram-webhook` so new posts can nudge sync immediately instead of waiting for the 30-minute cron.
5. Verify `/shop-items` and `/instagram-media` return JSON before calling the store fully live.
6. Protect `/admin.html` with Cloudflare Access, the built-in `ADMIN_PAGE_PASSWORD` Pages gate, or an equivalent private login before handing Maria the URL or Android wrapper. The Pages Worker fails closed if neither `ADMIN_PAGE_PASSWORD` nor deliberate `ADMIN_PAGE_ACCESS_MANAGED=true` external gating is configured.
7. Add `portfolio.maryilu.com` to the Pages project/DNS, then set `PORTFOLIO_REDIRECT_READY=true` only after it resolves.

## Current Known Cloudflare Targets

- Pages project: `maria-art-portfolio`
- Worker: `maria-art-data-api`
- Production domains expected after deploy: `maryilu.com`, `www.maryilu.com`, and `portfolio.maryilu.com`
- Keep `PORTFOLIO_REDIRECT_READY=false` until `portfolio.maryilu.com` resolves.

## That's It!

No manual uploads needed after GitHub integration. Just push to GitHub and Cloudflare handles the Pages deploy.
