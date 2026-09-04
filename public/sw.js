// A fetch handler (even a no-op one) is required for Chrome to treat this as an installable PWA.
self.addEventListener("fetch", () => {});
