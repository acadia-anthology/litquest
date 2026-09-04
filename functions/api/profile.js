const POINTS_PER_LEVEL = 100;

export async function onRequestGet(context) {
  const { env } = context;
  const profile = await env.DB.prepare("SELECT * FROM profile WHERE id = 1").first();

  const level = Math.floor(profile.total_points / POINTS_PER_LEVEL) + 1;
  const points_into_level = profile.total_points % POINTS_PER_LEVEL;

  return Response.json({
    total_points: profile.total_points,
    books_completed: profile.books_completed,
    level,
    points_into_level,
    points_to_next_level: POINTS_PER_LEVEL - points_into_level,
  });
}
