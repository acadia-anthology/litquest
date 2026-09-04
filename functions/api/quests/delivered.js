// GET /api/quests/delivered -> the most recent delivered claims (any kid, any
// track), for a small "reward history" list on adult profiles.

export async function onRequestGet(context) {
  const { env } = context;
  const { results } = await env.DB.prepare(
    `SELECT quest_reward_claims.id, quest_reward_claims.quest_type, quest_reward_claims.delivered_at,
            players.name AS player_name, players.avatar AS player_avatar,
            quest_rewards.emoji, quest_rewards.reward_text
     FROM quest_reward_claims
     JOIN players ON players.id = quest_reward_claims.player_id
     JOIN quest_rewards ON quest_rewards.id = quest_reward_claims.reward_id
     WHERE quest_reward_claims.delivered_at IS NOT NULL
     ORDER BY quest_reward_claims.delivered_at DESC
     LIMIT 20`
  ).all();
  return Response.json(results);
}
