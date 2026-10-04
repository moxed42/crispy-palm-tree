// SetLog — frontend. Program-generic: tabs/categories render from whatever
// the active program's data says, nothing here is hardcoded to one program.

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
    match: /overhead press|shoulder press/i,
    title: "Overhead / shoulder press",
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
      "Soft knee at the top of every rep — no locking out.",
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
    match: /push-?up|bench press|floor press/i,
    title: "Press (bench / floor / push-up)",
    cues: [
      "Stop just short of full elbow lockout at the top of every rep — this is one of the most consistent joint-protection cues across hypermobility guidance.",
      "An incline or floor press reduces range and shoulder load versus a full bench press — a legitimate progression step, not a lesser version.",
    ],
  },
  {
    match: /row|pulldown|pull-?up/i,
    title: "Row / pulling",
    cues: [
      "Lead with the shoulder blade (squeeze it back/down) before the arm does the pulling — this keeps the load in the muscle rather than the joint capsule.",
      "Avoid yanking with momentum — a slower, controlled pull is more protective for a hypermobile shoulder than a fast one at the same weight.",
    ],
  },
  {
    match: /split squat|lunge/i,
    title: "Split squat / lunge",
    cues: [
      "Limit how far forward the front knee travels — less forward knee travel means less end-range stress on a hypermobile knee.",
      "Soft knee at the bottom and top — never lock it out standing up.",
    ],
  },
  {
    match: /face pull/i,
    title: "Face pulls",
    cues: [
      "Pull to the face, elbows high — this trains the rear delts/rotator cuff that keep a hypermobile shoulder centered in the socket.",
    ],
  },
  {
    match: /plank|deadbug/i,
    title: "Core stability",
    cues: ["Keep elbows/knees soft, not locked, on any straight-limb variation — avoid resting weight passively into a hyperextended joint."],
  },
  {
    match: /wrist roller/i,
    title: "Wrist roller",
    caution:
      "Given a wrist/shoulder history, this is a spot where more load doesn't mean more benefit — a wrist roller puts continuous end-range tension through the wrist, which is exactly where a hypermobile joint is least stable.",
    cues: [
      "Start with a light load and slow, controlled rotations in both directions — this is a mobility/control drill, not a strength max-out.",
      "Stop immediately on any pinching, clicking, or sharp pain — normal forearm fatigue is fine, joint pain is not.",
      "Keep elbows slightly bent and close to the body rather than locked out and away — reduces leverage stress on the wrist.",
    ],
  },
  {
    match: /balance board/i,
    title: "Balance board / ankle work",
    cues: [
      "Priority is stability and control, not how long you can wobble — the same hypermobility principle as squats: don't chase extra range, build the stabilizers that hold the joint still.",
      "On the directional tilts, move slowly and stop the tilt under control before it maxes out — the goal is controlling the ankle through the motion, not seeing how far it goes.",
      "Stand near a wall or sturdy surface you can touch for support, especially early on — there's no benefit to falling off to prove balance.",
      "Keep a soft knee and stack hip-knee-ankle rather than letting the knee cave in — that alignment matters more on an unstable surface than a stable one.",
    ],
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
  date: todayStr(),
  activeCategoryId: null,
  selectedDayKey: null, // null = date-driven ("Auto"); a specific day_key pins the view regardless of date
  expandedTaskId: null,
  collapsedGroups: new Set(),
  buildInfo: null,
};

const app = document.getElementById("app");

function todayStr() {
  return new Date().toISOString().slice(0, 10);
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
      <div class="pin-title">SetLog<span class="designation">Enter your access code</span></div>
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
      else renderPinScreen("Access code rejected");
      return;
    } else if (entered.length < 6) {
      entered += key;
    }
    renderDots();
  });
}

// ---------- Category rendering ----------
const WEEKDAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// day_key holds a full descriptive heading for training — either a real
// calendar date ("Day 1 (2026-09-28 Mon) — Upper A", current format) or,
// for older/other programs still on the recurring weekday template
// ("Day 1 (Monday) — Upper A"), a weekday name. Match on the embedded ISO
// date when present; fall back to weekday-name matching otherwise so a
// program like week1/ (kept inactive as a reference example) still works.
function taskMatchesDate(task, dateStr) {
  if (!task.day_key) return true;
  const isoMatch = task.day_key.match(/\d{4}-\d{2}-\d{2}/);
  if (isoMatch) return isoMatch[0] === dateStr;
  const d = new Date(dateStr + "T00:00:00");
  const abbr = WEEKDAY_ABBR[d.getDay()];
  const full = WEEKDAY_FULL[d.getDay()];
  return task.day_key.includes(abbr) || task.day_key.includes(full);
}

function tasksForCategoryOnDate(categoryId, dateStr) {
  return state.tasks.filter((t) => t.category_id === categoryId && taskMatchesDate(t, dateStr));
}

// Distinct day_keys for a category, in program order (dedup, excludes the
// null/recurring group) — used to build the "jump to a workout regardless
// of date" picker.
function dayKeysForCategory(categoryId) {
  const seen = [];
  for (const t of state.tasks) {
    if (t.category_id === categoryId && t.day_key && !seen.includes(t.day_key)) seen.push(t.day_key);
  }
  return seen;
}

// day_key is a full heading like "Day 1 (2026-09-28 Mon) — Upper A" — the
// picker needs the short "Upper A" part after the dash, prefixed with a
// compact date when one's embedded (a month of dated pages reuses "Upper A"
// several times, so the date is what actually distinguishes the chips).
function shortDayLabel(dayKey) {
  const parts = dayKey.split("—");
  const typeLabel = (parts.length > 1 ? parts[1] : dayKey).trim();
  const isoMatch = dayKey.match(/\d{4}-\d{2}-\d{2}/);
  if (!isoMatch) return typeLabel;
  const d = new Date(isoMatch[0] + "T00:00:00");
  const shortDate = `${WEEKDAY_ABBR[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`;
  return `${shortDate} · ${typeLabel}`;
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

function renderChecklistTask(task) {
  const checked = state.completionsToday.has(task.id);
  return `
    <div class="exercise-card ${checked ? "is-done" : ""}" data-task-id="${task.id}">
      <div class="exercise-main">
        <div class="exercise-info" data-action="toggle" data-task-id="${task.id}">
          <div class="exercise-name">${escapeHtml(task.label)}</div>
          ${task.detail ? `<div class="exercise-meta"><span class="meta-chip">${escapeHtml(task.detail)}</span></div>` : ""}
        </div>
        <div class="exercise-status" data-action="toggle" data-task-id="${task.id}">
          <span class="set-count ${checked ? "" : "pending"}">${checked ? "Done" : "Mark"}</span>
        </div>
      </div>
    </div>
  `;
}

function renderSetsTask(task) {
  const logs = state.setLogsToday.filter((l) => l.task_id === task.id);
  const done = logs.length > 0;
  const expanded = state.expandedTaskId === task.id;
  const target = task.meta && task.meta.targetText;
  const equipment = task.meta && task.meta.equipment;
  const cues = findExerciseCues(task.label);

  return `
    <div class="exercise-card ${done ? "is-done" : ""}" data-task-id="${task.id}">
      <div class="exercise-main" data-action="expand" data-task-id="${task.id}">
        <div class="exercise-info">
          <div class="exercise-name">${escapeHtml(task.label)}</div>
          <div class="exercise-meta">
            ${target ? `<span class="meta-chip">${escapeHtml(target)}</span>` : ""}
            ${task.detail ? `<span class="meta-chip">${escapeHtml(task.detail)}</span>` : ""}
            ${equipment ? `<span class="meta-chip equipment">${escapeHtml(equipment)}</span>` : ""}
          </div>
        </div>
        <div class="exercise-status">
          <span class="set-count ${done ? "" : "pending"}">${done ? `${logs.length} set${logs.length > 1 ? "s" : ""}` : "—"}</span>
        </div>
      </div>
      ${expanded ? renderSetsExpand(task, logs, cues) : ""}
    </div>
  `;
}

function renderSetsExpand(task, logs, cues) {
  return `
    <div class="expand-panel">
      ${cues ? `
        <div class="expand-title">${escapeHtml(cues.title)} — form cue</div>
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

function renderReferenceBody(detail) {
  if (!detail) return "";
  const parts = detail.split(" · ").map((s) => s.trim()).filter(Boolean);
  if (parts.length <= 1) return `<p>${escapeHtml(detail)}</p>`;
  const [intro, ...rest] = parts;
  return `<p>${escapeHtml(intro)}</p><ul>${rest.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}</ul>`;
}

function renderReferenceTask(task) {
  const expanded = state.expandedTaskId === task.id;
  return `
    <div class="reference-card">
      <button type="button" class="reference-header" data-action="expand" data-task-id="${task.id}">
        <span>${escapeHtml(task.label)}</span>
        <span class="chevron ${expanded ? "" : "collapsed"}">▾</span>
      </button>
      ${expanded ? `<div class="reference-body">${renderReferenceBody(task.detail)}</div>` : ""}
    </div>
  `;
}

// A task's own meta.kind wins over its category's default kind, letting one
// category carry a mixed set of task types without needing a whole separate
// category for it.
function taskKind(task, category) {
  return (task.meta && task.meta.kind) || category.kind;
}

function renderTaskByKind(task, category) {
  const kind = taskKind(task, category);
  if (kind === "sets") return renderSetsTask(task);
  if (kind === "reference") return renderReferenceTask(task);
  return renderChecklistTask(task);
}

function renderCategoryView(category) {
  const dayKeys = category.kind === "sets" ? dayKeysForCategory(category.id) : [];
  const tasks = state.selectedDayKey
    ? state.tasks.filter((t) => t.category_id === category.id && t.day_key === state.selectedDayKey)
    : tasksForCategoryOnDate(category.id, state.date);
  const groups = groupTasksByDay(tasks);
  const showDateBar = category.kind !== "reference";

  let html = dayKeys.length > 1 ? renderDaySelector(dayKeys) : "";
  html += showDateBar ? renderDatePicker() : "";
  for (const [dayKey, dayTasks] of groups) {
    const groupKey = `${category.id}:${dayKey}`;
    const collapsed = state.collapsedGroups.has(groupKey);
    html += `<div class="day-group">`;
    if (groups.size > 1) {
      const isDaily = dayKey === "DAILY";
      html += `
        <button type="button" class="day-group-header" data-action="toggle-group" data-group-key="${escapeHtml(groupKey)}">
          <span class="chevron ${collapsed ? "collapsed" : ""}">▾</span>
          <span>${escapeHtml(dayKey)}${isDaily ? ' <span class="day-group-hint">— always shown</span>' : ""}</span>
        </button>
      `;
    }
    if (!collapsed) html += dayTasks.map((t) => renderTaskByKind(t, category)).join("");
    html += `</div>`;
  }
  if (groups.size === 0) html += `<div class="reference-note">Nothing scheduled here for this date.</div>`;
  return html;
}

// A dropdown rather than a chip row — a program with a month/season's worth
// of dated day_keys (e.g. 25 chin-up sessions) turns a chip grid into an
// unreadable wall of buttons, and a <select> scales to any count the same way.
function renderDaySelector(dayKeys) {
  const options = [{ key: "", label: "Auto (today's date)" }, ...dayKeys.map((k) => ({ key: k, label: shortDayLabel(k) }))];
  return `
    <div class="day-selector">
      <select class="day-select" data-action="select-day">
        ${options
          .map(
            (o) => `<option value="${escapeHtml(o.key)}" ${(state.selectedDayKey || "") === o.key ? "selected" : ""}>${escapeHtml(o.label)}</option>`
          )
          .join("")}
      </select>
    </div>
  `;
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
  const streak = computeStreak();
  const trainingCategories = state.categories.filter((c) => c.kind === "sets");
  const todayTrainingTasks = trainingCategories.flatMap((c) => tasksForCategoryOnDate(c.id, state.date));
  const loggedTaskIds = new Set(state.setLogsToday.map((l) => l.task_id));
  const todayLoggedCount = todayTrainingTasks.filter((t) => loggedTaskIds.has(t.id)).length;
  const todayTotal = todayTrainingTasks.length;
  const pct = todayTotal ? Math.round((todayLoggedCount / todayTotal) * 100) : 0;
  const isToday = state.date === todayStr();

  const dayLabel = todayTrainingTasks.length
    ? [...new Set(todayTrainingTasks.map((t) => t.day_key))][0]
    : null;

  return `
    <div class="home-hero">
      <div class="home-date">${isToday ? "Today" : escapeHtml(state.date)}</div>
      <div class="home-subline">${dayLabel ? escapeHtml(dayLabel) : "No workout scheduled for this date"}</div>
      ${todayTotal ? `
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        <div class="home-subline">${todayLoggedCount}/${todayTotal} exercises logged</div>
      ` : ""}
    </div>
    <div class="stat-row">
      <div class="stat-chip">Streak<strong class="accent">${streak}d</strong></div>
      <div class="stat-chip">Program<strong>${escapeHtml(state.program.name.replace(/^\d+-Day\s*/, ""))}</strong></div>
    </div>
    <div class="section-heading">Sections</div>
    <div class="category-list">
      ${state.categories
        .map((c) => {
          const catTasks = tasksForCategoryOnDate(c.id, state.date);
          if (c.kind === "reference") {
            return `<div class="category-card" data-goto="${c.id}">
              <div>
                <div class="cat-label">${escapeHtml(c.label)}</div>
                <div class="cat-sub">${catTasks.length} reference topic${catTasks.length === 1 ? "" : "s"}</div>
              </div>
              <div class="cat-count">›</div>
            </div>`;
          }
          const setsTaskIds = new Set(catTasks.filter((t) => taskKind(t, c) === "sets").map((t) => t.id));
          const loggedSetsDone = new Set(
            state.setLogsToday.filter((l) => setsTaskIds.has(l.task_id)).map((l) => l.task_id)
          ).size;
          const checkboxDone = catTasks.filter(
            (t) => taskKind(t, c) !== "sets" && state.completionsToday.has(t.id)
          ).length;
          const done = loggedSetsDone + checkboxDone;
          return `<div class="category-card" data-goto="${c.id}">
            <div>
              <div class="cat-label">${escapeHtml(c.label)}</div>
              <div class="cat-sub">${catTasks.length ? `${done}/${catTasks.length} logged today` : "Nothing scheduled today"}</div>
            </div>
            <div class="cat-count ${done && done === catTasks.length ? "accent" : ""}">${catTasks.length ? `${done}/${catTasks.length}` : ""}</div>
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
  const tabs = [{ id: "home", label: "Today" }, ...state.categories.map((c) => ({ id: c.id, label: c.label }))];
  const active = state.activeCategoryId || "home";
  const activeCategory = state.categories.find((c) => c.id === active);

  app.innerHTML = `
    <header class="topbar">
      <div class="brand-line">SetLog</div>
      <div class="program-name">${escapeHtml(state.program.name)}</div>
    </header>
    <main id="main"></main>
    <div class="bottom-bar">
      <div class="build-footer">
        <span>${formatBuildInfo()}</span>
        <button type="button" id="forceRefreshBtn" title="Force refresh — pulls the latest deployed version">⟳ Refresh</button>
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
      state.selectedDayKey = null;
      render();
    });
  });

  document.querySelectorAll("[data-goto]").forEach((el) => {
    el.addEventListener("click", () => {
      state.activeCategoryId = el.dataset.goto;
      state.selectedDayKey = null;
      render();
    });
  });

  document.querySelectorAll('[data-action="select-day"]').forEach((el) => {
    el.addEventListener("change", () => {
      state.selectedDayKey = el.value || null;
      state.expandedTaskId = null;
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

  document.querySelectorAll('[data-action="toggle-group"]').forEach((el) => {
    el.addEventListener("click", () => {
      const key = el.dataset.groupKey;
      if (state.collapsedGroups.has(key)) state.collapsedGroups.delete(key);
      else state.collapsedGroups.add(key);
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
  } else {
    state.completionsToday.delete(taskId);
  }
  render();
  await api("/api/toggle", {
    method: "POST",
    body: JSON.stringify({ taskId, date: state.date, completed: nowChecked }),
  });
}

async function logSet(taskId, weight, reps) {
  await api("/api/log-set", {
    method: "POST",
    body: JSON.stringify({ taskId, date: state.date, weight, reps }),
  });
  if (!state.activeDates.includes(state.date)) state.activeDates.push(state.date);
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
