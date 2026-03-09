import React, { useEffect, useState, useRef, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  Plus,
  Search,
  Calendar,
  Users,
  Activity,
  Upload,
  Download,
  FileSpreadsheet,
  Trash2,
  CheckSquare,
  XSquare,
  MoreVertical,
  AlignLeft,
  BookOpen,
  Filter,
  X,
  ArrowUpDown,
  Link2,
} from "lucide-react";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { SearchInput } from "../components/ui/search-input";
import { Button } from "../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import { toast } from "sonner";
import * as kv from "../utils/kv";
import { Assessment, SavedRubric } from "../types";
import { LoadSplash } from "../components/LoadSplash";
import { buildAssessmentUrl, buildRubricUrl } from "../utils/urlHelpers";
import { getFormatLabel } from "../components/FormatDropdown";

type Tab = "assessments" | "rubrics";

export default function Dashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") === "rubrics" ? "rubrics" : "assessments";
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  // Assessments state
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [assessmentsLoading, setAssessmentsLoading] = useState(true);
  const [assessmentSearch, setAssessmentSearch] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingImports, setPendingImports] = useState<Partial<Assessment>[] | null>(null);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Rubrics state
  const [rubrics, setRubrics] = useState<SavedRubric[]>([]);
  const [rubricsLoading, setRubricsLoading] = useState(true);
  const [rubricSearch, setRubricSearch] = useState("");

  // Quick delete state
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; type: "assessment" | "rubric"; name: string } | null>(null);

  // Filter & Sort state
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [filterYear, setFilterYear] = useState<string>("all");
  const [filterTerm, setFilterTerm] = useState<string>("all");
  const [filterSubject, setFilterSubject] = useState<string>("all");
  const [filterFormat, setFilterFormat] = useState<string>("all");
  const [filterLinked, setFilterLinked] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"default" | "alpha-asc" | "alpha-desc" | "date-newest" | "date-oldest">("default");

  // Derived filter options
  const assessmentFilterOptions = useMemo(() => {
    const years = [...new Set(assessments.map(a => a.year).filter(Boolean))].sort((a, b) => (b || "").localeCompare(a || ""));
    const terms = [...new Set(assessments.map(a => a.term).filter(Boolean))].sort();
    const subjects = [...new Set(assessments.map(a => (a.courseCode || a.courseId || "").replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 4)).filter(s => s.length >= 2))].sort();
    return { years: years as string[], terms: terms as string[], subjects: subjects as string[] };
  }, [assessments]);

  const rubricFilterOptions = useMemo(() => {
    const years = [...new Set(rubrics.map(r => r.year).filter(Boolean))].sort((a, b) => b.localeCompare(a));
    const terms = [...new Set(rubrics.map(r => r.term).filter(Boolean))].sort();
    const formats = [...new Set(rubrics.map(r => r.format).filter(Boolean))].sort();
    return { years, terms, formats };
  }, [rubrics]);

  const activeFilterCount = activeTab === "assessments"
    ? [filterYear !== "all", filterTerm !== "all", filterSubject !== "all", filterLinked !== "all", sortBy !== "default"].filter(Boolean).length
    : [filterYear !== "all", filterTerm !== "all", filterFormat !== "all", filterLinked !== "all", sortBy !== "default"].filter(Boolean).length;

  const clearAllFilters = () => {
    setFilterYear("all");
    setFilterTerm("all");
    setFilterSubject("all");
    setFilterFormat("all");
    setFilterLinked("all");
    setSortBy("default");
  };

  const switchTab = (tab: Tab) => {
    setActiveTab(tab);
    setSearchParams(tab === "rubrics" ? { tab: "rubrics" } : {});
    // Reset selection mode and filters when switching
    setIsSelectionMode(false);
    setSelectedIds(new Set());
    clearAllFilters();
  };

  // Load assessments
  const loadAssessments = async () => {
    try {
      setAssessmentsLoading(true);
      const data = await kv.getByPrefix("CHATGPT_assessments_");
      setAssessments(data as Assessment[]);
    } catch (err) {
      console.error("Failed to load assessments", err);
    } finally {
      setAssessmentsLoading(false);
    }
  };

  // Load rubrics
  const loadRubrics = async () => {
    setRubricsLoading(true);
    try {
      const data = await kv.getByPrefix("CHATGPT_rubrics_");
      if (data && data.length > 0) {
        setRubrics(data as SavedRubric[]);
      } else {
        const globalData = await kv.get("CHATGPT_rubrics_global");
        if (globalData && Array.isArray(globalData)) {
          const legacyRubric: SavedRubric = {
            id: `rubric_${Date.now()}`,
            name: "Legacy Global Rubric",
            assessmentName: "Legacy Global Rubric",
            courseName: "General",
            format: "presentation",
            year: new Date().getFullYear().toString(),
            term: "1",
            metrics: [],
            items: globalData,
            updatedAt: new Date().toISOString(),
          };
          setRubrics([legacyRubric]);
          await kv.set(`CHATGPT_rubrics_${legacyRubric.id}`, legacyRubric);
        } else {
          setRubrics([]);
        }
      }
    } catch (err) {
      console.error("Failed to load rubrics", err);
    } finally {
      setRubricsLoading(false);
    }
  };

  useEffect(() => {
    loadAssessments();
    loadRubrics();
  }, []);

  // Assessment helpers
  const downloadTemplate = () => {
    const csvContent =
      "data:text/csv;charset=utf-8,AssessmentName,CourseCode,Term\nFinal Debate,CS101,Fall\nPresentation 1,ENG202,Spring";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "assessments_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const rows = text
          .split("\n")
          .map((row) => row.trim())
          .filter((row) => row.length > 0);
        const dataRows = rows.slice(1);
        const pending: Partial<Assessment>[] = [];
        for (const row of dataRows) {
          const cols = row.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
          if (cols.length >= 1 && cols[0]) {
            const id = crypto.randomUUID();
            const date = new Date().toISOString().split("T")[0];
            pending.push({
              id,
              title: cols[0],
              courseId: cols[1] || "",
              term: cols[2] || "",
              year: new Date(date).getFullYear().toString(),
              type: "presentation",
              date: date,
              status: "draft",
              students: [],
              rubric: [],
            });
          }
        }
        if (pending.length > 0) {
          setPendingImports(pending);
        } else {
          toast.error("No valid assessments found in CSV.");
        }
      } catch (err) {
        console.error("Failed to parse CSV", err);
        toast.error("Failed to parse the CSV file.");
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    };
    reader.readAsText(file);
  };

  const downloadAllAssessments = () => {
    if (assessments.length === 0) {
      toast.error("No assessments to export.");
      return;
    }
    const headers = [
      "Title",
      "Course Code",
      "Term",
      "Year",
      "Type",
      "Date",
      "Status",
      "Participants",
      "Rubric Items",
    ];
    const rows = assessments.map((a) => [
      `"${a.title.replace(/"/g, '""')}"`,
      `"${a.courseId.replace(/"/g, '""')}"`,
      `"${(a.term || "").replace(/"/g, '""')}"`,
      a.year,
      a.type,
      a.date,
      a.status,
      a.students?.length || 0,
      a.rubric?.length || 0,
    ]);
    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `all_assessments_${new Date().toISOString().split("T")[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Assessments exported successfully");
  };

  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    setSelectedIds(new Set());
  };

  const toggleSelection = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const deleteSelected = async () => {
    if (selectedIds.size === 0) return;
    try {
      for (const id of selectedIds) {
        await kv.del(`CHATGPT_assessments_${id}`);
      }
      toast.success(`Successfully deleted ${selectedIds.size} assessment(s)`);
      setIsSelectionMode(false);
      setSelectedIds(new Set());
      loadAssessments();
    } catch (err) {
      console.error("Failed to delete assessments", err);
      toast.error("Failed to delete selected assessments");
    } finally {
      setShowDeleteConfirm(false);
    }
  };

  const filteredAssessments = useMemo(() => {
    let result = assessments.filter((a) =>
      a.title.toLowerCase().includes(assessmentSearch.toLowerCase()) ||
      (a.courseCode || a.courseId || "").toLowerCase().includes(assessmentSearch.toLowerCase())
    );
    if (filterYear !== "all") result = result.filter(a => a.year === filterYear);
    if (filterTerm !== "all") result = result.filter(a => a.term === filterTerm);
    if (filterSubject !== "all") result = result.filter(a => (a.courseCode || a.courseId || "").replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 4) === filterSubject);
    if (filterLinked === "linked") result = result.filter(a => !!a.linkedRubricId);
    if (filterLinked === "unlinked") result = result.filter(a => !a.linkedRubricId);
    switch (sortBy) {
      case "alpha-asc": result = [...result].sort((a, b) => a.title.localeCompare(b.title)); break;
      case "alpha-desc": result = [...result].sort((a, b) => b.title.localeCompare(a.title)); break;
      case "date-newest": result = [...result].sort((a, b) => (b.date || "").localeCompare(a.date || "")); break;
      case "date-oldest": result = [...result].sort((a, b) => (a.date || "").localeCompare(b.date || "")); break;
    }
    return result;
  }, [assessments, assessmentSearch, filterYear, filterTerm, filterSubject, filterLinked, sortBy]);

  const filteredRubrics = useMemo(() => {
    let result = rubrics.filter(
      (r) =>
        (r.name || r.assessmentName || "").toLowerCase().includes(rubricSearch.toLowerCase()) ||
        r.courseName.toLowerCase().includes(rubricSearch.toLowerCase())
    );
    if (filterYear !== "all") result = result.filter(r => r.year === filterYear);
    if (filterTerm !== "all") result = result.filter(r => r.term === filterTerm);
    if (filterFormat !== "all") result = result.filter(r => r.format === filterFormat);
    if (filterLinked === "linked") result = result.filter(r => !!r.linkedAssessmentId);
    if (filterLinked === "unlinked") result = result.filter(r => !r.linkedAssessmentId);
    switch (sortBy) {
      case "alpha-asc": result = [...result].sort((a, b) => (a.name || a.assessmentName || "").localeCompare(b.name || b.assessmentName || "")); break;
      case "alpha-desc": result = [...result].sort((a, b) => (b.name || b.assessmentName || "").localeCompare(a.name || a.assessmentName || "")); break;
      case "date-newest": result = [...result].sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || "")); break;
      case "date-oldest": result = [...result].sort((a, b) => (a.updatedAt || "").localeCompare(b.updatedAt || "")); break;
    }
    return result;
  }, [rubrics, rubricSearch, filterYear, filterTerm, filterFormat, filterLinked, sortBy]);

  // Quick delete handler
  const handleQuickDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === "assessment") {
        await kv.del(`CHATGPT_assessments_${deleteTarget.id}`);
        toast.success("Assessment deleted");
        loadAssessments();
      } else {
        await kv.del(`CHATGPT_rubrics_${deleteTarget.id}`);
        toast.success("Rubric deleted");
        loadRubrics();
      }
    } catch (err) {
      console.error("Failed to delete", err);
      toast.error("Failed to delete");
    } finally {
      setDeleteTarget(null);
    }
  };

  // Pending import view
  if (pendingImports) {
    return (
      <div className="flex flex-1 min-h-0 flex-col bg-white">
        <div className="flex flex-col p-6 pb-4 gap-2">
          <h1 className="text-2xl font-bold tracking-tight">Complete Import</h1>
          <p className="text-sm text-gray-500">
            Please fill in the due date and format type for each uploaded assessment. The year
            will be extracted from your selected date automatically.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 space-y-4 pb-20">
          {pendingImports.map((item, index) => (
            <div
              key={item.id}
              className="bg-gray-50 border border-gray-100 rounded-2xl p-5 space-y-4"
            >
              <div>
                <h3 className="font-semibold text-gray-900">{item.title}</h3>
                <p className="text-sm text-gray-500">
                  {item.courseCode || item.courseId} • {item.term}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700">Due Date</label>
                  <Input
                    type="date"
                    className="h-11 rounded-xl bg-white"
                    value={item.date}
                    onChange={(e) => {
                      const newPending = [...pendingImports];
                      newPending[index].date = e.target.value;
                      if (e.target.value) {
                        newPending[index].year = new Date(e.target.value)
                          .getFullYear()
                          .toString();
                      }
                      setPendingImports(newPending);
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700">Type</label>
                  <select
                    className="flex h-11 w-full rounded-xl border border-input bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff]"
                    value={item.type}
                    onChange={(e) => {
                      const newPending = [...pendingImports];
                      newPending[index].type = e.target.value as any;
                      setPendingImports(newPending);
                    }}
                  >
                    <option value="presentation">Presentation</option>
                    <option value="debate">Debate</option>
                    <option value="viva">Viva / Q&A</option>
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="p-6 pt-4 bg-white border-t border-gray-100 flex gap-4">
          <Button
            variant="outline"
            className="w-1/3 h-12 rounded-xl text-base"
            onClick={() => setPendingImports(null)}
          >
            Cancel
          </Button>
          <Button
            className="flex-1 h-12 rounded-xl text-base shadow-md shadow-blue-500/20"
            onClick={async () => {
              for (const item of pendingImports) {
                if (item.date)
                  item.year = new Date(item.date).getFullYear().toString();
                await kv.set(
                  `CHATGPT_assessments_${item.id}`,
                  item as Assessment
                );
              }
              toast.success(
                `Successfully imported ${pendingImports.length} assessments`
              );
              setPendingImports(null);
              loadAssessments();
            }}
          >
            Save Assessments
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col bg-[#f7f7f8]">
      {/* Sticky header area */}
      <div className="shrink-0 px-4 pt-4 pb-2 space-y-4 bg-[#f7f7f8]">
        {/* Segmented Control */}
        <div className="flex bg-[#767680]/[0.08] p-[3px] rounded-[10px] w-full mt-1">
          <button
            onClick={() => switchTab("assessments")}
            className={`flex-1 py-[7px] text-[13px] font-semibold rounded-[8px] transition-all ${
              activeTab === "assessments"
                ? "bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.06)] text-gray-900"
                : "text-gray-500"
            }`}
          >
            Assessments
          </button>
          <button
            onClick={() => switchTab("rubrics")}
            className={`flex-1 py-[7px] text-[13px] font-semibold rounded-[8px] transition-all ${
              activeTab === "rubrics"
                ? "bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.06)] text-gray-900"
                : "text-gray-500"
            }`}
          >
            Rubrics
          </button>
        </div>

        {/* Title row + actions */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight text-[#0F172A]">
            {activeTab === "assessments" ? "Assessments" : "Rubrics"}
          </h1>
          <div className="flex gap-2">
            {activeTab === "assessments" ? (
              <>
                {isSelectionMode ? (
                  <>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setShowDeleteConfirm(true)}
                      disabled={selectedIds.size === 0}
                      title="Delete Selected"
                      className={`h-9 w-9 rounded-full bg-white shadow-sm border-gray-200 ${
                        selectedIds.size > 0
                          ? "text-red-500 hover:text-red-600"
                          : "text-gray-300"
                      }`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={toggleSelectionMode}
                      title="Cancel Selection"
                      className="h-9 w-9 rounded-full bg-white shadow-sm border-gray-200 text-gray-500"
                    >
                      <XSquare className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 rounded-full bg-white shadow-sm border-gray-200 text-gray-500 hover:bg-gray-50"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56 rounded-xl">
                        <DropdownMenuItem
                          onClick={toggleSelectionMode}
                          className="gap-2 cursor-pointer py-2"
                        >
                          <CheckSquare className="h-4 w-4" />
                          <span>Select Assessments</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => fileInputRef.current?.click()}
                          className="gap-2 cursor-pointer py-2"
                        >
                          <Upload className="h-4 w-4" />
                          <span>Bulk Import</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={downloadTemplate}
                          className="gap-2 cursor-pointer py-2"
                        >
                          <FileSpreadsheet className="h-4 w-4 text-[#0a84ff]" />
                          <span>Download Template</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={downloadAllAssessments}
                          className="gap-2 cursor-pointer py-2"
                        >
                          <Download className="h-4 w-4" />
                          <span>Export All</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleImport}
                      accept=".csv"
                      className="hidden"
                    />
                    <button
                      onClick={() => navigate("/assessments/new")}
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0a84ff] hover:bg-[#0070e0] text-white shadow-md active:scale-95 transition-all"
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                  </>
                )}
              </>
            ) : (
              <button
                onClick={() => navigate("/rubrics/new")}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0a84ff] hover:bg-[#0070e0] text-white shadow-md active:scale-95 transition-all"
              >
                <Plus className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        {/* Search + Filter */}
        <div className="flex items-center gap-2">
          <SearchInput
            containerClassName="flex-1"
            placeholder="Search..."
            value={activeTab === "assessments" ? assessmentSearch : rubricSearch}
            onChange={(e) =>
              activeTab === "assessments"
                ? setAssessmentSearch(e.target.value)
                : setRubricSearch(e.target.value)
            }
          />
          <button
            onClick={() => setShowFilterSheet(true)}
            className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] transition-colors ${
              activeFilterCount > 0
                ? 'bg-[#0a84ff] text-white'
                : 'bg-[#767680]/[0.12] text-gray-500'
            }`}
          >
            <Filter className="h-4 w-4" />
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Active filter chips */}
        {activeFilterCount > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
            {filterYear !== "all" && (
              <button
                onClick={() => setFilterYear("all")}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[#0a84ff] text-white whitespace-nowrap"
              >
                {filterYear}
                <X className="h-3 w-3" />
              </button>
            )}
            {filterTerm !== "all" && (
              <button
                onClick={() => setFilterTerm("all")}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[#34c759] text-white whitespace-nowrap"
              >
                Term {filterTerm}
                <X className="h-3 w-3" />
              </button>
            )}
            {activeTab === "assessments" && filterSubject !== "all" && (
              <button
                onClick={() => setFilterSubject("all")}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[#ff9f0a] text-white whitespace-nowrap"
              >
                {filterSubject}
                <X className="h-3 w-3" />
              </button>
            )}
            {activeTab === "rubrics" && filterFormat !== "all" && (
              <button
                onClick={() => setFilterFormat("all")}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[#ff9f0a] text-white whitespace-nowrap"
              >
                {getFormatLabel(filterFormat)}
                <X className="h-3 w-3" />
              </button>
            )}
            {filterLinked !== "all" && (
              <button
                onClick={() => setFilterLinked("all")}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[#34c759] text-white whitespace-nowrap"
              >
                {filterLinked === "linked" ? "Linked" : "Unlinked"}
                <X className="h-3 w-3" />
              </button>
            )}
            {sortBy !== "default" && (
              <button
                onClick={() => setSortBy("default")}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[#af52de] text-white whitespace-nowrap"
              >
                <ArrowUpDown className="h-3 w-3" />
                {sortBy === "alpha-asc" ? "A → Z" : sortBy === "alpha-desc" ? "Z → A" : sortBy === "date-newest" ? "Newest" : "Oldest"}
                <X className="h-3 w-3" />
              </button>
            )}
            <button
              onClick={clearAllFilters}
              className="text-xs text-gray-400 font-medium whitespace-nowrap underline"
            >
              Clear all
            </button>
          </div>
        )}

        {/* Results count */}
        {activeFilterCount > 0 && (
          <p className="text-xs text-gray-400 font-medium">
            {activeTab === "assessments" ? filteredAssessments.length : filteredRubrics.length} result{(activeTab === "assessments" ? filteredAssessments.length : filteredRubrics.length) !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* Content area */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-6">
        {activeTab === "assessments" ? (
          <div className="space-y-3 pt-2">
            {assessmentsLoading ? (
              <div className="fixed inset-0 z-40 flex items-center justify-center">
                <LoadSplash />
              </div>
            ) : filteredAssessments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center text-gray-500 bg-[#767680]/[0.04] rounded-2xl">
                <div className="h-12 w-12 rounded-xl bg-[#767680]/[0.08] flex items-center justify-center mb-3">
                  <Calendar className="h-6 w-6 text-gray-400" />
                </div>
                <p className="text-base font-semibold text-gray-900">
                  No assessments found
                </p>
                <p className="text-sm mt-1 text-gray-500">
                  Create one to get started.
                </p>
              </div>
            ) : (
              filteredAssessments.map((item) => (
                <Card
                  key={item.id}
                  className={`border-0 shadow-sm rounded-2xl cursor-pointer active:scale-[0.98] transition-all ${
                    isSelectionMode && selectedIds.has(item.id)
                      ? "ring-2 ring-[#0a84ff] ring-offset-1 bg-blue-50/30"
                      : "bg-white hover:shadow-md"
                  }`}
                  onClick={() => {
                    if (isSelectionMode) {
                      const e = new MouseEvent("click") as any;
                      toggleSelection(item.id, e);
                    } else {
                      navigate(buildAssessmentUrl(item));
                    }
                  }}
                >
                  <CardContent className="p-4 flex flex-col gap-3 relative">
                    {isSelectionMode && (
                      <div className="absolute top-4 left-4">
                        <div
                          className={`h-5 w-5 rounded-full flex items-center justify-center border ${
                            selectedIds.has(item.id)
                              ? "bg-[#0a84ff] border-[#0a84ff] text-white"
                              : "border-gray-300 bg-white"
                          }`}
                        >
                          {selectedIds.has(item.id) && (
                            <CheckSquare className="h-3 w-3" />
                          )}
                        </div>
                      </div>
                    )}
                    <div
                      className={`flex justify-between items-start ${
                        isSelectionMode ? "pl-8" : ""
                      }`}
                    >
                      <div>
                        <h3 className="font-semibold text-lg leading-tight">
                          {item.title}
                        </h3>
                        <p className="text-sm text-gray-500">
                          {item.courseCode || item.courseId}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium ${
                            item.linkedRubricId
                              ? "bg-[#34c759]/10 text-[#34c759]"
                              : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          <Link2 className="h-3 w-3" />
                          {item.linkedRubricId ? "Linked" : "Unlinked"}
                        </div>
                      </div>
                    </div>
                    <div
                      className={`flex items-center gap-3 ${
                        isSelectionMode ? "pl-8" : ""
                      }`}
                    >
                      {item.term && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#34c759] text-white text-[11px] font-semibold">
                          Term {item.term}
                        </span>
                      )}
                      {item.year && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#0a84ff] text-white text-[11px] font-semibold">
                          {item.year}
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-xs text-gray-400 ml-auto">
                        <Users className="h-3.5 w-3.5" />
                        {item.students?.length || 0}
                      </span>
                      {!isSelectionMode && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget({ id: item.id, type: "assessment", name: item.title });
                          }}
                          className="ml-1 p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 active:scale-90 transition-all"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        ) : (
          /* Rubrics Tab */
          <div className="space-y-3 pt-2">
            {rubricsLoading ? (
              <div className="fixed inset-0 z-40 flex items-center justify-center">
                <LoadSplash />
              </div>
            ) : filteredRubrics.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center text-gray-500 bg-[#767680]/[0.04] rounded-2xl">
                <div className="h-12 w-12 rounded-xl bg-[#767680]/[0.08] flex items-center justify-center mb-3">
                  <AlignLeft className="h-6 w-6 text-gray-400" />
                </div>
                <p className="text-base font-semibold text-gray-900">
                  No rubrics found
                </p>
                <p className="text-sm mt-1 text-gray-500">
                  Create one to get started.
                </p>
              </div>
            ) : (
              filteredRubrics.map((rubric) => (
                <Card
                  key={rubric.id}
                  className="border-0 shadow-sm rounded-2xl cursor-pointer active:scale-[0.98] transition-all bg-white hover:shadow-md"
                  onClick={() => navigate(buildRubricUrl(rubric))}
                >
                  <CardContent className="p-4 flex flex-col gap-2.5">
                    {/* Row 1: Title + Linked / Format chips */}
                    <div className="flex items-start gap-2">
                      <h3 className="font-semibold text-lg leading-tight">
                        {rubric.name || rubric.assessmentName}
                      </h3>
                      <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${
                            rubric.linkedAssessmentId
                              ? "bg-[#34c759]/10 text-[#34c759]"
                              : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          <Link2 className="h-3 w-3" />
                          {rubric.linkedAssessmentId ? "Linked" : "Unlinked"}
                        </span>
                        <span className="text-xs font-medium bg-[#ff9f0a] text-white px-2 py-0.5 rounded-md">
                          {getFormatLabel(rubric.format)}
                        </span>
                      </div>
                    </div>
                    {/* Row 2: Course name */}
                    <p className="text-sm text-gray-500 leading-snug">
                      {rubric.courseName || "No course"}
                    </p>
                    {/* Row 3: Term/Year chips + metrics + delete */}
                    <div className="flex items-center gap-2">
                      {rubric.term && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#34c759] text-white text-[11px] font-semibold">
                          Term {rubric.term}
                        </span>
                      )}
                      {rubric.year && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#0a84ff] text-white text-[11px] font-semibold">
                          {rubric.year}
                        </span>
                      )}
                      <span className="text-xs text-gray-400 ml-auto">
                        {(rubric.metrics || []).length || rubric.items?.length || 0} {(rubric.metrics || []).length ? "metrics" : "criteria"}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget({ id: rubric.id, type: "rubric", name: rubric.name || rubric.assessmentName || "" });
                        }}
                        className="ml-1 p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 active:scale-90 transition-all"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}
      </div>

      {/* Quick delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.12)] border-0 w-[90%] max-w-[400px]">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleteTarget?.type === "assessment" ? "Assessment" : "Rubric"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteTarget?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-center flex-row gap-2 pt-2">
            <AlertDialogCancel className="flex-1 mt-0 rounded-xl h-11">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleQuickDelete}
              className="flex-1 bg-red-500 hover:bg-red-600 text-white rounded-xl h-11"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.12)] border-0 w-[90%] max-w-[400px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Assessments</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedIds.size} selected assessment(s)?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-center flex-row gap-2 pt-2">
            <AlertDialogCancel className="flex-1 mt-0 rounded-xl h-11">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteSelected}
              className="flex-1 bg-red-500 hover:bg-red-600 text-white rounded-xl h-11"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* iOS-style Filter Bottom Sheet */}
      {showFilterSheet && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div 
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setShowFilterSheet(false)}
          />
          <div className="relative w-full max-w-lg bg-white rounded-t-[20px] shadow-[0_-4px_30px_rgb(0,0,0,0.1)] animate-in slide-in-from-bottom duration-300">
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-9 h-1 rounded-full bg-gray-300" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pb-3">
              <h3 className="text-lg font-semibold">Filter & Sort</h3>
              <button 
                onClick={() => setShowFilterSheet(false)}
                className="h-8 w-8 rounded-full bg-[#767680]/[0.12] flex items-center justify-center"
              >
                <X className="h-4 w-4 text-gray-500" />
              </button>
            </div>

            <div className="px-5 pb-8 space-y-5 max-h-[60vh] overflow-y-auto">
              {/* Year */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-500 uppercase tracking-wide">Year</label>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setFilterYear("all")}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      filterYear === "all" ? "bg-[#0a84ff] text-white" : "bg-[#767680]/[0.08] text-gray-700"
                    }`}
                  >
                    All
                  </button>
                  {(activeTab === "assessments" ? assessmentFilterOptions.years : rubricFilterOptions.years).map(y => (
                    <button
                      key={y}
                      onClick={() => setFilterYear(y)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                        filterYear === y ? "bg-[#0a84ff] text-white" : "bg-[#767680]/[0.08] text-gray-700"
                      }`}
                    >
                      {y}
                    </button>
                  ))}
                </div>
              </div>

              {/* Term */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-500 uppercase tracking-wide">Term</label>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setFilterTerm("all")}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      filterTerm === "all" ? "bg-[#34c759] text-white" : "bg-[#767680]/[0.08] text-gray-700"
                    }`}
                  >
                    All
                  </button>
                  {(activeTab === "assessments" ? assessmentFilterOptions.terms : rubricFilterOptions.terms).map(t => (
                    <button
                      key={t}
                      onClick={() => setFilterTerm(t)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                        filterTerm === t ? "bg-[#34c759] text-white" : "bg-[#767680]/[0.08] text-gray-700"
                      }`}
                    >
                      Term {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Subject Code (Assessments) or Format (Rubrics) */}
              {activeTab === "assessments" ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-500 uppercase tracking-wide">Subject Code</label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setFilterSubject("all")}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                        filterSubject === "all" ? "bg-[#ff9f0a] text-white" : "bg-[#767680]/[0.08] text-gray-700"
                      }`}
                    >
                      All
                    </button>
                    {assessmentFilterOptions.subjects.map(s => (
                      <button
                        key={s}
                        onClick={() => setFilterSubject(s)}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                          filterSubject === s ? "bg-[#ff9f0a] text-white" : "bg-[#767680]/[0.08] text-gray-700"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-500 uppercase tracking-wide">Format</label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setFilterFormat("all")}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                        filterFormat === "all" ? "bg-[#ff9f0a] text-white" : "bg-[#767680]/[0.08] text-gray-700"
                      }`}
                    >
                      All
                    </button>
                    {rubricFilterOptions.formats.map(f => (
                      <button
                        key={f}
                        onClick={() => setFilterFormat(f)}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                          filterFormat === f ? "bg-[#ff9f0a] text-white" : "bg-[#767680]/[0.08] text-gray-700"
                        }`}
                      >
                        {getFormatLabel(f)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Linked / Unlinked filter (both tabs) */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-500 uppercase tracking-wide">Link Status</label>
                <div className="flex flex-wrap gap-2">
                  {([
                    { value: "all", label: "All" },
                    { value: "linked", label: "Linked" },
                    { value: "unlinked", label: "Unlinked" },
                  ] as const).map(option => (
                    <button
                      key={option.value}
                      onClick={() => setFilterLinked(option.value)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                        filterLinked === option.value ? "bg-[#34c759] text-white" : "bg-[#767680]/[0.08] text-gray-700"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sort */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-500 uppercase tracking-wide">Sort By</label>
                <div className="flex flex-wrap gap-2">
                  {([
                    { value: "default", label: "Default" },
                    { value: "alpha-asc", label: "A → Z" },
                    { value: "alpha-desc", label: "Z → A" },
                    { value: "date-newest", label: "Newest First" },
                    { value: "date-oldest", label: "Oldest First" },
                  ] as const).map(option => (
                    <button
                      key={option.value}
                      onClick={() => setSortBy(option.value)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                        sortBy === option.value ? "bg-[#af52de] text-white" : "bg-[#767680]/[0.08] text-gray-700"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { clearAllFilters(); setShowFilterSheet(false); }}
                  className="flex-1 h-11 rounded-xl bg-[#767680]/[0.08] text-gray-700 font-medium text-sm"
                >
                  Reset All
                </button>
                <button
                  onClick={() => setShowFilterSheet(false)}
                  className="flex-1 h-11 rounded-xl bg-[#0a84ff] text-white font-medium text-sm"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}