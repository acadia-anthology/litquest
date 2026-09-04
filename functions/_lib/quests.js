// Shared quest-cycle math — used by both the read endpoint (progress) and the
// config endpoint, so "what's the current cycle" is computed one way everywhere.

// Given when tracking started and how long each cycle lasts, finds the window
// containing today. No stored "current cycle" to roll forward — always derived
// fresh from the anchor, so there's nothing to forget to advance.
export function currentCycleBounds(anchorDate, periodMonths) {
  const anchor = new Date(`${anchorDate}T00:00:00`);
  const now = new Date();

  const monthsElapsed = (now.getFullYear() - anchor.getFullYear()) * 12 + (now.getMonth() - anchor.getMonth());
  const cyclesElapsed = Math.max(0, Math.floor(monthsElapsed / periodMonths));

  const cycleStart = new Date(anchor);
  cycleStart.setMonth(cycleStart.getMonth() + cyclesElapsed * periodMonths);

  const cycleEnd = new Date(cycleStart);
  cycleEnd.setMonth(cycleEnd.getMonth() + periodMonths);

  return { start: toDateStr(cycleStart), end: toDateStr(cycleEnd) };
}

function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}
