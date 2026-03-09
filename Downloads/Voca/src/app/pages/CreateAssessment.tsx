import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { ChevronDown, CheckCircle2, ChevronLeft } from "lucide-react";
import * as kv from "../utils/kv";
import { toast } from "sonner";
import { Assessment, Course } from "../types";
import { FormatDropdown } from "../components/FormatDropdown";
import { DebateSetup } from "../components/DebateSetup";
import { buildAssessmentUrl } from "../utils/urlHelpers";

export default function CreateAssessment() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [showCourseDropdown, setShowCourseDropdown] = useState(false);
  const [courseSearch, setCourseSearch] = useState("");

  useEffect(() => {
    async function fetchCourses() {
      try {
        const courseData = await kv.getByPrefix("CHATGPT_courses_");
        if (courseData && courseData.length > 0) {
          setCourses(courseData as Course[]);
        }
      } catch (err) {
        console.error("Failed to load courses:", err);
      }
    }
    fetchCourses();
  }, []);

  const [formData, setFormData] = useState<Partial<Assessment>>({
    title: "",
    courseId: "",
    date: new Date().toISOString().split("T")[0],
    type: "presentation",
    term: "",
    year: new Date().getFullYear().toString(),
    status: "draft",
    students: [],
    rubric: [],
  });

  const handleCreate = async () => {
    setLoading(true);
    try {
      const id = crypto.randomUUID();
      
      const assessment: Assessment = {
        ...formData,
        id,
        status: "draft",
        students: [],
        rubric: [],
      } as Assessment;

      await kv.set(`CHATGPT_assessments_${id}`, assessment);

      toast.success("Assessment created!");
      navigate(`${buildAssessmentUrl(assessment)}/share`);
    } catch (error) {
      toast.error("Failed to create assessment");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const isValid = formData.title && formData.courseId;

  return (
    <div className="flex flex-1 min-h-0 flex-col bg-[#F4F8FB]">
      <div className="flex-1 px-5 py-6 overflow-y-auto hide-scrollbar">
        <div className="space-y-6 max-w-md mx-auto animate-in fade-in slide-in-from-bottom-2">
          {(!formData.type || !formData.type.includes("debate")) && (
            <h2 className="text-[24px] font-bold tracking-tight text-[#1a1a24]">New Assessment</h2>
          )}

          <div className="space-y-5">
            {/* Title */}
            <div className="space-y-1.5">
              <label className="text-[14px] font-bold text-[#45474B]">Title</label>
              <Input
                placeholder="e.g. Final Presentations"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="h-12 rounded-[14px] bg-white border border-gray-200 shadow-sm text-[15px] placeholder:text-[#8E8E93]"
              />
            </div>

            {/* Course Code */}
            <div className="space-y-1.5">
              <label className="text-[14px] font-bold text-[#45474B]">Course Code</label>
              <div className="relative">
                <div
                  className="flex h-12 w-full items-center justify-between rounded-[14px] bg-white border border-gray-200 shadow-sm px-4 cursor-pointer"
                  onClick={() => setShowCourseDropdown(!showCourseDropdown)}
                >
                  <span className={formData.courseCode ? "text-[15px] text-[#1a1a24] font-medium" : "text-[15px] text-[#8E8E93]"}>
                    {formData.courseCode || "Select a course..."}
                  </span>
                  <ChevronDown className={`h-4 w-4 text-[#8E8E93] transition-transform ${showCourseDropdown ? "rotate-180" : ""}`} />
                </div>
                {showCourseDropdown && (
                  <div className="absolute z-20 mt-2 w-full bg-white rounded-[16px] shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-gray-100 overflow-hidden">
                    <div className="p-2 border-b border-gray-50">
                      <Input
                        placeholder="Search courses..."
                        value={courseSearch}
                        onChange={(e) => setCourseSearch(e.target.value)}
                        className="h-10 rounded-lg bg-gray-50 border-none shadow-none text-[14px] placeholder:text-gray-400"
                        autoFocus
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto p-1">
                      {courses.length === 0 ? (
                        <div className="px-4 py-6 text-center text-[14px] text-[#8E8E93]">
                          No courses created yet.
                          <br />
                          <span className="text-[12px]">Create a course first from the Courses tab.</span>
                        </div>
                      ) : courses
                        .filter((c) =>
                          c.code.toLowerCase().includes(courseSearch.toLowerCase()) ||
                          c.name.toLowerCase().includes(courseSearch.toLowerCase())
                        ).length === 0 ? (
                        <div className="px-4 py-4 text-center text-[14px] text-[#8E8E93]">
                          No matching courses found.
                        </div>
                      ) : (
                        courses
                          .filter((c) =>
                            c.code.toLowerCase().includes(courseSearch.toLowerCase()) ||
                            c.name.toLowerCase().includes(courseSearch.toLowerCase())
                          )
                          .map((course) => (
                            <div
                              key={course.id}
                              className={`flex items-center gap-3 px-3 py-3 cursor-pointer rounded-[10px] transition-colors ${
                                formData.courseId === course.id
                                  ? "bg-[#0a84ff]/10"
                                  : "hover:bg-gray-50"
                              }`}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setFormData({
                                  ...formData,
                                  courseId: course.id,
                                  courseCode: course.code,
                                  courseName: course.name,
                                  term: course.term || formData.term,
                                  year: course.year || formData.year,
                                });
                                setShowCourseDropdown(false);
                                setCourseSearch("");
                              }}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="text-[14px] font-semibold text-[#1a1a24] truncate">{course.code}</p>
                                  {course.term && (
                                    <span className="px-1.5 py-0.5 rounded-[4px] text-[10px] font-bold bg-[#34c759] text-white whitespace-nowrap">
                                      Term {course.term}
                                    </span>
                                  )}
                                  {course.year && (
                                    <span className="px-1.5 py-0.5 rounded-[4px] text-[10px] font-bold bg-[#0a84ff] text-white whitespace-nowrap">
                                      {course.year}
                                    </span>
                                  )}
                                </div>
                                <p className="text-[12px] text-[#8E8E93] truncate">{course.name}</p>
                              </div>
                              {formData.courseId === course.id && (
                                <CheckCircle2 className="h-4 w-4 text-[#0a84ff] shrink-0" />
                              )}
                            </div>
                          ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Course Name (read-only) */}
            <div className="space-y-1.5">
              <label className="text-[14px] font-bold text-[#45474B]">Course Name</label>
              <div className="flex h-12 w-full items-center rounded-[14px] bg-white border border-gray-100 px-4">
                <span className={`text-[15px] ${formData.courseName ? "text-[#1a1a24]" : "text-[#8E8E93]"}`}>
                  {formData.courseName || "Auto-filled from course selection"}
                </span>
              </div>
            </div>

            {/* Due Date */}
            <div className="space-y-1.5">
              <label className="text-[14px] font-bold text-[#45474B]">Due Date</label>
              <Input
                type="date"
                value={formData.date}
                onChange={(e) => {
                  const newDate = e.target.value;
                  setFormData({ ...formData, date: newDate });
                }}
                className="h-12 rounded-[14px] bg-white border border-gray-200 shadow-sm text-[15px] font-medium"
              />
            </div>

            {/* Format */}
            <div className="space-y-1.5">
              <label className="text-[14px] font-bold text-[#45474B]">Format</label>
              <FormatDropdown
                value={formData.type || "presentation"}
                onChange={(val) => {
                  setFormData((prev) => {
                    const next = { ...prev, type: val as any };
                    if (val.includes("debate") && !prev.debateConfig) {
                      next.debateConfig = {
                        topic: "",
                        teamSizeLimit: 3,
                        rounds: [
                          { id: crypto.randomUUID(), name: "Opening Statements", speakingTeam: "both", timeLimit: 300 },
                          { id: crypto.randomUUID(), name: "Rebuttal", speakingTeam: "both", timeLimit: 180 },
                          { id: crypto.randomUUID(), name: "Closing Statements", speakingTeam: "both", timeLimit: 120 },
                        ],
                        teams: [
                          { name: "for", studentIds: [] },
                          { name: "against", studentIds: [] }
                        ]
                      };
                    }
                    return next;
                  });
                }}
              />
            </div>

            {formData.type?.includes("debate") && formData.debateConfig && (
              <div className="pt-2">
                <DebateSetup 
                  config={formData.debateConfig}
                  courseId={formData.courseId || ""}
                  onChange={(config) => setFormData({ ...formData, debateConfig: config })}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sticky footer */}
      <div className="p-5 bg-gradient-to-t from-[#F4F8FB] via-[#F4F8FB] to-transparent shrink-0">
        <Button
          className="w-full h-14 rounded-[16px] text-[17px] font-bold shadow-[0_4px_14px_rgba(10,132,255,0.25)] bg-[#0a84ff] hover:bg-[#0070e6] transition-all active:scale-[0.98]"
          onClick={handleCreate}
          disabled={!isValid || loading}
        >
          {loading ? "Creating..." : "Create Assessment"}
        </Button>
      </div>
    </div>
  );
}