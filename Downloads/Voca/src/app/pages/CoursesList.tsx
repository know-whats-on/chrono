import React, { useEffect, useState, useMemo } from "react";
import { Plus, Search, BookOpen, Users, Activity, Trash2, CheckSquare, XSquare, MoreVertical, SlidersHorizontal, X, ChevronDown, ArrowUpDown, Filter } from "lucide-react";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "../components/ui/dialog";
import { toast } from "sonner";
import * as kv from "../utils/kv";
import { Course, Assessment, SavedRubric } from "../types";
import { parseCoursesCsv } from "../utils/parseCoursesCsv";
import coursesCsvText from "../../imports/Dummy_Oral_Assessment_Data_-_Courses-1.csv?raw";
import { SchoolDropdown } from "../components/SchoolDropdown";
import { LoadSplash } from "../components/LoadSplash";
import { useParams, useNavigate, useLocation } from "react-router";
import { buildCourseUrl } from "../utils/urlHelpers";

const coursesLookup = parseCoursesCsv(coursesCsvText);

export default function CoursesList() {
  const params = useParams<{ year?: string; term?: string; courseCode?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  // Quick delete state
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; code: string; name: string; linkedAssessments: number; linkedRubrics: number } | null>(null);
  const [deleteTargetLoading, setDeleteTargetLoading] = useState(false);

  const [viewMode, setViewMode] = useState<"list" | "add" | "view">("list");
  const [isEditing, setIsEditing] = useState(false);
  const [step, setStep] = useState(1);
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [newCourse, setNewCourse] = useState<Partial<Course>>({ code: "", name: "", term: "", year: new Date().getFullYear().toString(), school: "", campus: "" });

  // Filter & Sort state
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [filterYear, setFilterYear] = useState<string>("all");
  const [filterTerm, setFilterTerm] = useState<string>("all");
  const [filterSubject, setFilterSubject] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"default" | "alpha-asc" | "alpha-desc" | "students-desc" | "students-asc">("default");

  // Route-based view mode: /courses/new or /courses/:year/:term/:code
  const isNewRoute = location.pathname === "/courses/new";
  const isDetailRoute = !!(params.year && params.term && params.courseCode);

  useEffect(() => {
    if (isNewRoute) {
      setViewMode("add");
      setStep(1);
      setNewCourse({ code: "", name: "", term: "", year: new Date().getFullYear().toString(), school: "", campus: "" });
    }
  }, [isNewRoute]);

  // Resolve detail route after courses load
  useEffect(() => {
    if (isDetailRoute && courses.length > 0) {
      const match = courses.find(
        (c) =>
          c.year === decodeURIComponent(params.year!) &&
          c.term === decodeURIComponent(params.term!) &&
          c.code === decodeURIComponent(params.courseCode!)
      );
      if (match) {
        openEditCourse(match);
      }
    }
  }, [isDetailRoute, courses.length, params.year, params.term, params.courseCode]);

  // Derived unique filter options from loaded courses
  const filterOptions = useMemo(() => {
    const years = [...new Set(courses.map(c => c.year).filter(Boolean))].sort((a, b) => b.localeCompare(a));
    const terms = [...new Set(courses.map(c => c.term).filter(Boolean))].sort();
    const subjects = [...new Set(courses.map(c => c.code.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 4)).filter(s => s.length === 4))].sort();
    return { years, terms, subjects };
  }, [courses]);

  const activeFilterCount = [filterYear !== "all", filterTerm !== "all", filterSubject !== "all", sortBy !== "default"].filter(Boolean).length;

  const clearAllFilters = () => {
    setFilterYear("all");
    setFilterTerm("all");
    setFilterSubject("all");
    setSortBy("default");
  };

  const handleCourseCodeChange = (value: string) => {
    const prefix = value.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 4);
    const match = prefix.length >= 4 ? coursesLookup[prefix] : null;
    setNewCourse({
      ...newCourse,
      code: value,
      school: match ? match.school : "",
      campus: match ? match.campus : "",
    });
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await kv.getByPrefix("CHATGPT_courses_");
      setCourses(data as Course[]);
    } catch (err) {
      console.error("Failed to load courses", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

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
        await kv.del(`CHATGPT_courses_${id}`);
      }
      toast.success(`Successfully deleted ${selectedIds.size} course(s)`);
      setIsSelectionMode(false);
      setSelectedIds(new Set());
      loadData();
    } catch (err) {
      console.error("Failed to delete courses", err);
      toast.error("Failed to delete selected courses");
    } finally {
      setShowDeleteConfirm(false);
    }
  };

  const handleAddCourse = async () => {
    if (!newCourse.code || !newCourse.name) {
      toast.error("Please fill in course code and name");
      return;
    }
    
    try {
      const id = crypto.randomUUID();
      const course: Course = {
        id,
        code: newCourse.code,
        name: newCourse.name,
        term: newCourse.term || "",
        year: newCourse.year || new Date().getFullYear().toString(),
        studentsCount: 0,
        school: newCourse.school || "",
        campus: newCourse.campus || ""
      };
      
      await kv.set(`CHATGPT_courses_${id}`, course);
      toast.success("Course created successfully");
      setViewMode("list");
      setStep(1);
      setNewCourse({ code: "", name: "", term: "", year: new Date().getFullYear().toString(), school: "", campus: "" });
      loadData();
    } catch (err) {
      console.error("Failed to add course", err);
      toast.error("Failed to create course");
    }
  };

  const handleEditCourse = async () => {
    if (!newCourse.code || !newCourse.name || !editingCourseId) {
      toast.error("Please fill in course code and name");
      return;
    }

    try {
      const oldCourse = courses.find(c => c.id === editingCourseId);
      const updatedCourse: Course = {
        id: editingCourseId,
        code: newCourse.code,
        name: newCourse.name,
        term: newCourse.term || "",
        year: newCourse.year || new Date().getFullYear().toString(),
        studentsCount: oldCourse?.studentsCount || 0,
        school: newCourse.school || "",
        campus: newCourse.campus || "",
      };

      await kv.set(`CHATGPT_courses_${editingCourseId}`, updatedCourse);

      // Cascade update assessments that reference this course
      const assessments = (await kv.getByPrefix("CHATGPT_assessments_")) as Assessment[];
      for (const a of assessments) {
        if (a.courseId === editingCourseId) {
          const updated = {
            ...a,
            courseCode: updatedCourse.code,
            courseName: updatedCourse.name,
            term: updatedCourse.term,
            year: updatedCourse.year,
          };
          await kv.set(`CHATGPT_assessments_${a.id}`, updated);
        }
      }

      // Cascade update rubrics that reference the old course name
      const rubrics = (await kv.getByPrefix("CHATGPT_rubrics_")) as SavedRubric[];
      for (const r of rubrics) {
        if (oldCourse && r.courseName === oldCourse.name) {
          const updated = {
            ...r,
            courseName: updatedCourse.name,
            term: updatedCourse.term,
            year: updatedCourse.year,
          };
          await kv.set(`CHATGPT_rubrics_${r.id}`, updated);
        }
      }

      toast.success("Course updated successfully");
      setViewMode("list");
      setEditingCourseId(null);
      setIsEditing(false);
      setNewCourse({ code: "", name: "", term: "", year: new Date().getFullYear().toString(), school: "", campus: "" });
      loadData();
    } catch (err) {
      console.error("Failed to update course", err);
      toast.error("Failed to update course");
    }
  };

  const openEditCourse = (course: Course) => {
    setEditingCourseId(course.id);
    setNewCourse({
      code: course.code,
      name: course.name,
      term: course.term,
      year: course.year,
      school: course.school || "",
      campus: course.campus || "",
    });
    setIsEditing(false);
    setViewMode("view");
  };

  // Quick delete: gather linked data and show confirmation
  const initiateQuickDelete = async (course: Course, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteTargetLoading(true);
    try {
      const assessments = (await kv.getByPrefix("CHATGPT_assessments_")) as Assessment[];
      const rubrics = (await kv.getByPrefix("CHATGPT_rubrics_")) as SavedRubric[];
      const linkedAssessments = assessments.filter(a => a.courseId === course.id || a.courseCode === course.code);
      const linkedRubrics = rubrics.filter(r => r.courseName === course.name);
      setDeleteTarget({
        id: course.id,
        code: course.code,
        name: course.name,
        linkedAssessments: linkedAssessments.length,
        linkedRubrics: linkedRubrics.length,
      });
    } catch (err) {
      console.error("Failed to check linked data", err);
      toast.error("Failed to check linked data");
    } finally {
      setDeleteTargetLoading(false);
    }
  };

  const handleQuickDelete = async () => {
    if (!deleteTarget) return;
    try {
      // Delete linked assessments
      const assessments = (await kv.getByPrefix("CHATGPT_assessments_")) as Assessment[];
      for (const a of assessments) {
        if (a.courseId === deleteTarget.id || a.courseCode === deleteTarget.code) {
          await kv.del(`CHATGPT_assessments_${a.id}`);
        }
      }
      // Delete linked rubrics
      const rubrics = (await kv.getByPrefix("CHATGPT_rubrics_")) as SavedRubric[];
      for (const r of rubrics) {
        if (r.courseName === deleteTarget.name) {
          await kv.del(`CHATGPT_rubrics_${r.id}`);
        }
      }
      // Delete the course
      await kv.del(`CHATGPT_courses_${deleteTarget.id}`);
      toast.success("Course and linked data deleted");
      loadData();
    } catch (err) {
      console.error("Failed to delete course", err);
      toast.error("Failed to delete course");
    } finally {
      setDeleteTarget(null);
    }
  };

  const filtered = useMemo(() => {
    let result = courses.filter(c =>
      c.name.toLowerCase().includes(search.toLowerCase()) || 
      c.code.toLowerCase().includes(search.toLowerCase())
    );

    // Apply filters
    if (filterYear !== "all") {
      result = result.filter(c => c.year === filterYear);
    }
    if (filterTerm !== "all") {
      result = result.filter(c => c.term === filterTerm);
    }
    if (filterSubject !== "all") {
      result = result.filter(c => c.code.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 4) === filterSubject);
    }

    // Apply sort
    switch (sortBy) {
      case "alpha-asc":
        result = [...result].sort((a, b) => a.code.localeCompare(b.code));
        break;
      case "alpha-desc":
        result = [...result].sort((a, b) => b.code.localeCompare(a.code));
        break;
      case "students-desc":
        result = [...result].sort((a, b) => (b.studentsCount || 0) - (a.studentsCount || 0));
        break;
      case "students-asc":
        result = [...result].sort((a, b) => (a.studentsCount || 0) - (b.studentsCount || 0));
        break;
    }

    return result;
  }, [courses, search, filterYear, filterTerm, filterSubject, sortBy]);

  if (viewMode === "add" || viewMode === "view") {
    const isViewMode = viewMode === "view" && !isEditing;
    const isEditMode = viewMode === "view" && isEditing;
    const isAddMode = viewMode === "add";

    const closeForm = () => {
      setViewMode("list");
      setEditingCourseId(null);
      setIsEditing(false);
      setNewCourse({ code: "", name: "", term: "", year: new Date().getFullYear().toString(), school: "", campus: "" });
      navigate("/courses");
    };

    return (
      <div className="flex flex-1 min-h-0 flex-col bg-white">
        <div className="flex gap-2 p-6 pb-2 items-center justify-between">
          <div className="h-1.5 flex-1 rounded-full bg-[#0a84ff]" />
        </div>

        <div className="p-6 pb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {isAddMode ? "New Course" : "Course Details"}
            </h1>
            <p className="text-sm text-gray-500">
              {isAddMode
                ? "Fill in course details"
                : isViewMode
                ? "View or edit this course"
                : "Editing — changes will also update linked assessments & rubrics"}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={closeForm} className="h-8 w-8 text-gray-400">
            <XSquare className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Course Code</label>
            {isViewMode ? (
              <div className="flex h-12 w-full items-center rounded-xl bg-[#767680]/[0.04] px-3">
                <span className="text-sm text-gray-900">{newCourse.code || "—"}</span>
              </div>
            ) : (
              <Input
                placeholder="e.g. INFS5997"
                value={newCourse.code}
                onChange={(e) => handleCourseCodeChange(e.target.value)}
                className="h-12 rounded-xl bg-[#767680]/[0.08] border-none shadow-none focus-visible:ring-1 focus-visible:ring-[#0a84ff]"
              />
            )}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Course Name</label>
            {isViewMode ? (
              <div className="flex h-12 w-full items-center rounded-xl bg-[#767680]/[0.04] px-3">
                <span className="text-sm text-gray-900">{newCourse.name || "—"}</span>
              </div>
            ) : (
              <Input
                placeholder="e.g. Integrated Technology and Analytics Applications"
                value={newCourse.name}
                onChange={(e) => setNewCourse({...newCourse, name: e.target.value})}
                className="h-12 rounded-xl bg-[#767680]/[0.08] border-none shadow-none focus-visible:ring-1 focus-visible:ring-[#0a84ff]"
              />
            )}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">School <span className="text-gray-400 font-normal">(optional)</span></label>
            {isViewMode ? (
              <div className="flex h-12 w-full items-center rounded-xl bg-[#767680]/[0.04] px-3">
                <span className={`text-sm ${newCourse.school ? "text-gray-900" : "text-gray-400"}`}>
                  {newCourse.school || "Not specified"}
                </span>
              </div>
            ) : (
              <SchoolDropdown
                value={newCourse.school || ""}
                onChange={(val) => setNewCourse({...newCourse, school: val})}
              />
            )}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Campus <span className="text-gray-400 font-normal">(optional)</span></label>
            {isViewMode ? (
              <div className="flex h-12 w-full items-center rounded-xl bg-[#767680]/[0.04] px-3">
                <span className={`text-sm ${newCourse.campus ? "text-gray-900" : "text-gray-400"}`}>
                  {newCourse.campus || "Not specified"}
                </span>
              </div>
            ) : (
              <Input
                placeholder="e.g. Kensington"
                value={newCourse.campus}
                onChange={(e) => setNewCourse({...newCourse, campus: e.target.value})}
                className="h-12 rounded-xl bg-[#767680]/[0.08] border-none shadow-none focus-visible:ring-1 focus-visible:ring-[#0a84ff]"
              />
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Term / Semester</label>
              {isViewMode ? (
                <div className="flex h-12 w-full items-center rounded-xl bg-[#767680]/[0.04] px-3">
                  <span className={`text-sm ${newCourse.term ? "text-gray-900" : "text-gray-400"}`}>
                    {newCourse.term || "—"}
                  </span>
                </div>
              ) : (
                <Input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="e.g. 1"
                  value={newCourse.term}
                  onChange={(e) => setNewCourse({...newCourse, term: e.target.value.replace(/[^0-9]/g, "")})}
                  className="h-12 rounded-xl bg-[#767680]/[0.08] border-none shadow-none focus-visible:ring-1 focus-visible:ring-[#0a84ff]"
                />
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Year</label>
              {isViewMode ? (
                <div className="flex h-12 w-full items-center rounded-xl bg-[#767680]/[0.04] px-3">
                  <span className="text-sm text-gray-900">{newCourse.year || "—"}</span>
                </div>
              ) : (
                <Input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  type="number"
                  value={newCourse.year}
                  onChange={(e) => setNewCourse({...newCourse, year: e.target.value})}
                  className="h-12 rounded-xl bg-[#767680]/[0.08] border-none shadow-none focus-visible:ring-1 focus-visible:ring-[#0a84ff]"
                />
              )}
            </div>
          </div>
        </div>

        <div className="mt-auto bg-white px-6 pb-4 pt-4">
          {isViewMode ? (
            <Button
              className="h-12 w-full rounded-xl bg-[#0a84ff] hover:bg-[#0070e0] text-base text-white"
              onClick={() => setIsEditing(true)}
            >
              Edit Course
            </Button>
          ) : (
            <Button
              className="h-12 w-full rounded-xl bg-[#0a84ff] hover:bg-[#0070e0] text-base text-white"
              onClick={isAddMode ? handleAddCourse : handleEditCourse}
              disabled={!newCourse.code || !newCourse.name}
            >
              {isAddMode ? "Create Course" : "Save Changes"}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col p-4 space-y-4 bg-[#f7f7f8] overflow-y-auto">
      <div className="flex items-center justify-between mt-2">
        <h1 className="text-3xl font-bold tracking-tight">Courses</h1>
        <div className="flex gap-2">
          {isSelectionMode ? (
            <>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={selectedIds.size === 0}
                title="Delete Selected"
                className={`h-10 w-10 rounded-full bg-white shadow-sm border-gray-200 ${selectedIds.size > 0 ? 'text-red-500 hover:text-red-600' : 'text-gray-300'}`}
              >
                <Trash2 className="h-5 w-5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={toggleSelectionMode}
                title="Cancel Selection"
                className="h-10 w-10 rounded-full bg-white shadow-sm border-gray-200 text-gray-500"
              >
                <XSquare className="h-5 w-5" />
              </Button>
            </>
          ) : (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 rounded-full bg-white shadow-sm border-gray-200 text-gray-500"
                  >
                    <MoreVertical className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 rounded-xl">
                  <DropdownMenuItem onClick={toggleSelectionMode} className="gap-2 cursor-pointer py-2">
                    <CheckSquare className="h-4 w-4" />
                    <span>Select Courses</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <button
                onClick={() => navigate("/courses/new")}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0a84ff] text-white shadow-md active:scale-95 transition-transform"
              >
                <Plus className="h-6 w-6" />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="relative mt-2 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by code or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 rounded-[10px] bg-[#767680]/[0.12] pl-9 border-none shadow-none text-[17px] focus-visible:ring-0 placeholder:text-[17px] placeholder:text-[#3C3C43]/60 w-full"
          />
        </div>
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
          {filterSubject !== "all" && (
            <button
              onClick={() => setFilterSubject("all")}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[#ff9f0a] text-white whitespace-nowrap"
            >
              {filterSubject}
              <X className="h-3 w-3" />
            </button>
          )}
          {sortBy !== "default" && (
            <button
              onClick={() => setSortBy("default")}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[#af52de] text-white whitespace-nowrap"
            >
              <ArrowUpDown className="h-3 w-3" />
              {sortBy === "alpha-asc" ? "A → Z" : sortBy === "alpha-desc" ? "Z → A" : sortBy === "students-desc" ? "Most Students" : "Least Students"}
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
      {!loading && activeFilterCount > 0 && (
        <p className="text-xs text-gray-400 font-medium">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</p>
      )}

      <div className="space-y-3 mt-4">
        {loading ? (
          <div className="fixed inset-0 z-40 flex items-center justify-center">
            <LoadSplash />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-gray-500">
            <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <BookOpen className="h-8 w-8 text-gray-400" />
            </div>
            <p className="text-lg font-medium text-gray-900">No courses found</p>
            <p className="text-sm mt-1">Create one to get started.</p>
          </div>
        ) : (
          filtered.map((item) => (
            <Card
              key={item.id}
              className={`border-0 shadow-sm rounded-2xl cursor-pointer active:scale-[0.98] transition-all ${
                isSelectionMode && selectedIds.has(item.id) 
                  ? 'border-[#0a84ff] bg-blue-50/30 ring-2 ring-[#0a84ff] ring-offset-1' 
                  : 'bg-white hover:shadow-md'
              }`}
              onClick={(e) => {
                if (isSelectionMode) {
                  toggleSelection(item.id, e);
                } else {
                  navigate(buildCourseUrl(item));
                }
              }}
            >
              <CardContent className="p-4 flex flex-col gap-3 relative">
                {isSelectionMode && (
                  <div className="absolute top-4 left-4">
                    <div className={`h-5 w-5 rounded-full flex items-center justify-center border ${
                      selectedIds.has(item.id) 
                        ? 'bg-[#0a84ff] border-[#0a84ff] text-white' 
                        : 'border-gray-300 bg-white'
                    }`}>
                      {selectedIds.has(item.id) && <CheckSquare className="h-3 w-3" />}
                    </div>
                  </div>
                )}
                <div className={`flex justify-between items-start ${isSelectionMode ? 'pl-8' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-lg leading-tight">{item.code}</h3>
                    <p className="text-sm text-gray-500 font-medium">{item.name}</p>
                  </div>
                </div>
                <div className={`flex items-center justify-between ${isSelectionMode ? 'pl-8' : ''}`}>
                  <span className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-[#af52de] text-white">
                    <Users className="h-3.5 w-3.5" />
                    {item.studentsCount || 0} students
                  </span>
                  <div className="flex items-center gap-1.5">
                    {item.term && (
                      <span className="px-2 py-1 rounded-lg text-xs font-medium bg-[#0a84ff] text-white">
                        Term {item.term}
                      </span>
                    )}
                    <span className="px-2 py-1 rounded-lg text-xs font-medium bg-[#34c759] text-white">
                      {item.year}
                    </span>
                    {!isSelectionMode && (
                      <button
                        onClick={(e) => initiateQuickDelete(item, e)}
                        className="ml-1 p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 active:scale-90 transition-all"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Quick delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.12)] border-0 w-[90%] max-w-[400px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Course</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                Are you sure you want to delete <span className="font-semibold text-gray-700">{deleteTarget?.code}</span>?
              </span>
              {((deleteTarget?.linkedAssessments ?? 0) > 0 || (deleteTarget?.linkedRubrics ?? 0) > 0) && (
                <span className="block text-red-600 font-medium">
                  This will also permanently delete {deleteTarget?.linkedAssessments ?? 0} assessment(s) and {deleteTarget?.linkedRubrics ?? 0} rubric(s) linked to this course.
                </span>
              )}
              <span className="block">This action cannot be undone.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-center flex-row gap-2 pt-2">
            <AlertDialogCancel className="flex-1 mt-0 rounded-xl h-11">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleQuickDelete}
              className="flex-1 bg-red-500 hover:bg-red-600 text-white rounded-xl h-11"
            >
              Delete All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.12)] border-0 w-[90%] max-w-[400px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Courses</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedIds.size} selected course(s)? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-center flex-row gap-2 pt-2">
            <AlertDialogCancel className="flex-1 mt-0 rounded-xl h-11">Cancel</AlertDialogCancel>
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
                  {filterOptions.years.map(y => (
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
                  {filterOptions.terms.map(t => (
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

              {/* Subject Code */}
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
                  {filterOptions.subjects.map(s => (
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

              {/* Sort */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-500 uppercase tracking-wide">Sort By</label>
                <div className="flex flex-wrap gap-2">
                  {([
                    { value: "default", label: "Default" },
                    { value: "alpha-asc", label: "A → Z" },
                    { value: "alpha-desc", label: "Z → A" },
                    { value: "students-desc", label: "Most Students" },
                    { value: "students-asc", label: "Least Students" },
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