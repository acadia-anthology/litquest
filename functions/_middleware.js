// Gates every /api/* request behind the site passcode (see _lib/auth.js) so
// nobody who just finds the URL can view or change any real data — only the
// login/check endpoints themselves stay open, since the client needs them to
// even ask "am I authed?" and to submit the passcode in the first place.

import { isAuthed } from "./_lib/auth.js";

const PUBLIC_PATHS = new Set(["/api/auth/check", "/api/auth/login"]);

export async function onRequest(context) {
  const { request } = context;
  const { pathname } = new URL(request.url);

  if (!pathname.startsWith("/api/") || PUBLIC_PATHS.has(pathname)) {
    return context.next();
  }

  if (!(await isAuthed(request))) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  return context.next();
}
