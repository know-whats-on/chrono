import { projectId, publicAnonKey } from "/utils/supabase/info";
import { createClient } from "@supabase/supabase-js";

const BASE = `https://${projectId}.supabase.co/functions/v1/make-server-d1909ddd`;

// Pre-warm the edge function on module load to reduce cold-start latency.
// The first real request will await this promise so we don't fire /me into a cold function.
const warmupPromise: Promise<void> = (async () => {
  const MAX_WARM_ATTEMPTS = 4;
  for (let i = 0; i < MAX_WARM_ATTEMPTS; i++) {
    try {
      const res = await fetch(`${BASE}/health`, {
        headers: { Authorization: `Bearer ${publicAnonKey}` },
        signal: AbortSignal.timeout(12000), // generous timeout for cold start
      });
      if (res.ok) {
        // Small stabilization delay — the function just woke up and may still
        // be initializing routes / DB connections for the first real request.
        await new Promise((r) => setTimeout(r, 300));
        return; // warm!
      }
      console.warn(`Pre-warm /health returned ${res.status}, attempt ${i + 1}/${MAX_WARM_ATTEMPTS}`);
    } catch (e) {
      console.warn(`Pre-warm /health failed, attempt ${i + 1}/${MAX_WARM_ATTEMPTS}:`, e);
    }
    // Wait before retrying (2s, 4s, 6s)
    if (i < MAX_WARM_ATTEMPTS - 1) {
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
  // If all attempts fail, proceed anyway — request() has its own retry logic
  console.warn("Pre-warm exhausted, proceeding without warm confirmation");
})();

/** Resolves once the edge function has responded to at least one health check (or warmup gave up). */
export const waitForWarmup = () => warmupPromise;

export const supabase = createClient(
  `https://${projectId}.supabase.co`,
  publicAnonKey
);

// --- Singleton refresh: deduplicate concurrent refresh calls ---
let refreshPromise: Promise<string | null> | null = null;

async function refreshAndGetToken(): Promise<string | null> {
  // If a refresh is already in-flight, piggyback on it
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error || !data?.session) {
        console.error("Token refresh failed:", error);
        // If the refresh token is invalid/expired, sign out to clear stale state
        if (error?.message?.includes("Refresh Token") || error?.message?.includes("Invalid")) {
          await supabase.auth.signOut({ scope: "local" });
        }
        return null;
      }
      return data.session.access_token;
    } finally {
      // Clear after a short delay so back-to-back calls still share the result
      setTimeout(() => { refreshPromise = null; }, 2000);
    }
  })();

  return refreshPromise;
}

async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const session = data?.session;
  if (!session?.access_token) return null;

  // Proactively refresh if token expires within 120 seconds
  const expiresAt = session.expires_at;
  if (expiresAt && expiresAt - Math.floor(Date.now() / 1000) < 120) {
    return await refreshAndGetToken();
  }

  return session.access_token;
}

export async function request(path: string, options: RequestInit = {}, skipAuth: boolean = false) {
  // Wait for the edge function to be warm before the first real request.
  // warmupPromise resolves quickly if already warm, so subsequent calls have no overhead.
  await warmupPromise;

  let token: string | null = null;
  if (!skipAuth) {
    token = await getToken();
    if (!token) {
      token = await refreshAndGetToken();
      if (!token) throw new Error("Not authenticated");
    }
  }

  const doFetch = (t: string | null) =>
    fetch(`${BASE}${path}`, {
      ...options,
      cache: options.cache || "no-store",
      signal: options.signal || AbortSignal.timeout(15000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${publicAnonKey}`,
        ...(t ? { "X-User-Token": t } : {}),
        ...options.headers,
      },
    });

  // Retry logic: handles cold starts / transient network errors
  const MAX_RETRIES = 5;
  let lastError: any = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      let res = await doFetch(token);

      // If we get 401, try token refresh + retry once (skip for public endpoints)
      if (res.status === 401 && !skipAuth) {
        const body = await res.json().catch(() => null);
        const freshToken = await refreshAndGetToken();
        if (freshToken) {
          token = freshToken;
          res = await doFetch(freshToken);
        } else {
          console.error(`API Error [${path}]:`, body);
          throw new AuthError(body?.message || body?.error || "Not authenticated");
        }
      }

      // Retriable server errors (common during edge function cold starts / deploys)
      if (res.status === 502 || res.status === 503 || res.status === 504) {
        if (attempt < MAX_RETRIES - 1) {
          const delay = 1500 * (attempt + 1); // 1.5s, 3s, 4.5s
          console.warn(`Server ${res.status} on ${path}, retrying in ${delay}ms (${attempt + 1}/${MAX_RETRIES})...`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        console.error(`API Error [${path}]:`, err);
        throw new Error(err.error || err.message || res.statusText);
      }
      return res.json();
    } catch (e: any) {
      lastError = e;
      // Don't retry auth errors
      if (e instanceof AuthError) throw e;
      // Retry on network errors (cold start, DNS, etc.)
      const isNetworkError =
        e instanceof TypeError && (e.message === "Failed to fetch" || e.message.includes("NetworkError"));
      const isTimeoutError = e?.name === "TimeoutError" || e?.name === "AbortError";
      if ((isNetworkError || isTimeoutError) && attempt < MAX_RETRIES - 1) {
        const delay = 2000 * (attempt + 1); // 2s, 4s, 6s, 8s
        console.warn(`Network error on ${path}, retrying in ${delay}ms (${attempt + 1}/${MAX_RETRIES})...`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw e;
    }
  }
  throw lastError;
}

// Custom error class to distinguish auth failures from network errors
export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

// Auth
export async function signup(email: string, password: string, name?: string) {
  // Signup uses the anon key since the user isn't authenticated yet
  // Include device timezone so the profile is created with the correct TZ
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const res = await fetch(`${BASE}/auth/signup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${publicAnonKey}`,
    },
    body: JSON.stringify({ email, password, name, timezone }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    console.error("Signup error:", err);
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export async function signin(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  return data;
}

export async function signout() {
  await supabase.auth.signOut();
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data?.session;
}

// User
export const getMe = () => request("/me");
export const updateMe = (data: any) => request("/me", { method: "PATCH", body: JSON.stringify(data) });

// News
export const getNews = () => request("/news");
export const getBookmarks = () => request("/news/bookmarks");
export const addBookmark = (article: any) => request("/news/bookmarks", { method: "POST", body: JSON.stringify(article) });
export const removeBookmark = (link: string) => request("/news/bookmarks", { method: "DELETE", body: JSON.stringify({ link }) });

// RSS Feeds
export const getRssFeeds = () => request("/rss-feeds");
export const addRssFeed = (url: string, name?: string) => request("/rss-feeds", { method: "POST", body: JSON.stringify({ url, name }) });
export const removeRssFeed = (id: string) => request(`/rss-feeds/${id}`, { method: "DELETE" });
export const getRssFeedArticles = () => request("/rss-feeds/articles", { signal: AbortSignal.timeout(45000) });

// Tasks
export const getTasks = (status?: string) => request(`/tasks${status ? `?status=${status}` : ""}`);
export const createTask = (data: any) => request("/tasks", { method: "POST", body: JSON.stringify(data) });
export const updateTask = (id: string, data: any) => request(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(data) });
export const completeTask = (id: string) => request(`/tasks/${id}/complete`, { method: "POST" });
export const deleteTask = (id: string) => request(`/tasks/${id}`, { method: "DELETE" });
export const suggestTimeBlock = (id: string) => request(`/tasks/${id}/suggest-time-block`, { method: "POST" });

// Task Migration
export const migrateTasksToLists = () => request("/migrate-tasks", { method: "POST" });

// Personal Lists (My Lists)
export const getMyLists = () => request("/my-lists");
export const createMyList = (data: any) => request("/my-lists", { method: "POST", body: JSON.stringify(data) });
export const updateMyList = (id: string, data: any) => request(`/my-lists/${id}`, { method: "PATCH", body: JSON.stringify(data) });
export const deleteMyList = (id: string) => request(`/my-lists/${id}`, { method: "DELETE" });
export const addMyListItem = (listId: string, data: any) =>
  request(`/my-lists/${listId}/items`, { method: "POST", body: JSON.stringify(typeof data === "string" ? { text: data } : data) });
export const toggleMyListItem = (listId: string, itemId: string) =>
  request(`/my-lists/${listId}/items/${itemId}`, { method: "PATCH" });
export const editMyListItem = (listId: string, itemId: string, data: any) =>
  request(`/my-lists/${listId}/items/${itemId}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteMyListItem = (listId: string, itemId: string) =>
  request(`/my-lists/${listId}/items/${itemId}`, { method: "DELETE" });
export const convertToSharedList = (listId: string, collaborators: { name: string; email: string }[]) =>
  request(`/my-lists/${listId}/convert-to-shared`, { method: "POST", body: JSON.stringify({ collaborators }) });

// People Contacts (app invitees + shared list collaborators)
export const getMyContacts = () => request("/my-contacts");

// Shared Lists
export const getSharedLists = () => request("/shared-lists");
export const createSharedList = (data: any) => request("/shared-lists", { method: "POST", body: JSON.stringify(data) });
export const updateSharedList = (id: string, data: any) => request(`/shared-lists/${id}`, { method: "PATCH", body: JSON.stringify(data) });
export const deleteSharedList = (id: string) => request(`/shared-lists/${id}`, { method: "DELETE" });
export const leaveSharedList = (id: string) => request(`/shared-lists/${id}/leave`, { method: "POST" });
export const getSharedListInvites = () => request("/shared-list-invites");
export const respondToSharedListInvite = (listId: string, action: "accept" | "reject") =>
  request(`/shared-lists/${listId}/respond`, { method: "POST", body: JSON.stringify({ action }) });
export const addSharedListItem = (listId: string, data: any) =>
  request(`/shared-lists/${listId}/items`, { method: "POST", body: JSON.stringify(typeof data === "string" ? { text: data } : data) });
export const fetchLinkPreview = (url: string) =>
  request(`/link-preview?url=${encodeURIComponent(url)}`);

export const sendInvoiceEmail = (data: { listId: string, recipientEmail: string, recipientName: string, invoiceLink: string, projectName: string }) =>
  request("/send-invoice-email", { method: "POST", body: JSON.stringify(data) });
export const toggleSharedListItem = (listId: string, itemId: string) =>
  request(`/shared-lists/${listId}/items/${itemId}`, { method: "PATCH" });
export const editSharedListItem = (listId: string, itemId: string, data: any) =>
  request(`/shared-lists/${listId}/items/${itemId}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteSharedListItem = (listId: string, itemId: string) =>
  request(`/shared-lists/${listId}/items/${itemId}`, { method: "DELETE" });
export const inviteToSharedList = (listId: string, email: string, name: string) =>
  request(`/shared-lists/${listId}/invite`, { method: "POST", body: JSON.stringify({ email, name }) });
export const getSharedListPreview = (listId: string) =>
  request(`/shared-lists/${listId}/preview`, {}, true);
export const getPublicInvoice = (listId: string) =>
  request(`/public-invoice/${listId}`, {}, true);
export const postInvoiceComment = (listId: string, name: string, comment: string, parentId?: string, source?: string) =>
  request(`/public-invoice/${listId}/comment`, { method: "POST", body: JSON.stringify({ name, comment, parentId, source }) }, true);
export const acceptInvoice = (listId: string, signature_name?: string, client_details?: any, source?: string) =>
  request(`/public-invoice/${listId}/accept`, { method: "POST", body: JSON.stringify({ signature_name, client_details, source }) }, true);
export const requestInvoiceChange = (listId: string, requester_name: string, request_text: string, source?: string) =>
  request(`/public-invoice/${listId}/request-change`, { method: "POST", body: JSON.stringify({ requester_name, request_text, source }) }, true);
export const joinSharedListViaLink = (listId: string) =>
  request(`/shared-lists/${listId}/join-via-link`, { method: "POST" });

// Reminders
export const getReminders = () => request("/reminders");
export const createReminder = (data: any) => request("/reminders", { method: "POST", body: JSON.stringify(data) });
export const updateReminder = (id: string, data: any) => request(`/reminders/${id}`, { method: "PATCH", body: JSON.stringify(data) });
export const snoozeReminder = (id: string, snoozed_until: string) => request(`/reminders/${id}/snooze`, { method: "POST", body: JSON.stringify({ snoozed_until }) });
export const disableReminder = (id: string) => request(`/reminders/${id}/disable`, { method: "POST" });
export const deleteReminder = (id: string) => request(`/reminders/${id}`, { method: "DELETE" });

// Days Since
export const getDaysSince = () => request("/days-since");
export const createDaysSince = (data: any) => request("/days-since", { method: "POST", body: JSON.stringify(data) });
export const updateDaysSince = (id: string, data: any) => request(`/days-since/${id}`, { method: "PATCH", body: JSON.stringify(data) });
export const resetDaysSince = (id: string) => request(`/days-since/${id}/reset`, { method: "POST" });
export const deleteDaysSince = (id: string) => request(`/days-since/${id}`, { method: "DELETE" });

// Weekly Review
export const saveWeeklyReview = (weekKey: string, summary: any) =>
  request("/weekly-review/save", { method: "POST", body: JSON.stringify({ weekKey, summary }) });
export const getWeeklyReviewHistory = () => request("/weekly-review/history");

// Events
export const getEvents = (start?: string, end?: string) => {
  const params = new URLSearchParams();
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  return request(`/events?${params.toString()}`);
};
export const getEventDetails = (id: string) => request(`/calendar/event/${id}`);
export const createEvent = (data: any) => request("/events", { method: "POST", body: JSON.stringify(data) });
export const updateEvent = (id: string, data: any) => request(`/events/${id}`, { method: "PATCH", body: JSON.stringify(data) });
export const deleteEvent = (id: string) => request(`/events/${id}`, { method: "DELETE" });
export const editEventInstance = (id: string, data: any) => request(`/events/${id}/edit-instance`, { method: "POST", body: JSON.stringify(data) });
export const deleteEventInstance = (id: string, data: { instance_date: string }) => request(`/events/${id}/delete-instance`, { method: "POST", body: JSON.stringify(data) });

// Availability Rules
export const getRules = () => request("/rules");
export const updateRules = (data: any) => request("/rules", { method: "PATCH", body: JSON.stringify(data) });

// Availability Query
export const queryAvailability = (data: any) => request("/availability/query", { method: "POST", body: JSON.stringify(data) });

// Tools for Assistant
export async function availabilityCheck({ startAt, endAt, timezone, mode }: { startAt: string; endAt: string; timezone: string; mode?: string }) {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const durationMinutes = (end.getTime() - start.getTime()) / 60000;

  const result = await queryAvailability({
    start_at: startAt,
    end_at: endAt,
    timezone,
    mode: mode || "any",
    duration_minutes: durationMinutes,
  });

  return {
    isFree: result.point_check?.is_free ?? false,
    timezone: result.timezone,
    requestedRange: { start: startAt, end: endAt },
    conflicts: result.point_check?.because || [],
  };
}

export async function availabilityFind({ rangeStart, rangeEnd, timezone, mode, minDurationMinutes, limit }: { rangeStart: string; rangeEnd: string; timezone: string; mode?: string; minDurationMinutes?: number; limit?: number }) {
  const result = await queryAvailability({
    start_at: rangeStart,
    end_at: rangeEnd,
    timezone,
    mode: mode || "any",
    duration_minutes: minDurationMinutes || 30,
  });

  return {
    timezone: result.timezone,
    mode: mode || "any",
    freeRanges: (result.free_slots || []).slice(0, limit || 10),
    conflictsSummary: (result.conflicts || []).slice(0, 5),
  };
}

// Calendar Connections
export const getCalendarConnections = () => request("/calendars/connections");
export const connectGoogleCalendar = (redirect_uri?: string) =>
  request("/calendars/google/connect", { method: "POST", body: JSON.stringify({ redirect_uri }) });
export const syncGoogleCalendar = (connection_id?: string) =>
  request("/calendars/google/sync", { method: "POST", body: JSON.stringify({ connection_id }) });
export const deleteCalendarConnection = (id: string) =>
  request(`/calendars/connections/${id}`, { method: "DELETE" });

// ICS / iCal URL connections
export const connectIcsCalendar = (url: string, name?: string) =>
  request("/calendars/ics/connect", { method: "POST", body: JSON.stringify({ url, name }) });
export const syncIcsCalendar = (connection_id?: string) =>
  request("/calendars/ics/sync", { method: "POST", body: JSON.stringify({ connection_id }) });

// CalDAV connections
export const connectCaldavCalendar = (data: { url: string; username: string; password: string; name?: string }) =>
  request("/calendars/caldav/connect", { method: "POST", body: JSON.stringify(data) });
export const syncCaldavCalendar = (connection_id?: string) =>
  request("/calendars/caldav/sync", { method: "POST", body: JSON.stringify({ connection_id }) });

// Calendar Contacts (iCal-linked people for availability queries)
export const getContacts = () => request("/contacts");
export const createContact = (data: { name: string; ical_url?: string; notes?: string }) =>
  request("/contacts", { method: "POST", body: JSON.stringify(data) });
export const updateContact = (id: string, data: any) =>
  request(`/contacts/${id}`, { method: "PATCH", body: JSON.stringify(data) });
export const deleteContact = (id: string) =>
  request(`/contacts/${id}`, { method: "DELETE" });
export const validateContact = (id: string) =>
  request(`/contacts/${id}/validate`, { method: "POST" });
export const getContactFreeBusy = (id: string, start_at: string, end_at: string) =>
  request(`/contacts/${id}/freebusy?start_at=${encodeURIComponent(start_at)}&end_at=${encodeURIComponent(end_at)}`);

// ICS Export (server-side — generates downloadable .ics files)
export function getExportIcsUrl(type: "event" | "reminder", id: string): string {
  return `${BASE}/export/ics/${type}/${id}`;
}

// Invites
export const sendInvite = (email: string, recipientName: string, personalMessage?: string) =>
  request("/invites", { method: "POST", body: JSON.stringify({ email, recipientName, personalMessage }) });
export const sendSmsInvite = (phone: string, recipientName: string, personalMessage?: string) =>
  request("/invites/sms", { method: "POST", body: JSON.stringify({ phone, recipientName, personalMessage }) });
export const getInvites = () => request("/invites");
export const deleteInvite = (id: string) => request(`/invites/${id}`, { method: "DELETE" });
export const resendInvite = (id: string) => request(`/invites/${id}/resend`, { method: "POST" });

// Booking Links (public meeting booking)
export const createBookingLink = () => request("/booking-links", { method: "POST" });
export const getBookingLinks = () => request("/booking-links");
export const deleteBookingLink = (code: string) => request(`/booking-links/${code}`, { method: "DELETE" });
export const getBookingRequests = () => request("/booking-requests");
export const acceptBookingRequest = (requestId: string) =>
  request(`/booking-requests/${requestId}/accept`, { method: "POST" });
export const declineBookingRequest = (requestId: string, bookingCode: string) =>
  request(`/booking-requests/${requestId}/decline`, { method: "POST", body: JSON.stringify({ booking_code: bookingCode }) });

// Public booking endpoints (no auth required)
export const getBookingInfo = (code: string) => request(`/book/${code}`, {}, true);
export const getBookingSlots = (code: string, date: string, duration_minutes: number) =>
  request(`/book/${code}/slots`, { method: "POST", body: JSON.stringify({ date, duration_minutes }) }, true);
export const submitBookingRequest = (code: string, data: { visitor_name: string; visitor_email: string; slot_start: string; slot_end: string; duration_minutes: number; note?: string }) =>
  request(`/book/${code}/request`, { method: "POST", body: JSON.stringify(data) }, true);

// Friends & Calendar Share Requests
export const getFriends = () => request("/friends");
export const sendCalendarShareRequest = (friendId: string, friendEmail: string, friendName?: string) =>
  request("/calendar-share-requests", { method: "POST", body: JSON.stringify({ friend_id: friendId, friend_email: friendEmail, friend_name: friendName }) });
export const getIncomingShareRequests = () => request("/calendar-share-requests/incoming");
export const getOutgoingShareRequests = () => request("/calendar-share-requests/outgoing");
export const respondToShareRequest = (id: string, action: "accept" | "decline") =>
  request(`/calendar-share-requests/${id}/respond`, { method: "POST", body: JSON.stringify({ action }) });
export const unshareCalendar = (friendId: string) =>
  request(`/calendar-share/${friendId}`, { method: "DELETE" });

// Notifications
export const getNotifications = () => request("/notifications");
export const markNotificationRead = (id: string) => request(`/notifications/${id}/read`, { method: "POST" });
export const markAllNotificationsRead = () => request("/notifications/read-all", { method: "POST" });
export const deleteNotification = (id: string) => request(`/notifications/${id}`, { method: "DELETE" });

// Email assets (logo image for invite emails)
export const uploadEmailLogo = (base64Data: string) =>
  request("/email-assets/logo", { method: "POST", body: JSON.stringify({ image: base64Data }) });
export const getEmailLogoUrl = (): Promise<{ url: string | null }> =>
  request("/email-assets/logo");

// App assets (PWA icons, favicon, login banner — hosted on Supabase Storage)
export const uploadAppAsset = (filename: string, base64Data: string, contentType?: string) =>
  request("/app-assets/upload", {
    method: "POST",
    body: JSON.stringify({ filename, image: base64Data, contentType }),
  });
export const getAppAssets = (): Promise<{ assets: Record<string, string> }> =>
  request("/app-assets");

// Smart Inbox
export const getInboxState = () => request("/inbox/state");
export const dismissInboxItem = (itemId: string) =>
  request("/inbox/dismiss", { method: "POST", body: JSON.stringify({ itemId }) });
export const snoozeInboxItem = (itemId: string, until: string) =>
  request("/inbox/snooze", { method: "POST", body: JSON.stringify({ itemId, until }) });
export const clearDismissedInbox = () =>
  request("/inbox/clear-dismissed", { method: "POST" });

// Push Notifications
export const getVapidKey = () => request("/push/vapid-key");
export const subscribePush = (subscription: any) =>
  request("/push/subscribe", { method: "POST", body: JSON.stringify({ subscription }) });
export const unsubscribePush = (endpoint: string) =>
  request("/push/unsubscribe", { method: "DELETE", body: JSON.stringify({ endpoint }) });
export const getPushPreferences = () => request("/push/preferences");
export const updatePushPreferences = (prefs: Record<string, boolean>) =>
  request("/push/preferences", { method: "PATCH", body: JSON.stringify(prefs) });
export const sendTestPush = () => request("/push/test", { method: "POST" });

// Focus Mode
export const saveFocusSession = (session: any) =>
  request("/focus/sessions", { method: "POST", body: JSON.stringify(session) });
export const getFocusSessions = () => request("/focus/sessions");
export const getFocusSettings = () => request("/focus/settings");
export const saveFocusSettings = (settings: any) =>
  request("/focus/settings", { method: "PUT", body: JSON.stringify(settings) });

// Gmail API
export const connectGmail = () =>
  request("/gmail/connect", { method: "POST" });
export const getGmailConnections = () =>
  request("/gmail/connections");
export const deleteGmailConnection = (id: string) =>
  request(`/gmail/connections/${id}`, { method: "DELETE" });
export const getGmailMessages = (connectionId: string, opts?: { q?: string; pageToken?: string; maxResults?: number; labelIds?: string }) => {
  const params = new URLSearchParams({ connectionId });
  if (opts?.q) params.set("q", opts.q);
  if (opts?.pageToken) params.set("pageToken", opts.pageToken);
  if (opts?.maxResults) params.set("maxResults", String(opts.maxResults));
  if (opts?.labelIds) params.set("labelIds", opts.labelIds);
  return request(`/gmail/messages?${params}`);
};
export const getGmailMessage = (id: string, connectionId: string) =>
  request(`/gmail/messages/${id}?connectionId=${connectionId}`);
export const modifyGmailMessage = (id: string, connectionId: string, addLabelIds?: string[], removeLabelIds?: string[]) =>
  request(`/gmail/messages/${id}/modify`, { method: "POST", body: JSON.stringify({ connectionId, addLabelIds, removeLabelIds }) });

// ═════════════════════════════════════════════════════════════════════
// Prefetch cache — load data during splash screen for instant Today
// ═════════════════════════════════════════════════════════════════════

interface CacheEntry { data: any; ts: number }
const _prefetchCache = new Map<string, CacheEntry>();
const _prefetchPromises = new Map<string, Promise<any>>();
const CACHE_TTL = 45_000; // 45 seconds

/**
 * Kick off all Today-page data fetches in parallel.
 * Called from AppLayout while the splash animation is playing.
 * Each result is stored in an in-memory cache that HomePage can consume.
 */
export function prefetchHomeData() {
  const now = new Date();
  const weekLater = new Date(now.getTime() + 7 * 86400000);

  const fetches: Record<string, () => Promise<any>> = {
    events: () => getEvents(now.toISOString(), weekLater.toISOString()),
    myLists: () => getMyLists(),
    reminders: () => getReminders(),
    daysSince: () => getDaysSince(),
    news: () => getNews(),
    rssArticles: () => getRssFeedArticles(),
    rssFeeds: () => getRssFeeds(),
    rules: () => getRules(),
  };

  for (const [key, fn] of Object.entries(fetches)) {
    // Don't re-fetch if already cached and fresh
    const existing = _prefetchCache.get(key);
    if (existing && Date.now() - existing.ts < CACHE_TTL) continue;
    // Don't double-fire
    if (_prefetchPromises.has(key)) continue;

    const p = fn()
      .then((data) => {
        _prefetchCache.set(key, { data, ts: Date.now() });
        _prefetchPromises.delete(key);
        return data;
      })
      .catch((e) => {
        console.warn(`[prefetch] ${key} failed:`, e);
        _prefetchPromises.delete(key);
        return null;
      });
    _prefetchPromises.set(key, p);
  }
}

/**
 * Consume a prefetched value. Returns the data if cached & fresh, otherwise null.
 * If a prefetch is in-flight, returns a promise the caller can await.
 */
export function consumePrefetch(key: string): { hit: true; data: any } | { hit: false; promise: Promise<any> | null } {
  const cached = _prefetchCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    // Don't delete — multiple consumers might read (e.g. carousel + news section)
    return { hit: true, data: cached.data };
  }
  const inflight = _prefetchPromises.get(key) ?? null;
  return { hit: false, promise: inflight };
}

/**
 * Helper for components: try cache first, else await inflight prefetch, else fresh fetch.
 */
export async function getWithPrefetch<T>(key: string, freshFetch: () => Promise<T>): Promise<T> {
  const result = consumePrefetch(key);
  if (result.hit) return result.data as T;
  if (result.promise) {
    const data = await result.promise;
    if (data !== null) return data as T;
  }
  return freshFetch();
}

// Live Sessions
export const getLiveSessions = () => request(`/live-sessions`, {});
export const getLiveSessionConfig = (id: string) => request(`/live-sessions/${id}/config`, {}, true).catch(() => null);
export const updateLiveSessionConfig = (id: string, data: any) => request(`/live-sessions/${id}/config`, { method: "POST", body: JSON.stringify(data) });
export const getLiveSessionResults = (id: string) => request(`/live-sessions/${id}/results`, {}, true).catch(() => null);
export const updateLiveSessionResults = (id: string, data: any) => request(`/live-sessions/${id}/results`, { method: "POST", body: JSON.stringify(data) }, true);
export const deleteLiveSession = (id: string) => request(`/live-sessions/${id}`, { method: "DELETE" });