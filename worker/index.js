// MERIDIAN // OPS — Worker: PIN auth + progress API backed by D1.
// Secrets: PIN (numeric access code) must be set with `wrangler secret put PIN`.

const SESSION_COOKIE = "meridian_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
  });
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function getCookie(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? match[1] : null;
}

function isValidDate(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

async function requireSession(request, env) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return false;
  const row = await env.DB.prepare("SELECT expires_at FROM sessions WHERE token = ?")
    .bind(token)
    .first();
  if (!row) return false;
  return new Date(row.expires_at) > new Date();
}

async function handleLogin(request, env) {
  const body = await request.json().catch(() => ({}));
  const pin = String(body.pin || "");
  if (!env.PIN || pin !== env.PIN) {
    return json({ ok: false, error: "Access code rejected." }, { status: 401 });
  }
  const token = randomToken();
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);
  await env.DB.prepare("INSERT INTO sessions (token, created_at, expires_at) VALUES (?, ?, ?)")
    .bind(token, now.toISOString(), expires.toISOString())
    .run();

  const cookie = `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}`;
  return json({ ok: true }, { headers: { "Set-Cookie": cookie } });
}

// Returns the active program's static structure plus one date's worth of
// progress (completions for checkbox tasks, set_logs for sets tasks) and
// aggregate history (all completions + all set_log dates) for streak/XP.
async function handleGetDay(request, env, date) {
  const program = await env.DB.prepare("SELECT * FROM programs WHERE active = 1 LIMIT 1").first();
  if (!program) return json({ error: "No active program." }, { status: 404 });

  const categories = await env.DB.prepare(
    "SELECT * FROM categories WHERE program_id = ? ORDER BY sort_order"
  )
    .bind(program.id)
    .all();

  const tasks = await env.DB.prepare(
    `SELECT t.* FROM tasks t JOIN categories c ON t.category_id = c.id WHERE c.program_id = ? ORDER BY t.sort_order`
  )
    .bind(program.id)
    .all();

  const completionsToday = await env.DB.prepare(
    `SELECT task_id FROM completions WHERE date = ? AND task_id IN (
       SELECT t.id FROM tasks t JOIN categories c ON t.category_id = c.id WHERE c.program_id = ?
     )`
  )
    .bind(date, program.id)
    .all();

  const setLogsToday = await env.DB.prepare(
    `SELECT * FROM set_logs WHERE date = ? AND task_id IN (
       SELECT t.id FROM tasks t JOIN categories c ON t.category_id = c.id WHERE c.program_id = ?
     ) ORDER BY set_number`
  )
    .bind(date, program.id)
    .all();

  // Aggregate history for streak/XP: every date that has at least one
  // completion or set_log, across the whole program.
  const completionDates = await env.DB.prepare(
    `SELECT DISTINCT date FROM completions WHERE task_id IN (
       SELECT t.id FROM tasks t JOIN categories c ON t.category_id = c.id WHERE c.program_id = ?
     )`
  )
    .bind(program.id)
    .all();
  const setLogDates = await env.DB.prepare(
    `SELECT DISTINCT date FROM set_logs WHERE task_id IN (
       SELECT t.id FROM tasks t JOIN categories c ON t.category_id = c.id WHERE c.program_id = ?
     )`
  )
    .bind(program.id)
    .all();
  const totalCompletions = await env.DB.prepare(
    `SELECT COUNT(*) as n FROM completions WHERE task_id IN (
       SELECT t.id FROM tasks t JOIN categories c ON t.category_id = c.id WHERE c.program_id = ?
     )`
  )
    .bind(program.id)
    .first();
  const totalSetLogs = await env.DB.prepare(
    `SELECT COUNT(*) as n FROM set_logs WHERE task_id IN (
       SELECT t.id FROM tasks t JOIN categories c ON t.category_id = c.id WHERE c.program_id = ?
     )`
  )
    .bind(program.id)
    .first();

  const activeDates = new Set([
    ...completionDates.results.map((r) => r.date),
    ...setLogDates.results.map((r) => r.date),
  ]);

  return json({
    program,
    categories: categories.results,
    tasks: tasks.results.map((t) => ({ ...t, meta: t.meta ? JSON.parse(t.meta) : null })),
    date,
    completionsToday: completionsToday.results.map((r) => r.task_id),
    setLogsToday: setLogsToday.results,
    activeDates: Array.from(activeDates),
    xpEvents: (totalCompletions.n || 0) + (totalSetLogs.n || 0),
  });
}

async function handleToggle(request, env) {
  const body = await request.json().catch(() => ({}));
  const { taskId, date, completed } = body;
  if (!taskId || !isValidDate(date)) {
    return json({ error: "taskId and a valid date required." }, { status: 400 });
  }
  if (completed) {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO completions (task_id, date, completed_at) VALUES (?, ?, ?)"
    )
      .bind(taskId, date, new Date().toISOString())
      .run();
  } else {
    await env.DB.prepare("DELETE FROM completions WHERE task_id = ? AND date = ?")
      .bind(taskId, date)
      .run();
  }
  return json({ ok: true });
}

async function handleLogSet(request, env) {
  const body = await request.json().catch(() => ({}));
  const { taskId, date, weight, reps } = body;
  if (!taskId || !isValidDate(date)) {
    return json({ error: "taskId and a valid date required." }, { status: 400 });
  }
  const countRow = await env.DB.prepare(
    "SELECT COUNT(*) as n FROM set_logs WHERE task_id = ? AND date = ?"
  )
    .bind(taskId, date)
    .first();
  const setNumber = (countRow.n || 0) + 1;
  await env.DB.prepare(
    "INSERT INTO set_logs (task_id, date, set_number, weight, reps, logged_at) VALUES (?, ?, ?, ?, ?, ?)"
  )
    .bind(taskId, date, setNumber, weight || null, reps || null, new Date().toISOString())
    .run();
  return json({ ok: true, setNumber });
}

async function handleUnlogSet(request, env) {
  const body = await request.json().catch(() => ({}));
  const { logId } = body;
  if (!logId) return json({ error: "logId required." }, { status: 400 });
  await env.DB.prepare("DELETE FROM set_logs WHERE id = ?").bind(logId).run();
  return json({ ok: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/login" && request.method === "POST") {
      return handleLogin(request, env);
    }

    if (url.pathname.startsWith("/api/")) {
      const authed = await requireSession(request, env);
      if (!authed) return json({ error: "Unauthorized" }, { status: 401 });

      if (url.pathname === "/api/day" && request.method === "GET") {
        const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
        if (!isValidDate(date)) return json({ error: "Invalid date." }, { status: 400 });
        return handleGetDay(request, env, date);
      }
      if (url.pathname === "/api/toggle" && request.method === "POST") {
        return handleToggle(request, env);
      }
      if (url.pathname === "/api/log-set" && request.method === "POST") {
        return handleLogSet(request, env);
      }
      if (url.pathname === "/api/unlog-set" && request.method === "POST") {
        return handleUnlogSet(request, env);
      }
      return json({ error: "Not found" }, { status: 404 });
    }

    // Everything else (the app shell, styles, manifest, etc.) is served
    // from the assets binding — same origin as /api/*, so the session
    // cookie is always first-party.
    return env.ASSETS.fetch(request);
  },
};
