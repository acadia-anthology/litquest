// GET /api/auth/parent-check -> { parentAuthed: boolean }

import { isParentAuthed } from "../../_lib/auth.js";

export async function onRequestGet(context) {
  return Response.json({ parentAuthed: await isParentAuthed(context.request) });
}
