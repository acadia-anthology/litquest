// GET /api/stats/monthly-books?month=2026-09 -> [{id, name, avatar, count}, ...]
// Books each player completed in that month, for the "Books Read" bar chart.

const MONTH_RE = /^\d{4}-\d{2}$/;

export async function onRequestGet(context) {
  const { env, request } = context;
  const month = new URL(request.url).searchParams.get("month");
  if (!MONTH_RE.test(month)) {
    return Response.json({ error: "month must be YYYY-MM" }, { status: 400 });
  }

  const { results: players } = await env.DB.prepare("SELECT id, name, avatar FROM players").all();
  const { results: counts } = await env.DB.prepare(
    `SELECT player_id, COUNT(*) AS count FROM books
     WHERE status = 'completed' AND finished_at LIKE ?
     GROUP BY player_id`
  )
    .bind(`${month}%`)
    .all();

  const countByPlayer = Object.fromEntries(counts.map((r) => [r.player_id, r.count]));
  const result = players.map((p) => ({ ...p, count: countByPlayer[p.id] || 0 }));

  return Response.json(result);
}
