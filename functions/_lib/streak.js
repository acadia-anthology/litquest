import { todayLocalDate } from "./date.js";

export const STREAK_DAILY_MINUTES = 30;
export const STREAK_BONUS_INTERVAL = 5;
export const STREAK_BONUS_POINTS = 25;

function addDays(dateStr, delta) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

// dailyMinutes: { "YYYY-MM-DD": totalMinutesThatDay }. If today doesn't yet
// have 30+ minutes, count from yesterday instead -- the streak shouldn't drop
// to 0 mid-day just because today isn't logged yet.
export function computeStreak(dailyMinutes, todayStr) {
  const qualifies = (d) => (dailyMinutes[d] || 0) >= STREAK_DAILY_MINUTES;

  let cursor = qualifies(todayStr) ? todayStr : addDays(todayStr, -1);
  let streak = 0;
  while (qualifies(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

// Call after a reading session is stopped. Recomputes the player's streak and,
// if it just crossed a new multiple of STREAK_BONUS_INTERVAL, awards the bonus.
// Safe to call repeatedly -- the UNIQUE(player_id, days) constraint on
// streak_bonuses means a duplicate award attempt just no-ops.
export async function checkStreakBonus(env, playerId) {
  const { results } = await env.DB.prepare(
    "SELECT session_date, SUM(minutes) AS minutes FROM reading_sessions WHERE player_id = ? AND minutes IS NOT NULL GROUP BY session_date"
  )
    .bind(playerId)
    .all();

  const dailyMinutes = {};
  for (const row of results) dailyMinutes[row.session_date] = row.minutes;

  const today = todayLocalDate();
  const streak = computeStreak(dailyMinutes, today);
  if (streak === 0 || streak % STREAK_BONUS_INTERVAL !== 0) return;

  const inserted = await env.DB.prepare(
    "INSERT INTO streak_bonuses (player_id, days, points_earned, bonus_date) VALUES (?, ?, ?, ?) ON CONFLICT(player_id, days) DO NOTHING RETURNING id"
  )
    .bind(playerId, streak, STREAK_BONUS_POINTS, today)
    .first();

  if (inserted) {
    await env.DB.prepare("UPDATE players SET total_points = total_points + ? WHERE id = ?")
      .bind(STREAK_BONUS_POINTS, playerId)
      .run();
  }
}
