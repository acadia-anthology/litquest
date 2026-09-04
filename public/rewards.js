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

async function loadQuests() {
  const tracks = await api("/api/quests");
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
        body: JSON.stringify({ quest_type, period_months: months, pin }),
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
      <div class="reward-row">
        <span class="reward-level">${r.threshold} pts</span>
        <span class="reward-emoji">${r.emoji}</span>
        <span class="reward-text">${escapeHtml(r.reward_text)}</span>
        <span class="reward-actions">
          <button type="button" class="delete-reward-btn" data-id="${r.id}" ${unlocked ? "" : "hidden"} title="Delete">🗑️</button>
        </span>
      </div>
    `
      )
      .join("");

    list.querySelectorAll(".delete-reward-btn").forEach((btn) => {
      btn.addEventListener("click", () => deleteReward(btn.dataset.id));
    });
  }

  addForm.hidden = !unlocked;
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
    try {
      await api("/api/quests/rewards", {
        method: "POST",
        body: JSON.stringify({
          quest_type: questType,
          threshold: form.threshold.value,
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

loadQuests();
