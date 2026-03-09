/**
 * Copy text to clipboard with fallback for environments where the
 * Clipboard API is blocked by a permissions policy (e.g. iframes).
 */
export async function copyToClipboard(text: string): Promise<void> {
  // Try the modern Clipboard API first
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Clipboard API blocked – fall through to legacy approach
    }
  }

  // Fallback: hidden textarea + execCommand
  const textarea = document.createElement("textarea");
  textarea.value = text;
  // Prevent scrolling
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "-9999px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
}
