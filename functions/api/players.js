import { withLevel } from "../_lib/level.js";
import { getHouseholdId } from "../_lib/household.js";
import { isParentAuthed } from "../_lib/auth.js";
import { computeStreak } from "../_lib/streak.js";
import { todayLocalDate } from "../_lib/date.js";

// GET  /api/players  -> list every player with computed level + streak, ranked by points (for the leaderboard)
// POST /api/players   { name, avatar, reader_type }  -> create a new player/profile

export async function onRequestGet(context) {
  const { env } = context;
  const { results } = await env.DB.prepare(
    "SELECT * FROM players ORDER BY total_points DESC, created_at ASC"
  ).all();

  const { results: sessionDays } = await env.DB.prepare(
    "SELECT player_id, session_date, SUM(minutes) AS minutes FROM reading_sessions WHERE minutes IS NOT NULL GROUP BY player_id, session_date"
  ).all();

  const dailyMinutesByPlayer = {};
  for (const row of sessionDays) {
    (dailyMinutesByPlayer[row.player_id] ??= {})[row.session_date] = row.minutes;
  }

  const today = todayLocalDate();
  return Response.json(
    results.map((p) => ({
      ...withLevel(p),
      streak: computeStreak(dailyMinutesByPlayer[p.id] || {}, today),
    }))
  );
}

export async function onRequestPost(context) {
  const { env, request } = context;

  if (!(await isParentAuthed(request))) {
    return Response.json({ error: "Parent Mode required" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body.name !== "string" || !body.name.trim()) {
    return Response.json({ error: "name is required" }, { status: 400 });
  }

  const readerType = body.reader_type === "adult" ? "adult" : "kid";
  const defaultAvatar = readerType === "adult" ? "🍎" : "🍏";
  const householdId = await getHouseholdId(env);

  const player = await env.DB.prepare(
    "INSERT INTO players (household_id, name, avatar, reader_type) VALUES (?, ?, ?, ?) RETURNING *"
  )
    .bind(householdId, body.name.trim(), body.avatar?.trim() || defaultAvatar, readerType)
    .first();

  return Response.json(withLevel(player), { status: 201 });
}
