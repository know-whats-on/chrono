export interface FormattedDescription {
  text: string;
  meta: Record<string, string>;
}

/**
 * Clean ICS escape sequences from a string.
 * Handles: \, → ,   \; → ;   \\ → \   \n → newline   \r → removed
 */
export function cleanIcsEscapes(val: string): string {
  return val
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "")
    .replace(/\\t/g, " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\:/g, ":")
    .replace(/\\\\/g, "\\");
}

/**
 * Format a raw email recipient string into a clean, readable form.
 * "Tim Luckett <Tim.Luckett@uts.edu.au>; Mary Roberts (Western Sydney LHD) <mary.roberts@health.nsw.gov.au>"
 *  → "Tim Luckett; Mary Roberts (Western Sydney LHD)"
 * If there's no angle-bracket name, fall back to just the email.
 */
function formatRecipients(raw: string): string {
  // Split on semicolons (common in email To/CC fields)
  const parts = raw.split(/\s*;\s*/);
  const cleaned = parts.map((part) => {
    const trimmed = part.trim();
    if (!trimmed) return "";

    // Pattern: Name <email> or Name (Org) <email>
    const match = trimmed.match(/^(.+?)\s*<[^>]+>\s*$/);
    if (match) {
      return match[1].trim();
    }

    // Pattern: <email> only — show email without brackets
    const emailOnly = trimmed.match(/^<([^>]+)>\s*$/);
    if (emailOnly) {
      return emailOnly[1];
    }

    return trimmed;
  }).filter(Boolean);

  return cleaned.join("; ");
}

export function formatEventDescription(raw: string | null | undefined): FormattedDescription {
  if (!raw) return { text: "", meta: {} };

  let text = raw;

  // 1. Normalize literal escape sequences
  text = cleanIcsEscapes(text);

  // 2. Handle ICS style folding (newline followed by space)
  text = text.replace(/\n /g, "");

  // 3. Collapse long divider lines
  text = text.replace(/_{10,}/g, "\n");
  text = text.replace(/-{10,}/g, "\n");

  // 4. Extract Meta Fields
  // We look for lines starting with specific keywords.
  // Multi-line values: continuation lines that don't start with a known field
  // are appended to the previous field's value.
  const meta: Record<string, string> = {};
  const fields = ["From", "To", "CC", "Subject", "Sent", "When", "Where", "Date", "Organizer", "Attendees", "Importance"];
  const fieldRegexes = fields.map((f) => ({
    field: f,
    regex: new RegExp(`^${f}\\s*:\\s*(.*)`, "i"),
  }));

  const lines = text.split("\n");
  const cleanLines: string[] = [];
  let currentMetaKey: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      // Empty line resets meta continuation
      currentMetaKey = null;
      cleanLines.push(line);
      continue;
    }

    let matched = false;
    for (const { field, regex } of fieldRegexes) {
      const match = line.match(regex);
      if (match) {
        const key = field.charAt(0).toUpperCase() + field.slice(1).toLowerCase();
        meta[key] = match[1].trim();
        currentMetaKey = key;
        matched = true;
        break;
      }
    }

    // Check for continuation of a multi-line meta value
    // A continuation line doesn't start with a known field prefix and doesn't look
    // like body text (it comes right after a meta field without a blank line gap)
    if (!matched && currentMetaKey) {
      // If this line looks like it continues the previous meta value
      // (e.g. wrapped email address, long subject), append it
      const looksLikeMetaContinuation =
        // Contains email-like content (angle brackets, @)
        /[<>@]/.test(line) ||
        // Starts with lowercase or special chars (continuation)
        /^[a-z<(]/.test(line) ||
        // Short fragment that continues previous value
        (line.length < 80 && !line.includes(":"));

      if (looksLikeMetaContinuation) {
        meta[currentMetaKey] = (meta[currentMetaKey] + " " + line).trim();
        matched = true;
      } else {
        currentMetaKey = null;
      }
    }

    // Strip "Forwarded message" headers
    if (!matched && line.match(/^[-]*\s*Forwarded message\s*[-]*$/i)) {
      matched = true;
    }

    if (!matched) {
      currentMetaKey = null;
      cleanLines.push(lines[i]);
    }
  }

  // 5. Post-process meta values
  // Clean up recipients in From/To/CC fields
  for (const key of ["From", "To", "Cc"]) {
    if (meta[key]) {
      meta[key] = formatRecipients(meta[key]);
    }
  }

  // Clean any remaining ICS escapes in meta values
  for (const key of Object.keys(meta)) {
    if (meta[key]) {
      meta[key] = meta[key]
        .replace(/\\,/g, ",")
        .replace(/\\;/g, ";")
        .replace(/\\\\/g, "\\")
        .trim();
    }
  }

  // Clean "Where" entries the same way as location
  if (meta["Where"]) {
    meta["Where"] = meta["Where"]
      .replace(/\\,/g, ",")
      .replace(/\\;/g, ";")
      .trim();
  }

  text = cleanLines.join("\n");

  // 6. Trim excessive whitespace
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.trim();

  return { text, meta };
}