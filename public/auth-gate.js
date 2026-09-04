// Include as: <script src="/auth-gate.js" data-next="/app.js"></script>
// Blocks the real page (header/main start `hidden`) until the passcode is
// confirmed, then loads the page's real script. Nothing else on the page can
// run — and no real data can load, since the API itself is gated too — until
// this resolves.
(function () {
  const nextScript = document.currentScript.dataset.next;

  function revealApp() {
    const header = document.querySelector("header");
    const main = document.querySelector("main");
    if (header) header.hidden = false;
    if (main) main.hidden = false;
    const s = document.createElement("script");
    s.src = nextScript;
    document.body.appendChild(s);
  }

  function showGate() {
    const overlay = document.createElement("div");
    overlay.id = "authGateOverlay";
    overlay.innerHTML = `
      <div class="auth-gate-card">
        <div class="auth-gate-logo">📚 Litquest</div>
        <label>Enter passcode
          <input type="password" id="authGateInput" inputmode="numeric" maxlength="8" placeholder="••••" autofocus />
        </label>
        <button type="button" class="btn primary" id="authGateBtn">Unlock</button>
        <p id="authGateError" class="error-text" hidden>Incorrect passcode.</p>
      </div>
    `;
    document.body.appendChild(overlay);

    const input = document.getElementById("authGateInput");
    const errorEl = document.getElementById("authGateError");

    async function submit() {
      errorEl.hidden = true;
      let res;
      try {
        res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ passcode: input.value }),
        });
      } catch {
        errorEl.textContent = "Couldn't reach the server — try again.";
        errorEl.hidden = false;
        return;
      }
      if (res.ok) {
        overlay.remove();
        revealApp();
      } else {
        errorEl.textContent = "Incorrect passcode.";
        errorEl.hidden = false;
        input.value = "";
        input.focus();
      }
    }

    document.getElementById("authGateBtn").addEventListener("click", submit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
    });
  }

  fetch("/api/auth/check")
    .then((r) => (r.ok ? r.json() : { authed: false }))
    .then((data) => (data.authed ? revealApp() : showGate()))
    .catch(showGate);
})();
