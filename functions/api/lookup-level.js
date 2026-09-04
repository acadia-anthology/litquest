// POST /api/lookup-level  { title, author }
// Asks Groq for a well-known book's Lexile measure and grade-level band.

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

  const prompt = `What is the Lexile measure and typical US school grade reading level for the children's/YA book "${title}"${
    author ? ` by ${author}` : ""
  }?

Give your best estimate even if you're not 100% certain of the exact number — an approximate Lexile and grade level is genuinely useful here, and being roughly right is much better than refusing to answer.

If this is a real, identifiable book, respond with ONLY this JSON, no other text, no markdown fences:
{"known": true, "lexile": "760L", "grade_level": "4th grade"}

Only respond with {"known": false} if you don't recognize the title/author as a real book at all.`;

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: "openai/gpt-oss-120b",
      max_tokens: 600,
      reasoning_effort: "low",
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    return Response.json({ error: `Groq API returned ${res.status}` }, { status: 502 });
  }

  const data = await res.json();
  const text = (data.choices?.[0]?.message?.content ?? "")
    .trim()
    .replace(/^```(json)?\s*/i, "")
    .replace(/```\s*$/i, "");

  try {
    const result = JSON.parse(text);
    return Response.json(result);
  } catch {
    return Response.json({ known: false });
  }
}
