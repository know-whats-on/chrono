/**
 * Renders the VocaIcon SVG to an offscreen canvas and returns PNG data-URLs
 * for use as PWA home-screen icons (apple-touch-icon + manifest icons).
 *
 * Because iOS / Android "Add to Home Screen" requires raster images, we
 * serialize the full SVG (with filters, blobs, clip-paths, and all vector
 * paths) into an <img>, draw it onto a <canvas>, and export PNGs.
 */
import svgPaths from "../../imports/svg-4f52i8e6xp";

const PATH_KEYS: (keyof typeof svgPaths)[] = [
  "p3e004800", "p26487000", "p76a4180", "p11e7e200", "p61345b0",
  "p33d73400", "p1addf80", "p145cc000", "p32784480", "p1e99fb00",
  "pba4f200", "pa59e130", "p34a96080", "p264fa00", "p25903c00",
  "p272d0972", "p31ad8200", "pb567800", "p49a99b0", "p2531ef80",
  "p2cc4ca00", "p2cafab00", "pa473580", "p22df2c00", "p344a4280",
  "p9562e80", "p18023280", "p1eab800", "pd53ea00", "p2ecb27f2",
];

function buildSvgString(): string {
  const vectorPaths = PATH_KEYS.map(
    (k) => `<path d="${svgPaths[k]}" fill="white"/>`
  ).join("\n");

  // Full self-contained SVG with inline filter defs — no CSS variables
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080" fill="none">
  <g clip-path="url(#c0)">
    <rect width="1080" height="1080" rx="120" fill="black"/>
    <g filter="url(#f0)"><circle cx="322.5" cy="965.5" r="404.5" fill="#6B4BC8"/></g>
    <g filter="url(#f1)"><circle cx="1144" cy="78" r="471" fill="#904498"/></g>
    <g filter="url(#f2)"><ellipse cx="135.5" cy="171" rx="513.5" ry="514" fill="#DE6231"/></g>
    <g filter="url(#f3)"><circle cx="1159" cy="1017" r="456" fill="#CA3C43"/></g>
    <g filter="url(#f4)"><ellipse cx="623" cy="660.5" rx="316" ry="315.5" fill="#6B4BC8"/></g>
    <g filter="url(#f5)"><g>${vectorPaths}</g></g>
  </g>
  <rect x="20.5" y="20.5" width="1039" height="1039" rx="99.5" stroke="white" stroke-width="41"/>
  <defs>
    <filter id="f0" x="-376" y="267" width="1397" height="1397" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feFlood flood-opacity="0" result="bg"/><feBlend in="SourceGraphic" in2="bg" result="s"/>
      <feGaussianBlur in="s" stdDeviation="147"/>
    </filter>
    <filter id="f1" x="379" y="-687" width="1530" height="1530" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feFlood flood-opacity="0" result="bg"/><feBlend in="SourceGraphic" in2="bg" result="s"/>
      <feGaussianBlur in="s" stdDeviation="147"/>
    </filter>
    <filter id="f2" x="-672" y="-637" width="1615" height="1616" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feFlood flood-opacity="0" result="bg"/><feBlend in="SourceGraphic" in2="bg" result="s"/>
      <feGaussianBlur in="s" stdDeviation="147"/>
    </filter>
    <filter id="f3" x="409" y="267" width="1500" height="1500" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feFlood flood-opacity="0" result="bg"/><feBlend in="SourceGraphic" in2="bg" result="s"/>
      <feGaussianBlur in="s" stdDeviation="147"/>
    </filter>
    <filter id="f4" x="13" y="51" width="1220" height="1219" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feFlood flood-opacity="0" result="bg"/><feBlend in="SourceGraphic" in2="bg" result="s"/>
      <feGaussianBlur in="s" stdDeviation="147"/>
    </filter>
    <filter id="f5" x="-71.998" y="-6" width="1187.68" height="1093" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feFlood flood-opacity="0" result="bg"/>
      <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="ha"/>
      <feGaussianBlur stdDeviation="95"/>
      <feComposite in2="ha" operator="out"/>
      <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.9 0"/>
      <feBlend in2="bg" result="ds"/>
      <feBlend in="SourceGraphic" in2="ds" result="shape"/>
    </filter>
    <clipPath id="c0"><rect width="1080" height="1080" rx="120" fill="white"/></clipPath>
  </defs>
</svg>`;
}

/**
 * Renders the VocaIcon SVG at the given pixel size and returns a PNG data-URL.
 * Returns a Promise that resolves once the image has been drawn.
 */
function renderToDataUrl(size: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const svgStr = buildSvgString();
    const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to render VocaIcon SVG to canvas"));
    };
    img.src = url;
  });
}

/**
 * Generate icon PNGs and inject them into <head> as:
 *  - <link rel="apple-touch-icon">
 *  - <link rel="manifest"> (with inline icon data-urls)
 */
export async function injectPwaIcons(): Promise<void> {
  try {
    const [png512, png192] = await Promise.all([
      renderToDataUrl(512),
      renderToDataUrl(192),
    ]);

    // Apple touch icon
    let appleLink = document.querySelector(
      'link[rel="apple-touch-icon"]'
    ) as HTMLLinkElement | null;
    if (!appleLink) {
      appleLink = document.createElement("link");
      appleLink.rel = "apple-touch-icon";
      document.head.appendChild(appleLink);
    }
    appleLink.href = png512;

    // Web App Manifest with embedded icon data-URLs
    // Remove old manifest if present so we can replace it
    const oldManifest = document.querySelector('link[rel="manifest"]');
    if (oldManifest) oldManifest.remove();

    const manifest = {
      name: "Voca",
      short_name: "Voca",
      description: "Oral Assessment Platform",
      start_url: "/",
      display: "standalone",
      background_color: "#f7f7f8",
      theme_color: "#6B4BC8",
      icons: [
        { src: png512, sizes: "512x512", type: "image/png", purpose: "any" },
        { src: png512, sizes: "512x512", type: "image/png", purpose: "maskable" },
        { src: png192, sizes: "192x192", type: "image/png", purpose: "any" },
      ],
    };
    const manifestBlob = new Blob([JSON.stringify(manifest)], {
      type: "application/json",
    });
    const manifestLink = document.createElement("link");
    manifestLink.rel = "manifest";
    manifestLink.href = URL.createObjectURL(manifestBlob);
    document.head.appendChild(manifestLink);
  } catch (err) {
    console.warn("[VocaIcon] Failed to generate PWA icons:", err);
  }
}
