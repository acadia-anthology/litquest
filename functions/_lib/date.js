// The family is in US Eastern time, but `new Date().toISOString()` is UTC —
// after ~8pm EDT / 9pm EST, UTC has already rolled to tomorrow, so a naive
// "today" computed that way is one day ahead of the family's actual today.
// That's exactly wide enough to let an evening submission slip in a
// tomorrow's-date entry past a same-day check.
export function todayLocalDate(timeZone = "America/New_York") {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date()
  );
}
