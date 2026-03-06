import React, { useState, useRef, useEffect, useMemo } from "react";
import { availabilityCheck, availabilityFind, createEvent, createReminder, getContacts, getContactFreeBusy, createContact, createDaysSince, getDaysSince, resetDaysSince, getMyLists, createMyList, addMyListItem, getReminders, getNews, getRssFeedArticles, getEvents, getBookingLinks, createBookingLink, updateContact } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import {
  Send, Loader2, Sparkles, Clock, CalendarDays,
  CheckCircle2, XCircle, AlertTriangle, Search, Zap, Coffee,
  ChevronRight, Copy, Check, Plus, Bell, MapPin, CalendarPlus, Users,
  UserPlus, Link2, PartyPopper, ListTodo, Timer, Hourglass, FileText, FolderOpen,
} from "lucide-react";
import * as chrono from "chrono-node";
import { DateTime } from "luxon";
import { getDeviceTimezone, formatTimeInTz } from "../lib/timezone-utils";

// Helper to reliably pass timezone-adjusted reference dates to chrono-node
function getChronoRefDate(dt: DateTime): Date {
  // chrono-node reads the local getters (.getFullYear(), .getDate(), .getHours())
  // of the Date object it is given. By constructing the Date with the local components
  // of the target timezone, we ensure chrono reads the exact correct target time
  // regardless of the browser's actual local timezone.
  return new Date(dt.year, dt.month - 1, dt.day, dt.hour, dt.minute, dt.second, dt.millisecond);
}

// Helper to convert chrono-node's parsed JS Date back to a timezone-aware Luxon DateTime
function chronoDateToLuxon(date: Date, tz: string): DateTime {
  return DateTime.fromObject({
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
    second: date.getSeconds()
  }, { zone: tz });
}

import { motion, AnimatePresence } from "motion/react";
import { highlightQuery } from "../lib/keyword-highlight";
import { copyToClipboard } from "../lib/clipboard";
import { useNavigate, useLocation } from "react-router";
import { classifyCapture, executeCapture, executeRemove, useListAutocomplete, type CaptureType } from "../lib/quick-capture";
import { ListAutocompleteDropdown } from "./list-autocomplete";
import { useRotatingPlaceholder, buildPersonalizedPrompts as _buildPersonalizedPrompts } from "../lib/rotating-placeholder";
import { DayRundownModal } from "./day-rundown-modal";
import { toast } from "sonner";
import { getSharedLists } from "../lib/api";
import { useQuerySuggestions, QuerySuggestionsDropdown } from "./query-suggestions";

// ── Helper: Add item to My Lists (find or create a default list) ──

async function addItemToMyList(title: string, preferredListName?: string): Promise<{ listName: string }> {
  const lists = await getMyLists();
  let targetList: any = null;
  if (Array.isArray(lists) && lists.length > 0) {
    // If a specific list name was requested, try to match it (case-insensitive)
    if (preferredListName) {
      targetList = lists.find((l: any) => l.title.toLowerCase() === preferredListName.toLowerCase())
        || lists.find((l: any) => l.title.toLowerCase().includes(preferredListName.toLowerCase()));
    }
    // Fall back to "Quick Capture" or the first list
    if (!targetList) {
      targetList = lists.find((l: any) => l.title === "Quick Capture") || lists[0];
    }
  }
  if (!targetList) {
    // Create a default list
    targetList = await createMyList({ title: "Quick Capture" });
  }
  await addMyListItem(targetList.id, { text: title });
  return { listName: targetList.title };
}

// ── Types ──────────────────────────────────────────────────────

interface SlotData {
  start_at: string;
  end_at: string;
}

interface ConflictData {
  start_at: string;
  end_at: string;
  title?: string;
  rule_kind?: string;
}

interface CheckResult {
  isFree: boolean;
  timezone: string;
  requestedRange: { start: string; end: string };
  conflicts: ConflictData[];
}

interface FindResult {
  timezone: string;
  mode: string;
  freeRanges: SlotData[];
  conflictsSummary: ConflictData[];
  requestedDurationMinutes?: number;
}

type MessagePayload =
  | { kind: "text"; text: string }
  | { kind: "check"; result: CheckResult; timezone: string }
  | { kind: "find"; result: FindResult; timezone: string; query: string }
  | { kind: "eventCreated"; event: { id: string; title: string; start_at: string; end_at: string; location?: string | null }; timezone: string }
  | { kind: "reminderCreated"; reminder: { id: string; title: string; due_at: string }; timezone: string }
  | { kind: "clarify"; text: string; options?: { label: string; value: string }[] }
  | { kind: "error"; text: string }
  | { kind: "contactCheck"; contactName: string; contactId?: string; userFree: boolean; contactFree: boolean; requestedRange: { start: string; end: string }; timezone: string; busyBlocks?: Array<{ start_at: string; end_at: string; title?: string }> }
  | { kind: "contactFind"; contactName: string; contactId?: string; slots: SlotData[]; timezone: string; query: string; requestedDurationMinutes?: number }
  | { kind: "groupFind"; contactNames: string[]; contactIds?: string[]; slots: SlotData[]; timezone: string; query: string; requestedDurationMinutes?: number }
  | { kind: "groupEventCreated"; event: { id: string; title: string; start_at: string; end_at: string; location?: string | null }; contactNames: string[]; timezone: string }
  | { kind: "addContact"; initialName?: string; initialNote?: string; }
  | { kind: "bookingLink"; contactName: string; contactId?: string }
  | { kind: "actionableSuggestion"; originalText: string; subject: string; triggers: { word: string; start: number; end: number }[]; suggestTask: boolean; suggestReminder: boolean; suggestCounter: boolean; suggestNote?: boolean; dateHint?: string };

interface Message {
  id: string;
  role: "user" | "assistant";
  payload: MessagePayload;
  timestamp: Date;
}

// ── Pending Action for multi-turn flows ────────────────────────

type PendingAction =
  | {
      kind: "eventBuilder";
      title: string;
      timezone: string;
      date?: string;           // ISO date string (YYYY-MM-DD)
      time?: { hour: number; minute: number };
      duration?: number;       // minutes
      location?: string | null;
      recurrence?: { frequency: string; interval: number } | null;
      recurrenceEnd?: string | null;  // ISO date for recurrence end
      step: "date" | "time" | "duration" | "location" | "recurrenceEnd";
    }
  | { kind: "reminderNeedsTime"; task: string; dateIso: string; timezone: string }
  | {
      kind: "meetingDurationNeeded";
      contactIds: string[];
      contactNames: string[];
      originalQuery: string;
      timezone: string;
      startAt: string;
      endAt: string;
      mode: string;
    }
  | {
      kind: "bookingNeedsTitle";
      slot: SlotData;
      suggestedTitle: string;
      timezone: string;
      contactNames?: string[];
      contactIds?: string[];
    }
  | null;

// ── Bookable slot context for NL booking confirmations ────────
interface BookableSlotContext {
  slot: SlotData;
  suggestedTitle: string;
  contactNames?: string[];
  contactIds?: string[];
  timezone: string;
}

// ── Create-intent types ────────────────────────────────────────

// ── Conversational context for follow-up queries ───────────────
interface QueryContext {
  kind: "contactCheck" | "contactFind" | "groupFind" | "check" | "find";
  contactIds?: string[];
  contactNames?: string[];
  startAt: string;
  endAt: string;
  timezone: string;
  mode: string;
  durationMinutes?: number;
  query: string;
}

interface CreateEventIntent {
  type: "createEvent";
  title: string;
  startAt: string;
  endAt: string;
  location?: string | null;
}

interface CreateEventNeedsDuration {
  type: "createEventNeedsDuration";
  title: string;
  startAt: string;
  location?: string | null;
}

interface CreateEventWizard {
  type: "createEventWizard";
  title: string;
  date?: string;              // ISO date if we have it
  time?: { hour: number; minute: number };
  duration?: number;
  recurrence?: { frequency: string; interval: number } | null;
}

interface CreateReminderIntent {
  type: "createReminder";
  task: string;
  dueAt: string;
}

interface CreateReminderNeedsTime {
  type: "createReminderNeedsTime";
  task: string;
  dateIso: string; // YYYY-MM-DD portion only
}

type FullIntent =
  | Intent
  | CreateEventIntent
  | CreateEventNeedsDuration
  | CreateEventWizard
  | CreateReminderIntent
  | CreateReminderNeedsTime
  | null;

// ── Travel / Trip Intent Detection ─────────────────────────────

function detectTravelIntent(query: string): { destination: string } | null {
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
    // Additional variations:
    /(?:we\s+should|let'?s|wanna)\s+(?:go|take\s+a\s+trip)\s+(?:to|somewhere\s+like)\s+(.+)/i,
    /(?:any\s+(?:recommendations|tips|ideas)\s+for)\s+(?:a\s+trip\s+to|visiting|traveling\s+to|my\s+trip\s+to)\s+(.+)/i,
    /(?:flights?|tickets?|hotels?|airbnbs?)\s+(?:to|for)\s+(.+)/i,
    /(?:going\s+on\s+vacation\s+to)\s+(.+)/i,
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
        // Re-run people-strip after verb removal (e.g., "my parents in Colorado" → "Colorado")
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

function detectActivityCompletion(query: string): { activity: string } | null {
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

// ── Find a matching counter by activity name ──────────────────
// Uses fuzzy keyword matching to find existing Days Since counters

function findMatchingCounter(activity: string, counters: any[]): any | null {
  if (!counters || counters.length === 0 || !activity) return null;
  const actLower = activity.toLowerCase();

  // Build alternative keyword sets for common activities
  const activitySynonyms: Record<string, string[]> = {
    "exercised": ["exercise", "exercis", "workout", "work out", "gym", "train", "lift", "run", "jog", "swim", "cycle", "bike", "hike", "cardio", "crossfit", "fitness", "sport"],
    "yoga": ["yoga", "stretch"],
    "pilates": ["pilates"],
    "cardio": ["cardio", "run", "jog", "treadmill"],
    "ran": ["run", "ran", "jog", "jogged", "running"],
    "run": ["run", "ran", "jog", "jogged", "running"],
    "jogged": ["jog", "jogged", "run"],
    "jog": ["jog", "jogged", "run", "running"],
    "swam": ["swim", "swam", "pool", "swimming"],
    "swim": ["swim", "swam", "pool", "swimming"],
    "cycled": ["cycle", "cycled", "bike", "biked", "ride", "rode", "cycling"],
    "ride": ["ride", "rode", "cycling", "bike", "biked", "cycle"],
    "hiked": ["hike", "hiked", "trek", "hiking"],
    "hike": ["hike", "hiked", "trek", "hiking"],
    "cleaned": ["clean", "cleaned", "tidy", "tidied", "cleaning"],
    "stretched": ["stretch", "stretched", "stretching", "flexibility"],
    "walk": ["walk", "walked", "walking", "stroll"],
    "cooked": ["cook", "cooked", "meal prep", "cooking"],
    "meditated": ["meditat", "mindful"],
    "studied": ["study", "studied", "learn", "read"],
    "walked the dog": ["walk", "dog"],
    "fed the pet": ["feed", "fed", "pet", "cat", "dog"],
    "meal prepped": ["meal prep", "cook", "food prep"],
    "gardened": ["garden", "yard", "mow", "lawn"],
    "vacuumed": ["vacuum", "clean"],
    "organized": ["organiz", "declutter", "tidy"],
    "journaled": ["journal", "diary", "write"],
    "painted": ["paint", "art", "draw"],
    "tennis": ["tennis", "racket", "court"],
    "basketball": ["basketball", "hoops"],
    "football": ["football"],
    "soccer": ["soccer", "futbol", "football"],
    "golf": ["golf", "golfing"],
    "cricket": ["cricket"],
    "squash": ["squash", "racquet"],
    "badminton": ["badminton", "shuttlecock"],
    "volleyball": ["volleyball", "volley"],
  };

  const keywords = activitySynonyms[actLower] || [actLower];

  // Score each counter
  let bestMatch: { counter: any; score: number } | null = null;
  for (const c of counters) {
    if (!c.label) continue;
    const labelLower = c.label.toLowerCase();
    let score = 0;
    for (const kw of keywords) {
      if (labelLower.includes(kw)) score += 2;
    }
    // Also check if the activity word itself appears
    if (labelLower.includes(actLower)) score += 3;
    // Boost "since" type counters (they're the ones we want to reset)
    if (c.type === "since") score += 1;

    if (score > 0 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { counter: c, score };
    }
  }

  return bestMatch && bestMatch.score >= 2 ? bestMatch.counter : null;
}

// ── Date Calculation Detection ─────────────────────────────────
// "How long until Christmas", "When is Easter", "How many days until summer"

function detectDateCalculation(query: string): { subject: string; targetDateStr?: string } | null {
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

function detectBirthdayQuery(query: string): { name: string } | null {
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

function detectNewsRequest(query: string): { topic?: string } | null {
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
  ];

  for (const re of patterns) {
    const m = q.match(re);
    if (m) {
      // If the pattern itself captured a topic (e.g., "news about X"), use it directly
      if (m[1]) return { topic: m[1].trim() };
      // Otherwise, try to extract topic — allow "on" but NOT when followed by generic "the news/headlines"
      const topicMatch = q.match(/(?:about|regarding|related\s+to|in|on(?!\s+(?:the\s+)?(?:news|headlines?|what)))\s+(.+?)(?:\s*[.!?]*\s*$)/i);
      if (topicMatch?.[1]?.trim()) {
        const cleanedTopic = topicMatch[1].trim()
          .replace(/^(?:the|a|an|some|any|random|latest|recent|new|interesting|more|my|good|great|cool|best|top|hot|trending|popular|favorite|favourite)\s+/i, "")
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

// ── Direct "Days Since" / Counter creation intent ──────────────
// Detects explicit counter/tracker/countdown creation requests and returns
// the label and type ("since" for elapsed-time trackers, "to" for countdowns).

function isDaysSinceIntent(query: string): { label: string; type: "since" | "to" } | null {
  const q = query.trim();

  // ── "Days Since" patterns (tracking time elapsed) ──
  const sincePatterns: RegExp[] = [
    // "start a counter for days since I last exercised"
    /(?:start|begin|create|make|set\s*up|new|add|track|log|record|monitor|launch)\s+(?:a\s+)?(?:counter|tracker|timer|tracking|count(?:ing)?|log(?:ging)?)\s+(?:for\s+)?(?:(?:the\s+)?days?\s+)?since\s+(.+)/i,
    // "track days since I quit smoking"
    /(?:start|begin|track|log|record|monitor|count|measure)\s+(?:the\s+)?(?:number\s+of\s+)?days?\s+since\s+(.+)/i,
    // "days since counter/tracker for last workout"
    /days?\s+since\s+(?:counter|tracker|timer|log)\s+(?:for\s+)?(.+)/i,
    // "start tracking since my last haircut"
    /(?:start|begin)\s+(?:tracking|counting|logging|recording|monitoring|measuring)\s+(?:(?:the\s+)?days?\s+)?since\s+(.+)/i,
    // "count days since I moved"
    /count(?:ing)?\s+(?:the\s+)?(?:number\s+of\s+)?days?\s+since\s+(.+)/i,
    // "counter/tracker for days since…"
    /(?:counter|tracker|timer|log)\s+(?:for\s+)?(?:(?:the\s+)?days?\s+)?since\s+(.+)/i,
    // "new counter since…"
    /(?:new|create|add|make)\s+(?:a\s+)?(?:counter|tracker|log)\s+since\s+(.+)/i,
    // "track since last…"
    /(?:track|log|record|monitor)\s+since\s+(?:my\s+)?(?:last\s+)?(.+)/i,
    // bare "days since I last …"  (only when ≥ 5 words total to avoid false positives)
    /^days?\s+since\s+(?:i\s+)?(?:last\s+)?(.+)/i,
  ];

  for (const re of sincePatterns) {
    const m = q.match(re);
    if (m && m[1]) {
      let label = m[1].trim()
        .replace(/^i\s+/i, "")            // strip leading "I " but keep "last"
        .replace(/^(?:my\s+)/i, "")        // strip "my "
        .replace(/[.!?]+$/, "")
        .trim();
      if (label.length >= 2) {
        label = label.charAt(0).toUpperCase() + label.slice(1);
        return { label, type: "since" };
      }
    }
  }

  // ── "Countdown to" / "Days until" patterns (tracking time to future event) ──
  const toPatterns: RegExp[] = [
    // "start a countdown to my birthday"
    /(?:start|begin|create|make|set\s*up|new|add|track|launch)\s+(?:a\s+)?(?:countdown|counter|tracker|timer|count(?:\s*down)?)\s+(?:to|for|until|till)\s+(.+)/i,
    // "countdown to Christmas"
    /(?:countdown|count\s*down)\s+(?:to|until|till|for)\s+(.+)/i,
    // "track days until vacation"
    /(?:track|count|log|record|monitor|measure)\s+(?:the\s+)?(?:number\s+of\s+)?days?\s+(?:until|till|to|before|left\s+(?:until|till|before|to))\s+(.+)/i,
    // "start tracking/counting down to…"
    /(?:start|begin)\s+(?:tracking|counting)\s+(?:down\s+)?(?:to|until|till|for)\s+(.+)/i,
    // "days left/remaining until…"
    /days?\s+(?:left|remaining|to\s+go)\s+(?:until|till|to|before|for)\s+(.+)/i,
    // "X days away" pattern
    /(?:counter|tracker|timer)\s+(?:for\s+)?(?:days?\s+)?(?:until|till|to|before)\s+(.+)/i,
  ];

  for (const re of toPatterns) {
    const m = q.match(re);
    if (m && m[1]) {
      let label = m[1].trim().replace(/[.!?]+$/, "").trim();
      if (label.length >= 2) {
        label = label.charAt(0).toUpperCase() + label.slice(1);
        return { label, type: "to" };
      }
    }
  }

  return null;
}

// ── Direct "Add to list" intent ────────────────────────────────
// Detects when the user explicitly wants to add an item to a list.

function isAddToListIntent(query: string, listNames: string[] = [], contacts: any[] = []): { text: string; listName?: string } | null {
  const q = query.trim();

  // Sort list names by length descending so we match longer names first
  const sortedNames = [...listNames].sort((a, b) => b.length - a.length);

  // Try to match "add X to [Known List Name]" explicitly first
  if (sortedNames.length > 0) {
    for (const name of sortedNames) {
      // Escape list name for regex
      const safeName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const explicitPattern = new RegExp(`(?:add|put|throw|toss|stick|place|save)\\s+(.+?)\\s+(?:to|on|in(?:to)?|onto)\\s+(?:my\\s+|the\\s+)?(${safeName})(?:\\s+list)?$`, 'i');
      const m = q.match(explicitPattern);
      if (m && m[1]) {
        let text = m[1].trim().replace(/[.!?]+$/, "").replace(/^(?:a|an|the)\s+/i, "").trim();
        if (text.length >= 1) {
          text = text.charAt(0).toUpperCase() + text.slice(1);
          return { text, listName: m[2].trim() };
        }
      }
    }
  }

  const patterns: RegExp[] = [
    // "add X to my list" / "put X on my list" / "throw X on the list"
    /(?:add|put|throw|toss|stick|place|save)\s+(.+?)\s+(?:to|on|in(?:to)?|onto)\s+(?:my\s+|the\s+)?(?:list|to-?do(?:\s+list)?|todo(?:\s+list)?|checklist|shopping\s+list|grocery\s+list)/i,
    // "add to my list: X" / "add to list — X"
    /(?:add|put|save)\s+(?:to|on)\s+(?:my\s+|the\s+)?(?:list|to-?do|todo|checklist)[:;,—–-]?\s+(.+)/i,
    // "list item: X" / "new list item: X"
    /(?:new\s+)?list\s+item[:;,—–-]?\s+(.+)/i,
    // "add X as a list item"
    /(?:add|create|save)\s+(.+?)\s+as\s+(?:a\s+)?(?:list\s+item|to-?do|todo|task)/i,
    // "add X to my grocery list" etc. (captures list name)
    /(?:add|put|throw|toss|save)\s+(.+?)\s+(?:to|on)\s+(?:my\s+)?(\w+(?:\s+\w+)?)\s+list/i,
  ];

  for (const re of patterns) {
    const m = q.match(re);
    if (m && m[1]) {
      let text = m[1].trim().replace(/[.!?]+$/, "").replace(/^(?:a|an|the)\s+/i, "").trim();
      if (text.length >= 1) {
        // Capitalize first letter
        text = text.charAt(0).toUpperCase() + text.slice(1);
        return { text, listName: m[2]?.trim() };
      }
    }
  }

  // Fallback: If it matches "add X to Y" but Y is NOT a contact, assume it's a list creation intent
  const genericMatch = q.match(/^(?:add|put|throw|toss|save)\s+(.+?)\s+(?:to|on)\s+(?:my\s+|the\s+)?(.+?)$/i);
  if (genericMatch) {
    const text = genericMatch[1].trim();
    const targetName = genericMatch[2].trim();
    
    // Check if target is a known contact
    const isContact = contacts.some(c => 
      c.name.toLowerCase().includes(targetName.toLowerCase()) || 
      targetName.toLowerCase().includes(c.name.split(" ")[0].toLowerCase())
    );
    const hasNoteKeywords = /contact|profile/i.test(q);

    if (!isContact && !hasNoteKeywords) {
      let cleanText = text.replace(/[.!?]+$/, "").replace(/^(?:a|an|the)\s+/i, "").trim();
      cleanText = cleanText.charAt(0).toUpperCase() + cleanText.slice(1);
      return { text: cleanText, listName: targetName };
    }
  }

  return null;
}

// ── Actionable Statement Detection ──────────────────────────────
// When no calendar/availability intent matches, detect if the user typed
// something that could become a List Item, Reminder, or Counter.

interface ActionableDetection {
  subject: string;
  triggers: { word: string; start: number; end: number }[];
  suggestTask: boolean;
  suggestReminder: boolean;
  suggestCounter: boolean;
  suggestNote?: boolean;
  dateHint?: string; // raw date fragment extracted, e.g. "tomorrow"
}

// Pattern groups with named categories so we know what was matched
const TEMPORAL_RE = /\b(tomorrow|tonight|today|this\s+(?:morning|afternoon|evening|weekend)|next\s+(?:week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|(?:on|by)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|the\s+\d+(?:st|nd|rd|th)?|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d+)|in\s+\d+\s+(?:day|week|month|year)s?|at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)|(?:this|coming)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|(?:end\s+of\s+(?:the\s+)?(?:day|week|month))|(?:(?:early|late)\s+(?:morning|afternoon|evening|night)))\b/gi;

const MILESTONE_RE = /\b(birthday|anniversary|wedding|graduation|vacation|trip|holiday|exam|test|interview|launch|release|deadline|appointment|ceremony|concert|festival|reunion|party|flight|departure|arrival|moving\s+day|last\s+day|first\s+day|due\s+date|expir(?:y|es|ation)|renewal|recital|game|match|tournament|performance|exhibition|show|retirement|farewell|baby\s+shower|bridal\s+shower|prom|homecoming|commencement|orientation|check-?up|surgery|procedure)\b/gi;

const COUNTDOWN_RE = /\b(days?\s+(?:until|left|to\s+go|remaining|away|since|elapsed|ago)|countdown\s+(?:to|for)|count(?:ing)?\s+(?:down|since|days)|counting\s+down|coming\s+up|approaching|around\s+the\s+corner|is\s+(?:soon|near|close|approaching)|how\s+(?:many|long)\s+(?:days?|weeks?|months?|time)\s+(?:until|till|before|to|since)|track(?:ing)?\s+(?:days?|since|how\s+long)|start\s+(?:a\s+)?(?:counter|tracker|countdown|timer)|(?:counter|tracker|countdown|timer)\s+(?:for|since|to|until)|it'?s\s+been\s+\w+\s+since|since\s+(?:i\s+)?last\s+|time\s+(?:since|elapsed))\b/gi;

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

function detectActionableStatement(q: string): ActionableDetection | null {
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
  const suggestNote     = /^(?:add|save|note)(?:\s+note)?\s+(.+?)\s+to\s+(?:contact\s+|profile\s+)?(.+?)(?:'s?\s+(?:profile|contact))?$/i.test(text);

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

// ── Main Component ─────────────────────────────────────────────

export function AssistantPage() {
  const { profile, user } = useAuth();
  const location = useLocation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [captureBusy, setCaptureBusy] = useState(false);
  const { isSlashActive, suggestions: slashSuggestions, selectList: slashSelectList, partialQuery: slashPartialQuery, hasExactMatch: slashHasExactMatch } = useListAutocomplete(input, setInput);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [contacts, setContacts] = useState<any[]>([]);
  const [daysSinceData, setDaysSinceData] = useState<any[]>([]);
  const [myListsData, setMyListsData] = useState<any[]>([]);
  const [remindersData, setRemindersData] = useState<any[]>([]);
  const captureOptions = useMemo(() => classifyCapture(input, contacts, myListsData), [input, contacts, myListsData]);
  const suggestionCtx = useMemo(() => ({
    lists: myListsData.map((l: any) => ({ id: l.id, title: l.title })),
    contacts: contacts.map((c: any) => ({ id: c.id, name: c.name })),
    reminders: remindersData.map((r: any) => ({ id: r.id, title: r.title })),
  }), [myListsData, contacts, remindersData]);
  const {
    suggestions: querySuggestions,
    shouldShow: showQuerySuggestions,
    selectedIndex: qsSelectedIndex,
    setSelectedIndex: qsSetSelectedIndex,
    handleKeyDown: qsHandleKeyDown,
    selectedText: qsSelectedText,
  } = useQuerySuggestions(input, isSlashActive, suggestionCtx);
  const [groupPlanOpen, setGroupPlanOpen] = useState(false);
  const [groupSelectedIds, setGroupSelectedIds] = useState<Set<string>>(new Set());
  // Day Rundown Modal state (opened via "what am I doing tomorrow?" etc.)
  const [rundownOpen, setRundownOpen] = useState(false);
  const [rundownStart, setRundownStart] = useState<Date | undefined>();
  const [rundownEnd, setRundownEnd] = useState<Date | undefined>();
  const [rundownLabel, setRundownLabel] = useState<string | undefined>();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const initialMessageSentRef = useRef(false);
  // Track the last explicitly-requested duration so follow-up check queries inherit it
  const lastRequestedDurationRef = useRef<number | null>(null);
  // Track the last successful query context for conversational follow-ups (e.g. "2 pm?")
  const lastQueryContextRef = useRef<QueryContext | null>(null);
  // Track the last bookable slot so NL confirmations like "book it!" can create events
  const lastBookableSlotRef = useRef<BookableSlotContext | null>(null);
  // Track the last actionable suggestion so textual follow-ups like "List and Reminder" work
  const lastActionableSuggestionRef = useRef<{
    subject: string;
    originalText: string;
    dateHint?: string;
  } | null>(null);

  // Load Calendar Contacts + user data so Cal-e can personalise & recognise names
  useEffect(() => {
    getContacts().then(setContacts).catch(() => {});
    getDaysSince().then(setDaysSinceData).catch(() => {});
    getMyLists().then((l) => setMyListsData(Array.isArray(l) ? l : [])).catch(() => {});
    getReminders().then((r) => setRemindersData(Array.isArray(r) ? r : [])).catch(() => {});
  }, []);

  const showWelcome = messages.length === 0;
  const personalizedPrompts = useMemo(
    () => _buildPersonalizedPrompts(contacts, myListsData, daysSinceData, remindersData, { Zap, CalendarDays, Search, CalendarPlus, Bell, Timer, Users, FolderOpen }),
    [contacts, myListsData, daysSinceData, remindersData],
  );
  const rotatingPlaceholder = useRotatingPlaceholder(!groupPlanOpen && !input, personalizedPrompts.placeholders);

  // Only auto-scroll to bottom when new messages arrive (not on initial mount)
  const hasInteracted = useRef(false);
  useEffect(() => {
    if (messages.length > 0) hasInteracted.current = true;
    if (hasInteracted.current && scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages, loading]);

  const addAssistantMsg = (payload: MessagePayload) => {
    setMessages((prev) => [
      ...prev,
      { id: (Date.now() + 1).toString(), role: "assistant", payload, timestamp: new Date() },
    ]);
  };

  const handleQuickCapture = async (type: CaptureType, opt?: { targetList?: string; cleanSubject?: string }) => {
    const q = input.trim();
    if (!q || captureBusy) return;
    setCaptureBusy(true);
    try {
      const msg = await executeCapture(type, q, opt);
      toast.success(msg);
      setInput("");
    } catch (e: any) {
      console.error("Quick capture error:", e);
      if (e.message && e.message.startsWith("__CONTACT_NOT_FOUND__:")) {
        const parts = e.message.split(":");
        const contactName = parts[1];
        const initialNote = parts.slice(2).join(":");
        addAssistantMsg({
          kind: "addContact",
          initialName: contactName,
          initialNote: initialNote,
        });
        setInput("");
      } else {
        toast.error(e.message || "Failed to capture");
      }
    } finally {
      setCaptureBusy(false);
    }
  };

  const handleSend = async (overrideQuery?: string) => {
    let q = (overrideQuery ?? input).trim();
    if (!q || loading) return;

    // Handle commands
    if (q.toLowerCase() === "/capabilities" || q.toLowerCase().startsWith("/capabilities ")) {
      setInput("");
      const userMsg: Message = {
        id: Date.now().toString(),
        role: "user",
        payload: { kind: "text", text: q },
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);
      addAssistantMsg({
        kind: "text",
        text: "I can help you manage your time and tasks! Here are some things I can do:\n\n" +
              "• **Add tasks:** `Buy milk /Groceries`\n" +
              "• **Schedule events:** `Meet Sarah at 3pm tomorrow for 1 hour`\n" +
              "• **Set reminders:** `Remind me to submit report on Friday`\n" +
              "• **Find mutual free time:** `When can I meet with Liam this week?`\n" +
              "• **Search your data:** `/Find lunch` or `/Find meeting in Lists`\n" +
              "• **View list/contact contents:** `/Inside /Groceries` or `/Inside /Sarah`\n" +
              "• **Remove items:** `/Remove buy milk /Groceries` or `/Remove old note /Sarah`\n" +
              "• **Add notes to contacts:** `Liam loves spicy food /Liam`\n" +
              "• **Start a counter:** `Start a counter for days since I last exercised`"
      });
      return;
    }
    
    // Normalize Add/Find commands to standard forms
    if (q.match(/^\/Add(?=\s|$)/i)) {
      const stripped = q.replace(/^\/Add(?=\s|$)\s*/i, "").trim();
      const emptyAddMatch = q.match(/^\/Add\s*(?:\.\.\.)?(?:\s+\/(.+))?$/i);

      if (!stripped || emptyAddMatch) {
        const targetList = emptyAddMatch?.[1] || "";
        setInput("");
        const userMsg: Message = {
          id: Date.now().toString(),
          role: "user",
          payload: { kind: "text", text: q },
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, userMsg]);
        
        if (targetList) {
          addAssistantMsg({
            kind: "text",
            text: `What would you like to add to **${targetList}**?\n\nTry typing: \`/Add buy milk /${targetList}\``,
          });
        } else {
          addAssistantMsg({
            kind: "text",
            text: "What would you like to add? You can say something like:\n\n" +
                  "• `Buy milk /Groceries` — add to a specific list\n" +
                  "• `Call dentist tomorrow` — I'll suggest a reminder or event\n" +
                  "• `Pick up dry cleaning` — add to Quick Capture list",
          });
        }
        return;
      }
      q = stripped;
    } else if (q.match(/^\/Remove(?=\s|$)/i)) {
      const removeContent = q.replace(/^\/Remove(?=\s|$)\s*/i, "").trim();
      const emptyRemoveMatch = q.match(/^\/Remove\s*(?:\.\.\.)?(?:\s+\/(.+))?$/i);
      
      setInput("");
      const userMsg: Message = {
        id: Date.now().toString(),
        role: "user",
        payload: { kind: "text", text: q },
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);

      if (!removeContent || emptyRemoveMatch) {
        const targetList = emptyRemoveMatch?.[1] || "";
        if (targetList) {
          addAssistantMsg({
            kind: "text",
            text: `What would you like to remove from **${targetList}**?\n\nTry typing: \`/Remove milk /${targetList}\``,
          });
        } else {
          addAssistantMsg({
            kind: "text",
            text: "What would you like to remove? Use the format:\n\n" +
                  "• `/Remove buy milk /Groceries` — remove from a list\n" +
                  "• `/Remove old note /Sarah` — remove from a contact's notes",
          });
        }
        return;
      }

      // Execute remove directly
      setLoading(true);
      try {
        const msg = await executeRemove(q);
        toast.success(msg);
        addAssistantMsg({ kind: "text", text: `✓ ${msg}` });
        // Refresh lists data
        getMyLists().then((l) => setMyListsData(Array.isArray(l) ? l : [])).catch(() => {});
      } catch (e: any) {
        if (e.message === "__REMOVE_NO_TARGET__") {
          addAssistantMsg({
            kind: "text",
            text: "Please specify where to remove from using `/TargetName`. For example:\n\n" +
                  "• `/Remove buy milk /Groceries`\n" +
                  "• `/Remove old note /Sarah`",
          });
        } else {
          addAssistantMsg({ kind: "error", text: e.message || "Failed to remove item." });
        }
      } finally {
        setLoading(false);
      }
      return;
    } else if (q.match(/^\/Inside(?=\s|$)/i)) {
      const insideContent = q.replace(/^\/Inside(?=\s|$)\s*/i, "").trim();
      setInput("");
      const userMsg: Message = {
        id: Date.now().toString(),
        role: "user",
        payload: { kind: "text", text: q },
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);

      if (!insideContent) {
        addAssistantMsg({
          kind: "text",
          text: "What would you like to look inside? Use the format:\n\n" +
                "• `/Inside /Groceries` — view all items in a list\n" +
                "• `/Inside /Sarah` — view all notes for a contact",
        });
        return;
      }

      // Extract the /TargetName
      const targetMatch = insideContent.match(/^\/?(.+)$/);
      const targetName = targetMatch ? targetMatch[1].trim() : insideContent;

      if (!targetName) {
        addAssistantMsg({
          kind: "text",
          text: "Please specify a list or contact name. For example: `/Inside /Groceries`",
        });
        return;
      }

      setLoading(true);
      try {
        // Check contacts first
        const allContacts = contacts.length > 0 ? contacts : await getContacts().catch(() => []);
        const matchContact = allContacts.find(
          (c: any) =>
            c.name.toLowerCase() === targetName.toLowerCase() ||
            c.name.toLowerCase().startsWith(targetName.toLowerCase() + " ") ||
            targetName.toLowerCase() === c.name.split(" ")[0].toLowerCase()
        );

        if (matchContact) {
          if (!matchContact.notes?.trim()) {
            addAssistantMsg({
              kind: "text",
              text: `**${matchContact.name}** has no notes yet.\n\nYou can add notes with: \`note text /${matchContact.name.split(" ")[0]}\``,
            });
          } else {
            const noteLines = matchContact.notes.split("\n").filter((l: string) => l.trim());
            addAssistantMsg({
              kind: "text",
              text: `Notes for **${matchContact.name}** (${noteLines.length} note${noteLines.length === 1 ? "" : "s"}):\n\n${noteLines.map((l: string) => `- ${l.trim()}`).join("\n")}`,
            });
          }
          return;
        }

        // Check lists (personal then shared)
        const [myL, sharedL] = await Promise.all([
          getMyLists().catch(() => []),
          getSharedLists().catch(() => []),
        ]);

        let targetList: any = null;
        if (Array.isArray(myL)) {
          targetList = myL.find((l: any) => l.title.toLowerCase() === targetName.toLowerCase())
            || myL.find((l: any) => l.title.toLowerCase().includes(targetName.toLowerCase()))
            || null;
        }
        if (!targetList && Array.isArray(sharedL)) {
          targetList = sharedL.find((l: any) => l.title.toLowerCase() === targetName.toLowerCase())
            || sharedL.find((l: any) => l.title.toLowerCase().includes(targetName.toLowerCase()))
            || null;
        }

        if (targetList) {
          const items = targetList.items || [];
          const openItems = items.filter((i: any) => !i.completed);
          const doneItems = items.filter((i: any) => i.completed);

          if (items.length === 0) {
            addAssistantMsg({
              kind: "text",
              text: `**${targetList.title}** is empty.\n\nAdd items with: \`buy milk /${targetList.title}\``,
            });
          } else {
            let text = `**${targetList.title}** (${openItems.length} open, ${doneItems.length} done):\n\n`;
            if (openItems.length > 0) {
              text += openItems.map((i: any) => `- ${i.text}${i.due_date ? ` *(due ${i.due_date})*` : ""}`).join("\n");
            }
            if (doneItems.length > 0) {
              text += `\n\n~~Completed:~~\n${doneItems.map((i: any) => `- ~~${i.text}~~`).join("\n")}`;
            }
            addAssistantMsg({ kind: "text", text });
          }
          return;
        }

        addAssistantMsg({
          kind: "error",
          text: `Couldn't find a list or contact named "${targetName}".`,
        });
      } catch (e: any) {
        addAssistantMsg({ kind: "error", text: e.message || "Failed to look inside." });
      } finally {
        setLoading(false);
      }
      return;
    } else if (q.match(/^\/Find(?=\s|$)/i)) {
      const findQueryPart = q.replace(/^\/Find(?=\s|$)\s*/i, "").trim();
      
      // Check if it's literally "/Find" or "/Find ..." or "/Find ... in /ListName"
      const emptyFindMatch = q.match(/^\/Find\s*(?:\.\.\.)?(?:\s+in\s+\/(.+))?$/i);
      if (emptyFindMatch) {
        const targetList = emptyFindMatch[1];
        setInput("");
        const userMsg: Message = {
          id: Date.now().toString(),
          role: "user",
          payload: { kind: "text", text: q },
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, userMsg]);
        
        if (targetList) {
          addAssistantMsg({
            kind: "text",
            text: `What are you looking for in **${targetList}**?\n\nTry typing: \`/Find apples in /${targetList}\``,
          });
        } else {
          addAssistantMsg({
            kind: "text",
            text: "What are you looking for? Try something like:\n\n" +
                  "• `/Find toilet paper` — search across all lists\n" +
                  "• `/Find meeting in Reminders` — search in a specific category\n" +
                  "• `/Find birthday` — find matching counters, reminders, or list items",
          });
        }
        return;
      }
      // Find command is already handled below, just letting it fall through
    }

    // If input matches a quick capture, auto-execute it instead of passing to chat.
    const currentOptions = classifyCapture(q, contacts, myListsData);
    const slashOpt = currentOptions.find((o) => o.targetList);
    const noteOpt = currentOptions.find((o) => o.type === "note");

    if (slashOpt && !overrideQuery) {
      handleQuickCapture(slashOpt.type, { targetList: slashOpt.targetList, cleanSubject: slashOpt.cleanSubject });
      return;
    }
    
    if (noteOpt && !overrideQuery) {
      handleQuickCapture("note");
      return;
    }

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      payload: { kind: "text", text: q },
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const tz = profile?.timezone || getDeviceTimezone();

      // ── "Next Meeting" / "When do I get free today" ──
      const isNextMeeting = /(?:when|what)(?:\s+is|\'?s)\s+(?:my\s+)?next\s+meeting|find\s+(?:my\s+)?next\s+meeting/i.test(q);
      const isFreeToday = /(?:when|what time)\s+(?:do\s+i\s+get|am\s+i|will\s+i\s+be)\s+(?:free|done)\s+today|when\s+does\s+my\s+day\s+(?:end|finish)|when\s+do\s+i\s+(?:finish|get done)\s+today/i.test(q);
      
      if (isNextMeeting || isFreeToday) {
        try {
          const nowDt = DateTime.now().setZone(tz);
          const startOfToday = nowDt.startOf("day").toISO()!;
          const fetchEnd = isNextMeeting ? nowDt.plus({ days: 14 }).endOf("day").toISO()! : nowDt.plus({ days: 1 }).endOf("day").toISO()!;
          const evs = await getEvents(startOfToday, fetchEnd);
          
          if (isNextMeeting) {
            // Find the next event that is NOT a meal and starts after NOW
            const nextEvent = evs
              .filter((e: any) => DateTime.fromISO(e.start_at).setZone(tz) > nowDt)
              .filter((e: any) => !/(lunch|dinner|breakfast|meal)/i.test(e.title))
              .sort((a: any, b: any) => DateTime.fromISO(a.start_at).toMillis() - DateTime.fromISO(b.start_at).toMillis())[0];
            
            if (nextEvent) {
              const startDt = DateTime.fromISO(nextEvent.start_at).setZone(tz);
              const diffMinutes = Math.round(startDt.diff(nowDt, "minutes").minutes);
              
              let timeStr = "";
              if (diffMinutes < 60) {
                timeStr = `${diffMinutes} minute${diffMinutes !== 1 ? "s" : ""}`;
              } else if (diffMinutes < 24 * 60) {
                const diffHours = Math.floor(diffMinutes / 60);
                const remainderMins = diffMinutes % 60;
                timeStr = `${diffHours} hour${diffHours > 1 ? "s" : ""}${remainderMins > 0 ? ` and ${remainderMins} minute${remainderMins !== 1 ? "s" : ""}` : ""}`;
              } else {
                const diffDays = Math.floor(diffMinutes / (24 * 60));
                timeStr = `${diffDays} day${diffDays > 1 ? "s" : ""}`;
              }
              
              const isToday = startDt.hasSame(nowDt, "day");
              const isTomorrow = startDt.hasSame(nowDt.plus({ days: 1 }), "day");
              const dayStr = isToday ? "today" : isTomorrow ? "tomorrow" : `on ${startDt.toFormat("EEEE, MMM d")}`;
              
              addAssistantMsg({
                kind: "text",
                text: `Your next meeting is **"${nextEvent.title}"** at **${startDt.toFormat("h:mm a")}** ${dayStr}. That's in **${timeStr}**.`
              });
            } else {
              addAssistantMsg({
                kind: "text",
                text: "You don't have any upcoming meetings in the next 2 weeks!"
              });
            }
            setLoading(false);
            return;
          }
          
          if (isFreeToday) {
            // Find the latest end time of events today
            const todayEvs = evs.filter((e: any) => DateTime.fromISO(e.end_at).setZone(tz).hasSame(nowDt, "day"));
            if (todayEvs.length === 0) {
              addAssistantMsg({
                kind: "text",
                text: "You don't have any meetings today! You're already free."
              });
            } else {
              const lastEvent = todayEvs.sort((a: any, b: any) => DateTime.fromISO(b.end_at).toMillis() - DateTime.fromISO(a.end_at).toMillis())[0];
              const lastEnd = DateTime.fromISO(lastEvent.end_at).setZone(tz);
              
              if (lastEnd <= nowDt) {
                addAssistantMsg({
                  kind: "text",
                  text: `Your last meeting (**"${lastEvent.title}"**) ended at **${lastEnd.toFormat("h:mm a")}**. You are free now!`
                });
              } else {
                addAssistantMsg({
                  kind: "text",
                  text: `You get free today at **${lastEnd.toFormat("h:mm a")}**, after your **"${lastEvent.title}"** meeting.`
                });
              }
            }
            setLoading(false);
            return;
          }
        } catch (e: any) {
          console.error("Calendar fetch error:", e);
        }
      }

      // ── "Cancel" / "No thanks" dismiss ──
      if (/^(?:cancel|no thanks|never\s*mind|nah|nope|no)$/i.test(q)) {
        addAssistantMsg({ kind: "text", text: "No worries! What else can I help with?" });
        return;
      }

      // ���─ Contact Note Retrieval ──
      // E.g. "What is Sarah's favorite color?" or "What did I note about John?"
      const contactQuestionMatch = q.match(/^(?:what\s+(?:is|are|was|were)|what'?s|who\s+is)\s+(.+?)'?s\s+(.+)$/i) || q.match(/^(?:what\s+(?:did\s+i\s+note\s+about|do\s+i\s+have\s+on))\s+(.+)$/i);
      
      if (contactQuestionMatch && contacts.length > 0) {
        let contactName = (contactQuestionMatch[1] || contactQuestionMatch[3]).trim().replace(/^my\s+/i, '').replace(/^\//, '');
        let property = contactQuestionMatch[2]?.trim().replace(/[?!.]+$/, '');
        
        const c = contacts.find((c: any) => c.name.toLowerCase().includes(contactName.toLowerCase()) || contactName.toLowerCase().includes(c.name.split(" ")[0].toLowerCase()));
        
        if (c) {
          if (!c.notes || !c.notes.trim()) {
            addAssistantMsg({ kind: "text", text: `I found **${c.name}**, but you haven't saved any notes for them yet.` });
            return;
          }
          
          if (property) {
            const lines = c.notes.split('\n').filter((l: string) => l.trim().length > 0);
            const propWords = property.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2);
            
            const matches = lines.filter((line: string) => {
              const lineLower = line.toLowerCase();
              return lineLower.includes(property.toLowerCase()) || propWords.some(w => lineLower.includes(w));
            });

            if (matches.length > 0) {
              addAssistantMsg({ kind: "text", text: `Here's what I found in your notes for **${c.name}**:\n\n> "${matches.join('\n> ')}"` });
            } else {
              addAssistantMsg({ kind: "text", text: `I checked **${c.name}**'s notes, but couldn't find anything about "${property}".\n\nHere are all their notes:\n> ${lines.join('\n> ')}` });
            }
          } else {
            addAssistantMsg({ kind: "text", text: `Here are your notes for **${c.name}**:\n\n> ${c.notes.replace(/\n/g, '\n> ')}` });
          }
          return;
        }
      }

      // ── Find / Search commands ──
      // "/Find <query>" or "find <query> in <category|/ListName>" or "/Find <query> /ListName"
      // Group 1: search query, Group 2: category word, Group 3: slash-prefixed list name
      const findMatch = q.match(/^(?:\/find|find|search\s+for)\s+(.+?)(?:\s+(?:in\s+(?:my\s+)?)?(lists?|reminders?|counters?|countdowns?|contacts?|days?\s+since)|(?:\s+in\s+|\s+)\/(.+))?$/i);
      // Ensure we don't accidentally intercept meeting "find" availability queries like "find a time to meet"
      const isAvailabilityFind = /\b(?:time|slot|gap|opening|sec|minute|moment|window|break|chunk|stretch|breather)\b/i.test(findMatch ? findMatch[1] : "");
      
      if (findMatch && !isAvailabilityFind) {
        // Strip surrounding quotes from query for cleaner matching
        let query = findMatch[1].trim().replace(/^["']|["']$/g, "").toLowerCase();
        const categoryWord = findMatch[2]?.trim().toLowerCase();
        const slashListName = findMatch[3]?.trim().toLowerCase();
        // Determine scope: specific slash-list name, category filter, or "all"
        const scope = slashListName || categoryWord || null;

        let foundItems: string[] = [];

        // Fetch BOTH personal + shared lists fresh so we search everything
        let allLists: any[] = [];
        try {
          const [freshMyLists, sharedL] = await Promise.all([
            getMyLists().catch(() => []),
            getSharedLists().catch(() => []),
          ]);
          if (Array.isArray(freshMyLists)) allLists.push(...freshMyLists);
          if (Array.isArray(sharedL)) {
            const existingIds = new Set(allLists.map((l: any) => l.id));
            for (const sl of sharedL) {
              if (!existingIds.has(sl.id)) allLists.push(sl);
            }
          }
        } catch (_) {
          // Fall back to cached data if fetch fails
          allLists = [...myListsData];
        }

        // Search Lists (items AND list titles themselves)
        const searchLists = !scope || (scope && (scope.startsWith("list") || slashListName));
        if (searchLists) {
          for (const list of allLists) {
            if (slashListName && !list.title.toLowerCase().includes(slashListName)) continue;
            // Match list title itself
            if (list.title.toLowerCase().includes(query)) {
              const itemCount = (list.items || []).length;
              foundItems.push(`List: **${list.title}** (${itemCount} item${itemCount === 1 ? "" : "s"})`);
            }
            // Match items inside the list
            const items = list.items || [];
            for (const item of items) {
              if (item.text.toLowerCase().includes(query)) {
                foundItems.push(`List: **${list.title}** — ${item.text}`);
              }
            }
          }
        }

        // Search Reminders
        const searchReminders = !scope || (categoryWord && /^reminders?$/i.test(categoryWord));
        if (searchReminders) {
          for (const r of remindersData) {
            if (r.title.toLowerCase().includes(query)) {
              foundItems.push(`Reminder: ${r.title} (due ${DateTime.fromISO(r.due_at).toFormat("MMM d")})`);
            }
          }
        }

        // Search Counters
        const searchCounters = !scope || (categoryWord && /^(?:counters?|countdowns?|days?\s+since)$/i.test(categoryWord));
        if (searchCounters) {
          for (const c of daysSinceData) {
            if (c.label.toLowerCase().includes(query)) {
              foundItems.push(`Counter: ${c.label}`);
            }
          }
        }

        // Search Contacts (names and notes)
        const searchContacts = !scope || (categoryWord && /^contacts?$/i.test(categoryWord));
        if (searchContacts && contacts.length > 0) {
          for (const c of contacts) {
            if (c.name?.toLowerCase().includes(query)) {
              foundItems.push(`Contact: **${c.name}**${c.notes ? ` — ${c.notes.split("\n")[0].slice(0, 50)}` : ""}`);
            } else if (c.notes?.toLowerCase().includes(query)) {
              const matchLine = c.notes.split("\n").find((l: string) => l.toLowerCase().includes(query));
              if (matchLine) {
                foundItems.push(`Contact Note (**${c.name}**): ${matchLine.trim().slice(0, 60)}`);
              }
            }
          }
        }

        if (foundItems.length > 0) {
          addAssistantMsg({ kind: "text", text: `I found ${foundItems.length} match${foundItems.length === 1 ? "" : "es"}:\n\n- ${foundItems.join("\n- ")}` });
        } else {
          const scopeLabel = scope ? ` in ${categoryWord || slashListName}` : "";
          addAssistantMsg({ kind: "text", text: `I couldn't find anything matching "${query}"${scopeLabel} in your data.` });
        }
        return;
      }

      // ── "What am I doing [timeframe]?" → open Day Rundown Modal ──
      {
        const rundownIntentRE = /^(?:what(?:'?s|\s+(?:am|do|is|are|have|did))\s+(?:i\s+(?:doing|have|got)|(?:on|happening|going\s+on|planned|scheduled|up))(?:\s+(?:on|for|at))?\s*|(?:what|anything)\s+(?:on|for)\s+|(?:my\s+)?(?:schedule|plans?|agenda|calendar|day)\s+(?:for|on)\s+|(?:how(?:'?s|\s+(?:is|does)))\s+|(?:run\s+me\s+through|rundown\s+(?:for|of)|show\s+me)\s+(?:my\s+)?|(?:give\s+me\s+(?:a\s+)?(?:rundown|overview|briefing)\s+(?:for|of|on)\s+)|what(?:'?s|\s+does)\s+my\s+(.+?)\s+(?:look\s+)?like)(.*)$/i;
        const m = q.match(rundownIntentRE);
        if (m) {
          let timeRef = (m[1] || m[2] || "").trim();
          if (m[1] && m[2] && /^(?:schedule|calendar|day|agenda)$/i.test(m[1].trim())) {
             timeRef = m[2].replace(/^(?:for|on)\s+/i, "").trim();
          }
          if (!timeRef) timeRef = "today"; // default to today if missing

          const luxNow = DateTime.now().setZone(tz);
          const refDate = getChronoRefDate(luxNow);
          const parsed = chrono.parse(timeRef, refDate, { forwardDate: true });
          // Fix: bare day number ("the 23rd") should mean current month
          if (parsed.length > 0) {
            const sc = parsed[0].start;
            if (sc.isCertain("day") && !sc.isCertain("month") && !sc.isCertain("weekday")) {
              sc.assign("month", luxNow.month);
              sc.assign("year", luxNow.year);
            }
          }

          const SHORTCUTS: Record<string, () => { start: Date; end: Date; label: string }> = {
            "today": () => ({ start: luxNow.startOf("day").toJSDate(), end: luxNow.endOf("day").toJSDate(), label: "Today" }),
            "tonight": () => ({ start: luxNow.set({ hour: 17, minute: 0, second: 0 }).toJSDate(), end: luxNow.endOf("day").toJSDate(), label: "Tonight" }),
            "tmr": () => { const t = luxNow.plus({ days: 1 }); return { start: t.startOf("day").toJSDate(), end: t.endOf("day").toJSDate(), label: "Tomorrow" }; },
            "tmrw": () => { const t = luxNow.plus({ days: 1 }); return { start: t.startOf("day").toJSDate(), end: t.endOf("day").toJSDate(), label: "Tomorrow" }; },
            "tom": () => { const t = luxNow.plus({ days: 1 }); return { start: t.startOf("day").toJSDate(), end: t.endOf("day").toJSDate(), label: "Tomorrow" }; },
            "tomorrow": () => { const t = luxNow.plus({ days: 1 }); return { start: t.startOf("day").toJSDate(), end: t.endOf("day").toJSDate(), label: "Tomorrow" }; },
            "day after tomorrow": () => { const t = luxNow.plus({ days: 2 }); return { start: t.startOf("day").toJSDate(), end: t.endOf("day").toJSDate(), label: "Day After Tomorrow" }; },
            "day after tmr": () => { const t = luxNow.plus({ days: 2 }); return { start: t.startOf("day").toJSDate(), end: t.endOf("day").toJSDate(), label: "Day After Tomorrow" }; },
            "this week": () => { const s = luxNow.startOf("week"); const e = s.plus({ days: 6 }).endOf("day"); return { start: s.toJSDate(), end: e.toJSDate(), label: "This Week" }; },
            "next week": () => { const s = luxNow.startOf("week").plus({ weeks: 1 }); const e = s.plus({ days: 6 }).endOf("day"); return { start: s.toJSDate(), end: e.toJSDate(), label: "Next Week" }; },
            "this weekend": () => { const sat = luxNow.startOf("week").plus({ days: 5 }); const sun = sat.plus({ days: 1 }).endOf("day"); return { start: sat.startOf("day").toJSDate(), end: sun.toJSDate(), label: "This Weekend" }; },
            "next weekend": () => { const sat = luxNow.startOf("week").plus({ weeks: 1, days: 5 }); const sun = sat.plus({ days: 1 }).endOf("day"); return { start: sat.startOf("day").toJSDate(), end: sun.toJSDate(), label: "Next Weekend" }; },
            "rest of the week": () => { const e = luxNow.startOf("week").plus({ days: 6 }).endOf("day"); return { start: luxNow.startOf("day").toJSDate(), end: e.toJSDate(), label: "Rest of the Week" }; },
            "rest of this week": () => { const e = luxNow.startOf("week").plus({ days: 6 }).endOf("day"); return { start: luxNow.startOf("day").toJSDate(), end: e.toJSDate(), label: "Rest of the Week" }; },
          };

          const normalized = timeRef.toLowerCase().replace(/[?.!]+$/, "").trim();
          const shortcut = SHORTCUTS[normalized];
          let dateResult: { start: Date; end: Date; label: string } | null = shortcut ? shortcut() : null;

          if (!dateResult && parsed.length > 0) {
            const p = parsed[0];
            const startDt = p.start.date();
            const endDt = p.end ? p.end.date() : null;
            if (endDt && endDt.getTime() - startDt.getTime() > 24 * 3600 * 1000) {
              dateResult = { start: startDt, end: endDt, label: timeRef.charAt(0).toUpperCase() + timeRef.slice(1) };
            } else {
              const luxTarget = chronoDateToLuxon(startDt, tz);
              const dayLabel = luxTarget.hasSame(luxNow, "day")
                ? "Today"
                : luxTarget.hasSame(luxNow.plus({ days: 1 }), "day")
                  ? "Tomorrow"
                  : luxTarget.toFormat("EEEE, MMMM d");
              dateResult = {
                start: luxTarget.startOf("day").toJSDate(),
                end: luxTarget.endOf("day").toJSDate(),
                label: dayLabel,
              };
            }
          }

          if (dateResult) {
            setRundownStart(dateResult.start);
            setRundownEnd(dateResult.end);
            setRundownLabel(dateResult.label);
            setRundownOpen(true);
            
            // Set pending context so if they say "Book" it knows where to look
            lastQueryContextRef.current = {
              kind: "find",
              startAt: dateResult.start.toISOString(),
              endAt: dateResult.end.toISOString(),
              timezone: tz,
              mode: "any",
              durationMinutes: 30,
              query: q,
            };

            addAssistantMsg({
              kind: "clarify",
              text: `Here is your schedule for **${dateResult.label}**. Would you like to book a slot?`,
              options: [
                { label: "Book a slot", value: `Find a time ${timeRef}` }
              ]
            });
            return;
          }
        }
      }

      // ── "Brief me" → generate a text summary of the user's day ──
      if (/^(?:brief\s+me|brief\s+me\s+on\s+my\s+day|what'?s\s+(?:on\s+)?my\s+(?:day|agenda|schedule|calendar)\s*(?:look(?:ing)?\s+like)?|how(?:'?s|\s+is|\s+does)\s+my\s+(?:day|agenda|schedule|calendar)\s*(?:look(?:ing)?(?:\s+like)?)?|what\s+do\s+i\s+have\s+(?:today|on\s+(?:my\s+)?(?:schedule|calendar|agenda))|give\s+me\s+(?:a\s+)?(?:rundown|briefing|summary|overview)|my\s+day\s+at\s+a\s+glance|daily\s+briefing|morning\s+briefing|catch\s+me\s+up)[\s?.!]*$/i.test(q)) {
        try {
          const now = DateTime.now().setZone(tz);
          const dayEnd = now.endOf("day");
          const [ev, ml, ds, rm] = await Promise.all([
            getEvents(now.startOf("day").toISO()!, dayEnd.toISO()!).catch(() => []),
            getMyLists().catch(() => []),
            getDaysSince().catch(() => []),
            getReminders().catch(() => []),
          ]);

          const parts: string[] = [];
          const todayEvts = (Array.isArray(ev) ? ev : []).filter((e: any) => {
            const dur = (new Date(e.end_at).getTime() - new Date(e.start_at).getTime()) / 3600000;
            return dur < 23;
          });
          if (todayEvts.length > 0) {
            const totalMins = todayEvts.reduce((s: number, e: any) =>
              s + Math.max(0, (new Date(e.end_at).getTime() - new Date(e.start_at).getTime()) / 60000), 0);
            const h = Math.floor(totalMins / 60);
            const m = Math.round(totalMins % 60);
            const timeStr = h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
            parts.push(`📅 **${todayEvts.length} meeting${todayEvts.length !== 1 ? "s" : ""}** remaining today (${timeStr} blocked)`);
            const upcoming = todayEvts.slice(0, 3).map((e: any) =>
              `  • ${formatTimeInTz(e.start_at, tz)} — ${e.title}`
            );
            parts.push(upcoming.join("\n"));
          } else {
            parts.push("📅 **No meetings** remaining today — all yours!");
          }

          const todayStr = now.toISODate()!;
          const overdueItems: string[] = [];
          const dueTodayItems: string[] = [];
          for (const list of (Array.isArray(ml) ? ml : [])) {
            for (const item of (list.items || [])) {
              if (item.completed) continue;
              if (item.due_date && item.due_date < todayStr) overdueItems.push(item.text);
              else if (item.due_date === todayStr) dueTodayItems.push(item.text);
            }
          }
          if (overdueItems.length > 0)
            parts.push(`\n⚠️ **${overdueItems.length} overdue:** ${overdueItems.slice(0, 3).join(", ")}${overdueItems.length > 3 ? ` +${overdueItems.length - 3} more` : ""}`);
          if (dueTodayItems.length > 0)
            parts.push(`\n📋 **Due today:** ${dueTodayItems.slice(0, 3).join(", ")}${dueTodayItems.length > 3 ? ` +${dueTodayItems.length - 3} more` : ""}`);

          const todayRem = (Array.isArray(rm) ? rm : []).filter((r: any) => r.is_enabled && r.due_at?.startsWith(todayStr));
          if (todayRem.length > 0)
            parts.push(`\n🔔 **${todayRem.length} reminder${todayRem.length !== 1 ? "s" : ""}:** ${todayRem.slice(0, 3).map((r: any) => r.title).join(", ")}`);

          const cNotes: string[] = [];
          for (const c of (Array.isArray(ds) ? ds : [])) {
            if (c.type === "to" && c.target_date) {
              const dLeft = Math.round(DateTime.fromISO(c.target_date).diff(now.startOf("day"), "days").days);
              if (dLeft >= 0 && dLeft <= 7) cNotes.push(`**${c.label}** — ${dLeft === 0 ? "today!" : dLeft === 1 ? "tomorrow!" : `${dLeft}d left`}`);
            }
            if ((c.type || "since") === "since" && c.last_date) {
              const dS = Math.round(now.startOf("day").diff(DateTime.fromISO(c.last_date).startOf("day"), "days").days);
              if ([7, 14, 21, 30, 60, 90, 100].some(t => dS >= t && dS <= t + 2))
                cNotes.push(`**${c.label}** — ${dS}d ago`);
            }
          }
          if (cNotes.length > 0) parts.push(`\n📊 **Milestones:** ${cNotes.slice(0, 3).join(" · ")}`);

          const bNotes: string[] = [];
          for (const c of (Array.isArray(ds) ? ds : [])) {
            if (!c.label?.toLowerCase().includes("birthday")) continue;
            const td = c.target_date ? DateTime.fromISO(c.target_date) : DateTime.fromISO(c.last_date);
            let next = td.set({ year: now.year });
            if (next < now.startOf("day")) next = next.plus({ years: 1 });
            const dLeft = Math.round(next.diff(now.startOf("day"), "days").days);
            if (dLeft <= 7) {
              const nm = c.label.replace(/['']s?\s*birthday/i, "").replace(/birthday\s*(of|for)?\s*/i, "").trim() || c.label;
              bNotes.push(dLeft === 0 ? `🎂 **${nm}'s birthday is today!**` : `🎁 **${nm}** in ${dLeft}d`);
            }
          }
          if (bNotes.length > 0) parts.push("\n" + bNotes.join(" · "));

          if (parts.length <= 1 && todayEvts.length === 0)
            parts.push("\nLooks like a quiet day — nothing urgent! 🎉");

          addAssistantMsg({ kind: "text", text: parts.join("\n") });
        } catch (e: any) {
          addAssistantMsg({ kind: "error", text: `Briefing failed: ${e.message || e}` });
        }
        return;
      }

      // ── "Summarize my week" → weekly review summary ──
      if (/(?:summarize|summarise|summary\s+of|recap|review|wrap[\s-]*up|reflect\s+on)\s+(?:my|this|the)\s+week/i.test(q) ||
          /(?:my|this)\s+week(?:'?s)?\s+(?:summary|recap|review|in\s+review)/i.test(q) ||
          /(?:how\s+(?:was|did)\s+my\s+week|weekly\s+(?:summary|recap|review|reflection)|week(?:'?s)?\s+(?:summary|recap|review))/i.test(q)) {
        try {
          const luxNow = DateTime.now().setZone(tz);
          const weekStart = luxNow.startOf("week"); // Monday
          const weekEnd = luxNow.endOf("week");     // Sunday
          const prevWeekStart = weekStart.minus({ weeks: 1 });
          const prevWeekEnd = weekEnd.minus({ weeks: 1 });

          const [thisEv, lastEv, ml, ds] = await Promise.all([
            getEvents(weekStart.toISO()!, weekEnd.toISO()!).catch(() => []),
            getEvents(prevWeekStart.toISO()!, prevWeekEnd.toISO()!).catch(() => []),
            getMyLists().catch(() => []),
            getDaysSince().catch(() => []),
          ]);

          const filterTimed = (evs: any[]) => (Array.isArray(evs) ? evs : []).filter((e: any) => {
            const dur = (new Date(e.end_at).getTime() - new Date(e.start_at).getTime()) / 3600000;
            return dur < 23;
          });
          const thisFiltered = filterTimed(thisEv);
          const lastFiltered = filterTimed(lastEv);
          const thisMins = thisFiltered.reduce((s: number, e: any) =>
            s + Math.max(0, (new Date(e.end_at).getTime() - new Date(e.start_at).getTime()) / 60000), 0);
          const lastMins = lastFiltered.reduce((s: number, e: any) =>
            s + Math.max(0, (new Date(e.end_at).getTime() - new Date(e.start_at).getTime()) / 60000), 0);
          const h = Math.floor(thisMins / 60);
          const m = Math.round(thisMins % 60);
          const timeStr = h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
          const countDiff = thisFiltered.length - lastFiltered.length;

          const parts: string[] = [];
          parts.push(`**Your Week in Review** (${weekStart.toFormat("MMM d")} – ${weekEnd.toFormat("MMM d")})\n`);

          // Meetings
          let meetLine = `You had **${thisFiltered.length} meeting${thisFiltered.length !== 1 ? "s" : ""}** this week (**${timeStr}** total).`;
          if (countDiff !== 0) meetLine += ` That's **${Math.abs(countDiff)} ${Math.abs(countDiff) === 1 ? "meeting" : "meetings"} ${countDiff > 0 ? "more" : "fewer"}** than last week.`;
          else if (lastFiltered.length > 0) meetLine += " Same count as last week.";
          parts.push(meetLine);

          // List items
          const todayStr = luxNow.toISODate()!;
          let completed = 0, overdue = 0;
          const overdueLabels: string[] = [];
          for (const list of (Array.isArray(ml) ? ml : [])) {
            for (const item of (list.items || [])) {
              if (item.completed) { completed++; continue; }
              if (item.due_date && item.due_date < todayStr) {
                overdue++;
                overdueLabels.push(item.text);
              }
            }
          }
          let listLine = `\nYou completed **${completed} list item${completed !== 1 ? "s" : ""}**`;
          if (overdue > 0) listLine += ` but **${overdue} ${overdue === 1 ? "is" : "are"} overdue**: ${overdueLabels.slice(0, 3).join(", ")}${overdueLabels.length > 3 ? ` +${overdueLabels.length - 3} more` : ""}.`;
          else listLine += " and you're all caught up!";
          parts.push(listLine);

          // Stale counters
          const stale: string[] = [];
          for (const c of (Array.isArray(ds) ? ds : [])) {
            if ((c.type || "since") !== "since" || !c.last_date) continue;
            const dS = Math.round(luxNow.startOf("day").diff(DateTime.fromISO(c.last_date).startOf("day"), "days").days);
            if (dS >= 7) stale.push(`**${c.label}** (${dS} days)`);
          }
          if (stale.length > 0) parts.push(`\nYou haven't reset these counters in a while: ${stale.slice(0, 5).join(", ")}.`);

          // Time comparison
          if (lastMins > 0) {
            const pct = Math.round(Math.abs(thisMins - lastMins) / lastMins * 100);
            if (pct >= 10) {
              parts.push(`\nYour meeting load ${thisMins > lastMins ? "**increased**" : "**decreased**"} **${pct}%** compared to last week.`);
            }
          }

          if (stale.length > 0 || overdue > 0) {
            parts.push("\nNeed to take action? I can help you reschedule, reset counters, or plan your next week.");
          }

          addAssistantMsg({ kind: "text", text: parts.join("\n") });
        } catch (e: any) {
          addAssistantMsg({ kind: "error", text: `Weekly summary failed: ${e.message || e}` });
        }
        return;
      }

      // ── Group Plan mode: multi-contact availability find ──
      if (groupPlanOpen && groupSelectedIds.size >= 2) {
        const selectedContacts = contacts.filter((c) => groupSelectedIds.has(c.id));
        const contactNames = selectedContacts.map((c: any) => c.name);

        // Parse a date/time range from the query — skip keyword check since
        // the context (group plan panel) already establishes intent.
        let findIntent = parseIntent(q, tz, { skipKeywordCheck: true });
        if (!findIntent) {
          // Fallback: search across this coming week
          const now = DateTime.now().setZone(tz);
          findIntent = {
            type: "find",
            startAt: now.toISO()!,
            endAt: now.plus({ weeks: 1 }).endOf("day").toISO()!,
            mode: "any",
            durationMinutes: 60,
          };
        }

        // Ask for duration if user didn't specify one
        const panelExplicitDur = parseDuration(q);
        if (!panelExplicitDur) {
          const firstNames = contactNames.map((n) => n.split(" ")[0]);
          setPendingAction({
            kind: "meetingDurationNeeded",
            contactIds: selectedContacts.map((c: any) => c.id),
            contactNames,
            originalQuery: q,
            timezone: tz,
            startAt: findIntent.startAt,
            endAt: findIntent.endAt,
            mode: findIntent.mode,
          });
          setGroupPlanOpen(false);
          setGroupSelectedIds(new Set());
          addAssistantMsg({
            kind: "clarify",
            text: `Sure! How long should the meeting with **${firstNames.join(", ")}** be?`,
            options: [
              { label: "30 min", value: "30 minutes" },
              { label: "1 hour", value: "1 hour" },
              { label: "1.5 hours", value: "90 minutes" },
              { label: "2 hours", value: "2 hours" },
            ],
          });
          return;
        }

        // Fetch user free slots + all contacts' busy blocks in parallel
        const [userFreeResult, ...freeBusyResults] = await Promise.all([
          availabilityFind({
            rangeStart: findIntent.startAt,
            rangeEnd: findIntent.endAt,
            timezone: tz,
            mode: findIntent.mode,
            minDurationMinutes: findIntent.durationMinutes,
            limit: 30,
          }),
          ...selectedContacts.map((c: any) =>
            getContactFreeBusy(c.id, findIntent!.startAt, findIntent!.endAt)
          ),
        ]);

        // Subtract each contact's busy intervals from the user's free ranges
        let commonSlots: SlotData[] = userFreeResult.freeRanges;
        for (const fb of freeBusyResults) {
          const busy: Array<{ start_at: string; end_at: string }> = fb?.busy || [];
          commonSlots = subtractBusy(commonSlots, busy);
        }
        // Clip to reasonable daytime hours (activity-aware), then filter by requested duration
        const reqDur = findIntent.durationMinutes || 30;
        const actWin = getActivityTimeWindow(q);
        commonSlots = clipSlotsToReasonableHours(commonSlots, tz, reqDur, actWin?.startHour, actWin?.endHour)
          .slice(0, 10);

        setGroupPlanOpen(false);
        setGroupSelectedIds(new Set());

        lastRequestedDurationRef.current = reqDur;
        lastQueryContextRef.current = {
          kind: "groupFind", contactIds: selectedContacts.map((c: any) => c.id), contactNames,
          startAt: findIntent.startAt, endAt: findIntent.endAt, timezone: tz, mode: findIntent.mode,
          durationMinutes: reqDur, query: q,
        };
        if (commonSlots.length > 0) {
          const firstNames = contactNames.map((n: string) => n.split(" ")[0]);
          lastBookableSlotRef.current = {
            slot: commonSlots[0],
            suggestedTitle: `Meeting with ${firstNames.join(" & ")}`,
            contactNames,
            contactIds: selectedContacts.map((c: any) => c.id),
            timezone: tz,
          };
        }
        addAssistantMsg({
          kind: "groupFind",
          contactNames,
          contactIds: selectedContacts.map((c: any) => c.id),
          slots: commonSlots,
          timezone: tz,
          query: q,
          requestedDurationMinutes: reqDur,
        });
        return;
      }

      // ── Add a contact intent ──
      if (!pendingAction && isAddContactIntent(q)) {
        addAssistantMsg({ kind: "addContact" });
        return;
      }

      // ── NL booking confirmation ("book it!", "sounds good", etc.) ──
      if (!pendingAction && isBookingConfirmation(q) && lastBookableSlotRef.current) {
        const { slot, suggestedTitle, contactNames: slotContacts, contactIds: slotContactIds, timezone: slotTz } = lastBookableSlotRef.current;
        // Ask for an event title — offer the suggested title as a quick option
        setPendingAction({ kind: "bookingNeedsTitle", slot, suggestedTitle, timezone: slotTz, contactNames: slotContacts, contactIds: slotContactIds });
        const suggestions = suggestedTitle
          ? [{ label: suggestedTitle, value: suggestedTitle }]
          : [];
        addAssistantMsg({
          kind: "clarify",
          text: `Great, I'll book that slot! What should I call this event?`,
          options: suggestions,
        });
        return;
      }
      // Booking confirmation but no slot in context → helpful fallback
      if (!pendingAction && isBookingConfirmation(q)) {
        addAssistantMsg({
          kind: "text",
          text: "I'd love to book something for you, but I don't have a slot in mind yet! Try asking me to check or find availability first, then confirm to book.",
        });
        return;
      }

      // ── Handle pending follow-up actions ──
      if (pendingAction) {
        // ── Cancel detection — works for any pending action ──
        const cancelWords = /^(cancel|no|stop|nevermind|never\s*mind|nah|nope|quit|exit|abort)$/i;
        if (cancelWords.test(q)) {
          setPendingAction(null);
          addAssistantMsg({ kind: "text", text: "No problem — cancelled! What else can I help with?" });
          return;
        }

        if (pendingAction.kind === "bookingNeedsTitle") {
          const title = q.trim() || pendingAction.suggestedTitle || "Event";
          const { slot, timezone: slotTz, contactNames: bookingContacts, contactIds: bookingContactIds } = pendingAction;
          setPendingAction(null);
          const guestIds = bookingContactIds || lastQueryContextRef.current?.contactIds;
          const myName = profile?.name || user?.user_metadata?.name || user?.email?.split("@")[0] || "User";
          const descAttendees = bookingContacts && bookingContacts.length > 0 ? bookingContacts.join(", ") : "";
          const desc = descAttendees ? `${descAttendees} + Booked by ${myName}` : undefined;
          
          const ev = await createEvent({
            title,
            start_at: slot.start_at,
            end_at: slot.end_at,
            is_all_day: false,
            ...(desc ? { description: desc } : {}),
            ...(guestIds && guestIds.length > 0 ? { guest_contact_ids: guestIds } : {}),
          });
          lastBookableSlotRef.current = null;
          if (bookingContacts && bookingContacts.length > 0) {
            const guestCount = ev.guest_events?.length || 0;
            if (guestCount > 0) {
              toast.success(`Event also added to ${guestCount} guest calendar${guestCount !== 1 ? "s" : ""}`);
            }
            addAssistantMsg({ kind: "groupEventCreated", event: ev, contactNames: bookingContacts, timezone: slotTz });
          } else {
            addAssistantMsg({ kind: "eventCreated", event: ev, timezone: slotTz });
          }
          return;
        }

        if (pendingAction.kind === "eventBuilder") {
          const updated = { ...pendingAction };

          // ── Clean up reply: strip conversational prefixes ──
          let cleanReply = q.replace(/^(?:no[,.]?\s*|actually[,.]?\s*|wait[,.]?\s*|hmm[,.]?\s*|oh[,.]?\s*|well[,.]?\s*|but[,.]?\s*)/i, "").trim() || q;

          // Normalize "WEEKDAY next week" → "next WEEKDAY" for chrono
          cleanReply = cleanReply.replace(
            /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+next\s+week\b/i,
            (_, day) => `next ${day}`
          );

          // ── Check for duration FIRST (before chrono) ──
          // This prevents chrono from misinterpreting "1 hour" as "in 1 hour from now"
          const replyDur = parseDurationFromReply(q);

          // ── Universal parse: extract date/time info from the reply ──
          // Skip chrono entirely if the reply is purely a duration string
          let replyHasDate = false;
          let replyHasTime = false;

          // ── Detect "every [day/week/month]" recurrence patterns ──
          const everyMatch = cleanReply.match(
            /^every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|day|weekday|week|month|year)\b/i
          );
          if (everyMatch) {
            const recWord = everyMatch[1].toLowerCase();
            const weekdaysList = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];
            const nowDt = DateTime.now().setZone(updated.timezone);
            if (weekdaysList.includes(recWord)) {
              const targetDow = weekdaysList.indexOf(recWord) + 1;
              let nextDate = nowDt;
              while (nextDate.weekday !== targetDow) {
                nextDate = nextDate.plus({ days: 1 });
              }
              updated.date = nextDate.toISODate()!;
              updated.recurrence = { frequency: "weekly", interval: 1 };
              replyHasDate = true;
            } else if (recWord === "day" || recWord === "weekday") {
              updated.date = nowDt.toISODate()!;
              updated.recurrence = { frequency: "daily", interval: 1 };
              replyHasDate = true;
            } else if (recWord === "week") {
              updated.date = nowDt.toISODate()!;
              updated.recurrence = { frequency: "weekly", interval: 1 };
              replyHasDate = true;
            } else if (recWord === "month") {
              updated.date = nowDt.toISODate()!;
              updated.recurrence = { frequency: "monthly", interval: 1 };
              replyHasDate = true;
            } else if (recWord === "year") {
              updated.date = nowDt.toISODate()!;
              updated.recurrence = { frequency: "yearly", interval: 1 };
              replyHasDate = true;
            }
          }

          const isDurationOnly = replyDur !== null && /^\s*[\d.]+\s*(?:min(?:ute)?s?|hr(?:s)?|hours?)\s*$/i.test(q);

          if (!isDurationOnly) {
            const now = DateTime.now().setZone(updated.timezone);
            const refDateForReply = getChronoRefDate(now);
            const chronoParsed = chrono.parse(cleanReply, refDateForReply, { forwardDate: true });

            // Fix: bare day number ("the 23rd") should mean current month, not next
            if (chronoParsed.length > 0) {
              const sc = chronoParsed[0].start;
              if (sc.isCertain("day") && !sc.isCertain("month") && !sc.isCertain("weekday")) {
                sc.assign("month", now.month);
                sc.assign("year", now.year);
              }
            }

            if (chronoParsed.length > 0) {
              const comp = chronoParsed[0].start;
              // Accept both explicit day ("March 5") and weekday-inferred ("Saturday")
              if (comp.isCertain("day") || comp.isCertain("weekday")) {
                const dateDt = DateTime.fromObject({
                  year: comp.get("year"), month: comp.get("month"), day: comp.get("day"),
                }, { zone: updated.timezone });
                updated.date = dateDt.toISODate()!;
                replyHasDate = true;
              }
              if (comp.isCertain("hour")) {
                updated.time = { hour: comp.get("hour") ?? 0, minute: comp.get("minute") ?? 0 };
                replyHasTime = true;
              }
            }
          }

          if (replyDur) updated.duration = replyDur;

          // If we're on the location step and the reply isn't date/time/duration, treat it as location text
          if (updated.step === "location" && !replyHasDate && !replyHasTime && !replyDur) {
            updated.location = parseLocationFromReply(q);
          }

          // If on date step and reply had nothing useful, re-ask for date
          if (updated.step === "date" && !replyHasDate && !replyHasTime && !replyDur) {
            addAssistantMsg({ kind: "clarify", text: "I didn't catch the date. When should this be?", options: buildDateOptions(tz) });
            return;
          }

          // If on time step and reply had no useful info at all, re-ask for time
          if (updated.step === "time" && !replyHasTime && !replyHasDate && !replyDur) {
            addAssistantMsg({ kind: "clarify", text: "What time should this event be?", options: inferTimeOptions(updated.title) });
            return;
          }

          // If on duration step and reply had no useful info at all, re-ask
          if (updated.step === "duration" && !replyDur && !replyHasDate && !replyHasTime) {
            addAssistantMsg({ kind: "clarify", text: "How long should this event be?", options: [
              { label: "30 min", value: "30 minutes" },
              { label: "1 hour", value: "1 hour" },
              { label: "1.5 hours", value: "90 minutes" },
              { label: "2 hours", value: "2 hours" },
            ]});
            return;
          }

          // Handle recurrence end date step
          if (updated.step === "recurrenceEnd") {
            const recEndQ = q.trim().toLowerCase();
            if (/^(forever|never|no\s*end|indefinite|skip|none)$/i.test(recEndQ)) {
              updated.recurrenceEnd = null; // no end date
            } else {
              // Try relative durations: "1 month", "3 months", "6 months", "1 year"
              const relMatch = recEndQ.match(/^(\d+)\s*(month|months|year|years|week|weeks)$/i);
              if (relMatch) {
                const amt = parseInt(relMatch[1], 10);
                const unit = relMatch[2].toLowerCase().replace(/s$/, "");
                const baseDt = DateTime.fromISO(updated.date!, { zone: updated.timezone });
                const endDt = unit === "month" ? baseDt.plus({ months: amt }) : unit === "year" ? baseDt.plus({ years: amt }) : baseDt.plus({ weeks: amt });
                updated.recurrenceEnd = endDt.toISODate()!;
              } else {
                // Try chrono for absolute dates
                const nowDt = DateTime.now().setZone(updated.timezone);
                const refDateForReply = getChronoRefDate(nowDt);
                const chronoParsed = chrono.parse(cleanReply, refDateForReply, { forwardDate: true });
                // Fix: bare day number should mean current month
                if (chronoParsed.length > 0) {
                  const sc = chronoParsed[0].start;
                  if (sc.isCertain("day") && !sc.isCertain("month") && !sc.isCertain("weekday")) {
                    sc.assign("month", nowDt.month);
                    sc.assign("year", nowDt.year);
                  }
                }
                if (chronoParsed.length > 0) {
                  const comp = chronoParsed[0].start;
                  const endDt = DateTime.fromObject({
                    year: comp.get("year"), month: comp.get("month"), day: comp.get("day"),
                  }, { zone: updated.timezone });
                  updated.recurrenceEnd = endDt.toISODate()!;
                } else {
                  // Couldn't parse — re-ask
                  addAssistantMsg({ kind: "clarify", text: "I didn't catch the end date. When should this stop repeating?", options: [
                    { label: "Forever", value: "forever" },
                    { label: "3 months", value: "3 months" },
                    { label: "6 months", value: "6 months" },
                    { label: "1 year", value: "1 year" },
                  ]});
                  return;
                }
              }
            }
          }

          // ── Advance to the next missing field ──
          if (!updated.date) {
            updated.step = "date";
            setPendingAction(updated);
            addAssistantMsg({ kind: "clarify", text: `I'll create **${updated.title}**.\n\nWhat date should this be?`, options: buildDateOptions(tz) });
            return;
          }

          if (!updated.time) {
            updated.step = "time";
            const dateDt = DateTime.fromISO(updated.date, { zone: tz });
            setPendingAction(updated);
            addAssistantMsg({ kind: "clarify", text: `**${updated.title}** on **${dateDt.toFormat("EEE, MMM d")}**.\n\nWhat time?`, options: inferTimeOptions(updated.title) });
            return;
          }

          if (!updated.duration) {
            updated.step = "duration";
            const dateDt = DateTime.fromISO(updated.date, { zone: tz });
            setPendingAction(updated);
            addAssistantMsg({ kind: "clarify", text: `**${updated.title}** on **${dateDt.toFormat("EEE, MMM d")}** at **${formatTime24(updated.time)}**.\n\nHow long should it be?`, options: [
              { label: "30 min", value: "30 minutes" },
              { label: "1 hour", value: "1 hour" },
              { label: "1.5 hours", value: "90 minutes" },
              { label: "2 hours", value: "2 hours" },
            ]});
            return;
          }

          if (updated.location === undefined) {
            updated.step = "location";
            const dateDt = DateTime.fromISO(updated.date, { zone: tz });
            setPendingAction(updated);
            addAssistantMsg({ kind: "clarify", text: `**${updated.title}** on **${dateDt.toFormat("EEE, MMM d")}** at **${formatTime24(updated.time)}** for **${formatDuration(updated.duration)}**.\n\nWhere will this be? *(or tap Skip)*`, options: [
              { label: "Skip", value: "skip" },
            ]});
            return;
          }

          // Ask for recurrence end date if recurring and not yet answered
          if (updated.recurrence && updated.recurrenceEnd === undefined) {
            updated.step = "recurrenceEnd";
            const freqLabel = updated.recurrence.frequency;
            setPendingAction(updated);
            addAssistantMsg({ kind: "clarify", text: `This repeats **${freqLabel}**. When should it stop repeating?`, options: [
              { label: "Forever", value: "forever" },
              { label: "1 month", value: "1 month" },
              { label: "3 months", value: "3 months" },
              { label: "6 months", value: "6 months" },
              { label: "1 year", value: "1 year" },
            ]});
            return;
          }

          // All fields collected — create the event!
          const startDt = DateTime.fromISO(updated.date, { zone: updated.timezone }).set({ hour: updated.time.hour, minute: updated.time.minute });
          const endDt = startDt.plus({ minutes: updated.duration });
          const eventData: any = {
            title: updated.title,
            start_at: startDt.toISO(),
            end_at: endDt.toISO(),
            location: updated.location || null,
            is_all_day: false,
          };
          if (updated.recurrence) {
            const rule: any = { ...updated.recurrence };
            if (updated.recurrenceEnd) {
              rule.end_date = updated.recurrenceEnd;
            }
            eventData.recurrence_rule = rule;
          }
          const ev = await createEvent(eventData);
          setPendingAction(null);
          addAssistantMsg({ kind: "eventCreated", event: ev, timezone: tz });
          return;
        }

        if (pendingAction.kind === "reminderNeedsTime") {
          const time = parseTimeFromReply(q, pendingAction.timezone);

          // Also check if the reply contains a date (e.g. "March 5", "next Friday")
          const nowDt = DateTime.now().setZone(pendingAction.timezone);
          const chronoParsed = chrono.parse(q, getChronoRefDate(nowDt), { forwardDate: true });
          // Fix: bare day number ("the 23rd") should mean current month
          if (chronoParsed.length > 0) {
            const sc = chronoParsed[0].start;
            if (sc.isCertain("day") && !sc.isCertain("month") && !sc.isCertain("weekday")) {
              sc.assign("month", nowDt.month);
              sc.assign("year", nowDt.year);
            }
          }
          const hasDate = chronoParsed.length > 0 && (
            chronoParsed[0].start.isCertain("day") || chronoParsed[0].start.isCertain("month") || chronoParsed[0].start.isCertain("weekday")
          );
          const hasTime = chronoParsed.length > 0 && chronoParsed[0].start.isCertain("hour");

          if (hasDate && hasTime) {
            // User provided both date and time (e.g. "March 5 12pm") — create directly
            const cp = chronoParsed[0].start;
            const dueAt = DateTime.fromISO(pendingAction.dateIso).setZone(pendingAction.timezone).set({
              year: cp.get("year") ?? nowDt.year,
              month: cp.get("month") ?? nowDt.month,
              day: cp.get("day") ?? nowDt.day,
              hour: cp.get("hour") ?? 0,
              minute: cp.get("minute") ?? 0,
            });
            const rem = await createReminder({
              title: pendingAction.task,
              schedule_type: "one_off",
              due_at: dueAt.toISO(),
              timezone: pendingAction.timezone,
            });
            setPendingAction(null);
            addAssistantMsg({ kind: "reminderCreated", reminder: rem, timezone: tz });
            return;
          }

          if (hasDate && !hasTime) {
            // User changed the date (e.g. "March 5") — update date and re-ask for time
            const cp = chronoParsed[0].start;
            const newDate = DateTime.fromISO(pendingAction.dateIso).setZone(pendingAction.timezone).set({
              year: cp.get("year") ?? nowDt.year,
              month: cp.get("month") ?? nowDt.month,
              day: cp.get("day") ?? nowDt.day,
            });
            setPendingAction({
              ...pendingAction,
              dateIso: newDate.toISO()!,
            });
            addAssistantMsg({
              kind: "clarify",
              text: `Got it — I'll remind you to **${pendingAction.task}** on **${newDate.toFormat("EEE, MMM d")}** instead.\n\nWhat time should I set the reminder for?`,
              options: inferTimeOptions(pendingAction.task),
            });
            return;
          }

          if (time) {
            // Pure time reply (e.g. "12pm", "2:30 PM")
            const dueAt = DateTime.fromISO(pendingAction.dateIso).setZone(pendingAction.timezone).set({ hour: time.hour, minute: time.minute });
            const rem = await createReminder({
              title: pendingAction.task,
              schedule_type: "one_off",
              due_at: dueAt.toISO(),
              timezone: pendingAction.timezone,
            });
            setPendingAction(null);
            addAssistantMsg({ kind: "reminderCreated", reminder: rem, timezone: tz });
            return;
          }

          // Neither date nor time recognized
          addAssistantMsg({ kind: "clarify", text: "I didn't catch the time. When should I remind you?", options: inferTimeOptions(pendingAction.task) });
          return;
        }

        if (pendingAction.kind === "meetingDurationNeeded") {
          const dur = parseDurationFromReply(q);
          if (!dur) {
            addAssistantMsg({
              kind: "clarify",
              text: "I didn't catch that — how long should the meeting be?",
              options: [
                { label: "30 min", value: "30 minutes" },
                { label: "1 hour", value: "1 hour" },
                { label: "1.5 hours", value: "90 minutes" },
                { label: "2 hours", value: "2 hours" },
              ],
            });
            return;
          }
          const { contactIds, contactNames: cNames, timezone: ptz, startAt, endAt, mode, originalQuery } = pendingAction;
          setPendingAction(null);

          // Fetch user free + all contacts busy in parallel
          const [userFreeResult, ...freeBusyResults] = await Promise.all([
            availabilityFind({ rangeStart: startAt, rangeEnd: endAt, timezone: ptz, mode, minDurationMinutes: dur, limit: 30 }),
            ...contactIds.map((id) => getContactFreeBusy(id, startAt, endAt)),
          ]);

          let commonSlots: SlotData[] = userFreeResult.freeRanges;
          for (const fb of freeBusyResults) {
            commonSlots = subtractBusy(commonSlots, fb?.busy || []);
          }
          const actWinDur = getActivityTimeWindow(originalQuery);
          commonSlots = clipSlotsToReasonableHours(commonSlots, ptz, dur, actWinDur?.startHour, actWinDur?.endHour)
            .slice(0, 10);

          lastRequestedDurationRef.current = dur;
          if (contactIds.length === 1) {
            lastQueryContextRef.current = {
              kind: "contactFind", contactIds, contactNames: cNames,
              startAt, endAt, timezone: ptz, mode, durationMinutes: dur, query: originalQuery,
            };
            if (commonSlots.length > 0) {
              lastBookableSlotRef.current = {
                slot: commonSlots[0],
                suggestedTitle: `Meeting with ${cNames[0].split(" ")[0]}`,
                contactNames: cNames,
                contactIds,
                timezone: ptz,
              };
            }
            addAssistantMsg({
              kind: "contactFind",
              contactName: cNames[0],
              contactId: contactIds[0],
              slots: commonSlots,
              timezone: ptz,
              query: originalQuery,
              requestedDurationMinutes: dur,
            });
          } else {
            lastQueryContextRef.current = {
              kind: "groupFind", contactIds, contactNames: cNames,
              startAt, endAt, timezone: ptz, mode, durationMinutes: dur, query: originalQuery,
            };
            if (commonSlots.length > 0) {
              const firstNames = cNames.map((n) => n.split(" ")[0]);
              lastBookableSlotRef.current = {
                slot: commonSlots[0],
                suggestedTitle: `Meeting with ${firstNames.join(" & ")}`,
                contactNames: cNames,
                contactIds,
                timezone: ptz,
              };
            }
            addAssistantMsg({
              kind: "groupFind",
              contactNames: cNames,
              contactIds,
              slots: commonSlots,
              timezone: ptz,
              query: originalQuery,
              requestedDurationMinutes: dur,
            });
          }
          return;
        }
      }

      // ── Multi-contact (Group Plan) via natural language ──────────────────────
      // Detect "meet with Liam and Sarah", "find time with Liam, Sarah, and Dave", etc.
      if (contacts.length >= 2 && hasMeetIntent(q)) {
        const ql = q.toLowerCase();
        const matchedContacts = contacts.filter((c: any) => {
          const firstName = c.name.split(" ")[0].toLowerCase();
          return ql.includes(firstName);
        });
        if (matchedContacts.length >= 2) {
          const contactNames = matchedContacts.map((c: any) => c.name);
          // Strip all matched names from query to parse date range
          let strippedQ = q;
          for (const c of matchedContacts) {
            strippedQ = strippedQ.replace(new RegExp(`\\b${escapeRegex(c.name.split(" ")[0])}\\b`, "gi"), "").replace(/\s{2,}/g, " ").trim();
          }
          let findIntent = parseIntent(strippedQ || q, tz, { skipKeywordCheck: true });
          if (!findIntent) {
            const now = DateTime.now().setZone(tz);
            findIntent = {
              type: "find",
              startAt: now.toISO()!,
              endAt: now.plus({ weeks: 1 }).endOf("day").toISO()!,
              mode: "any",
              durationMinutes: 60,
            };
          }

          // Ask for duration if user didn't specify one
          const nlExplicitDur = parseDuration(q);
          if (!nlExplicitDur) {
            const firstNames = contactNames.map((n) => n.split(" ")[0]);
            setPendingAction({
              kind: "meetingDurationNeeded",
              contactIds: matchedContacts.map((c: any) => c.id),
              contactNames,
              originalQuery: q,
              timezone: tz,
              startAt: findIntent.startAt,
              endAt: findIntent.endAt,
              mode: findIntent.mode,
            });
            addAssistantMsg({
              kind: "clarify",
              text: `Sure! How long should the meeting with **${firstNames.join(", ")}** be?`,
              options: [
                { label: "30 min", value: "30 minutes" },
                { label: "1 hour", value: "1 hour" },
                { label: "1.5 hours", value: "90 minutes" },
                { label: "2 hours", value: "2 hours" },
              ],
            });
            return;
          }

          const [userFreeResult, ...freeBusyResults] = await Promise.all([
            availabilityFind({
              rangeStart: findIntent.startAt,
              rangeEnd: findIntent.endAt,
              timezone: tz,
              mode: findIntent.mode,
              minDurationMinutes: findIntent.durationMinutes,
              limit: 30,
            }),
            ...matchedContacts.map((c: any) =>
              getContactFreeBusy(c.id, findIntent!.startAt, findIntent!.endAt)
            ),
          ]);

          let commonSlots: SlotData[] = userFreeResult.freeRanges;
          for (const fb of freeBusyResults) {
            commonSlots = subtractBusy(commonSlots, fb?.busy || []);
          }
          // Clip to reasonable daytime hours (activity-aware), then filter by requested duration
          const nlReqDur = findIntent.durationMinutes || 30;
          const nlActWin = getActivityTimeWindow(q);
          commonSlots = clipSlotsToReasonableHours(commonSlots, tz, nlReqDur, nlActWin?.startHour, nlActWin?.endHour)
            .slice(0, 10);

          lastRequestedDurationRef.current = nlReqDur;
          lastQueryContextRef.current = {
            kind: "groupFind", contactIds: matchedContacts.map((c: any) => c.id), contactNames,
            startAt: findIntent.startAt, endAt: findIntent.endAt, timezone: tz, mode: findIntent.mode,
            durationMinutes: nlReqDur, query: q,
          };
          if (commonSlots.length > 0) {
            const firstNames = contactNames.map((n: string) => n.split(" ")[0]);
            lastBookableSlotRef.current = {
              slot: commonSlots[0],
              suggestedTitle: `Meeting with ${firstNames.join(" & ")}`,
              contactNames,
              contactIds: matchedContacts.map((c: any) => c.id),
              timezone: tz,
            };
          }
          addAssistantMsg({
            kind: "groupFind",
            contactNames,
            contactIds: matchedContacts.map((c: any) => c.id),
            slots: commonSlots,
            timezone: tz,
            query: q,
            requestedDurationMinutes: nlReqDur,
          });
          return;
        }
      }

      // ── Contact-aware availability queries ───────────────────────────────��──
      let payload: MessagePayload;
      const contactHit = detectContactQuery(q, contacts);
      if (contactHit) {
        const { contact, kind } = contactHit;
        // Extract a date/time intent from the query (ignoring the contact name)
        const strippedQ = q.replace(new RegExp(`\\b${escapeRegex(contact.name.split(" ")[0])}\\b`, "gi"), "").replace(/\s{2,}/g, " ").trim();
        const baseIntent = parseIntent(strippedQ || q, tz, { skipKeywordCheck: true });

        if (kind === "find" && !baseIntent && hasMeetIntent(q)) {
          addAssistantMsg({
            kind: "bookingLink",
            contactName: contact.name,
            contactId: contact.id,
          });
          return;
        }

        if (kind === "check" && baseIntent) {
          const [userAvail, freeBusy] = await Promise.all([
            availabilityCheck({ startAt: baseIntent.startAt, endAt: baseIntent.endAt, timezone: tz }),
            getContactFreeBusy(contact.id, baseIntent.startAt, baseIntent.endAt),
          ]);
          const busy: Array<{ start_at: string; end_at: string }> = freeBusy?.busy || [];
          const s = new Date(baseIntent.startAt).getTime();
          const e = new Date(baseIntent.endAt).getTime();
          const contactFree = !busy.some((b: any) => new Date(b.start_at).getTime() < e && new Date(b.end_at).getTime() > s);
          lastQueryContextRef.current = {
            kind: "contactCheck", contactIds: [contact.id], contactNames: [contact.name],
            startAt: baseIntent.startAt, endAt: baseIntent.endAt, timezone: tz, mode: baseIntent.mode,
            durationMinutes: baseIntent.durationMinutes, query: q,
          };
          if (userAvail.isFree && contactFree) {
            const cFirst = contact.name.split(" ")[0];
            lastBookableSlotRef.current = {
              slot: { start_at: baseIntent.startAt, end_at: baseIntent.endAt },
              suggestedTitle: `Meeting with ${cFirst}`,
              contactNames: [contact.name],
              contactIds: [contact.id],
              timezone: tz,
            };
          }
          payload = {
            kind: "contactCheck",
            contactName: contact.name,
            contactId: contact.id,
            userFree: userAvail.isFree,
            contactFree,
            requestedRange: { start: baseIntent.startAt, end: baseIntent.endAt },
            timezone: tz,
            busyBlocks: busy,
          };
        } else {
          // "find" -- look for common free slots
          const findIntent = baseIntent || (() => {
            // Fallback: "next week"
            const now = DateTime.now().setZone(tz);
            return {
              type: "find" as const,
              startAt: now.startOf("week").plus({ weeks: 1 }).toISO()!,
              endAt:   now.startOf("week").plus({ weeks: 1 }).endOf("week").toISO()!,
              mode: "any" as const,
              durationMinutes: 60,
            };
          })();

          // Ask for duration if user didn't specify one
          const singleExplicitDur = parseDuration(q);
          if (!singleExplicitDur) {
            const cFirstName = contact.name.split(" ")[0];
            setPendingAction({
              kind: "meetingDurationNeeded",
              contactIds: [contact.id],
              contactNames: [contact.name],
              originalQuery: q,
              timezone: tz,
              startAt: findIntent.startAt,
              endAt: findIntent.endAt,
              mode: findIntent.mode,
            });
            addAssistantMsg({
              kind: "clarify",
              text: `Got it! How long should the meeting with **${cFirstName}** be?`,
              options: [
                { label: "30 min", value: "30 minutes" },
                { label: "1 hour", value: "1 hour" },
                { label: "1.5 hours", value: "90 minutes" },
                { label: "2 hours", value: "2 hours" },
              ],
            });
            return;
          }

          const [userFreeResult, freeBusy] = await Promise.all([
            availabilityFind({
              rangeStart: findIntent.startAt,
              rangeEnd: findIntent.endAt,
              timezone: tz,
              mode: findIntent.mode,
              minDurationMinutes: findIntent.durationMinutes,
              limit: 15,
            }),
            getContactFreeBusy(contact.id, findIntent.startAt, findIntent.endAt),
          ]);
          const contactBusy: Array<{ start_at: string; end_at: string }> = freeBusy?.busy || [];
          const contactReqDur = findIntent.durationMinutes || 30;
          const singleActWin = getActivityTimeWindow(q);
          const commonSlots = clipSlotsToReasonableHours(
            subtractBusy(userFreeResult.freeRanges, contactBusy),
            tz,
            contactReqDur,
            singleActWin?.startHour,
            singleActWin?.endHour,
          ).slice(0, 8);
          lastRequestedDurationRef.current = contactReqDur;
          lastQueryContextRef.current = {
            kind: "contactFind", contactIds: [contact.id], contactNames: [contact.name],
            startAt: findIntent.startAt, endAt: findIntent.endAt, timezone: tz, mode: findIntent.mode,
            durationMinutes: contactReqDur, query: q,
          };
          if (commonSlots.length > 0) {
            lastBookableSlotRef.current = {
              slot: commonSlots[0],
              suggestedTitle: `Meeting with ${contact.name.split(" ")[0]}`,
              contactNames: [contact.name],
              contactIds: [contact.id],
              timezone: tz,
            };
          }
          payload = {
            kind: "contactFind",
            contactName: contact.name,
            contactId: contact.id,
            slots: commonSlots,
            timezone: tz,
            query: q,
            requestedDurationMinutes: contactReqDur,
          };
        }

        addAssistantMsg(payload);
        return;
      }

      // ── Non-contact meet intent: user mentions a name not in contacts ────
      // Route to user-only availability find (no combined calendar overlay)
      const nonContactMeet = detectNonContactMeetName(q, contacts);
      if (nonContactMeet) {
        const { name, strippedQuery } = nonContactMeet;
        // Try parseIntent on the stripped query; fall back to a sensible default
        let meetIntent = parseIntent(strippedQuery || q, tz, { skipKeywordCheck: true });
        if (!meetIntent) {
          // parseIntent couldn't extract a date range — build a default (rest of today → end of day)
          const now = DateTime.now().setZone(tz);
          meetIntent = {
            type: "find",
            startAt: now.toISO()!,
            endAt: now.endOf("day").toISO()!,
            mode: "any",
            durationMinutes: 30,
          };
        }
        const result = await availabilityFind({
          rangeStart: meetIntent.startAt,
          rangeEnd: meetIntent.endAt,
          timezone: tz,
          mode: meetIntent.mode,
          minDurationMinutes: meetIntent.durationMinutes,
          limit: 20,
        });
        const meetActWin = getActivityTimeWindow(q);
        result.freeRanges = clipSlotsToReasonableHours(result.freeRanges, tz, meetIntent.durationMinutes, meetActWin?.startHour, meetActWin?.endHour).slice(0, 8);
        result.requestedDurationMinutes = meetIntent.durationMinutes;
        lastRequestedDurationRef.current = meetIntent.durationMinutes;
        lastQueryContextRef.current = {
          kind: "find", startAt: meetIntent.startAt, endAt: meetIntent.endAt,
          timezone: tz, mode: meetIntent.mode, durationMinutes: meetIntent.durationMinutes, query: q,
        };
        if (result.freeRanges.length > 0) {
          lastBookableSlotRef.current = {
            slot: result.freeRanges[0],
            suggestedTitle: `Meeting with ${name}`,
            timezone: tz,
          };
        }
        addAssistantMsg({
          kind: "find",
          result,
          timezone: tz,
          query: q,
        });
        return;
      }

      // ── "More slots" / "more options" follow-up ───────────���──────
      // If the user says "more slots", "more options", "show more", etc. and we have
      // a contactFind or groupFind context, re-run with a wider range instead of
      // falling through to solo find.
      const moreSlotsMatch = /^(?:more\s+(?:slots?|options?|times?|results?)|show\s+(?:me\s+)?more|any\s+(?:more|other)\s+(?:slots?|options?|times?)|other\s+(?:slots?|options?|times?)|expand|wider\s+range|keep\s+(?:looking|searching)|find\s+more)\s*[.?!]*$/i.test(q.trim());
      const moreCtx = lastQueryContextRef.current;
      if (moreSlotsMatch && moreCtx && (moreCtx.kind === "contactFind" || moreCtx.kind === "groupFind" || moreCtx.kind === "contactCheck")) {
        const dur = moreCtx.durationMinutes || lastRequestedDurationRef.current || 30;
        // Widen range: extend end by 3 more days from current context end
        const ctxEnd = DateTime.fromISO(moreCtx.endAt).setZone(tz);
        const newEnd = ctxEnd.plus({ days: 3 }).endOf("day");
        const rangeStart = moreCtx.startAt;
        const rangeEnd = newEnd.toISO()!;
        const cIds = moreCtx.contactIds || [];
        const cNames = moreCtx.contactNames || [];

        if (cIds.length === 1) {
          const [userFreeResult, freeBusy] = await Promise.all([
            availabilityFind({ rangeStart, rangeEnd, timezone: tz, mode: moreCtx.mode, minDurationMinutes: dur, limit: 30 }),
            getContactFreeBusy(cIds[0], rangeStart, rangeEnd),
          ]);
          const contactBusy: Array<{ start_at: string; end_at: string }> = freeBusy?.busy || [];
          const actWin = getActivityTimeWindow(moreCtx.query);
          const commonSlots = clipSlotsToReasonableHours(
            subtractBusy(userFreeResult.freeRanges, contactBusy), tz, dur, actWin?.startHour, actWin?.endHour,
          ).slice(0, 10);
          lastQueryContextRef.current = { ...moreCtx, kind: "contactFind", startAt: rangeStart, endAt: rangeEnd, query: q };
          lastRequestedDurationRef.current = dur;
          if (commonSlots.length > 0) {
            lastBookableSlotRef.current = {
              slot: commonSlots[0],
              suggestedTitle: `Meeting with ${cNames[0]?.split(" ")[0] || "Contact"}`,
              contactNames: cNames,
              contactIds: cIds,
              timezone: tz,
            };
          }
          addAssistantMsg({
            kind: "contactFind",
            contactName: cNames[0] || "Contact",
            contactId: cIds[0],
            slots: commonSlots,
            timezone: tz,
            query: moreCtx.query,
            requestedDurationMinutes: dur,
          });
          return;
        } else if (cIds.length >= 2) {
          const [userFreeResult, ...fbResults] = await Promise.all([
            availabilityFind({ rangeStart, rangeEnd, timezone: tz, mode: moreCtx.mode, minDurationMinutes: dur, limit: 30 }),
            ...cIds.map((id) => getContactFreeBusy(id, rangeStart, rangeEnd)),
          ]);
          let commonSlots: SlotData[] = userFreeResult.freeRanges;
          for (const fb of fbResults) { commonSlots = subtractBusy(commonSlots, fb?.busy || []); }
          const actWin = getActivityTimeWindow(moreCtx.query);
          commonSlots = clipSlotsToReasonableHours(commonSlots, tz, dur, actWin?.startHour, actWin?.endHour).slice(0, 10);
          lastQueryContextRef.current = { ...moreCtx, kind: "groupFind", startAt: rangeStart, endAt: rangeEnd, query: q };
          lastRequestedDurationRef.current = dur;
          if (commonSlots.length > 0) {
            const firstNames = cNames.map((n) => n.split(" ")[0]);
            lastBookableSlotRef.current = {
              slot: commonSlots[0],
              suggestedTitle: `Meeting with ${firstNames.join(" & ")}`,
              contactNames: cNames,
              contactIds: cIds,
              timezone: tz,
            };
          }
          addAssistantMsg({
            kind: "groupFind",
            contactNames: cNames,
            contactIds: cIds,
            slots: commonSlots,
            timezone: tz,
            query: moreCtx.query,
            requestedDurationMinutes: dur,
          });
          return;
        }
      }

      // ── Direct counter creation intent (must be before activity/travel/date detection to prevent loops) ──
      const counterIntent = isDaysSinceIntent(q);
      if (counterIntent) {
        try {
          const todayIso = DateTime.now().setZone(tz).toISODate()!;
          if (counterIntent.type === "since") {
            await createDaysSince({
              label: counterIntent.label,
              type: "since",
              last_date: todayIso,
            });
            addAssistantMsg({
              kind: "text",
              text: `Done! I've created a **Days Since** counter for **"${counterIntent.label}"**, starting from today. You can find it in the **Track** section. 🎯`,
            });
          } else {
            // Try to parse a date for "to" counters
            const parsed = chrono.parseDate(counterIntent.label, getChronoRefDate(DateTime.now().setZone(tz)), { forwardDate: true });
            const targetDate = parsed
              ? chronoDateToLuxon(parsed, tz).toISODate()!
              : DateTime.now().setZone(tz).plus({ days: 30 }).toISODate()!;
            await createDaysSince({
              label: counterIntent.label,
              type: "to",
              target_date: targetDate,
              last_date: targetDate,
            });
            const targetDt = DateTime.fromISO(targetDate).setZone(tz);
            addAssistantMsg({
              kind: "text",
              text: `Done! I've created a **Countdown** to **"${counterIntent.label}"**${parsed ? ` on **${targetDt.toFormat("EEE, MMM d, yyyy")}**` : " (30 days from now — you can edit the date in **Track**)"}. 🎯`,
            });
          }
          getDaysSince().then(setDaysSinceData).catch(() => {});
        } catch (e: any) {
          addAssistantMsg({ kind: "error", text: `Failed to create counter: ${e.message || e}` });
        }
        return;
      }

      // ── Direct "add to list" intent (must be before activity detection to prevent loops) ──
      let currentLists = myListsData;
      if (currentLists.length === 0) {
        currentLists = await getMyLists().catch(() => []);
        if (Array.isArray(currentLists)) setMyListsData(currentLists);
      }
      let currentContacts = contacts;
      if (currentContacts.length === 0) {
        currentContacts = await getContacts().catch(() => []);
        if (Array.isArray(currentContacts)) setContacts(currentContacts);
      }
      
      const listNames = Array.isArray(currentLists) ? currentLists.map((l: any) => l.title) : [];
      const listIntent = isAddToListIntent(q, listNames, currentContacts);
      if (listIntent) {
        try {
          const { listName } = await addItemToMyList(listIntent.text, listIntent.listName);
          addAssistantMsg({
            kind: "text",
            text: `Added **"${listIntent.text}"** to your **${listName}** list! You can find it in the **Track** section. ✅`,
          });
        } catch (e: any) {
          addAssistantMsg({ kind: "error", text: `Failed to add to list: ${e.message || e}` });
        }
        return;
      }

      // ── Add Note to Contact intent ──
      const addNoteIntent = detectAddNoteToContact(q);
      if (addNoteIntent) {
        try {
          const { content, contactName } = addNoteIntent;
          const matchContact = currentContacts.find((c: any) => c.name.toLowerCase().includes(contactName.toLowerCase()) || contactName.toLowerCase().includes(c.name.split(" ")[0].toLowerCase()));
          if (matchContact) {
            const newNotes = matchContact.notes ? `${matchContact.notes}\n${content}` : content;
            await updateContact(matchContact.id, { notes: newNotes });
            getContacts().then(setContacts).catch(() => {});
            addAssistantMsg({
              kind: "text",
              text: `Added note to **${matchContact.name}**'s profile! 📝`,
            });
          } else {
            addAssistantMsg({ kind: "error", text: `I couldn't find a contact named "${contactName}".` });
          }
        } catch (e: any) {
          addAssistantMsg({ kind: "error", text: `Failed to add note: ${e.message || e}` });
        }
        return;
      }

      // ── Client Project Intent ──
      const projectMatch = q.match(/^(?:create|start|make|new)\s+(?:a\s+)?(?:client\s+)?project(?:\s+(?:for|named|called)\s+(.+))?/i);
      if (projectMatch && !intent) {
        const projectName = projectMatch[1]?.trim() || "New Client Project";
        try {
          const projectList = await createMyList({ title: projectName, list_type: "project" });
          const starters = ["Onboarding meeting", "Requirements gathering", "First draft", "Client feedback", "Final delivery"];
          for (const item of starters) {
            await addMyListItem(projectList.id, { text: item });
          }
          getMyLists().then((l) => setMyListsData(Array.isArray(l) ? l : [])).catch(() => {});
          addAssistantMsg({
            kind: "text",
            text: `Created a new Client Project list named **"${projectName}"**! I've added some standard phases to get you started. You can track billable hours against these tasks in the **Track** section. 💼`,
          });
        } catch (e: any) {
          addAssistantMsg({ kind: "error", text: `Failed to create client project: ${e.message || e}` });
        }
        return;
      }

      // ── Travel / trip intent → offer itinerary list ──
      const travelHit = detectTravelIntent(q);
      if (travelHit) {
        const friendsInArea = contacts.length > 0;
        const options: { label: string; value: string }[] = [
          { label: `Create "${travelHit.destination}" itinerary & trip plan`, value: `__travel_list__${travelHit.destination}` },
        ];
        if (friendsInArea) {
          options.push({ label: "Plan a meet-up with a friend there", value: `__travel_meet__${travelHit.destination}` });
        }
        addAssistantMsg({
          kind: "clarify",
          text: `Exciting — **${travelHit.destination}**! 🌍 Would you like me to help you plan?`,
          options,
        });
        return;
      }

      // ── Activity completion → detect & reset existing counter ──
      const activityHit = detectActivityCompletion(q);
      if (activityHit) {
        // Search daysSinceData for a matching counter
        const matchingCounter = findMatchingCounter(activityHit.activity, daysSinceData);
        if (matchingCounter) {
          try {
            await resetDaysSince(matchingCounter.id);
            // Refresh local data
            getDaysSince().then(setDaysSinceData).catch(() => {});
            addAssistantMsg({
              kind: "text",
              text: `Nice work! 💪 I've reset your **"${matchingCounter.label}"** counter — it now shows **0 days since today**. Keep it up!`,
            });
          } catch (e: any) {
            addAssistantMsg({ kind: "error", text: `Failed to reset counter: ${e.message || e}` });
          }
          return;
        }
        // No matching counter — offer to create one
        const displayActivity = activityHit.activity
          ? ({ exercised: "exercising", cycled: "cycling", ran: "running", jogged: "jogging",
               swam: "swimming", hiked: "hiking", cleaned: "cleaning", cooked: "cooking",
               meditated: "meditating", studied: "studying", stretched: "stretching",
               gardened: "gardening", vacuumed: "vacuuming", organized: "organizing",
               journaled: "journaling", painted: "painting",
               // Base / present forms
               run: "running", swim: "swimming", hike: "hiking", jog: "jogging",
               walk: "walking", bike: "biking", ride: "riding", cycle: "cycling",
               // Sports
               tennis: "playing tennis", basketball: "playing basketball",
               football: "playing football", soccer: "playing soccer",
               volleyball: "playing volleyball", golf: "playing golf",
               squash: "playing squash", badminton: "playing badminton",
               cricket: "playing cricket",
               // Compound activities
               yoga: "doing yoga", pilates: "doing pilates",
               cardio: "doing cardio", crossfit: "doing CrossFit",
               "meal prepped": "meal prepping",
               "walked the dog": "walking the dog",
               "fed the pet": "feeding the pet",
             } as Record<string, string>)[activityHit.activity] || activityHit.activity
          : "";
        addAssistantMsg({
          kind: "clarify",
          text: `Great job${displayActivity ? ` **${displayActivity}**` : ""}! 💪 Want me to start tracking this so you can see your streak?`,
          options: [
            { label: "Yes, start a counter", value: `Start a counter for days since I last ${
              ({ run: "went for a run", swim: "went swimming", swam: "went swimming",
                 hike: "went hiking", hiked: "went hiking",
                 jog: "went jogging", jogged: "went jogging",
                 walk: "went for a walk", ride: "went for a ride",
                 tennis: "played tennis", basketball: "played basketball",
                 football: "played football", soccer: "played soccer",
                 golf: "played golf", cricket: "played cricket",
                 yoga: "did yoga", pilates: "did pilates", cardio: "did cardio",
                 crossfit: "did crossfit",
                 stretched: "stretched", meditated: "meditated",
                 cooked: "cooked", cleaned: "cleaned", gardened: "gardened",
               } as Record<string, string>)[activityHit.activity] || activityHit.activity || "did this"
            }` },
            { label: "No thanks", value: "cancel" },
          ],
        });
        return;
      }

      // ── Date calculation: "How long until X" / "When is X" ──
      const dateCalcHit = detectDateCalculation(q);
      if (dateCalcHit) {
        if (dateCalcHit.targetDateStr) {
          // Range calculation ("how many days from X to Y")
          const parsedStart = chrono.parseDate(dateCalcHit.targetDateStr, getChronoRefDate(DateTime.now().setZone(tz)), { forwardDate: true });
          const parsedEnd = chrono.parseDate(dateCalcHit.subject, getChronoRefDate(DateTime.now().setZone(tz)), { forwardDate: true });
          if (parsedStart && parsedEnd) {
            const startDt = chronoDateToLuxon(parsedStart, tz).startOf("day");
            const endDt = chronoDateToLuxon(parsedEnd, tz).startOf("day");
            const diff = Math.round(endDt.diff(startDt, "days").days);
            const absDiff = Math.abs(diff);
            addAssistantMsg({
              kind: "text",
              text: `There are **${absDiff} day${absDiff !== 1 ? "s" : ""}** from ${startDt.toFormat("MMM d")} to ${endDt.toFormat("MMM d")}. 🗓️`,
            });
            return;
          }
        }

        // Check if there's already a counter for this
        const existingCounter = findMatchingCounter(dateCalcHit.subject, daysSinceData);
        if (existingCounter) {
          const today = DateTime.now().setZone(tz).startOf("day");
          const targetDate = existingCounter.type === "to" && existingCounter.target_date
            ? DateTime.fromISO(existingCounter.target_date).startOf("day")
            : DateTime.fromISO(existingCounter.last_date).startOf("day");
          const diff = Math.abs(Math.round(targetDate.diff(today, "days").days));
          const isPast = targetDate < today;
          const label = existingCounter.label;
          if (existingCounter.type === "to") {
            addAssistantMsg({
              kind: "text",
              text: isPast
                ? `**${label}** was **${diff} day${diff !== 1 ? "s" : ""} ago** (${targetDate.toFormat("EEE, MMM d, yyyy")}).`
                : `**${label}** is in **${diff} day${diff !== 1 ? "s" : ""}** — ${targetDate.toFormat("EEE, MMM d, yyyy")}! 🎉`,
            });
          } else {
            addAssistantMsg({
              kind: "text",
              text: `It's been **${diff} day${diff !== 1 ? "s" : ""}** since **${label}** (${targetDate.toFormat("EEE, MMM d, yyyy")}).`,
            });
          }
          return;
        }

        // Try to parse a date from the subject
        const parsed = chrono.parseDate(dateCalcHit.subject, getChronoRefDate(DateTime.now().setZone(tz)), { forwardDate: true });
        if (parsed) {
          const targetDt = chronoDateToLuxon(parsed, tz).startOf("day");
          const today = DateTime.now().setZone(tz).startOf("day");
          const diff = Math.round(targetDt.diff(today, "days").days);
          const absDiff = Math.abs(diff);
          const dateStr = targetDt.toFormat("EEE, MMM d, yyyy");
          const label = dateCalcHit.subject.charAt(0).toUpperCase() + dateCalcHit.subject.slice(1);
          const msg = diff > 0
            ? `**${label}** is in **${absDiff} day${absDiff !== 1 ? "s" : ""}** — ${dateStr}! 🗓️`
            : diff < 0
              ? `**${label}** was **${absDiff} day${absDiff !== 1 ? "s" : ""} ago** (${dateStr}).`
              : `**${label}** is **today**! 🎉`;
          addAssistantMsg({
            kind: "clarify",
            text: msg + "\n\nWant me to create a countdown for this?",
            options: [
              { label: "Yes, create countdown", value: `Start a countdown to ${dateCalcHit.subject}` },
              { label: "No thanks", value: "cancel" },
            ],
          });
          return;
        }
        // Couldn't parse a date — fallback
        addAssistantMsg({
          kind: "clarify",
          text: `I don't have a specific date for **"${dateCalcHit.subject}"** — but I can help you track it! Would you like to create a countdown and set the date yourself?`,
          options: [
            { label: "Yes, create countdown", value: `Start a countdown to ${dateCalcHit.subject}` },
            { label: "No thanks", value: "cancel" },
          ],
        });
        return;
      }

      // ── Birthday query → check counters, then offer creation ──
      const birthdayHit = detectBirthdayQuery(q);
      if (birthdayHit) {
        const name = birthdayHit.name;
        // Search counters for a birthday entry
        const birthdayCounter = daysSinceData.find((c: any) =>
          c.label && c.label.toLowerCase().includes("birthday") &&
          c.label.toLowerCase().includes(name.toLowerCase())
        );
        if (birthdayCounter) {
          const targetDate = birthdayCounter.target_date
            ? DateTime.fromISO(birthdayCounter.target_date).setZone(tz)
            : DateTime.fromISO(birthdayCounter.last_date).setZone(tz);
          const today = DateTime.now().setZone(tz).startOf("day");
          // Calculate next occurrence of the birthday this year or next
          let nextBday = targetDate.set({ year: today.year });
          if (nextBday < today) nextBday = nextBday.plus({ years: 1 });
          const diff = Math.round(nextBday.diff(today, "days").days);
          addAssistantMsg({
            kind: "text",
            text: diff === 0
              ? `🎂 **${name}'s birthday is TODAY!** Happy birthday to them!`
              : `🎂 **${name}'s birthday** is on **${nextBday.toFormat("MMM d")}** — that's in **${diff} day${diff !== 1 ? "s" : ""}**!`,
          });
          return;
        }
        // Not found — offer to create
        addAssistantMsg({
          kind: "clarify",
          text: `I don't have **${name}'s birthday** saved yet. Want to add it as a countdown?`,
          options: [
            { label: "Yes, add birthday", value: `Start a countdown to ${name}'s birthday` },
            { label: "No thanks", value: "cancel" },
          ],
        });
        return;
      }

      // ── Random news/article request ──
      const newsHit = detectNewsRequest(q);
      if (newsHit) {
        try {
          const [newsData, rssData] = await Promise.all([
            getNews().catch(() => ({ feeds: {} })),
            getRssFeedArticles().catch(() => []),
          ]);
          // Combine all articles from the feeds object (top, forYou, local, etc.)
          const allArticles: any[] = [];
          if (newsData?.feeds) {
            for (const articles of Object.values(newsData.feeds)) {
              if (Array.isArray(articles)) allArticles.push(...(articles as any[]));
            }
          }
          if (Array.isArray(rssData)) allArticles.push(...rssData);

          // Filter by topic if specified
          let pool = allArticles;
          if (newsHit.topic) {
            const topicLower = newsHit.topic.toLowerCase();
            const filtered = pool.filter((a: any) =>
              a.title?.toLowerCase().includes(topicLower) ||
              a.source?.toLowerCase().includes(topicLower) ||
              a.category?.toLowerCase().includes(topicLower) ||
              a.interest?.toLowerCase().includes(topicLower)
            );
            if (filtered.length > 0) pool = filtered;
          }

          if (pool.length === 0) {
            addAssistantMsg({
              kind: "text",
              text: "I couldn't find any articles right now. Try adding some news interests in the **Feed** section, or add RSS feeds!",
            });
            return;
          }

          // Pick a random article
          const article = pool[Math.floor(Math.random() * pool.length)];
          const source = article.source ? ` — *${article.source}*` : "";
          const link = article.link ? `\n\n[Read more →](${article.link})` : "";
          addAssistantMsg({
            kind: "text",
            text: `📰 **${article.title}**${source}${link}`,
          });
        } catch (e: any) {
          addAssistantMsg({ kind: "error", text: `Failed to fetch news: ${e.message || e}` });
        }
        return;
      }

      // ── Handle travel list/meet clarify follow-ups ──
      if (q.startsWith("__travel_list__")) {
        const dest = q.replace("__travel_list__", "");
        try {
          // Create TWO lists: a To-Do itinerary checklist AND a Trip Plan list
          // 1. Normal To-Do list with task items
          const todoList = await createMyList({ title: `${dest} Itinerary`, list_type: "todo" });
          const starters = ["Research flights", "Book accommodation", "Things to see", "Restaurants to try", "Pack list"];
          for (const item of starters) {
            await addMyListItem(todoList.id, { text: item });
          }
          // 2. Trip Plan list for places/dates/day numbers
          const tripList = await createMyList({ title: `${dest} Trip Plan`, list_type: "trip" });
          const tripStarters = [
            { text: "Arrival day", day_number: 1 },
            { text: "Explore the city", day_number: 2 },
            { text: "Day trip / excursion", day_number: 3 },
            { text: "Departure day", day_number: 4 },
          ];
          for (const item of tripStarters) {
            await addMyListItem(tripList.id, item);
          }
          getMyLists().then((l) => setMyListsData(Array.isArray(l) ? l : [])).catch(() => {});
          addAssistantMsg({
            kind: "text",
            text: `Created two lists for your trip:\n\n1. **"${dest} Itinerary"** — a to-do checklist with tasks like booking flights, accommodation, and packing.\n2. **"${dest} Trip Plan"** — a day-by-day trip planner for places, dates, and activities.\n\nYou can find both in the **Track** section!`,
          });
        } catch (e: any) {
          addAssistantMsg({ kind: "error", text: `Failed to create itinerary: ${e.message || e}` });
        }
        return;
      }
      if (q.startsWith("__travel_meet__")) {
        const dest = q.replace("__travel_meet__", "");
        if (contacts.length > 0) {
          const firstName = contacts[0].name.split(" ")[0];
          handleSend(`When can I meet with ${firstName} this week?`);
        } else {
          addAssistantMsg({
            kind: "text",
            text: `You don't have any contacts yet! Add a friend's calendar first, then I can help find a time to meet up in **${dest}**.`,
          });
        }
        return;
      }

      // ── Parse full intent (create or availability) ──
      const intent = parseFullIntent(q, tz, { defaultDuration: lastRequestedDurationRef.current ?? undefined });

      // Clear actionable suggestion context when a real intent is detected
      if (intent) {
        lastActionableSuggestionRef.current = null;
      }

      if (!intent) {
        // ── Conversational follow-up detection ─────────────────────────
        // If the user sends a short follow-up like "2 pm?", "what about friday?",
        // "morning?", etc. and we have context from the previous query, re-interpret
        // the follow-up using that context.
        const ctx = lastQueryContextRef.current;
        const followUp = ctx ? detectFollowUp(q, tz) : null;

        if (ctx && followUp) {
          // Determine the target date from context or follow-up
          const ctxStartDt = DateTime.fromISO(ctx.startAt).setZone(tz);

          if (followUp.time || followUp.dateShift || followUp.timeOfDay || followUp.timeWindow || followUp.durationMinutes) {
            // Figure out the target day
            let targetDay = followUp.dateShift || ctxStartDt;

            // Figure out the target time (only for explicit time follow-ups, NOT timeOfDay/timeWindow)
            let targetTime = followUp.time;

            const dur = followUp.durationMinutes || ctx.durationMinutes || lastRequestedDurationRef.current || 60;

            // ── Duration-only follow-ups ("30 mins instead?") → re-run FIND on original window ──
            if (followUp.durationMinutes && !followUp.time && !followUp.dateShift && !followUp.timeWindow) {
              const winStart = DateTime.fromISO(ctx.startAt).setZone(tz);
              const winEnd = DateTime.fromISO(ctx.endAt).setZone(tz);

              if ((ctx.kind === "contactFind" || ctx.kind === "contactCheck") && ctx.contactIds?.length === 1) {
                const contactId = ctx.contactIds[0];
                const contactName = ctx.contactNames?.[0] || "Contact";
                const [userFreeResult, freeBusy] = await Promise.all([
                  availabilityFind({ rangeStart: winStart.toISO()!, rangeEnd: winEnd.toISO()!, timezone: tz, mode: ctx.mode, minDurationMinutes: dur, limit: 15 }),
                  getContactFreeBusy(contactId, winStart.toISO()!, winEnd.toISO()!),
                ]);
                const contactBusy: Array<{ start_at: string; end_at: string }> = freeBusy?.busy || [];
                const commonSlots = subtractBusy(userFreeResult.freeRanges, contactBusy).slice(0, 8);
                lastQueryContextRef.current = { ...ctx, durationMinutes: dur, query: q };
                lastRequestedDurationRef.current = dur;
                if (commonSlots.length > 0) {
                  lastBookableSlotRef.current = {
                    slot: commonSlots[0],
                    suggestedTitle: `Meeting with ${contactName.split(" ")[0]}`,
                    contactNames: [contactName],
                    contactIds: [contactId],
                    timezone: tz,
                  };
                } else {
                  lastBookableSlotRef.current = null;
                }
                addAssistantMsg({
                  kind: "contactFind",
                  contactName,
                  contactId,
                  slots: commonSlots,
                  timezone: tz,
                  query: q,
                  requestedDurationMinutes: dur,
                });
                return;
              } else if (ctx.kind === "groupFind" && ctx.contactIds && ctx.contactNames) {
                const cIds = ctx.contactIds;
                const cNames = ctx.contactNames;
                const userFreePromise = availabilityFind({ rangeStart: winStart.toISO()!, rangeEnd: winEnd.toISO()!, timezone: tz, mode: ctx.mode, minDurationMinutes: dur, limit: 20 });
                const freeBusyPromises = cIds.map(id => getContactFreeBusy(id, winStart.toISO()!, winEnd.toISO()!));
                const [userFreeResult, ...fbResults] = await Promise.all([userFreePromise, ...freeBusyPromises]);
                let commonSlots = userFreeResult.freeRanges;
                for (const fb of fbResults) {
                  const busy: Array<{ start_at: string; end_at: string }> = fb?.busy || [];
                  commonSlots = subtractBusy(commonSlots, busy);
                }
                commonSlots = commonSlots.slice(0, 8);
                lastQueryContextRef.current = { ...ctx, durationMinutes: dur, query: q };
                lastRequestedDurationRef.current = dur;
                if (commonSlots.length > 0) {
                  lastBookableSlotRef.current = {
                    slot: commonSlots[0],
                    suggestedTitle: `Meeting with ${cNames.map(n => n.split(" ")[0]).join(", ")}`,
                    contactNames: cNames,
                    contactIds: cIds,
                    timezone: tz,
                  };
                } else {
                  lastBookableSlotRef.current = null;
                }
                addAssistantMsg({
                  kind: "groupFind",
                  contactNames: cNames,
                  contactIds: cIds,
                  slots: commonSlots,
                  timezone: tz,
                  query: q,
                  requestedDurationMinutes: dur,
                });
                return;
              } else if (ctx.kind === "find" || ctx.kind === "check") {
                const findRes = await availabilityFind({
                  rangeStart: winStart.toISO()!,
                  rangeEnd: winEnd.toISO()!,
                  timezone: tz,
                  mode: ctx.mode,
                  minDurationMinutes: dur,
                  limit: 15,
                });
                lastQueryContextRef.current = { ...ctx, durationMinutes: dur, query: q };
                lastRequestedDurationRef.current = dur;
                if (findRes.freeRanges.length > 0) {
                  lastBookableSlotRef.current = {
                    slot: findRes.freeRanges[0],
                    suggestedTitle: "Meeting",
                    timezone: tz,
                  };
                } else {
                  lastBookableSlotRef.current = null;
                }
                addAssistantMsg({
                  kind: "find",
                  result: { ...findRes, requestedDurationMinutes: dur },
                  timezone: tz,
                  query: q,
                });
                return;
              }
            }

            // ── Time-window follow-ups ("evening?", "after 6?", "morning?") → re-run FIND ──
            if (followUp.timeWindow && !targetTime) {
              const winStart = targetDay.set({ hour: followUp.timeWindow.startHour, minute: 0, second: 0, millisecond: 0 });
              const winEnd = targetDay.set({ hour: followUp.timeWindow.endHour, minute: 0, second: 0, millisecond: 0 });

              if ((ctx.kind === "contactFind" || ctx.kind === "contactCheck") && ctx.contactIds?.length === 1) {
                const contactId = ctx.contactIds[0];
                const contactName = ctx.contactNames?.[0] || "Contact";
                const [userFreeResult, freeBusy] = await Promise.all([
                  availabilityFind({ rangeStart: winStart.toISO()!, rangeEnd: winEnd.toISO()!, timezone: tz, mode: ctx.mode, minDurationMinutes: dur, limit: 15 }),
                  getContactFreeBusy(contactId, winStart.toISO()!, winEnd.toISO()!),
                ]);
                const contactBusy: Array<{ start_at: string; end_at: string }> = freeBusy?.busy || [];
                const commonSlots = subtractBusy(userFreeResult.freeRanges, contactBusy).slice(0, 8);
                lastQueryContextRef.current = { ...ctx, startAt: winStart.toISO()!, endAt: winEnd.toISO()!, query: q };
                lastRequestedDurationRef.current = dur;
                if (commonSlots.length > 0) {
                  lastBookableSlotRef.current = {
                    slot: commonSlots[0],
                    suggestedTitle: `Meeting with ${contactName.split(" ")[0]}`,
                    contactNames: [contactName],
                    contactIds: [contactId],
                    timezone: tz,
                  };
                }
                payload = { kind: "contactFind", contactName, contactId: contactId, slots: commonSlots, timezone: tz, query: q, requestedDurationMinutes: dur };
                addAssistantMsg(payload);
                return;
              } else if (ctx.kind === "groupFind" && ctx.contactIds && ctx.contactIds.length >= 2) {
                const cIds = ctx.contactIds;
                const cNames = ctx.contactNames || [];
                const [userFreeResult, ...fbResults] = await Promise.all([
                  availabilityFind({ rangeStart: winStart.toISO()!, rangeEnd: winEnd.toISO()!, timezone: tz, mode: ctx.mode, minDurationMinutes: dur, limit: 30 }),
                  ...cIds.map((id) => getContactFreeBusy(id, winStart.toISO()!, winEnd.toISO()!)),
                ]);
                let commonSlots: SlotData[] = userFreeResult.freeRanges;
                for (const fb of fbResults) { commonSlots = subtractBusy(commonSlots, fb?.busy || []); }
                commonSlots = commonSlots.slice(0, 10);
                lastQueryContextRef.current = { ...ctx, startAt: winStart.toISO()!, endAt: winEnd.toISO()!, query: q };
                lastRequestedDurationRef.current = dur;
                if (commonSlots.length > 0) {
                  const firstNames = cNames.map((n) => n.split(" ")[0]);
                  lastBookableSlotRef.current = {
                    slot: commonSlots[0],
                    suggestedTitle: `Meeting with ${firstNames.join(" & ")}`,
                    contactNames: cNames,
                    contactIds: cIds,
                    timezone: tz,
                  };
                }
                payload = { kind: "groupFind", contactNames: cNames, contactIds: cIds, slots: commonSlots, timezone: tz, query: q, requestedDurationMinutes: dur };
                addAssistantMsg(payload);
                return;
              } else {
                // Solo find within the time window
                const result = await availabilityFind({ rangeStart: winStart.toISO()!, rangeEnd: winEnd.toISO()!, timezone: tz, mode: ctx.mode, minDurationMinutes: dur, limit: 20 });
                result.requestedDurationMinutes = dur;
                lastQueryContextRef.current = { ...ctx, kind: "find", startAt: winStart.toISO()!, endAt: winEnd.toISO()!, query: q };
                lastRequestedDurationRef.current = dur;
                if (result.freeRanges.length > 0) {
                  lastBookableSlotRef.current = {
                    slot: result.freeRanges[0],
                    suggestedTitle: extractActivityTitle(ctx.query) || "Event",
                    timezone: tz,
                  };
                }
                payload = { kind: "find", result, timezone: tz, query: q };
                addAssistantMsg(payload);
                return;
              }
            }

            if (targetTime) {
              // Specific time → do a check at that time
              const checkStart = targetDay.set({ hour: targetTime.hour, minute: targetTime.minute, second: 0, millisecond: 0 });
              const checkEnd = checkStart.plus({ minutes: dur });

              if (ctx.kind === "contactCheck" || ctx.kind === "contactFind") {
                // Re-check with the same contact at the new time
                const contactId = ctx.contactIds?.[0];
                const contactName = ctx.contactNames?.[0] || "Contact";
                if (contactId) {
                  const [userAvail, freeBusy] = await Promise.all([
                    availabilityCheck({ startAt: checkStart.toISO()!, endAt: checkEnd.toISO()!, timezone: tz }),
                    getContactFreeBusy(contactId, checkStart.toISO()!, checkEnd.toISO()!),
                  ]);
                  const busy: Array<{ start_at: string; end_at: string }> = freeBusy?.busy || [];
                  const s = checkStart.toMillis();
                  const e = checkEnd.toMillis();
                  const contactFree = !busy.some((b: any) => new Date(b.start_at).getTime() < e && new Date(b.end_at).getTime() > s);
                  lastQueryContextRef.current = { ...ctx, startAt: checkStart.toISO()!, endAt: checkEnd.toISO()!, query: q };
                  if (userAvail.isFree && contactFree) {
                    lastBookableSlotRef.current = {
                      slot: { start_at: checkStart.toISO()!, end_at: checkEnd.toISO()! },
                      suggestedTitle: `Meeting with ${contactName.split(" ")[0]}`,
                      contactNames: [contactName],
                      contactIds: [contactId],
                      timezone: tz,
                    };
                  }
                  payload = {
                    kind: "contactCheck",
                    contactName,
                    contactId,
                    userFree: userAvail.isFree,
                    contactFree,
                    requestedRange: { start: checkStart.toISO()!, end: checkEnd.toISO()! },
                    timezone: tz,
                    busyBlocks: busy,
                  };
                  addAssistantMsg(payload);
                  return;
                }
              } else if (ctx.kind === "groupFind") {
                // Re-check with all group contacts at the new time
                const cIds = ctx.contactIds || [];
                if (cIds.length >= 2) {
                  const [userAvail, ...fbResults] = await Promise.all([
                    availabilityCheck({ startAt: checkStart.toISO()!, endAt: checkEnd.toISO()!, timezone: tz }),
                    ...cIds.map((id) => getContactFreeBusy(id, checkStart.toISO()!, checkEnd.toISO()!)),
                  ]);
                  const allContactsFree = fbResults.every((fb) => {
                    const busy: Array<{ start_at: string; end_at: string }> = fb?.busy || [];
                    const s = checkStart.toMillis();
                    const e = checkEnd.toMillis();
                    return !busy.some((b: any) => new Date(b.start_at).getTime() < e && new Date(b.end_at).getTime() > s);
                  });
                  lastQueryContextRef.current = { ...ctx, startAt: checkStart.toISO()!, endAt: checkEnd.toISO()!, query: q };
                  // Present as a simple text summary for group time checks
                  const names = ctx.contactNames?.join(", ") || "everyone";
                  const timeLabel = checkStart.toFormat("h:mm a");
                  const dateLabel = checkStart.toFormat("EEE, MMM d");
                  const everyoneFree = userAvail.isFree && allContactsFree;
                  if (everyoneFree) {
                    const firstNames = (ctx.contactNames || []).map((n) => n.split(" ")[0]);
                    lastBookableSlotRef.current = {
                      slot: { start_at: checkStart.toISO()!, end_at: checkEnd.toISO()! },
                      suggestedTitle: `Meeting with ${firstNames.join(" & ")}`,
                      contactNames: ctx.contactNames,
                      contactIds: ctx.contactIds,
                      timezone: tz,
                    };
                  }
                  payload = {
                    kind: "text",
                    text: everyoneFree
                      ? `**${timeLabel}** on **${dateLabel}** works for you and ${names}! 🎉`
                      : `**${timeLabel}** on **${dateLabel}** doesn't work — ${!userAvail.isFree ? "you have a conflict" : `${names} ${fbResults.length === 1 ? "has" : "have"} a conflict`}.`,
                  };
                  addAssistantMsg(payload);
                  return;
                }
              } else {
                // Solo check/find → re-check the user's own availability at the new time
                const result = await availabilityCheck({ startAt: checkStart.toISO()!, endAt: checkEnd.toISO()!, timezone: tz, mode: ctx.mode });
                lastQueryContextRef.current = { ...ctx, kind: "check", startAt: checkStart.toISO()!, endAt: checkEnd.toISO()!, query: q };
                if (result.isFree) {
                  lastBookableSlotRef.current = {
                    slot: { start_at: checkStart.toISO()!, end_at: checkEnd.toISO()! },
                    suggestedTitle: extractActivityTitle(ctx.query) || "Event",
                    timezone: tz,
                  };
                }
                payload = { kind: "check", result, timezone: tz };
                addAssistantMsg(payload);
                return;
              }
            } else if (followUp.dateShift) {
              // Date-only follow-up (e.g. "friday?") → re-run the same query type on the new day
              const dayStart = followUp.dateShift.startOf("day");
              const dayEnd = followUp.dateShift.endOf("day");

              if ((ctx.kind === "contactFind" || ctx.kind === "contactCheck") && ctx.contactIds?.length === 1) {
                const contactId = ctx.contactIds[0];
                const contactName = ctx.contactNames?.[0] || "Contact";
                const [userFreeResult, freeBusy] = await Promise.all([
                  availabilityFind({ rangeStart: dayStart.toISO()!, rangeEnd: dayEnd.toISO()!, timezone: tz, mode: ctx.mode, minDurationMinutes: dur, limit: 15 }),
                  getContactFreeBusy(contactId, dayStart.toISO()!, dayEnd.toISO()!),
                ]);
                const contactBusy: Array<{ start_at: string; end_at: string }> = freeBusy?.busy || [];
                const actWin = getActivityTimeWindow(ctx.query);
                const commonSlots = clipSlotsToReasonableHours(
                  subtractBusy(userFreeResult.freeRanges, contactBusy), tz, dur, actWin?.startHour, actWin?.endHour,
                ).slice(0, 8);
                lastQueryContextRef.current = { ...ctx, startAt: dayStart.toISO()!, endAt: dayEnd.toISO()!, query: q };
                lastRequestedDurationRef.current = dur;
                if (commonSlots.length > 0) {
                  lastBookableSlotRef.current = {
                    slot: commonSlots[0],
                    suggestedTitle: `Meeting with ${contactName.split(" ")[0]}`,
                    contactNames: [contactName],
                    contactIds: [contactId],
                    timezone: tz,
                  };
                }
                payload = { kind: "contactFind", contactName, contactId: contactId, slots: commonSlots, timezone: tz, query: q, requestedDurationMinutes: dur };
                addAssistantMsg(payload);
                return;
              } else if (ctx.kind === "groupFind" && ctx.contactIds && ctx.contactIds.length >= 2) {
                const cIds = ctx.contactIds;
                const cNames = ctx.contactNames || [];
                const [userFreeResult, ...fbResults] = await Promise.all([
                  availabilityFind({ rangeStart: dayStart.toISO()!, rangeEnd: dayEnd.toISO()!, timezone: tz, mode: ctx.mode, minDurationMinutes: dur, limit: 30 }),
                  ...cIds.map((id) => getContactFreeBusy(id, dayStart.toISO()!, dayEnd.toISO()!)),
                ]);
                let commonSlots: SlotData[] = userFreeResult.freeRanges;
                for (const fb of fbResults) { commonSlots = subtractBusy(commonSlots, fb?.busy || []); }
                const actWin = getActivityTimeWindow(ctx.query);
                commonSlots = clipSlotsToReasonableHours(commonSlots, tz, dur, actWin?.startHour, actWin?.endHour).slice(0, 10);
                lastQueryContextRef.current = { ...ctx, startAt: dayStart.toISO()!, endAt: dayEnd.toISO()!, query: q };
                lastRequestedDurationRef.current = dur;
                if (commonSlots.length > 0) {
                  const firstNames = cNames.map((n) => n.split(" ")[0]);
                  lastBookableSlotRef.current = {
                    slot: commonSlots[0],
                    suggestedTitle: `Meeting with ${firstNames.join(" & ")}`,
                    contactNames: cNames,
                    contactIds: cIds,
                    timezone: tz,
                  };
                }
                payload = { kind: "groupFind", contactNames: cNames, contactIds: cIds, slots: commonSlots, timezone: tz, query: q, requestedDurationMinutes: dur };
                addAssistantMsg(payload);
                return;
              } else {
                // Solo find on the new date
                const result = await availabilityFind({ rangeStart: dayStart.toISO()!, rangeEnd: dayEnd.toISO()!, timezone: tz, mode: ctx.mode, minDurationMinutes: dur, limit: 20 });
                const actWin = getActivityTimeWindow(ctx.query);
                result.freeRanges = clipSlotsToReasonableHours(result.freeRanges, tz, dur, actWin?.startHour, actWin?.endHour).slice(0, 8);
                result.requestedDurationMinutes = dur;
                lastQueryContextRef.current = { ...ctx, kind: "find", startAt: dayStart.toISO()!, endAt: dayEnd.toISO()!, query: q };
                lastRequestedDurationRef.current = dur;
                if (result.freeRanges.length > 0) {
                  lastBookableSlotRef.current = {
                    slot: result.freeRanges[0],
                    suggestedTitle: extractActivityTitle(ctx.query) || "Event",
                    timezone: tz,
                  };
                }
                payload = { kind: "find", result, timezone: tz, query: q };
                addAssistantMsg(payload);
                return;
              }
            }
          }
        }

        // ── Actionable-suggestion follow-up detection ──────────────
        // If the user types "List item and Reminder", "Add as Counter", "Reminder + List", etc.
        // right after we showed an actionable suggestion card, execute those actions.
        const actionCtx = lastActionableSuggestionRef.current;
        if (actionCtx) {
          const lower = q.toLowerCase().replace(/[.!?,]+/g, " ").trim();
          const wantsListItem = /\b(?:task|list(?:\s+item)?|add\s+(?:to|as)\s+(?:a\s+)?(?:list|item)|to-?do|todo|checklist|item)\b/i.test(lower);
          const wantsReminder = /\b(?:remind(?:er)?|alert|notify|notification|heads?\s*up|ping\s+me|nudge)\b/i.test(lower);
          const wantsCounter = /\b(?:counter|countdown|count(?:\s*down)?|track(?:er|ing)?|days?\s+since|days?\s+until|timer|log|monitor|streak)\b/i.test(lower);
          const wantsNote = /\b(?:note|save\s+note|contact\s+note)\b/i.test(lower);
          if (wantsListItem || wantsReminder || wantsCounter || wantsNote) {
            const userTz = profile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
            const refDate = getChronoRefDate(DateTime.now().setZone(userTz));
            const parsedDate = chrono.parseDate(actionCtx.originalText, refDate, { forwardDate: true });

            // Execute the requested actions
            const results: string[] = [];
            const errors: string[] = [];
            try {
              if (wantsListItem) {
                const { listName } = await addItemToMyList(actionCtx.subject);
                results.push(`List item (in "${listName}")`);
              }
              if (wantsReminder) {
                const dueAt = parsedDate
                  ? DateTime.fromJSDate(parsedDate).setZone(userTz).toISO()
                  : DateTime.now().setZone(userTz).plus({ days: 1 }).set({ hour: 9, minute: 0 }).toISO();
                await createReminder({
                  title: actionCtx.subject,
                  schedule_type: "one_off",
                  due_at: dueAt,
                  timezone: userTz,
                });
                results.push("Reminder");
              }
              if (wantsCounter) {
                const isSinceType = /\b(?:since|last|ago|elapsed|it'?s\s+been|streak)\b/i.test(actionCtx.originalText);
                if (isSinceType) {
                  await createDaysSince({
                    label: actionCtx.subject,
                    type: "since",
                    last_date: DateTime.now().toISODate(),
                  });
                } else {
                  const targetDate = parsedDate
                    ? DateTime.fromJSDate(parsedDate).toISODate()
                    : DateTime.now().plus({ days: 30 }).toISODate();
                  await createDaysSince({
                    label: actionCtx.subject,
                    type: "to",
                    target_date: targetDate,
                    last_date: targetDate,
                  });
                }
                results.push("Counter");
              }
              if (wantsNote) {
                const match = actionCtx.originalText.match(/^(?:add|save|note)(?:\s+note)?\s+(.+?)\s+to\s+(?:contact\s+|profile\s+)?(.+?)(?:'s?\s+(?:profile|contact))?$/i);
                if (match) {
                  let content = match[1].trim();
                  if (content.startsWith('"') && content.endsWith('"')) {
                    content = content.slice(1, -1);
                  }
                  let contactName = match[2].trim().replace(/^my\s+/i, '');
                  const matchContact = contacts.find((c: any) => c.name.toLowerCase().includes(contactName.toLowerCase()) || contactName.toLowerCase().includes(c.name.split(" ")[0].toLowerCase()));
                  if (matchContact) {
                    const newNotes = matchContact.notes ? `${matchContact.notes}\n${content}` : content;
                    await updateContact(matchContact.id, { notes: newNotes });
                    results.push("Note");
                  }
                }
              }
            } catch (e: any) {
              errors.push(e?.message || String(e));
            }
            lastActionableSuggestionRef.current = null;
            if (results.length > 0) {
              const joined = results.length === 1 ? results[0] : results.slice(0, -1).join(", ") + " and " + results[results.length - 1];
              addAssistantMsg({
                kind: "text",
                text: `Done! I've added **"${actionCtx.subject}"** as a ${joined}. You can find ${results.length > 1 ? "them" : "it"} in the **Track** section.`,
              });
            }
            if (errors.length > 0) {
              addAssistantMsg({ kind: "text", text: `⚠️ Something went wrong: ${errors.join(", ")}` });
            }
            return;
          }
        }

        // No follow-up matched — try to detect actionable statements
        const actionable = detectActionableStatement(q);
        if (actionable) {
          lastActionableSuggestionRef.current = {
            subject: actionable.subject,
            originalText: q,
            dateHint: actionable.dateHint,
          };
          addAssistantMsg({
            kind: "actionableSuggestion",
            originalText: q,
            subject: actionable.subject,
            triggers: actionable.triggers,
            suggestTask: actionable.suggestTask,
            suggestReminder: actionable.suggestReminder,
            suggestCounter: actionable.suggestCounter,
            suggestNote: actionable.suggestNote,
            dateHint: actionable.dateHint,
          });
          return;
        }

        // ── Smart Contact Note Fallback ──
        if (contacts.length > 0) {
          // Look for any known contact mentioned in the query
          const mentionedContacts = [...contacts]
            .sort((a, b) => b.name.length - a.name.length)
            .filter(c => {
              const nameLower = c.name.toLowerCase();
              const firstLower = c.name.split(" ")[0].toLowerCase();
              // Prevent matching tiny common names unless exact match
              if (firstLower.length <= 2) return nameLower === q.toLowerCase();
              const regex = new RegExp(`\\b(?:${nameLower}|${firstLower})\\b`, 'i');
              return regex.test(q);
            });

          if (mentionedContacts.length > 0) {
            const c = mentionedContacts[0];
            
            if (!c.notes || !c.notes.trim()) {
              addAssistantMsg({ kind: "text", text: `I found **${c.name}**, but you haven't saved any notes for them yet.` });
              return;
            }

            const stopWords = new Set(['what', 'who', 'where', 'when', 'why', 'how', 'tell', 'me', 'about', 'do', 'does', 'did', 'is', 'are', 'was', 'were', 'have', 'has', 'had', 'any', 'some', 'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'i', 'you', 'he', 'she', 'they', 'it', 'my', 'your', 'his', 'her', 'their', 'like', 'know', 'notes', 'note']);
            
            const words = q.toLowerCase()
              .replace(/[^a-z0-9\s]/g, '')
              .split(/\s+/)
              .filter(w => w.length > 2 && !stopWords.has(w) && !c.name.toLowerCase().includes(w));

            const lines = c.notes.split('\n').filter((l: string) => l.trim().length > 0);

            if (words.length > 0) {
              const matches = lines.filter((line: string) => {
                const lineLower = line.toLowerCase();
                return words.some(w => lineLower.includes(w));
              });

              if (matches.length > 0) {
                addAssistantMsg({ kind: "text", text: `Here's what I found in your notes for **${c.name}**:\n\n> "${matches.join('\n> ')}"` });
                return;
              } else {
                addAssistantMsg({ kind: "text", text: `I checked **${c.name}**'s notes, but couldn't find anything specifically about that.\n\nHere are all their notes:\n> ${lines.join('\n> ')}` });
                return;
              }
            } else {
              addAssistantMsg({ kind: "text", text: `Here are your notes for **${c.name}**:\n\n> ${lines.join('\n> ')}` });
              return;
            }
          }
        }

        // Nothing matched — show the generic help
        payload = {
          kind: "text",
          text: "Hmm, I didn't quite catch that — but I can do a lot! Here are some things to try:\n\n🔍 **Check availability**\n\"Am I free tomorrow at 2pm?\"\n\"What's on my calendar this week?\"\n\n⏱️ **Find open time**\n\"Find 30 mins today for a workout\"\n\"Any gaps this Friday afternoon?\"\n\n📅 **Create events**\n\"Lunch with Sarah tomorrow at noon\"\n\"Dentist on March 10 at 3pm for 1 hour\"\n\"Standup every Monday\"\n\n🔔 **Set reminders**\n\"Remind me to call Mom on Sunday\"\n\"Don't forget to submit the report by Friday\"",
        };
      } else if (intent.type === "createEvent") {
        const ev = await createEvent({
          title: intent.title,
          start_at: intent.startAt,
          end_at: intent.endAt,
          location: intent.location || null,
          is_all_day: false,
        });
        payload = { kind: "eventCreated", event: ev, timezone: tz };
      } else if (intent.type === "createEventNeedsDuration") {
        // Has date + time, missing duration → go to duration step then location
        const startDt = DateTime.fromISO(intent.startAt).setZone(tz);
        setPendingAction({
          kind: "eventBuilder",
          title: intent.title,
          timezone: tz,
          date: startDt.toISODate()!,
          time: { hour: startDt.hour, minute: startDt.minute },
          duration: undefined,
          location: undefined,
          step: "duration",
        });
        payload = {
          kind: "clarify",
          text: `Got it — **${intent.title}** on **${startDt.toFormat("EEE, MMM d")}** at **${startDt.toFormat("h:mm a")}**.\n\nHow long should this event be?`,
          options: [
            { label: "30 min", value: "30 minutes" },
            { label: "1 hour", value: "1 hour" },
            { label: "1.5 hours", value: "90 minutes" },
            { label: "2 hours", value: "2 hours" },
          ],
        };
      } else if (intent.type === "createEventWizard") {
        // Start at the first missing step; keep known fields
        const firstStep = !intent.date ? "date" : !intent.time ? "time" : !intent.duration ? "duration" : "location";
        setPendingAction({
          kind: "eventBuilder",
          title: intent.title,
          timezone: tz,
          date: intent.date,
          time: intent.time,
          duration: intent.duration,
          location: undefined,
          recurrence: (intent as CreateEventWizard).recurrence || null,
          step: firstStep,
        });
        if (firstStep === "date") {
          payload = {
            kind: "clarify",
            text: `I'll create **${intent.title}**.\n\nWhat day works for you?`,
            options: buildDateOptions(tz),
          };
        } else if (firstStep === "time") {
          const dateDt = DateTime.fromISO(intent.date!).setZone(tz);
          payload = {
            kind: "clarify",
            text: `**${intent.title}** on **${dateDt.toFormat("EEE, MMM d")}**.\n\nWhat time?`,
            options: inferTimeOptions(intent.title),
          };
        } else if (firstStep === "duration") {
          const dateDt = DateTime.fromISO(intent.date!).setZone(tz);
          payload = {
            kind: "clarify",
            text: `**${intent.title}** on **${dateDt.toFormat("EEE, MMM d")}** at **${formatTime24(intent.time!)}**.\n\nHow long should it be?`,
            options: [
              { label: "30 min", value: "30 minutes" },
              { label: "1 hour", value: "1 hour" },
              { label: "1.5 hours", value: "90 minutes" },
              { label: "2 hours", value: "2 hours" },
            ],
          };
        } else {
          const dateDt = DateTime.fromISO(intent.date!).setZone(tz);
          payload = {
            kind: "clarify",
            text: `**${intent.title}** on **${dateDt.toFormat("EEE, MMM d")}** at **${formatTime24(intent.time!)}** for **${formatDuration(intent.duration!)}**.\n\nWhere will this be? *(or tap Skip)*`,
            options: [{ label: "Skip", value: "skip" }],
          };
        }
      } else if (intent.type === "createReminder") {
        const rem = await createReminder({
          title: intent.task,
          schedule_type: "one_off",
          due_at: intent.dueAt,
          timezone: tz,
        });
        payload = { kind: "reminderCreated", reminder: rem, timezone: tz };
      } else if (intent.type === "createReminderNeedsTime") {
        setPendingAction({
          kind: "reminderNeedsTime",
          task: intent.task,
          dateIso: intent.dateIso,
          timezone: tz,
        });
        const dateDt = DateTime.fromISO(intent.dateIso).setZone(tz);
        payload = {
          kind: "clarify",
          text: `I'll remind you to **${intent.task}** on **${dateDt.toFormat("EEE, MMM d")}**.\n\nWhat time should I set the reminder for?`,
          options: inferTimeOptions(intent.task),
        };
      } else if (intent.type === "check") {
        const result = await availabilityCheck({
          startAt: intent.startAt,
          endAt: intent.endAt,
          timezone: tz,
          mode: intent.mode,
        });
        lastQueryContextRef.current = {
          kind: "check", startAt: intent.startAt, endAt: intent.endAt,
          timezone: tz, mode: intent.mode, durationMinutes: intent.durationMinutes, query: q,
        };
        if (result.isFree) {
          lastBookableSlotRef.current = {
            slot: { start_at: intent.startAt, end_at: intent.endAt },
            suggestedTitle: extractActivityTitle(q) || "Event",
            timezone: tz,
          };
        }
        payload = { kind: "check", result, timezone: tz };
      } else {
        // "find"
        const result = await availabilityFind({
          rangeStart: intent.startAt,
          rangeEnd: intent.endAt,
          timezone: tz,
          mode: intent.mode,
          minDurationMinutes: intent.durationMinutes,
          limit: 20,
        });
        const soloActWin = getActivityTimeWindow(q);
        result.freeRanges = clipSlotsToReasonableHours(result.freeRanges, tz, intent.durationMinutes, soloActWin?.startHour, soloActWin?.endHour).slice(0, 8);
        result.requestedDurationMinutes = intent.durationMinutes;
        lastRequestedDurationRef.current = intent.durationMinutes;
        lastQueryContextRef.current = {
          kind: "find", startAt: intent.startAt, endAt: intent.endAt,
          timezone: tz, mode: intent.mode, durationMinutes: intent.durationMinutes, query: q,
        };
        if (result.freeRanges.length > 0) {
          lastBookableSlotRef.current = {
            slot: result.freeRanges[0],
            suggestedTitle: extractActivityTitle(q) || "Event",
            timezone: tz,
          };
        }
        payload = { kind: "find", result, timezone: tz, query: q };
      }

      addAssistantMsg(payload);
    } catch (e: any) {
      console.error("Assistant error:", e);
      addAssistantMsg({ kind: "error", text: e.message || "Something went wrong" });
    } finally {
      setLoading(false);
    }
  };

  // Handle initial message passed from home page "Ask Chrono" input
  useEffect(() => {
    const initialMsg = (location.state as any)?.initialMessage;
    if (initialMsg && !initialMessageSentRef.current) {
      initialMessageSentRef.current = true;
      // Clear the state so refresh doesn't re-send
      window.history.replaceState({}, "");
      handleSend(initialMsg);
    }
  }, [location.state]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="max-w-lg mx-auto flex flex-col h-[calc(100dvh-8.5rem-env(safe-area-inset-bottom,0px))] md:h-[calc(100dvh-56px-26px)] md:max-w-none">
      {/* Messages / Welcome */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto md:overflow-y-auto px-4 py-4 md:px-8 lg:px-12 pb-32 md:pb-4">
        <div className="mb-4" />
        <div className="md:max-w-3xl md:mx-auto">
        {showWelcome ? (
          <WelcomeView onSelect={(q) => handleSend(q)} quickPrompts={personalizedPrompts.quickPrompts} />
        ) : (
          <div className="space-y-4">
            <AnimatePresence initial={false}>
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                >
                  <MessageBubble msg={msg} onFollowUp={(q) => handleSend(q)} onAcceptSlot={async (slot, title) => {
                    const userTz = profile?.timezone || getDeviceTimezone();
                    lastBookableSlotRef.current = null; // Clear since slot is being booked via card
                    // Gather guest contact IDs for group/contact bookings
                    const p = msg.payload;
                    const cNames = p.kind === "groupFind" ? p.contactNames
                      : p.kind === "contactFind" ? [p.contactName]
                      : p.kind === "contactCheck" ? [p.contactName]
                      : null;
                    const guestContactIds = p.kind === "groupFind" && p.contactIds ? p.contactIds
                      : (p.kind === "contactFind" && p.contactId) ? [p.contactId]
                      : (p.kind === "contactCheck" && p.contactId) ? [p.contactId]
                      : lastQueryContextRef.current?.contactIds || undefined;
                    
                    const myName = profile?.name || user?.user_metadata?.name || user?.email?.split("@")[0] || "User";
                    const descAttendees = cNames && cNames.length > 0 ? cNames.join(", ") : "";
                    const desc = descAttendees ? `${descAttendees} + Booked by ${myName}` : undefined;

                    const ev = await createEvent({
                      title: title || "Event",
                      start_at: slot.start_at,
                      end_at: slot.end_at,
                      is_all_day: false,
                      ...(desc ? { description: desc } : {}),
                      ...(guestContactIds && guestContactIds.length > 0 ? { guest_contact_ids: guestContactIds } : {}),
                    });
                    // Use GroupEventCreated card for group/contact bookings
                    if (cNames && cNames.length > 0) {
                      const guestCount = ev.guest_events?.length || 0;
                      if (guestCount > 0) {
                        toast.success(`Event also added to ${guestCount} guest calendar${guestCount !== 1 ? "s" : ""}`);
                      }
                      addAssistantMsg({ kind: "groupEventCreated", event: ev, contactNames: cNames, timezone: userTz });
                    } else {
                      addAssistantMsg({ kind: "eventCreated", event: ev, timezone: userTz });
                    }
                  }} />
                </motion.div>
              ))}
            </AnimatePresence>

            {loading && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex gap-2.5"
              >
                <div className="glass rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Checking your calendar...</span>
                </div>
              </motion.div>
            )}
          </div>
        )}
        </div>
      </div>

      {/* ── Desktop bottom section (inline) ── */}
      {/* Quick Chips — desktop only */}
      {!showWelcome && (
        <div className="hidden md:block px-4 pb-1.5 md:px-8 lg:px-12 shrink-0">
          <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar md:max-w-3xl md:mx-auto">
            {personalizedPrompts.quickPrompts.map((p) => (
              <button
                key={p.label}
                onClick={() => handleSend(p.query)}
                disabled={loading}
                className="shrink-0 px-3 py-1.5 rounded-full bg-muted/50 border border-border/50 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted transition disabled:opacity-40"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Group Plan Contact Picker — desktop only */}
      <AnimatePresence>
        {groupPlanOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="overflow-hidden border-t border-border/30 hidden md:block shrink-0"
          >
            <div className="px-4 py-3 bg-background/80 backdrop-blur-md md:px-8 lg:px-12">
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-violet-500/10 flex items-center justify-center">
                    <Users className="w-3.5 h-3.5 text-violet-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Group Plan</p>
                    <p className="text-[10px] text-muted-foreground">
                      {groupSelectedIds.size < 2
                        ? "Select 2+ contacts to find mutual time"
                        : `${groupSelectedIds.size} selected — type a time range below`}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => { setGroupPlanOpen(false); setGroupSelectedIds(new Set()); }}
                  className="text-[11px] text-muted-foreground hover:text-foreground transition px-2 py-1 rounded-lg hover:bg-muted/60"
                >
                  Cancel
                </button>
              </div>

              {contacts.length === 0 ? (
                <div className="py-4 text-center">
                  <Users className="w-6 h-6 text-muted-foreground/40 mx-auto mb-1.5" />
                  <p className="text-xs text-muted-foreground">No contacts yet — add contacts in Settings</p>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {contacts.map((c: any) => {
                    const selected = groupSelectedIds.has(c.id);
                    const firstName = c.name.split(" ")[0];
                    const avatarColors = ["#7C3AED", "#0EA5E9", "#10B981", "#F59E0B", "#EF4444", "#EC4899"];
                    const color = avatarColors[c.name.charCodeAt(0) % avatarColors.length];
                    return (
                      <button
                        key={c.id}
                        onClick={() => {
                          setGroupSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(c.id)) next.delete(c.id);
                            else next.add(c.id);
                            return next;
                          });
                        }}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition ${
                          selected
                            ? "border-violet-400 bg-violet-500/10 shadow-sm"
                            : "border-border/50 bg-background/50 hover:bg-muted/60"
                        }`}
                      >
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                          style={{ backgroundColor: color }}
                        >
                          {firstName[0]}
                        </div>
                        <span className="text-xs font-medium">{firstName}</span>
                        {selected && <Check className="w-3.5 h-3.5 text-violet-500" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input — desktop only */}
      <div className="hidden md:block px-4 pb-1 pt-2 border-t border-border/30 md:px-8 lg:px-12 md:pb-1.5 shrink-0">
        {/* Quick capture chips — desktop */}
        <AnimatePresence>
          {input.trim().length >= 2 && captureOptions.length > 0 && !loading && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="overflow-hidden md:max-w-3xl md:mx-auto"
            >
              <div className="flex flex-wrap gap-1.5 pb-2">
                {captureOptions.map((opt) => (
                  <button
                    key={opt.type}
                    type="button"
                    onClick={() => handleQuickCapture(opt.type, { targetList: opt.targetList, cleanSubject: opt.cleanSubject })}
                    disabled={captureBusy}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-medium transition active:scale-[0.97] disabled:opacity-50 ${
                      opt.primary
                        ? "glass-elevated text-primary"
                        : "glass text-foreground/70 hover:text-foreground"
                    }`}
                  >
                    {captureBusy && opt.primary ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                    ) : opt.type === "task" ? (
                      <ListTodo className="w-3.5 h-3.5 text-primary" />
                    ) : opt.type === "reminder" ? (
                      <Bell className="w-3.5 h-3.5 text-amber-500" />
                    ) : opt.type === "event" ? (
                      <CalendarPlus className="w-3.5 h-3.5 text-blue-500" />
                    ) : opt.type === "note" ? (
                      <FileText className="w-3.5 h-3.5 text-orange-500" />
                    ) : (
                      <Timer className="w-3.5 h-3.5 text-emerald-500" />
                    )}
                    <span>{opt.label}</span>
                    {opt.primary && (
                      <span className="text-[9px] text-muted-foreground/50 ml-0.5">{opt.sublabel}</span>
                    )}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <form
          onSubmit={(e) => { 
            e.preventDefault(); 
            const hasValidCommand = input.match(/(?:^|\s)\/(Find|Add|Inside|Remove|Capabilities)(?=\s|$)/i);
            if (!isSlashActive || slashHasExactMatch || slashSuggestions.length === 0 || hasValidCommand) {
              handleSend(); 
            }
          }}
          className="flex items-center gap-2 md:max-w-3xl md:mx-auto"
        >
          {/* Group Plan toggle */}
          {contacts.length >= 2 && (
            <button
              type="button"
              onClick={() => {
                setGroupPlanOpen((v) => !v);
                if (groupPlanOpen) setGroupSelectedIds(new Set());
              }}
              className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition border ${
                groupPlanOpen
                  ? "bg-violet-500/15 border-violet-400 text-violet-500"
                  : "bg-muted/40 border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/70"
              }`}
              title="Group Plan — find time with multiple contacts"
            >
              <Users className="w-4 h-4" />
            </button>
          )}
          <div className="flex-1 relative min-w-0">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (showQuerySuggestions) {
                  const handled = qsHandleKeyDown(e);
                  if (handled) {
                    if (e.key === "Enter" && qsSelectedText) {
                      setInput(qsSelectedText);
                    }
                    return;
                  }
                }
              }}
              placeholder={
                groupPlanOpen && groupSelectedIds.size >= 2
                  ? "e.g. \"next week\" or \"tomorrow afternoon\"..."
                  : ""
              }
              className="w-full px-4 py-2.5 rounded-full glass-input text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              disabled={loading}
            />
            {!input && !(groupPlanOpen && groupSelectedIds.size >= 2) && (
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground/50 pointer-events-none select-none">
                {rotatingPlaceholder}<span className="animate-pulse">|</span>
              </span>
            )}
            <ListAutocompleteDropdown
              suggestions={slashSuggestions}
              isActive={isSlashActive}
              onSelect={slashSelectList}
              above
              partialQuery={slashPartialQuery}
              hasExactMatch={slashHasExactMatch}
            />
            {!isSlashActive && (
              <QuerySuggestionsDropdown
                suggestions={querySuggestions}
                shouldShow={showQuerySuggestions}
                onSelect={(text) => { setInput(text); }}
                above
                inputText={input}
                selectedIndex={qsSelectedIndex}
                onSelectedIndexChange={qsSetSelectedIndex}
              />
            )}
          </div>
          <button
            type="submit"
            disabled={!input.trim() || loading || (groupPlanOpen && groupSelectedIds.size < 2)}
            className="w-10 h-10 rounded-full glass-btn-primary flex items-center justify-center disabled:opacity-50 shrink-0 shadow-sm"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>

      {/* ── Mobile fixed input bar (attached to nav bar) ── */}
      <div className="md:hidden fixed left-0 right-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] z-30 glass-nav border-t">
        {/* Mobile quick chips */}
        {!showWelcome && (
          <div className="px-4 pt-1.5 pb-1">
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
              {personalizedPrompts.quickPrompts.map((p) => (
                <button
                  key={p.label}
                  onClick={() => handleSend(p.query)}
                  disabled={loading}
                  className="shrink-0 px-3 py-1.5 rounded-full bg-muted/50 border border-border/50 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted transition disabled:opacity-40"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {/* Mobile group plan picker */}
        <AnimatePresence>
          {groupPlanOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="overflow-hidden border-t border-border/30"
            >
              <div className="px-4 py-3">
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-violet-500/10 flex items-center justify-center">
                      <Users className="w-3.5 h-3.5 text-violet-500" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Group Plan</p>
                      <p className="text-[10px] text-muted-foreground">
                        {groupSelectedIds.size < 2
                          ? "Select 2+ contacts"
                          : `${groupSelectedIds.size} selected`}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setGroupPlanOpen(false); setGroupSelectedIds(new Set()); }}
                    className="text-[11px] text-muted-foreground hover:text-foreground transition px-2 py-1 rounded-lg hover:bg-muted/60"
                  >
                    Cancel
                  </button>
                </div>
                {contacts.length === 0 ? (
                  <div className="py-3 text-center">
                    <Users className="w-5 h-5 text-muted-foreground/40 mx-auto mb-1" />
                    <p className="text-xs text-muted-foreground">No contacts yet</p>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {contacts.map((c: any) => {
                      const selected = groupSelectedIds.has(c.id);
                      const firstName = (c.name || "?").split(" ")[0];
                      const avatarColors = ["#7C3AED", "#0EA5E9", "#10B981", "#F59E0B", "#EF4444", "#EC4899"];
                      const color = avatarColors[(c.name || "").charCodeAt(0) % avatarColors.length];
                      return (
                        <button
                          key={c.id}
                          onClick={() => {
                            setGroupSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(c.id)) next.delete(c.id);
                              else next.add(c.id);
                              return next;
                            });
                          }}
                          className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition ${
                            selected
                              ? "border-violet-400 bg-violet-500/10 shadow-sm"
                              : "border-border/50 bg-background/50 hover:bg-muted/60"
                          }`}
                        >
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                            style={{ backgroundColor: color }}
                          >
                            {firstName[0]}
                          </div>
                          <span className="text-xs font-medium">{firstName}</span>
                          {selected && <Check className="w-3.5 h-3.5 text-violet-500" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {/* Quick capture chips — mobile */}
        <AnimatePresence>
          {input.trim().length >= 2 && captureOptions.length > 0 && !loading && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="overflow-hidden border-t border-border/30"
            >
              <div className="flex flex-wrap gap-1.5 px-4 py-1.5">
                {captureOptions.map((opt) => (
                  <button
                    key={opt.type}
                    type="button"
                    onClick={() => handleQuickCapture(opt.type, { targetList: opt.targetList, cleanSubject: opt.cleanSubject })}
                    disabled={captureBusy}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-medium transition active:scale-[0.97] disabled:opacity-50 ${
                      opt.primary
                        ? "glass-elevated text-primary"
                        : "glass text-foreground/70 hover:text-foreground"
                    }`}
                  >
                    {captureBusy && opt.primary ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                    ) : opt.type === "task" ? (
                      <ListTodo className="w-3.5 h-3.5 text-primary" />
                    ) : opt.type === "reminder" ? (
                      <Bell className="w-3.5 h-3.5 text-amber-500" />
                    ) : opt.type === "event" ? (
                      <CalendarPlus className="w-3.5 h-3.5 text-blue-500" />
                    ) : opt.type === "note" ? (
                      <FileText className="w-3.5 h-3.5 text-orange-500" />
                    ) : (
                      <Timer className="w-3.5 h-3.5 text-emerald-500" />
                    )}
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {/* Mobile input form */}
        <form
          onSubmit={(e) => { 
            e.preventDefault(); 
            const hasValidCommand = input.match(/(?:^|\s)\/(Find|Add|Inside|Remove|Capabilities)(?=\s|$)/i);
            if (!isSlashActive || slashHasExactMatch || slashSuggestions.length === 0 || hasValidCommand) {
              handleSend(); 
            }
          }}
          className="flex items-center gap-2 px-4 py-2"
        >
          {contacts.length >= 2 && (
            <button
              type="button"
              onClick={() => {
                setGroupPlanOpen((v) => !v);
                if (groupPlanOpen) setGroupSelectedIds(new Set());
              }}
              className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition border ${
                groupPlanOpen
                  ? "bg-violet-500/15 border-violet-400 text-violet-500"
                  : "bg-muted/40 border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/70"
              }`}
              title="Group Plan"
            >
              <Users className="w-4 h-4" />
            </button>
          )}
          <div className="flex-1 relative min-w-0">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (showQuerySuggestions) {
                  const handled = qsHandleKeyDown(e);
                  if (handled) {
                    if (e.key === "Enter" && qsSelectedText) {
                      setInput(qsSelectedText);
                    }
                    return;
                  }
                }
              }}
              placeholder={
                groupPlanOpen && groupSelectedIds.size >= 2
                  ? "e.g. \"next week\"..."
                  : ""
              }
              className="w-full px-4 py-2.5 rounded-full glass-input text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              disabled={loading}
            />
            {!input && !(groupPlanOpen && groupSelectedIds.size >= 2) && (
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground/50 pointer-events-none select-none">
                {rotatingPlaceholder}<span className="animate-pulse">|</span>
              </span>
            )}
            <ListAutocompleteDropdown
              suggestions={slashSuggestions}
              isActive={isSlashActive}
              onSelect={slashSelectList}
              above
              partialQuery={slashPartialQuery}
              hasExactMatch={slashHasExactMatch}
            />
            {!isSlashActive && (
              <QuerySuggestionsDropdown
                suggestions={querySuggestions}
                shouldShow={showQuerySuggestions}
                onSelect={(text) => { setInput(text); }}
                above
                inputText={input}
                selectedIndex={qsSelectedIndex}
                onSelectedIndexChange={qsSetSelectedIndex}
              />
            )}
          </div>
          <button
            type="submit"
            disabled={!input.trim() || loading || (groupPlanOpen && groupSelectedIds.size < 2)}
            className="w-10 h-10 rounded-full glass-btn-primary flex items-center justify-center disabled:opacity-50 shrink-0 shadow-sm"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>

      {/* Day Rundown Modal — triggered by "what am I doing [timeframe]?" */}
      <DayRundownModal
        open={rundownOpen}
        onClose={() => setRundownOpen(false)}
        userTimezone={profile?.timezone}
        userName={profile?.name || user?.user_metadata?.name}
        targetStart={rundownStart}
        targetEnd={rundownEnd}
        targetLabel={rundownLabel}
      />
    </div>
  );
}

// ── Welcome View ───────────────────────────────────────────────

function WelcomeView({ onSelect, quickPrompts }: { onSelect: (q: string) => void; quickPrompts: { label: string; icon: any; query: string }[] }) {
  const QUICK_PROMPTS = quickPrompts;
  return (
    <div className="flex flex-col items-center justify-center h-full px-2 pb-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="flex flex-col items-center gap-3 mb-8"
      >
        
        <div className="text-center">
          <h2 className="text-lg font-semibold">Talk to your Calendar!</h2>
          <p className="text-sm text-muted-foreground mt-1">check Availability, create Events, Lists & more</p>
        </div>
      </motion.div>

      <div className="w-full grid grid-cols-2 gap-2.5 md:gap-3">
        {QUICK_PROMPTS.map((p, i) => (
          <motion.button
            key={p.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 + i * 0.06 }}
            onClick={() => onSelect(p.query)}
            className={`glass rounded-xl p-3.5 text-left hover:bg-accent/60 transition group ${
              i === QUICK_PROMPTS.length - 1 && QUICK_PROMPTS.length % 2 !== 0 ? "col-span-2 md:col-span-1" : ""
            }`}
          >
            <div className="w-8 h-8 rounded-lg bg-primary/8 flex items-center justify-center mb-2.5 group-hover:bg-primary/15 transition">
              <p.icon className="w-4 h-4 text-primary" />
            </div>
            <p className="text-sm font-medium leading-tight">{p.label}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{p.query}</p>
          </motion.button>
        ))}
      </div>

      {/* Keyword color legend */}
      
    </div>
  );
}

// ── Message Bubble Router ──────────────────────────────────────

function MessageBubble({ msg, onFollowUp, onAcceptSlot }: { msg: Message; onFollowUp: (q: string) => void; onAcceptSlot?: (slot: SlotData, title: string) => void }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm glass-btn-primary">
          {msg.payload.kind === "text" ? highlightQuery(msg.payload.text) : ""}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] min-w-0">
        {msg.payload.kind === "check" && (
          <CheckResultCard result={msg.payload.result} timezone={msg.payload.timezone} onAcceptSlot={onAcceptSlot} />
        )}
        {msg.payload.kind === "find" && (
          <FindResultCard
            result={msg.payload.result}
            timezone={msg.payload.timezone}
            query={msg.payload.query}
            onFollowUp={onFollowUp}
            onAcceptSlot={onAcceptSlot}
          />
        )}
        {msg.payload.kind === "text" && (
          <div className="glass rounded-2xl rounded-bl-md px-4 py-3 text-sm whitespace-pre-wrap">
            {renderMarkdown(msg.payload.text)}
          </div>
        )}
        {msg.payload.kind === "eventCreated" && (
          <EventCreatedCard event={msg.payload.event} timezone={msg.payload.timezone} />
        )}
        {msg.payload.kind === "reminderCreated" && (
          <ReminderCreatedCard reminder={msg.payload.reminder} timezone={msg.payload.timezone} />
        )}
        {msg.payload.kind === "clarify" && (
          <ClarifyCard text={msg.payload.text} options={msg.payload.options} onSelect={onFollowUp} />
        )}
        {msg.payload.kind === "error" && (
          <div className="glass rounded-2xl rounded-bl-md px-4 py-3 text-sm border-destructive/30">
            <div className="flex items-center gap-2 text-destructive mb-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span className="font-medium text-xs">Error</span>
            </div>
            <p className="text-muted-foreground">{msg.payload.text}</p>
          </div>
        )}
        {msg.payload.kind === "contactCheck" && (
          <ContactCheckCard
            contactName={msg.payload.contactName}
            userFree={msg.payload.userFree}
            contactFree={msg.payload.contactFree}
            requestedRange={msg.payload.requestedRange}
            timezone={msg.payload.timezone}
            busyBlocks={msg.payload.busyBlocks}
            onFollowUp={onFollowUp}
          />
        )}
        {msg.payload.kind === "contactFind" && (
          <ContactFindCard
            contactName={msg.payload.contactName}
            slots={msg.payload.slots}
            timezone={msg.payload.timezone}
            query={msg.payload.query}
            onAcceptSlot={onAcceptSlot}
            requestedDurationMinutes={msg.payload.requestedDurationMinutes}
          />
        )}
        {msg.payload.kind === "groupFind" && (
          <GroupFindCard
            contactNames={msg.payload.contactNames}
            slots={msg.payload.slots}
            timezone={msg.payload.timezone}
            query={msg.payload.query}
            onAcceptSlot={onAcceptSlot}
            requestedDurationMinutes={msg.payload.requestedDurationMinutes}
          />
        )}
        {msg.payload.kind === "groupEventCreated" && (
          <GroupEventCreatedCard
            event={msg.payload.event}
            contactNames={msg.payload.contactNames}
            timezone={msg.payload.timezone}
          />
        )}
        {msg.payload.kind === "addContact" && (
          <AddContactCard onFollowUp={onFollowUp} initialName={msg.payload.initialName} initialNote={msg.payload.initialNote} />
        )}
        {msg.payload.kind === "bookingLink" && (
          <BookingLinkCard contactName={msg.payload.contactName} contactId={msg.payload.contactId} />
        )}
        {msg.payload.kind === "actionableSuggestion" && (
          <ActionableSuggestionCard
            originalText={msg.payload.originalText}
            subject={msg.payload.subject}
            triggers={msg.payload.triggers}
            suggestTask={msg.payload.suggestTask}
            suggestReminder={msg.payload.suggestReminder}
            suggestCounter={msg.payload.suggestCounter}
            suggestNote={msg.payload.suggestNote}
            dateHint={msg.payload.dateHint}
            onFollowUp={onFollowUp}
          />
        )}
      </div>
    </div>
  );
}

// ── Check Result Card (visual) ──────────���──────────────────────

function CheckResultCard({ result, timezone, onAcceptSlot }: { result: CheckResult; timezone: string; onAcceptSlot?: (slot: SlotData, title: string) => void }) {
  const [bookTitle, setBookTitle] = useState("");
  const [showBookInput, setShowBookInput] = useState(false);
  const [booking, setBooking] = useState(false);
  const [booked, setBooked] = useState(false);
  const s = DateTime.fromISO(result.requestedRange.start).setZone(timezone);
  const e = DateTime.fromISO(result.requestedRange.end).setZone(timezone);
  const durationMins = e.diff(s, "minutes").minutes;

  const handleBook = async () => {
    if (!onAcceptSlot) return;
    if (!bookTitle.trim()) {
      setShowBookInput(true);
      return;
    }
    setBooking(true);
    try {
      await onAcceptSlot({ start_at: result.requestedRange.start, end_at: result.requestedRange.end }, bookTitle.trim());
      setBooked(true);
    } finally {
      setBooking(false);
    }
  };

  const handleBookSubmit = async () => {
    if (!bookTitle.trim() || !onAcceptSlot) return;
    setShowBookInput(false);
    setBooking(true);
    try {
      await onAcceptSlot({ start_at: result.requestedRange.start, end_at: result.requestedRange.end }, bookTitle.trim());
      setBooked(true);
    } finally {
      setBooking(false);
    }
  };

  return (
    <div className="glass rounded-2xl rounded-bl-md overflow-hidden">
      {/* Status Header */}
      <div className={`px-4 py-3 flex items-center gap-3 ${result.isFree ? "bg-emerald-500/10" : "bg-red-500/10"}`}>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${result.isFree ? "bg-emerald-500/15" : "bg-red-500/15"}`}>
          {result.isFree
            ? <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            : <XCircle className="w-5 h-5 text-red-500" />
          }
        </div>
        <div className="flex-1">
          <p className={`text-sm font-semibold ${result.isFree ? "text-emerald-700" : "text-red-600"}`}>
            {result.isFree ? "You're free!" : "Not available"}
          </p>
          <p className="text-[11px] text-muted-foreground">{formatDuration(durationMins)} requested</p>
        </div>
        {/* Book button for free slots */}
        {result.isFree && onAcceptSlot && !booked && (
          <button
            onClick={handleBook}
            disabled={booking}
            className="px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 text-[11px] font-semibold transition disabled:opacity-50 flex items-center gap-1"
          >
            {booking ? <Loader2 className="w-3 h-3 animate-spin" /> : <CalendarPlus className="w-3 h-3" />}
            Book
          </button>
        )}
        {booked && (
          <div className="flex items-center gap-1 text-emerald-600 text-[11px] font-semibold">
            <Check className="w-3.5 h-3.5" />
            Booked
          </div>
        )}
      </div>

      {/* Inline title input */}
      {showBookInput && !booked && (
        <div className="px-4 py-2.5 border-t border-border/30 flex gap-1.5">
          <input
            autoFocus
            value={bookTitle}
            onChange={(ev) => setBookTitle(ev.target.value)}
            onKeyDown={(ev) => { if (ev.key === "Enter") handleBookSubmit(); }}
            placeholder="Event name..."
            className="flex-1 text-xs px-2.5 py-1.5 rounded-lg bg-background/80 border border-border/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
          <button
            onClick={handleBookSubmit}
            disabled={!bookTitle.trim()}
            className="px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-[11px] font-semibold disabled:opacity-50"
          >
            Book
          </button>
        </div>
      )}

      {/* Time Details */}
      <div className="px-4 py-3 border-t border-border/30">
        <div className="flex items-center gap-2 mb-1">
          <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">{s.toFormat("EEEE, MMM d")}</span>
        </div>
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            {s.toFormat("h:mm a")} - {e.toFormat("h:mm a")}
          </span>
        </div>
      </div>

      {/* Conflicts */}
      {!result.isFree && result.conflicts.length > 0 && (
        <div className="px-4 py-2.5 border-t border-border/30">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Conflicts</p>
          <div className="space-y-1.5">
            {result.conflicts.slice(0, 3).map((c, i) => (
              <ConflictRow key={i} conflict={c} timezone={timezone} />
            ))}
          </div>
        </div>
      )}

      {/* Timezone footer */}
      <div className="px-4 py-2 border-t border-border/20">
        <p className="text-[10px] text-muted-foreground/60">{timezone}</p>
      </div>
    </div>
  );
}

// ── Find Result Card (visual slots) ────────────────────────────

function extractActivityTitle(query: string): string {
  // Pattern: "find X mins [temporal] to/for [ACTIVITY]"
  const toActivityMatch = query.match(/\b(?:to|for)\s+(?!(?:\d+\s*(?:min|hour|hr|day|week)|a\s+(?:slot|time|gap|opening|block)))(.+?)$/i);
  if (toActivityMatch) {
    let title = toActivityMatch[1].trim();
    // Remove trailing temporal words and question marks
    title = title.replace(/\s+(?:today|tonight|tomorrow|this\s+\w+|next\s+\w+|on\s+\w+|monday|tuesday|wednesday|thursday|friday|saturday|sunday).*$/i, "").trim();
    title = title.replace(/[?!.]+$/, "").trim();
    if (title.length > 2) return title.charAt(0).toUpperCase() + title.slice(1);
  }
  return "";
}

function FindResultCard({
  result,
  timezone,
  query,
  onFollowUp,
  onAcceptSlot,
}: {
  result: FindResult;
  timezone: string;
  query: string;
  onFollowUp: (q: string) => void;
  onAcceptSlot?: (slot: SlotData, title: string) => void;
}) {
  const slots = result.freeRanges;
  const hasSlots = slots.length > 0;
  const activityTitle = useMemo(() => extractActivityTitle(query), [query]);

  // Group slots by day
  const grouped = useMemo(() => {
    const groups: Record<string, SlotData[]> = {};
    for (const slot of slots) {
      const dt = DateTime.fromISO(slot.start_at).setZone(timezone);
      const key = dt.toFormat("yyyy-MM-dd");
      if (!groups[key]) groups[key] = [];
      groups[key].push(slot);
    }
    return groups;
  }, [slots, timezone]);

  const modeLabel = result.mode === "work_hours"
    ? "During work hours"
    : result.mode === "outside_work_hours"
      ? "Outside work hours"
      : "Any time";

  return (
    <div className="glass rounded-2xl rounded-bl-md overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${hasSlots ? "bg-primary/10" : "bg-muted"}`}>
            <Search className={`w-4 h-4 ${hasSlots ? "text-primary" : "text-muted-foreground"}`} />
          </div>
          <div>
            <p className="text-sm font-semibold">
              {hasSlots ? `${slots.length} slot${slots.length > 1 ? "s" : ""} found` : "No slots found"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {result.requestedDurationMinutes
                ? `${result.requestedDurationMinutes >= 60 ? `${result.requestedDurationMinutes / 60}h` : `${result.requestedDurationMinutes}min`}+ slots`
                : ""}{activityTitle ? ` for "${activityTitle}"` : ""}{result.requestedDurationMinutes || activityTitle ? " · " : ""}{modeLabel}
            </p>
          </div>
        </div>
        {hasSlots && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
            {slots.length}
          </span>
        )}
      </div>

      {/* Slots by Day */}
      {hasSlots && (
        <div className="border-t border-border/30">
          {Object.entries(grouped).map(([dayKey, daySlots], gi) => {
            const dayDt = DateTime.fromISO(daySlots[0].start_at).setZone(timezone);
            const isToday = dayDt.hasSame(DateTime.now().setZone(timezone), "day");
            const isTomorrow = dayDt.hasSame(DateTime.now().setZone(timezone).plus({ days: 1 }), "day");
            const dayLabel = isToday ? "Today" : isTomorrow ? "Tomorrow" : dayDt.toFormat("EEE, MMM d");

            return (
              <div key={dayKey}>
                {/* Day Header */}
                {(Object.keys(grouped).length > 1 || !isToday) && (
                  <div className={`px-4 py-2 ${gi > 0 ? "border-t border-border/20" : ""}`}>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{dayLabel}</p>
                  </div>
                )}
                {/* Mini Timeline for the day */}
                <div className="px-4 pb-1">
                  <DayTimeline slots={daySlots} conflicts={result.conflictsSummary} timezone={timezone} dayDt={dayDt} />
                </div>
                {/* Slot Cards */}
                <div className="px-3 pb-2 space-y-1.5">
                  {daySlots.map((slot, si) => (
                    <SlotCard key={si} slot={slot} timezone={timezone} index={si} activityTitle={activityTitle} requestedDurationMinutes={result.requestedDurationMinutes} onAccept={onAcceptSlot ? (s, t) => onAcceptSlot(s, t) : undefined} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {!hasSlots && (
        <div className="px-4 py-6 border-t border-border/30 text-center">
          <CalendarDays className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No available slots in this window</p>
          <button
            onClick={() => onFollowUp("When am I free this week?")}
            className="mt-3 text-xs text-primary font-medium hover:underline"
          >
            Try a wider range
          </button>
        </div>
      )}

      {/* Conflicts Summary */}
      {result.conflictsSummary?.length > 0 && (
        <div className="px-4 py-2.5 border-t border-border/30">
          <details className="group">
            <summary className="text-[11px] font-medium text-muted-foreground cursor-pointer flex items-center gap-1 select-none">
              <ChevronRight className="w-3 h-3 transition-transform group-open:rotate-90" />
              {result.conflictsSummary.length} conflict{result.conflictsSummary.length > 1 ? "s" : ""} in range
            </summary>
            <div className="mt-2 space-y-1.5">
              {result.conflictsSummary.slice(0, 5).map((c, i) => (
                <ConflictRow key={i} conflict={c} timezone={timezone} />
              ))}
            </div>
          </details>
        </div>
      )}

      {/* Timezone footer */}
      <div className="px-4 py-2 border-t border-border/20">
        <p className="text-[10px] text-muted-foreground/60">{timezone}</p>
      </div>
    </div>
  );
}

// ── Slot Card ──────────────────────────────────────���───────────

function SlotCard({ slot, timezone, index, activityTitle, requestedDurationMinutes, onAccept }: {
  slot: SlotData;
  timezone: string;
  index: number;
  activityTitle?: string;
  requestedDurationMinutes?: number;
  onAccept?: (slot: SlotData, title: string) => void;
}) {
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [showTitleInput, setShowTitleInput] = useState(true);
  const s = DateTime.fromISO(slot.start_at).setZone(timezone);
  const rawE = DateTime.fromISO(slot.end_at).setZone(timezone);
  // Cap the slot's displayed & booked end time to the requested duration
  const cappedE = requestedDurationMinutes
    ? DateTime.min(rawE, s.plus({ minutes: requestedDurationMinutes }))
    : rawE;
  const e = cappedE;
  const durationMins = e.diff(s, "minutes").minutes;

  // The slot to actually book uses capped times
  const bookableSlot: SlotData = {
    start_at: slot.start_at,
    end_at: requestedDurationMinutes
      ? s.plus({ minutes: requestedDurationMinutes }).toISO()!
      : slot.end_at,
  };

  const barColor = index % 3 === 0
    ? "bg-emerald-500"
    : index % 3 === 1
      ? "bg-blue-500"
      : "bg-violet-500";

  const handleAccept = async () => {
    if (!onAccept) return;
    // If no title yet, show inline input
    if (!editTitle.trim()) {
      setShowTitleInput(true);
      return;
    }
    setAccepting(true);
    try {
      await onAccept(bookableSlot, editTitle.trim());
      setAccepted(true);
    } finally {
      setAccepting(false);
    }
  };

  const handleTitleSubmit = async () => {
    if (!editTitle.trim() || !onAccept) return;
    setShowTitleInput(false);
    setAccepting(true);
    try {
      await onAccept(bookableSlot, editTitle.trim());
      setAccepted(true);
    } finally {
      setAccepting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, delay: index * 0.04 }}
      className={`rounded-xl transition p-2.5 ${accepted ? "bg-emerald-500/10 border border-emerald-500/30" : "bg-muted/40 hover:bg-muted/70"}`}
    >
      <div className="flex items-stretch gap-2.5">
        {/* Color bar */}
        <div className={`w-1 rounded-full ${accepted ? "bg-emerald-500" : barColor} shrink-0`} />

        {/* Time info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="text-sm font-semibold tabular-nums">{s.toFormat("h:mm a")}</span>
            <span className="text-muted-foreground text-[11px]">–</span>
            <span className="text-sm font-medium text-muted-foreground tabular-nums">{e.toFormat("h:mm a")}</span>
          </div>
          {activityTitle && !accepted && (
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{activityTitle}</p>
          )}
          {accepted && (
            <p className="text-[11px] text-emerald-600 font-medium mt-0.5">Booked!</p>
          )}
        </div>

        {/* Duration + Accept */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-background/60 text-muted-foreground font-medium">
            {formatDuration(durationMins)}
          </span>
          {onAccept && !accepted && (
            <button
              onClick={handleAccept}
              disabled={accepting}
              className="px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-[11px] font-semibold transition disabled:opacity-50 flex items-center gap-1"
            >
              {accepting ? <Loader2 className="w-3 h-3 animate-spin" /> : <CalendarPlus className="w-3 h-3" />}
              Book
            </button>
          )}
          {accepted && (
            <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <Check className="w-3.5 h-3.5 text-emerald-500" />
            </div>
          )}
        </div>
      </div>

      {/* Inline title input when no activity was detected */}
      {showTitleInput && !accepted && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="mt-2 ml-3.5 flex gap-1.5"
        >
          <input
            autoFocus
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleTitleSubmit(); }}
            placeholder="Event name..."
            className="flex-1 text-xs px-2.5 py-1.5 rounded-lg bg-background/80 border border-border/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
          <button
            onClick={handleTitleSubmit}
            disabled={!editTitle.trim()}
            className="px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-[11px] font-semibold disabled:opacity-50"
          >
            Book
          </button>
        </motion.div>
      )}
    </motion.div>
  );
}

// ── Mini Day Timeline ─────────────────────────��────────────────

function DayTimeline({
  slots,
  conflicts,
  timezone,
  dayDt,
}: {
  slots: SlotData[];
  conflicts: ConflictData[];
  timezone: string;
  dayDt: DateTime;
}) {
  const dayStart = 7; // 7 AM
  const dayEnd = 22;  // 10 PM
  const totalHours = dayEnd - dayStart;

  const toPercent = (iso: string) => {
    const dt = DateTime.fromISO(iso).setZone(timezone);
    const hour = dt.hour + dt.minute / 60;
    return Math.max(0, Math.min(100, ((hour - dayStart) / totalHours) * 100));
  };

  // Filter conflicts for this day
  const dayConflicts = conflicts.filter((c) => {
    const cDt = DateTime.fromISO(c.start_at).setZone(timezone);
    return cDt.hasSame(dayDt, "day");
  });

  return (
    <div className="relative">
      {/* Hour labels */}
      <div className="flex justify-between mb-0.5">
        {[7, 10, 13, 16, 19, 22].map((h) => (
          <span key={h} className="text-[8px] text-muted-foreground/50 tabular-nums">
            {h > 12 ? `${h - 12}p` : h === 12 ? "12p" : `${h}a`}
          </span>
        ))}
      </div>

      {/* Timeline bar */}
      <div className="relative h-3 rounded-full bg-muted/60 overflow-hidden">
        {/* Conflict blocks */}
        {dayConflicts.map((c, i) => {
          const left = toPercent(c.start_at);
          const right = toPercent(c.end_at);
          return (
            <div
              key={`c-${i}`}
              className="absolute top-0 bottom-0 bg-red-400/25 rounded-sm"
              style={{ left: `${left}%`, width: `${Math.max(right - left, 1)}%` }}
            />
          );
        })}

        {/* Free slot blocks */}
        {slots.map((s, i) => {
          const left = toPercent(s.start_at);
          const right = toPercent(s.end_at);
          return (
            <div
              key={`s-${i}`}
              className="absolute top-0 bottom-0 bg-emerald-500/40 rounded-sm"
              style={{ left: `${left}%`, width: `${Math.max(right - left, 1)}%` }}
            />
          );
        })}

        {/* Current time marker */}
        <CurrentTimeMarker timezone={timezone} dayDt={dayDt} dayStart={dayStart} dayEnd={dayEnd} />
      </div>
    </div>
  );
}

function CurrentTimeMarker({
  timezone,
  dayDt,
  dayStart,
  dayEnd,
}: {
  timezone: string;
  dayDt: DateTime;
  dayStart: number;
  dayEnd: number;
}) {
  const now = DateTime.now().setZone(timezone);
  if (!now.hasSame(dayDt, "day")) return null;

  const hour = now.hour + now.minute / 60;
  const pct = ((hour - dayStart) / (dayEnd - dayStart)) * 100;
  if (pct < 0 || pct > 100) return null;

  return (
    <div
      className="absolute top-0 bottom-0 w-0.5 bg-primary rounded-full z-10"
      style={{ left: `${pct}%` }}
    />
  );
}

// ── Conflict Row ──────────────────────��────────────────────────

function ConflictRow({ conflict, timezone }: { conflict: ConflictData; timezone: string }) {
  const s = DateTime.fromISO(conflict.start_at).setZone(timezone);
  const e = DateTime.fromISO(conflict.end_at).setZone(timezone);
  const label = conflict.title
    ? conflict.title
    : conflict.rule_kind
      ? formatRuleKind(conflict.rule_kind)
      : "Busy";

  return (
    <div className="flex items-center gap-2 py-0.5">
      <div className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
      <span className="text-[11px] text-muted-foreground truncate flex-1">{label}</span>
      <span className="text-[10px] text-muted-foreground/70 tabular-nums shrink-0">
        {s.toFormat("h:mm a")} - {e.toFormat("h:mm a")}
      </span>
    </div>
  );
}

// ── Contact Check Card ─────────────────────────────────────────

function ContactCheckCard({
  contactName,
  userFree,
  contactFree,
  requestedRange,
  timezone,
  busyBlocks,
  onFollowUp,
}: {
  contactName: string;
  userFree: boolean;
  contactFree: boolean;
  requestedRange: { start: string; end: string };
  timezone: string;
  busyBlocks?: Array<{ start_at: string; end_at: string; title?: string }>;
  onFollowUp?: (query: string) => void;
}) {
  const s = DateTime.fromISO(requestedRange.start).setZone(timezone);
  const e = DateTime.fromISO(requestedRange.end).setZone(timezone);
  const durationMins = Math.round(e.diff(s, "minutes").minutes);
  const firstName = contactName.split(" ")[0];
  // Check if the requested range spans a full day (>= 20 hours) — in that case show "All day" label
  const isFullDayRange = durationMins >= 20 * 60;

  // Compute total busy time to determine "mostly free" status for full-day ranges
  const totalBusyMins = (busyBlocks || []).reduce((sum, b) => {
    const bStart = Math.max(new Date(b.start_at).getTime(), new Date(requestedRange.start).getTime());
    const bEnd = Math.min(new Date(b.end_at).getTime(), new Date(requestedRange.end).getTime());
    return sum + Math.max(0, (bEnd - bStart) / 60000);
  }, 0);
  const busyFraction = durationMins > 0 ? totalBusyMins / durationMins : 0;
  // "Mostly free" = full-day range, contact has busy blocks but they're < 50% of the day
  const isMostlyFree = isFullDayRange && !contactFree && busyBlocks && busyBlocks.length > 0 && busyFraction < 0.5;
  const bothFree = userFree && contactFree;
  // Use a softer status when contact is mostly free (not a hard conflict)
  const statusLevel: "good" | "partial" | "conflict" = bothFree ? "good" : isMostlyFree && userFree ? "partial" : "conflict";

  const headerBg = statusLevel === "good" ? "bg-emerald-500/10" : statusLevel === "partial" ? "bg-blue-500/10" : "bg-amber-500/10";
  const iconBg = statusLevel === "good" ? "bg-emerald-500/15" : statusLevel === "partial" ? "bg-blue-500/15" : "bg-amber-500/15";
  const titleColor = statusLevel === "good" ? "text-emerald-700" : statusLevel === "partial" ? "text-blue-700" : "text-amber-700";

  return (
    <div className="glass rounded-2xl rounded-bl-md overflow-hidden">
      {/* Status Header */}
      <div className={`px-4 py-3 flex items-center gap-3 ${headerBg}`}>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconBg}`}>
          {statusLevel === "good"
            ? <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            : statusLevel === "partial"
              ? <Clock className="w-5 h-5 text-blue-600" />
              : <AlertTriangle className="w-5 h-5 text-amber-500" />
          }
        </div>
        <div className="flex-1">
          <p className={`text-sm font-semibold ${titleColor}`}>
            {statusLevel === "good"
              ? `Both free!`
              : statusLevel === "partial"
                ? `Mostly available`
                : `Scheduling conflict`
            }
          </p>
          <p className="text-[11px] text-muted-foreground">
            {statusLevel === "good"
              ? `You and ${firstName} are both available`
              : statusLevel === "partial"
                ? `${firstName} has ${busyBlocks!.length} busy block${busyBlocks!.length > 1 ? "s" : ""} but is otherwise free`
                : !userFree && !contactFree
                  ? `Neither you nor ${firstName} are free`
                  : !userFree
                    ? `You're busy, but ${firstName} is free`
                    : `You're free, but ${firstName} is busy`
            }
          </p>
        </div>
      </div>

      {/* Availability Breakdown */}
      <div className="px-4 py-3 border-t border-border/30 space-y-2">
        <div className="flex items-center gap-2.5">
          <div className={`w-2 h-2 rounded-full ${userFree ? "bg-emerald-500" : "bg-red-400"}`} />
          <span className="text-xs flex-1">You</span>
          <span className={`text-[11px] font-medium ${userFree ? "text-emerald-600" : "text-red-500"}`}>
            {userFree ? "Available" : "Busy"}
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <div className={`w-2 h-2 rounded-full ${contactFree ? "bg-emerald-500" : isMostlyFree ? "bg-blue-500" : "bg-red-400"}`} />
          <span className="text-xs flex-1">{firstName}</span>
          <span className={`text-[11px] font-medium ${contactFree ? "text-emerald-600" : isMostlyFree ? "text-blue-600" : "text-red-500"}`}>
            {contactFree ? "Available" : isMostlyFree ? "Mostly free" : "Busy"}
          </span>
        </div>
      </div>

      {/* Busy block details (if contact is busy and we have specific blocks) */}
      {!contactFree && busyBlocks && busyBlocks.length > 0 && (
        <div className="px-4 py-2.5 border-t border-border/30 space-y-1">
          <p className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-1">{firstName}'s busy times</p>
          {busyBlocks.slice(0, 5).map((block, i) => {
            const bs = DateTime.fromISO(block.start_at).setZone(timezone);
            const be = DateTime.fromISO(block.end_at).setZone(timezone);
            return (
              <div key={i} className="flex items-center gap-2 py-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                <span className="text-[11px] text-muted-foreground truncate flex-1">{block.title || "Busy"}</span>
                <span className="text-[10px] text-muted-foreground/70 tabular-nums shrink-0">
                  {bs.toFormat("h:mm a")} – {be.toFormat("h:mm a")}
                </span>
              </div>
            );
          })}
          {busyBlocks.length > 5 && (
            <p className="text-[10px] text-muted-foreground/60">+{busyBlocks.length - 5} more</p>
          )}
        </div>
      )}

      {/* Time Details */}
      <div className="px-4 py-3 border-t border-border/30">
        <div className="flex items-center gap-2 mb-1">
          <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">{s.toFormat("EEEE, MMM d")}</span>
        </div>
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            {isFullDayRange
              ? "All day"
              : `${s.toFormat("h:mm a")} – ${e.toFormat("h:mm a")} · ${formatDuration(durationMins)}`
            }
          </span>
        </div>
      </div>

      {/* Find slot suggestion for partial availability */}
      {!bothFree && onFollowUp && (
        <div className="px-4 py-2.5 border-t border-border/30">
          <button
            onClick={() => onFollowUp(`meet ${firstName}`)}
            className="text-xs text-primary font-medium hover:underline flex items-center gap-1.5"
          >
            <Search className="w-3 h-3" />
            Find a time to meet {firstName}
          </button>
        </div>
      )}

      {/* Timezone footer */}
      <div className="px-4 py-2 border-t border-border/20">
        <p className="text-[10px] text-muted-foreground/60">{timezone}</p>
      </div>
    </div>
  );
}

// ── Contact Find Card ──────────────────────────────────────────

function ContactFindCard({
  contactName,
  slots,
  timezone,
  query,
  onAcceptSlot,
  requestedDurationMinutes,
}: {
  contactName: string;
  slots: SlotData[];
  timezone: string;
  query: string;
  onAcceptSlot?: (slot: SlotData, title: string) => void;
  requestedDurationMinutes?: number;
}) {
  const firstName = contactName.split(" ")[0];
  const hasSlots = slots.length > 0;
  const activityTitle = useMemo(() => extractActivityTitle(query), [query]);
  const defaultTitle = activityTitle || `Meeting with ${firstName}`;

  // Group slots by day
  const grouped = useMemo(() => {
    const groups: Record<string, SlotData[]> = {};
    for (const slot of slots) {
      const dt = DateTime.fromISO(slot.start_at).setZone(timezone);
      const key = dt.toFormat("yyyy-MM-dd");
      if (!groups[key]) groups[key] = [];
      groups[key].push(slot);
    }
    return groups;
  }, [slots, timezone]);

  return (
    <div className="glass rounded-2xl rounded-bl-md overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-2.5">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${hasSlots ? "bg-primary/10" : "bg-muted"}`}>
          <Users className={`w-4 h-4 ${hasSlots ? "text-primary" : "text-muted-foreground"}`} />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold">
            {hasSlots
              ? `${slots.length} mutual slot${slots.length > 1 ? "s" : ""} with ${firstName}`
              : `No mutual time with ${firstName}`
            }
          </p>
          <p className="text-[11px] text-muted-foreground">
            {hasSlots
              ? (requestedDurationMinutes
                ? `${formatDuration(requestedDurationMinutes)}+ slots when you're both free`
                : "Times when you're both free")
              : "No overlapping availability found"}
          </p>
        </div>
        {hasSlots && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
            {slots.length}
          </span>
        )}
      </div>

      {/* Slots */}
      {hasSlots && (
        <div className="border-t border-border/30">
          {Object.entries(grouped).map(([dayKey, daySlots], gi) => {
            const dayDt = DateTime.fromISO(daySlots[0].start_at).setZone(timezone);
            const isToday = dayDt.hasSame(DateTime.now().setZone(timezone), "day");
            const isTomorrow = dayDt.hasSame(DateTime.now().setZone(timezone).plus({ days: 1 }), "day");
            const dayLabel = isToday ? "Today" : isTomorrow ? "Tomorrow" : dayDt.toFormat("EEE, MMM d");

            return (
              <div key={dayKey}>
                {(Object.keys(grouped).length > 1 || !isToday) && (
                  <div className={`px-4 py-2 ${gi > 0 ? "border-t border-border/20" : ""}`}>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{dayLabel}</p>
                  </div>
                )}
                <div className="px-3 pb-2 space-y-1.5">
                  {daySlots.map((slot, si) => {
                    const slotS = DateTime.fromISO(slot.start_at).setZone(timezone);
                    const slotE = DateTime.fromISO(slot.end_at).setZone(timezone);
                    const dur = slotE.diff(slotS, "minutes").minutes;
                    return (
                      <ContactSlotCard
                        key={si}
                        slot={slot}
                        timezone={timezone}
                        duration={dur}
                        defaultTitle={defaultTitle}
                        onAccept={onAcceptSlot}
                        requestedDurationMinutes={requestedDurationMinutes}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {!hasSlots && (
        <div className="px-4 py-6 border-t border-border/30 text-center">
          <Users className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            {requestedDurationMinutes
              ? `No ${formatDuration(requestedDurationMinutes)}+ mutual free time found`
              : "No overlapping free time found"}
          </p>
          <p className="text-[11px] text-muted-foreground/60 mt-1">
            You or {firstName} may be busy the entire requested period — try a different day or a shorter duration
          </p>
        </div>
      )}

      {/* Timezone footer */}
      <div className="px-4 py-2 border-t border-border/20">
        <p className="text-[10px] text-muted-foreground/60">{timezone}</p>
      </div>
    </div>
  );
}

function ContactSlotCard({
  slot,
  timezone,
  duration,
  defaultTitle,
  onAccept,
  requestedDurationMinutes,
}: {
  slot: SlotData;
  timezone: string;
  duration: number;
  defaultTitle: string;
  onAccept?: (slot: SlotData, title: string) => void;
  requestedDurationMinutes?: number;
}) {
  const s = DateTime.fromISO(slot.start_at).setZone(timezone);
  const e = DateTime.fromISO(slot.end_at).setZone(timezone);
  const [bookTitle, setBookTitle] = useState("");
  const [showInput, setShowInput] = useState(true);
  const [booking, setBooking] = useState(false);
  const [booked, setBooked] = useState(false);

  // Display the booking duration: use requested duration if shorter than the slot
  const bookingDur = requestedDurationMinutes && requestedDurationMinutes < duration
    ? requestedDurationMinutes
    : duration;

  const handleBook = async () => {
    if (!onAccept) return;
    if (!bookTitle.trim()) { setShowInput(true); return; }
    setBooking(true);
    try {
      // If a specific duration was requested, cap the event end time
      const bookSlot = requestedDurationMinutes && duration > requestedDurationMinutes
        ? { start_at: slot.start_at, end_at: s.plus({ minutes: requestedDurationMinutes }).toISO()! }
        : slot;
      await onAccept(bookSlot, bookTitle.trim());
      setBooked(true);
    } finally {
      setBooking(false);
    }
  };

  return (
    <div className="rounded-xl border border-border/40 bg-background/60 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Clock className="w-3.5 h-3.5 text-primary/60 shrink-0" />
          <span className="text-xs font-medium truncate">
            {s.toFormat("h:mm a")} – {requestedDurationMinutes && requestedDurationMinutes < duration
              ? s.plus({ minutes: requestedDurationMinutes }).setZone(timezone).toFormat("h:mm a")
              : e.toFormat("h:mm a")}
          </span>
          <span className="text-[10px] text-muted-foreground shrink-0">{formatDuration(bookingDur)}</span>
        </div>
        {onAccept && !booked && (
          <button
            onClick={handleBook}
            disabled={booking}
            className="px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-[11px] font-semibold transition disabled:opacity-50 flex items-center gap-1 shrink-0"
          >
            {booking ? <Loader2 className="w-3 h-3 animate-spin" /> : <CalendarPlus className="w-3 h-3" />}
            Book
          </button>
        )}
        {booked && (
          <div className="flex items-center gap-1 text-emerald-600 text-[11px] font-semibold shrink-0">
            <Check className="w-3.5 h-3.5" />
            Booked
          </div>
        )}
      </div>
      {showInput && !booked && (
        <div className="mt-2 flex gap-1.5">
          <input
            autoFocus
            value={bookTitle}
            onChange={(ev) => setBookTitle(ev.target.value)}
            onKeyDown={(ev) => { if (ev.key === "Enter" && bookTitle.trim()) handleBook(); }}
            placeholder="Event name..."
            className="flex-1 text-xs px-2.5 py-1.5 rounded-lg bg-background/80 border border-border/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
          <button
            onClick={handleBook}
            disabled={!bookTitle.trim()}
            className="px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-[11px] font-semibold disabled:opacity-50"
          >
            Book
          </button>
        </div>
      )}
    </div>
  );
}

// ── Group Find Card ────────────────────────────────────────────

const GROUP_AVATAR_COLORS = ["#7C3AED", "#0EA5E9", "#10B981", "#F59E0B", "#EF4444", "#EC4899"];

function GroupFindCard({
  contactNames,
  slots,
  timezone,
  query,
  onAcceptSlot,
  requestedDurationMinutes,
}: {
  contactNames: string[];
  slots: SlotData[];
  timezone: string;
  query: string;
  onAcceptSlot?: (slot: SlotData, title: string) => void;
  requestedDurationMinutes?: number;
}) {
  const hasSlots = slots.length > 0;
  const firstNames = contactNames.map((n) => n.split(" ")[0]);
  const activityTitle = useMemo(() => extractActivityTitle(query), [query]);
  const defaultTitle = activityTitle || `Group meeting with ${firstNames.join(", ")}`;

  // Group slots by day
  const grouped = useMemo(() => {
    const groups: Record<string, SlotData[]> = {};
    for (const slot of slots) {
      const dt = DateTime.fromISO(slot.start_at).setZone(timezone);
      const key = dt.toFormat("yyyy-MM-dd");
      if (!groups[key]) groups[key] = [];
      groups[key].push(slot);
    }
    return groups;
  }, [slots, timezone]);

  return (
    <div className="glass rounded-2xl rounded-bl-md overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-2.5">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${hasSlots ? "bg-violet-500/10" : "bg-muted"}`}>
          <Users className={`w-4 h-4 ${hasSlots ? "text-violet-500" : "text-muted-foreground"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">
            {hasSlots
              ? `${slots.length} group slot${slots.length > 1 ? "s" : ""} found`
              : "No common time found"
            }
          </p>
          <p className="text-[11px] text-muted-foreground truncate">
            {hasSlots
              ? (requestedDurationMinutes
                ? `${formatDuration(requestedDurationMinutes)}+ slots — you & ${firstNames.join(", ")} all free`
                : `When you & ${firstNames.join(", ")} are all free`)
              : `No overlapping availability with ${firstNames.join(", ")}`}
          </p>
        </div>
        {hasSlots && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-500 font-medium">
            {slots.length}
          </span>
        )}
      </div>

      {/* Contact Avatars */}
      <div className="px-4 pb-2 flex items-center gap-1.5 flex-wrap">
        <div className="flex items-center -space-x-1.5 mr-1">
          {contactNames.map((name, i) => (
            <div
              key={name}
              className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2 border-background"
              style={{ backgroundColor: GROUP_AVATAR_COLORS[name.charCodeAt(0) % GROUP_AVATAR_COLORS.length], zIndex: contactNames.length - i }}
              title={name}
            >
              {name.split(" ")[0][0]}
            </div>
          ))}
          {/* "You" avatar */}
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border-2 border-background bg-primary text-primary-foreground"
            style={{ zIndex: 0 }}
            title="You"
          >
            Y
          </div>
        </div>
        <span className="text-[10px] text-muted-foreground">
          You + {firstNames.join(" + ")}
        </span>
      </div>

      {/* Slots */}
      {hasSlots && (
        <div className="border-t border-border/30">
          {Object.entries(grouped).map(([dayKey, daySlots], gi) => {
            const dayDt = DateTime.fromISO(daySlots[0].start_at).setZone(timezone);
            const isToday = dayDt.hasSame(DateTime.now().setZone(timezone), "day");
            const isTomorrow = dayDt.hasSame(DateTime.now().setZone(timezone).plus({ days: 1 }), "day");
            const dayLabel = isToday ? "Today" : isTomorrow ? "Tomorrow" : dayDt.toFormat("EEE, MMM d");

            return (
              <div key={dayKey}>
                {(Object.keys(grouped).length > 1 || !isToday) && (
                  <div className={`px-4 py-2 ${gi > 0 ? "border-t border-border/20" : ""}`}>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{dayLabel}</p>
                  </div>
                )}
                <div className="px-3 pb-2 space-y-1.5">
                  {daySlots.map((slot, si) => {
                    const slotS = DateTime.fromISO(slot.start_at).setZone(timezone);
                    const slotE = DateTime.fromISO(slot.end_at).setZone(timezone);
                    const dur = slotE.diff(slotS, "minutes").minutes;
                    return (
                      <ContactSlotCard
                        key={si}
                        slot={slot}
                        timezone={timezone}
                        duration={dur}
                        defaultTitle={defaultTitle}
                        onAccept={onAcceptSlot}
                        requestedDurationMinutes={requestedDurationMinutes}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {!hasSlots && (
        <div className="px-4 py-6 border-t border-border/30 text-center">
          <Users className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            {requestedDurationMinutes
              ? `No ${formatDuration(requestedDurationMinutes)}+ common free time found`
              : "No overlapping free time across all calendars"}
          </p>
          <p className="text-[11px] text-muted-foreground/60 mt-1">
            One or more calendars are fully booked for this period — try a different day or shorter duration
          </p>
        </div>
      )}

      {/* Timezone footer */}
      <div className="px-4 py-2 border-t border-border/20">
        <p className="text-[10px] text-muted-foreground/60">{timezone}</p>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────

function formatDuration(mins: number): string {
  const rounded = Math.round(mins);
  if (rounded < 60) return `${rounded}m`;
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatRuleKind(k: string) {
  return k.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

function renderMarkdown(text: string) {
  return text.split("\n").map((line, i) => (
    <div key={i} className="min-h-[1.2em]">
      {renderLine(line)}
    </div>
  ));
}

function renderLine(line: string) {
  // Split on bold (**...**) and italic (*...*) markers
  const parts = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return <span key={i}>{part}</span>;
  });
}

// ── Contact helpers ────────────────────────────────────────────

/** Escape special regex chars in a string */
function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Detect whether the query references a known contact and what kind of intent it is */
function detectContactQuery(q: string, contacts: any[]): { contact: any; kind: "check" | "find" } | null {
  if (!contacts.length) return null;
  const ql = q.toLowerCase();
  for (const contact of contacts) {
    const firstName = contact.name.split(" ")[0].toLowerCase();
    if (!ql.includes(firstName)) continue;

    if (hasMeetIntent(q)) return { contact, kind: "find" };

    const isCheckIntent =
      /\b(is|when\s+is|when'?s|can|when\s+can|check(?:ing)?|how'?s)\b/i.test(q) &&
      /\b(free|available|busy|open|schedule|calendar|day\s+looking|cal|diary)\b/i.test(q);
    if (isCheckIntent) return { contact, kind: "check" };

    // Fallback: "[name] free/available?" without explicit verb
    if (/\b(free|available|busy|open|around)\b/i.test(q)) return { contact, kind: "check" };
  }
  return null;
}

/**
 * Broad "meet-intent" detector — returns true when the query implies the user
 * wants to find time with another person.
 *
 * Covers: meetings, social activities, meals, catch-ups, study sessions,
 * scheduling verbs, collaboration patterns, and mutual-availability phrasing.
 */
function hasMeetIntent(q: string): boolean {
  // 1. Direct meeting / social verbs
  if (/\b(?:meet(?:ing)?(?:\s+(?:up\s+)?with)?|catch(?:\s+|-)?up(?:\s+with)?|get(?:\s+|-)?together(?:\s+with)?|hang(?:\s+|-)?out(?:\s+with)?|link(?:\s+|-)?up(?:\s+with)?|get\s+(?:together|a\s+(?:time|slot))\s+with|chill(?:\s+with)?|kick\s+it(?:\s+with)?|sync(?:\s+with)?)\b/i.test(q)) return true;

  // 2. "when/where can I [verb] [person]"
  if (/(?:when|where|how)\s+(?:can|could)\s+(?:I|we)\s+(?:meet|see|hang|link\s+up|catch\s+up|grab|get\s+together|hook\s+up|do\s+(?:lunch|coffee|dinner|drinks?)|squeeze\s+in|fit\s+in|sync)/i.test(q)) return true;

  // 3. Schedule / find / plan / set up + meeting-type noun
  if (/\b(?:find|schedule|plan|set\s+up|arrange|organize|book|lock\s+in|pencil\s+in|carve\s+out)\s+(?:a\s+)?(?:time|slot|meeting|call|session|lunch|coffee|dinner|drinks?|brunch|breakfast|hangout|get-?\s*together|catch-?\s*up|quick\s+chat|sync|1\s*on\s*1|one\s*on\s*one)(?:\s+(?:to\s+)?(?:meet|see|catch\s+up|hang\s+out|chat|talk))?(?:\s+with)?\b/i.test(q)) return true;

  // 4. Social activity + "with" (grab lunch with, go for coffee with…)
  if (/\b(?:grab|go\s+(?:for|get)|have|get|do|order|pick\s+up|share)\s+(?:a\s+)?(?:lunch|coffee|dinner|drinks?|breakfast|brunch|bite|meal|beer|tea|food|boba|smoothie|ice\s+cream|pizza|sushi|ramen|pho|tacos?|burgers?|snack|dessert|walk|run|hike|ride|workout)\s+(?:with|w\/)\b/i.test(q)) return true;

  // 5. "[meal/activity] with [someone]" (noun + with)
  if (/\b(?:lunch|coffee|dinner|drinks?|breakfast|brunch|beer|tea|boba|happy\s+hour|study\s+session|gym\s+session|movie|film|show|concert|game|walk|hike|run|workout|yoga|quick\s+chat|catch\s*up)\b/i.test(q) && /\b(?:with|w\/)\b/i.test(q)) return true;

  // 6. Collaboration / work-with patterns
  if (/\b(?:study|collaborate|pair|jam|hack|brainstorm|co-?work|work\s+on\s+\w+|sync\s+up)\s+(?:with|together\s+with|w\/)\b/i.test(q)) return true;

  // 7. Mutual availability phrasing
  if (/\b(?:both|mutual(?:ly)?|we\s+are)\s+(?:free|available|open|around)\b/i.test(q)) return true;
  if (/\bwhen\s+(?:are\s+)?(?:we\s+)?(?:both\s+)?(?:going\s+to|gonna|can\s+we)\b/i.test(q)) return true;

  // 8. "see/visit/call [person]" + temporal word (implies finding a time)
  if (/\b(?:when\s+can\s+(?:I|we)\s+)?(?:see|visit|call|ring|facetime|zoom|skype|chat\s+with)\b/i.test(q) && /\b(?:with|w\/)\b|\b[A-Z][a-z]{1,}/i.test(q) && /\b(?:time|when|free|slot|this|next|today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(q)) return true;

  return false;
}

/**
 * Detect when the query has meet-intent + a person's name that is NOT a known contact.
 * Returns the extracted name and the query with the name stripped out,
 * so the caller can fall back to a user-only availability find.
 */
function detectNonContactMeetName(q: string, contacts: any[]): { name: string; strippedQuery: string } | null {
  if (!hasMeetIntent(q)) return null;

  // Extract candidate names: capitalized words after "with" or after meet/see verbs
  const candidatePatterns = [
    /\b[Ww]ith\s+([A-Z][a-z]{1,}(?:\s+[A-Z][a-z]{1,})?)/g,
    /\b(?:[Mm]eet|[Ss]ee|[Vv]isit|[Cc]all|[Ss]chedule|[Bb]ook|[Pp]lan|[Gg]rab|[Hh]ave)\s+(?:up\s+)?(?:(?:a\s+)?(?:meeting|session|call|coffee|lunch|dinner|drink|drinks|brunch|breakfast|tea|boba|beer|time)\s+)?(?:with\s+)?([A-Z][a-z]{1,}(?:\s+[A-Z][a-z]{1,})?)/g,
  ];

  // Common non-name words that may appear capitalised
  const nonNames = new Set([
    "i", "me", "my", "we", "us", "the", "a", "an", "and", "or", "but", "for", "at", "on",
    "in", "to", "of", "is", "are", "am", "was", "it", "this", "that", "these", "those",
    "when", "where", "what", "who", "how", "can", "could", "would", "should", "will",
    "do", "does", "did", "have", "has", "had", "be", "been", "being",
    "today", "tomorrow", "tonight", "monday", "tuesday", "wednesday", "thursday",
    "friday", "saturday", "sunday", "next", "this", "morning", "afternoon", "evening",
    "night", "week", "month", "lunch", "coffee", "dinner", "drinks", "drink",
    "breakfast", "brunch", "beer", "tea", "boba", "food", "someone", "everyone",
    "anybody", "everybody", "something", "time", "slot", "meeting", "call",
  ]);

  const contactFirstNames = new Set(
    contacts.map((c) => c.name.split(" ")[0].toLowerCase())
  );

  for (const pattern of candidatePatterns) {
    let match: RegExpExecArray | null;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(q)) !== null) {
      const candidate = match[1].trim();
      const firstName = candidate.split(" ")[0].toLowerCase();
      // Skip non-names and known contacts (handled by detectContactQuery)
      if (nonNames.has(firstName)) continue;
      if (contactFirstNames.has(firstName)) continue;

      const stripped = q
        .replace(new RegExp(`\\b${escapeRegex(candidate)}\\b`, "gi"), "")
        .replace(/\s{2,}/g, " ")
        .trim();
      return { name: candidate, strippedQuery: stripped };
    }
  }

  return null;
}

/**
 * Subtract contact's busy intervals from user's free slots.
 * Returns only slots ≥ 15 minutes long.
 */
function subtractBusy(free: SlotData[], busy: Array<{ start_at: string; end_at: string }>): SlotData[] {
  let result: SlotData[] = [...free];
  for (const b of busy) {
    const bs = new Date(b.start_at).getTime();
    const be = new Date(b.end_at).getTime();
    result = result.flatMap((slot) => {
      const ss = new Date(slot.start_at).getTime();
      const se = new Date(slot.end_at).getTime();
      if (be <= ss || bs >= se) return [slot]; // no overlap
      if (bs <= ss && be >= se) return [];     // fully covered
      const parts: SlotData[] = [];
      if (bs > ss) parts.push({ start_at: slot.start_at, end_at: new Date(bs).toISOString() });
      if (be < se) parts.push({ start_at: new Date(be).toISOString(), end_at: slot.end_at });
      return parts;
    });
  }
  return result.filter((s) => new Date(s.end_at).getTime() - new Date(s.start_at).getTime() >= 15 * 60 * 1000);
}

/**
 * Detect activity keywords in a query and return an appropriate time window.
 * Returns { startHour, endHour } or null if no activity context is found.
 */
function getActivityTimeWindow(query: string): { startHour: number; endHour: number } | null {
  const q = query.toLowerCase();
  if (/\b(?:dinner|supper|evening\s*meal)\b/.test(q)) return { startHour: 17, endHour: 22 };
  if (/\b(?:lunch|midday\s*meal)\b/.test(q)) return { startHour: 11, endHour: 14 };
  if (/\b(?:breakfast|brunch|morning\s*meal)\b/.test(q)) return { startHour: 7, endHour: 11 };
  if (/\b(?:coffee|tea\s*break)\b/.test(q)) return { startHour: 8, endHour: 17 };
  if (/\b(?:drinks|happy\s*hour|nightcap)\b/.test(q)) return { startHour: 17, endHour: 23 };
  return null;
}

/**
 * Clip free-range slots to reasonable daytime hours and split across day boundaries.
 * E.g. a slot from Fri 4 PM → Sat 12 PM becomes Fri 4 PM–10 PM + Sat 7 AM–12 PM.
 * Default window: 7 AM – 10 PM in the user's timezone.
 */
function clipSlotsToReasonableHours(
  slots: SlotData[],
  timezone: string,
  minMinutes: number = 15,
  dayStartHour: number = 7,
  dayEndHour: number = 22,
): SlotData[] {
  const clipped: SlotData[] = [];
  for (const slot of slots) {
    const sMs = new Date(slot.start_at).getTime();
    const eMs = new Date(slot.end_at).getTime();
    if (eMs <= sMs) continue;

    // Walk day by day from slot start to slot end
    const dtStart = DateTime.fromMillis(sMs, { zone: timezone });
    const dtEnd = DateTime.fromMillis(eMs, { zone: timezone });

    let currentDay = dtStart.startOf("day");
    while (currentDay < dtEnd) {
      const windowStart = currentDay.set({ hour: dayStartHour, minute: 0, second: 0, millisecond: 0 });
      const windowEnd = currentDay.set({ hour: dayEndHour, minute: 0, second: 0, millisecond: 0 });
      const nextDay = currentDay.plus({ days: 1 });

      // Intersect [slot start, slot end] with [windowStart, windowEnd]
      const clipStart = dtStart > windowStart ? dtStart : windowStart;
      const clipEnd = dtEnd < windowEnd ? dtEnd : windowEnd;

      if (clipEnd > clipStart) {
        const durMs = clipEnd.toMillis() - clipStart.toMillis();
        if (durMs >= minMinutes * 60 * 1000) {
          clipped.push({
            start_at: clipStart.toISO()!,
            end_at: clipEnd.toISO()!,
          });
        }
      }

      currentDay = nextDay;
    }
  }
  return clipped;
}

// ── PARSING & LOGIC ────────────────────────────────────────────

type Intent = {
  type: "check" | "find";
  startAt: string;
  endAt: string;
  mode: "any" | "work_hours" | "outside_work_hours";
  durationMinutes: number;
};

function parseIntent(query: string, timezone: string, options?: { skipKeywordCheck?: boolean; defaultDuration?: number }): Intent | null {
  const q = query.toLowerCase();

  const availabilityKeywords = ["free", "available", "availability", "busy", "open", "slot", "booked", "occupied", "gap", "opening", "window"];
  const hasAvailabilityKeyword = availabilityKeywords.some((k) => q.includes(k));

  // Phrase-level availability patterns
  const availabilityPhrases = /when\s+can\s+(?:i|we)|do\s+i\s+have\s+(?:time|any(?:thing)?(?:\s+(?:on|scheduled|planned|going\s+on))?|(?:any?\s+)?(?:meetings?|events?|appointments?|calls?))|any\s+(?:gaps?|openings?|slots?|space|wiggle\s*room|chance\s+(?:i\s+can|we\s+can|to\s+meet))|what(?:'?s|\s+is)\s+(?:on|happening|up|my\s+day\s+looking\s+like|my\s+sched\s+lookin|on\s+the\s+cards)|what\s+(?:do\s+i\s+have|am\s+i\s+doing|have\s+i\s+got)|am\s+i\s+(?:booked|busy|free|tied\s+up|swamped|open)|when(?:'?s|\s+is)\s+(?:my\s+next|a\s+good\s+time|can\s+(?:i|we)\s+(?:squeeze|meet|get\s+together)|am\s+(?:i|we)\s+(?:free|available))|anything\s+on|plans?\s+for|calendar\s+for|check\s+(?:my\s+)?(?:calendar|schedule|diary|cal)|look\s+(?:at|up)\s+(?:my\s+)?(?:calendar|schedule|diary|cal)|show\s+(?:me\s+)?(?:my\s+)?(?:availability|open\s+times|free\s+slots)|find\s+(?:a\s+)?(?:time|slot|gap|opening|sec|minute|moment)|find\s+\d+\s*(?:min(?:ute)?s?|hrs?|hours?|m|h)|find\s+(?:a\s+)?(?:\d+[- ]?(?:min(?:ute)?s?|hrs?|hours?|m|h)\s+)?(?:block|window|break|chunk|stretch|breather)|how'?s\s+(?:my\s+)?(?:schedule|calendar|cal|availability|day|week|month)\s+(?:looking|lookin)|got\s+(?:any\s+)?(?:time|a\s+sec|a\s+min)|when\s+(?:do\s+i\s+have|will\s+i\s+have|do\s+we\s+have|are\s+we)\s+(?:time|a\s+gap|a\s+free\s+moment|free)|is\s+(?:there\s+a\s+time|it\s+possible\s+to\s+meet|my\s+(?:calendar|cal)\s+(?:clear|open|full))|can\s+(?:i|we)\s+(?:fit|schedule|squeeze\s+(?:this|something)\s+in)|am\s+i\s+(?:doing\s+anything|working|available|busy)\s+(?:today|tomorrow|this|next|on)|what\s+does\s+my\s+(?:day|week|month|schedule)\s+look\s+like|when\s+is\s+my\s+(?:first|last|next)\s+(?:meeting|call|appointment)|any\s+(?:time\s+available|chance\s+we\s+can\s+talk)|how\s+(?:busy|booked)\s+am\s+i/i;
  const hasAvailabilityPhrase = availabilityPhrases.test(q);

  const hasWorkHoursRef = /work\s*hours|working\s*hours|office\s*hours|business\s*hours/.test(q);
  const hasTemporalRef = /today|tonight|tomorrow|next\s+(?:week|month)|this\s+(?:week|weekend|morning|afternoon|evening)|monday|tuesday|wednesday|thursday|friday|saturday|sunday|morning|afternoon|evening/i.test(q);
  const isImplicitAvailability = hasWorkHoursRef && hasTemporalRef;

  // Detect date-based queries that end with "?" — e.g. "11 march 2 pm?", "march 15?", "next friday 3pm?"
  // These are implicit availability checks even without explicit keywords.
  const hasDateRef = /\b(?:\d{1,2}\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2})\b/i.test(q);
  const hasTimeRef = /\b(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i.test(q);
  const endsWithQuestion = /\?\s*$/.test(q);
  const isImplicitDateTimeQuery = endsWithQuestion && (hasDateRef || hasTemporalRef || hasTimeRef);

  // Meet-intent queries (e.g. "grab lunch with tomorrow") should also pass through
  // as find intents even though they lack traditional availability keywords.
  const isMeetQuery = hasMeetIntent(query);

  if (!options?.skipKeywordCheck && !hasAvailabilityKeyword && !hasAvailabilityPhrase && !isImplicitAvailability && !isImplicitDateTimeQuery && !isMeetQuery) return null;

  const now = DateTime.now().setZone(timezone);

  // ── Pre-processor: "Nth weekday of month" (chrono can't handle this) ──
  const ordinalDate = resolveOrdinalWeekday(q, now);
  if (ordinalDate) {
    const mode = parseMode(q);
    const duration = parseDuration(q);
    const hasSpecificTime = /\bat\s+\d/i.test(q);
    if (hasSpecificTime) {
      // Try to extract time with chrono on a simplified query
      const refDateForTime = getChronoRefDate(now);
      const timeParsed = chrono.parse(query, refDateForTime, { forwardDate: true });
      if (timeParsed.length > 0 && timeParsed[0].start.isCertain("hour")) {
        const hour = timeParsed[0].start.get("hour") ?? 0;
        const minute = timeParsed[0].start.get("minute") ?? 0;
        const start = ordinalDate.set({ hour, minute });
        const checkDuration = duration || options?.defaultDuration || 60;
        return {
          type: "check",
          startAt: start.toISO()!,
          endAt: start.plus({ minutes: checkDuration }).toISO()!,
          mode,
          durationMinutes: checkDuration,
        };
      }
    }
    // Full-day find
    const start = ordinalDate.startOf("day");
    const end = ordinalDate.endOf("day");
    return {
      type: "find",
      startAt: start.toISO()!,
      endAt: end.toISO()!,
      mode,
      durationMinutes: duration || 30,
    };
  }

  let refDate = getChronoRefDate(now);

  // If "next week" appears alongside specific day names, shift the chrono
  // reference date to next Monday so day names resolve to the correct week.
  const hasNextWeek = /\bnext\s+week\b/i.test(q);
  const hasDayName = /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(q);
  if (hasNextWeek && hasDayName) {
    const nextMonday = now.startOf("week").plus({ weeks: 1 });
    refDate = getChronoRefDate(nextMonday);
  }

  // Detect explicit "find X duration" pattern → force type to "find"
  const isFindDurationPattern = /find\s+\d+\s*(?:min(?:ute)?s?|hrs?|hours?)/i.test(q);

  // Strip the duration text from the query before chrono parsing
  // so chrono doesn't misinterpret "20 mins" as a relative time offset
  let chronoInput = isFindDurationPattern
    ? query.replace(/\d+\s*(?:min(?:ute)?s?|hrs?|hours?)/gi, "").replace(/\s{2,}/g, " ").trim()
    : query;

  // Strip "next week" from chrono input when day names are present
  // so chrono doesn't double-shift the reference
  if (hasNextWeek && hasDayName) {
    chronoInput = chronoInput.replace(/\bnext\s+week\b/gi, "").replace(/\s{2,}/g, " ").trim();
  }

  const parsed = chrono.parse(chronoInput, refDate, { forwardDate: true });

  // ── Fix: "the 23rd" (bare day number) should mean THIS month, not next month ──
  // chrono with forwardDate:true may push to next month if the day has passed.
  // If the user specified a day but NOT a month, clamp to the current month.
  if (parsed.length > 0) {
    const sc = parsed[0].start;
    if (sc.isCertain("day") && !sc.isCertain("month") && !sc.isCertain("weekday")) {
      sc.assign("month", now.month);
      sc.assign("year", now.year);
    }
  }

  // ── Special case: "this week" / "next week" → full week range ──
  // chrono often returns just one day for "next week"; we want the entire 7-day span.
  const weekMatch = q.match(/\b(this|next)\s+week\b/i);
  if (weekMatch && (!parsed.length || !parsed[0].end)) {
    const weekOffset = weekMatch[1].toLowerCase() === "next" ? 1 : 0;
    const weekStart = now.startOf("week").plus({ weeks: weekOffset });
    const weekEnd = weekStart.endOf("week");
    return {
      type: "find",
      startAt: weekStart.toISO()!,
      endAt: weekEnd.toISO()!,
      mode: parseMode(q),
      durationMinutes: parseDuration(q) || 30,
    };
  }

  if (!parsed || parsed.length === 0) {
    const start = now;
    const end = now.plus({ days: 1 });
    return {
      type: "find",
      startAt: start.toISO()!,
      endAt: end.toISO()!,
      mode: parseMode(q),
      durationMinutes: parseDuration(q) || 30,
    };
  }

  const result = parsed[0];
  const startComponents = result.start;
  const endComponents = result.end;

  let start = DateTime.fromObject(
    {
      year: startComponents.get("year"),
      month: startComponents.get("month"),
      day: startComponents.get("day"),
      hour: startComponents.get("hour"),
      minute: startComponents.get("minute"),
      second: startComponents.get("second"),
      millisecond: startComponents.get("millisecond"),
    },
    { zone: timezone }
  );

  let end: DateTime | null = null;

  if (endComponents) {
    end = DateTime.fromObject(
      {
        year: endComponents.get("year"),
        month: endComponents.get("month"),
        day: endComponents.get("day"),
        hour: endComponents.get("hour"),
        minute: endComponents.get("minute"),
        second: endComponents.get("second"),
        millisecond: endComponents.get("millisecond"),
      },
      { zone: timezone }
    );
  }

  const hasSpecificTime = startComponents.isCertain("hour");
  const duration = parseDuration(q);
  const mode = parseMode(q);

  if (!end && hasSpecificTime) {
    const prefix = q.substring(0, result.index).trim().toLowerCase();
    if (prefix.endsWith("before") || prefix.endsWith("until") || prefix.endsWith("by")) {
      end = start;
      start = start.startOf("day");
    }
  }

  if (end) {
    const isCheckPhrasing = /^(am i|are you|do i have|can i|is)/i.test(q);
    if (isCheckPhrasing) {
      return {
        type: "check",
        startAt: start.toISO()!,
        endAt: end.toISO()!,
        mode,
        durationMinutes: duration || options?.defaultDuration || 60,
      };
    } else {
      return {
        type: "find",
        startAt: start.toISO()!,
        endAt: end.toISO()!,
        mode,
        durationMinutes: duration || 30,
      };
    }
  }

  if (hasSpecificTime && !isFindDurationPattern) {
    const checkDuration = duration || options?.defaultDuration || 60;
    const endDt = start.plus({ minutes: checkDuration });
    return {
      type: "check",
      startAt: start.toISO()!,
      endAt: endDt.toISO()!,
      mode,
      durationMinutes: checkDuration,
    };
  } else if (hasSpecificTime && isFindDurationPattern) {
    // "find X mins" with a specific time → search from that time to end of day
    const endDt = start.endOf("day");
    return {
      type: "find",
      startAt: start.toISO()!,
      endAt: endDt.toISO()!,
      mode,
      durationMinutes: duration || 30,
    };
  } else {
    const daypart = parseDaypart(q);

    if (daypart) {
      const ranges = getDaypartRange(start, daypart);
      return {
        type: "find",
        startAt: ranges.start.toISO()!,
        endAt: ranges.end.toISO()!,
        mode,
        durationMinutes: duration || 30,
      };
    } else {
      start = start.startOf("day");
      const endDt = start.endOf("day");

      const isCheckPhrasing = /^(am i|are you|do i have|can i)/i.test(q);

      if (isCheckPhrasing && hasSpecificTime) {
        const checkDuration = duration || options?.defaultDuration || 60;
        return {
          type: "check",
          startAt: start.toISO()!,
          endAt: start.plus({ minutes: checkDuration }).toISO()!,
          mode,
          durationMinutes: checkDuration,
        };
      }

      const startDay = start.startOf("day");
      const endDay = start.endOf("day");

      if (hasSpecificTime) {
        return {
          type: "find",
          startAt: start.toISO()!,
          endAt: endDay.toISO()!,
          mode,
          durationMinutes: duration || 30,
        };
      }

      return {
        type: "find",
        startAt: startDay.toISO()!,
        endAt: endDay.toISO()!,
        mode,
        durationMinutes: duration || 30,
      };
    }
  }
}

function parseMode(q: string): "any" | "work_hours" | "outside_work_hours" {
  if (q.includes("work hours") || q.includes("working hours")) {
    if (q.includes("outside") || q.includes("after") || q.includes("before")) {
      return "outside_work_hours";
    }
    return "work_hours";
  }
  return "any";
}

function parseDuration(q: string): number | undefined {
  const match = q.match(/(\d+)\s*(?:min|minute|hr|hour)/i);
  if (match) {
    const val = parseInt(match[1]);
    if (q.includes("hr") || q.includes("hour")) return val * 60;
    return val;
  }
  return undefined;
}

function parseDaypart(q: string): string | null {
  const parts = ["morning", "afternoon", "evening", "night"];
  for (const p of parts) {
    if (q.includes(p)) return p;
  }
  return null;
}

function getDaypartRange(date: DateTime, daypart: string): { start: DateTime; end: DateTime } {
  const d = date.startOf("day");
  switch (daypart) {
    case "morning": return { start: d.set({ hour: 9 }), end: d.set({ hour: 12 }) };
    case "afternoon": return { start: d.set({ hour: 12 }), end: d.set({ hour: 17 }) };
    case "evening": return { start: d.set({ hour: 17 }), end: d.set({ hour: 21 }) };
    case "night": return { start: d.set({ hour: 21 }), end: d.endOf("day") };
    default: return { start: d, end: d.endOf("day") };
  }
}

// ── Ordinal weekday resolver ───────────────────────────────────
// Handles patterns like "3rd Monday of April", "1st Friday of next month",
// "last Wednesday of March", "2nd Tuesday of this month"

const MONTH_NAMES: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const WEEKDAY_NAMES: Record<string, number> = {
  monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 7,
};

function resolveOrdinalWeekday(query: string, now: DateTime): DateTime | null {
  const q = query.toLowerCase();

  // Pattern 1: "Nth weekday of <month name>"
  // e.g. "3rd Monday of April", "1st Friday of March"
  const monthNameMatch = q.match(
    /(\d+|last)(?:st|nd|rd|th)?\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+(?:of|in)\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)/i
  );
  if (monthNameMatch) {
    const ordinalStr = monthNameMatch[1];
    const weekdayName = monthNameMatch[2].toLowerCase();
    const monthName = monthNameMatch[3].toLowerCase();
    const targetMonth = MONTH_NAMES[monthName];
    const targetWeekday = WEEKDAY_NAMES[weekdayName];
    if (!targetMonth || !targetWeekday) return null;

    // Determine the year: if the month is in the past for the current year, use next year
    let year = now.year;
    if (targetMonth < now.month || (targetMonth === now.month && ordinalStr !== "last" && now.day > 21)) {
      year++;
    }

    return findNthWeekdayInMonth(year, targetMonth, targetWeekday, ordinalStr, now.zone);
  }

  // Pattern 2: "Nth weekday of this/next month"
  // e.g. "2nd Tuesday of next month", "last Friday of this month"
  const relativeMonthMatch = q.match(
    /(\d+|last)(?:st|nd|rd|th)?\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+(?:of|in)\s+(this|next)\s+month/i
  );
  if (relativeMonthMatch) {
    const ordinalStr = relativeMonthMatch[1];
    const weekdayName = relativeMonthMatch[2].toLowerCase();
    const monthRef = relativeMonthMatch[3].toLowerCase();
    const targetWeekday = WEEKDAY_NAMES[weekdayName];
    if (!targetWeekday) return null;

    const targetDt = monthRef === "next" ? now.plus({ months: 1 }) : now;
    return findNthWeekdayInMonth(targetDt.year, targetDt.month, targetWeekday, ordinalStr, now.zone);
  }

  return null;
}

function findNthWeekdayInMonth(
  year: number,
  month: number,
  isoWeekday: number, // 1=Monday ... 7=Sunday (Luxon convention)
  ordinalStr: string,
  zone: any
): DateTime | null {
  const firstOfMonth = DateTime.fromObject({ year, month, day: 1 }, { zone });
  const daysInMonth = firstOfMonth.daysInMonth!;

  if (ordinalStr === "last") {
    // Walk backwards from end of month
    for (let d = daysInMonth; d >= 1; d--) {
      const dt = firstOfMonth.set({ day: d });
      if (dt.weekday === isoWeekday) return dt;
    }
    return null;
  }

  const ordinal = parseInt(ordinalStr, 10);
  if (isNaN(ordinal) || ordinal < 1 || ordinal > 5) return null;

  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = firstOfMonth.set({ day: d });
    if (dt.weekday === isoWeekday) {
      count++;
      if (count === ordinal) return dt;
    }
  }

  return null; // e.g. "5th Monday" doesn't exist in this month
}

// ── Add Note to Contact intent ────────────────────────────────
// Detects explicit command to add notes to a contact's profile

function detectAddNoteToContact(query: string): { content: string; contactName: string } | null {
  const q = query.trim();
  const match = q.match(/^(?:add|save|note)(?:\s+note)?\s+(.+?)\s+to\s+(?:contact\s+|profile\s+)?(.+?)(?:'s?\s+(?:profile|contact))?$/i);
  if (match) {
    let content = match[1].trim();
    // remove quotes if present
    if (content.startsWith('"') && content.endsWith('"')) {
      content = content.slice(1, -1);
    }
    let contactName = match[2].trim();
    // remove leading "my " if present
    contactName = contactName.replace(/^my\s+/i, '');
    if (content && contactName) {
      return { content, contactName };
    }
  }
  return null;
}

// ── Full Intent Parser ─────────────────────────────────────────

function parseFullIntent(query: string, timezone: string, options?: { defaultDuration?: number }): FullIntent {
  // Normalize "WEEKDAY next week" → "next WEEKDAY" for chrono
  query = query.replace(
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+next\s+week\b/gi,
    (_, day) => `next ${day}`
  );
  const q = query.toLowerCase();
  const now = DateTime.now().setZone(timezone);
  const refDate = getChronoRefDate(now);

  // ── Create Reminder ──
  // Wide set of reminder trigger phrases
  const reminderMatch = q.match(
    /(?:remind\s+me\s+to|don'?t\s+forget\s+to|don'?t\s+let\s+me\s+forget\s+to|remember\s+to|make\s+sure\s+(?:i|we)\s+|note\s+to\s+self\s*[:-]?\s*|set\s+(?:a\s+)?reminder\s+(?:to\s+)?|heads?\s+up\s+(?:about|to)\s+)\s*(.+)/i
  );
  if (reminderMatch) {
    const rest = reminderMatch[1].trim();
    // Use chrono to extract date/time from the rest
    const parsed = chrono.parse(rest, refDate, { forwardDate: true });

    if (parsed.length > 0) {
      const chronoResult = parsed[0];
      // Extract task = everything that's NOT the date/time phrase
      const dateText = chronoResult.text;
      let task = rest.replace(dateText, "").replace(/\s+on\s*$/, "").replace(/^\s*on\s+/, "").trim();
      // Clean up dangling prepositions
      task = task.replace(/\s+(on|at|by|for|in)\s*$/i, "").trim();
      if (!task) task = rest.split(/\s+(?:on|at|by)\s+/i)[0]?.trim() || rest;

      const startComp = chronoResult.start;
      const hasTime = startComp.isCertain("hour");

      if (hasTime) {
        const dueAt = DateTime.fromObject({
          year: startComp.get("year"),
          month: startComp.get("month"),
          day: startComp.get("day"),
          hour: startComp.get("hour"),
          minute: startComp.get("minute") ?? 0,
        }, { zone: timezone });
        return { type: "createReminder", task, dueAt: dueAt.toISO()! };
      } else {
        const dateIso = DateTime.fromObject({
          year: startComp.get("year"),
          month: startComp.get("month"),
          day: startComp.get("day"),
        }, { zone: timezone }).toISODate()!;
        return { type: "createReminderNeedsTime", task, dateIso };
      }
    }
    // No date found — default to "today", ask for time
    return { type: "createReminderNeedsTime", task: rest, dateIso: now.toISODate()! };
  }

  // ── Recurring Event Pattern: "every [day] [activity]" or "[activity] every [day]" ──
  const everyRecurMatch = q.match(
    /^(?:(.+?)\s+)?every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|day|weekday|week|month|year)(?:\s+(.+))?$/i
  );
  if (everyRecurMatch) {
    const beforeEvery = everyRecurMatch[1]?.trim();
    const recWord = everyRecurMatch[2].toLowerCase();
    const afterEvery = everyRecurMatch[3]?.trim();
    const title = beforeEvery || afterEvery || "";
    const weekdaysList = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];
    let dateIso: string | undefined;
    let recFreq: string | undefined;

    if (weekdaysList.includes(recWord)) {
      const targetDow = weekdaysList.indexOf(recWord) + 1;
      let nextDate = now;
      while (nextDate.weekday !== targetDow) {
        nextDate = nextDate.plus({ days: 1 });
      }
      dateIso = nextDate.toISODate()!;
      recFreq = "weekly";
    } else if (recWord === "day" || recWord === "weekday") {
      dateIso = now.toISODate()!;
      recFreq = "daily";
    } else if (recWord === "week") {
      dateIso = now.toISODate()!;
      recFreq = "weekly";
    } else if (recWord === "month") {
      dateIso = now.toISODate()!;
      recFreq = "monthly";
    } else if (recWord === "year") {
      dateIso = now.toISODate()!;
      recFreq = "yearly";
    }

    if (dateIso && recFreq && title) {
      return {
        type: "createEventWizard" as const,
        title,
        date: dateIso,
        time: undefined,
        duration: undefined,
        recurrence: { frequency: recFreq, interval: 1 },
      };
    }
  }

  // ── Create Event ──
  // Prefix: optional "I need/have/want/got/gotta to" without "I"
  const pfx = "^(?:(?:i\\s+)?(?:need|have|want|got|gotta)\\s+to\\s+)?";

  // ─�� Chore/task-like activities: route to reminder instead of event ──
  const _taskNouns = [
    "laundry","dishes","vacuuming?","mopping?","sweeping?","dusting",
    "ironing","cleaning","declutter(?:ing)?","organiz(?:e|ing)","tidying?",
    "trash","garbage","recycling","compost","mow(?:ing)?\\s+(?:the\\s+)?lawn",
    "yard\\s+work","weed(?:ing)?","watering?\\s+(?:the\\s+)?(?:plants?|garden)",
    "feed(?:ing)?\\s+(?:the\\s+)?(?:cat|dog|pet|fish|bird)","walk(?:ing)?\\s+(?:the\\s+)?dog",
    "litter\\s+box","scoop(?:ing)?","bed(?:s)?\\s+(?:mak(?:e|ing))?",
    "chang(?:e|ing)\\s+(?:the\\s+)?(?:sheets|bedding|filter|bulb|batteries)",
    "cook(?:ing)?","meal\\s+prep","bak(?:e|ing)","prep\\s+(?:dinner|lunch|food)",
    "defrost(?:ing)?","marinat(?:e|ing)","chop(?:ping)?",
    "mail\\s+(?:the\\s+)?(?:letter|package)","ship(?:ping)?\\s+(?:the\\s+)?",
    "return(?:ing)?\\s+(?:the\\s+)?","exchange\\s+(?:the\\s+)?",
    "deposit(?:ing)?","pay(?:ing)?\\s+(?:the\\s+)?(?:bills?|rent|utilities|invoice)",
    "renew(?:ing)?\\s+(?:my\\s+)?","cancel(?:l?ing)?\\s+(?:my\\s+)?",
    "sign\\s+up\\s+for","register(?:ing)?\\s+for","unsubscrib(?:e|ing)",
    "file(?:ing)?\\s+(?:taxes|papers|documents)","shred(?:ding)?",
    "text(?:ing)?\\s+","message\\s+","email(?:ing)?\\s+","reply(?:ing)?\\s+(?:to\\s+)?",
    "respond(?:ing)?\\s+(?:to\\s+)?","write(?:ing)?\\s+(?:a\\s+)?(?:letter|email|note|card|thank\\s+you)",
    "send(?:ing)?\\s+(?:a\\s+)?(?:message|text|email|letter|card|package|gift)",
    "follow\\s+up\\s+(?:with|on)","rsvp",
    "take\\s+(?:my\\s+)?(?:meds?|medicine|vitamins?|supplements?|pills?)",
    "stretch(?:ing)?","meditat(?:e|ing|ion)","journal(?:ing)?",
    "floss(?:ing)?","brush(?:ing)?\\s+(?:my\\s+)?teeth","skincare","sunscreen",
    "update(?:ing)?\\s+(?:my\\s+)?(?:app|phone|software|password|resume|profile|linkedin)",
    "backup(?:ing)?","download(?:ing)?","upload(?:ing)?","install(?:ing)?",
    "charg(?:e|ing)\\s+(?:my\\s+)?(?:phone|laptop|tablet|watch|headphones)",
    "order(?:ing)?\\s+","buy(?:ing)?\\s+","shop(?:ping)?\\s+(?:for\\s+)?",
    "restock(?:ing)?","replenish(?:ing)?","pick(?:ing)?\\s+up\\s+(?:the\\s+)?",
    "homework","assignment","submit(?:ting)?\\s+(?:the\\s+|my\\s+)?",
    "finish(?:ing)?\\s+(?:the\\s+|my\\s+)?","complet(?:e|ing)\\s+(?:the\\s+|my\\s+)?",
    "review(?:ing)?\\s+(?:the\\s+|my\\s+)?","edit(?:ing)?\\s+(?:the\\s+|my\\s+)?",
    "proofread(?:ing)?","research(?:ing)?",
    "read(?:ing)?\\s+(?:the\\s+|my\\s+|a\\s+)?(?:book|article|chapter|report|paper|doc)",
    "study(?:ing)?\\s+(?:for\\s+)?",
    "fix(?:ing)?\\s+(?:the\\s+|my\\s+)?","repair(?:ing)?\\s+(?:the\\s+|my\\s+)?",
    "replace\\s+(?:the\\s+|my\\s+)?","check(?:ing)?\\s+(?:the\\s+|my\\s+|on\\s+)?",
    "sort(?:ing)?\\s+(?:the\\s+|my\\s+)?","pack(?:ing)?\\s+(?:my\\s+|the\\s+|for\\s+)?",
    "unpack(?:ing)?","assemble(?:ing)?","hang(?:ing)?\\s+(?:the\\s+|up\\s+)?",
    "measure(?:ing)?","print(?:ing)?\\s+(?:the\\s+|my\\s+)?",
    "call(?:ing)?\\s+(?:the\\s+)?(?:plumber|electrician|landlord|mechanic|handyman|contractor|insurance|bank|cable|internet)",
  ];
  const _taskPat = new RegExp(
    "^(?:(?:i\\s+)?(?:need|have|want|got|gotta)\\s+to\\s+)?(?:do\\s+(?:the\\s+|my\\s+)?)?(?:" + _taskNouns.join("|") + ")", "i"
  );
  const _isTaskLike = _taskPat.test(q) && !/^(?:find|when|am\s+i|do\s+i\s+have|check|any|what)/i.test(q);

  if (_isTaskLike) {
    let _tt = query;
    _tt = _tt.replace(/^(?:(?:i\s+)?(?:need|have|want|got|gotta)\s+to\s+)/i, "");
    _tt = _tt.replace(/^(?:do\s+(?:the\s+|my\s+)?)/i, "");
    const _tp = chrono.parse(_tt, refDate, { forwardDate: true });
    if (_tp.length > 0) { for (const p of _tp) { _tt = _tt.replace(p.text, ""); } }
    _tt = _tt.replace(/\s+(today|tonight|tomorrow|this\s+\w+|next\s+\w+|on\s+\w+|by\s+\w+).*$/i, "").trim();
    _tt = _tt.replace(/\s+(at|on|for|by|in)\s*$/i, "").trim();
    if (_tt) _tt = _tt.charAt(0).toUpperCase() + _tt.slice(1);
    if (!_tt) _tt = "To do";

    const _cp = chrono.parse(query, refDate, { forwardDate: true });
    if (_cp.length > 0) {
      const _sc = _cp[0].start;
      const _ht = _sc.isCertain("hour");
      const _dt = DateTime.fromObject({ year: _sc.get("year"), month: _sc.get("month"), day: _sc.get("day") }, { zone: timezone });
      if (_ht) {
        const _da = _dt.set({ hour: _sc.get("hour") ?? 0, minute: _sc.get("minute") ?? 0 });
        return { type: "createReminder", task: _tt, dueAt: _da.toISO()! };
      } else {
        return { type: "createReminderNeedsTime", task: _tt, dateIso: _dt.toISODate()! };
      }
    }
    return { type: "createReminderNeedsTime", task: _tt, dateIso: now.toISODate()! };
  }

  // Scheduling verbs, social/meal patterns, meeting types, professional jargon.
  const strictEventKeywords = new RegExp(pfx + "(?:" + [
    // Social / meal patterns with "with" / "w"
    "meet(?:ing)?", "call\\s+(?:with|w)\\s", "call\\b", "lunch\\s+(?:with|w)\\s", "coffee\\s+(?:with|w)\\s",
    "dinner\\s+(?:with|w)\\s", "breakfast\\s+(?:with|w)\\s", "brunch\\s+(?:with|w)\\s",
    "drinks?\\s+(?:with|w)\\s", "hang(?:out|\\s+out)\\s+(?:with|w)\\s",
    // Communication / catch-up verbs
    "talk\\s+(?:to|with)", "speak\\s+(?:to|with)", "chat\\s+(?:with|w)\\s",
    "catch-?up\\s+(?:with|w)\\s", "catch\\s+up\\s+(?:with|w)\\s",
    "catch-?up\\b", "check\\s+in\\s+(?:with|w)\\s",
    "text\\s+", "phone\\b", "ring\\b", "facetime\\b", "zoom\\s+(?:with|w)\\s", "skype\\b",
    // "have a …" patterns
    "have\\s+(?:a\\s+)?(?:meeting|call|chat|session|appointment|lunch|dinner|breakfast|coffee|brunch|drinks?|check-?up|physical|lesson|class|rehearsal)",
    // "get …" meal / activity
    "get\\s+(?:lunch|dinner|breakfast|coffee|brunch|drinks?|a\\s+haircut|a\\s+check-?up)",
    // Scheduling verbs
    "schedule\\s+(?:a\\s+)?", "book\\s+(?:a\\s+)?", "add\\s+(?:a\\s+|an\\s+)?(?:event|meeting|call|appointment)",
    "create\\s+(?:a\\s+|an\\s+)?(?:event|meeting|call|appointment)",
    "set\\s+up\\s+(?:a\\s+)?", "arrange\\s+(?:a\\s+)?", "organize\\s+(?:a\\s+)?",
    "plan\\s+(?:a\\s+)?(?:meeting|trip|event|party|celebration)",
    "pencil\\s+in", "put\\s+(?:in|on)\\s+(?:my\\s+)?(?:calendar|diary|schedule)",
    "block\\s+(?:off?\\s+)?(?:time|calendar)",
    // Professional meetings / agile
    "stand-?up", "kick-?off", "all-?hands", "town\\s+hall", "team\\s+building",
    "one-?on-?one", "1[:-]on[:-]1", "1[:-]1\\b", "sprint\\s+(?:planning|review|retro)",
    "daily\\s+(?:scrum|standup|sync)", "huddle", "sync\\b", "retro\\b", "demo\\b",
    "offsite", "webinar", "workshop", "conference", "summit", "seminar",
    // Nouns that are always event-like
    "appointment", "appt", "interview", "orientation", "onboarding",
    "happy\\s+hour", "date\\s+night", "girls'?\\s+night", "boys'?\\s+night", "night\\s+out",
  ].join("|") + ")", "i");

  // Broad keywords — action verbs / nouns that imply an event.
  // With temporal → immediate; without → wizard (ask for date).
  const broadEventKeywords = new RegExp(pfx + "(?:" + [
    // Movement / action verbs
    "go\\s+to", "go\\s+for", "head\\s+to", "run\\s+to", "drive\\s+to", "fly\\s+to", "fly\\s+out",
    "swing\\s+by", "stop\\s+by", "pop\\s+(?:in|into|over)", "drop\\s+by",
    "visit", "see\\s+(?:the\\s+|a\\s+|my\\s+)?", "attend",
    "pick\\s+up", "drop\\s+off", "grab\\b", "fetch\\b", "collect\\b", "deliver\\b",
    "get\\s+", "take\\s+(?:the\\s+|a\\s+)?", "do\\s+(?:a\\s+|the\\s+)?", "bring\\b",
    // Work / shift
    "work\\s+(?:at|on|from)", "my\\s+shift", "shift\\s+at", "on\\s+call", "clock\\s+in",
    // Health / medical (single-word nouns)
    "dentist", "doctor", "doc\\b", "GP\\b", "vet\\b", "physio", "chiro",
    "therapist", "therapy", "counsell?or", "psychiatrist", "dermatologist",
    "optometrist", "specialist", "surgeon", "hospital", "clinic",
    "vaccination", "vaccine", "vaccinated", "jab\\b", "booster", "flu\\s+shot",
    "blood\\s+(?:test|work)", "lab\\s+work", "MRI\\b", "X-?ray", "ultrasound",
    "scan\\b", "check-?up", "physical\\b",
    // Education
    "class\\b", "lecture", "tutorial", "tute\\b", "exam\\b", "quiz\\b",
    "study\\s+(?:group|session)", "tutoring", "training", "course\\b", "lesson",
    // Fitness / sport
    "gym\\b", "workout", "work\\s+out", "yoga", "pilates", "cross-?fit",
    "PT\\s+session", "personal\\s+training", "spin\\s+class",
    "swim\\b", "tennis", "basketball", "soccer", "football", "cricket",
    "netball", "hockey", "rugby", "practice", "rehearsal",
    "scrimmage", "tournament", "match\\b", "game\\b",
    // Entertainment
    "concert", "gig\\b", "show\\b", "movie", "film\\b", "play\\b", "musical",
    "theatre", "theater", "exhibition", "gallery", "museum", "recital",
    "performance", "festival", "zoo\\b", "aquarium",
    // Life events
    "party", "celebration", "birthday", "anniversary", "wedding", "funeral",
    "graduation", "ceremony", "reception", "housewarming", "baby\\s+shower",
    "engagement", "BBQ\\b", "barbecue", "potluck",
    // Travel
    "flight", "airport", "road\\s+trip", "layover", "check-?out",
    // Errands / services
    "haircut", "hair\\s+appointment", "oil\\s+change", "car\\s+(?:service|wash)",
    "dry\\s+clean(?:ing|ers?)", "grocery", "shopping", "pharmacy",
    "bank\\b", "post\\s+office", "notary", "lawyer", "accountant", "inspection",
    // Social / meals (bare nouns — lower confidence than strict but still event-like)
    "lunch\\b", "dinner\\b", "breakfast\\b", "brunch\\b", "coffee\\b", "supper",
    "drinks?\\b",
  ].join("|") + ")", "i");

  // Skip event creation if the query is a schedule/availability question
  const isScheduleQuestion = /^(?:do\s+i\s+have|am\s+i|what(?:'?s|\s+do\s+i\s+have|(?:\s+is)?\s+on\s+my)|how(?:'?s|\s+is|\s+does)\s+my|is\s+(?:there|my)|any(?:thing)?(?:\s+on)?(?:\s+my)?)(?:\s|$)/i.test(q);
  const isStrictEvent = !isScheduleQuestion && strictEventKeywords.test(q);
  // Broad match: with temporal → immediate event; without temporal → wizard (ask for date)
  const hasTemporal = chrono.parse(query, refDate, { forwardDate: true }).length > 0
    || /today|tonight|tomorrow|next\s+(?:week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|this\s+(?:week|weekend|morning|afternoon|evening)|monday|tuesday|wednesday|thursday|friday|saturday|sunday|on\s+the\s+\d+|(?:EOD|EOW|COB)\b/i.test(q);
  const isBroadEventMatch = !isScheduleQuestion && broadEventKeywords.test(q);
  const isBroadEvent = isBroadEventMatch && hasTemporal;

  if (isStrictEvent || isBroadEvent || isBroadEventMatch) {
    // Use chrono to extract date/time
    const parsed = chrono.parse(query, refDate, { forwardDate: true });
    let duration = parseDuration(q);

    // Also check for ordinal dates ("on the 3rd", "on the 15th")
    const ordinalDayMatch = q.match(/(?:on\s+)?the\s+(\d+)(?:st|nd|rd|th)/i);
    let ordinalDate: DateTime | null = null;
    if (ordinalDayMatch) {
      const dayNum = parseInt(ordinalDayMatch[1]);
      if (dayNum >= 1 && dayNum <= 31) {
        if (dayNum >= now.day) {
          ordinalDate = now.set({ day: dayNum }).startOf("day");
        } else {
          ordinalDate = now.plus({ months: 1 }).set({ day: dayNum }).startOf("day");
        }
      }
    }

    // Extract the title: remove temporal phrases, duration, and filler
    let title = query;
    title = title.replace(/^(?:(?:i\s+)?(?:need|have|want|got|gotta)\s+to\s+)/i, "");
    // Strip leading action verbs that aren't part of the event name
    // "get" is only stripped when followed by a meal/activity (e.g. "get lunch" → "Lunch")
    // "schedule/book/add/create/set up/arrange/plan" are pure scheduling verbs → always strip
    title = title.replace(/^(?:have\s+(?:a\s+)?|get\s+(?:a\s+)?(?=(?:lunch|dinner|breakfast|coffee|brunch|drinks?|haircut|check-?up))|do\s+(?:a\s+|the\s+)?|go\s+to\s+|go\s+for\s+(?:a\s+|my\s+|the\s+)?|head\s+to\s+|run\s+to\s+|drive\s+to\s+|fly\s+to\s+|swing\s+by\s+|stop\s+by\s+|pop\s+(?:in|into|over)\s+(?:to\s+)?|drop\s+by\s+|work\s+(?:at|on|from)\s+|schedule\s+(?:a\s+|an\s+)?|book\s+(?:a\s+|an\s+)?|add\s+(?:a\s+|an\s+)?|create\s+(?:a\s+|an\s+)?|set\s+up\s+(?:a\s+|an\s+)?|arrange\s+(?:a\s+|an\s+)?|organize\s+(?:a\s+|an\s+)?|plan\s+(?:a\s+|an\s+)?|pencil\s+in\s+(?:a\s+)?|put\s+(?:in|on)\s+(?:my\s+)?(?:calendar|diary|schedule)\s+)/i, "");
    title = title.replace(/\s+for\s+\d+\s*(?:min(?:ute)?s?|hr|hours?)/i, "");
    if (parsed.length > 0) {
      for (const p of parsed) {
        title = title.replace(p.text, "");
      }
    }
    if (ordinalDayMatch) {
      title = title.replace(/(?:on\s+)?the\s+\d+(?:st|nd|rd|th)/i, "");
    }
    title = title.replace(/\s+(at|on|for|by|in)\s*$/i, "").trim();
    title = title.replace(/^\s*(at|on|for|by|in)\s+/i, "").trim();

    // Extract location from "at <Place>" in the title (e.g. "shift at SEA Life")
    let extractedLocation: string | null = null;
    const locMatch = title.match(/\s+at\s+(.+)$/i);
    if (locMatch) {
      extractedLocation = locMatch[1].trim();
      title = title.replace(/\s+at\s+.+$/i, "").trim();
    }

    if (title) title = title.charAt(0).toUpperCase() + title.slice(1);
    if (!title) title = "New Event";

    // Determine what date/time info we have
    let dateIso: string | undefined;
    let time: { hour: number; minute: number } | undefined;
    let endTime: { hour: number; minute: number } | undefined;

    if (parsed.length > 0) {
      const startComp = parsed[0].start;
      const endComp = parsed[0].end;
      const hasTime = startComp.isCertain("hour");
      const hasDate = startComp.isCertain("day") || startComp.isCertain("weekday");

      if (hasDate) {
        const dt = DateTime.fromObject({
          year: startComp.get("year"),
          month: startComp.get("month"),
          day: startComp.get("day"),
        }, { zone: timezone });
        dateIso = dt.toISODate()!;
      } else if (ordinalDate) {
        dateIso = ordinalDate.toISODate()!;
      }

      if (hasTime) {
        time = { hour: startComp.get("hour") ?? 0, minute: startComp.get("minute") ?? 0 };
      }

      // Extract end time from chrono (e.g. "from 7am to 4:30pm")
      if (endComp && endComp.isCertain("hour")) {
        endTime = { hour: endComp.get("hour") ?? 0, minute: endComp.get("minute") ?? 0 };
      }
    } else if (ordinalDate) {
      dateIso = ordinalDate.toISODate()!;
    }

    // If chrono gave us both start and end times, compute the duration
    if (time && endTime && !duration) {
      const startMins = time.hour * 60 + time.minute;
      const endMins = endTime.hour * 60 + endTime.minute;
      if (endMins > startMins) {
        duration = endMins - startMins;
      }
    }

    // If we have everything, create directly
    if (dateIso && time && duration) {
      const startDt = DateTime.fromISO(dateIso, { zone: timezone }).set({ hour: time.hour, minute: time.minute });
      const endDt = startDt.plus({ minutes: duration });
      return { type: "createEvent", title, startAt: startDt.toISO()!, endAt: endDt.toISO()!, location: extractedLocation };
    }

    // If we have date + time but no duration
    if (dateIso && time) {
      const startDt = DateTime.fromISO(dateIso, { zone: timezone }).set({ hour: time.hour, minute: time.minute });
      return { type: "createEventNeedsDuration", title, startAt: startDt.toISO()!, location: extractedLocation };
    }

    // Missing date, time, or both → wizard flow
    return { type: "createEventWizard", title, date: dateIso, time, duration };
  }

  // ── Availability Check / Find ──
  return parseIntent(query, timezone, options?.defaultDuration ? { defaultDuration: options.defaultDuration } : undefined);
}

// ── Context-aware time suggestions based on event title ────────

function inferTimeOptions(title: string): { label: string; value: string }[] {
  const t = title.toLowerCase();

  // Dinner / supper
  if (/dinner|supper|dine/i.test(t)) {
    return [
      { label: "6:00 PM", value: "6pm" },
      { label: "7:00 PM", value: "7pm" },
      { label: "7:30 PM", value: "7:30pm" },
      { label: "8:00 PM", value: "8pm" },
    ];
  }
  // Lunch
  if (/lunch/i.test(t)) {
    return [
      { label: "11:30 AM", value: "11:30am" },
      { label: "12:00 PM", value: "12pm" },
      { label: "12:30 PM", value: "12:30pm" },
      { label: "1:00 PM", value: "1pm" },
    ];
  }
  // Breakfast / brunch
  if (/breakfast|brunch/i.test(t)) {
    return [
      { label: "7:30 AM", value: "7:30am" },
      { label: "8:00 AM", value: "8am" },
      { label: "9:00 AM", value: "9am" },
      { label: "10:00 AM", value: "10am" },
    ];
  }
  // Coffee / tea
  if (/coffee|tea\b/i.test(t)) {
    return [
      { label: "8:00 AM", value: "8am" },
      { label: "10:00 AM", value: "10am" },
      { label: "2:00 PM", value: "2pm" },
      { label: "3:00 PM", value: "3pm" },
    ];
  }
  // Evening / after work / drinks / happy hour
  if (/evening|after\s*work|drinks?|happy\s*hour|night\s*out/i.test(t)) {
    return [
      { label: "5:00 PM", value: "5pm" },
      { label: "6:00 PM", value: "6pm" },
      { label: "7:00 PM", value: "7pm" },
      { label: "8:00 PM", value: "8pm" },
    ];
  }
  // Morning
  if (/morning/i.test(t)) {
    return [
      { label: "8:00 AM", value: "8am" },
      { label: "9:00 AM", value: "9am" },
      { label: "10:00 AM", value: "10am" },
      { label: "11:00 AM", value: "11am" },
    ];
  }
  // Afternoon
  if (/afternoon/i.test(t)) {
    return [
      { label: "1:00 PM", value: "1pm" },
      { label: "2:00 PM", value: "2pm" },
      { label: "3:00 PM", value: "3pm" },
      { label: "4:00 PM", value: "4pm" },
    ];
  }
  // Gym / workout / exercise / run / yoga / swim / crossfit / spin
  if (/gym|workout|work\s*out|exercise|run\b|jog|yoga|pilates|cross-?fit|fitness|swim\b|spin\s+class|PT\s+session|personal\s+training/i.test(t)) {
    return [
      { label: "6:00 AM", value: "6am" },
      { label: "7:00 AM", value: "7am" },
      { label: "5:00 PM", value: "5pm" },
      { label: "6:00 PM", value: "6pm" },
    ];
  }
  // Doctor / dentist / health / vet / appointment / checkup
  if (/doctor|dentist|appt|appointment|checkup|check-up|clinic|hospital|therapy|therapist|physio|chiro|vet\b|GP\b|specialist|surgeon|dermatologist|optometrist|scan\b|MRI|X-?ray|ultrasound|vaccination|vaccinated|vaccine|booster|flu\s*shot|blood|physical/i.test(t)) {
    return [
      { label: "9:00 AM", value: "9am" },
      { label: "10:00 AM", value: "10am" },
      { label: "11:00 AM", value: "11am" },
      { label: "2:00 PM", value: "2pm" },
    ];
  }
  // Meeting / interview / professional
  if (/meeting|interview|sync\b|standup|stand-up|huddle|retro\b|demo\b|review\b|kickoff|kick-off|1[:-]1|one-on-one|offsite|conference|seminar|workshop|webinar|orientation|onboarding/i.test(t)) {
    return [
      { label: "9:00 AM", value: "9am" },
      { label: "10:00 AM", value: "10am" },
      { label: "1:00 PM", value: "1pm" },
      { label: "3:00 PM", value: "3pm" },
    ];
  }
  // Errands / services
  if (/haircut|hair\s+appt|oil\s+change|car\s+(?:service|wash)|dry\s+clean|grocery|shopping|pharmacy|bank\b|post\s+office|notary|lawyer|accountant|inspection/i.test(t)) {
    return [
      { label: "9:00 AM", value: "9am" },
      { label: "11:00 AM", value: "11am" },
      { label: "1:00 PM", value: "1pm" },
      { label: "3:00 PM", value: "3pm" },
    ];
  }
  // Entertainment / shows / concerts (tend to be evening)
  if (/concert|gig\b|show\b|movie|film\b|play\b|musical|theatre|theater|performance|recital|festival/i.test(t)) {
    return [
      { label: "6:00 PM", value: "6pm" },
      { label: "7:00 PM", value: "7pm" },
      { label: "7:30 PM", value: "7:30pm" },
      { label: "8:00 PM", value: "8pm" },
    ];
  }
  // Party / celebration / life events
  if (/party|celebration|birthday|anniversary|wedding|graduation|ceremony|reception|housewarming|BBQ|barbecue|potluck|baby\s+shower/i.test(t)) {
    return [
      { label: "12:00 PM", value: "12pm" },
      { label: "2:00 PM", value: "2pm" },
      { label: "5:00 PM", value: "5pm" },
      { label: "6:00 PM", value: "6pm" },
    ];
  }
  // Class / education
  if (/class\b|lecture|tutorial|tute\b|exam\b|quiz\b|study|tutoring|training|course\b|lesson/i.test(t)) {
    return [
      { label: "8:00 AM", value: "8am" },
      { label: "10:00 AM", value: "10am" },
      { label: "1:00 PM", value: "1pm" },
      { label: "3:00 PM", value: "3pm" },
    ];
  }
  // Sports / game / match
  if (/tennis|basketball|soccer|football|cricket|netball|hockey|rugby|game\b|match\b|tournament|practice|rehearsal|scrimmage/i.test(t)) {
    return [
      { label: "8:00 AM", value: "8am" },
      { label: "10:00 AM", value: "10am" },
      { label: "4:00 PM", value: "4pm" },
      { label: "6:00 PM", value: "6pm" },
    ];
  }
  // Travel / flight / airport
  if (/flight|airport|fly\b|road\s+trip|drive|layover/i.test(t)) {
    return [
      { label: "6:00 AM", value: "6am" },
      { label: "8:00 AM", value: "8am" },
      { label: "12:00 PM", value: "12pm" },
      { label: "5:00 PM", value: "5pm" },
    ];
  }
  // Default — standard spread through the day
  return [
    { label: "9:00 AM", value: "9am" },
    { label: "12:00 PM", value: "12pm" },
    { label: "2:00 PM", value: "2pm" },
    { label: "5:00 PM", value: "5pm" },
  ];
}

// ── Helper for formatting time ───��─────────────────────────────

function formatTime24(t: { hour: number; minute: number }): string {
  const dt = DateTime.fromObject({ hour: t.hour, minute: t.minute });
  return dt.toFormat("h:mm a");
}

// ── Helper for building date quick-pick options ─────────��──────

function buildDateOptions(timezone: string, suggestedDateIso?: string): { label: string; value: string }[] {
  const now = DateTime.now().setZone(timezone);
  const options: { label: string; value: string }[] = [];

  // If there's a suggested date from the initial query, show it first with a ★
  if (suggestedDateIso) {
    const sugDt = DateTime.fromISO(suggestedDateIso).setZone(timezone);
    const diffDays = Math.round(sugDt.startOf("day").diff(now.startOf("day"), "days").days);
    let sugLabel: string;
    if (diffDays === 0) sugLabel = "Today";
    else if (diffDays === 1) sugLabel = "Tomorrow";
    else sugLabel = sugDt.toFormat("EEE, MMM d");
    options.push({ label: `★ ${sugLabel}`, value: sugDt.toFormat("EEEE, MMMM d") });
  }

  // Standard options
  options.push(
    { label: "Today", value: "today" },
    { label: "Tomorrow", value: "tomorrow" },
  );
  // Next 5 days
  for (let i = 2; i <= 6; i++) {
    const d = now.plus({ days: i });
    options.push({ label: d.toFormat("EEE, MMM d"), value: d.toFormat("EEEE") });
  }

  // Deduplicate (if suggested date is today/tomorrow/one of the next days)
  const seen = new Set<string>();
  return options.filter((o) => {
    const key = o.value.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Helper for parsing date from reply ─────────────────────────

function parseDateFromReply(reply: string, timezone: string): string | null {
  const now = DateTime.now().setZone(timezone);
  const refDate = getChronoRefDate(now);
  const parsed = chrono.parse(reply, refDate, { forwardDate: true });
  if (parsed.length > 0 && (parsed[0].start.isCertain("day") || parsed[0].start.isCertain("weekday"))) {
    const dt = DateTime.fromObject({
      year: parsed[0].start.get("year"),
      month: parsed[0].start.get("month"),
      day: parsed[0].start.get("day"),
    }, { zone: timezone });
    return dt.toISODate()!;
  }
  return null;
}

// ── Helper for parsing location from reply ─────────────────────

function parseLocationFromReply(reply: string): string | null {
  const q = reply.trim().toLowerCase();
  if (!q || q === "skip" || q === "no" || q === "none" || q === "n/a" || q === "na") {
    return null;
  }
  // Return the raw reply as-is (capitalized)
  return reply.trim();
}

// ── Helper for parsing duration from reply ────────────────��────

function parseDurationFromReply(reply: string): number | null {
  const q = reply.toLowerCase();
  // Match patterns like "30 minutes", "1 hour", "90 minutes", "1.5 hours", "2hrs"
  const match = q.match(/([\d.]+)\s*(?:min(?:ute)?s?|hr(?:s)?|hours?)/i);
  if (match) {
    const val = parseFloat(match[1]);
    if (/hr|hour/i.test(match[0])) return Math.round(val * 60);
    return Math.round(val);
  }
  // Also handle plain numbers as minutes
  const plainNum = q.match(/^(\d+)$/);
  if (plainNum) return parseInt(plainNum[1]);
  return null;
}

// ── Follow-up query detection ───────────────────────────���────
// Detects short conversational follow-ups like "2 pm?", "what about 3?",
// "how about friday?", "morning?", "noon?" that rely on prior context.

function detectFollowUp(query: string, timezone: string): {
  time?: { hour: number; minute: number };
  dateShift?: DateTime;
  timeOfDay?: "morning" | "afternoon" | "evening";
  timeWindow?: { startHour: number; endHour: number };
  durationMinutes?: number;
} | null {
  const q = query.trim();
  // Must be short (< 60 chars) to qualify as a follow-up
  if (q.length > 60) return null;

  // Strip conversational prefixes
  const stripped = q
    .replace(/^(?:what\s+about|how\s+about|how'?s|and|or|maybe|and\s+what\s+about|what\s+if|could\s+(?:we|i)\s+(?:do|try|make\s+it)?|can\s+(?:we|i)\s+(?:do|try|make\s+it)?|instead|rather)\s+/i, "")
    .replace(/\?\s*$/, "")
    .trim();

  if (!stripped) return null;

  const now = DateTime.now().setZone(timezone);

  // Check for duration change: "30 mins", "for 1 hour"
  const durMatch = stripped.match(/^(?:for\s+)?(\d+(?:\.\d+)?)\s*(min(?:ute)?s?|hr(?:s)?|hours?)(?:\s+instead)?$/i);
  if (durMatch) {
    const val = parseFloat(durMatch[1]);
    const isHr = /hr|hour/i.test(durMatch[2]);
    return { durationMinutes: isHr ? Math.round(val * 60) : Math.round(val) };
  }

  // Check for time-of-day words: "morning?", "afternoon?", "evening?"
  const todMatch = stripped.match(/^(?:in\s+the\s+)?(morning|afternoon|evening|night)$/i);
  if (todMatch) {
    const tod = todMatch[1].toLowerCase();
    const window = tod === "morning" ? { startHour: 7, endHour: 12 }
      : tod === "afternoon" ? { startHour: 12, endHour: 17 }
      : { startHour: 17, endHour: 22 }; // evening/night
    return { timeOfDay: tod as "morning" | "afternoon" | "evening", timeWindow: window };
  }

  // Check for "after X" / "past X" / "later than X" / "from X" patterns
  const afterMatch = stripped.match(/^(?:after|past|later\s+than|from|starting\s+(?:at\s+|from\s+)?)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/i);
  if (afterMatch) {
    let h = parseInt(afterMatch[1]);
    const ampm = afterMatch[3]?.replace(/\./g, "").toLowerCase();
    if (ampm === "pm" && h < 12) h += 12;
    else if (ampm === "am" && h === 12) h = 0;
    else if (!ampm && h >= 1 && h <= 6) h += 12; // assume PM for small numbers
    return { timeWindow: { startHour: h, endHour: Math.min(h + 6, 23) } };
  }

  // Check for "before X" patterns
  const beforeMatch = stripped.match(/^(?:before|earlier\s+than|by|until|up\s+to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/i);
  if (beforeMatch) {
    let h = parseInt(beforeMatch[1]);
    const ampm = beforeMatch[3]?.replace(/\./g, "").toLowerCase();
    if (ampm === "pm" && h < 12) h += 12;
    else if (ampm === "am" && h === 12) h = 0;
    else if (!ampm && h >= 1 && h <= 6) h += 12;
    return { timeWindow: { startHour: 7, endHour: h } };
  }

  // Try to parse a time from the stripped text (e.g. "2 pm", "3:30", "noon", "14:00")
  const refDate = getChronoRefDate(now);
  const parsed = chrono.parse(stripped, refDate, { forwardDate: true });

  if (parsed.length > 0) {
    const result = parsed[0];
    const hasTime = result.start.isCertain("hour");
    const hasDate = result.start.isCertain("day") && (
      result.start.isCertain("month") ||
      // chrono sets day-of-week as "certain day" when parsing "friday" etc.
      /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today)\b/i.test(stripped)
    );

    if (hasTime && !hasDate) {
      // Pure time follow-up: "2 pm", "3:30", "noon"
      return {
        time: {
          hour: result.start.get("hour") ?? 0,
          minute: result.start.get("minute") ?? 0,
        },
      };
    }

    if (hasDate) {
      // Date (possibly with time) follow-up: "friday", "next tuesday at 3pm"
      const dt = DateTime.fromObject(
        {
          year: result.start.get("year"),
          month: result.start.get("month"),
          day: result.start.get("day"),
          hour: result.start.get("hour"),
          minute: result.start.get("minute") ?? 0,
        },
        { zone: timezone }
      );
      return {
        dateShift: dt,
        time: hasTime ? { hour: result.start.get("hour") ?? 0, minute: result.start.get("minute") ?? 0 } : undefined,
      };
    }
  }

  // Handle bare numbers that look like hours: "2?", "3?" (1-12 range)
  const bareNum = stripped.match(/^(\d{1,2})$/);
  if (bareNum) {
    let h = parseInt(bareNum[1]);
    if (h >= 1 && h <= 12) {
      // Assume PM for hours 1-6, AM for 7-12 (reasonable meeting time heuristic)
      if (h >= 1 && h <= 6) h += 12;
      return { time: { hour: h, minute: 0 } };
    }
    if (h >= 13 && h <= 23) {
      return { time: { hour: h, minute: 0 } };
    }
  }

  return null;
}

// ── Booking confirmation detection ──────────────────────────────
// Detects "add a contact" / "new contact" / "link a calendar" intent

function isAddContactIntent(query: string): boolean {
  const q = query.trim().toLowerCase().replace(/[.!?,]+$/g, "").trim();
  if (/^(add|create|new|link|connect|set\s*up|register)\s+(a\s+)?(new\s+)?(contact|person|calendar|friend|colleague|coworker)/i.test(q)) return true;
  if (/^(add|link|connect)\s+(a\s+)?calendar/i.test(q)) return true;
  if (/^(i\s+want\s+to\s+)?add\s+(a\s+)?(new\s+)?contact/i.test(q)) return true;
  if (/^(add|invite)\s+someone/i.test(q)) return true;
  return false;
}

// Detects natural-language confirmations like "book it", "sounds good",
// "freeze", "perfect", "let's do that", "done", "lock it in", etc.

function isBookingConfirmation(query: string): boolean {
  const q = query.trim().toLowerCase()
    .replace(/[.!,]+$/g, "")  // strip trailing punctuation
    .replace(/'/g, "'")       // normalize curly quotes
    .trim();

  // Direct booking verbs (with optional "it" / "that" / "this" / "the slot" / "this one")
  if (/^(book|freeze|lock|reserve|schedule|confirm|grab|claim|snag|secure|hold|take|seal)\s*(it|that|this|the\s+slot|this\s+one|that\s+one|this\s+slot|that\s+slot)?$/i.test(q)) return true;

  // Verb phrases: "book it in", "lock it in", "lock that in", "pencil it in", "pencil me in"
  if (/^(book|lock|pencil|put|slot|write|pen)\s*(it|that|this|me)?\s*(in|down)$/i.test(q)) return true;

  // "let's" phrases: "let's do it", "let's go", "let's book", "let's do that", "let's go with that"
  if (/^let'?s\s+(do\s+(it|that|this)|go(\s+with\s+(it|that|this))?|book(\s+it)?|go\s+for\s+it|lock\s+it\s+in|make\s+it\s+happen|roll(\s+with\s+it)?)$/i.test(q)) return true;

  // Affirmative words / phrases
  if (/^(yes|yeah|yep|yup|ya|yea|aye|affirmative|absolutely|definitely|for\s+sure|sure\s+thing|of\s+course|certainly|roger(\s+that)?|10-4|copy\s+that)$/i.test(q)) return true;

  // Enthusiastic confirmations
  if (/^(perfect|great|awesome|amazing|wonderful|excellent|brilliant|fantastic|lovely|sweet|nice|cool|sick|bet|dope|lit|fire|chef'?s?\s*kiss)$/i.test(q)) return true;

  // Satisfaction / agreement phrases
  if (/^(sounds?\s+good|sounds?\s+great|sounds?\s+perfect|sounds?\s+like\s+a\s+plan|that\s+works|works\s+for\s+me|that'?s?\s+perfect|that'?s?\s+great|good\s+for\s+me|fine\s+by\s+me|fine\s+with\s+me|i'?m?\s+(good|down|in)|all\s+good|all\s+set|we'?re?\s+good)$/i.test(q)) return true;

  // Done / finalize phrases
  if (/^(done|do\s+it|go\s+for\s+it|go\s+ahead|make\s+it\s+happen|finalize|finalise|set\s+it|set\s+it\s+up|make\s+it\s+so|proceed|confirmed|sorted|settled|deal|it'?s?\s+a\s+deal|sold|ship\s+it)$/i.test(q)) return true;

  // "go with" / "take" patterns: "go with that", "go with this one", "take that one", "i'll take it"
  if (/^(i'?ll?\s+)?(go\s+with|take)\s+(it|that|this|that\s+one|this\s+one|the\s+slot)$/i.test(q)) return true;

  // "that one" / "this one" / "the first one" / "first" as standalone
  if (/^(that\s+one|this\s+one|the\s+first(\s+one)?|first(\s+one)?)$/i.test(q)) return true;

  // Emoji-only confirmations
  if (/^(👍|✅|🎉|💯|🤝|👌|🙌|✔️|☑️|💪|🔥)+$/u.test(q)) return true;

  // Phrases with "please": "yes please", "book it please", "go ahead please"
  if (/\bplease\b/i.test(q) && /^(yes|book(\s+it)?|go\s+ahead|do\s+it|confirm|schedule(\s+it)?|lock\s+it\s+in|reserve(\s+it)?|sounds?\s+good)\s*,?\s*please$/i.test(q)) return true;

  return false;
}

// ── Helper for parsing time from reply ─────────────────────────

function parseTimeFromReply(reply: string, timezone: string): { hour: number; minute: number } | null {
  const q = reply.toLowerCase().trim();

  // Try chrono first for natural language like "3pm", "at 2:30pm", "noon"
  const now = DateTime.now().setZone(timezone);
  const refDate = getChronoRefDate(now);
  const parsed = chrono.parse(q, refDate, { forwardDate: true });
  if (parsed.length > 0 && parsed[0].start.isCertain("hour")) {
    return {
      hour: parsed[0].start.get("hour") ?? 0,
      minute: parsed[0].start.get("minute") ?? 0,
    };
  }

  return null;
}

// ── Event Created Card ────────────���────────────────────────────

function EventCreatedCard({ event, timezone }: { event: { id: string; title: string; start_at: string; end_at: string; location?: string | null }; timezone: string }) {
  const s = DateTime.fromISO(event.start_at).setZone(timezone);
  const e = DateTime.fromISO(event.end_at).setZone(timezone);
  const durationMins = e.diff(s, "minutes").minutes;

  return (
    <div className="glass rounded-2xl rounded-bl-md overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-3 bg-emerald-500/10">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-500/15">
          <Plus className="w-5 h-5 text-emerald-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-emerald-700">Event Created</p>
          <p className="text-[11px] text-muted-foreground">{event.title}</p>
        </div>
      </div>

      {/* Details */}
      <div className="px-4 py-3 border-t border-border/30 space-y-1.5">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">{s.toFormat("EEEE, MMM d")}</span>
        </div>
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            {s.toFormat("h:mm a")} – {e.toFormat("h:mm a")}
            <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-md bg-background/60 font-medium">{formatDuration(durationMins)}</span>
          </span>
        </div>
        {event.location && (
          <div className="flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground truncate">{event.location}</span>
          </div>
        )}
      </div>

      {/* Timezone footer */}
      <div className="px-4 py-2 border-t border-border/20">
        <p className="text-[10px] text-muted-foreground/60">{timezone}</p>
      </div>
    </div>
  );
}

// ── Group Event Created Card ───────────────────────────────────

function GroupEventCreatedCard({
  event,
  contactNames,
  timezone,
}: {
  event: { id: string; title: string; start_at: string; end_at: string; location?: string | null };
  contactNames: string[];
  timezone: string;
}) {
  const s = DateTime.fromISO(event.start_at).setZone(timezone);
  const e = DateTime.fromISO(event.end_at).setZone(timezone);
  const durationMins = e.diff(s, "minutes").minutes;
  const firstNames = contactNames.map((n) => n.split(" ")[0]);

  return (
    <div className="glass rounded-2xl rounded-bl-md overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-3 bg-violet-500/10">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-violet-500/15">
          <PartyPopper className="w-5 h-5 text-violet-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-violet-700">Group Event Booked!</p>
          <p className="text-[11px] text-muted-foreground truncate">{event.title}</p>
        </div>
      </div>

      {/* Participants */}
      <div className="px-4 py-2.5 border-t border-border/30 flex items-center gap-2">
        <div className="flex items-center -space-x-1.5">
          {contactNames.map((name, i) => (
            <div
              key={name}
              className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white border-2 border-background"
              style={{
                backgroundColor: GROUP_AVATAR_COLORS[name.charCodeAt(0) % GROUP_AVATAR_COLORS.length],
                zIndex: contactNames.length - i,
              }}
              title={name}
            >
              {name[0]}
            </div>
          ))}
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold border-2 border-background bg-primary text-primary-foreground"
            style={{ zIndex: 0 }}
            title="You"
          >
            Y
          </div>
        </div>
        <span className="text-[11px] text-muted-foreground">
          You + {firstNames.join(", ")}
        </span>
      </div>

      {/* Details */}
      <div className="px-4 py-3 border-t border-border/30 space-y-1.5">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">{s.toFormat("EEEE, MMM d")}</span>
        </div>
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            {s.toFormat("h:mm a")} – {e.toFormat("h:mm a")}
            <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-md bg-background/60 font-medium">{formatDuration(durationMins)}</span>
          </span>
        </div>
        {event.location && (
          <div className="flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground truncate">{event.location}</span>
          </div>
        )}
      </div>

      {/* Success footer */}
      <div className="px-4 py-2 border-t border-border/20 flex items-center gap-1.5">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
        <p className="text-[10px] text-emerald-600 font-medium">Added to your calendar</p>
        <span className="ml-auto text-[10px] text-muted-foreground/60">{timezone}</span>
      </div>
    </div>
  );
}

// ── Actionable Suggestion Card ────────────────────────────────

function HighlightedText({ text, triggers }: { text: string; triggers: { word: string; start: number; end: number }[] }) {
  if (triggers.length === 0) return <span>{text}</span>;
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  for (const t of triggers) {
    if (t.start > lastIdx) {
      parts.push(<span key={`t-${lastIdx}`}>{text.slice(lastIdx, t.start)}</span>);
    }
    parts.push(
      <mark
        key={`h-${t.start}`}
        className="bg-amber-200/60 dark:bg-amber-500/25 text-inherit rounded-sm px-0.5 font-semibold"
      >
        {text.slice(t.start, t.end)}
      </mark>
    );
    lastIdx = t.end;
  }
  if (lastIdx < text.length) {
    parts.push(<span key={`t-${lastIdx}`}>{text.slice(lastIdx)}</span>);
  }
  return <>{parts}</>;
}

function ActionableSuggestionCard({
  originalText, subject, triggers,
  suggestTask, suggestReminder, suggestCounter, suggestNote, dateHint,
  onFollowUp,
}: {
  originalText: string;
  subject: string;
  triggers: { word: string; start: number; end: number }[];
  suggestTask: boolean;
  suggestReminder: boolean;
  suggestCounter: boolean;
  suggestNote?: boolean;
  dateHint?: string;
  onFollowUp: (q: string) => void;
}) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [creating, setCreating] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const handleCreateListItem = async () => {
    setCreating("list");
    try {
      await addItemToMyList(subject);
      setDone("list");
    } catch (e) {
      console.error("Failed to add to My Lists:", e);
    } finally {
      setCreating(null);
    }
  };

  const handleCreateReminder = async () => {
    setCreating("reminder");
    try {
      const tz = profile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      // Try to parse a date from the hint or original text
      const refDate = getChronoRefDate(DateTime.now().setZone(tz));
      const parsed = chrono.parseDate(originalText, refDate, { forwardDate: true });
      const dueAt = parsed
        ? chronoDateToLuxon(parsed, tz).toISO()
        : DateTime.now().setZone(tz).plus({ days: 1 }).set({ hour: 9, minute: 0 }).toISO();
      await createReminder({
        title: subject,
        schedule_type: "one_off",
        due_at: dueAt,
        timezone: tz,
      });
      setDone("reminder");
    } catch (e) {
      console.error("Failed to create reminder:", e);
    } finally {
      setCreating(null);
    }
  };

  const handleCreateCounter = async () => {
    setCreating("counter");
    try {
      // Detect whether this is a "since" tracker or a "to" countdown
      const isSinceType = /\b(?:since|last|ago|elapsed|it'?s\s+been|streak)\b/i.test(originalText);
      const tz = profile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      const refDate = getChronoRefDate(DateTime.now().setZone(tz));
      const parsed = chrono.parseDate(originalText, refDate, { forwardDate: true });

      if (isSinceType) {
        // "Days since" → start from today
        await createDaysSince({
          label: subject,
          type: "since",
          last_date: DateTime.now().toISODate(),
        });
      } else {
        // "Countdown to" → use parsed date or default 30 days
        const targetDate = parsed
          ? chronoDateToLuxon(parsed, tz).toISODate()
          : DateTime.now().plus({ days: 30 }).toISODate();
        await createDaysSince({
          label: subject,
          type: "to",
          target_date: targetDate,
          last_date: targetDate,
        });
      }
      setDone("counter");
    } catch (e) {
      console.error("Failed to create counter:", e);
    } finally {
      setCreating(null);
    }
  };

  const handleCreateNote = async () => {
    setCreating("note");
    try {
      const match = originalText.match(/^(?:add|save|note)(?:\s+note)?\s+(.+?)\s+to\s+(?:contact\s+|profile\s+)?(.+?)(?:'s?\s+(?:profile|contact))?$/i);
      if (!match) throw new Error("Could not parse note intent");
      let content = match[1].trim();
      if (content.startsWith('"') && content.endsWith('"')) {
        content = content.slice(1, -1);
      }
      let contactName = match[2].trim().replace(/^my\s+/i, '').replace(/^\//, '');
      const contacts = await getContacts().catch(() => []);
      const matchContact = contacts.find((c: any) => c.name.toLowerCase().includes(contactName.toLowerCase()) || contactName.toLowerCase().includes(c.name.split(" ")[0].toLowerCase()));
      if (!matchContact) {
        throw new Error(`__CONTACT_NOT_FOUND__:${contactName}:${content}`);
      }
      const newNotes = matchContact.notes ? `${matchContact.notes}\n${content}` : content;
      await updateContact(matchContact.id, { notes: newNotes });
      setDone("note");
    } catch (e: any) {
      if (e.message && e.message.startsWith("__CONTACT_NOT_FOUND__:")) {
        const parts = e.message.split(":");
        const contactName = parts[1];
        const initialNote = parts.slice(2).join(":");
        // Bubble this up to parent so it can display the add contact card instead
        throw e;
      } else {
        console.error("Failed to add note:", e);
        toast.error(e.message || String(e));
      }
    } finally {
      setCreating(null);
    }
  };

  const actions = [
    suggestTask && {
      key: "list",
      label: "List Item",
      icon: <ListTodo className="w-3.5 h-3.5" />,
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/20",
      handler: handleCreateListItem,
    },
    suggestReminder && {
      key: "reminder",
      label: "Reminder",
      icon: <Bell className="w-3.5 h-3.5" />,
      color: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/20",
      handler: handleCreateReminder,
    },
    suggestCounter && {
      key: "counter",
      label: "Counter",
      icon: <Hourglass className="w-3.5 h-3.5" />,
      color: "text-violet-600 dark:text-violet-400",
      bg: "bg-violet-500/10 hover:bg-violet-500/20 border-violet-500/20",
      handler: handleCreateCounter,
    },
    suggestNote && {
      key: "note",
      label: "Contact Note",
      icon: <FileText className="w-3.5 h-3.5" />,
      color: "text-orange-600 dark:text-orange-400",
      bg: "bg-orange-500/10 hover:bg-orange-500/20 border-orange-500/20",
      handler: handleCreateNote,
    },
  ].filter(Boolean) as { key: string; label: string; icon: React.ReactNode; color: string; bg: string; handler: () => Promise<void> }[];

  return (
    <div className="glass rounded-2xl rounded-bl-md px-4 py-3 text-sm space-y-3">
      {/* Intro */}
      <p className="text-muted-foreground text-xs">
        I'm not sure what to do with that, but it sounds like something you might want to track!
      </p>

      {/* Highlighted original text */}
      <div className="bg-muted/40 rounded-lg px-3 py-2 text-[13px] leading-relaxed">
        <HighlightedText text={originalText} triggers={triggers} />
      </div>

      {/* Subject preview */}
      <p className="text-xs text-muted-foreground">
        Would you like to add <span className="font-semibold text-foreground">"{subject}"</span> as:
      </p>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => {
          const isDone = done === a.key;
          const isLoading = creating === a.key;
          return (
            <button
              key={a.key}
              disabled={!!creating || !!done}
              onClick={a.handler}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                isDone
                  ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                  : `${a.bg} ${a.color}`
              } ${creating || done ? "opacity-60 cursor-not-allowed" : "cursor-pointer active:scale-95"}`}
            >
              {isLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : isDone ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                a.icon
              )}
              {isDone ? `Added as ${a.label}!` : `Add as ${a.label}`}
            </button>
          );
        })}
      </div>

      {/* Done: link to the section */}
      {done && (
        <p className="text-[11px] text-muted-foreground">
          {done === "list" && (
            <button onClick={() => navigate("/track?tab=tasks")} className="text-primary hover:underline font-medium">View in My Lists →</button>
          )}
          {done === "reminder" && (
            <button onClick={() => navigate("/track?tab=reminders")} className="text-primary hover:underline font-medium">View in Reminders →</button>
          )}
          {done === "counter" && (
            <button onClick={() => navigate("/track?tab=days-since")} className="text-primary hover:underline font-medium">View in Counters →</button>
          )}
        </p>
      )}
    </div>
  );
}

// ── Booking Link Card ──────────────────────────────────────────

function BookingLinkCard({ contactName, contactId }: { contactName: string; contactId?: string }) {
  const [bookingCode, setBookingCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getBookingLinks().then((links: any[]) => {
      if (Array.isArray(links) && links.length > 0) setBookingCode(links[0].code);
      else {
        createBookingLink().then((link: any) => setBookingCode(link.code)).catch(() => {});
      }
    }).catch(() => {});
  }, []);

  const handleCopy = async () => {
    if (!bookingCode) return;
    const url = `${window.location.origin}/book/${bookingCode}?guest=${encodeURIComponent(contactName)}`;
    const ok = await copyToClipboard(url);
    if (ok) {
      setCopied(true);
      toast.success("Booking link copied!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="bg-card/50 backdrop-blur-md border border-white/10 p-4 rounded-2xl shadow-sm my-2">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <Link2 className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h4 className="font-semibold text-sm">Send your Booking Link</h4>
          <p className="text-xs text-muted-foreground">Let {contactName} pick a time that works for them.</p>
        </div>
      </div>
      <button
        onClick={handleCopy}
        disabled={!bookingCode}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium transition hover:bg-primary/90 disabled:opacity-50"
      >
        {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        {copied ? "Copied Link!" : `Copy Link for ${contactName}`}
      </button>
    </div>
  );
}

// ── Add Contact Card ───────────────────���──────────────────────

function AddContactCard({ onFollowUp, initialName = "", initialNote = "" }: { onFollowUp?: (q: string) => void, initialName?: string, initialNote?: string }) {
  const [name, setName] = useState(initialName);
  const [icalUrl, setIcalUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await createContact({ name: name.trim(), ical_url: icalUrl.trim() || undefined, notes: initialNote || "" });
      setSaved(true);
      if (initialNote && onFollowUp) {
        onFollowUp(""); // Optional way to clear input or signal completion. Usually not needed for simple add
      }
    } catch (err: any) {
      setError(err?.message || "Failed to add contact");
    } finally {
      setSaving(false);
    }
  };

  if (saved) {
    return (
      <div className="glass rounded-2xl rounded-bl-md overflow-hidden">
        <div className="px-4 py-3 flex items-center gap-3 bg-emerald-500/10">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-500/15">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-emerald-700">Contact Added!</p>
            <p className="text-[11px] text-muted-foreground">{name} is now saved in My Contacts{initialNote ? " with your note." : " for availability queries."}</p>
          </div>
        </div>
        {!initialNote && onFollowUp && (
          <div className="px-4 py-3 border-t border-border/30">
            <p className="text-xs text-muted-foreground">
              Try: <button onClick={() => onFollowUp(`Am I free to meet ${name.split(" ")[0]} tomorrow?`)} className="text-primary hover:underline font-medium">"Am I free to meet {name.split(" ")[0]} tomorrow?"</button>
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="glass rounded-2xl rounded-bl-md overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-primary/10">
          <UserPlus className="w-4 h-4 text-primary" />
        </div>
        <div>
          <p className="text-sm font-semibold">Add a Contact</p>
          <p className="text-[11px] text-muted-foreground">{initialNote ? "Save this person and your note" : "Link someone's calendar for shared availability"}</p>
        </div>
      </div>

      {/* Form */}
      <div className="px-4 py-3 border-t border-border/30 space-y-3">
        <div>
          <label className="text-[11px] font-medium text-muted-foreground block mb-1">Name</label>
          <input
            value={name}
            onChange={(ev) => setName(ev.target.value)}
            placeholder="e.g. Sarah Chen"
            className="w-full text-xs px-3 py-2 rounded-lg bg-background/80 border border-border/50 focus:outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground/40"
          />
        </div>
        <div>
          <label className="text-[11px] font-medium text-muted-foreground block mb-1">
            <span className="flex items-center gap-1"><Link2 className="w-3 h-3" /> iCal URL (Optional)</span>
          </label>
          <input
            value={icalUrl}
            onChange={(ev) => setIcalUrl(ev.target.value)}
            placeholder="https://calendar.google.com/...basic.ics"
            className="w-full text-xs px-3 py-2 rounded-lg bg-background/80 border border-border/50 focus:outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground/40 font-mono"
          />
          <p className="text-[10px] text-muted-foreground/50 mt-1">Their public or shared iCal calendar link</p>
        </div>

        {initialNote && (
          <div>
            <label className="text-[11px] font-medium text-muted-foreground block mb-1">Note</label>
            <div className="w-full text-xs px-3 py-2 rounded-lg bg-muted/40 border border-border/30 text-muted-foreground italic">
              "{initialNote}"
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-1.5 text-destructive text-[11px]">
            <AlertTriangle className="w-3 h-3" />
            {error}
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-40 transition flex items-center justify-center gap-1.5"
        >
          {saving ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...</>
          ) : (
            <><UserPlus className="w-3.5 h-3.5" /> Save Contact</>
          )}
        </button>
      </div>
    </div>
  );
}

// ── Reminder Created Card ──���───────────────────────────────────

function ReminderCreatedCard({ reminder, timezone }: { reminder: { id: string; title: string; due_at: string }; timezone: string }) {
  const dueDt = DateTime.fromISO(reminder.due_at).setZone(timezone);

  return (
    <div className="glass rounded-2xl rounded-bl-md overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-3 bg-emerald-500/10">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-500/15">
          <Bell className="w-5 h-5 text-emerald-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-emerald-700">Reminder Set</p>
          <p className="text-[11px] text-muted-foreground">{reminder.title}</p>
        </div>
      </div>

      {/* Details */}
      <div className="px-4 py-3 border-t border-border/30 space-y-1.5">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">{dueDt.toFormat("EEEE, MMM d")}</span>
        </div>
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{dueDt.toFormat("h:mm a")}</span>
        </div>
      </div>

      {/* Timezone footer */}
      <div className="px-4 py-2 border-t border-border/20">
        <p className="text-[10px] text-muted-foreground/60">{timezone}</p>
      </div>
    </div>
  );
}

// ── Clarify Card ────────────────────────���──────────────────────

function ClarifyCard({ text, options, onSelect, showCancel = true }: { text: string; options?: { label: string; value: string }[]; onSelect: (q: string) => void; showCancel?: boolean }) {
  return (
    <div className="glass rounded-2xl rounded-bl-md px-4 py-3">
      <div className="text-sm whitespace-pre-wrap">{renderMarkdown(text)}</div>
      {((options && options.length > 0) || showCancel) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {options?.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onSelect(opt.value)}
              className="px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-xs font-medium text-primary hover:bg-primary/20 transition"
            >
              {opt.label}
            </button>
          ))}
          {showCancel && (
            <button
              onClick={() => onSelect("cancel")}
              className="px-3 py-1.5 rounded-full bg-muted/60 border border-border/40 text-xs font-medium text-muted-foreground hover:bg-muted transition"
            >
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// useRotatingPlaceholder and buildPersonalizedPrompts are now in ../lib/rotating-placeholder.ts
export { useRotatingPlaceholder, buildPersonalizedPrompts as buildPersonalizedPrompts, type PersonalizedPrompts } from "../lib/rotating-placeholder";