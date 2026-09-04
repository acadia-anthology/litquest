// PATCH  /api/books/:id  { added_at, finished_at }  -> adjust a book's dates (for backdating)
// DELETE /api/books/:id  -> remove a book, rolling back any points it earned

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

export async function onRequestDelete(context) {
  const { env, params } = context;

  const book = await env.DB.prepare("SELECT * FROM books WHERE id = ?")
    .bind(params.id)
    .first();
  if (!book) {
    return Response.json({ error: "Book not found" }, { status: 404 });
  }

  // Every attempt's points_earned sums to exactly what this book contributed
  // to the player's total (fails are 0, so retakes don't double-count).
  const { points } = await env.DB.prepare(
    "SELECT COALESCE(SUM(points_earned), 0) AS points FROM quiz_attempts WHERE book_id = ?"
  )
    .bind(params.id)
    .first();

  await env.DB.prepare("DELETE FROM quiz_attempts WHERE book_id = ?").bind(params.id).run();
  await env.DB.prepare("DELETE FROM quizzes WHERE book_id = ?").bind(params.id).run();
  await env.DB.prepare("DELETE FROM books WHERE id = ?").bind(params.id).run();

  if (book.status === "completed" && points > 0) {
    await env.DB.prepare(
      "UPDATE players SET total_points = MAX(0, total_points - ?), books_completed = MAX(0, books_completed - 1) WHERE id = ?"
    )
      .bind(points, book.player_id)
      .run();
  } else if (book.status === "completed") {
    await env.DB.prepare(
      "UPDATE players SET books_completed = MAX(0, books_completed - 1) WHERE id = ?"
    )
      .bind(book.player_id)
      .run();
  }

  return Response.json({ deleted: true });
}
