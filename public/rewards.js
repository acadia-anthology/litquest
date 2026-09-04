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

function formatDate(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr.replace(" ", "T") + "Z").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function rewardLabel(r) {
  const repeatIcon = r.reward_type === "repeat" ? `<span class="repeat-icon" title="Repeats">🔁</span>` : "";
  return `${repeatIcon}${r.threshold} pts`;
}

let unlocked = false;
let pin = null;
let kids = [];
let activeKidId = null;

const kidPicker = document.getElementById("kidPicker");

async function loadKids() {
  const players = await api("/api/players");
  kids = players.filter((p) => p.reader_type === "kid");

  if (kids.length === 0) {
    kidPicker.innerHTML = `<option>No kid profiles yet</option>`;
    kidPicker.disabled = true;
    document.getElementById("track-side").hidden = true;
    document.getElementById("track-main").hidden = true;
    document.getElementById("archivedSection").hidden = true;
    return;
  }

  const remembered = Number(localStorage.getItem("litquest_rewards_kid"));
  activeKidId = kids.some((k) => k.id === remembered) ? remembered : kids[0].id;

  kidPicker.innerHTML = kids.map((k) => `<option value="${k.id}">${k.avatar} ${escapeHtml(k.name)}</option>`).join("");
  kidPicker.value = String(activeKidId);
  kidPicker.disabled = false;

  await Promise.all([loadQuests(), loadArchive()]);
}

kidPicker.addEventListener("change", async () => {
  activeKidId = Number(kidPicker.value);
  localStorage.setItem("litquest_rewards_kid", String(activeKidId));
  await Promise.all([loadQuests(), loadArchive()]);
});

async function loadQuests() {
  const tracks = await api(`/api/quests?player_id=${activeKidId}`);
  tracks.forEach(renderTrack);
}

function renderTrack(track) {
  const { quest_type } = track;
  const list = document.getElementById(`${quest_type}-rewards-list`);
  const addForm = document.getElementById(`${quest_type}-add-form`);

  if (track.rewards.length === 0) {
    list.innerHTML = `<p class="empty-hint">No rewards set for this track yet.</p>`;
  } else {
    list.innerHTML = track.rewards
      .map(
        (r) => `
      <div class="reward-row" data-id="${r.id}">
        <span class="reward-level">${rewardLabel(r)}</span>
        <span class="reward-emoji">${r.emoji}</span>
        <span class="reward-text">${escapeHtml(r.reward_text)}</span>
        <span class="reward-actions">
          <button type="button" class="edit-reward-btn" data-id="${r.id}" ${unlocked ? "" : "hidden"} title="Edit">✏️</button>
          <button type="button" class="delete-reward-btn" data-id="${r.id}" ${unlocked ? "" : "hidden"} title="Delete">🗑️</button>
        </span>
      </div>
    `
      )
      .join("");

    list.querySelectorAll(".delete-reward-btn").forEach((btn) => {
      btn.addEventListener("click", () => deleteReward(btn.dataset.id));
    });
    list.querySelectorAll(".edit-reward-btn").forEach((btn) => {
      const reward = track.rewards.find((r) => String(r.id) === btn.dataset.id);
      const row = list.querySelector(`.reward-row[data-id="${reward.id}"]`);
      btn.addEventListener("click", () => toggleEditReward(row, reward));
    });
  }

  addForm.hidden = !unlocked;
}

function toggleEditReward(rowEl, reward) {
  const existingForm = rowEl.nextElementSibling;
  if (existingForm?.classList.contains("edit-reward-form")) {
    existingForm.remove();
    return;
  }

  const form = document.createElement("div");
  form.className = "edit-reward-form";
  form.innerHTML = `
    <select class="edit-mode">
      <option value="once" ${reward.reward_type === "once" ? "selected" : ""}>Once at</option>
      <option value="repeat" ${reward.reward_type === "repeat" ? "selected" : ""}>Every</option>
    </select>
    <input type="number" min="1" class="edit-threshold" value="${reward.threshold}" />
    <input type="text" maxlength="4" class="edit-emoji" value="${escapeHtml(reward.emoji)}" />
    <input type="text" class="edit-text" value="${escapeHtml(reward.reward_text)}" />
    <div class="row-actions">
      <button type="button" class="btn edit-cancel">Cancel</button>
      <button type="button" class="btn primary edit-save">Save</button>
    </div>
  `;
  form.querySelector(".edit-cancel").addEventListener("click", () => form.remove());
  form.querySelector(".edit-save").addEventListener("click", async () => {
    try {
      await api(`/api/quests/rewards/${reward.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          threshold: form.querySelector(".edit-threshold").value,
          reward_type: form.querySelector(".edit-mode").value,
          emoji: form.querySelector(".edit-emoji").value,
          reward_text: form.querySelector(".edit-text").value,
          pin,
        }),
      });
      await loadQuests();
    } catch (err) {
      alert(err.message);
    }
  });
  rowEl.insertAdjacentElement("afterend", form);
}

async function deleteReward(id) {
  if (!confirm("Delete this reward?")) return;
  try {
    await api(`/api/quests/rewards/${id}`, { method: "DELETE", body: JSON.stringify({ pin }) });
    await loadQuests();
  } catch (err) {
    alert(err.message);
  }
}

["side", "main"].forEach((questType) => {
  document.getElementById(`${questType}-add-form`).addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const rawValue = Number(form.threshold.value);
    const threshold = form.unit.value === "level" ? rawValue * 100 : rawValue;
    try {
      await api("/api/quests/rewards", {
        method: "POST",
        body: JSON.stringify({
          player_id: activeKidId,
          quest_type: questType,
          reward_type: form.reward_type.value,
          threshold,
          emoji: form.emoji.value,
          reward_text: form.reward_text.value,
          pin,
        }),
      });
      form.reset();
      await loadQuests();
    } catch (err) {
      alert(err.message);
    }
  });
});

async function loadArchive() {
  const section = document.getElementById("archivedSection");
  const list = document.getElementById("archivedList");
  const history = await api(`/api/quests/archive?player_id=${activeKidId}`);
  if (history.length === 0) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  list.innerHTML = history
    .map(
      (c) => `
    <div class="archived-row">
      <span class="archived-emoji">${c.emoji}</span>
      <span class="archived-text">${escapeHtml(c.reward_text)}</span>
      <span class="archived-date">${formatDate(c.delivered_at)}</span>
    </div>
  `
    )
    .join("");
}

document.getElementById("unlockBtn").addEventListener("click", () => {
  const entered = document.getElementById("pinInput").value;
  const pinError = document.getElementById("pinError");
  if (entered === "2112") {
    pin = entered;
    unlocked = true;
    document.getElementById("lockedNotice").hidden = true;
    pinError.hidden = true;
    loadQuests();
  } else {
    pinError.hidden = false;
  }
});

loadKids();
