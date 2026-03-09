import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, Search, Check, X } from "lucide-react";

export interface SchoolOption {
  value: string;
  label: string;
  category: string;
}

const SCHOOL_OPTIONS: SchoolOption[] = [
  // Arts, Design & Architecture
  { value: "art", category: "Arts, Design & Architecture", label: "School of Art & Design" },
  { value: "arts-media", category: "Arts, Design & Architecture", label: "School of Arts & Media" },
  { value: "architecture", category: "Arts, Design & Architecture", label: "School of Architecture" },
  { value: "built-environment", category: "Arts, Design & Architecture", label: "School of Built Environment" },
  { value: "humanities-languages", category: "Arts, Design & Architecture", label: "School of Humanities & Languages" },
  { value: "social-sciences", category: "Arts, Design & Architecture", label: "School of Social Sciences" },

  // Business
  { value: "accounting-auditing", category: "Business", label: "School of Accounting, Auditing & Taxation" },
  { value: "banking-finance", category: "Business", label: "School of Banking & Finance" },
  { value: "economics", category: "Business", label: "School of Economics" },
  { value: "info-systems", category: "Business", label: "School of Information Systems & Technology Management" },
  { value: "management-governance", category: "Business", label: "School of Management & Governance" },
  { value: "marketing", category: "Business", label: "School of Marketing" },
  { value: "risk-actuarial", category: "Business", label: "School of Risk & Actuarial Studies" },

  // Engineering
  { value: "biomedical-eng", category: "Engineering", label: "School of Biomedical Engineering" },
  { value: "chemical-eng", category: "Engineering", label: "School of Chemical Engineering" },
  { value: "civil-environmental-eng", category: "Engineering", label: "School of Civil & Environmental Engineering" },
  { value: "computer-science-eng", category: "Engineering", label: "School of Computer Science & Engineering" },
  { value: "electrical-eng", category: "Engineering", label: "School of Electrical Engineering & Telecommunications" },
  { value: "mechanical-eng", category: "Engineering", label: "School of Mechanical & Manufacturing Engineering" },
  { value: "minerals-energy", category: "Engineering", label: "School of Minerals & Energy Resources Engineering" },
  { value: "photovoltaic-eng", category: "Engineering", label: "School of Photovoltaic & Renewable Energy Engineering" },

  // Law & Justice
  { value: "law", category: "Law & Justice", label: "School of Law, Society & Criminology" },
  { value: "private-commercial-law", category: "Law & Justice", label: "School of Private & Commercial Law" },
  { value: "global-public-law", category: "Law & Justice", label: "School of Global & Public Law" },

  // Medicine & Health
  { value: "clinical-medicine", category: "Medicine & Health", label: "School of Clinical Medicine" },
  { value: "biomedical-sciences", category: "Medicine & Health", label: "School of Biomedical Sciences" },
  { value: "health-sciences", category: "Medicine & Health", label: "School of Health Sciences" },
  { value: "nursing-midwifery", category: "Medicine & Health", label: "School of Nursing & Midwifery" },
  { value: "optometry-vision", category: "Medicine & Health", label: "School of Optometry & Vision Science" },
  { value: "pharmacy", category: "Medicine & Health", label: "School of Pharmacy" },
  { value: "population-health", category: "Medicine & Health", label: "School of Population Health" },
  { value: "psychology", category: "Medicine & Health", label: "School of Psychology" },
  { value: "public-health", category: "Medicine & Health", label: "School of Public Health & Community Medicine" },

  // Science
  { value: "aviation", category: "Science", label: "School of Aviation" },
  { value: "biological-earth-env", category: "Science", label: "School of Biological, Earth & Environmental Sciences" },
  { value: "biotechnology-biomolecular", category: "Science", label: "School of Biotechnology & Biomolecular Sciences" },
  { value: "chemistry", category: "Science", label: "School of Chemistry" },
  { value: "maths-statistics", category: "Science", label: "School of Mathematics & Statistics" },
  { value: "physics", category: "Science", label: "School of Physics" },
];

const CATEGORIES = [
  "Arts, Design & Architecture",
  "Business",
  "Engineering",
  "Law & Justice",
  "Medicine & Health",
  "Science",
];

interface SchoolDropdownProps {
  value: string;
  onChange: (value: string) => void;
}

export function SchoolDropdown({ value, onChange }: SchoolDropdownProps) {
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

  const selectedOption = SCHOOL_OPTIONS.find((o) => o.label === value);

  const filteredOptions = searchQuery
    ? SCHOOL_OPTIONS.filter(
        (o) =>
          o.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          o.category.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : SCHOOL_OPTIONS;

  const groupedOptions: Record<string, SchoolOption[]> = {};
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
        <span className={`text-sm truncate pr-2 ${value ? "text-gray-900" : "text-gray-400"}`}>
          {value || "Select a school..."}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {value && (
            <button
              type="button"
              className="p-0.5 rounded-full hover:bg-black/10 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
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
        <div className="absolute z-30 mt-1 w-full bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search schools..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-9 pl-8 pr-3 rounded-lg bg-[#767680]/[0.08] border-none text-sm outline-none focus:ring-1 focus:ring-[#0a84ff] placeholder:text-gray-400"
              />
            </div>
          </div>

          {/* Options */}
          <div className="max-h-64 overflow-y-auto overscroll-contain">
            {Object.keys(groupedOptions).length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-gray-400">
                No matching schools found.
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
                    const isSelected = value === option.label;
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
                          onChange(option.label);
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
        </div>
      )}
    </div>
  );
}
