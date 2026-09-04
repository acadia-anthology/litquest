const readingCards = document.getElementById("readingCards");
const quizReadyCards = document.getElementById("quizReadyCards");
const completedCards = document.getElementById("completedCards");

const addBookModal = document.getElementById("addBookModal");
const quizModal = document.getElementById("quizModal");
const resultModal = document.getElementById("resultModal");

async function api(path, options) {
  const res = await fetch(path, {
    ...options,
    headers: { "content-type": "application/json", ...(options?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

async function loadProfile() {
  const p = await api("/api/profile");
  document.getElementById("levelBadge").textContent = `Lv ${p.level}`;
  document.getElementById("pointsText").textContent = `${p.total_points} pts`;
  document.getElementById("xpFill").style.width = `${p.points_into_level}%`;
}

function bookCard(book, actions) {
  const div = document.createElement("div");
  div.className = "card";
  const meta = [book.author, book.level].filter(Boolean).join(" · ");
  div.innerHTML = `
    <h3>${escapeHtml(book.title)}</h3>
    <div class="meta">${escapeHtml(meta || " ")}</div>
  `;
  actions.forEach((a) => div.appendChild(a));
  return div;
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

function makeButton(label, onClick, primary = true) {
  const btn = document.createElement("button");
  btn.className = `btn${primary ? " primary" : ""}`;
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

async function loadBooks() {
  const books = await api("/api/books");
  readingCards.innerHTML = "";
  quizReadyCards.innerHTML = "";
  completedCards.innerHTML = "";

  const reading = books.filter((b) => b.status === "reading");
  const quizReady = books.filter((b) => b.status === "quiz_ready");
  const completed = books.filter((b) => b.status === "completed");

  if (reading.length === 0) readingCards.innerHTML = `<p class="empty-hint">Nothing here yet.</p>`;
  if (quizReady.length === 0) quizReadyCards.innerHTML = `<p class="empty-hint">Finish a book to unlock a quiz!</p>`;
  if (completed.length === 0) completedCards.innerHTML = `<p class="empty-hint">Your finished quests will show up here.</p>`;

  reading.forEach((b) => {
    const finishBtn = makeButton("Finished it! 🎉", () => startQuiz(b, true));
    readingCards.appendChild(bookCard(b, [finishBtn]));
  });

  quizReady.forEach((b) => {
    const quizBtn = makeButton("Take Quiz 📝", () => startQuiz(b, false));
    quizReadyCards.appendChild(bookCard(b, [quizBtn]));
  });

  completed.forEach((b) => {
    completedCards.appendChild(bookCard(b, []));
  });
}

// --- Add book ---

document.getElementById("newQuestBtn").addEventListener("click", () => addBookModal.showModal());
document.getElementById("cancelAddBook").addEventListener("click", () => addBookModal.close());

document.getElementById("addBookForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const payload = {
    title: form.title.value,
    author: form.author.value,
    pages: form.pages.value,
    level: form.level.value,
  };
  await api("/api/books", { method: "POST", body: JSON.stringify(payload) });
  form.reset();
  addBookModal.close();
  await loadBooks();
});

// --- Quiz flow ---

let currentQuiz = null;

async function startQuiz(book, markFinished) {
  document.getElementById("quizTitle").textContent = `Quiz: ${book.title}`;
  document.getElementById("quizLoading").hidden = false;
  document.getElementById("quizLoading").textContent = "Cooking up your questions... 🍳";
  document.getElementById("quizForm").hidden = true;
  document.getElementById("submitQuizBtn").hidden = true;
  quizModal.showModal();

  try {
    const quiz = markFinished
      ? await api(`/api/books/${book.id}/quiz`, { method: "POST" })
      : await api(`/api/books/${book.id}/quiz`);
    currentQuiz = quiz;
    renderQuiz(quiz);
    await loadBooks();
  } catch (err) {
    document.getElementById("quizLoading").textContent = `Oops: ${err.message}`;
  }
}

function renderQuiz(quiz) {
  const form = document.getElementById("quizForm");
  form.innerHTML = "";
  quiz.questions.forEach((q) => {
    const block = document.createElement("div");
    block.className = "question-block";
    const p = document.createElement("p");
    p.textContent = `${q.index + 1}. ${q.question}`;
    block.appendChild(p);
    q.choices.forEach((choice, ci) => {
      const label = document.createElement("label");
      label.className = "choice";
      label.innerHTML = `<input type="radio" name="q${q.index}" value="${ci}" required /> ${escapeHtml(choice)}`;
      block.appendChild(label);
    });
    form.appendChild(block);
  });

  document.getElementById("quizLoading").hidden = true;
  form.hidden = false;
  document.getElementById("submitQuizBtn").hidden = false;
}

document.getElementById("cancelQuiz").addEventListener("click", () => quizModal.close());

document.getElementById("quizForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const answers = currentQuiz.questions.map((q) => {
    const checked = form.querySelector(`input[name="q${q.index}"]:checked`);
    return checked ? Number(checked.value) : -1;
  });

  const result = await api(`/api/quiz/${currentQuiz.quiz_id}/submit`, {
    method: "POST",
    body: JSON.stringify({ answers }),
  });

  quizModal.close();
  showResult(result);
  await Promise.all([loadBooks(), loadProfile()]);
});

function showResult(result) {
  const content = document.getElementById("resultContent");
  content.innerHTML = `
    <div class="result-summary">
      <div class="big-score">${result.score} / ${result.total}</div>
      <p class="${result.passed ? "result-pass" : "result-fail"}">
        ${result.passed ? "You passed! 🎉" : "Not quite — give it another shot!"}
      </p>
      ${result.passed ? `<p>+${result.points_earned} points earned!</p>` : ""}
    </div>
    <div class="modal-actions">
      <button class="btn primary" id="closeResult">Nice!</button>
    </div>
  `;
  resultModal.showModal();
  document.getElementById("closeResult").addEventListener("click", () => resultModal.close());
}

// --- init ---

loadProfile();
loadBooks();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
