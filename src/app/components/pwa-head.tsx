import { useEffect } from "react";
import chronoIcon from "/src/assets/b108680d997c87b5fa550902ecfe63e45b4394b6.png";
import { getCachedAssetUrls } from "../lib/asset-manager";
import { projectId } from "/utils/supabase/info";

/**
 * Injects PWA manifest + apple-touch-icon into <head> so that
 * "Add to Home Screen" on iOS / Android uses the Chrono icon.
 * Prefers Supabase-hosted URLs (from asset-manager cache) when available,
 * so PWA install and OG previews use a stable, CDN-backed origin.
 */
export function usePwaHead() {
  useEffect(() => {
    // Try to use Supabase-hosted assets for stable URLs
    const cached = getCachedAssetUrls();
    const iconUrl = cached?.["chrono-icon-512.png"] || chronoIcon;
    const icon192Url = cached?.["chrono-icon-192.png"] || chronoIcon;
    const maskableUrl = cached?.["chrono-icon-maskable-512.png"] || chronoIcon;
    const faviconUrl = cached?.["chrono-favicon.svg"] || null;

    // --- Favicon ---
    const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
      <!-- The "C" -->
      <text x="14" y="50" font-family="Georgia, 'Times New Roman', serif" font-size="52" font-weight="700" fill="#1e1b4b">C</text>
      <!-- Bubble 1: top-right, pink -->
      <circle cx="48" cy="12" r="7" fill="rgba(248,192,216,0.55)" stroke="url(#b1)" stroke-width="1"/>
      <circle cx="46" cy="10" r="1.8" fill="rgba(255,255,255,0.7)"/>
      <!-- Bubble 2: mid-right, purple -->
      <circle cx="54" cy="28" r="5" fill="rgba(216,180,254,0.5)" stroke="url(#b2)" stroke-width="0.8"/>
      <circle cx="52.5" cy="26.5" r="1.2" fill="rgba(255,255,255,0.65)"/>
      <!-- Bubble 3: top-center, small -->
      <circle cx="35" cy="6" r="3.5" fill="rgba(180,210,255,0.45)" stroke="rgba(255,255,255,0.4)" stroke-width="0.6"/>
      <circle cx="34" cy="5" r="0.9" fill="rgba(255,255,255,0.6)"/>
      <!-- Bubble 4: bottom-right, warm -->
      <circle cx="50" cy="46" r="4" fill="rgba(255,200,170,0.4)" stroke="url(#b3)" stroke-width="0.7"/>
      <circle cx="48.8" cy="44.8" r="1" fill="rgba(255,255,255,0.6)"/>
      <!-- Bubble 5: tiny accent -->
      <circle cx="42" cy="8" r="2" fill="rgba(248,192,216,0.35)" stroke="rgba(255,255,255,0.3)" stroke-width="0.5"/>
      <defs>
        <linearGradient id="b1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="rgba(255,255,255,0.6)"/><stop offset="100%" stop-color="rgba(248,192,216,0.3)"/></linearGradient>
        <linearGradient id="b2" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="rgba(255,255,255,0.5)"/><stop offset="100%" stop-color="rgba(216,180,254,0.3)"/></linearGradient>
        <linearGradient id="b3" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="rgba(255,255,255,0.5)"/><stop offset="100%" stop-color="rgba(255,200,170,0.3)"/></linearGradient>
      </defs>
    </svg>`;
    const faviconDataUrl = `data:image/svg+xml,${encodeURIComponent(faviconSvg)}`;

    // Remove any existing favicons
    document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]').forEach(el => el.remove());

    const linkFavicon = document.createElement("link");
    linkFavicon.rel = "icon";
    linkFavicon.type = "image/svg+xml";
    linkFavicon.href = faviconUrl || faviconDataUrl;
    document.head.appendChild(linkFavicon);

    // --- Viewport: prevent iOS auto-zoom on input focus ---
    let metaViewport = document.querySelector('meta[name="viewport"]') as HTMLMetaElement | null;
    if (!metaViewport) {
      metaViewport = document.createElement("meta");
      metaViewport.name = "viewport";
      document.head.appendChild(metaViewport);
    }
    metaViewport.content =
      "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover";

    // --- Web App Manifest (blob URL) ---
    const manifest = {
      name: "Chrono",
      short_name: "Chrono",
      description: "Your productivity companion",
      start_url: "/",
      display: "standalone",
      background_color: "#f5f0eb",
      theme_color: "#c4a882",
      icons: [
        { src: iconUrl, sizes: "512x512", type: "image/png", purpose: "any maskable" },
        { src: icon192Url, sizes: "192x192", type: "image/png", purpose: "any maskable" },
        { src: maskableUrl, sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    };
    const blob = new Blob([JSON.stringify(manifest)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const linkManifest = document.createElement("link");
    linkManifest.rel = "manifest";
    linkManifest.href = url;
    document.head.appendChild(linkManifest);

    // --- Apple Touch Icon ---
    const linkApple = document.createElement("link");
    linkApple.rel = "apple-touch-icon";
    linkApple.href = iconUrl;
    document.head.appendChild(linkApple);

    // --- Theme color meta ---
    let metaTheme = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    if (!metaTheme) {
      metaTheme = document.createElement("meta");
      metaTheme.name = "theme-color";
      document.head.appendChild(metaTheme);
    }
    metaTheme.content = "#c4a882";

    // --- Apple status bar style ---
    let metaStatus = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]') as HTMLMetaElement | null;
    if (!metaStatus) {
      metaStatus = document.createElement("meta");
      metaStatus.name = "apple-mobile-web-app-status-bar-style";
      document.head.appendChild(metaStatus);
    }
    metaStatus.content = "default";

    // --- Apple web-app capable ---
    let metaCapable = document.querySelector('meta[name="apple-mobile-web-app-capable"]') as HTMLMetaElement | null;
    if (!metaCapable) {
      metaCapable = document.createElement("meta");
      metaCapable.name = "apple-mobile-web-app-capable";
      document.head.appendChild(metaCapable);
    }
    metaCapable.content = "yes";

    // --- Page title ---
    document.title = "Chrono — The Smart-EST Calendar";

    // --- Meta description ---
    let metaDesc = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    if (!metaDesc) {
      metaDesc = document.createElement("meta");
      metaDesc.name = "description";
      document.head.appendChild(metaDesc);
    }
    metaDesc.content = "Chrono — The Smart-EST Calendar. A modern productivity app with smart calendar, lists, reminders, news, and an AI assistant.";

    // --- Open Graph tags for link previews ---
    const bannerUrl = `https://${projectId}.supabase.co/storage/v1/object/public/make-d1909ddd-email-assets/chrono-banner-v2.png`;

    const ogTags: Record<string, string> = {
      "og:title": "Chrono — The Smart-EST Calendar",
      "og:description": "A modern productivity app with smart calendar, shared lists, reminders, news, and an AI assistant. Stay organized, effortlessly.",
      "og:type": "website",
      "og:image": bannerUrl,
      "og:site_name": "Chrono",
      "og:url": window.location.href.split('?')[0],
    };
    const ogElements: HTMLMetaElement[] = [];
    for (const [property, content] of Object.entries(ogTags)) {
      let el = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute("property", property);
        document.head.appendChild(el);
        ogElements.push(el);
      }
      el.content = content;
    }

    // --- Twitter Card tags ---
    const twitterTags: Record<string, string> = {
      "twitter:card": "summary_large_image",
      "twitter:title": "Chrono — The Smart-EST Calendar",
      "twitter:description": "A modern productivity app with smart calendar, shared lists, reminders, news, and an AI assistant.",
      "twitter:image": bannerUrl,
    };
    const twitterElements: HTMLMetaElement[] = [];
    for (const [name, content] of Object.entries(twitterTags)) {
      let el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        el.name = name;
        document.head.appendChild(el);
        twitterElements.push(el);
      }
      el.content = content;
    }

    return () => {
      document.head.removeChild(linkManifest);
      document.head.removeChild(linkApple);
      document.head.removeChild(linkFavicon);
      ogElements.forEach(el => { try { document.head.removeChild(el); } catch {} });
      twitterElements.forEach(el => { try { document.head.removeChild(el); } catch {} });
      URL.revokeObjectURL(url);
    };
  }, []);

  // ── Service Worker registration ─────────────────────────────────────────────
  // Second useEffect — kept intentionally separate from the manifest effect so
  // the SW lifecycle is independent of blob-URL creation/revocation.
  //
  // Guards:
  //   • Skips if the browser doesn't support SW at all.
  //   • Skips when running inside an iframe (Figma Make preview, OAuth popups,
  //     embedded demos).  window.top access is wrapped in try/catch because
  //     cross-origin frames throw a SecurityError on that read.
  //   • Defers until after the page `load` event so SW network requests don't
  //     compete with critical resource fetches.
  //   • Catches all registration failures silently with console.debug — SW is
  //     progressive enhancement and Chrono works fully without it.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const isIframe = (() => {
      try { return window !== window.top; } catch { return true; }
    })();
    if (isIframe) return;

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });

        registration.addEventListener("updatefound", () => {
          const incoming = registration.installing;
          if (!incoming) return;
          incoming.addEventListener("statechange", () => {
            if (incoming.state === "installed" && navigator.serviceWorker.controller) {
              console.info("[Chrono SW] Update available — new version waiting.");
            }
          });
        });
      } catch (err) {
        // Non-fatal — common in HTTP origins, restricted environments, iframes.
        console.debug("[Chrono SW] Registration skipped:", err);
      }
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }
  }, []);
}