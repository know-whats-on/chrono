import * as chrono from "chrono-node";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  getMyLists, createMyList, addMyListItem,
  createReminder, createEvent, createDaysSince,
  getSharedLists, addSharedListItem,
  getContacts, updateContact,
  deleteMyListItem, deleteSharedListItem
} from "./api";
import { detectActionableStatement } from "./assistant-logic";

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

export type CaptureType = "task" | "reminder" | "event" | "counter" | "note";

export interface CaptureOption {
  type: CaptureType;
  label: string;
  sublabel: string;
  primary?: boolean;
  targetList?: string;   // explicit list name from "/ListName" syntax
  cleanSubject?: string; // content with the /ListName suffix stripped
}

const DEFAULT_LIST_NAME = "Quick Capture";

// Detect "... /ListName" or "... to /ListName" at end of input
// Allow zero or more spaces before the slash so "milk/Groceries" also works
// [^/]+? prevents capturing slashes inside the target name, ensuring we match
// the LAST /Target — so "AC/DC concert /Events" correctly extracts "Events"
const LIST_SLASH_RE = /\s*\/([^/]+?)\s*$/;

function parseSlashList(text: string): { content: string; listName: string } | null {
  const m = text.match(LIST_SLASH_RE);
  if (!m) return null;
  const listName = m[1].trim();
  if (!listName) return null;
  // Strip the /ListName part and any trailing "to" preposition
  let content = text.slice(0, m.index!).replace(/\s+to\s*$/i, "").trim();
  // Also strip a leading "add", "remove", or "note" if present for cleaner subject
  content = content.replace(/^(?:add|remove|note)\s+/i, "").trim();
  return content ? { content, listName } : null;
}

// ═══════════════════════════════════════════════════════════════════
// Slash-list autocomplete hook
// ═══════════════════════════════════════════════════════════════════

// Match " /" or "^/" at end with optional partial name — triggers autocomplete
// But stop matching if the text after the slash is a command followed by a space
const SLASH_ACTIVE_RE = /(?:^|\s)\/((?!(?:Find|Add|Remove|Inside|Capabilities)\s)[^/]*)$/i;

export interface ListSuggestion {
  id: string;
  title: string;
  source: "my" | "shared" | "command";
  description?: string;
}

/**
 * Hook: detects when the user types `/` in the input and shows matching lists.
 * Returns suggestions, the active query, and a handler to complete a selection.
 */
export function useListAutocomplete(input: string, setInput: (v: string) => void) {
  const [allLists, setAllLists] = useState<ListSuggestion[]>([]);
  const fetchedRef = useRef(false);

  // Detect slash-mode active
  const slashMatch = useMemo(() => input.match(SLASH_ACTIVE_RE), [input]);
  const isSlashActive = !!slashMatch;
  const partialQuery = slashMatch ? slashMatch[1] : "";

  // Fetch lists once when slash first appears
  useEffect(() => {
    if (!isSlashActive) return;
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    Promise.all([
      getMyLists().catch(() => []),
      getSharedLists().catch(() => []),
    ]).then(([myLists, sharedLists]) => {
      const combined: ListSuggestion[] = [];
      if (Array.isArray(myLists)) {
        combined.push(...myLists.map((l: any) => ({ id: l.id, title: l.title, source: "my" as const })));
      }
      if (Array.isArray(sharedLists)) {
        // Deduplicate: skip shared lists that already appear in myLists by title
        const myTitles = new Set(combined.map((l) => l.title.toLowerCase()));
        for (const l of sharedLists) {
          if (!myTitles.has(l.title.toLowerCase())) {
            combined.push({ id: l.id, title: l.title, source: "shared" as const });
          }
        }
      }

      // Add commands
      combined.push({ id: "cmd-add", title: "Add", source: "command" as const, description: "Add a task or event" });
      combined.push({ id: "cmd-find", title: "Find", source: "command" as const, description: "Search across Lists, Reminders, and Contacts" });
      combined.push({ id: "cmd-remove", title: "Remove", source: "command" as const, description: "Remove items from Lists or Contact Notes" });
      combined.push({ id: "cmd-inside", title: "Inside", source: "command" as const, description: "View items inside a List or Contact Notes" });
      combined.push({ id: "cmd-capabilities", title: "Capabilities", source: "command" as const, description: "Show what I can do" });

      setAllLists(combined);
    });
  }, [isSlashActive]);

  // Re-fetch if user opens slash again after closing
  useEffect(() => {
    if (!isSlashActive) {
      fetchedRef.current = false;
    }
  }, [isSlashActive]);

  // Filter suggestions by partial query
  const suggestions = useMemo(() => {
    if (!isSlashActive) return [];
    const q = partialQuery.toLowerCase();
    const filtered = allLists.filter(
      (l) => !q || l.title.toLowerCase().includes(q)
    );
    return filtered;
  }, [isSlashActive, partialQuery, allLists]);

  // Whether the partial query has an exact match (case-insensitive)
  const hasExactMatch = useMemo(() => {
    if (!partialQuery) return false;
    return allLists.some((l) => l.title.toLowerCase() === partialQuery.toLowerCase());
  }, [partialQuery, allLists]);

  // When user picks a list, replace the "/partial" with "/ListName"
  const selectList = useCallback(
    (listTitle: string) => {
      const match = input.match(SLASH_ACTIVE_RE);
      if (!match) return;
      const idx = match.index!;
      const isStart = idx === 0 && input.startsWith("/");
      // Keep everything before the slash, then append "/ListName"
      const before = input.slice(0, isStart ? 0 : idx + 1); // +1 to keep the space
      
      const isCommand = ["Add", "Find", "Remove", "Inside", "Capabilities"].includes(listTitle);
      setInput(`${before}/${listTitle}${isCommand ? " " : ""}`);
    },
    [input, setInput],
  );

  return { isSlashActive, suggestions, selectList, partialQuery, hasExactMatch };
}

// ═══════════════════════════════════════════════════════════════════
// Classify captured text into action options
// ═══════════════════════════════════════════════════════════════════

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "\u2026" : s;
}

function formatParsedDate(result: chrono.ParsedResult): string {
  const d = result.start.date();
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / 86400000);

  if (diffDays === 0) {
    if (result.start.isCertain("hour")) {
      return `today at ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    }
    return "today";
  }
  if (diffDays === 1) {
    if (result.start.isCertain("hour")) {
      return `tomorrow at ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    }
    return "tomorrow";
  }
  if (diffDays > 1 && diffDays < 7) {
    const dayName = d.toLocaleDateString([], { weekday: "long" });
    if (result.start.isCertain("hour")) {
      return `${dayName} at ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    }
    return dayName;
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function classifyCapture(text: string, contacts: any[] = [], lists: any[] = []): CaptureOption[] {
  const options: CaptureOption[] = [];
  let trimmed = text.trim();
  
  if (/^\/(?:Find|Remove|Inside|Capabilities)(?=\s|$)/i.test(trimmed)) {
    return options;
  }
  
  if (/^\/Add(?=\s|$)/i.test(trimmed)) {
    trimmed = trimmed.replace(/^\/Add(?=\s|$)\s*/i, "").trim();
  }
  
  const detection = detectActionableStatement(trimmed);
  // Derive subject from NLP detection or raw trimmed input (no option param here)
  const subject = detection?.subject || trimmed;
  const parsed = chrono.parse(trimmed);
  const hasDateTime = parsed.length > 0;
  const hasTime = hasDateTime && parsed[0].start.isCertain("hour");
  const hasDate = hasDateTime;
  
  const hasAction = detection?.suggestTask ?? false;
  const hasReminder = detection?.suggestReminder ?? false;
  const hasCounter = detection?.suggestCounter ?? false;
  const hasNote = /^(?:add|save|note)(?:\s+note)?\s+(.+)\s+to\s+(?:contact\s+|profile\s+)?(.+?)(?:'s?\s+(?:profile|contact))?$/i.test(trimmed);

  // Note: has specific structure
  if (hasNote) {
    const match = trimmed.match(/^(?:add|save|note)(?:\s+note)?\s+(.+)\s+to\s+(?:contact\s+|profile\s+)?(.+?)(?:'s?\s+(?:profile|contact))?$/i);
    if (!match) throw new Error("Could not parse note intent");
    let targetName = match?.[2] || "contact";
    targetName = targetName.trim().replace(/^my\s+/i, '').replace(/^\//, ''); // Strip leading slash

    // Check if the target is actually one of our lists (or ends in the word "list")
    const isListMatch = lists.some(l => 
      l.title.toLowerCase() === targetName.toLowerCase() || 
      targetName.toLowerCase() === `${l.title.toLowerCase()} list` ||
      l.title.toLowerCase() === targetName.toLowerCase().replace(/\s+list$/i, '')
    );
    const endsWithList = /\s+list$/i.test(targetName);
    
    // Check if it matches an existing contact
    const isContactMatch = contacts.some(c => 
      c.name.toLowerCase().includes(targetName.toLowerCase()) || 
      targetName.toLowerCase().includes(c.name.split(" ")[0].toLowerCase())
    );
    
    // Explicit keywords for notes
    const hasExplicitNoteKeywords = /contact|profile/i.test(trimmed);

    // If it's explicitly a list, or it doesn't match a contact AND doesn't have explicit note keywords
    if (isListMatch || endsWithList || (!isContactMatch && !hasExplicitNoteKeywords)) {
      const cleanListName = targetName.replace(/\s+list$/i, '');
      options.push({
        type: "task",
        label: "List Item",
        sublabel: `Add to ${truncate(cleanListName, 20)}`,
        primary: true,
        targetList: cleanListName,
        cleanSubject: match[1].trim(),
      });
      return options;
    }
    
    options.push({
      type: "note",
      label: "Contact Note",
      sublabel: `Add to ${truncate(targetName, 20)}`,
      primary: true,
    });
    return options; // Short circuit for notes, since they are very explicit
  }

  // Event: has specific date+time
  if (hasTime) {
    options.push({
      type: "event",
      label: "Calendar Event",
      sublabel: `"${truncate(subject, 28)}" ${formatParsedDate(parsed[0])}`,
      primary: true,
    });
  }

  // Reminder: has temporal reference
  if (hasReminder || hasDate) {
    options.push({
      type: "reminder",
      label: "Reminder",
      sublabel: hasDate
        ? `"${truncate(subject, 26)}" ${formatParsedDate(parsed[0])}`
        : `"${truncate(subject, 36)}"`,
      primary: !hasTime,
    });
  }

  // Task: has action verb or fallback
  if (hasAction || (!hasCounter && !hasTime)) {
    options.push({
      type: "task",
      label: "List Item",
      sublabel: `Add to ${DEFAULT_LIST_NAME}`,
      primary: !hasTime && !hasDate && !hasCounter,
    });
  }

  // Counter: has milestone/countdown
  if (hasCounter) {
    options.push({
      type: "counter",
      label: "Counter",
      sublabel: `Track "${truncate(subject, 30)}"`,
      primary: !hasTime && !hasDate && !hasAction,
    });
  }

  // Fallback to task
  if (options.length === 0) {
    options.push({
      type: "task",
      label: "List Item",
      sublabel: `Add to ${DEFAULT_LIST_NAME}`,
      primary: true,
    });
  }

  // Ensure exactly one primary
  if (!options.some(o => o.primary)) {
    options[0].primary = true;
  }

  return options;
}

// ═══════════════════════════════════════════════════════════════════
// Execute capture actions
// ═══════════════════════════════════════════════════════════════════

export async function executeCapture(
  type: CaptureType,
  text: string,
  option?: Pick<CaptureOption, "targetList" | "cleanSubject">,
): Promise<string> {
  let trimmed = text.trim();
  if (/^\/Add(?=\s|$)/i.test(trimmed)) {
    trimmed = trimmed.replace(/^\/Add(?=\s|$)\s*/i, "").trim();
  }
  
  const detection = detectActionableStatement(trimmed);
  // Use cleanSubject from option (slash-list stripped) or fall back to detection/raw
  const subject = option?.cleanSubject || detection?.subject || trimmed;
  const parsed = chrono.parse(trimmed);
  const listName = option?.targetList || DEFAULT_LIST_NAME;

  switch (type) {
    case "task": {
      // Search both personal and shared lists for the target
      const [myLists, sharedLists] = await Promise.all([
        getMyLists().catch(() => []),
        getSharedLists().catch(() => []),
      ]);
      let target: any = null;
      let isShared = false;

      // Check personal lists first (case-insensitive)
      if (Array.isArray(myLists) && myLists.length > 0) {
        target = myLists.find(
          (l: any) => l.title.toLowerCase() === listName.toLowerCase()
        ) || null;
      }
      // Then check shared lists
      if (!target && Array.isArray(sharedLists) && sharedLists.length > 0) {
        target = sharedLists.find(
          (l: any) => l.title.toLowerCase() === listName.toLowerCase()
        ) || null;
        if (target) isShared = true;
      }
      // Create a new personal list if not found anywhere
      if (!target) {
        target = await createMyList({ title: listName });
      }

      const itemData = {
        text: subject,
        ...(parsed.length > 0 ? { due_date: parsed[0].start.date().toISOString().slice(0, 10) } : {}),
      };
      if (isShared) {
        await addSharedListItem(target.id, itemData);
      } else {
        await addMyListItem(target.id, itemData);
      }
      return `Added "${subject}" to ${target.title}`;
    }

    case "reminder": {
      const dueDate = parsed.length > 0
        ? parsed[0].start.date().toISOString()
        : new Date(Date.now() + 3600000).toISOString();
      await createReminder({ title: subject, due_at: dueDate, is_enabled: true });
      return `Reminder set for "${subject}"`;
    }

    case "event": {
      if (parsed.length > 0) {
        const startDate = parsed[0].start.date();
        const endDate = parsed[0].end
          ? parsed[0].end.date()
          : new Date(startDate.getTime() + 3600000);
        await createEvent({ title: subject, start_at: startDate.toISOString(), end_at: endDate.toISOString() });
        return `Event "${subject}" created`;
      }
      const now = new Date();
      await createEvent({ title: subject, start_at: now.toISOString(), end_at: new Date(now.getTime() + 3600000).toISOString() });
      return `Event "${subject}" created`;
    }

    case "counter": {
      const isCountdown = /until|countdown|days?\s+(?:left|to\s+go|remaining|away)/i.test(trimmed);
      const counterType: "since" | "to" = isCountdown ? "to" : "since";
      const data: any = { label: subject, type: counterType };
      if (counterType === "since") {
        data.last_date = new Date().toISOString().slice(0, 10);
      } else if (parsed.length > 0) {
        data.target_date = parsed[0].start.date().toISOString().slice(0, 10);
      }
      await createDaysSince(data);
      return `Counter "${subject}" created`;
    }

    case "note": {
      let content = "";
      let contactName = "";
      
      if (option?.targetList && option?.cleanSubject) {
        contactName = option.targetList;
        content = option.cleanSubject;
      } else {
        const match = trimmed.match(/^(?:add|save|note)(?:\s+note)?\s+(.+)\s+to\s+(?:contact\s+|profile\s+)?(.+?)(?:'s?\s+(?:profile|contact))?$/i);
        if (!match) throw new Error("Could not parse note intent");
        content = match[1].trim();
        contactName = match[2].trim();
      }

      if (content.startsWith('"') && content.endsWith('"')) {
        content = content.slice(1, -1);
      }
      contactName = contactName.replace(/^my\s+/i, '').replace(/^\//, ''); // Strip leading slash
      const contacts = await getContacts().catch(() => []);
      const matchContact = contacts.find((c: any) => c.name.toLowerCase().includes(contactName.toLowerCase()) || contactName.toLowerCase().includes(c.name.split(" ")[0].toLowerCase()));
      if (!matchContact) {
        throw new Error(`__CONTACT_NOT_FOUND__:${contactName}:${content}`);
      }
      const newNotes = matchContact.notes ? `${matchContact.notes}\n${content}` : content;
      await updateContact(matchContact.id, { notes: newNotes });
      return `Added note to ${matchContact.name}'s profile`;
    }

    default:
      throw new Error("Unknown capture type");
  }
}

// ═══════════════════════════════════════════════════════════════════
// Execute /Remove command
// ═══════════════════════════════════════════════════════════════════

export async function executeRemove(text: string): Promise<string> {
  let trimmed = text.trim();
  // Strip /Remove prefix
  if (/^\/Remove(?=\s|$)/i.test(trimmed)) {
    trimmed = trimmed.replace(/^\/Remove(?=\s|$)\s*/i, "").trim();
  }

  if (!trimmed) {
    throw new Error("__REMOVE_EMPTY__");
  }

  const slashMatch = parseSlashList(trimmed);
  if (!slashMatch) {
    throw new Error("__REMOVE_NO_TARGET__");
  }

  const { content, listName: targetName } = slashMatch;

  // ── Try contacts first ──
  const contacts = await getContacts().catch(() => []);
  const matchContact = contacts.find(
    (c: any) =>
      c.name.toLowerCase() === targetName.toLowerCase() ||
      c.name.toLowerCase().startsWith(targetName.toLowerCase() + " ") ||
      targetName.toLowerCase() === c.name.split(" ")[0].toLowerCase()
  );

  if (matchContact) {
    if (!matchContact.notes?.trim()) {
      throw new Error(`${matchContact.name} has no notes to remove from.`);
    }
    const lines = matchContact.notes.split("\n");
    const contentLower = content.toLowerCase();
    const matchIdx = lines.findIndex((l: string) =>
      l.toLowerCase().includes(contentLower)
    );
    if (matchIdx === -1) {
      throw new Error(
        `Couldn't find "${content}" in ${matchContact.name}'s notes.`
      );
    }
    const removed = lines.splice(matchIdx, 1)[0];
    const newNotes = lines.filter((l: string) => l.trim()).join("\n");
    await updateContact(matchContact.id, { notes: newNotes || "" });
    return `Removed "${removed.trim()}" from ${matchContact.name}'s notes`;
  }

  // ── Try lists (personal then shared) ──
  const [myLists, sharedLists] = await Promise.all([
    getMyLists().catch(() => []),
    getSharedLists().catch(() => []),
  ]);

  let targetList: any = null;
  let isShared = false;

  if (Array.isArray(myLists)) {
    targetList =
      myLists.find(
        (l: any) => l.title.toLowerCase() === targetName.toLowerCase()
      ) ||
      myLists.find(
        (l: any) => l.title.toLowerCase().includes(targetName.toLowerCase())
      ) ||
      null;
  }
  if (!targetList && Array.isArray(sharedLists)) {
    targetList =
      sharedLists.find(
        (l: any) => l.title.toLowerCase() === targetName.toLowerCase()
      ) ||
      sharedLists.find(
        (l: any) => l.title.toLowerCase().includes(targetName.toLowerCase())
      ) ||
      null;
    if (targetList) isShared = true;
  }

  if (!targetList) {
    throw new Error(
      `Couldn't find a list or contact named "${targetName}".`
    );
  }

  const items = targetList.items || [];
  const contentLower = content.toLowerCase();
  const matchItem = items.find(
    (i: any) =>
      i.text.toLowerCase().includes(contentLower) ||
      contentLower.includes(i.text.toLowerCase())
  );

  if (!matchItem) {
    throw new Error(
      `Couldn't find "${content}" in ${targetList.title}.`
    );
  }

  if (isShared) {
    await deleteSharedListItem(targetList.id, matchItem.id);
  } else {
    await deleteMyListItem(targetList.id, matchItem.id);
  }
  return `Removed "${matchItem.text}" from ${targetList.title}`;
}