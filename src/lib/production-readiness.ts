import dns from "node:dns/promises";
import { resolveUpstashRestConfig } from "./redis";

export type CheckSeverity = "PASS" | "WARN" | "FAIL";

export interface ReadinessCheckItem {
  id: string;
  label: string;
  severity: CheckSeverity;
  detail: string;
}

export function extractDomainFromEmailAddress(input?: string | null): string | null {
  if (!input) return null;
  const match = String(input).match(/<([^>]+)>/) || [null, String(input)];
  const addr = (match[1] || "").trim().toLowerCase();
  const atIdx = addr.lastIndexOf("@");
  if (atIdx === -1) return null;
  const domain = addr.slice(atIdx + 1).replace(/[^a-z0-9.-]/g, "");
  return domain.includes(".") ? domain : null;
}

/**
 * Audits critical production readiness variables without returning raw secret values.
 */
export function evaluateProductionEnvReadiness(
  env: Record<string, string | undefined> = process.env
): ReadinessCheckItem[] {
  const items: ReadinessCheckItem[] = [];

  // 1. Auth & Vault Secrets
  const nextAuthUrl = env.NEXTAUTH_URL?.trim() || "";
  if (!nextAuthUrl) {
    items.push({
      id: "nextauth_url",
      label: "NEXTAUTH_URL",
      severity: "WARN",
      detail: "NEXTAUTH_URL is unset locally (required in Vercel Production using https://).",
    });
  } else if (!nextAuthUrl.startsWith("https://") && !nextAuthUrl.includes("localhost")) {
    items.push({
      id: "nextauth_url",
      label: "NEXTAUTH_URL",
      severity: "FAIL",
      detail: `NEXTAUTH_URL (${nextAuthUrl}) should use https:// in production.`,
    });
  } else {
    items.push({
      id: "nextauth_url",
      label: "NEXTAUTH_URL",
      severity: "PASS",
      detail: `Configured (${nextAuthUrl}).`,
    });
  }

  const vaultSecret = env.EXAM_VAULT_SECRET?.trim() || "";
  items.push({
    id: "exam_vault_secret",
    label: "EXAM_VAULT_SECRET",
    severity: vaultSecret.length >= 32 ? "PASS" : vaultSecret.length >= 16 ? "WARN" : "FAIL",
    detail:
      vaultSecret.length >= 32
        ? "Strong 32+ character AES-256 vault secret configured."
        : vaultSecret.length >= 16
        ? "Configured (>=16 chars), though 32+ chars is recommended."
        : "Missing or shorter than 16 chars.",
  });

  const cronSecret = env.CRON_SECRET?.trim() || "";
  items.push({
    id: "cron_secret",
    label: "CRON_SECRET",
    severity: cronSecret.length >= 16 ? "PASS" : "FAIL",
    detail:
      cronSecret.length >= 16
        ? "Configured (>=16 chars) for /api/cron/cbt-reaper."
        : "Missing or shorter than 16 chars.",
  });

  // 2. Upstash Redis REST
  const restConfig = resolveUpstashRestConfig(env);
  items.push({
    id: "upstash_rest",
    label: "Upstash Redis REST",
    severity: restConfig ? "PASS" : env.REDIS_URL ? "WARN" : "FAIL",
    detail: restConfig
      ? `Stateless REST active (${restConfig.url}).`
      : env.REDIS_URL
      ? "Only TCP REDIS_URL configured; connect Upstash REST (KV_REST_API_* or UPSTASH_REDIS_REST_*)."
      : "No Redis configured (running on single-instance memory fallback).",
  });

  // 3. Email Deliverability
  const resendKey = env.RESEND_API_KEY?.trim() || "";
  const resendFrom = env.RESEND_FROM?.trim() || "";
  const smtpUser = env.SMTP_USER?.trim() || "";
  const smtpPass = env.SMTP_PASSWORD?.trim() || env.SMTP_PASS?.trim() || "";
  const smtpFrom = env.SMTP_FROM?.trim() || smtpUser || "";
  const effectiveSender = resendFrom || smtpFrom;
  const senderDomain = extractDomainFromEmailAddress(effectiveSender);

  if (!resendKey && !(smtpUser && smtpPass)) {
    items.push({
      id: "email_transport",
      label: "Email Transport",
      severity: "FAIL",
      detail: "Neither RESEND_API_KEY nor SMTP_USER/SMTP_PASSWORD is configured.",
    });
  } else if (resendKey && (!resendFrom || resendFrom.includes("onboarding@resend.dev"))) {
    items.push({
      id: "email_transport",
      label: "Email Transport (Resend)",
      severity: "WARN",
      detail:
        "RESEND_API_KEY is set, but RESEND_FROM is using Resend sandbox onboarding@resend.dev. Verify your school domain in Resend and set RESEND_FROM.",
    });
  } else if (senderDomain === "gmail.com" || senderDomain === "yahoo.com") {
    items.push({
      id: "email_transport",
      label: "Email Sender Domain",
      severity: "WARN",
      detail: `Using consumer domain (${senderDomain}). Prefer a custom school domain (e.g. noreply@wordoffaith.edu.ng) with SPF/DKIM for reliable inbox delivery.`,
    });
  } else {
    items.push({
      id: "email_transport",
      label: "Email Transport",
      severity: "PASS",
      detail: resendKey
        ? `Resend HTTP API configured with sender domain ${senderDomain || "custom"}.`
        : `SMTP configured (${env.SMTP_HOST || "smtp.gmail.com"}, sender domain ${senderDomain || "set"}).`,
    });
  }

  // 4. Paystack Webhook & Keys
  const paystackSecret = env.PAYSTACK_SECRET_KEY?.trim() || "";
  const paystackPublic = env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY?.trim() || "";
  if (!paystackSecret || paystackSecret === "sk_test_mocked_key") {
    items.push({
      id: "paystack_secret",
      label: "PAYSTACK_SECRET_KEY",
      severity: "FAIL",
      detail: "Missing or mocked PAYSTACK_SECRET_KEY; webhook HMAC verification will fail.",
    });
  } else if (paystackSecret.startsWith("sk_test_")) {
    items.push({
      id: "paystack_secret",
      label: "PAYSTACK_SECRET_KEY",
      severity: "WARN",
      detail: "Paystack is in TEST mode (sk_test_*). Swap to sk_live_* before collecting real fees.",
    });
  } else {
    items.push({
      id: "paystack_secret",
      label: "PAYSTACK_SECRET_KEY",
      severity: "PASS",
      detail: `Paystack secret configured (${paystackSecret.startsWith("sk_live_") ? "LIVE mode" : "custom key"}).`,
    });
  }

  if (paystackPublic && paystackSecret) {
    const pubIsLive = paystackPublic.startsWith("pk_live_");
    const secIsLive = paystackSecret.startsWith("sk_live_");
    if (pubIsLive !== secIsLive) {
      items.push({
        id: "paystack_mode_mismatch",
        label: "Paystack Key Mode Match",
        severity: "FAIL",
        detail: "Mismatch between NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY and PAYSTACK_SECRET_KEY (live vs test).",
      });
    }
  }

  return items;
}

/**
 * Checks MX, SPF, and DMARC TXT records for a custom sender domain.
 */
export async function auditEmailDomainDns(domain: string): Promise<{
  domain: string;
  hasMx: boolean;
  hasSpf: boolean;
  hasDmarc: boolean;
  spfRecord: string | null;
  dmarcRecord: string | null;
  error?: string;
}> {
  const cleanDomain = domain.trim().toLowerCase();
  try {
    const [mxRes, txtRes, dmarcRes] = await Promise.allSettled([
      dns.resolveMx(cleanDomain),
      dns.resolveTxt(cleanDomain),
      dns.resolveTxt(`_dmarc.${cleanDomain}`),
    ]);

    const hasMx = mxRes.status === "fulfilled" && mxRes.value.length > 0;
    const txtStrings =
      txtRes.status === "fulfilled" ? txtRes.value.map((chunks) => chunks.join("")) : [];
    const spfRecord = txtStrings.find((t) => /^v=spf1\b/i.test(t.trim())) || null;

    const dmarcStrings =
      dmarcRes.status === "fulfilled" ? dmarcRes.value.map((chunks) => chunks.join("")) : [];
    const dmarcRecord = dmarcStrings.find((t) => /^v=DMARC1\b/i.test(t.trim())) || null;

    return {
      domain: cleanDomain,
      hasMx,
      hasSpf: Boolean(spfRecord),
      hasDmarc: Boolean(dmarcRecord),
      spfRecord,
      dmarcRecord,
    };
  } catch (err: unknown) {
    return {
      domain: cleanDomain,
      hasMx: false,
      hasSpf: false,
      hasDmarc: false,
      spfRecord: null,
      dmarcRecord: null,
      error: err instanceof Error ? err.message : "DNS lookup failed",
    };
  }
}
