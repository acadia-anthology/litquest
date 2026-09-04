// PATCH  /api/players/:id  { reader_type?, name?, avatar? }  -> change a player's
// Kid/Adult reader type, rename the profile, and/or change its avatar emoji. At
// least one field is required.
// DELETE /api/players/:id  { pin }  -> permanently remove a player and everything
// they logged (books, quizzes, quiz history, quest rewards). PIN-gated.

import { withLevel } from "../../../_lib/level.js";

const EDIT_PIN = "2112";

export async function onRequestPatch(context) {
  const { env, params, request } = context;
  const body = await request.json().catch(() => null);

  const hasReaderType = body?.reader_type !== undefined;
  const hasName = body?.name !== undefined;
  const hasAvatar = body?.avatar !== undefined;

  if (!body || (!hasReaderType && !hasName && !hasAvatar)) {
    return Response.json({ error: "reader_type, name, and/or avatar is required" }, { status: 400 });
  }
  if (hasReaderType && body.reader_type !== "kid" && body.reader_type !== "adult") {
    return Response.json({ error: 'reader_type must be "kid" or "adult"' }, { status: 400 });
  }
  if (hasName && !body.name.trim()) {
    return Response.json({ error: "name cannot be blank" }, { status: 400 });
  }
  if (hasAvatar && !body.avatar.trim()) {
    return Response.json({ error: "avatar cannot be blank" }, { status: 400 });
  }

  const existing = await env.DB.prepare("SELECT * FROM players WHERE id = ?").bind(params.id).first();
  if (!existing) {
    return Response.json({ error: "Player not found" }, { status: 404 });
  }

  const readerType = hasReaderType ? body.reader_type : existing.reader_type;
  const name = hasName ? body.name.trim() : existing.name;
  const avatar = hasAvatar ? body.avatar.trim() : existing.avatar;

  const player = await env.DB.prepare(
    "UPDATE players SET reader_type = ?, name = ?, avatar = ? WHERE id = ? RETURNING *"
  )
    .bind(readerType, name, avatar, params.id)
    .first();

  return Response.json(withLevel(player));
}

export async function onRequestDelete(context) {
  const { env, params, request } = context;
  const body = await request.json().catch(() => null);

  if (body?.pin !== EDIT_PIN) {
    return Response.json({ error: "Incorrect PIN" }, { status: 403 });
  }

  const existing = await env.DB.prepare("SELECT id FROM players WHERE id = ?").bind(params.id).first();
  if (!existing) {
    return Response.json({ error: "Player not found" }, { status: 404 });
  }

  await env.DB.prepare(
    "DELETE FROM quiz_attempts WHERE book_id IN (SELECT id FROM books WHERE player_id = ?)"
  )
    .bind(params.id)
    .run();
  await env.DB.prepare(
    "DELETE FROM quizzes WHERE book_id IN (SELECT id FROM books WHERE player_id = ?)"
  )
    .bind(params.id)
    .run();
  await env.DB.prepare("DELETE FROM books WHERE player_id = ?").bind(params.id).run();
  await env.DB.prepare("DELETE FROM quest_reward_claims WHERE player_id = ?").bind(params.id).run();
  await env.DB.prepare("DELETE FROM quest_rewards WHERE player_id = ?").bind(params.id).run();
  await env.DB.prepare("DELETE FROM players WHERE id = ?").bind(params.id).run();

  return Response.json({ deleted: true });
}
