import { DateTime } from "luxon";
import * as chrono from "chrono-node";

// ── Types ──────────────────────────────────────────────────────

export interface ActionableDetection {
  subject: string;
  triggers: { word: string; start: number; end: number }[];
  suggestTask: boolean;
  suggestReminder: boolean;
  suggestCounter: boolean;
  suggestNote?: boolean;
  dateHint?: string;
}

// ── Travel / Trip Intent Detection ──────────────────────────────

export function detectTravelIntent(query: string): { destination: string } | null {
  // Common non-travel destinations that should NOT trigger trip planning
  const NON_TRAVEL_RE = /^(?:the\s+)?(?:gym|store|office|work|school|class|doctor|dentist|hospital|bank|pharmacy|mall|market|supermarket|grocery|barber|salon|vet|mechanic|library|church|mosque|temple|synagogue|park|pool|beach|movies?|theater|theatre|restaurant|café|cafe|bar|pub|club|laundromat|post\s+office|airport|station|bus\s+stop|meeting|appointment|interview|game|practice|rehearsal|shower|bed|sleep|bathroom|kitchen|shop|dinner|lunch|breakfast|brunch|happy\s+hour|drinks?|get\s+.+|eat|run|run\s+.+|walk|swim|hike|cook|clean|study|read|do\s+.+)$/i;

  const patterns: RegExp[] = [
    /(?:i'?m|we'?re|i\s+am|we\s+are)\s+(?:going\s+to|heading\s+to|traveling\s+to|travelling\s+to|visiting|flying\s+to|driving\s+to|taking\s+a\s+trip\s+to|off\s+to|leaving\s+for)\s+(.+)/i,
    /(?:trip|vacation|holiday|getaway|visit|travel(?:ling|ing)?)\s+(?:to|in)\s+(.+)/i,
    /(?:planning|booked|booking|going\s+on)\s+(?:a\s+)?(?:trip|vacation|holiday|getaway|visit)\s+(?:to|in)\s+(.+)/i,
    /(?:heading|off|going)\s+(?:to|for|out\s+to)\s+(.+?)\s+(?:this|next|for|on)\s+/i,
    /(?:can|could)\s+(?:you\s+)?(?:help\s+(?:me\s+)?)?(?:plan|organize|book|arrange)\s+(?:a\s+)?(?:trip|vacation|holiday|visit)\s+(?:to|in)\s+(.+)/i,
    /(?:what\s+are\s+some\s+good\s+places\s+(?:to\s+)?(?:visit|see|eat\s+at|stay)\s+in)\s+(.+)/i,
    /(?:i\s+want\s+to\s+go\s+to)\s+(.+?)\s+(?:this|next|for|on)\s+/i,
    /(?:looking\s+for\s+(?:recommendations|things\s+to\s+do|places\s+to\s+go)\s+(?:in|for))\s+(.+)/i,
    /(?:my\s+upcoming\s+(?:trip|vacation)\s+to)\s+(.+)/i,
    /(?:itinerary\s+for)\s+(.+)/i,
    /(?:spending\s+(?:the\s+weekend|a\s+few\s+days|a\s+week)\s+in)\s+(.+)/i,
  ];
  for (const re of patterns) {
    const m = query.match(re);
    if (m && m[1]) {
      let dest = m[1].trim()
        .replace(/[.!?,]+$/, "")
        .replace(/\s+(?:this|next|for|on|tomorrow|tonight|soon|later|today).*$/i, "")
        .replace(/\s+in\s+(?:(?:a\s+)?(?:few\s+)?\d*\s*(?:days?|weeks?|months?|years?|hours?)|(?:january|february|march|april|may|june|july|august|september|october|november|december|spring|summer|fall|autumn|winter|the\s+(?:morning|afternoon|evening|new\s+year))).*$/i, "")
        .replace(/\s+to\s+(?:see|visit|explore|attend|check\s+out|do|watch|try|eat|meet|have|go|celebrate|experience|tour|grab|buy|get|find|shop|pick\s+up|drop\s+off).*$/i, "")
        .replace(/^(?:my\s+)?(?:parents|family|friends|relatives|grandparents|in-laws|folks|brother|sister|aunt|uncle|cousins?)s?\s+(?:in|at|near|outside(?:\s+of)?)\s+/i, "")
        // Strip leftover leading verbs from captures like "visit my parents in Colorado"
        .replace(/^(?:visit|explore|see|tour|check\s+out)\s+/i, "")
        // Re-run people-strip after verb removal
        .replace(/^(?:my\s+)?(?:parents|family|friends|relatives|grandparents|in-laws|folks|brother|sister|aunt|uncle|cousins?)s?\s+(?:in|at|near|outside(?:\s+of)?)\s+/i, "")
        // Strip trailing companion phrases like "with my wife", "with friends"
        .replace(/\s+with\s+(?:my\s+|our\s+|the\s+)?(?:family|friends|wife|husband|partner|girlfriend|boyfriend|kids|children|parents|colleagues?|coworkers?|buddies|pals|mates?|group|team|crew|folks|everyone|them|us|him|her|people).*$/i, "")
        .trim();
      if (dest.length >= 2 && dest.length <= 60) {
        // Skip common non-travel destinations
        if (NON_TRAVEL_RE.test(dest)) continue;
        return { destination: dest.charAt(0).toUpperCase() + dest.slice(1) };
      }
    }
  }
  return null;
}

// ── Activity Completion Detection ──────────────────────────────
// "I worked out", "just went to the gym", "finished exercising", etc.

export function detectActivityCompletion(query: string): { activity: string } | null {
  const q = query.trim();
  const patterns: RegExp[] = [
    // Past tense: "I worked out", "went to gym", "went for a run", "did some yoga"
    /(?:i\s+)?(?:just\s+)?\b(?:worked\s+out|hit\s+the\s+gym|went\s+to\s+(?:the\s+)?gym|went\s+for\s+(?:a\s+)?(?:swim|run|jog|hike|ride|walk|bike\s+ride|workout)|exercised|ran|jogged|swam|cycled|biked|hiked|lifted(?:\s+weights)?|did\s+(?:some\s+|a\s+)?(?:yoga|pilates|cardio|crossfit|workout|exercise|stretching|stretch|meditation|cleaning|cooking|gardening)|played\s+(?:(?:a\s+)?(?:round|game|set|match|few|some|\d+)\s+(?:\w+\s+)?(?:of\s+)?)?(?:tennis|basketball|football|soccer|volleyball|squash|badminton|golf|cricket)|finished\s+(?:my\s+)?(?:\w+\s+){0,2}(?:workout|exercise|run|jog|swim|bike\s+ride|hike|training|session|practice))\b/i,
    // "completed my workout", "done with gym", "knocked out a quick run"
    /\b(?:completed|finished|done\s+with|knocked\s+out)\s+(?:my\s+|the\s+|a\s+)?(?:\w+\s+){0,2}(?:workout|exercise|run|training|gym\s+session|swim|ride|practice|session|cardio|yoga|pilates|crossfit)\b/i,
    // General "I [verb]ed" past tense with activity words
    /(?:i\s+)?(?:just\s+)?\b(?:cleaned|cooked|meditated|stretched|studied|read|practiced|journaled|painted|gardened|mowed|vacuumed|organized|decluttered|meal\s+prepped|walked\s+(?:the\s+)?dog|fed\s+(?:the\s+)?(?:cat|dog|pet))\b/i,
    // "back from the gym", "got back from my run"
    /\b(?:back\s+from|returned\s+from|got\s+back\s+from)\s+(?:my\s+|the\s+|a\s+)?(?:\w+\s+)?(?:workout|gym|run|jog|swim|hike|ride|walk|training|practice|class|session|game|match|pool)\b/i,
  ];

  for (const re of patterns) {
    const m = q.match(re);
    if (m) {
      // Extract the core activity name
      let activity = m[0].toLowerCase()
        .replace(/^(?:i\s+)?(?:just\s+)?/i, "")
        .replace(/^(?:completed|finished|done\s+with|knocked\s+out|back\s+from|returned\s+from|got\s+back\s+from)\s+(?:my\s+|the\s+|a\s+)?/i, "")
        .replace(/^went\s+(?:for\s+(?:a\s+)?|to\s+(?:the\s+)?)/i, "")
        .replace(/^did\s+(?:some\s+|a\s+)?/i, "")
        .replace(/^(played)\s+(?:(?:a\s+)?(?:round|game|set|match|few|some|\d+)\s+(?:\w+\s+)?(?:of\s+)?)/i, "$1 ")
        .replace(/^(?:(?:quick|morning|evening|afternoon|long|short|good|great|nice|intense|light|hard|easy|daily|weekly|brief|tough|solid|early|late)\s+)+/i, "")
        .trim();
      // Normalize common phrases
      const activityMap: Record<string, string> = {
        "worked out": "exercised",
        "hit the gym": "exercised",
        "went to gym": "exercised",
        "went to the gym": "exercised",
        "did yoga": "yoga",
        "did pilates": "pilates",
        "did cardio": "cardio",
        "did crossfit": "crossfit",
        "did a workout": "exercised",
        "did some exercise": "exercised",
        "lifted": "exercised",
        "lifted weights": "exercised",
        "workout": "exercised",
        "exercise": "exercised",
        "gym session": "exercised",
        "gym": "exercised",
        "training": "exercised",
        "session": "exercised",
        "walked the dog": "walked the dog",
        "walked dog": "walked the dog",
        "fed the cat": "fed the pet",
        "fed the dog": "fed the pet",
        "fed the pet": "fed the pet",
        "meal prepped": "meal prepped",
        "played tennis": "tennis",
        "played basketball": "basketball",
        "played football": "football",
        "played soccer": "soccer",
        "played volleyball": "volleyball",
        "played squash": "squash",
        "played badminton": "badminton",
        "played golf": "golf",
        "played cricket": "cricket",
        "biked": "cycled",
        "bike ride": "cycled",
        "pool": "swam",
        "stretching": "stretched",
        "stretch": "stretched",
        "meditation": "meditated",
        "cooking": "cooked",
        "cleaning": "cleaned",
        "gardening": "gardened",
      };
      activity = activityMap[activity] || activity;
      return { activity };
    }
  }
  return null;
}

// ── Date Calculation Detection ─────────────────────────────────
// "How long until Christmas", "When is Easter", "How many days until summer"

export function detectDateCalculation(query: string): { subject: string; targetDateStr?: string } | null {
  const patterns: RegExp[] = [
    /(?:how\s+(?:many|long|much)\s+(?:days?|weeks?|months?|time)\s+(?:until|till|to|before|left\s+(?:until|till))\s+)(.+)/i,
    // "How long until X" / "How long till X" (no time unit required)
    /(?:how\s+long\s+(?:until|till|before)\s+)(.+)/i,
    /(?:when\s+is|when'?s)\s+(.+?)(?:\s*\??\s*$)/i,
    /(?:how\s+(?:far\s+(?:away|off)\s+is|soon\s+is|close\s+is)\s+)(.+)/i,
    /(?:what\s+(?:day|date)\s+is\s+)(.+?)(?:\s*\??\s*$)/i,
    /(?:days?\s+(?:until|till|to|before|left)\s+)(.+)/i,
    // Range pattern: "from X to Y"
    /(?:how\s+many\s+days\s+from)\s+(.+?)\s+(?:to|until|till)\s+(.+)/i,
  ];

  const q = query.trim();
  // Skip if it looks like someone else's birthday query (handled by detectBirthdayQuery)
  // Allow "my birthday" through since that's a valid date subject
  if (/birthday/i.test(q) && /\w+'s\s+birthday/i.test(q) && !/\bmy\s+birthday/i.test(q)) return null;
  // Skip if it looks like a calendar/availability query
  if (/\b(?:free|busy|available|meeting|slot|calendar|appointment|schedule)\b/i.test(q)) return null;
  // Skip trivially obvious date words (including "when's" contraction)
  if (/^(?:when\s+is\s+|when'?s\s+)?(?:today|tomorrow|yesterday|now)\s*\??$/i.test(q)) return null;

  for (const re of patterns) {
    const m = q.match(re);
    if (m) {
      if (m[2]) { // range match
        return { subject: m[2].trim().replace(/[.!?,]+$/, ""), targetDateStr: m[1].trim() };
      }
      if (m[1]) {
        let subject = m[1].trim().replace(/[.!?,]+$/, "").replace(/^(?:my|our|the)\s+/i, "").trim();
        if (subject.length >= 2 && subject.length <= 80) {
          return { subject };
        }
      }
    }
  }
  return null;
}

// ── Birthday Query Detection ───────────────────────────────────
// "When is Sarah's birthday", "How long until Mom's birthday"

export function detectBirthdayQuery(query: string): { name: string } | null {
  const patterns: RegExp[] = [
    // "When is my friend Jake's birthday" — relationship word before name
    /(?:when'?s|when\s+is|what\s+(?:day|date)\s+is|how\s+(?:long|many\s+days?)\s+(?:until|till))\s+(?:my\s+)?(?:friend|buddy|pal|mate|colleague|coworker|neighbor|neighbour|uncle|aunt|cousin|brother|sister|mom|dad|mother|father|grandma|grandpa|grandmother|grandfather)\s+(\w+(?:\s+\w+)?)'?s?\s+birthday/i,
    /(?:when'?s|when\s+is|what\s+(?:day|date)\s+is|how\s+(?:long|many\s+days?)\s+(?:until|till))\s+(\w+(?:\s+\w+)?)'?s?\s+birthday/i,
    /when\s+(?!is\b)(\w+(?:\s+\w+)?)'?s?\s+birthday/i,
    /(\w+(?:\s+\w+)?)'?s?\s+birthday\s+(?:is\s+)?(?:when|what\s+day|what\s+date)/i,
    /birthday\s+(?:of|for)\s+(?:my\s+)?(?:friend|buddy|pal|mate|colleague|coworker|neighbor|neighbour)?\s*(\w+(?:\s+\w+)?)/i,
  ];

  for (const re of patterns) {
    const m = query.match(re);
    if (m && m[1]) {
      let name = m[1].trim()
        .replace(/^my\s+/i, "")
        .replace(/^(?:friend|buddy|pal|mate|colleague|coworker|neighbor|neighbour)\s+/i, "");
      // Skip bare "my" capture — let it fall through to date calc or general handler
      if (/^my$/i.test(name)) continue;
      if (name.length >= 2) {
        return { name: name.charAt(0).toUpperCase() + name.slice(1) };
      }
    }
  }
  return null;
}

// ── News / Article Request Detection ───────────────────────────
// "Give me a random article", "show me some news", "read something"

export function detectNewsRequest(query: string): { topic?: string } | null {
  const q = query.trim().toLowerCase();
  const patterns: RegExp[] = [
    /(?:give\s+me|show\s+me|find\s+me|get\s+me|share|fetch|pull\s+up)\s+(?:a\s+|some\s+|the\s+)?(?:random\s+|latest\s+|recent\s+|new\s+|interesting\s+)?(?:\w+\s+)?(?:news|articles?|posts?|stories|headlines?|read)/i,
    /(?:random|any|some)\s+(?:good\s+|great\s+|interesting\s+|cool\s+|new\s+|recent\s+|latest\s+)?(?:\w+\s+)?(?:news|articles?|posts?|stories|headlines?)/i,
    /(?:what'?s\s+(?:in\s+the\s+)?(?:news|happening|trending|going\s+on))/i,
    /(?:read\s+(?:me\s+)?something|(?:something|anything)\s+(?:to\s+read|interesting(?:\s+to\s+read)?))/i,
    /(?:news\s+(?:article|story|update|feed|headline)s?\s*(?:\?|$))/i,
    /(?:surprise\s+me\s+with\s+(?:a\s+)?(?:news|article|story))/i,
    /(?:catch\s+(?:me\s+)?up\s+(?:on\s+(?:the\s+)?)?(?:(?:\w+\s+){0,2})?(?:news|headlines|what'?s\s+happening))/i,
    /^news\s+(?:about|on|regarding|related\s+to|in)\s+(.+)/i,
    // "I want to read about X", "I wanna read about X", "I'd like to read about X"
    /(?:i\s+(?:want\s+to|wanna|would\s+like\s+to)|i'?d\s+like\s+to|(?:want\s+to|wanna))\s+read\s+(?:about|on)\s+(.+)/i,
    // Bare "TOPIC news" / "TOPIC headlines" — e.g. "tech news", "sports news", "AI news?"
    /^(\w+(?:\s+\w+)?)\s+(?:news|headlines?|articles?)[\s?.!]*$/i,
    // Bare "news" / "news?" standalone
    /^news[\s?.!]*$/i,
  ];

  for (const re of patterns) {
    const m = q.match(re);
    if (m) {
      // If the pattern itself captured a topic (e.g., "news about X"), use it directly
      if (m[1]) {
        const rawTopic = m[1].trim().replace(/^(?:the|a|an|some|any|random|latest|recent|new|interesting|more|my|good|great|cool|best|top|hot|trending|popular|favorite|favourite)\s+/i, "").trim();
        if (rawTopic && !/^(?:the|a|an|some|any|random|latest|recent|new|interesting|more|my|news|article|read|morning|evening|daily|weekly|today|current)$/i.test(rawTopic)) {
          return { topic: rawTopic };
        }
        return { topic: undefined };
      }
      // Otherwise, try to extract topic — allow "on" but NOT when followed by generic "the news/headlines"
      const topicMatch = q.match(/(?:about|regarding|related\s+to|in|on(?!\s+(?:the\s+)?(?:news|headlines?|what)))\s+(.+?)(?:\s*[.!?]*\s*$)/i);
      if (topicMatch?.[1]?.trim()) {
        const cleanedTopic = topicMatch[1].trim()
          .replace(/^(?:the|a|an|some|any|random|latest|recent|new|interesting|more|my)\s+/i, "")
          .replace(/\s+(?:news|articles?|headlines?|stories|posts?)\s*$/i, "")
          .trim();
        // Reject if cleaned topic is itself a generic news word
        if (cleanedTopic && !/^(?:news|articles?|headlines?|stories|posts?|read|updates?)$/i.test(cleanedTopic)) {
          return { topic: cleanedTopic };
        }
      }
      // Try to extract topic word(s) immediately before "news/articles/headlines" (e.g., "tech news")
      const preTopicMatch = q.match(/(?:latest|recent|new|interesting)?\s*(\w+(?:\s+\w+)?)\s+(?:news|articles?|headlines?|stories)\b/i);
      if (preTopicMatch?.[1]) {
        const rawTopic = preTopicMatch[1].trim()
          .replace(/^(?:the|a|an|some|any|random|latest|recent|new|interesting|more|my|good|great|cool|best|top|hot|trending|popular|favorite|favourite)\s+/i, "")
          .trim();
        if (rawTopic && !/^(?:the|a|an|some|any|random|latest|recent|new|interesting|more|my|news|article|read|morning|evening|daily|weekly|today|current)$/i.test(rawTopic)) {
          return { topic: rawTopic };
        }
      }
      return { topic: undefined };
    }
  }
  return null;
}

// ── Actionable Statement Detection ─────────────────────────────

const TEMPORAL_RE = /\b(tomorrow|tonight|today|this\s+(?:morning|afternoon|evening|weekend)|next\s+(?:week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|(?:on|by)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|the\s+\d+(?:st|nd|rd|th)?|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d+)|in\s+\d+\s+(?:day|week|month|year)s?|at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)|(?:this|coming)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|(?:end\s+of\s+(?:the\s+)?(?:day|week|month))|(?:(?:early|late)\s+(?:morning|afternoon|evening|night)))\b/gi;

const MILESTONE_RE = /\b(birthday|anniversary|wedding|graduation|vacation|trip|holiday|exam|test|interview|launch|release|deadline|appointment|ceremony|concert|festival|reunion|party|flight|departure|arrival|moving\s+day|last\s+day|first\s+day|due\s+date|expir(?:y|es|ation)|renewal|recital|game|match|tournament|performance|exhibition|show|retirement|farewell|baby\s+shower|bridal\s+shower|prom|homecoming|commencement|orientation|check-?up|surgery|procedure)\b/gi;

const COUNTDOWN_RE = /\b(days?\s+(?:until|left|to\s+go|remaining|away|since|elapsed|ago)|countdown\s+(?:to|for)|count(?:ing)?\s+(?:down|since|days)|counting\s+down|coming\s+up|approaching|around\s+the\s+corner|is\s+(?:soon|near|close|approaching)|how\s+(?:many|long)\s+(?:days?|weeks?|months?|time)\s+(?:until|till|before|to|since)|track(?:ing)?\s+(?:days?|since|how\s+long)|start\s+(?:a\s+)?(?:counter|tracker|countdown|timer))\b/gi;

const ACTION_VERB_RE = /^(buy|call|fix|clean|submit|pick\s+up|get|send|write|check|make|prepare|finish|complete|update|schedule|book|order|return|cancel|renew|review|organize|plan|email|text|pay|wash|do|take|find|visit|bring|move|set\s+up|sign\s+up|register|apply|respond|reply|follow\s+up|ask|tell|cook|bake|read|study|practice|learn|try|start|stop|install|download|upload|file|print|scan|ship|mail|deliver|arrange|confirm|verify|approve|request|hire|research|explore|investigate|grab|drop\s+off|look\s+into|sort\s+out|figure\s+out|work\s+on|put\s+away|throw\s+(?:out|away)|wrap\s+up|hand\s+in|turn\s+in|look\s+up|fill\s+(?:out|in)|clear\s+out|tidy\s+up|water|feed|walk|charge|backup|back\s+up|pack|unpack|edit|draft|design|build|assemble|paint|repair|replace|restock|refill|donate|recycle|shred|sweep|mop|vacuum|iron|fold|hang|measure|weigh|taste|sample)\b/i;

const OBLIGATION_RE = /\b(need\s+to|have\s+to|gotta|should|must|want\s+to|going\s+to|gonna|ought\s+to|supposed\s+to|plan\s+to|planning\s+to|meant\s+to|trying\s+to|time\s+to|got\s+to|better|make\s+sure\s+to)\b/gi;

const DUE_RE = /\b(is\s+due|due\s+(?:on|by|in|tomorrow|next)|expires?\s+(?:on|in|tomorrow|next|soon)|deadline\s+(?:is|for)|overdue|past\s+due|needs?\s+(?:to\s+be\s+done|fixing|attention|updating|cleaning|review(?:ing)?)|runs?\s+out|about\s+to\s+expire)\b/gi;

const POSSESSIVE_EVENT_RE = /\b(\w+'s\s+(?:birthday|anniversary|wedding|graduation|party|ceremony|concert|farewell|retirement|shower|recital|game|match|tournament|performance|exhibition|show|funeral|memorial|baptism|christening|bar\s+mitzvah|bat\s+mitzvah|quinceañera|housewarming|engagement|baby\s+shower|bridal\s+shower))\b/gi;

const REMEMBER_RE = /\b(don'?t\s+forget\s+(?:to|about)?|remember\s+(?:to|about)?|remind\s+(?:me\s+)?(?:to|about)?)\b/gi;

function collectMatches(re: RegExp, text: string): { word: string; start: number; end: number }[] {
  const results: { word: string; start: number; end: number }[] = [];
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    results.push({ word: m[0], start: m.index, end: m.index + m[0].length });
  }
  return results;
}

export function detectActionableStatement(q: string): ActionableDetection | null {
  const text = q.trim();
  if (text.length < 4 || text.length > 300) return null;

  // Skip if it looks like a question about the assistant's capabilities
  if (/^(what\s+can\s+you|help|how\s+do\s+(?:i|you)|can\s+you|are\s+you|who\s+are)/i.test(text)) return null;
  // Skip questions that are calendar/schedule inquiries (not actionable statements)
  if (/^(?:what\s+do\s+i\s+have|what'?s\s+(?:on\s+)?my\s+(?:day|calendar|schedule|agenda)|how'?s\s+my\s+(?:day|calendar|schedule|agenda)|do\s+i\s+have\s+(?:any(?:thing)?|a(?:ny)?)\s+(?:meetings?|events?|appointments?)|how\s+(?:is|does)\s+my\s+(?:day|calendar|schedule)|am\s+i\s+(?:free|busy|available|booked))\b/i.test(text)) return null;

  const temporal   = collectMatches(TEMPORAL_RE, text);
  const milestone  = collectMatches(MILESTONE_RE, text);
  const countdown  = collectMatches(COUNTDOWN_RE, text);
  const actionVerb = ACTION_VERB_RE.test(text) ? [{ word: text.match(ACTION_VERB_RE)![0], start: 0, end: text.match(ACTION_VERB_RE)![0].length }] : [];
  const obligation = collectMatches(OBLIGATION_RE, text);
  const due        = collectMatches(DUE_RE, text);
  const possessive = collectMatches(POSSESSIVE_EVENT_RE, text);
  const remember   = collectMatches(REMEMBER_RE, text);

  const allTriggers = [...temporal, ...milestone, ...countdown, ...actionVerb, ...obligation, ...due, ...possessive, ...remember];

  // Need at least one trigger to fire
  if (allTriggers.length === 0) return null;

  // Deduplicate overlapping triggers (keep longer ones)
  allTriggers.sort((a, b) => a.start - b.start || b.end - a.end);
  const deduped: typeof allTriggers = [];
  for (const t of allTriggers) {
    if (deduped.length > 0 && t.start < deduped[deduped.length - 1].end) {
      // Overlapping — keep the longer one
      if (t.end > deduped[deduped.length - 1].end) {
        deduped[deduped.length - 1] = t;
      }
      continue;
    }
    deduped.push(t);
  }

  // Determine which types to suggest
  const hasAction     = actionVerb.length > 0;
  const hasObligation = obligation.length > 0;
  const hasDue        = due.length > 0;
  const hasTemporal   = temporal.length > 0;
  const hasMilestone  = milestone.length > 0;
  const hasCountdown  = countdown.length > 0;
  const hasPossessive = possessive.length > 0;
  const hasRemember   = remember.length > 0;

  // At least one of these groups should match; skip very generic single short words
  const meaningfulMatch = hasAction || hasObligation || hasDue || hasMilestone || hasCountdown || hasPossessive || hasRemember
    || (hasTemporal && text.split(/\s+/).length >= 3);
  if (!meaningfulMatch) return null;

  const suggestTask     = hasAction || hasObligation || hasDue || hasRemember;
  const suggestReminder = hasTemporal || hasMilestone || hasPossessive || hasDue || hasRemember;
  const suggestCounter  = hasMilestone || hasCountdown || hasPossessive || /\b(?:since|streak|elapsed|ago)\b/i.test(text);
  const suggestNote = /^(?:add|save|note)(?:\s+note)?\s+(.+?)\s+to\s+(?:contact\s+|profile\s+)?(.+?)(?:'s?\s+(?:profile|contact))?$/i.test(text);

  // Need at least one suggestion
  if (!suggestTask && !suggestReminder && !suggestCounter && !suggestNote) return null;

  // Extract subject: clean the query to get a meaningful title
  let subject = text
    // Remove obligation phrases at start
    .replace(/^(?:i\s+)?(?:need\s+to|have\s+to|gotta|should|must|want\s+to|going\s+to|gonna|ought\s+to|supposed\s+to|plan\s+to|planning\s+to|meant\s+to|trying\s+to|time\s+to|got\s+to|better|make\s+sure\s+to)\s+/i, "")
    // Remove remember/remind phrases at start
    .replace(/^(?:don'?t\s+forget\s+(?:to|about)\s*|remember\s+(?:to|about)\s*|remind\s+(?:me\s+)?(?:to|about)\s*)/i, "")
    .trim()
    // Strip trailing temporal/copula phrases: "is tomorrow", "is on Friday", "is in 3 days", "by next week"
    .replace(/\s+(?:is\s+)?(?:tomorrow|tonight|today|on\s+\w+|by\s+\w[\w\s]*|in\s+\d+\s+\w+|next\s+\w+|this\s+\w+|at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)$/i, "")
    .trim()
    // Remove trailing orphaned "is"
    .replace(/\s+is$/i, "")
    .trim();

  // Capitalize first letter
  if (subject.length > 0) {
    subject = subject.charAt(0).toUpperCase() + subject.slice(1);
  }

  // Extract a date hint from temporal matches
  const dateHint = temporal.length > 0 ? temporal[0].word : undefined;

  return {
    subject,
    triggers: deduped,
    suggestTask,
    suggestReminder,
    suggestCounter,
    suggestNote,
    dateHint,
  };
}