// POST /api/auth/parent-logout -> re-locks Parent Mode (clears the cookie).

import { clearParentAuthCookieHeader } from "../../_lib/auth.js";

export async function onRequestPost(context) {
  const { request } = context;
  return Response.json(
    { ok: true },
    { headers: { "Set-Cookie": clearParentAuthCookieHeader(request) } }
  );
}
