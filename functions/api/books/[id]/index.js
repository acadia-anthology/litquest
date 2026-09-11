// PATCH  /api/books/:id  { added_at?, finished_at?, title?, author? }  -> adjust a
//        book's dates, and/or fix its title/author (re-classified/re-scored, see below).
// DELETE /api/books/:id  -> remove a book, rolling back any points it earned

import { lookupBook } from "../../../_lib/booklookup.js";
import { titleCase, normTitle } from "../../../_lib/titlecase.js";
import { PASS_THRESHOLD, scoreBook } from "../../../_lib/scoring.js";
import { todayLocalDate } from "../../../_lib/date.js";

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
  const today = todayLocalDate();
  if (addedAt > today) {
    return Response.json({ error: "added_at can't be in the future" }, { status: 400 });
  }
  if (finishedAt !== null && finishedAt > today) {
    return Response.json({ error: "finished_at can't be in the future" }, { status: 400 });
  }

  let title = book.title;
  let author = book.author;
  if (typeof body.title === "string" && body.title.trim()) title = titleCase(body.title.trim());
  if (body.author !== undefined) author = body.author?.trim() ? titleCase(body.author.trim()) : null;

  const titleOrAuthorChanged = title !== book.title || author !== book.author;

  if (titleOrAuthorChanged) {
    // Don't let a fixed typo collide with another already-logged book on the
    // same profile — same guard the initial POST uses.
    const siblings = await env.DB.prepare("SELECT id, title FROM books WHERE player_id = ? AND id != ?")
      .bind(book.player_id, params.id)
      .all();
    const titleNorm = normTitle(title);
    if (siblings.results.some((b) => normTitle(b.title) === titleNorm)) {
      return Response.json(
        { error: "Another book with this title is already logged on this profile." },
        { status: 409 }
      );
    }
  }

  let level = book.level;
  let litScore = book.lit_score;
  let bookType = book.book_type;
  let complexity = book.complexity;
  let pages = book.pages;
  let wordCount = book.word_count;

  if (titleOrAuthorChanged) {
    // Fixing the title/author is pointless if the scoring data underneath it
    // still reflects the old (wrong) text — re-run the same lookup pipeline
    // used when first adding a book, so LitScore/type/pages/level all catch up.
    const lookup = await lookupBook(env, title, author).catch(() => ({ known: false }));
    if (lookup.title) title = lookup.title;
    if (lookup.author !== undefined) author = lookup.author || null;

    if (lookup.known) {
      // lookup.lit_score arrives as a Lexile-style string ("760L") — parseInt
      // reads the leading digits; Number() on the same string is NaN (a
      // trailing letter makes the whole string non-numeric), which would
      // silently null out a perfectly good score.
      const litScoreNum = parseInt(lookup.lit_score, 10);
      const parts = [];
      if (lookup.book_type) parts.push(lookup.book_type);
      if (Number.isFinite(litScoreNum)) parts.push(`LitScore ${litScoreNum}LS`);
      level = parts.join(" · ") || null;
      litScore = Number.isFinite(litScoreNum) ? litScoreNum : null;
      bookType = ["Elementary", "Middle Grade", "YA", "Adult"].includes(lookup.book_type) ? lookup.book_type : null;
      complexity = ["Light", "Standard", "Complex"].includes(lookup.complexity) ? lookup.complexity : null;
      pages = Number.isFinite(Number(lookup.pages)) ? Math.round(Number(lookup.pages)) : null;
      wordCount = pages > 0 ? Math.round(pages * 250) : 5000;
    } else {
      level = null;
      litScore = null;
      bookType = null;
      complexity = null;
      pages = null;
      wordCount = 5000;
    }
  }

  const updated = await env.DB.prepare(
    `UPDATE books SET added_at = ?, finished_at = ?, title = ?, author = ?, level = ?, lit_score = ?, book_type = ?, complexity = ?, pages = ?, word_count = ?
     WHERE id = ? RETURNING *`
  )
    .bind(addedAt, finishedAt, title, author, level, litScore, bookType, complexity, pages, wordCount, params.id)
    .first();

  // Every already-passed quiz attempt's points were computed from the OLD
  // (wrong) book data — recompute each with the corrected data and apply the
  // net difference to the player's total, so a typo fix doesn't leave stale
  // points on the books/leaderboard.
  if (titleOrAuthorChanged && book.status === "completed") {
    const player = await env.DB.prepare("SELECT reader_type FROM players WHERE id = ?")
      .bind(book.player_id)
      .first();
    const { basePoints } = scoreBook({ book_type: bookType, complexity, lit_score: litScore, word_count: wordCount }, player.reader_type);

    const { results: attempts } = await env.DB.prepare(
      "SELECT id, score, total, points_earned FROM quiz_attempts WHERE book_id = ?"
    )
      .bind(params.id)
      .all();

    let pointsDelta = 0;
    for (const attempt of attempts) {
      const pct = attempt.total > 0 ? attempt.score / attempt.total : 0;
      const passed = pct >= PASS_THRESHOLD;
      const newPoints = passed ? Math.round(basePoints * pct) : 0;
      if (newPoints !== attempt.points_earned) {
        pointsDelta += newPoints - attempt.points_earned;
        await env.DB.prepare("UPDATE quiz_attempts SET points_earned = ? WHERE id = ?")
          .bind(newPoints, attempt.id)
          .run();
      }
    }

    if (pointsDelta !== 0) {
      await env.DB.prepare("UPDATE players SET total_points = MAX(0, total_points + ?) WHERE id = ?")
        .bind(pointsDelta, book.player_id)
        .run();
    }
  }

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
