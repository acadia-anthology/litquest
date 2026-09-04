// GET  /api/books?player_id=1  -> list that player's books (player_id required)
// POST /api/books               { player_id, title, author, pages, level, lit_score,
//                                  book_type, complexity, grade_level_num, added_at }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

// Loose match so "Harry Potter and the Sorcerer's Stone" and "...Sorcerers Stone"
// (apostrophe/case/spacing differences) are still caught as the same book.
function normTitle(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const playerId = new URL(request.url).searchParams.get("player_id");
  if (!playerId) {
    return Response.json({ error: "player_id query param is required" }, { status: 400 });
  }
  const { results } = await env.DB.prepare(
    `SELECT books.*,
            COALESCE((SELECT SUM(points_earned) FROM quiz_attempts WHERE quiz_attempts.book_id = books.id), 0) AS points_earned,
            (SELECT score FROM quiz_attempts WHERE quiz_attempts.book_id = books.id AND points_earned > 0 ORDER BY completed_at DESC LIMIT 1) AS quiz_score,
            (SELECT total FROM quiz_attempts WHERE quiz_attempts.book_id = books.id AND points_earned > 0 ORDER BY completed_at DESC LIMIT 1) AS quiz_total
     FROM books WHERE player_id = ? ORDER BY added_at DESC`
  )
    .bind(playerId)
    .all();
  return Response.json(results);
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const body = await request.json().catch(() => null);

  if (!body || typeof body.title !== "string" || !body.title.trim()) {
    return Response.json({ error: "title is required" }, { status: 400 });
  }
  if (!body.player_id) {
    return Response.json({ error: "player_id is required" }, { status: 400 });
  }

  // One entry per book per profile — check before anything else so a duplicate
  // doesn't burn a lookup/quiz-generation call for nothing.
  const existing = await env.DB.prepare("SELECT title FROM books WHERE player_id = ?")
    .bind(body.player_id)
    .all();
  const newTitleNorm = normTitle(body.title.trim());
  if (existing.results.some((b) => normTitle(b.title) === newTitleNorm)) {
    return Response.json(
      { error: "This book is already logged on this profile." },
      { status: 409 }
    );
  }

  // Books identified as Kindergarten-3rd grade can't be logged for points at all —
  // enforced server-side so it can't be bypassed even if a client bug lets it through.
  const gradeNum = Number(body.grade_level_num);
  if (Number.isFinite(gradeNum) && gradeNum < 4) {
    return Response.json(
      { error: "This book is below our 4th-grade-and-up floor and can't be logged." },
      { status: 400 }
    );
  }

  // Kids know page counts, not word counts — estimate ~250 words/page.
  const pages = Number(body.pages) || 0;
  const word_count = pages > 0 ? Math.round(pages * 250) : 5000;
  const litScore =
    Number.isFinite(Number(body.lit_score)) && body.lit_score !== "" ? Math.round(Number(body.lit_score)) : null;
  const bookType = ["Elementary", "Middle Grade", "YA", "Adult"].includes(body.book_type) ? body.book_type : null;
  const complexity = ["Light", "Standard", "Complex"].includes(body.complexity) ? body.complexity : null;

  const addedAt = DATE_RE.test(body.added_at) ? body.added_at : todayDate();

  // Logging an already-read backlog book: goes straight to Quiz Ready with its real
  // finish date on file — the quiz there is optional, just for bonus points.
  const alreadyFinished = DATE_RE.test(body.finished_at);
  const status = alreadyFinished ? "quiz_ready" : "reading";
  const finishedAt = alreadyFinished ? body.finished_at : null;

  const book = await env.DB.prepare(
    `INSERT INTO books (player_id, title, author, level, lit_score, book_type, complexity, pages, word_count, status, added_at, finished_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
  )
    .bind(
      body.player_id,
      body.title.trim(),
      body.author?.trim() || null,
      body.level?.trim() || null,
      litScore,
      bookType,
      complexity,
      pages > 0 ? pages : null,
      word_count,
      status,
      addedAt,
      finishedAt
    )
    .first();

  return Response.json(book, { status: 201 });
}
