// PATCH  /api/quests/rewards/:id  { threshold?, reward_type?, emoji?, reward_text?, pin }  -> edit one tier in place
// DELETE /api/quests/rewards/:id  { pin }                                                  -> remove one reward tier

const EDIT_PIN = "2112";

export async function onRequestPatch(context) {
  const { env, params, request } = context;
  const body = await request.json().catch(() => null);

  if (body?.pin !== EDIT_PIN) {
    return Response.json({ error: "Incorrect PIN" }, { status: 403 });
  }

  const existing = await env.DB.prepare("SELECT * FROM quest_rewards WHERE id = ?").bind(params.id).first();
  if (!existing) {
    return Response.json({ error: "Reward not found" }, { status: 404 });
  }

  let threshold = existing.threshold;
  if (body.threshold !== undefined) {
    threshold = Number(body.threshold);
    if (!Number.isInteger(threshold) || threshold < 1) {
      return Response.json({ error: "threshold must be a positive whole number" }, { status: 400 });
    }
  }
  let rewardType = existing.reward_type;
  if (body.reward_type !== undefined) {
    rewardType = body.reward_type === "repeat" ? "repeat" : "once";
  }
  const emoji = body.emoji !== undefined ? body.emoji.trim() : existing.emoji;
  if (!emoji) {
    return Response.json({ error: "emoji is required" }, { status: 400 });
  }
  const rewardText = body.reward_text !== undefined ? body.reward_text.trim() : existing.reward_text;
  if (!rewardText) {
    return Response.json({ error: "reward_text is required" }, { status: 400 });
  }

  let reward;
  try {
    reward = await env.DB.prepare(
      `UPDATE quest_rewards SET threshold = ?, reward_type = ?, emoji = ?, reward_text = ? WHERE id = ? RETURNING *`
    )
      .bind(threshold, rewardType, emoji, rewardText, params.id)
      .first();
  } catch {
    return Response.json({ error: "Another reward on this track already uses that point value" }, { status: 409 });
  }

  return Response.json(reward);
}

export async function onRequestDelete(context) {
  const { env, params, request } = context;
  const body = await request.json().catch(() => null);

  if (body?.pin !== EDIT_PIN) {
    return Response.json({ error: "Incorrect PIN" }, { status: 403 });
  }

  await env.DB.prepare("DELETE FROM quest_rewards WHERE id = ?").bind(params.id).run();
  return Response.json({ deleted: true });
}
