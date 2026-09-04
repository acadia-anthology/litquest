// GET  /api/books?player_id=1  -> list that player's books (player_id required)
// POST /api/books               { player_id, title, author, pages, level }

export async function onRequestGet(context) {
  const { env, request } = context;
  const playerId = new URL(request.url).searchParams.get("player_id");
  if (!playerId) {
    return Response.json({ error: "player_id query param is required" }, { status: 400 });
  }
  const { results } = await env.DB.prepare(
    "SELECT * FROM books WHERE player_id = ? ORDER BY added_at DESC"
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

  const book = await env.DB.prepare(
    `INSERT INTO books (player_id, title, author, level, word_count, status)
     VALUES (?, ?, ?, ?, ?, 'reading') RETURNING *`
  )
    .bind(
      body.player_id,
      body.title.trim(),
      body.author?.trim() || null,
      body.level?.trim() || null,
      word_count
    )
    .first();

  return Response.json(book, { status: 201 });
}
