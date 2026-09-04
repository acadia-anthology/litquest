// GET /api/auth/check -> { authed: boolean }. Public (not gated by the middleware) —
// the client calls this first to decide whether to show the passcode overlay.

import { isAuthed } from "../../_lib/auth.js";

export async function onRequestGet(context) {
  return Response.json({ authed: await isAuthed(context.request) });
}
