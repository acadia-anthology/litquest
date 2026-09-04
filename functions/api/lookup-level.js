// POST /api/lookup-level  { title, author }
//
// Confirms the book is real via Open Library (free, keyless, indexes new releases
// almost immediately — fixes the AI not recognizing a book outside its training
// data) and gets a real page count from there when available. Groq then estimates
// just the Lexile measure and grade level, since no free API publishes that data.
// Falls back to a pure AI guess if Open Library has no match at all.

export async function onRequestPost(context) {
  const { env, request } = context;
  const body = await request.json().catch(() => null);
  const title = body?.title?.trim();
  if (!title) {
    return Response.json({ error: "title is required" }, { status: 400 });
  }
  const author = body?.author?.trim();

  if (!env.GROQ_API_KEY) {
    return Response.json({ error: "Server is missing GROQ_API_KEY" }, { status: 500 });
  }

  const book = await findBook(title, author);

  if (!book) {
    return Response.json(await aiFullGuess(env.GROQ_API_KEY, title, author));
  }

  const levelGuess = await estimateLevel(env.GROQ_API_KEY, book).catch(() => null);

  return Response.json({
    known: true,
    grade_level: levelGuess?.grade_level ?? null,
    lexile: levelGuess?.lexile ?? null,
    pages: book.pages ?? levelGuess?.pages ?? null,
  });
}

async function findBook(title, author) {
  // A free-text query ranks far better than structured title=/author= fields —
  // those often miss the plain canonical edition entirely in favor of study
  // guides, workbooks, and adaptations that happen to match the fields exactly.
  const params = new URLSearchParams({
    q: author ? `${title} ${author}` : title,
    fields: "title,author_name,first_publish_year,number_of_pages_median",
    limit: "5",
  });

  let res;
  try {
    res = await fetch(`https://openlibrary.org/search.json?${params}`, {
      headers: { "User-Agent": "Litquest/1.0 (family reading app; contact via GitHub)" },
    });
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
    title: best.title,
    author: best.author_name?.[0] || author || null,
    year: best.first_publish_year || null,
    pages: best.number_of_pages_median || null,
  };
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
      max_tokens: 600,
      reasoning_effort: "low",
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Groq API returned ${res.status}`);

  const data = await res.json();
  const text = (data.choices?.[0]?.message?.content ?? "")
    .trim()
    .replace(/^```(json)?\s*/i, "")
    .replace(/```\s*$/i, "");
  return JSON.parse(text);
}

async function estimateLevel(apiKey, book) {
  const needsPages = !book.pages;
  const prompt = `This is a real, published book: "${book.title}"${book.author ? ` by ${book.author}` : ""}${
    book.year ? ` (first published ${book.year})` : ""
  }.

What is its approximate Lexile measure and typical US school grade reading level? Base it on the book, its genre, and (if you don't know this specific title) its author's similar work — give your best estimate even if you're not 100% certain, approximate is genuinely useful here.${
    needsPages ? " Also estimate its typical print page count." : ""
  }

Respond with ONLY this JSON, no other text, no markdown fences:
{"lexile": "760L", "grade_level": "4th grade"${needsPages ? ', "pages": 160' : ""}}`;

  return callGroq(apiKey, prompt);
}

async function aiFullGuess(apiKey, title, author) {
  const prompt = `What is the Lexile measure, typical US school grade reading level, and approximate print page count for the children's/YA book "${title}"${
    author ? ` by ${author}` : ""
  }?

Give your best estimate even if you're not 100% certain of the exact numbers — approximate values are genuinely useful here, and being roughly right is much better than refusing to answer. Page count varies by edition, so just give a reasonable typical figure.

If this is a real, identifiable book, respond with ONLY this JSON, no other text, no markdown fences:
{"known": true, "lexile": "760L", "grade_level": "4th grade", "pages": 160}

Only respond with {"known": false} if you don't recognize the title/author as a real book at all.`;

  try {
    return await callGroq(apiKey, prompt);
  } catch {
    return { known: false };
  }
}
