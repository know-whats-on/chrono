import React, { useEffect } from "react";
import { RouterProvider } from "react-router";
import { router } from "./routes";
import { Toaster } from "sonner";
import { AuthProvider } from "./context/AuthContext";
import { startAnimatedFavicon } from "./utils/animatedFavicon";
import { injectPwaIcons } from "./utils/generateAppIcon";

export default function App() {
  // Force-set viewport to prevent all zoom on mobile (app-like behavior)
  useEffect(() => {
    let meta = document.querySelector('meta[name="viewport"]') as HTMLMetaElement | null;
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "viewport";
      document.head.appendChild(meta);
    }
    meta.content =
      "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no";

    // ── PWA: generate raster icons from VocaIcon SVG ──
    // Renders the Figma VocaIcon (with gradient blobs + V-logo) to canvas,
    // then injects apple-touch-icon + manifest with PNG data-URLs
    injectPwaIcons();

    // Animated favicon — V-logo with pulsing soundwave bars in the browser tab
    const stopFavicon = startAnimatedFavicon();

    // Mobile web app capable meta tags
    if (!document.querySelector('meta[name="mobile-web-app-capable"]')) {
      const capable = document.createElement("meta");
      capable.name = "mobile-web-app-capable";
      capable.content = "yes";
      document.head.appendChild(capable);
    }
    if (!document.querySelector('meta[name="apple-mobile-web-app-capable"]')) {
      const appleCap = document.createElement("meta");
      appleCap.name = "apple-mobile-web-app-capable";
      appleCap.content = "yes";
      document.head.appendChild(appleCap);
    }
    if (!document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')) {
      const barStyle = document.createElement("meta");
      barStyle.name = "apple-mobile-web-app-status-bar-style";
      barStyle.content = "black-translucent";
      document.head.appendChild(barStyle);
    }
    if (!document.querySelector('meta[name="theme-color"]')) {
      const themeColor = document.createElement("meta");
      themeColor.name = "theme-color";
      themeColor.content = "#6B4BC8";
      document.head.appendChild(themeColor);
    }

    return () => {
      stopFavicon();
    };
  }, []);

  return (
    <AuthProvider>
      <RouterProvider router={router} />
      <Toaster position="top-center" />
    </AuthProvider>
  );
}
