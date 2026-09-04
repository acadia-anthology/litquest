// GET /api/books/:id/points-breakdown -> explains exactly how this book's points
// were calculated, for the "why did I get X points" popup on a Completed row.

import { lengthTierLabel, scoreBook } from "../../../_lib/scoring.js";

export async function onRequestGet(context) {
  const { env, params } = context;

  const book = await env.DB.prepare(
    `SELECT books.*,
            (SELECT score FROM quiz_attempts WHERE quiz_attempts.book_id = books.id AND points_earned > 0 ORDER BY completed_at DESC LIMIT 1) AS quiz_score,
            (SELECT total FROM quiz_attempts WHERE quiz_attempts.book_id = books.id AND points_earned > 0 ORDER BY completed_at DESC LIMIT 1) AS quiz_total,
            (SELECT SUM(points_earned) FROM quiz_attempts WHERE quiz_attempts.book_id = books.id) AS points_earned
     FROM books WHERE id = ?`
  )
    .bind(params.id)
    .first();
  if (!book) {
    return Response.json({ error: "Book not found" }, { status: 404 });
  }

  const player = await env.DB.prepare("SELECT reader_type FROM players WHERE id = ?")
    .bind(book.player_id)
    .first();

  const { multiplier, basePoints } = scoreBook(book, player.reader_type);
  const pct = book.quiz_total ? book.quiz_score / book.quiz_total : null;

  return Response.json({
    reader_type: player.reader_type,
    word_count: book.word_count,
    length_tier_label: lengthTierLabel(book.word_count),
    lit_score: book.lit_score,
    book_type: book.book_type,
    complexity: book.complexity,
    multiplier,
    base_points: basePoints,
    quiz_score: book.quiz_score,
    quiz_total: book.quiz_total,
    pct,
    points_earned: book.points_earned,
  });
}
