// GET /api/streak-bonuses?player_id=1 -> that player's awarded streak bonuses

export async function onRequestGet(context) {
  const { env, request } = context;
  const playerId = new URL(request.url).searchParams.get("player_id");
  if (!playerId) {
    return Response.json({ error: "player_id query param is required" }, { status: 400 });
  }
  const { results } = await env.DB.prepare(
    "SELECT * FROM streak_bonuses WHERE player_id = ? ORDER BY awarded_at DESC"
  )
    .bind(playerId)
    .all();
  return Response.json(results);
}
