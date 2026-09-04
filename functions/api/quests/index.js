// GET /api/quests?player_id=1 -> that player's two reward tracks (Side/Main), for
// managing on the /rewards page. Open to view; adding/editing/deleting individual
// rewards is PIN-gated in functions/api/quests/rewards/.

export async function onRequestGet(context) {
  const { env, request } = context;
  const playerId = new URL(request.url).searchParams.get("player_id");
  if (!playerId) {
    return Response.json({ error: "player_id query param is required" }, { status: 400 });
  }

  const { results: rewards } = await env.DB.prepare(
    "SELECT * FROM quest_rewards WHERE player_id = ? ORDER BY quest_type, threshold ASC"
  )
    .bind(playerId)
    .all();

  const shaped = ["side", "main"].map((quest_type) => ({
    quest_type,
    rewards: rewards.filter((r) => r.quest_type === quest_type),
  }));

  return Response.json(shaped);
}
