import QuizClient from "@/components/cbt/QuizClient";
import { redirect } from "next/navigation";
import { startAttempt } from "@/app/actions/cbt";

export const dynamic = "force-dynamic";

export default async function QuizPage({
  searchParams,
}: {
  searchParams: Promise<{
    attemptId?: string;
    exam?: string;
    subject?: string;
    amount?: string;
    mode?: string;
  }>;
}) {
  const { attemptId, exam, subject, amount, mode } = await searchParams;

  // If navigated directly with legacy query params (?subject=mathematics&exam=wassce), create a server-side attempt first
  if (!attemptId) {
    if (!subject) {
      redirect("/portal/cbt");
    }

    const numAmount = parseInt(amount || "10", 10);
    const started = await startAttempt({
      subjectCode: subject,
      examBody: exam || "WASSCE",
      mode: mode === "MOCK" ? "MOCK" : "PRACTICE",
      questionCount: numAmount,
    });

    if (!started.success || !started.attemptId) {
      return (
        <div style={{ padding: "3rem", textAlign: "center", maxWidth: "600px", margin: "0 auto" }}>
          <h2 style={{ color: "#b91c1c" }}>Unable to Start CBT Attempt</h2>
          <p style={{ color: "#475569", margin: "1rem 0 1.5rem 0" }}>
            {started.error || "Please return to the CBT portal to start a new session."}
          </p>
          <a href="/portal/cbt" className="btn btn-primary" style={{ textDecoration: "none" }}>
            Return to CBT Portal
          </a>
        </div>
      );
    }

    redirect(`/portal/cbt/quiz?attemptId=${encodeURIComponent(started.attemptId)}`);
  }

  // Strictly pass ONLY the attemptId to the client component — questions are fetched 1-at-a-time without answer keys
  return <QuizClient attemptId={attemptId} />;
}
