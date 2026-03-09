/**
 * Asset Manager — uploads app assets (PWA icons, favicon SVG, login banner)
 * to Supabase Storage on first load, then serves them from there.
 *
 * Assets are stored in the public bucket `make-d1909ddd-app-assets`.
 * Once uploaded, the public URLs are cached in localStorage so subsequent
 * loads skip the upload check entirely.
 */

import { uploadAppAsset, getAppAssets } from "./api";

// The build-time asset imports (figma:asset) — these are the sources
import chronoIcon from "figma:asset/b108680d997c87b5fa550902ecfe63e45b4394b6.png";
import splashBg from "figma:asset/01bc91df54c2f640585641427d670f790fedbad5.png";

const LS_KEY = "chrono_app_asset_urls";
const ASSET_VERSION = "v2"; // bump to force re-upload

interface AssetUrls {
  version: string;
  "chrono-icon-512.png"?: string;
  "chrono-icon-192.png"?: string;
  "chrono-icon-maskable-512.png"?: string;
  "chrono-splash-bg.png"?: string;
  "chrono-favicon.svg"?: string;
}

// The expected asset filenames
const ASSET_MANIFEST: { filename: string; sourceUrl: string; contentType: string }[] = [
  { filename: "chrono-icon-512.png", sourceUrl: chronoIcon, contentType: "image/png" },
  { filename: "chrono-icon-192.png", sourceUrl: chronoIcon, contentType: "image/png" },
  { filename: "chrono-icon-maskable-512.png", sourceUrl: chronoIcon, contentType: "image/png" },
  { filename: "chrono-splash-bg.png", sourceUrl: splashBg, contentType: "image/png" },
];

/** Build the inline SVG favicon as a data string for upload */
function buildFaviconSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
    <text x="14" y="50" font-family="Georgia, 'Times New Roman', serif" font-size="52" font-weight="700" fill="#1e1b4b">C</text>
    <circle cx="48" cy="12" r="7" fill="rgba(248,192,216,0.55)" stroke="url(#b1)" stroke-width="1"/>
    <circle cx="46" cy="10" r="1.8" fill="rgba(255,255,255,0.7)"/>
    <circle cx="54" cy="28" r="5" fill="rgba(216,180,254,0.5)" stroke="url(#b2)" stroke-width="0.8"/>
    <circle cx="52.5" cy="26.5" r="1.2" fill="rgba(255,255,255,0.65)"/>
    <circle cx="35" cy="6" r="3.5" fill="rgba(180,210,255,0.45)" stroke="rgba(255,255,255,0.4)" stroke-width="0.6"/>
    <circle cx="34" cy="5" r="0.9" fill="rgba(255,255,255,0.6)"/>
    <circle cx="50" cy="46" r="4" fill="rgba(255,200,170,0.4)" stroke="url(#b3)" stroke-width="0.7"/>
    <circle cx="48.8" cy="44.8" r="1" fill="rgba(255,255,255,0.6)"/>
    <circle cx="42" cy="8" r="2" fill="rgba(248,192,216,0.35)" stroke="rgba(255,255,255,0.3)" stroke-width="0.5"/>
    <defs>
      <linearGradient id="b1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="rgba(255,255,255,0.6)"/><stop offset="100%" stop-color="rgba(248,192,216,0.3)"/></linearGradient>
      <linearGradient id="b2" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="rgba(255,255,255,0.5)"/><stop offset="100%" stop-color="rgba(216,180,254,0.3)"/></linearGradient>
      <linearGradient id="b3" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="rgba(255,255,255,0.5)"/><stop offset="100%" stop-color="rgba(255,200,170,0.3)"/></linearGradient>
    </defs>
  </svg>`;
}

/** Convert a URL to base64 data URL */
async function urlToBase64(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Get cached asset URLs from localStorage */
function getCachedUrls(): AssetUrls | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AssetUrls;
    if (parsed.version !== ASSET_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Save asset URLs to localStorage */
function saveCachedUrls(urls: AssetUrls) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(urls));
  } catch {}
}

/**
 * Ensure all app assets are uploaded to Supabase Storage.
 * Returns a map of filename → public URL.
 * Uses localStorage cache to avoid redundant uploads/checks.
 */
export async function ensureAppAssets(): Promise<AssetUrls> {
  // Check localStorage cache first
  const cached = getCachedUrls();
  if (cached) {
    const allPresent = ASSET_MANIFEST.every(
      (a) => cached[a.filename as keyof AssetUrls]
    );
    if (allPresent && cached["chrono-favicon.svg"]) {
      return cached;
    }
  }

  try {
    // Check what's already in storage
    const { assets: existing } = await getAppAssets();
    const urls: AssetUrls = { version: ASSET_VERSION };

    // Upload missing raster assets
    for (const asset of ASSET_MANIFEST) {
      if (existing[asset.filename]) {
        (urls as any)[asset.filename] = existing[asset.filename];
        continue;
      }
      try {
        const base64 = await urlToBase64(asset.sourceUrl);
        const result = await uploadAppAsset(asset.filename, base64, asset.contentType);
        (urls as any)[asset.filename] = result.url;
      } catch (e) {
        console.warn(`[AssetManager] Failed to upload ${asset.filename}:`, e);
      }
    }

    // Upload favicon SVG
    if (!existing["chrono-favicon.svg"]) {
      try {
        const svgContent = buildFaviconSvg();
        const svgBase64 = `data:image/svg+xml;base64,${btoa(svgContent)}`;
        const result = await uploadAppAsset("chrono-favicon.svg", svgBase64, "image/svg+xml");
        urls["chrono-favicon.svg"] = result.url;
      } catch (e) {
        console.warn("[AssetManager] Failed to upload favicon:", e);
      }
    } else {
      urls["chrono-favicon.svg"] = existing["chrono-favicon.svg"];
    }

    saveCachedUrls(urls);
    return urls;
  } catch (e) {
    console.warn("[AssetManager] ensureAppAssets failed:", e);
    // Return fallback with build-time URLs
    return {
      version: ASSET_VERSION,
      "chrono-icon-512.png": chronoIcon,
      "chrono-icon-192.png": chronoIcon,
      "chrono-icon-maskable-512.png": chronoIcon,
      "chrono-splash-bg.png": splashBg,
    };
  }
}

/** Quick synchronous read from cache — used for initial render before async resolves */
export function getCachedAssetUrls(): AssetUrls | null {
  return getCachedUrls();
}

// Re-export the build-time imports so components can use them as fallbacks
export { chronoIcon, splashBg };
