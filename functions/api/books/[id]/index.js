// PATCH /api/books/:id  { added_at, finished_at }  -> adjust a book's dates (for backdating)

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function onRequestPatch(context) {
  const { env, params, request } = context;
  const body = await request.json().catch(() => null);
  if (!body) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const book = await env.DB.prepare("SELECT * FROM books WHERE id = ?")
    .bind(params.id)
    .first();
  if (!book) {
    return Response.json({ error: "Book not found" }, { status: 404 });
  }

  const addedAt = body.added_at !== undefined ? body.added_at : book.added_at;
  const finishedAt = body.finished_at !== undefined ? body.finished_at : book.finished_at;

  if (!DATE_RE.test(addedAt)) {
    return Response.json({ error: "added_at must be a YYYY-MM-DD date" }, { status: 400 });
  }
  if (finishedAt !== null && !DATE_RE.test(finishedAt)) {
    return Response.json({ error: "finished_at must be a YYYY-MM-DD date or null" }, { status: 400 });
  }

  const updated = await env.DB.prepare(
    "UPDATE books SET added_at = ?, finished_at = ? WHERE id = ? RETURNING *"
  )
    .bind(addedAt, finishedAt, params.id)
    .first();

  return Response.json(updated);
}
