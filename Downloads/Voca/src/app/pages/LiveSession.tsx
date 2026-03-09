import React, { useState, useEffect, useRef } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router";
import * as kv from "../utils/kv";
import { Assessment, Student, TranscriptSegment } from "../types";
import { Mic, MicOff, Square, Activity, StopCircle, User } from "lucide-react";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { LoadSplash } from "../components/LoadSplash";
import { slugMatch, buildAssessmentUrl } from "../utils/urlHelpers";

const mockTranscript = [
  "Good morning everyone, today I'll be discussing the impact of AI on modern healthcare.",
  "As we can see from the latest data, diagnostic accuracy has improved by nearly 20%.",
  "One major challenge, however, remains data privacy and patient consent.",
  "To address this, robust anonymization protocols are currently being deployed.",
  "In conclusion, the benefits outweigh the risks if managed carefully. Thank you.",
];

export default function LiveSession() {
  const { year, term, courseCode, name: nameSlug } = useParams();
  const [searchParams] = useSearchParams();
  const studentId = searchParams.get("studentId");
  const navigate = useNavigate();

  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const [recording, setRecording] = useState(false);
  const [transcripts, setTranscripts] = useState<TranscriptSegment[]>([]);
  const [timer, setTimer] = useState(0);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const simRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    async function load() {
      if (!year || !term || !courseCode || !nameSlug) return;
      try {
        const all = (await kv.getByPrefix("CHATGPT_assessments_")) as Assessment[];
        const match = all.find(
          (a) =>
            (a.year || "") === decodeURIComponent(year) &&
            (a.term || "") === decodeURIComponent(term) &&
            (a.courseCode || a.courseId || "") === decodeURIComponent(courseCode) &&
            slugMatch(a.title, nameSlug)
        );
        setAssessment(match || null);
        if (match && studentId) {
          const s = match.students?.find((st: Student) => st.id === studentId);
          setStudent(s || null);
        }
      } catch (err) {
        console.error(err);
      }
    }
    load();
    return () => stopRecording();
  }, [year, term, courseCode, nameSlug, studentId]);

  const startRecording = () => {
    setRecording(true);
    setTimer(0);
    setTranscripts([]);
    intervalRef.current = setInterval(() => setTimer((t) => t + 1), 1000);

    let idx = 0;
    simRef.current = setInterval(() => {
      if (idx < mockTranscript.length) {
        setTranscripts((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            text: mockTranscript[idx],
            speaker: student?.firstName || "Student",
            startTime: timer,
            endTime: timer + 5,
          },
        ]);
        idx++;
      } else {
        if (simRef.current) clearInterval(simRef.current);
      }
    }, 4000);
  };

  const stopRecording = () => {
    setRecording(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (simRef.current) clearInterval(simRef.current);
  };

  const handleFinish = async () => {
    stopRecording();
    if (assessment && studentId) {
      await kv.set(`CHATGPT_transcripts_${assessment.id}_${studentId}`, transcripts);
    }
    if (assessment) {
      navigate(`${buildAssessmentUrl(assessment)}/grade?studentId=${studentId}`);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  if (!assessment || !student) return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#f7f7f8]">
      <LoadSplash />
    </div>
  );

  return (
    <div className="flex h-full flex-col bg-white overflow-hidden">
      <div className="border-b px-6 py-4 flex flex-col items-center justify-center space-y-2 bg-slate-50 relative shrink-0">
        <div className="absolute right-4 top-4 px-3 py-1 bg-white rounded-full text-xs font-bold border shadow-sm flex items-center gap-2">
          {recording && <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />}
          {formatTime(timer)}
        </div>
        <div className="h-16 w-16 bg-white border shadow-sm rounded-full flex items-center justify-center text-slate-400">
          <User className="h-8 w-8" />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-bold">{student.firstName} {student.lastName}</h2>
          <p className="text-xs text-gray-500 uppercase font-medium">{assessment.title} • {assessment.type}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-[#f7f7f8]">
        {transcripts.length === 0 && !recording && (
          <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-3">
            <MicOff className="h-10 w-10" />
            <p>Ready to start the session.</p>
          </div>
        )}
        
        {transcripts.map((t, idx) => (
          <div key={t.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 animate-in slide-in-from-bottom-2">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">{t.speaker}</span>
              <span className="text-[10px] text-gray-400 font-medium bg-gray-50 px-2 py-0.5 rounded-full border">{formatTime(t.startTime)}</span>
            </div>
            <p className="text-slate-800 text-[15px] leading-relaxed">{t.text}</p>
          </div>
        ))}
        {recording && (
          <div className="flex items-center gap-2 text-gray-400 p-2 text-sm animate-pulse">
            <div className="flex gap-1">
              <div className="h-1.5 w-1.5 bg-gray-400 rounded-full" />
              <div className="h-1.5 w-1.5 bg-gray-400 rounded-full delay-100" />
              <div className="h-1.5 w-1.5 bg-gray-400 rounded-full delay-200" />
            </div>
            <span>Listening...</span>
          </div>
        )}
      </div>

      <div className="p-6 pt-4 border-t bg-white flex flex-col gap-3 shrink-0">
        {!recording ? (
          transcripts.length === 0 ? (
            <Button className="h-14 rounded-full text-lg w-full bg-[#0a84ff] hover:bg-[#0a84ff]/90 shadow-lg shadow-blue-500/30" onClick={startRecording}>
              <Mic className="h-6 w-6 mr-2" /> Start Recording
            </Button>
          ) : (
            <div className="flex gap-3">
              <Button variant="outline" className="h-14 rounded-xl flex-1 text-base font-semibold" onClick={startRecording}>
                Restart
              </Button>
              <Button className="h-14 rounded-xl flex-[2] text-base font-semibold bg-[#0a84ff] hover:bg-[#0a84ff]/90" onClick={handleFinish}>
                Proceed to Grading
              </Button>
            </div>
          )
        ) : (
          <Button variant="destructive" className="h-14 rounded-full text-lg w-full shadow-lg shadow-red-500/20" onClick={stopRecording}>
            <StopCircle className="h-6 w-6 mr-2" /> Stop Recording
          </Button>
        )}
      </div>
    </div>
  );
}