/**
 * Push notification client-side logic.
 * Handles service worker registration, VAPID subscription, and preference management.
 */

import { projectId, publicAnonKey } from "/utils/supabase/info";

const BASE = `https://${projectId}.supabase.co/functions/v1/make-server-d1909ddd`;

// Convert a URL-safe base64 string to Uint8Array (for applicationServerKey)
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

/** Check if push notifications are supported in this browser */
export function isPushSupported(): boolean {
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** Get current notification permission state */
export function getPermissionState(): NotificationPermission {
  if (!("Notification" in window)) return "denied";
  return Notification.permission;
}

/** Register the Chrono service worker (idempotent) */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    // Pre-check: verify sw.js actually exists (avoid registering an HTML 404 page)
    const probe = await fetch("/sw.js", { method: "HEAD" });
    const ct = probe.headers.get("content-type") || "";
    if (!probe.ok || !ct.includes("javascript")) {
      // Expected in development / SPA hosting where /sw.js returns index.html — not an error
      console.debug("[Push] sw.js not served as JS (status %d, type %s) — SW registration skipped", probe.status, ct);
      return null;
    }
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    // Wait for the SW to be active
    if (reg.installing) {
      await new Promise<void>((resolve) => {
        reg.installing!.addEventListener("statechange", function handler() {
          if (this.state === "activated") {
            this.removeEventListener("statechange", handler);
            resolve();
          }
        });
      });
    }
    return reg;
  } catch (e) {
    console.error("[Push] Service worker registration failed:", e);
    return null;
  }
}

/** Get the VAPID public key from the server */
export async function getVapidPublicKey(token: string): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/push/vapid-key`, {
      headers: {
        Authorization: `Bearer ${publicAnonKey}`,
        "X-User-Token": token,
      },
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("[Push] VAPID key fetch failed:", res.status, errText);
      return null;
    }
    const data = await res.json();
    if (!data.publicKey) {
      console.error("[Push] VAPID key response missing publicKey:", data);
    }
    return data.publicKey || null;
  } catch (e) {
    console.error("[Push] VAPID key fetch error:", e);
    return null;
  }
}

/** Subscribe to push notifications and send subscription to server */
export async function subscribeToPush(token: string): Promise<{ ok: boolean; error?: string }> {
  try {
    // Step 1: Register service worker
    let reg: ServiceWorkerRegistration | null = null;
    try {
      reg = await registerServiceWorker();
    } catch (swErr: any) {
      console.error("[Push] SW registration threw:", swErr);
    }
    if (!reg) {
      // Detect iframe/sandboxed context (common in preview environments)
      const inIframe = window.self !== window.top;
      return {
        ok: false,
        error: inIframe
          ? "Push notifications require a top-level window. They cannot work inside an embedded preview. Open the app in its own tab to enable push."
          : "Service worker registration failed. Your browser may not support push notifications, or the page isn't served over HTTPS.",
      };
    }

    // Step 2: Request notification permission
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return { ok: false, error: perm === "denied" ? "permission_denied" : "permission_dismissed" };

    // Step 3: Get VAPID key from server
    const vapidKey = await getVapidPublicKey(token);
    if (!vapidKey) return { ok: false, error: "Could not retrieve push encryption key from the server. Please try again." };

    // Step 4: Subscribe to push via browser PushManager
    let subscription: PushSubscription;
    try {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
    } catch (pushErr: any) {
      console.error("[Push] pushManager.subscribe failed:", pushErr);
      return { ok: false, error: `Browser push subscription failed: ${pushErr?.message || pushErr}` };
    }

    // Step 5: Send subscription to server
    const res = await fetch(`${BASE}/push/subscribe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${publicAnonKey}`,
        "X-User-Token": token,
      },
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error("[Push] Server subscribe failed:", res.status, errBody);
      return { ok: false, error: `Server rejected subscription (${res.status}). ${errBody}` };
    }

    return { ok: true };
  } catch (e: any) {
    console.error("[Push] Subscribe error:", e);
    return { ok: false, error: e?.message || "Unknown push subscription error" };
  }
}

/** Unsubscribe from push notifications */
export async function unsubscribeFromPush(token: string): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return true;

    const subscription = await reg.pushManager.getSubscription();
    if (subscription) {
      // Remove from server
      await fetch(`${BASE}/push/unsubscribe`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
          "X-User-Token": token,
        },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      // Unsubscribe locally
      await subscription.unsubscribe();
    }
    return true;
  } catch (e) {
    console.error("[Push] Unsubscribe error:", e);
    return false;
  }
}

/** Check if currently subscribed to push */
export async function isSubscribedToPush(): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return false;
    const sub = await reg.pushManager.getSubscription();
    return !!sub;
  } catch {
    return false;
  }
}

/** Get push notification preferences from server */
export async function getPushPreferences(token: string): Promise<Record<string, boolean> | null> {
  try {
    const res = await fetch(`${BASE}/push/preferences`, {
      headers: {
        Authorization: `Bearer ${publicAnonKey}`,
        "X-User-Token": token,
      },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/** Update push notification preferences on server */
export async function updatePushPreferences(
  token: string,
  prefs: Record<string, boolean>
): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/push/preferences`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${publicAnonKey}`,
        "X-User-Token": token,
      },
      body: JSON.stringify(prefs),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Send a test push notification */
export async function sendTestPush(token: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/push/test`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${publicAnonKey}`,
        "X-User-Token": token,
      },
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Default notification categories with labels
export const PUSH_CATEGORIES = [
  // General
  { key: "reminders", label: "Reminders", desc: "When a reminder is due" },
  // Social & Calendar
  { key: "calendar_share_requests", label: "Calendar Requests", desc: "Accept/reject calendar sharing" },
  { key: "friend_joined", label: "Friends Joining", desc: "When an invited friend signs up" },
  { key: "friend_calendar_share", label: "Calendar Sharing", desc: "When a friend shares their calendar" },
  // Lists
  { key: "shared_list_invites", label: "Shared List Invites", desc: "New list collaboration invitations" },
  { key: "shared_list_updates", label: "Shared List Activity", desc: "Items added/completed in shared lists" },
  // Invoices & Quotes
  { key: "invoice_viewed", label: "Invoice Viewed", desc: "When your invoice or quote is opened by the recipient" },
  { key: "invoice_accepted", label: "Quote Accepted", desc: "When a client accepts your quote" },
  { key: "invoice_comment", label: "Invoice Comments", desc: "When someone comments on your invoice or quote" },
] as const;

export const DEFAULT_PREFERENCES: Record<string, boolean> = {
  reminders: true,
  calendar_share_requests: true,
  shared_list_invites: true,
  shared_list_updates: true,
  friend_joined: true,
  friend_calendar_share: true,
  invoice_viewed: true,
  invoice_accepted: true,
  invoice_comment: true,
};