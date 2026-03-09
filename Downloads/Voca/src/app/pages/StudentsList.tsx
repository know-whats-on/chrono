import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Search, Plus, Users, Filter, MoreVertical, Trash2,
  CheckSquare, XSquare, Upload, FileSpreadsheet, Download,
  ChevronDown, X, ChevronLeft,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card, CardContent } from "../components/ui/card";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
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
import { LoadSplash } from "../components/LoadSplash";
import { Student, Course } from "../types";
import { useParams, useNavigate, useLocation } from "react-router";
import { buildStudentUrl } from "../utils/urlHelpers";

/* ─── helpers ─── */
const emptyForm = { firstName: "", lastName: "", studentNumber: "", email: "", groupId: "", tutorialWorkshop: "", courseId: "" };

function CourseDropdown({ courses, value, onChange }: { courses: Course[]; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filtered = courses.filter(c =>
    `${c.code} ${c.name}`.toLowerCase().includes(query.toLowerCase())
  );
  const selected = courses.find(c => c.id === value);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-12 w-full items-center justify-between rounded-xl bg-[#767680]/[0.08] px-3 text-sm transition-colors"
      >
        <span className={selected ? "text-gray-900" : "text-[#3C3C43]/60"}>
          {selected ? `${selected.code} — ${selected.name}` : "Select a course…"}
        </span>
        <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 rounded-xl bg-white shadow-lg border border-gray-100 max-h-60 flex flex-col">
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                autoFocus
                className="w-full h-8 rounded-lg bg-[#767680]/[0.08] pl-8 pr-3 text-sm outline-none placeholder:text-[#3C3C43]/50"
                placeholder="Search courses…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-gray-400">No courses found</p>
            ) : (
              filtered.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => { onChange(c.id); setOpen(false); setQuery(""); }}
                  className={`w-full text-left px-3 py-2.5 text-sm hover:bg-[#0a84ff]/10 transition-colors ${value === c.id ? "bg-[#0a84ff]/10 font-medium text-[#0a84ff]" : "text-gray-900"}`}
                >
                  <span className="font-medium">{c.code}</span>
                  <span className="text-gray-500 ml-1.5">— {c.name}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── main component ─── */
export default function StudentsList() {
  const params = useParams<{ studentId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [students, setStudents] = useState<Student[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Filter & Sort state
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [filterCourse, setFilterCourse] = useState<string>("all");
  const [filterGroup, setFilterGroup] = useState<string>("all");
  const [filterTutorial, setFilterTutorial] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"default" | "alpha-asc" | "alpha-desc" | "id-asc" | "id-desc">("default");

  // Derived filter options
  const filterOptions = useMemo(() => {
    const courseIds = [...new Set(students.map(s => s.courseId).filter(Boolean))] as string[];
    const groups = [...new Set(students.map(s => s.groupId).filter(Boolean))].sort() as string[];
    const tutorials = [...new Set(
      students.flatMap(s => (s.tutorialWorkshop || "").split(",").map(t => t.trim()).filter(Boolean))
    )].sort();
    return { courseIds, groups, tutorials };
  }, [students]);

  const activeFilterCount = [filterCourse !== "all", filterGroup !== "all", filterTutorial !== "all", sortBy !== "default"].filter(Boolean).length;

  const clearAllFilters = () => {
    setFilterCourse("all");
    setFilterGroup("all");
    setFilterTutorial("all");
    setSortBy("default");
  };

  // Full-screen add mode
  const [viewMode, setViewMode] = useState<"list" | "add" | "import" | "view">("list");
  const [form, setForm] = useState(emptyForm);

  // View/Edit student
  const [viewingStudentId, setViewingStudentId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [isEditing, setIsEditing] = useState(false);

  // Quick delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  // Bulk import
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingImports, setPendingImports] = useState<Partial<Student>[] | null>(null);
  const [importCourseId, setImportCourseId] = useState("");

  // Route-based view mode
  const isNewRoute = location.pathname === "/students/new";
  const isDetailRoute = !!params.studentId;

  useEffect(() => {
    if (isNewRoute) {
      setViewMode("add");
      setForm(emptyForm);
    }
  }, [isNewRoute]);

  // Resolve detail route after students load
  useEffect(() => {
    if (isDetailRoute && students.length > 0) {
      const match = students.find(
        (s) => s.studentNumber === decodeURIComponent(params.studentId!)
      );
      if (match) {
        openStudent(match);
      }
    }
  }, [isDetailRoute, students.length, params.studentId]);

  /* ─── data loading ─── */
  const loadData = async () => {
    try {
      setLoading(true);
      const [studentData, courseData] = await Promise.all([
        kv.get("CHATGPT_students_global"),
        kv.getByPrefix("CHATGPT_courses_"),
      ]);
      if (studentData && Array.isArray(studentData)) {
        setStudents(studentData);
      } else {
        const mockStudents: Student[] = [
          { id: "s1", firstName: "Alice", lastName: "Smith", email: "alice@uni.edu", studentNumber: "1001", groupId: "Group A" },
          { id: "s2", firstName: "Bob", lastName: "Jones", email: "bob@uni.edu", studentNumber: "1002", groupId: "Group A" },
          { id: "s3", firstName: "Charlie", lastName: "Brown", email: "charlie@uni.edu", studentNumber: "1003", groupId: "Group B" },
          { id: "s4", firstName: "Diana", lastName: "Prince", email: "diana@uni.edu", studentNumber: "1004", groupId: "Group C" },
        ];
        setStudents(mockStudents);
        await kv.set("CHATGPT_students_global", mockStudents);
      }
      setCourses((courseData ?? []) as Course[]);
    } catch (err) {
      console.error("Failed to load students", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  /* ─── actions ─── */
  const toggleSelectionMode = () => { setIsSelectionMode(!isSelectionMode); setSelectedIds(new Set()); };

  const toggleSelection = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const s = new Set(selectedIds);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelectedIds(s);
  };

  const handleAddStudent = async () => {
    if (!form.firstName || !form.lastName) { toast.error("Please fill in first and last name"); return; }
    try {
      const id = crypto.randomUUID();
      const student: Student = {
        id,
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        studentNumber: form.studentNumber,
        groupId: form.groupId || undefined,
        tutorialWorkshop: form.tutorialWorkshop || undefined,
        courseId: form.courseId || undefined,
      };
      const updated = [...students, student];
      await kv.set("CHATGPT_students_global", updated);
      setStudents(updated);
      toast.success("Student added successfully");
      setViewMode("list");
      setForm(emptyForm);
    } catch (err) {
      console.error(err);
      toast.error("Failed to add student");
    }
  };

  const deleteSelected = async () => {
    if (selectedIds.size === 0) return;
    try {
      const remaining = students.filter(s => !selectedIds.has(s.id));
      await kv.set("CHATGPT_students_global", remaining);
      setStudents(remaining);
      toast.success(`Deleted ${selectedIds.size} student(s)`);
      setIsSelectionMode(false);
      setSelectedIds(new Set());
    } catch (err) {
      console.error("Failed to delete students", err);
      toast.error("Failed to delete students");
    } finally {
      setShowDeleteConfirm(false);
    }
  };

  const deleteSingle = async (id: string) => {
    try {
      const remaining = students.filter(s => s.id !== id);
      await kv.set("CHATGPT_students_global", remaining);
      setStudents(remaining);
      toast.success("Student deleted");
      if (viewingStudentId === id) {
        setViewMode("list");
        setViewingStudentId(null);
        setIsEditing(false);
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete student");
    } finally {
      setDeleteTarget(null);
    }
  };

  const openStudent = (student: Student) => {
    setViewingStudentId(student.id);
    setEditForm({
      firstName: student.firstName,
      lastName: student.lastName,
      studentNumber: student.studentNumber,
      email: student.email || "",
      groupId: student.groupId || "",
      tutorialWorkshop: student.tutorialWorkshop || "",
      courseId: student.courseId || "",
    });
    setIsEditing(false);
    setViewMode("view");
  };

  const handleSaveStudent = async () => {
    if (!viewingStudentId) return;
    if (!editForm.firstName || !editForm.lastName) { toast.error("First and last name are required"); return; }
    try {
      const updated = students.map(s =>
        s.id === viewingStudentId
          ? {
              ...s,
              firstName: editForm.firstName,
              lastName: editForm.lastName,
              studentNumber: editForm.studentNumber,
              email: editForm.email,
              groupId: editForm.groupId || undefined,
              tutorialWorkshop: editForm.tutorialWorkshop || undefined,
              courseId: editForm.courseId || undefined,
            }
          : s
      );
      await kv.set("CHATGPT_students_global", updated);
      setStudents(updated);
      toast.success("Student updated");
      setIsEditing(false);
    } catch (err) {
      console.error(err);
      toast.error("Failed to update student");
    }
  };

  /* ─── CSV helpers ── */
  const downloadTemplate = () => {
    const csvContent =
      "data:text/csv;charset=utf-8,First Name,Last Name,Student ID,Email Address,Tutorial/Workshop,Group\nJane,Doe,z5123456,jane.doe@student.unsw.edu.au,TUT01,Group A\nJohn,Smith,z5234567,john.smith@student.unsw.edu.au,\"WS01, WS02\",\"Group A, Group B\"";
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", "students_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const rows = text.split("\n").map(r => r.trim()).filter(r => r.length > 0);
        const dataRows = rows.slice(1); // skip header

        const parsed: Partial<Student>[] = [];
        for (const row of dataRows) {
          // Handle quoted values with commas inside
          const cols: string[] = [];
          let current = "";
          let inQuotes = false;
          for (let i = 0; i < row.length; i++) {
            const ch = row[i];
            if (ch === '"') { inQuotes = !inQuotes; continue; }
            if (ch === ',' && !inQuotes) { cols.push(current.trim()); current = ""; continue; }
            current += ch;
          }
          cols.push(current.trim());

          if (cols.length >= 1 && cols[0]) {
            parsed.push({
              id: crypto.randomUUID(),
              firstName: cols[0] || "",
              lastName: cols[1] || "",
              studentNumber: cols[2] || "",
              email: cols[3] || "",
              tutorialWorkshop: cols[4] || "",
              groupId: cols[5] || "",
            });
          }
        }
        if (parsed.length > 0) {
          setPendingImports(parsed);
          setImportCourseId("");
          setViewMode("import");
        } else {
          toast.error("No valid students found in CSV.");
        }
      } catch (err) {
        console.error("Failed to parse CSV", err);
        toast.error("Failed to parse the CSV file.");
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    };
    reader.readAsText(file);
  };

  const confirmImport = async () => {
    if (!pendingImports || pendingImports.length === 0) return;
    try {
      const newStudents: Student[] = pendingImports.map(p => ({
        id: p.id || crypto.randomUUID(),
        firstName: p.firstName || "",
        lastName: p.lastName || "",
        email: p.email || "",
        studentNumber: p.studentNumber || "",
        groupId: p.groupId || undefined,
        tutorialWorkshop: p.tutorialWorkshop || undefined,
        courseId: importCourseId || undefined,
      }));
      const updated = [...students, ...newStudents];
      await kv.set("CHATGPT_students_global", updated);
      setStudents(updated);
      toast.success(`Imported ${newStudents.length} student(s)`);
      setPendingImports(null);
      setImportCourseId("");
      setViewMode("list");
    } catch (err) {
      console.error("Failed to import students", err);
      toast.error("Failed to import students");
    }
  };

  /* ─── derived ─── */
  const filtered = useMemo(() => {
    let result = students.filter(s =>
      `${s.firstName} ${s.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
      s.studentNumber.includes(search) ||
      s.email?.toLowerCase().includes(search.toLowerCase()) ||
      s.groupId?.toLowerCase().includes(search.toLowerCase())
    );

    // Apply filters
    if (filterCourse !== "all") {
      result = result.filter(s => s.courseId === filterCourse);
    }
    if (filterGroup !== "all") {
      result = result.filter(s => s.groupId === filterGroup);
    }
    if (filterTutorial !== "all") {
      result = result.filter(s =>
        (s.tutorialWorkshop || "").split(",").map(t => t.trim()).includes(filterTutorial)
      );
    }

    // Apply sort
    if (sortBy === "alpha-asc") {
      result = [...result].sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
    } else if (sortBy === "alpha-desc") {
      result = [...result].sort((a, b) => `${b.firstName} ${b.lastName}`.localeCompare(`${a.firstName} ${a.lastName}`));
    } else if (sortBy === "id-asc") {
      result = [...result].sort((a, b) => a.studentNumber.localeCompare(b.studentNumber));
    } else if (sortBy === "id-desc") {
      result = [...result].sort((a, b) => b.studentNumber.localeCompare(a.studentNumber));
    }

    return result;
  }, [students, search, filterCourse, filterGroup, filterTutorial, sortBy]);

  const getInitials = (first: string, last: string) => `${first.charAt(0)}${last.charAt(0)}`;
  const courseMap = useMemo(() => Object.fromEntries(courses.map(c => [c.id, c])), [courses]);

  /* ───────────────── Bulk Import Review ───────────────── */
  if (viewMode === "import" && pendingImports) {
    return (
      <div className="flex flex-1 min-h-0 flex-col bg-white">
        <div className="flex gap-2 p-6 pb-2 items-center justify-between">
          <div className="h-1.5 flex-1 rounded-full bg-[#0a84ff]" />
        </div>

        <div className="p-6 pb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Review Import</h1>
            <p className="text-sm text-gray-500">
              {pendingImports.length} student{pendingImports.length !== 1 ? "s" : ""} found — assign a course
            </p>
          </div>
          <Button
            variant="ghost" size="icon"
            onClick={() => { setPendingImports(null); setViewMode("list"); }}
            className="h-8 w-8 text-gray-400"
          >
            <XSquare className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 space-y-4 pb-20">
          {/* Course selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Assign to Course</label>
            <CourseDropdown courses={courses} value={importCourseId} onChange={setImportCourseId} />
          </div>

          {/* Preview list */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-500 uppercase tracking-wide text-xs">Preview</label>
            <div className="rounded-2xl bg-[#767680]/[0.04] divide-y divide-gray-100">
              {pendingImports.map((s, i) => (
                <div key={s.id || i} className="px-4 py-3 flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{s.firstName} {s.lastName}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {s.studentNumber}{s.email ? ` · ${s.email}` : ""}
                    </p>
                    {(s.tutorialWorkshop || s.groupId) && (
                      <p className="text-xs text-gray-400 truncate mt-0.5">
                        {s.tutorialWorkshop ? `Tut: ${s.tutorialWorkshop}` : ""}
                        {s.tutorialWorkshop && s.groupId ? " · " : ""}
                        {s.groupId ? `Group: ${s.groupId}` : ""}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => setPendingImports(pendingImports.filter((_, idx) => idx !== i))}
                    className="ml-2 p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-auto bg-white px-6 pb-4 pt-4">
          <Button
            className="h-12 w-full rounded-xl bg-[#0a84ff] hover:bg-[#0070e0] text-base text-white"
            onClick={confirmImport}
            disabled={pendingImports.length === 0}
          >
            Import {pendingImports.length} Student{pendingImports.length !== 1 ? "s" : ""}
          </Button>
        </div>
      </div>
    );
  }

  /* ───────────────── Add Student ───────────────── */
  if (viewMode === "add") {
    return (
      <div className="flex flex-1 min-h-0 flex-col bg-white">
        <div className="flex gap-2 p-6 pb-2 items-center justify-between">
          <div className="h-1.5 flex-1 rounded-full bg-[#0a84ff]" />
        </div>

        <div className="p-6 pb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">New Student</h1>
            <p className="text-sm text-gray-500">Fill in student details</p>
          </div>
          <Button
            variant="ghost" size="icon"
            onClick={() => { setViewMode("list"); setForm(emptyForm); navigate("/students"); }}
            className="h-8 w-8 text-gray-400"
          >
            <XSquare className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">First Name</label>
              <Input
                placeholder="Jane"
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                className="h-12 rounded-xl bg-[#767680]/[0.08] border-none shadow-none focus-visible:ring-1 focus-visible:ring-[#0a84ff]"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Last Name</label>
              <Input
                placeholder="Doe"
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                className="h-12 rounded-xl bg-[#767680]/[0.08] border-none shadow-none focus-visible:ring-1 focus-visible:ring-[#0a84ff]"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Student ID</label>
            <Input
              placeholder="e.g. z5123456"
              value={form.studentNumber}
              onChange={(e) => setForm({ ...form, studentNumber: e.target.value })}
              className="h-12 rounded-xl bg-[#767680]/[0.08] border-none shadow-none focus-visible:ring-1 focus-visible:ring-[#0a84ff]"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Email Address</label>
            <Input
              type="email"
              placeholder="jane.doe@student.unsw.edu.au"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="h-12 rounded-xl bg-[#767680]/[0.08] border-none shadow-none focus-visible:ring-1 focus-visible:ring-[#0a84ff]"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Course <span className="text-gray-400 font-normal">(optional)</span></label>
            <CourseDropdown courses={courses} value={form.courseId} onChange={(v) => setForm({ ...form, courseId: v })} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Tutorial / Workshop <span className="text-gray-400 font-normal">(optional)</span></label>
            <Input
              placeholder="e.g. TUT01 or WS01, WS02"
              value={form.tutorialWorkshop}
              onChange={(e) => setForm({ ...form, tutorialWorkshop: e.target.value })}
              className="h-12 rounded-xl bg-[#767680]/[0.08] border-none shadow-none focus-visible:ring-1 focus-visible:ring-[#0a84ff]"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Group <span className="text-gray-400 font-normal">(optional)</span></label>
            <Input
              placeholder="e.g. Group A"
              value={form.groupId}
              onChange={(e) => setForm({ ...form, groupId: e.target.value })}
              className="h-12 rounded-xl bg-[#767680]/[0.08] border-none shadow-none focus-visible:ring-1 focus-visible:ring-[#0a84ff]"
            />
          </div>
        </div>

        <div className="mt-auto bg-white px-6 pb-4 pt-4">
          <Button
            className="h-12 w-full rounded-xl bg-[#0a84ff] hover:bg-[#0070e0] text-base text-white"
            onClick={handleAddStudent}
            disabled={!form.firstName || !form.lastName}
          >
            Add Student
          </Button>
        </div>
      </div>
    );
  }

  /* ───────────────── View / Edit Student ───────────────── */
  if (viewMode === "view" && viewingStudentId) {
    const viewingStudent = students.find(s => s.id === viewingStudentId);
    if (!viewingStudent) {
      setViewMode("list");
      return null;
    }
    const viewCourse = viewingStudent.courseId ? courseMap[viewingStudent.courseId] : null;

    return (
      <div className="flex flex-1 min-h-0 flex-col bg-[#f7f7f8]">
        {/* Header */}
        <div className="shrink-0 px-4 pt-4 pb-3 bg-[#f7f7f8]">
          <div className="flex items-center justify-between">
            <button
              onClick={() => { setViewMode("list"); setViewingStudentId(null); setIsEditing(false); }}
              className="flex items-center gap-1 text-[#0a84ff] font-medium text-base"
            >
              <ChevronLeft className="h-5 w-5" />
              Students
            </button>
            {isEditing && (
              <button
                onClick={() => {
                  setEditForm({
                    firstName: viewingStudent.firstName,
                    lastName: viewingStudent.lastName,
                    studentNumber: viewingStudent.studentNumber,
                    email: viewingStudent.email || "",
                    groupId: viewingStudent.groupId || "",
                    tutorialWorkshop: viewingStudent.tutorialWorkshop || "",
                    courseId: viewingStudent.courseId || "",
                  });
                  setIsEditing(false);
                }}
                className="text-[#0a84ff] font-medium text-base"
              >
                Cancel
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-6">
          {isEditing ? (
            /* ── Edit Mode ── */
            <div className="space-y-4 pt-2">
              <div className="bg-white rounded-2xl p-5 shadow-sm space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">First Name</label>
                    <Input
                      value={editForm.firstName}
                      onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                      className="h-12 rounded-xl bg-[#767680]/[0.08] border-none shadow-none focus-visible:ring-1 focus-visible:ring-[#0a84ff]"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Last Name</label>
                    <Input
                      value={editForm.lastName}
                      onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                      className="h-12 rounded-xl bg-[#767680]/[0.08] border-none shadow-none focus-visible:ring-1 focus-visible:ring-[#0a84ff]"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Student ID</label>
                  <Input
                    value={editForm.studentNumber}
                    onChange={(e) => setEditForm({ ...editForm, studentNumber: e.target.value })}
                    className="h-12 rounded-xl bg-[#767680]/[0.08] border-none shadow-none focus-visible:ring-1 focus-visible:ring-[#0a84ff]"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Email Address</label>
                  <Input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className="h-12 rounded-xl bg-[#767680]/[0.08] border-none shadow-none focus-visible:ring-1 focus-visible:ring-[#0a84ff]"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Course</label>
                  <CourseDropdown courses={courses} value={editForm.courseId} onChange={(v) => setEditForm({ ...editForm, courseId: v })} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Tutorial / Workshop</label>
                  <Input
                    value={editForm.tutorialWorkshop}
                    onChange={(e) => setEditForm({ ...editForm, tutorialWorkshop: e.target.value })}
                    className="h-12 rounded-xl bg-[#767680]/[0.08] border-none shadow-none focus-visible:ring-1 focus-visible:ring-[#0a84ff]"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Group</label>
                  <Input
                    value={editForm.groupId}
                    onChange={(e) => setEditForm({ ...editForm, groupId: e.target.value })}
                    className="h-12 rounded-xl bg-[#767680]/[0.08] border-none shadow-none focus-visible:ring-1 focus-visible:ring-[#0a84ff]"
                  />
                </div>
              </div>

            </div>
          ) : (
            /* ── View Mode ── */
            <div className="space-y-4 pt-2">
              {/* Info card */}
              <div className="bg-white rounded-2xl p-5 shadow-sm">
                <div className="flex items-center gap-4 mb-4">
                  <Avatar className="h-14 w-14 border border-gray-100">
                    <AvatarFallback className="bg-blue-50 text-[#0a84ff] font-bold text-lg">
                      {getInitials(viewingStudent.firstName, viewingStudent.lastName)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h2 className="text-xl font-bold">{viewingStudent.firstName} {viewingStudent.lastName}</h2>
                    <p className="text-sm text-gray-500">{viewingStudent.studentNumber}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  {viewingStudent.email && (
                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-sm text-gray-500">Email</span>
                      <span className="text-sm font-medium text-gray-900">{viewingStudent.email}</span>
                    </div>
                  )}
                  {viewCourse && (
                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-sm text-gray-500">Course</span>
                      <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-[#ff9f0a] text-white">{viewCourse.code}</span>
                    </div>
                  )}
                  {viewingStudent.groupId && (
                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-sm text-gray-500">Group</span>
                      <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-[#af52de] text-white">{viewingStudent.groupId}</span>
                    </div>
                  )}
                  {viewingStudent.tutorialWorkshop && (
                    <div className="flex justify-between items-center py-2">
                      <span className="text-sm text-gray-500">Tutorial / Workshop</span>
                      <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-[#34c759] text-white">{viewingStudent.tutorialWorkshop}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom pinned buttons — matching Courses view */}
        <div className="shrink-0 bg-[#f7f7f8] px-4 pb-4 pt-2 space-y-2">
          {isEditing ? (
            <button
              onClick={handleSaveStudent}
              className="w-full h-12 rounded-xl bg-[#0a84ff] text-white font-medium text-base"
            >
              Save Changes
            </button>
          ) : (
            <>
              <button
                onClick={() => setIsEditing(true)}
                className="w-full h-12 rounded-xl bg-[#0a84ff] text-white font-medium text-base"
              >
                Edit Student
              </button>
              <button
                onClick={() => setDeleteTarget({ id: viewingStudent.id, name: `${viewingStudent.firstName} ${viewingStudent.lastName}` })}
                className="w-full h-12 rounded-2xl bg-white shadow-sm text-red-500 font-medium text-base flex items-center justify-center gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Delete Student
              </button>
            </>
          )}
        </div>

        {/* Delete confirmation for view mode */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <AlertDialogContent className="rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.12)] border-0 w-[90%] max-w-[400px]">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Student</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete {deleteTarget?.name}? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="sm:justify-center flex-row gap-2 pt-2">
              <AlertDialogCancel className="flex-1 mt-0 rounded-xl h-11">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteTarget && deleteSingle(deleteTarget.id)}
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

  /* ───────────────── List view ───────────────── */
  return (
    <div className="flex flex-1 min-h-0 flex-col bg-[#f7f7f8]">
      {/* Sticky header */}
      <div className="shrink-0 px-4 pt-4 pb-2 space-y-4 bg-[#f7f7f8]">
        <div className="flex items-center justify-between mt-2">
          <h1 className="text-3xl font-bold tracking-tight">Students</h1>
          <div className="flex gap-2">
            {isSelectionMode ? (
              <>
                <Button
                  variant="outline" size="icon"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={selectedIds.size === 0}
                  title="Delete Selected"
                  className={`h-10 w-10 rounded-full bg-white shadow-sm border-gray-200 ${selectedIds.size > 0 ? 'text-red-500 hover:text-red-600' : 'text-gray-300'}`}
                >
                  <Trash2 className="h-5 w-5" />
                </Button>
                <Button
                  variant="outline" size="icon"
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
                      variant="outline" size="icon"
                      className="h-10 w-10 rounded-full bg-white shadow-sm border-gray-200 text-gray-500 hover:bg-gray-50"
                    >
                      <MoreVertical className="h-5 w-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52 rounded-xl">
                    <DropdownMenuItem onClick={toggleSelectionMode} className="gap-2 cursor-pointer py-2">
                      <CheckSquare className="h-4 w-4" />
                      <span>Select Students</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => fileInputRef.current?.click()} className="gap-2 cursor-pointer py-2">
                      <Upload className="h-4 w-4" />
                      <span>Bulk Import</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={downloadTemplate} className="gap-2 cursor-pointer py-2">
                      <FileSpreadsheet className="h-4 w-4 text-[#0a84ff]" />
                      <span>Download Template</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileImport}
                  accept=".csv"
                  className="hidden"
                />

                <button
                  onClick={() => navigate("/students/new")}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0a84ff] text-white shadow-md active:scale-95 transition-transform"
                >
                  <Plus className="h-6 w-6" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Search + Filter */}
        <div className="relative flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by name, ID, email or group..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 rounded-[10px] bg-[#767680]/[0.12] pl-9 border-none shadow-none text-[17px] focus-visible:ring-0 placeholder:text-[17px] placeholder:text-[#3C3C43]/60 w-full"
            />
          </div>
          <button
            onClick={() => setShowFilterSheet(true)}
            className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#767680]/[0.12] text-gray-500 transition-colors"
          >
            <Filter className="h-4 w-4" />
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#0a84ff] text-[10px] font-bold text-white">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-6">
        <div className="space-y-3 pt-2">
          {loading ? (
            <div className="fixed inset-0 z-40 flex items-center justify-center">
              <LoadSplash />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-gray-500 bg-[#767680]/[0.04] rounded-2xl">
              <div className="h-12 w-12 rounded-xl bg-[#767680]/[0.08] flex items-center justify-center mb-3">
                <Users className="h-6 w-6 text-gray-400" />
              </div>
              <p className="text-base font-semibold text-gray-900">No students found</p>
              <p className="text-sm mt-1 text-gray-500">Add one to get started.</p>
            </div>
          ) : (
            filtered.map(student => {
              const course = student.courseId ? courseMap[student.courseId] : null;
              return (
                <Card
                  key={student.id}
                  className={`border-0 shadow-sm rounded-2xl cursor-pointer active:scale-[0.98] transition-all ${
                    isSelectionMode && selectedIds.has(student.id)
                      ? 'ring-2 ring-[#0a84ff] ring-offset-1 bg-blue-50/30'
                      : 'bg-white hover:shadow-md'
                  }`}
                  onClick={(e) => {
                    if (isSelectionMode) toggleSelection(student.id, e);
                    else navigate(buildStudentUrl(student));
                  }}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      {isSelectionMode && (
                        <div className={`mt-1 h-5 w-5 rounded-full flex items-center justify-center border shrink-0 ${
                          selectedIds.has(student.id)
                            ? 'bg-[#0a84ff] border-[#0a84ff] text-white'
                            : 'border-gray-300 bg-white'
                        }`}>
                          {selectedIds.has(student.id) && <CheckSquare className="h-3 w-3" />}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        {/* Row 1: Name + Student ID */}
                        <p className="font-bold text-base tracking-tight truncate">{student.firstName} {student.lastName}</p>
                        <p className="text-sm text-gray-500 mt-0.5 truncate">
                          {student.studentNumber}{student.email ? ` · ${student.email}` : ""}
                        </p>

                        {/* Row 2: Course chip + delete */}
                        <div className="flex items-center justify-between mt-2.5">
                          <div className="flex items-center flex-wrap gap-1.5">
                            {course && (
                              <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-[#ff9f0a] text-white">
                                {course.code}
                              </span>
                            )}
                          </div>
                          {!isSelectionMode && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget({ id: student.id, name: `${student.firstName} ${student.lastName}` });
                              }}
                              className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all shrink-0"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>

      {/* Bulk delete confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.12)] border-0 w-[90%] max-w-[400px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Students</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedIds.size} selected student(s)? This action cannot be undone.
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

      {/* Single delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.12)] border-0 w-[90%] max-w-[400px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Student</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {deleteTarget?.name}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-center flex-row gap-2 pt-2">
            <AlertDialogCancel className="flex-1 mt-0 rounded-xl h-11">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteSingle(deleteTarget.id)}
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
              {/* Course */}
              {filterOptions.courseIds.length > 0 && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-500 uppercase tracking-wide">Course</label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setFilterCourse("all")}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                        filterCourse === "all" ? "bg-[#ff9f0a] text-white" : "bg-[#767680]/[0.08] text-gray-700"
                      }`}
                    >
                      All
                    </button>
                    {filterOptions.courseIds.map(cId => {
                      const c = courses.find(x => x.id === cId);
                      return (
                        <button
                          key={cId}
                          onClick={() => setFilterCourse(cId)}
                          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                            filterCourse === cId ? "bg-[#ff9f0a] text-white" : "bg-[#767680]/[0.08] text-gray-700"
                          }`}
                        >
                          {c?.code || cId}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Group */}
              {filterOptions.groups.length > 0 && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-500 uppercase tracking-wide">Group</label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setFilterGroup("all")}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                        filterGroup === "all" ? "bg-[#0a84ff] text-white" : "bg-[#767680]/[0.08] text-gray-700"
                      }`}
                    >
                      All
                    </button>
                    {filterOptions.groups.map(g => (
                      <button
                        key={g}
                        onClick={() => setFilterGroup(g)}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                          filterGroup === g ? "bg-[#0a84ff] text-white" : "bg-[#767680]/[0.08] text-gray-700"
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Tutorial/Workshop */}
              {filterOptions.tutorials.length > 0 && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-500 uppercase tracking-wide">Tutorial / Workshop</label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setFilterTutorial("all")}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                        filterTutorial === "all" ? "bg-[#34c759] text-white" : "bg-[#767680]/[0.08] text-gray-700"
                      }`}
                    >
                      All
                    </button>
                    {filterOptions.tutorials.map(t => (
                      <button
                        key={t}
                        onClick={() => setFilterTutorial(t)}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                          filterTutorial === t ? "bg-[#34c759] text-white" : "bg-[#767680]/[0.08] text-gray-700"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Sort */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-500 uppercase tracking-wide">Sort By</label>
                <div className="flex flex-wrap gap-2">
                  {([
                    { value: "default", label: "Default" },
                    { value: "alpha-asc", label: "A → Z" },
                    { value: "alpha-desc", label: "Z → A" },
                    { value: "id-asc", label: "ID ↑" },
                    { value: "id-desc", label: "ID ↓" },
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