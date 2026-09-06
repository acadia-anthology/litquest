// A kid typing on a phone/tablet won't reliably capitalize — normalize to real
// title case regardless of how it was typed, so logs stay uniform either way.
const MINOR_WORDS = new Set([
  "a", "an", "and", "as", "at", "but", "by", "for", "from", "in", "into",
  "nor", "of", "on", "onto", "or", "so", "the", "to", "up", "with", "yet",
]);

function capitalizeWord(word) {
  const lower = word.toLowerCase();
  return lower.replace(/(^|[-.])([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase());
}

export function titleCase(str) {
  if (!str) return str;
  const words = str.trim().split(/\s+/);
  return words
    .map((word, i) => {
      const lower = word.toLowerCase();
      const isMinor = MINOR_WORDS.has(lower) && i !== 0 && i !== words.length - 1;
      return isMinor ? lower : capitalizeWord(word);
    })
    .join(" ");
}

// Loose match so "Harry Potter and the Sorcerer's Stone" and "...Sorcerers Stone"
// (apostrophe/case/spacing differences) are still caught as the same book.
export function normTitle(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}
