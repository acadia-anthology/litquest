const readingCards = document.getElementById("readingCards");
const quizReadyCards = document.getElementById("quizReadyCards");
const completedCards = document.getElementById("completedCards");

const addBookModal = document.getElementById("addBookModal");
const addPlayerModal = document.getElementById("addPlayerModal");
const quizModal = document.getElementById("quizModal");
const resultModal = document.getElementById("resultModal");
const helpModal = document.getElementById("helpModal");

document.getElementById("helpBtn").addEventListener("click", () => helpModal.showModal());
document.getElementById("closeHelp").addEventListener("click", () => helpModal.close());

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
  await loadMonthOptions();
  await loadBookBars();

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
  document.getElementById("readerTypeSelect").value = p.reader_type;
}

document.getElementById("readerTypeSelect").addEventListener("change", async (e) => {
  const p = activePlayer();
  if (!p) return;
  await api(`/api/players/${p.id}`, {
    method: "PATCH",
    body: JSON.stringify({ reader_type: e.target.value }),
  });
  await loadPlayers();
});

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

const monthSelect = document.getElementById("monthSelect");
const MONTH_ABBR = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function monthLabel(monthStr) {
  const [year, month] = monthStr.split("-");
  return `${MONTH_ABBR[Number(month) - 1]} ${year.slice(2)}`;
}

function currentMonthStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

async function loadMonthOptions() {
  const previouslySelected = monthSelect.value || currentMonthStr();
  const months = await api("/api/stats/months");
  monthSelect.innerHTML = months.map((m) => `<option value="${m}">${monthLabel(m)}</option>`).join("");
  monthSelect.value = months.includes(previouslySelected) ? previouslySelected : months[0];
}

async function loadBookBars() {
  const el = document.getElementById("bookBarChart");
  if (!monthSelect.value) return;
  const data = await api(`/api/stats/monthly-books?month=${monthSelect.value}`);
  el.innerHTML = "";
  if (data.length === 0) return;

  const maxBooks = Math.max(0, ...data.map((p) => p.count));
  const scaleMax = Math.max(3, maxBooks);
  const step = Math.max(1, Math.ceil(scaleMax / 10));

  const scale = document.createElement("div");
  scale.className = "bar-scale";
  let ticksHtml = "";
  for (let t = step; t <= scaleMax; t += step) {
    ticksHtml += `<span style="left:${(t / scaleMax) * 100}%">${t}</span>`;
  }
  scale.innerHTML = `<span></span><div class="bar-scale-track">${ticksHtml}</div><span></span>`;
  el.appendChild(scale);

  const ranked = [...data].sort((a, b) => b.count - a.count);
  ranked.forEach((p) => {
    const row = document.createElement("div");
    row.className = "bar-row";
    const widthPct = (p.count / scaleMax) * 100;
    row.innerHTML = `
      <span class="bar-row-label">${p.avatar} ${escapeHtml(p.name)}</span>
      <div class="bar-row-track"><div class="bar-row-fill" style="width:${widthPct}%"></div></div>
      <span class="bar-row-count">${p.count}</span>
    `;
    el.appendChild(row);
  });
}

monthSelect.addEventListener("change", () => loadBookBars());

document.getElementById("cancelAddPlayer").addEventListener("click", () => addPlayerModal.close());

document.getElementById("addPlayerForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const newPlayer = await api("/api/players", {
    method: "POST",
    body: JSON.stringify({
      name: form.name.value,
      avatar: form.avatar.value,
      reader_type: form.reader_type.value,
    }),
  });
  form.reset();
  addPlayerModal.close();
  await loadPlayers();
  setActivePlayer(newPlayer.id);
});

// --- Books board ---

function formatDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr.length === 10 ? `${dateStr}T00:00:00` : dateStr);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function bookRow(book, actionBtn) {
  const div = document.createElement("div");
  div.className = "book-row";
  const metaParts = [book.author, book.level];
  if (book.status === "completed" && book.pages) metaParts.push(`${book.pages} pages`);
  const meta = metaParts.filter(Boolean).join(" · ");
  const dateLabel = book.finished_at
    ? `Started ${formatDate(book.added_at)} · Finished ${formatDate(book.finished_at)}`
    : `Started ${formatDate(book.added_at)}`;

  const pointsBadge =
    book.points_earned > 0 ? `<span class="points-badge">+${book.points_earned} pts</span>` : "";

  const quizScoreLine =
    book.status === "completed" && Number.isFinite(book.quiz_score) && Number.isFinite(book.quiz_total)
      ? `<span class="quiz-score-label">Quiz: ${book.quiz_score}/${book.quiz_total}</span>`
      : "";

  div.innerHTML = `
    <div class="row-main">
      ${pointsBadge}
      <div class="title-block">
        <h3>${escapeHtml(book.title)}</h3>
        <div class="meta">${escapeHtml(meta || " ")}</div>
      </div>
    </div>
    <div class="row-side">
      <div class="dates">
        <span class="date-label">${dateLabel}</span>
        ${quizScoreLine}
      </div>
      <button type="button" class="edit-dates-btn" title="Edit dates">✏️</button>
      <button type="button" class="delete-book-btn" title="Delete this book">🗑️</button>
    </div>
  `;

  div.querySelector(".edit-dates-btn").addEventListener("click", () => toggleDateEditor(div, book));
  div.querySelector(".delete-book-btn").addEventListener("click", () => deleteBook(book));

  if (actionBtn) {
    actionBtn.classList.add("action-btn");
    div.querySelector(".row-side").appendChild(actionBtn);
  }
  return div;
}

async function deleteBook(book) {
  const warning =
    book.status === "completed"
      ? `Delete "${book.title}"? This also removes any points it earned.`
      : `Delete "${book.title}"?`;
  if (!confirm(warning)) return;

  await api(`/api/books/${book.id}`, { method: "DELETE" });
  await loadBooks();
  await loadPlayers();
}

function toggleDateEditor(cardEl, book) {
  const existing = cardEl.querySelector(".edit-dates-form");
  if (existing) {
    existing.remove();
    return;
  }

  const form = document.createElement("div");
  form.className = "edit-dates-form";
  form.innerHTML = `
    <label>Started <input type="date" value="${book.added_at || ""}" class="edit-started" /></label>
    <label>Finished <input type="date" value="${book.finished_at || ""}" class="edit-finished" /></label>
    <div class="row-actions">
      <button type="button" class="btn edit-cancel">Cancel</button>
      <button type="button" class="btn primary edit-save">Save</button>
    </div>
  `;

  form.querySelector(".edit-cancel").addEventListener("click", () => form.remove());
  form.querySelector(".edit-save").addEventListener("click", async () => {
    const started = form.querySelector(".edit-started").value;
    const finished = form.querySelector(".edit-finished").value;
    await api(`/api/books/${book.id}`, {
      method: "PATCH",
      body: JSON.stringify({ added_at: started, finished_at: finished || null }),
    });
    await loadBooks();
    await loadMonthOptions();
    await loadBookBars();
  });

  cardEl.appendChild(form);
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
    const finishBtn = makeButton("Finished it! 🎉", () => startQuiz(b));
    readingCards.appendChild(bookRow(b, finishBtn));
  });

  quizReady.forEach((b) => {
    const quizBtn = makeButton("Take Quiz 📝", () => startQuiz(b));
    quizReadyCards.appendChild(bookRow(b, quizBtn));
  });

  completed.forEach((b) => {
    completedCards.appendChild(bookRow(b));
  });
}

// --- Add book ---

const addBookForm = document.getElementById("addBookForm");
const titleInput = addBookForm.querySelector('[name="title"]');
const authorInput = addBookForm.querySelector('[name="author"]');
const lookupStatus = document.getElementById("lookupStatus");
const startedInput = document.getElementById("startedInput");
const finishedInput = document.getElementById("finishedInput");
const finishedDateRow = document.getElementById("finishedDateRow");
const alreadyFinishedCheckbox = document.getElementById("alreadyFinishedCheckbox");
const alreadyFinishedHint = document.getElementById("alreadyFinishedHint");
const addBookSubmitBtn = document.getElementById("addBookSubmitBtn");

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function resetAddBookForm() {
  addBookForm.reset();
  startedInput.value = todayISO();
  finishedInput.value = todayISO();
  finishedDateRow.hidden = true;
  alreadyFinishedHint.hidden = true;
  addBookSubmitBtn.textContent = "Start Reading";
  addBookSubmitBtn.disabled = false;
  lookupStatus.hidden = true;
  lookupToken++;
  lastLookupResult = null;
}

alreadyFinishedCheckbox.addEventListener("change", () => {
  const checked = alreadyFinishedCheckbox.checked;
  finishedDateRow.hidden = !checked;
  alreadyFinishedHint.hidden = !checked;
  addBookSubmitBtn.textContent = checked ? "Log as Finished" : "Start Reading";
});

newQuestBtn.addEventListener("click", () => {
  resetAddBookForm();
  addBookModal.showModal();
});
document.getElementById("cancelAddBook").addEventListener("click", () => {
  resetAddBookForm();
  addBookModal.close();
});

let lookupToken = 0;
let lastLookupResult = null; // { grade_level, grade_level_num, lit_score, book_type, complexity, pages } — drives scoring, not user-editable

// Any edit after a lookup invalidates it, so a stale result for a since-changed
// title/author never gets submitted.
function invalidateLookup() {
  if (lastLookupResult !== null) {
    lastLookupResult = null;
    lookupStatus.hidden = true;
  }
  addBookSubmitBtn.disabled = false;
}
titleInput.addEventListener("input", invalidateLookup);
authorInput.addEventListener("input", invalidateLookup);

async function tryAutoLookupLevel() {
  const title = titleInput.value.trim();
  if (!title) return;

  const myToken = ++lookupToken;
  lookupStatus.hidden = false;
  lookupStatus.textContent = "🔍 Looking up this book...";
  addBookSubmitBtn.disabled = false;

  try {
    const result = await api("/api/lookup-level", {
      method: "POST",
      body: JSON.stringify({ title, author: authorInput.value.trim() }),
    });
    if (myToken !== lookupToken) return; // a newer lookup superseded this one

    if (result.known && Number.isFinite(result.grade_level_num) && result.grade_level_num < 4) {
      lastLookupResult = null;
      addBookSubmitBtn.disabled = true;
      lookupStatus.textContent = `🚫 This looks like a ${result.grade_level || "K-3"} book — Litquest only logs 4th grade and up.`;
    } else if (result.known) {
      lastLookupResult = result;
      const parts = [];
      if (result.grade_level) parts.push(result.grade_level);
      if (result.lit_score) parts.push(`LitScore ${result.lit_score}`);
      if (result.book_type) parts.push(result.book_type);
      if (result.pages) parts.push(`~${result.pages} pages`);
      lookupStatus.textContent =
        parts.length > 0 ? `📖 Found it: ${parts.join(" · ")}` : "Found the book, but couldn't estimate its details.";
    } else {
      lastLookupResult = null;
      lookupStatus.textContent = "Couldn't identify this book — it'll use default scoring (short book, no level bonus).";
    }
  } catch {
    if (myToken !== lookupToken) return;
    lastLookupResult = null;
    lookupStatus.textContent = "Lookup failed — it'll use default scoring (short book, no level bonus).";
  }
}

authorInput.addEventListener("blur", tryAutoLookupLevel);
titleInput.addEventListener("blur", () => {
  if (!authorInput.value.trim()) tryAutoLookupLevel();
});

addBookForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const levelParts = [];
  if (lastLookupResult?.grade_level) levelParts.push(lastLookupResult.grade_level);
  if (lastLookupResult?.lit_score) levelParts.push(`LitScore ${lastLookupResult.lit_score}`);

  const payload = {
    player_id: activePlayerId,
    title: form.title.value,
    author: form.author.value,
    pages: lastLookupResult?.pages ?? "",
    level: levelParts.join(" · "),
    lit_score: lastLookupResult?.lit_score ? parseInt(lastLookupResult.lit_score, 10) : "",
    book_type: lastLookupResult?.book_type ?? "",
    complexity: lastLookupResult?.complexity ?? "",
    grade_level_num: lastLookupResult?.grade_level_num ?? "",
    added_at: startedInput.value,
    finished_at: alreadyFinishedCheckbox.checked ? finishedInput.value : null,
  };
  await api("/api/books", { method: "POST", body: JSON.stringify(payload) });
  resetAddBookForm();
  addBookModal.close();
  await loadBooks();
  await loadMonthOptions();
  await loadBookBars();
});

// --- Quiz flow ---

let currentQuiz = null;

async function startQuiz(book) {
  document.getElementById("quizTitle").textContent = `Quiz: ${book.title}`;
  document.getElementById("quizLoading").hidden = false;
  document.getElementById("quizLoading").textContent = "Cooking up your questions... 🍳";
  document.getElementById("quizForm").hidden = true;
  document.getElementById("submitQuizBtn").hidden = true;
  quizModal.showModal();

  try {
    // Always generates a fresh quiz — a retake gets new questions, not memorized old ones.
    const quiz = await api(`/api/books/${book.id}/quiz`, { method: "POST" });
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
