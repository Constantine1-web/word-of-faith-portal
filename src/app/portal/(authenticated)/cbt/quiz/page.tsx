import { fetchQuestions } from "@/lib/cbt-api";
import QuizClient from "@/components/cbt/QuizClient";
import { redirect } from "next/navigation";

export default async function QuizPage({
  searchParams,
}: {
  searchParams: Promise<{ exam?: string; subject?: string; amount?: string }>;
}) {
  const { exam, subject, amount } = await searchParams;

  if (!subject) {
    redirect("/portal/cbt");
  }

  const numAmount = parseInt(amount || "10", 10);
  
  try {
    const questions = await fetchQuestions(subject, numAmount, exam);

    if (!questions || questions.length === 0) {
      return (
        <div style={{ padding: "3rem", textAlign: "center" }}>
          <h2>No questions found</h2>
          <p>We could not find any questions for the selected criteria. Please go back and try a different subject or exam.</p>
        </div>
      );
    }

    return <QuizClient questions={questions} subject={subject} exam={exam || "utme"} />;
  } catch (error) {
    return (
      <div style={{ padding: "3rem", textAlign: "center", color: "red" }}>
        <h2>Error Loading Exam</h2>
        <p>There was a problem communicating with the CBT server. Please try again later.</p>
      </div>
    );
  }
}
