// PATCH /api/quests/claims/:id  { action: "seen" | "deliver" }
// "seen" marks the kid's celebration popup as shown (don't show it again).
// "deliver" marks a parent has actually handed over the reward (clears the notice).
// Neither needs the PIN — these are simple acknowledgments, not reward config edits.

export async function onRequestPatch(context) {
  const { env, params, request } = context;
  const body = await request.json().catch(() => null);

  if (body?.action === "seen") {
    await env.DB.prepare("UPDATE quest_reward_claims SET seen_at = datetime('now') WHERE id = ?")
      .bind(params.id)
      .run();
  } else if (body?.action === "deliver") {
    await env.DB.prepare("UPDATE quest_reward_claims SET delivered_at = datetime('now') WHERE id = ?")
      .bind(params.id)
      .run();
  } else {
    return Response.json({ error: 'action must be "seen" or "deliver"' }, { status: 400 });
  }

  return Response.json({ ok: true });
}
