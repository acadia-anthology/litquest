// Goodreads has no official API, so this scrapes it — same technique as the
// author's own Discord bot uses for the same purpose: search, follow the first
// /book/show/ result, and pull structured data out of the __NEXT_DATA__ blob its
// React frontend embeds in every book page. Every step fails soft (returns null)
// so a scrape hiccup, a WAF challenge, or a page-structure change just falls
// through to the caller's next source instead of erroring the whole request.

const GOODREADS_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};

// Goodreads intermittently 503s/blocks datacenter IPs and clears up within a
// couple seconds — worth a couple of retries. A 404 is a real "doesn't exist"
// though, not worth retrying.
async function grGet(url, referer, attempts = 3) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const headers = referer ? { ...GOODREADS_HEADERS, Referer: referer } : GOODREADS_HEADERS;
      const res = await fetch(url, { headers });
      if (res.status === 200) return await res.text();
      if (res.status === 404) return null;
    } catch {
      // fall through to retry
    }
    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
    }
  }
  return null;
}

function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&rsquo;/g, "’")
    .replace(/&lsquo;/g, "‘")
    .replace(/&rdquo;/g, "”")
    .replace(/&ldquo;/g, "“")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .trim();
}

// Pulls page count, genre tags, and the publisher description out of a
// Goodreads book page's __NEXT_DATA__ blob.
function parseGoodreadsBookHtml(html) {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
  if (!match) return null;
  try {
    const data = JSON.parse(match[1]);
    const apollo = data.props.pageProps.apolloState;
    const rootKey = Object.keys(apollo.ROOT_QUERY).find((k) => k.startsWith("getBookByLegacyId"));
    if (!rootKey) return null;
    const book = apollo[apollo.ROOT_QUERY[rootKey].__ref];
    if (!book?.webUrl) return null;

    const genres = (book.bookGenres || []).map((g) => g.genre?.name).filter(Boolean);
    const description = book.description ? stripHtml(book.description) : null;
    return { pages: book.details?.numPages || null, genres, description };
  } catch {
    return null;
  }
}

// Title-only search reliably surfaces the canonical/most-reviewed edition
// first; adding the author tends to rank a thinner alternate edition (study
// guide, box set, reprint without full metadata) above it instead. So title
// alone is tried first, title+author only as a fallback for when that misses.
async function grLookup(query, attempts) {
  const searchUrl = `https://www.goodreads.com/search?q=${encodeURIComponent(query)}`;
  const searchHtml = await grGet(searchUrl, undefined, attempts);
  if (!searchHtml) return null;

  const match = searchHtml.match(/href="(\/book\/show\/\d+[^"?]*)/);
  if (!match) return null;
  const bookUrl = `https://www.goodreads.com${match[1]}`;

  const bookHtml = await grGet(bookUrl, searchUrl, attempts);
  if (!bookHtml) return null;

  return parseGoodreadsBookHtml(bookHtml);
}

// `attempts` defaults to a patient 3 retries — appropriate when Goodreads is
// the last real chance to identify or ground the book at all. Callers that
// already have other grounding and just want Goodreads as enrichment should
// pass a lower value (1 = no retry) so a Goodreads hiccup or block can't add
// multiple seconds of retry/backoff for no benefit when a fallback exists.
export async function findGoodreadsBook(title, author, attempts = 3) {
  const result = await grLookup(title, attempts);
  if (result) return result;
  return author ? grLookup(`${title} ${author}`, attempts) : null;
}
