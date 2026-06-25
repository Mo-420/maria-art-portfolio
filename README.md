# Maryilu Sales Site + Maria Luisa's Art Portfolio

A static Maryilu website with two public surfaces:

- Sales site at `/` for custom handmade gifts, available art, and order requests.
- Portfolio site at `/portfolio.html`; production should serve it from `https://portfolio.maryilu.com/`.

## Features

- Custom gift sales homepage with pricing, policies, and order form
- Portfolio page with dynamic artwork and poetry
- Instagram media cache through Meta's official API once credentials are connected, with local simulation for QA
- Instagram caption analysis that turns priced available posts into hidden shop candidates for admin review
- Admin caption-agent preview for testing social captions before creating hidden drafts
- Stripe Checkout through the Cloudflare Worker, with no secret keys in browser code
- Admin portal for artwork, poetry, shop items, content, and order leads
- Admin automation status check for Stripe, Instagram, shop items, and leads
- Recent automation event log plus optional webhook alerts for new leads, Instagram review candidates, sync failures, and payment outcomes
- Cloudflare Worker + KV storage for shared data
- Protected admin image uploads through a Cloudflare R2 `ART_IMAGES` bucket, with compressed-image fallback for local preview
- Maryilu Studio Android admin wrapper via Capacitor
- Responsive static-site deployment on Cloudflare Pages

## Local Preview

Run the static site and Worker together:

```bash
npm run dev
```

Or run them separately:

```bash
npm run dev:site
npm run dev:worker
```

Then open `http://127.0.0.1:4173/?preview=store`. Copy `.dev.vars.example` to `.dev.vars` for local Worker testing with test credentials only.

Keep `npm run dev` running in one terminal when you want browser/runtime proof. Then run the readiness checks any time you need the honest local/live status:

```bash
npm run verify:launch-local
npm run verify:runtime-local
npm run verify:local
npm run check:readiness
npm run launch:report
npm run status:cloudflare -- --write
npm run seed:local-shop
npm run simulate:instagram
npm run capture:visuals
npm run status:morning
npm run morning:handoff
npm run morning:proof
npm run agent:instagram
npm run agent:instagram:sync
```

`npm run verify:launch-local` is the safest morning proof command. It runs syntax checks, Worker behavior tests, the public build, package-only deploy preflight markers, a local store/Worker runtime smoke check, and the launch report without touching Cloudflare or Android sync. It expects `npm run dev` or both `npm run dev:site` and `npm run dev:worker` to be running.

`npm run verify:runtime-local` only checks the local preview stack: sales site markers, `/shop-items`, and protected `/automation-status`.

`npm run verify:local` should pass before handoff or deploy prep. It runs syntax checks, Worker behavior tests, the public build, a Worker deploy dry-run, and Android project verification. `npm run check:readiness` checks the built package, local preview, local Worker, production site, production Worker, portfolio DNS, and required Stripe/Instagram/admin secrets. The readiness check is expected to fail until the live Cloudflare deploy, `portfolio.maryilu.com` DNS, Stripe secrets, Stripe webhook, and Instagram credentials are fully configured.

`npm run launch:report` turns the readiness checks into an operator launch report with passing local evidence, production blockers, exact non-secret commands, and a safe launch order. Use `npm run launch:report -- --strict` when CI should fail until production is fully ready.

`npm run status:cloudflare -- --write` is a read-only Cloudflare inventory check. With `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` set, it verifies the Pages project, live store markers, Worker, visible Worker secret names, and DNS records, then writes `CLOUDFLARE-STATUS.md`.

`npm run seed:local-shop` seeds the local Worker with three polished request-led preview items so the storefront, Worker inventory, and morning report line up during local QA. It refuses non-local Worker URLs and does not enable direct checkout.

`npm run simulate:instagram` imports the same three simulated Instagram posts used by the admin `Run Local Test Import` button through the Worker’s real Instagram-to-shop conversion path. It is local-only, creates two hidden review candidates plus one public proof/inquiry item, and writes `SIMULATED-INSTAGRAM-SYNC.md`.

`npm run capture:visuals` captures clean desktop/mobile screenshots for the store and portfolio using local Chrome. Run it while `npm run dev` is active. It writes `VISUAL-QA.md`, `VISUAL-QA.json`, and the screenshot files in `qa/visuals/` used by the morning reports.

The admin Shop Items screen also exposes this local proof path as `Run Local Test Import`. It is disabled for non-local API URLs; production should use `Sync Real Instagram` after Meta credentials are configured.

`npm run status:morning` writes `MORNING-STATUS.md`, a plain-language handoff for the next operator. It summarizes the store, Stripe, Instagram agent, production deploy state, and safe next actions using the same readiness checks as the launch report.

`npm run morning:handoff` refreshes the practical morning packet in one command. It runs syntax checks, Worker behavior tests, the public build, Android wrapper verification, the no-sync Instagram agent report, the morning status report, launch-report JSON, and readiness JSON, then writes `MORNING-HANDOFF.md`. The readiness step is expected to stay red until production secrets, deploys, and DNS are complete.

`npm run morning:proof` is the cleanest “show me the morning state” command when the local preview stack is already running. It captures fresh store/portfolio/admin screenshots first, then runs the morning handoff, and writes `MORNING-PROOF.md` as a short index to the latest visual evidence, agent mode, blockers, and next actions.

`npm run agent:instagram` writes the operator-facing Instagram-to-store report without triggering a fresh Meta sync. It fetches `/automation-status`, `/agent-brief`, recent `/automation-events`, and writes `AGENT-RUN.md`. The same agent brief appears in the admin Shop Items screen with a morning operator checklist for Stripe, Instagram, Meta webhook readiness, review queue, and direct-buy readiness. Use `npm run agent:instagram:sync` only after Meta credentials are configured, or `npm run agent:instagram -- --production --token=...` after deployment to verify the live Worker without syncing.

## Deployment Commands

Deploy commands are guarded by `scripts/deploy-preflight.mjs` so they fail before touching Cloudflare if required configuration is missing.

Required shell environment:

```bash
export CLOUDFLARE_API_TOKEN=...
export CLOUDFLARE_PAGES_PROJECT=...
```

Commands:

```bash
npm run deploy:preflight -- --target all
npm run deploy:worker
npm run deploy:pages
npm run deploy
```

- `deploy:worker` deploys the commerce/data Worker from `cloudflare-worker.js`.
- `deploy:pages` builds `dist/` and deploys the static store/portfolio/admin package to Cloudflare Pages.
- `deploy` runs local verification, both preflights, the Worker deploy, and the Pages deploy.
- For a no-credentials package check, run `npm run deploy:preflight -- --target all --package-only`.
- Do not run a live deploy until the Cloudflare token, Pages project, domain routing, Worker secrets, Stripe webhook, and Instagram credentials are ready.

## Admin Access

- **URL**: `/admin.html`
- Admin publishing and lead access require the Cloudflare Worker `ADMIN_TOKEN`.
- Protect the production admin page itself with Cloudflare Access or an equivalent login gate before handoff.
- The Pages routing Worker fails closed in production if no admin-page protection is configured.
- Built-in fallback gate: set `ADMIN_PAGE_PASSWORD` and optional `ADMIN_PAGE_USER` on the Pages project to require browser Basic Auth before `/admin.html`, `/admin`, or `/admin/` is served.
- If Cloudflare Access or another external gate is already enforced in front of Pages, set `ADMIN_PAGE_ACCESS_MANAGED=true` deliberately after verifying unauthenticated requests cannot reach the admin page.
- Do not commit production credentials to this repo.

## Deployment on Cloudflare Pages

### Method 1: Direct Upload
1. Run `npm run build`
2. Run `npm run check:readiness` and confirm only expected live-credential/domain checks are failing before first deploy.
1. Go to [Cloudflare Pages](https://pages.cloudflare.com/)
2. Click "Upload assets"
3. Upload the generated `dist/` folder
4. Your site will be live at `https://your-project.pages.dev`

### Method 2: Git Integration
1. Push this code to a GitHub repository
2. Connect your GitHub account to Cloudflare Pages
3. Select your repository
4. Build settings:
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Root directory**: `/`

Do not publish the whole repository as the public site. The `dist/` folder is the production website package.

## File Structure

```
/
├── index.html          # Sales homepage
├── portfolio.html      # Art portfolio page
├── portfolio.css       # Portfolio styles
├── portfolio.js        # Portfolio data rendering
├── admin.html          # Admin portal
├── styles.css          # Main styles
├── admin.css           # Admin styles
├── script.js           # Main JavaScript
├── admin.js            # Admin JavaScript
├── site-data.js        # Sales products, copy, pricing, and policies
├── sample-data.js      # Legacy sample data
├── manifest.json       # PWA manifest
├── sw.js              # Service worker
├── _headers           # Cloudflare headers
├── robots.txt         # SEO robots file
├── sitemap.xml        # SEO sitemap
└── assets/            # Image assets
```

## Customization

### Admin Security
- Keep `ADMIN_TOKEN` configured as a Worker secret.
- Put `/admin.html` behind Cloudflare Access, Cloudflare Pages access control, the built-in `ADMIN_PAGE_PASSWORD` gate, or an equivalent private login before launch. The Worker token protects mutations, but the admin interface should not be a public surface.
- The public order form can submit leads without a token.
- Reading leads and publishing content require the token.
- Shop review actions are grouped by risk in the admin: safe edits, public publish, payment approval, and source links. Local simulated Instagram items cannot be approved for direct Stripe checkout.
- The Shop Items screen includes an `Upload Art` composer and per-item image replacement. Uploads save or update the image only; publishing and direct checkout still require separate review actions.
- Production image uploads should use the Worker `ART_IMAGES` R2 bucket. If the bucket is not connected during local preview, the admin stores an optimized compressed image on the hidden/request-only shop item so real art can still be reviewed without placeholder cards.

### Instagram Sync
- Use Meta's official Instagram API; do not scrape Instagram pages.
- Configure Worker secrets `INSTAGRAM_ACCESS_TOKEN` and `INSTAGRAM_USER_ID`.
- The Worker refreshes cached Instagram media every 30 minutes.
- Optional near-real-time updates: configure `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` and `INSTAGRAM_APP_SECRET`, then subscribe the Meta app to `https://YOUR_WORKER_URL/instagram-webhook`. Signed webhook notifications queue the same official Meta API sync path.
- Admin can also run a manual sync from `/admin.html`.
- Admin can run `Run Local Test Import` from `/admin.html` only against the local Worker. The Worker also rejects simulated imports outside localhost unless `ALLOW_SIMULATED_INSTAGRAM_SYNC=true` is set for an intentional QA environment.
- Operators can run `npm run agent:instagram` to write a morning-readable `AGENT-RUN.md` report without triggering a fresh Meta sync. After Meta credentials are configured, `npm run agent:instagram:sync` triggers the same protected sync and updates the report with sync health, review candidates, commerce status, blockers, and recent automation events.
- Caption analysis detects category, EUR price, sale status, sale-signal confidence, evidence signals, guardrail warnings, and whether the post should be direct checkout or inquiry-only.
- Newly synced priced Instagram posts are treated as hidden direct-checkout candidates first; Maria/admin should review the title, category, price, status, and photo before making them visible and buyable.
- The protected `/analyze-caption` endpoint powers the admin preview, so captions can be checked before a hidden shop draft is created. The preview shows agent evidence, guardrail warnings, and a five-step review checklist before the draft can be published.
- Each reviewed shop item has safe approval actions: publish as inquiry/proof, approve direct checkout only after Stripe is configured plus price/image are present, or keep the draft hidden for later.
- Admin can still upload art or create manual shop items if Instagram credentials are not ready or a piece needs to be listed directly.
- The Shop Items panel includes a launch console that separates ready systems, required blockers, review-queue warnings, and the next setup action.
- The Worker stores recent automation events in KV and can optionally post new lead, Instagram review, sync-health, and payment alerts to `NOTIFICATION_WEBHOOK_URL`.

### Stripe Checkout
- Configure Worker secrets `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`.
- Direct artwork checkout uses `/checkout/artwork`.
- Custom order deposits and final balances are generated from admin payment links.
- Webhooks post to `/stripe-webhook` and update artwork/order states. Subscribe Stripe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, and `checkout.session.async_payment_failed`.
- Admin can verify setup through `/automation-status` from the Shop Items panel, including Stripe readiness, Instagram automation readiness, review candidates, and direct-buy inventory.

### Automation Alerts
- The Worker records recent automation events at protected `/automation-events`.
- Events currently include new custom-order requests, newly detected Instagram direct-checkout candidates, Instagram sync failures, sold artwork, released reservations, and custom-order payment outcomes.
- Optional external alerting uses Worker variables/secrets:
  - `NOTIFICATION_WEBHOOK_URL`
  - `NOTIFICATION_WEBHOOK_TOKEN`
- Leave those unset if you only want the admin event log.

### Worker Tests
- Run `npm run test:worker` to exercise the Worker without real Stripe or Instagram credentials.
- The test covers caption analysis, admin image uploads/media serving, hidden Instagram checkout candidates, signed Instagram webhook nudges, public inquiry proof items, direct artwork checkout reservation, paid/unpaid Stripe webhook behavior, order lead creation, automation events, automation status, and Pages routing for `portfolio.maryilu.com`.

### Android Admin App
- See `MOBILE-APP.md` for the Maryilu Studio Android wrapper.
- Run `npm run mobile:sync` after changing `capacitor.config.json`.
- Run `npm run mobile:android:debug` to build a local debug APK.
- The app loads `https://maryilu.com/admin.html`, so do not hand off a production APK until the live Maryilu admin page is access-protected and the Worker is deployed.

## Performance Features

- **Service Worker**: Offline functionality
- **PWA Support**: Installable as an app
- **Optimized Images**: Responsive image loading
- **Caching**: Smart cache headers for fast loading

## Browser Support

- Chrome/Edge 88+
- Firefox 85+
- Safari 14+
- Mobile browsers

## License

© 2026 Maryilu. All rights reserved.
