// There's only ever one household today (this app is still single-family,
// single-PIN) -- this just centralizes "which one" so every endpoint that
// creates a player or parent doesn't repeat the lookup, and a fresh install
// with no household row yet gets one created on first use.
export async function getHouseholdId(env) {
  const existing = await env.DB.prepare("SELECT id FROM households LIMIT 1").first();
  if (existing) return existing.id;

  const created = await env.DB.prepare("INSERT INTO households (name) VALUES ('My Family') RETURNING id").first();
  return created.id;
}
