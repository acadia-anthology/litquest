// PATCH /api/quests/claims/:id  { action: "seen" | "deliver" }
// "seen" marks the kid's celebration popup as shown (don't show it again) --
// open to anyone, it's just the kid's own acknowledgment.
// "deliver" marks a parent has actually handed over the reward (clears the
// notice) -- Parent-Mode-gated, since this is a real confirmation, not a popup ack.

import { isParentAuthed } from "../../../../_lib/auth.js";

export async function onRequestPatch(context) {
  const { env, params, request } = context;
  const body = await request.json().catch(() => null);

  if (body?.action === "seen") {
    await env.DB.prepare("UPDATE quest_reward_claims SET seen_at = datetime('now') WHERE id = ?")
      .bind(params.id)
      .run();
  } else if (body?.action === "deliver") {
    if (!(await isParentAuthed(request))) {
      return Response.json({ error: "Parent Mode required" }, { status: 403 });
    }
    await env.DB.prepare("UPDATE quest_reward_claims SET delivered_at = datetime('now') WHERE id = ?")
      .bind(params.id)
      .run();
  } else {
    return Response.json({ error: 'action must be "seen" or "deliver"' }, { status: 400 });
  }

  return Response.json({ ok: true });
}
