import { List, Users, Plus, Zap } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useMemo } from "react";
import type { ListSuggestion } from "../lib/quick-capture";

interface ListAutocompleteProps {
  suggestions: ListSuggestion[];
  isActive: boolean;
  onSelect: (title: string) => void;
  /** Position the dropdown above the input (for bottom-fixed inputs) */
  above?: boolean;
  /** The current partial query typed after "/" */
  partialQuery?: string;
  /** Whether the partial query matches an existing list exactly */
  hasExactMatch?: boolean;
}

export function ListAutocompleteDropdown({
  suggestions,
  isActive,
  onSelect,
  above = false,
  partialQuery = "",
  hasExactMatch = false,
}: ListAutocompleteProps) {
  const myLists = useMemo(() => suggestions.filter((s) => s.source === "my"), [suggestions]);
  const sharedLists = useMemo(() => suggestions.filter((s) => s.source === "shared"), [suggestions]);
  const commandLists = useMemo(() => suggestions.filter((s) => s.source === "command"), [suggestions]);

  // Show "Create /Name" when the user typed a partial query with no exact match
  // Do not show create if the query is a command (Add, Find, Capabilities)
  const isCommandQuery = partialQuery.match(/^(?:Find|Add|Remove|Inside|Capabilities)$/i);
  const showCreate = partialQuery.trim().length > 0 && !hasExactMatch && !isCommandQuery;

  // Hide the dropdown entirely when user has completed an exact match selection
  const hasContent = !hasExactMatch && (suggestions.length > 0 || showCreate);

  return (
    <AnimatePresence>
      {isActive && hasContent && (
        <motion.div
          initial={{ opacity: 0, y: above ? 6 : -6, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: above ? 6 : -6, scale: 0.97 }}
          transition={{ type: "spring", damping: 25, stiffness: 350 }}
          className={`absolute left-0 right-0 z-50 ${
            above ? "bottom-full mb-1.5" : "top-full mt-1.5"
          }`}
        >
          <div className="glass-elevated rounded-xl border border-border/40 shadow-lg overflow-hidden max-h-56 overflow-y-auto">
            {/* Commands section — show FIRST when no partial query so users discover them */}
            {commandLists.length > 0 && !partialQuery.trim() && (
              <div>
                <div className="px-3 py-1.5 border-b border-border/30">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                    Commands
                  </span>
                </div>
                {commandLists.map((list) => (
                  <button
                    key={list.id}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onSelect(list.title);
                    }}
                    className="flex items-center gap-2.5 w-full px-3 py-2 text-left text-sm text-foreground hover:bg-primary/8 transition-colors"
                  >
                    <Zap className="w-3.5 h-3.5 text-violet-500/70 shrink-0" />
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="truncate">{list.title}</span>
                      {list.description && <span className="text-[10px] text-muted-foreground truncate">{list.description}</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* My Lists section */}
            {myLists.length > 0 && (
              <div>
                <div className={`px-3 py-1.5 border-b border-border/30 ${commandLists.length > 0 && !partialQuery.trim() ? "border-t" : ""}`}>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                    My Lists
                  </span>
                </div>
                {myLists.map((list) => (
                  <button
                    key={list.id}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onSelect(list.title);
                    }}
                    className="flex items-center gap-2.5 w-full px-3 py-2 text-left text-sm text-foreground hover:bg-primary/8 transition-colors"
                  >
                    <List className="w-3.5 h-3.5 text-primary/60 shrink-0" />
                    <span className="truncate">{list.title}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Shared Lists section */}
            {sharedLists.length > 0 && (
              <div>
                <div className={`px-3 py-1.5 border-b border-border/30 ${myLists.length > 0 ? "border-t" : ""}`}>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                    Shared Lists
                  </span>
                </div>
                {sharedLists.map((list) => (
                  <button
                    key={list.id}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onSelect(list.title);
                    }}
                    className="flex items-center gap-2.5 w-full px-3 py-2 text-left text-sm text-foreground hover:bg-primary/8 transition-colors"
                  >
                    <Users className="w-3.5 h-3.5 text-orange-500/70 shrink-0" />
                    <span className="truncate">{list.title}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground/50 shrink-0">shared</span>
                  </button>
                ))}
              </div>
            )}

            {/* Commands section — show at bottom when user is filtering */}
            {commandLists.length > 0 && partialQuery.trim() && (
              <div>
                <div className={`px-3 py-1.5 border-b border-border/30 ${(myLists.length > 0 || sharedLists.length > 0) ? "border-t" : ""}`}>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                    Commands
                  </span>
                </div>
                {commandLists.map((list) => (
                  <button
                    key={list.id}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onSelect(list.title);
                    }}
                    className="flex items-center gap-2.5 w-full px-3 py-2 text-left text-sm text-foreground hover:bg-primary/8 transition-colors"
                  >
                    <Zap className="w-3.5 h-3.5 text-violet-500/70 shrink-0" />
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="truncate">{list.title}</span>
                      {list.description && <span className="text-[10px] text-muted-foreground truncate">{list.description}</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Create new list option */}
            {showCreate && (
              <div className={suggestions.length > 0 ? "border-t border-border/30" : ""}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    // Capitalize the first letter for a clean list name
                    const name = partialQuery.trim();
                    const capitalized = name.charAt(0).toUpperCase() + name.slice(1);
                    onSelect(capitalized);
                  }}
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-left text-sm text-primary hover:bg-primary/8 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5 text-primary/70 shrink-0" />
                  <span className="truncate">
                    Create <span className="font-medium">&ldquo;{partialQuery.trim()}&rdquo;</span>
                  </span>
                </button>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}