import React from "react";

// ── Keyword category colors ────────────────────────────────────
// Each category gets a distinct underline + subtle text tint so
// users can learn which words triggered which intent.

const COLORS = {
  event:        "underline decoration-2 underline-offset-2 decoration-blue-400/70 text-blue-300",
  reminder:     "underline decoration-2 underline-offset-2 decoration-emerald-400/70 text-emerald-300",
  availability: "underline decoration-2 underline-offset-2 decoration-violet-400/70 text-violet-300",
  temporal:     "underline decoration-2 underline-offset-2 decoration-amber-400/70 text-amber-300",
  task:         "underline decoration-2 underline-offset-2 decoration-rose-400/70 text-rose-300",
} as const;

type Category = keyof typeof COLORS;

// ── Keyword dictionaries ──────────────────────────────────────
// Each entry is [regex-source (case-insensitive), category].
// Order matters: longer / more-specific patterns first to avoid
// partial matches being consumed by shorter ones.

const KEYWORD_PATTERNS: [string, Category][] = [
  // ── Reminder triggers ──
  ["remind\\s+me\\s+to",           "reminder"],
  ["don'?t\\s+forget\\s+to",      "reminder"],
  ["don'?t\\s+let\\s+me\\s+forget","reminder"],
  ["remember\\s+to",              "reminder"],
  ["make\\s+sure\\s+(?:i|we)",    "reminder"],
  ["note\\s+to\\s+self",          "reminder"],
  ["to-?do",                      "reminder"],
  ["heads\\s+up\\s+about",        "reminder"],
  ["set\\s+(?:a\\s+)?reminder",   "reminder"],

  // ── Availability triggers (multi-word first) ──
  ["when\\s+can\\s+(?:i|we)",          "availability"],
  ["do\\s+i\\s+have\\s+time",          "availability"],
  ["any\\s+(?:gaps?|openings?|slots?)", "availability"],
  ["what'?s\\s+(?:on|happening)",      "availability"],
  ["what\\s+do\\s+i\\s+have",          "availability"],
  ["am\\s+i\\s+(?:booked|busy|free)",  "availability"],
  ["when'?s\\s+my\\s+next",           "availability"],
  ["anything\\s+on",                   "availability"],
  ["plans?\\s+for",                    "availability"],
  ["calendar\\s+for",                  "availability"],
  ["check\\s+(?:my\\s+)?(?:calendar|schedule|diary)", "availability"],
  ["look\\s+(?:at|up)\\s+(?:my\\s+)?(?:calendar|schedule)", "availability"],
  ["availability",                     "availability"],
  ["available",                        "availability"],
  ["free\\s+slot",                     "availability"],
  ["open\\s+slot",                     "availability"],
  ["find\\s+(?:a\\s+)?(?:time|slot|gap|opening)", "availability"],
  ["find\\s+\\d+\\s*(?:min(?:ute)?s?|hrs?|hours?)", "availability"],

  // ── Task-like activity triggers (before event triggers so they take priority) ──
  ["laundry",               "task"],
  ["dishes",                "task"],
  ["vacuuming",             "task"],
  ["mopping",               "task"],
  ["sweeping",              "task"],
  ["dusting",               "task"],
  ["ironing",               "task"],
  ["cleaning",              "task"],
  ["declutter(?:ing)?",     "task"],
  ["tidying",               "task"],
  ["trash",                 "task"],
  ["garbage",               "task"],
  ["recycling",             "task"],
  ["compost",               "task"],
  ["meal\\s+prep",          "task"],
  ["cook(?:ing)?\\b",       "task"],
  ["bak(?:e|ing)\\b",       "task"],
  ["defrost(?:ing)?",       "task"],
  ["homework",              "task"],
  ["assignment",            "task"],
  ["proofread(?:ing)?",     "task"],
  ["research(?:ing)?\\b",   "task"],
  ["journal(?:ing)?\\b",    "task"],
  ["meditat(?:e|ing|ion)",  "task"],
  ["stretch(?:ing)?\\b",    "task"],
  ["skincare",              "task"],
  ["sunscreen",             "task"],
  ["floss(?:ing)?",         "task"],
  ["pay\\s+(?:the\\s+)?(?:bills?|rent|utilities)", "task"],
  ["email(?:ing)?\\s+",     "task"],
  ["text(?:ing)?\\s+(?!\\S*(?:with|w)\\s)", "task"],
  ["unsubscrib(?:e|ing)",   "task"],
  ["backup(?:ing)?\\b",     "task"],
  ["download(?:ing)?\\b",   "task"],
  ["upload(?:ing)?\\b",     "task"],
  ["restock(?:ing)?",       "task"],
  ["unpack(?:ing)?",        "task"],

  // ── Event triggers — scheduling verbs ──
  ["schedule\\s+(?:a\\s+)?",   "event"],
  ["book\\s+(?:a\\s+)?",       "event"],
  ["add\\s+(?:a\\s+|an\\s+)?", "event"],
  ["create\\s+(?:a\\s+|an\\s+)?(?:event|meeting|call|appointment)", "event"],
  ["set\\s+up\\s+(?:a\\s+)?",  "event"],
  ["arrange\\s+(?:a\\s+)?",    "event"],
  ["organize\\s+(?:a\\s+)?",   "event"],
  ["plan\\s+(?:a\\s+)?",       "event"],
  ["put\\s+(?:in|on)\\s+(?:my\\s+)?(?:calendar|diary|schedule)", "event"],
  ["pencil\\s+in",             "event"],
  ["block\\s+(?:off?\\s+)?(?:time|calendar)", "event"],

  // ── Event triggers — professional / meetings (multi-word) ──
  ["stand-?up",        "event"],
  ["kick-?off",        "event"],
  ["all-?hands",       "event"],
  ["town\\s+hall",     "event"],
  ["team\\s+building", "event"],
  ["one-?on-?one",     "event"],
  ["1[:-]on[:-]1",     "event"],
  ["1[:-]1\\b",        "event"],
  ["happy\\s+hour",    "event"],
  ["sprint\\s+(?:planning|review|retro)", "event"],
  ["daily\\s+(?:scrum|standup|sync)",     "event"],

  // ── Event triggers — health / medical ──
  ["doctor'?s?\\s+(?:appointment|appt|visit)", "event"],
  ["dentist'?s?\\s+(?:appointment|appt|visit)","event"],
  ["check-?up",       "event"],
  ["check\\s+up",     "event"],
  ["flu\\s+shot",     "event"],
  ["blood\\s+(?:test|work)", "event"],
  ["lab\\s+work",     "event"],

  // ── Event triggers — single words / short ──
  ["meeting",          "event"],
  ["appointment",      "event"],
  ["appt",             "event"],
  ["interview",        "event"],
  ["orientation",      "event"],
  ["onboarding",       "event"],
  ["sync\\b",          "event"],
  ["huddle",           "event"],
  ["catch-?up",        "event"],
  ["check-?in",        "event"],
  ["retro\\b",         "event"],
  ["demo\\b",          "event"],
  ["review\\b",        "event"],
  ["offsite",          "event"],
  ["workshop",         "event"],
  ["webinar",          "event"],
  ["conference",       "event"],
  ["summit",           "event"],
  ["seminar",          "event"],

  // ── Event triggers — actions / errands ──
  ["go\\s+to",        "event"],
  ["head\\s+to",      "event"],
  ["go\\s+for",       "event"],
  ["swing\\s+by",     "event"],
  ["stop\\s+by",      "event"],
  ["pop\\s+(?:in|into|over)", "event"],
  ["drop\\s+by",      "event"],
  ["run\\s+to",       "event"],
  ["pick\\s+up",      "event"],
  ["drop\\s+off",     "event"],
  ["grab\\b",         "event"],
  ["fetch\\b",        "event"],
  ["collect\\b",      "event"],
  ["deliver\\b",      "event"],
  ["return\\s+(?:the|my)", "event"],
  ["visit",           "event"],
  ["attend",          "event"],

  // ── Event triggers — health single words ──
  ["dentist",         "event"],
  ["doctor",          "event"],
  ["doc\\b",          "event"],
  ["GP\\b",           "event"],
  ["vet\\b",          "event"],
  ["physio",          "event"],
  ["chiro",           "event"],
  ["therapist",       "event"],
  ["therapy",         "event"],
  ["counsell?or",     "event"],
  ["psychiatrist",    "event"],
  ["dermatologist",   "event"],
  ["optometrist",     "event"],
  ["specialist",      "event"],
  ["surgeon",         "event"],
  ["hospital",        "event"],
  ["clinic",          "event"],
  ["vaccination",     "event"],
  ["vaccine",         "event"],
  ["vaccinated",      "event"],
  ["jab\\b",          "event"],
  ["booster",         "event"],
  ["MRI\\b",          "event"],
  ["X-?ray",          "event"],
  ["ultrasound",      "event"],
  ["scan\\b",         "event"],
  ["physical\\b",     "event"],

  // ── Event triggers — education ──
  ["class\\b",        "event"],
  ["lecture",         "event"],
  ["tutorial",        "event"],
  ["tute\\b",         "event"],
  ["lab\\b",          "event"],
  ["exam\\b",         "event"],
  ["test\\b",         "event"],
  ["quiz\\b",         "event"],
  ["study\\s+(?:group|session)", "event"],
  ["tutoring",        "event"],
  ["training",        "event"],
  ["course\\b",       "event"],
  ["lesson",          "event"],

  // ── Event triggers — fitness / sports ──
  ["gym\\b",          "event"],
  ["workout",         "event"],
  ["work\\s+out",     "event"],
  ["yoga",            "event"],
  ["pilates",         "event"],
  ["cross-?fit",      "event"],
  ["PT\\s+session",   "event"],
  ["personal\\s+training", "event"],
  ["spin\\s+class",   "event"],
  ["swim\\b",         "event"],
  ["tennis",          "event"],
  ["basketball",      "event"],
  ["soccer",          "event"],
  ["football",        "event"],
  ["cricket",         "event"],
  ["netball",         "event"],
  ["hockey",          "event"],
  ["rugby",           "event"],
  ["practice",        "event"],
  ["rehearsal",       "event"],
  ["scrimmage",       "event"],
  ["tournament",      "event"],
  ["match\\b",        "event"],
  ["game\\b",         "event"],

  // ── Event triggers — entertainment ──
  ["concert",         "event"],
  ["gig\\b",          "event"],
  ["show\\b",         "event"],
  ["movie",           "event"],
  ["film\\b",         "event"],
  ["play\\b",         "event"],
  ["musical",         "event"],
  ["theatre",         "event"],
  ["theater",         "event"],
  ["exhibition",      "event"],
  ["gallery",         "event"],
  ["museum",          "event"],
  ["recital",         "event"],
  ["performance",     "event"],
  ["festival",        "event"],
  ["zoo\\b",          "event"],
  ["aquarium",        "event"],

  // ── Event triggers — life events ──
  ["party",           "event"],
  ["celebration",     "event"],
  ["birthday",        "event"],
  ["anniversary",     "event"],
  ["wedding",         "event"],
  ["funeral",         "event"],
  ["graduation",      "event"],
  ["ceremony",        "event"],
  ["reception",       "event"],
  ["housewarming",    "event"],
  ["baby\\s+shower",  "event"],
  ["engagement",      "event"],
  ["BBQ\\b",          "event"],
  ["barbecue",        "event"],
  ["potluck",         "event"],

  // ── Event triggers — travel ──
  ["flight",          "event"],
  ["fly\\s+to",       "event"],
  ["fly\\s+out",      "event"],
  ["airport",         "event"],
  ["road\\s+trip",    "event"],
  ["drive\\s+to",     "event"],
  ["layover",         "event"],
  ["check-?out",      "event"],

  // ── Event triggers — errands / services ──
  ["haircut",         "event"],
  ["hair\\s+appointment", "event"],
  ["oil\\s+change",   "event"],
  ["car\\s+(?:service|wash)", "event"],
  ["dry\\s+clean(?:ing|ers?)", "event"],
  ["grocery",         "event"],
  ["shopping",        "event"],
  ["pharmacy",        "event"],
  ["bank\\b",         "event"],
  ["post\\s+office",  "event"],
  ["notary",          "event"],
  ["lawyer",          "event"],
  ["accountant",      "event"],
  ["inspection",      "event"],

  // ── Event triggers — social / meals ──
  ["lunch",           "event"],
  ["dinner",          "event"],
  ["breakfast",       "event"],
  ["brunch",          "event"],
  ["coffee",          "event"],
  ["drinks?\\b",      "event"],
  ["supper",          "event"],
  ["hangout",         "event"],
  ["hang\\s+out",     "event"],
  ["date\\s+night",   "event"],
  ["girls'?\\s+night","event"],
  ["boys'?\\s+night", "event"],
  ["night\\s+out",    "event"],

  // ── Event triggers — work ──
  ["shift\\b",        "event"],
  ["on\\s+call",      "event"],
  ["clock\\s+in",     "event"],
  ["my\\s+shift",     "event"],

  // ── Event triggers — communication ──
  ["talk\\s+(?:to|with)",  "event"],
  ["speak\\s+(?:to|with)", "event"],
  ["chat\\s+(?:with|w)\\s","event"],
  ["text\\s+",         "event"],
  ["phone\\b",        "event"],
  ["ring\\b",          "event"],
  ["facetime\\b",      "event"],
  ["zoom\\s+(?:with|w)","event"],
  ["skype\\b",         "event"],

  // ── Recurring patterns ──
  ["every\\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|day|weekday|week|month|year)", "event"],

  // ── Event prefix verbs ──
  ["(?:i\\s+)?(?:need|have|want|got|gotta)\\s+to", "event"],
  ["meet\\b",         "event"],
  ["call\\b",         "event"],

  // ── Temporal references ──
  ["today",                      "temporal"],
  ["tonight",                    "temporal"],
  ["tomorrow",                   "temporal"],
  ["yesterday",                  "temporal"],
  ["this\\s+(?:morning|afternoon|evening|weekend|week|month)", "temporal"],
  ["next\\s+(?:week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday)", "temporal"],
  ["last\\s+(?:week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)", "temporal"],
  ["monday",                     "temporal"],
  ["tuesday",                    "temporal"],
  ["wednesday",                  "temporal"],
  ["thursday",                   "temporal"],
  ["friday",                     "temporal"],
  ["saturday",                   "temporal"],
  ["sunday",                     "temporal"],
  ["end\\s+of\\s+(?:week|month|day)", "temporal"],
  ["(?:EOD|EOW|COB|ASAP)\\b",   "temporal"],
  ["morning",                    "temporal"],
  ["afternoon",                  "temporal"],
  ["evening",                    "temporal"],
  ["(?:on\\s+)?the\\s+\\d+(?:st|nd|rd|th)", "temporal"],
  ["(?:in\\s+)?\\d+\\s+(?:min(?:ute)?s?|hours?|hrs?|days?|weeks?)", "temporal"],
  ["\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)", "temporal"],
  ["at\\s+\\d{1,2}(?::\\d{2})?(?:\\s*(?:am|pm))?", "temporal"],
  ["from\\s+\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)?\\s+to\\s+\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)?", "temporal"],
  ["for\\s+\\d+\\s*(?:min(?:ute)?s?|hours?|hrs?)", "temporal"],
];

// Pre-compile all patterns
const COMPILED_PATTERNS: { regex: RegExp; category: Category }[] =
  KEYWORD_PATTERNS.map(([src, cat]) => ({
    regex: new RegExp(`\\b${src}`, "gi"),
    category: cat,
  }));

interface MatchSpan {
  start: number;
  end: number;
  category: Category;
}

/**
 * Find all keyword matches in the text, returning non-overlapping spans
 * (longer matches take priority).
 */
function findMatches(text: string): MatchSpan[] {
  const allMatches: MatchSpan[] = [];

  for (const { regex, category } of COMPILED_PATTERNS) {
    regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      allMatches.push({
        start: m.index,
        end: m.index + m[0].length,
        category,
      });
    }
  }

  // Sort by start position, then by length descending (prefer longer matches)
  allMatches.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));

  // Remove overlapping spans — keep longer / earlier ones
  const merged: MatchSpan[] = [];
  let lastEnd = -1;
  for (const span of allMatches) {
    if (span.start >= lastEnd) {
      merged.push(span);
      lastEnd = span.end;
    }
  }

  return merged;
}

/**
 * Render a query string with color-underlined keyword highlights.
 * Returns JSX elements — highlighted spans use colored underlines so the
 * user can see exactly which words triggered intent detection.
 */
export function highlightQuery(text: string): React.ReactNode {
  const matches = findMatches(text);
  if (matches.length === 0) return text;

  const parts: React.ReactNode[] = [];
  let cursor = 0;

  for (let i = 0; i < matches.length; i++) {
    const { start, end, category } = matches[i];
    // Plain text before this match
    if (start > cursor) {
      parts.push(<span key={`t-${cursor}`}>{text.slice(cursor, start)}</span>);
    }
    // Highlighted span
    parts.push(
      <span key={`h-${start}`} className={COLORS[category]}>
        {text.slice(start, end)}
      </span>
    );
    cursor = end;
  }

  // Remaining text after last match
  if (cursor < text.length) {
    parts.push(<span key={`t-${cursor}`}>{text.slice(cursor)}</span>);
  }

  return <span>{parts}</span>;
}