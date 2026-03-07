import { useState, useEffect } from "react";

// ── Default placeholders ──
const DEFAULT_PLACEHOLDERS = [
  "When am I free tomorrow?",
  "Remind me to call Mom on Sunday",
  "Add milk to my grocery list",
  "Meet Sarah at 3pm for coffee",
  "Find a 1 hour slot this week",
  "Start a counter for days since gym",
  "Schedule team standup every Monday",
  "How long until Christmas?",
  "Give me a random news article",
  "I just worked out",
];

// ── Typewriter hook ──
export function useRotatingPlaceholder(enabled: boolean, prompts?: string[]) {
  const effectivePrompts = prompts && prompts.length > 0 ? prompts : DEFAULT_PLACEHOLDERS;
  const [text, setText] = useState("");
  const [promptIndex, setPromptIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const currentPrompt = effectivePrompts[promptIndex % effectivePrompts.length];

    if (isPaused) {
      const pauseTimer = setTimeout(() => {
        setIsPaused(false);
        setIsDeleting(true);
      }, 2000);
      return () => clearTimeout(pauseTimer);
    }

    if (!isDeleting) {
      if (charIndex < currentPrompt.length) {
        const timer = setTimeout(() => {
          setText(currentPrompt.slice(0, charIndex + 1));
          setCharIndex(charIndex + 1);
        }, 40 + Math.random() * 30);
        return () => clearTimeout(timer);
      } else {
        setIsPaused(true);
      }
    } else {
      if (charIndex > 0) {
        const timer = setTimeout(() => {
          setText(currentPrompt.slice(0, charIndex - 1));
          setCharIndex(charIndex - 1);
        }, 20);
        return () => clearTimeout(timer);
      } else {
        setIsDeleting(false);
        setPromptIndex((promptIndex + 1) % effectivePrompts.length);
      }
    }
  }, [enabled, promptIndex, charIndex, isDeleting, isPaused, effectivePrompts]);

  return text || "";
}

// ── Personalized prompts builder ──
export interface PersonalizedPrompts {
  quickPrompts: { label: string; icon: any; query: string }[];
  placeholders: string[];
}

export function buildPersonalizedPrompts(
  contacts: any[],
  lists: any[],
  counters: any[],
  reminders: any[],
  // Icon references are passed in so this file doesn't import lucide-react
  icons: {
    Zap: any; CalendarDays: any; Search: any; CalendarPlus: any;
    Bell: any; Timer: any; Users: any; FolderOpen: any;
  },
): PersonalizedPrompts {
  const firstContact = contacts.length > 0 ? contacts[0].name.split(" ")[0] : null;
  const rawSecondContact = contacts.length > 1 ? contacts[1].name.split(" ")[0] : null;
  const secondContact = rawSecondContact && rawSecondContact === firstContact
    ? contacts[1].name
    : rawSecondContact;
  const firstList = lists.length > 0 ? lists[0] : null;
  const firstCounter = counters.length > 0 ? counters[0] : null;

  const { Zap, CalendarDays, Search, CalendarPlus, Bell, Timer, Users, FolderOpen } = icons;

  const quickPrompts: { label: string; icon: any; query: string }[] = [
    { label: "Free today?", icon: Zap, query: "When am I free today?" },
    { label: "Free tomorrow?", icon: CalendarDays, query: "When am I free tomorrow?" },
    { label: "Find a slot", icon: Search, query: "Find a 1 hour slot this week" },
    {
      label: "Add event",
      icon: CalendarPlus,
      query: firstContact
        ? `Meet ${firstContact} at 3pm tomorrow for 1 hour`
        : "Meet Sarah at 3pm tomorrow for 1 hour",
    },
    { label: "Set reminder", icon: Bell, query: "Remind me to submit report on Friday" },
    {
      label: "Find anything",
      icon: Search,
      query: `/Find ${firstContact ? firstContact : "lunch"} in Lists`,
    },
    { label: "Start counter", icon: Timer, query: "Start a counter for days since I last exercised" },
    {
      label: "Meet a friend",
      icon: Users,
      query: firstContact
        ? `When can I meet with ${firstContact} this week?`
        : "When can I meet with Sarah this week?",
    },
    {
      label: "Inside a list",
      icon: FolderOpen,
      query: firstList
        ? `/Inside /${firstList.title}`
        : "/Inside /Groceries",
    },
    {
      label: "Inside a contact",
      icon: FolderOpen,
      query: firstContact
        ? `/Inside /${firstContact}`
        : "/Inside /Sarah",
    },
  ];

  const placeholders: string[] = [
    "When am I free tomorrow?",
    "Remind me to call Mom on Sunday",
    firstList
      ? `Add something to my ${firstList.title} list`
      : "Add milk to my grocery list",
    firstContact
      ? `Meet ${firstContact} at 3pm for coffee`
      : "Meet Sarah at 3pm for coffee",
    "Find a 1 hour slot this week",
    firstContact
      ? `When can I meet with ${firstContact}?`
      : "When can I meet with Alex?",
    firstCounter
      ? (() => {
          const cl = firstCounter.label
            .replace(/^days?\s+(?:since|until|to)\s+(?:i\s+(?:last\s+)?)?/i, "")
            .replace(/^(?:countdown|count\s*down)\s+(?:to|for|until)\s+/i, "")
            .replace(/^(?:since|until)\s+(?:i\s+(?:last\s+)?)?/i, "")
            .replace(/^(?:went\s+(?:to|for)\s+(?:a\s+)?|visited\s+|did\s+(?:some\s+|a\s+)?|had\s+(?:a\s+|my\s+)?)/i, "")
            .replace(/^last\s+/i, "");
          return firstCounter.type === "to"
            ? `How long until ${cl}?`
            : `How long since ${cl}?`;
        })()
      : "Start a counter for days since gym",
    "Schedule team standup every Monday",
    secondContact
      ? `Am I free to meet ${secondContact} tomorrow?`
      : "What does my week look like?",
    "How long until Christmas?",
    firstContact && secondContact
      ? `Find time for ${firstContact}, ${secondContact} & me`
      : "Remind me to renew my passport in June",
    "Give me a random news article",
    "I just worked out",
  ];

  return { quickPrompts, placeholders };
}
