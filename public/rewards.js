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
    return;
  }

  const remembered = Number(localStorage.getItem("litquest_rewards_kid"));
  activeKidId = kids.some((k) => k.id === remembered) ? remembered : kids[0].id;

  kidPicker.innerHTML = kids.map((k) => `<option value="${k.id}">${k.avatar} ${escapeHtml(k.name)}</option>`).join("");
  kidPicker.value = String(activeKidId);
  kidPicker.disabled = false;

  await loadQuests();
}

kidPicker.addEventListener("change", async () => {
  activeKidId = Number(kidPicker.value);
  localStorage.setItem("litquest_rewards_kid", String(activeKidId));
  await loadQuests();
});

async function loadQuests() {
  const tracks = await api(`/api/quests?player_id=${activeKidId}`);
  tracks.forEach(renderTrack);
}

function renderTrack(track) {
  const { quest_type } = track;
  const cycleLabel = document.getElementById(`${quest_type}-cycle-label`);
  const periodRow = document.getElementById(`${quest_type}-period-row`);
  const list = document.getElementById(`${quest_type}-rewards-list`);
  const addForm = document.getElementById(`${quest_type}-add-form`);

  cycleLabel.textContent = track.period_months
    ? `— every ${track.period_months} month${track.period_months === 1 ? "" : "s"} (current cycle: ${track.start} to ${track.end})`
    : "— not set up yet";

  periodRow.innerHTML = `
    <label>Cycle length (months)
      <input type="number" min="1" class="period-input" value="${track.period_months ?? ""}" ${unlocked ? "" : "disabled"} />
    </label>
    <button type="button" class="btn primary save-period-btn" ${unlocked ? "" : "hidden"}>Save</button>
  `;
  periodRow.querySelector(".save-period-btn")?.addEventListener("click", async () => {
    const months = periodRow.querySelector(".period-input").value;
    try {
      await api("/api/quests", {
        method: "POST",
        body: JSON.stringify({ player_id: activeKidId, quest_type, period_months: months, pin }),
      });
      await loadQuests();
    } catch (err) {
      alert(err.message);
    }
  });

  if (track.rewards.length === 0) {
    list.innerHTML = `<p class="empty-hint">No rewards set for this track yet.</p>`;
  } else {
    list.innerHTML = track.rewards
      .map(
        (r) => `
      <div class="reward-row" data-id="${r.id}">
        <span class="reward-level">${r.threshold} pts</span>
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
