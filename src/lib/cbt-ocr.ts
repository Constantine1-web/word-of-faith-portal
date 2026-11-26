import crypto from "crypto";
import { z } from "zod";
import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { isGeminiConfigured } from "@/lib/gemini-cbt";

export const MAX_EXAM_UPLOAD_BYTES = 6 * 1024 * 1024; // 6 MB

export interface ScannedCbtQuestionDraft {
  tempId: string;
  stem: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctKey: "a" | "b" | "c" | "d";
  answerConfidence: "EXPLICIT" | "AI_INFERRED" | "NEEDS_REVIEW";
  topic: string;
  explanation: string;
}

const RawScannedItemSchema = z.object({
  stem: z.string().trim().min(5).max(3000),
  optionA: z.string().trim().min(1).max(800),
  optionB: z.string().trim().min(1).max(800),
  optionC: z.string().trim().min(1).max(800),
  optionD: z.string().trim().min(1).max(800),
  correctKey: z.enum(["a", "b", "c", "d", "A", "B", "C", "D"]).default("a"),
  answerConfidence: z
    .enum(["EXPLICIT", "AI_INFERRED", "NEEDS_REVIEW"])
    .optional()
    .default("NEEDS_REVIEW"),
  topic: z.string().trim().max(120).optional().default("Exam Question"),
  explanation: z.string().trim().max(2000).optional().default(""),
});

/**
 * Validates binary magic bytes of uploaded handwritten question sheets, printed exams, or PDFs.
 */
export function validateExamDocumentBinary(
  buffer: Buffer,
  declaredMime?: string | null
): {
  valid: boolean;
  kind: "IMAGE" | "PDF" | null;
  normalizedMime: string;
  error?: string;
} {
  if (!buffer || buffer.length < 8) {
    return {
      valid: false,
      kind: null,
      normalizedMime: "",
      error: "Uploaded document is empty or corrupted.",
    };
  }
  if (buffer.length > MAX_EXAM_UPLOAD_BYTES) {
    return {
      valid: false,
      kind: null,
      normalizedMime: "",
      error: "Document exceeds the 6 MB upload limit. Please compress or split by page.",
    };
  }

  // PDF: %PDF-
  if (buffer.subarray(0, 5).toString("ascii") === "%PDF-") {
    if (declaredMime && declaredMime !== "application/pdf") {
      return {
        valid: false,
        kind: null,
        normalizedMime: "",
        error: "Declared MIME type does not match PDF signature.",
      };
    }
    return { valid: true, kind: "PDF", normalizedMime: "application/pdf" };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { valid: true, kind: "IMAGE", normalizedMime: "image/png" };
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { valid: true, kind: "IMAGE", normalizedMime: "image/jpeg" };
  }

  // WEBP: RIFF....WEBP
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { valid: true, kind: "IMAGE", normalizedMime: "image/webp" };
  }

  return {
    valid: false,
    kind: null,
    normalizedMime: "",
    error: "Security check failed: only valid JPG, PNG, WEBP photos or PDF documents are allowed.",
  };
}

/**
 * Validates and normalizes parsed OCR/AI output into editable teacher draft questions.
 */
export function normalizeExtractedQuestions(
  rawItems: unknown[],
  defaultTopic = "Exam Question"
): ScannedCbtQuestionDraft[] {
  const drafts: ScannedCbtQuestionDraft[] = [];
  const seenStems = new Set<string>();

  for (const item of rawItems) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const candidate = {
      stem: String(record.stem ?? record.question ?? "").trim(),
      optionA: String(record.optionA ?? record.a ?? "").trim(),
      optionB: String(record.optionB ?? record.b ?? "").trim(),
      optionC: String(record.optionC ?? record.c ?? "").trim(),
      optionD: String(record.optionD ?? record.d ?? "").trim(),
      correctKey: String(record.correctKey ?? record.answer ?? "a").trim().toLowerCase(),
      answerConfidence: record.answerConfidence,
      topic: String(record.topic ?? defaultTopic).trim() || defaultTopic,
      explanation: String(record.explanation ?? "").trim(),
    };

    const parsed = RawScannedItemSchema.safeParse(candidate);
    if (!parsed.success) continue;

    const normStem = parsed.data.stem.replace(/\s+/g, " ").toLowerCase();
    if (seenStems.has(normStem)) continue;
    seenStems.add(normStem);

    const hash = crypto.createHash("sha256").update(normStem).digest("hex").slice(0, 10);
    drafts.push({
      tempId: `scan-${drafts.length + 1}-${hash}`,
      stem: parsed.data.stem,
      optionA: parsed.data.optionA,
      optionB: parsed.data.optionB,
      optionC: parsed.data.optionC,
      optionD: parsed.data.optionD,
      correctKey: parsed.data.correctKey.toLowerCase() as "a" | "b" | "c" | "d",
      answerConfidence: parsed.data.answerConfidence,
      topic: parsed.data.topic || defaultTopic,
      explanation: parsed.data.explanation || "",
    });
  }

  return drafts.slice(0, 100);
}

/**
 * Deterministic fallback parser for structured typed exam blocks or readable text PDFs:
 * e.g.:
 *   1. What is the powerhouse of the cell?
 *   A) Nucleus
 *   B) Mitochondrion
 *   C) Ribosome
 *   D) Golgi body
 *   Answer: B
 */
export function parseNumberedMcqText(
  rawText: string,
  defaultTopic = "Exam Question"
): ScannedCbtQuestionDraft[] {
  const clean = (rawText || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
  if (!clean) return [];

  const blocks = clean
    .split(/\n(?=(?:Q(?:uestion)?\s*)?\d{1,3}\s*[\.\):]\s+)/i)
    .map((b) => b.trim())
    .filter(Boolean);

  const rawItems: Array<Record<string, unknown>> = [];

  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) continue;

    const joined = lines.join("\n");
    const optRegex = /(?:^|\s|\n)[\(\[]?([A-D])[\)\.\:]\s+([\s\S]*?)(?=(?:\s|\n)[\(\[]?[B-D][\)\.\:]\s+|(?:\s|\n)(?:Ans(?:wer)?|Key|Correct)\s*[:\-]\s*[A-D]\b|$)/gi;
    const optMatches = Array.from(joined.matchAll(optRegex));
    if (optMatches.length < 4) continue;

    const firstOptIndex = optMatches[0].index ?? -1;
    if (firstOptIndex <= 0) continue;

    const rawStem = joined
      .slice(0, firstOptIndex)
      .replace(/^(?:Q(?:uestion)?\s*)?\d{1,3}\s*[\.\):]\s+/i, "")
      .replace(/\s+/g, " ")
      .trim();

    const optMap: Record<string, string> = {};
    for (const m of optMatches) {
      const k = (m[1] || "").toLowerCase();
      const val = (m[2] || "").replace(/\s+/g, " ").trim();
      if (k && val && !optMap[k]) {
        optMap[k] = val;
      }
    }

    if (!optMap.a || !optMap.b || !optMap.c || !optMap.d) continue;

    const ansMatch = joined.match(/(?:Ans(?:wer)?|Key|Correct(?:\s+Option)?)\s*[:\-]\s*[\(\[]?([A-D])[\)\]]?\b/i);
    const hasExplicitAns = Boolean(ansMatch?.[1]);

    rawItems.push({
      stem: rawStem,
      optionA: optMap.a,
      optionB: optMap.b,
      optionC: optMap.c,
      optionD: optMap.d,
      correctKey: (ansMatch?.[1] || "a").toLowerCase(),
      answerConfidence: hasExplicitAns ? "EXPLICIT" : "NEEDS_REVIEW",
      topic: defaultTopic,
      explanation: "",
    });
  }

  return normalizeExtractedQuestions(rawItems, defaultTopic);
}

function parseJsonArrayFromLlmText(text: string): unknown[] {
  const cleaned = (text || "").replace(/```json\s*|\s*```/gi, "").trim();
  if (!cleaned) return [];
  try {
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    const firstBracket = cleaned.indexOf("[");
    const lastBracket = cleaned.lastIndexOf("]");
    if (firstBracket >= 0 && lastBracket > firstBracket) {
      try {
        const sliced = JSON.parse(cleaned.slice(firstBracket, lastBracket + 1));
        return Array.isArray(sliced) ? sliced : [];
      } catch {
        return [];
      }
    }
    return [];
  }
}

async function runGeminiExtraction(params: {
  subjectCode: string;
  defaultTopic: string;
  kind: "IMAGE" | "PDF" | "TEXT";
  buffer?: Buffer;
  mimeType?: string;
  filename?: string;
  extractedPdfOrPastedText?: string;
}): Promise<ScannedCbtQuestionDraft[]> {
  const instruction = `You are a precision optical character recognition (OCR) and curriculum digitizer for Word of Faith Schools.
Extract ONLY genuine Multiple-Choice Questions (MCQs) visible in the teacher's handwritten sheet, scanned exam page, PDF, or typed text for subject "${params.subjectCode}".

Strict rules:
1. Transcribe handwritten or printed wording faithfully; preserve algebraic powers cleanly (e.g. x^2, H2O, sqrt(16), 1/2).
2. Each question MUST have 4 options (optionA, optionB, optionC, optionD). Strip leading labels like "A.", "(b)", "C)" from the option text itself.
3. Determine "correctKey" ("a" | "b" | "c" | "d"):
   - If the teacher circled, ticked, underlined, starred, or wrote an Answer Key on the sheet/text, set "correctKey" to that marked letter and set "answerConfidence": "EXPLICIT".
   - If NO answer key is marked on the page for a question, determine the most accurate answer yourself and set "answerConfidence": "AI_INFERRED" so the teacher knows to verify it.
   - If handwriting for an option or answer is ambiguous, set "answerConfidence": "NEEDS_REVIEW".
4. Suggest a concise topic name (default "${params.defaultTopic}") and a brief 1-sentence marking guide "explanation" when helpful.
5. Respond ONLY with a valid JSON array matching:
[
  {
    "stem": "Question text...",
    "optionA": "...",
    "optionB": "...",
    "optionC": "...",
    "optionD": "...",
    "correctKey": "a",
    "answerConfidence": "EXPLICIT",
    "topic": "...",
    "explanation": "..."
  }
]`;

  const parts: Array<
    | { type: "text"; text: string }
    | { type: "image"; image: Buffer; mediaType?: string }
    | { type: "file"; data: Buffer; mediaType: string; filename?: string }
  > = [{ type: "text", text: instruction }];

  if (params.extractedPdfOrPastedText) {
    parts.push({
      type: "text",
      text: `DOCUMENT TEXT TO PARSE:\n${params.extractedPdfOrPastedText.slice(0, 28000)}`,
    });
  }

  if (params.kind === "IMAGE" && params.buffer) {
    parts.push({
      type: "image",
      image: params.buffer,
      mediaType: params.mimeType || "image/jpeg",
    });
  } else if (params.kind === "PDF" && params.buffer) {
    parts.push({
      type: "file",
      data: params.buffer,
      mediaType: "application/pdf",
      filename: params.filename || "exam-sheet.pdf",
    });
  }

  const candidateModels = ["gemini-2.5-flash", "gemini-flash-lite-latest"] as const;
  let lastError: unknown = null;

  for (const modelId of candidateModels) {
    try {
      const { text } = await generateText({
        model: google(modelId),
        messages: [{ role: "user", content: parts }],
        maxOutputTokens: 4000,
        temperature: 0.1,
      });

      const arr = parseJsonArrayFromLlmText(text);
      const drafts = normalizeExtractedQuestions(arr, params.defaultTopic);
      if (drafts.length > 0) {
        return drafts;
      }
    } catch (err) {
      lastError = err;
      console.warn(`[CBT OCR] ${modelId} extraction attempt failed:`, err);
    }
  }

  if (lastError) {
    throw lastError;
  }
  return [];
}

/**
 * Extracts review-ready MCQ drafts from a handwritten photo, scanned PDF, text PDF, or pasted exam sheet.
 */
export async function extractQuestionsFromDocument(params: {
  buffer?: Buffer;
  declaredMime?: string | null;
  filename?: string;
  rawText?: string;
  subjectCode: string;
  defaultTopic?: string;
}): Promise<{
  success: boolean;
  engine: "GEMINI_VISION" | "GEMINI_TEXT" | "DETERMINISTIC_TEXT";
  questions: ScannedCbtQuestionDraft[];
  warnings: string[];
  error?: string;
}> {
  const defaultTopic = (params.defaultTopic || "Term Exam Question").trim();
  const warnings: string[] = [];

  if (params.rawText && params.rawText.trim().length >= 20 && !params.buffer) {
    const deterministic = parseNumberedMcqText(params.rawText, defaultTopic);
    if (deterministic.length > 0 && !isGeminiConfigured()) {
      return {
        success: true,
        engine: "DETERMINISTIC_TEXT",
        questions: deterministic,
        warnings,
      };
    }

    if (isGeminiConfigured()) {
      try {
        const aiDrafts = await runGeminiExtraction({
          subjectCode: params.subjectCode,
          defaultTopic,
          kind: "TEXT",
          extractedPdfOrPastedText: params.rawText,
        });
        if (aiDrafts.length > 0) {
          return {
            success: true,
            engine: "GEMINI_TEXT",
            questions: aiDrafts,
            warnings,
          };
        }
      } catch {
        // Fall through to deterministic text parser if Gemini failed
      }
    }

    if (deterministic.length > 0) {
      warnings.push("AI parser unavailable; used structured text extractor. Verify answer keys before saving.");
      return {
        success: true,
        engine: "DETERMINISTIC_TEXT",
        questions: deterministic,
        warnings,
      };
    }

    return {
      success: false,
      engine: "DETERMINISTIC_TEXT",
      questions: [],
      warnings,
      error: "Could not detect formatted questions. Number questions (1., 2.) with A–D options on separate lines.",
    };
  }

  if (!params.buffer) {
    return {
      success: false,
      engine: "DETERMINISTIC_TEXT",
      questions: [],
      warnings,
      error: "Please attach a clear photo/PDF of the question paper or paste question text.",
    };
  }

  const sig = validateExamDocumentBinary(params.buffer, params.declaredMime);
  if (!sig.valid || !sig.kind) {
    return {
      success: false,
      engine: "DETERMINISTIC_TEXT",
      questions: [],
      warnings,
      error: sig.error || "Invalid uploaded document.",
    };
  }

  let pdfText = "";
  if (sig.kind === "PDF") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfMod = require("pdf-parse");
      if (typeof pdfMod === "function") {
        const parsed = await pdfMod(params.buffer);
        pdfText = String(parsed?.text || "").trim();
      } else if (typeof pdfMod?.PDFParse === "function") {
        const parser = new pdfMod.PDFParse({ data: params.buffer });
        try {
          const res = await parser.getText();
          pdfText = String(res?.text || "").trim();
        } finally {
          await parser.destroy?.().catch(() => {});
        }
      }
    } catch {
      pdfText = "";
    }

    // If PDF contains crisp typed text and Gemini isn't configured, try deterministic text extraction first
    if (!isGeminiConfigured()) {
      if (pdfText.length >= 40) {
        const deterministic = parseNumberedMcqText(pdfText, defaultTopic);
        if (deterministic.length > 0) {
          warnings.push("Extracted from text PDF without Gemini Vision; please review answer keys carefully.");
          return {
            success: true,
            engine: "DETERMINISTIC_TEXT",
            questions: deterministic,
            warnings,
          };
        }
      }
      return {
        success: false,
        engine: "DETERMINISTIC_TEXT",
        questions: [],
        warnings,
        error: "Gemini Vision API key is not configured for handwritten or scanned PDF OCR. You can paste formatted text or upload CSV.",
      };
    }
  } else if (!isGeminiConfigured()) {
    return {
      success: false,
      engine: "DETERMINISTIC_TEXT",
      questions: [],
      warnings,
      error: "Handwritten image OCR requires GEMINI_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY on the server.",
    };
  }

  try {
    const drafts = await runGeminiExtraction({
      subjectCode: params.subjectCode,
      defaultTopic,
      kind: sig.kind,
      buffer: params.buffer,
      mimeType: sig.normalizedMime,
      filename: params.filename,
      extractedPdfOrPastedText: pdfText.length >= 40 ? pdfText : undefined,
    });

    if (drafts.length === 0) {
      return {
        success: false,
        engine: "GEMINI_VISION",
        questions: [],
        warnings,
        error: "No readable multiple-choice questions (with options A–D) were detected in this scan. Try a brighter, straight-on photo or split into fewer questions per page.",
      };
    }

    const inferredCount = drafts.filter((d) => d.answerConfidence !== "EXPLICIT").length;
    if (inferredCount > 0) {
      warnings.push(
        `${inferredCount} question(s) did not show a clear teacher answer mark on the sheet; AI suggested answers marked for verification.`
      );
    }

    return {
      success: true,
      engine: "GEMINI_VISION",
      questions: drafts,
      warnings,
    };
  } catch (err) {
    console.error("[CBT OCR] Failed scanning document:", err);
    // Graceful text-PDF rescue fallback if Gemini had a transient error
    if (pdfText.length >= 40) {
      const rescue = parseNumberedMcqText(pdfText, defaultTopic);
      if (rescue.length > 0) {
        warnings.push("AI scanner timed out; recovered questions via local PDF text parser. Review carefully.");
        return {
          success: true,
          engine: "DETERMINISTIC_TEXT",
          questions: rescue,
          warnings,
        };
      }
    }
    return {
      success: false,
      engine: "GEMINI_VISION",
      questions: [],
      warnings,
      error: "AI handwriting scanner could not process this file right now. Please try a clearer image or paste text.",
    };
  }
}
