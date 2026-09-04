// GET /api/books/:id/quiz-review -> the passing quiz attempt's questions, choices,
// correct answers, and what was actually chosen, for reviewing missed questions.

export async function onRequestGet(context) {
  const { env, params } = context;

  const attempt = await env.DB.prepare(
    "SELECT * FROM quiz_attempts WHERE book_id = ? AND points_earned > 0 ORDER BY completed_at DESC LIMIT 1"
  )
    .bind(params.id)
    .first();

  if (!attempt) {
    return Response.json({ error: "No passing quiz attempt on file for this book" }, { status: 404 });
  }

  const quiz = await env.DB.prepare("SELECT questions_json FROM quizzes WHERE id = ?")
    .bind(attempt.quiz_id)
    .first();
  if (!quiz) {
    return Response.json({ error: "Quiz record not found" }, { status: 404 });
  }

  const questions = JSON.parse(quiz.questions_json);

  // Attempts from before this feature shipped never recorded which choices were
  // picked — show the score but be honest that per-question detail isn't available.
  if (!attempt.answers_json) {
    return Response.json({ score: attempt.score, total: attempt.total, questions: null });
  }

  const answers = JSON.parse(attempt.answers_json);
  const reviewed = questions.map((q, i) => ({
    question: q.question,
    choices: q.choices,
    correct_index: q.correct_index,
    chosen_index: answers[i] ?? null,
    correct: answers[i] === q.correct_index,
  }));

  return Response.json({ score: attempt.score, total: attempt.total, questions: reviewed });
}
