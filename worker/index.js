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

async function requireSession(request, env) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return false;
  const row = await env.DB.prepare(
    "SELECT expires_at FROM sessions WHERE token = ?"
  )
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
  await env.DB.prepare(
    "INSERT INTO sessions (token, created_at, expires_at) VALUES (?, ?, ?)"
  )
    .bind(token, now.toISOString(), expires.toISOString())
    .run();

  const cookie = `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}`;
  return json({ ok: true }, { headers: { "Set-Cookie": cookie } });
}

async function handleGetProgram(request, env) {
  const program = await env.DB.prepare(
    "SELECT * FROM programs WHERE active = 1 LIMIT 1"
  ).first();
  if (!program) return json({ error: "No active program." }, { status: 404 });

  const categories = await env.DB.prepare(
    "SELECT * FROM categories WHERE program_id = ? ORDER BY sort_order"
  )
    .bind(program.id)
    .all();

  const tasks = await env.DB.prepare(
    `SELECT t.* FROM tasks t
     JOIN categories c ON t.category_id = c.id
     WHERE c.program_id = ?
     ORDER BY t.sort_order`
  )
    .bind(program.id)
    .all();

  const today = new Date().toISOString().slice(0, 10);
  const completions = await env.DB.prepare(
    `SELECT task_id, date FROM completions
     WHERE date = ? AND task_id IN (
       SELECT t.id FROM tasks t JOIN categories c ON t.category_id = c.id WHERE c.program_id = ?
     )`
  )
    .bind(today, program.id)
    .all();

  const allCompletions = await env.DB.prepare(
    `SELECT task_id, date FROM completions
     WHERE task_id IN (
       SELECT t.id FROM tasks t JOIN categories c ON t.category_id = c.id WHERE c.program_id = ?
     )`
  )
    .bind(program.id)
    .all();

  return json({
    program,
    categories: categories.results,
    tasks: tasks.results,
    completionsToday: completions.results.map((r) => r.task_id),
    allCompletions: allCompletions.results,
    today,
  });
}

async function handleToggle(request, env) {
  const body = await request.json().catch(() => ({}));
  const { taskId, date, completed } = body;
  if (!taskId || !date) {
    return json({ error: "taskId and date required." }, { status: 400 });
  }
  if (completed) {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO completions (task_id, date, completed_at) VALUES (?, ?, ?)"
    )
      .bind(taskId, date, new Date().toISOString())
      .run();
  } else {
    await env.DB.prepare(
      "DELETE FROM completions WHERE task_id = ? AND date = ?"
    )
      .bind(taskId, date)
      .run();
  }
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

      if (url.pathname === "/api/program" && request.method === "GET") {
        return handleGetProgram(request, env);
      }
      if (url.pathname === "/api/toggle" && request.method === "POST") {
        return handleToggle(request, env);
      }
      return json({ error: "Not found" }, { status: 404 });
    }

    // Everything else (the app shell, styles, manifest, etc.) is served
    // from the assets binding — same origin as /api/*, so the session
    // cookie is always first-party.
    return env.ASSETS.fetch(request);
  },
};
