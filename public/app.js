// MERIDIAN // OPS — frontend. Program-generic: tabs/categories render from
// whatever the active program's data says, nothing here is hardcoded to
// "week1" content.

const XP_PER_TASK = 10;
const LEVELS = [0, 50, 150, 300, 500, 800, 1200, 1700, 2300, 3000];

const state = {
  program: null,
  categories: [],
  tasks: [],
  completionsToday: new Set(),
  allCompletions: [],
  today: null,
  activeCategoryId: null,
};

const app = document.getElementById("app");

function levelFromXp(xp) {
  let level = 1;
  for (let i = 0; i < LEVELS.length; i++) {
    if (xp >= LEVELS[i]) level = i + 1;
  }
  return level;
}

function computeStreak() {
  const dates = new Set(state.allCompletions.map((c) => c.date));
  let streak = 0;
  let d = new Date(state.today);
  while (dates.has(d.toISOString().slice(0, 10))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  return res;
}

function renderPinScreen(error) {
  let entered = "";
  app.innerHTML = `
    <div class="pin-screen">
      <div class="pin-title">MERIDIAN // OPS<span class="designation">ACCESS TERMINAL — ENTER CODE</span></div>
      <div class="pin-dots" id="pinDots"></div>
      <div class="pin-error" id="pinError">${error || ""}</div>
      <div class="keypad" id="keypad"></div>
    </div>
  `;
  const dotsEl = document.getElementById("pinDots");
  const keypad = document.getElementById("keypad");

  function renderDots() {
    dotsEl.innerHTML = Array.from({ length: 6 })
      .map((_, i) => `<div class="pin-dot ${i < entered.length ? "filled" : ""}"></div>`)
      .join("");
  }
  renderDots();

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "DEL", "0", "OK"];
  keypad.innerHTML = keys
    .map((k) => `<button data-key="${k}" class="${k.length > 1 ? "wide" : ""}">${k}</button>`)
    .join("");

  keypad.addEventListener("click", async (e) => {
    const key = e.target.dataset.key;
    if (!key) return;
    if (key === "DEL") {
      entered = entered.slice(0, -1);
    } else if (key === "OK") {
      const res = await api("/api/login", { method: "POST", body: JSON.stringify({ pin: entered }) });
      if (res.ok) {
        boot();
      } else {
        renderPinScreen("ACCESS CODE REJECTED");
      }
      return;
    } else if (entered.length < 6) {
      entered += key;
    }
    renderDots();
  });
}

function groupTasksByDay(tasks) {
  const groups = new Map();
  for (const t of tasks) {
    const key = t.day_key || "DAILY";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  return groups;
}

function renderTaskRow(task) {
  const checked = state.completionsToday.has(task.id);
  return `
    <div class="task-row" data-task-id="${task.id}">
      <div class="task-check ${checked ? "checked" : ""}">${checked ? "✓" : ""}</div>
      <div class="task-body">
        <div class="task-label ${checked ? "checked" : ""}">${escapeHtml(task.label)}</div>
        ${task.detail ? `<div class="task-detail">${escapeHtml(task.detail)}</div>` : ""}
      </div>
    </div>
  `;
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function renderCategoryView(categoryId) {
  const tasks = state.tasks.filter((t) => t.category_id === categoryId);
  const groups = groupTasksByDay(tasks);
  let html = "";
  for (const [dayKey, dayTasks] of groups) {
    html += `<div class="day-group">`;
    if (groups.size > 1) html += `<h3>${escapeHtml(dayKey)}</h3>`;
    html += dayTasks.map(renderTaskRow).join("");
    html += `</div>`;
  }
  return html || `<div class="reference-note">No entries logged for this system yet.</div>`;
}

function renderHome() {
  const totalXp = state.allCompletions.length * XP_PER_TASK;
  const level = levelFromXp(totalXp);
  const streak = computeStreak();
  const todayTotal = state.tasks.length;
  const todayDone = state.completionsToday.size;

  return `
    <div class="reference-note">
      SHIP: ${escapeHtml(state.program.name)}<br/>
      REGISTER: ${escapeHtml(state.program.theme_concept)}
    </div>
    <div class="stat-row">
      <div class="stat-chip">LEVEL<strong>${level}</strong></div>
      <div class="stat-chip">XP<strong>${totalXp}</strong></div>
      <div class="stat-chip">STREAK<strong>${streak}d</strong></div>
      <div class="stat-chip">TODAY<strong>${todayDone}/${todayTotal}</strong></div>
    </div>
    <div class="day-group">
      <h3>Systems</h3>
      ${state.categories
        .map((c) => {
          const catTasks = state.tasks.filter((t) => t.category_id === c.id);
          const done = catTasks.filter((t) => state.completionsToday.has(t.id)).length;
          return `<div class="task-row" data-goto="${c.id}">
            <div class="task-body">
              <div class="task-label">${escapeHtml(c.label)}</div>
              <div class="task-detail">${done}/${catTasks.length} cleared today</div>
            </div>
          </div>`;
        })
        .join("")}
    </div>
  `;
}

function render() {
  const tabs = [{ id: "home", label: "OVERVIEW" }, ...state.categories.map((c) => ({ id: c.id, label: c.label }))];
  const active = state.activeCategoryId || "home";

  app.innerHTML = `
    <header class="topbar">
      <div class="ship-line">MERIDIAN // OPS</div>
      <div class="program-name">${escapeHtml(state.program.name)}</div>
    </header>
    <main id="main"></main>
    <nav class="tabbar">
      ${tabs
        .map((t) => `<button data-tab="${t.id}" class="${t.id === active ? "active" : ""}">${escapeHtml(t.label)}</button>`)
        .join("")}
    </nav>
  `;

  document.getElementById("main").innerHTML = active === "home" ? renderHome() : renderCategoryView(active);

  document.querySelectorAll("nav.tabbar button").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.activeCategoryId = btn.dataset.tab;
      render();
    });
  });

  document.querySelectorAll("[data-goto]").forEach((el) => {
    el.addEventListener("click", () => {
      state.activeCategoryId = el.dataset.goto;
      render();
    });
  });

  document.querySelectorAll(".task-row[data-task-id]").forEach((row) => {
    row.addEventListener("click", () => toggleTask(row.dataset.taskId));
  });
}

async function toggleTask(taskId) {
  const wasChecked = state.completionsToday.has(taskId);
  const nowChecked = !wasChecked;

  if (nowChecked) {
    state.completionsToday.add(taskId);
    state.allCompletions.push({ task_id: taskId, date: state.today });
  } else {
    state.completionsToday.delete(taskId);
    state.allCompletions = state.allCompletions.filter(
      (c) => !(c.task_id === taskId && c.date === state.today)
    );
  }
  render();

  await api("/api/toggle", {
    method: "POST",
    body: JSON.stringify({ taskId, date: state.today, completed: nowChecked }),
  });
}

async function loadProgram() {
  const res = await api("/api/program");
  if (res.status === 401) {
    renderPinScreen();
    return;
  }
  const data = await res.json();
  state.program = data.program;
  state.categories = data.categories;
  state.tasks = data.tasks;
  state.completionsToday = new Set(data.completionsToday);
  state.allCompletions = data.allCompletions;
  state.today = data.today;
  render();
}

function boot() {
  loadProgram();
}

if ("serviceWorker" in navigator) {
  // Reserved for future offline support; no service worker registered yet.
}

boot();
