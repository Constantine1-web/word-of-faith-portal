import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import prisma from "./db";

export interface QuestionExplanationInput {
  questionId?: string;
  stem: string;
  options: { key: string; text: string }[];
  correctKey: string;
  selectedKey?: string | null;
  subjectCode: string;
  examBody: string;
}

export interface AttemptAnalysisInput {
  attemptId: string;
  subjectCode: string;
  examBody: string;
  studentName?: string;
  score: number;
  total: number;
  wrongQuestions: {
    position: number;
    stem: string;
    selectedAnswerText?: string;
    correctAnswerText?: string;
  }[];
}

export interface AttemptAnalysisOutput {
  overallFeedback: string;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
}

/**
 * Checks if the Google Generative AI API key is configured.
 */
export function isGeminiConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.GEMINI_API_KEY
  );
}

/**
 * Generates an authoritative, curriculum-accurate, step-by-step explanation
 * for an examination question using Google Gemini API.
 * Automatically saves the explanation back to CbtAnswerKey in the database
 * to minimize future LLM calls and credit consumption.
 */
export async function explainQuestionWithGemini(
  input: QuestionExplanationInput
): Promise<string | null> {
  if (!isGeminiConfigured()) return null;

  try {
    const formattedOptions = input.options
      .map((opt) => `(${opt.key.toUpperCase()}) ${opt.text}`)
      .join("\n");

    const prompt = `You are a senior secondary school examiner and tutor at Word of Faith Schools preparing students for ${input.examBody} examinations.

SUBJECT: ${input.subjectCode.toUpperCase()}
QUESTION:
${input.stem}

OPTIONS:
${formattedOptions}

OFFICIAL CORRECT ANSWER: Option (${input.correctKey.toUpperCase()})

TASK:
Provide a concise, accurate, and student-friendly step-by-step explanation for why (${input.correctKey.toUpperCase()}) is the correct answer.
If calculations or formulas are involved, show the exact working clearly.
Keep the explanation under 150 words. Do not use conversational greetings; start directly with the core explanation.`;

    const { text } = await generateText({
      model: google("gemini-flash-lite-latest"),
      prompt,
      maxOutputTokens: 350,
      temperature: 0.2, // low temperature for factual accuracy
    });

    const cleanExplanation = text.trim();

    // Cache back to CbtAnswerKey if questionId is provided
    if (input.questionId && cleanExplanation) {
      await prisma.cbtAnswerKey
        .update({
          where: { questionId: input.questionId },
          data: { explanation: cleanExplanation },
        })
        .catch(() => {});
    }

    return cleanExplanation;
  } catch (err: any) {
    console.warn("[Gemini CBT] Failed to generate question explanation:", err?.message || err);
    return null;
  }
}

/**
 * Generates a holistic CBT review analysis for a student's completed session,
 * identifying curriculum concepts mastered vs concepts needing revision.
 */
export async function analyzeAttemptWithGemini(
  input: AttemptAnalysisInput
): Promise<AttemptAnalysisOutput | null> {
  if (!isGeminiConfigured()) return null;

  try {
    const percentage = Math.round((input.score / Math.max(1, input.total)) * 100);
    const missedList = input.wrongQuestions
      .slice(0, 8)
      .map(
        (q) =>
          `Q${q.position}: ${q.stem.slice(0, 100)}... (Student picked: "${q.selectedAnswerText || 'None'}", Correct: "${q.correctAnswerText || ''}")`
      )
      .join("\n");

    const prompt = `You are an expert academic counselor and subject tutor at Word of Faith Schools.
Analyze this student's completed ${input.examBody} CBT practice session in ${input.subjectCode.toUpperCase()}.

STUDENT: ${input.studentName || 'Student'}
SCORE: ${input.score} / ${input.total} (${percentage}%)

MISSED QUESTIONS SAMPLE:
${missedList || "None (Student got 100%!)"}

Respond strictly in valid JSON format matching this schema:
{
  "overallFeedback": "2-3 encouraging sentences evaluating the student's mastery level and exam readiness.",
  "strengths": ["1-2 specific topic strengths demonstrated in this session"],
  "weaknesses": ["1-2 specific topic areas where mistakes occurred"],
  "recommendations": ["2 concrete revision steps or study habits for the student before the next mock"]
}`;

    const { text } = await generateText({
      model: google("gemini-flash-lite-latest"),
      prompt,
      maxOutputTokens: 500,
      temperature: 0.3,
    });

    // Parse JSON safely
    const cleanJson = text.replace(/```json\s*|\s*```/g, "").trim();
    const parsed = JSON.parse(cleanJson);

    return {
      overallFeedback: String(parsed.overallFeedback || "Well done on completing your CBT practice session."),
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map(String) : [],
      weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses.map(String) : [],
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.map(String) : [],
    };
  } catch (err: any) {
    console.warn("[Gemini CBT] Failed to generate attempt analysis:", err?.message || err);
    return null;
  }
}
