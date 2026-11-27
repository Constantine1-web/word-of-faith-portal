import assert from "node:assert/strict";
import {
  auditEmailDomainDns,
  evaluateProductionEnvReadiness,
  extractDomainFromEmailAddress,
} from "../src/lib/production-readiness";
import { createUpstashRestClient, resolveUpstashRestConfig } from "../src/lib/redis";

function parseCliArg(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && process.argv[idx + 1]) {
    return process.argv[idx + 1].trim();
  }
  const eq = process.argv.find((a) => a.startsWith(`${flag}=`));
  return eq ? eq.slice(flag.length + 1).trim() : null;
}

async function main() {
  console.log("=== PRODUCTION SMOKE, EMAIL & PAYSTACK DELIVERABILITY AUDIT ===\n");

  // 1. Environment Readiness Audit
  const envChecks = evaluateProductionEnvReadiness(process.env);
  console.log("[1/4] Environment Readiness Audit:");
  for (const item of envChecks) {
    console.log(`  [${item.severity}] ${item.label}: ${item.detail}`);
  }

  // 2. Email Sender Domain DNS Check (SPF / DMARC / MX)
  const sender = process.env.RESEND_FROM || process.env.SMTP_FROM || process.env.SMTP_USER;
  const senderDomain = extractDomainFromEmailAddress(sender);
  console.log("\n[2/4] Email Sender Domain DNS Audit:");
  if (!senderDomain || senderDomain === "resend.dev") {
    console.log(
      `  [WARN] Skipping custom DNS check (sender=${sender || "not set"}). Configure a custom school domain in RESEND_FROM / SMTP_FROM.`
    );
  } else {
    const dnsResult = await auditEmailDomainDns(senderDomain);
    if (dnsResult.error) {
      console.log(`  [WARN] DNS lookup skipped/offline for ${senderDomain}: ${dnsResult.error}`);
    } else {
      console.log(`  Domain : ${dnsResult.domain}`);
      console.log(`  MX     : ${dnsResult.hasMx ? "PASS" : "WARN (missing MX)"}`);
      console.log(`  SPF    : ${dnsResult.hasSpf ? `PASS (${dnsResult.spfRecord})` : "WARN (missing v=spf1 TXT)"}`);
      console.log(`  DMARC  : ${dnsResult.hasDmarc ? `PASS (${dnsResult.dmarcRecord})` : "WARN (missing _dmarc TXT)"}`);
    }
  }

  // 3. Upstash Redis REST Live Probe
  console.log("\n[3/4] Upstash Redis REST Connectivity:");
  const restConfig = resolveUpstashRestConfig(process.env);
  if (!restConfig) {
    console.log(
      "  [INFO] No UPSTASH_REDIS_REST_* or KV_REST_API_* in current shell env. Run `vercel env pull .env.production.local` to probe live Redis."
    );
  } else {
    const client = createUpstashRestClient(restConfig.url, restConfig.token);
    const key = `smoke:probe:${Date.now()}`;
    const v = await client.incr(key);
    assert.equal(v, 1);
    await client.expire(key, 30);
    await client.del(key);
    console.log(`  [PASS] Upstash REST live round-trip succeeded (${restConfig.url}).`);
  }

  // 4. Optional Live Deployed URL Smoke Checks (--url https://your-portal.vercel.app)
  const targetUrl = (parseCliArg("--url") || process.env.SMOKE_TARGET_URL || "").replace(/\/+$/, "");
  const cronSecret = parseCliArg("--cron-secret") || process.env.CRON_SECRET?.trim() || "";

  console.log("\n[4/4] Live Deployment HTTP Smoke Checks:");
  if (!targetUrl) {
    console.log("  [INFO] No --url provided. To run against live Vercel deployment:");
    console.log("         npx.cmd tsx scripts/verify_production_smoke.ts --url https://YOUR-APP.vercel.app --cron-secret YOUR_CRON_SECRET");
    return;
  }

  // 4a. Unauthenticated cron must return 401
  const unauthCron = await fetch(`${targetUrl}/api/cron/cbt-reaper`, { method: "GET" });
  assert.equal(
    unauthCron.status,
    401,
    `Expected /api/cron/cbt-reaper without auth to return 401, got ${unauthCron.status}`
  );
  console.log("  [PASS] GET /api/cron/cbt-reaper (unauthenticated) -> 401 Unauthorized");

  // 4b. Authenticated cron check
  if (cronSecret) {
    const authCron = await fetch(`${targetUrl}/api/cron/cbt-reaper`, {
      method: "GET",
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    assert.equal(authCron.status, 200, `Authorized cron check failed with ${authCron.status}`);
    const cronJson = (await authCron.json()) as Record<string, unknown>;
    console.log(
      `  [PASS] GET /api/cron/cbt-reaper (authorized) -> 200 (reapedCount=${cronJson.reapedCount}, autoClosedExamsCount=${cronJson.autoClosedExamsCount})`
    );
  } else {
    console.log("  [INFO] Pass --cron-secret to also verify authenticated 200 cron execution.");
  }

  // 4c. Paystack Webhook invalid signature rejection (verifies secret is loaded, not 500 unconfigured)
  const skipPaystack = process.argv.includes("--skip-paystack");
  if (skipPaystack) {
    console.log("  [SKIP] POST /api/webhooks/paystack skipped (--skip-paystack active while school awaits Paystack approval)");
  } else {
    const paystackProbe = await fetch(`${targetUrl}/api/webhooks/paystack`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-paystack-signature": "00000000000000000000000000000000",
      },
      body: JSON.stringify({ event: "charge.success", data: { reference: "SMOKE_TEST_PROBE" } }),
    });
    assert.equal(
      paystackProbe.status,
      400,
      `Expected Paystack webhook invalid signature to return 400 (configured), got ${paystackProbe.status}`
    );
    console.log("  [PASS] POST /api/webhooks/paystack (bad signature) -> 400 Invalid signature");
  }

  // 4d. Exam room unauthenticated redirect + security headers
  const examRoomRes = await fetch(`${targetUrl}/portal/exam-room`, { redirect: "manual" });
  assert.equal(
    examRoomRes.status >= 300 && examRoomRes.status < 400,
    true,
    `Expected unauthenticated /portal/exam-room redirect, got ${examRoomRes.status}`
  );
  assert.equal(examRoomRes.headers.get("x-frame-options"), "DENY");
  assert.equal(examRoomRes.headers.get("x-content-type-options"), "nosniff");
  console.log(
    `  [PASS] GET /portal/exam-room (unauthenticated) -> ${examRoomRes.status} redirect + security headers verified`
  );
}

main().catch((err) => {
  console.error("❌ Production smoke check failed:", err);
  process.exit(1);
});
