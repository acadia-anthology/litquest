// POST /api/reading-sessions { player_id, book_id } -> start a reading timer.
// Only one open session per player at a time (409 backstop -- the client
// already prevents this in normal use by disabling other Start buttons).

import { todayLocalDate } from "../../_lib/date.js";

export async function onRequestPost(context) {
  const { env, request } = context;
  const body = await request.json().catch(() => null);

  if (!body?.player_id || !body?.book_id) {
    return Response.json({ error: "player_id and book_id are required" }, { status: 400 });
  }

  const book = await env.DB.prepare("SELECT * FROM books WHERE id = ? AND player_id = ?")
    .bind(body.book_id, body.player_id)
    .first();
  if (!book) {
    return Response.json({ error: "Book not found for this player" }, { status: 404 });
  }
  if (book.status !== "reading") {
    return Response.json({ error: "Can only time a book that's currently being read" }, { status: 400 });
  }

  const openSession = await env.DB.prepare(
    "SELECT reading_sessions.*, books.title FROM reading_sessions JOIN books ON books.id = reading_sessions.book_id WHERE reading_sessions.player_id = ? AND reading_sessions.ended_at IS NULL"
  )
    .bind(body.player_id)
    .first();
  if (openSession) {
    return Response.json({ error: `A timer is already running for "${openSession.title}"` }, { status: 409 });
  }

  const session = await env.DB.prepare(
    "INSERT INTO reading_sessions (player_id, book_id, session_date) VALUES (?, ?, ?) RETURNING *"
  )
    .bind(body.player_id, body.book_id, todayLocalDate())
    .first();

  return Response.json(session, { status: 201 });
}
