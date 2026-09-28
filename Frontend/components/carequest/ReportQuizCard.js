"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { submitReportQuiz } from "@/actions/reportActions";
import { CheckCircle2, Loader2, Sparkles, XCircle } from "lucide-react";

/**
 * The report's 4-question RAG knowledge check. The correct answers are never
 * sent to the browser; grading happens server-side on submit and the Capsules
 * are awarded there.
 */
export default function ReportQuizCard({ report, onCompleted }) {
  const [answers, setAnswers] = useState({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const questions = report.quizQuestions || [];
  const answered = questions.length > 0 && questions.every((_, i) => answers[i]);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const graded = await submitReportQuiz(
        report._id,
        questions.map((_, i) => answers[i])
      );
      setResult(graded);
      onCompleted?.(graded);
      window.dispatchEvent(new Event("arkcare-capsules"));
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setBusy(false);
    }
  }

  if (!questions.length) return null;

  if (report.quizCompleted && !result) {
    return (
      <div className="rounded-xl border border-[#c9ddd2] bg-[#eef7f1] p-4 text-sm text-[#2f5c46]">
        <div className="flex items-center gap-2 font-bold">
          <CheckCircle2 className="h-4 w-4" /> Knowledge check completed
        </div>
        <p className="mt-1 text-xs">
          You scored {report.quizScore?.correct}/{report.quizScore?.total} and earned{" "}
          {report.awardedCapsules} Capsules.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-[#fafbf8] p-4">
      <div className="cq-kicker">KNOWLEDGE CHECK · 4 QUESTIONS</div>
      {questions.map((question, questionIndex) => (
        <fieldset key={question.questionId} className="space-y-2">
          <legend className="text-sm font-semibold">
            {questionIndex + 1}. {question.question}
          </legend>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {question.options.map((option) => {
              const picked = answers[questionIndex] === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() =>
                    setAnswers((current) => ({ ...current, [questionIndex]: option }))
                  }
                  className={
                    "rounded-lg border px-3 py-2 text-left text-xs font-medium transition " +
                    (picked
                      ? "border-primary bg-primary-soft text-primary"
                      : "border-border bg-white hover:bg-muted")
                  }
                >
                  {option}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}

      <div className="flex items-center gap-2">
        <Button onClick={submit} disabled={!answered || busy || result}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          Submit answers
        </Button>
        {!answered ? (
          <span className="text-xs text-muted-foreground">Answer all 4 to submit.</span>
        ) : null}
      </div>

      {error ? <p className="text-xs text-rose-600">{error}</p> : null}

      {result ? (
        <div className="space-y-2 rounded-lg border border-border bg-white p-3">
          <div className="text-sm font-bold">
            You scored {result.correctCount}/{result.total} · +{result.awardedCapsules} Capsules
          </div>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {(result.graded || []).map((item, index) => (
              <li key={item.questionId} className="flex items-start gap-1.5">
                {item.isCorrect ? (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                ) : (
                  <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" />
                )}
                <span>
                  {index + 1}. Correct answer: <strong>{item.correctAnswer}</strong>
                  {item.explanation ? ` — ${item.explanation}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
