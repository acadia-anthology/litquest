// DELETE /api/quests/rewards/:id  { pin }  -> remove one reward tier

const EDIT_PIN = "2112";

export async function onRequestDelete(context) {
  const { env, params, request } = context;
  const body = await request.json().catch(() => null);

  if (body?.pin !== EDIT_PIN) {
    return Response.json({ error: "Incorrect PIN" }, { status: 403 });
  }

  await env.DB.prepare("DELETE FROM quest_rewards WHERE id = ?").bind(params.id).run();
  return Response.json({ deleted: true });
}
