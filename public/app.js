const readingCards = document.getElementById("readingCards");
const quizReadyCards = document.getElementById("quizReadyCards");
const completedCards = document.getElementById("completedCards");

const addBookModal = document.getElementById("addBookModal");
const addPlayerModal = document.getElementById("addPlayerModal");
const quizModal = document.getElementById("quizModal");
const resultModal = document.getElementById("resultModal");

const newQuestBtn = document.getElementById("newQuestBtn");
const board = document.getElementById("board");

async function api(path, options) {
  const res = await fetch(path, {
    ...options,
    headers: { "content-type": "application/json", ...(options?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

// --- Players ---

let players = [];
let activePlayerId = Number(localStorage.getItem("litquest_active_player")) || null;

function activePlayer() {
  return players.find((p) => p.id === activePlayerId) || null;
}

function setActivePlayer(id) {
  activePlayerId = id;
  localStorage.setItem("litquest_active_player", String(id));
  renderPlayerSwitcher();
  renderProfileBar();
  loadBooks();
}

async function loadPlayers() {
  players = await api("/api/players");
  if (!activePlayerId || !players.some((p) => p.id === activePlayerId)) {
    activePlayerId = players[0]?.id ?? null;
    if (activePlayerId) localStorage.setItem("litquest_active_player", String(activePlayerId));
  }
  renderPlayerSwitcher();
  renderProfileBar();
  renderLeaderboard();

  const hasPlayer = Boolean(activePlayerId);
  newQuestBtn.hidden = !hasPlayer;
  board.hidden = !hasPlayer;
  document.getElementById("profileBar").hidden = !hasPlayer;
}

function renderPlayerSwitcher() {
  const el = document.getElementById("playerSwitcher");
  el.innerHTML = "";
  players.forEach((p) => {
    const btn = document.createElement("button");
    btn.className = `player-pill${p.id === activePlayerId ? " active" : ""}`;
    btn.textContent = `${p.avatar} ${p.name}`;
    btn.addEventListener("click", () => setActivePlayer(p.id));
    el.appendChild(btn);
  });
  const addBtn = document.createElement("button");
  addBtn.className = "player-pill add-player";
  addBtn.textContent = "+ Add Player";
  addBtn.addEventListener("click", () => addPlayerModal.showModal());
  el.appendChild(addBtn);
}

function renderProfileBar() {
  const p = activePlayer();
  if (!p) return;
  document.getElementById("levelBadge").textContent = `${p.avatar} Lv ${p.level}`;
  document.getElementById("pointsText").textContent = `${p.total_points} pts`;
  document.getElementById("xpFill").style.width = `${p.points_into_level}%`;
}

function renderLeaderboard() {
  const el = document.getElementById("leaderboardList");
  el.innerHTML = "";
  if (players.length === 0) {
    el.innerHTML = `<p class="empty-hint">Add a player to get started!</p>`;
    return;
  }
  const ranked = [...players].sort((a, b) => b.total_points - a.total_points);
  ranked.forEach((p, i) => {
    const row = document.createElement("div");
    row.className = "leaderboard-row";
    const medal = ["🥇", "🥈", "🥉"][i] || `#${i + 1}`;
    row.innerHTML = `
      <span class="rank">${medal}</span>
      <span class="avatar">${p.avatar}</span>
      <span class="name">${escapeHtml(p.name)}</span>
      <span class="stats">Lv ${p.level} · ${p.total_points} pts · ${p.books_completed} books</span>
    `;
    el.appendChild(row);
  });
}

document.getElementById("cancelAddPlayer").addEventListener("click", () => addPlayerModal.close());

document.getElementById("addPlayerForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const newPlayer = await api("/api/players", {
    method: "POST",
    body: JSON.stringify({ name: form.name.value, avatar: form.avatar.value }),
  });
  form.reset();
  addPlayerModal.close();
  await loadPlayers();
  setActivePlayer(newPlayer.id);
});

// --- Books board ---

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

function makeButton(label, onClick, primary = true) {
  const btn = document.createElement("button");
  btn.className = `btn${primary ? " primary" : ""}`;
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

async function loadBooks() {
  if (!activePlayerId) return;
  const books = await api(`/api/books?player_id=${activePlayerId}`);
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

const addBookForm = document.getElementById("addBookForm");
const titleInput = addBookForm.querySelector('[name="title"]');
const authorInput = addBookForm.querySelector('[name="author"]');
const levelInput = document.getElementById("levelInput");
const lookupStatus = document.getElementById("lookupStatus");

newQuestBtn.addEventListener("click", () => addBookModal.showModal());
document.getElementById("cancelAddBook").addEventListener("click", () => {
  addBookForm.reset();
  lookupStatus.hidden = true;
  lookupToken++;
  addBookModal.close();
});

let lookupToken = 0;

async function tryAutoLookupLevel() {
  const title = titleInput.value.trim();
  if (!title || levelInput.value.trim()) return; // don't overwrite a level the user already typed

  const myToken = ++lookupToken;
  lookupStatus.hidden = false;
  lookupStatus.textContent = "🔍 Looking up reading level...";

  try {
    const result = await api("/api/lookup-level", {
      method: "POST",
      body: JSON.stringify({ title, author: authorInput.value.trim() }),
    });
    if (myToken !== lookupToken) return; // a newer lookup superseded this one

    if (result.known) {
      levelInput.value = `${result.grade_level} · Lexile ${result.lexile}`;
      lookupStatus.textContent = `Found it: ${result.grade_level}, Lexile ${result.lexile}`;
    } else {
      lookupStatus.textContent = "Couldn't find a reading level for this one — enter it manually if you know it.";
    }
  } catch {
    if (myToken !== lookupToken) return;
    lookupStatus.textContent = "Reading-level lookup failed — enter it manually if you know it.";
  }
}

authorInput.addEventListener("blur", tryAutoLookupLevel);
titleInput.addEventListener("blur", () => {
  if (!authorInput.value.trim()) tryAutoLookupLevel();
});

addBookForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const payload = {
    player_id: activePlayerId,
    title: form.title.value,
    author: form.author.value,
    pages: form.pages.value,
    level: form.level.value,
  };
  await api("/api/books", { method: "POST", body: JSON.stringify(payload) });
  form.reset();
  lookupStatus.hidden = true;
  lookupToken++;
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
  await Promise.all([loadBooks(), loadPlayers()]);
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

(async function init() {
  await loadPlayers();
  if (activePlayerId) await loadBooks();
})();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
