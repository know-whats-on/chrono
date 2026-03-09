import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, Search, Check, X } from "lucide-react";

export interface FormatOption {
  value: string;
  label: string;
  category: string;
}

const FORMAT_OPTIONS: FormatOption[] = [
  // General (most common)
  { value: "presentation-general", category: "General", label: "Presentation" },
  { value: "group-presentation", category: "General", label: "Group Presentation" },
  { value: "pitch-general", category: "General", label: "Pitch" },
  { value: "debate-general", category: "General", label: "Debate" },
  { value: "oral-exam-general", category: "General", label: "Oral Examination" },
  { value: "viva-general", category: "General", label: "Viva Voce / Oral Defence" },
  { value: "group-discussion-general", category: "General", label: "Group Discussion" },
  { value: "panel-interview-general", category: "General", label: "Panel Interview" },

  // Arts, Design & Architecture
  { value: "design-review", category: "Arts, Design & Architecture", label: "Design Review" },
  { value: "impromptu-speech", category: "Arts, Design & Architecture", label: "Impromptu Speech" },
  { value: "poster-defence", category: "Arts, Design & Architecture", label: "Poster Defence" },
  { value: "presentation", category: "Arts, Design & Architecture", label: "Presentation" },
  { value: "storytelling", category: "Arts, Design & Architecture", label: "Storytelling / Narrative" },
  { value: "teaching-demo", category: "Arts, Design & Architecture", label: "Teaching Demonstration" },

  // Business
  { value: "pitch", category: "Business", label: "Business Pitch" },
  { value: "client-interview", category: "Business", label: "Client Interview" },
  { value: "debate-business", category: "Business", label: "Debate" },
  { value: "group-discussion", category: "Business", label: "Group Discussion" },
  { value: "negotiation", category: "Business", label: "Negotiation Role-Play" },
  { value: "panel-interview", category: "Business", label: "Panel Interview" },

  // Engineering
  { value: "lab-oral", category: "Engineering", label: "Lab Oral / Practical Viva" },
  { value: "progress-review", category: "Engineering", label: "Progress Review" },
  { value: "thesis-defence", category: "Engineering", label: "Thesis / Dissertation Defence" },
  { value: "viva", category: "Engineering", label: "Viva Voce / Oral Defence" },

  // Law & Justice
  { value: "debate", category: "Law & Justice", label: "Debate" },
  { value: "mock-trial", category: "Law & Justice", label: "Mock Trial" },
  { value: "moot-court", category: "Law & Justice", label: "Moot Court" },
  { value: "plea-hearing", category: "Law & Justice", label: "Plea / Sentencing Hearing" },
  { value: "witness-examination", category: "Law & Justice", label: "Witness Examination" },

  // Medicine & Health
  { value: "case-presentation", category: "Medicine & Health", label: "Case Presentation" },
  { value: "clinical-handover", category: "Medicine & Health", label: "Clinical Handover" },
  { value: "osce", category: "Medicine & Health", label: "OSCE (Clinical Examination)" },
  { value: "patient-history", category: "Medicine & Health", label: "Patient History Taking" },

  // Science
  { value: "oral-exam", category: "Science", label: "Oral Examination" },

  // Other
  { value: "other", category: "Other", label: "Other" },
];

/** Look up the human-readable label for a format value. Falls back to title-casing the value. */
export function getFormatLabel(value: string): string {
  const opt = FORMAT_OPTIONS.find((o) => o.value === value);
  if (opt) return opt.label;
  // Fallback: title-case the raw value (e.g. "debate-general" → "Debate General")
  return value
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const CATEGORIES = [
  "General",
  "Arts, Design & Architecture",
  "Business",
  "Engineering",
  "Law & Justice",
  "Medicine & Health",
  "Science",
  "Other",
];

interface FormatDropdownProps {
  value: string;
  onChange: (value: string) => void;
}

export function FormatDropdown({ value, onChange }: FormatDropdownProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearchQuery("");
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  const selectedOption = FORMAT_OPTIONS.find((o) => o.value === value);

  const filteredOptions = searchQuery
    ? FORMAT_OPTIONS.filter(
        (o) =>
          o.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          o.category.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : FORMAT_OPTIONS;

  const groupedOptions: Record<string, FormatOption[]> = {};
  for (const cat of CATEGORIES) {
    const items = filteredOptions.filter((o) => o.category === cat);
    if (items.length > 0) {
      groupedOptions[cat] = items;
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div
        className="flex h-12 w-full items-center justify-between rounded-xl bg-[#767680]/[0.08] px-3 cursor-pointer"
        onClick={() => setOpen(!open)}
      >
        <span className={`text-sm truncate pr-2 ${selectedOption ? "text-gray-900" : "text-gray-400"}`}>
          {selectedOption ? selectedOption.label : "Select a format..."}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {value && value !== "presentation" && (
            <button
              type="button"
              className="p-0.5 rounded-full hover:bg-black/10 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onChange("presentation");
              }}
            >
              <X className="h-3.5 w-3.5 text-gray-400" />
            </button>
          )}
          <ChevronDown
            className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </div>
      </div>

      {open && (
        <div className="absolute z-30 bottom-full mb-1 w-full bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden flex flex-col">
          {/* Options */}
          <div className="max-h-64 overflow-y-auto overscroll-contain order-1">
            {Object.keys(groupedOptions).length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-gray-400">
                No matching formats found.
              </div>
            ) : (
              Object.entries(groupedOptions).map(([category, options]) => (
                <div key={category}>
                  <div className="px-3 py-2 bg-[#f7f7f8] sticky top-0 z-10">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                      {category}
                    </span>
                  </div>
                  {options.map((option) => {
                    const isSelected = value === option.value;
                    return (
                      <div
                        key={option.value}
                        className={`flex items-center justify-between px-3 py-2.5 cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-[#0a84ff]/10"
                            : "hover:bg-gray-50 active:bg-gray-100"
                        }`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          onChange(option.value);
                          setOpen(false);
                          setSearchQuery("");
                        }}
                      >
                        <span className={`text-sm ${isSelected ? "font-medium text-[#0a84ff]" : "text-gray-900"}`}>
                          {option.label}
                        </span>
                        {isSelected && <Check className="h-4 w-4 text-[#0a84ff] shrink-0" />}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {/* Search - pinned at bottom */}
          <div className="p-2 border-t border-gray-100 order-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search formats..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-9 pl-8 pr-3 rounded-lg bg-[#767680]/[0.08] border-none text-sm outline-none focus:ring-1 focus:ring-[#0a84ff] placeholder:text-gray-400"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}