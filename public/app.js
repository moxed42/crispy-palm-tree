// MERIDIAN // OPS — frontend. Program-generic: tabs/categories render from
// whatever the active program's data says, nothing here is hardcoded to
// "week1" content.

const XP_PER_EVENT = 10;
const LEVELS = [0, 50, 150, 300, 500, 800, 1200, 1700, 2300, 3000, 4000, 5200, 6600];

// Hypermobility-aware exercise cue library. Keyword-matched against task
// labels client-side (not MD-driven — these are general movement cues, not
// specific to any one program). Sourced from established hypermobility/EDS
// physical-therapy guidance (Ehlers-Danlos Society, hypermobility-focused
// PT clinics), not social media — quality and qualifications vary too much
// there to trust for joint-safety advice.
const EXERCISE_LIBRARY = [
  {
    match: /dead hang|hang/i,
    title: "Dead hang / hanging",
    caution:
      "Full bodyweight dead hangs put real subluxation risk on hypermobile shoulders — the joint gets pulled into a stretched position under full load. Hypermobility-focused PT guidance favors short, controlled hangs (feet still near the ground, most weight still through the legs) over a full relaxed hang, building tolerance gradually rather than maxing hang time.",
    cues: [
      "Keep shoulders actively pulled down away from ears the entire time — never let them relax/shrug up into the hang.",
      "Start with feet close to the ground so you control how much bodyweight the shoulder actually takes.",
      "If you feel any pinching, clicking, or looseness (different from normal grip fatigue), stop — that's a joint signal, not a strength limit.",
    ],
  },
  {
    match: /overhead press/i,
    title: "Overhead press",
    cues: [
      "Press in a slightly forward arc rather than straight up if straight-up ever feels unstable at the top — avoid locking the elbow out hard.",
      "Shoulder hypermobility guidance generally recommends building foundational shoulder-blade control and body awareness before loading overhead presses heavily — lighter weight, more control, is the right trade here.",
    ],
  },
  {
    match: /squat/i,
    title: "Squat",
    cues: [
      "Priority for hypermobile hips/knees is stability, not depth — don't chase extra range of motion just because the joint allows it.",
      "Drive attention into the deeper stabilizing muscles (glutes, deep hip rotators) rather than letting the joint itself hold the position passively.",
      "A stable, non-give surface under your heels (like your squat wedges) matters more for hypermobile joints than for average mobility — it removes one variable the joint would otherwise have to compensate for.",
    ],
  },
  {
    match: /deadlift|rdl|romanian/i,
    title: "Hinge (deadlift / RDL)",
    cues: [
      "Keep a soft, slightly bent knee throughout — never lock the knee out at the top.",
      "Move slowly through the bottom range particularly — hypermobile joints are often least stable at end-range, so control matters most exactly there.",
    ],
  },
  {
    match: /push-?up/i,
    title: "Push-up",
    cues: [
      "Stop just short of full elbow lockout at the top of every rep — this is one of the most consistent joint-protection cues across hypermobility guidance.",
      "An incline (hands elevated) reduces load on the shoulder and elbow versus a full floor push-up — a legitimate progression step, not a lesser version.",
    ],
  },
  {
    match: /row|pull/i,
    title: "Row / pulling",
    cues: [
      "Lead with the shoulder blade (squeeze it back/down) before the arm does the pulling — this keeps the load in the muscle rather than the joint capsule.",
      "Avoid yanking with momentum — a slower, controlled pull is more protective for a hypermobile shoulder than a fast one at the same weight.",
    ],
  },
  {
    match: /lunge|split squat/i,
    title: "Lunge / split squat",
    cues: [
      "Limit how far forward the front knee travels — less forward knee travel means less end-range stress on a hypermobile knee.",
      "A reverse-stepping pattern (stepping back instead of forward) is generally easier to balance and control for hypermobile knees than a forward walking lunge.",
    ],
  },
  {
    match: /glute bridge|hip thrust/i,
    title: "Glute bridge / hip thrust",
    cues: [
      "If you don't feel it in the glutes, that's a common hypermobility pattern (the joint moves, but a stabilizer isn't firing) — a band above the knees to push out against, plus a hard pause at the top, usually helps recruit the right muscle.",
    ],
  },
  {
    match: /plank/i,
    title: "Plank",
    cues: ["Keep elbows soft, not locked, if on a straight-arm variation — avoid resting weight passively into a hyperextended elbow."],
  },
];

function findExerciseCues(label) {
  return EXERCISE_LIBRARY.find((e) => e.match.test(label)) || null;
}

const state = {
  program: null,
  categories: [],
  tasks: [],
  completionsToday: new Set(),
  setLogsToday: [],
  activeDates: [],
  xpEvents: 0,
  date: todayStr(),
  activeCategoryId: null,
  expandedTaskId: null,
  buildInfo: null,
};

const app = document.getElementById("app");

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function levelFromXp(xp) {
  let level = 1;
  for (let i = 0; i < LEVELS.length; i++) {
    if (xp >= LEVELS[i]) level = i + 1;
  }
  return level;
}

function xpForLevel(level) {
  return LEVELS[level - 1] ?? LEVELS[LEVELS.length - 1];
}

function computeStreak() {
  const dates = new Set(state.activeDates);
  let streak = 0;
  let d = new Date(state.date + "T00:00:00");
  while (dates.has(d.toISOString().slice(0, 10))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

async function api(path, options = {}) {
  return fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s == null ? "" : String(s);
  return div.innerHTML;
}

// ---------- PIN screen ----------
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
      if (res.ok) boot();
      else renderPinScreen("ACCESS CODE REJECTED");
      return;
    } else if (entered.length < 6) {
      entered += key;
    }
    renderDots();
  });
}

// ---------- Mascot ----------
// A small bonded lifeform the ship is keeping alive — its posture/glow
// reflects your level. Not a hardcoded image: an inline SVG built per
// level so it changes without new assets.
function mascotSvg(level, pulseDone) {
  const stage = Math.min(5, Math.max(1, Math.ceil(level / 3)));
  const glow = ["#3a4a52", "#4fd1c5", "#4fd1c5", "#7ee8de", "#b6fff5"][stage - 1];
  const eyeCount = Math.min(3, Math.ceil(stage / 2));
  const antenna = stage >= 3;
  const wings = stage >= 4;
  const crown = stage >= 5;
  const bodyHeight = 34 + stage * 4;

  const eyes = Array.from({ length: eyeCount })
    .map((_, i) => {
      const cx = 50 + (i - (eyeCount - 1) / 2) * 12;
      return `<circle cx="${cx}" cy="52" r="3.2" fill="#05070a" /><circle cx="${cx}" cy="51" r="1" fill="${glow}" />`;
    })
    .join("");

  return `
    <svg viewBox="0 0 100 100" width="120" height="120" class="mascot-svg ${pulseDone ? "pulse" : ""}" role="img" aria-label="Specimen status, level ${level}">
      ${antenna ? `<line x1="50" y1="${60 - bodyHeight / 2}" x2="50" y2="${60 - bodyHeight / 2 - 10}" stroke="${glow}" stroke-width="1.5"/><circle cx="50" cy="${60 - bodyHeight / 2 - 12}" r="3" fill="${glow}"/>` : ""}
      ${wings ? `<ellipse cx="26" cy="58" rx="10" ry="16" fill="${glow}" opacity="0.35" transform="rotate(-20 26 58)"/><ellipse cx="74" cy="58" rx="10" ry="16" fill="${glow}" opacity="0.35" transform="rotate(20 74 58)"/>` : ""}
      <ellipse cx="50" cy="60" rx="26" ry="${bodyHeight / 2}" fill="#0c1016" stroke="${glow}" stroke-width="2"/>
      <ellipse cx="50" cy="60" rx="26" ry="${bodyHeight / 2}" fill="${glow}" opacity="0.08"/>
      ${eyes}
      ${crown ? `<path d="M38 ${60 - bodyHeight / 2} L42 ${60 - bodyHeight / 2 - 8} L50 ${60 - bodyHeight / 2} L58 ${60 - bodyHeight / 2 - 8} L62 ${60 - bodyHeight / 2}" fill="none" stroke="${glow}" stroke-width="2"/>` : ""}
    </svg>
  `;
}

const MASCOT_LINES = [
  "Vitals nominal. Barely.",
  "Specimen shows early stabilization.",
  "Bioreadings trending upward.",
  "Specimen is adapting well to the routine.",
  "Strong signal. Whatever you're doing, continue it.",
];

// ---------- Category rendering ----------
function groupTasksByDay(tasks) {
  const groups = new Map();
  for (const t of tasks) {
    const key = t.day_key || "DAILY";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  return groups;
}

function renderChecklistTask(task) {
  const checked = state.completionsToday.has(task.id);
  const expanded = state.expandedTaskId === task.id;
  const recipe = task.meta && task.meta.recipe;
  return `
    <div class="task-row" data-task-id="${task.id}">
      <div class="task-check ${checked ? "checked" : ""}" data-action="toggle" data-task-id="${task.id}">${checked ? "✓" : ""}</div>
      <div class="task-body" data-action="expand" data-task-id="${task.id}">
        <div class="task-label ${checked ? "checked" : ""}">${escapeHtml(task.label)}</div>
        ${task.detail ? `<div class="task-detail">${escapeHtml(task.detail)}</div>` : ""}
      </div>
    </div>
    ${expanded ? renderRecipeExpand(recipe) : ""}
  `;
}

function renderRecipeExpand(recipe) {
  if (!recipe) return `<div class="expand-panel"><div class="reference-note">No recipe on file for this one.</div></div>`;
  return `
    <div class="expand-panel">
      <div class="expand-title">${escapeHtml(recipe.title)}</div>
      ${recipe.ingredients && recipe.ingredients.length ? `
        <div class="expand-subhead">Ingredients</div>
        <ul class="expand-list">${recipe.ingredients.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>
      ` : ""}
      ${recipe.steps && recipe.steps.length ? `
        <div class="expand-subhead">Steps</div>
        <ol class="expand-list">${recipe.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ol>
      ` : ""}
    </div>
  `;
}

function renderSetsTask(task) {
  const logs = state.setLogsToday.filter((l) => l.task_id === task.id);
  const done = logs.length > 0;
  const expanded = state.expandedTaskId === task.id;
  const target = task.meta && task.meta.targetText;
  const cues = findExerciseCues(task.label);

  return `
    <div class="task-row" data-task-id="${task.id}">
      <div class="task-check ${done ? "checked" : ""}">${done ? logs.length : ""}</div>
      <div class="task-body" data-action="expand" data-task-id="${task.id}">
        <div class="task-label ${done ? "checked" : ""}">${escapeHtml(task.label)}</div>
        <div class="task-detail">${target ? escapeHtml(target) + (task.detail ? " — " : "") : ""}${task.detail ? escapeHtml(task.detail) : ""}</div>
      </div>
    </div>
    ${expanded ? renderSetsExpand(task, logs, cues) : ""}
  `;
}

function renderSetsExpand(task, logs, cues) {
  return `
    <div class="expand-panel">
      ${cues ? `
        <div class="expand-title">${escapeHtml(cues.title)} — reference</div>
        ${cues.caution ? `<div class="caution-note">${escapeHtml(cues.caution)}</div>` : ""}
        <ul class="expand-list">${cues.cues.map((c) => `<li>${escapeHtml(c)}</li>`).join("")}</ul>
      ` : ""}
      <div class="expand-subhead">Logged sets — ${escapeHtml(state.date)}</div>
      <div class="set-list">
        ${logs.length === 0 ? `<div class="reference-note">No sets logged yet.</div>` : logs.map((l) => `
          <div class="set-row">
            <span>Set ${l.set_number}</span>
            <span>${l.weight ? escapeHtml(l.weight) : "—"}</span>
            <span>${l.reps ? escapeHtml(l.reps) : "—"} reps</span>
            <button data-action="unlog-set" data-log-id="${l.id}">✕</button>
          </div>
        `).join("")}
      </div>
      <form class="set-form" data-action="log-set-form" data-task-id="${task.id}">
        <input type="text" inputmode="decimal" placeholder="weight" name="weight" />
        <input type="text" inputmode="numeric" placeholder="reps" name="reps" />
        <button type="submit">+ Add Set</button>
      </form>
    </div>
  `;
}

function renderCategoryView(category) {
  const tasks = state.tasks.filter((t) => t.category_id === category.id);
  const groups = groupTasksByDay(tasks);
  const renderTask = category.kind === "sets" ? renderSetsTask : renderChecklistTask;

  let html = renderDatePicker();
  for (const [dayKey, dayTasks] of groups) {
    html += `<div class="day-group">`;
    if (groups.size > 1) html += `<h3>${escapeHtml(dayKey)}</h3>`;
    html += dayTasks.map(renderTask).join("");
    html += `</div>`;
  }
  return html || renderDatePicker() + `<div class="reference-note">No entries logged for this system yet.</div>`;
}

function renderDatePicker() {
  return `
    <div class="date-bar">
      <button data-action="date-shift" data-delta="-1">‹</button>
      <input type="date" id="dateInput" value="${state.date}" max="${todayStr()}" />
      <button data-action="date-shift" data-delta="1" ${state.date >= todayStr() ? "disabled" : ""}>›</button>
    </div>
  `;
}

function renderHome() {
  const totalXp = state.xpEvents * XP_PER_EVENT;
  const level = levelFromXp(totalXp);
  const streak = computeStreak();
  const todayTotal = state.tasks.length;
  const todayDoneCount =
    state.completionsToday.size + new Set(state.setLogsToday.map((l) => l.task_id)).size;
  const thisLevelFloor = xpForLevel(level);
  const nextLevelXp = xpForLevel(level + 1);
  const pct = nextLevelXp > thisLevelFloor
    ? Math.min(100, Math.round(((totalXp - thisLevelFloor) / (nextLevelXp - thisLevelFloor)) * 100))
    : 100;

  return `
    <div class="mascot-panel">
      ${mascotSvg(level)}
      <div class="mascot-line">${escapeHtml(MASCOT_LINES[Math.min(MASCOT_LINES.length - 1, Math.ceil(level / 3) - 1)] || MASCOT_LINES[0])}</div>
      <div class="xp-bar"><div class="xp-fill" style="width:${pct}%"></div></div>
      <div class="xp-label">LEVEL ${level} — ${totalXp} XP ${nextLevelXp ? `(${nextLevelXp - totalXp} to next)` : ""}</div>
    </div>
    <div class="reference-note">
      SHIP: ${escapeHtml(state.program.name)}<br/>
      REGISTER: ${escapeHtml(state.program.theme_concept)}
    </div>
    <div class="stat-row">
      <div class="stat-chip">STREAK<strong>${streak}d</strong></div>
      <div class="stat-chip">TODAY<strong>${todayDoneCount}/${state.categories.length ? todayTotal : 0}</strong></div>
    </div>
    <div class="day-group">
      <h3>Systems</h3>
      ${state.categories
        .map((c) => {
          const catTasks = state.tasks.filter((t) => t.category_id === c.id);
          const done = c.kind === "sets"
            ? new Set(state.setLogsToday.filter((l) => catTasks.some((t) => t.id === l.task_id)).map((l) => l.task_id)).size
            : catTasks.filter((t) => state.completionsToday.has(t.id)).length;
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

function formatBuildInfo() {
  if (!state.buildInfo) return "";
  const d = new Date(state.buildInfo.builtAt);
  const stamp = isNaN(d) ? state.buildInfo.builtAt : d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  return `v${escapeHtml(state.buildInfo.commit)} · updated ${escapeHtml(stamp)}`;
}

async function loadBuildInfo() {
  try {
    const res = await fetch("/version.json", { cache: "no-store" });
    if (res.ok) state.buildInfo = await res.json();
  } catch {
    // Not fatal — footer just stays blank if this fails.
  }
}

function render() {
  const tabs = [{ id: "home", label: "OVERVIEW" }, ...state.categories.map((c) => ({ id: c.id, label: c.label }))];
  const active = state.activeCategoryId || "home";
  const activeCategory = state.categories.find((c) => c.id === active);

  app.innerHTML = `
    <header class="topbar">
      <div class="ship-line">MERIDIAN // OPS</div>
      <div class="program-name">${escapeHtml(state.program.name)}</div>
    </header>
    <main id="main"></main>
    <div class="bottom-bar">
      <div class="build-footer">
        <span>${formatBuildInfo()}</span>
        <button type="button" id="forceRefreshBtn" title="Force refresh — pulls the latest deployed version">⟳ REFRESH</button>
      </div>
      <nav class="tabbar">
        ${tabs.map((t) => `<button data-tab="${t.id}" class="${t.id === active ? "active" : ""}">${escapeHtml(t.label)}</button>`).join("")}
      </nav>
    </div>
  `;

  const refreshBtn = document.getElementById("forceRefreshBtn");
  if (refreshBtn) refreshBtn.addEventListener("click", forceRefresh);

  document.getElementById("main").innerHTML =
    active === "home" || !activeCategory ? renderHome() : renderCategoryView(activeCategory);

  document.querySelectorAll("nav.tabbar button").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.activeCategoryId = btn.dataset.tab;
      state.expandedTaskId = null;
      render();
    });
  });

  document.querySelectorAll("[data-goto]").forEach((el) => {
    el.addEventListener("click", () => {
      state.activeCategoryId = el.dataset.goto;
      render();
    });
  });

  document.querySelectorAll('[data-action="toggle"]').forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleTask(el.dataset.taskId);
    });
  });

  document.querySelectorAll('[data-action="expand"]').forEach((el) => {
    el.addEventListener("click", () => {
      state.expandedTaskId = state.expandedTaskId === el.dataset.taskId ? null : el.dataset.taskId;
      render();
    });
  });

  document.querySelectorAll('[data-action="unlog-set"]').forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      unlogSet(el.dataset.logId);
    });
  });

  document.querySelectorAll('[data-action="log-set-form"]').forEach((form) => {
    form.addEventListener("click", (e) => e.stopPropagation());
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const weight = form.weight.value.trim();
      const reps = form.reps.value.trim();
      logSet(form.dataset.taskId, weight, reps);
    });
  });

  const dateInput = document.getElementById("dateInput");
  if (dateInput) {
    dateInput.addEventListener("click", (e) => e.stopPropagation());
    dateInput.addEventListener("change", () => setDate(dateInput.value));
  }
  document.querySelectorAll('[data-action="date-shift"]').forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const d = new Date(state.date + "T00:00:00");
      d.setDate(d.getDate() + Number(btn.dataset.delta));
      setDate(d.toISOString().slice(0, 10));
    });
  });
}

function setDate(newDate) {
  if (newDate > todayStr()) return;
  state.date = newDate;
  state.expandedTaskId = null;
  loadDay();
}

async function toggleTask(taskId) {
  const wasChecked = state.completionsToday.has(taskId);
  const nowChecked = !wasChecked;
  if (nowChecked) {
    state.completionsToday.add(taskId);
    if (!state.activeDates.includes(state.date)) state.activeDates.push(state.date);
    state.xpEvents += 1;
  } else {
    state.completionsToday.delete(taskId);
    state.xpEvents = Math.max(0, state.xpEvents - 1);
  }
  render();
  await api("/api/toggle", {
    method: "POST",
    body: JSON.stringify({ taskId, date: state.date, completed: nowChecked }),
  });
}

async function logSet(taskId, weight, reps) {
  const res = await api("/api/log-set", {
    method: "POST",
    body: JSON.stringify({ taskId, date: state.date, weight, reps }),
  });
  const data = await res.json();
  state.setLogsToday.push({
    id: data.setNumber ? `pending-${Date.now()}` : undefined,
    task_id: taskId,
    date: state.date,
    set_number: data.setNumber,
    weight,
    reps,
  });
  if (!state.activeDates.includes(state.date)) state.activeDates.push(state.date);
  state.xpEvents += 1;
  await loadDay(true);
}

async function unlogSet(logId) {
  await api("/api/unlog-set", { method: "POST", body: JSON.stringify({ logId }) });
  await loadDay(true);
}

async function loadDay(keepExpanded) {
  const res = await api(`/api/day?date=${state.date}`);
  if (res.status === 401) {
    renderPinScreen();
    return;
  }
  const data = await res.json();
  state.program = data.program;
  state.categories = data.categories;
  state.tasks = data.tasks;
  state.completionsToday = new Set(data.completionsToday);
  state.setLogsToday = data.setLogsToday;
  state.activeDates = data.activeDates;
  state.xpEvents = data.xpEvents;
  if (!keepExpanded) state.expandedTaskId = null;
  render();
}

// Hard-reloads the page from the network, bypassing any cached copy —
// iOS home-screen PWAs have no visible reload control and can otherwise
// sit on a stale version indefinitely. A fresh query string guarantees
// the browser treats this as a new document rather than reusing cache.
function forceRefresh() {
  const url = new URL(location.href);
  url.searchParams.set("_r", Date.now().toString());
  location.href = url.toString();
}

function boot() {
  loadDay();
  loadBuildInfo().then(() => {
    const el = document.querySelector(".build-footer span");
    if (el) el.textContent = formatBuildInfo();
  });
}

boot();
