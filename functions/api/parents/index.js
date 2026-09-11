// GET  /api/parents          -> list parents in the household (open -- just names/avatars)
// POST /api/parents { name, avatar? } -> add a parent identity. Parent-Mode-gated.

import { isParentAuthed } from "../../_lib/auth.js";
import { getHouseholdId } from "../../_lib/household.js";

export async function onRequestGet(context) {
  const { env } = context;
  const householdId = await getHouseholdId(env);
  const { results } = await env.DB.prepare(
    "SELECT * FROM parents WHERE household_id = ? ORDER BY created_at ASC"
  )
    .bind(householdId)
    .all();
  return Response.json(results);
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

  const householdId = await getHouseholdId(env);
  const parent = await env.DB.prepare(
    "INSERT INTO parents (household_id, name, avatar) VALUES (?, ?, ?) RETURNING *"
  )
    .bind(householdId, body.name.trim(), body.avatar?.trim() || "🧑")
    .first();

  return Response.json(parent, { status: 201 });
}
