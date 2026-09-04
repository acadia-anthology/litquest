// Open Library (free, keyless, and — unlike Goodreads — not blocked from
// Cloudflare's network). Its free-text search embeds real subject/genre tags
// directly (no extra request needed), and the separate per-work record often
// has a full publisher description too — both previously untapped; only page
// count was being used from this source.

const OL_HEADERS = { "User-Agent": "Litquest/1.0 (family reading app; contact via GitHub)" };

// A free-text query ranks far better than structured title=/author= fields —
// those often miss the plain canonical edition entirely in favor of study
// guides, workbooks, and adaptations that happen to match the fields exactly.
//
// Open Library's search silently returns zero results for a query containing
// "&" (e.g. a co-author byline like "Natalie Riess & Sara Goetter") — no error,
// just an empty doc list — so swap it for "and" before searching.
export async function findOpenLibraryBook(title, author) {
  const query = author ? `${title} ${author}` : title;
  const params = new URLSearchParams({
    q: query.replace(/&/g, " and "),
    fields: "key,title,author_name,first_publish_year,number_of_pages_median,subject",
    limit: "5",
  });

  let res;
  try {
    res = await fetch(`https://openlibrary.org/search.json?${params}`, { headers: OL_HEADERS });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const data = await res.json().catch(() => null);
  const docs = data?.docs || [];
  if (docs.length === 0) return null;

  // Trust Open Library's own relevance ranking for the top pick. Only look further
  // for a page count if it's missing, and only among titles that still contain the
  // query — an unrelated book that happens to list a page count is worse than none.
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const queryNorm = norm(title);
  let best = docs[0];
  if (!best.number_of_pages_median) {
    const closeMatchWithPages = docs.find(
      (d) => d.number_of_pages_median && norm(d.title).includes(queryNorm)
    );
    if (closeMatchWithPages) best = closeMatchWithPages;
  }

  return {
    workKey: best.key || null,
    title: best.title,
    author: best.author_name?.[0] || author || null,
    year: best.first_publish_year || null,
    pages: best.number_of_pages_median || null,
    subjects: best.subject || [],
  };
}

// A short, genre-flavored subset of a book's subject tags, suitable as a
// classification hint — drops "series:x"-style tags (not genre info) and caps
// the count so the prompt stays short.
export function subjectHint(subjects) {
  const filtered = (subjects || []).filter((s) => !/^series:/i.test(s)).slice(0, 8);
  return filtered.length > 0 ? `Genre/subject tags: ${filtered.join(", ")}` : null;
}

// The search endpoint above has no description field — only the separate
// per-work record does.
export async function findOpenLibraryDescription(workKey) {
  if (!workKey) return null;
  let res;
  try {
    res = await fetch(`https://openlibrary.org${workKey}.json`, { headers: OL_HEADERS });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const data = await res.json().catch(() => null);
  const desc = data?.description;
  if (!desc) return null;
  const text = typeof desc === "string" ? desc : desc.value;
  return text?.trim() || null;
}
