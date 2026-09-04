// GET /api/quests/progress?player_id=1 -> both tracks' rewards evaluated against
// this player's all-time total_points (no cycles — points never reset), plus which
// reward(s), if any, were just newly crossed (for the celebration popup). Kid
// profiles only — callers should check reader_type first.
//
// Side effect: the first time a threshold is crossed, a claim row is inserted
// (idempotent — UNIQUE constraint means later calls are no-ops). For a "repeat"
// reward, a big point jump can cross several multiples at once — all of them are
// claimed and reported, not just the latest, so none are silently skipped.

export async function onRequestGet(context) {
  const { env, request } = context;
  const playerId = new URL(request.url).searchParams.get("player_id");
  if (!playerId) {
    return Response.json({ error: "player_id query param is required" }, { status: 400 });
  }

  const player = await env.DB.prepare("SELECT total_points FROM players WHERE id = ?")
    .bind(playerId)
    .first();
  if (!player) {
    return Response.json({ error: "Player not found" }, { status: 404 });
  }
  const totalPoints = player.total_points;

  const { results: rewards } = await env.DB.prepare(
    "SELECT * FROM quest_rewards WHERE player_id = ? ORDER BY quest_type, threshold ASC"
  )
    .bind(playerId)
    .all();
  const { results: claims } = await env.DB.prepare(
    "SELECT reward_id, milestone_points FROM quest_reward_claims WHERE player_id = ?"
  )
    .bind(playerId)
    .all();
  const claimed = new Set(claims.map((c) => `${c.reward_id}:${c.milestone_points}`));

  const newlyReached = [];
  const byTrack = { side: [], main: [] };

  for (const r of rewards) {
    if (r.reward_type === "repeat") {
      const crossed = Math.floor(totalPoints / r.threshold);
      let timesClaimed = 0;
      for (let m = 1; m <= crossed; m++) {
        const milestone = m * r.threshold;
        if (claimed.has(`${r.id}:${milestone}`)) {
          timesClaimed++;
          continue;
        }
        const inserted = await claimMilestone(env, playerId, r.id, milestone);
        if (inserted) {
          timesClaimed++;
          newlyReached.push({ claim_id: inserted.id, quest_type: r.quest_type, emoji: r.emoji, reward_text: r.reward_text });
        }
      }
      byTrack[r.quest_type].push({ ...r, times_claimed: timesClaimed, next_milestone: (timesClaimed + 1) * r.threshold });
    } else {
      const reached = totalPoints >= r.threshold;
      if (reached && !claimed.has(`${r.id}:${r.threshold}`)) {
        const inserted = await claimMilestone(env, playerId, r.id, r.threshold);
        if (inserted) {
          newlyReached.push({ claim_id: inserted.id, quest_type: r.quest_type, emoji: r.emoji, reward_text: r.reward_text });
        }
      }
      byTrack[r.quest_type].push({ ...r, reached });
    }
  }

  const tracks = ["side", "main"].map((quest_type) => ({ quest_type, rewards: byTrack[quest_type] }));

  return Response.json({ total_points: totalPoints, tracks, newly_reached: newlyReached });
}

async function claimMilestone(env, playerId, rewardId, milestonePoints) {
  return env.DB.prepare(
    `INSERT INTO quest_reward_claims (player_id, reward_id, milestone_points)
     VALUES (?, ?, ?)
     ON CONFLICT(player_id, reward_id, milestone_points) DO NOTHING
     RETURNING id`
  )
    .bind(playerId, rewardId, milestonePoints)
    .first();
}
