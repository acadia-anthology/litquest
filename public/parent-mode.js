// Shared "Parent Mode" session helper, used by both app.js and rewards.js.
// Parent Mode is a second gate on top of the site-wide passcode (auth-gate.js) --
// getting past that one just means "can view/use the app"; this one is the
// actual edit/delete/reward-management permission, unlocked with the same PIN
// but tracked separately so it naturally re-locks (see _lib/auth.js).
const ParentMode = (() => {
  let unlocked = false;
  const listeners = new Set();

  function notify() {
    listeners.forEach((cb) => cb(unlocked));
  }

  async function check() {
    const res = await fetch("/api/auth/parent-check");
    const data = await res.json().catch(() => ({ parentAuthed: false }));
    unlocked = Boolean(data.parentAuthed);
    notify();
    return unlocked;
  }

  async function unlock(pin) {
    const res = await fetch("/api/auth/parent-login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    unlocked = res.ok;
    if (unlocked) notify();
    return unlocked;
  }

  async function lock() {
    await fetch("/api/auth/parent-logout", { method: "POST" });
    unlocked = false;
    notify();
  }

  function isUnlocked() {
    return unlocked;
  }

  function onChange(cb) {
    listeners.add(cb);
  }

  return { check, unlock, lock, isUnlocked, onChange };
})();
