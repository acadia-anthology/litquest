// GET  /api/books?player_id=1  -> list that player's books (player_id required)
// POST /api/books               { player_id, title, author, pages, level, added_at }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const playerId = new URL(request.url).searchParams.get("player_id");
  if (!playerId) {
    return Response.json({ error: "player_id query param is required" }, { status: 400 });
  }
  const { results } = await env.DB.prepare(
    `SELECT books.*,
            COALESCE((SELECT SUM(points_earned) FROM quiz_attempts WHERE quiz_attempts.book_id = books.id), 0) AS points_earned
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

  // Kids know page counts, not word counts — estimate ~250 words/page.
  const pages = Number(body.pages) || 0;
  const word_count = pages > 0 ? Math.round(pages * 250) : 5000;
  const lexile = Number.isFinite(Number(body.lexile)) && body.lexile !== "" ? Math.round(Number(body.lexile)) : null;

  const addedAt = DATE_RE.test(body.added_at) ? body.added_at : todayDate();

  // Logging an already-read backlog book: goes straight to Quiz Ready with its real
  // finish date on file — the quiz there is optional, just for bonus points.
  const alreadyFinished = DATE_RE.test(body.finished_at);
  const status = alreadyFinished ? "quiz_ready" : "reading";
  const finishedAt = alreadyFinished ? body.finished_at : null;

  const book = await env.DB.prepare(
    `INSERT INTO books (player_id, title, author, level, lexile, word_count, status, added_at, finished_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
  )
    .bind(
      body.player_id,
      body.title.trim(),
      body.author?.trim() || null,
      body.level?.trim() || null,
      lexile,
      word_count,
      status,
      addedAt,
      finishedAt
    )
    .first();

  return Response.json(book, { status: 201 });
}
