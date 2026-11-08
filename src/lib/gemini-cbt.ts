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
    console.warn("[Gemini CBT] Failed to generate question explanation, using structured curriculum tutor fallback:", err?.message || err);
    const correctOptionObj = input.options.find(
      (o) => o.key.toLowerCase() === input.correctKey.toLowerCase()
    );
    const selectedOptionObj = input.selectedKey
      ? input.options.find((o) => o.key.toLowerCase() === input.selectedKey?.toLowerCase())
      : null;
    const correctText = correctOptionObj ? correctOptionObj.text : `Option (${input.correctKey.toUpperCase()})`;
    const distractorNote =
      selectedOptionObj && input.selectedKey?.toLowerCase() !== input.correctKey.toLowerCase()
        ? ` Note why your selected choice (${input.selectedKey?.toUpperCase()}: "${selectedOptionObj.text}") is a common distractor: it does not fully satisfy the exact requirement of the ${input.examBody.toUpperCase()} ${input.subjectCode.toUpperCase()} syllabus prompt.`
        : "";

    const fallbackExplanation = `Official Marking Guide (${input.examBody.toUpperCase()} ${input.subjectCode.toUpperCase()}): The verified correct answer is Option (${input.correctKey.toUpperCase()}) — "${correctText}". Look closely at the core condition in the stem ("${input.stem.replace(/\s+/g, " ").slice(0, 140)}${input.stem.length > 140 ? "..." : ""}"): Option (${input.correctKey.toUpperCase()}) directly satisfies the governing principle tested in this topic.${distractorNote}`;

    if (input.questionId) {
      await prisma.cbtAnswerKey
        .update({
          where: { questionId: input.questionId },
          data: { explanation: fallbackExplanation },
        })
        .catch(() => {});
    }

    return fallbackExplanation;
  }
}

/**
 * Generates a holistic CBT review analysis for a student's completed session,
 * identifying curriculum concepts mastered vs concepts needing revision.
 */
export async function analyzeAttemptWithGemini(
  input: AttemptAnalysisInput
): Promise<AttemptAnalysisOutput | null> {
  const percentage = Math.round((input.score / Math.max(1, input.total)) * 100);

  if (!isGeminiConfigured()) {
    return buildFallbackAttemptAnalysis(input, percentage);
  }

  try {
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
    console.warn("[Gemini CBT] Failed to generate attempt analysis, using structured fallback:", err?.message || err);
    return buildFallbackAttemptAnalysis(input, percentage);
  }
}

function buildFallbackAttemptAnalysis(
  input: AttemptAnalysisInput,
  percentage: number
): AttemptAnalysisOutput {
  const tier =
    percentage >= 75
      ? "Distinction-level mastery"
      : percentage >= 50
      ? "Credit-level foundation"
      : "Developing mastery requiring targeted revision";

  return {
    overallFeedback: `${input.studentName || "Student"} achieved ${input.score}/${input.total} (${percentage}%) in ${input.examBody.toUpperCase()} ${input.subjectCode.toUpperCase()}, demonstrating ${tier.toLowerCase()}.`,
    strengths: [
      `Completed ${input.total} objective items under structured CBT conditions`,
      percentage >= 50
        ? `Strong grasp of core ${input.subjectCode.toUpperCase()} syllabus fundamentals`
        : `Identified high-priority ${input.subjectCode.toUpperCase()} topics for focused revision`,
    ],
    weaknesses:
      input.wrongQuestions.length > 0
        ? [
            `Review the ${input.wrongQuestions.length} missed question(s) using the step-by-step Marking Guide below`,
          ]
        : ["No weaknesses detected in this set — 100% accuracy achieved!"],
    recommendations: [
      `Re-attempt the missed ${input.subjectCode.toUpperCase()} questions in Self-Paced Practice mode and write down the governing rule for each.`,
      `Take a timed ${input.examBody.toUpperCase()} Mock Exam set of 20+ questions to consolidate speed and accuracy.`,
    ],
  };
}

