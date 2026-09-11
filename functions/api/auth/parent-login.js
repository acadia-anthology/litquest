// POST /api/auth/parent-login { pin } -> unlocks Parent Mode (sets a ~12h cookie).
// Gated by the normal site middleware -- you can't reach this without already
// being past the site passcode, so it doesn't need to be a public path.

import { SITE_PASSCODE, parentAuthCookieHeader } from "../../_lib/auth.js";

export async function onRequestPost(context) {
  const { request } = context;
  const body = await request.json().catch(() => null);

  if (body?.pin !== SITE_PASSCODE) {
    return Response.json({ error: "Incorrect PIN" }, { status: 403 });
  }

  return Response.json(
    { ok: true },
    { headers: { "Set-Cookie": await parentAuthCookieHeader(request) } }
  );
}
