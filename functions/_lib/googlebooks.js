// Google Books API — a real REST API, not a scrape, as a plot/genre grounding
// source. IMPORTANT: unauthenticated requests get zero daily quota (confirmed
// live — even Google's own textbook example query 429s with quota_limit_value
// "0", not a temporary rate limit), so this only actually does anything once a
// GOOGLE_BOOKS_API_KEY secret is set; until then apiKey is undefined, the `key`
// param is omitted, and every call 429s and is caught below — same as any other
// source having nothing, callers just fall through to their next option.
export async function findGoogleBook(title, author, apiKey) {
  const q = `intitle:${title}${author ? `+inauthor:${author}` : ""}`;
  const params = new URLSearchParams({ q, maxResults: "1" });
  if (apiKey) params.set("key", apiKey);
  const url = `https://www.googleapis.com/books/v1/volumes?${params}`;

  let res;
  try {
    res = await fetch(url, { headers: { "User-Agent": "Litquest/1.0 (family reading app; contact via GitHub)" } });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const data = await res.json().catch(() => null);
  const info = data?.items?.[0]?.volumeInfo;
  if (!info) return null;

  return {
    pages: info.pageCount || null,
    genres: info.categories || [],
    description: info.description || null,
  };
}
