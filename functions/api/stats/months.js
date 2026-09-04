// GET /api/stats/months -> ["2026-09", "2026-08", ...] every month with a completed book,
// descending, always including the current month even if it has no books yet.

export async function onRequestGet(context) {
  const { env } = context;
  const { results } = await env.DB.prepare(
    `SELECT DISTINCT substr(finished_at, 1, 7) AS month
     FROM books
     WHERE finished_at IS NOT NULL
     ORDER BY month DESC`
  ).all();

  const months = new Set(results.map((r) => r.month));
  const now = new Date();
  months.add(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);

  return Response.json([...months].sort().reverse());
}
