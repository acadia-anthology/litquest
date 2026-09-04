// GET  /api/books/:id/quiz  -> return the latest quiz (no answers), 404 if none generated yet
// POST /api/books/:id/quiz  -> generate a FRESH quiz via Groq (first attempt or a retake) and return it

export async function onRequestGet(context) {
  const { env, params } = context;
  const quiz = await getLatestQuiz(env, params.id);
  if (!quiz) {
    return Response.json({ error: "No quiz generated yet" }, { status: 404 });
  }
  return Response.json(toClientQuiz(quiz));
}

export async function onRequestPost(context) {
  const { env, params } = context;
  const book = await env.DB.prepare("SELECT * FROM books WHERE id = ?")
    .bind(params.id)
    .first();
  if (!book) {
    return Response.json({ error: "Book not found" }, { status: 404 });
  }
  if (!env.GROQ_API_KEY) {
    return Response.json(
      { error: "Server is missing GROQ_API_KEY, so quizzes can't be generated." },
      { status: 500 }
    );
  }

  let questions;
  try {
    questions = await generateQuiz(env.GROQ_API_KEY, book);
  } catch (err) {
    return Response.json({ error: `Couldn't generate a quiz: ${err.message}` }, { status: 502 });
  }

  // Every call generates a new quiz — a retake after a fail gets fresh questions,
  // not the same ones memorized through trial and error.
  const quiz = await env.DB.prepare(
    "INSERT INTO quizzes (book_id, questions_json) VALUES (?, ?) RETURNING *"
  )
    .bind(params.id, JSON.stringify(questions))
    .first();

  await env.DB.prepare("UPDATE books SET status = 'quiz_ready' WHERE id = ? AND status != 'completed'")
    .bind(params.id)
    .run();

  return Response.json(toClientQuiz(quiz));
}

async function getLatestQuiz(env, bookId) {
  return env.DB.prepare(
    "SELECT * FROM quizzes WHERE book_id = ? ORDER BY created_at DESC LIMIT 1"
  )
    .bind(bookId)
    .first();
}

// Strip correct_index before sending to the browser so answers can't be inspected client-side.
function toClientQuiz(quiz) {
  const questions = JSON.parse(quiz.questions_json).map((q, i) => ({
    index: i,
    question: q.question,
    choices: q.choices,
  }));
  return { quiz_id: quiz.id, questions };
}

const QUESTION_JSON_SHAPE = `Respond with ONLY valid JSON, no markdown fences, no other text, in exactly this shape:
[
  {"question": "...", "choices": ["...", "...", "...", "..."], "correct_index": 0},
  {"question": "...", "choices": ["...", "...", "...", "..."], "correct_index": 0},
  {"question": "...", "choices": ["...", "...", "...", "..."], "correct_index": 0},
  {"question": "...", "choices": ["...", "...", "...", "..."], "correct_index": 0},
  {"question": "...", "choices": ["...", "...", "...", "..."], "correct_index": 0}
]`;

const NO_TRIVIA_RULE =
  "Never ask about sales figures, awards, publication dates, adaptations, or other marketing/franchise trivia — only about the story itself: setting, characters, plot events, and themes.";

async function generateQuiz(apiKey, book) {
  // Blind AI recall confuses books that share a universe/author (e.g. it wrote
  // Hunger Games questions for "Sunrise on the Reaping"). Ground it with a real
  // plot summary when Wikipedia has one, instead of trusting memory alone.
  const grounding = await findPlotSummary(book.title, book.author).catch(() => null);

  let prompt;
  if (grounding?.confidence === "high") {
    prompt = `Here is a real, accurate plot summary of the book "${book.title}"${book.author ? ` by ${book.author}` : ""}:

"""
${grounding.text}
"""

Using ONLY the events, characters, and details in that summary — not anything else you may know about this author or series — create 5 multiple-choice reading comprehension questions for a child who just finished reading this book${
      book.level ? ` (reading level: ${book.level})` : ""
    }. Test understanding of what actually happened in the story, not obscure trivia. Keep the language simple and age-appropriate. ${NO_TRIVIA_RULE}

${QUESTION_JSON_SHAPE}`;
  } else if (grounding) {
    prompt = `Here is background information about the book "${book.title}"${book.author ? ` by ${book.author}` : ""}:

"""
${grounding.text}
"""

This may describe the wider series or franchise rather than this specific book, and may mention multiple books/volumes. The child specifically read "${book.title}". If the text clearly labels which events belong to that exact book, use ONLY those parts. Otherwise, ONLY ask about story elements shared across the whole series that this book would definitely include — setting, main characters, core premise — and do NOT ask about specific plot twists or events unless you're confident they belong to this exact book, not a different volume.

Create 5 multiple-choice reading comprehension questions for a child who just finished reading this book${
      book.level ? ` (reading level: ${book.level})` : ""
    }. Keep the language simple and age-appropriate. ${NO_TRIVIA_RULE}

${QUESTION_JSON_SHAPE}`;
  } else {
    prompt = `Create 5 multiple-choice reading comprehension questions for a child who just finished reading the book "${book.title}"${
      book.author ? ` by ${book.author}` : ""
    }${book.level ? ` (reading level: ${book.level})` : ""}.

Base the questions on the well-known plot, characters, and themes of this book. Test understanding of what happened in the story, not obscure trivia. Keep the language simple and age-appropriate for the reading level given. ${NO_TRIVIA_RULE}

${QUESTION_JSON_SHAPE}`;
  }

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "openai/gpt-oss-120b",
      max_tokens: 2000,
      reasoning_effort: "low",
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Groq API returned ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const text = (data.choices?.[0]?.message?.content ?? "")
    .trim()
    .replace(/^```(json)?\s*/i, "")
    .replace(/```\s*$/i, "");

  const questions = JSON.parse(text);
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error("Model did not return a question list");
  }
  // The model tends to always place the correct choice first — shuffle so the
  // answer position isn't guessable.
  return questions.map(shuffleChoices);
}

const WIKI_HEADERS = { "User-Agent": "Litquest/1.0 (family reading app; contact via GitHub)" };

function extractSection(fullText, headingName, maxLen) {
  const marker = `\n${headingName}\n`;
  const idx = fullText.indexOf(marker);
  if (idx === -1) return null;
  const start = idx + marker.length;
  const nextHeading = fullText.slice(start).match(/\n[A-Z][A-Za-z ]{2,40}\n/);
  const end = nextHeading ? start + nextHeading.index : start + maxLen;
  return fullText.slice(start, Math.min(end, start + maxLen)).trim() || null;
}

// Finds the book's real Wikipedia article and pulls out story content to ground
// quiz questions in, instead of the model's possibly-wrong recall. A dedicated
// "Plot"/"Synopsis" section is high confidence (book-specific). Many series only
// have one combined article with no such section — "Premise" (+ "Characters")
// still beats the lead paragraph, which is mostly sales/marketing facts, but is
// lower confidence since it may span the whole series rather than this one book.
async function findPlotSummary(title, author) {
  const searchQuery = author ? `${title} novel ${author}` : `${title} novel`;
  const searchRes = await fetch(
    `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      searchQuery
    )}&format=json&srlimit=1`,
    { headers: WIKI_HEADERS }
  );
  if (!searchRes.ok) return null;
  const searchData = await searchRes.json();
  const pageTitle = searchData?.query?.search?.[0]?.title;
  if (!pageTitle) return null;

  const extractRes = await fetch(
    `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(
      pageTitle
    )}&prop=extracts&explaintext=1&exsectionformat=plain&redirects=1&format=json`,
    { headers: WIKI_HEADERS }
  );
  if (!extractRes.ok) return null;
  const extractData = await extractRes.json();
  const page = Object.values(extractData?.query?.pages ?? {})[0];
  const fullText = page?.extract;
  if (!fullText) return null;

  const plot =
    extractSection(fullText, "Plot", 3000) ||
    extractSection(fullText, "Plot summary", 3000) ||
    extractSection(fullText, "Synopsis", 3000);
  if (plot) return { text: plot, confidence: "high" };

  const premise = extractSection(fullText, "Premise", 2200);
  const characters = extractSection(fullText, "Characters", 1800);
  const combined = [premise, characters].filter(Boolean).join("\n\n");
  if (combined) return { text: combined, confidence: "low" };

  const lead = fullText.slice(0, 1200).trim();
  return lead ? { text: lead, confidence: "low" } : null;
}

function shuffleChoices(q) {
  const order = q.choices.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return {
    question: q.question,
    choices: order.map((i) => q.choices[i]),
    correct_index: order.indexOf(q.correct_index),
  };
}
