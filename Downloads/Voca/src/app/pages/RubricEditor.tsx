import React, { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, useParams, useLocation } from "react-router";
import {
  Plus,
  Trash2,
  Upload,
  Download,
  Save,
  ChevronLeft,
  XSquare,
  ChevronDown,
  Search,
  Check,
  Link2,
  Unlink,
  X,
  ChevronRight,
  Calendar,
  BookOpen,
  FileText,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Card, CardContent } from "../components/ui/card";
import { toast } from "sonner";
import * as kv from "../utils/kv";
import {
  RubricMetric,
  SavedRubric,
  Assessment,
  GradeDescriptors,
  GRADE_CATEGORY_KEYS,
  GRADE_CATEGORY_LABELS,
  GRADE_CATEGORY_SHORT,
  GRADE_CATEGORY_COLORS,
  GradeCategory,
} from "../types";
import { LoadSplash } from "../components/LoadSplash";
import { slugMatch, buildRubricUrl } from "../utils/urlHelpers";
import { FormatDropdown, getFormatLabel } from "../components/FormatDropdown";

const emptyGrades = (): GradeDescriptors => ({
  highDistinction: "",
  distinction: "",
  credit: "",
  pass: "",
  fail: "",
});

export default function RubricEditor() {
  const navigate = useNavigate();
  const params = useParams<{ year?: string; term?: string; courseCode?: string; name?: string }>();
  const location = useLocation();
  const isNewMode = location.pathname === "/rubrics/new";
  const isSlugRoute = !!(params.year && params.term && params.courseCode && params.name);

  // Redirect bare /rubrics to assessments rubrics tab
  useEffect(() => {
    if (!isNewMode && !isSlugRoute) {
      navigate("/assessments?tab=rubrics", { replace: true });
    }
  }, [isNewMode, isSlugRoute, navigate]);

  const [viewMode, setViewMode] = useState<"view" | "edit" | "create">(
    isNewMode ? "create" : "view"
  );
  const [loading, setLoading] = useState(isSlugRoute);

  // --- Create flow state ---
  const [createStep, setCreateStep] = useState(1);
  const [createName, setCreateName] = useState("");
  const [createCourseName, setCreateCourseName] = useState("");
  const [createFormat, setCreateFormat] = useState("presentation");
  const [createTerm, setCreateTerm] = useState("");
  const [createYear, setCreateYear] = useState(new Date().getFullYear().toString());
  const [createMetrics, setCreateMetrics] = useState<RubricMetric[]>([]);
  const [expandedMetricId, setExpandedMetricId] = useState<string | null>(null);

  // Create flow: assessment selection
  const [createAssessments, setCreateAssessments] = useState<Assessment[]>([]);
  const [createAssessmentsLoading, setCreateAssessmentsLoading] = useState(false);
  const [showCreateAssessmentDropdown, setShowCreateAssessmentDropdown] = useState(false);
  const [createAssessmentSearch, setCreateAssessmentSearch] = useState("");
  const [selectedCreateAssessment, setSelectedCreateAssessment] = useState<Assessment | null>(null);
  const createAssessmentDropdownRef = useRef<HTMLDivElement>(null);

  // --- Existing rubric state ---
  const [rubric, setRubric] = useState<SavedRubric | null>(null);
  const [editMetrics, setEditMetrics] = useState<RubricMetric[]>([]);
  const [editName, setEditName] = useState("");
  const [editCourseName, setEditCourseName] = useState("");
  const [editFormat, setEditFormat] = useState("presentation");
  const [editTerm, setEditTerm] = useState("");
  const [editYear, setEditYear] = useState("");
  const [editExpandedMetricId, setEditExpandedMetricId] = useState<string | null>(null);

  // --- Link assessment state ---
  const [showLinkSheet, setShowLinkSheet] = useState(false);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [assessmentsLoading, setAssessmentsLoading] = useState(false);
  const [linkSearchQuery, setLinkSearchQuery] = useState("");
  const [linkedAssessment, setLinkedAssessment] = useState<Assessment | null>(null);

  // Load rubric for edit/view via slug URL params
  useEffect(() => {
    if (isSlugRoute) {
      (async () => {
        try {
          const all = (await kv.getByPrefix("CHATGPT_rubrics_")) as SavedRubric[];
          const match = all.find(
            (r) =>
              (r.year || "") === decodeURIComponent(params.year!) &&
              (r.term || "") === decodeURIComponent(params.term!) &&
              slugMatch(r.courseName || "", params.courseCode!) &&
              slugMatch(r.name || r.assessmentName || "", params.name!)
          );
          if (match) {
            setRubric(match);
            setEditName(match.name || match.assessmentName || "");
            setEditCourseName(match.courseName || "");
            setEditFormat(match.format || "presentation");
            setEditTerm(match.term || "");
            setEditYear(match.year || "");
            setEditMetrics(match.metrics || []);

            if (match.linkedAssessmentId) {
              try {
                const a = await kv.get(`CHATGPT_assessments_${match.linkedAssessmentId}`);
                if (a) setLinkedAssessment(a as Assessment);
              } catch {}
            }
          }
        } catch (err) {
          console.error("Failed to load rubric", err);
          toast.error("Failed to load rubric");
        } finally {
          setLoading(false);
        }
      })();
    }
  }, [isSlugRoute, params.year, params.term, params.courseCode, params.name]);

  // Load assessments for create flow
  useEffect(() => {
    if (isNewMode) {
      (async () => {
        setCreateAssessmentsLoading(true);
        try {
          const data = await kv.getByPrefix("CHATGPT_assessments_");
          setCreateAssessments((data || []) as Assessment[]);
        } catch (err) {
          console.error("Failed to load assessments for create", err);
        } finally {
          setCreateAssessmentsLoading(false);
        }
      })();
    }
  }, [isNewMode]);

  // Close assessment dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        createAssessmentDropdownRef.current &&
        !createAssessmentDropdownRef.current.contains(e.target as Node)
      ) {
        setShowCreateAssessmentDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filteredCreateAssessments = createAssessments.filter(
    (a) =>
      a.title.toLowerCase().includes(createAssessmentSearch.toLowerCase()) ||
      (a.courseCode || a.courseId || "").toLowerCase().includes(createAssessmentSearch.toLowerCase())
  );

  const handleSelectCreateAssessment = (assessment: Assessment) => {
    setSelectedCreateAssessment(assessment);
    setCreateName(assessment.title + " Rubric");
    setCreateCourseName(assessment.courseName || assessment.courseCode || assessment.courseId || "");
    setCreateFormat(assessment.type || "presentation");
    setCreateTerm(assessment.term || "");
    setCreateYear(assessment.year || new Date().getFullYear().toString());
    setShowCreateAssessmentDropdown(false);
    setCreateAssessmentSearch("");
  };

  const goBack = () => navigate("/assessments?tab=rubrics");

  // --- Link / Unlink helpers ---
  const loadAssessmentsForLinking = async () => {
    setAssessmentsLoading(true);
    try {
      const data = await kv.getByPrefix("CHATGPT_assessments_");
      setAssessments((data || []) as Assessment[]);
    } catch (err) {
      console.error("Failed to load assessments", err);
    } finally {
      setAssessmentsLoading(false);
    }
  };

  const openLinkSheet = () => {
    setShowLinkSheet(true);
    loadAssessmentsForLinking();
  };

  const filteredLinkAssessments = assessments.filter(
    (a) =>
      a.title.toLowerCase().includes(linkSearchQuery.toLowerCase()) ||
      (a.courseCode || a.courseId || "").toLowerCase().includes(linkSearchQuery.toLowerCase())
  );

  const handleLinkAssessment = async (assessment: Assessment) => {
    if (!rubric) return;
    try {
      const updatedRubric = { ...rubric, linkedAssessmentId: assessment.id };
      await kv.set(`CHATGPT_rubrics_${rubric.id}`, updatedRubric);
      const updatedAssessment = { ...assessment, linkedRubricId: rubric.id };
      await kv.set(`CHATGPT_assessments_${assessment.id}`, updatedAssessment);
      setRubric(updatedRubric);
      setLinkedAssessment(updatedAssessment);
      setShowLinkSheet(false);
      setLinkSearchQuery("");
      toast.success(`Linked to "${assessment.title}"`);
    } catch (err) {
      console.error("Failed to link assessment", err);
      toast.error("Failed to link assessment");
    }
  };

  const handleUnlink = async () => {
    if (!rubric || !rubric.linkedAssessmentId) return;
    try {
      const assessmentId = rubric.linkedAssessmentId;
      const updatedRubric = { ...rubric, linkedAssessmentId: null };
      await kv.set(`CHATGPT_rubrics_${rubric.id}`, updatedRubric);
      try {
        const a = await kv.get(`CHATGPT_assessments_${assessmentId}`);
        if (a) {
          const updatedA = { ...a, linkedRubricId: null };
          await kv.set(`CHATGPT_assessments_${assessmentId}`, updatedA);
        }
      } catch {}
      setRubric(updatedRubric);
      setLinkedAssessment(null);
      toast.success("Rubric unlinked from assessment");
    } catch (err) {
      console.error("Failed to unlink", err);
      toast.error("Failed to unlink");
    }
  };

  // --- Create flow handlers ---
  const addCreateMetric = () => {
    const id = `m_${Date.now()}`;
    setCreateMetrics([...createMetrics, { id, name: "", weight: 1, grades: emptyGrades() }]);
    setExpandedMetricId(id);
  };

  const updateCreateMetric = (id: string, updates: Partial<RubricMetric>) => {
    setCreateMetrics(createMetrics.map((m) => (m.id === id ? { ...m, ...updates } : m)));
  };

  const updateCreateMetricGrade = (metricId: string, category: GradeCategory, value: string) => {
    setCreateMetrics(
      createMetrics.map((m) =>
        m.id === metricId ? { ...m, grades: { ...m.grades, [category]: value } } : m
      )
    );
  };

  const removeCreateMetric = (id: string) => {
    setCreateMetrics(createMetrics.filter((m) => m.id !== id));
    if (expandedMetricId === id) setExpandedMetricId(null);
  };

  const handleCreate = async () => {
    if (!createName.trim()) {
      toast.error("Please provide a rubric name.");
      return;
    }
    if (createMetrics.length === 0) {
      toast.error("Please add at least one metric.");
      return;
    }
    try {
      const id = `rubric_${Date.now()}`;
      const linkedId = selectedCreateAssessment?.id || null;
      const newRubric: SavedRubric = {
        id,
        name: createName.trim(),
        courseName: createCourseName.trim(),
        format: createFormat,
        year: createYear,
        term: createTerm,
        metrics: createMetrics,
        items: [],
        linkedAssessmentId: linkedId,
        updatedAt: new Date().toISOString(),
      };
      await kv.set(`CHATGPT_rubrics_${id}`, newRubric);

      if (selectedCreateAssessment) {
        const updatedAssessment = { ...selectedCreateAssessment, linkedRubricId: id };
        await kv.set(`CHATGPT_assessments_${selectedCreateAssessment.id}`, updatedAssessment);
      }

      toast.success("Rubric created successfully!");
      navigate("/assessments?tab=rubrics");
    } catch (err) {
      console.error(err);
      toast.error("Failed to create rubric.");
    }
  };

  const downloadMetricTemplate = () => {
    const csvContent =
      "data:text/csv;charset=utf-8,MetricName,Weight,HD,D,C,P,F\n" +
      "\"Delivery & Presentation\",1,\"Exceptional clarity and engagement\",\"Clear and confident delivery\",\"Generally clear with minor issues\",\"Basic delivery with some hesitation\",\"Unclear or difficult to follow\"\n" +
      "\"Content & Knowledge\",2,\"Outstanding depth and insight\",\"Strong understanding demonstrated\",\"Adequate knowledge shown\",\"Basic understanding with gaps\",\"Insufficient knowledge demonstrated\"";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "rubric_metrics_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- Edit mode handlers ---
  const addEditMetric = () => {
    const id = `m_${Date.now()}`;
    setEditMetrics([...editMetrics, { id, name: "", weight: 1, grades: emptyGrades() }]);
    setEditExpandedMetricId(id);
  };

  const updateEditMetric = (id: string, updates: Partial<RubricMetric>) => {
    setEditMetrics(editMetrics.map((m) => (m.id === id ? { ...m, ...updates } : m)));
  };

  const updateEditMetricGrade = (metricId: string, category: GradeCategory, value: string) => {
    setEditMetrics(
      editMetrics.map((m) =>
        m.id === metricId ? { ...m, grades: { ...m.grades, [category]: value } } : m
      )
    );
  };

  const removeEditMetric = (id: string) => {
    setEditMetrics(editMetrics.filter((m) => m.id !== id));
    if (editExpandedMetricId === id) setEditExpandedMetricId(null);
  };

  const handleSaveEdit = async () => {
    if (!rubric) return;
    if (!editName.trim()) {
      toast.error("Please provide a rubric name.");
      return;
    }
    try {
      const updated: SavedRubric = {
        ...rubric,
        name: editName.trim(),
        assessmentName: editName.trim(),
        courseName: editCourseName.trim(),
        format: editFormat,
        year: editYear,
        term: editTerm,
        metrics: editMetrics,
        updatedAt: new Date().toISOString(),
      };
      await kv.set(`CHATGPT_rubrics_${rubric.id}`, updated);
      setRubric(updated);
      setViewMode("view");
      toast.success("Rubric saved!");
      // Update URL to reflect new rubric details
      navigate(buildRubricUrl({ year: editYear, term: editTerm, courseName: editCourseName.trim(), name: editName.trim() }), { replace: true });
    } catch (err) {
      console.error(err);
      toast.error("Failed to save rubric.");
    }
  };

  // --- CSV Import for metrics ---
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = (event.target?.result as string).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        const parseCSV = (csv: string): string[][] => {
          const rows: string[][] = [];
          let row: string[] = [];
          let current = "";
          let insideQuotes = false;
          for (let i = 0; i < csv.length; i++) {
            const ch = csv[i];
            if (insideQuotes) {
              if (ch === '"') {
                if (i + 1 < csv.length && csv[i + 1] === '"') { current += '"'; i++; } else { insideQuotes = false; }
              } else { current += ch; }
            } else {
              if (ch === '"') { insideQuotes = true; }
              else if (ch === ",") { row.push(current.trim()); current = ""; }
              else if (ch === "\n") { row.push(current.trim()); current = ""; if (row.some((c) => c.length > 0)) rows.push(row); row = []; }
              else { current += ch; }
            }
          }
          row.push(current.trim());
          if (row.some((c) => c.length > 0)) rows.push(row);
          return rows;
        };

        const allRows = parseCSV(text);
        if (allRows.length < 2) { toast.error("CSV must have a header row and at least one data row."); return; }
        const headers = allRows[0].map((h) => h.toLowerCase().replace(/[\s_-]+/g, ""));
        const dataRows = allRows.slice(1);
        const findCol = (...aliases: string[]) => {
          for (const alias of aliases) { const idx = headers.indexOf(alias.toLowerCase().replace(/[\s_-]+/g, "")); if (idx !== -1) return idx; }
          return -1;
        };
        const nameCol = findCol("metricname", "metric", "name", "criteria");
        const weightCol = findCol("weight", "w");
        const hdCol = findCol("hd", "highdistinction", "h.d.", "high distinction");
        const dCol = findCol("d", "distinction", "dist");
        const cCol = findCol("c", "credit", "cr");
        const pCol = findCol("p", "pass");
        const fCol = findCol("f", "fail");

        const imported: RubricMetric[] = dataRows.map((cols) => ({
          id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: (nameCol >= 0 ? cols[nameCol] : cols[0]) || "Untitled",
          weight: Number(weightCol >= 0 ? cols[weightCol] : cols[1]) || 1,
          grades: {
            highDistinction: (hdCol >= 0 ? cols[hdCol] : cols[2]) || "",
            distinction: (dCol >= 0 ? cols[dCol] : cols[3]) || "",
            credit: (cCol >= 0 ? cols[cCol] : cols[4]) || "",
            pass: (pCol >= 0 ? cols[pCol] : cols[5]) || "",
            fail: (fCol >= 0 ? cols[fCol] : cols[6]) || "",
          },
        }));

        if (imported.length > 0) {
          if (viewMode === "edit") { setEditMetrics(imported); } else { setCreateMetrics(imported); }
          toast.success(`Imported ${imported.length} metric(s)`);
        }
      } catch (err) { console.error("CSV parse error", err); toast.error("Failed to parse CSV."); }
      if (fileInputRef.current) fileInputRef.current.value = "";
    };
    reader.readAsText(file);
  };

  // --- Rendering ---
  if (loading) {
    return (<div className="fixed inset-0 z-40 flex items-center justify-center bg-white"><LoadSplash /></div>);
  }

  // ===========================
  //  CREATE FLOW
  // ===========================
  if (viewMode === "create") {
    return (
      <div className="flex flex-1 min-h-0 flex-col bg-white">
        <div className="flex gap-2 p-6 pb-2 items-center justify-between">
          {[1, 2].map((i) => (<div key={i} className={`h-1.5 flex-1 rounded-full ${createStep >= i ? "bg-[#0a84ff]" : "bg-gray-200"}`} />))}
        </div>
        <div className="p-6 pb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">New Rubric</h1>
            <p className="text-sm text-gray-500">{createStep === 1 ? "Select Assessment" : "Add Metrics"}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={goBack} className="h-8 w-8 text-gray-400"><XSquare className="h-5 w-5" /></Button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 space-y-4 pb-4">
          {createStep === 1 ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Select Assessment *</label>
                <div className="relative" ref={createAssessmentDropdownRef}>
                  <button type="button" onClick={() => setShowCreateAssessmentDropdown(!showCreateAssessmentDropdown)} className={`flex h-12 w-full items-center justify-between rounded-xl bg-[#767680]/[0.08] px-4 text-sm transition-all ${showCreateAssessmentDropdown ? "ring-1 ring-[#0a84ff]" : ""} ${selectedCreateAssessment ? "text-gray-900" : "text-gray-400"}`}>
                    <span className="truncate">{selectedCreateAssessment ? selectedCreateAssessment.title : "Choose an assessment..."}</span>
                    <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${showCreateAssessmentDropdown ? "rotate-180" : ""}`} />
                  </button>
                  {showCreateAssessmentDropdown && (
                    <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 rounded-xl bg-white shadow-lg border border-gray-100 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                      <div className="p-2 border-b border-gray-100">
                        <div className="flex items-center gap-2 px-3 h-10 rounded-lg bg-[#767680]/[0.06]">
                          <Search className="h-4 w-4 text-gray-400 shrink-0" />
                          <input type="text" placeholder="Search assessments..." value={createAssessmentSearch} onChange={(e) => setCreateAssessmentSearch(e.target.value)} className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400" autoFocus />
                        </div>
                      </div>
                      <div className="max-h-56 overflow-y-auto">
                        {createAssessmentsLoading ? (
                          <div className="flex justify-center py-6"><LoadSplash className="w-8 h-7" /></div>
                        ) : filteredCreateAssessments.length === 0 ? (
                          <div className="px-4 py-6 text-center text-sm text-gray-400">{createAssessments.length === 0 ? "No assessments created yet" : "No matching assessments"}</div>
                        ) : (
                          filteredCreateAssessments.map((a) => (
                            <button key={a.id} type="button" onClick={() => handleSelectCreateAssessment(a)} className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#0a84ff]/[0.06] ${selectedCreateAssessment?.id === a.id ? "bg-[#0a84ff]/[0.06]" : ""}`}>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">{a.title}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-xs text-gray-500 truncate">{a.courseCode || a.courseId}</span>
                                  {a.term && <span className="inline-flex px-1.5 py-0.5 rounded-full bg-[#34c759] text-white text-[10px] font-semibold leading-none">T{a.term}</span>}
                                  {a.year && <span className="inline-flex px-1.5 py-0.5 rounded-full bg-[#0a84ff] text-white text-[10px] font-semibold leading-none">{a.year}</span>}
                                </div>
                              </div>
                              {selectedCreateAssessment?.id === a.id && <Check className="h-4 w-4 text-[#0a84ff] shrink-0" />}
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {selectedCreateAssessment && (
                <Card className="rounded-2xl border-0 shadow-sm bg-[#767680]/[0.04]">
                  <CardContent className="p-4 space-y-3">
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Assessment Details</h3>
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-3"><div className="h-8 w-8 rounded-lg bg-[#0a84ff]/[0.1] flex items-center justify-center shrink-0"><FileText className="h-4 w-4 text-[#0a84ff]" /></div><div className="min-w-0"><p className="text-[11px] text-gray-400 font-medium">Name</p><p className="text-sm font-medium text-gray-900 truncate">{selectedCreateAssessment.title}</p></div></div>
                      <div className="flex items-center gap-3"><div className="h-8 w-8 rounded-lg bg-[#ff9f0a]/[0.1] flex items-center justify-center shrink-0"><BookOpen className="h-4 w-4 text-[#ff9f0a]" /></div><div className="min-w-0"><p className="text-[11px] text-gray-400 font-medium">Course</p><p className="text-sm font-medium text-gray-900 truncate">{selectedCreateAssessment.courseName || selectedCreateAssessment.courseCode || selectedCreateAssessment.courseId || "Not specified"}</p></div></div>
                      <div className="flex gap-4">
                        <div className="flex items-center gap-3 flex-1"><div className="h-8 w-8 rounded-lg bg-[#34c759]/[0.1] flex items-center justify-center shrink-0"><span className="text-xs font-bold text-[#34c759]">T</span></div><div><p className="text-[11px] text-gray-400 font-medium">Term</p><p className="text-sm font-medium text-gray-900">{selectedCreateAssessment.term || "—"}</p></div></div>
                        <div className="flex items-center gap-3 flex-1"><div className="h-8 w-8 rounded-lg bg-[#af52de]/[0.1] flex items-center justify-center shrink-0"><Calendar className="h-4 w-4 text-[#af52de]" /></div><div><p className="text-[11px] text-gray-400 font-medium">Due Date</p><p className="text-sm font-medium text-gray-900">{selectedCreateAssessment.date ? new Date(selectedCreateAssessment.date).toLocaleDateString() : "—"}</p></div></div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Rubric Name *</label>
                <Input placeholder="e.g. Final Presentation Rubric" value={createName} onChange={(e) => setCreateName(e.target.value)} className="h-12 rounded-xl bg-[#767680]/[0.08] border-none shadow-none focus-visible:ring-1 focus-visible:ring-[#0a84ff]" />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-[#767680]/[0.04]">
                <div className="h-7 w-7 rounded-lg bg-[#0a84ff]/[0.1] flex items-center justify-center shrink-0 mt-0.5"><BookOpen className="h-3.5 w-3.5 text-[#0a84ff]" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-600 leading-snug">Add metrics (criteria) and describe what each grade level looks like. You can also import via CSV.</p>
                  <div className="flex gap-2 mt-2.5">
                    <button onClick={downloadMetricTemplate} className="flex items-center gap-1.5 text-xs font-medium text-[#0a84ff] hover:underline"><Download className="h-3.5 w-3.5" /> Download Template</button>
                    <span className="text-gray-300">|</span>
                    <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 text-xs font-medium text-[#0a84ff] hover:underline"><Upload className="h-3.5 w-3.5" /> Import CSV</button>
                  </div>
                </div>
              </div>
              <input type="file" ref={fileInputRef} onChange={handleImportCSV} accept=".csv" className="hidden" />
              {createMetrics.map((metric, idx) => (
                <MetricCard key={metric.id} metric={metric} index={idx} expanded={expandedMetricId === metric.id} onToggleExpand={() => setExpandedMetricId(expandedMetricId === metric.id ? null : metric.id)} onUpdate={(updates) => updateCreateMetric(metric.id, updates)} onUpdateGrade={(cat, val) => updateCreateMetricGrade(metric.id, cat, val)} onRemove={() => removeCreateMetric(metric.id)} />
              ))}
              <button className="w-full border-2 border-dashed border-gray-200 rounded-2xl py-4 text-gray-500 hover:text-[#0a84ff] hover:border-[#0a84ff] hover:bg-blue-50 transition-colors flex items-center justify-center gap-2 text-sm font-medium" onClick={addCreateMetric}><Plus className="h-4 w-4" /> Add Metric</button>
            </div>
          )}
        </div>
        <div className="p-6 pt-4 bg-white border-t border-gray-100 flex gap-4 mt-auto">
          {createStep > 1 && (<Button variant="outline" className="h-12 flex-1 rounded-xl text-base" onClick={() => setCreateStep(createStep - 1)}>Back</Button>)}
          {createStep < 2 ? (
            <Button className="h-12 flex-1 rounded-xl bg-[#0a84ff] hover:bg-[#0070e0] text-base text-white" onClick={() => setCreateStep(2)} disabled={!selectedCreateAssessment || !createName.trim()}>Continue</Button>
          ) : (
            <Button className="h-12 flex-1 rounded-xl bg-[#0a84ff] hover:bg-[#0070e0] text-base text-white" onClick={handleCreate} disabled={createMetrics.length === 0 || createMetrics.some((m) => !m.name.trim())}>Create Rubric</Button>
          )}
        </div>
      </div>
    );
  }

  // ===========================
  //  VIEW MODE
  // ===========================
  if (viewMode === "view" && rubric) {
    const displayName = rubric.name || rubric.assessmentName || "Untitled Rubric";
    const metrics = rubric.metrics || [];
    return (
      <div className="flex flex-col flex-1 min-h-0 bg-[#f7f7f8]">
        <div className="bg-white sticky top-0 z-20 border-b border-gray-100 p-4 pb-3 flex items-center justify-between shadow-sm shrink-0">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="-ml-2 h-9 w-9 text-gray-500" onClick={goBack}><ChevronLeft className="h-5 w-5" /></Button>
            <h2 className="text-lg font-bold truncate">{displayName}</h2>
          </div>
          {rubric.linkedAssessmentId && linkedAssessment && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[#34c759] text-white text-[11px] font-semibold shrink-0"><Link2 className="h-3 w-3" /> Linked</span>
          )}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto pb-40">
          <div className="p-4 space-y-4">
            <Card className="rounded-2xl shadow-sm border-gray-200">
              <CardContent className="p-4 space-y-3">
                <h3 className="font-semibold text-xs text-gray-400 uppercase tracking-wider">Details</h3>
                <div className="flex flex-wrap gap-2">
                  {rubric.courseName && <span className="px-2.5 py-1 rounded-lg bg-[#ff9f0a] text-white text-xs font-medium">{rubric.courseName}</span>}
                  <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-[#0a84ff] text-xs font-medium capitalize">{getFormatLabel(rubric.format)}</span>
                  {rubric.term && <span className="px-2.5 py-1 rounded-lg bg-[#34c759] text-white text-xs font-medium">Term {rubric.term}</span>}
                  {rubric.year && <span className="px-2.5 py-1 rounded-lg bg-[#0a84ff] text-white text-xs font-medium">{rubric.year}</span>}
                </div>
                {linkedAssessment ? (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-[#34c759]/[0.08] mt-2">
                    <div className="flex items-center gap-2 min-w-0"><Link2 className="h-4 w-4 text-[#34c759] shrink-0" /><div className="min-w-0"><p className="text-xs text-gray-500">Linked Assessment</p><p className="text-sm font-medium text-gray-900 truncate">{linkedAssessment.title}</p></div></div>
                    <button onClick={handleUnlink} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"><Unlink className="h-4 w-4" /></button>
                  </div>
                ) : (
                  <div className="flex items-center p-3 rounded-xl bg-gray-50 mt-2"><Unlink className="h-4 w-4 text-gray-300 mr-2" /><p className="text-sm text-gray-400">Not linked to any assessment</p></div>
                )}
              </CardContent>
            </Card>
            <h3 className="font-semibold text-xs text-gray-400 uppercase tracking-wider pt-2">Metrics ({metrics.length})</h3>
            {metrics.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">No metrics defined yet. Edit to add metrics.</div>
            ) : (
              metrics.map((metric, idx) => (
                <Card key={metric.id} className="rounded-2xl shadow-sm border-gray-200">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between"><div><span className="text-xs text-gray-400 font-medium">Metric {idx + 1}</span><h4 className="font-semibold text-base">{metric.name || "Untitled"}</h4></div><span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-lg">Weight: {metric.weight}</span></div>
                    <div className="space-y-2">
                      {GRADE_CATEGORY_KEYS.map((cat) => (
                        <div key={cat} className="flex gap-2 items-start">
                          <span className="shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold text-white min-w-[28px] text-center" style={{ backgroundColor: GRADE_CATEGORY_COLORS[cat] }}>{GRADE_CATEGORY_SHORT[cat]}</span>
                          <p className="text-sm text-gray-600 leading-snug">{metric.grades[cat] || <span className="text-gray-300 italic">No description</span>}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-10 w-full max-w-md px-4 pointer-events-none">
          <div className="pointer-events-auto space-y-2">
            <Button onClick={() => setViewMode("edit")} className="w-full h-12 shadow-xl shadow-[#0a84ff]/20 text-white bg-[#0a84ff] hover:bg-[#0070e0] rounded-2xl text-base font-semibold transition-transform active:scale-[0.98]">Edit Rubric</Button>
            <Button onClick={rubric.linkedAssessmentId ? handleUnlink : openLinkSheet} variant="outline" className={`w-full h-12 rounded-2xl text-base font-semibold shadow-lg transition-transform active:scale-[0.98] ${rubric.linkedAssessmentId ? "border-red-200 text-red-500 hover:bg-red-50 shadow-red-100/30" : "border-[#34c759]/30 text-[#34c759] hover:bg-green-50 shadow-green-100/30"}`}>
              {rubric.linkedAssessmentId ? (<><Unlink className="h-4 w-4 mr-2" /> Unlink Assessment</>) : (<><Link2 className="h-4 w-4 mr-2" /> Link Assessment</>)}
            </Button>
          </div>
        </div>
        {showLinkSheet && (<LinkAssessmentSheet assessments={filteredLinkAssessments} loading={assessmentsLoading} searchQuery={linkSearchQuery} onSearchChange={setLinkSearchQuery} onSelect={handleLinkAssessment} onClose={() => { setShowLinkSheet(false); setLinkSearchQuery(""); }} currentLinkedId={rubric.linkedAssessmentId} />)}
      </div>
    );
  }

  // ===========================
  //  EDIT MODE
  // ===========================
  if (viewMode === "edit" && rubric) {
    return (
      <div className="flex flex-col flex-1 min-h-0 bg-[#f7f7f8]">
        <div className="bg-white sticky top-0 z-20 border-b border-gray-100 p-4 pb-3 flex items-center justify-between shadow-sm shrink-0">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="-ml-2 h-9 w-9 text-gray-500" onClick={() => setViewMode("view")}><ChevronLeft className="h-5 w-5" /></Button>
            <h2 className="text-lg font-bold">Edit Rubric</h2>
          </div>
          <div className="flex space-x-2">
            <Button variant="outline" size="sm" onClick={downloadMetricTemplate} className="h-9 text-xs rounded-xl"><Download className="h-4 w-4 mr-1.5" /> Template</Button>
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="h-9 text-xs rounded-xl"><Upload className="h-4 w-4 mr-1.5" /> Import</Button>
            <input type="file" ref={fileInputRef} onChange={handleImportCSV} accept=".csv" className="hidden" />
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto pb-28">
          <div className="p-4 space-y-6">
            <Card className="rounded-2xl shadow-sm border-gray-200">
              <CardContent className="p-4 space-y-4">
                <h3 className="font-semibold text-sm text-gray-500 uppercase tracking-wider mb-2">Details</h3>
                <div className="space-y-1.5"><label className="text-sm font-medium">Rubric Name *</label><Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="e.g. Final Presentation Rubric" className="rounded-xl border-gray-200" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5"><label className="text-sm font-medium">Course Name</label><Input value={editCourseName} onChange={(e) => setEditCourseName(e.target.value)} placeholder="e.g. INFS5997" className="rounded-xl border-gray-200" /></div>
                  <div className="space-y-1.5"><label className="text-sm font-medium">Format</label>
                    <FormatDropdown value={editFormat} onChange={(v) => setEditFormat(v)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5"><label className="text-sm font-medium">Term</label><Input value={editTerm} onChange={(e) => setEditTerm(e.target.value)} placeholder="e.g. 1" className="rounded-xl border-gray-200" /></div>
                  <div className="space-y-1.5"><label className="text-sm font-medium">Year</label><Input type="number" value={editYear} onChange={(e) => setEditYear(e.target.value)} placeholder="2026" className="rounded-xl border-gray-200" /></div>
                </div>
              </CardContent>
            </Card>
            <div className="space-y-3">
              <h3 className="font-semibold text-sm text-gray-500 uppercase tracking-wider">Metrics ({editMetrics.length})</h3>
              {editMetrics.map((metric, idx) => (
                <MetricCard key={metric.id} metric={metric} index={idx} expanded={editExpandedMetricId === metric.id} onToggleExpand={() => setEditExpandedMetricId(editExpandedMetricId === metric.id ? null : metric.id)} onUpdate={(updates) => updateEditMetric(metric.id, updates)} onUpdateGrade={(cat, val) => updateEditMetricGrade(metric.id, cat, val)} onRemove={() => removeEditMetric(metric.id)} />
              ))}
              <button className="w-full border-2 border-dashed border-gray-200 rounded-2xl py-5 text-gray-500 hover:text-[#0a84ff] hover:border-[#0a84ff] hover:bg-blue-50 transition-colors flex items-center justify-center gap-2 text-sm font-medium" onClick={addEditMetric}><Plus className="h-5 w-5" /> Add Metric</button>
            </div>
          </div>
        </div>
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-10 w-full max-w-md px-4 pointer-events-none">
          <div className="pointer-events-auto">
            <Button onClick={handleSaveEdit} className="w-full h-14 shadow-xl shadow-[#0a84ff]/20 text-white bg-[#0a84ff] hover:bg-[#0070e0] rounded-2xl text-base font-semibold transition-transform active:scale-[0.98]"><Save className="h-5 w-5 mr-2" /> Save Changes</Button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

// ===========================
//  METRIC CARD COMPONENT
// ===========================
function MetricCard({ metric, index, expanded, onToggleExpand, onUpdate, onUpdateGrade, onRemove }: {
  metric: RubricMetric; index: number; expanded: boolean; onToggleExpand: () => void;
  onUpdate: (updates: Partial<RubricMetric>) => void; onUpdateGrade: (cat: GradeCategory, val: string) => void; onRemove: () => void;
}) {
  const filledCount = GRADE_CATEGORY_KEYS.filter((k) => metric.grades[k].trim()).length;
  return (
    <Card className="rounded-2xl shadow-sm border-gray-200 overflow-hidden">
      <CardContent className="p-0">
        <button className="w-full p-4 flex items-center gap-3 text-left" onClick={onToggleExpand}>
          <div className="flex-1 min-w-0">
            <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Metric {index + 1}</span>
            <p className="text-base font-semibold text-gray-900 truncate">{metric.name || "Untitled Metric"}</p>
            <div className="flex items-center gap-2 mt-1"><span className="text-[11px] text-gray-400">Weight: {metric.weight}</span><span className="text-[11px] text-gray-400">· {filledCount}/5 grades</span></div>
          </div>
          <ChevronRight className={`h-4 w-4 text-gray-400 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`} />
        </button>
        {expanded && (
          <div className="px-4 pb-4 space-y-4 border-t border-gray-100 pt-4">
            <div className="flex gap-3">
              <div className="flex-1 space-y-1.5"><label className="text-xs font-medium text-gray-500">Metric Name *</label><Input value={metric.name} onChange={(e) => onUpdate({ name: e.target.value })} placeholder="e.g. Delivery & Presentation" className="rounded-xl border-gray-200 h-10" /></div>
              <div className="w-20 space-y-1.5"><label className="text-xs font-medium text-gray-500">Weight</label><Input type="number" value={metric.weight} onChange={(e) => onUpdate({ weight: Number(e.target.value) || 1 })} className="rounded-xl border-gray-200 h-10" /></div>
            </div>
            <div className="space-y-3">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Grade Descriptors</p>
              {GRADE_CATEGORY_KEYS.map((cat) => (
                <div key={cat} className="space-y-1">
                  <div className="flex items-center gap-2"><span className="px-1.5 py-0.5 rounded text-[10px] font-bold text-white min-w-[28px] text-center" style={{ backgroundColor: GRADE_CATEGORY_COLORS[cat] }}>{GRADE_CATEGORY_SHORT[cat]}</span><span className="text-xs font-medium text-gray-600">{GRADE_CATEGORY_LABELS[cat]}</span></div>
                  <Textarea value={metric.grades[cat]} onChange={(e) => onUpdateGrade(cat, e.target.value)} placeholder={`Describe what ${GRADE_CATEGORY_LABELS[cat]} looks like...`} className="text-sm min-h-[56px] resize-none border-gray-200 rounded-xl" />
                </div>
              ))}
            </div>
            <button className="flex items-center gap-1.5 text-xs text-red-500 font-medium mt-2 hover:underline" onClick={onRemove}><Trash2 className="h-3.5 w-3.5" /> Remove Metric</button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ===========================
//  LINK ASSESSMENT SHEET
// ===========================
function LinkAssessmentSheet({ assessments, loading, searchQuery, onSearchChange, onSelect, onClose, currentLinkedId }: {
  assessments: Assessment[]; loading: boolean; searchQuery: string; onSearchChange: (v: string) => void;
  onSelect: (a: Assessment) => void; onClose: () => void; currentLinkedId?: string | null;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-t-[20px] shadow-[0_-4px_30px_rgb(0,0,0,0.1)] animate-in slide-in-from-bottom duration-300">
        <div className="flex justify-center pt-3 pb-1"><div className="w-9 h-1 rounded-full bg-gray-300" /></div>
        <div className="flex items-center justify-between px-5 pb-3">
          <h3 className="text-lg font-semibold">Link Assessment</h3>
          <button onClick={onClose} className="h-8 w-8 rounded-full bg-[#767680]/[0.12] flex items-center justify-center"><X className="h-4 w-4 text-gray-500" /></button>
        </div>
        <div className="px-5 pb-2">
          <div className="flex items-center gap-2 px-3 h-10 rounded-xl bg-[#767680]/[0.08]">
            <Search className="h-4 w-4 text-gray-400 shrink-0" />
            <input type="text" placeholder="Search assessments..." value={searchQuery} onChange={(e) => onSearchChange(e.target.value)} className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400" autoFocus />
          </div>
        </div>
        <div className="max-h-[50vh] overflow-y-auto px-2 pb-8">
          {loading ? (
            <div className="flex justify-center py-8"><LoadSplash className="w-8 h-7" /></div>
          ) : assessments.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">No assessments found</div>
          ) : (
            assessments.map((a) => (
              <button key={a.id} type="button" onClick={() => onSelect(a)} className={`flex w-full items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors hover:bg-[#0a84ff]/[0.06] ${currentLinkedId === a.id ? "bg-[#34c759]/[0.06]" : ""}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{a.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-500 truncate">{a.courseCode || a.courseId}</span>
                    {a.term && <span className="inline-flex px-1.5 py-0.5 rounded-full bg-[#34c759] text-white text-[10px] font-semibold leading-none">T{a.term}</span>}
                    {a.year && <span className="inline-flex px-1.5 py-0.5 rounded-full bg-[#0a84ff] text-white text-[10px] font-semibold leading-none">{a.year}</span>}
                    {a.linkedRubricId && <span className="inline-flex px-1.5 py-0.5 rounded-full bg-[#ff9f0a] text-white text-[10px] font-semibold leading-none">Has Rubric</span>}
                  </div>
                </div>
                {currentLinkedId === a.id && <Check className="h-4 w-4 text-[#34c759] shrink-0" />}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}