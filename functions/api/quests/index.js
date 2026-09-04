// GET  /api/quests?player_id=1                                   -> that player's two quest tracks + reward tiers (open to view)
// POST /api/quests { player_id, quest_type, period_months, pin } -> set a track's cycle length (PIN-gated)

import { currentCycleBounds } from "../../_lib/quests.js";

const EDIT_PIN = "2112";

export async function onRequestGet(context) {
  const { env, request } = context;
  const playerId = new URL(request.url).searchParams.get("player_id");
  if (!playerId) {
    return Response.json({ error: "player_id query param is required" }, { status: 400 });
  }

  const { results: quests } = await env.DB.prepare("SELECT * FROM quests WHERE player_id = ?")
    .bind(playerId)
    .all();
  const { results: rewards } = await env.DB.prepare(
    "SELECT * FROM quest_rewards WHERE player_id = ? ORDER BY quest_type, threshold ASC"
  )
    .bind(playerId)
    .all();

  const shaped = ["side", "main"].map((quest_type) => {
    const q = quests.find((x) => x.quest_type === quest_type);
    const tiers = rewards.filter((r) => r.quest_type === quest_type);
    return {
      quest_type,
      period_months: q?.period_months ?? null,
      anchor_date: q?.anchor_date ?? null,
      ...(q ? currentCycleBounds(q.anchor_date, q.period_months) : { start: null, end: null }),
      rewards: tiers,
    };
  });

  return Response.json(shaped);
}

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
  const periodMonths = Number(body.period_months);
  if (!Number.isInteger(periodMonths) || periodMonths < 1) {
    return Response.json({ error: "period_months must be a positive whole number" }, { status: 400 });
  }

  // anchor_date is set once, the first time this track is configured, and kept on
  // later edits — changing the period shouldn't silently restart the cycle clock.
  const existing = await env.DB.prepare(
    "SELECT anchor_date FROM quests WHERE player_id = ? AND quest_type = ?"
  )
    .bind(body.player_id, body.quest_type)
    .first();
  const anchorDate = existing?.anchor_date ?? new Date().toISOString().slice(0, 10);

  const quest = await env.DB.prepare(
    `INSERT INTO quests (player_id, quest_type, period_months, anchor_date) VALUES (?, ?, ?, ?)
     ON CONFLICT(player_id, quest_type) DO UPDATE SET period_months = excluded.period_months
     RETURNING *`
  )
    .bind(body.player_id, body.quest_type, periodMonths, anchorDate)
    .first();

  return Response.json({ ...quest, ...currentCycleBounds(quest.anchor_date, quest.period_months) });
}
