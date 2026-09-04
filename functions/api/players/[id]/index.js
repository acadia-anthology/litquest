// PATCH /api/players/:id  { reader_type }  -> change a player's Kid/Adult reader type

const POINTS_PER_LEVEL = 100;

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

function withLevel(player) {
  const level = Math.floor(player.total_points / POINTS_PER_LEVEL) + 1;
  const points_into_level = player.total_points % POINTS_PER_LEVEL;
  return {
    ...player,
    level,
    points_into_level,
    points_to_next_level: POINTS_PER_LEVEL - points_into_level,
  };
}
