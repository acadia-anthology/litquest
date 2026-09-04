// GET /api/quests/archive?player_id=1 -> that kid's delivered reward claims,
// most recent first, for the Archived section at the bottom of /rewards.

export async function onRequestGet(context) {
  const { env, request } = context;
  const playerId = new URL(request.url).searchParams.get("player_id");
  if (!playerId) {
    return Response.json({ error: "player_id query param is required" }, { status: 400 });
  }

  const { results } = await env.DB.prepare(
    `SELECT quest_reward_claims.id, quest_reward_claims.delivered_at, quest_reward_claims.milestone_points,
            quest_rewards.quest_type, quest_rewards.emoji, quest_rewards.reward_text
     FROM quest_reward_claims
     JOIN quest_rewards ON quest_rewards.id = quest_reward_claims.reward_id
     WHERE quest_reward_claims.player_id = ? AND quest_reward_claims.delivered_at IS NOT NULL
     ORDER BY quest_reward_claims.delivered_at DESC`
  )
    .bind(playerId)
    .all();

  return Response.json(results);
}
