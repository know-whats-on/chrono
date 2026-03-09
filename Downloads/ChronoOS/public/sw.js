// Chrono Service Worker - Push Notifications
// This service worker handles Web Push events.

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Handle push notification events
self.addEventListener("push", (event) => {
  let data = { title: "Chrono", body: "You have a new notification", type: "general" };

  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data.body = event.data.text();
    }
  }

  const TAG_MAP = {
    reminder: "chrono-reminder",
    friend_joined: "chrono-social",
    friend_shared_cal: "chrono-social",
    friend_requested_cal: "chrono-social",
    friend_shared_list: "chrono-lists",
    friend_updated_list: "chrono-lists",
    friend_left_list: "chrono-lists",
    calendar_share_accepted: "chrono-social",
    calendar_share_rejected: "chrono-social",
    invoice_viewed: "chrono-invoice",
    invoice_accepted: "chrono-invoice",
    invoice_comment: "chrono-invoice",
    invoice_change_requested: "chrono-invoice",
    invoice_invalidated: "chrono-invoice",
  };

  const options = {
    body: data.body || data.message || "You have a new notification",
    icon: "/chrono-icon-192.png",
    badge: "/chrono-icon-192.png",
    tag: TAG_MAP[data.type] || "chrono-general",
    renotify: true,
    data: {
      type: data.type,
      url: data.url || "/",
      meta: data.meta || {},
    },
    actions: [],
    vibrate: [100, 50, 100],
  };

  // Add contextual actions
  if (data.type === "reminder") {
    options.actions = [
      { action: "snooze", title: "Snooze 15m" },
      { action: "dismiss", title: "Dismiss" },
    ];
  } else if (data.type === "friend_shared_list" || data.type === "friend_requested_cal") {
    options.actions = [
      { action: "view", title: "View" },
      { action: "dismiss", title: "Dismiss" },
    ];
  } else if (data.type === "invoice_viewed" || data.type === "invoice_accepted" || data.type === "invoice_comment" || data.type === "invoice_change_requested" || data.type === "invoice_invalidated") {
    options.actions = [
      { action: "view", title: "View Document" },
      { action: "dismiss", title: "Dismiss" },
    ];
  }

  event.waitUntil(self.registration.showNotification(data.title || "Chrono", options));
});

// Handle notification click — always use the server-supplied url from the payload
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification.data || {};

  if (event.action === "dismiss") return;

  // The server now sends the correct deep-link URL per notification type.
  // Use it directly; fall back to type-based routing only as a safety net.
  let targetUrl = data.url || "/";

  // "snooze" action override — go to updates
  if (event.action === "snooze") {
    targetUrl = "/settings?section=updates";
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Try to find an existing Chrono tab and navigate it
      for (const client of clientList) {
        if (client.url.includes(self.location.origin)) {
          return client.focus().then((focused) => {
            // Use postMessage to let the SPA handle navigation via React Router
            // This avoids a full page reload that causes 404s on SPA routes
            focused.postMessage({
              type: "CHRONO_PUSH_NAVIGATE",
              url: targetUrl,
            });
          });
        }
      }
      // No existing tab — open root with a redirect param so the SPA can navigate
      // (opening deep URLs directly causes 404 on SPA hosting)
      const redirectUrl = "/?__push_target=" + encodeURIComponent(targetUrl);
      return self.clients.openWindow(redirectUrl);
    })
  );
});