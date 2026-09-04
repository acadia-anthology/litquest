// PATCH /api/players/:id  { reader_type }  -> change a player's Kid/Adult reader type

import { withLevel } from "../../../_lib/level.js";

export async function onRequestPatch(context) {
  const { env, params, request } = context;
  const body = await request.json().catch(() => null);
  if (!body || (body.reader_type !== "kid" && body.reader_type !== "adult")) {
    return Response.json({ error: 'reader_type must be "kid" or "adult"' }, { status: 400 });
  }

  const player = await env.DB.prepare(
    "UPDATE players SET reader_type = ? WHERE id = ? RETURNING *"
  )
    .bind(body.reader_type, params.id)
    .first();

  if (!player) {
    return Response.json({ error: "Player not found" }, { status: 404 });
  }

  return Response.json(withLevel(player));
}
