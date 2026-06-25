#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const rootDir = process.cwd();
const args = new Set(process.argv.slice(2));
const jsonMode = args.has("--json");
const strictMode = args.has("--strict");

function readPackageName() {
    const path = join(rootDir, "package.json");
    if (!existsSync(path)) return "Maryilu";
    try {
        const pkg = JSON.parse(readFileSync(path, "utf8"));
        return pkg.name || "Maryilu";
    } catch {
        return "Maryilu";
    }
}

function runReadiness() {
    const result = spawnSync(process.execPath, ["scripts/readiness-check.mjs", "--json"], {
        cwd: rootDir,
        encoding: "utf8",
        env: process.env
    });

    const stdout = String(result.stdout || "").trim();
    if (!stdout) {
        throw new Error(String(result.stderr || "readiness-check produced no JSON output").trim());
    }

    try {
        return JSON.parse(stdout);
    } catch (error) {
        throw new Error(`Could not parse readiness JSON: ${error.message}\n${stdout.slice(0, 500)}`);
    }
}

function command(text) {
    return { type: "command", text };
}

function action(text) {
    return { type: "action", text };
}

function docs(text) {
    return { type: "docs", text };
}

function actionsForCheck(check) {
    const name = check.name || "";
    const message = check.message || "";
    const url = check.url || "";

    if (name.includes("STRIPE_SECRET_KEY")) {
        return [
            action("Create or copy a Stripe secret key from Stripe test/live mode, depending on launch stage."),
            command("wrangler secret put STRIPE_SECRET_KEY"),
            docs("Keep this out of browser code and out of git. The Worker reads it only server-side.")
        ];
    }

    if (name.includes("STRIPE_WEBHOOK_SECRET")) {
        return [
            action("After the Worker is deployed, create a Stripe Checkout webhook endpoint pointing at /stripe-webhook."),
            command("wrangler secret put STRIPE_WEBHOOK_SECRET"),
            docs("After deploying the Worker, use Stripe Dashboard -> Developers -> Webhooks -> Add endpoint.")
        ];
    }

    if (name.includes("INSTAGRAM_ACCESS_TOKEN")) {
        return [
            action("Generate a Meta Instagram API access token for Maria's Creator/Business account."),
            command("wrangler secret put INSTAGRAM_ACCESS_TOKEN"),
            docs("Do not scrape Instagram pages. This site uses the official Meta API.")
        ];
    }

    if (name.includes("INSTAGRAM_USER_ID")) {
        return [
            action("Find the Instagram Business/Creator user ID connected to the Meta app."),
            command("wrangler secret put INSTAGRAM_USER_ID"),
            docs("This is required for scheduled /instagram-media refreshes and admin sync.")
        ];
    }

    if (name === "Production sales site") {
        return [
            action("Deploy the built Cloudflare Pages package so maryilu.com serves the current store, not the old portfolio homepage."),
            command("export CLOUDFLARE_API_TOKEN=..."),
            command("export CLOUDFLARE_PAGES_PROJECT=maria-art-portfolio"),
            command("npm run deploy:pages"),
            docs(`Current check: ${message}${url ? ` (${url})` : ""}`)
        ];
    }

    if (name === "Production Worker shop items") {
        return [
            action("Deploy the commerce/data Worker and confirm /shop-items returns JSON."),
            command("export CLOUDFLARE_API_TOKEN=..."),
            command("npm run deploy:worker"),
            docs("Worker target from wrangler.toml: maria-art-data-api"),
            docs(`Current check: ${message}${url ? ` (${url})` : ""}`)
        ];
    }

    if (name === "Production admin access gate") {
        return [
            action("Protect /admin.html with Cloudflare Access, the built-in ADMIN_PAGE_PASSWORD Pages gate, or an equivalent login gate before giving Maria the admin URL or Android wrapper."),
            action("For the built-in gate, set ADMIN_PAGE_PASSWORD and optional ADMIN_PAGE_USER on the Pages project, then redeploy Pages."),
            action("Keep Worker admin endpoints protected with ADMIN_TOKEN even after the page is behind an access gate."),
            docs(`Current check: ${message}${url ? ` (${url})` : ""}`)
        ];
    }

    if (name === "Portfolio DNS") {
        return [
            action("Add portfolio.maryilu.com to Cloudflare Pages as a custom domain or route it to the Pages project."),
            action("Create the required DNS record, usually a CNAME from portfolio to the Pages host."),
            action("Only after DNS resolves, set PORTFOLIO_REDIRECT_READY=true to enable the canonical /portfolio.html redirect."),
            docs(`Current DNS check: ${message}`)
        ];
    }

    if (name.includes("Local")) {
        return [
            action("Start the local site and Worker before rechecking."),
            command("npm run dev:site"),
            command("npm run dev:worker")
        ];
    }

    if (name.includes("Built")) {
        return [
            action("Rebuild the public package."),
            command("npm run build")
        ];
    }

    return [
        action(`Inspect and fix: ${name} - ${message}`)
    ];
}

function groupFailures(checks) {
    return checks
        .filter((check) => check.required !== false && !check.ok)
        .map((check) => ({
            name: check.name,
            message: check.message,
            url: check.url || "",
            actions: actionsForCheck(check)
        }));
}

function printText(report) {
    console.log(`# ${report.title}`);
    console.log("");
    console.log(`Checked at: ${report.checkedAt}`);
    console.log(`Status: ${report.ready ? "READY" : "NOT READY"}`);
    console.log("");

    console.log("## Passing Local Evidence");
    for (const check of report.passingLocal) {
        console.log(`- OK ${check.name}: ${check.message}`);
    }
    if (!report.passingLocal.length) console.log("- None yet.");
    console.log("");

    console.log("## Production Blockers");
    if (!report.blockers.length) {
        console.log("- None. Production readiness checks are green.");
    } else {
        report.blockers.forEach((blocker, index) => {
            console.log(`${index + 1}. ${blocker.name}: ${blocker.message}`);
            for (const item of blocker.actions) {
                const prefix = item.type === "command" ? "   $" : "   -";
                console.log(`${prefix} ${item.text}`);
            }
        });
    }
    console.log("");

    console.log("## Safe Launch Order");
    report.launchOrder.forEach((item, index) => {
        console.log(`${index + 1}. ${item}`);
    });
}

function main() {
    const readiness = runReadiness();
    const blockers = groupFailures(readiness.checks || []);
    const passingLocal = (readiness.checks || []).filter((check) => {
        return check.ok && (
            check.name.startsWith("Built") ||
            check.name.startsWith("Local") ||
            check.name === "Secret ADMIN_TOKEN"
        );
    });

    const report = {
        title: `${readPackageName()} Launch Report`,
        checkedAt: readiness.checkedAt,
        ready: Boolean(readiness.ok),
        blockers,
        passingLocal,
        launchOrder: [
            "Keep npm run dev running and npm run verify:launch-local green for safe local package plus runtime proof.",
            "Run npm run verify:local before handoff or deploy prep when Android sync and Worker dry-run should be checked too.",
            "Configure STRIPE_SECRET_KEY plus the Instagram access token and user ID.",
            "Deploy the Worker and confirm production /shop-items returns JSON.",
            "Create the Stripe webhook to the deployed Worker /stripe-webhook route.",
            "Set STRIPE_WEBHOOK_SECRET from the Stripe webhook signing secret.",
            "Deploy the Pages package so maryilu.com serves the store.",
            "Protect /admin.html with Cloudflare Access, ADMIN_PAGE_PASSWORD, or an equivalent private login before handing off the admin URL or Android wrapper.",
            "Attach portfolio.maryilu.com to the Pages project and verify DNS.",
            "Set PORTFOLIO_REDIRECT_READY=true only after portfolio.maryilu.com resolves.",
            "Run npm run check:readiness until all required checks pass."
        ]
    };

    if (jsonMode) {
        console.log(JSON.stringify(report, null, 2));
    } else {
        printText(report);
    }

    if (strictMode && !report.ready) process.exit(1);
}

main();
