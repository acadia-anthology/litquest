// GET /api/quests/progress?player_id=1 -> both tracks' current-cycle progress for
// this player, plus which reward, if any, they just newly crossed (for the
// celebration popup). Kid profiles only — callers should check reader_type first.
//
// Side effect: the first time a threshold is found crossed for the current cycle,
// a claim row is inserted (idempotent — UNIQUE constraint means later calls in the
// same cycle are no-ops). That claim is what drives both the kid's one-time popup
// and the parent's "mark delivered" notice.

import { currentCycleBounds } from "../../_lib/quests.js";

export async function onRequestGet(context) {
  const { env, request } = context;
  const playerId = new URL(request.url).searchParams.get("player_id");
  if (!playerId) {
    return Response.json({ error: "player_id query param is required" }, { status: 400 });
  }

  const { results: quests } = await env.DB.prepare("SELECT * FROM quests").all();
  const { results: rewards } = await env.DB.prepare(
    "SELECT * FROM quest_rewards ORDER BY quest_type, threshold ASC"
  ).all();

  const newlyReached = [];
  const tracks = [];

  for (const questType of ["side", "main"]) {
    const q = quests.find((x) => x.quest_type === questType);
    const tiers = rewards.filter((r) => r.quest_type === questType);

    if (!q) {
      tracks.push({ quest_type: questType, configured: false });
      continue;
    }

    const { start, end } = currentCycleBounds(q.anchor_date, q.period_months);

    const { points } = await env.DB.prepare(
      `SELECT COALESCE(SUM(points_earned), 0) AS points FROM quiz_attempts
       WHERE player_id = ? AND completed_at >= ? AND completed_at < ?`
    )
      .bind(playerId, start, end)
      .first();

    // Claim any newly-crossed thresholds for this cycle (INSERT OR IGNORE makes
    // re-running this on every page load safe — only the first crossing sticks).
    for (const tier of tiers.filter((t) => t.threshold <= points)) {
      const inserted = await env.DB.prepare(
        `INSERT INTO quest_reward_claims (player_id, quest_type, cycle_start, reward_id)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(player_id, quest_type, cycle_start, reward_id) DO NOTHING
         RETURNING id`
      )
        .bind(playerId, questType, start, tier.id)
        .first();

      if (inserted) {
        newlyReached.push({ claim_id: inserted.id, quest_type: questType, emoji: tier.emoji, reward_text: tier.reward_text });
      }
    }

    tracks.push({
      quest_type: questType,
      configured: true,
      period_months: q.period_months,
      cycle_start: start,
      cycle_end: end,
      points,
      rewards: tiers.map((t) => ({ ...t, reached: t.threshold <= points })),
    });
  }

  return Response.json({ tracks, newly_reached: newlyReached });
}
