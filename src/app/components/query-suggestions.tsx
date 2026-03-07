/**
 * query-suggestions.tsx
 * Google Search-like context-aware NLP autocomplete for Chrono assistant.
 * Generates 5–7 smart completions from the FIRST character typed,
 * using regex-based intent mapping with partial-word + single-char support.
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Search,
  Plus,
  ListTodo,
  Bell,
  FileText,
  FolderOpen,
  Timer,
  ArrowUpRight,
  Calendar,
  Clock,
  HelpCircle,
} from "lucide-react";

// ── Types ──

export interface QuerySuggestion {
  id: string;
  text: string;
  label: string;
  kind:
    | "add"
    | "find"
    | "remove"
    | "inside"
    | "note"
    | "reminder"
    | "event"
    | "counter"
    | "generic"
    | "schedule"
    | "question";
  score: number;
}

export interface SuggestionContext {
  lists: { id: string; title: string }[];
  contacts: { id: string; name: string }[];
  reminders: { id: string; title: string }[];
}

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

function firstName(ctx: SuggestionContext): string {
  return ctx.contacts[0]?.name?.split(" ")[0] || "Sarah";
}

function firstList(ctx: SuggestionContext): string {
  return ctx.lists[0]?.title || "Groceries";
}

function secondList(ctx: SuggestionContext): string {
  return ctx.lists[1]?.title || ctx.lists[0]?.title || "Shopping";
}

// ═══════════════════════════════════════════════════════════════════
// NLP Pattern Engine
// ═══════════════════════════════════════════════════════════════════

interface NLPPattern {
  re: RegExp;
  gen: (input: string, ctx: SuggestionContext, match: RegExpMatchArray) => QuerySuggestion[];
}

// ────────────────────────────────────────────────
// SLASH PREFIX PATTERNS (highest priority)
// "/f" → /Find, "/i" → /Inside, "/a" → /Add, etc.
// ────────────────────────────────────────────────

const SLASH_PREFIX_PATTERNS: NLPPattern[] = [
  {
    // "/f", "/fi", "/fin", "/find" → /Find suggestions
    re: /^\/(?:f|fi|fin|find)(?:\s+|$)/i,
    gen: (input, ctx) => {
      const match = input.match(/^\/(?:f|fi|fin|find)(?:\s+(.*))?$/i);
      const afterCmd = match && match[1] ? match[1].trim() : "";
      const s: QuerySuggestion[] = [];
      if (afterCmd) {
        if (afterCmd.toLowerCase().includes(" in ")) {
          s.push({ id: "sf-exact", text: `/Find ${afterCmd}`, label: "Search", kind: "find", score: 96 });
        } else {
          s.push({ id: "sf-all", text: `/Find ${afterCmd}`, label: "Search everywhere", kind: "find", score: 96 });
          s.push({ id: "sf-lists", text: `/Find ${afterCmd} in Lists`, label: "In Lists", kind: "find", score: 93 });
          s.push({ id: "sf-rem", text: `/Find ${afterCmd} in Reminders`, label: "In Reminders", kind: "find", score: 90 });
          s.push({ id: "sf-contacts", text: `/Find ${afterCmd} in Contacts`, label: "In Contacts", kind: "find", score: 87 });
          for (const list of ctx.lists.slice(0, 2)) {
            s.push({ id: `sf-sl-${list.id}`, text: `/Find ${afterCmd} in /${list.title}`, label: `In ${list.title}`, kind: "find", score: 84 - s.length });
          }
        }
      } else {
        s.push({ id: "sf-slot", text: "Find a 1 hour slot this week", label: "Find free time", kind: "schedule", score: 93 });
        for (const list of ctx.lists.slice(0, 3)) {
          s.push({ id: `sf-in-${list.id}`, text: `/Find ... in /${list.title}`, label: `Search ${list.title}`, kind: "find", score: 90 - s.length });
        }
        s.push({ id: "sf-rem", text: `/Find ... in Reminders`, label: "Search Reminders", kind: "find", score: 82 });
        s.push({ id: "sf-contacts", text: `/Find ... in Contacts`, label: "Search Contacts", kind: "find", score: 80 });
      }
      return s;
    },
  },
  {
    // "/i", "/in", "/ins", "/inside" → /Inside suggestions
    re: /^\/(?:i|in|ins|insi|insid|inside)(?:\s+|$)/i,
    gen: (input, ctx) => {
      const match = input.match(/^\/(?:i|in|ins|insi|insid|inside)(?:\s+(.*))?$/i);
      const afterCmd = match && match[1] ? match[1].trim() : "";
      const s: QuerySuggestion[] = [];
      if (afterCmd) {
        // Try matching against lists/contacts
        const lower = afterCmd.toLowerCase().replace(/^\//, "");
        for (const list of ctx.lists) {
          if (list.title.toLowerCase().startsWith(lower) || list.title.toLowerCase().includes(lower)) {
            s.push({ id: `si-l-${list.id}`, text: `/Inside /${list.title}`, label: `View ${list.title}`, kind: "inside", score: 95 - s.length });
          }
        }
        for (const c of ctx.contacts) {
          if (c.name.toLowerCase().startsWith(lower) || c.name.toLowerCase().includes(lower)) {
            s.push({ id: `si-c-${c.id}`, text: `/Inside /${c.name}`, label: `${c.name}'s notes`, kind: "inside", score: 90 - s.length });
          }
        }
        // Fallback: exact text
        if (s.length === 0) {
          s.push({ id: "si-raw", text: `/Inside /${afterCmd.replace(/^\//, "")}`, label: "View contents", kind: "inside", score: 88 });
        }
      } else {
        for (const list of ctx.lists.slice(0, 3)) {
          s.push({ id: `si-l-${list.id}`, text: `/Inside /${list.title}`, label: `View ${list.title}`, kind: "inside", score: 93 - s.length });
        }
        for (const c of ctx.contacts.slice(0, 2)) {
          s.push({ id: `si-c-${c.id}`, text: `/Inside /${c.name}`, label: `${c.name}'s notes`, kind: "inside", score: 87 - s.length });
        }
      }
      return s;
    },
  },
  {
    // "/a", "/ad", "/add" → /Add suggestions
    re: /^\/(?:a|ad|add)(?:\s+|$)/i,
    gen: (input, ctx) => {
      const match = input.match(/^\/(?:a|ad|add)(?:\s+(.*))?$/i);
      const afterCmd = match && match[1] ? match[1].trim() : "";
      const s: QuerySuggestion[] = [];
      if (afterCmd) {
        if (afterCmd.includes("/")) {
          s.push({ id: "sa-exact", text: `/Add ${afterCmd}`, label: "Quick add", kind: "add", score: 95 });
        } else {
          for (const list of ctx.lists.slice(0, 4)) {
            s.push({ id: `sa-${list.id}`, text: `/Add ${afterCmd} /${list.title}`, label: `Add to ${list.title}`, kind: "add", score: 93 - s.length });
          }
          s.push({ id: "sa-bare", text: `/Add ${afterCmd}`, label: "Quick add", kind: "add", score: 82 });
        }
      } else {
        for (const list of ctx.lists.slice(0, 4)) {
          s.push({ id: `sa-to-${list.id}`, text: `/Add ... /${list.title}`, label: `Add to ${list.title}`, kind: "add", score: 92 - s.length });
        }
        s.push({ id: "sa-event", text: "Add event tomorrow at 3pm for 1 hour", label: "Create event", kind: "event", score: 83 });
      }
      return s;
    },
  },
  {
    // "/r", "/re", "/rem", "/remove" → /Remove suggestions
    re: /^\/(?:r|re|rem|remo|remov|remove)(?:\s+|$)/i,
    gen: (input, ctx) => {
      const match = input.match(/^\/(?:r|re|rem|remo|remov|remove)(?:\s+(.*))?$/i);
      const afterCmd = match && match[1] ? match[1].trim() : "";
      const s: QuerySuggestion[] = [];
      if (afterCmd) {
        if (afterCmd.includes("/")) {
          s.push({ id: "sr-exact", text: `/Remove ${afterCmd}`, label: "Quick remove", kind: "remove", score: 95 });
        } else {
          for (const list of ctx.lists.slice(0, 4)) {
            s.push({ id: `sr-${list.id}`, text: `/Remove ${afterCmd} /${list.title}`, label: `From ${list.title}`, kind: "remove", score: 92 - s.length });
          }
          for (const c of ctx.contacts.slice(0, 2)) {
            s.push({ id: `sr-c-${c.id}`, text: `/Remove ${afterCmd} /${c.name}`, label: `From ${c.name}`, kind: "remove", score: 85 - s.length });
          }
        }
      } else {
        for (const list of ctx.lists.slice(0, 4)) {
          s.push({ id: `sr-from-${list.id}`, text: `/Remove ... /${list.title}`, label: `From ${list.title}`, kind: "remove", score: 90 - s.length });
        }
      }
      return s;
    },
  },
  {
    // "/co", "/con", "/contact" → /Contact suggestions
    re: /^\/(?:co|con|cont|conta|contac|contact)(?:\s+|$)/i,
    gen: (input, ctx) => {
      const match = input.match(/^\/(?:co|con|cont|conta|contac|contact)(?:\s+(.*))?$/i);
      const afterCmd = match && match[1] ? match[1].trim() : "";
      const s: QuerySuggestion[] = [];
      if (afterCmd) {
        const lower = afterCmd.toLowerCase();
        for (const c of ctx.contacts) {
          if (c.name.toLowerCase().includes(lower)) {
            s.push({ id: `sc-${c.id}`, text: `/Inside /${c.name}`, label: `View ${c.name}`, kind: "inside", score: 95 - s.length });
          }
        }
        s.push({ id: "sc-new", text: `Add contact: ${afterCmd}`, label: "New contact", kind: "add", score: 85 });
      } else {
        for (const c of ctx.contacts.slice(0, 3)) {
          s.push({ id: `sc-view-${c.id}`, text: `/Inside /${c.name}`, label: `View ${c.name}`, kind: "inside", score: 90 - s.length });
        }
        s.push({ id: "sc-add", text: "Add a new contact", label: "New contact", kind: "add", score: 80 });
      }
      return s;
    },
  },
  {
    // "/c", "/ca", "/cap" → /Capabilities
    re: /^\/ca/i,
    gen: () => [
      { id: "sc-cap", text: "/Capabilities", label: "Show what I can do", kind: "question", score: 95 },
    ],
  },
  {
    // Catch-all for just "/c"
    re: /^\/c$/i,
    gen: (input, ctx) => [
      { id: "sc-cap-short", text: "/Capabilities", label: "Show what I can do", kind: "question", score: 95 },
      { id: "sc-con-short", text: "/Contact ", label: "Manage contacts", kind: "inside", score: 90 },
    ],
  },
];

// ────────────────────────────────────────────────
// SINGLE CHARACTER / PARTIAL WORD PREFIX MAP
// Maps the first 1-3 chars to likely intent categories
// ────────────────────────────────────────────────

interface PrefixSuggestionGen {
  /** Regex matching the partial input (no word boundary needed since we test from start) */
  re: RegExp;
  gen: (input: string, ctx: SuggestionContext) => QuerySuggestion[];
}

const PREFIX_PATTERNS: PrefixSuggestionGen[] = [
  // ── W → what / when / where ──
  {
    re: /^w(?:h|ha|hat)?$/i,
    gen: (_i, ctx) => [
      { id: "px-what-today", text: "What am I doing today?", label: "Today's schedule", kind: "question", score: 96 },
      { id: "px-what-next-wk", text: "What am I doing next week?", label: "Next week", kind: "question", score: 94 },
      ...(ctx.lists.length > 0 ? [{ id: `px-what-inside-l-${ctx.lists[0].id}`, text: `What is /Inside /${ctx.lists[0].title}`, label: `View ${ctx.lists[0].title}`, kind: "inside" as const, score: 92 }] : []),
      ...(ctx.contacts.length > 0 ? [{ id: `px-what-inside-c-${ctx.contacts[0].id}`, text: `What is /Inside /${ctx.contacts[0].name}`, label: `View ${ctx.contacts[0].name}`, kind: "inside" as const, score: 90 }] : []),
      { id: "px-what-week", text: "What am I doing this week?", label: "This week", kind: "question", score: 88 },
      { id: "px-when-free", text: "When am I free today?", label: "Free time today", kind: "schedule", score: 86 },
    ],
  },
  {
    re: /^whe(?:n)?$/i,
    gen: (_i, ctx) => [
      { id: "px-when-free-t", text: "When am I free today?", label: "Free today", kind: "schedule", score: 96 },
      { id: "px-when-free-tmr", text: "When am I free tomorrow?", label: "Free tomorrow", kind: "schedule", score: 94 },
      { id: "px-when-free-wk", text: "When am I free this week?", label: "Free this week", kind: "schedule", score: 92 },
      ...(ctx.contacts.slice(0, 2).map((c, i) => ({ id: `px-when-meet-${c.id}`, text: `When can I meet with ${c.name} this week?`, label: `Meet ${c.name}`, kind: "schedule" as const, score: 89 - i }))),
      { id: "px-when-next", text: "When is my next event?", label: "Next event", kind: "question", score: 85 },
    ],
  },
  {
    re: /^wher/i,
    gen: (_i, ctx) => [
      { id: "px-where-find", text: `/Find `, label: "Search for something", kind: "find", score: 92 },
      ...(ctx.lists.slice(0, 3).map((l, i) => ({ id: `px-where-l-${l.id}`, text: `/Inside /${l.title}`, label: `View ${l.title}`, kind: "inside" as const, score: 89 - i }))),
    ],
  },
  // ── H → how / help ──
  {
    re: /^h(?:o|ow?|el|elp?)?$/i,
    gen: (_i, ctx) => [
      { id: "px-how-day", text: "How does my day look?", label: "Day overview", kind: "question", score: 95 },
      { id: "px-how-busy", text: "How busy am I today?", label: "Today's load", kind: "question", score: 93 },
      { id: "px-how-tmr", text: "How does tomorrow look?", label: "Tomorrow overview", kind: "question", score: 91 },
      { id: "px-how-long", text: "How long until my next event?", label: "Next event", kind: "question", score: 89 },
      { id: "px-help", text: "/Capabilities", label: "Show what I can do", kind: "question", score: 86 },
    ],
  },
  // ── S → show / schedule / search ──
  {
    re: /^s(?:h|ho|how|ch|che|ear|earc)?$/i,
    gen: (_i, ctx) => [
      { id: "px-show-today", text: "What am I doing today?", label: "Today's schedule", kind: "question", score: 95 },
      ...(ctx.lists.slice(0, 2).map((l, i) => ({ id: `px-show-l-${l.id}`, text: `/Inside /${l.title}`, label: `View ${l.title}`, kind: "inside" as const, score: 92 - i }))),
      { id: "px-schedule", text: `Schedule a call tomorrow at 10am for 30 mins`, label: "Schedule call", kind: "event", score: 88 },
      { id: "px-search", text: `/Find `, label: "Search for something", kind: "find", score: 86 },
      ...(ctx.contacts.length > 0 ? [{ id: "px-sched-meet", text: `Meet ${firstName(ctx)} at 3pm tomorrow for 1 hour`, label: `Meet ${firstName(ctx)}`, kind: "event" as const, score: 84 }] : []),
    ],
  },
  // ── F → find / free ──
  {
    re: /^f(?:i|in|ind|re|ree)?$/i,
    gen: (_i, ctx) => [
      { id: "px-find-slot", text: "Find a 1 hour slot this week", label: "Find free time", kind: "schedule", score: 95 },
      { id: "px-free-today", text: "When am I free today?", label: "Free today", kind: "schedule", score: 93 },
      { id: "px-free-tmr", text: "When am I free tomorrow?", label: "Free tomorrow", kind: "schedule", score: 91 },
      ...(ctx.lists.slice(0, 2).map((l, i) => ({ id: `px-find-in-${l.id}`, text: `/Find ... in /${l.title}`, label: `Search ${l.title}`, kind: "find" as const, score: 88 - i }))),
      { id: "px-find-all", text: `/Find `, label: "Search everything", kind: "find", score: 84 },
    ],
  },
  // ── A → add ──
  {
    re: /^a(?:d|dd)?$/i,
    gen: (_i, ctx) => [
      ...(ctx.lists.slice(0, 4).map((l, i) => ({ id: `px-add-${l.id}`, text: `/Add ... /${l.title}`, label: `Add to ${l.title}`, kind: "add" as const, score: 94 - i }))),
      { id: "px-add-event", text: "Add event tomorrow at 3pm for 1 hour", label: "Create event", kind: "event", score: 86 },
      { id: "px-am-free", text: "Am I free tomorrow?", label: "Check availability", kind: "schedule", score: 83 },
    ],
  },
  // ── R → remove / remind ──
  {
    re: /^r(?:e|em|emo|emov|emove|em|emin|emind)?$/i,
    gen: (_i, ctx) => [
      ...(ctx.lists.slice(0, 3).map((l, i) => ({ id: `px-rm-${l.id}`, text: `/Remove ... /${l.title}`, label: `Remove from ${l.title}`, kind: "remove" as const, score: 94 - i }))),
      { id: "px-remind-1", text: "Remind me to submit report on Friday", label: "Set reminder", kind: "reminder", score: 89 },
      { id: "px-remind-2", text: "Remind me to call the dentist tomorrow", label: "Call reminder", kind: "reminder", score: 86 },
    ],
  },
  // ── T → today / tomorrow / track / tell ──
  {
    re: /^t(?:o|od|oda|oday|om|omo|omor|omorr|omorow|omorrow|r|ra|rac|rack|el|ell)?$/i,
    gen: (_i, ctx) => [
      { id: "px-today", text: "What am I doing today?", label: "Today's schedule", kind: "question", score: 96 },
      { id: "px-tmr", text: "What am I doing tomorrow?", label: "Tomorrow's plan", kind: "question", score: 94 },
      { id: "px-track", text: "Start a counter for days since I last exercised", label: "Start counter", kind: "counter", score: 90 },
      { id: "px-free-today2", text: "When am I free today?", label: "Free time", kind: "schedule", score: 87 },
    ],
  },
  // ── M → meet / my / morning ──
  {
    re: /^m(?:e|ee|eet|y|or|orn)?$/i,
    gen: (_i, ctx) => [
      ...(ctx.contacts.slice(0, 2).map((c, i) => ({ id: `px-meet-${c.id}`, text: `Meet ${c.name} at 3pm tomorrow for 1 hour`, label: `Meet ${c.name}`, kind: "event" as const, score: 95 - i }))),
      { id: "px-my-day", text: "What am I doing today?", label: "My day", kind: "question", score: 91 },
      { id: "px-my-week", text: "What am I doing this week?", label: "My week", kind: "question", score: 88 },
      ...(ctx.lists.slice(0, 2).map((l, i) => ({ id: `px-my-list-${l.id}`, text: `/Inside /${l.title}`, label: `View ${l.title}`, kind: "inside" as const, score: 85 - i }))),
    ],
  },
  // ── B → buy / book / busy ──
  {
    re: /^b(?:u|uy|oo|ook|us|usy)?$/i,
    gen: (_i, ctx) => [
      ...(ctx.lists.slice(0, 3).map((l, i) => ({ id: `px-buy-${l.id}`, text: `/Add ... /${l.title}`, label: `Add to ${l.title}`, kind: "add" as const, score: 94 - i }))),
      { id: "px-busy", text: "How busy am I today?", label: "Today's load", kind: "question", score: 90 },
      { id: "px-book", text: `Schedule a meeting tomorrow at 10am for 1 hour`, label: "Book meeting", kind: "event", score: 87 },
    ],
  },
  // ── C → check / call / create / cancel ──
  {
    re: /^c(?:h|he|hec|heck|a|al|all|re|rea|reat|reate|an|anc|ance)?$/i,
    gen: (_i, ctx) => [
      { id: "px-check", text: "What am I doing today?", label: "Check schedule", kind: "question", score: 95 },
      { id: "px-call", text: `Schedule a call tomorrow at 10am for 30 mins`, label: "Schedule call", kind: "event", score: 92 },
      ...(ctx.lists.slice(0, 2).map((l, i) => ({ id: `px-create-${l.id}`, text: `/Add ... /${l.title}`, label: `Add to ${l.title}`, kind: "add" as const, score: 89 - i }))),
      { id: "px-cap", text: "/Capabilities", label: "What can you do?", kind: "question", score: 84 },
    ],
  },
  // ── D → do / don't forget / delete ──
  {
    re: /^d(?:o|on|el|ele|elet|elete)?$/i,
    gen: (_i, ctx) => [
      { id: "px-do-today", text: "What am I doing today?", label: "Today's tasks", kind: "question", score: 95 },
      { id: "px-do-tmr", text: "What am I doing tomorrow?", label: "Tomorrow's tasks", kind: "question", score: 92 },
      { id: "px-dont-forget", text: "Remind me to submit report on Friday", label: "Don't forget", kind: "reminder", score: 89 },
      ...(ctx.lists.slice(0, 2).map((l, i) => ({ id: `px-del-${l.id}`, text: `/Remove ... /${l.title}`, label: `Remove from ${l.title}`, kind: "remove" as const, score: 86 - i }))),
    ],
  },
  // ── N → note / new / next ──
  {
    re: /^n(?:o|ot|ote|e|ew|ex|ext)?$/i,
    gen: (_i, ctx) => [
      ...(ctx.contacts.slice(0, 2).map((c, i) => ({ id: `px-note-${c.id}`, text: `Add note ... /${c.name}`, label: `Note for ${c.name}`, kind: "note" as const, score: 94 - i }))),
      { id: "px-next-event", text: "When is my next event?", label: "Next event", kind: "question", score: 90 },
      { id: "px-next-week", text: "What am I doing next week?", label: "Next week", kind: "question", score: 87 },
      ...(ctx.lists.slice(0, 2).map((l, i) => ({ id: `px-new-${l.id}`, text: `/Add ... /${l.title}`, label: `New item in ${l.title}`, kind: "add" as const, score: 84 - i }))),
    ],
  },
  // ── L → list / lunch / look ──
  {
    re: /^l(?:i|is|ist|u|un|unc|unch|oo|ook)?$/i,
    gen: (_i, ctx) => [
      ...(ctx.lists.slice(0, 3).map((l, i) => ({ id: `px-list-${l.id}`, text: `/Inside /${l.title}`, label: `View ${l.title}`, kind: "inside" as const, score: 95 - i }))),
      { id: "px-lunch", text: `Lunch with ${firstName(ctx)} this Friday at noon for 1 hour`, label: "Plan lunch", kind: "event", score: 88 },
      { id: "px-look-find", text: `/Find `, label: "Look for something", kind: "find", score: 85 },
    ],
  },
  // ── P → plan / pick up ──
  {
    re: /^p(?:l|la|lan|ic|ick)?$/i,
    gen: (_i, ctx) => [
      { id: "px-plan-today", text: "What am I doing today?", label: "Today's plan", kind: "question", score: 95 },
      { id: "px-plan-week", text: "What am I doing this week?", label: "Week plan", kind: "question", score: 92 },
      ...(ctx.lists.slice(0, 2).map((l, i) => ({ id: `px-pick-${l.id}`, text: `/Add ... /${l.title}`, label: `Add to ${l.title}`, kind: "add" as const, score: 89 - i }))),
      ...(ctx.contacts.length > 0 ? [{ id: "px-plan-meet", text: `Meet ${firstName(ctx)} at 3pm tomorrow for 1 hour`, label: `Plan meeting`, kind: "event" as const, score: 86 }] : []),
    ],
  },
  // ── G → get / grab ──
  {
    re: /^g(?:e|et|ra|rab)?$/i,
    gen: (_i, ctx) => [
      ...(ctx.lists.slice(0, 3).map((l, i) => ({ id: `px-get-${l.id}`, text: `/Add ... /${l.title}`, label: `Add to ${l.title}`, kind: "add" as const, score: 94 - i }))),
      { id: "px-get-busy", text: "How busy am I today?", label: "Check load", kind: "question", score: 88 },
    ],
  },
  // ── I → inside ──
  {
    re: /^i(?:n|ns|nsi|nsid|nside)?$/i,
    gen: (_i, ctx) => [
      ...(ctx.lists.slice(0, 3).map((l, i) => ({ id: `px-inside-${l.id}`, text: `/Inside /${l.title}`, label: `View ${l.title}`, kind: "inside" as const, score: 95 - i }))),
      ...(ctx.contacts.slice(0, 2).map((c, i) => ({ id: `px-inside-c-${c.id}`, text: `/Inside /${c.name}`, label: `${c.name}'s notes`, kind: "inside" as const, score: 89 - i }))),
    ],
  },
];

// ────────────────────────────────────────────────
// FULL WORD / PHRASE PATTERNS (multi-word input)
// ────────────────────────────────────────────────

const FULL_PATTERNS: NLPPattern[] = [
  // ── "What" ──
  {
    re: /^what/i,
    gen: (_i, ctx) => [
      { id: "what-today", text: "What am I doing today?", label: "Today", kind: "question", score: 96 },
      { id: "what-tmr", text: "What am I doing tomorrow?", label: "Tomorrow", kind: "question", score: 94 },
      { id: "what-week", text: "What am I doing this week?", label: "This week", kind: "question", score: 92 },
      { id: "what-next-wk", text: "What am I doing next week?", label: "Next week", kind: "question", score: 89 },
      ...(ctx.lists.slice(0, 2).map((l, i) => ({ id: `what-inside-${l.id}`, text: `What is /Inside /${l.title}`, label: `View ${l.title}`, kind: "inside" as const, score: 87 - i }))),
      ...(ctx.contacts.slice(0, 1).map((c) => ({ id: `what-inside-c-${c.id}`, text: `What is /Inside /${c.name}`, label: `${c.name}'s notes`, kind: "inside" as const, score: 83 }))),
    ],
  },
  // ── "When" ──
  {
    re: /^when/i,
    gen: (_i, ctx) => {
      const s: QuerySuggestion[] = [
        { id: "when-free-today", text: "When am I free today?", label: "Free today", kind: "schedule", score: 96 },
        { id: "when-free-tmr", text: "When am I free tomorrow?", label: "Free tomorrow", kind: "schedule", score: 94 },
        { id: "when-free-week", text: "When am I free this week?", label: "Free this week", kind: "schedule", score: 92 },
      ];
      for (const c of ctx.contacts.slice(0, 2)) {
        s.push({ id: `when-meet-${c.id}`, text: `When can I meet with ${c.name} this week?`, label: `Meet ${c.name}`, kind: "schedule", score: 89 - s.length });
      }
      s.push({ id: "when-next", text: "When is my next event?", label: "Next event", kind: "question", score: 85 });
      return s;
    },
  },
  // ── "How" ──
  {
    re: /^how/i,
    gen: (input) => {
      const rest = input.replace(/^how\s*/i, "").trim();
      const s: QuerySuggestion[] = [];
      if (/^long/i.test(rest)) {
        s.push({ id: "how-long", text: "How long until my next event?", label: "Next event", kind: "question", score: 95 });
      }
      if (/^busy/i.test(rest)) {
        s.push(
          { id: "how-busy-t", text: "How busy am I today?", label: "Today", kind: "question", score: 96 },
          { id: "how-busy-wk", text: "How busy am I this week?", label: "This week", kind: "question", score: 93 },
        );
      }
      if (/^many/i.test(rest)) {
        s.push(
          { id: "how-many-ev", text: "How many events do I have today?", label: "Events count", kind: "question", score: 95 },
          { id: "how-many-rem", text: "How many reminders are due?", label: "Reminders due", kind: "question", score: 92 },
        );
      }
      if (/^(?:does|is|'s)/i.test(rest)) {
        s.push(
          { id: "how-day-look", text: "How does my day look?", label: "Day overview", kind: "question", score: 95 },
          { id: "how-tmr-look", text: "How does tomorrow look?", label: "Tomorrow", kind: "question", score: 92 },
        );
      }
      
      if (s.length === 0) {
        s.push(
          { id: "how-day", text: "How does my day look?", label: "Day overview", kind: "question", score: 95 },
          { id: "how-busy", text: "How busy am I today?", label: "Today's load", kind: "question", score: 93 },
          { id: "how-long", text: "How long until my next event?", label: "Countdown", kind: "question", score: 91 },
          { id: "how-many", text: "How many events do I have today?", label: "Event count", kind: "question", score: 89 },
          { id: "how-tmr", text: "How does tomorrow look?", label: "Tomorrow", kind: "question", score: 87 },
        );
      }
      return s;
    },
  },
  // ── "Show" / "View" / "Open" / "Check" / "See" ──
  {
    re: /^(?:show|view|open|check|see)/i,
    gen: (input, ctx) => {
      const rest = input.replace(/^(?:show|view|open|check|see)\s+(?:me\s+)?/i, "").trim().toLowerCase();
      const s: QuerySuggestion[] = [];
      if (rest) {
        // Try matching rest against list/contact names
        for (const l of ctx.lists) {
          if (l.title.toLowerCase().startsWith(rest) || l.title.toLowerCase().includes(rest)) {
            s.push({ id: `show-m-${l.id}`, text: `/Inside /${l.title}`, label: `View ${l.title}`, kind: "inside", score: 95 - s.length });
          }
        }
        for (const c of ctx.contacts) {
          if (c.name.toLowerCase().startsWith(rest) || c.name.toLowerCase().includes(rest)) {
            s.push({ id: `show-m-c-${c.id}`, text: `/Inside /${c.name}`, label: `${c.name}'s notes`, kind: "inside", score: 90 - s.length });
          }
        }
      }
      
      if (s.length === 0) {
        for (const l of ctx.lists.slice(0, 3)) {
          s.push({ id: `show-l-${l.id}`, text: `/Inside /${l.title}`, label: `View ${l.title}`, kind: "inside", score: 92 - s.length });
        }
        for (const c of ctx.contacts.slice(0, 2)) {
          s.push({ id: `show-c-${c.id}`, text: `/Inside /${c.name}`, label: `${c.name}'s notes`, kind: "inside", score: 88 - s.length });
        }
        s.push({ id: "show-today", text: "What am I doing today?", label: "Today's schedule", kind: "question", score: 85 });
      }
      return s;
    },
  },
  // ── "Find" / "Search" / "Where" / "Look for" ──
  {
    re: /^(?:find|search\s+for|search|where(?:\s+is)?|look\s+for)/i,
    gen: (input, ctx) => {
      const rest = input.replace(/^(?:find|search\s+for|search|where(?:\s+is)?|look\s+for)\s*/i, "").trim();
      const s: QuerySuggestion[] = [];
      if (rest) {
        if (rest.toLowerCase().includes(" in ")) {
           s.push({ id: "find-exact", text: `/Find ${rest}`, label: "Search", kind: "find", score: 96 });
        } else {
          s.push(
            { id: "find-all", text: `/Find ${rest}`, label: "Search everywhere", kind: "find", score: 96 },
            { id: "find-lists", text: `/Find ${rest} in Lists`, label: "In Lists", kind: "find", score: 93 },
            { id: "find-rem", text: `/Find ${rest} in Reminders`, label: "In Reminders", kind: "find", score: 90 },
            { id: "find-contacts", text: `/Find ${rest} in Contacts`, label: "In Contacts", kind: "find", score: 87 }
          );
          for (const l of ctx.lists.slice(0, 2)) {
            s.push({ id: `find-in-${l.id}`, text: `/Find ${rest} in /${l.title}`, label: `In ${l.title}`, kind: "find", score: 84 - s.length });
          }
        }
      } else {
        s.push({ id: "find-slot", text: "Find a 1 hour slot this week", label: "Find free time", kind: "schedule", score: 93 });
        for (const l of ctx.lists.slice(0, 2)) {
          s.push({ id: `find-in-${l.id}`, text: `/Find ... in /${l.title}`, label: `Search ${l.title}`, kind: "find", score: 90 - s.length });
        }
        s.push({ id: "find-any", text: `/Find `, label: "Search everything", kind: "find", score: 84 });
      }
      return s;
    },
  },
  // ── "Add" / "Create" / "New" / "Make" / "Buy" / "Get" / "Grab" / "Pick up" ──
  {
    re: /^(?:add|create|new|make|buy|get|grab|pick\s+up)/i,
    gen: (input, ctx) => {
      const rest = input.replace(/^(?:add|create|new|make|buy|get|grab|pick\s+up)\s*/i, "").trim();
      const s: QuerySuggestion[] = [];
      if (rest) {
        if (rest.includes("/")) {
          s.push({ id: "add-exact", text: `/Add ${rest}`, label: "Quick add", kind: "add", score: 95 });
        } else {
          for (const l of ctx.lists.slice(0, 4)) {
            s.push({ id: `add-to-${l.id}`, text: `/Add ${rest} /${l.title}`, label: `Add to ${l.title}`, kind: "add", score: 94 - s.length });
          }
          s.push({ id: "add-bare", text: `/Add ${rest}`, label: "Quick add", kind: "add", score: 85 });
        }
      } else {
        for (const l of ctx.lists.slice(0, 4)) {
          s.push({ id: `add-to-${l.id}`, text: `/Add ... /${l.title}`, label: `Add to ${l.title}`, kind: "add", score: 94 - s.length });
        }
      }
      return s;
    },
  },
  // ── "Remove" / "Delete" / "Clear" / "Drop" ──
  {
    re: /^(?:remove|delete|clear|drop)/i,
    gen: (input, ctx) => {
      const rest = input.replace(/^(?:remove|delete|clear|drop)\s*/i, "").trim();
      const s: QuerySuggestion[] = [];
      if (rest) {
        if (rest.includes("/")) {
          s.push({ id: "rm-exact", text: `/Remove ${rest}`, label: "Quick remove", kind: "remove", score: 95 });
        } else {
          for (const l of ctx.lists.slice(0, 4)) {
            s.push({ id: `rm-${l.id}`, text: `/Remove ${rest} /${l.title}`, label: `From ${l.title}`, kind: "remove", score: 93 - s.length });
          }
          for (const c of ctx.contacts.slice(0, 2)) {
            s.push({ id: `rm-c-${c.id}`, text: `/Remove ${rest} /${c.name}`, label: `From ${c.name}`, kind: "remove", score: 86 - s.length });
          }
        }
      } else {
        for (const l of ctx.lists.slice(0, 4)) {
          s.push({ id: `rmfrom-${l.id}`, text: `/Remove ... /${l.title}`, label: `From ${l.title}`, kind: "remove", score: 91 - s.length });
        }
      }
      return s;
    },
  },
  // ── "Remind" / "Don't forget" ──
  {
    re: /^(?:remind|don'?t\s+forget|alert)/i,
    gen: (input) => {
      const rest = input.replace(/^(?:remind(?:\s+me)?(?:\s+to)?|don'?t\s+forget|alert\s+me)\s*/i, "").trim();
      if (!rest) {
        return [
          { id: "rem-ex1", text: "Remind me to submit report on Friday", label: "Example", kind: "reminder", score: 92 },
          { id: "rem-ex2", text: "Remind me to call the dentist tomorrow", label: "Call", kind: "reminder", score: 89 },
          { id: "rem-ex3", text: "Remind me to buy groceries", label: "Buy", kind: "reminder", score: 86 },
        ];
      }
      return [
        { id: "rem-it", text: `Remind me to ${rest}`, label: "Set reminder", kind: "reminder", score: 96 },
        { id: "rem-tmr", text: `Remind me to ${rest} tomorrow`, label: "Tomorrow", kind: "reminder", score: 93 },
        { id: "rem-fri", text: `Remind me to ${rest} on Friday`, label: "Friday", kind: "reminder", score: 90 },
        { id: "rem-next-wk", text: `Remind me to ${rest} next week`, label: "Next week", kind: "reminder", score: 87 },
      ];
    },
  },
  // ── "Schedule" / "Meet" / "Book" / "Plan" / "Meeting" / "Call" / "Lunch" / "Dinner" / "Coffee" ──
  {
    re: /^(?:schedule|meet|book|plan|meeting|call|lunch|dinner|coffee)\s+(.+)/i,
    gen: (input, ctx, match) => {
      const name = firstName(ctx);
      return [
        { id: "sched-tmr", text: `${input.trim()} tomorrow at 3pm for 1 hour`, label: "Tomorrow 3pm", kind: "event", score: 93 },
        { id: "sched-nxt", text: `${input.trim()} next week`, label: "Next week", kind: "event", score: 89 },
      ];
    },
  },
  {
    re: /^(?:schedule|meet|book|plan|meeting|call|lunch|dinner|coffee)\s*$/i,
    gen: (_i, ctx) => {
      const name = firstName(ctx);
      return [
        { id: "meet-it", text: `Meet ${name} at 3pm tomorrow for 1 hour`, label: `Meet ${name}`, kind: "event", score: 93 },
        { id: "sched-call", text: "Schedule a call tomorrow at 10am for 30 mins", label: "Phone call", kind: "event", score: 89 },
        { id: "sched-lunch", text: `Lunch with ${name} this Friday at noon for 1 hour`, label: "Lunch date", kind: "event", score: 85 },
      ];
    },
  },
  // ── "Track" / "Count" / "Start" / "Days since" ──
  {
    re: /^(?:track|count|tally|start\s+(?:a\s+)?counter|start\s+tracking|days\s+since)\s*/i,
    gen: (input) => {
      const rest = input.replace(/^(?:track|count|tally|start\s+(?:a\s+)?counter\s*(?:for)?|start\s+tracking|days\s+since)\s*/i, "").trim();
      if (rest) {
        return [{ id: "track-it", text: `Start a counter for days since ${rest}`, label: "Start counter", kind: "counter", score: 93 }];
      }
      return [
        { id: "track-ex", text: "Start a counter for days since I last exercised", label: "Exercise tracker", kind: "counter", score: 91 },
        { id: "track-cl", text: "Start a counter for days since I cleaned", label: "Cleaning tracker", kind: "counter", score: 87 },
      ];
    },
  },
  // ── "Note" / "Jot" / "Log" / "Remember" ──
  {
    re: /^(?:note|jot|log|remember)/i,
    gen: (input, ctx) => {
      const rest = input.replace(/^(?:note|jot|log|remember)\s*/i, "").trim();
      const s: QuerySuggestion[] = [];
      if (rest) {
        for (const c of ctx.contacts.slice(0, 3)) {
          s.push({ id: `note-${c.id}`, text: `${rest} /${c.name}`, label: `Note for ${c.name}`, kind: "note", score: 93 - s.length });
        }
      } else {
        for (const c of ctx.contacts.slice(0, 3)) {
          s.push({ id: `note-to-${c.id}`, text: `Add note ... /${c.name}`, label: `Note for ${c.name}`, kind: "note", score: 91 - s.length });
        }
      }
      return s;
    },
  },
  // ── "Free" / "Availability" / "Available" / "Am I free" ──
  {
    re: /^(?:free|am\s+i\s+free|availab(?:le|ility))\s*/i,
    gen: () => [
      { id: "free-today", text: "When am I free today?", label: "Free today", kind: "schedule", score: 96 },
      { id: "free-tmr", text: "When am I free tomorrow?", label: "Free tomorrow", kind: "schedule", score: 94 },
      { id: "free-week", text: "When am I free this week?", label: "Free this week", kind: "schedule", score: 92 },
      { id: "free-weekend", text: "Am I free this weekend?", label: "Weekend", kind: "schedule", score: 89 },
    ],
  },
  // ── "Do I" / "Can I" / "Should I" / "Is there" / "Am I" question patterns ──
  {
    re: /^(?:do\s+i|can\s+i|should\s+i|am\s+i|is\s+there|are\s+there|will\s+i|have\s+i)\s*/i,
    gen: (_i, ctx) => {
      const s: QuerySuggestion[] = [
        { id: "q-free", text: "Am I free tomorrow?", label: "Check availability", kind: "schedule", score: 93 },
        { id: "q-events", text: "Do I have any events today?", label: "Today's events", kind: "question", score: 91 },
        { id: "q-reminders", text: "Do I have any reminders due?", label: "Due reminders", kind: "question", score: 88 },
      ];
      if (ctx.contacts.length > 0) {
        s.push({ id: "q-meet", text: `Can I meet with ${firstName(ctx)} this week?`, label: `Meet ${firstName(ctx)}`, kind: "schedule", score: 85 });
      }
      return s;
    },
  },
  // ── "My" / "Today" / "Tomorrow" / "Next" / "This" ──
  {
    re: /^my\s*/i,
    gen: (_i, ctx) => [
      { id: "my-day", text: "What am I doing today?", label: "My day", kind: "question", score: 96 },
      { id: "my-week", text: "What am I doing this week?", label: "My week", kind: "question", score: 93 },
      ...(ctx.lists.slice(0, 2).map((l, i) => ({ id: `my-l-${l.id}`, text: `/Inside /${l.title}`, label: `My ${l.title}`, kind: "inside" as const, score: 90 - i }))),
      { id: "my-free", text: "When am I free today?", label: "My free time", kind: "schedule", score: 85 },
    ],
  },
  {
    re: /^today/i,
    gen: () => [
      { id: "today-sched", text: "What am I doing today?", label: "Today's schedule", kind: "question", score: 96 },
      { id: "today-free", text: "When am I free today?", label: "Free today", kind: "schedule", score: 93 },
      { id: "today-busy", text: "How busy am I today?", label: "Today's load", kind: "question", score: 90 },
      { id: "today-events", text: "Do I have any events today?", label: "Events count", kind: "question", score: 87 },
    ],
  },
  {
    re: /^tomorrow/i,
    gen: () => [
      { id: "tmr-sched", text: "What am I doing tomorrow?", label: "Tomorrow's plan", kind: "question", score: 96 },
      { id: "tmr-free", text: "When am I free tomorrow?", label: "Free tomorrow", kind: "schedule", score: 93 },
      { id: "tmr-busy", text: "How busy am I tomorrow?", label: "Tomorrow's load", kind: "question", score: 90 },
    ],
  },
  {
    re: /^this\s*/i,
    gen: () => [
      { id: "this-week", text: "What am I doing this week?", label: "This week", kind: "question", score: 96 },
      { id: "this-weekend", text: "What am I doing this weekend?", label: "This weekend", kind: "question", score: 93 },
      { id: "this-free-wk", text: "When am I free this week?", label: "Free this week", kind: "schedule", score: 90 },
    ],
  },
  {
    re: /^next\s*/i,
    gen: () => [
      { id: "next-week", text: "What am I doing next week?", label: "Next week", kind: "question", score: 96 },
      { id: "next-event", text: "When is my next event?", label: "Next event", kind: "question", score: 93 },
      { id: "next-weekend", text: "What am I doing next weekend?", label: "Next weekend", kind: "question", score: 90 },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════
// Main Suggestion Generator (exported for testing)
// ═══════════════════════════════════════════════════════════════════

export function generateSuggestions(
  input: string,
  ctx: SuggestionContext
): QuerySuggestion[] {
  const trimmed = input.trim();
  if (!trimmed) return [];

  let suggestions: QuerySuggestion[] = [];

  const lowerTrimmed = trimmed.toLowerCase();

  // ── Phase 0: Everyday Questions & Regex Fallbacks (highest priority for exact matches) ──
  // If the user's query explicitly matches our new daily regexes or they type them out
  const freeTodayRe = /(?:when|what time)\s+(?:do\s+i\s+get|am\s+i|will\s+i\s+be)\s+(?:free|done)\s+today|when\s+does\s+my\s+day\s+(?:end|finish)|when\s+do\s+i\s+(?:finish|get done)\s+today/i;
  const nextMeetingRe = /(?:when|what)(?:\s+is|\'?s)\s+(?:my\s+)?next\s+meeting|find\s+(?:my\s+)?next\s+meeting/i;
  
  if (freeTodayRe.test(trimmed)) {
    suggestions.push({ id: "ex-free", text: trimmed, label: "Check free time", kind: "schedule", score: 100 });
  } else if ("when do i get free today?".startsWith(lowerTrimmed)) {
    suggestions.push({ id: "ex-free-match", text: "When do I get free today?", label: "Free today", kind: "schedule", score: 100 });
  } else if ("when do i finish today?".startsWith(lowerTrimmed)) {
    suggestions.push({ id: "ex-finish-match", text: "When do I finish today?", label: "Finish today", kind: "schedule", score: 100 });
  }

  if (nextMeetingRe.test(trimmed)) {
    suggestions.push({ id: "ex-next", text: trimmed, label: "Next meeting", kind: "question", score: 100 });
  } else if ("when is my next meeting?".startsWith(lowerTrimmed)) {
    suggestions.push({ id: "ex-next-match", text: "When is my next meeting?", label: "Next meeting", kind: "question", score: 100 });
  }

  // ── Phase 0.5: Exact/Strong List or Contact Name Match (highest priority) ──
  // "List names typed as-is should be identified without the /list and just list"
  const exactList = ctx.lists.find(l => 
    l.title.toLowerCase() === lowerTrimmed || 
    lowerTrimmed.startsWith(l.title.toLowerCase() + " ") ||
    (lowerTrimmed.length >= 2 && l.title.toLowerCase().startsWith(lowerTrimmed))
  );
  if (exactList) {
    suggestions.push({ id: `ex-l-${exactList.id}`, text: `/Inside /${exactList.title}`, label: `Open ${exactList.title}`, kind: "inside", score: 100 });
    suggestions.push({ id: `ex-add-${exactList.id}`, text: `/Add ... /${exactList.title}`, label: `Add to ${exactList.title}`, kind: "add", score: 99 });
  }
  
  const exactContact = ctx.contacts.find(c => 
    c.name.toLowerCase() === lowerTrimmed || 
    lowerTrimmed.startsWith(c.name.toLowerCase() + " ") ||
    (lowerTrimmed.length >= 2 && c.name.toLowerCase().startsWith(lowerTrimmed))
  );
  if (exactContact) {
    suggestions.push({ id: `ex-c-${exactContact.id}`, text: `/Inside /${exactContact.name}`, label: `View ${exactContact.name}`, kind: "inside", score: 100 });
    suggestions.push({ id: `ex-note-${exactContact.id}`, text: `Add note ... /${exactContact.name}`, label: `Note for ${exactContact.name}`, kind: "note", score: 99 });
  }

  // ── Phase 1: Slash prefixes (highest priority) ──
  if (trimmed.startsWith("/")) {
    for (const pat of SLASH_PREFIX_PATTERNS) {
      const m = trimmed.match(pat.re);
      if (m) {
        suggestions.push(...pat.gen(trimmed, ctx, m));
        break; // Only match one slash pattern
      }
    }
    return dedupeAndCap(suggestions);
  }

  // ── Phase 2: Full-phrase NLP patterns (if 4+ chars or multi-word) ──
  const hasSpace = trimmed.includes(" ");
  let matchedFull = false;
  if (hasSpace || trimmed.length >= 4) {
    for (const pat of FULL_PATTERNS) {
      const m = trimmed.match(pat.re);
      if (m) {
        suggestions.push(...pat.gen(trimmed, ctx, m));
        matchedFull = true;
      }
    }
  }

  // ── Phase 3: Prefix patterns (1-5 chars, single word) ──
  // We run this if no full pattern matched, to avoid shadowing single-word intents
  if (!matchedFull) {
    for (const pp of PREFIX_PATTERNS) {
      const m = trimmed.match(pp.re);
      if (m) {
        suggestions.push(...pp.gen(trimmed, ctx));
        break; // First matching prefix group wins
      }
    }
  }

  // ── Phase 4: Fuzzy fallbacks (name matching + generic actions) ──
  // Always include these to ensure generic actions aren't completely shadowed
  const lower = trimmed.toLowerCase();
  // Try fuzzy matching against list/contact names
  for (const list of ctx.lists) {
    if (list.title.toLowerCase().includes(lower) || lower.includes(list.title.toLowerCase())) {
      suggestions.push({ id: `fz-l-${list.id}`, text: `/Inside /${list.title}`, label: `View ${list.title}`, kind: "inside", score: 82 });
      suggestions.push({ id: `fz-find-${list.id}`, text: `/Find ${trimmed} in /${list.title}`, label: `Search ${list.title}`, kind: "find", score: 78 });
    }
  }
  for (const c of ctx.contacts) {
    if (c.name.toLowerCase().includes(lower) || lower.includes(c.name.toLowerCase())) {
      suggestions.push({ id: `fz-c-${c.id}`, text: `/Inside /${c.name}`, label: `${c.name}'s notes`, kind: "inside", score: 80 });
    }
  }

  // Generic catch-all actions
  suggestions.push(
    { id: "gen-find", text: `/Find ${trimmed}`, label: "Search for this", kind: "find", score: 75 },
  );
  if (ctx.lists.length > 0) {
    suggestions.push({
      id: "gen-add",
      text: `/Add ${trimmed} /${ctx.lists[0].title}`,
      label: `Add to ${ctx.lists[0].title}`,
      kind: "add",
      score: 72,
    });
  }
  if (hasSpace) {
    suggestions.push(
      { id: "gen-remind", text: `Remind me to ${trimmed}`, label: "Set reminder", kind: "reminder", score: 70 },
    );
  }

  // ── Phase 5: Append "Ask Chrono" fallback ──
  if (suggestions.length > 0 && suggestions.length < 7) {
    suggestions.push({
      id: "fallback-ask",
      text: trimmed,
      label: "Ask Chrono",
      kind: "generic",
      score: 20,
    });
  }

  return dedupeAndCap(suggestions);
}

function dedupeAndCap(suggestions: QuerySuggestion[]): QuerySuggestion[] {
  const seen = new Set<string>();
  return suggestions
    .filter((s) => {
      const key = s.text.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 7);
}

// ═══════════════════════════════════════════════════════════════════
// Hook
// ═══════════════════════════════════════════════════════════════════

export function useQuerySuggestions(
  input: string,
  isSlashActive: boolean,
  ctx: SuggestionContext
) {
  const suggestions = useMemo(() => {
    if (isSlashActive) return [];
    return generateSuggestions(input, ctx);
  }, [input, isSlashActive, ctx]);

  const trimmed = input.trim();
  const shouldShow =
    !isSlashActive &&
    trimmed.length >= 1 &&
    suggestions.length > 0;

  // Keyboard navigation state
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const selectedIndexRef = useRef(-1);
  selectedIndexRef.current = selectedIndex;

  // Reset selection when suggestions change
  useEffect(() => {
    setSelectedIndex(-1);
  }, [suggestions]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): boolean => {
      if (!shouldShow || suggestions.length === 0) return false;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % suggestions.length);
        return true;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev <= 0 ? suggestions.length - 1 : prev - 1
        );
        return true;
      }
      if (e.key === "Enter" && selectedIndexRef.current >= 0) {
        e.preventDefault();
        return true; // caller should check selectedText and call onSelect
      }
      if (e.key === "Escape") {
        setSelectedIndex(-1);
        return true;
      }
      return false;
    },
    [shouldShow, suggestions]
  );

  /** The text of the currently highlighted suggestion, or null */
  const selectedText =
    selectedIndex >= 0 && selectedIndex < suggestions.length
      ? suggestions[selectedIndex].text
      : null;

  return { suggestions, shouldShow, selectedIndex, setSelectedIndex, handleKeyDown, selectedText };
}

// ═══════════════════════════════════════════════════════════════════
// Dropdown UI
// ═══════════════════════════════════════════════════════════════════

const KIND_ICONS: Record<QuerySuggestion["kind"], React.ReactNode> = {
  add: <Plus className="w-3.5 h-3.5 text-emerald-500/70 shrink-0" />,
  find: <Search className="w-3.5 h-3.5 text-blue-500/70 shrink-0" />,
  remove: <ListTodo className="w-3.5 h-3.5 text-red-400/70 shrink-0" />,
  inside: <FolderOpen className="w-3.5 h-3.5 text-amber-500/70 shrink-0" />,
  note: <FileText className="w-3.5 h-3.5 text-violet-500/70 shrink-0" />,
  reminder: <Bell className="w-3.5 h-3.5 text-orange-500/70 shrink-0" />,
  event: <Calendar className="w-3.5 h-3.5 text-cyan-500/70 shrink-0" />,
  counter: <Timer className="w-3.5 h-3.5 text-pink-500/70 shrink-0" />,
  schedule: <Clock className="w-3.5 h-3.5 text-indigo-500/70 shrink-0" />,
  question: <HelpCircle className="w-3.5 h-3.5 text-sky-500/70 shrink-0" />,
  generic: (
    <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
  ),
};

const KIND_LABELS: Record<QuerySuggestion["kind"], string> = {
  add: "Add",
  find: "Search",
  remove: "Remove",
  inside: "View",
  note: "Note",
  reminder: "Remind",
  event: "Event",
  counter: "Track",
  schedule: "Schedule",
  question: "Ask",
  generic: "",
};

interface QuerySuggestionsDropdownProps {
  suggestions: QuerySuggestion[];
  shouldShow: boolean;
  onSelect: (text: string) => void;
  above?: boolean;
  inputText?: string;
  /** Controlled selected index from keyboard navigation */
  selectedIndex?: number;
  /** Callback when mouse hover changes selection */
  onSelectedIndexChange?: (idx: number) => void;
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span className="font-semibold text-foreground">
        {text.slice(idx, idx + query.length)}
      </span>
      {text.slice(idx + query.length)}
    </>
  );
}

export function QuerySuggestionsDropdown({
  suggestions,
  shouldShow,
  onSelect,
  above = false,
  inputText = "",
  selectedIndex: controlledIdx,
  onSelectedIndexChange,
}: QuerySuggestionsDropdownProps) {
  const [internalIdx, setInternalIdx] = useState(-1);
  const selectedIdx = controlledIdx !== undefined ? controlledIdx : internalIdx;
  const setSelectedIdx = onSelectedIndexChange || setInternalIdx;

  useEffect(() => {
    if (controlledIdx === undefined) setInternalIdx(-1);
  }, [suggestions, controlledIdx]);

  if (!shouldShow || suggestions.length === 0) return null;

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          initial={{ opacity: 0, y: above ? 6 : -6, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: above ? 6 : -6, scale: 0.97 }}
          transition={{ type: "spring", damping: 25, stiffness: 350 }}
          className={`absolute left-0 right-0 z-40 ${
            above ? "bottom-full mb-1.5" : "top-full mt-1.5"
          }`}
        >
          <div className="glass-elevated rounded-xl border border-border/40 shadow-lg overflow-hidden">
            <div className="px-3 py-1.5 border-b border-border/20 flex items-center gap-1.5">
              <Search className="w-3 h-3 text-muted-foreground/40" />
              <span className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider">
                Suggestions
              </span>
            </div>
            <div className="max-h-52 overflow-y-auto">
              {suggestions.map((suggestion, idx) => (
                <button
                  key={suggestion.id}
                  type="button"
                  ref={idx === selectedIdx ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onSelect(suggestion.text);
                  }}
                  onMouseEnter={() => setSelectedIdx(idx)}
                  className={`flex items-center gap-2.5 w-full px-3 py-2 text-left text-sm transition-colors ${
                    idx === selectedIdx
                      ? "bg-primary/8 text-foreground"
                      : "text-foreground/80 hover:bg-primary/5"
                  }`}
                >
                  {KIND_ICONS[suggestion.kind]}
                  <div className="flex-1 min-w-0 break-words">
                    {highlightMatch(suggestion.text, inputText)}
                  </div>
                  <span className="text-[10px] text-muted-foreground/40 shrink-0 font-medium">
                    {KIND_LABELS[suggestion.kind]}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}