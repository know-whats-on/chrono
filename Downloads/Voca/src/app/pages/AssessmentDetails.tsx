import React, { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router";
import * as kv from "../utils/kv";
import { Assessment, SavedRubric, RubricItem, Course, isGroupAssessment } from "../types";
import { slugMatch, buildAssessmentUrl, buildRubricUrl } from "../utils/urlHelpers";
import { getFormatLabel, FormatDropdown } from "../components/FormatDropdown";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import {
  FileText,
  Calendar,
  CheckCircle,
  Link2,
  Search,
  Check,
  X,
  Unlink,
  Eye,
  Trash2,
  Mic,
  XSquare,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { LoadSplash } from "../components/LoadSplash";
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

export default function AssessmentDetails() {
  const { year, term, courseCode, name: nameSlug } = useParams();
  const navigate = useNavigate();
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [savedRubrics, setSavedRubrics] = useState<SavedRubric[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);

  // Edit mode
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editCourseId, setEditCourseId] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editType, setEditType] = useState("");
  const [editStatus, setEditStatus] = useState<"draft" | "active" | "completed">("draft");

  // Link rubric state
  const [showLinkRubricSheet, setShowLinkRubricSheet] = useState(false);
  const [linkSearchQuery, setLinkSearchQuery] = useState("");
  const [linkedRubric, setLinkedRubric] = useState<SavedRubric | null>(null);

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const load = async () => {
    if (!year || !term || !courseCode || !nameSlug) return;
    try {
      const [all, rubrics, courseData] = await Promise.all([
        kv.getByPrefix("CHATGPT_assessments_"),
        kv.getByPrefix("CHATGPT_rubrics_"),
        kv.getByPrefix("CHATGPT_courses_"),
      ]);
      const assessments = all as Assessment[];
      setSavedRubrics(rubrics as SavedRubric[]);
      setCourses(courseData as Course[]);

      const match = assessments.find(
        (a) =>
          (a.year || "") === decodeURIComponent(year) &&
          (a.term || "") === decodeURIComponent(term) &&
          (a.courseCode || a.courseId || "") === decodeURIComponent(courseCode) &&
          slugMatch(a.title, nameSlug)
      );
      setAssessment(match || null);

      if (match) {
        setEditTitle(match.title);
        setEditCourseId(match.courseId || "");
        setEditDate(match.date || "");
        setEditType(match.type || "");
        setEditStatus(match.status || "draft");

        if (match.linkedRubricId) {
          const r = (rubrics as SavedRubric[]).find((rb) => rb.id === match.linkedRubricId);
          if (r) setLinkedRubric(r);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [year, term, courseCode, nameSlug]);

  const selectedCourse = useMemo(() => {
    return courses.find((c) => c.id === editCourseId) || null;
  }, [courses, editCourseId]);

  const handleSave = async () => {
    if (!assessment) return;
    if (!editTitle.trim()) {
      toast.error("Please enter an assessment title");
      return;
    }
    try {
      const course = courses.find((c) => c.id === editCourseId);
      const updated: Assessment = {
        ...assessment,
        title: editTitle.trim(),
        courseId: editCourseId,
        courseCode: course?.code || assessment.courseCode || editCourseId,
        courseName: course?.name || assessment.courseName || "",
        term: course?.term || assessment.term || "",
        year: course?.year || assessment.year || "",
        date: editDate,
        type: editType,
        status: editStatus,
      };
      await kv.set(`CHATGPT_assessments_${assessment.id}`, updated);
      setAssessment(updated);
      setIsEditing(false);
      toast.success("Assessment updated");
      const newUrl = buildAssessmentUrl(updated);
      const oldUrl = buildAssessmentUrl(assessment);
      if (newUrl !== oldUrl) {
        navigate(newUrl, { replace: true });
      }
    } catch (err) {
      console.error("Failed to update assessment", err);
      toast.error("Failed to save changes");
    }
  };

  const handleLinkRubric = async (rubric: SavedRubric) => {
    if (!assessment) return;
    try {
      const updatedAssessment = { ...assessment, linkedRubricId: rubric.id };
      await kv.set(`CHATGPT_assessments_${assessment.id}`, updatedAssessment);
      const updatedRubric = { ...rubric, linkedAssessmentId: assessment.id };
      await kv.set(`CHATGPT_rubrics_${rubric.id}`, updatedRubric);
      setAssessment(updatedAssessment);
      setLinkedRubric(updatedRubric);
      setShowLinkRubricSheet(false);
      setLinkSearchQuery("");
      toast.success(`Linked to "${rubric.name || rubric.assessmentName}"`);
    } catch (err) {
      console.error("Failed to link rubric", err);
      toast.error("Failed to link rubric");
    }
  };

  const handleUnlinkRubric = async () => {
    if (!assessment || !assessment.linkedRubricId) return;
    try {
      const rubricId = assessment.linkedRubricId;
      const updatedAssessment = { ...assessment, linkedRubricId: null };
      await kv.set(`CHATGPT_assessments_${assessment.id}`, updatedAssessment);
      try {
        const r = await kv.get(`CHATGPT_rubrics_${rubricId}`);
        if (r) {
          const updatedR = { ...r, linkedAssessmentId: null };
          await kv.set(`CHATGPT_rubrics_${rubricId}`, updatedR);
        }
      } catch {}
      setAssessment(updatedAssessment);
      setLinkedRubric(null);
      toast.success("Rubric unlinked");
    } catch (err) {
      console.error("Failed to unlink", err);
      toast.error("Failed to unlink rubric");
    }
  };

  const handleDeleteAssessment = async () => {
    if (!assessment) return;
    try {
      if (assessment.linkedRubricId) {
        try {
          const r = await kv.get(`CHATGPT_rubrics_${assessment.linkedRubricId}`);
          if (r) {
            await kv.set(`CHATGPT_rubrics_${assessment.linkedRubricId}`, { ...r, linkedAssessmentId: null });
          }
        } catch {}
      }
      await kv.del(`CHATGPT_assessments_${assessment.id}`);
      toast.success("Assessment deleted");
      navigate("/assessments");
    } catch (err) {
      console.error("Failed to delete assessment", err);
      toast.error("Failed to delete assessment");
    } finally {
      setShowDeleteConfirm(false);
    }
  };

  const filteredRubricsForLink = savedRubrics.filter(
    (r) =>
      (r.name || r.assessmentName || "")
        .toLowerCase()
        .includes(linkSearchQuery.toLowerCase()) ||
      r.courseName.toLowerCase().includes(linkSearchQuery.toLowerCase())
  );

  /* ─── Loading ─── */
  if (loading)
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#f7f7f8]">
        <LoadSplash />
      </div>
    );

  if (!assessment)
    return (
      <div className="flex flex-col h-full items-center justify-center p-8 text-gray-500">
        <p className="text-base font-semibold text-gray-900">Assessment not found.</p>
        <button
          onClick={() => navigate("/assessments")}
          className="mt-3 text-[#0a84ff] font-medium text-sm"
        >
          Go back to Assessments
        </button>
      </div>
    );

  const isGroup = isGroupAssessment(assessment.type);

  /* ─────────────────────────────────────────────── */
  /* EDIT MODE — Course Details style                */
  /* ─────────────────────────────────────────────── */
  if (isEditing) {
    return (
      <div className="flex flex-1 min-h-0 flex-col bg-white">
        <div className="flex gap-2 p-6 pb-2 items-center justify-between">
          <div className="h-1.5 flex-1 rounded-full bg-[#0a84ff]" />
        </div>

        <div className="p-6 pb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Edit Assessment</h1>
            <p className="text-sm text-gray-500">
              Editing — changes will update this assessment
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setEditTitle(assessment.title);
              setEditCourseId(assessment.courseId || "");
              setEditDate(assessment.date || "");
              setEditType(assessment.type || "");
              setEditStatus(assessment.status || "draft");
              setIsEditing(false);
            }}
            className="h-8 w-8 text-gray-400"
          >
            <XSquare className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Assessment Title</label>
            <Input
              placeholder="e.g. Final Presentation"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="h-12 rounded-xl bg-[#767680]/[0.08] border-none shadow-none focus-visible:ring-1 focus-visible:ring-[#0a84ff]"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Course</label>
            <select
              value={editCourseId}
              onChange={(e) => setEditCourseId(e.target.value)}
              className="flex h-12 w-full rounded-xl bg-[#767680]/[0.08] border-none px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#0a84ff]"
            >
              <option value="">Select a course</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
            {selectedCourse && (
              <p className="text-xs text-gray-400 px-1">
                Term {selectedCourse.term} · {selectedCourse.year}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Due Date</label>
            <Input
              type="date"
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
              className="h-12 rounded-xl bg-[#767680]/[0.08] border-none shadow-none focus-visible:ring-1 focus-visible:ring-[#0a84ff]"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Format</label>
            <FormatDropdown value={editType} onChange={(v) => setEditType(v)} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Status</label>
            <div className="flex gap-2">
              {(["draft", "active", "completed"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setEditStatus(s)}
                  className={`flex-1 h-10 rounded-xl text-sm font-medium transition-colors ${
                    editStatus === s
                      ? s === "active"
                        ? "bg-[#34c759] text-white"
                        : s === "completed"
                        ? "bg-[#af52de] text-white"
                        : "bg-[#0a84ff] text-white"
                      : "bg-[#767680]/[0.08] text-gray-600"
                  }`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Term / Semester</label>
              <div className="flex h-12 w-full items-center rounded-xl bg-[#767680]/[0.04] px-3">
                <span className={`text-sm ${selectedCourse?.term || assessment.term ? "text-gray-900" : "text-gray-400"}`}>
                  {selectedCourse?.term || assessment.term || "—"}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Year</label>
              <div className="flex h-12 w-full items-center rounded-xl bg-[#767680]/[0.04] px-3">
                <span className="text-sm text-gray-900">
                  {selectedCourse?.year || assessment.year || "—"}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-auto bg-white px-6 pb-4 pt-4">
          <Button
            className="h-12 w-full rounded-xl bg-[#0a84ff] hover:bg-[#0070e0] text-base text-white"
            onClick={handleSave}
            disabled={!editTitle.trim()}
          >
            Save Changes
          </Button>
        </div>
      </div>
    );
  }

  /* ─────────────────────────────────────────────── */
  /* VIEW MODE                                       */
  /* ─────────────────────────────────────────────── */
  return (
    <div className="flex flex-1 min-h-0 flex-col bg-[#f7f7f8]">
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-6">
        <div className="space-y-4 pt-4">

          {/* ── Title Card ── */}
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-bold tracking-tight text-gray-900 leading-tight">
                  {assessment.title}
                </h1>
                <p className="text-sm text-gray-500 mt-1">
                  {assessment.courseCode || assessment.courseId}
                  {assessment.courseName && ` — ${assessment.courseName}`}
                </p>
              </div>
              <span
                className={`shrink-0 px-2.5 py-1 text-[11px] font-semibold rounded-full ${
                  assessment.status === "active"
                    ? "bg-[#34c759]/10 text-[#34c759]"
                    : assessment.status === "completed"
                    ? "bg-[#af52de]/10 text-[#af52de]"
                    : "bg-[#0a84ff]/10 text-[#0a84ff]"
                }`}
              >
                {assessment.status.charAt(0).toUpperCase() + assessment.status.slice(1)}
              </span>
            </div>

            <div className="flex items-center flex-wrap gap-1.5 mt-3">
              {assessment.year && (
                <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#0a84ff] text-white">
                  {assessment.year}
                </span>
              )}
              {assessment.term && (
                <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#34c759] text-white">
                  Term {assessment.term}
                </span>
              )}
              <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#ff9f0a] text-white">
                {assessment.courseCode || assessment.courseId}
              </span>
              <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold text-white ${
                isGroup ? "bg-[#af52de]" : "bg-[#5856d6]"
              }`}>
                {isGroup ? "Group" : "Individual"}
              </span>
            </div>
          </div>

          {/* ── Info Grid ── */}
          <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-100">
            <div className="flex items-center justify-between px-5 py-3.5">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center">
                  <Calendar className="h-4 w-4 text-[#0a84ff]" />
                </div>
                <span className="text-sm text-gray-500">Due Date</span>
              </div>
              <span className="text-sm font-medium text-gray-900">
                {new Date(assessment.date).toLocaleDateString("en-AU", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </div>
            <div className="flex items-center justify-between px-5 py-3.5">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-purple-50 flex items-center justify-center">
                  <FileText className="h-4 w-4 text-[#af52de]" />
                </div>
                <span className="text-sm text-gray-500">Format</span>
              </div>
              <span className="text-sm font-medium text-gray-900">
                {getFormatLabel(assessment.type)}
              </span>
            </div>
            <div className="flex items-center justify-between px-5 py-3.5">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-orange-50 flex items-center justify-center">
                  <CheckCircle className={`h-4 w-4 ${assessment.rubric?.length > 0 ? "text-[#ff9f0a]" : "text-gray-400"}`} />
                </div>
                <span className="text-sm text-gray-500">Inline Rubric</span>
              </div>
              <span className="text-sm font-medium text-gray-900">
                {assessment.rubric?.length || 0} item{(assessment.rubric?.length || 0) !== 1 ? "s" : ""}
              </span>
            </div>
          </div>

          {/* ── Linked Rubric Section ── */}
          <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-[#34c759]" />
                <h3 className="font-semibold text-sm text-gray-900">Linked Rubric</h3>
              </div>
              {assessment.linkedRubricId && linkedRubric && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#34c759] text-white text-[11px] font-semibold">
                  Linked
                </span>
              )}
            </div>

            {assessment.linkedRubricId && linkedRubric ? (
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#34c759]/[0.06]">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {linkedRubric.name || linkedRubric.assessmentName}
                  </p>
                  <p className="text-xs text-gray-500">
                    {(linkedRubric.metrics || []).length} metrics &middot; {linkedRubric.courseName || "No course"}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    className="h-8 px-3 rounded-xl border border-[#0a84ff]/30 text-[#0a84ff] text-xs font-medium flex items-center gap-1 active:scale-95 transition-all"
                    onClick={() => navigate(buildRubricUrl(linkedRubric))}
                  >
                    <Eye className="h-3 w-3" /> View
                  </button>
                  <button
                    onClick={handleUnlinkRubric}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <Unlink className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => navigate(`/rubrics/new?assessmentId=${assessment.id}`)}
                  className="flex-1 h-11 rounded-xl bg-[#0a84ff]/10 text-[#0a84ff] font-medium text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                >
                  <Plus className="h-4 w-4" /> Create Rubric
                </button>
                <button
                  onClick={() => setShowLinkRubricSheet(true)}
                  className="flex-1 h-11 rounded-xl border-2 border-dashed border-[#34c759]/30 text-[#34c759] font-medium text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                >
                  <Link2 className="h-4 w-4" /> Link Rubric
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Bottom Pinned Buttons ── */}
      <div className="shrink-0 bg-[#f7f7f8] px-4 pb-4 pt-2 space-y-2">
        {assessment.status !== "completed" && (
          <button
            onClick={() => navigate("/engage")}
            className="w-full h-12 rounded-xl bg-[#0a84ff] text-white font-medium text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-lg shadow-blue-500/20"
          >
            <Mic className="h-4 w-4" />
            Start Session
          </button>
        )}
        <button
          onClick={() => setIsEditing(true)}
          className="w-full h-12 rounded-2xl bg-white shadow-sm text-[#0a84ff] font-medium text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
        >
          Edit Assessment
        </button>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="w-full h-12 rounded-2xl bg-white shadow-sm text-red-500 font-medium text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
        >
          <Trash2 className="h-4 w-4" />
          Delete Assessment
        </button>
      </div>

      {/* ── Link Rubric Bottom Sheet ── */}
      {showLinkRubricSheet && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => {
              setShowLinkRubricSheet(false);
              setLinkSearchQuery("");
            }}
          />
          <div className="relative w-full max-w-lg bg-white rounded-t-[20px] shadow-[0_-4px_30px_rgb(0,0,0,0.1)] animate-in slide-in-from-bottom duration-300">
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-9 h-1 rounded-full bg-gray-300" />
            </div>
            <div className="flex items-center justify-between px-5 pb-3">
              <h3 className="text-lg font-semibold">Link to Rubric</h3>
              <button
                onClick={() => {
                  setShowLinkRubricSheet(false);
                  setLinkSearchQuery("");
                }}
                className="h-8 w-8 rounded-full bg-[#767680]/[0.12] flex items-center justify-center"
              >
                <X className="h-4 w-4 text-gray-500" />
              </button>
            </div>
            <div className="px-5 pb-2">
              <div className="flex items-center gap-2 px-3 h-10 rounded-xl bg-[#767680]/[0.08]">
                <Search className="h-4 w-4 text-gray-400 shrink-0" />
                <input
                  type="text"
                  placeholder="Search rubrics..."
                  value={linkSearchQuery}
                  onChange={(e) => setLinkSearchQuery(e.target.value)}
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
                  autoFocus
                />
              </div>
            </div>
            <div className="max-h-[50vh] overflow-y-auto px-2 pb-8">
              {filteredRubricsForLink.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-gray-400">
                  {savedRubrics.length === 0
                    ? "No rubrics created yet"
                    : "No matching rubrics"}
                </div>
              ) : (
                filteredRubricsForLink.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => handleLinkRubric(r)}
                    className={`flex w-full items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors hover:bg-[#0a84ff]/[0.06] ${
                      assessment.linkedRubricId === r.id ? "bg-[#34c759]/[0.06]" : ""
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {r.name || r.assessmentName}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-500 truncate">
                          {r.courseName || "No course"}
                        </span>
                        <span className="text-xs text-gray-400">
                          {(r.metrics || []).length} metrics
                        </span>
                        {r.linkedAssessmentId && (
                          <span className="inline-flex px-1.5 py-0.5 rounded-full bg-[#ff9f0a] text-white text-[10px] font-semibold leading-none">
                            In Use
                          </span>
                        )}
                      </div>
                    </div>
                    {assessment.linkedRubricId === r.id && (
                      <Check className="h-4 w-4 text-[#34c759] shrink-0" />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation ── */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.12)] border-0 w-[90%] max-w-[400px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Assessment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{assessment.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-center flex-row gap-2 pt-2">
            <AlertDialogCancel className="flex-1 mt-0 rounded-xl h-11">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAssessment}
              className="flex-1 bg-red-500 hover:bg-red-600 text-white rounded-xl h-11"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
