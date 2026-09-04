// POST /api/auth/login { passcode } -> sets the long-lived auth cookie on success.
// Public (not gated by the middleware) — this is the endpoint that grants access.

import { SITE_PASSCODE, authCookieHeader } from "../../_lib/auth.js";

export async function onRequestPost(context) {
  const { request } = context;
  const body = await request.json().catch(() => null);

  if (body?.passcode !== SITE_PASSCODE) {
    return Response.json({ error: "Incorrect passcode" }, { status: 403 });
  }

  return Response.json(
    { ok: true },
    { headers: { "Set-Cookie": await authCookieHeader(request) } }
  );
}
