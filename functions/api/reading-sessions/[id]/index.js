// PATCH /api/reading-sessions/:id { action: "stop" }  -> stop the timer, compute minutes, check streak bonus
// PATCH /api/reading-sessions/:id { minutes }          -> correct an already-stopped session's minutes
// DELETE /api/reading-sessions/:id                     -> remove a session outright

import { checkStreakBonus } from "../../../_lib/streak.js";

export async function onRequestPatch(context) {
  const { env, params, request } = context;
  const body = await request.json().catch(() => null);

  const existing = await env.DB.prepare("SELECT * FROM reading_sessions WHERE id = ?").bind(params.id).first();
  if (!existing) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  if (body?.action === "stop") {
    if (existing.ended_at) {
      return Response.json({ error: "This session is already stopped" }, { status: 400 });
    }
    const session = await env.DB.prepare(
      `UPDATE reading_sessions
       SET ended_at = datetime('now'),
           minutes = MAX(1, CAST(ROUND((julianday('now') - julianday(started_at)) * 1440) AS INTEGER))
       WHERE id = ? RETURNING *`
    )
      .bind(params.id)
      .first();

    await checkStreakBonus(env, session.player_id);
    return Response.json(session);
  }

  if (body?.minutes !== undefined) {
    if (!existing.ended_at) {
      return Response.json({ error: "Stop the timer before editing its minutes" }, { status: 400 });
    }
    const minutes = Number(body.minutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 720) {
      return Response.json({ error: "minutes must be a whole number between 1 and 720" }, { status: 400 });
    }
    const session = await env.DB.prepare("UPDATE reading_sessions SET minutes = ? WHERE id = ? RETURNING *")
      .bind(minutes, params.id)
      .first();
    return Response.json(session);
  }

  return Response.json({ error: 'Provide action: "stop" or a minutes value' }, { status: 400 });
}

export async function onRequestDelete(context) {
  const { env, params } = context;
  await env.DB.prepare("DELETE FROM reading_sessions WHERE id = ?").bind(params.id).run();
  return Response.json({ deleted: true });
}
