// Shared scoring math — imported by the quiz submit endpoint and the points
// breakdown endpoint so the two can never drift apart.

export const PASS_THRESHOLD = 0.8;

// Base points by book length (estimated word count).
export function lengthTierPoints(wordCount) {
  if (wordCount < 10000) return 10;
  if (wordCount < 40000) return 25;
  if (wordCount < 80000) return 45;
  return 70;
}

export function lengthTierLabel(wordCount) {
  if (wordCount < 10000) return "Under 40 pages";
  if (wordCount < 40000) return "40–160 pages";
  if (wordCount < 80000) return "160–320 pages";
  return "320+ pages";
}

// Kid scoring: reward reading above grade level, scale back for books well below it.
// Centered on a typical 6th-grade LitScore band (~800-1000L); no score on file = neutral.
export function kidMultiplier(litScore) {
  if (litScore == null) return 1;
  if (litScore < 500) return 0.5;
  if (litScore < 800) return 0.75;
  if (litScore < 1000) return 1;
  if (litScore < 1200) return 1.5;
  return 2;
}

// Adult scoring: a kids'/YA book isn't hard reading for an adult regardless of its
// own LitScore, so grade by book_type instead — then within genuinely Adult books,
// grade by complexity (a cozy mystery vs. dense literary fiction aren't equivalent).
export function adultMultiplier(bookType, complexity) {
  if (bookType === "Elementary") return 0.5;
  if (bookType === "Middle Grade") return 0.6;
  if (bookType === "YA") return 0.8;
  if (bookType === "Adult") {
    if (complexity === "Light") return 0.75;
    if (complexity === "Complex") return 2;
    return 1; // Standard, or complexity unknown
  }
  return 1; // book_type unknown — neutral
}

export function scoreBook(book, readerType) {
  const multiplier =
    readerType === "adult" ? adultMultiplier(book.book_type, book.complexity) : kidMultiplier(book.lit_score);
  const basePoints = Math.round(lengthTierPoints(book.word_count) * multiplier);
  return { multiplier, basePoints };
}
