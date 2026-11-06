import https from "https";
import type { CBTQuestion } from "./cbt-api";

export interface AlocStationQuestion {
  id: string | number;
  text?: string;
  questionHtml?: string;
  question?: string;
  options?: Record<string, string>;
  option?: Record<string, string>;
  correctAnswer?: string;
  correct_answer?: string;
  answer?: string;
  examType?: string;
  examtype?: string;
  subject?: string;
  year?: number | string;
  examyear?: string;
  section?: string | null;
  hasPassage?: boolean;
  image?: string | null;
  imageUrl?: string | null;
  explanation?: string | null;
  solution?: string | null;
}

export interface AlocStationResponse {
  data?: AlocStationQuestion[] | AlocStationQuestion;
  pagination?: {
    next_cursor?: string | null;
    has_more?: boolean;
    limit?: number;
  };
  error?: string;
  message?: string;
  status?: number;
}

export interface AlocFetchOptions {
  subject: string;
  examType?: string;
  year?: number;
  limit?: number;
  random?: boolean;
  cursor?: string;
}

export interface AlocApiMetrics {
  rateLimitRemaining?: number;
  rateLimitLimit?: number;
  rateLimitReset?: number;
  creditsRemaining?: number;
  creditsUsed?: number;
  lastEndpointUsed?: string;
  lastStatus?: number;
  lastError?: string | null;
}

// Module-level cached metrics from the last ALOC response
let lastMetrics: AlocApiMetrics = {};

export function getLastAlocMetrics(): AlocApiMetrics {
  return { ...lastMetrics };
}

export function getAlocKeyDiagnostics() {
  const alocKey = process.env.ALOC_API_KEY?.trim() || "";
  const sdashKey = process.env.SDASH_API_KEY?.trim() || "";
  const geminiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() || "";

  const mask = (key: string) =>
    key.length > 10 ? `${key.slice(0, 8)}...${key.slice(-4)}` : key ? "configured" : "missing";

  return {
    alocConfigured: Boolean(alocKey),
    alocKeyPreview: mask(alocKey),
    sdashConfigured: Boolean(sdashKey),
    sdashKeyPreview: mask(sdashKey),
    geminiConfigured: Boolean(geminiKey),
    geminiKeyPreview: mask(geminiKey),
    metrics: { ...lastMetrics },
  };
}

/**
 * Normalizes examination body identifiers to match ALOC Station API v1 expectations.
 * ALOC Station expects: 'waec', 'neco', 'jamb', 'post_utme'
 */
export function normalizeExamType(examType?: string): string {
  if (!examType) return "waec";
  const lower = examType.toLowerCase().trim();
  if (lower === "wassce" || lower === "waec") return "waec";
  if (lower === "utme" || lower === "jamb") return "jamb";
  if (lower === "neco") return "neco";
  if (lower === "post-utme" || lower === "post_utme" || lower === "postutme") return "post_utme";
  return lower;
}

/**
 * Normalizes examination body identifiers for ALOC v2 endpoint (`questions.aloc.com.ng/api/v2/m`).
 * ALOC v2 expects: 'wassce', 'utme', 'neco', 'post-utme'
 */
export function normalizeExamTypeV2(examType?: string): string {
  if (!examType) return "wassce";
  const lower = examType.toLowerCase().trim();
  if (lower === "waec" || lower === "wassce") return "wassce";
  if (lower === "jamb" || lower === "utme") return "utme";
  if (lower === "neco") return "neco";
  if (lower === "post_utme" || lower === "post-utme" || lower === "postutme") return "post-utme";
  return lower;
}

/**
 * Normalizes academic subject codes to match ALOC Station API v1 taxonomy.
 */
export function normalizeSubject(subject: string): string {
  const s = subject.toLowerCase().trim();
  const map: Record<string, string> = {
    englishlit: "englishliterature",
    "english literature": "englishliterature",
    literature: "englishliterature",
    crk: "crk",
    irk: "irk",
    civiledu: "civileducation",
    "civic education": "civileducation",
    currentaffairs: "currentaffairs",
  };
  return map[s] || s;
}

/**
 * Normalizes subject codes for ALOC v2 (`questions.aloc.com.ng/api/v2`)
 */
export function normalizeSubjectV2(subject: string): string {
  const s = subject.toLowerCase().trim();
  const map: Record<string, string> = {
    englishliterature: "englishlit",
    "english literature": "englishlit",
    literature: "englishlit",
    civileducation: "civiledu",
    "civic education": "civiledu",
  };
  return map[s] || s;
}

/**
 * Resilient HTTPS GET request handler with timeout.
 * First tries native fetch; if a leaf certificate verification error occurs
 * (common on Windows development environments when the origin server omits intermediate CA),
 * it gracefully falls back to node:https.
 */
async function resilientGet(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number = 8500
): Promise<{ status: number; text: string; headers: Headers | Record<string, string | string[] | undefined> }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers,
      cache: "no-store",
      signal: controller.signal,
    });

    // Capture ledger headers
    const credRemaining = res.headers.get("x-credits-remaining");
    const credUsed = res.headers.get("x-credits-used");
    const rlRemaining = res.headers.get("x-ratelimit-remaining");
    const rlLimit = res.headers.get("x-ratelimit-limit");
    const rlReset = res.headers.get("x-ratelimit-reset");

    lastMetrics = {
      ...lastMetrics,
      creditsRemaining: credRemaining ? Number(credRemaining) : lastMetrics.creditsRemaining,
      creditsUsed: credUsed ? Number(credUsed) : lastMetrics.creditsUsed,
      rateLimitRemaining: rlRemaining ? Number(rlRemaining) : lastMetrics.rateLimitRemaining,
      rateLimitLimit: rlLimit ? Number(rlLimit) : lastMetrics.rateLimitLimit,
      rateLimitReset: rlReset ? Number(rlReset) : lastMetrics.rateLimitReset,
      lastStatus: res.status,
    };

    const text = await res.text();
    return { status: res.status, text, headers: res.headers };
  } catch (err: any) {
    const errCode = err?.cause?.code || err?.code || "";
    const isCertError =
      errCode === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" ||
      errCode === "CERT_HAS_EXPIRED" ||
      err?.message?.includes("unable to verify");

    if (isCertError && process.env.NODE_ENV !== "production") {
      // Local dev fallback using node:https with custom agent
      return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const req = https.request(
          parsedUrl,
          {
            method: "GET",
            headers,
            timeout: timeoutMs,
            agent: new https.Agent({ rejectUnauthorized: false }),
          },
          (res) => {
            let body = "";
            res.on("data", (chunk) => (body += chunk));
            res.on("end", () => {
              const h = res.headers;
              const credRemaining = h["x-credits-remaining"];
              const credUsed = h["x-credits-used"];
              const rlRemaining = h["x-ratelimit-remaining"];

              lastMetrics = {
                ...lastMetrics,
                creditsRemaining: credRemaining ? Number(credRemaining) : lastMetrics.creditsRemaining,
                creditsUsed: credUsed ? Number(credUsed) : lastMetrics.creditsUsed,
                rateLimitRemaining: rlRemaining ? Number(rlRemaining) : lastMetrics.rateLimitRemaining,
                lastStatus: res.statusCode || 200,
              };

              resolve({ status: res.statusCode || 200, text: body, headers: res.headers });
            });
          }
        );

        req.on("timeout", () => {
          req.destroy(new Error("Request timed out"));
        });
        req.on("error", (e) => reject(e));
        req.end();
      });
    }

    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Maps raw ALOC question records (from v1 or v2) into standard CBTQuestion objects.
 */
function mapAlocItemsToCBTQuestions(items: AlocStationQuestion[], fallbackExam: string): CBTQuestion[] {
  return items
    .map((item, idx) => {
      const rawStem = item.text || item.questionHtml || item.question || "";
      const rawOptions = item.options || item.option || {};

      const cleanOptions: Record<string, string> = {};
      for (const [k, v] of Object.entries(rawOptions)) {
        if (v && typeof v === "string" && v.trim()) {
          cleanOptions[k.toLowerCase()] = v.trim();
        }
      }

      const answerRaw = item.correctAnswer || item.correct_answer || item.answer || "a";
      const answer = String(answerRaw).toLowerCase().trim() || "a";

      const numericId =
        typeof item.id === "number"
          ? item.id
          : Number.parseInt(String(item.id || "").replace(/\D/g, ""), 10) || Date.now() + idx;

      return {
        id: numericId,
        question: rawStem,
        option: {
          a: cleanOptions.a || "",
          b: cleanOptions.b || "",
          c: cleanOptions.c || "",
          d: cleanOptions.d || "",
          e: cleanOptions.e || null,
        },
        section: item.section || null,
        image: item.image || item.imageUrl || null,
        answer,
        solution: item.explanation || item.solution || "",
        examtype: String(item.examType || item.examtype || fallbackExam).toUpperCase(),
        examyear: String(item.year || item.examyear || ""),
      };
    })
    .filter((q) => Boolean(q.question && q.option.a && q.option.b));
}

/**
 * Queries ALOC v2 endpoint (`https://questions.aloc.com.ng/api/v2/m` or `/api/v2/q`)
 * sending both `AccessToken` and `X-API-Key` headers for maximum compatibility across key types.
 */
export async function fetchAlocV2Questions(
  subject: string,
  amount: number = 10,
  examType?: string
): Promise<CBTQuestion[]> {
  const apiKey = process.env.ALOC_API_KEY?.trim();
  if (!apiKey) return [];

  const subV2 = normalizeSubjectV2(subject);
  const typeV2 = normalizeExamTypeV2(examType);
  const count = Math.min(Math.max(1, amount), 40);

  const endpoints = [
    `https://questions.aloc.com.ng/api/v2/m/${count}?subject=${encodeURIComponent(subV2)}&type=${encodeURIComponent(typeV2)}`,
    `https://questions.aloc.com.ng/api/v2/m?subject=${encodeURIComponent(subV2)}&type=${encodeURIComponent(typeV2)}`,
    `https://questions.aloc.com.ng/api/v2/q/${count}?subject=${encodeURIComponent(subV2)}`,
  ];

  for (const endpoint of endpoints) {
    try {
      const { status, text } = await resilientGet(endpoint, {
        Accept: "application/json",
        AccessToken: apiKey,
        "X-API-Key": apiKey,
        Authorization: `Bearer ${apiKey}`,
      });

      if (status >= 200 && status < 300 && text) {
        const parsed: AlocStationResponse = JSON.parse(text);
        const rawData = parsed.data;
        const items: AlocStationQuestion[] = Array.isArray(rawData)
          ? rawData
          : rawData && typeof rawData === "object"
          ? [rawData]
          : [];

        if (items.length > 0) {
          const mapped = mapAlocItemsToCBTQuestions(items, typeV2);
          if (mapped.length > 0) {
            lastMetrics = {
              ...lastMetrics,
              lastEndpointUsed: "questions.aloc.com.ng/api/v2",
              lastError: null,
            };
            return mapped;
          }
        }
      }
    } catch (err: any) {
      lastMetrics = {
        ...lastMetrics,
        lastError: err?.message || "ALOC v2 connection failed",
      };
    }
  }

  return [];
}

/**
 * Fetches verified objective examination questions from ALOC Station API v1.
 * Base URL: https://dev.aloc.com.ng/api/v1
 * Endpoint: GET /questions
 * Headers: X-API-Key, AccessToken, Authorization
 */
export async function fetchAlocStationQuestions(
  options: AlocFetchOptions
): Promise<{ questions: CBTQuestion[]; hasMore: boolean; nextCursor?: string | null; error?: string }> {
  const apiKey = process.env.ALOC_API_KEY?.trim();
  if (!apiKey) {
    console.warn("[ALOC Station API] Skipped: ALOC_API_KEY is not configured in environment variables.");
    return { questions: [], hasMore: false, error: "ALOC_API_KEY is missing." };
  }

  const normalizedSubject = normalizeSubject(options.subject);
  const normalizedExam = normalizeExamType(options.examType);
  const requestedLimit = Math.min(Math.max(1, options.limit || 10), 15);

  const url = new URL("https://dev.aloc.com.ng/api/v1/questions");
  url.searchParams.append("subject", normalizedSubject);
  if (normalizedExam) {
    url.searchParams.append("examType", normalizedExam);
  }
  url.searchParams.append("limit", requestedLimit.toString());

  if (options.random) {
    url.searchParams.append("random", "true");
  }
  if (options.year) {
    url.searchParams.append("year", options.year.toString());
  }
  if (options.cursor) {
    url.searchParams.append("cursor", options.cursor);
  }

  try {
    const { status, text } = await resilientGet(url.toString(), {
      Accept: "application/json",
      "X-API-Key": apiKey,
      AccessToken: apiKey,
      Authorization: `Bearer ${apiKey}`,
    });

    if (status === 401) {
      lastMetrics.lastError = "401 Unauthorized on ALOC v1";
      return { questions: [], hasMore: false, error: "Invalid or deactivated ALOC API key." };
    }

    if (status === 403) {
      lastMetrics.lastError = "403 Forbidden on ALOC v1 (sandbox or credits)";
      return { questions: [], hasMore: false, error: "ALOC API credits exhausted or email unverified." };
    }

    if (status === 429) {
      lastMetrics.lastError = "429 Rate Limited on ALOC v1";
      return { questions: [], hasMore: false, error: "ALOC API rate limit reached. Please wait a moment." };
    }

    if (status >= 400) {
      lastMetrics.lastError = `HTTP ${status} on ALOC v1`;
      return { questions: [], hasMore: false, error: `ALOC Station returned HTTP ${status}` };
    }

    let parsed: AlocStationResponse;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { questions: [], hasMore: false, error: "Invalid JSON from ALOC API" };
    }

    const rawData = parsed.data;
    const items: AlocStationQuestion[] = Array.isArray(rawData)
      ? rawData
      : rawData && typeof rawData === "object"
      ? [rawData]
      : [];

    if (items.length === 0) {
      return { questions: [], hasMore: false };
    }

    const mapped = mapAlocItemsToCBTQuestions(items, normalizedExam);
    lastMetrics = {
      ...lastMetrics,
      lastEndpointUsed: "dev.aloc.com.ng/api/v1",
      lastError: null,
    };

    return {
      questions: mapped,
      hasMore: Boolean(parsed.pagination?.has_more),
      nextCursor: parsed.pagination?.next_cursor,
    };
  } catch (err: any) {
    lastMetrics.lastError = err?.message || "Connection failed";
    return { questions: [], hasMore: false, error: err?.message || "Connection failed" };
  }
}

/**
 * High-level batch question fetcher that queries:
 * 1. ALOC Station v1 (`https://dev.aloc.com.ng/api/v1/questions`)
 * 2. Fallback to JAMB examType on ALOC Station v1 if WAEC has no direct questions
 * 3. Automatic fallback to ALOC v2 (`https://questions.aloc.com.ng/api/v2/m`)
 */
export async function fetchAlocBatchQuestions(
  subject: string,
  amount: number = 10,
  examType?: string
): Promise<CBTQuestion[]> {
  const targetCount = Math.max(1, amount);
  const collected: CBTQuestion[] = [];
  let cursor: string | undefined = undefined;

  const maxPages = Math.min(4, Math.ceil(targetCount / 15));

  for (let page = 0; page < maxPages; page++) {
    const remainingToFetch = targetCount - collected.length;
    if (remainingToFetch <= 0) break;

    const pageLimit = Math.min(remainingToFetch, 15);
    const res = await fetchAlocStationQuestions({
      subject,
      examType,
      limit: pageLimit,
      random: page === 0 && targetCount <= 10,
      cursor,
    });

    if (res.questions.length === 0) {
      break;
    }

    collected.push(...res.questions);

    if (!res.hasMore || !res.nextCursor) {
      break;
    }
    cursor = res.nextCursor;
  }

  // Fallback 1: If WAEC/WASSCE has no direct questions in ALOC Station v1 for this subject,
  // query JAMB senior secondary questions on v1
  if (collected.length === 0 && normalizeExamType(examType) === "waec") {
    const fallbackRes = await fetchAlocStationQuestions({
      subject,
      examType: "jamb",
      limit: Math.min(targetCount, 15),
      random: true,
    });
    if (fallbackRes.questions.length > 0) {
      collected.push(...fallbackRes.questions);
    }
  }

  // Fallback 2: Query ALOC v2 (`questions.aloc.com.ng/api/v2/m`) if v1 returned empty
  if (collected.length === 0) {
    const v2Questions = await fetchAlocV2Questions(subject, targetCount, examType);
    if (v2Questions.length > 0) {
      return v2Questions;
    }
  }

  return collected;
}
