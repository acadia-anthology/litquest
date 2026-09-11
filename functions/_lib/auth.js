// Site-wide passcode gate. Same PIN as the rewards-edit gate, by choice — this
// one guards *viewing/using* the app at all, that one guards editing rewards;
// they're separate checks that happen to share a value.
export const SITE_PASSCODE = "2112";

const COOKIE_NAME = "litquest_auth";

// The cookie holds an HMAC of a fixed string, keyed by the passcode — so it
// can't be forged by just setting `litquest_auth=granted` without knowing the
// passcode, but needs no separate secret/session storage to verify.
async function computeToken() {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(SITE_PASSCODE),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode("litquest-site-auth"));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function isAuthed(request) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/(?:^|;\s*)litquest_auth=([^;]+)/);
  if (!match) return false;
  return match[1] === (await computeToken());
}

// "Remembered indefinitely" — a 10-year cookie. Secure is only set over https so
// this still works for local http dev.
export async function authCookieHeader(request) {
  const token = await computeToken();
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE_NAME}=${token}; Path=/; Max-Age=315360000; SameSite=Lax${secure}`;
}

// Parent Mode: a second, independent gate on top of the site passcode above.
// Getting past SITE_PASSCODE only means "can view/use the app" -- Parent Mode
// is the actual edit/delete/reward-management permission, and deliberately
// doesn't stay unlocked for years like the site cookie does, since this is
// usually a shared family device.
const PARENT_COOKIE_NAME = "litquest_parent";
const PARENT_MAX_AGE_SECONDS = 60 * 60 * 12; // 12h -- long enough for a session, short enough to naturally re-lock

async function computeParentToken() {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(SITE_PASSCODE),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode("litquest-parent-auth"));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function isParentAuthed(request) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/(?:^|;\s*)litquest_parent=([^;]+)/);
  if (!match) return false;
  return match[1] === (await computeParentToken());
}

export async function parentAuthCookieHeader(request) {
  const token = await computeParentToken();
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${PARENT_COOKIE_NAME}=${token}; Path=/; Max-Age=${PARENT_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}

export function clearParentAuthCookieHeader(request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${PARENT_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}
