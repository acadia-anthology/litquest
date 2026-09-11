// PATCH  /api/parents/:id { name?, avatar? } -> rename/change avatar. Parent-Mode-gated.
// DELETE /api/parents/:id -> remove a parent identity. Their linked reading
// profile (players row), if any, is unlinked (kept, not deleted) rather than
// wiping its point/book history. Parent-Mode-gated.

import { isParentAuthed } from "../../../_lib/auth.js";

export async function onRequestPatch(context) {
  const { env, params, request } = context;

  if (!(await isParentAuthed(request))) {
    return Response.json({ error: "Parent Mode required" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const hasName = body?.name !== undefined;
  const hasAvatar = body?.avatar !== undefined;
  if (!body || (!hasName && !hasAvatar)) {
    return Response.json({ error: "name and/or avatar is required" }, { status: 400 });
  }

  const existing = await env.DB.prepare("SELECT * FROM parents WHERE id = ?").bind(params.id).first();
  if (!existing) {
    return Response.json({ error: "Parent not found" }, { status: 404 });
  }
  if (hasName && !body.name.trim()) {
    return Response.json({ error: "name cannot be blank" }, { status: 400 });
  }
  if (hasAvatar && !body.avatar.trim()) {
    return Response.json({ error: "avatar cannot be blank" }, { status: 400 });
  }

  const name = hasName ? body.name.trim() : existing.name;
  const avatar = hasAvatar ? body.avatar.trim() : existing.avatar;

  const parent = await env.DB.prepare("UPDATE parents SET name = ?, avatar = ? WHERE id = ? RETURNING *")
    .bind(name, avatar, params.id)
    .first();

  return Response.json(parent);
}

export async function onRequestDelete(context) {
  const { env, params, request } = context;

  if (!(await isParentAuthed(request))) {
    return Response.json({ error: "Parent Mode required" }, { status: 403 });
  }

  const existing = await env.DB.prepare("SELECT id FROM parents WHERE id = ?").bind(params.id).first();
  if (!existing) {
    return Response.json({ error: "Parent not found" }, { status: 404 });
  }

  await env.DB.prepare("UPDATE players SET parent_id = NULL WHERE parent_id = ?").bind(params.id).run();
  await env.DB.prepare("DELETE FROM parents WHERE id = ?").bind(params.id).run();

  return Response.json({ deleted: true });
}
