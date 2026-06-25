# Cloudflare Worker + KV Backend Setup

The Maryilu store, admin portal, Instagram ingestion, custom-order leads, and Stripe checkout paths are now wired for a shared Cloudflare Worker + KV backend. Local previews can still fall back to seeded/static data, but the live site should use the Worker with production secrets configured.

## Quick Setup Steps

Use the repo scripts as the source of truth for production. The expected live targets are:

- Cloudflare Pages project: `maria-art-portfolio`
- Cloudflare Worker: `maria-art-data-api`
- Main store: `https://maryilu.com/`
- Portfolio: `https://portfolio.maryilu.com/`

Safe production order:

1. Keep `npm run dev` running and keep `npm run verify:launch-local` green for safe local package plus runtime proof.
2. Run `npm run verify:local` before handoff or deploy prep when Worker dry-run and Android verification should be checked too.
3. Deploy the Worker with `npm run deploy:worker`.
4. Configure Worker secrets and variables.
5. Create the Stripe webhook and set `STRIPE_WEBHOOK_SECRET`.
6. Deploy Pages with `npm run deploy:pages`.
7. Protect `/admin.html` with Cloudflare Access, the built-in `ADMIN_PAGE_PASSWORD` Pages gate, or an equivalent login gate.
8. Add `portfolio.maryilu.com` to Pages/DNS.
9. Set `PORTFOLIO_REDIRECT_READY=true` only after the portfolio subdomain resolves.
10. Run `npm run check:readiness` and `npm run launch:report`.

## Local Development

1. Copy `.dev.vars.example` to `.dev.vars`.
2. Fill in local/test values only. Keep production secrets in Cloudflare.
3. Start the static website and local Worker together: `npm run dev`
4. Open `http://127.0.0.1:4173/?preview=store`.
5. In another terminal, run `npm run morning:proof` when you need fresh screenshots plus the morning handoff packet. Use `npm run capture:visuals` only when you need screenshots without regenerating the reports.

For debugging, you can still run the two pieces separately with `npm run dev:site` and `npm run dev:worker`.

The storefront can render without the Worker, but Stripe checkout, Instagram sync, lead storage, and admin shop review require the Worker to be running.

### 1. Create KV Namespace
1. Go to Cloudflare Dashboard → Workers & Pages → KV
2. Click "Create a namespace"
3. Name it `ART_DATA`
4. Note the namespace ID

### 2. Create Worker
1. Go to Workers & Pages → Create application → Create Worker
2. Name it `maria-art-data-api`
3. Deploy from this repo with `npm run deploy:worker`
4. If creating it manually for an emergency, copy the code from `cloudflare-worker.js` into the Worker and keep the `ART_DATA` binding plus cron trigger aligned with `wrangler.toml`

### 3. Bind KV Namespace to Worker
1. In your worker settings, go to "Variables and Secrets"
2. Under "KV Namespace Bindings", click "Add binding"
3. Variable name: `ART_DATA`
4. KV namespace: Select `ART_DATA`
5. Save

`wrangler.toml` already points at the current KV namespace for this project. If you create a new namespace, update `wrangler.toml` before deploying.

### 3a. Connect Image Storage
The admin `Upload Art` and Store Images flows store real shop images through the Worker.

Preferred no-R2 setup:

1. Deploy the AX42 storage service from `storage/` to `/opt/maryilu-storage`.
2. Route `https://media.maryilu.com` to `http://maryilu-image-storage:18142` through the dedicated `maryilu-media-ax42` Cloudflare Tunnel.
3. Set Worker secrets `MARYILU_IMAGE_STORAGE_URL` and `MARYILU_IMAGE_STORAGE_TOKEN`.
4. Keep the same token in `/opt/maryilu-storage/.env` as `MARYILU_STORAGE_TOKEN`.

Optional Cloudflare R2 setup:

1. Create a bucket named `maryilu-art-images`.
2. Bind it to the Worker as `ART_IMAGES`.
3. Restore the commented `[[r2_buckets]]` block in `wrangler.toml`.

The Worker serves uploaded files from `/media/...`. Uploading an image only updates the shop item image; public publishing and direct Stripe checkout stay behind the existing admin review buttons.

### 3b. Add Admin Token for Order Requests
1. In the same Worker settings, go to "Variables and Secrets"
2. Add a secret named `ADMIN_TOKEN`
3. Use a long private value
4. In `/admin.html`, open "Order Requests", enter the same token, and save it in the browser

The public order form can submit without this token. Reading leads, updating lead statuses, and publishing artwork, poetry, or site content requires it.

Before production handoff, also protect `/admin.html` with Cloudflare Access, Cloudflare Pages access control, the built-in `ADMIN_PAGE_PASSWORD` gate, or an equivalent private login gate. The Worker token protects admin operations, but the admin interface itself should not be an open public page. The Pages routing Worker now fails closed in production when no admin-page protection is configured.

Built-in fallback gate:

1. Set a Pages environment variable or secret named `ADMIN_PAGE_PASSWORD`.
2. Optionally set `ADMIN_PAGE_USER`; it defaults to `maryilu`.
3. Redeploy Pages.
4. A browser opening `/admin.html`, `/admin`, or `/admin/` will receive a Basic Auth prompt before the admin page is served.

Cloudflare Access is still the preferred option for SSO/team access, but the built-in gate is enough to make the admin page private when Access is not configured yet. If Cloudflare Access is already enforced in front of Pages and you do not want the Basic Auth fallback, set `ADMIN_PAGE_ACCESS_MANAGED=true` only after verifying unauthenticated requests are blocked by Access.

### 3c. Add Stripe Checkout Secrets
Stripe runs only through the Worker. Do not put secret keys in `index.html`, `script.js`, or any browser file.

1. In Stripe, use test mode first.
2. Add these Worker secrets:
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
3. Add a webhook endpoint in Stripe that points to:
   - `https://YOUR_WORKER_URL/stripe-webhook`
4. Subscribe the webhook to these Checkout events:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.expired`
   - `checkout.session.async_payment_failed`
5. Set `PUBLIC_SITE_URL` as a Worker variable if the public site is not `https://maryilu.com`.

Recommended launch sequence for Stripe:

1. Set `STRIPE_SECRET_KEY`.
2. Deploy the Worker.
3. Create the webhook endpoint at `https://maria-art-data-api.maros-pristas.workers.dev/stripe-webhook` or the custom Worker route if one is added.
4. Copy the webhook signing secret into `STRIPE_WEBHOOK_SECRET`.
5. Run `npm run check:readiness` and confirm Stripe blockers disappear before enabling direct-buy items.

Direct one-of-one artwork checkout uses `/checkout/artwork`. Custom orders stay quote-led: admin creates deposit/final payment links from an order request. The webhook marks completed artwork checkouts as sold, releases expired/failed artwork reservations, and records paid/expired/failed custom-order payments in the admin automation event log.

### 3d. Add Instagram API Credentials
Use Meta's official Instagram API instead of scraping.

1. Make sure Maria's Instagram account is a Creator or Business account.
2. Create/configure a Meta app with Instagram API access.
3. Add these Worker secrets:
   - `INSTAGRAM_ACCESS_TOKEN`
   - `INSTAGRAM_USER_ID`
   - Optional for near-real-time Meta webhook nudges: `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`
   - Optional for signed Meta webhook POSTs: `INSTAGRAM_APP_SECRET`
   - Optional: `INSTAGRAM_GRAPH_VERSION` (defaults to `v24.0`)
4. The Worker refreshes `/instagram-media` every 30 minutes and the admin can also click "Sync Instagram".
5. For faster post-to-site updates, add `https://YOUR_WORKER_URL/instagram-webhook` to the Meta app webhook settings:
   - Meta's verification request uses `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`.
   - Meta POST notifications must include `X-Hub-Signature-256`; the Worker verifies it with `INSTAGRAM_APP_SECRET`.
   - Signed webhook notifications queue the same official Meta API sync used by the cron trigger.

Production should use `Sync Real Instagram` only after both Meta credentials are configured. Local preview imports are intentionally blocked from becoming direct checkout inventory.

The Instagram ingestion agent reads captions from the official Meta API, detects likely category, EUR price, sale status, hashtags, sale-signal confidence, and whether a post should be direct checkout or inquiry-only. Every post can publish as portfolio/social proof; priced and available posts become hidden direct-checkout candidates until Maria/admin reviews and publishes them.

Run the same operator pass from the repo with:

```bash
npm run agent:instagram
```

The default command is a no-sync status report so it does not create noisy "missing credentials" events before Meta is connected. After Meta credentials are configured, run `npm run agent:instagram:sync` to trigger `/sync-instagram` and refresh the report. After production deploy, verify the live Worker with `npm run agent:instagram -- --production --token=PRODUCTION_ADMIN_TOKEN`. The command writes `AGENT-RUN.md` with sync health, cached posts, review queue, commerce state, required blockers, and recent automation events.

For local visual QA before Instagram credentials are ready, run:

```bash
npm run seed:local-shop
```

This upserts three curated request-only preview items into the local Worker and writes `LOCAL-SHOP-SEED.md`. It refuses non-local Worker URLs and never approves direct checkout.

To prove the Instagram-to-store agent path before Meta credentials are available, run:

```bash
npm run simulate:instagram
```

This calls the protected `/simulate-instagram-sync` endpoint on the local Worker, imports the same three simulated Instagram posts used by the admin local test button through the same caption analysis/rebuild path as real sync, writes `SIMULATED-INSTAGRAM-SYNC.md`, keeps two priced available posts hidden for review, and publishes one non-priced post as proof/inquiry.

The same local proof path is available in `/admin.html` → Shop Items → Run Local Test Import. The button is disabled when the admin is pointed at a non-local Worker, and the Worker rejects simulated imports outside localhost unless `ALLOW_SIMULATED_INSTAGRAM_SYNC=true` is deliberately configured for a QA environment.

Use `/admin.html` → Shop Items → Caption agent preview to paste a caption into `/analyze-caption`, inspect the inferred title, category, price, status, confidence, publish targets, evidence signals, guardrail warnings, and five-step review checklist, then create a hidden draft if the result looks right. Keep the draft hidden until Maria confirms the exact image, price, availability, and shipping path.

If Instagram credentials are not ready, use `/admin.html` → Shop Items → Upload Art for real artwork photos or Quick Hidden Draft for text-only setup. Uploaded/manual items stay hidden by default unless explicitly saved as request-only public content; direct checkout still requires Stripe setup plus a separate approval action.

Use `/admin.html` → Shop Items to read the automation status panel. It checks whether Stripe secrets, Stripe webhook secret, Instagram token, Instagram user ID, optional Instagram webhook credentials, cached posts, last Instagram sync attempt/error, visible shop items, buyable items, review candidates, and leads are present. The launch console also calls out required blockers, optional watch items, and the next setup action.

### 3e. Optional Automation Alerts
The Worker always keeps a protected recent event log at `/automation-events`. To also send alerts to a third-party workflow, configure:

- `NOTIFICATION_WEBHOOK_URL`
- `NOTIFICATION_WEBHOOK_TOKEN` (optional)

Use this for Slack, Discord, Make, Zapier, or another private receiver. The webhook receives non-secret event data for new custom-order requests and Instagram review candidates.

### 4. Verify API URL
`data-api.js` is already included by the public store and admin portal. Before production launch, confirm its production Worker URL matches the deployed Worker route and that these endpoints return JSON:

- `/shop-items`
- `/instagram-media`
- `/media/<uploaded-key>` after a test admin upload
- `/automation-status` with an admin token
- `/order-requests` with an admin token

If the Worker URL changes, update `data-api.js`, rebuild, and rerun `npm run check:readiness`.

### 5. Verify The Site Wiring
The browser code already uses `DataAPI` for shared Worker-backed data. Confirm this with:

```bash
npm run check:syntax
npm run test:worker
npm run build
npm run verify:runtime-local
npm run verify:launch-local
npm run check:readiness
```

`npm run check:readiness` should remain red until production secrets, DNS, the Worker deploy, and the Pages deploy are complete.

## Alternative: Simple JSON File Approach

If you don't want to set up Workers, you can:
1. Store data in a `data.json` file in your repo
2. Have admin portal commit changes via GitHub API
3. Main site loads from `data.json`

This requires GitHub authentication but is simpler than Workers.

## Current Data Flow

The current data flow is:

1. The public store loads curated/static fallback content first so the site is never blank.
2. `DataAPI` then reads the Worker for `/shop-items`, `/instagram-media`, and shared site data.
3. The public order form submits custom-order leads to `/order-requests`.
4. Admin reads leads, shop items, automation status, and recent events with `ADMIN_TOKEN`.
5. Instagram sync uses Meta's official API and turns posts into proof/inquiry cards or hidden direct-checkout review candidates.
6. Stripe checkout and webhooks run only through the Worker; no Stripe secret is exposed to browser code.
