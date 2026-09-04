// POST /api/quests/rewards { player_id, quest_type, threshold, emoji, reward_text, pin } -> add/update one tier

const EDIT_PIN = "2112";

export async function onRequestPost(context) {
  const { env, request } = context;
  const body = await request.json().catch(() => null);

  if (body?.pin !== EDIT_PIN) {
    return Response.json({ error: "Incorrect PIN" }, { status: 403 });
  }
  if (!body.player_id) {
    return Response.json({ error: "player_id is required" }, { status: 400 });
  }
  if (body.quest_type !== "side" && body.quest_type !== "main") {
    return Response.json({ error: 'quest_type must be "side" or "main"' }, { status: 400 });
  }
  const threshold = Number(body.threshold);
  if (!Number.isInteger(threshold) || threshold < 1) {
    return Response.json({ error: "threshold must be a positive whole number" }, { status: 400 });
  }
  if (!body.emoji?.trim()) {
    return Response.json({ error: "emoji is required" }, { status: 400 });
  }
  if (!body.reward_text?.trim()) {
    return Response.json({ error: "reward_text is required" }, { status: 400 });
  }

  const reward = await env.DB.prepare(
    `INSERT INTO quest_rewards (player_id, quest_type, threshold, emoji, reward_text) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(player_id, quest_type, threshold) DO UPDATE SET emoji = excluded.emoji, reward_text = excluded.reward_text
     RETURNING *`
  )
    .bind(body.player_id, body.quest_type, threshold, body.emoji.trim(), body.reward_text.trim())
    .first();

  return Response.json(reward);
}
