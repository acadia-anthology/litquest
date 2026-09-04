const POINTS_PER_LEVEL = 100;

// GET  /api/players  -> list every player with computed level, ranked by points (for the leaderboard)
// POST /api/players   { name, avatar }  -> create a new player/profile

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

  const player = await env.DB.prepare(
    "INSERT INTO players (name, avatar) VALUES (?, ?) RETURNING *"
  )
    .bind(body.name.trim(), body.avatar?.trim() || "🧑")
    .first();

  return Response.json(withLevel(player), { status: 201 });
}

function withLevel(player) {
  const level = Math.floor(player.total_points / POINTS_PER_LEVEL) + 1;
  const points_into_level = player.total_points % POINTS_PER_LEVEL;
  return {
    ...player,
    level,
    points_into_level,
    points_to_next_level: POINTS_PER_LEVEL - points_into_level,
  };
}
