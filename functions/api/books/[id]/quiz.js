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

async function generateQuiz(apiKey, book) {
  const prompt = `Create 5 multiple-choice reading comprehension questions for a child who just finished reading the book "${book.title}"${
    book.author ? ` by ${book.author}` : ""
  }${book.level ? ` (reading level: ${book.level})` : ""}.

Base the questions on the well-known plot, characters, and themes of this book. Test understanding of what happened in the story, not obscure trivia. Keep the language simple and age-appropriate for the reading level given.

Respond with ONLY valid JSON, no markdown fences, no other text, in exactly this shape:
[
  {"question": "...", "choices": ["...", "...", "...", "..."], "correct_index": 0},
  {"question": "...", "choices": ["...", "...", "...", "..."], "correct_index": 0},
  {"question": "...", "choices": ["...", "...", "...", "..."], "correct_index": 0},
  {"question": "...", "choices": ["...", "...", "...", "..."], "correct_index": 0},
  {"question": "...", "choices": ["...", "...", "...", "..."], "correct_index": 0}
]`;

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
