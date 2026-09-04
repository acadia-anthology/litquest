// PATCH /api/players/:id  { reader_type?, name? }  -> change a player's Kid/Adult
// reader type and/or rename the profile. At least one field is required.

import { withLevel } from "../../../_lib/level.js";

export async function onRequestPatch(context) {
  const { env, params, request } = context;
  const body = await request.json().catch(() => null);

  const hasReaderType = body?.reader_type !== undefined;
  const hasName = body?.name !== undefined;

  if (!body || (!hasReaderType && !hasName)) {
    return Response.json({ error: "reader_type and/or name is required" }, { status: 400 });
  }
  if (hasReaderType && body.reader_type !== "kid" && body.reader_type !== "adult") {
    return Response.json({ error: 'reader_type must be "kid" or "adult"' }, { status: 400 });
  }
  if (hasName && !body.name.trim()) {
    return Response.json({ error: "name cannot be blank" }, { status: 400 });
  }

  const existing = await env.DB.prepare("SELECT * FROM players WHERE id = ?").bind(params.id).first();
  if (!existing) {
    return Response.json({ error: "Player not found" }, { status: 404 });
  }

  const readerType = hasReaderType ? body.reader_type : existing.reader_type;
  const name = hasName ? body.name.trim() : existing.name;

  const player = await env.DB.prepare(
    "UPDATE players SET reader_type = ?, name = ? WHERE id = ? RETURNING *"
  )
    .bind(readerType, name, params.id)
    .first();

  return Response.json(withLevel(player));
}
