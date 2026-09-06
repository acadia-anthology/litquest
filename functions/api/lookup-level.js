// POST /api/lookup-level  { title, author }  -> classify a new book before logging it.
// See functions/_lib/booklookup.js for the actual lookup/classification pipeline —
// shared with /api/books/:id's "re-check this book" PATCH.

import { lookupBook } from "../_lib/booklookup.js";

export async function onRequestPost(context) {
  const { env, request } = context;
  const body = await request.json().catch(() => null);
  if (!body?.title?.trim()) {
    return Response.json({ error: "title is required" }, { status: 400 });
  }

  const result = await lookupBook(env, body.title, body.author);
  if (result.error) {
    return Response.json({ error: result.error }, { status: result.error.includes("GROQ") ? 500 : 400 });
  }
  return Response.json(result);
}
