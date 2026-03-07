import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import * as kv from "./kv_store.tsx";
import webpush from "npm:web-push@3.6.7";

const app = new Hono();
const PREFIX = "/make-server-d1909ddd";

app.use("*", logger(console.log));
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "X-User-Token"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  })
);

// Helper: get authenticated user
async function getUser(c: any): Promise<{ id: string; email: string; user_metadata?: Record<string, any> } | null> {
  try {
    // User JWT is sent in X-User-Token to avoid Supabase Edge Function gateway
    // rejecting expired tokens in the Authorization header.
    const token = c.req.header("X-User-Token");
    if (!token) {
      console.log("Auth: No X-User-Token header present");
      return null;
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      console.log("Auth: getUser failed:", error?.message || "no user data");
      return null;
    }
    return { id: data.user.id, email: data.user.email!, user_metadata: data.user.user_metadata };
  } catch (e) {
    console.log("Auth error:", e);
    return null;
  }
}

// Helper: safely stringify errors (avoids empty strings from some error types)
function errorString(e: unknown): string {
  if (e instanceof Error) return e.message || e.name || "Unknown error";
  if (typeof e === "string") return e || "Unknown error";
  try { return JSON.stringify(e); } catch { return String(e) || "Unknown error"; }
}

// Helper: escape HTML entities for safe embedding in email templates
function escHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function uuid() {
  return crypto.randomUUID();
}

/**
 * Fetch ALL values for a KV prefix using paginated queries to avoid the
 * Supabase PostgREST default row-limit (typically 1 000).  Falls back
 * gracefully when the data set is small enough for a single page.
 */
let _globalSupabaseClient: any = null;
function getGlobalSupabaseClient() {
  if (!_globalSupabaseClient) {
    _globalSupabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
  }
  return _globalSupabaseClient;
}

async function getAllByPrefix(prefix: string): Promise<any[]> {
  const PAGE = 1000;
  const supabase = getGlobalSupabaseClient();
  let all: any[] = [];
  let from = 0;
  let retries = 3;
  while (true) {
    const { data, error } = await supabase
      .from("kv_store_d1909ddd")
      .select("value")
      .like("key", prefix + "%")
      .range(from, from + PAGE - 1);
    
    if (error) {
      if (retries > 0 && error.message && error.message.includes("502")) {
        retries--;
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      throw new Error(`getAllByPrefix: ${error.message}`);
    }
    if (!data || data.length === 0) break;
    all = all.concat(data.map((d: any) => d.value));
    if (data.length < PAGE) break;
    from += PAGE;
    retries = 3; // Reset retries on successful page fetch
  }
  return all;
}

// ===== TIMEZONE HELPERS =====
// Convert a local datetime string (e.g. "2026-03-02T09:00:00") in the given IANA timezone to UTC ISO string
function tzToUtc(localDateStr: string, timezone: string): string {
  // Allow "YYYY-MM-DDTHH:mm:ss" or "YYYY-MM-DD HH:mm:ss"
  const match = localDateStr.match(/(\d{4})-?(\d{2})-?(\d{2})[T\s](\d{2}):?(\d{2}):?(\d{2})/);
  if (!match) return localDateStr;
  const [, ys, ms, ds, hs, mins, ss] = match;
  const [y, m, d, h, min, s] = [ys, ms, ds, hs, mins, ss].map(Number);
  
  // Create a UTC date with the components from the input string.
  // This represents "The same clock time, but in UTC".
  const guess = new Date(Date.UTC(y, m - 1, d, h, min, s));
  
  // Format this UTC time in the target timezone to see the "wall clock" difference.
  // e.g. If guess is 12:00 UTC, and target is NY (UTC-5), tzStr will say 07:00.
  const tzStr = guess.toLocaleString("en-US", { timeZone: timezone });
  
  // Format the same UTC time in UTC (just to be safe and consistent with format)
  const utcStr = guess.toLocaleString("en-US", { timeZone: "UTC" });
  
  // Calculate the offset in milliseconds.
  // diff = (Time in Target Zone) - (Time in UTC)
  // e.g. 07:00 - 12:00 = -5 hours.
  const offsetMs = new Date(tzStr).getTime() - new Date(utcStr).getTime();
  
  // We want the UTC timestamp `T` such that `T` in `TargetZone` reads as `InputTime`.
  // InputTime = T + Offset.
  // T = InputTime - Offset.
  // guess.getTime() is numerically equal to InputTime (treated as UTC).
  // So result = guess - offset.
  // e.g. 12:00 - (-5h) = 17:00 UTC.
  // 17:00 UTC is 12:00 NY. Correct.
  return new Date(guess.getTime() - offsetMs).toISOString();
}

// Get local date components in a given timezone from a UTC ISO string
function utcToTzParts(utcIso: string, timezone: string) {
  const d = new Date(utcIso);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false, weekday: "short",
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "0";
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: parseInt(get("year")),
    month: parseInt(get("month")),
    day: parseInt(get("day")),
    hour: parseInt(get("hour")) % 24,
    minute: parseInt(get("minute")),
    dayOfWeek: dayMap[get("weekday")] ?? 0,
  };
}

// Health check
app.get(`${PREFIX}/health`, (c) => c.json({ status: "ok" }));

// ===== AUTH: Signup =====
app.post(`${PREFIX}/auth/signup`, async (c) => {
  try {
    const body = await c.req.json();
    const { email, password, name, timezone: clientTimezone } = body;
    if (!email || !password) {
      return c.json({ error: "Email and password required" }, 400);
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { name: name || "" },
      email_confirm: true,
    });
    if (error) {
      console.log("Signup error:", error);
      return c.json({ error: error.message }, 400);
    }
    // Create user profile in KV — timezone sent from client device
    const timezone = clientTimezone || "UTC";
    const userProfile = {
      id: data.user.id,
      email,
      name: name || "",
      timezone,
      dashboard_layout: {
        order: ["upcoming_events", "tasks", "free_time", "reminders", "days_since"],
        hidden: [],
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await kv.set(`user:${data.user.id}`, userProfile);
    // Create default availability rules
    const defaultRules = {
      id: uuid(),
      user_id: data.user.id,
      work_hours: {
        mon: { start: "09:00", end: "17:00" },
        tue: { start: "09:00", end: "17:00" },
        wed: { start: "09:00", end: "17:00" },
        thu: { start: "09:00", end: "17:00" },
        fri: { start: "09:00", end: "17:00" },
      },
      outside_work_hours: {
        mon: { start: "18:00", end: "22:00" },
        tue: { start: "18:00", end: "22:00" },
        wed: { start: "18:00", end: "22:00" },
        thu: { start: "18:00", end: "22:00" },
        fri: { start: "18:00", end: "22:00" },
        sat: { start: "09:00", end: "22:00" },
        sun: { start: "09:00", end: "22:00" },
      },
      no_booking_hours: [],
      focus_blocks: [],
      meal_hours: [],
      buffer_before_minutes: 0,
      buffer_after_minutes: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await kv.set(`rules:${data.user.id}`, defaultRules);

    // Notify inviters that this friend joined Chrono
    try {
      const allInvites = await getAllByPrefix("invite:");
      const newEmail = email.toLowerCase();
      const displayName = name || newEmail.split("@")[0];
      for (const inv of allInvites) {
        if (inv.email && inv.email.toLowerCase() === newEmail && inv.inviter_id) {
          await createNotification(inv.inviter_id, "friend_joined", `${displayName} joined Chrono!`, { friend_id: data.user.id, friend_name: displayName, friend_email: newEmail });
        }
      }
    } catch (notifErr) { console.log("Friend joined notification error (non-fatal):", notifErr); }

    return c.json({ user: data.user });
  } catch (e) {
    console.log("Signup exception:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// ===== USER: GET /me =====
app.get(`${PREFIX}/me`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    let profile = await kv.get(`user:${user.id}`);
    if (!profile) {
      profile = {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.name || "",
        timezone: "UTC",
        dashboard_layout: {
          order: ["upcoming_events", "tasks", "free_time", "reminders", "days_since"],
          hidden: [],
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await kv.set(`user:${user.id}`, profile);
    }
    // Backfill name from auth metadata for existing profiles missing it
    if (!profile.name && user.user_metadata?.name) {
      profile.name = user.user_metadata.name;
      await kv.set(`user:${user.id}`, profile);
    }
    return c.json(profile);
  } catch (e) {
    console.log("Get me error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// ===== USER: PATCH /me =====
app.patch(`${PREFIX}/me`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const updates = await c.req.json();
    let profile = await kv.get(`user:${user.id}`);
    if (!profile) {
      profile = { id: user.id, email: user.email, name: user.user_metadata?.name || "", timezone: "UTC", dashboard_layout: { order: [], hidden: [] } };
    }
    if (updates.name !== undefined) profile.name = updates.name;
    if (updates.timezone) profile.timezone = updates.timezone;
    if (updates.dashboard_layout) profile.dashboard_layout = updates.dashboard_layout;
    if (updates.outlook_accounts !== undefined) profile.outlook_accounts = updates.outlook_accounts;
    if (updates.gmail_accounts !== undefined) profile.gmail_accounts = updates.gmail_accounts;
    if (updates.news_interests !== undefined) profile.news_interests = updates.news_interests;
    if (updates.business_profile !== undefined) profile.business_profile = updates.business_profile;
    profile.updated_at = new Date().toISOString();
    await kv.set(`user:${user.id}`, profile);
    return c.json(profile);
  } catch (e) {
    console.log("Patch me error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// ===== TASKS =====
app.get(`${PREFIX}/tasks`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const status = c.req.query("status");
    const tasks = await kv.getByPrefix(`task:${user.id}:`);
    const filtered = status ? tasks.filter((t: any) => t.status === status) : tasks;
    filtered.sort((a: any, b: any) => {
      if (a.due_at && b.due_at) return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
      if (a.due_at) return -1;
      if (b.due_at) return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return c.json(filtered);
  } catch (e) {
    console.log("Get tasks error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

app.post(`${PREFIX}/tasks`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const body = await c.req.json();
    const task = {
      id: uuid(),
      user_id: user.id,
      title: body.title,
      priority: body.priority || "medium",
      due_at: body.due_at || null,
      estimate_minutes: body.estimate_minutes || null,
      tags: body.tags || [],
      status: "open",
      completed_at: null,
      suggested_time_blocks: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await kv.set(`task:${user.id}:${task.id}`, task);
    return c.json(task, 201);
  } catch (e) {
    console.log("Create task error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

app.patch(`${PREFIX}/tasks/:id`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const taskId = c.req.param("id");
    const updates = await c.req.json();
    let task = await kv.get(`task:${user.id}:${taskId}`);
    if (!task) return c.json({ error: "Task not found" }, 404);
    Object.assign(task, updates, { updated_at: new Date().toISOString() });
    await kv.set(`task:${user.id}:${taskId}`, task);
    return c.json(task);
  } catch (e) {
    console.log("Patch task error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

app.post(`${PREFIX}/tasks/:id/complete`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const taskId = c.req.param("id");
    let task = await kv.get(`task:${user.id}:${taskId}`);
    if (!task) return c.json({ error: "Task not found" }, 404);
    task.status = task.status === "completed" ? "open" : "completed";
    task.completed_at = task.status === "completed" ? new Date().toISOString() : null;
    task.updated_at = new Date().toISOString();
    await kv.set(`task:${user.id}:${taskId}`, task);
    return c.json(task);
  } catch (e) {
    console.log("Complete task error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

app.delete(`${PREFIX}/tasks/:id`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const taskId = c.req.param("id");
    await kv.del(`task:${user.id}:${taskId}`);
    return c.json({ ok: true });
  } catch (e) {
    console.log("Delete task error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// ===== MIGRATE OLD TASKS → MY LISTS =====
app.post(`${PREFIX}/migrate-tasks`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const oldTasks = await getAllByPrefix(`task:${user.id}:`);
    if (!oldTasks || oldTasks.length === 0) {
      return c.json({ migrated: 0, message: "No old tasks found" });
    }

    const profile = await kv.get(`user:${user.id}`);
    const userName = profile?.name || user.user_metadata?.name || user.email.split("@")[0];
    const now = new Date().toISOString();

    // Build a single "Migrated Tasks" to-do list
    const listId = uuid();
    const items: any[] = oldTasks.map((t: any) => {
      const item: any = {
        id: t.id || uuid(),
        text: t.title || "Untitled task",
        completed: t.status === "completed",
        completed_at: t.completed_at || null,
        created_by: userName,
        created_at: t.created_at || now,
      };
      // Map old task fields to list-item fields
      if (t.due_at) {
        const d = new Date(t.due_at);
        item.due_date = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        item.due_time = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
      }
      if (t.estimate_minutes) item.notes = `Est. ${t.estimate_minutes}m`;
      if (t.tags && t.tags.length > 0) item.notes = (item.notes ? item.notes + " | " : "") + `Tags: ${t.tags.join(", ")}`;
      if (t.priority && t.priority !== "medium") item.notes = (item.notes ? item.notes + " | " : "") + `Priority: ${t.priority}`;
      return item;
    });

    // Sort: open first (by due date), then completed
    items.sort((a: any, b: any) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    const list = {
      id: listId,
      title: "Migrated Tasks",
      list_type: "todo",
      owner_id: user.id,
      items,
      created_at: now,
      updated_at: now,
    };
    await kv.set(`my-list:${user.id}:${listId}`, list);

    // Delete all old task KV entries
    const deleteKeys = oldTasks.map((t: any) => `task:${user.id}:${t.id}`);
    if (deleteKeys.length > 0) {
      await kv.mdel(deleteKeys);
    }

    console.log(`Migrated ${items.length} tasks to My List "${listId}" for user ${user.id}`);
    return c.json({ migrated: items.length, listId, message: `Migrated ${items.length} tasks into "Migrated Tasks" list` });
  } catch (e) {
    console.log("Migrate tasks error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// ===== PERSONAL LISTS (My Lists) =====

// Create a personal list
app.post(`${PREFIX}/my-lists`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const body = await c.req.json();
    const { title, list_type } = body;
    if (!title || typeof title !== "string") return c.json({ error: "Title is required" }, 400);
    const listId = uuid();
    const now = new Date().toISOString();
    const list = {
      id: listId,
      title: title.trim(),
      list_type: list_type || "todo",
      owner_id: user.id,
      items: body.initial_items || [],
      created_at: now,
      updated_at: now,
    };
    await kv.set(`my-list:${user.id}:${listId}`, list);
    return c.json(list, 201);
  } catch (e) {
    console.log("Create personal list error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// Get all personal lists
app.get(`${PREFIX}/my-lists`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const lists = await getAllByPrefix(`my-list:${user.id}:`);
    lists.sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    return c.json(lists);
  } catch (e) {
    console.log("Get personal lists error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// Update a personal list (e.g., set invoice_generated)
app.patch(`${PREFIX}/my-lists/:id`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const listId = c.req.param("id");
    const body = await c.req.json();
    const list = await kv.get(`my-list:${user.id}:${listId}`);
    if (!list) return c.json({ error: "List not found" }, 404);

    if (body.invoice_generated !== undefined) {
      list.invoice_generated = body.invoice_generated;
    }
    if (body.invoice_settings !== undefined) {
      list.invoice_settings = body.invoice_settings;
    }
    if (body.invoice_logs !== undefined) {
      list.invoice_logs = body.invoice_logs;
    }
    list.updated_at = new Date().toISOString();
    await kv.set(`my-list:${user.id}:${listId}`, list);
    return c.json(list);
  } catch (e) {
    console.log("Update personal list error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// Delete a personal list
app.delete(`${PREFIX}/my-lists/:id`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const listId = c.req.param("id");
    const list = await kv.get(`my-list:${user.id}:${listId}`);
    if (!list) return c.json({ error: "List not found" }, 404);
    await kv.del(`my-list:${user.id}:${listId}`);
    return c.json({ ok: true });
  } catch (e) {
    console.log("Delete personal list error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// Add item to personal list
app.post(`${PREFIX}/my-lists/:id/items`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const listId = c.req.param("id");
    const body = await c.req.json();
    const list = await kv.get(`my-list:${user.id}:${listId}`);
    if (!list) return c.json({ error: "List not found" }, 404);

    const profile = await kv.get(`user:${user.id}`);
    const userName = profile?.name || user.user_metadata?.name || user.email.split("@")[0];

    const item: any = {
      id: uuid(), text: body.text?.trim(), completed: false,
      completed_at: null, created_by: userName, created_at: new Date().toISOString(),
    };
    if (body.link) item.link = body.link;
    if (body.link_meta) item.link_meta = body.link_meta;
    if (body.quantity != null) item.quantity = body.quantity;
    if (body.unit) item.unit = body.unit;
    if (body.notes) item.notes = body.notes;
    if (body.day_number != null) item.day_number = body.day_number;
    if (body.date) item.date = body.date;
    if (body.due_date) item.due_date = body.due_date;
    if (body.due_time) item.due_time = body.due_time;
    if (body.allocated_hours !== undefined) item.allocated_hours = body.allocated_hours;
    if (body.is_milestone !== undefined) item.is_milestone = body.is_milestone;
    if (body.milestone_id) item.milestone_id = body.milestone_id;

    list.items.push(item);
    list.updated_at = new Date().toISOString();
    await kv.set(`my-list:${user.id}:${listId}`, list);
    return c.json(item, 201);
  } catch (e) {
    console.log("Add personal list item error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// Toggle personal list item
app.patch(`${PREFIX}/my-lists/:id/items/:itemId`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const listId = c.req.param("id");
    const itemId = c.req.param("itemId");
    const list = await kv.get(`my-list:${user.id}:${listId}`);
    if (!list) return c.json({ error: "List not found" }, 404);

    const item = list.items.find((i: any) => i.id === itemId);
    if (!item) return c.json({ error: "Item not found" }, 404);
    item.completed = !item.completed;
    item.completed_at = item.completed ? new Date().toISOString() : null;
    list.updated_at = new Date().toISOString();
    await kv.set(`my-list:${user.id}:${listId}`, list);
    return c.json(item);
  } catch (e) {
    console.log("Toggle personal list item error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// Edit personal list item fields
app.put(`${PREFIX}/my-lists/:id/items/:itemId`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const listId = c.req.param("id");
    const itemId = c.req.param("itemId");
    const body = await c.req.json();
    const list = await kv.get(`my-list:${user.id}:${listId}`);
    if (!list) return c.json({ error: "List not found" }, 404);

    const item = list.items.find((i: any) => i.id === itemId);
    if (!item) return c.json({ error: "Item not found" }, 404);

    const editable = ["text", "link", "link_meta", "quantity", "unit", "notes", "day_number", "date", "due_date", "due_time", "allocated_hours", "is_milestone", "milestone_id"];
    for (const key of editable) {
      if (key in body) item[key] = body[key] === "" ? null : body[key];
    }
    
    // Invalidate invoice signature if edited
    if (list.invoice_settings && list.invoice_settings.accepted) {
      list.invoice_settings.accepted = false;
      list.invoice_settings.signature_name = null;
      list.invoice_logs = list.invoice_logs || [];
      list.invoice_logs.push({
        action: "invalidated",
        date: new Date().toISOString(),
        details: "Signature invalidated due to task update"
      });
      createNotification(list.owner_id, "invoice_invalidated", `Signature for ${list.title} was invalidated because a task was edited.`, { listId: listId }).catch(() => {});
    }

    item.updated_at = new Date().toISOString();
    list.updated_at = new Date().toISOString();
    await kv.set(`my-list:${user.id}:${listId}`, list);
    return c.json(item);
  } catch (e) {
    console.log("Edit personal list item error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// Delete personal list item
app.delete(`${PREFIX}/my-lists/:id/items/:itemId`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const listId = c.req.param("id");
    const itemId = c.req.param("itemId");
    const list = await kv.get(`my-list:${user.id}:${listId}`);
    if (!list) return c.json({ error: "List not found" }, 404);

    list.items = list.items.filter((i: any) => i.id !== itemId);
    list.updated_at = new Date().toISOString();
    await kv.set(`my-list:${user.id}:${listId}`, list);
    return c.json({ ok: true });
  } catch (e) {
    console.log("Delete personal list item error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// Convert personal list to shared list
app.post(`${PREFIX}/my-lists/:id/convert-to-shared`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const listId = c.req.param("id");
    const body = await c.req.json();
    const { collaborators } = body;
    const personalList = await kv.get(`my-list:${user.id}:${listId}`);
    if (!personalList) return c.json({ error: "List not found" }, 404);

    const profile = await kv.get(`user:${user.id}`);
    const ownerName = profile?.name || user.user_metadata?.name || user.email.split("@")[0];
    const now = new Date().toISOString();

    const collabs: any[] = (collaborators || []).map((col: any) => ({
      email: col.email?.trim().toLowerCase(),
      name: col.name?.trim() || col.email?.split("@")[0],
      user_id: null,
      status: "pending",
      invited_at: now,
    }));

    const sharedList = {
      id: listId,
      title: personalList.title,
      list_type: personalList.list_type || "todo",
      owner_id: user.id,
      owner_name: ownerName,
      owner_email: user.email,
      items: personalList.items || [],
      collaborators: collabs,
      created_at: personalList.created_at,
      updated_at: now,
    };

    await kv.set(`shared-list:${listId}`, sharedList);
    await kv.set(`shared-list-ref:${user.id}:${listId}`, { list_id: listId, role: "owner" });

    for (const collab of collabs) {
      await kv.set(`shared-list-invite:${collab.email}:${listId}`, {
        list_id: listId, list_title: sharedList.title, owner_name: ownerName,
        owner_email: user.email, owner_id: user.id,
        recipient_name: collab.name, recipient_email: collab.email,
        status: "pending", invited_at: now,
      });
      sendSharedListInviteEmail(collab.email, collab.name, ownerName, sharedList.title);
    }

    await kv.del(`my-list:${user.id}:${listId}`);
    return c.json(sharedList, 201);
  } catch (e) {
    console.log("Convert personal list to shared error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// Get people contacts (invited to the app + shared list collaborators)
app.get(`${PREFIX}/my-contacts`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const invites = await getAllByPrefix(`invite:${user.id}:`);
    const sharedRefs = await getAllByPrefix(`shared-list-ref:${user.id}:`);
    const contactMap = new Map<string, { name: string; email: string }>();

    for (const inv of invites) {
      if (inv.email) {
        contactMap.set(inv.email.toLowerCase(), {
          name: inv.recipient_name || inv.email.split("@")[0],
          email: inv.email.toLowerCase(),
        });
      }
    }

    for (const ref of sharedRefs) {
      if (ref.role === "owner") {
        const list = await kv.get(`shared-list:${ref.list_id}`);
        if (list?.collaborators) {
          for (const cl of list.collaborators) {
            if (cl.email && !contactMap.has(cl.email.toLowerCase())) {
              contactMap.set(cl.email.toLowerCase(), {
                name: cl.name || cl.email.split("@")[0],
                email: cl.email.toLowerCase(),
              });
            }
          }
        }
      }
    }

    const contacts = Array.from(contactMap.values());
    contacts.sort((a, b) => a.name.localeCompare(b.name));
    return c.json(contacts);
  } catch (e) {
    console.log("Get contacts error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// ===== SHARED LISTS =====

// Helper: send a notification email (accept/reject) to list owner
async function sendSharedListNotification(
  ownerEmail: string,
  ownerName: string,
  responderName: string,
  listTitle: string,
  action: "accepted" | "rejected",
) {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) { console.log("RESEND_API_KEY missing, skipping notification email"); return; }
  const emoji = action === "accepted" ? "🎉" : "😔";
  const verb = action === "accepted" ? "accepted" : "declined";
  const subject = `${responderName} ${verb} your shared list "${listTitle}" ${emoji}`;
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
    <div style="background:linear-gradient(135deg,#f8c0d8 0%,#d8b4fe 25%,#93c5fd 55%,#99f6e4 100%);height:6px;border-radius:3px;margin-bottom:24px"></div>
    <h2 style="margin:0 0 12px;font-size:18px;color:#1e1b4b">${subject}</h2>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#333">${
      action === "accepted"
        ? `Great news! <strong>${responderName}</strong> has joined your shared list "<strong>${listTitle}</strong>". You can now collaborate together!`
        : `<strong>${responderName}</strong> has declined the invitation to join "<strong>${listTitle}</strong>". The list is still available to you and other collaborators.`
    }</p>
    <a href="https://Chrono.knowwhatson.com/track?tab=tasks" style="display:inline-block;padding:12px 28px;border-radius:10px;background:#5c3a20;color:#fff;font-size:14px;font-weight:600;text-decoration:none">Open Chrono</a>
    <p style="margin:20px 0 0;font-size:11px;color:#9a9080">From Chrono — Calm, Unified & Personalised</p>
  </div>`;
  const text = `${responderName} ${verb} your shared list "${listTitle}". Open Chrono: https://Chrono.knowwhatson.com/track?tab=tasks`;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendApiKey}` },
      body: JSON.stringify({ from: `Chrono <info@knowwhatson.com>`, to: [ownerEmail], subject, html, text }),
    });
  } catch (e) { console.log("Failed to send shared list notification:", e); }
}

// Helper: send invite email to a shared list collaborator
async function sendSharedListInviteEmail(
  recipientEmail: string,
  recipientName: string,
  ownerName: string,
  listTitle: string,
) {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) { console.log("RESEND_API_KEY missing, skipping list invite email"); return; }
  const subject = `${ownerName} invited you to collaborate on "${listTitle}"`;
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
    <div style="background:linear-gradient(135deg,#f8c0d8 0%,#d8b4fe 25%,#93c5fd 55%,#99f6e4 100%);height:6px;border-radius:3px;margin-bottom:24px"></div>
    <h2 style="margin:0 0 12px;font-size:18px;color:#1e1b4b">Hey ${recipientName.split(" ")[0]}! 👋</h2>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#333"><strong>${ownerName}</strong> has invited you to collaborate on the shared list "<strong>${listTitle}</strong>" in Chrono.</p>
    <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#333">Open your <strong>Lists</strong> tab in Chrono to accept or decline.</p>
    <a href="https://Chrono.knowwhatson.com/track?tab=tasks" style="display:inline-block;padding:12px 28px;border-radius:10px;background:#5c3a20;color:#fff;font-size:14px;font-weight:600;text-decoration:none">Open Chrono</a>
    <p style="margin:20px 0 0;font-size:11px;color:#9a9080">From Chrono — Calm, Unified & Personalised</p>
  </div>`;
  const text = `${ownerName} invited you to "${listTitle}". Open Chrono: https://Chrono.knowwhatson.com/track?tab=tasks`;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendApiKey}` },
      body: JSON.stringify({ from: `${ownerName} <info@knowwhatson.com>`, to: [recipientEmail], subject, html, text }),
    });
  } catch (e) { console.log("Failed to send shared list invite email:", e); }
}

// Create a shared list
app.post(`${PREFIX}/shared-lists`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const body = await c.req.json();
    const { title, collaborators, list_type } = body;
    if (!title || typeof title !== "string") return c.json({ error: "Title is required" }, 400);

    const profile = await kv.get(`user:${user.id}`);
    const ownerName = profile?.name || user.user_metadata?.name || user.email.split("@")[0];

    const listId = uuid();
    const now = new Date().toISOString();

    const collabs: any[] = (collaborators || []).map((col: any) => ({
      email: col.email?.trim().toLowerCase(),
      name: col.name?.trim() || col.email?.split("@")[0],
      user_id: null,
      status: "pending",
      invited_at: now,
    }));

    const list = {
      id: listId,
      title: title.trim(),
      list_type: list_type || "todo",
      owner_id: user.id,
      owner_name: ownerName,
      owner_email: user.email,
      items: [],
      collaborators: collabs,
      created_at: now,
      updated_at: now,
    };

    await kv.set(`shared-list:${listId}`, list);
    await kv.set(`shared-list-ref:${user.id}:${listId}`, { list_id: listId, role: "owner" });

    for (const collab of collabs) {
      await kv.set(`shared-list-invite:${collab.email}:${listId}`, {
        list_id: listId, list_title: list.title, owner_name: ownerName,
        owner_email: user.email, owner_id: user.id,
        recipient_name: collab.name, recipient_email: collab.email,
        status: "pending", invited_at: now,
      });
      sendSharedListInviteEmail(collab.email, collab.name, ownerName, list.title);
    }

    return c.json(list, 201);
  } catch (e) {
    console.log("Create shared list error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// Get all shared lists (owned + member)
app.get(`${PREFIX}/shared-lists`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const refs = await getAllByPrefix(`shared-list-ref:${user.id}:`);
    const lists: any[] = [];
    for (const ref of refs) {
      const list = await kv.get(`shared-list:${ref.list_id}`);
      if (list) lists.push({ ...list, _role: ref.role });
    }
    lists.sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    return c.json(lists);
  } catch (e) {
    console.log("Get shared lists error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// Get pending shared list invitations for the current user
app.get(`${PREFIX}/shared-list-invites`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const invites = await getAllByPrefix(`shared-list-invite:${user.email}:`);
    return c.json(invites.filter((inv: any) => inv.status === "pending"));
  } catch (e) {
    console.log("Get shared list invites error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// Respond to a shared list invitation (accept/reject)
app.post(`${PREFIX}/shared-lists/:id/respond`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const listId = c.req.param("id");
    const body = await c.req.json();
    const { action } = body;
    if (action !== "accept" && action !== "reject") return c.json({ error: "Invalid action" }, 400);

    const inviteKey = `shared-list-invite:${user.email}:${listId}`;
    const invite = await kv.get(inviteKey);
    if (!invite) return c.json({ error: "Invitation not found" }, 404);

    const profile = await kv.get(`user:${user.id}`);
    const responderName = profile?.name || user.user_metadata?.name || user.email.split("@")[0];

    if (action === "accept") {
      invite.status = "accepted";
      await kv.set(inviteKey, invite);

      const list = await kv.get(`shared-list:${listId}`);
      if (list) {
        const collab = list.collaborators.find((cl: any) => cl.email === user.email);
        if (collab) { collab.status = "accepted"; collab.user_id = user.id; collab.name = responderName; }
        list.updated_at = new Date().toISOString();
        await kv.set(`shared-list:${listId}`, list);
        await kv.set(`shared-list-ref:${user.id}:${listId}`, { list_id: listId, role: "member" });
        sendSharedListNotification(list.owner_email, list.owner_name, responderName, list.title, "accepted");
      }
      return c.json({ ok: true, status: "accepted" });
    } else {
      invite.status = "rejected";
      await kv.set(inviteKey, invite);

      const list = await kv.get(`shared-list:${listId}`);
      if (list) {
        const collab = list.collaborators.find((cl: any) => cl.email === user.email);
        if (collab) collab.status = "rejected";
        list.updated_at = new Date().toISOString();
        await kv.set(`shared-list:${listId}`, list);
        sendSharedListNotification(list.owner_email, list.owner_name, responderName, list.title, "rejected");
      }
      await kv.del(inviteKey);
      return c.json({ ok: true, status: "rejected" });
    }
  } catch (e) {
    console.log("Respond to shared list invite error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// Add item to shared list
app.post(`${PREFIX}/shared-lists/:id/items`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const listId = c.req.param("id");
    const body = await c.req.json();
    const list = await kv.get(`shared-list:${listId}`);
    if (!list) return c.json({ error: "List not found" }, 404);

    const isOwner = list.owner_id === user.id;
    const isMember = list.collaborators.some((cl: any) => cl.user_id === user.id && cl.status === "accepted");
    if (!isOwner && !isMember) return c.json({ error: "Not authorized" }, 403);

    const profile = await kv.get(`user:${user.id}`);
    const userName = profile?.name || user.user_metadata?.name || user.email.split("@")[0];

    const item: any = {
      id: uuid(), text: body.text?.trim(), completed: false,
      completed_by: null, completed_at: null,
      created_by: userName, created_by_id: user.id, created_at: new Date().toISOString(),
    };
    // Type-specific fields
    if (body.link) item.link = body.link;
    if (body.link_meta) item.link_meta = body.link_meta;
    if (body.quantity != null) item.quantity = body.quantity;
    if (body.unit) item.unit = body.unit;
    if (body.notes) item.notes = body.notes;
    if (body.day_number != null) item.day_number = body.day_number;
    if (body.date) item.date = body.date;
    if (body.due_date) item.due_date = body.due_date;
    if (body.due_time) item.due_time = body.due_time;
    if (body.allocated_hours !== undefined) item.allocated_hours = body.allocated_hours;
    if (body.is_milestone !== undefined) item.is_milestone = body.is_milestone;
    if (body.milestone_id) item.milestone_id = body.milestone_id;
    list.items.push(item);
    list.updated_at = new Date().toISOString();
    await kv.set(`shared-list:${listId}`, list);
    // Notify other collaborators about the new item
    try {
      const notifyIds = [list.owner_id, ...(list.collaborators || []).filter((cl: any) => cl.user_id && cl.status === "accepted").map((cl: any) => cl.user_id)].filter((uid: string) => uid && uid !== user.id);
      for (const uid of notifyIds) { await createNotification(uid, "friend_updated_list", `${userName} added "${item.text}" to "${list.title}"`, { list_id: listId, list_title: list.title, friend_name: userName, item_text: item.text }); }
    } catch (ne) { console.log("Shared list item notification error (non-fatal):", ne); }
    return c.json(item, 201);
  } catch (e) {
    console.log("Add shared list item error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// Toggle item completion in shared list
app.patch(`${PREFIX}/shared-lists/:id/items/:itemId`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const listId = c.req.param("id");
    const itemId = c.req.param("itemId");
    const list = await kv.get(`shared-list:${listId}`);
    if (!list) return c.json({ error: "List not found" }, 404);

    const isOwner = list.owner_id === user.id;
    const isMember = list.collaborators.some((cl: any) => cl.user_id === user.id && cl.status === "accepted");
    if (!isOwner && !isMember) return c.json({ error: "Not authorized" }, 403);

    const item = list.items.find((i: any) => i.id === itemId);
    if (!item) return c.json({ error: "Item not found" }, 404);

    const profile = await kv.get(`user:${user.id}`);
    const userName = profile?.name || user.user_metadata?.name || user.email.split("@")[0];

    item.completed = !item.completed;
    item.completed_by = item.completed ? userName : null;
    item.completed_at = item.completed ? new Date().toISOString() : null;
    list.updated_at = new Date().toISOString();
    await kv.set(`shared-list:${listId}`, list);
    return c.json(list);
  } catch (e) {
    console.log("Toggle shared list item error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// Edit item fields in shared list
app.put(`${PREFIX}/shared-lists/:id/items/:itemId`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const listId = c.req.param("id");
    const itemId = c.req.param("itemId");
    const body = await c.req.json();
    const list = await kv.get(`shared-list:${listId}`);
    if (!list) return c.json({ error: "List not found" }, 404);

    const isOwner = list.owner_id === user.id;
    const isMember = list.collaborators.some((cl: any) => cl.user_id === user.id && cl.status === "accepted");
    if (!isOwner && !isMember) return c.json({ error: "Not authorized" }, 403);

    const item = list.items.find((i: any) => i.id === itemId);
    if (!item) return c.json({ error: "Item not found" }, 404);

    const editable = ["text", "link", "link_meta", "quantity", "unit", "notes", "day_number", "date", "due_date", "due_time", "allocated_hours", "is_milestone", "milestone_id"];
    for (const key of editable) {
      if (key in body) item[key] = body[key] === "" ? null : body[key];
    }
    
    // Invalidate invoice signature if edited
    if (list.invoice_settings && list.invoice_settings.accepted) {
      list.invoice_settings.accepted = false;
      list.invoice_settings.signature_name = null;
      list.invoice_logs = list.invoice_logs || [];
      list.invoice_logs.push({
        action: "invalidated",
        date: new Date().toISOString(),
        details: "Signature invalidated due to task update"
      });
      createNotification(list.owner_id, "invoice_invalidated", `Signature for ${list.title} was invalidated because a task was edited.`, { listId: listId }).catch(() => {});
    }

    item.updated_at = new Date().toISOString();
    list.updated_at = new Date().toISOString();
    await kv.set(`shared-list:${listId}`, list);
    return c.json(list);
  } catch (e) {
    console.log("Edit shared list item error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// Delete item from shared list
app.delete(`${PREFIX}/shared-lists/:id/items/:itemId`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const listId = c.req.param("id");
    const itemId = c.req.param("itemId");
    const list = await kv.get(`shared-list:${listId}`);
    if (!list) return c.json({ error: "List not found" }, 404);

    const isOwner = list.owner_id === user.id;
    const isMember = list.collaborators.some((cl: any) => cl.user_id === user.id && cl.status === "accepted");
    if (!isOwner && !isMember) return c.json({ error: "Not authorized" }, 403);

    list.items = list.items.filter((i: any) => i.id !== itemId);
    list.updated_at = new Date().toISOString();
    await kv.set(`shared-list:${listId}`, list);
    return c.json({ ok: true });
  } catch (e) {
    console.log("Delete shared list item error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// Update shared list
app.patch(`${PREFIX}/shared-lists/:id`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const listId = c.req.param("id");
    const body = await c.req.json();
    const list = await kv.get(`shared-list:${listId}`);
    if (!list) return c.json({ error: "List not found" }, 404);
    
    // Allow any collaborator to generate the invoice
    const isCollab = list.collaborators.some((col: any) => col.email === user.email && col.status === "accepted");
    if (list.owner_id !== user.id && !isCollab) {
      return c.json({ error: "Forbidden" }, 403);
    }

    if (body.invoice_generated !== undefined) {
      list.invoice_generated = body.invoice_generated;
    }
    if (body.invoice_settings !== undefined) {
      list.invoice_settings = body.invoice_settings;
    }
    if (body.invoice_logs !== undefined) {
      list.invoice_logs = body.invoice_logs;
    }
    list.updated_at = new Date().toISOString();
    await kv.set(`shared-list:${listId}`, list);
    return c.json(list);
  } catch (e) {
    console.log("Update shared list error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// Delete shared list (owner only)
app.delete(`${PREFIX}/shared-lists/:id`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const listId = c.req.param("id");
    const list = await kv.get(`shared-list:${listId}`);
    if (!list) return c.json({ error: "List not found" }, 404);
    if (list.owner_id !== user.id) return c.json({ error: "Only the owner can delete" }, 403);

    await kv.del(`shared-list:${listId}`);
    await kv.del(`shared-list-ref:${user.id}:${listId}`);
    for (const collab of list.collaborators) {
      if (collab.email) await kv.del(`shared-list-invite:${collab.email}:${listId}`);
      if (collab.user_id) await kv.del(`shared-list-ref:${collab.user_id}:${listId}`);
    }
    return c.json({ ok: true });
  } catch (e) {
    console.log("Delete shared list error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// Leave a shared list (member only)
app.post(`${PREFIX}/shared-lists/:id/leave`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const listId = c.req.param("id");
    const list = await kv.get(`shared-list:${listId}`);
    if (!list) return c.json({ error: "List not found" }, 404);
    if (list.owner_id === user.id) return c.json({ error: "Owner cannot leave. Delete the list instead." }, 400);

    list.collaborators = list.collaborators.filter((cl: any) => cl.user_id !== user.id && cl.email !== user.email);
    list.updated_at = new Date().toISOString();
    await kv.set(`shared-list:${listId}`, list);
    await kv.del(`shared-list-ref:${user.id}:${listId}`);
    await kv.del(`shared-list-invite:${user.email}:${listId}`);
    // Notify list owner and other collaborators that someone left
    try {
      const pd = await kv.get(`user:${user.id}`);
      const myName = pd?.name || user.user_metadata?.name || user.email.split("@")[0];
      const notifyIds = [list.owner_id, ...(list.collaborators || []).filter((cl: any) => cl.user_id && cl.user_id !== user.id).map((cl: any) => cl.user_id)];
      for (const uid of notifyIds) { if (uid) await createNotification(uid, "friend_left_list", `${myName} left "${list.title}"`, { list_id: listId, list_title: list.title, friend_name: myName }); }
    } catch (ne) { console.log("Leave list notification error (non-fatal):", ne); }
    return c.json({ ok: true });
  } catch (e) {
    console.log("Leave shared list error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// Invite additional collaborator to existing shared list
app.post(`${PREFIX}/shared-lists/:id/invite`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const listId = c.req.param("id");
    const body = await c.req.json();
    const { email, name } = body;
    if (!email) return c.json({ error: "Email required" }, 400);

    const list = await kv.get(`shared-list:${listId}`);
    if (!list) return c.json({ error: "List not found" }, 404);
    if (list.owner_id !== user.id) return c.json({ error: "Only the owner can invite" }, 403);

    const recipientEmail = email.trim().toLowerCase();
    const recipientName = name?.trim() || recipientEmail.split("@")[0];

    if (list.collaborators.some((cl: any) => cl.email === recipientEmail)) {
      return c.json({ error: "This person is already invited" }, 409);
    }

    const now = new Date().toISOString();
    const collab = { email: recipientEmail, name: recipientName, user_id: null, status: "pending", invited_at: now };
    list.collaborators.push(collab);
    list.updated_at = now;
    await kv.set(`shared-list:${listId}`, list);

    await kv.set(`shared-list-invite:${recipientEmail}:${listId}`, {
      list_id: listId, list_title: list.title, owner_name: list.owner_name,
      owner_email: list.owner_email, owner_id: list.owner_id,
      recipient_name: recipientName, recipient_email: recipientEmail,
      status: "pending", invited_at: now,
    });

    sendSharedListInviteEmail(recipientEmail, recipientName, list.owner_name, list.title);
    // Notify the recipient if they are already on Chrono
    try {
      const supabase2 = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { data: usersData2 } = await supabase2.auth.admin.listUsers();
      const found2 = (usersData2?.users || []).find((u: any) => u.email?.toLowerCase() === recipientEmail);
      if (found2) {
        await createNotification(found2.id, "friend_shared_list", `${list.owner_name} shared "${list.title}" with you`, { list_id: listId, list_title: list.title, friend_name: list.owner_name });
      }
    } catch (ne) { console.log("Shared list invite notification error (non-fatal):", ne); }
    return c.json(collab, 201);
  } catch (e) {
    console.log("Invite to shared list error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// Fetch Open Graph metadata for a URL (link preview)
app.get(`${PREFIX}/link-preview`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const url = c.req.query("url");
    if (!url) return c.json({ error: "Missing url parameter" }, 400);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ChronoBot/1.0; +https://chrono.knowwhatson.com)",
        Accept: "text/html,application/xhtml+xml,*/*",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);

    if (!res.ok) return c.json({ error: `HTTP ${res.status}` }, 502);

    const html = await res.text();

    // Extract Open Graph and meta tags
    const getOG = (prop: string): string | null => {
      const m = html.match(new RegExp(`<meta[^>]*(?:property|name)=["'](?:og:|twitter:)${prop}["'][^>]*content=["']([^"']+)["']`, "i"))
        || html.match(new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:|twitter:)${prop}["']`, "i"));
      return m ? m[1] : null;
    };

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);

    const title = getOG("title") || (titleMatch ? titleMatch[1].trim() : null);
    const description = getOG("description") || (descMatch ? descMatch[1].trim() : null);
    let image = getOG("image");

    // Resolve relative image URLs
    if (image && !image.startsWith("http")) {
      try {
        image = new URL(image, url).href;
      } catch {}
    }

    const domain = new URL(url).hostname.replace(/^www\./, "");

    // Try to extract price for product pages
    const priceMatch = html.match(/<meta[^>]*(?:property|name)=["'](?:og:price:amount|product:price:amount)["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:price:amount|product:price:amount)["']/i);
    const currencyMatch = html.match(/<meta[^>]*(?:property|name)=["'](?:og:price:currency|product:price:currency)["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:price:currency|product:price:currency)["']/i);

    return c.json({
      title,
      description,
      image,
      domain,
      price: priceMatch ? priceMatch[1] : null,
      currency: currencyMatch ? currencyMatch[1] : null,
    });
  } catch (e: any) {
    if (e.name === "AbortError") return c.json({ error: "Timeout fetching URL" }, 504);
    console.log("Link preview error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// Get shared list preview (public — no auth required, for invite links)
app.get(`${PREFIX}/shared-lists/:id/preview`, async (c) => {
  try {
    const listId = c.req.param("id");
    const list = await kv.get(`shared-list:${listId}`);
    if (!list) return c.json({ error: "List not found" }, 404);
    return c.json({ id: list.id, title: list.title, owner_name: list.owner_name, list_type: list.list_type || "todo" });
  } catch (e) {
    console.log("Get shared list preview error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// Get public invoice (no auth required)
app.get(`${PREFIX}/public-invoice/:id`, async (c) => {
  try {
    const listId = c.req.param("id");
    
    // Check shared list first
    let list = await kv.get(`shared-list:${listId}`);
    let isShared = true;
    
    if (!list) {
      // Find personal list
      const allLists = await getAllByPrefix(`my-list:`);
      list = allLists.find(l => l.id === listId);
      isShared = false;
    }
    
    if (!list) return c.json({ error: "Invoice not found" }, 404);
    if (list.list_type !== "project") return c.json({ error: "Not a project" }, 400);
    
    // Fetch items
    let items = [];
    if (isShared) {
      items = await getAllByPrefix(`shared-item:${listId}:`);
    } else {
      items = list.items || [];
    }
    
    // For personal lists, we might not have owner_name stored at the list level, 
    // but we can default to "Owner" or fetch the user profile if needed.
    // For shared lists, owner_name is populated during creation.
    const ownerName = list.owner_name || "Owner";
    
    // Fire-and-forget: notify owner that invoice was viewed (deduped per day)
    if (list.owner_id) {
      const today = new Date().toISOString().slice(0, 10);
      const viewKey = `invoice-view:${listId}:${today}`;
      const alreadyViewed = await kv.get(viewKey);
      if (!alreadyViewed) {
        await kv.set(viewKey, { viewed_at: new Date().toISOString() });
        const isAccepted2 = list.invoice_settings?.accepted;
        const docLabel = isAccepted2 ? "Invoice" : "Quote";
        
        // Add log entry
        if (!list.invoice_logs) list.invoice_logs = [];
        list.invoice_logs.push({
          action: "viewed",
          date: new Date().toISOString(),
          details: `Client viewed the ${docLabel.toLowerCase()}`,
        });
        
        // Save the log update to KV
        if (isShared) {
          await kv.set(`shared-list:${listId}`, list);
        } else {
          await kv.set(`my-list:${list.owner_id}:${listId}`, list);
        }

        createNotification(
          list.owner_id,
          "invoice_viewed",
          `Your ${docLabel} for "${list.title}" was just viewed`,
          { listId, isShared }
        ).catch((e: any) => console.log("Invoice viewed notification error (non-fatal):", e));
      }
    }
    
    // Fetch the owner's profile to inject the business identity
    let businessProfile = null;
    if (list.owner_id) {
      const profile = await kv.get(`user:${list.owner_id}`);
      if (profile && profile.business_profile) {
        businessProfile = profile.business_profile;
      }
    }
    
    return c.json({ 
      id: list.id, 
      title: list.title, 
      owner_name: ownerName, 
      list_type: list.list_type, 
      items, 
      invoice_settings: list.invoice_settings,
      business_profile: businessProfile
    });
  } catch (e) {
    console.log("Get public invoice error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// Post a comment to a public invoice (no auth required)
app.post(`${PREFIX}/public-invoice/:id/comment`, async (c) => {
  try {
    const listId = c.req.param("id");
    const { comment, name, parentId, source } = await c.req.json();
    if (!comment || typeof comment !== "string" || !comment.trim()) {
      return c.json({ error: "Invalid comment" }, 400);
    }
    
    // Check if it's a shared list
    let list = await kv.get(`shared-list:${listId}`);
    let isShared = true;
    
    if (!list) {
      // Find personal list
      const allLists = await getAllByPrefix(`my-list:`);
      list = allLists.find(l => l.id === listId);
      isShared = false;
    }
    
    if (!list) return c.json({ error: "Invoice not found" }, 404);
    
    // Store comment in the list object
    if (!list.invoice_settings) list.invoice_settings = {};
    if (!list.invoice_settings.comments) list.invoice_settings.comments = [];
    
    const commenterName = name?.trim() || "Anonymous";
    const newComment = { 
      id: crypto.randomUUID(), 
      text: comment.trim(), 
      name: commenterName, 
      date: new Date().toISOString(), 
      parentId: parentId || null,
      source: source || null
    };
    list.invoice_settings.comments.push(newComment);

    if (!list.invoice_logs) list.invoice_logs = [];
    list.invoice_logs.push({
      action: "commented",
      date: new Date().toISOString(),
      details: `${commenterName} left a comment${source ? ` on the ${source}` : ''}`,
    });
    
    if (isShared) {
      await kv.set(`shared-list:${listId}`, list);
    } else {
      await kv.set(`my-list:${list.owner_id}:${listId}`, list);
    }
    
    // Send Notification to Owner
    const docType = source === 'Contract' ? 'Contract' : (source === 'Invoice' ? 'Quote' : 'Quote/Invoice');
    await createNotification(
      list.owner_id, 
      "invoice_comment", 
      `${commenterName} commented on ${docType} for "${list.title}"`, 
      { listId, isShared, comment: newComment.text }
    );
    
    return c.json({ ok: true, comment: newComment });
  } catch (e) {
    console.log("Invoice comment error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// Accept a public invoice
app.post(`${PREFIX}/public-invoice/:id/accept`, async (c) => {
  try {
    const listId = c.req.param("id");
    let body = {};
    try {
      body = await c.req.json();
    } catch (e) {}
    const { signature_name, client_details, source } = body as { signature_name?: string, client_details?: any, source?: string };
    
    let list = await kv.get(`shared-list:${listId}`);
    let isShared = true;
    
    if (!list) {
      const allLists = await getAllByPrefix(`my-list:`);
      list = allLists.find(l => l.id === listId);
      isShared = false;
    }
    
    if (!list) return c.json({ error: "Invoice not found" }, 404);
    
    if (!list.invoice_settings) list.invoice_settings = {};
    list.invoice_settings.accepted = true;
    list.invoice_settings.accepted_at = new Date().toISOString();
    if (signature_name) {
      list.invoice_settings.signature_name = signature_name;
    }
    if (client_details) {
      list.invoice_settings.client_details = client_details;
    }
    
    // Log the event
    if (!list.invoice_logs) list.invoice_logs = [];
    list.invoice_logs.push({
      action: "accepted",
      date: new Date().toISOString(),
      details: (signature_name ? `Signed by ${signature_name}` : "Accepted") + (source ? ` via ${source}` : ''),
    });

    if (isShared) {
      await kv.set(`shared-list:${listId}`, list);
    } else {
      await kv.set(`my-list:${list.owner_id}:${listId}`, list);
    }
    
    // Send Notification to Owner
    const docType = source === 'Contract' ? 'Contract' : (source === 'Invoice' ? 'Quote' : 'Quote');
    const notificationMessage = signature_name
      ? `${signature_name} signed "${list.title}" ${docType}`
      : `${docType} accepted for "${list.title}"!`;

    await createNotification(
      list.owner_id, 
      "invoice_accepted", 
      notificationMessage, 
      { listId, isShared }
    );
    
    return c.json({ success: true, list });
  } catch (err: any) {
    return c.json({ error: err.message || "Failed to accept invoice" }, 500);
  }
});

app.post(`${PREFIX}/public-invoice/:id/request-change`, async (c) => {
  try {
    const listId = c.req.param("id");
    const { request_text, requester_name, source } = await c.req.json();
    
    let list = await kv.get(`shared-list:${listId}`);
    let isShared = true;
    
    if (!list) {
      const allLists = await getAllByPrefix(`my-list:`);
      list = allLists.find(l => l.id === listId);
      isShared = false;
    }
    
    if (!list) return c.json({ error: "Invoice not found" }, 404);
    
    if (!list.invoice_settings) list.invoice_settings = {};
    // Let's add it to comments and also log it
    if (!list.invoice_settings.comments) list.invoice_settings.comments = [];
    
    const name = requester_name?.trim() || "Client";
    const commentText = request_text?.trim() || "Requested a change.";
    
    list.invoice_settings.comments.push({
      id: crypto.randomUUID(),
      text: `CHANGE REQUEST: ${commentText}`,
      name: name,
      date: new Date().toISOString(),
      parentId: null,
      source: source || null
    });

    // The "Reverse" Amendment Protocol: automatically void any existing digital signature
    let voidedSignature = false;
    if (list.invoice_settings.accepted) {
      list.invoice_settings.accepted = false;
      list.invoice_settings.signature_name = null;
      list.invoice_settings.accepted_at = null;
      voidedSignature = true;
    }

    if (!list.invoice_logs) list.invoice_logs = [];
    list.invoice_logs.push({
      action: "change_requested",
      date: new Date().toISOString(),
      details: `${name} requested a change${voidedSignature ? ' (Signature Voided)' : ''}${source ? ` via ${source}` : ''}`,
    });

    if (isShared) {
      await kv.set(`shared-list:${listId}`, list);
    } else {
      await kv.set(`my-list:${list.owner_id}:${listId}`, list);
    }
    
    // Send Notification to Owner
    const docType = source === 'Contract' ? 'Contract' : (source === 'Invoice' ? 'Quote' : 'Quote/Invoice');
    await createNotification(
      list.owner_id, 
      "invoice_change_requested", 
      `${name} requested changes to ${docType} for "${list.title}"`, 
      { listId, isShared, comment: commentText }
    );
    
    return c.json({ ok: true });
  } catch (e) {
    console.log("Invoice accept error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// Join a shared list via invite link (auto-accepts)
app.post(`${PREFIX}/shared-lists/:id/join-via-link`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const listId = c.req.param("id");
    const list = await kv.get(`shared-list:${listId}`);
    if (!list) return c.json({ error: "List not found" }, 404);

    if (list.owner_id === user.id) return c.json({ ok: true, status: "owner" });

    const profile = await kv.get(`user:${user.id}`);
    const userName = profile?.name || user.user_metadata?.name || user.email.split("@")[0];

    const existing = list.collaborators.find((cl: any) => cl.email === user.email || cl.user_id === user.id);
    if (existing) {
      if (existing.status === "accepted") return c.json({ ok: true, status: "already_member" });
      existing.status = "accepted";
      existing.user_id = user.id;
      existing.name = userName;
    } else {
      list.collaborators.push({
        email: user.email,
        name: userName,
        user_id: user.id,
        status: "accepted",
        invited_at: new Date().toISOString(),
      });
    }

    list.updated_at = new Date().toISOString();
    await kv.set(`shared-list:${listId}`, list);
    await kv.set(`shared-list-ref:${user.id}:${listId}`, { list_id: listId, role: "member" });
    await kv.del(`shared-list-invite:${user.email}:${listId}`);

    sendSharedListNotification(list.owner_email, list.owner_name, userName, list.title, "accepted");

    return c.json({ ok: true, status: "joined" });
  } catch (e) {
    console.log("Join shared list via link error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// ===== REMINDERS =====
app.get(`${PREFIX}/reminders`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const reminders = await kv.getByPrefix(`reminder:${user.id}:`);
    reminders.sort((a: any, b: any) => {
      const aTime = a.snoozed_until || a.next_run_at || a.due_at;
      const bTime = b.snoozed_until || b.next_run_at || b.due_at;
      if (aTime && bTime) return new Date(aTime).getTime() - new Date(bTime).getTime();
      return 0;
    });
    return c.json(reminders);
  } catch (e) {
    console.log("Get reminders error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

app.post(`${PREFIX}/reminders`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const body = await c.req.json();
    const userProfile = await kv.get(`user:${user.id}`);
    const reminder = {
      id: uuid(),
      user_id: user.id,
      title: body.title,
      schedule_type: body.schedule_type || "one_off",
      due_at: body.due_at || null,
      rrule: body.rrule || null,
      timezone: body.timezone || userProfile?.timezone || "UTC",
      next_run_at: body.due_at || null,
      snoozed_until: null,
      is_enabled: true,
      last_sent_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await kv.set(`reminder:${user.id}:${reminder.id}`, reminder);
    return c.json(reminder, 201);
  } catch (e) {
    console.log("Create reminder error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

app.patch(`${PREFIX}/reminders/:id`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const remId = c.req.param("id");
    const updates = await c.req.json();
    let reminder = await kv.get(`reminder:${user.id}:${remId}`);
    if (!reminder) return c.json({ error: "Reminder not found" }, 404);
    Object.assign(reminder, updates, { updated_at: new Date().toISOString() });
    await kv.set(`reminder:${user.id}:${remId}`, reminder);
    return c.json(reminder);
  } catch (e) {
    console.log("Patch reminder error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

app.post(`${PREFIX}/reminders/:id/snooze`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const remId = c.req.param("id");
    const { snoozed_until } = await c.req.json();
    let reminder = await kv.get(`reminder:${user.id}:${remId}`);
    if (!reminder) return c.json({ error: "Reminder not found" }, 404);
    reminder.snoozed_until = snoozed_until;
    reminder.updated_at = new Date().toISOString();
    await kv.set(`reminder:${user.id}:${remId}`, reminder);
    return c.json(reminder);
  } catch (e) {
    console.log("Snooze reminder error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

app.post(`${PREFIX}/reminders/:id/disable`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const remId = c.req.param("id");
    let reminder = await kv.get(`reminder:${user.id}:${remId}`);
    if (!reminder) return c.json({ error: "Reminder not found" }, 404);
    reminder.is_enabled = !reminder.is_enabled;
    reminder.updated_at = new Date().toISOString();
    await kv.set(`reminder:${user.id}:${remId}`, reminder);
    return c.json(reminder);
  } catch (e) {
    console.log("Disable reminder error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

app.delete(`${PREFIX}/reminders/:id`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const remId = c.req.param("id");
    await kv.del(`reminder:${user.id}:${remId}`);
    return c.json({ ok: true });
  } catch (e) {
    console.log("Delete reminder error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// ===== DAYS SINCE =====
app.get(`${PREFIX}/days-since`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const trackers = await kv.getByPrefix(`days_since:${user.id}:`);
    trackers.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return c.json(trackers);
  } catch (e) {
    console.log("Get days-since error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

app.post(`${PREFIX}/days-since`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const body = await c.req.json();
    const tracker = {
      id: uuid(),
      user_id: user.id,
      label: body.label,
      type: body.type || "since",
      last_date: body.last_date || new Date().toISOString().split("T")[0],
      target_date: body.target_date || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await kv.set(`days_since:${user.id}:${tracker.id}`, tracker);
    return c.json(tracker, 201);
  } catch (e) {
    console.log("Create days-since error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

app.patch(`${PREFIX}/days-since/:id`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const trackerId = c.req.param("id");
    const updates = await c.req.json();
    let tracker = await kv.get(`days_since:${user.id}:${trackerId}`);
    if (!tracker) return c.json({ error: "Tracker not found" }, 404);
    Object.assign(tracker, updates, { updated_at: new Date().toISOString() });
    await kv.set(`days_since:${user.id}:${trackerId}`, tracker);
    return c.json(tracker);
  } catch (e) {
    console.log("Patch days-since error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

app.post(`${PREFIX}/days-since/:id/reset`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const trackerId = c.req.param("id");
    let tracker = await kv.get(`days_since:${user.id}:${trackerId}`);
    if (!tracker) return c.json({ error: "Tracker not found" }, 404);
    tracker.last_date = new Date().toISOString().split("T")[0];
    tracker.updated_at = new Date().toISOString();
    await kv.set(`days_since:${user.id}:${trackerId}`, tracker);
    return c.json(tracker);
  } catch (e) {
    console.log("Reset days-since error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

app.delete(`${PREFIX}/days-since/:id`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const trackerId = c.req.param("id");
    await kv.del(`days_since:${user.id}:${trackerId}`);
    return c.json({ ok: true });
  } catch (e) {
    console.log("Delete days-since error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// ===== AVAILABILITY RULES =====
app.get(`${PREFIX}/rules`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    let rules = await kv.get(`rules:${user.id}`);
    if (!rules) {
      rules = {
        id: uuid(),
        user_id: user.id,
        work_hours: {
          mon: { start: "09:00", end: "17:00" },
          tue: { start: "09:00", end: "17:00" },
          wed: { start: "09:00", end: "17:00" },
          thu: { start: "09:00", end: "17:00" },
          fri: { start: "09:00", end: "17:00" },
        },
        outside_work_hours: {
          mon: { start: "18:00", end: "22:00" },
          tue: { start: "18:00", end: "22:00" },
          wed: { start: "18:00", end: "22:00" },
          thu: { start: "18:00", end: "22:00" },
          fri: { start: "18:00", end: "22:00" },
          sat: { start: "09:00", end: "22:00" },
          sun: { start: "09:00", end: "22:00" },
        },
        no_booking_hours: [],
        focus_blocks: [],
        meal_hours: [],
        buffer_before_minutes: 0,
        buffer_after_minutes: 0,
      };
      await kv.set(`rules:${user.id}`, rules);
    }
    return c.json(rules);
  } catch (e) {
    console.log("Get rules error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

app.patch(`${PREFIX}/rules`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const updates = await c.req.json();
    let rules = await kv.get(`rules:${user.id}`);
    if (!rules) rules = { user_id: user.id };
    Object.assign(rules, updates, { updated_at: new Date().toISOString() });
    await kv.set(`rules:${user.id}`, rules);
    return c.json(rules);
  } catch (e) {
    console.log("Patch rules error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// ===== RECURRING EVENT HELPERS =====
function expandRecurring(event: any, rangeStart: number, rangeEnd: number): any[] {
  if (!event.recurrence_rule) return [event];
  const rule = event.recurrence_rule;
  const origStart = new Date(event.start_at);
  const origEnd = new Date(event.end_at);
  const durationMs = origEnd.getTime() - origStart.getTime();
  const exceptions: string[] = event.recurrence_exceptions || [];
  const instances: any[] = [];
  const ruleEnd = rule.end_date ? new Date(rule.end_date).getTime() : Infinity;
  const maxCount = rule.count || 365; // safety cap
  const interval = rule.interval || 1;
  let count = 0;
  let cursor = new Date(origStart);

  for (let safety = 0; safety < 1500 && count < maxCount; safety++) {
    const cTime = cursor.getTime();
    if (cTime > Math.min(rangeEnd, ruleEnd)) break;
    const instEnd = cTime + durationMs;
    const dateKey = cursor.toISOString().slice(0, 10);
    if (instEnd > rangeStart && cTime < rangeEnd && !exceptions.includes(dateKey)) {
      instances.push({
        ...event,
        id: safety === 0 ? event.id : `${event.id}___${dateKey}`,
        start_at: cursor.toISOString(),
        end_at: new Date(instEnd).toISOString(),
        recurring_event_id: event.id,
        instance_date: dateKey,
        is_recurring_instance: safety > 0,
      });
      count++;
    }
    // Advance cursor
    if (rule.frequency === "daily") cursor.setDate(cursor.getDate() + interval);
    else if (rule.frequency === "weekly") cursor.setDate(cursor.getDate() + 7 * interval);
    else if (rule.frequency === "monthly") cursor.setMonth(cursor.getMonth() + interval);
    else if (rule.frequency === "yearly") cursor.setFullYear(cursor.getFullYear() + interval);
    else break;
  }
  return instances;
}

// ===== EVENTS (manual entries for demo, since we can't do real OAuth) =====
app.get(`${PREFIX}/events`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const start = c.req.query("start");
    const end = c.req.query("end");

    // Auto-sync external calendar connections (ICS, CalDAV, Google) on every fetch.
    // Each sync function has a built-in 15-minute throttle so this is cheap when recent.
    try {
      const connections = await kv.getByPrefix(`cal_conn:${user.id}:`);
      const activeConns = (connections || []).filter((conn: any) => conn.is_active);
      const syncPromises: Promise<any>[] = [];
      for (const conn of activeConns) {
        if (conn.provider === "ics") {
          syncPromises.push(syncIcsCalendarEvents(user.id, conn, false).catch((e: any) => {
            console.log(`Auto-sync ICS ${conn.id} error:`, e);
          }));
        } else if (conn.provider === "caldav") {
          syncPromises.push(syncCaldavCalendarEvents(user.id, conn, false).catch((e: any) => {
            console.log(`Auto-sync CalDAV ${conn.id} error:`, e);
          }));
        } else if (conn.provider === "google") {
          // Google sync has no built-in throttle, so check last_sync_at here
          const lastGSync = conn.last_sync_at ? new Date(conn.last_sync_at).getTime() : 0;
          if (Date.now() - lastGSync >= 15 * 60 * 1000) {
            syncPromises.push(syncGoogleCalendarEvents(user.id, conn).catch((e: any) => {
              console.log(`Auto-sync Google ${conn.id} error:`, e);
            }));
          }
        }
      }
      if (syncPromises.length > 0) {
        await Promise.all(syncPromises);
      }
    } catch (syncErr) {
      console.log("Auto-sync connections error (non-fatal):", syncErr);
    }

    let events = await getAllByPrefix(`event:${user.id}:`);
    
    const connMap = new Map();
    const connectionsData = await kv.getByPrefix(`cal_conn:${user.id}:`);
    (connectionsData || []).forEach((c: any) => connMap.set(c.id, c.color));

    const rangeStart = start ? new Date(start).getTime() : 0;
    const rangeEnd = end ? new Date(end).getTime() : Infinity;

    // Expand recurring events into instances
    let allEvents: any[] = [];
    for (const e of events) {
      if (e.recurrence_rule) {
        allEvents.push(...expandRecurring(e, rangeStart, rangeEnd));
      } else {
        allEvents.push(e);
      }
    }

    // Filter by date range
    if (start || end) {
      allEvents = allEvents.filter((e: any) => {
        const evEnd = new Date(e.end_at).getTime();
        const evStart = new Date(e.start_at).getTime();
        return evEnd > rangeStart && evStart < rangeEnd;
      });
    }

    allEvents.sort((a: any, b: any) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
    // Clean ICS escapes for display
    const cleaned = allEvents.map((e: any) => {
      const eColor = e.color || (e.connection_id ? connMap.get(e.connection_id) : null);
      return {
        ...e,
        color: eColor,
        title: e.title?.replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\") || e.title,
        location: e.location?.replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\") || e.location,
      };
    });
    return c.json(cleaned);
  } catch (e) {
    console.log("Get events error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

app.post(`${PREFIX}/events`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const body = await c.req.json();
    const event: any = {
      id: uuid(),
      user_id: user.id,
      title: body.title,
      description: body.description || null,
      location: body.location || null,
      start_at: body.start_at,
      end_at: body.end_at,
      is_all_day: body.is_all_day || false,
      status: body.status || "confirmed",
      provider: "manual",
      updated_at_provider: body.updated_at_provider || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (body.recurrence_rule) {
      event.recurrence_rule = body.recurrence_rule;
      event.recurrence_exceptions = [];
    }
    await kv.set(`event:${user.id}:${event.id}`, event);

    // If guest_contact_ids provided, create the event on each guest's calendar too (if they are Chrono users)
    const guestResults: any[] = [];
    if (body.guest_contact_ids && Array.isArray(body.guest_contact_ids)) {
      for (const contactId of body.guest_contact_ids) {
        try {
          const contact = await kv.get(`contact:${user.id}:${contactId}`);
          if (!contact?.friend_id) continue;
          const guestUserId = contact.friend_id;
          const guestEvent: any = {
            id: uuid(),
            user_id: guestUserId,
            title: event.title,
            description: event.description,
            location: event.location,
            start_at: event.start_at,
            end_at: event.end_at,
            is_all_day: event.is_all_day || false,
            status: event.status || "confirmed",
            provider: "manual",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            created_by_friend_id: user.id,
            created_by_friend_name: (await kv.get(`user:${user.id}`))?.name || user.email.split("@")[0],
          };
          await kv.set(`event:${guestUserId}:${guestEvent.id}`, guestEvent);
          guestResults.push({ contact_id: contactId, friend_id: guestUserId, event_id: guestEvent.id });
        } catch (ge) { console.log(`Create guest event for contact ${contactId} error:`, ge); }
      }
    }

    await updateCalendarShareGrants(user.id);

    return c.json({ ...event, guest_events: guestResults }, 201);
  } catch (e) {
    console.log("Create event error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// Edit a single instance of a recurring event (creates an exception + standalone)
app.post(`${PREFIX}/events/:id/edit-instance`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const eventId = c.req.param("id");
    const body = await c.req.json();
    const instanceDate = body.instance_date; // YYYY-MM-DD

    // Add exception to parent
    const parent = await kv.get(`event:${user.id}:${eventId}`);
    if (!parent) return c.json({ error: "Parent event not found" }, 404);
    const exceptions = parent.recurrence_exceptions || [];
    if (!exceptions.includes(instanceDate)) {
      exceptions.push(instanceDate);
      parent.recurrence_exceptions = exceptions;
      parent.updated_at = new Date().toISOString();
      await kv.set(`event:${user.id}:${eventId}`, parent);
    }

    // Create a standalone event for this instance
    const newEvent = {
      id: uuid(),
      user_id: user.id,
      title: body.title ?? parent.title,
      description: body.description ?? parent.description,
      location: body.location ?? parent.location,
      start_at: body.start_at,
      end_at: body.end_at,
      is_all_day: parent.is_all_day,
      status: body.status ?? parent.status,
      provider: parent.provider ?? "manual",
      original_recurring_id: eventId,
      original_instance_date: instanceDate,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await kv.set(`event:${user.id}:${newEvent.id}`, newEvent);
    return c.json(newEvent);
  } catch (e) {
    console.log("Edit instance error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// Delete a single instance of a recurring event
app.post(`${PREFIX}/events/:id/delete-instance`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const eventId = c.req.param("id");
    const body = await c.req.json();
    const instanceDate = body.instance_date;

    const parent = await kv.get(`event:${user.id}:${eventId}`);
    if (!parent) return c.json({ error: "Parent event not found" }, 404);
    const exceptions = parent.recurrence_exceptions || [];
    if (!exceptions.includes(instanceDate)) {
      exceptions.push(instanceDate);
      parent.recurrence_exceptions = exceptions;
      parent.updated_at = new Date().toISOString();
      await kv.set(`event:${user.id}:${eventId}`, parent);
    }
    return c.json({ ok: true });
  } catch (e) {
    console.log("Delete instance error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

app.patch(`${PREFIX}/events/:id`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const eventId = c.req.param("id");
    const updates = await c.req.json();
    let event = await kv.get(`event:${user.id}:${eventId}`);
    if (!event) return c.json({ error: "Event not found" }, 404);
    Object.assign(event, updates, { updated_at: new Date().toISOString() });
    await kv.set(`event:${user.id}:${eventId}`, event);
    return c.json(event);
  } catch (e) {
    console.log("Patch event error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

app.delete(`${PREFIX}/events/:id`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const eventId = c.req.param("id");
    await kv.del(`event:${user.id}:${eventId}`);
    
    await updateCalendarShareGrants(user.id);
    
    return c.json({ ok: true });
  } catch (e) {
    console.log("Delete event error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// ===== EVENT DETAILS =====

// Clean ICS escape sequences from text fields (e.g. \, → , and \; → ;)
function cleanIcsText(val: string | null | undefined): string | null {
  if (!val) return null;
  return val
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "")
    .replace(/\\\\/g, "\\")
    .trim();
}

app.get(`${PREFIX}/calendar/event/:id`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    let eventId = c.req.param("id");
    let instanceDate: string | null = null;

    // Handle recurring instance IDs like "parentId___2026-03-05"
    if (eventId.includes("___")) {
      const parts = eventId.split("___");
      eventId = parts[0];
      instanceDate = parts[1];
    }

    const event = await kv.get(`event:${user.id}:${eventId}`);

    if (!event) {
      return c.json({ error: "Event not found" }, 404);
    }

    // If this is a recurring instance, compute the actual start/end for that instance
    let startAt = event.start_at;
    let endAt = event.end_at;
    if (instanceDate && event.recurrence_rule) {
      const origStart = new Date(event.start_at);
      const origEnd = new Date(event.end_at);
      const durationMs = origEnd.getTime() - origStart.getTime();
      const instDate = new Date(instanceDate + "T" + origStart.toISOString().slice(11));
      startAt = instDate.toISOString();
      endAt = new Date(instDate.getTime() + durationMs).toISOString();
    }

    let calendarName = "My Calendar";
    let provider = event.provider || "manual";
    
    if (event.connection_id) {
      const connection = await kv.get(`cal_conn:${user.id}:${event.connection_id}`);
      if (connection) {
        calendarName = connection.display_name;
        if (event.calendar_name) {
          calendarName = event.calendar_name;
        }
        provider = connection.provider;
      }
    }

    // Normalized response — clean ICS escapes from text fields
    const response: any = {
      id: event.id,
      title: cleanIcsText(event.title) || event.title,
      startAt,
      endAt,
      allDay: event.is_all_day,
      status: event.status,
      isBusy: (event.is_all_day || (new Date(endAt).getTime() - new Date(startAt).getTime()) >= 23 * 3600000) ? false : event.status === "confirmed",
      provider: provider,
      calendarName: calendarName,
      location: cleanIcsText(event.location),
      description: event.description, // description cleaned client-side by formatEventDescription
    };

    if (event.recurrence_rule) {
      response.recurrence_rule = event.recurrence_rule;
    }

    return c.json(response);
  } catch (e) {
    console.log("Get event details error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// ===== GOOGLE CALENDAR OAUTH =====
const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

function getGoogleRedirectUri(): string {
  return `${Deno.env.get("SUPABASE_URL")}/functions/v1/make-server-d1909ddd/calendars/google/callback`;
}

// POST /calendars/google/connect — returns OAuth URL
app.post(`${PREFIX}/calendars/google/connect`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    if (!clientId) {
      return c.json({ error: "GOOGLE_CLIENT_ID not configured on server" }, 500);
    }
    const body = await c.req.json().catch(() => ({}));
    const frontendRedirect = body.redirect_uri || "/settings";

    // Store state for CSRF + redirect info
    const state = crypto.randomUUID();
    await kv.set(`google_oauth_state:${state}`, {
      user_id: user.id,
      frontend_redirect: frontendRedirect,
      created_at: new Date().toISOString(),
    });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: getGoogleRedirectUri(),
      response_type: "code",
      scope: GOOGLE_SCOPES,
      access_type: "offline",
      prompt: "consent",
      state,
    });

    const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    return c.json({ url });
  } catch (e) {
    console.log("Google connect error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// GET /calendars/google/callback — exchange code for tokens, store connection
app.get(`${PREFIX}/calendars/google/callback`, async (c) => {
  try {
    const code = c.req.query("code");
    const state = c.req.query("state");
    const errorParam = c.req.query("error");

    if (errorParam) {
      console.log("Google OAuth error:", errorParam);
      return c.html(`<html><body><h2>Authorization failed</h2><p>${errorParam}</p><script>window.close();</script></body></html>`);
    }

    if (!code || !state) {
      return c.html(`<html><body><h2>Missing code or state</h2><script>window.close();</script></body></html>`);
    }

    // Verify state
    const stateData = await kv.get(`google_oauth_state:${state}`);
    if (!stateData) {
      return c.html(`<html><body><h2>Invalid or expired state</h2><script>window.close();</script></body></html>`);
    }
    await kv.del(`google_oauth_state:${state}`);

    const userId = stateData.user_id;
    const frontendRedirect = stateData.frontend_redirect || "/settings";

    // Exchange code for tokens
    const clientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: getGoogleRedirectUri(),
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json();
    if (tokenData.error) {
      console.log("Google token exchange error:", tokenData);
      return c.html(`<html><body><h2>Token exchange failed</h2><p>${tokenData.error_description || tokenData.error}</p><script>window.close();</script></body></html>`);
    }

    // Get user info from Google to identify the account
    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userInfo = await userInfoRes.json();

    // Get primary calendar ID
    const calListRes = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=owner", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const calList = await calListRes.json();
    const primaryCal = calList.items?.find((cal: any) => cal.primary) || calList.items?.[0];
    const calendarId = primaryCal?.id || "primary";

    // Check if this Google account is already connected
    const existingConnections = await kv.getByPrefix(`cal_conn:${userId}:`);
    const existing = existingConnections.find(
      (conn: any) => conn.provider === "google" && conn.external_account_id === userInfo.id
    );

    const connectionId = existing?.id || uuid();
    const connection = {
      id: connectionId,
      user_id: userId,
      provider: "google",
      display_name: userInfo.email || "Google Calendar",
      external_account_id: userInfo.id,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || existing?.refresh_token || null,
      token_expires_at: new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString(),
      default_calendar_id: calendarId,
      ics_url: null,
      last_sync_at: null,
      sync_cursor: null,
      is_active: true,
      created_at: existing?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await kv.set(`cal_conn:${userId}:${connectionId}`, connection);
    
    // Update share grants count
    await updateCalendarShareGrants(userId);

    // Trigger initial sync of events
    try {
      await syncGoogleCalendarEvents(userId, connection);
    } catch (syncErr) {
      console.log("Initial sync error (non-fatal):", syncErr);
    }

    // Redirect back to frontend
    const baseUrl = frontendRedirect.startsWith("http") ? frontendRedirect : `${c.req.url.split("/functions")[0].replace("https://kbkakrbxbvylwwiwkbfm.supabase.co", "")}`;

    return c.html(`
      <html><body>
        <h2>Google Calendar connected successfully!</h2>
        <p>You can close this window and return to the app.</p>
        <script>
          if (window.opener) {
            window.opener.postMessage({ type: 'google-calendar-connected', connectionId: '${connectionId}' }, '*');
            window.close();
          } else {
            window.location.href = '${frontendRedirect}';
          }
        </script>
      </body></html>
    `);
  } catch (e) {
    console.log("Google callback exception:", e);
    return c.html(`<html><body><h2>Error</h2><p>${errorString(e)}</p><script>window.close();</script></body></html>`);
  }
});

// Helper: refresh Google access token
async function refreshGoogleToken(connection: any): Promise<string> {
  if (!connection.refresh_token) {
    throw new Error("No refresh token available");
  }
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: connection.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error(`Token refresh failed: ${data.error}`);

  // Update stored token
  connection.access_token = data.access_token;
  connection.token_expires_at = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString();
  connection.updated_at = new Date().toISOString();
  await kv.set(`cal_conn:${connection.user_id}:${connection.id}`, connection);

  return data.access_token;
}

// Helper: get valid access token (refreshes if expired)
async function getValidGoogleToken(connection: any): Promise<string> {
  const expiresAt = new Date(connection.token_expires_at).getTime();
  const now = Date.now();
  // Refresh if token expires within 5 minutes
  if (expiresAt - now < 5 * 60 * 1000) {
    return await refreshGoogleToken(connection);
  }
  return connection.access_token;
}

// Helper: sync Google Calendar events for a connection
async function syncGoogleCalendarEvents(userId: string, connection: any) {
  const accessToken = await getValidGoogleToken(connection);
  
  // 1. Fetch all selected calendars
  let calendars: any[] = [];
  try {
    const listRes = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (listRes.ok) {
      const listData = await listRes.json();
      calendars = (listData.items || []).filter((c: any) => c.selected !== false);
    } else {
      console.log("Failed to fetch calendar list, falling back to default");
      calendars = [{ id: connection.default_calendar_id || "primary", summary: "Google Calendar" }];
    }
  } catch (e) {
    console.log("Error fetching calendar list:", e);
    calendars = [{ id: connection.default_calendar_id || "primary", summary: "Google Calendar" }];
  }

  console.log(`Syncing ${calendars.length} Google calendars for user ${userId}`);

  // 2. Initialize cursors map
  if (!connection.cursors) {
    connection.cursors = {};
    if (connection.sync_cursor) {
      const defId = connection.default_calendar_id || "primary";
      connection.cursors[defId] = connection.sync_cursor;
    }
  }

  const userProfile = await kv.get(`user:${userId}`);
  const userTimezone = userProfile?.timezone || "UTC";

  // Helpers
  const normalizeToUtc = (dt: string) => { try { return new Date(dt).toISOString(); } catch { return dt; } };
  const allDayToUtc = (dateStr: string) => { try { return tzToUtc(`${dateStr}T00:00:00`, userTimezone); } catch { return `${dateStr}T00:00:00Z`; } };

  // 3. Process each calendar
  for (const cal of calendars) {
    const calendarId = cal.id;
    const calendarName = cal.summaryOverride || cal.summary || "Google Calendar";
    const syncToken = connection.cursors[calendarId];

    // Fetch events for past 30 days + next 180 days
    const timeMin = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const timeMax = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();

    const params = new URLSearchParams({
      timeMin,
      timeMax,
      maxResults: "2500",
      singleEvents: "true",
      orderBy: "startTime",
    });

    if (syncToken) {
      params.set("syncToken", syncToken);
    }

    let url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`;
    let allEvents: any[] = [];
    let nextSyncToken: string | null = null;
    let fullSyncRequired = false;

    try {
      while (url) {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (res.status === 410) {
          console.log(`Sync token expired for calendar ${calendarId}, retrying with full sync`);
          connection.cursors[calendarId] = null;
          fullSyncRequired = true;
          break;
        }

        const data = await res.json();
        if (data.error) throw new Error(`Calendar API error: ${JSON.stringify(data.error)}`);

        allEvents = allEvents.concat(data.items || []);
        nextSyncToken = data.nextSyncToken || null;

        if (data.nextPageToken) {
          url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?pageToken=${data.nextPageToken}`;
        } else {
          url = "";
        }
      }

      if (fullSyncRequired) {
        // Retry this calendar loop without sync token
        // We do this by clearing the cursor and recursively calling logic? 
        // Simpler: just clear cursor and continue next loop iteration? 
        // No, we want to sync THIS calendar.
        // Let's just recurse for simplicity, but strictly for this calendar. 
        // Actually, just resetting params and refetching is cleaner.
        params.delete("syncToken");
        url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`;
        allEvents = [];
        
        while (url) {
          const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
          const data = await res.json();
          allEvents = allEvents.concat(data.items || []);
          nextSyncToken = data.nextSyncToken || null;
           if (data.nextPageToken) {
            url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?pageToken=${data.nextPageToken}`;
          } else {
            url = "";
          }
        }
      }

      // Pre-fetch existing events for this calendar to avoid O(N^2)
      // optimization: we only need events for THIS connection AND THIS calendar
      const allExisting = await getAllByPrefix(`event:${userId}:`);
      const existingMap = new Map<string, any>();
      allExisting.forEach((e: any) => {
        if (e.connection_id === connection.id && e.source_calendar_id === calendarId && e.external_event_id) {
          existingMap.set(e.external_event_id, e);
        }
      });

      const toSetKeys: string[] = [];
      const toSetValues: any[] = [];
      const toDelKeys: string[] = [];

      for (const gEvent of allEvents) {
        if (gEvent.status === "cancelled") {
          const match = existingMap.get(gEvent.id);
          if (match) {
            toDelKeys.push(`event:${userId}:${match.id}`);
          }
          continue;
        }

        const startAt = gEvent.start?.dateTime || gEvent.start?.date;
        const endAt = gEvent.end?.dateTime || gEvent.end?.date;
        if (!startAt || !endAt) continue;

        const isAllDay = !gEvent.start?.dateTime;
        const existing = existingMap.get(gEvent.id);
        const eventId = existing?.id || uuid();

        const cachedEvent = {
          id: eventId,
          user_id: userId,
          connection_id: connection.id,
          provider: "google",
          provider_event_id: gEvent.id,
          source_calendar_id: calendarId,
          external_event_id: gEvent.id,
          title: gEvent.summary || "(No title)",
          description: gEvent.description || null,
          location: gEvent.location || null,
          start_at: isAllDay ? allDayToUtc(startAt) : normalizeToUtc(startAt),
          end_at: isAllDay ? allDayToUtc(endAt) : normalizeToUtc(endAt),
          is_all_day: isAllDay,
          status: gEvent.status || "confirmed",
          original_timezone: gEvent.start?.timeZone || null,
          updated_at_provider: gEvent.updated || null,
          created_at: existing?.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
          calendar_name: calendarName // Store helpful metadata
        };

        toSetKeys.push(`event:${userId}:${cachedEvent.id}`);
        toSetValues.push(cachedEvent);
      }

      // Batch writes
      const CHUNK_SIZE = 50;
      for (let i = 0; i < toSetKeys.length; i += CHUNK_SIZE) {
        const keys = toSetKeys.slice(i, i + CHUNK_SIZE);
        const values = toSetValues.slice(i, i + CHUNK_SIZE);
        await kv.mset(keys, values);
      }
      if (toDelKeys.length > 0) {
        for (let i = 0; i < toDelKeys.length; i += CHUNK_SIZE) {
          const keys = toDelKeys.slice(i, i + CHUNK_SIZE);
          await kv.mdel(keys);
        }
      }

      // Update cursor for this calendar
      if (nextSyncToken) {
        connection.cursors[calendarId] = nextSyncToken;
      }
      
      // Save progress
      connection.last_sync_at = new Date().toISOString();
      connection.updated_at = new Date().toISOString();
      await kv.set(`cal_conn:${userId}:${connection.id}`, connection);

      console.log(`Synced ${allEvents.length} events from Google Calendar: ${calendarName}`);

    } catch (calErr) {
      console.error(`Failed to sync Google Calendar ${calendarId} (${calendarName}):`, calErr);
    }
  }
}

// POST /calendars/google/sync — manually trigger sync
app.post(`${PREFIX}/calendars/google/sync`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const { connection_id } = await c.req.json().catch(() => ({}));
    const connections = await kv.getByPrefix(`cal_conn:${user.id}:`);
    const googleConns = connections.filter((conn: any) => conn.provider === "google" && conn.is_active);

    if (connection_id) {
      const conn = googleConns.find((c: any) => c.id === connection_id);
      if (!conn) return c.json({ error: "Connection not found" }, 404);
      await syncGoogleCalendarEvents(user.id, conn);
      return c.json({ ok: true, synced: 1 });
    }

    // Sync all Google connections
    for (const conn of googleConns) {
      await syncGoogleCalendarEvents(user.id, conn);
    }
    return c.json({ ok: true, synced: googleConns.length });
  } catch (e) {
    console.log("Google sync error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// GET /calendars/connections — list all connections
app.get(`${PREFIX}/calendars/connections`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const connections = await kv.getByPrefix(`cal_conn:${user.id}:`);
    // Don't expose tokens to frontend
    const safe = connections.map((conn: any) => ({
      id: conn.id,
      provider: conn.provider,
      display_name: conn.display_name,
      default_calendar_id: conn.default_calendar_id,
      ics_url: conn.ics_url || null,
      color: conn.color || null,
      last_sync_at: conn.last_sync_at,
      is_active: conn.is_active,
      created_at: conn.created_at,
    }));
    return c.json(safe);
  } catch (e) {
    console.log("List connections error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// PATCH /calendars/connections/:id — update connection properties
app.patch(`${PREFIX}/calendars/connections/:id`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const connId = c.req.param("id");
    const updates = await c.req.json();
    const connKey = `cal_conn:${user.id}:${connId}`;
    const conn = await kv.get(connKey);
    if (!conn) return c.json({ error: "Connection not found" }, 404);

    if (updates.color !== undefined) conn.color = updates.color;
    if (updates.display_name !== undefined) conn.display_name = updates.display_name;

    await kv.set(connKey, conn);
    return c.json({ success: true, connection: conn });
  } catch (e) {
    console.log("Update connection error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// DELETE /calendars/connections/:id — deactivate
app.delete(`${PREFIX}/calendars/connections/:id`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const connId = c.req.param("id");
    const conn = await kv.get(`cal_conn:${user.id}:${connId}`);
    if (!conn) return c.json({ error: "Connection not found" }, 404);

    // Revoke Google token
    if (conn.provider === "google" && conn.access_token) {
      try {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${conn.access_token}`, { method: "POST" });
      } catch (revokeErr) {
        console.log("Token revoke error (non-fatal):", revokeErr);
      }
    }

    // Remove cached events for this connection
    const events = await getAllByPrefix(`event:${user.id}:`);
    const connEvents = events.filter((e: any) => e.connection_id === connId);
    for (const ev of connEvents) {
      await kv.del(`event:${user.id}:${ev.id}`);
    }

    // Delete the connection
    await kv.del(`cal_conn:${user.id}:${connId}`);
    
    // Update share grants to reflect changed count
    await updateCalendarShareGrants(user.id);
    
    return c.json({ ok: true });
  } catch (e) {
    console.log("Delete connection error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// ===== AVAILABILITY QUERY =====
app.post(`${PREFIX}/availability/query`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const body = await c.req.json();
    const { start_at, end_at, timezone, mode, duration_minutes } = body;

    // Auto-sync external calendars before checking availability (throttled)
    try {
      const connections = await kv.getByPrefix(`cal_conn:${user.id}:`);
      const activeConns = (connections || []).filter((conn: any) => conn.is_active);
      const syncPromises: Promise<any>[] = [];
      for (const conn of activeConns) {
        if (conn.provider === "ics") {
          syncPromises.push(syncIcsCalendarEvents(user.id, conn, false).catch((e: any) => {
            console.log(`Avail auto-sync ICS ${conn.id} error:`, e);
          }));
        } else if (conn.provider === "caldav") {
          syncPromises.push(syncCaldavCalendarEvents(user.id, conn, false).catch((e: any) => {
            console.log(`Avail auto-sync CalDAV ${conn.id} error:`, e);
          }));
        } else if (conn.provider === "google") {
          const lastGSync = conn.last_sync_at ? new Date(conn.last_sync_at).getTime() : 0;
          if (Date.now() - lastGSync >= 15 * 60 * 1000) {
            syncPromises.push(syncGoogleCalendarEvents(user.id, conn).catch((e: any) => {
              console.log(`Avail auto-sync Google ${conn.id} error:`, e);
            }));
          }
        }
      }
      if (syncPromises.length > 0) await Promise.all(syncPromises);
    } catch (syncErr) {
      console.log("Avail auto-sync error (non-fatal):", syncErr);
    }

    const rules = await kv.get(`rules:${user.id}`);
    const rawEvents = await getAllByPrefix(`event:${user.id}:`);
    console.log(`[avail] user=${user.id} rawEvents=${rawEvents.length} range=${start_at}→${end_at} mode=${mode}`);

    const rangeStart = new Date(start_at);
    const rangeEnd = new Date(end_at);
    const bufferBefore = (rules?.buffer_before_minutes || 0) * 60000;
    const bufferAfter = (rules?.buffer_after_minutes || 0) * 60000;

    // Expand recurring events into individual instances within the query range
    const events: any[] = [];
    for (const ev of rawEvents) {
      if (ev.recurrence_rule) {
        events.push(...expandRecurring(ev, rangeStart.getTime(), rangeEnd.getTime()));
      } else {
        events.push(ev);
      }
    }

    // Build unavailable intervals
    const unavailable: { start: number; end: number; type: string; detail: any }[] = [];

    // Events + buffers (skip all-day events — they are informational and shouldn't block scheduling)
    const AVAIL_NEARLY_ALL_DAY_MS = 23 * 60 * 60 * 1000;
    let inRangeCount = 0;
    let allDaySkipped = 0;
    for (const ev of events) {
      if (ev.is_all_day) { allDaySkipped++; continue; }
      const evStart = new Date(ev.start_at).getTime();
      const evEnd = new Date(ev.end_at).getTime();
      if ((evEnd - evStart) >= AVAIL_NEARLY_ALL_DAY_MS) { allDaySkipped++; continue; } // treat as effectively all-day
      if (evEnd + bufferAfter > rangeStart.getTime() && evStart - bufferBefore < rangeEnd.getTime()) {
        inRangeCount++;
        unavailable.push({
          start: evStart - bufferBefore,
          end: evEnd + bufferAfter,
          type: "event",
          detail: { id: ev.id, title: ev.title, provider: ev.provider, start_at: ev.start_at, end_at: ev.end_at },
        });
      }
    }
    console.log(`[avail] expanded=${events.length} inRange=${inRangeCount} allDaySkipped=${allDaySkipped}`);

    const dayNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

    // No-booking hours
    if (rules?.no_booking_hours) {
      for (const nb of rules.no_booking_hours) {
        const slots = getWeeklySlots(nb.dow, nb.start, nb.end, rangeStart, rangeEnd, timezone);
        for (const slot of slots) {
          unavailable.push({ start: slot.start, end: slot.end, type: "rule", detail: { rule_kind: "no_booking_hours", start_at: new Date(slot.start).toISOString(), end_at: new Date(slot.end).toISOString() } });
        }
      }
    }

    // Focus blocks
    if (rules?.focus_blocks) {
      for (const fb of rules.focus_blocks) {
        const slots = getWeeklySlots(fb.dow, fb.start, fb.end, rangeStart, rangeEnd, timezone);
        for (const slot of slots) {
          unavailable.push({ start: slot.start, end: slot.end, type: "rule", detail: { rule_kind: "focus_block", start_at: new Date(slot.start).toISOString(), end_at: new Date(slot.end).toISOString() } });
        }
      }
    }

    // Meal hours (protected — no meetings)
    if (rules?.meal_hours) {
      for (const mh of rules.meal_hours) {
        const slots = getWeeklySlots(mh.dow, mh.start, mh.end, rangeStart, rangeEnd, timezone);
        for (const slot of slots) {
          unavailable.push({ start: slot.start, end: slot.end, type: "rule", detail: { rule_kind: "meal_hours", title: mh.label || "Meal", start_at: new Date(slot.start).toISOString(), end_at: new Date(slot.end).toISOString() } });
        }
      }
    }

    // Sort and merge unavailable
    unavailable.sort((a, b) => a.start - b.start);

    // Build allowed time windows based on mode
    let allowedWindows: { start: number; end: number }[] = [];
    if (mode === "work_hours" && rules?.work_hours) {
      for (const [dow, hours] of Object.entries(rules.work_hours) as [string, any][]) {
        if (hours?.start && hours?.end) {
          const slots = getWeeklySlots(dow, hours.start, hours.end, rangeStart, rangeEnd, timezone);
          allowedWindows.push(...slots);
        }
      }
    } else if (mode === "outside_work_hours" && rules?.outside_work_hours) {
      for (const [dow, hours] of Object.entries(rules.outside_work_hours) as [string, any][]) {
        if (hours?.start && hours?.end) {
          const slots = getWeeklySlots(dow, hours.start, hours.end, rangeStart, rangeEnd, timezone);
          allowedWindows.push(...slots);
        }
      }
    } else {
      // mode = "any"
      allowedWindows = [{ start: rangeStart.getTime(), end: rangeEnd.getTime() }];
    }

    allowedWindows.sort((a, b) => a.start - b.start);

    // Subtract unavailable from allowed windows to get free slots
    const freeSlots: { start_at: string; end_at: string; within: string }[] = [];
    const conflicts: any[] = [];

    for (const window of allowedWindows) {
      let cursor = window.start;
      for (const u of unavailable) {
        if (u.end <= cursor) continue;
        if (u.start >= window.end) break;
        if (u.start > cursor) {
          const slotStart = Math.max(cursor, window.start);
          const slotEnd = Math.min(u.start, window.end);
          if (slotEnd > slotStart) {
            if (!duration_minutes || (slotEnd - slotStart) >= duration_minutes * 60000) {
              freeSlots.push({
                start_at: new Date(slotStart).toISOString(),
                end_at: new Date(slotEnd).toISOString(),
                within: mode || "any",
              });
            }
          }
        }
        conflicts.push(u.detail);
        cursor = Math.max(cursor, u.end);
      }
      if (cursor < window.end) {
        const slotStart = cursor;
        const slotEnd = window.end;
        if (!duration_minutes || (slotEnd - slotStart) >= duration_minutes * 60000) {
          freeSlots.push({
            start_at: new Date(slotStart).toISOString(),
            end_at: new Date(slotEnd).toISOString(),
            within: mode || "any",
          });
        }
      }
    }

    // Point check
    let pointCheck = undefined;
    if (duration_minutes && freeSlots.length >= 0) {
      const checkStart = rangeStart.getTime();
      const checkEnd = checkStart + duration_minutes * 60000;
      const isFree = freeSlots.some((s) => {
        const sStart = new Date(s.start_at).getTime();
        const sEnd = new Date(s.end_at).getTime();
        return sStart <= checkStart && sEnd >= checkEnd;
      });
      const because = unavailable
        .filter((u) => u.start < checkEnd && u.end > checkStart)
        .map((u) => u.detail);
      pointCheck = {
        requested_start_at: start_at,
        requested_end_at: new Date(checkEnd).toISOString(),
        is_free: isFree,
        because,
      };
    }

    console.log(`[avail] unavailable=${unavailable.length} freeSlots=${freeSlots.length} pointCheck=${pointCheck ? (pointCheck.is_free ? "FREE" : "BUSY") : "N/A"}`);

    // Deduplicate conflicts
    const seenConflicts = new Set<string>();
    const uniqueConflicts = conflicts.filter((c) => {
      const key = JSON.stringify(c);
      if (seenConflicts.has(key)) return false;
      seenConflicts.add(key);
      return true;
    });

    return c.json({
      timezone: timezone || "UTC",
      range: { start_at, end_at },
      rules_applied: {
        buffer_before_minutes: rules?.buffer_before_minutes || 0,
        buffer_after_minutes: rules?.buffer_after_minutes || 0,
      },
      free_slots: freeSlots,
      conflicts: uniqueConflicts,
      point_check: pointCheck,
    });
  } catch (e) {
    console.log("Availability query error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// Helper to expand weekly recurring slots into actual time ranges (timezone-aware)
function getWeeklySlots(
  dow: string,
  startTime: string,
  endTime: string,
  rangeStart: Date,
  rangeEnd: Date,
  timezone: string
): { start: number; end: number }[] {
  const dayMap: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  const targetDay = dayMap[dow.toLowerCase()];
  if (targetDay === undefined) return [];

  const tz = timezone || "UTC";
  const results: { start: number; end: number }[] = [];
  const [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);

  // Iterate day-by-day, using timezone-aware day-of-week detection
  const current = new Date(rangeStart.getTime() - 24 * 60 * 60 * 1000); // 1 day buffer for TZ edge cases
  const rangeEndMs = rangeEnd.getTime() + 24 * 60 * 60 * 1000;

  while (current.getTime() < rangeEndMs) {
    const localParts = utcToTzParts(current.toISOString(), tz);

    if (localParts.dayOfWeek === targetDay) {
      // Build slot start/end in the user's local timezone, then convert to UTC
      const dateStr = `${localParts.year}-${String(localParts.month).padStart(2, "0")}-${String(localParts.day).padStart(2, "0")}`;
      const slotStartUtc = tzToUtc(`${dateStr}T${String(startH).padStart(2, "0")}:${String(startM).padStart(2, "0")}:00`, tz);
      const slotEndUtc = tzToUtc(`${dateStr}T${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}:00`, tz);

      const slotStartMs = new Date(slotStartUtc).getTime();
      const slotEndMs = new Date(slotEndUtc).getTime();

      if (slotEndMs > rangeStart.getTime() && slotStartMs < rangeEnd.getTime()) {
        results.push({
          start: Math.max(slotStartMs, rangeStart.getTime()),
          end: Math.min(slotEndMs, rangeEnd.getTime()),
        });
      }
    }
    current.setTime(current.getTime() + 24 * 60 * 60 * 1000);
  }

  return results;
}

// ===== SUGGEST TIME BLOCK FOR TASK =====
app.post(`${PREFIX}/tasks/:id/suggest-time-block`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const taskId = c.req.param("id");
    let task = await kv.get(`task:${user.id}:${taskId}`);
    if (!task) return c.json({ error: "Task not found" }, 404);

    const userProfile = await kv.get(`user:${user.id}`);
    const tz = userProfile?.timezone || "UTC";
    const duration = task.estimate_minutes || 30;

    // Search next 7 days for available slots during work hours
    const now = new Date();
    const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const availResp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/make-server-d1909ddd/availability/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
        "X-User-Token": c.req.header("X-User-Token") || "",
      },
      body: JSON.stringify({
        start_at: now.toISOString(),
        end_at: weekLater.toISOString(),
        timezone: tz,
        mode: "work_hours",
        duration_minutes: duration,
      }),
    });

    const avail = await availResp.json();
    const suggestions = (avail.free_slots || []).slice(0, 3).map((slot: any) => ({
      start_at: slot.start_at,
      end_at: new Date(new Date(slot.start_at).getTime() + duration * 60000).toISOString(),
    }));

    task.suggested_time_blocks = suggestions;
    task.updated_at = new Date().toISOString();
    await kv.set(`task:${user.id}:${taskId}`, task);

    return c.json({ suggestions, task });
  } catch (e) {
    console.log("Suggest time block error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// ===== ICS / iCAL URL CALENDAR CONNECTIONS =====

/**
 * Robust check for whether a response body looks like iCalendar data.
 * Strips BOM, trims whitespace, and does a case-insensitive search.
 */
function looksLikeIcal(text: string): boolean {
  const cleaned = text.replace(/^\uFEFF/, "").trim();
  return /BEGIN:VCALENDAR/i.test(cleaned);
}

/**
 * Normalise raw iCal text before parsing: strip BOM, trim whitespace.
 */
function normalizeIcalText(text: string): string {
  return text.replace(/^\uFEFF/, "").trim();
}

// Timezone-aware ICS parser: extracts VEVENT blocks, handles TZID, floating time, and UTC
function parseIcsEvents(icsText: string, userTimezone: string): Array<{
  uid: string;
  recurrenceId: string | null;
  summary: string;
  description: string | null;
  location: string | null;
  dtstart: string;
  dtend: string;
  isAllDay: boolean;
  status: string;
  rrule: string | null;
}> {
  const events: any[] = [];
  const unfolded = icsText.replace(/\r\n[ \t]/g, "").replace(/\r/g, "");
  const lines = unfolded.split("\n");

  let inEvent = false;
  let current: Record<string, string> = {};
  let currentTzids: Record<string, string> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "BEGIN:VEVENT") {
      inEvent = true;
      current = {};
      currentTzids = {};
      continue;
    }
    if (trimmed === "END:VEVENT") {
      inEvent = false;
      const rawStart = current["DTSTART"] || current["DTSTART;VALUE=DATE"] || "";
      const rawEnd = current["DTEND"] || current["DTEND;VALUE=DATE"] || rawStart;
      if (!rawStart) continue;

      const isAllDay = !!(current["DTSTART;VALUE=DATE"] || (rawStart.length === 8));
      const startTzid = currentTzids["DTSTART"];
      const endTzid = currentTzids["DTEND"];

      events.push({
        uid: current["UID"] || crypto.randomUUID(),
        recurrenceId: current["RECURRENCE-ID"] || null,
        summary: cleanIcsText(current["SUMMARY"]) || "(No title)",
        description: current["DESCRIPTION"] || null, // description cleaned client-side
        location: cleanIcsText(current["LOCATION"]),
        dtstart: parseIcsDateTz(rawStart, startTzid, userTimezone, isAllDay),
        dtend: parseIcsDateTz(rawEnd, endTzid, userTimezone, isAllDay),
        isAllDay,
        status: (current["STATUS"] || "CONFIRMED").toLowerCase(),
        rrule: current["RRULE"] || null,
      });
      continue;
    }
    if (inEvent) {
      const colonIdx = trimmed.indexOf(":");
      if (colonIdx > 0) {
        const key = trimmed.substring(0, colonIdx);
        const value = trimmed.substring(colonIdx + 1);
        current[key] = value;
        const baseProp = key.split(";")[0];
        if (baseProp !== key) {
          if (!current[baseProp]) current[baseProp] = value;
          if (key.includes("VALUE=DATE")) {
            current[baseProp + ";VALUE=DATE"] = value;
          }
          // Extract TZID parameter
          const tzidMatch = key.match(/TZID=([^;:]+)/);
          if (tzidMatch) currentTzids[baseProp] = tzidMatch[1].replace(/"/g, "");
        }
      }
    }
  }
  return events;
}

// Parse ICS date with TZID awareness → always returns UTC ISO string
function parseIcsDateTz(dt: string, tzid: string | undefined, userTimezone: string, isAllDay: boolean): string {
  const clean = (dt.includes(":") ? dt.replace(/^.*:/, "") : dt) || dt;

  // All-day: YYYYMMDD → midnight in user timezone, converted to UTC.
  // All-day dates are "floating" per RFC 5545 — they have no intrinsic timezone,
  // so we anchor them to the user's profile timezone to keep the calendar date correct.
  if (/^\d{8}$/.test(clean)) {
    const isoLocal = `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}T00:00:00`;
    try {
      return tzToUtc(isoLocal, userTimezone);
    } catch {
      return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}T00:00:00Z`;
    }
  }
  // UTC explicit: YYYYMMDDTHHMMSSZ
  if (/^\d{8}T\d{6}Z$/.test(clean)) {
    return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}T${clean.slice(9, 11)}:${clean.slice(11, 13)}:${clean.slice(13, 15)}Z`;
  }
  // Local time (with or without TZID): YYYYMMDDTHHMMSS
  if (/^\d{8}T\d{6}$/.test(clean)) {
    const isoLocal = `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}T${clean.slice(9, 11)}:${clean.slice(11, 13)}:${clean.slice(13, 15)}`;
    // If TZID provided, interpret in that timezone; otherwise floating → user timezone
    const tz = tzid || userTimezone;
    try {
      return tzToUtc(isoLocal, tz);
    } catch {
      // If specific TZID failed (e.g. custom/invalid ID), fallback to user timezone (treat as floating)
      // This is better than UTC fallback which shifts the wall clock time
      try {
        return tzToUtc(isoLocal, userTimezone);
      } catch {
        return isoLocal + "Z";
      }
    }
  }
  return clean;
}

// Basic RRULE expansion: expands recurring events into instances within the sync window
function expandRrule(
  event: any,
  syncWindowStart: number,
  syncWindowEnd: number,
): any[] {
  if (!event.rrule) return [event];

  const rruleParts: Record<string, string> = {};
  event.rrule.split(";").forEach((part: string) => {
    const [k, v] = part.split("=");
    if (k && v) rruleParts[k] = v;
  });

  const freq = rruleParts["FREQ"];
  const count = rruleParts["COUNT"] ? parseInt(rruleParts["COUNT"]) : null;
  const until = rruleParts["UNTIL"]
    ? new Date(rruleParts["UNTIL"].includes("T")
        ? parseIcsDateTz(rruleParts["UNTIL"], undefined, "UTC", false)
        : `${rruleParts["UNTIL"].slice(0,4)}-${rruleParts["UNTIL"].slice(4,6)}-${rruleParts["UNTIL"].slice(6,8)}T23:59:59Z`
      ).getTime()
    : null;
  const interval = rruleParts["INTERVAL"] ? parseInt(rruleParts["INTERVAL"]) : 1;
  const byDay = rruleParts["BYDAY"]?.split(",") || null;

  const baseStart = new Date(event.dtstart).getTime();
  const duration = new Date(event.dtend).getTime() - baseStart;
  const instances: any[] = [];
  const maxInstances = 500;

  let current = baseStart;
  let generated = 0;
  const endLimit = Math.min(syncWindowEnd, until || Infinity);

  while (current <= endLimit && generated < maxInstances) {
    if (count !== null && generated >= count) break;

    const instanceEnd = current + duration;
    if (instanceEnd > syncWindowStart && current < syncWindowEnd) {
      const startIso = new Date(current).toISOString();
      instances.push({
        ...event,
        dtstart: startIso,
        dtend: new Date(instanceEnd).toISOString(),
        recurrenceId: event.recurrenceId || startIso,
        rrule: null,
      });
    }
    generated++;

    const d = new Date(current);
    switch (freq) {
      case "DAILY":
        d.setDate(d.getDate() + interval);
        current = d.getTime();
        break;
      case "WEEKLY": {
        if (byDay && byDay.length > 0) {
          const dayMap: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
          let found = false;
          for (let i = 1; i <= 7 * interval + 7; i++) {
            const next = new Date(current + i * 86400000);
            const nextDayNum = next.getUTCDay();
            const dayStr = Object.keys(dayMap).find((k) => dayMap[k] === nextDayNum);
            if (dayStr && byDay.includes(dayStr)) {
              const orig = new Date(baseStart);
              next.setUTCHours(orig.getUTCHours(), orig.getUTCMinutes(), orig.getUTCSeconds());
              current = next.getTime();
              found = true;
              break;
            }
          }
          if (!found) {
            d.setDate(d.getDate() + 7 * interval);
            current = d.getTime();
          }
        } else {
          d.setDate(d.getDate() + 7 * interval);
          current = d.getTime();
        }
        break;
      }
      case "MONTHLY":
        d.setMonth(d.getMonth() + interval);
        current = d.getTime();
        break;
      case "YEARLY":
        d.setFullYear(d.getFullYear() + interval);
        current = d.getTime();
        break;
      default:
        return instances.length > 0 ? instances : [event];
    }
  }
  return instances.length > 0 ? instances : [event];
}

// Helper: sync ICS calendar events for a connection (upsert-based, with ETag + throttle)
async function syncIcsCalendarEvents(userId: string, connection: any, force: boolean = false) {
  const icsUrl = connection.ics_url;
  if (!icsUrl) throw new Error("No ICS URL configured for this connection");

  // Throttle: skip if synced within last 15 minutes unless forced
  if (!force && connection.last_sync_at) {
    const lastSync = new Date(connection.last_sync_at).getTime();
    if (Date.now() - lastSync < 15 * 60 * 1000) {
      console.log(`ICS sync throttled for connection ${connection.id} (last sync ${connection.last_sync_at})`);
      return 0;
    }
  }

  console.log(`Fetching ICS feed from ${icsUrl} for user ${userId}`);

  // Build conditional request headers for incremental sync
  const fetchHeaders: Record<string, string> = {
    "Accept": "text/calendar, application/calendar+json, text/plain",
    "User-Agent": "Chrono-Calendar-Sync/1.0",
  };
  if (connection.ics_etag) fetchHeaders["If-None-Match"] = connection.ics_etag;
  if (connection.ics_last_modified) fetchHeaders["If-Modified-Since"] = connection.ics_last_modified;

  const res = await fetch(icsUrl, { headers: fetchHeaders });

  // 304 Not Modified — feed hasn't changed
  if (res.status === 304) {
    console.log(`ICS feed not modified for connection ${connection.id}`);
    connection.last_sync_at = new Date().toISOString();
    connection.updated_at = new Date().toISOString();
    await kv.set(`cal_conn:${userId}:${connection.id}`, connection);
    return 0;
  }

  if (!res.ok) {
    throw new Error(`Failed to fetch ICS feed: HTTP ${res.status} ${res.statusText}`);
  }

  // Cache ETag / Last-Modified for the next conditional request
  const newEtag = res.headers.get("ETag");
  const newLastModified = res.headers.get("Last-Modified");
  if (newEtag) connection.ics_etag = newEtag;
  if (newLastModified) connection.ics_last_modified = newLastModified;

  const rawIcsText = await res.text();
  if (!looksLikeIcal(rawIcsText)) {
    console.log("ICS sync validation failure – first 300 chars:", rawIcsText.slice(0, 300));
    throw new Error("Invalid ICS feed: missing VCALENDAR header.");
  }
  const icsText = normalizeIcalText(rawIcsText);

  // Get user timezone for floating time interpretation
  const userProfile = await kv.get(`user:${userId}`);
  const userTimezone = userProfile?.timezone || "UTC";

  const parsedEvents = parseIcsEvents(icsText, userTimezone);
  console.log(`Parsed ${parsedEvents.length} raw events from ICS feed for user ${userId}`);

  // Expand recurrences within the sync window (-30d to +180d)
  const syncWindowStart = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const syncWindowEnd = Date.now() + 180 * 24 * 60 * 60 * 1000;

  let allInstances: any[] = [];
  for (const ev of parsedEvents) {
    allInstances.push(...expandRrule(ev, syncWindowStart, syncWindowEnd));
  }

  // Filter to sync window and exclude cancelled
  allInstances = allInstances.filter((ev) => {
    const s = new Date(ev.dtstart).getTime();
    const e = new Date(ev.dtend).getTime();
    return e > syncWindowStart && s < syncWindowEnd && ev.status !== "cancelled";
  });

  // Build stable provider_event_id: UID::RECURRENCE-ID-or-startISO
  const newEventMap = new Map<string, any>();
  for (const ev of allInstances) {
    const providerEventId = `${ev.uid}::${ev.recurrenceId || ev.dtstart}`;
    newEventMap.set(providerEventId, ev);
  }

  // Get existing events for this connection for upsert
  const existingEvents = await getAllByPrefix(`event:${userId}:`);
  const connEvents = existingEvents.filter((e: any) => e.connection_id === connection.id);
  const existingMap = new Map<string, any>();
  for (const e of connEvents) {
    const key = e.provider_event_id || e.external_event_id;
    if (key) existingMap.set(key, e);
  }

  const toSetKeys: string[] = [];
  const toSetValues: any[] = [];
  const toDelKeys: string[] = [];
  let importedCount = 0;

  // Prepare batch upsert for new + updated events
  for (const [providerEventId, icsEv] of newEventMap) {
    const existing = existingMap.get(providerEventId);
    const eventId = existing?.id || uuid();

    const cachedEvent = {
      id: eventId,
      user_id: userId,
      connection_id: connection.id,
      provider: "ics",
      provider_event_id: providerEventId,
      source_calendar_id: connection.ics_url,
      external_event_id: icsEv.uid,
      title: icsEv.summary,
      description: icsEv.description,
      location: icsEv.location,
      start_at: icsEv.dtstart,
      end_at: icsEv.dtend,
      is_all_day: icsEv.isAllDay,
      status: icsEv.status || "confirmed",
      updated_at_provider: null,
      created_at: existing?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    toSetKeys.push(`event:${userId}:${eventId}`);
    toSetValues.push(cachedEvent);
    importedCount++;
    existingMap.delete(providerEventId);
  }

  // Identify stale events to delete
  for (const [, oldEvent] of existingMap) {
    toDelKeys.push(`event:${userId}:${oldEvent.id}`);
  }

  // Execute batch writes (chunked)
  const CHUNK_SIZE = 50;
  for (let i = 0; i < toSetKeys.length; i += CHUNK_SIZE) {
    const keys = toSetKeys.slice(i, i + CHUNK_SIZE);
    const values = toSetValues.slice(i, i + CHUNK_SIZE);
    await kv.mset(keys, values);
  }

  // Execute batch deletes
  if (toDelKeys.length > 0) {
    for (let i = 0; i < toDelKeys.length; i += CHUNK_SIZE) {
      const keys = toDelKeys.slice(i, i + CHUNK_SIZE);
      await kv.mdel(keys);
    }
  }

  // Update connection metadata
  connection.last_sync_at = new Date().toISOString();
  connection.updated_at = new Date().toISOString();
  await kv.set(`cal_conn:${userId}:${connection.id}`, connection);

  console.log(`Imported ${importedCount} ICS events (removed ${existingMap.size} stale) for user ${userId} from ${icsUrl}`);
  return importedCount;
}

// POST /calendars/ics/connect — add an ICS/iCal URL as a calendar connection
app.post(`${PREFIX}/calendars/ics/connect`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const body = await c.req.json();
    const { url, name } = body;

    if (!url) {
      return c.json({ error: "ICS URL is required" }, 400);
    }

    // Basic URL validation
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return c.json({ error: "Invalid URL format" }, 400);
    }

    if (!["http:", "https:", "webcal:"].includes(parsedUrl.protocol)) {
      return c.json({ error: "URL must use http, https, or webcal protocol" }, 400);
    }

    // Normalize webcal:// to https://
    const normalizedUrl = url.replace(/^webcal:\/\//, "https://");

    // Check for duplicate ICS URL
    const existingConnections = await kv.getByPrefix(`cal_conn:${user.id}:`);
    const duplicate = existingConnections.find(
      (conn: any) => conn.provider === "ics" && conn.ics_url === normalizedUrl && conn.is_active
    );
    if (duplicate) {
      // Idempotent handling: if already connected, update name if provided, sync, and return success
      if (name) {
        duplicate.display_name = name;
        duplicate.updated_at = new Date().toISOString();
        await kv.set(`cal_conn:${user.id}:${duplicate.id}`, duplicate);
      }

      // Trigger sync
      let count = 0;
      try {
        count = await syncIcsCalendarEvents(user.id, duplicate, true);
      } catch (syncErr) {
        console.log("ICS re-connect sync error:", syncErr);
      }

      return c.json({
        id: duplicate.id,
        provider: "ics",
        display_name: duplicate.display_name,
        ics_url: duplicate.ics_url,
        event_count: count,
        is_active: true,
        created_at: duplicate.created_at,
        message: "Calendar already connected"
      }, 200);
    }

    // Try to fetch and validate the ICS feed
    let eventCount = 0;
    try {
      const testRes = await fetch(normalizedUrl, {
        headers: {
          "Accept": "text/calendar, application/calendar+json, text/plain",
          "User-Agent": "Chrono-Calendar-Sync/1.0",
        },
      });
      if (!testRes.ok) {
        return c.json({ error: `Could not fetch ICS feed: HTTP ${testRes.status}` }, 400);
      }
      const testText = await testRes.text();
      if (!looksLikeIcal(testText)) {
        console.log("ICS connect validation failure – Content-Type:", testRes.headers.get("content-type"), "first 300 chars:", testText.slice(0, 300));
        return c.json({ error: "URL does not point to a valid ICS/iCal feed" }, 400);
      }
      // Count events for display
      const parsed = parseIcsEvents(normalizeIcalText(testText), "UTC");
      eventCount = parsed.length;
    } catch (fetchErr) {
      console.log("ICS URL validation fetch error:", fetchErr);
      return c.json({ error: `Could not reach ICS URL: ${errorString(fetchErr)}` }, 400);
    }

    // Derive a display name
    const displayName = name || parsedUrl.hostname || "ICS Calendar";

    const connectionId = uuid();
    const connection = {
      id: connectionId,
      user_id: user.id,
      provider: "ics",
      display_name: displayName,
      external_account_id: null,
      access_token: null,
      refresh_token: null,
      token_expires_at: null,
      default_calendar_id: null,
      ics_url: normalizedUrl,
      last_sync_at: null,
      sync_cursor: null,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await kv.set(`cal_conn:${user.id}:${connectionId}`, connection);
    
    // Update grants count
    await updateCalendarShareGrants(user.id);

    // Trigger initial sync
    try {
      await syncIcsCalendarEvents(user.id, connection, true);
    } catch (syncErr) {
      console.log("ICS initial sync error (non-fatal):", syncErr);
    }

    return c.json({
      id: connectionId,
      provider: "ics",
      display_name: displayName,
      ics_url: normalizedUrl,
      event_count: eventCount,
      is_active: true,
      created_at: connection.created_at,
    }, 201);
  } catch (e) {
    console.log("ICS connect error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// POST /calendars/ics/sync — manually trigger sync for ICS connections
app.post(`${PREFIX}/calendars/ics/sync`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const { connection_id } = await c.req.json().catch(() => ({}));
    const connections = await kv.getByPrefix(`cal_conn:${user.id}:`);
    const icsConns = connections.filter((conn: any) => conn.provider === "ics" && conn.is_active);

    if (connection_id) {
      const conn = icsConns.find((c: any) => c.id === connection_id);
      if (!conn) return c.json({ error: "ICS connection not found" }, 404);
      const count = await syncIcsCalendarEvents(user.id, conn, true);
      return c.json({ ok: true, synced: 1, events_imported: count });
    }

    // Sync all ICS connections (manual trigger = force)
    let totalEvents = 0;
    for (const conn of icsConns) {
      totalEvents += await syncIcsCalendarEvents(user.id, conn, true);
    }
    return c.json({ ok: true, synced: icsConns.length, events_imported: totalEvents });
  } catch (e) {
    console.log("ICS sync error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// ===== CalDAV SUPPORT =====

/** Simple XML helper: extract text content of first matching tag (non-namespace-aware) */
function xmlTagContent(xml: string, tag: string): string | null {
  const re = new RegExp(`<(?:[a-zA-Z0-9_-]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9_-]+:)?${tag}>`, "i");
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

/** Extract all calendar-data (VCALENDAR blocks) from a CalDAV REPORT multistatus response */
function extractCalendarDataBlocks(xml: string): string[] {
  const blocks: string[] = [];
  const re = /<(?:[a-zA-Z0-9_-]+:)?calendar-data[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9_-]+:)?calendar-data>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    let data = m[1].trim();
    data = data.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#13;/g, "\r");
    if (data.includes("BEGIN:VCALENDAR")) blocks.push(data);
  }
  return blocks;
}

/** PROPFIND with full CalDAV auto-discovery (.well-known, principal, calendar-home-set) */
async function caldavPropfind(url: string, username: string, password: string): Promise<{ displayName: string; calendarUrl: string }> {
  const authHeader = "Basic " + btoa(`${username}:${password}`);
  const baseObj = new URL(url);
  const origin = `${baseObj.protocol}//${baseObj.host}`;

  // Helper: resolve href relative to origin
  const resolveHref = (href: string) => href.startsWith("http") ? href : `${origin}${href}`;

  // Helper: do a PROPFIND with given body
  const doPropfind = async (targetUrl: string, body: string, depth = "0", followRedirects = false) => {
    const opts: any = {
      method: "PROPFIND",
      headers: {
        "Authorization": authHeader,
        "Content-Type": "application/xml; charset=utf-8",
        "Depth": depth,
        "User-Agent": "Chrono-CalDAV-Sync/1.0",
      },
      body,
    };
    if (followRedirects) opts.redirect = "manual";
    return fetch(targetUrl, opts);
  };

  const cupBody = `<?xml version="1.0" encoding="UTF-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>`;
  const homeBody = `<?xml version="1.0" encoding="UTF-8"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>`;
  const listBody = `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:" xmlns:cs="urn:ietf:params:xml:ns:caldav" xmlns:c="http://apple.com/ns/ical/">
  <d:prop><d:displayname/><d:resourcetype/><cs:supported-calendar-component-set/></d:prop>
</d:propfind>`;

  // --- Step 1: .well-known/caldav auto-discovery ---
  let effectiveUrl = url;
  try {
    const wellKnownUrl = `${origin}/.well-known/caldav`;
    console.log("CalDAV discovery: trying", wellKnownUrl);
    const wkRes = await doPropfind(wellKnownUrl, cupBody, "0", true);
    if ([301, 302, 303, 307, 308].includes(wkRes.status)) {
      const loc = wkRes.headers.get("Location");
      if (loc) {
        effectiveUrl = resolveHref(loc);
        console.log("CalDAV discovery: well-known redirected to", effectiveUrl);
      }
    } else if (wkRes.status === 207 || wkRes.ok) {
      const wkXml = await wkRes.text();
      console.log("CalDAV discovery: well-known 207 response (first 800):", wkXml.slice(0, 800));
      const cupHrefMatch = wkXml.match(/<(?:[a-zA-Z0-9_-]+:)?current-user-principal[^>]*>[\s\S]*?<(?:[a-zA-Z0-9_-]+:)?href[^>]*>([^<]+)<\/(?:[a-zA-Z0-9_-]+:)?href>/i);
      if (cupHrefMatch?.[1]) {
        effectiveUrl = resolveHref(cupHrefMatch[1].trim());
        console.log("CalDAV discovery: principal from well-known:", effectiveUrl);
      }
    }
  } catch (wkErr) {
    console.log("CalDAV discovery: well-known failed (non-fatal):", wkErr);
  }

  // --- Step 2: Find current-user-principal ---
  let principalUrl = effectiveUrl;
  try {
    const cupRes = await doPropfind(effectiveUrl, cupBody, "0");
    if (cupRes.status === 401 || cupRes.status === 403) {
      throw new Error("Authentication failed — check username and password");
    }
    if (cupRes.status === 207 || cupRes.ok) {
      const cupXml = await cupRes.text();
      console.log("CalDAV discovery: principal PROPFIND (first 800):", cupXml.slice(0, 800));
      const cupMatch = cupXml.match(/<(?:[a-zA-Z0-9_-]+:)?current-user-principal[^>]*>[\s\S]*?<(?:[a-zA-Z0-9_-]+:)?href[^>]*>([^<]+)<\/(?:[a-zA-Z0-9_-]+:)?href>/i);
      if (cupMatch?.[1]) {
        principalUrl = resolveHref(cupMatch[1].trim());
        console.log("CalDAV discovery: resolved principal to", principalUrl);
      }
    }
  } catch (cupErr: any) {
    if (cupErr.message?.includes("Authentication failed")) throw cupErr;
    console.log("CalDAV discovery: principal lookup failed (non-fatal):", cupErr);
  }

  // --- Step 3: Find calendar-home-set ---
  let calHomeUrl = principalUrl;
  try {
    const homeRes = await doPropfind(principalUrl, homeBody, "0");
    if (homeRes.status === 207 || homeRes.ok) {
      const homeXml = await homeRes.text();
      console.log("CalDAV discovery: calendar-home-set PROPFIND (first 800):", homeXml.slice(0, 800));
      const homeMatch = homeXml.match(/<(?:[a-zA-Z0-9_-]+:)?calendar-home-set[^>]*>[\s\S]*?<(?:[a-zA-Z0-9_-]+:)?href[^>]*>([^<]+)<\/(?:[a-zA-Z0-9_-]+:)?href>/i);
      if (homeMatch?.[1]) {
        calHomeUrl = resolveHref(homeMatch[1].trim());
        console.log("CalDAV discovery: resolved calendar-home-set to", calHomeUrl);
      }
    }
  } catch (homeErr) {
    console.log("CalDAV discovery: calendar-home-set failed (non-fatal):", homeErr);
  }

  // --- Step 4: List calendar collections ---
  const res = await doPropfind(calHomeUrl, listBody, "1");

  if (res.status === 401 || res.status === 403) {
    throw new Error("Authentication failed — check username and password");
  }
  if (!res.ok && res.status !== 207) {
    throw new Error(`CalDAV server returned HTTP ${res.status}: ${res.statusText}`);
  }

  const xml = await res.text();
  console.log("CalDAV discovery: calendar listing (first 1500):", xml.slice(0, 1500));

  // Parse <response> blocks to find actual calendar collections (<calendar/> in resourcetype)
  const responses = xml.split(/<(?:[a-zA-Z0-9_-]+:)?response[^>]*>/i).slice(1);
  let bestCalendarUrl = calHomeUrl;
  let bestDisplayName = baseObj.hostname;

  for (const respBlock of responses) {
    const isCalendar = /<(?:[a-zA-Z0-9_-]+:)?calendar\s*\/?\s*>/i.test(respBlock);
    if (isCalendar) {
      const hrefMatch = respBlock.match(/<(?:[a-zA-Z0-9_-]+:)?href[^>]*>([^<]+)<\/(?:[a-zA-Z0-9_-]+:)?href>/i);
      const nameMatch = respBlock.match(/<(?:[a-zA-Z0-9_-]+:)?displayname[^>]*>([^<]+)<\/(?:[a-zA-Z0-9_-]+:)?displayname>/i);
      if (hrefMatch?.[1]) {
        bestCalendarUrl = resolveHref(hrefMatch[1].trim());
        bestDisplayName = nameMatch?.[1]?.trim() || bestDisplayName;
        console.log("CalDAV discovery: found calendar:", bestCalendarUrl, "name:", bestDisplayName);
        break; // Use first calendar found
      }
    }
  }

  if (bestCalendarUrl === calHomeUrl) {
    bestDisplayName = xmlTagContent(xml, "displayname") || baseObj.hostname;
    console.log("CalDAV discovery: no calendar collection found, using:", calHomeUrl);
  }

  return { displayName: bestDisplayName, calendarUrl: bestCalendarUrl };
}

/** REPORT calendar-query to fetch events from a CalDAV calendar */
async function caldavReport(url: string, username: string, password: string, startIso: string, endIso: string): Promise<string[]> {
  const authHeader = "Basic " + btoa(`${username}:${password}`);
  const fmt = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const start = fmt(startIso);
  const end = fmt(endIso);

  const reportBody = `<?xml version="1.0" encoding="UTF-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag/>
    <c:calendar-data/>
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        <c:time-range start="${start}" end="${end}"/>
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`;

  const res = await fetch(url, {
    method: "REPORT",
    headers: {
      "Authorization": authHeader,
      "Content-Type": "application/xml; charset=utf-8",
      "Depth": "1",
      "User-Agent": "Chrono-CalDAV-Sync/1.0",
    },
    body: reportBody,
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error("Authentication failed during sync");
  }
  if (!res.ok && res.status !== 207) {
    throw new Error(`CalDAV REPORT returned HTTP ${res.status}: ${res.statusText}`);
  }

  const xml = await res.text();
  return extractCalendarDataBlocks(xml);
}

/** Sync CalDAV calendar events — mirrors syncIcsCalendarEvents logic */
async function syncCaldavCalendarEvents(userId: string, connection: any, force: boolean = false): Promise<number> {
  const caldavUrl = connection.caldav_url;
  const username = connection.caldav_username;
  const password = connection.caldav_password;

  if (!caldavUrl || !username || !password) {
    throw new Error("CalDAV connection missing URL, username, or password");
  }

  if (!force && connection.last_sync_at) {
    const lastSync = new Date(connection.last_sync_at).getTime();
    if (Date.now() - lastSync < 15 * 60 * 1000) {
      console.log(`CalDAV sync throttled for connection ${connection.id}`);
      return 0;
    }
  }

  console.log(`CalDAV sync: fetching events from ${caldavUrl} for user ${userId}`);

  const syncWindowStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const syncWindowEnd = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();

  const calendarBlocks = await caldavReport(caldavUrl, username, password, syncWindowStart, syncWindowEnd);
  console.log(`CalDAV: got ${calendarBlocks.length} calendar-data blocks`);

  const userProfile = await kv.get(`user:${userId}`);
  const userTimezone = userProfile?.timezone || "UTC";

  let allInstances: any[] = [];
  for (const block of calendarBlocks) {
    const icsText = normalizeIcalText(block);
    const parsedEvents = parseIcsEvents(icsText, userTimezone);
    for (const ev of parsedEvents) {
      allInstances.push(...expandRrule(ev, new Date(syncWindowStart).getTime(), new Date(syncWindowEnd).getTime()));
    }
  }

  allInstances = allInstances.filter((ev) => {
    const s = new Date(ev.dtstart).getTime();
    const e = new Date(ev.dtend).getTime();
    return e > new Date(syncWindowStart).getTime() && s < new Date(syncWindowEnd).getTime() && ev.status !== "cancelled";
  });

  console.log(`CalDAV: ${allInstances.length} event instances after expansion/filter`);

  const newEventMap = new Map<string, any>();
  for (const ev of allInstances) {
    const providerEventId = `${ev.uid}::${ev.recurrenceId || ev.dtstart}`;
    newEventMap.set(providerEventId, ev);
  }

  const existingEvents = await getAllByPrefix(`event:${userId}:`);
  const connEvents = existingEvents.filter((e: any) => e.connection_id === connection.id);
  const existingMap = new Map<string, any>();
  for (const e of connEvents) {
    const key = e.provider_event_id || e.external_event_id;
    if (key) existingMap.set(key, e);
  }

  const toSetKeys: string[] = [];
  const toSetValues: any[] = [];
  const toDelKeys: string[] = [];
  let importedCount = 0;

  for (const [providerEventId, icsEv] of newEventMap) {
    const existing = existingMap.get(providerEventId);
    const eventId = existing?.id || uuid();

    const cachedEvent = {
      id: eventId,
      user_id: userId,
      connection_id: connection.id,
      provider: "caldav",
      provider_event_id: providerEventId,
      source_calendar_id: connection.caldav_url,
      external_event_id: icsEv.uid,
      title: icsEv.summary,
      description: icsEv.description,
      location: icsEv.location,
      start_at: icsEv.dtstart,
      end_at: icsEv.dtend,
      is_all_day: icsEv.isAllDay,
      status: icsEv.status || "confirmed",
      updated_at_provider: null,
      created_at: existing?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    toSetKeys.push(`event:${userId}:${eventId}`);
    toSetValues.push(cachedEvent);
    importedCount++;
    existingMap.delete(providerEventId);
  }

  for (const [, oldEvent] of existingMap) {
    toDelKeys.push(`event:${userId}:${oldEvent.id}`);
  }

  const CHUNK_SIZE = 50;
  for (let i = 0; i < toSetKeys.length; i += CHUNK_SIZE) {
    await kv.mset(toSetKeys.slice(i, i + CHUNK_SIZE), toSetValues.slice(i, i + CHUNK_SIZE));
  }
  if (toDelKeys.length > 0) {
    for (let i = 0; i < toDelKeys.length; i += CHUNK_SIZE) {
      await kv.mdel(toDelKeys.slice(i, i + CHUNK_SIZE));
    }
  }

  connection.last_sync_at = new Date().toISOString();
  connection.updated_at = new Date().toISOString();
  await kv.set(`cal_conn:${userId}:${connection.id}`, connection);

  console.log(`CalDAV: imported ${importedCount} events (removed ${toDelKeys.length} stale) for user ${userId}`);
  return importedCount;
}

// POST /calendars/caldav/connect — add a CalDAV calendar connection
app.post(`${PREFIX}/calendars/caldav/connect`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const body = await c.req.json();
    const { url, username, password, name } = body;

    if (!url) return c.json({ error: "CalDAV URL is required" }, 400);
    if (!username) return c.json({ error: "Username is required" }, 400);
    if (!password) return c.json({ error: "Password is required" }, 400);

    let parsedUrl: URL;
    try { parsedUrl = new URL(url); } catch { return c.json({ error: "Invalid URL format" }, 400); }
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return c.json({ error: "CalDAV URL must use http or https" }, 400);
    }

    const normalizedUrl = url.endsWith("/") ? url : url + "/";

    // Check for duplicate (match on username + either user-entered URL or discovered URL)
    const existingConnections = await kv.getByPrefix(`cal_conn:${user.id}:`);
    const duplicate = existingConnections.find(
      (conn: any) => conn.provider === "caldav" && conn.caldav_username === username &&
        (conn.caldav_url === normalizedUrl || conn.caldav_entered_url === normalizedUrl) && conn.is_active
    );
    if (duplicate) {
      duplicate.caldav_password = password;
      if (name) duplicate.display_name = name;
      duplicate.updated_at = new Date().toISOString();
      await kv.set(`cal_conn:${user.id}:${duplicate.id}`, duplicate);

      let count = 0;
      try { count = await syncCaldavCalendarEvents(user.id, duplicate, true); } catch (syncErr) {
        console.log("CalDAV re-connect sync error:", syncErr);
      }

      return c.json({
        id: duplicate.id, provider: "caldav", display_name: duplicate.display_name,
        caldav_url: duplicate.caldav_url, event_count: count, is_active: true,
        created_at: duplicate.created_at, message: "Calendar already connected (credentials updated)",
      }, 200);
    }

    // Validate connection with PROPFIND
    let caldavInfo: { displayName: string; calendarUrl: string };
    try {
      caldavInfo = await caldavPropfind(normalizedUrl, username, password);
    } catch (e) {
      console.log("CalDAV PROPFIND validation error:", e);
      return c.json({ error: `CalDAV connection failed: ${errorString(e)}` }, 400);
    }

    // Use the discovered calendar URL (may differ from user-entered URL after auto-discovery)
    const discoveredCalUrl = caldavInfo.calendarUrl || normalizedUrl;
    console.log("CalDAV connect: user entered", normalizedUrl, "-> discovered calendar URL:", discoveredCalUrl);

    const displayName = name || caldavInfo.displayName || parsedUrl.hostname;
    const connectionId = uuid();
    const connection = {
      id: connectionId,
      user_id: user.id,
      provider: "caldav",
      display_name: displayName,
      external_account_id: username,
      access_token: null,
      refresh_token: null,
      token_expires_at: null,
      default_calendar_id: null,
      caldav_url: discoveredCalUrl,
      caldav_entered_url: normalizedUrl,
      caldav_username: username,
      caldav_password: password,
      ics_url: null,
      last_sync_at: null,
      sync_cursor: null,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await kv.set(`cal_conn:${user.id}:${connectionId}`, connection);

    // Update share grants count
    await updateCalendarShareGrants(user.id);

    let eventCount = 0;
    try {
      eventCount = await syncCaldavCalendarEvents(user.id, connection, true);
    } catch (syncErr) {
      console.log("CalDAV initial sync error (non-fatal):", syncErr);
    }

    return c.json({
      id: connectionId, provider: "caldav", display_name: displayName,
      caldav_url: discoveredCalUrl, event_count: eventCount, is_active: true,
      created_at: connection.created_at,
    }, 201);
  } catch (e) {
    console.log("CalDAV connect error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// POST /calendars/caldav/sync — manually trigger sync for CalDAV connections
app.post(`${PREFIX}/calendars/caldav/sync`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const { connection_id } = await c.req.json().catch(() => ({}));
    const connections = await kv.getByPrefix(`cal_conn:${user.id}:`);
    const caldavConns = connections.filter((conn: any) => conn.provider === "caldav" && conn.is_active);

    if (connection_id) {
      const conn = caldavConns.find((c: any) => c.id === connection_id);
      if (!conn) return c.json({ error: "CalDAV connection not found" }, 404);
      const count = await syncCaldavCalendarEvents(user.id, conn, true);
      return c.json({ ok: true, synced: 1, events_imported: count });
    }

    let totalEvents = 0;
    for (const conn of caldavConns) {
      totalEvents += await syncCaldavCalendarEvents(user.id, conn, true);
    }
    return c.json({ ok: true, synced: caldavConns.length, events_imported: totalEvents });
  } catch (e) {
    console.log("CalDAV sync error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// ===== ICS EXPORT =====

/** RFC 5545: escape text values */
function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** RFC 5545: fold lines >75 octets */
function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let start = 0;
  while (start < line.length) {
    const maxBytes = start === 0 ? 75 : 74;
    let end = start;
    let byteCount = 0;
    while (end < line.length) {
      const charBytes = encoder.encode(line[end]).length;
      if (byteCount + charBytes > maxBytes) break;
      byteCount += charBytes;
      end++;
    }
    if (end === start) end = start + 1;
    parts.push((start > 0 ? " " : "") + line.slice(start, end));
    start = end;
  }
  return parts.join("\r\n");
}

function icsContent(lines: string[]): string {
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}

function toIcsLocalDt(utcIso: string, tz: string): string {
  const parts = utcToTzParts(utcIso, tz);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${parts.year}${pad(parts.month)}${pad(parts.day)}T${pad(parts.hour)}${pad(parts.minute)}00`;
}

function nowUtcStamp(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "event";
}

// GET /export/ics/event/:id
app.get(`${PREFIX}/export/ics/event/:id`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const eventId = c.req.param("id");
    const event = await kv.get(`event:${user.id}:${eventId}`);
    if (!event) return c.json({ error: "Event not found" }, 404);

    const profile = await kv.get(`user:${user.id}`);
    const tz = profile?.timezone || "UTC";
    const uid = `${event.id}@tracktion.app`;
    const stamp = nowUtcStamp();

    const lines: string[] = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Tracktion//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${stamp}`,
    ];

    if (event.is_all_day) {
      const startDate = event.start_at.slice(0, 10).replace(/-/g, "");
      const endD = new Date(event.end_at.slice(0, 10) + "T12:00:00Z");
      endD.setUTCDate(endD.getUTCDate() + 1);
      const pad = (n: number) => n.toString().padStart(2, "0");
      const endDate = `${endD.getUTCFullYear()}${pad(endD.getUTCMonth() + 1)}${pad(endD.getUTCDate())}`;
      lines.push(`DTSTART;VALUE=DATE:${startDate}`);
      lines.push(`DTEND;VALUE=DATE:${endDate}`);
    } else {
      lines.push(`DTSTART;TZID=${tz}:${toIcsLocalDt(event.start_at, tz)}`);
      lines.push(`DTEND;TZID=${tz}:${toIcsLocalDt(event.end_at, tz)}`);
    }

    lines.push(`SUMMARY:${escapeIcsText(event.title)}`);
    if (event.description) lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
    if (event.location) lines.push(`LOCATION:${escapeIcsText(event.location)}`);
    lines.push(event.status === "cancelled" ? "STATUS:CANCELLED" : "STATUS:CONFIRMED");
    lines.push(event.status === "confirmed" ? "TRANSP:OPAQUE" : "TRANSP:TRANSPARENT");
    lines.push("END:VEVENT");
    lines.push("END:VCALENDAR");

    const body = icsContent(lines);
    const dateStr = event.start_at.slice(0, 10).replace(/-/g, "");
    const filename = `${slugify(event.title)}-${dateStr}.ics`;

    return new Response(body, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    console.log("ICS export event error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// GET /export/ics/reminder/:id
app.get(`${PREFIX}/export/ics/reminder/:id`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const remId = c.req.param("id");
    const reminder = await kv.get(`reminder:${user.id}:${remId}`);
    if (!reminder) return c.json({ error: "Reminder not found" }, 404);
    if (!reminder.due_at) return c.json({ error: "Reminder has no due date" }, 400);

    const profile = await kv.get(`user:${user.id}`);
    const tz = profile?.timezone || "UTC";
    const uid = `${reminder.id}@tracktion.app`;
    const stamp = nowUtcStamp();
    const durationMs = 15 * 60 * 1000; // 15 min default
    const endIso = new Date(new Date(reminder.due_at).getTime() + durationMs).toISOString();

    const lines: string[] = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Tracktion//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=${tz}:${toIcsLocalDt(reminder.due_at, tz)}`,
      `DTEND;TZID=${tz}:${toIcsLocalDt(endIso, tz)}`,
      `SUMMARY:${escapeIcsText(reminder.title)}`,
      "TRANSP:TRANSPARENT",
      "STATUS:CONFIRMED",
      "BEGIN:VALARM",
      "TRIGGER:PT0M",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeIcsText(reminder.title)}`,
      "END:VALARM",
      "END:VEVENT",
      "END:VCALENDAR",
    ];

    const body = icsContent(lines);
    const dateStr = reminder.due_at.slice(0, 10).replace(/-/g, "");
    const filename = `${slugify(reminder.title)}-${dateStr}.ics`;

    return new Response(body, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    console.log("ICS export reminder error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// ===== CONTACTS =====

app.get(`${PREFIX}/contacts`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const contacts = await kv.getByPrefix(`contact:${user.id}:`);
    contacts.sort((a: any, b: any) => a.name.localeCompare(b.name));
    return c.json(contacts);
  } catch (e) {
    console.log("Get contacts error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

app.post(`${PREFIX}/contacts`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const { name, ical_url, notes } = await c.req.json();
    if (!name) return c.json({ error: "name required" }, 400);

    // Validate the iCal URL is reachable and returns valid calendar data
    let normalizedIcalUrl = "";
    if (ical_url && ical_url.trim()) {
      normalizedIcalUrl = ical_url.trim().replace(/^webcal:\/\//, "https://");
      try {
        const testRes = await fetch(normalizedIcalUrl, {
          signal: AbortSignal.timeout(12000),
          headers: {
            "User-Agent": "Chrono-Calendar-Sync/1.0",
            "Accept": "text/calendar, application/calendar+json, text/plain",
          },
        });
        if (!testRes.ok) {
          return c.json({
            error: `Could not reach this calendar link (HTTP ${testRes.status}). The calendar may not be publicly shared. Ask your contact to share their calendar or use a secret iCal link.`,
            code: "ical_unreachable",
            http_status: testRes.status,
          }, 422);
        }
        const testText = await testRes.text();
        const contentType = testRes.headers.get("content-type") || "";
        if (!looksLikeIcal(testText)) {
          const isHtml = contentType.includes("text/html") || testText.trimStart().startsWith("<");
          console.log("Contact iCal validation failure – Content-Type:", contentType, "isHtml:", isHtml, "first 300 chars:", testText.slice(0, 300));
          return c.json({
            error: isHtml
              ? "This URL returned an HTML page instead of calendar data. The calendar may require sign-in or may not be shared publicly. Ask your contact for their secret iCal address."
              : "This URL does not return valid calendar data. Make sure you're using an iCal (.ics) link, not a regular webpage URL.",
            code: "ical_invalid",
          }, 422);
        }
      } catch (fetchErr: any) {
        console.log("Contact iCal validation fetch error:", fetchErr);
        return c.json({
          error: `Could not reach this calendar link (${fetchErr.name === "TimeoutError" ? "request timed out" : "network error"}). The URL may be invalid or the calendar may not be publicly shared.`,
          code: "ical_unreachable",
        }, 422);
      }
    }

    const id = uuid();
    const contact = {
      id,
      user_id: user.id,
      name: name.trim(),
      ical_url: normalizedIcalUrl,
      created_at: new Date().toISOString(),
    };
    await kv.set(`contact:${user.id}:${id}`, contact);
    return c.json(contact, 201);
  } catch (e) {
    console.log("Create contact error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

app.patch(`${PREFIX}/contacts/:id`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const id = c.req.param("id");
    const updates = await c.req.json();
    let contact = await kv.get(`contact:${user.id}:${id}`);
    if (!contact) return c.json({ error: "Contact not found" }, 404);
    
    Object.assign(contact, updates, { updated_at: new Date().toISOString() });
    await kv.set(`contact:${user.id}:${id}`, contact);
    return c.json(contact);
  } catch (e) {
    console.log("Update contact error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

app.delete(`${PREFIX}/contacts/:id`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const id = c.req.param("id");
    await kv.del(`contact:${user.id}:${id}`);
    return c.json({ ok: true });
  } catch (e) {
    console.log("Delete contact error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// POST /contacts/:id/validate — re-check that a contact's iCal link is still reachable
app.post(`${PREFIX}/contacts/:id/validate`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const contactId = c.req.param("id");
    const contact = await kv.get(`contact:${user.id}:${contactId}`);
    if (!contact) return c.json({ error: "Contact not found" }, 404);

    const icalUrl = contact.ical_url.replace(/^webcal:\/\//, "https://");
    try {
      const testRes = await fetch(icalUrl, {
        signal: AbortSignal.timeout(12000),
        headers: {
          "User-Agent": "Chrono-Calendar-Sync/1.0",
          "Accept": "text/calendar, application/calendar+json, text/plain",
        },
      });
      if (!testRes.ok) {
        return c.json({
          valid: false,
          error: "ical_unreachable",
          message: `Calendar link returned HTTP ${testRes.status}. It may no longer be shared.`,
        });
      }
      const testText = await testRes.text();
      if (!looksLikeIcal(testText)) {
        console.log("Contact validate failure – Content-Type:", testRes.headers.get("content-type"), "first 300 chars:", testText.slice(0, 300));
        return c.json({
          valid: false,
          error: "ical_invalid",
          message: "URL no longer returns valid calendar data.",
        });
      }
      // Count events for info
      const userProfile = await kv.get(`user:${user.id}`);
      const tz = userProfile?.timezone || "UTC";
      const events = parseIcsEvents(normalizeIcalText(testText), tz);
      return c.json({ valid: true, event_count: events.length, contact_name: contact.name });
    } catch (fetchErr: any) {
      return c.json({
        valid: false,
        error: "ical_unreachable",
        message: `Could not reach calendar (${fetchErr.name === "TimeoutError" ? "timed out" : "network error"}).`,
      });
    }
  } catch (e) {
    console.log("Validate contact error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// GET /contacts/:id/freebusy?start_at=...&end_at=...
// Fetches the contact's iCal and returns their busy blocks in the given window.
// Re-uses the existing parseIcsEvents / expandRrule helpers already defined above.
app.get(`${PREFIX}/contacts/:id/freebusy`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const contactId = c.req.param("id");
    const contact = await kv.get(`contact:${user.id}:${contactId}`);
    if (!contact) return c.json({ error: "Contact not found" }, 404);

    const start_at = c.req.query("start_at");
    const end_at   = c.req.query("end_at");
    if (!start_at || !end_at) return c.json({ error: "start_at and end_at required" }, 400);

    const rangeStart = new Date(start_at).getTime();
    const rangeEnd   = new Date(end_at).getTime();

    // Grant-based contact: pull events directly from the grantor's stored events
    if (contact.grant_based && contact.friend_id) {
      const grantorEvents = await getAllByPrefix(`event:${contact.friend_id}:`);
      const busy: Array<{ start_at: string; end_at: string; title?: string }> = [];
      const NEARLY_ALL_DAY_MS = 23 * 60 * 60 * 1000; // 23 hours – treat as effectively all-day
      for (const ev of grantorEvents) {
        if (ev.is_all_day) continue; // Never block on all-day events
        if (ev.status === "cancelled") continue;
        const evStart = new Date(ev.start_at).getTime();
        const evEnd = new Date(ev.end_at).getTime();
        // Skip events spanning >= 23 hours (effectively all-day even without the flag)
        if ((evEnd - evStart) >= NEARLY_ALL_DAY_MS) continue;
        if (ev.recurrence_rule) {
          const instances = expandRecurring(ev, rangeStart, rangeEnd);
          for (const inst of instances) {
            if (inst.is_all_day) continue;
            const s = new Date(inst.start_at).getTime();
            const e = new Date(inst.end_at).getTime();
            if ((e - s) >= NEARLY_ALL_DAY_MS) continue; // skip near-full-day recurring instances
            if (s < rangeEnd && e > rangeStart) busy.push({ start_at: inst.start_at, end_at: inst.end_at, title: inst.title });
          }
        } else if (evStart < rangeEnd && evEnd > rangeStart) {
          busy.push({ start_at: ev.start_at, end_at: ev.end_at, title: ev.title });
        }
      }
      return c.json({ contact_id: contactId, contact_name: contact.name, busy });
    }

    // iCal URL-based contact
    if (!contact.ical_url) return c.json({ contact_id: contactId, contact_name: contact.name, busy: [], warning: "No calendar link configured" });
    const icalUrl = contact.ical_url.replace(/^webcal:\/\//, "https://");
    const res = await fetch(icalUrl, {
      signal: AbortSignal.timeout(12000),
      headers: {
        "User-Agent": "Chrono-Calendar-Sync/1.0",
        "Accept": "text/calendar, application/calendar+json, text/plain",
      },
    });
    if (!res.ok) throw new Error(`Failed to fetch iCal: HTTP ${res.status}`);

    const rawIcalText = await res.text();
    if (!looksLikeIcal(rawIcalText)) {
      console.log("Contact freebusy – response is not valid iCal. Content-Type:", res.headers.get("content-type"), "first 300 chars:", rawIcalText.slice(0, 300));
      return c.json({ contact_id: contactId, contact_name: contact.name, busy: [], warning: "Calendar did not return valid iCal data" });
    }
    const icalText = normalizeIcalText(rawIcalText);
    const userProfile = await kv.get(`user:${user.id}`);
    const userTimezone = userProfile?.timezone || "UTC";

    const events = parseIcsEvents(icalText, userTimezone);

    const busy: Array<{ start_at: string; end_at: string }> = [];
    const PAD = 24 * 3600 * 1000; // 1-day pad so edge-spanning events aren't missed
    const ICS_NEARLY_ALL_DAY_MS = 23 * 60 * 60 * 1000;
    for (const ev of events) {
      if (ev.status === "cancelled") continue;
      // Skip all-day events — they are informational and shouldn't block freebusy
      if (ev.isAllDay) continue;
      const instances = expandRrule(ev, rangeStart - PAD, rangeEnd + PAD);
      for (const inst of instances) {
        const s = new Date(inst.dtstart).getTime();
        const e = new Date(inst.dtend).getTime();
        if ((e - s) >= ICS_NEARLY_ALL_DAY_MS) continue; // skip near-full-day events
        if (s < rangeEnd && e > rangeStart) {
          busy.push({ start_at: inst.dtstart, end_at: inst.dtend });
        }
      }
    }

    return c.json({ contact_id: contactId, contact_name: contact.name, busy });
  } catch (e) {
    console.log("Contact freebusy error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// ===== NEWS: GET /news =====
// Timezone-to-locale mapping for Google News RSS
const TZ_TO_LOCALE: Record<string, { hl: string; gl: string; country: string }> = {
  "Australia": { hl: "en-AU", gl: "AU", country: "Australia" },
  "America": { hl: "en-US", gl: "US", country: "United States" },
  "Europe": { hl: "en-GB", gl: "GB", country: "United Kingdom" },
  "Asia": { hl: "en-IN", gl: "IN", country: "India" },
  "Pacific": { hl: "en-AU", gl: "AU", country: "Australia" },
  "Africa": { hl: "en-ZA", gl: "ZA", country: "South Africa" },
};

const CITY_COUNTRY_MAP: Record<string, { hl: string; gl: string }> = {
  "Sydney": { hl: "en-AU", gl: "AU" },
  "Melbourne": { hl: "en-AU", gl: "AU" },
  "Brisbane": { hl: "en-AU", gl: "AU" },
  "Perth": { hl: "en-AU", gl: "AU" },
  "Adelaide": { hl: "en-AU", gl: "AU" },
  "Hobart": { hl: "en-AU", gl: "AU" },
  "Darwin": { hl: "en-AU", gl: "AU" },
  "Auckland": { hl: "en-NZ", gl: "NZ" },
  "Wellington": { hl: "en-NZ", gl: "NZ" },
  "London": { hl: "en-GB", gl: "GB" },
  "Dublin": { hl: "en-IE", gl: "IE" },
  "New_York": { hl: "en-US", gl: "US" },
  "Los_Angeles": { hl: "en-US", gl: "US" },
  "Chicago": { hl: "en-US", gl: "US" },
  "Toronto": { hl: "en-CA", gl: "CA" },
  "Vancouver": { hl: "en-CA", gl: "CA" },
  "Kolkata": { hl: "en-IN", gl: "IN" },
  "Mumbai": { hl: "en-IN", gl: "IN" },
  "Delhi": { hl: "en-IN", gl: "IN" },
  "Tokyo": { hl: "en-JP", gl: "JP" },
  "Singapore": { hl: "en-SG", gl: "SG" },
  "Hong_Kong": { hl: "en-HK", gl: "HK" },
  "Berlin": { hl: "en-DE", gl: "DE" },
  "Paris": { hl: "en-FR", gl: "FR" },
  "Johannesburg": { hl: "en-ZA", gl: "ZA" },
};

function getLocaleFromTimezone(tz: string): { hl: string; gl: string; city: string; region: string } {
  const parts = tz.split("/");
  const region = parts[0] || "America";
  const city = parts[parts.length - 1] || "New_York";
  
  const cityLocale = CITY_COUNTRY_MAP[city];
  if (cityLocale) return { ...cityLocale, city: city.replace(/_/g, " "), region };
  
  const regionLocale = TZ_TO_LOCALE[region];
  if (regionLocale) return { hl: regionLocale.hl, gl: regionLocale.gl, city: city.replace(/_/g, " "), region };
  
  return { hl: "en-US", gl: "US", city: city.replace(/_/g, " "), region };
}

function parseRssItems(xml: string): { title: string; link: string; pubDate: string; source?: string; image?: string }[] {
  const items: { title: string; link: string; pubDate: string; source?: string; image?: string }[] = [];
  // Match <item> or <item ...attributes>
  const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/g;
  let match;

  // Strip CDATA wrappers
  const stripCdata = (s: string) => s.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1").trim();

  // Decode common HTML entities
  const decodeEntities = (s: string) =>
    s.replace(/&amp;/g, "&")
     .replace(/&lt;/g, "<")
     .replace(/&gt;/g, ">")
     .replace(/&quot;/g, '"')
     .replace(/&#39;/g, "'")
     .replace(/&apos;/g, "'");

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];

    // <title> – may be wrapped in CDATA
    const rawTitle = itemXml.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "";
    const title = stripCdata(rawTitle);

    // <link> – standard <link>URL</link>.  Avoid matching <atom:link>.
    // Google News sometimes emits <link/>URL on the next line (bare text after self-closing).
    let link = "";
    const linkMatch = itemXml.match(/<link>([^<]+)<\/link>/);
    if (linkMatch) {
      link = linkMatch[1].trim();
    } else {
      // Bare text after self-closing <link/>
      const bareLink = itemXml.match(/<link\s*\/>\s*\n?\s*(https?:\/\/[^\s<]+)/);
      if (bareLink) link = bareLink[1].trim();
    }
    // Fallback: use <guid> permalink if still no link
    if (!link) {
      const guidMatch = itemXml.match(/<guid[^>]*>([\s\S]*?)<\/guid>/);
      if (guidMatch) {
        const guidVal = stripCdata(guidMatch[1]);
        if (guidVal.startsWith("http")) link = guidVal;
      }
    }

    // <pubDate> in RFC 2822 format
    const pubDate = (itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || "").trim();

    // <source url="...">SourceName</source> – content may be CDATA
    const sourceMatch = itemXml.match(/<source[^>]*>([\s\S]*?)<\/source>/);
    const source = sourceMatch ? stripCdata(sourceMatch[1]) : "";

    // <dc:creator><![CDATA[author name]]></dc:creator> – optional
    const creatorMatch = itemXml.match(/<dc:creator>([\s\S]*?)<\/dc:creator>/);
    const creator = creatorMatch ? stripCdata(creatorMatch[1]) : "";

    // Extract image from various RSS sources (in priority order):
    let image = "";

    // 1a. <media:content url="..."> — prefer the one with the largest width attribute
    const allMediaContent = [...itemXml.matchAll(/<media:content[^>]+url=["']([^"']+)["'][^>]*\/?>/g)];
    if (allMediaContent.length > 0) {
      let bestUrl = allMediaContent[0][1];
      let bestWidth = 0;
      for (const m of allMediaContent) {
        const wMatch = m[0].match(/width=["'](\d+)["']/);
        const w = wMatch ? parseInt(wMatch[1], 10) : 0;
        if (w > bestWidth) { bestWidth = w; bestUrl = m[1]; }
      }
      image = bestUrl;
    }

    // 1b. <media:thumbnail url="..."> (BBC, Guardian, etc.)
    if (!image) {
      const thumbMatch = itemXml.match(/<media:thumbnail[^>]+url=["']([^"']+)["'][^>]*\/?>/);
      if (thumbMatch) image = thumbMatch[1];
    }

    // 2. <enclosure url="..." type="image/..."/>
    if (!image) {
      const encMatch = itemXml.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]*type=["']image\/[^"']*["'][^>]*>/);
      if (encMatch) image = encMatch[1];
      if (!image) {
        const encMatch2 = itemXml.match(/<enclosure[^>]+type=["']image\/[^"']*["'][^>]+url=["']([^"']+)["'][^>]*>/);
        if (encMatch2) image = encMatch2[1];
      }
    }

    // 3. <content:encoded> with CDATA-wrapped HTML
    if (!image) {
      const contentMatch = itemXml.match(/<content:encoded>([\s\S]*?)<\/content:encoded>/);
      if (contentMatch) {
        const contentHtml = decodeEntities(stripCdata(contentMatch[1]));
        const imgMatch = contentHtml.match(/<img[^>]+src=["']([^"']+)["']/);
        if (imgMatch) image = imgMatch[1];
      }
    }

    // 4. <description> – Google News entity-encodes HTML, so decode before matching
    if (!image) {
      const descMatch = itemXml.match(/<description>([\s\S]*?)<\/description>/);
      if (descMatch) {
        const descHtml = decodeEntities(stripCdata(descMatch[1]));
        const imgMatch = descHtml.match(/<img[^>]+src=["']([^"']+)["']/);
        if (imgMatch) image = imgMatch[1];
      }
    }

    if (image) {
      image = decodeEntities(image);
      // Upscale known CDN thumbnail URLs to larger variants
      try {
        if (image.includes("ichef.bbci.co.uk")) {
          image = image.replace(/\/\d+x\d+\//, "/800x450/");
        } else if (image.includes("media.guim.co.uk") && /\/\d+\.jpg/.test(image)) {
          image = image.replace(/\/\d+\.jpg/, "/1000.jpg");
        } else if (image.includes("lh3.googleusercontent.com")) {
          image = image.replace(/=w\d+/, "=w800").replace(/=s\d+/, "=s800");
        }
      } catch {}
    }

    // Google News titles often append " - SourceName" – extract if no <source> tag
    let cleanTitle = title;
    let derivedSource = source;
    if (!derivedSource && title.includes(" - ")) {
      const lastDash = title.lastIndexOf(" - ");
      derivedSource = title.substring(lastDash + 3).trim();
      cleanTitle = title.substring(0, lastDash).trim();
    }

    cleanTitle = decodeEntities(cleanTitle);
    derivedSource = decodeEntities(derivedSource);

    if (cleanTitle && link) {
      items.push({
        title: cleanTitle,
        link,
        pubDate,
        source: derivedSource || (creator || undefined),
        image: image || undefined,
      });
    }
  }

  // ── Atom feed support (<entry> elements) ──
  // Reddit, GitHub, and many other feeds use Atom format.
  if (items.length === 0) {
    const entryRegex = /<entry[\s>]([\s\S]*?)<\/entry>/g;
    let entryMatch;
    while ((entryMatch = entryRegex.exec(xml)) !== null) {
      const entryXml = entryMatch[1];

      // <title> — may be plain text or CDATA
      const rawTitle = entryXml.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] || "";
      let title = stripCdata(rawTitle);

      // <link href="URL"/> — Atom uses href attribute, not text content
      let link = "";
      // Prefer rel="alternate" link (attribute order varies between feeds)
      const altLinkMatch = entryXml.match(/<link[^>]+rel=["']alternate["'][^>]+href=["']([^"']+)["'][^>]*\/?>/)
        || entryXml.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']alternate["'][^>]*\/?>/);
      if (altLinkMatch) {
        link = altLinkMatch[1];
      } else {
        // Fall back to any <link href="..."> (Reddit omits rel attribute)
        const anyLinkMatch = entryXml.match(/<link[^>]+href=["']([^"']+)["'][^>]*\/?>/);
        if (anyLinkMatch) link = anyLinkMatch[1];
      }

      // <updated> or <published> — Atom date elements (ISO 8601)
      const pubDate = (
        entryXml.match(/<published>([\s\S]*?)<\/published>/)?.[1] ||
        entryXml.match(/<updated>([\s\S]*?)<\/updated>/)?.[1] ||
        ""
      ).trim();

      // <author><name>...</name></author>
      const authorMatch = entryXml.match(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/);
      const author = authorMatch ? stripCdata(authorMatch[1]) : "";

      // <category term="..."/> — use first category as source label
      const categoryMatch = entryXml.match(/<category[^>]+term=["']([^"']+)["'][^>]*\/?>/);
      const category = categoryMatch ? categoryMatch[1] : "";

      // ── Image extraction for Atom entries ──
      let image = "";

      // 1. <media:thumbnail url="..."/>
      const mediaThumbnail = entryXml.match(/<media:thumbnail[^>]+url=["']([^"']+)["'][^>]*\/?>/);
      if (mediaThumbnail) image = mediaThumbnail[1];

      // 2. <media:content url="..."/>
      if (!image) {
        const mediaContent = entryXml.match(/<media:content[^>]+url=["']([^"']+)["'][^>]*\/?>/);
        if (mediaContent) image = mediaContent[1];
      }

      // 3. <content type="html"> — Reddit embeds HTML with thumbnails/images
      if (!image) {
        const contentMatch = entryXml.match(/<content[^>]*>([\s\S]*?)<\/content>/);
        if (contentMatch) {
          const contentHtml = decodeEntities(stripCdata(contentMatch[1]));
          const imgMatch = contentHtml.match(/<img[^>]+src=["']([^"']+)["']/);
          if (imgMatch) {
            const imgUrl = imgMatch[1];
            // Skip Reddit's tiny tracking pixels and very small thumbnails
            if (!imgUrl.includes("pixel") && !imgUrl.includes("/icon_") && !imgUrl.endsWith(".gif")) {
              image = imgUrl;
            }
          }
          // Also try to extract from <a> linked images (Reddit "thumbnail" links)
          if (!image) {
            const thumbLink = contentHtml.match(/href=["'](https:\/\/[^"']*(?:i\.redd\.it|preview\.redd\.it|i\.imgur\.com)[^"']*)/);
            if (thumbLink) image = thumbLink[1];
          }
        }
      }

      // 4. <summary> — some Atom feeds put HTML in summary instead of content
      if (!image) {
        const summaryMatch = entryXml.match(/<summary[^>]*>([\s\S]*?)<\/summary>/);
        if (summaryMatch) {
          const summaryHtml = decodeEntities(stripCdata(summaryMatch[1]));
          const imgMatch = summaryHtml.match(/<img[^>]+src=["']([^"']+)["']/);
          if (imgMatch) image = imgMatch[1];
        }
      }

      if (image) image = decodeEntities(image);

      title = decodeEntities(title);

      if (title && link) {
        items.push({
          title,
          link,
          pubDate,
          source: category || author || undefined,
          image: image || undefined,
        });
      }
    }
  }

  return items;
}

app.get(`${PREFIX}/news`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const profile = await kv.get(`user:${user.id}`);
    const timezone = profile?.timezone || "America/New_York";
    const locale = getLocaleFromTimezone(timezone);
    const interests: string[] = profile?.news_interests || [];

    const feeds: Record<string, { title: string; link: string; pubDate: string; source?: string; image?: string }[]> = {};

    // Image-rich RSS feeds (reliably include media:thumbnail / media:content)
    const imageRichFeeds = [
      "https://feeds.bbci.co.uk/news/rss.xml",
      "https://www.theguardian.com/world/rss",
      "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml",
    ];

    // Fetch Google News top stories + image-rich feeds in parallel
    const topUrl = `https://news.google.com/rss?hl=${locale.hl}&gl=${locale.gl}&ceid=${locale.gl}:${locale.hl.split("-")[0]}`;
    const topFetches = [
      fetch(topUrl, { signal: AbortSignal.timeout(8000) }).then(r => r.text()).then(xml => parseRssItems(xml)).catch(() => [] as ReturnType<typeof parseRssItems>),
      ...imageRichFeeds.map(url =>
        fetch(url, { signal: AbortSignal.timeout(8000) }).then(r => r.text()).then(xml => parseRssItems(xml)).catch(() => [] as ReturnType<typeof parseRssItems>)
      ),
    ];

    try {
      const [googleTop, ...richResults] = await Promise.all(topFetches);
      // Merge: Google top first, then image-rich items that aren't duplicates
      const seen = new Set<string>();
      const merged: typeof feeds.top = [];
      for (const item of googleTop) {
        if (!seen.has(item.title)) { seen.add(item.title); merged.push(item); }
      }
      // Add image-rich articles (only ones with images, to supplement)
      const richItems = richResults.flat().filter(item => item.image);
      for (const item of richItems) {
        if (!seen.has(item.title)) { seen.add(item.title); merged.push(item); }
      }
      // Sort: articles with images first, then by date
      merged.sort((a, b) => {
        if (a.image && !b.image) return -1;
        if (!a.image && b.image) return 1;
        return new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime();
      });
      feeds.top = merged.slice(0, 30);
    } catch (e) {
      console.log("News: top feed error:", e);
      feeds.top = [];
    }

    // Locale-aware supplementary feeds for Local column (image-rich)
    const localSupplementFeeds: Record<string, string[]> = {
      AU: [
        "https://www.abc.net.au/news/feed/51120/rss.xml",
        "https://www.smh.com.au/rss/feed.xml",
      ],
      GB: [
        "https://feeds.bbci.co.uk/news/england/rss.xml",
        "https://www.theguardian.com/uk-news/rss",
      ],
      US: [
        "https://rss.nytimes.com/services/xml/rss/nyt/US.xml",
        "https://feeds.npr.org/1001/rss.xml",
      ],
      CA: [
        "https://www.cbc.ca/webfeed/rss/rss-topstories",
      ],
      NZ: [
        "https://www.rnz.co.nz/rss/national.xml",
      ],
    };

    // Fetch local news (city-specific search + locale supplement feeds)
    const cityQuery = locale.city;
    {
      const localFetches: Promise<ReturnType<typeof parseRssItems>>[] = [];
      if (cityQuery) {
        const localUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(cityQuery)}&hl=${locale.hl}&gl=${locale.gl}&ceid=${locale.gl}:${locale.hl.split("-")[0]}`;
        localFetches.push(
          fetch(localUrl, { signal: AbortSignal.timeout(8000) }).then(r => r.text()).then(xml => parseRssItems(xml)).catch(() => [] as ReturnType<typeof parseRssItems>)
        );
      }
      const supplementUrls = localSupplementFeeds[locale.gl] || [];
      for (const url of supplementUrls) {
        localFetches.push(
          fetch(url, { signal: AbortSignal.timeout(8000) }).then(r => r.text()).then(xml => parseRssItems(xml)).catch(() => [] as ReturnType<typeof parseRssItems>)
        );
      }
      try {
        const localResults = await Promise.all(localFetches);
        const [googleLocal = [], ...supplementResults] = localResults;
        const seen = new Set<string>();
        const merged: typeof feeds.local = [];
        for (const item of googleLocal) {
          if (!seen.has(item.title)) { seen.add(item.title); merged.push(item); }
        }
        const supplementItems = supplementResults.flat().filter(item => item.image);
        for (const item of supplementItems) {
          if (!seen.has(item.title)) { seen.add(item.title); merged.push(item); }
        }
        merged.sort((a, b) => {
          if (a.image && !b.image) return -1;
          if (!a.image && b.image) return 1;
          return new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime();
        });
        feeds.local = merged.slice(0, 25);
      } catch (e) {
        console.log("News: local feed error:", e);
        feeds.local = [];
      }
    }

    // Interest-to-category feed mapping (image-rich sources)
    const interestCategoryFeeds: Record<string, string[]> = {
      technology: ["https://feeds.bbci.co.uk/news/technology/rss.xml", "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml"],
      business: ["https://feeds.bbci.co.uk/news/business/rss.xml", "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml"],
      science: ["https://feeds.bbci.co.uk/news/science_and_environment/rss.xml", "https://rss.nytimes.com/services/xml/rss/nyt/Science.xml"],
      health: ["https://feeds.bbci.co.uk/news/health/rss.xml", "https://rss.nytimes.com/services/xml/rss/nyt/Health.xml"],
      sports: ["https://feeds.bbci.co.uk/sport/rss.xml", "https://rss.nytimes.com/services/xml/rss/nyt/Sports.xml"],
      entertainment: ["https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml", "https://rss.nytimes.com/services/xml/rss/nyt/Arts.xml"],
      politics: ["https://feeds.bbci.co.uk/news/politics/rss.xml", "https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml"],
      finance: ["https://feeds.bbci.co.uk/news/business/rss.xml", "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml"],
      climate: ["https://feeds.bbci.co.uk/news/science_and_environment/rss.xml", "https://www.theguardian.com/environment/climate-crisis/rss"],
      ai: ["https://feeds.bbci.co.uk/news/technology/rss.xml", "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml"],
      space: ["https://feeds.bbci.co.uk/news/science_and_environment/rss.xml", "https://rss.nytimes.com/services/xml/rss/nyt/Science.xml"],
      gaming: ["https://feeds.bbci.co.uk/news/technology/rss.xml"],
      travel: ["https://rss.nytimes.com/services/xml/rss/nyt/Travel.xml", "https://www.theguardian.com/travel/rss"],
      food: ["https://rss.nytimes.com/services/xml/rss/nyt/DiningandWine.xml", "https://www.theguardian.com/food/rss"],
      movies: ["https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml", "https://rss.nytimes.com/services/xml/rss/nyt/Movies.xml"],
      education: ["https://feeds.bbci.co.uk/news/education/rss.xml", "https://rss.nytimes.com/services/xml/rss/nyt/Education.xml"],
      music: ["https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml"],
      fashion: ["https://rss.nytimes.com/services/xml/rss/nyt/FashionandStyle.xml"],
      startups: ["https://feeds.bbci.co.uk/news/technology/rss.xml", "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml"],
      crypto: ["https://feeds.bbci.co.uk/news/technology/rss.xml"],
    };

    // Fetch interest-based feeds with image-rich supplements
    if (interests.length > 0) {
      const interestResults: { title: string; link: string; pubDate: string; source?: string; image?: string; interest?: string }[] = [];
      const userInterests = interests.slice(0, 8);

      // Supplement with diverse defaults so "Your Radar" always has varied tags
      const defaultDiverseInterests = ["Technology", "Science", "Entertainment", "Sports", "Health", "Politics"];
      const userInterestsLower = new Set(userInterests.map(i => i.toLowerCase()));
      const supplementInterests = defaultDiverseInterests.filter(d => !userInterestsLower.has(d.toLowerCase()));
      const needed = Math.max(0, 4 - userInterests.length);
      const allInterests = [...userInterests, ...supplementInterests.slice(0, needed)];
      
      const fetchInterest = async (interest: string) => {
        const googleUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(interest)}&hl=${locale.hl}&gl=${locale.gl}&ceid=${locale.gl}:${locale.hl.split("-")[0]}`;
        const categoryUrls = interestCategoryFeeds[interest.toLowerCase()] || [];
        
        const fetches = [
          fetch(googleUrl, { signal: AbortSignal.timeout(8000) }).then(r => r.text()).then(xml => parseRssItems(xml).slice(0, 8)).catch(() => [] as ReturnType<typeof parseRssItems>),
          ...categoryUrls.map(url =>
            fetch(url, { signal: AbortSignal.timeout(8000) }).then(r => r.text()).then(xml => parseRssItems(xml).slice(0, 6)).catch(() => [] as ReturnType<typeof parseRssItems>)
          ),
        ];
        
        try {
          const [googleItems, ...categoryResults] = await Promise.all(fetches);
          const seen = new Set<string>();
          const merged: typeof interestResults = [];
          for (const item of googleItems) {
            if (!seen.has(item.title)) { seen.add(item.title); merged.push({ ...item, interest }); }
          }
          const catItems = categoryResults.flat().filter(item => item.image);
          for (const item of catItems) {
            if (!seen.has(item.title)) { seen.add(item.title); merged.push({ ...item, interest }); }
          }
          // Sort images first
          merged.sort((a, b) => {
            if (a.image && !b.image) return -1;
            if (!a.image && b.image) return 1;
            return 0;
          });
          // Cap per-interest to 5 articles to prevent any one tag from dominating
          return merged.slice(0, 5);
        } catch {
          return [];
        }
      };
      
      // Fetch in batches of 3
      for (let i = 0; i < allInterests.length; i += 3) {
        const batch = allInterests.slice(i, i + 3);
        const results = await Promise.all(batch.map(fetchInterest));
        interestResults.push(...results.flat());
      }

      // Deduplicate by title
      const seen = new Set<string>();
      const deduped = interestResults.filter(item => {
        if (seen.has(item.title)) return false;
        seen.add(item.title);
        return true;
      });

      // Round-robin interleave by interest tag to ensure diversity
      const bucketMap = new Map<string, typeof deduped>();
      for (const item of deduped) {
        const key = (item.interest || "General").toLowerCase();
        if (!bucketMap.has(key)) bucketMap.set(key, []);
        bucketMap.get(key)!.push(item);
      }
      // Sort each bucket: images first, then by date
      for (const [, bucket] of bucketMap) {
        bucket.sort((a, b) => {
          if (a.image && !b.image) return -1;
          if (!a.image && b.image) return 1;
          return new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime();
        });
      }
      // Shuffle bucket order so no single interest always leads
      const forYouBuckets = Array.from(bucketMap.values());
      for (let i = forYouBuckets.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [forYouBuckets[i], forYouBuckets[j]] = [forYouBuckets[j], forYouBuckets[i]];
      }
      // Round-robin pick one article from each bucket in turn
      const interleaved: typeof deduped = [];
      const maxBucketLen = Math.max(...forYouBuckets.map(b => b.length));
      for (let round = 0; round < maxBucketLen && interleaved.length < 30; round++) {
        for (const bucket of forYouBuckets) {
          if (round < bucket.length && interleaved.length < 30) {
            interleaved.push(bucket[round]);
          }
        }
      }
      feeds.forYou = interleaved;
    }

    return c.json({
      locale: { city: locale.city, gl: locale.gl },
      interests,
      feeds,
    });
  } catch (e) {
    console.log("News error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// ── News Bookmarks ──

app.get(`${PREFIX}/news/bookmarks`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const raw = await kv.get(`news_bookmarks:${user.id}`);
    const bookmarks = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : [];
    return c.json(bookmarks);
  } catch (e) {
    console.log("Bookmarks get error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

app.post(`${PREFIX}/news/bookmarks`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const article = await c.req.json();
    const raw = await kv.get(`news_bookmarks:${user.id}`);
    const bookmarks: any[] = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : [];
    if (bookmarks.some((b: any) => b.link === article.link)) {
      return c.json({ message: "Already bookmarked" });
    }
    bookmarks.unshift({ ...article, bookmarkedAt: new Date().toISOString() });
    await kv.set(`news_bookmarks:${user.id}`, JSON.stringify(bookmarks));
    return c.json({ message: "Bookmarked", count: bookmarks.length });
  } catch (e) {
    console.log("Bookmark add error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

app.delete(`${PREFIX}/news/bookmarks`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const { link } = await c.req.json();
    const raw = await kv.get(`news_bookmarks:${user.id}`);
    const bookmarks: any[] = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : [];
    const filtered = bookmarks.filter((b: any) => b.link !== link);
    await kv.set(`news_bookmarks:${user.id}`, JSON.stringify(filtered));
    return c.json({ message: "Removed", count: filtered.length });
  } catch (e) {
    console.log("Bookmark remove error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// ── Custom RSS Feeds ──

app.get(`${PREFIX}/rss-feeds`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const raw = await kv.get(`rss_feeds:${user.id}`);
    const feeds = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : [];
    return c.json(feeds);
  } catch (e) {
    console.log("RSS feeds get error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// Normalize a website URL into a valid RSS feed URL.
// Handles Substack, Medium, WordPress, Blogger, Tumblr, YouTube, Reddit, and more.
function normalizeToFeedUrl(inputUrl: string): { feedUrl: string; platform: string | null } {
  let u = inputUrl.trim();
  const clean = u.replace(/\?.*$/, "").replace(/\/+$/, "");

  try {
    const parsed = new URL(u.startsWith("http") ? u : `https://${u}`);
    const host = parsed.hostname.toLowerCase();

    // ─��� Substack ──
    // Handle substack.com/@username profile URLs → username.substack.com/feed
    if ((host === "substack.com" || host === "www.substack.com") && parsed.pathname.startsWith("/@")) {
      const username = parsed.pathname.split("/")[1].replace(/^@/, "");
      return { feedUrl: `https://${username}.substack.com/feed`, platform: "Substack" };
    }
    if (host.endsWith(".substack.com")) {
      const base = `${parsed.protocol}//${parsed.hostname}`;
      return { feedUrl: `${base}/feed`, platform: "Substack" };
    }

    // ── Medium ──
    if (host === "medium.com" || host.endsWith(".medium.com")) {
      const path = parsed.pathname.replace(/\/+$/, "");
      if (!path.startsWith("/feed")) {
        return { feedUrl: `https://medium.com/feed${path}`, platform: "Medium" };
      }
      return { feedUrl: u, platform: "Medium" };
    }

    // ── YouTube ──
    if (host === "youtube.com" || host === "www.youtube.com") {
      const channelMatch = parsed.pathname.match(/^\/channel\/(UC[\w-]+)/);
      if (channelMatch) {
        return { feedUrl: `https://www.youtube.com/feeds/videos.xml?channel_id=${channelMatch[1]}`, platform: "YouTube" };
      }
    }

    // ── Blogger / Blogspot ──
    if (host.endsWith(".blogspot.com") || host.endsWith(".blogger.com")) {
      const base = `${parsed.protocol}//${parsed.hostname}`;
      if (!clean.endsWith("/feeds/posts/default") && !clean.endsWith("/atom.xml") && !clean.endsWith("/rss.xml")) {
        return { feedUrl: `${base}/feeds/posts/default?alt=rss`, platform: "Blogger" };
      }
    }

    // ── Tumblr ──
    if (host.endsWith(".tumblr.com")) {
      const base = `${parsed.protocol}//${parsed.hostname}`;
      if (!clean.endsWith("/rss")) {
        return { feedUrl: `${base}/rss`, platform: "Tumblr" };
      }
    }

    // ── WordPress.com ──
    if (host.endsWith(".wordpress.com")) {
      const base = `${parsed.protocol}//${parsed.hostname}`;
      if (!clean.endsWith("/feed") && !clean.endsWith("/feed/")) {
        return { feedUrl: `${base}/feed`, platform: "WordPress" };
      }
    }

    // ── Reddit ── (always sort by new)
    if (host === "reddit.com" || host === "www.reddit.com" || host === "old.reddit.com") {
      const path = parsed.pathname.replace(/\/+$/, "");
      if (!path.endsWith(".rss")) {
        // Append /new to subreddit paths so the feed returns newest posts
        const subredditMatch = path.match(/^\/r\/([^/]+)(\/.*)?$/);
        const newPath = subredditMatch
          ? `/r/${subredditMatch[1]}/new`
          : path;
        return { feedUrl: `https://www.reddit.com${newPath}.rss`, platform: "Reddit" };
      }
    }

  } catch {}

  return { feedUrl: u, platform: null };
}

// Try to auto-discover an RSS feed from an HTML page
async function autoDiscoverFeed(pageUrl: string): Promise<string | null> {
  try {
    const res = await fetch(pageUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Chrono/1.0)" },
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    });
    const ct = res.headers.get("content-type") || "";
    const text = await res.text();

    if (ct.includes("xml") || ct.includes("rss") || ct.includes("atom") ||
        text.trimStart().startsWith("<?xml") || text.trimStart().startsWith("<rss") || text.trimStart().startsWith("<feed")) {
      return pageUrl;
    }

    const rssLink = text.match(/<link[^>]+type\s*=\s*["']application\/rss\+xml["'][^>]*href\s*=\s*["']([^"']+)["'][^>]*>/i)
      || text.match(/<link[^>]+href\s*=\s*["']([^"']+)["'][^>]*type\s*=\s*["']application\/rss\+xml["'][^>]*>/i);
    if (rssLink) {
      const href = rssLink[1];
      return href.startsWith("http") ? href : new URL(href, pageUrl).toString();
    }

    const atomLink = text.match(/<link[^>]+type\s*=\s*["']application\/atom\+xml["'][^>]*href\s*=\s*["']([^"']+)["'][^>]*>/i)
      || text.match(/<link[^>]+href\s*=\s*["']([^"']+)["'][^>]*type\s*=\s*["']application\/atom\+xml["'][^>]*>/i);
    if (atomLink) {
      const href = atomLink[1];
      return href.startsWith("http") ? href : new URL(href, pageUrl).toString();
    }

    const base = new URL(pageUrl);
    const guesses = ["/feed", "/rss", "/rss.xml", "/feed.xml", "/atom.xml", "/index.xml"];
    for (const guess of guesses) {
      try {
        const guessUrl = `${base.protocol}//${base.hostname}${guess}`;
        const gRes = await fetch(guessUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; Chrono/1.0)" },
          signal: AbortSignal.timeout(5000),
          method: "HEAD",
        });
        const gCt = gRes.headers.get("content-type") || "";
        if (gRes.ok && (gCt.includes("xml") || gCt.includes("rss") || gCt.includes("atom"))) {
          return guessUrl;
        }
      } catch {}
    }
  } catch {}
  return null;
}

app.post(`${PREFIX}/rss-feeds`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const { url, name } = await c.req.json();
    if (!url) return c.json({ error: "URL is required" }, 400);

    // Step 1: Normalize known platforms (Substack, Medium, etc.)
    const { feedUrl: normalizedUrl, platform } = normalizeToFeedUrl(url);

    // Step 2: Try fetching; if not RSS, auto-discover
    let finalUrl = normalizedUrl;
    let feedName = name;
    let validated = false;

    try {
      const res = await fetch(finalUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Chrono/1.0)" },
        signal: AbortSignal.timeout(8000),
        redirect: "follow",
      });
      const text = await res.text();
      const ct = res.headers.get("content-type") || "";

      const isXml = ct.includes("xml") || ct.includes("rss") || ct.includes("atom") ||
        text.trimStart().startsWith("<?xml") || text.trimStart().startsWith("<rss") || text.trimStart().startsWith("<feed");

      if (isXml) {
        validated = true;
        if (!feedName) {
          const titleMatch = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
          if (titleMatch) {
            feedName = titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1").trim();
          }
        }
      } else {
        // Not XML — try auto-discovery from the HTML
        const rssLinkMatch = text.match(/<link[^>]+type\s*=\s*["']application\/rss\+xml["'][^>]*href\s*=\s*["']([^"']+)["'][^>]*>/i)
          || text.match(/<link[^>]+href\s*=\s*["']([^"']+)["'][^>]*type\s*=\s*["']application\/rss\+xml["'][^>]*>/i);
        if (rssLinkMatch) {
          const href = rssLinkMatch[1];
          finalUrl = href.startsWith("http") ? href : new URL(href, finalUrl).toString();
          validated = true;
        } else {
          const discovered = await autoDiscoverFeed(finalUrl);
          if (discovered) {
            finalUrl = discovered;
            validated = true;
          }
        }
        // Fetch title from resolved feed
        if (validated && !feedName) {
          try {
            const r2 = await fetch(finalUrl, {
              headers: { "User-Agent": "Mozilla/5.0" },
              signal: AbortSignal.timeout(5000),
            });
            const t2 = await r2.text();
            const tm = t2.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
            if (tm) feedName = tm[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1").trim();
          } catch {}
        }
      }
    } catch (fetchErr) {
      console.log("RSS feed validation fetch error:", fetchErr);
    }

    const raw = await kv.get(`rss_feeds:${user.id}`);
    const feeds: any[] = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : [];
    if (feeds.some((f: any) => f.url === finalUrl)) {
      return c.json({ error: "Feed already exists" }, 400);
    }

    const id = crypto.randomUUID();
    const feed = {
      id,
      url: finalUrl,
      originalUrl: url !== finalUrl ? url : undefined,
      name: feedName || (platform ? `${platform} Feed` : finalUrl),
      platform: platform || undefined,
      validated,
      addedAt: new Date().toISOString(),
    };
    feeds.push(feed);
    await kv.set(`rss_feeds:${user.id}`, JSON.stringify(feeds));
    return c.json({ message: "Added", feeds, resolved: { from: url, to: finalUrl, platform, validated } });
  } catch (e) {
    console.log("RSS feed add error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

app.delete(`${PREFIX}/rss-feeds/:id`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const feedId = c.req.param("id");
    const raw = await kv.get(`rss_feeds:${user.id}`);
    const feeds: any[] = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : [];
    const filtered = feeds.filter((f: any) => f.id !== feedId);
    await kv.set(`rss_feeds:${user.id}`, JSON.stringify(filtered));
    return c.json({ message: "Removed", feeds: filtered });
  } catch (e) {
    console.log("RSS feed remove error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

app.get(`${PREFIX}/rss-feeds/articles`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const raw = await kv.get(`rss_feeds:${user.id}`);
    const feeds: any[] = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : [];
    if (feeds.length === 0) return c.json([]);

    const allArticles: any[] = [];
    await Promise.all(feeds.map(async (feed: any) => {
      try {
        const res = await fetch(feed.url, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; Chrono/1.0; +https://knowwhatson.com)" },
          signal: AbortSignal.timeout(10000),
          redirect: "follow",
        });
        if (!res.ok) {
          console.log(`RSS fetch HTTP ${res.status} for ${feed.url}`);
          return;
        }
        const text = await res.text();
        const items = parseRssItems(text).slice(0, 10);
        console.log(`RSS parsed ${items.length} items from ${feed.url} (${text.length} bytes)`);
        items.forEach((item: any) => {
          allArticles.push({ ...item, feedName: feed.name, feedId: feed.id });
        });
      } catch (e) {
        console.log(`RSS fetch error for ${feed.url}:`, e);
      }
    }));

    allArticles.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
    return c.json(allArticles.slice(0, 50));
  } catch (e) {
    console.log("RSS articles error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// Send an invoice email via Resend — branded HTML with inline invoice
app.post(`${PREFIX}/send-invoice-email`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const body = await c.req.json();
    const { listId, recipientEmail, recipientName, invoiceLink, projectName } = body;

    if (!listId || !recipientEmail || !invoiceLink) {
      return c.json({ error: "Missing required fields for invoice email" }, 400);
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.log("RESEND_API_KEY not configured for send-invoice-email");
      return c.json({ error: "Email service not configured" }, 500);
    }

    const senderProfile = await kv.get(`user:${user.id}`);
    const senderName = senderProfile?.name || user.user_metadata?.name || user.email.split("@")[0];

    // Fetch invoice data (same logic as public-invoice route)
    let list = await kv.get(`shared-list:${listId}`);
    let isSharedList = true;
    if (!list) {
      const allLists = await getAllByPrefix(`my-list:`);
      list = allLists.find((l: any) => l.id === listId);
      isSharedList = false;
    }
    if (!list) return c.json({ error: "Project list not found for invoice email" }, 404);

    let items: any[] = [];
    if (isSharedList) {
      items = await getAllByPrefix(`shared-item:${listId}:`);
    } else {
      items = list.items || [];
    }

    const invoiceSettings = list.invoice_settings || {};
    const hourlyRate = invoiceSettings.hourlyRate || 50;
    const taxRate = invoiceSettings.taxRate || 0;
    const invNotes = invoiceSettings.notes || "";
    const invTermsLink = invoiceSettings.termsLink || "";
    const customItems = invoiceSettings.customItems || [];
    const isAccepted = !!invoiceSettings.accepted;
    const invStatus = invoiceSettings.status || "unpaid";

    // Quote vs Invoice
    const docType = isAccepted ? "Invoice" : "Quote";
    const ctaLabel = isAccepted ? "Confirm &amp; Pay" : "Accept &amp; Acknowledge";
    const ctaColor = isAccepted ? "#059669" : "#7c3aed";
    const invoiceNo = `CHR-${(listId || "").slice(0, 8).toUpperCase()}`;

    // Compute totals — items use allocated_hours * hourlyRate for amount
    let itemsSubtotal = 0;
    for (const itm of items) {
      if (!itm.is_milestone && itm.allocated_hours) itemsSubtotal += itm.allocated_hours * hourlyRate;
    }
    let subtotal = itemsSubtotal;
    for (const ci of customItems) subtotal += Number(ci.amount) || 0;
    const tax = subtotal * (taxRate / 100);
    const total = subtotal + tax;

    const milestones = items.filter((i: any) => i.is_milestone);
    const taskItems = items.filter((i: any) => !i.is_milestone);

    // Build item rows — printed receipt style: # | Item | Amount
    // Uses CSS classes for dark-mode bold + color overrides
    let lineNum = 0;
    let taskRowsHtml = "";
    for (const m of milestones) {
      const mTasks = taskItems.filter((t: any) => t.milestone_id === m.id);
      if (mTasks.length === 0) continue;
      taskRowsHtml += `<tr><td colspan="3" style="padding:14px 0 4px 0"><font class="c-ms-label" color="#7c3aed" style="color:#7c3aed;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;font-family:'Courier New',Courier,monospace">&#9632; ${escHtml(m.text)}</font></td></tr>`;
      for (const t of mTasks) {
        lineNum++;
        const amt = t.allocated_hours ? (t.allocated_hours * hourlyRate) : 0;
        taskRowsHtml += `<tr><td class="c-row-border" style="padding:6px;font-size:12px;font-weight:600;font-family:'Courier New',Courier,monospace;border-bottom:1px dotted #d4c8a8;width:30px;vertical-align:top"><font class="c-p-num" color="#998a6a" style="color:#998a6a">${String(lineNum).padStart(2,"0")}</font></td><td class="c-row-border" style="padding:6px;font-size:12px;font-weight:600;font-family:'Courier New',Courier,monospace;border-bottom:1px dotted #d4c8a8;vertical-align:top"><font class="c-p-text" color="#2a2010" style="color:#2a2010">${escHtml(t.text)}</font>${t.notes ? `<br/><font class="c-p-note" color="#887a5a" style="font-size:10px;color:#887a5a;font-weight:600">${escHtml(t.notes)}</font>` : ""}</td><td class="c-row-border" align="right" style="padding:6px;font-size:12px;font-weight:700;font-family:'Courier New',Courier,monospace;border-bottom:1px dotted #d4c8a8;width:80px;vertical-align:top;white-space:nowrap"><font class="c-p-amt" color="#2a2010" style="color:#2a2010">${amt > 0 ? `$${amt.toFixed(2)}` : "&mdash;"}</font></td></tr>`;
      }
    }

    const orphaned = taskItems.filter((t: any) => !t.milestone_id);
    if (orphaned.length > 0) {
      taskRowsHtml += `<tr><td colspan="3" style="padding:14px 0 4px 0"><font class="c-ms-label" color="#887a5a" style="color:#887a5a;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;font-family:'Courier New',Courier,monospace">&#9632; OTHER ITEMS</font></td></tr>`;
      for (const t of orphaned) {
        lineNum++;
        const amt = t.allocated_hours ? (t.allocated_hours * hourlyRate) : 0;
        taskRowsHtml += `<tr><td class="c-row-border" style="padding:6px;font-size:12px;font-weight:600;font-family:'Courier New',Courier,monospace;border-bottom:1px dotted #d4c8a8;width:30px;vertical-align:top"><font class="c-p-num" color="#998a6a" style="color:#998a6a">${String(lineNum).padStart(2,"0")}</font></td><td class="c-row-border" style="padding:6px;font-size:12px;font-weight:600;font-family:'Courier New',Courier,monospace;border-bottom:1px dotted #d4c8a8;vertical-align:top"><font class="c-p-text" color="#2a2010" style="color:#2a2010">${escHtml(t.text)}</font></td><td class="c-row-border" align="right" style="padding:6px;font-size:12px;font-weight:700;font-family:'Courier New',Courier,monospace;border-bottom:1px dotted #d4c8a8;width:80px;vertical-align:top;white-space:nowrap"><font class="c-p-amt" color="#2a2010" style="color:#2a2010">${amt > 0 ? `$${amt.toFixed(2)}` : "&mdash;"}</font></td></tr>`;
      }
    }

    let customItemsHtml = "";
    if (customItems.length > 0) {
      customItemsHtml = `<tr><td colspan="3" style="padding:14px 0 4px 0"><font class="c-ms-label" color="#887a5a" style="color:#887a5a;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;font-family:'Courier New',Courier,monospace">&#9632; ADDITIONAL ITEMS</font></td></tr>`;
      for (const ci of customItems) {
        lineNum++;
        customItemsHtml += `<tr><td class="c-row-border" style="padding:6px;font-size:12px;font-weight:600;font-family:'Courier New',Courier,monospace;border-bottom:1px dotted #d4c8a8;width:30px;vertical-align:top"><font class="c-p-num" color="#998a6a" style="color:#998a6a">${String(lineNum).padStart(2,"0")}</font></td><td class="c-row-border" style="padding:6px;font-size:12px;font-weight:600;font-family:'Courier New',Courier,monospace;border-bottom:1px dotted #d4c8a8;vertical-align:top"><font class="c-p-text" color="#2a2010" style="color:#2a2010">${escHtml(ci.description || "Unnamed Item")}</font></td><td class="c-row-border" align="right" style="padding:6px;font-size:12px;font-weight:700;font-family:'Courier New',Courier,monospace;border-bottom:1px dotted #d4c8a8;width:80px;vertical-align:top;white-space:nowrap"><font class="c-p-amt" color="#2a2010" style="color:#2a2010">$${Number(ci.amount).toFixed(2)}</font></td></tr>`;
      }
    }

    const notesBlock = invNotes ? `<tr><td class="c-body" bgcolor="#fffdf9" style="background-color:#fffdf9;padding:0 32px 20px"><div class="c-notes-box" style="margin:0;padding:12px 16px;background-color:#f0e8d0;border:1px solid #ddd4b8;font-family:'Courier New',Courier,monospace"><font class="c-p-label" color="#806830" style="color:#806830;font-size:10px;letter-spacing:2px;text-transform:uppercase;font-weight:700">NOTES &amp; PAYMENT TERMS</font><br/><font class="c-p-text" color="#4a3a1a" style="color:#4a3a1a;font-size:12px;font-weight:600;line-height:1.6;white-space:pre-wrap">${escHtml(invNotes)}</font></div></td></tr>` : "";
    const termsBlock = invTermsLink ? `<tr><td class="c-body" bgcolor="#fffdf9" style="background-color:#fffdf9;text-align:center;padding:0 32px 16px"><a href="${escHtml(invTermsLink)}" style="font-size:12px;font-weight:600;color:#7c3aed;text-decoration:underline;font-family:'Courier New',Courier,monospace">View Full Terms &amp; Conditions</a></td></tr>` : "";
    const paidBadge = invStatus === "paid" ? `<tr><td class="c-body" bgcolor="#fffdf9" style="background-color:#fffdf9;text-align:center;padding:8px 32px 0"><span style="display:inline-block;padding:4px 20px;border:3px solid #dc2626;font-size:16px;font-weight:700;color:#dc2626;letter-spacing:4px;opacity:0.25;font-family:'Courier New',Courier,monospace">PAID</span></td></tr>` : "";

    const hasAgreement = !!invoiceSettings.hasAgreement;
    const ipTransfer = invoiceSettings.ipTransfer || "Upon full payment";
    const governingLaw = invoiceSettings.governingLaw || "New South Wales, Australia";
    const businessName = senderProfile?.business_profile?.legal_name || senderName;
    const agreementBlock = hasAgreement ? `<tr><td class="c-body" bgcolor="#fffdf9" style="background-color:#fffdf9;padding:0 20px 20px"><table class="c-paper" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5eed8" style="background-color:#f5eed8;border:1px solid #d4c8a8;border-top:1px dashed #d4c8a8;font-family:'Courier New',Courier,monospace;margin-top:-2px"><tr><td style="padding:24px 20px"><p style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#1a1a1a;margin:0 0 12px;font-weight:700">SERVICE AGREEMENT</p><p style="font-size:11px;color:#444;line-height:1.5;margin:0 0 12px">This document serves as a binding Service Agreement between <strong>${escHtml(businessName)}</strong> and the Client.</p><p style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#888;margin:0 0 2px;font-weight:700">1. The Works</p><p style="font-size:11px;color:#444;line-height:1.5;margin:0 0 12px">The total fee for these services is <strong>$${total.toFixed(2)}</strong>.</p><p style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#888;margin:0 0 2px;font-weight:700">2. Intellectual Property</p><p style="font-size:11px;color:#444;line-height:1.5;margin:0 0 12px">Ownership of final deliverables transfers to the Client: <strong>${escHtml(ipTransfer)}</strong>.</p><p style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#888;margin:0 0 2px;font-weight:700">3. Governing Law</p><p style="font-size:11px;color:#444;line-height:1.5;margin:0">This agreement shall be governed by the laws of <strong>${escHtml(governingLaw)}</strong>.</p></td></tr></table></td></tr>` : "";

    // Check for logo
    let logoUrl = "";
    try {
      const check = await fetch(getLogoPublicUrl(), { method: "HEAD" });
      if (check.ok) logoUrl = getLogoPublicUrl();
    } catch { /* no logo */ }
    const hasBanner = !!logoUrl;

    const subject = `${docType} for ${projectName || "Project"} from ${senderName}`;
    const dateStr = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

    const html = `<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<meta name="color-scheme" content="light only"/><meta name="supported-color-schemes" content="light only"/>
<style>
:root{color-scheme:light only!important}
body,table,td,div,p,span,a,h1{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
[data-ogsb] .c-outer{background-color:#141218!important}
[data-ogsb] .c-card{background-color:#1e1b2e!important}
[data-ogsb] .c-body{background-color:#1e1b2e!important}
[data-ogsb] .c-hdr{background-color:#3a2860!important}
[data-ogsb] .c-cta{background-color:${ctaColor}!important}
[data-ogsb] .c-ftr{background-color:#16141f!important}
[data-ogsb] .c-paper{background-color:#1c1a28!important}
[data-ogsb] .c-paper-ftr{background-color:#181622!important}
[data-ogsb] .c-notes-box{background-color:#252240!important;border-color:#3a3560!important}
[data-ogsb] .c-row-border{border-bottom-color:#3a3560!important}
[data-ogsc] .c-title{color:#ffffff!important}
[data-ogsc] .c-tagline{color:#c4b5fd!important}
[data-ogsc] .c-strong{color:#ffffff!important;font-weight:700!important}
[data-ogsc] .c-body-text{color:#e0dcd4!important;font-weight:600!important}
[data-ogsc] .c-subtle{color:#a09888!important;font-weight:600!important}
[data-ogsc] .c-cta-text{color:#ffffff!important;font-weight:700!important}
[data-ogsc] .c-ftr-text{color:#908878!important;font-weight:600!important}
[data-ogsc] .c-ftr-link{color:#a09888!important;font-weight:600!important}
[data-ogsc] .c-p-text{color:#e8e4dc!important;font-weight:700!important}
[data-ogsc] .c-p-amt{color:#f0ece4!important;font-weight:700!important}
[data-ogsc] .c-p-num{color:#888078!important;font-weight:700!important}
[data-ogsc] .c-p-note{color:#a09888!important;font-weight:600!important}
[data-ogsc] .c-p-label{color:#b0a890!important;font-weight:700!important}
[data-ogsc] .c-p-hdr{color:#e8e4dc!important;font-weight:700!important}
[data-ogsc] .c-p-sub{color:#b0a890!important;font-weight:600!important}
[data-ogsc] .c-p-total{color:#f0ece4!important;font-weight:700!important}
[data-ogsc] .c-p-col{color:#908878!important;font-weight:700!important}
[data-ogsc] .c-ms-label{color:#c4b5fd!important;font-weight:700!important}
[data-ogsc] .c-p-chrono{color:#908878!important;font-weight:700!important}
@media(prefers-color-scheme:dark){
.c-outer{background-color:#141218!important}.c-card{background-color:#1e1b2e!important}
.c-body{background-color:#1e1b2e!important}.c-ftr{background-color:#16141f!important}
.c-strong,.c-title{color:#ffffff!important;font-weight:700!important}
.c-body-text{color:#e0dcd4!important;font-weight:600!important}
.c-subtle{color:#a09888!important;font-weight:600!important}
.c-cta{background-color:${ctaColor}!important}
.c-paper{background-color:#1c1a28!important}
.c-paper-ftr{background-color:#18162a!important}
.c-notes-box{background-color:#252240!important;border-color:#3a3560!important}
.c-row-border{border-bottom-color:#3a3560!important}
.c-p-text{color:#e8e4dc!important;font-weight:700!important}
.c-p-amt{color:#f0ece4!important;font-weight:700!important}
.c-p-num{color:#888078!important;font-weight:700!important}
.c-p-note{color:#a09888!important;font-weight:600!important}
.c-p-label{color:#b0a890!important;font-weight:700!important}
.c-p-hdr{color:#e8e4dc!important;font-weight:700!important}
.c-p-sub{color:#b0a890!important;font-weight:600!important}
.c-p-total{color:#f0ece4!important;font-weight:700!important}
.c-p-col{color:#908878!important;font-weight:700!important}
.c-ms-label{color:#c4b5fd!important;font-weight:700!important}
.c-p-chrono{color:#908878!important;font-weight:700!important}
}
</style>
<!--[if mso]><style>table,td{border-collapse:collapse!important}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#e8e4dc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif" bgcolor="#e8e4dc">
<table class="c-outer" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#e8e4dc" style="background-color:#e8e4dc">
<tr><td align="center" style="padding:40px 16px">
<table class="c-card" role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#fffdf9" style="max-width:600px;width:100%;background-color:#fffdf9;border-radius:16px;overflow:hidden">

${hasBanner
  ? `<tr><td align="center" style="padding:0;line-height:0;font-size:0"><img src="${logoUrl}" alt="Chrono" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0"/></td></tr>`
  : `<tr><td class="c-hdr" align="center" bgcolor="#c8a8e8" style="background:linear-gradient(135deg,#f8c0d8 0%,#d8b4fe 25%,#93c5fd 55%,#99f6e4 100%);background-color:#c8a8e8;padding:32px 32px 20px;text-align:center">
<div style="display:inline-block;width:72px;height:72px;border-radius:50%;background-color:#d4c1f0;text-align:center;line-height:72px;font-size:32px;font-weight:700;margin-bottom:14px"><font color="#ffffff" style="color:#ffffff">C</font></div>
<h1 style="margin:0;font-size:20px;font-weight:700;letter-spacing:-0.3px"><font class="c-title" color="#1e1b4b" style="color:#1e1b4b">Chrono</font></h1>
<p style="margin:4px 0 0;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;font-weight:500"><font class="c-tagline" color="#4a3a6a" style="color:#4a3a6a">Calm, Unified &amp; Personalised</font></p>
</td></tr>`}

<tr><td class="c-body" bgcolor="#fffdf9" style="background-color:#fffdf9;text-align:center;padding:24px 32px 6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<p style="margin:0;font-size:15px;line-height:1.55;font-weight:500"><font class="c-body-text" color="#1a1a1a" style="color:#1a1a1a">Hi </font><strong><font class="c-strong" color="#1a1a1a" style="color:#1a1a1a">${escHtml(recipientName || "there")}</font></strong><font class="c-body-text" color="#1a1a1a" style="color:#1a1a1a">,</font></p>
</td></tr>

<tr><td class="c-body" bgcolor="#fffdf9" style="background-color:#fffdf9;text-align:center;padding:8px 32px 4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<p style="margin:0;font-size:14px;line-height:1.65;font-weight:500"><strong><font class="c-strong" color="#1a1a1a" style="color:#1a1a1a">${escHtml(senderName)}</font></strong><font class="c-body-text" color="#1a1a1a" style="color:#1a1a1a"> has sent you ${isAccepted ? "an invoice" : "a quote"} for &ldquo;</font><strong><font class="c-strong" color="#1a1a1a" style="color:#1a1a1a">${escHtml(projectName || "Project")}</font></strong><font class="c-body-text" color="#1a1a1a" style="color:#1a1a1a">&rdquo;:</font></p>
</td></tr>

${paidBadge}

<!-- ═══ PRINTED INVOICE PAPER (sepia) ═══ -->
<tr><td class="c-body" bgcolor="#fffdf9" style="background-color:#fffdf9;padding:20px 20px">
<table class="c-paper" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5eed8" style="background-color:#f5eed8;border:1px solid #d4c8a8;font-family:'Courier New',Courier,monospace">

<!-- Invoice header -->
<tr><td class="c-row-border" style="padding:20px 24px;border-bottom:2px dashed #d4c8a8">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="vertical-align:top">
<font class="c-p-sub" color="#998a6a" style="color:#998a6a;font-size:10px;font-weight:600;letter-spacing:3px;text-transform:uppercase">${docType}</font><br/>
<font class="c-p-hdr" color="#2a2010" style="color:#2a2010;font-size:16px;font-weight:700">${escHtml(projectName || "Project")}</font><br/>
<font class="c-p-sub" color="#887a5a" style="color:#887a5a;font-size:11px;font-weight:600">No. ${invoiceNo}</font>
</td>
<td align="right" style="vertical-align:top">
<font class="c-p-sub" color="#998a6a" style="color:#998a6a;font-size:10px;font-weight:600;letter-spacing:3px;text-transform:uppercase">BILLED BY</font><br/>
<font class="c-p-hdr" color="#2a2010" style="color:#2a2010;font-size:14px;font-weight:700">${escHtml(senderName)}</font><br/>
<font class="c-p-sub" color="#887a5a" style="color:#887a5a;font-size:11px;font-weight:600">${dateStr}</font>
</td>
</tr></table>
</td></tr>

<!-- Column headers -->
<tr><td style="padding:0 20px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td class="c-row-border" style="padding:10px 6px;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;border-bottom:1px solid #d4c8a8;width:30px"><font class="c-p-col" color="#998a6a" style="color:#998a6a">#</font></td>
<td class="c-row-border" style="padding:10px 6px;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;border-bottom:1px solid #d4c8a8"><font class="c-p-col" color="#998a6a" style="color:#998a6a">ITEM</font></td>
<td class="c-row-border" align="right" style="padding:10px 6px;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;border-bottom:1px solid #d4c8a8;width:80px"><font class="c-p-col" color="#998a6a" style="color:#998a6a">AMOUNT</font></td>
</tr>
${taskRowsHtml}
${customItemsHtml}
</table>
</td></tr>

<!-- Totals -->
<tr><td class="c-row-border" style="padding:16px 20px;border-top:2px dashed #d4c8a8">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td>&nbsp;</td><td style="width:200px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="padding:3px 0;font-size:12px;font-weight:600;font-family:'Courier New',Courier,monospace"><font class="c-p-sub" color="#887a5a" style="color:#887a5a">Subtotal</font></td><td align="right" style="padding:3px 0;font-size:12px;font-weight:700;font-family:'Courier New',Courier,monospace"><font class="c-p-amt" color="#2a2010" style="color:#2a2010">$${subtotal.toFixed(2)}</font></td></tr>
${taxRate > 0 ? `<tr><td style="padding:3px 0;font-size:12px;font-weight:600;font-family:'Courier New',Courier,monospace"><font class="c-p-sub" color="#887a5a" style="color:#887a5a">Tax (${taxRate}%)</font></td><td align="right" style="padding:3px 0;font-size:12px;font-weight:700;font-family:'Courier New',Courier,monospace"><font class="c-p-amt" color="#2a2010" style="color:#2a2010">$${tax.toFixed(2)}</font></td></tr>` : ""}
<tr><td class="c-row-border" style="padding:8px 0 0;font-size:14px;font-weight:700;border-top:2px solid #2a2010;letter-spacing:1px;font-family:'Courier New',Courier,monospace"><font class="c-p-total" color="#2a2010" style="color:#2a2010">TOTAL</font></td><td class="c-row-border" align="right" style="padding:8px 0 0;font-size:20px;font-weight:700;border-top:2px solid #2a2010;font-family:'Courier New',Courier,monospace"><font class="c-p-total" color="#2a2010" style="color:#2a2010">$${total.toFixed(2)}</font></td></tr>
</table>
</td></tr>
</table>
</td></tr>

<!-- Paper footer -->
<tr><td class="c-paper-ftr" style="border-top:1px solid #d4c8a8;padding:12px 20px;text-align:center;background-color:#f0e8d0">
<a href="https://chrono.knowwhatson.com" style="text-decoration:none"><font class="c-p-chrono" color="#998a6a" style="color:#998a6a;font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;font-family:'Courier New',Courier,monospace">GENERATED VIA CHRONO</font></a>
</td></tr>

</table>
</td></tr>

${agreementBlock}

${notesBlock}
${termsBlock}

<tr><td class="c-body" bgcolor="#fffdf9" style="background-color:#fffdf9;text-align:center;padding:8px 32px 8px">
<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${invoiceLink}" style="height:48px;v-text-anchor:middle;width:280px" arcsize="25%" strokecolor="${ctaColor}" fillcolor="${ctaColor}"><w:anchorlock/><center style="font-size:16px;font-weight:700;color:#ffffff;font-family:sans-serif">${ctaLabel}</center></v:roundrect><![endif]-->
<!--[if !mso]><!-->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>
<td class="c-cta" align="center" bgcolor="${ctaColor}" style="background-color:${ctaColor};border-radius:12px;padding:14px 40px">
<a href="${invoiceLink}" style="display:inline-block;font-size:16px;font-weight:700;text-decoration:none;line-height:1"><font class="c-cta-text" color="#ffffff" style="color:#ffffff">${ctaLabel}</font></a>
</td>
</tr></table>
<!--<![endif]-->
</td></tr>

<tr><td class="c-body" bgcolor="#fffdf9" style="background-color:#fffdf9;text-align:center;padding:4px 32px 6px">
<p style="margin:0;font-size:11px;font-weight:500"><font class="c-subtle" color="#9a9080" style="color:#9a9080">You can also view, download, and comment on the full ${docType.toLowerCase()} online.</font></p>
</td></tr>

<tr><td class="c-body" bgcolor="#fffdf9" style="background-color:#fffdf9;text-align:center;padding:16px 32px 24px">
<p style="margin:0;font-size:14px;line-height:1.6;font-weight:500"><font class="c-body-text" color="#1a1a1a" style="color:#1a1a1a">Best,</font></p>
<p style="margin:4px 0 0;font-size:14px;font-weight:700;line-height:1.5"><font class="c-strong" color="#1a1a1a" style="color:#1a1a1a">${escHtml(senderName)}</font></p>
<p style="margin:2px 0 0;font-size:12px;line-height:1.5;font-weight:500"><font class="c-subtle" color="#7a7a7a" style="color:#7a7a7a">via Chrono</font></p>
</td></tr>

<tr><td class="c-ftr" bgcolor="#f8f4ed" style="background-color:#f8f4ed;border-top:1px solid #ebe5d8;text-align:center;padding:18px 32px">
<p style="margin:0;font-size:11px;line-height:1.6;font-weight:500"><font class="c-ftr-text" color="#9a9080" style="color:#9a9080">${docType} sent via Chrono by ${escHtml(senderName)}</font></p>
<p style="margin:8px 0 0;font-size:10px;font-weight:500"><font class="c-ftr-text" color="#b0a898" style="color:#b0a898">Created with &#9829; by </font><a href="https://knowwhatson.com" style="text-decoration:underline"><font class="c-ftr-link" color="#8a7a6a" style="color:#8a7a6a">What&rsquo;s On!</font></a></p>
</td></tr>

</table>
</td></tr>
</table>
</body></html>`;

    const text = `${docType} for "${projectName || "Project"}" from ${senderName}\n\nHi ${recipientName || "there"},\n\n${senderName} has sent you ${isAccepted ? "an invoice" : "a quote"} for "${projectName || "Project"}".\n\nTotal: $${total.toFixed(2)}${taxRate > 0 ? ` (incl. ${taxRate}% tax)` : ""}\n\nView the full ${docType.toLowerCase()}: ${invoiceLink}\n\nBest,\n${senderName}`;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: `${senderName} <info@knowwhatson.com>`,
        to: [recipientEmail],
        subject,
        html,
        text,
      }),
    });

    if (!resendRes.ok) {
      const errorData = await resendRes.text();
      console.log("Resend API error for invoice email:", errorData);
      return c.json({ error: "Failed to send invoice email via Resend" }, 500);
    }

    if (!list.invoice_logs) list.invoice_logs = [];
    list.invoice_logs.push({
      action: "sent",
      date: new Date().toISOString(),
      details: `Sent to ${recipientEmail}`,
    });

    if (isSharedList) {
      await kv.set(`shared-list:${listId}`, list);
    } else {
      await kv.set(`my-list:${list.owner_id}:${listId}`, list);
    }

    return c.json({ ok: true });
  } catch (e) {
    console.log("Send invoice email error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// ===== INVITE SYSTEM (via Resend) =====
const EMAIL_ASSETS_BUCKET = "make-d1909ddd-email-assets";
const LOGO_FILENAME = "chrono-banner-v2.png";

// -- App-assets: PWA icons, favicons, login banner via Supabase Storage --
const APP_ASSETS_BUCKET = "make-d1909ddd-app-assets";

async function ensureAppAssetsBucket() {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = buckets?.some((b: any) => b.name === APP_ASSETS_BUCKET);
  if (!exists) {
    await supabase.storage.createBucket(APP_ASSETS_BUCKET, { public: true });
    console.log("Created public bucket:", APP_ASSETS_BUCKET);
  }
}

function getAppAssetPublicUrl(filename: string): string {
  return `${Deno.env.get("SUPABASE_URL")!}/storage/v1/object/public/${APP_ASSETS_BUCKET}/${filename}`;
}

// Upload an app asset (base64 image from frontend)
app.post(`${PREFIX}/app-assets/upload`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const { filename, image, contentType } = await c.req.json();
    if (!filename || !image) {
      return c.json({ error: "filename and base64 image data required" }, 400);
    }
    await ensureAppAssetsBucket();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const base64Clean = image.replace(/^data:[^;]+;base64,/, "");
    const binaryStr = atob(base64Clean);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

    const { error } = await supabase.storage.from(APP_ASSETS_BUCKET).upload(
      filename, bytes,
      { contentType: contentType || "image/png", upsert: true }
    );
    if (error) {
      console.log("App asset upload error:", error);
      return c.json({ error: `Upload failed: ${error.message}` }, 500);
    }
    const url = getAppAssetPublicUrl(filename);
    console.log("Uploaded app asset:", filename, "→", url);
    return c.json({ url, filename });
  } catch (e) {
    console.log("Upload app asset error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// Get all app asset URLs (checks which ones exist)
app.get(`${PREFIX}/app-assets`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    await ensureAppAssetsBucket();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: files, error } = await supabase.storage.from(APP_ASSETS_BUCKET).list();
    if (error) {
      console.log("List app assets error:", error);
      return c.json({ assets: {} });
    }
    const assets: Record<string, string> = {};
    for (const f of (files || [])) {
      assets[f.name] = getAppAssetPublicUrl(f.name);
    }
    return c.json({ assets });
  } catch (e) {
    console.log("Get app assets error:", e);
    return c.json({ assets: {} });
  }
});

async function ensureEmailAssetsBucket() {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = buckets?.some((b: any) => b.name === EMAIL_ASSETS_BUCKET);
  if (!exists) {
    await supabase.storage.createBucket(EMAIL_ASSETS_BUCKET, { public: true });
    console.log("Created public bucket:", EMAIL_ASSETS_BUCKET);
  }
}

function getLogoPublicUrl(): string {
  return `${Deno.env.get("SUPABASE_URL")!}/storage/v1/object/public/${EMAIL_ASSETS_BUCKET}/${LOGO_FILENAME}`;
}

// Upload logo (base64 PNG from frontend canvas render)
app.post(`${PREFIX}/email-assets/logo`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const { image } = await c.req.json();
    if (!image || typeof image !== "string") {
      return c.json({ error: "Base64 image data required" }, 400);
    }
    await ensureEmailAssetsBucket();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    // Decode base64 to Uint8Array
    const base64Clean = image.replace(/^data:image\/\w+;base64,/, "");
    const binaryStr = atob(base64Clean);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

    const { error } = await supabase.storage.from(EMAIL_ASSETS_BUCKET).upload(
      LOGO_FILENAME, bytes,
      { contentType: "image/png", upsert: true }
    );
    if (error) {
      console.log("Logo upload error:", error);
      return c.json({ error: `Upload failed: ${error.message}` }, 500);
    }
    const url = getLogoPublicUrl();
    console.log("Uploaded email logo to:", url);
    return c.json({ url });
  } catch (e) {
    console.log("Upload email logo error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// Check if logo exists
app.get(`${PREFIX}/email-assets/logo`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const url = getLogoPublicUrl();
    const check = await fetch(url, { method: "HEAD" });
    if (check.ok) return c.json({ url });
    return c.json({ url: null });
  } catch {
    return c.json({ url: null });
  }
});

app.post(`${PREFIX}/invites`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const body = await c.req.json();
    const { email, recipientName, personalMessage } = body;
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return c.json({ error: "A valid email address is required" }, 400);
    }
    if (!recipientName || typeof recipientName !== "string" || !recipientName.trim()) {
      return c.json({ error: "Recipient name is required" }, 400);
    }
    const recipientEmail = email.trim().toLowerCase();
    const cleanRecipientName = recipientName.trim();

    // Prevent duplicate invites to the same email
    const existing = await getAllByPrefix(`invite:${user.id}:`);
    const alreadySent = existing.find((inv: any) => inv.email === recipientEmail);
    if (alreadySent) {
      return c.json({ error: "You've already invited this person" }, 409);
    }

    // Get inviter's profile for personalization
    const profile = await kv.get(`user:${user.id}`);
    const inviterName = profile?.name || user.user_metadata?.name || user.email.split("@")[0];

    // Build branded HTML email — check for hosted logo image
    let logoUrl: string | null = null;
    try {
      const check = await fetch(getLogoPublicUrl(), { method: "HEAD" });
      if (check.ok) logoUrl = getLogoPublicUrl();
    } catch { /* no logo available, will use text fallback */ }
    const emailHtml = buildInviteEmailHtml(inviterName, cleanRecipientName, personalMessage, logoUrl);
    const emailText = buildInviteEmailText(inviterName, cleanRecipientName, personalMessage);

    // Send via Resend
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.log("RESEND_API_KEY not configured");
      return c.json({ error: "Email service not configured" }, 500);
    }

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: `${inviterName} <info@knowwhatson.com>`,
        to: [recipientEmail],
        subject: `${cleanRecipientName}, ${inviterName} created an AI Agent for you.`,
        html: emailHtml,
        text: emailText,
      }),
    });

    if (!resendRes.ok) {
      const errBody = await resendRes.text();
      console.log("Resend API error:", resendRes.status, errBody);
      return c.json({ error: `Failed to send email: ${errBody}` }, 500);
    }

    const resendData = await resendRes.json();

    // Store invite record
    const inviteId = uuid();
    const invite = {
      id: inviteId,
      email: recipientEmail,
      recipient_name: cleanRecipientName,
      personal_message: personalMessage || null,
      resend_email_id: resendData.id,
      status: "sent",
      sent_at: new Date().toISOString(),
      inviter_id: user.id,
      inviter_name: inviterName,
      inviter_email: user.email,
    };
    await kv.set(`invite:${user.id}:${inviteId}`, invite);

    return c.json(invite);
  } catch (e) {
    console.log("Send invite error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

app.get(`${PREFIX}/invites`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const invites = await getAllByPrefix(`invite:${user.id}:`);
    invites.sort((a: any, b: any) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime());
    return c.json(invites);
  } catch (e) {
    console.log("List invites error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

app.delete(`${PREFIX}/invites/:id`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const inviteId = c.req.param("id");
    const invite = await kv.get(`invite:${user.id}:${inviteId}`);
    if (!invite) return c.json({ error: "Invite not found" }, 404);
    await kv.del(`invite:${user.id}:${inviteId}`);
    return c.json({ ok: true });
  } catch (e) {
    console.log("Delete invite error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// Resend an invite (re-send the email)
app.post(`${PREFIX}/invites/:id/resend`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const inviteId = c.req.param("id");
    const invite = await kv.get(`invite:${user.id}:${inviteId}`);
    if (!invite) return c.json({ error: "Invite not found" }, 404);

    const profile = await kv.get(`user:${user.id}`);
    const inviterName = profile?.name || user.user_metadata?.name || user.email.split("@")[0];
    let logoUrl: string | null = null;
    try {
      const check = await fetch(getLogoPublicUrl(), { method: "HEAD" });
      if (check.ok) logoUrl = getLogoPublicUrl();
    } catch { /* no logo */ }
    const recipientName = invite.recipient_name || invite.email.split("@")[0];
    const emailHtml = buildInviteEmailHtml(inviterName, recipientName, invite.personal_message, logoUrl);
    const emailText = buildInviteEmailText(inviterName, recipientName, invite.personal_message);

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) return c.json({ error: "Email service not configured" }, 500);

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: `${inviterName} <info@knowwhatson.com>`,
        to: [invite.email],
        subject: `${recipientName}, ${inviterName} created an AI Agent for you.`,
        html: emailHtml,
        text: emailText,
      }),
    });

    if (!resendRes.ok) {
      const errBody = await resendRes.text();
      console.log("Resend API error on re-send:", resendRes.status, errBody);
      return c.json({ error: `Failed to re-send email: ${errBody}` }, 500);
    }

    const resendData = await resendRes.json();
    invite.resend_email_id = resendData.id;
    invite.status = "sent";
    invite.resent_at = new Date().toISOString();
    await kv.set(`invite:${user.id}:${inviteId}`, invite);

    return c.json(invite);
  } catch (e) {
    console.log("Resend invite error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

/* ── Branded invite email builder — dual light/dark mode ──
   Strategy:
   LIGHT MODE (Gmail, Apple Mail, default):
   • color-scheme: light only meta tags
   • Warm cream backgrounds, black text, earthy CTA
   DARK MODE (Outlook.com / New Outlook):
   • Comprehensive [data-ogsc] (text) + [data-ogsb] (bg) class overrides
   • Every element has a named class for precise targeting
   • Dark navy backgrounds, white/cream text, warm gold accents
   • Base colors use #000000 (inverts cleanly to white in all clients)
   OUTLOOK DESKTOP (Word engine):
   • VML roundrect CTA button
   • bgcolor HTML attrs as fallback
   IMAGES: Logo PNG from Supabase Storage — never inverted by any client
   ─────────────────────────────────────────────────────────────── */
function buildInviteEmailHtml(inviterName: string, recipientName: string, personalMessage?: string, logoUrl?: string): string {
  const msgBlock = personalMessage
    ? `<tr><td class="c-body" bgcolor="#fffdf9" style="background-color:#fffdf9;padding:0 32px"><div class="c-msg" style="margin:16px 0;padding:14px 18px;background-color:#f5f0e8;border-left:3px solid #c4a87a;border-radius:0 8px 8px 0"><font class="c-msg-text" color="#000000" style="font-style:italic;font-size:14px;line-height:1.6;color:#000000">&ldquo;${personalMessage}&rdquo;</font><br/><font class="c-msg-attr" color="#666666" style="font-style:normal;font-size:12px;color:#666666">&mdash; ${inviterName}</font></div></td></tr>`
    : "";

  // Full-width banner image (520×280): gradient + logo + title + tagline — all in one PNG
  // If no hosted image yet, falls back to CSS gradient + text
  const hasBanner = !!logoUrl;
  const firstName = recipientName.split(" ")[0];

  return `<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" lang="en"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<meta name="color-scheme" content="light only"/>
<meta name="supported-color-schemes" content="light only"/>
<style>
  :root { color-scheme: light only !important; }
  body, table, td, div, p, span, a, h1 { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }

  /* ── Outlook.com / New Outlook dark mode: background overrides ── */
  [data-ogsb] .c-outer { background-color: #141218 !important; }
  [data-ogsb] .c-card { background-color: #1e1b2e !important; }
  [data-ogsb] .c-body { background-color: #1e1b2e !important; }
  [data-ogsb] .c-hdr { background-color: #3a2860 !important; }
  [data-ogsb] .c-pill { background-color: #7c3aed !important; }
  [data-ogsb] .c-cta { background-color: #7c3aed !important; }
  [data-ogsb] .c-ftr { background-color: #16141f !important; }
  [data-ogsb] .c-msg { background-color: #2a2540 !important; border-left-color: #c4a87a !important; }
  [data-ogsb] .c-ex { background-color: #1e1b2e !important; }

  /* ── Outlook.com / New Outlook dark mode: text color overrides ── */
  [data-ogsc] .c-title { color: #ffffff !important; }
  [data-ogsc] .c-tagline { color: #c4b5fd !important; }
  [data-ogsc] .c-heading { color: #ffffff !important; }
  [data-ogsc] .c-pill-text { color: #ffffff !important; }
  [data-ogsc] .c-hook { color: #ffffff !important; }
  [data-ogsc] .c-desc { color: #d4cfc6 !important; }
  [data-ogsc] .c-msg-text { color: #e0d8cc !important; }
  [data-ogsc] .c-msg-attr { color: #a09888 !important; }
  [data-ogsc] .c-ex-q { color: #d4cfc6 !important; }
  [data-ogsc] .c-ex-a { color: #f0b060 !important; }
  [data-ogsc] .c-ex-a-last { color: #ffd700 !important; }
  [data-ogsc] .c-body-text { color: #d4cfc6 !important; }
  [data-ogsc] .c-strong { color: #ffffff !important; }
  [data-ogsc] .c-cta-text { color: #ffffff !important; }
  [data-ogsc] .c-subtle { color: #908880 !important; }
  [data-ogsc] .c-ftr-text { color: #706860 !important; }
  [data-ogsc] .c-ftr-link { color: #908880 !important; }

  /* ── Gmail / Apple Mail dark mode ── */
  @media (prefers-color-scheme: dark) {
    .c-outer { background-color: #141218 !important; }
    .c-card { background-color: #1e1b2e !important; }
    .c-body { background-color: #1e1b2e !important; }
    .c-ftr { background-color: #16141f !important; }
    .c-heading, .c-hook, .c-title { color: #ffffff !important; }
    .c-desc, .c-body-text, .c-ex-q { color: #d4cfc6 !important; }
    .c-ex-a { color: #f0b060 !important; }
    .c-ex-a-last { color: #ffd700 !important; }
    .c-strong { color: #ffffff !important; }
    .c-tagline { color: #c4b5fd !important; }
    .c-subtle { color: #908880 !important; }
    .c-ftr-text { color: #706860 !important; }
    .c-cta { background-color: #7c3aed !important; }
    .c-msg { background-color: #2a2540 !important; }
    .c-msg-text { color: #e0d8cc !important; }
  }
</style>
<!--[if mso]><style>table,td{border-collapse:collapse!important}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f5f0e8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif" bgcolor="#f5f0e8">

<table class="c-outer" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f0e8" style="background-color:#f5f0e8">
<tr><td align="center" style="padding:40px 16px">

<table class="c-card" role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" bgcolor="#fffdf9" style="max-width:520px;width:100%;background-color:#fffdf9;border-radius:16px;overflow:hidden">

<!-- HEADER: full-width banner image OR CSS gradient fallback -->
${hasBanner
  ? `<tr><td align="center" style="padding:0;line-height:0;font-size:0"><img src="${logoUrl}" alt="Chrono — Calm, Unified &amp; Personalised" width="520" style="display:block;width:100%;max-width:520px;height:auto;border:0" /></td></tr>`
  : `<tr><td class="c-hdr" align="center" bgcolor="#c8a8e8" style="background:linear-gradient(135deg,#f8c0d8 0%,#d8b4fe 25%,#93c5fd 55%,#99f6e4 100%);background-color:#c8a8e8;padding:32px 32px 20px;text-align:center">
  <div style="display:inline-block;width:72px;height:72px;border-radius:50%;background-color:#d4c1f0;text-align:center;line-height:72px;font-size:32px;font-weight:700;margin-bottom:14px"><font color="#ffffff" style="color:#ffffff">C</font></div>
  <h1 style="margin:0;font-size:20px;font-weight:700;letter-spacing:-0.3px"><font class="c-title" color="#1e1b4b" style="color:#1e1b4b">Chrono</font></h1>
  <p style="margin:4px 0 0;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;font-weight:500"><font class="c-tagline" color="#4a3a6a" style="color:#4a3a6a">Calm, Unified &amp; Personalised</font></p>
</td></tr>`}

<!-- Hook: "<name>, it's time to STOP the back-and-forth" -->
<tr><td class="c-body" bgcolor="#fffdf9" style="background-color:#fffdf9;text-align:center;padding:22px 32px 6px">
  <p style="margin:0;font-size:15px;line-height:1.55"><strong><font class="c-strong" color="#000000" style="color:#000000">${firstName}</font></strong><font class="c-body-text" color="#000000" style="color:#000000">, it&rsquo;s time to STOP the &ldquo;back-and-forth&rdquo; admin chains.</font></p>
</td></tr>

<!-- Body copy -->
<tr><td class="c-body" bgcolor="#fffdf9" style="background-color:#fffdf9;text-align:center;padding:12px 32px 4px">
  <p style="margin:0;font-size:14px;line-height:1.65"><font class="c-body-text" color="#000000" style="color:#000000">If you&rsquo;re still using a basic calendar and a notes app to run your life, you&rsquo;re working too hard. Chrono is Australia&rsquo;s first Conversational Calendar that turns your &ldquo;yap&rdquo; into a plan. Like ChatGPT but for your Calendar + Admin Work (and STILL secure)!</font></p>
  <p style="margin:14px 0 0;font-size:14px;line-height:1.65"><font class="c-body-text" color="#000000" style="color:#000000">Find time for meetings, find time away from meetings, sync shared lists, and get your news &mdash; all in one place, all via chat! Chrono is <strong><font class="c-strong" color="#000000" style="color:#000000">INVITE-ONLY</font></strong> and you are one of the very few people to get to try it!</font></p>
</td></tr>

<!-- Personal message -->
${msgBlock}

<!-- CTA button: "Claim Invite-Only Access" + VML fallback for Outlook desktop -->
<tr><td class="c-body" bgcolor="#fffdf9" style="background-color:#fffdf9;text-align:center;padding:22px 32px 6px">
  <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="https://Chrono.knowwhatson.com" style="height:48px;v-text-anchor:middle;width:280px" arcsize="25%" strokecolor="#7c3aed" fillcolor="#7c3aed"><w:anchorlock/><center style="font-size:16px;font-weight:700;color:#ffffff;font-family:sans-serif">Claim Invite-Only Access</center></v:roundrect><![endif]-->
  <!--[if !mso]><!-->
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>
    <td class="c-cta" align="center" bgcolor="#7c3aed" style="background-color:#7c3aed;border-radius:12px;padding:14px 40px">
      <a href="https://Chrono.knowwhatson.com" style="display:inline-block;font-size:16px;font-weight:700;text-decoration:none;line-height:1"><font class="c-cta-text" color="#ffffff" style="color:#ffffff">Claim Invite-Only Access</font></a>
    </td>
  </tr></table>
  <!--<![endif]-->
</td></tr>

<!-- Sign-off: "Best, <User> and The Chrono Team in spirit!" -->
<tr><td class="c-body" bgcolor="#fffdf9" style="background-color:#fffdf9;text-align:center;padding:20px 32px 24px">
  <p style="margin:0;font-size:14px;line-height:1.6"><font class="c-body-text" color="#000000" style="color:#000000">Best,</font></p>
  <p style="margin:4px 0 0;font-size:14px;font-weight:700;line-height:1.5"><font class="c-strong" color="#000000" style="color:#000000">${inviterName}</font></p>
  <p style="margin:2px 0 0;font-size:12px;line-height:1.5"><font class="c-subtle" color="#7a7a7a" style="color:#7a7a7a">and The Chrono Team, in spirit!</font></p>
</td></tr>

<!-- Footer -->
<tr><td class="c-ftr" bgcolor="#f8f4ed" style="background-color:#f8f4ed;border-top:1px solid #ebe5d8;text-align:center;padding:18px 32px">
  <p style="margin:0;font-size:11px;line-height:1.6"><font class="c-ftr-text" color="#9a9080" style="color:#9a9080">Invite-only access from ${inviterName}. Chrono-logically perfect!</font></p>
  <p style="margin:8px 0 0;font-size:10px"><font class="c-ftr-text" color="#b0a898" style="color:#b0a898">Created with &#9829; by </font><a href="https://knowwhatson.com" style="text-decoration:underline"><font class="c-ftr-link" color="#8a7a6a" style="color:#8a7a6a">What&rsquo;s On!</font></a></p>
</td></tr>

</table>

</td></tr>
</table>

</body></html>`;
}

function buildInviteEmailText(inviterName: string, recipientName: string, personalMessage?: string): string {
  const firstName = recipientName.split(" ")[0];
  let text = `${firstName}, it's time to STOP the "back-and-forth" admin chains.\n\n`;
  text += `If you're still using a basic calendar and a notes app to run your life, you're working too hard. Chrono is Australia's first Conversational Calendar that turns your "yap" into a plan. Like ChatGPT but for your Calendar + Admin Work (and STILL secure)!\n\n`;
  text += `Find time for meetings, find time away from meetings, sync shared lists, and get your news - all in one place, all via chat! Chrono is INVITE-ONLY and you are one of the very few people to get to try it!\n\n`;
  if (personalMessage) text += `"${personalMessage}"\n— ${inviterName}\n\n`;
  text += `Claim Invite-Only Access: https://Chrono.knowwhatson.com\n\n`;
  text += `Best,\n${inviterName}\nand The Chrono Team, in spirit!`;
  return text;
}

// ── SMS Invites ──
app.post(`${PREFIX}/invites/sms`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const body = await c.req.json();
    const { phone, recipientName, personalMessage } = body;
    if (!phone || typeof phone !== "string") return c.json({ error: "A phone number is required" }, 400);
    if (!recipientName || typeof recipientName !== "string" || !recipientName.trim()) return c.json({ error: "Recipient name is required" }, 400);
    const cleanPhone = phone.trim().replace(/[^+\d]/g, "");
    const cleanName = recipientName.trim();
    const existing = await getAllByPrefix(`invite:${user.id}:`);
    if (existing.find((inv: any) => inv.phone === cleanPhone)) return c.json({ error: "You've already invited this person" }, 409);
    const profile = await kv.get(`user:${user.id}`);
    const inviterName = profile?.name || user.user_metadata?.name || user.email.split("@")[0];
    const inviteId = uuid();
    const invite = { id: inviteId, phone: cleanPhone, recipient_name: cleanName, personal_message: personalMessage || null, type: "sms", status: "sent", sent_at: new Date().toISOString(), inviter_id: user.id, inviter_name: inviterName, inviter_email: user.email };
    await kv.set(`invite:${user.id}:${inviteId}`, invite);
    return c.json(invite);
  } catch (e) { console.log("SMS invite error:", e); return c.json({ error: errorString(e) }, 500); }
});

// ── Notifications helper ──
async function updateCalendarShareGrants(userId: string) {
  try {
    const connections = await kv.getByPrefix(`cal_conn:${userId}:`);
    const activeConns = (connections || []).filter((conn: any) => conn.is_active);
    const manualEvents = await getAllByPrefix(`event:${userId}:`);
    const hasManual = manualEvents.some((ev: any) => !ev.provider || ev.provider === "manual");
    const sharedCount = activeConns.length + (hasManual ? 1 : 0);

    const allGrants = await getAllByPrefix(`cal-share-grant:`);
    const myGrants = allGrants.filter((g: any) => g.grantor_id === userId);
    
    let grantorName = "A friend";
    if (myGrants.length > 0) {
      const profile = await kv.get(`profile:${userId}`);
      if (profile && profile.name) grantorName = profile.name;
    }

    for (const grant of myGrants) {
      if (grant.shared_count !== sharedCount) {
        if (grant.shared_count !== undefined && sharedCount > grant.shared_count) {
          await createNotification(
            grant.grantee_id,
            "friend_updated_cal",
            `${grantorName} shared a new calendar with you`,
            { friend_id: userId, friend_name: grantorName, shared_count: sharedCount }
          );
        } else if (grant.shared_count !== undefined && sharedCount < grant.shared_count) {
          await createNotification(
            grant.grantee_id,
            "friend_updated_cal",
            `${grantorName} removed a shared calendar`,
            { friend_id: userId, friend_name: grantorName, shared_count: sharedCount }
          );
        }
        grant.shared_count = sharedCount;
        await kv.set(`cal-share-grant:${grant.grantee_id}:${userId}`, grant);
      }
    }
  } catch (e) {
    console.log("updateCalendarShareGrants error:", e);
  }
}

async function createNotification(userId: string, type: string, message: string, meta?: any) {
  const id = uuid();
  const notif = { id, user_id: userId, type, message, meta: meta || {}, read: false, created_at: new Date().toISOString() };
  await kv.set(`notification:${userId}:${id}`, notif);
  // Fire-and-forget: send push notification if user has subscriptions
  sendPushToUser(userId, type, message, meta).catch((e) =>
    console.log("Push notification send error (non-fatal):", e)
  );
  return notif;
}

// ── Notifications routes ──
app.get(`${PREFIX}/notifications`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const notifs = await getAllByPrefix(`notification:${user.id}:`);
    notifs.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return c.json(notifs);
  } catch (e) { console.log("Get notifications error:", e); return c.json({ error: errorString(e) }, 500); }
});

app.post(`${PREFIX}/notifications/:id/read`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const notifId = c.req.param("id");
    const notif = await kv.get(`notification:${user.id}:${notifId}`);
    if (!notif) return c.json({ error: "Notification not found" }, 404);
    notif.read = true;
    await kv.set(`notification:${user.id}:${notifId}`, notif);
    return c.json(notif);
  } catch (e) { console.log("Read notification error:", e); return c.json({ error: errorString(e) }, 500); }
});

app.post(`${PREFIX}/notifications/read-all`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const notifs = await getAllByPrefix(`notification:${user.id}:`);
    const updates: Promise<any>[] = [];
    for (const n of notifs) {
      if (!n.read) { n.read = true; updates.push(kv.set(`notification:${user.id}:${n.id}`, n)); }
    }
    await Promise.all(updates);
    return c.json({ ok: true });
  } catch (e) { console.log("Read all notifications error:", e); return c.json({ error: errorString(e) }, 500); }
});

app.delete(`${PREFIX}/notifications/:id`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const notifId = c.req.param("id");
    await kv.del(`notification:${user.id}:${notifId}`);
    return c.json({ ok: true });
  } catch (e) { console.log("Delete notification error:", e); return c.json({ error: errorString(e) }, 500); }
});

// ── Friends & Calendar Share Requests ──
app.get(`${PREFIX}/friends`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const friends: any[] = [];
    const seenIds = new Set<string>();
    const myInvites = await getAllByPrefix(`invite:${user.id}:`);
    const { data: usersData } = await supabase.auth.admin.listUsers();
    const allUsers = usersData?.users || [];
    for (const inv of myInvites) {
      if (!inv.email) { if (inv.phone) { friends.push({ id: inv.id, name: inv.recipient_name || inv.phone, phone: inv.phone, status: "pending", invited_by_me: true, type: "sms", has_calendar: false }); } continue; }
      const email = inv.email.toLowerCase();
      const found = allUsers.find((u: any) => u.email?.toLowerCase() === email);
      if (found && !seenIds.has(found.id)) {
        const p = await kv.get(`user:${found.id}`);
        seenIds.add(found.id);
        friends.push({ id: found.id, name: p?.name || inv.recipient_name || email.split("@")[0], email, status: "accepted", invited_by_me: true, has_calendar: false });
      } else if (!found) {
        friends.push({ id: inv.id, name: inv.recipient_name || email.split("@")[0], email: inv.email, status: "pending", invited_by_me: true, type: inv.type || "email", has_calendar: false });
      }
    }
    const allInviteKeys = await getAllByPrefix("invite:");
    for (const inv of allInviteKeys) {
      if (inv.email && inv.email.toLowerCase() === user.email.toLowerCase() && inv.inviter_id !== user.id && !seenIds.has(inv.inviter_id)) {
        const p = await kv.get(`user:${inv.inviter_id}`);
        seenIds.add(inv.inviter_id);
        friends.push({ id: inv.inviter_id, name: p?.name || inv.inviter_name || inv.inviter_email?.split("@")[0], email: inv.inviter_email, status: "accepted", invited_by_me: false, has_calendar: false });
      }
    }
    const myContacts = await kv.getByPrefix(`contact:${user.id}:`);
    // Load grants to get shared_calendar_count (they shared with me)
    const myGrants = await kv.getByPrefix(`cal-share-grant:${user.id}:`);
    // Load grants where I am the grantor (I shared with them)
    const allGrantKeys = await getAllByPrefix(`cal-share-grant:`);
    const iGranted = allGrantKeys.filter((g: any) => g.grantor_id === user.id);
    for (const friend of friends) {
      const matched = myContacts.find((ct: any) => ct.friend_id === friend.id);
      if (matched) { friend.has_calendar = true; friend.contact_id = matched.id; }
      // Check if this friend has granted us calendar access
      const grant = myGrants.find((g: any) => g.grantor_id === friend.id);
      if (grant) { friend.has_calendar = true; friend.shared_calendar_count = grant.shared_count || 0; if (!friend.contact_id && matched) friend.contact_id = matched.id; }
      // Check if I have shared my calendar with this friend
      const myGrant = iGranted.find((g: any) => g.grantee_id === friend.id);
      if (myGrant) { friend.i_shared = true; friend.i_shared_count = myGrant.shared_count || 0; }
    }
    friends.sort((a: any, b: any) => { if (a.status === "accepted" && b.status !== "accepted") return -1; if (a.status !== "accepted" && b.status === "accepted") return 1; return a.name.localeCompare(b.name); });
    return c.json(friends);
  } catch (e) { console.log("Get friends error:", e); return c.json({ error: errorString(e) }, 500); }
});

app.post(`${PREFIX}/calendar-share-requests`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const { friend_id, friend_email, friend_name } = await c.req.json();
    if (!friend_id || !friend_email) return c.json({ error: "friend_id and friend_email required" }, 400);
    const existing = await getAllByPrefix(`cal-share-req:to:${friend_id}:`);
    if (existing.find((r: any) => r.from_id === user.id && r.status === "pending")) return c.json({ error: "You already have a pending request" }, 409);
    const profile = await kv.get(`user:${user.id}`);
    const myName = profile?.name || user.user_metadata?.name || user.email.split("@")[0];
    const reqId = uuid();
    const shareReq = { id: reqId, from_id: user.id, from_name: myName, from_email: user.email, to_id: friend_id, to_email: friend_email.toLowerCase(), to_name: friend_name || friend_email.split("@")[0], status: "pending", created_at: new Date().toISOString() };
    await kv.set(`cal-share-req:to:${friend_id}:${reqId}`, shareReq);
    await kv.set(`cal-share-req:from:${user.id}:${reqId}`, shareReq);
    // Create notification for the recipient
    await createNotification(friend_id, "friend_requested_cal", `${myName} wants to see your calendar`, { friend_id: user.id, friend_name: myName, request_id: reqId });
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (resendApiKey) { try { await fetch("https://api.resend.com/emails", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendApiKey}` }, body: JSON.stringify({ from: `Chrono <info@knowwhatson.com>`, to: [friend_email.toLowerCase()], subject: `${myName} wants to see your calendar on Chrono`, text: `Hey! ${myName} has requested to view your calendar on Chrono so you can plan events together.\n\nOpen Chrono to accept or decline: https://Chrono.knowwhatson.com\n\nYou'll find the request under Settings > My Contacts.` }) }); } catch (emailErr) { console.log("Calendar share request email error:", emailErr); } }
    return c.json(shareReq);
  } catch (e) { console.log("Calendar share request error:", e); return c.json({ error: errorString(e) }, 500); }
});

app.get(`${PREFIX}/calendar-share-requests/incoming`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try { const reqs = await getAllByPrefix(`cal-share-req:to:${user.id}:`); reqs.sort((a: any, b: any) => (new Date(b.created_at || 0).getTime() || 0) - (new Date(a.created_at || 0).getTime() || 0)); return c.json(reqs); }
  catch (e) { console.log("Get incoming share requests error:", e); return c.json({ error: errorString(e) }, 500); }
});

app.get(`${PREFIX}/calendar-share-requests/outgoing`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try { const reqs = await getAllByPrefix(`cal-share-req:from:${user.id}:`); reqs.sort((a: any, b: any) => (new Date(b.created_at || 0).getTime() || 0) - (new Date(a.created_at || 0).getTime() || 0)); return c.json(reqs); }
  catch (e) { console.log("Get outgoing share requests error:", e); return c.json({ error: errorString(e) }, 500); }
});

app.post(`${PREFIX}/calendar-share-requests/:id/respond`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const reqId = c.req.param("id");
    const { action } = await c.req.json();
    if (!action || (action !== "accept" && action !== "decline")) return c.json({ error: "action must be 'accept' or 'decline'" }, 400);
    const shareReq = await kv.get(`cal-share-req:to:${user.id}:${reqId}`);
    if (!shareReq) return c.json({ error: "Share request not found" }, 404);
    if (shareReq.status !== "pending") return c.json({ error: "Request already responded to" }, 400);
    shareReq.status = action === "accept" ? "accepted" : "declined";
    shareReq.responded_at = new Date().toISOString();
    if (action === "accept") {
      // Auto-share ALL user's calendars with the requestor via a grant record
      const connections = await kv.getByPrefix(`cal_conn:${user.id}:`);
      const activeConns = (connections || []).filter((conn: any) => conn.is_active);
      const pd = await kv.get(`user:${user.id}`);
      const myName = pd?.name || user.user_metadata?.name || user.email.split("@")[0];
      // Count manual events too (events without a provider/connection)
      const manualEvents = await getAllByPrefix(`event:${user.id}:`);
      const hasManual = manualEvents.some((ev: any) => !ev.provider || ev.provider === "manual");
      const sharedCount = activeConns.length + (hasManual ? 1 : 0);
      // Store a grant so freebusy/availability can pull events directly
      const grantId = uuid();
      await kv.set(`cal-share-grant:${shareReq.from_id}:${user.id}`, {
        id: grantId,
        grantor_id: user.id,
        grantor_name: myName,
        grantor_email: user.email,
        grantee_id: shareReq.from_id,
        shared_count: sharedCount,
        created_at: new Date().toISOString(),
      });
      shareReq.shared_count = sharedCount;
      // Also create a contact entry for the requestor so existing freebusy queries work
      const contactId = uuid();
      await kv.set(`contact:${shareReq.from_id}:${contactId}`, {
        id: contactId,
        user_id: shareReq.from_id,
        name: myName,
        friend_id: user.id,
        grant_based: true,
        created_at: new Date().toISOString(),
        source: "share_request",
      });
      shareReq.contact_id = contactId;
      // Create notification for the requestor
      await createNotification(shareReq.from_id, "friend_shared_cal", `${myName} shared ${sharedCount} calendar${sharedCount !== 1 ? "s" : ""} with you`, { friend_id: user.id, friend_name: myName, shared_count: sharedCount });
    }
    await kv.set(`cal-share-req:to:${user.id}:${reqId}`, shareReq);
    await kv.set(`cal-share-req:from:${shareReq.from_id}:${reqId}`, shareReq);
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (resendApiKey) { try { const pd = await kv.get(`user:${user.id}`); const myName = pd?.name || user.user_metadata?.name || user.email.split("@")[0]; await fetch("https://api.resend.com/emails", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendApiKey}` }, body: JSON.stringify({ from: `Chrono <info@knowwhatson.com>`, to: [shareReq.from_email], subject: `${myName} ${shareReq.status} your calendar share request`, text: `${myName} has ${shareReq.status} your request to share their calendar on Chrono.${action === "accept" ? ` They shared ${shareReq.shared_count || 0} calendar(s) with you.` : ""}\n\nOpen Chrono: https://Chrono.knowwhatson.com` }) }); } catch (emailErr) { console.log("Share response email error:", emailErr); } }
    return c.json(shareReq);
  } catch (e) { console.log("Share request respond error:", e); return c.json({ error: errorString(e) }, 500); }
});

// ── Unshare calendar ─────────────────────────���──���─────────────
app.delete(`${PREFIX}/calendar-share/:friendId`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const friendId = c.req.param("friendId");
    // Delete the grant record where I am the grantor and friend is the grantee
    const grantKey = `cal-share-grant:${friendId}:${user.id}`;
    const grant = await kv.get(grantKey);
    if (!grant) return c.json({ error: "No active calendar share found with this friend" }, 404);
    await kv.del(grantKey);
    // Also remove the auto-created contact on the friend's side (so they lose freebusy access)
    const friendContacts = await getAllByPrefix(`contact:${friendId}:`);
    const autoContact = friendContacts.find((ct: any) => ct.friend_id === user.id && ct.source === "share_request");
    if (autoContact) {
      await kv.del(`contact:${friendId}:${autoContact.id}`);
    }
    // Send notification to the friend
    const pd = await kv.get(`user:${user.id}`);
    const myName = pd?.name || user.user_metadata?.name || user.email.split("@")[0];
    await createNotification(friendId, "friend_shared_cal", `${myName} stopped sharing their calendar with you`, { friend_id: user.id, friend_name: myName });
    return c.json({ success: true });
  } catch (e) { console.log("Unshare calendar error:", e); return c.json({ error: errorString(e) }, 500); }
});

// ═══════════════════════════════════════════��═══════════════════════════
// ── WEEKLY REVIEW ──────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════��═══════════════════

// Save a weekly review snapshot to KV
app.post(`${PREFIX}/weekly-review/save`, async (c) => {
  try {
    const user = await getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    const body = await c.req.json();
    const { weekKey, summary } = body; // weekKey = "2026-W09"
    if (!weekKey || !summary) return c.json({ error: "weekKey and summary required" }, 400);
    const kvKey = `weekly-review:${user.id}:${weekKey}`;
    await kv.set(kvKey, { ...summary, weekKey, savedAt: new Date().toISOString() });
    return c.json({ success: true });
  } catch (e) { console.log("Save weekly review error:", e); return c.json({ error: errorString(e) }, 500); }
});

// Get past weekly review summaries for trend analysis
app.get(`${PREFIX}/weekly-review/history`, async (c) => {
  try {
    const user = await getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    const prefix = `weekly-review:${user.id}:`;
    const reviews = await kv.getByPrefix(prefix);
    // Sort by weekKey descending (most recent first)
    const sorted = (Array.isArray(reviews) ? reviews : [])
      .sort((a: any, b: any) => (b.weekKey || "").localeCompare(a.weekKey || ""));
    return c.json(sorted);
  } catch (e) { console.log("Weekly review history error:", e); return c.json({ error: errorString(e) }, 500); }
});

// ══════════════════════════════��══���═════════════════════════════════
// Smart Inbox — dismiss / snooze state for action queue items
// ═══════════════════════��═════════��═════════════════════════════════

app.get(`${PREFIX}/inbox/state`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const state = await kv.get(`inbox:${user.id}`) || { dismissed: {}, snoozed: {} };
    const now = Date.now();
    let changed = false;
    for (const [key, until] of Object.entries(state.snoozed || {})) {
      if ((until as number) <= now) { delete state.snoozed[key]; changed = true; }
    }
    if (changed) await kv.set(`inbox:${user.id}`, state);
    return c.json(state);
  } catch (e) { console.log("Inbox state error:", e); return c.json({ error: errorString(e) }, 500); }
});

app.post(`${PREFIX}/inbox/dismiss`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const { itemId } = await c.req.json();
    if (!itemId) return c.json({ error: "itemId required" }, 400);
    const state = await kv.get(`inbox:${user.id}`) || { dismissed: {}, snoozed: {} };
    state.dismissed[itemId] = Date.now();
    delete state.snoozed?.[itemId];
    await kv.set(`inbox:${user.id}`, state);
    return c.json({ ok: true });
  } catch (e) { console.log("Inbox dismiss error:", e); return c.json({ error: errorString(e) }, 500); }
});

app.post(`${PREFIX}/inbox/snooze`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const { itemId, until } = await c.req.json();
    if (!itemId || !until) return c.json({ error: "itemId and until required" }, 400);
    const state = await kv.get(`inbox:${user.id}`) || { dismissed: {}, snoozed: {} };
    state.snoozed[itemId] = new Date(until).getTime();
    delete state.dismissed?.[itemId];
    await kv.set(`inbox:${user.id}`, state);
    return c.json({ ok: true });
  } catch (e) { console.log("Inbox snooze error:", e); return c.json({ error: errorString(e) }, 500); }
});

app.post(`${PREFIX}/inbox/clear-dismissed`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const state = await kv.get(`inbox:${user.id}`) || { dismissed: {}, snoozed: {} };
    state.dismissed = {};
    await kv.set(`inbox:${user.id}`, state);
    return c.json({ ok: true });
  } catch (e) { console.log("Inbox clear error:", e); return c.json({ error: errorString(e) }, 500); }
});

// ===== PUSH NOTIFICATIONS (VAPID) =====

// Helper: get or generate VAPID keys (stored in KV for persistence)
// Uses Web Crypto API (native in Deno) to avoid Node crypto compat issues with web-push.generateVAPIDKeys()
async function getVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const existing = await kv.get("vapid_keys_global");
  // Validate: publicKey should be ~87 chars (65 bytes base64url) and privateKey ~43 chars (32 bytes)
  if (existing?.publicKey && existing?.privateKey &&
      typeof existing.publicKey === "string" && existing.publicKey.length >= 80 &&
      typeof existing.privateKey === "string" && existing.privateKey.length >= 40) {
    return existing;
  }
  if (existing) {
    console.log("Existing VAPID keys invalid/corrupt, regenerating. publicKey length:", existing.publicKey?.length, "privateKey length:", existing.privateKey?.length);
  }

  // URL-safe base64 encode (no padding)
  const toBase64Url = (buf: Uint8Array) =>
    btoa(String.fromCharCode(...buf))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

  try {
    // Generate ECDH P-256 key pair using Web Crypto API (Deno-native, no Node compat needed)
    const keyPair = await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveBits"],
    );

    // Export public key as raw uncompressed point (65 bytes)
    const pubRaw = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey));
    // Export private key as JWK to get the 'd' parameter (the 32-byte scalar)
    const privJwk: any = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
    // JWK 'd' is already URL-safe base64 — but re-encode via raw bytes for consistency
    const privB64 = privJwk.d; // already URL-safe base64 without padding

    const vapidData = {
      publicKey: toBase64Url(pubRaw),
      privateKey: privB64,
    };

    await kv.set("vapid_keys_global", vapidData);
    console.log("Generated new VAPID keys via Web Crypto API");
    return vapidData;
  } catch (webCryptoErr) {
    console.log("Web Crypto VAPID generation failed, trying web-push fallback:", webCryptoErr);
    try {
      const keys = webpush.generateVAPIDKeys();
      const vapidData = { publicKey: keys.publicKey, privateKey: keys.privateKey };
      await kv.set("vapid_keys_global", vapidData);
      console.log("Generated new VAPID keys via web-push fallback");
      return vapidData;
    } catch (wpErr) {
      console.log("web-push VAPID generation also failed:", wpErr);
      throw new Error(`VAPID key generation failed: ${wpErr}`);
    }
  }
}

// Map notification types to push preference categories
function notifTypeToCategory(type: string): string {
  if (type === "reminder") return "reminders";
  if (type === "friend_joined") return "friend_joined";
  if (type === "friend_shared_cal" || type === "friend_updated_cal" || type === "calendar_share_accepted" || type === "calendar_share_rejected") return "friend_calendar_share";
  if (type === "friend_requested_cal") return "calendar_share_requests";
  if (type === "friend_shared_list") return "shared_list_invites";
  if (type === "friend_updated_list" || type === "friend_left_list") return "shared_list_updates";
  if (type === "invoice_viewed") return "invoice_viewed";
  if (type === "invoice_accepted") return "invoice_accepted";
  if (type === "invoice_comment") return "invoice_comment";
  if (type === "invoice_change_requested") return "invoice_change_requested";
  if (type === "invoice_invalidated") return "invoice_invalidated";
  return "general";
}

// Derive the deep-link URL a push notification should open
function notifTypeToUrl(type: string, meta?: any): string {
  const listId = meta?.listId || meta?.list_id;
  // Invoices & Contracts → invoice generator page
  if ((type === "invoice_viewed" || type === "invoice_accepted" || type === "invoice_comment" || type === "invoice_change_requested" || type === "invoice_invalidated") && listId) {
    return `/invoice-generator/${listId}`;
  }
  // Reminders → home
  if (type === "reminder") return "/";
  // List invites / activity → Track > Tasks
  if (type === "friend_shared_list" || type === "friend_updated_list" || type === "friend_left_list") {
    return "/track?tab=tasks";
  }
  // Calendar / contacts
  if (type === "friend_requested_cal" || type === "friend_shared_cal" || type === "friend_updated_cal" || type === "calendar_share_accepted" || type === "calendar_share_rejected") {
    return "/settings?section=contacts";
  }
  // Friend joined → contacts
  if (type === "friend_joined") return "/settings?section=contacts";
  // Booking requests → calendar
  if (type === "booking_request") return "/calendar";
  return "/";
}

// Send push to all subscriptions for a user
async function sendPushToUser(userId: string, type: string, message: string, meta?: any) {
  const prefs = await kv.get(`push_prefs:${userId}`);
  const category = notifTypeToCategory(type);
  if (prefs && prefs[category] === false) {
    console.log(`Push skipped for user ${userId}: category '${category}' disabled`);
    return;
  }

  const subs = await getAllByPrefix(`push_sub:${userId}:`);
  if (!subs || subs.length === 0) return;

  const vapidKeys = await getVapidKeys();
  webpush.setVapidDetails("mailto:info@knowwhatson.com", vapidKeys.publicKey, vapidKeys.privateKey);

  const payload = JSON.stringify({
    title: "Chrono",
    body: message,
    type,
    meta: meta || {},
    url: notifTypeToUrl(type, meta),
  });

  const staleEndpoints: string[] = [];
  for (const sub of subs) {
    try {
      await webpush.sendNotification(sub.subscription, payload);
    } catch (e: any) {
      console.log(`Push to endpoint failed (status ${e?.statusCode}):`, e?.message || e);
      if (e?.statusCode === 410 || e?.statusCode === 404) {
        staleEndpoints.push(sub.endpoint_hash);
      }
    }
  }
  for (const hash of staleEndpoints) {
    await kv.del(`push_sub:${userId}:${hash}`);
    console.log(`Removed stale push subscription ${hash} for user ${userId}`);
  }
}

// GET /push/vapid-key
app.get(`${PREFIX}/push/vapid-key`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const keys = await getVapidKeys();
    return c.json({ publicKey: keys.publicKey });
  } catch (e) {
    console.log("Get VAPID key error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// POST /push/subscribe
app.post(`${PREFIX}/push/subscribe`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const { subscription } = await c.req.json();
    if (!subscription?.endpoint) return c.json({ error: "Invalid subscription" }, 400);

    const encoder = new TextEncoder();
    const data = encoder.encode(subscription.endpoint);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const endpointHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 16);

    await kv.set(`push_sub:${user.id}:${endpointHash}`, {
      user_id: user.id,
      endpoint_hash: endpointHash,
      subscription,
      created_at: new Date().toISOString(),
    });

    const prefs = await kv.get(`push_prefs:${user.id}`);
    if (!prefs) {
      await kv.set(`push_prefs:${user.id}`, {
        reminders: true, calendar_share_requests: true, shared_list_invites: true,
        shared_list_updates: true, friend_joined: true, friend_calendar_share: true,
      });
    }

    console.log(`Push subscription stored for user ${user.id} (${endpointHash})`);
    return c.json({ ok: true });
  } catch (e) {
    console.log("Push subscribe error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// DELETE /push/unsubscribe
app.delete(`${PREFIX}/push/unsubscribe`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const { endpoint } = await c.req.json();
    if (!endpoint) return c.json({ error: "Endpoint required" }, 400);

    const encoder = new TextEncoder();
    const data = encoder.encode(endpoint);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const endpointHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 16);

    await kv.del(`push_sub:${user.id}:${endpointHash}`);
    console.log(`Push subscription removed for user ${user.id} (${endpointHash})`);
    return c.json({ ok: true });
  } catch (e) {
    console.log("Push unsubscribe error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// GET /push/preferences
app.get(`${PREFIX}/push/preferences`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const prefs = await kv.get(`push_prefs:${user.id}`) || {
      reminders: true, calendar_share_requests: true, shared_list_invites: true,
      shared_list_updates: true, friend_joined: true, friend_calendar_share: true,
    };
    return c.json(prefs);
  } catch (e) {
    console.log("Get push preferences error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// PATCH /push/preferences
app.patch(`${PREFIX}/push/preferences`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const updates = await c.req.json();
    const prefs = await kv.get(`push_prefs:${user.id}`) || {
      reminders: true, calendar_share_requests: true, shared_list_invites: true,
      shared_list_updates: true, friend_joined: true, friend_calendar_share: true,
    };
    Object.assign(prefs, updates);
    await kv.set(`push_prefs:${user.id}`, prefs);
    return c.json(prefs);
  } catch (e) {
    console.log("Patch push preferences error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// POST /push/test
app.post(`${PREFIX}/push/test`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const subs = await getAllByPrefix(`push_sub:${user.id}:`);
    if (!subs || subs.length === 0) return c.json({ error: "No push subscriptions found" }, 404);

    const vapidKeys = await getVapidKeys();
    webpush.setVapidDetails("mailto:info@knowwhatson.com", vapidKeys.publicKey, vapidKeys.privateKey);

    const payload = JSON.stringify({
      title: "Chrono",
      body: "Push notifications are working! You'll receive alerts for reminders, shared lists, and friend activity.",
      type: "test",
      url: "/settings",
    });

    let sent = 0;
    for (const sub of subs) {
      try {
        await webpush.sendNotification(sub.subscription, payload);
        sent++;
      } catch (e: any) { console.log("Test push failed:", e?.message || e); }
    }
    return c.json({ ok: true, sent, total: subs.length });
  } catch (e) {
    console.log("Test push error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════
// ── Focus Mode ──
// ══════════════════════════════════════���════════════════════════

// POST /focus/sessions — save a completed or partial focus session
app.post(`${PREFIX}/focus/sessions`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const body = await c.req.json();
    const id = uuid();
    const session = {
      id,
      user_id: user.id,
      type: body.type || "work",
      duration_seconds: body.duration_seconds || 0,
      preset_label: body.preset_label || "Pomodoro",
      task_name: body.task_name || null,
      list_name: body.list_name || null,
      completed: body.completed ?? true,
      started_at: body.started_at || new Date().toISOString(),
      ended_at: body.ended_at || new Date().toISOString(),
      created_at: new Date().toISOString(),
    };
    await kv.set(`focus_session:${user.id}:${id}`, session);
    return c.json(session);
  } catch (e) {
    console.log("Save focus session error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// GET /focus/sessions — list recent focus sessions (newest first)
app.get(`${PREFIX}/focus/sessions`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const sessions = await getAllByPrefix(`focus_session:${user.id}:`);
    // Sort newest first
    sessions.sort((a: any, b: any) =>
      (b.started_at || b.created_at || "").localeCompare(a.started_at || a.created_at || "")
    );
    return c.json(sessions.slice(0, 100));
  } catch (e) {
    console.log("Get focus sessions error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// GET /focus/settings — get user's focus mode preferences
app.get(`${PREFIX}/focus/settings`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const settings = await kv.get(`focus_settings:${user.id}`);
    return c.json(settings || {
      auto_start_breaks: true,
      auto_start_work: false,
      sound_enabled: true,
      long_break_interval: 4,
      long_break_min: 15,
    });
  } catch (e) {
    console.log("Get focus settings error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// PUT /focus/settings — save user's focus mode preferences
app.put(`${PREFIX}/focus/settings`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const body = await c.req.json();
    await kv.set(`focus_settings:${user.id}`, body);
    return c.json(body);
  } catch (e) {
    console.log("Save focus settings error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// ===== GMAIL API INTEGRATION =====

const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

function getGmailRedirectUri(): string {
  return `${Deno.env.get("SUPABASE_URL")}/functions/v1/make-server-d1909ddd/gmail/callback`;
}

// Helper: get valid Gmail access token (refreshes if expired)
async function getValidGmailToken(conn: any): Promise<string> {
  const expiresAt = new Date(conn.token_expires_at).getTime();
  if (expiresAt - Date.now() < 5 * 60 * 1000) {
    if (!conn.refresh_token) throw new Error("No Gmail refresh token available");
    const clientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: conn.refresh_token,
        grant_type: "refresh_token",
      }),
    });
    const data = await res.json();
    if (data.error) throw new Error(`Gmail token refresh failed: ${data.error}`);
    conn.access_token = data.access_token;
    conn.token_expires_at = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString();
    conn.updated_at = new Date().toISOString();
    await kv.set(`gmail_conn:${conn.user_id}:${conn.id}`, conn);
    return data.access_token;
  }
  return conn.access_token;
}

// POST /gmail/connect — returns OAuth URL for Gmail
app.post(`${PREFIX}/gmail/connect`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    if (!clientId) return c.json({ error: "GOOGLE_CLIENT_ID not configured on server" }, 500);

    const state = crypto.randomUUID();
    await kv.set(`gmail_oauth_state:${state}`, {
      user_id: user.id,
      created_at: new Date().toISOString(),
    });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: getGmailRedirectUri(),
      response_type: "code",
      scope: GMAIL_SCOPES,
      access_type: "offline",
      prompt: "consent",
      state,
    });

    return c.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
  } catch (e) {
    console.log("Gmail connect error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// GET /gmail/callback — OAuth callback
app.get(`${PREFIX}/gmail/callback`, async (c) => {
  try {
    const code = c.req.query("code");
    const state = c.req.query("state");
    const errorParam = c.req.query("error");

    if (errorParam) {
      console.log("Gmail OAuth error:", errorParam);
      return c.html(`<html><body><h2>Gmail authorization failed</h2><p>${errorParam}</p><script>window.close();</script></body></html>`);
    }
    if (!code || !state) {
      return c.html(`<html><body><h2>Missing code or state</h2><script>window.close();</script></body></html>`);
    }

    const stateData = await kv.get(`gmail_oauth_state:${state}`);
    if (!stateData) {
      return c.html(`<html><body><h2>Invalid or expired state</h2><script>window.close();</script></body></html>`);
    }
    await kv.del(`gmail_oauth_state:${state}`);
    const userId = stateData.user_id;

    const clientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: getGmailRedirectUri(),
        grant_type: "authorization_code",
      }),
    });
    const tokenData = await tokenRes.json();
    if (tokenData.error) {
      console.log("Gmail token exchange error:", tokenData);
      return c.html(`<html><body><h2>Token exchange failed</h2><p>${tokenData.error_description || tokenData.error}</p><script>window.close();</script></body></html>`);
    }

    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userInfo = await userInfoRes.json();

    const existingConns = await getAllByPrefix(`gmail_conn:${userId}:`);
    const existing = existingConns.find((cn: any) => cn.external_account_id === userInfo.id);

    const connectionId = existing?.id || uuid();
    const connection = {
      id: connectionId,
      user_id: userId,
      email: userInfo.email,
      display_name: userInfo.name || userInfo.email,
      external_account_id: userInfo.id,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || existing?.refresh_token || null,
      token_expires_at: new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString(),
      is_active: true,
      created_at: existing?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await kv.set(`gmail_conn:${userId}:${connectionId}`, connection);

    return c.html(`
      <html><body>
        <h2>Gmail connected successfully!</h2>
        <p>You can close this window and return to the app.</p>
        <script>
          if (window.opener) {
            window.opener.postMessage({ type: 'gmail-connected', connectionId: '${connectionId}', email: '${userInfo.email}' }, '*');
            window.close();
          } else {
            window.location.href = '/email';
          }
        </script>
      </body></html>
    `);
  } catch (e) {
    console.log("Gmail callback exception:", e);
    return c.html(`<html><body><h2>Error</h2><p>${errorString(e)}</p><script>window.close();</script></body></html>`);
  }
});

// GET /gmail/connections — list connected Gmail accounts
app.get(`${PREFIX}/gmail/connections`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const conns = await getAllByPrefix(`gmail_conn:${user.id}:`);
    const safe = conns.map((cn: any) => ({
      id: cn.id,
      email: cn.email,
      display_name: cn.display_name,
      is_active: cn.is_active,
      created_at: cn.created_at,
    }));
    return c.json(safe);
  } catch (e) {
    console.log("Get Gmail connections error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// DELETE /gmail/connections/:id — disconnect a Gmail account
app.delete(`${PREFIX}/gmail/connections/:id`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const connId = c.req.param("id");
    const conn = await kv.get(`gmail_conn:${user.id}:${connId}`);
    if (!conn) return c.json({ error: "Connection not found" }, 404);

    if (conn.access_token) {
      try {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${conn.access_token}`, { method: "POST" });
      } catch (revokeErr) {
        console.log("Gmail token revoke error (non-fatal):", revokeErr);
      }
    }

    await kv.del(`gmail_conn:${user.id}:${connId}`);
    return c.json({ ok: true });
  } catch (e) {
    console.log("Delete Gmail connection error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// GET /gmail/messages — list messages from inbox
app.get(`${PREFIX}/gmail/messages`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const connId = c.req.query("connectionId");
    if (!connId) return c.json({ error: "connectionId required" }, 400);

    const conn = await kv.get(`gmail_conn:${user.id}:${connId}`);
    if (!conn) return c.json({ error: "Connection not found" }, 404);

    const accessToken = await getValidGmailToken(conn);
    const query = c.req.query("q") || "";
    const pageToken = c.req.query("pageToken") || "";
    const maxResults = c.req.query("maxResults") || "20";
    const labelIds = c.req.query("labelIds") || "INBOX";

    const listParams = new URLSearchParams({ maxResults, labelIds });
    if (query) listParams.set("q", query);
    if (pageToken) listParams.set("pageToken", pageToken);

    const listRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${listParams}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!listRes.ok) {
      const errBody = await listRes.text();
      console.log("Gmail list messages error:", listRes.status, errBody);
      return c.json({ error: `Gmail API error (${listRes.status})` }, listRes.status as any);
    }
    const listData = await listRes.json();

    if (!listData.messages || listData.messages.length === 0) {
      return c.json({ messages: [], nextPageToken: null, resultSizeEstimate: 0 });
    }

    const messages = await Promise.all(
      listData.messages.map(async (msg: any) => {
        const metaRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!metaRes.ok) return null;
        const meta = await metaRes.json();

        const hdrs: Record<string, string> = {};
        (meta.payload?.headers || []).forEach((h: any) => {
          hdrs[h.name.toLowerCase()] = h.value;
        });

        return {
          id: meta.id,
          threadId: meta.threadId,
          snippet: meta.snippet || "",
          from: hdrs["from"] || "",
          to: hdrs["to"] || "",
          subject: hdrs["subject"] || "(No subject)",
          date: hdrs["date"] || "",
          labelIds: meta.labelIds || [],
          isUnread: (meta.labelIds || []).includes("UNREAD"),
          isStarred: (meta.labelIds || []).includes("STARRED"),
        };
      })
    );

    return c.json({
      messages: messages.filter(Boolean),
      nextPageToken: listData.nextPageToken || null,
      resultSizeEstimate: listData.resultSizeEstimate || 0,
    });
  } catch (e) {
    console.log("Gmail list messages error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// GET /gmail/messages/:id — get full message with body
app.get(`${PREFIX}/gmail/messages/:id`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const msgId = c.req.param("id");
    const connId = c.req.query("connectionId");
    if (!connId) return c.json({ error: "connectionId required" }, 400);

    const conn = await kv.get(`gmail_conn:${user.id}:${connId}`);
    if (!conn) return c.json({ error: "Connection not found" }, 404);

    const accessToken = await getValidGmailToken(conn);

    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) {
      const errBody = await res.text();
      console.log("Gmail get message error:", res.status, errBody);
      return c.json({ error: `Gmail API error (${res.status})` }, res.status as any);
    }
    const msg = await res.json();

    const hdrs: Record<string, string> = {};
    (msg.payload?.headers || []).forEach((h: any) => {
      hdrs[h.name.toLowerCase()] = h.value;
    });

    function findBody(part: any): { html: string; text: string } {
      if (!part) return { html: "", text: "" };
      if (part.mimeType === "text/html" && part.body?.data) {
        return { html: atob(part.body.data.replace(/-/g, "+").replace(/_/g, "/")), text: "" };
      }
      if (part.mimeType === "text/plain" && part.body?.data) {
        return { html: "", text: atob(part.body.data.replace(/-/g, "+").replace(/_/g, "/")) };
      }
      if (part.parts) {
        let html = "";
        let text = "";
        for (const sub of part.parts) {
          const result = findBody(sub);
          if (result.html) html = result.html;
          if (result.text && !text) text = result.text;
        }
        return { html, text };
      }
      return { html: "", text: "" };
    }

    const body = findBody(msg.payload);

    return c.json({
      id: msg.id,
      threadId: msg.threadId,
      snippet: msg.snippet || "",
      from: hdrs["from"] || "",
      to: hdrs["to"] || "",
      cc: hdrs["cc"] || "",
      subject: hdrs["subject"] || "(No subject)",
      date: hdrs["date"] || "",
      labelIds: msg.labelIds || [],
      isUnread: (msg.labelIds || []).includes("UNREAD"),
      isStarred: (msg.labelIds || []).includes("STARRED"),
      bodyHtml: body.html,
      bodyText: body.text,
    });
  } catch (e) {
    console.log("Gmail get message error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// POST /gmail/messages/:id/modify — mark read/unread, star/unstar
app.post(`${PREFIX}/gmail/messages/:id/modify`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const msgId = c.req.param("id");
    const { connectionId, addLabelIds, removeLabelIds } = await c.req.json();
    if (!connectionId) return c.json({ error: "connectionId required" }, 400);

    const conn = await kv.get(`gmail_conn:${user.id}:${connectionId}`);
    if (!conn) return c.json({ error: "Connection not found" }, 404);

    const accessToken = await getValidGmailToken(conn);

    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}/modify`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          addLabelIds: addLabelIds || [],
          removeLabelIds: removeLabelIds || [],
        }),
      }
    );

    if (!res.ok) {
      const errBody = await res.text();
      console.log("Gmail modify message error:", res.status, errBody);
      return c.json({ error: `Gmail API error (${res.status})` }, res.status as any);
    }
    return c.json({ ok: true });
  } catch (e) {
    console.log("Gmail modify message error:", e);
    return c.json({ error: errorString(e) }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════
//  PUBLIC MEETING BOOKING SYSTEM
// ═══════════════════════════════════════════════════════════════════

function shortCode(): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => chars[b % chars.length]).join("");
}

const CHRONO_APP_URL = "https://chrono.knowwhatson.com";

app.post(`${PREFIX}/booking-links`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const existing = await getAllByPrefix(`booking_link_user:${user.id}:`);
    if (existing.length > 0) return c.json(existing[0]);
    const code = shortCode();
    const profile = await kv.get(`user:${user.id}`);
    const link: any = { code, user_id: user.id, user_name: profile?.name || user.user_metadata?.name || user.email.split("@")[0], user_email: user.email, timezone: profile?.timezone || "Australia/Sydney", created_at: new Date().toISOString() };
    await kv.set(`booking_link:${code}`, link);
    await kv.set(`booking_link_user:${user.id}:${code}`, link);
    return c.json(link, 201);
  } catch (e) { console.log("Create booking link error:", e); return c.json({ error: errorString(e) }, 500); }
});

app.get(`${PREFIX}/booking-links`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try { return c.json(await getAllByPrefix(`booking_link_user:${user.id}:`)); } catch (e) { return c.json({ error: errorString(e) }, 500); }
});

app.delete(`${PREFIX}/booking-links/:code`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try { const code = c.req.param("code"); await kv.del(`booking_link:${code}`); await kv.del(`booking_link_user:${user.id}:${code}`); return c.json({ ok: true }); } catch (e) { return c.json({ error: errorString(e) }, 500); }
});

app.get(`${PREFIX}/booking-requests`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try { const reqs = await getAllByPrefix(`booking_req:${user.id}:`); return c.json(reqs.sort((a: any, b: any) => b.created_at?.localeCompare(a.created_at))); } catch (e) { return c.json({ error: errorString(e) }, 500); }
});

// Authenticated accept booking (called from frontend after login)
app.post(`${PREFIX}/booking-requests/:requestId/accept`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const reqId = c.req.param("requestId");
    const req = await kv.get(`booking_req:${user.id}:${reqId}`);
    if (!req) return c.json({ error: "Booking request not found" }, 404);
    if (req.status !== "pending") return c.json({ error: `This booking has already been ${req.status}.` }, 400);
    req.status = "accepted"; req.accepted_at = new Date().toISOString();
    await kv.set(`booking_req:${user.id}:${reqId}`, req);
    const event: any = { id: uuid(), user_id: user.id, title: `Meeting with ${req.visitor_name}`, description: `Booked via Chrono meeting link.\nVisitor: ${req.visitor_name} (${req.visitor_email})${req.note ? "\nNote: " + req.note : ""}`, location: null, start_at: req.slot_start, end_at: req.slot_end, is_all_day: false, status: "confirmed", provider: "manual", created_at: new Date().toISOString(), updated_at: new Date().toISOString(), booking_request_id: reqId };
    await kv.set(`event:${user.id}:${event.id}`, event);

    // If the visitor is also a Chrono user, add the event to their calendar too
    let visitorEventCreated = false;
    try {
      const allProfiles = await getAllByPrefix("user:");
      const hostProfile = await kv.get(`user:${user.id}`);
      const hostName = hostProfile?.name || user.email.split("@")[0];
      const visitorProfile = allProfiles.find((p: any) => p.email?.toLowerCase() === req.visitor_email?.toLowerCase());
      if (visitorProfile && visitorProfile.id && visitorProfile.id !== user.id) {
        const visitorEvent: any = {
          id: uuid(),
          user_id: visitorProfile.id,
          title: `Meeting with ${hostName}`,
          description: `Booked via Chrono meeting link.\nHost: ${hostName} (${user.email})${req.note ? "\nNote: " + req.note : ""}`,
          location: null,
          start_at: req.slot_start,
          end_at: req.slot_end,
          is_all_day: false,
          status: "confirmed",
          provider: "manual",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          booking_request_id: reqId,
          created_by_friend_id: user.id,
          created_by_friend_name: hostName,
        };
        await kv.set(`event:${visitorProfile.id}:${visitorEvent.id}`, visitorEvent);
        visitorEventCreated = true;
        console.log(`Booking accept: also created event on visitor calendar (${visitorProfile.id}) for ${req.visitor_email}`);
      }
    } catch (visitorErr) { console.log("Booking accept: visitor calendar creation error (non-fatal):", visitorErr); }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (resendApiKey) {
      let logoUrl = ""; try { const ch = await fetch(getLogoPublicUrl(), { method: "HEAD" }); if (ch.ok) logoUrl = getLogoPublicUrl() } catch {}
      const sd = new Date(req.slot_start); const ed = new Date(req.slot_end);
      const slotDate = sd.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
      const slotTime = sd.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
      const slotEndTime = ed.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
      const profile = await kv.get(`profile:${user.id}`);
      const hostName = profile?.name || "Your host";
      const emailHtml = buildBookingAcceptedEmailHtml(hostName, req.visitor_name, slotDate, slotTime, slotEndTime, req.duration_minutes, logoUrl);
      await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: "Chrono <noreply@knowwhatson.com>", to: [req.visitor_email], subject: `✅ ${hostName} accepted your meeting request!`, html: emailHtml, text: `${hostName} accepted your meeting for ${slotDate} at ${slotTime}.` }) });
    }
    return c.json({ ok: true, visitor_name: req.visitor_name, slot_start: req.slot_start, slot_end: req.slot_end, visitor_event_created: visitorEventCreated });
  } catch (e) { console.log("Accept booking error:", e); return c.json({ error: errorString(e) }, 500); }
});

// Authenticated decline booking (called from frontend after login)
app.post(`${PREFIX}/booking-requests/:requestId/decline`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const reqId = c.req.param("requestId");
    const body = await c.req.json().catch(() => ({}));
    const bookingCode = body.booking_code || "";
    const req = await kv.get(`booking_req:${user.id}:${reqId}`);
    if (!req) return c.json({ error: "Booking request not found" }, 404);
    if (req.status !== "pending") return c.json({ error: `This booking has already been ${req.status}.` }, 400);
    req.status = "rejected"; req.rejected_at = new Date().toISOString();
    await kv.set(`booking_req:${user.id}:${reqId}`, req);
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (resendApiKey && bookingCode) {
      let logoUrl = ""; try { const ch = await fetch(getLogoPublicUrl(), { method: "HEAD" }); if (ch.ok) logoUrl = getLogoPublicUrl() } catch {}
      const profile = await kv.get(`profile:${user.id}`);
      const hostName = profile?.name || "Your host";
      const bookingUrl = `${CHRONO_APP_URL}/book/${bookingCode}`;
      const emailHtml = buildBookingRejectedEmailHtml(hostName, req.visitor_name, bookingUrl, logoUrl);
      await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: "Chrono <noreply@knowwhatson.com>", to: [req.visitor_email], subject: `${hostName} couldn't make that time — try another slot`, html: emailHtml, text: `${hostName} couldn't accommodate your time. Book a different slot: ${bookingUrl}` }) });
    }
    return c.json({ ok: true, visitor_name: req.visitor_name });
  } catch (e) { console.log("Decline booking error:", e); return c.json({ error: errorString(e) }, 500); }
});

app.get(`${PREFIX}/book/:code`, async (c) => {
  try {
    const link = await kv.get(`booking_link:${c.req.param("code")}`);
    if (!link) return c.json({ error: "Booking link not found" }, 404);
    return c.json({ user_name: link.user_name, timezone: link.timezone });
  } catch (e) { return c.json({ error: errorString(e) }, 500); }
});

app.post(`${PREFIX}/book/:code/slots`, async (c) => {
  try {
    const code = c.req.param("code");
    const link = await kv.get(`booking_link:${code}`);
    if (!link) return c.json({ error: "Booking link not found" }, 404);
    const body = await c.req.json();
    const { date, duration_minutes } = body;
    if (!date || !duration_minutes) return c.json({ error: "date and duration_minutes required" }, 400);
    const userId = link.user_id;
    const tz = link.timezone || "Australia/Sydney";

    // Timezone-aware: convert local time strings in host tz to UTC ms
    const tzOffsetMs = (() => {
      const ref = new Date(`${date}T12:00:00Z`);
      const utcStr = ref.toLocaleString("en-US", { timeZone: "UTC" });
      const tzStr = ref.toLocaleString("en-US", { timeZone: tz });
      return new Date(tzStr).getTime() - new Date(utcStr).getTime();
    })();
    const localToUTC = (timeStr: string) => new Date(`${date}T${timeStr}:00Z`).getTime() - tzOffsetMs;

    const dayStart = localToUTC("00:00");
    const dayEnd = localToUTC("23:59") + 59000;

    // Day-of-week in the host timezone
    const dayInTz = new Date(dayStart + tzOffsetMs);
    const dayNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const dow = dayNames[dayInTz.getDay()];

    const rules = await kv.get(`rules:${userId}`);
    const rawEvents = await getAllByPrefix(`event:${userId}:`);
    const bufferBefore = (rules?.buffer_before_minutes || 0) * 60000;
    const bufferAfter = (rules?.buffer_after_minutes || 0) * 60000;
    const events: any[] = [];
    for (const ev of rawEvents) { if (ev.recurrence_rule) { events.push(...expandRecurring(ev, dayStart, dayEnd)); } else { events.push(ev); } }
    const unavailable: { start: number; end: number }[] = [];
    const NEARLY_ALL_DAY_MS = 23 * 60 * 60 * 1000;
    for (const ev of events) { if (ev.is_all_day) continue; const s = new Date(ev.start_at).getTime(); const e = new Date(ev.end_at).getTime(); if ((e - s) >= NEARLY_ALL_DAY_MS) continue; if (e + bufferAfter > dayStart && s - bufferBefore < dayEnd) unavailable.push({ start: s - bufferBefore, end: e + bufferAfter }); }

    // Work hours — only allow slots within configured work hours
    const wh = rules?.work_hours?.[dow];
    if (wh?.start && wh?.end) {
      const ws = localToUTC(wh.start);
      const we = localToUTC(wh.end);
      if (ws > dayStart) unavailable.push({ start: dayStart, end: ws });
      if (we < dayEnd) unavailable.push({ start: we, end: dayEnd });
    } else {
      // No work hours configured for this day — block entire day
      unavailable.push({ start: dayStart, end: dayEnd });
    }

    for (const bt of ["no_booking_hours","focus_blocks","meal_hours"] as const) {
      const blocks = rules?.[bt];
      if (Array.isArray(blocks)) for (const b of blocks) {
        if (b.dow === dow || b.dow === "all") {
          unavailable.push({ start: localToUTC(b.start || "00:00"), end: localToUTC(b.end || "00:00") });
        }
      }
    }

    const pendingReqs = await getAllByPrefix(`booking_req:${userId}:`);
    for (const r of pendingReqs) { if(r.status==="pending"||r.status==="accepted") { const rs=new Date(r.slot_start).getTime(); const re=new Date(r.slot_end).getTime(); if(re>dayStart&&rs<dayEnd) unavailable.push({start:rs,end:re}); } }
    unavailable.sort((a,b)=>a.start-b.start);
    const merged:{start:number;end:number}[]=[]; for(const u of unavailable){if(merged.length>0&&u.start<=merged[merged.length-1].end){merged[merged.length-1].end=Math.max(merged[merged.length-1].end,u.end)}else{merged.push({...u})}}
    const dMs=duration_minutes*60000; const freeSlots:{start_at:string;end_at:string}[]=[]; let cursor=Math.max(dayStart,Date.now()+60000);
    const addSlots=(from:number,to:number)=>{let s=from;while(s+dMs<=to){const m=new Date(s).getUTCMinutes();const r=m%15===0?0:15-(m%15);s+=r*60000;if(s+dMs<=to){freeSlots.push({start_at:new Date(s).toISOString(),end_at:new Date(s+dMs).toISOString()})}s+=15*60000}};
    for(const block of merged){if(cursor<block.start)addSlots(cursor,block.start);cursor=Math.max(cursor,block.end)} if(cursor<dayEnd)addSlots(cursor,dayEnd);
    return c.json({ slots: freeSlots.slice(0, 24), timezone: tz });
  } catch (e) { console.log("Booking slots error:", e); return c.json({ error: errorString(e) }, 500); }
});

app.post(`${PREFIX}/book/:code/request`, async (c) => {
  try {
    const code = c.req.param("code");
    const link = await kv.get(`booking_link:${code}`);
    if (!link) return c.json({ error: "Booking link not found" }, 404);
    const body = await c.req.json();
    const { visitor_name, visitor_email, slot_start, slot_end, duration_minutes, note } = body;
    if (!visitor_name || !visitor_email || !slot_start || !slot_end) return c.json({ error: "visitor_name, visitor_email, slot_start, slot_end required" }, 400);
    const reqId = uuid(); const userId = link.user_id;
    const req: any = { id: reqId, user_id: userId, booking_code: code, visitor_name: visitor_name.trim(), visitor_email: visitor_email.trim().toLowerCase(), slot_start, slot_end, duration_minutes: duration_minutes || 30, note: note || null, status: "pending", created_at: new Date().toISOString() };
    await kv.set(`booking_req:${userId}:${reqId}`, req);
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (resendApiKey) {
      let logoUrl=""; try{const ch=await fetch(getLogoPublicUrl(),{method:"HEAD"});if(ch.ok)logoUrl=getLogoPublicUrl()}catch{}
      const sd=new Date(slot_start); const ed=new Date(slot_end);
      const slotDate=sd.toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"});
      const slotTime=sd.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:true});
      const slotEndTime=ed.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:true});
      const acceptUrl=`${CHRONO_APP_URL}/booking-action/accept/${code}/${reqId}`; const rejectUrl=`${CHRONO_APP_URL}/booking-action/decline/${code}/${reqId}`;
      const emailHtml=buildBookingRequestEmailHtml(link.user_name,visitor_name.trim(),visitor_email.trim(),slotDate,slotTime,slotEndTime,duration_minutes||30,note||"",acceptUrl,rejectUrl,logoUrl);
      await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${resendApiKey}`,"Content-Type":"application/json"},body:JSON.stringify({from:"Chrono <noreply@knowwhatson.com>",to:[link.user_email],subject:`���� Meeting request from ${visitor_name.trim()}`,html:emailHtml,text:`${visitor_name.trim()} wants to book a ${duration_minutes||30}-minute meeting on ${slotDate} at ${slotTime}.`})});
    }
    await createNotification(userId,"booking_request",`${visitor_name.trim()} requested a ${duration_minutes||30}-min meeting on ${new Date(slot_start).toLocaleDateString("en-US",{month:"short",day:"numeric"})}`,{requestId:reqId,bookingCode:code});
    return c.json({ ok: true, request_id: reqId });
  } catch (e) { console.log("Booking request error:", e); return c.json({ error: errorString(e) }, 500); }
});

// Old unauthenticated GET accept/reject handlers removed — now handled by
// authenticated POST /booking-requests/:requestId/accept and /decline above,
// with email links routing through the frontend BookingActionPage.

function buildBookingRequestEmailHtml(hostName:string,visitorName:string,visitorEmail:string,slotDate:string,slotTime:string,slotEndTime:string,durationMins:number,note:string,acceptUrl:string,rejectUrl:string,logoUrl:string):string{
  const hasBanner=!!logoUrl;const firstName=hostName.split(" ")[0];
  const noteBlock=note?`<tr><td class="c-body" bgcolor="#fffdf9" style="background-color:#fffdf9;padding:0 32px"><div style="margin:16px 0;padding:14px 18px;background-color:#f5f0e8;border-left:3px solid #c4a87a;border-radius:0 8px 8px 0"><font color="#000" style="font-style:italic;font-size:14px;line-height:1.6;color:#000">&ldquo;${escHtml(note)}&rdquo;</font><br/><font color="#666" style="font-size:12px;color:#666">&mdash; ${escHtml(visitorName)}</font></div></td></tr>`:"";
  const hdr=hasBanner?`<tr><td align="center" style="padding:0;line-height:0"><img src="${logoUrl}" alt="Chrono" width="520" style="display:block;width:100%;max-width:520px;height:auto;border:0"/></td></tr>`:`<tr><td align="center" bgcolor="#c8a8e8" style="background:linear-gradient(135deg,#f8c0d8 0%,#d8b4fe 25%,#93c5fd 55%,#99f6e4 100%);padding:32px 32px 20px;text-align:center"><div style="display:inline-block;width:72px;height:72px;border-radius:50%;background:#d4c1f0;text-align:center;line-height:72px;font-size:32px;font-weight:700;margin-bottom:14px"><font color="#fff">C</font></div><h1 style="margin:0;font-size:20px;font-weight:700"><font color="#1e1b4b">Chrono</font></h1><p style="margin:4px 0 0;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;font-weight:500"><font color="#4a3a6a">Calm, Unified &amp; Personalised</font></p></td></tr>`;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><meta name="color-scheme" content="light only"/><style>:root{color-scheme:light only!important}@media(prefers-color-scheme:dark){.c-outer{background-color:#141218!important}.c-card,.c-body{background-color:#1e1b2e!important}.c-ftr{background-color:#16141f!important}}</style></head><body style="margin:0;padding:0;background:#f5f0e8;font-family:-apple-system,sans-serif" bgcolor="#f5f0e8"><table class="c-outer" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f0e8"><tr><td align="center" style="padding:40px 16px"><table class="c-card" role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" bgcolor="#fffdf9" style="max-width:520px;width:100%;background:#fffdf9;border-radius:16px;overflow:hidden">${hdr}<tr><td class="c-body" bgcolor="#fffdf9" style="background:#fffdf9;text-align:center;padding:22px 32px 6px"><p style="margin:0;font-size:18px"><strong>📅 New Meeting Request</strong></p><p style="margin:8px 0 0;font-size:14px;line-height:1.6">Hey ${escHtml(firstName)}, <strong>${escHtml(visitorName)}</strong> wants to book a meeting with you.</p></td></tr><tr><td class="c-body" bgcolor="#fffdf9" style="background:#fffdf9;padding:16px 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8f4ed;border-radius:12px"><tr><td style="padding:16px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:4px 0"><font color="#94a3b8" style="font-size:13px">Date</font></td><td align="right" style="padding:4px 0"><strong style="font-size:14px">${escHtml(slotDate)}</strong></td></tr><tr><td style="padding:4px 0"><font color="#94a3b8" style="font-size:13px">Time</font></td><td align="right" style="padding:4px 0"><strong style="font-size:14px">${escHtml(slotTime)} – ${escHtml(slotEndTime)}</strong></td></tr><tr><td style="padding:4px 0"><font color="#94a3b8" style="font-size:13px">Duration</font></td><td align="right" style="padding:4px 0"><strong style="font-size:14px">${durationMins} min</strong></td></tr><tr><td style="padding:4px 0"><font color="#94a3b8" style="font-size:13px">Email</font></td><td align="right" style="padding:4px 0"><font color="#6366f1" style="font-size:13px">${escHtml(visitorEmail)}</font></td></tr></table></td></tr></table></td></tr>${noteBlock}<tr><td class="c-body" bgcolor="#fffdf9" style="background:#fffdf9;text-align:center;padding:20px 32px 8px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td align="center" bgcolor="#059669" style="background:#059669;border-radius:12px;padding:14px 36px"><a href="${escHtml(acceptUrl)}" style="font-size:16px;font-weight:700;text-decoration:none;color:#fff">✓ Accept Meeting</a></td></tr></table></td></tr><tr><td class="c-body" bgcolor="#fffdf9" style="background:#fffdf9;text-align:center;padding:10px 32px 24px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td align="center" bgcolor="#64748b" style="background:#64748b;border-radius:12px;padding:12px 36px"><a href="${escHtml(rejectUrl)}" style="font-size:14px;font-weight:600;text-decoration:none;color:#fff">✗ Decline</a></td></tr></table></td></tr><tr><td class="c-ftr" bgcolor="#f8f4ed" style="background:#f8f4ed;border-top:1px solid #ebe5d8;text-align:center;padding:18px 32px"><p style="margin:0;font-size:11px"><font color="#9a9080">Meeting request via your Chrono booking link</font></p><p style="margin:8px 0 0;font-size:10px"><font color="#b0a898">Created with ♥ by </font><a href="https://knowwhatson.com" style="text-decoration:underline"><font color="#8a7a6a">What's On!</font></a></p></td></tr></table></td></tr></table></body></html>`;
}

function buildBookingAcceptedEmailHtml(hostName:string,visitorName:string,slotDate:string,slotTime:string,slotEndTime:string,durationMins:number,logoUrl:string):string{
  const hasBanner=!!logoUrl;const firstName=visitorName.split(" ")[0];
  const hdr=hasBanner?`<tr><td align="center" style="padding:0;line-height:0"><img src="${logoUrl}" alt="Chrono" width="520" style="display:block;width:100%;max-width:520px;height:auto;border:0"/></td></tr>`:`<tr><td align="center" bgcolor="#c8a8e8" style="background:linear-gradient(135deg,#f8c0d8 0%,#d8b4fe 25%,#93c5fd 55%,#99f6e4 100%);padding:32px 32px 20px;text-align:center"><div style="display:inline-block;width:72px;height:72px;border-radius:50%;background:#d4c1f0;text-align:center;line-height:72px;font-size:32px;font-weight:700;margin-bottom:14px"><font color="#fff">C</font></div><h1 style="margin:0;font-size:20px;font-weight:700"><font color="#1e1b4b">Chrono</font></h1><p style="margin:4px 0 0;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;font-weight:500"><font color="#4a3a6a">Calm, Unified &amp; Personalised</font></p></td></tr>`;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><meta name="color-scheme" content="light only"/><style>:root{color-scheme:light only!important}@media(prefers-color-scheme:dark){.c-outer{background-color:#141218!important}.c-card,.c-body{background-color:#1e1b2e!important}.c-ftr{background-color:#16141f!important}}</style></head><body style="margin:0;padding:0;background:#f5f0e8;font-family:-apple-system,sans-serif" bgcolor="#f5f0e8"><table class="c-outer" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f0e8"><tr><td align="center" style="padding:40px 16px"><table class="c-card" role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" bgcolor="#fffdf9" style="max-width:520px;width:100%;background:#fffdf9;border-radius:16px;overflow:hidden">${hdr}<tr><td class="c-body" bgcolor="#fffdf9" style="background:#fffdf9;text-align:center;padding:22px 32px 6px"><p style="margin:0;font-size:36px">✅</p><p style="margin:12px 0 0;font-size:18px"><strong>Meeting Confirmed!</strong></p><p style="margin:8px 0 0;font-size:14px;line-height:1.6">Great news ${escHtml(firstName)}! <strong>${escHtml(hostName)}</strong> has accepted your meeting request and will get back to you with further details.</p></td></tr><tr><td class="c-body" bgcolor="#fffdf9" style="background:#fffdf9;padding:16px 32px 24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8f4ed;border-radius:12px"><tr><td style="padding:16px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:4px 0"><font color="#94a3b8" style="font-size:13px">With</font></td><td align="right" style="padding:4px 0"><strong style="font-size:14px">${escHtml(hostName)}</strong></td></tr><tr><td style="padding:4px 0"><font color="#94a3b8" style="font-size:13px">Date</font></td><td align="right" style="padding:4px 0"><strong style="font-size:14px">${escHtml(slotDate)}</strong></td></tr><tr><td style="padding:4px 0"><font color="#94a3b8" style="font-size:13px">Time</font></td><td align="right" style="padding:4px 0"><strong style="font-size:14px">${escHtml(slotTime)} – ${escHtml(slotEndTime)}</strong></td></tr><tr><td style="padding:4px 0"><font color="#94a3b8" style="font-size:13px">Duration</font></td><td align="right" style="padding:4px 0"><strong style="font-size:14px">${durationMins} min</strong></td></tr></table></td></tr></table></td></tr><tr><td class="c-body" bgcolor="#fffdf9" style="background:#fffdf9;text-align:center;padding:0 32px 24px"><p style="margin:0;font-size:14px">Best,</p><p style="margin:4px 0 0;font-size:14px;font-weight:700">${escHtml(hostName)}</p><p style="margin:2px 0 0;font-size:12px"><font color="#7a7a7a">and The Chrono Team, in spirit!</font></p></td></tr><tr><td class="c-ftr" bgcolor="#f8f4ed" style="background:#f8f4ed;border-top:1px solid #ebe5d8;text-align:center;padding:18px 32px"><p style="margin:0;font-size:11px"><font color="#9a9080">Meeting booked via Chrono</font></p><p style="margin:8px 0 0;font-size:10px"><font color="#b0a898">Created with ♥ by </font><a href="https://knowwhatson.com" style="text-decoration:underline"><font color="#8a7a6a">What's On!</font></a></p></td></tr></table></td></tr></table></body></html>`;
}

function buildBookingRejectedEmailHtml(hostName:string,visitorName:string,bookingUrl:string,logoUrl:string):string{
  const hasBanner=!!logoUrl;const firstName=visitorName.split(" ")[0];
  const hdr=hasBanner?`<tr><td align="center" style="padding:0;line-height:0"><img src="${logoUrl}" alt="Chrono" width="520" style="display:block;width:100%;max-width:520px;height:auto;border:0"/></td></tr>`:`<tr><td align="center" bgcolor="#c8a8e8" style="background:linear-gradient(135deg,#f8c0d8 0%,#d8b4fe 25%,#93c5fd 55%,#99f6e4 100%);padding:32px 32px 20px;text-align:center"><div style="display:inline-block;width:72px;height:72px;border-radius:50%;background:#d4c1f0;text-align:center;line-height:72px;font-size:32px;font-weight:700;margin-bottom:14px"><font color="#fff">C</font></div><h1 style="margin:0;font-size:20px;font-weight:700"><font color="#1e1b4b">Chrono</font></h1><p style="margin:4px 0 0;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;font-weight:500"><font color="#4a3a6a">Calm, Unified &amp; Personalised</font></p></td></tr>`;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><meta name="color-scheme" content="light only"/><style>:root{color-scheme:light only!important}@media(prefers-color-scheme:dark){.c-outer{background-color:#141218!important}.c-card,.c-body{background-color:#1e1b2e!important}.c-ftr{background-color:#16141f!important}}</style></head><body style="margin:0;padding:0;background:#f5f0e8;font-family:-apple-system,sans-serif" bgcolor="#f5f0e8"><table class="c-outer" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f0e8"><tr><td align="center" style="padding:40px 16px"><table class="c-card" role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" bgcolor="#fffdf9" style="max-width:520px;width:100%;background:#fffdf9;border-radius:16px;overflow:hidden">${hdr}<tr><td class="c-body" bgcolor="#fffdf9" style="background:#fffdf9;text-align:center;padding:22px 32px 6px"><p style="margin:0;font-size:18px"><strong>Time Didn't Work Out</strong></p><p style="margin:12px 0 0;font-size:14px;line-height:1.65">Hey ${escHtml(firstName)}, unfortunately <strong>${escHtml(hostName)}</strong> wasn't able to accommodate your requested time. But don't worry — you can pick a different slot!</p></td></tr><tr><td class="c-body" bgcolor="#fffdf9" style="background:#fffdf9;text-align:center;padding:22px 32px 24px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td align="center" bgcolor="#7c3aed" style="background:#7c3aed;border-radius:12px;padding:14px 40px"><a href="${escHtml(bookingUrl)}" style="font-size:16px;font-weight:700;text-decoration:none;color:#fff">Pick Another Time</a></td></tr></table></td></tr><tr><td class="c-body" bgcolor="#fffdf9" style="background:#fffdf9;text-align:center;padding:0 32px 24px"><p style="margin:0;font-size:14px">Best,</p><p style="margin:4px 0 0;font-size:14px;font-weight:700">${escHtml(hostName)}</p><p style="margin:2px 0 0;font-size:12px"><font color="#7a7a7a">and The Chrono Team, in spirit!</font></p></td></tr><tr><td class="c-ftr" bgcolor="#f8f4ed" style="background:#f8f4ed;border-top:1px solid #ebe5d8;text-align:center;padding:18px 32px"><p style="margin:0;font-size:11px"><font color="#9a9080">Meeting booking via Chrono</font></p><p style="margin:8px 0 0;font-size:10px"><font color="#b0a898">Created with ♥ by </font><a href="https://knowwhatson.com" style="text-decoration:underline"><font color="#8a7a6a">What's On!</font></a></p></td></tr></table></td></tr></table></body></html>`;
}

function buildOpenEventEmailHtml(title: string, htmlContent: string, eventName: string, logoUrl: string): string {
  const hasBanner = !!logoUrl;
  return `<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" lang="en"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<meta name="color-scheme" content="light only"/>
<meta name="supported-color-schemes" content="light only"/>
<style>
  :root { color-scheme: light only !important; }
  body, table, td, div, p, span, a, h1 { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  [data-ogsb] .c-outer { background-color: #141218 !important; }
  [data-ogsb] .c-card { background-color: #1e1b2e !important; }
  [data-ogsb] .c-body { background-color: #1e1b2e !important; }
  [data-ogsb] .c-hdr { background-color: #3a2860 !important; }
  [data-ogsb] .c-ftr { background-color: #16141f !important; }
  [data-ogsc] .c-title { color: #ffffff !important; }
  [data-ogsc] .c-tagline { color: #c4b5fd !important; }
  [data-ogsc] .c-body-text { color: #d4cfc6 !important; }
  [data-ogsc] .c-strong { color: #ffffff !important; }
  [data-ogsc] .c-subtle { color: #908880 !important; }
  [data-ogsc] .c-ftr-text { color: #706860 !important; }
  @media (prefers-color-scheme: dark) {
    .c-outer { background-color: #141218 !important; }
    .c-card { background-color: #1e1b2e !important; }
    .c-body { background-color: #1e1b2e !important; }
    .c-ftr { background-color: #16141f !important; }
    .c-title { color: #ffffff !important; }
    .c-body-text { color: #d4cfc6 !important; }
    .c-strong { color: #ffffff !important; }
    .c-tagline { color: #c4b5fd !important; }
    .c-subtle { color: #908880 !important; }
    .c-ftr-text { color: #706860 !important; }
  }
</style>
<!--[if mso]><style>table,td{border-collapse:collapse!important}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f5f0e8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif" bgcolor="#f5f0e8">
<table class="c-outer" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f0e8" style="background-color:#f5f0e8">
<tr><td align="center" style="padding:40px 16px">
<table class="c-card" role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" bgcolor="#fffdf9" style="max-width:520px;width:100%;background-color:#fffdf9;border-radius:16px;overflow:hidden">
${hasBanner
  ? `<tr><td align="center" style="padding:0;line-height:0;font-size:0"><img src="${logoUrl}" alt="Chrono" width="520" style="display:block;width:100%;max-width:520px;height:auto;border:0" /></td></tr>`
  : `<tr><td class="c-hdr" align="center" bgcolor="#c8a8e8" style="background:linear-gradient(135deg,#f8c0d8 0%,#d8b4fe 25%,#93c5fd 55%,#99f6e4 100%);background-color:#c8a8e8;padding:32px 32px 20px;text-align:center">
  <div style="display:inline-block;width:72px;height:72px;border-radius:50%;background-color:#d4c1f0;text-align:center;line-height:72px;font-size:32px;font-weight:700;margin-bottom:14px"><font color="#ffffff" style="color:#ffffff">C</font></div>
  <h1 style="margin:0;font-size:20px;font-weight:700;letter-spacing:-0.3px"><font class="c-title" color="#1e1b4b" style="color:#1e1b4b">Chrono</font></h1>
  <p style="margin:4px 0 0;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;font-weight:500"><font class="c-tagline" color="#4a3a6a" style="color:#4a3a6a">Calm, Unified &amp; Personalised</font></p>
</td></tr>`}
<tr><td class="c-body" bgcolor="#fffdf9" style="background-color:#fffdf9;text-align:center;padding:22px 32px 6px">
  <p style="margin:0;font-size:18px"><strong><font class="c-strong" color="#000000" style="color:#000000">${title}</font></strong></p>
</td></tr>
<tr><td class="c-body" bgcolor="#fffdf9" style="background-color:#fffdf9;padding:16px 32px 24px;text-align:left;font-size:15px;line-height:1.6">
  ${htmlContent}
</td></tr>
<tr><td class="c-body" bgcolor="#fffdf9" style="background-color:#fffdf9;text-align:center;padding:20px 32px 24px">
  <p style="margin:0;font-size:14px;line-height:1.6"><font class="c-body-text" color="#000000" style="color:#000000">Best,</font></p>
  <p style="margin:4px 0 0;font-size:14px;font-weight:700;line-height:1.5"><font class="c-strong" color="#000000" style="color:#000000">${escHtml(eventName)} Team</font></p>
  <p style="margin:2px 0 0;font-size:12px;line-height:1.5"><font class="c-subtle" color="#7a7a7a" style="color:#7a7a7a">and The Chrono Team, in spirit!</font></p>
</td></tr>
<tr><td class="c-ftr" bgcolor="#f8f4ed" style="background-color:#f8f4ed;border-top:1px solid #ebe5d8;text-align:center;padding:18px 32px">
  <p style="margin:0;font-size:11px;line-height:1.6"><font class="c-ftr-text" color="#9a9080" style="color:#9a9080">Sent via Chrono Event Mode</font></p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

function getEventDateStr(utcIso: string, timezone: string): string {
  try {
    return new Date(utcIso).toLocaleString('en-US', { 
      weekday: 'long', month: 'long', day: 'numeric', 
      hour: 'numeric', minute: '2-digit', timeZone: timezone, timeZoneName: 'short' 
    });
  } catch (e) {
    return new Date(utcIso).toLocaleString('en-US', { 
      weekday: 'long', month: 'long', day: 'numeric', 
      hour: 'numeric', minute: '2-digit', timeZoneName: 'short' 
    });
  }
}


// === OPEN SCHEDULING ROUTES ===

app.get(`${PREFIX}/open-events`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const events = await getAllByPrefix(`open_event_user:${user.id}:`);
    return c.json(events);
  } catch (e) { return c.json({ error: errorString(e) }, 500); }
});

app.post(`${PREFIX}/open-events`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const { title, description } = await c.req.json();
    const id = crypto.randomUUID();
    const code = shortCode();
    const event = { id, code, user_id: user.id, title, description, created_at: new Date().toISOString() };
    await kv.set(`open_event:${id}`, event);
    await kv.set(`open_event_user:${user.id}:${id}`, event);
    await kv.set(`open_event_code:${code}`, event);
    return c.json(event, 201);
  } catch (e) { return c.json({ error: errorString(e) }, 500); }
});

app.post(`${PREFIX}/open-events/:id/update`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const id = c.req.param("id");
    const { title, description } = await c.req.json();
    const event = await kv.get(`open_event:${id}`);
    if (!event || event.user_id !== user.id) return c.json({ error: "Not found" }, 404);
    
    event.title = title;
    event.description = description;
    await kv.set(`open_event:${id}`, event);
    await kv.set(`open_event_user:${user.id}:${id}`, event);
    return c.json(event);
  } catch (e) { return c.json({ error: errorString(e) }, 500); }
});

app.post(`${PREFIX}/open-events/:id/delete`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const id = c.req.param("id");
    const event = await kv.get(`open_event:${id}`);
    if (!event || event.user_id !== user.id) return c.json({ error: "Not found" }, 404);
    
    await kv.mdel([`open_event:${id}`, `open_event_user:${user.id}:${id}`]);
    return c.json({ ok: true });
  } catch (e) { return c.json({ error: errorString(e) }, 500); }
});

app.get(`${PREFIX}/open-events/:id`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const id = c.req.param("id");
    const event = await kv.get(`open_event:${id}`);
    if (!event || event.user_id !== user.id) return c.json({ error: "Not found" }, 404);
    
    if (!event.code) {
      event.code = shortCode();
      await kv.set(`open_event:${id}`, event);
      await kv.set(`open_event_user:${user.id}:${id}`, event);
      await kv.set(`open_event_code:${event.code}`, event);
    }
    
    const sessions = await getAllByPrefix(`open_session_event:${id}:`);
    const enhancedSessions = await Promise.all(sessions.map(async (s:any) => {
      const slots = await getAllByPrefix(`open_slot_session:${s.id}:`);
      const allBookings = await getAllByPrefix(`open_booking:${s.id}:`);
      return { ...s, slots, bookings: allBookings };
    }));
    
    return c.json({ ...event, sessions: enhancedSessions });
  } catch (e) { return c.json({ error: errorString(e) }, 500); }
});

app.post(`${PREFIX}/open-events/:id/sessions`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const eventId = c.req.param("id");
    const event = await kv.get(`open_event:${eventId}`);
    if (!event || event.user_id !== user.id) return c.json({ error: "Not found" }, 404);
    
    const { title, description, duration, host, organization, location } = await c.req.json();
    const id = crypto.randomUUID();
    const code = shortCode();
    const session = { id, event_id: eventId, title, description, duration, host, organization, location, code, created_at: new Date().toISOString() };
    
    await kv.set(`open_session:${id}`, session);
    await kv.set(`open_session_code:${code}`, session);
    await kv.set(`open_session_event:${eventId}:${id}`, session);
    
    return c.json(session, 201);
  } catch (e) { return c.json({ error: errorString(e) }, 500); }
});

app.post(`${PREFIX}/open-sessions/:id/update`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const id = c.req.param("id");
    const { title, description, duration, host, organization, location } = await c.req.json();
    const session = await kv.get(`open_session:${id}`);
    if (!session) return c.json({ error: "Not found" }, 404);
    
    const event = await kv.get(`open_event:${session.event_id}`);
    if (!event || event.user_id !== user.id) return c.json({ error: "Unauthorized" }, 401);
    
    session.title = title;
    session.description = description;
    session.duration = duration;
    if (host !== undefined) session.host = host;
    if (organization !== undefined) session.organization = organization;
    if (location !== undefined) session.location = location;
    
    await kv.set(`open_session:${id}`, session);
    await kv.set(`open_session_code:${session.code}`, session);
    await kv.set(`open_session_event:${session.event_id}:${id}`, session);
    
    return c.json(session);
  } catch (e) { return c.json({ error: errorString(e) }, 500); }
});

app.post(`${PREFIX}/open-sessions/:id/delete`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const id = c.req.param("id");
    const session = await kv.get(`open_session:${id}`);
    if (!session) return c.json({ error: "Not found" }, 404);
    
    const event = await kv.get(`open_event:${session.event_id}`);
    if (!event || event.user_id !== user.id) return c.json({ error: "Unauthorized" }, 401);
    
    await kv.mdel([
      `open_session:${id}`, 
      `open_session_code:${session.code}`, 
      `open_session_event:${session.event_id}:${id}`
    ]);
    
    return c.json({ ok: true });
  } catch (e) { return c.json({ error: errorString(e) }, 500); }
});

app.post(`${PREFIX}/open-sessions/:sessionId/slots`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const sessionId = c.req.param("sessionId");
    const session = await kv.get(`open_session:${sessionId}`);
    if (!session) return c.json({ error: "Not found" }, 404);
    
    const event = await kv.get(`open_event:${session.event_id}`);
    if (!event || event.user_id !== user.id) return c.json({ error: "Unauthorized" }, 401);
    
    const { slots } = await c.req.json();
    const createdSlots = [];
    for (const slot of slots) {
      const slotId = crypto.randomUUID();
      const newSlot = { id: slotId, session_id: sessionId, start_time: slot.start_time, end_time: slot.end_time, capacity: slot.capacity || 1 };
      await kv.set(`open_slot:${slotId}`, newSlot);
      await kv.set(`open_slot_session:${sessionId}:${slotId}`, newSlot);
      createdSlots.push(newSlot);
    }
    
    return c.json(createdSlots, 201);
  } catch (e) { return c.json({ error: errorString(e) }, 500); }
});

app.post(`${PREFIX}/open-sessions/:sessionId/slots/:slotId/delete`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const { sessionId, slotId } = c.req.param();
    const session = await kv.get(`open_session:${sessionId}`);
    if (!session) return c.json({ error: "Not found" }, 404);
    
    const event = await kv.get(`open_event:${session.event_id}`);
    if (!event || event.user_id !== user.id) return c.json({ error: "Unauthorized" }, 401);
    
    await kv.mdel([`open_slot:${slotId}`, `open_slot_session:${sessionId}:${slotId}`]);
    return c.json({ ok: true });
  } catch (e) { return c.json({ error: errorString(e) }, 500); }
});

app.post(`${PREFIX}/open-events/:id/toggle-waitlist-full`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const id = c.req.param("id");
    const event = await kv.get(`open_event:${id}`);
    if (!event || event.user_id !== user.id) return c.json({ error: "Not found" }, 404);
    
    event.waitlist_full = !event.waitlist_full;
    await kv.set(`open_event:${id}`, event);
    await kv.set(`open_event_user:${user.id}:${id}`, event);
    if (event.code) await kv.set(`open_event_code:${event.code}`, event);
    
    const sessions = await kv.getByPrefix(`open_session_event:${id}:`);
    for (const s of sessions) {
      s.waitlist_full = event.waitlist_full;
      await kv.set(`open_session:${s.id}`, s);
      await kv.set(`open_session_event:${s.event_id}:${s.id}`, s);
      if (s.code) await kv.set(`open_session_code:${s.code}`, s);
      
      const slots = await kv.getByPrefix(`open_slot_session:${s.id}:`);
      for (const sl of slots) {
        sl.waitlist_full = event.waitlist_full;
        await kv.set(`open_slot:${sl.id}`, sl);
        await kv.set(`open_slot_session:${sl.session_id}:${sl.id}`, sl);
      }
    }
    
    return c.json(event);
  } catch (e) { return c.json({ error: errorString(e) }, 500); }
});

app.post(`${PREFIX}/open-events/:id/blast`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  try {
    const id = c.req.param("id");
    const event = await kv.get(`open_event:${id}`);
    if (!event || event.user_id !== user.id) return c.json({ error: "Not found" }, 404);
    
    const { subject, message, targetTypes = ["confirmed", "waitlist"] } = await c.req.json();
    if (!subject || !message) return c.json({ error: "Subject and message required" }, 400);

    const sessions = await getAllByPrefix(`open_session_event:${id}:`);
    
    const allEmails = new Set<string>();
    
    for (const session of sessions) {
      const bookings = await getAllByPrefix(`open_booking:${session.id}:`);
      for (const booking of bookings) {
        if (booking.email && targetTypes.includes(booking.status)) {
          allEmails.add(booking.email);
        }
      }
    }
    
    const recipients = Array.from(allEmails);
    
    if (recipients.length === 0) {
      return c.json({ success: true, sentCount: 0 });
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (resendKey) {
      const profile = await kv.get(`user:${user.id}`);
      const senderName = profile?.name || user.user_metadata?.name || user.email.split("@")[0];
      const logoUrl = getLogoPublicUrl();
      
      const content = `
        <div style="text-align: center; margin-bottom: 24px;">
          <span style="display: inline-block; background-color: #e0e7ff; color: #4338ca; padding: 6px 12px; border-radius: 9999px; font-size: 14px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase;">Event Update</span>
        </div>
        <div style="font-size: 16px; line-height: 1.6; margin-top: 24px;">
          ${message.split('\n').map((p: string) => `<p style="margin: 0 0 16px 0;">${p}</p>`).join('')}
        </div>
      `;
      const html = buildOpenEventEmailHtml(subject, content, event.title, logoUrl);

      // Resend API requires 'to' or 'bcc'. To keep emails private, we bcc everyone.
      // Free tier allows up to 50 emails per request.
      const batchSize = 50;
      for (let i = 0; i < recipients.length; i += batchSize) {
        const batch = recipients.slice(i, i + batchSize);
        const resendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ 
            from: "Chrono <info@knowwhatson.com>", 
            to: ["info@knowwhatson.com"],
            bcc: batch, 
            subject, 
            html 
          })
        });
        
        if (!resendRes.ok) {
          const errData = await resendRes.json().catch(() => ({}));
          console.error("Resend API error:", errData);
          throw new Error(errData.message || "Failed to send email");
        }
      }
    }
    
    return c.json({ success: true, sentCount: recipients.length });
  } catch (e) { 
    console.error("Blast email error:", e);
    return c.json({ error: errorString(e) }, 500); 
  }
});

app.post(`${PREFIX}/open-sessions/:id/toggle-waitlist-full`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const id = c.req.param("id");
    const session = await kv.get(`open_session:${id}`);
    if (!session) return c.json({ error: "Not found" }, 404);
    
    const event = await kv.get(`open_event:${session.event_id}`);
    if (!event || event.user_id !== user.id) return c.json({ error: "Unauthorized" }, 401);
    
    session.waitlist_full = !session.waitlist_full;
    await kv.set(`open_session:${id}`, session);
    await kv.set(`open_session_event:${session.event_id}:${id}`, session);
    if (session.code) await kv.set(`open_session_code:${session.code}`, session);
    
    const slots = await kv.getByPrefix(`open_slot_session:${id}:`);
    for (const sl of slots) {
      sl.waitlist_full = session.waitlist_full;
      await kv.set(`open_slot:${sl.id}`, sl);
      await kv.set(`open_slot_session:${sl.session_id}:${sl.id}`, sl);
    }
    
    return c.json(session);
  } catch (e) { return c.json({ error: errorString(e) }, 500); }
});

app.post(`${PREFIX}/open-slots/:id/toggle-waitlist-full`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const id = c.req.param("id");
    const slot = await kv.get(`open_slot:${id}`);
    if (!slot) return c.json({ error: "Not found" }, 404);
    
    const session = await kv.get(`open_session:${slot.session_id}`);
    if (!session) return c.json({ error: "Not found" }, 404);
    
    const event = await kv.get(`open_event:${session.event_id}`);
    if (!event || event.user_id !== user.id) return c.json({ error: "Unauthorized" }, 401);
    
    slot.waitlist_full = !slot.waitlist_full;
    await kv.set(`open_slot:${id}`, slot);
    await kv.set(`open_slot_session:${slot.session_id}:${id}`, slot);
    
    return c.json(slot);
  } catch (e) { return c.json({ error: errorString(e) }, 500); }
});

app.get(`${PREFIX}/open-sessions/:id/feedback-info`, async (c) => {
  try {
    const id = c.req.param("id");
    const session = await kv.get(`open_session:${id}`);
    if (!session) return c.json({ error: "Not found" }, 404);
    
    const event = await kv.get(`open_event:${session.event_id}`);
    
    return c.json({
      sessionTitle: session.title,
      eventTitle: event?.title || ""
    });
  } catch (e) {
    return c.json({ error: errorString(e) }, 500);
  }
});

app.post(`${PREFIX}/open-sessions/:id/feedback`, async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();
    const { rating, comment } = body;
    
    if (!rating) return c.json({ error: "Rating is required" }, 400);
    
    const feedbackId = crypto.randomUUID();
    const feedback = {
      id: feedbackId,
      session_id: id,
      rating,
      comment: comment || "",
      created_at: new Date().toISOString()
    };
    
    await kv.set(`open_session_feedback:${id}:${feedbackId}`, feedback);
    
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: errorString(e) }, 500);
  }
});

app.get(`${PREFIX}/open-event-book/:code`, async (c) => {
  try {
    const code = c.req.param("code");
    const event = await kv.get(`open_event_code:${code}`);
    if (!event) return c.json({ error: "Event not found" }, 404);
    
    const sessions = await getAllByPrefix(`open_session_event:${event.id}:`);
    const enhancedSessions = await Promise.all(sessions.map(async (s:any) => {
      const slots = await getAllByPrefix(`open_slot_session:${s.id}:`);
      return { ...s, slots };
    }));
    
    return c.json({ ...event, sessions: enhancedSessions });
  } catch (e) { return c.json({ error: errorString(e) }, 500); }
});

app.get(`${PREFIX}/open-book/:code`, async (c) => {
  try {
    const code = c.req.param("code");
    const session = await kv.get(`open_session_code:${code}`);
    if (!session) return c.json({ error: "Session not found" }, 404);
    
    const event = await kv.get(`open_event:${session.event_id}`);
    const slots = await getAllByPrefix(`open_slot_session:${session.id}:`);
    const allBookings = await getAllByPrefix(`open_booking:${session.id}:`);
    
    const enhancedSlots = slots.map((slot:any) => {
      const slotBookings = allBookings.filter((b:any) => b.slot_id === slot.id && b.status === "confirmed");
      const waitlist = allBookings.filter((b:any) => b.slot_id === slot.id && b.status === "waitlist");
      return { ...slot, bookedCount: slotBookings.length, waitlistCount: waitlist.length, isFull: slotBookings.length >= slot.capacity };
    });
    
    return c.json({ session, event, slots: enhancedSlots });
  } catch (e) { return c.json({ error: errorString(e) }, 500); }
});

app.post(`${PREFIX}/open-book/:code/book`, async (c) => {
  try {
    const code = c.req.param("code");
    const { email, name, slot_id, timezone } = await c.req.json();
    if (!email || !name || !slot_id) return c.json({ error: "Missing required fields" }, 400);
    
    const session = await kv.get(`open_session_code:${code}`);
    if (!session) return c.json({ error: "Session not found" }, 404);
    
    const event = await kv.get(`open_event:${session.event_id}`);
    const hostProfile = await kv.get(`user:${event.user_id}`);
    const tz = timezone || hostProfile?.timezone || "Australia/Sydney";
    const logoUrl = getLogoPublicUrl();
    
    const slot = await kv.get(`open_slot:${slot_id}`);
    if (!slot || slot.session_id !== session.id) return c.json({ error: "Invalid slot" }, 400);
    
    const timeKey = `open_participant_time:${session.event_id}:${email}:${slot.start_time}`;
    const existingTimeBooking = await kv.get(timeKey);
    if (existingTimeBooking) {
      return c.json({ error: "You already have a booking at this time in this event." }, 400);
    }
    
    const allBookings = await getAllByPrefix(`open_booking:${session.id}:`);
    const slotBookings = allBookings.filter((b:any) => b.slot_id === slot_id && b.status === "confirmed");
    const waitlistBookings = allBookings.filter((b:any) => b.slot_id === slot_id && b.status === "waitlist");
    const isFull = slotBookings.length >= slot.capacity;
    const status = isFull ? "waitlist" : "confirmed";
    
    const bookingId = crypto.randomUUID();
    const booking = { id: bookingId, session_id: session.id, slot_id, email, name, status, timezone: tz, created_at: new Date().toISOString() };
    
    await kv.set(`open_booking_id:${bookingId}`, booking);
    await kv.set(`open_booking:${session.id}:${bookingId}`, booking);
    
    if (status === "confirmed") {
      await kv.set(timeKey, bookingId);
    }
    
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (resendKey) {
      const subject = status === "confirmed" 
        ? `Booking Confirmed: ${session.title}` 
        : `Waitlist Joined: ${session.title}`;
      
      const dateStr = getEventDateStr(slot.start_time, tz);
      
      let html = "";
      if (status === "waitlist") {
        const position = waitlistBookings.length + 1;
        const content = `
          <div style="text-align: center; margin-bottom: 24px;">
            <span style="display: inline-block; background-color: #fef3c7; color: #d97706; padding: 6px 12px; border-radius: 9999px; font-size: 14px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase;">Waitlist Position: ${position}</span>
          </div>
          <p style="font-size: 16px; line-height: 1.6; margin-top: 24px;">Hi ${name},</p>
          <p style="font-size: 16px; line-height: 1.6;">Thank you for your interest in <strong>${session.title}</strong>. The session at <strong>${dateStr}</strong> is currently full, but we've successfully added you to the waitlist.</p>
          <div style="background-color: #f8fafc; border-radius: 12px; padding: 20px; margin: 24px 0;">
            <p style="margin: 0 0 8px 0; font-size: 14px; color: #64748b;">Event Details</p>
            <p style="margin: 0 0 8px 0; font-size: 16px;"><strong>Session:</strong> ${session.title}</p>
            <p style="margin: 0; font-size: 16px;"><strong>Time:</strong> ${dateStr}</p>
          </div>
          <p style="font-size: 16px; line-height: 1.6;">If a spot opens up, we will notify you right away via email. No further action is required on your part.</p>
        `;
        html = buildOpenEventEmailHtml("You're on the waitlist!", content, event.title, logoUrl);
      } else {
        const content = `
          <div style="text-align: center; margin-bottom: 24px;">
            <span style="display: inline-block; background-color: #d1fae5; color: #059669; padding: 6px 12px; border-radius: 9999px; font-size: 14px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase;">Confirmed</span>
          </div>
          <p style="font-size: 16px; line-height: 1.6; margin-top: 24px;">Hi ${name},</p>
          <p style="font-size: 16px; line-height: 1.6;">Your booking for <strong>${session.title}</strong> has been confirmed.</p>
          <div style="background-color: #f8fafc; border-radius: 12px; padding: 20px; margin: 24px 0;">
            <p style="margin: 0 0 8px 0; font-size: 14px; color: #64748b;">Event Details</p>
            <p style="margin: 0 0 8px 0; font-size: 16px;"><strong>Session:</strong> ${session.title}</p>
            <p style="margin: 0; font-size: 16px;"><strong>Time:</strong> ${dateStr}</p>
          </div>
          <p style="font-size: 16px; line-height: 1.6;">We look forward to seeing you.</p>
        `;
        html = buildOpenEventEmailHtml("Booking Confirmed!", content, event.title, logoUrl);
      }

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ 
          from: "Chrono <info@knowwhatson.com>", 
          to: email, 
          subject, 
          html 
        })
      }).catch(console.error);
    }
    
    return c.json({ booking, isFull }, 201);
  } catch (e) { return c.json({ error: errorString(e) }, 500); }
});

app.post(`${PREFIX}/waitlist/:bookingId/promote`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const bookingId = c.req.param("bookingId");
    const booking = await kv.get(`open_booking_id:${bookingId}`);
    if (!booking || booking.status !== "waitlist") return c.json({ error: "Booking not found or not waitlisted" }, 404);
    
    const session = await kv.get(`open_session:${booking.session_id}`);
    if (!session) return c.json({ error: "Session not found" }, 404);
    
    const event = await kv.get(`open_event:${session.event_id}`);
    const tz = booking.timezone || "Australia/Sydney";
    const logoUrl = getLogoPublicUrl();
    
    const allBookings = await getAllByPrefix(`open_booking:${session.id}:`);
    const confirmedBookings = allBookings.filter((b:any) => b.slot_id === booking.slot_id && b.status === "confirmed");
    
    let displacedBooking = null;
    if (confirmedBookings.length > 0) {
      displacedBooking = confirmedBookings[0];
      
      displacedBooking.status = "waitlist";
      await kv.set(`open_booking_id:${displacedBooking.id}`, displacedBooking);
      await kv.set(`open_booking:${session.id}:${displacedBooking.id}`, displacedBooking);
      
      const slot = await kv.get(`open_slot:${booking.slot_id}`);
      if (slot) {
        await kv.del(`open_participant_time:${session.event_id}:${displacedBooking.email}:${slot.start_time}`);
        
        const resendKey = Deno.env.get("RESEND_API_KEY");
        if (resendKey && displacedBooking.email) {
          const dateStr = getEventDateStr(slot.start_time, displacedBooking.timezone || tz);
          const displacedContent = `
            <div style="text-align: center; margin-bottom: 24px;">
              <span style="display: inline-block; background-color: #fee2e2; color: #b91c1c; padding: 6px 12px; border-radius: 9999px; font-size: 14px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase;">Update</span>
            </div>
            <p style="font-size: 16px; line-height: 1.6; margin-top: 24px;">Hi ${displacedBooking.name},</p>
            <p style="font-size: 16px; line-height: 1.6;">Due to a scheduling update, your confirmed spot for <strong>${session.title}</strong> at ${dateStr} has been moved back to the waitlist.</p>
            <p style="font-size: 16px; line-height: 1.6;">We apologize for the inconvenience.</p>
            <div style="text-align: center; margin-top: 32px; margin-bottom: 8px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
                <tr>
                  <td align="center" bgcolor="#1e1b4b" style="background-color: #1e1b4b; border-radius: 12px;">
                    <a href="https://chrono.knowwhatson.com/open-event/${event.code}" style="display: inline-block; padding: 14px 32px; font-size: 16px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 12px;">Explore Slots</a>
                  </td>
                </tr>
              </table>
            </div>
          `;
          const displacedHtml = buildOpenEventEmailHtml("Waitlist Update", displacedContent, event.title, logoUrl);
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ 
              from: "Chrono <info@knowwhatson.com>", 
              to: displacedBooking.email, 
              subject: `Waitlist Update: ${session.title}`, 
              html: displacedHtml 
            })
          });
        }
      }
    }
    
    booking.status = "confirmed";
    await kv.set(`open_booking_id:${booking.id}`, booking);
    await kv.set(`open_booking:${session.id}:${booking.id}`, booking);
    
    const slot = await kv.get(`open_slot:${booking.slot_id}`);
    if (slot) {
      await kv.set(`open_participant_time:${session.event_id}:${booking.email}:${slot.start_time}`, booking.id);
      
      const resendKey = Deno.env.get("RESEND_API_KEY");
      if (resendKey) {
        const dateStr = getEventDateStr(slot.start_time, tz);
        const content = `
          <div style="text-align: center; margin-bottom: 24px;">
            <span style="display: inline-block; background-color: #d1fae5; color: #059669; padding: 6px 12px; border-radius: 9999px; font-size: 14px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase;">Promoted</span>
          </div>
          <p style="font-size: 16px; line-height: 1.6; margin-top: 24px;">Hi ${booking.name},</p>
          <p style="font-size: 16px; line-height: 1.6;">You have been promoted from the waitlist! Your booking for <strong>${session.title}</strong> is now confirmed.</p>
          <div style="background-color: #f8fafc; border-radius: 12px; padding: 20px; margin: 24px 0;">
            <p style="margin: 0 0 8px 0; font-size: 14px; color: #64748b;">Event Details</p>
            <p style="margin: 0 0 8px 0; font-size: 16px;"><strong>Session:</strong> ${session.title}</p>
            <p style="margin: 0; font-size: 16px;"><strong>Time:</strong> ${dateStr}</p>
          </div>
          <p style="font-size: 16px; line-height: 1.6;">We look forward to seeing you.</p>
        `;
        const html = buildOpenEventEmailHtml("You're off the waitlist!", content, event.title, logoUrl);
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ 
            from: "Chrono <info@knowwhatson.com>", 
            to: booking.email, 
            subject: `Booking Confirmed: ${session.title}`, 
            html 
          })
        });
      }
    }
    
    return c.json({ success: true, promoted: booking, displaced: displacedBooking });
  } catch (e) { return c.json({ error: errorString(e) }, 500); }
});

app.post(`${PREFIX}/waitlist/:bookingId/delete`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const bookingId = c.req.param("bookingId");
    const booking = await kv.get(`open_booking_id:${bookingId}`);
    if (!booking) return c.json({ error: "Booking not found" }, 404);
    
    const session = await kv.get(`open_session:${booking.session_id}`);
    const event = session ? await kv.get(`open_event:${session.event_id}`) : null;
    const logoUrl = getLogoPublicUrl();
    
    await kv.del(`open_booking_id:${bookingId}`);
    await kv.del(`open_booking:${booking.session_id}:${bookingId}`);
    
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (resendKey && session && event) {
      const content = `
        <div style="text-align: center; margin-bottom: 24px;">
          <span style="display: inline-block; background-color: #f3f4f6; color: #4b5563; padding: 6px 12px; border-radius: 9999px; font-size: 14px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase;">Waitlist Unsuccessful</span>
        </div>
        <p style="font-size: 16px; line-height: 1.6; margin-top: 24px;">Hi ${booking.name},</p>
        <p style="font-size: 16px; line-height: 1.6;">Unfortunately, we weren't able to accommodate you for the session <strong>${session.title}</strong>.</p>
        <p style="font-size: 16px; line-height: 1.6;">Your waitlist entry has been cancelled. If you are still interested, please look for other available times.</p>
        <div style="text-align: center; margin-top: 32px; margin-bottom: 8px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
            <tr>
              <td align="center" bgcolor="#1e1b4b" style="background-color: #1e1b4b; border-radius: 12px;">
                <a href="https://chrono.knowwhatson.com/open-event/${event.code}" style="display: inline-block; padding: 14px 32px; font-size: 16px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 12px;">Explore Slots</a>
              </td>
            </tr>
          </table>
        </div>
      `;
      const html = buildOpenEventEmailHtml("Waitlist Update", content, event.title, logoUrl);
      
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ 
          from: "Chrono <info@knowwhatson.com>", 
          to: booking.email, 
          subject: `Waitlist Unsuccessful: ${session.title}`, 
          html 
        })
      });
    }
    
    return c.json({ success: true });
  } catch (e) { return c.json({ error: errorString(e) }, 500); }
});

app.get(`${PREFIX}/open-feedback`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const events = await getAllByPrefix(`open_event_user:${user.id}:`);
    const result = [];
    
    for (const event of events) {
      const sessions = await getAllByPrefix(`open_session_event:${event.id}:`);
      const sessionResults = [];
      
      for (const session of sessions) {
        const feedbacks = await getAllByPrefix(`open_session_feedback:${session.id}:`);
        if (feedbacks && feedbacks.length > 0) {
          sessionResults.push({
            id: session.id,
            title: session.title,
            feedbacks: feedbacks.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          });
        }
      }
      
      if (sessionResults.length > 0) {
        result.push({
          id: event.id,
          title: event.title,
          sessions: sessionResults
        });
      }
    }
    
    return c.json(result);
  } catch (e) {
    return c.json({ error: errorString(e) }, 500);
  }
});

app.get(`${PREFIX}/open-events-calendar`, async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const events = await getAllByPrefix(`open_event_user:${user.id}:`);
    const allSlots = [];
    
    for (const event of events) {
      const sessions = await getAllByPrefix(`open_session_event:${event.id}:`);
      for (const session of sessions) {
        const slots = await getAllByPrefix(`open_slot_session:${session.id}:`);
        const allBookings = await getAllByPrefix(`open_booking:${session.id}:`);
        for (const slot of slots) {
          const slotBookings = allBookings.filter((b:any) => b.slot_id === slot.id);
          allSlots.push({
            ...slot,
            event_title: event.title,
            session_title: session.title,
            bookings: slotBookings
          });
        }
      }
    }
    
    return c.json(allSlots);
  } catch (e) { return c.json({ error: errorString(e) }, 500); }
});

// --- Live Session APIs ---
app.get(PREFIX + "/live-sessions/active", async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const configs = await kv.getByPrefix("livesession_config_");
    const activeConfigs = configs.filter((cfg: any) => cfg.owner_id === user.id && cfg.isPublicActive === true);
    return c.json(activeConfigs);
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

app.get(PREFIX + "/live-sessions", async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const configs = await kv.getByPrefix("livesession_config_");
    const myConfigs = configs.filter((cfg: any) => cfg.owner_id === user.id);
    return c.json(myConfigs);
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

app.get(PREFIX + "/live-sessions/:id/config", async (c) => {
  const id = c.req.param("id");
  const config = await kv.get(`livesession_config_${id}`);
  if (!config) return c.json(null, 404);
  return c.json(config);
});
app.post(PREFIX + "/live-sessions/:id/config", async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");
  const body = await c.req.json();
  
  // Maintain owner_id if it exists, or set it to current user
  const existing = await kv.get(`livesession_config_${id}`);
  body.owner_id = existing?.owner_id || user.id;

  await kv.set(`livesession_config_${id}`, body);
  return c.json({ ok: true });
});
app.get(PREFIX + "/live-sessions/:id/results", async (c) => {
  const id = c.req.param("id");
  const results = await kv.get(`livesession_results_${id}`);
  return c.json(results || null);
});
app.post(PREFIX + "/live-sessions/:id/results", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  await kv.set(`livesession_results_${id}`, body);
  return c.json({ ok: true });
});
app.delete(PREFIX + "/live-sessions/:id", async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");
  
  const existing = await kv.get(`livesession_config_${id}`);
  if (!existing) return c.json({ error: "Not found" }, 404);
  if (existing.owner_id !== user.id) return c.json({ error: "Forbidden" }, 403);

  await kv.mdel([`livesession_config_${id}`, `livesession_results_${id}`]);
  return c.json({ ok: true });
});

async function processEventModeTasks() {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) return;
  
  try {
    const allEvents = await getAllByPrefix("open_event:");
    if (!allEvents || allEvents.length === 0) return;
    
    const allSessions = await getAllByPrefix("open_session_event:");
    const allSlots = await getAllByPrefix("open_slot_session:");
    const allBookings = await getAllByPrefix("open_booking:");
    
    const nowMs = Date.now();
    const logoUrl = getLogoPublicUrl();

    for (const event of allEvents) {
      if (!event.id) continue;
      
      const hostProfile = await kv.get(`user:${event.user_id}`);
      const tz = hostProfile?.timezone || "Australia/Sydney";
      
      const sessions = allSessions.filter((s:any) => s.event_id === event.id);
      for (const session of sessions) {
        if (!session.id) continue;
        
        const slots = allSlots.filter((s:any) => s.session_id === session.id);
        const sessionBookings = allBookings.filter((b:any) => b.session_id === session.id || (b.slot_id && slots.some((slot:any) => slot.id === b.slot_id)));
        
        for (const slot of slots) {
          const slotStartMs = new Date(slot.start_time).getTime();
          const diffMins = (slotStartMs - nowMs) / 60000;
          
          if (diffMins > 0 && diffMins <= 5) {
            const dateStr = getEventDateStr(slot.start_time, tz);

            // Waitlist auto-kill (4 mins or less to slot)
            if (diffMins <= 4) {
              const waitlisted = sessionBookings.filter((b:any) => b.slot_id === slot.id && b.status === "waitlist");
              for (const w of waitlisted) {
                const killedKey = `open_booking_killed:${w.id}`;
                const alreadyKilled = await kv.get(killedKey);
                if (!alreadyKilled) {
                  await kv.set(killedKey, true);
                  await kv.del(`open_booking_id:${w.id}`);
                  await kv.del(`open_booking:${session.id}:${w.id}`);
                  
                  const wDateStr = getEventDateStr(slot.start_time, w.timezone || tz);
                  
                  const content = `
                    <div style="text-align: center; margin-bottom: 24px;">
                      <span style="display: inline-block; background-color: #f3f4f6; color: #4b5563; padding: 6px 12px; border-radius: 9999px; font-size: 14px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase;">Waitlist Auto-Kill</span>
                    </div>
                    <p style="font-size: 16px; line-height: 1.6; margin-top: 24px;">Hi ${w.name},</p>
                    <p style="font-size: 16px; line-height: 1.6;">Your session for <strong>${session.title}</strong> at <strong>${wDateStr}</strong> is starting in less than 4 minutes and the waitlist did not move.</p>
                    <p style="font-size: 16px; line-height: 1.6;">We have automatically cancelled your waitlist entry. Please look for other available times.</p>
                    <div style="text-align: center; margin-top: 32px; margin-bottom: 8px;">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
                        <tr>
                          <td align="center" bgcolor="#1e1b4b" style="background-color: #1e1b4b; border-radius: 12px;">
                            <a href="https://chrono.knowwhatson.com/open-event/${event.code}" style="display: inline-block; padding: 14px 32px; font-size: 16px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 12px;">Explore Slots</a>
                          </td>
                        </tr>
                      </table>
                    </div>
                  `;
                  const html = buildOpenEventEmailHtml("Waitlist Auto-Kill", content, event.title, logoUrl);
                  
                  await fetch("https://api.resend.com/emails", {
                    method: "POST",
                    headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ 
                      from: "Chrono <info@knowwhatson.com>", 
                      to: w.email, 
                      subject: `Waitlist Auto-Kill: ${session.title}`, 
                      html 
                    })
                  }).catch(console.error);
                }
              }
            }

            // Session reminder (5 mins or less to slot)
            if (diffMins <= 5) {
              const confirmed = sessionBookings.filter((b:any) => b.slot_id === slot.id && b.status === "confirmed");
              for (const c of confirmed) {
                const remindedKey = `open_booking_reminded:${c.id}`;
                const alreadyReminded = await kv.get(remindedKey);
                if (!alreadyReminded) {
                  await kv.set(remindedKey, true);
                  
                  const cDateStr = getEventDateStr(slot.start_time, c.timezone || tz);
                  
                  const content = `
                    <div style="text-align: center; margin-bottom: 24px;">
                      <span style="display: inline-block; background-color: #bfdbfe; color: #1d4ed8; padding: 6px 12px; border-radius: 9999px; font-size: 14px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase;">Reminder</span>
                    </div>
                    <p style="font-size: 16px; line-height: 1.6; margin-top: 24px;">Hi ${c.name},</p>
                    <p style="font-size: 16px; line-height: 1.6;">Your booked session for <strong>${session.title}</strong> is starting in less than 5 minutes!</p>
                    <div style="background-color: #f8fafc; border-radius: 12px; padding: 20px; margin: 24px 0;">
                      <p style="margin: 0 0 8px 0; font-size: 14px; color: #64748b;">Event Details</p>
                      <p style="margin: 0 0 8px 0; font-size: 16px;"><strong>Session:</strong> ${session.title}</p>
                      <p style="margin: 0; font-size: 16px;"><strong>Time:</strong> ${cDateStr}</p>
                    </div>
                    <p style="font-size: 16px; line-height: 1.6;">Please get ready to join.</p>
                  `;
                  const html = buildOpenEventEmailHtml("Session Starting Soon", content, event.title, logoUrl);
                  
                  await fetch("https://api.resend.com/emails", {
                    method: "POST",
                    headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ 
                      from: "Chrono <info@knowwhatson.com>", 
                      to: c.email, 
                      subject: `Reminder: ${session.title} starts soon`, 
                      html 
                    })
                  }).catch(console.error);
                }
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.error("Error in processEventModeTasks", err);
  }
}

setInterval(processEventModeTasks, 60000);
if (typeof Deno !== "undefined" && typeof Deno.cron !== "undefined") {
  try {
    Deno.cron("Event Mode Reminders", "* * * * *", processEventModeTasks);
  } catch (e) {
    console.log("Cron not supported in this env");
  }
}

Deno.serve(app.fetch);