import https from "node:https";
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
  data?: AlocStationQuestion[];
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
}

// Module-level cached metrics from the last ALOC Station response
let lastMetrics: AlocApiMetrics = {};

export function getLastAlocMetrics(): AlocApiMetrics {
  return { ...lastMetrics };
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
 * Resilient HTTPS GET request handler.
 * First tries native fetch; if a leaf certificate verification error occurs
 * (common on Windows development environments when the origin server omits intermediate CA),
 * it gracefully falls back to node:https.
 */
async function resilientGet(
  url: string,
  headers: Record<string, string>
): Promise<{ status: number; text: string; headers: Headers | Record<string, string | string[] | undefined> }> {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers,
      cache: "no-store",
    });

    // Capture ledger headers
    const credRemaining = res.headers.get("x-credits-remaining");
    const credUsed = res.headers.get("x-credits-used");
    const rlRemaining = res.headers.get("x-ratelimit-remaining");
    const rlLimit = res.headers.get("x-ratelimit-limit");
    const rlReset = res.headers.get("x-ratelimit-reset");

    lastMetrics = {
      creditsRemaining: credRemaining ? Number(credRemaining) : lastMetrics.creditsRemaining,
      creditsUsed: credUsed ? Number(credUsed) : lastMetrics.creditsUsed,
      rateLimitRemaining: rlRemaining ? Number(rlRemaining) : lastMetrics.rateLimitRemaining,
      rateLimitLimit: rlLimit ? Number(rlLimit) : lastMetrics.rateLimitLimit,
      rateLimitReset: rlReset ? Number(rlReset) : lastMetrics.rateLimitReset,
    };

    const text = await res.text();
    return { status: res.status, text, headers: res.headers };
  } catch (err: any) {
    const errCode = err?.cause?.code || err?.code || "";
    const isCertError =
      errCode === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" ||
      errCode === "CERT_HAS_EXPIRED" ||
      err?.message?.includes("unable to verify");

    if (isCertError) {
      // Local dev fallback using node:https with custom agent
      return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const req = https.request(
          parsedUrl,
          {
            method: "GET",
            headers,
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
                creditsRemaining: credRemaining ? Number(credRemaining) : lastMetrics.creditsRemaining,
                creditsUsed: credUsed ? Number(credUsed) : lastMetrics.creditsUsed,
                rateLimitRemaining: rlRemaining ? Number(rlRemaining) : lastMetrics.rateLimitRemaining,
              };

              resolve({ status: res.statusCode || 200, text: body, headers: res.headers });
            });
          }
        );

        req.on("error", (e) => reject(e));
        req.end();
      });
    }

    throw err;
  }
}

/**
 * Fetches verified objective examination questions from ALOC Station API v1.
 * Base URL: https://dev.aloc.com.ng/api/v1
 * Endpoint: GET /questions
 * Header: X-API-Key: <ALOC_API_KEY>
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
    });

    if (status === 401) {
      console.warn("[ALOC Station API] 401 Unauthorized: Invalid or deactivated API key. Verify ALOC_API_KEY on the developer dashboard.");
      return { questions: [], hasMore: false, error: "Invalid or deactivated ALOC API key." };
    }

    if (status === 403) {
      console.warn("[ALOC Station API] 403 Forbidden: Account in sandbox or insufficient credits. Verify email on aloc.com.ng.");
      return { questions: [], hasMore: false, error: "ALOC API credits exhausted or email unverified." };
    }

    if (status === 429) {
      console.warn("[ALOC Station API] 429 Rate Limited: Exceeded request rate limit.");
      return { questions: [], hasMore: false, error: "ALOC API rate limit reached. Please wait a moment." };
    }

    if (status >= 400) {
      console.warn(`[ALOC Station API] HTTP ${status}: ${text.slice(0, 200)}`);
      return { questions: [], hasMore: false, error: `ALOC Station returned HTTP ${status}` };
    }

    let parsed: AlocStationResponse;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      console.error("[ALOC Station API] Failed to parse JSON response:", text.slice(0, 200));
      return { questions: [], hasMore: false, error: "Invalid JSON from ALOC API" };
    }

    const items = parsed.data || [];
    if (!Array.isArray(items) || items.length === 0) {
      return { questions: [], hasMore: false };
    }

    // Map ALOC Station format into standard CBTQuestion interface
    const mapped: CBTQuestion[] = items.map((item, idx) => {
      // Clean HTML tags from stem if questionHtml or text is provided
      const rawStem = item.text || item.questionHtml || item.question || "";
      const rawOptions = item.options || item.option || {};

      const cleanOptions: Record<string, string> = {};
      for (const [k, v] of Object.entries(rawOptions)) {
        if (v && typeof v === "string" && v.trim()) {
          cleanOptions[k.toLowerCase()] = v.trim();
        }
      }

      const answerRaw = item.correctAnswer || item.correct_answer || item.answer || "a";
      const answer = answerRaw.toLowerCase().trim();

      const numericId = typeof item.id === "number" ? item.id : Number.parseInt(String(item.id).replace(/\D/g, ""), 10) || (Date.now() + idx);

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
        answer: answer,
        solution: item.explanation || item.solution || "",
        examtype: (item.examType || item.examtype || normalizedExam).toUpperCase(),
        examyear: String(item.year || item.examyear || ""),
      };
    });

    return {
      questions: mapped,
      hasMore: Boolean(parsed.pagination?.has_more),
      nextCursor: parsed.pagination?.next_cursor,
    };
  } catch (err: any) {
    console.warn("[ALOC Station API] Request failed:", err?.message || err);
    return { questions: [], hasMore: false, error: err?.message || "Connection failed" };
  }
}

/**
 * High-level batch question fetcher that respects ALOC Station v1 limit constraints (<=15 per page).
 * Automatically paginates if amount > 15 to assemble the requested question count.
 */
export async function fetchAlocBatchQuestions(
  subject: string,
  amount: number = 10,
  examType?: string
): Promise<CBTQuestion[]> {
  const targetCount = Math.max(1, amount);
  const collected: CBTQuestion[] = [];
  let cursor: string | undefined = undefined;

  // Maximum 4 page requests per batch to safeguard API credits
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

  // If WAEC/WASSCE has no direct questions in ALOC Station for this subject (e.g. Physics, Chemistry),
  // fallback to JAMB senior secondary questions which share the identical syllabus
  if (collected.length === 0 && normalizeExamType(examType) === "waec") {
    const fallbackRes = await fetchAlocStationQuestions({
      subject,
      examType: "jamb",
      limit: Math.min(targetCount, 15),
      random: true,
    });
    if (fallbackRes.questions.length > 0) {
      return fallbackRes.questions;
    }
  }

  return collected;
}
