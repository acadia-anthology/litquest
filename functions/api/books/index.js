export async function onRequestGet(context) {
  const { env } = context;
  const { results } = await env.DB.prepare(
    "SELECT * FROM books ORDER BY added_at DESC"
  ).all();
  return Response.json(results);
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const body = await request.json().catch(() => null);

  if (!body || typeof body.title !== "string" || !body.title.trim()) {
    return Response.json({ error: "title is required" }, { status: 400 });
  }

  // Kids know page counts, not word counts — estimate ~250 words/page.
  const pages = Number(body.pages) || 0;
  const word_count = pages > 0 ? Math.round(pages * 250) : 5000;

  const book = await env.DB.prepare(
    `INSERT INTO books (title, author, level, word_count, status)
     VALUES (?, ?, ?, ?, 'reading') RETURNING *`
  )
    .bind(
      body.title.trim(),
      body.author?.trim() || null,
      body.level?.trim() || null,
      word_count
    )
    .first();

  return Response.json(book, { status: 201 });
}
