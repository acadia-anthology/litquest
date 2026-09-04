// Google Books API (official, free, keyless — a real REST API, not a scrape) as
// a plot/genre grounding source. Its free anonymous quota is shared and can be
// thin, so a failure here just means "no data" — every caller falls through to
// its next source rather than treating this as an error.
export async function findGoogleBook(title, author) {
  const q = `intitle:${title}${author ? `+inauthor:${author}` : ""}`;
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=1`;

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
