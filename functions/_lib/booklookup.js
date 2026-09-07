// Shared book-lookup pipeline — used by both /api/lookup-level (adding a new
// book) and /api/books/:id (re-checking an already-logged book after its
// title/author is edited), so there's exactly one place that knows how to find
// and classify a book.
//
// Kids type titles/authors fast and get spellings wrong ("Diary of a Whimpy
// Kid", "Jeff Kinny") — a single wrong letter can make an otherwise-findable
// book return zero results from every external source. So the very first step
// is asking Groq to correct obvious typos in a title/author it confidently
// recognizes (never inventing a "correction" for something it doesn't actually
// know, and hard-capped by a similarity check below so a wrong guess could
// never silently swap in a wholesale different title), and every lookup below
// — plus the final saved book record — uses that corrected spelling.
//
// Confirms the book is real via Open Library (free, keyless, indexes new releases
// almost immediately) and gets a real page count AND real genre/subject tags from
// there in one call — Open Library's search embeds subject tags directly, no
// separate lookup needed, and unlike Goodreads it isn't blocked from Cloudflare's
// network. When Open Library has nothing (or no subject tags), falls back to the
// official Google Books API (only active once a GOOGLE_BOOKS_API_KEY secret
// exists — unauthenticated access has zero quota), then scraping Goodreads
// (unreliable — its anti-bot WAF blocks Cloudflare outright in practice, kept
// only as a last-ditch attempt), then Wikipedia's lead paragraph. Groq then
// estimates the Lexile measure (shown to users as "LitScore" — these are AI
// estimates, not officially licensed Lexile scores), grade level, book type, and
// complexity. Only falls back to a pure blind AI guess if none of the above find
// the book at all.

import { findOpenLibraryBook, subjectHint } from "./openlibrary.js";
import { findGoogleBook } from "./googlebooks.js";
import { findGoodreadsBook } from "./goodreads.js";

export async function lookupBook(env, rawTitleInput, rawAuthorInput) {
  const rawTitle = rawTitleInput?.trim();
  const rawAuthor = rawAuthorInput?.trim();
  if (!rawTitle) return { error: "title is required" };
  if (!env.GROQ_API_KEY) return { error: "Server is missing GROQ_API_KEY" };

  const corrected = await correctTypos(env.GROQ_API_KEY, rawTitle, rawAuthor).catch(() => null);
  const title = corrected?.title || rawTitle;
  const author = corrected?.author ?? rawAuthor;
  // Only the fields the AI actually changed get sent back for saving — e.g. if
  // just the author had a typo, the client's own (perfectly fine) title text
  // shouldn't get silently swapped for Open Library's own catalog title, which
  // can be a differently-formatted variant (a specific volume sometimes listed
  // under just its subtitle, e.g. "No Brainer" instead of "Diary of a Wimpy
  // Kid: No Brainer") rather than an actual correction of anything.
  const correctedFields = {};
  if (title !== rawTitle) correctedFields.title = title;
  if (author !== rawAuthor) correctedFields.author = author;
  const hasCorrections = Object.keys(correctedFields).length > 0;

  const ol = await findOpenLibraryBook(title, author).catch(() => null);
  let book = ol && { title: ol.title, author: ol.author, year: ol.year, pages: ol.pages };
  let genreHint = subjectHint(ol?.subjects);

  if (!book || !genreHint) {
    const gb = await findGoogleBook(title, author, env.GOOGLE_BOOKS_API_KEY).catch(() => null);
    if (!book && gb) book = { title, author: author || null, year: null, pages: gb.pages };
    if (!genreHint && gb?.genres?.length > 0) genreHint = `Genre tags: ${gb.genres.join(", ")}`;
  }

  if (!book || !genreHint) {
    // Goodreads' WAF blocks Cloudflare's network outright in practice, so this
    // is one quick, bounded try (findGoodreadsBook doesn't retry by default) —
    // a miss just falls through to Wikipedia/the blind guess instead of costing
    // the whole request many extra seconds for a source that rarely helps here.
    const gr = await findGoodreadsBook(title, author).catch(() => null);
    if (!book && gr) book = { title, author: author || null, year: null, pages: gr.pages };
    if (!genreHint && gr?.genres?.length > 0) genreHint = `Genre tags: ${gr.genres.join(", ")}`;
  }

  if (!book) {
    const guess = await aiFullGuess(env.GROQ_API_KEY, title, author);
    return toApiShape(guess, hasCorrections ? correctedFields : null);
  }

  if (!genreHint) {
    genreHint = await findWikipediaGenreHint(book.title, book.author).catch(() => null);
  }

  const levelGuess = await estimateLevel(env.GROQ_API_KEY, book, genreHint).catch(() => null);

  return toApiShape(
    {
      known: true,
      ...levelGuess,
      pages: book.pages ?? levelGuess?.pages ?? null,
    },
    hasCorrections ? correctedFields : null
  );
}

// A kid-typed title/author is prone to typos ("Diary of a Whimpy Kid", "Jeff
// Kinny") that can make an otherwise-findable book return zero results from
// every external source. Only fixes spelling/casing of a book the model is
// genuinely confident it recognizes — explicitly told not to "correct" a title
// it doesn't actually know, since a wrong guess here would be worse than
// leaving a typo alone (every downstream lookup still tries the original text
// if this returns nothing different).
async function correctTypos(apiKey, title, author) {
  const prompt = `A child typed this book title${author ? " and author" : ""}, possibly with a spelling mistake: title "${title}"${
    author ? `, author "${author}"` : ""
  }.

Fix ONLY clear misspellings — wrong, missing, swapped, or extra letters within a word (e.g. "Whimpy" -> "Wimpy", "Kinny" -> "Kinney"). Do NOT do anything else to the title: don't shorten it, don't drop a series name/prefix, don't remove a number or subtitle the child included, don't rephrase or "canonicalize" it to however it's officially catalogued — if a word is spelled correctly, leave it and everything around it exactly as typed, even if you'd normally format the title differently. If — and only if — you're genuinely confident you recognize the specific book despite a typo, fix just the misspelled word(s). If you don't clearly recognize it, or you're only guessing, return the title/author completely unchanged.

Respond with ONLY this JSON, no other text, no markdown fences:
{"title": "corrected or unchanged title"${author ? ', "author": "corrected or unchanged author"' : ""}}`;

  const result = await callGroq(apiKey, prompt);
  return {
    title: acceptIfCloseEnough(title, result?.title),
    author: author ? acceptIfCloseEnough(author, result?.author) : author,
  };
}

// A hard backstop, not just a prompt instruction: if the model's "correction"
// is too different from the original to plausibly be a spelling fix — e.g. it
// swapped to a different book entirely by the same author, rather than fixing
// a typo in this one — the original text is kept instead. Never trust prompt
// compliance alone for something a wrong guess could silently corrupt.
function acceptIfCloseEnough(original, candidate) {
  if (typeof candidate !== "string" || !candidate.trim()) return original;
  const trimmed = candidate.trim();
  if (trimmed === original) return original;
  const distance = levenshtein(original.toLowerCase(), trimmed.toLowerCase());
  const ratio = distance / Math.max(original.length, trimmed.length, 1);
  return ratio <= 0.35 ? trimmed : original;
}

function levenshtein(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dist = Array.from({ length: rows }, (_, i) => [i, ...Array(cols - 1).fill(0)]);
  for (let j = 1; j < cols; j++) dist[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dist[i][j] = Math.min(dist[i - 1][j] + 1, dist[i][j - 1] + 1, dist[i - 1][j - 1] + cost);
    }
  }
  return dist[rows - 1][cols - 1];
}

// Renames the model's "lexile" field to "lit_score" at our API boundary — the
// model understands "Lexile" as a concept, but we don't show that trademarked
// term to users since these are our own estimates, not licensed Lexile scores.
// `corrected` (when a typo fix was applied) is merged in so the caller can
// save the cleaned-up spelling instead of what was actually typed.
function toApiShape(result, corrected) {
  if (!result?.known) return { known: false, ...(corrected ? corrected : {}) };
  const { lexile, ...rest } = result;
  return { ...rest, lit_score: lexile ?? null, ...(corrected ? corrected : {}) };
}

const WIKI_HEADERS = { "User-Agent": "Litquest/1.0 (family reading app; contact via GitHub)" };

// Wikipedia's lead paragraph almost always states the genre/audience directly
// (e.g. "...is a 2024 young adult fantasy novel...") — a much stronger signal
// for book_type/complexity than the AI guessing from title/author alone.
async function findWikipediaGenreHint(title, author) {
  const searchQuery = author ? `${title} novel ${author}` : `${title} novel`;
  const searchRes = await fetch(
    `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      searchQuery
    )}&format=json&srlimit=1`,
    { headers: WIKI_HEADERS, signal: AbortSignal.timeout(5000) }
  );
  if (!searchRes.ok) return null;
  const searchData = await searchRes.json();
  const pageTitle = searchData?.query?.search?.[0]?.title;
  if (!pageTitle) return null;

  const extractRes = await fetch(
    `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(
      pageTitle
    )}&prop=extracts&explaintext=1&exintro=1&redirects=1&format=json`,
    { headers: WIKI_HEADERS, signal: AbortSignal.timeout(5000) }
  );
  if (!extractRes.ok) return null;
  const extractData = await extractRes.json();
  const page = Object.values(extractData?.query?.pages ?? {})[0];
  const extract = page?.extract?.trim();
  return extract ? extract.slice(0, 600) : null;
}

async function callGroq(apiKey, prompt) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "openai/gpt-oss-120b",
      max_tokens: 700,
      reasoning_effort: "low",
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Groq API returned ${res.status}`);

  const data = await res.json();
  const text = (data.choices?.[0]?.message?.content ?? "")
    .trim()
    .replace(/^```(json)?\s*/i, "")
    .replace(/```\s*$/i, "");
  return JSON.parse(text);
}

// Shared instructions for classifying grade band, type, and complexity —
// used by both the grounded (Open Library found it) and blind-guess paths.
const CLASSIFICATION_FIELDS = `- "grade_level": typical US school grade reading level as text, e.g. "4th grade"
- "grade_level_num": the same thing as a plain number — 0 for Kindergarten, 1-12 for grades 1-12, or null if this is an adult book with no school grade level
- "book_type": exactly one of "Elementary", "Middle Grade", "YA", or "Adult" (Elementary = K-5, Middle Grade = 6-8, YA = 9-12, Adult = adult fiction/nonfiction not aimed at school grades). Most published books are Adult — only classify as Elementary/Middle Grade/YA when there's real signal for it (a children's imprint, a known MG/YA author or series, explicit "for kids" framing, or a description below that says so). If you're genuinely unsure and have no such signal, default to "Adult" rather than guessing a kids' category — don't assume a book is for children just because the author has also written children's books elsewhere.
- "complexity": exactly one of "Light", "Standard", or "Complex" — how demanding this book is FOR AN ADULT READER regardless of its grade level (Light = easy/quick read like a cozy mystery or simple romance; Standard = typical mainstream fiction/genre fiction; Complex = literary fiction, hard sci-fi, dense multi-POV epic fantasy, classics, or anything with intricate prose/structure). A children's book is still "Light" by this scale.`;

async function estimateLevel(apiKey, book, genreHint) {
  const needsPages = !book.pages;
  const prompt = `This is a real, published book: "${book.title}"${book.author ? ` by ${book.author}` : ""}${
    book.year ? ` (first published ${book.year})` : ""
  }.${
    genreHint
      ? `\n\nHere is a real description of it, which may state its genre/audience directly:\n"""\n${genreHint}\n"""`
      : ""
  }

Estimate its approximate Lexile measure and classify it. Base it on the description above if given, otherwise the book's genre and (if you don't know this specific title) its author's similar work — give your best estimate even if you're not 100% certain, approximate is genuinely useful here.${
    needsPages ? " Also estimate its typical print page count." : ""
  }

Respond with ONLY this JSON, no other text, no markdown fences:
{"lexile": "760L", "grade_level": "4th grade", "grade_level_num": 4, "book_type": "Middle Grade", "complexity": "Standard"${
    needsPages ? ', "pages": 160' : ""
  }}

Field meanings:
${CLASSIFICATION_FIELDS}`;

  return callGroq(apiKey, prompt);
}

async function aiFullGuess(apiKey, title, author) {
  const prompt = `What is the Lexile measure, page count, and grade/type/complexity classification for the children's/YA/adult book "${title}"${
    author ? ` by ${author}` : ""
  }?

Give your best estimate even if you're not 100% certain of the exact numbers — approximate values are genuinely useful here, and being roughly right is much better than refusing to answer. Page count varies by edition, so just give a reasonable typical figure.

If this is a real, identifiable book, respond with ONLY this JSON, no other text, no markdown fences:
{"known": true, "lexile": "760L", "grade_level": "4th grade", "grade_level_num": 4, "book_type": "Middle Grade", "complexity": "Standard", "pages": 160}

Field meanings:
${CLASSIFICATION_FIELDS}

Only respond with {"known": false} if you don't recognize the title/author as a real book at all.`;

  try {
    return await callGroq(apiKey, prompt);
  } catch {
    return { known: false };
  }
}
