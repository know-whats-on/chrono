import React, { useState, useEffect } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router";
import * as kv from "../utils/kv";
import { Assessment, Student, TranscriptSegment, Grade } from "../types";
import { Activity, Bot, ChevronDown, CheckCircle2 } from "lucide-react";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { LoadSplash } from "../components/LoadSplash";
import { slugMatch, buildAssessmentUrl } from "../utils/urlHelpers";

export default function GradeAssessment() {
  const { year, term, courseCode, name: nameSlug } = useParams();
  const [searchParams] = useSearchParams();
  const studentId = searchParams.get("studentId");
  const navigate = useNavigate();

  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const [transcripts, setTranscripts] = useState<TranscriptSegment[]>([]);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"rubric" | "transcript">("rubric");

  useEffect(() => {
    async function load() {
      if (!year || !term || !courseCode || !nameSlug || !studentId) return;
      try {
        const all = (await kv.getByPrefix("CHATGPT_assessments_")) as Assessment[];
        const assessData = all.find(
          (a) =>
            (a.year || "") === decodeURIComponent(year) &&
            (a.term || "") === decodeURIComponent(term) &&
            (a.courseCode || a.courseId || "") === decodeURIComponent(courseCode) &&
            slugMatch(a.title, nameSlug)
        ) || null;

        setAssessment(assessData);
        if (assessData) {
          const s = assessData.students?.find((st: Student) => st.id === studentId);
          setStudent(s || null);

          const [transData, gradeData] = await Promise.all([
            kv.get(`CHATGPT_transcripts_${assessData.id}_${studentId}`),
            kv.get(`CHATGPT_grades_${assessData.id}_${studentId}`),
          ]);
          setTranscripts(transData || []);

          if (gradeData) {
            setScores(gradeData.scores);
            setFeedback(gradeData.feedback);
          } else {
            const initialScores: Record<string, number> = {};
            assessData.rubric?.forEach((r: any) => {
              initialScores[r.id] = Math.max(0, r.maxScore - Math.floor(Math.random() * 3));
            });
            setScores(initialScores);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [year, term, courseCode, nameSlug, studentId]);

  const handleSave = async () => {
    if (!assessment || !studentId) return;
    setSaving(true);
    try {
      const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
      const grade: Grade = {
        assessmentId: assessment.id,
        studentId: studentId,
        scores,
        totalScore,
        feedback,
        gradedAt: new Date().toISOString(),
        gradedBy: "Current Instructor"
      };
      await kv.set(`CHATGPT_grades_${assessment.id}_${studentId}`, grade);
      toast.success("Grade saved successfully!");
      navigate(buildAssessmentUrl(assessment));
    } catch (err) {
      toast.error("Failed to save grade");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !assessment || !student) return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#f7f7f8]">
      <LoadSplash />
    </div>
  );

  const maxTotal = assessment.rubric?.reduce((a, b) => a + b.maxScore, 0) || 0;
  const currentTotal = Object.values(scores).reduce((a, b) => a + b, 0) || 0;

  return (
    <div className="flex h-full flex-col bg-[#f7f7f8] overflow-hidden">
      <div className="bg-white px-4 py-3 border-b flex justify-between items-center shrink-0">
        <div>
          <h2 className="font-bold text-lg">{student.firstName} {student.lastName}</h2>
          <p className="text-xs text-gray-500">Grading • {assessment.title}</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-[#0a84ff]">{currentTotal}<span className="text-sm text-gray-400 font-normal">/{maxTotal}</span></div>
        </div>
      </div>

      <div className="flex px-4 pt-2 gap-2 bg-white border-b shrink-0">
        <button 
          className={`pb-2 px-2 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'rubric' ? 'border-[#0a84ff] text-[#0a84ff]' : 'border-transparent text-gray-500'}`}
          onClick={() => setActiveTab('rubric')}
        >
          Rubric & Score
        </button>
        <button 
          className={`pb-2 px-2 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'transcript' ? 'border-[#0a84ff] text-[#0a84ff]' : 'border-transparent text-gray-500'}`}
          onClick={() => setActiveTab('transcript')}
        >
          Transcript
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === 'rubric' && (
          <div className="space-y-4 pb-4 animate-in slide-in-from-right-2">
            <div className="bg-blue-50 text-blue-800 text-xs p-3 rounded-xl flex items-start gap-2 border border-blue-100">
              <Bot className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
              <p>AI has pre-filled suggested scores based on the transcript and your rubric definitions.</p>
            </div>

            {assessment.rubric?.map((item) => (
              <div key={item.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-slate-800">{item.label}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>
                  </div>
                  <div className="flex items-center gap-1 bg-gray-50 px-2 py-1 rounded-lg border">
                    <input 
                      type="number" 
                      className="w-10 text-right bg-transparent text-lg font-bold outline-none"
                      value={scores[item.id] || 0}
                      onChange={(e) => setScores({ ...scores, [item.id]: parseInt(e.target.value) || 0 })}
                      max={item.maxScore}
                      min={0}
                    />
                    <span className="text-sm text-gray-400">/ {item.maxScore}</span>
                  </div>
                </div>
                {/* AI justification snippet mock */}
                <div className="text-xs text-gray-500 pl-3 border-l-2 border-blue-200 bg-blue-50/50 p-2 rounded-r-lg italic">
                  "Transcript evidence shows strong performance in {item.label.toLowerCase()}."
                </div>
              </div>
            ))}

            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-2">
              <label className="font-bold text-slate-800 text-sm">Overall Feedback</label>
              <textarea 
                className="w-full h-24 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0a84ff] resize-none"
                placeholder="Add qualitative feedback for the student..."
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
              />
            </div>
          </div>
        )}

        {activeTab === 'transcript' && (
          <div className="space-y-3 pb-4 animate-in slide-in-from-left-2">
            {transcripts.length === 0 ? (
              <p className="text-center text-gray-500 py-8">No transcript recorded.</p>
            ) : (
              transcripts.map((t) => (
                <div key={t.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold text-gray-500 uppercase">{t.speaker}</span>
                  </div>
                  <p className="text-slate-800 text-[15px] leading-relaxed">{t.text}</p>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <div className="p-4 bg-white border-t mt-auto shrink-0 flex gap-3">
        <Button variant="outline" className="h-12 flex-1 rounded-xl" onClick={() => navigate(-1)}>Cancel</Button>
        <Button className="h-12 flex-[2] rounded-xl bg-[#0a84ff] hover:bg-[#0a84ff]/90" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Grade"} <CheckCircle2 className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}