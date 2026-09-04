import { withLevel } from "../_lib/level.js";

// GET  /api/players  -> list every player with computed level, ranked by points (for the leaderboard)
// POST /api/players   { name, avatar, reader_type }  -> create a new player/profile

export async function onRequestGet(context) {
  const { env } = context;
  const { results } = await env.DB.prepare(
    "SELECT * FROM players ORDER BY total_points DESC, created_at ASC"
  ).all();
  return Response.json(results.map(withLevel));
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const body = await request.json().catch(() => null);
  if (!body || typeof body.name !== "string" || !body.name.trim()) {
    return Response.json({ error: "name is required" }, { status: 400 });
  }

  const readerType = body.reader_type === "adult" ? "adult" : "kid";
  const defaultAvatar = readerType === "adult" ? "🍎" : "🍏";

  const player = await env.DB.prepare(
    "INSERT INTO players (name, avatar, reader_type) VALUES (?, ?, ?) RETURNING *"
  )
    .bind(body.name.trim(), body.avatar?.trim() || defaultAvatar, readerType)
    .first();

  return Response.json(withLevel(player), { status: 201 });
}
