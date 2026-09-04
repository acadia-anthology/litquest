// POST /api/quiz/:id/submit  { answers: [chosen_index, ...] }
// Grades the quiz, awards points on a passing score (>=80%), updates the book's player.

const PASS_THRESHOLD = 0.8;

// Base points by book length (estimated word count).
function lengthTierPoints(wordCount) {
  if (wordCount < 10000) return 10;
  if (wordCount < 40000) return 25;
  if (wordCount < 80000) return 45;
  return 70;
}

// Kid scoring: reward reading above grade level, scale back for books well below it.
// Centered on a typical 6th-grade LitScore band (~800-1000L); no score on file = neutral.
function kidMultiplier(litScore) {
  if (litScore == null) return 1;
  if (litScore < 500) return 0.5;
  if (litScore < 800) return 0.75;
  if (litScore < 1000) return 1;
  if (litScore < 1200) return 1.5;
  return 2;
}

// Adult scoring: a kids'/YA book isn't hard reading for an adult regardless of its
// own LitScore, so grade by book_type instead — then within genuinely Adult books,
// grade by complexity (a cozy mystery vs. dense literary fiction aren't equivalent).
function adultMultiplier(bookType, complexity) {
  if (bookType === "Elementary") return 0.5;
  if (bookType === "Middle Grade") return 0.6;
  if (bookType === "YA") return 0.8;
  if (bookType === "Adult") {
    if (complexity === "Light") return 0.75;
    if (complexity === "Complex") return 2;
    return 1; // Standard, or complexity unknown
  }
  return 1; // book_type unknown — neutral
}

export async function onRequestPost(context) {
  const { env, params, request } = context;
  const body = await request.json().catch(() => null);
  const answers = body?.answers;

  const quiz = await env.DB.prepare("SELECT * FROM quizzes WHERE id = ?")
    .bind(params.id)
    .first();
  if (!quiz) {
    return Response.json({ error: "Quiz not found" }, { status: 404 });
  }

  const questions = JSON.parse(quiz.questions_json);
  if (!Array.isArray(answers) || answers.length !== questions.length) {
    return Response.json(
      { error: `answers must be an array of ${questions.length} choice indices` },
      { status: 400 }
    );
  }

  let score = 0;
  const results = questions.map((q, i) => {
    const correct = answers[i] === q.correct_index;
    if (correct) score++;
    return { question: q.question, correct_index: q.correct_index, chosen_index: answers[i], correct };
  });

  const book = await env.DB.prepare("SELECT * FROM books WHERE id = ?")
    .bind(quiz.book_id)
    .first();
  const player = await env.DB.prepare("SELECT * FROM players WHERE id = ?")
    .bind(book.player_id)
    .first();

  const total = questions.length;
  const pct = score / total;
  const passed = pct >= PASS_THRESHOLD;
  const multiplier =
    player.reader_type === "adult"
      ? adultMultiplier(book.book_type, book.complexity)
      : kidMultiplier(book.lit_score);
  const basePoints = Math.round(lengthTierPoints(book.word_count) * multiplier);
  const pointsEarned = passed ? Math.round(basePoints * pct) : 0;

  await env.DB.prepare(
    "INSERT INTO quiz_attempts (quiz_id, book_id, player_id, score, total, points_earned) VALUES (?, ?, ?, ?, ?, ?)"
  )
    .bind(params.id, quiz.book_id, book.player_id, score, total, pointsEarned)
    .run();

  if (passed) {
    // Backdated backlog books already have a real finished_at on file — keep it
    // instead of overwriting with today (the date the optional quiz happened to be taken).
    await env.DB.prepare(
      "UPDATE books SET status = 'completed', finished_at = COALESCE(finished_at, ?) WHERE id = ?"
    )
      .bind(new Date().toISOString().slice(0, 10), quiz.book_id)
      .run();
    await env.DB.prepare(
      "UPDATE players SET total_points = total_points + ?, books_completed = books_completed + 1 WHERE id = ?"
    )
      .bind(pointsEarned, book.player_id)
      .run();
  } else {
    // Failing keeps the book in quiz_ready so she can retake it after a re-read/refresh.
    await env.DB.prepare("UPDATE books SET status = 'quiz_ready' WHERE id = ?")
      .bind(quiz.book_id)
      .run();
  }

  return Response.json({ score, total, passed, points_earned: pointsEarned, results });
}
