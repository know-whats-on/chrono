import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router";
import {
  ChevronLeft, StopCircle, Users, User,
  Mic, RefreshCw, ChevronDown, ChevronUp,
  FlaskConical, CheckCircle2, BarChart3, ArrowDown,
  ChevronRight, Award, FileText, X,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import * as api from "../utils/api";
import * as kv from "../utils/kv";
import { Session, TranscriptChunk, Assessment, SavedRubric, RubricMetric, SentenceAnalysis } from "../types";
import { LoadSplash } from "../components/LoadSplash";

/* ─── Metric color palette ─── */
const METRIC_COLORS = [
  "#0a84ff", "#af52de", "#ff9f0a", "#34c759",
  "#ff3b30", "#5856d6", "#30b0c7", "#ff6482",
];

/* ─── Speaker color palette ─── */
const SPEAKER_COLORS = [
  { bg: "bg-[#0a84ff]/10", text: "text-[#0a84ff]", badge: "bg-[#0a84ff]" },
  { bg: "bg-[#af52de]/10", text: "text-[#af52de]", badge: "bg-[#af52de]" },
  { bg: "bg-[#ff9f0a]/10", text: "text-[#ff9f0a]", badge: "bg-[#ff9f0a]" },
  { bg: "bg-[#34c759]/10", text: "text-[#34c759]", badge: "bg-[#34c759]" },
  { bg: "bg-[#ff3b30]/10", text: "text-[#ff3b30]", badge: "bg-[#ff3b30]" },
  { bg: "bg-[#5856d6]/10", text: "text-[#5856d6]", badge: "bg-[#5856d6]" },
];

const GRADE_COLORS: Record<string, string> = {
  HD: "#0a84ff", D: "#34c759", C: "#ff9f0a", P: "#af52de", F: "#ff3b30",
};

/* ─── Mock transcript sentences for test simulation ─── */
const TEST_SENTENCES = [
  "Good morning everyone, today I will be discussing the role of renewable energy in urban planning.",
  "First, let me provide some context about why sustainable infrastructure matters for growing cities.",
  "According to recent studies, solar panel adoption has increased by over 40% in metropolitan areas.",
  "However, the initial cost remains a significant barrier for lower-income communities.",
  "I'd like to now walk you through my proposed framework for equitable energy distribution.",
  "The framework has three key pillars: accessibility, affordability, and environmental impact.",
  "Let me demonstrate with a case study from Melbourne's western suburbs.",
  "Community engagement was critical in gaining support for the rooftop solar initiative.",
  "In conclusion, integrating renewable energy into urban design requires both policy reform and community buy-in.",
  "Thank you for listening. I'm happy to take any questions.",
];

/* ─── Per-student result type ─── */
interface StudentResult {
  studentId: string;
  studentName: string;
  groupId?: string;
  chunks: TranscriptChunk[];
  gradeResult?: {
    overallGrade: string;
    overallScore: number;
    overallFeedback: string;
    dimensions: { metricId: string; grade: string; score: number; feedback: string }[];
  };
  isGrading?: boolean;
}

export default function EngageMonitor() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [transcripts, setTranscripts] = useState<TranscriptChunk[]>([]);
  const [isPolling, setIsPolling] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Rubric data
  const [rubricMetrics, setRubricMetrics] = useState<RubricMetric[]>([]);
  const [rubricName, setRubricName] = useState("");
  const [showLegend, setShowLegend] = useState(true);

  // AI tagging state
  const [chunkTags, setChunkTags] = useState<Record<string, SentenceAnalysis>>({});
  const taggedChunkIds = useRef<Set<string>>(new Set());
  const tagQueueRef = useRef<TranscriptChunk[]>([]);
  const isTagging = useRef(false);
  const [isAiProcessing, setIsAiProcessing] = useState(false);

  // Test simulation
  const [isTestRunning, setIsTestRunning] = useState(false);
  const testTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const testIndexRef = useRef(0);

  // Coverage summary
  const [showSummary, setShowSummary] = useState(false);

  // Rubric filter
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  // Smart auto-scroll
  const isNearBottomRef = useRef(true);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  // ── Results view state (after End Session) ──
  const [viewMode, setViewMode] = useState<"live" | "results">("live");
  const [studentResults, setStudentResults] = useState<StudentResult[]>([]);
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);

  // KV cache key for tags
  const tagsCacheKey = sessionId ? `CHATGPT_session_tags_${sessionId}` : "";

  // Color map for metrics
  const metricColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    rubricMetrics.forEach((m, i) => {
      map[m.id] = METRIC_COLORS[i % METRIC_COLORS.length];
    });
    return map;
  }, [rubricMetrics]);

  // Speaker color mapping
  const speakerColorMap = useMemo(() => {
    const map = new Map<string, (typeof SPEAKER_COLORS)[0]>();
    let idx = 0;
    transcripts.forEach((t) => {
      if (!map.has(t.studentId)) {
        map.set(t.studentId, SPEAKER_COLORS[idx % SPEAKER_COLORS.length]);
        idx++;
      }
    });
    return map;
  }, [transcripts]);

  // Currently speaking detection (most recent chunk within 8 seconds)
  const currentlySpeaking = useMemo(() => {
    if (!session || session.status !== "active") return null;
    const now = Date.now();
    const recent = transcripts
      .filter((t) => t.isFinal && now - t.timestamp < 8000)
      .sort((a, b) => b.timestamp - a.timestamp);
    return recent.length > 0 ? recent[0].studentName : null;
  }, [transcripts, session]);

  /* ═══════════════════════════════════════════════════
     1. LOAD SESSION + RUBRIC + CACHED TAGS
     ═══════════════════════════════════════════════════ */
  useEffect(() => {
    if (!sessionId) return;
    (async () => {
      try {
        const s = await api.getSession(sessionId);
        setSession(s);

        // Load rubric
        if (s.assessmentId) {
          try {
            const assessment = (await kv.get(
              `CHATGPT_assessments_${s.assessmentId}`
            )) as Assessment | null;
            if (assessment?.linkedRubricId) {
              const rubric = (await kv.get(
                `CHATGPT_rubrics_${assessment.linkedRubricId}`
              )) as SavedRubric | null;
              if (rubric?.metrics?.length) {
                setRubricMetrics(rubric.metrics);
                setRubricName(rubric.name || rubric.assessmentName || "Rubric");
              }
            }
          } catch (err) {
            console.error("Failed to load rubric:", err);
          }
        }

        // Restore cached tags
        try {
          const cached = await kv.get(`CHATGPT_session_tags_${sessionId}`);
          if (cached && typeof cached === "object") {
            setChunkTags(cached as Record<string, SentenceAnalysis>);
            Object.keys(cached as Record<string, SentenceAnalysis>).forEach((id) =>
              taggedChunkIds.current.add(id)
            );
          }
        } catch {}

        if (s.status === "completed") {
          setIsPolling(false);
          setViewMode("results");
        }
      } catch (err: any) {
        toast.error("Session not found");
        navigate("/engage");
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionId]);

  /* ═══════════════════════════════════════════════════
     2. POLL TRANSCRIPTS
     ═══════════════════════════════════════════════════ */
  const fetchTranscripts = useCallback(async () => {
    if (!sessionId) return;
    try {
      const data = await api.getTranscripts(sessionId);
      setTranscripts(data);
    } catch (err) {
      console.error("Failed to fetch transcripts:", err);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || !isPolling) return;
    fetchTranscripts();
    pollRef.current = setInterval(fetchTranscripts, 1500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [sessionId, isPolling, fetchTranscripts]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current && viewMode === "live") {
      const el = scrollRef.current;
      const isNearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 100;
      isNearBottomRef.current = isNearBottom;
      if (isNearBottom) {
        el.scrollTop = el.scrollHeight;
      } else {
        setShowScrollBtn(true);
      }
    }
  }, [transcripts, chunkTags, viewMode]);

  /* ═══════════════════════════════════════════════════
     3. AI TAGGING WITH KV CACHE PERSISTENCE
     ═══════════════════════════════════════════════════ */
  useEffect(() => {
    if (rubricMetrics.length === 0) return;
    const finalChunks = transcripts.filter((t) => t.isFinal);
    const newChunks = finalChunks.filter((t) => !taggedChunkIds.current.has(t.id));
    if (newChunks.length === 0) return;
    newChunks.forEach((c) => {
      taggedChunkIds.current.add(c.id);
      tagQueueRef.current.push(c);
    });
    processTagQueue();
  }, [transcripts, rubricMetrics]);

  const processTagQueue = async () => {
    if (isTagging.current || tagQueueRef.current.length === 0 || rubricMetrics.length === 0) return;
    isTagging.current = true;
    setIsAiProcessing(true);

    const batch = tagQueueRef.current.splice(0, 10);
    const sentences = batch.map((c) => ({ id: c.id, text: c.text }));
    const metricsInput = rubricMetrics.map((m, i) => ({
      id: m.id,
      name: m.name,
      color: METRIC_COLORS[i % METRIC_COLORS.length],
      description: m.grades?.highDistinction || "",
    }));

    try {
      const results = await api.tagRubric(sentences, metricsInput);
      const newTags: Record<string, SentenceAnalysis> = {};
      results.forEach((r) => { newTags[r.sentence_id] = r; });

      setChunkTags((prev) => {
        const merged = { ...prev, ...newTags };
        if (tagsCacheKey) {
          kv.set(tagsCacheKey, merged).catch(() => {});
        }
        return merged;
      });
    } catch (err) {
      console.error("AI tagging failed:", err);
    } finally {
      isTagging.current = false;
      setIsAiProcessing(tagQueueRef.current.length > 0);
      if (tagQueueRef.current.length > 0) {
        setTimeout(processTagQueue, 100);
      }
    }
  };

  /* ═══════════════════════════════════════════════════
     4. TEST SIMULATION
     ═══════════════════════════════════════════════════ */
  const startTestSimulation = () => {
    if (!session || !sessionId) return;
    setIsTestRunning(true);
    testIndexRef.current = 0;
    toast("Test simulation started", { icon: "🧪" });

    const pushChunk = async () => {
      const idx = testIndexRef.current;
      if (idx >= TEST_SENTENCES.length) {
        if (testTimerRef.current) clearInterval(testTimerRef.current);
        setIsTestRunning(false);
        toast.success("Test simulation complete");
        return;
      }
      const chunk: TranscriptChunk = {
        id: `test-chunk-${sessionId}-${idx}`,
        sessionId,
        studentId: "test-student-001",
        studentName: "Test Student",
        text: TEST_SENTENCES[idx],
        timestamp: Date.now(),
        isFinal: true,
      };
      try {
        await api.appendTranscript(sessionId, chunk);
        testIndexRef.current = idx + 1;
      } catch (err) {
        console.error("Test chunk push failed:", err);
      }
    };

    pushChunk();
    testTimerRef.current = setInterval(pushChunk, 3000);
  };

  const stopTestSimulation = () => {
    if (testTimerRef.current) clearInterval(testTimerRef.current);
    setIsTestRunning(false);
    toast("Test simulation stopped");
  };

  useEffect(() => {
    return () => { if (testTimerRef.current) clearInterval(testTimerRef.current); };
  }, []);

  /* ═══════════════════════════════════════════════════
     5. END SESSION — build results & show student cards
     ═══════════════════════════════════════════════════ */
  const handleEndSession = async () => {
    if (!session) return;
    try {
      if (testTimerRef.current) clearInterval(testTimerRef.current);
      setIsTestRunning(false);

      await api.updateSession(session.id, {
        status: "completed",
        completedAt: new Date().toISOString(),
      });

      // Final cache persist
      if (tagsCacheKey && Object.keys(chunkTags).length > 0) {
        await kv.set(tagsCacheKey, chunkTags).catch(() => {});
      }

      setSession((prev) => (prev ? { ...prev, status: "completed" } : null));
      setIsPolling(false);
      toast.success("Session ended");

      // Build student results and switch to results view
      buildStudentResults();
      setViewMode("results");
    } catch {
      toast.error("Failed to end session");
    }
  };

  const buildStudentResults = useCallback(() => {
    const studentMap = new Map<string, StudentResult>();
    const finalChunks = transcripts.filter((t) => t.isFinal);

    finalChunks.forEach((chunk) => {
      if (!studentMap.has(chunk.studentId)) {
        studentMap.set(chunk.studentId, {
          studentId: chunk.studentId,
          studentName: chunk.studentName,
          groupId: chunk.groupId,
          chunks: [],
        });
      }
      studentMap.get(chunk.studentId)!.chunks.push(chunk);
    });

    const results = Array.from(studentMap.values()).sort((a, b) =>
      a.studentName.localeCompare(b.studentName)
    );
    setStudentResults(results);

    // Fire off AI grading for each student (if rubric available)
    if (rubricMetrics.length > 0) {
      results.forEach((sr) => {
        generateStudentGrade(sr.studentId, sr.studentName, sr.chunks);
      });
    }
  }, [transcripts, rubricMetrics]);

  // Also build results when switching to results view for completed sessions
  useEffect(() => {
    if (viewMode === "results" && studentResults.length === 0 && transcripts.length > 0) {
      buildStudentResults();
    }
  }, [viewMode, transcripts, studentResults.length, buildStudentResults]);

  const generateStudentGrade = async (studentId: string, studentName: string, chunks: TranscriptChunk[]) => {
    setStudentResults((prev) =>
      prev.map((sr) => sr.studentId === studentId ? { ...sr, isGrading: true } : sr)
    );

    try {
      const transcriptText = chunks.map((c) => c.text).join(" ");
      const metricsInput = rubricMetrics.map((m) => ({
        id: m.id,
        name: m.name,
        weight: m.weight,
        hdDescription: m.grades?.highDistinction || "",
      }));
      const result = await api.suggestGrade(studentName, transcriptText, metricsInput);
      
      if (session?.assessmentId) {
        await kv.set(`CHATGPT_gradeResult_${session.assessmentId}_${studentId}`, {
          studentId,
          result
        });
      }

      setStudentResults((prev) =>
        prev.map((sr) => sr.studentId === studentId ? { ...sr, gradeResult: result, isGrading: false } : sr)
      );
    } catch (err) {
      console.error("Failed to generate grade for", studentName, err);
      setStudentResults((prev) =>
        prev.map((sr) => sr.studentId === studentId ? { ...sr, isGrading: false } : sr)
      );
    }
  };

  /* ═══════════════════════════════════════════════════
     6. COVERAGE STATISTICS
     ═══════════════════════════════════════════════════ */
  const coverageStats = useMemo(() => {
    const finalChunks = transcripts.filter((t) => t.isFinal);
    const totalChunks = finalChunks.length;
    if (totalChunks === 0 || rubricMetrics.length === 0) {
      return { totalChunks: 0, taggedCount: 0, overallPct: 0, perMetric: [] };
    }

    let taggedCount = 0;
    const metricCounts: Record<string, number> = {};
    rubricMetrics.forEach((m) => (metricCounts[m.id] = 0));

    finalChunks.forEach((c) => {
      const sa = chunkTags[c.id];
      if (sa?.analysis?.length > 0) {
        taggedCount++;
        const seen = new Set<string>();
        sa.analysis.forEach((a) => {
          if (a.rubric_id && !seen.has(a.rubric_id) && metricCounts[a.rubric_id] !== undefined) {
            metricCounts[a.rubric_id]++;
            seen.add(a.rubric_id);
          }
        });
      }
    });

    const metricsAddressed = rubricMetrics.filter((m) => metricCounts[m.id] > 0).length;
    const overallPct = Math.round((metricsAddressed / rubricMetrics.length) * 100);

    const perMetric = rubricMetrics.map((m, i) => ({
      id: m.id,
      name: m.name,
      count: metricCounts[m.id],
      pct: totalChunks > 0 ? Math.round((metricCounts[m.id] / totalChunks) * 100) : 0,
      color: METRIC_COLORS[i % METRIC_COLORS.length],
      addressed: metricCounts[m.id] > 0,
    }));

    return { totalChunks, taggedCount, overallPct, perMetric };
  }, [transcripts, chunkTags, rubricMetrics]);

  /* ─── Render tagged text ─── */
  const renderTaggedText = (chunk: TranscriptChunk) => {
    const sa = chunkTags[chunk.id];
    if (!sa?.analysis?.length) return <span>{chunk.text}</span>;

    const text = chunk.text;
    const highlights: { start: number; end: number; color: string; dimension: string; justification: string }[] = [];

    sa.analysis.forEach((a) => {
      if (!a.phrase) return;
      const idx = text.toLowerCase().indexOf(a.phrase.toLowerCase());
      if (idx >= 0) {
        highlights.push({
          start: idx,
          end: idx + a.phrase.length,
          color: a.color || metricColorMap[a.rubric_id] || "#999",
          dimension: a.dimension,
          justification: a.justification,
        });
      }
    });

    if (highlights.length === 0) return <span>{chunk.text}</span>;
    highlights.sort((a, b) => a.start - b.start);

    const segments: React.ReactNode[] = [];
    let cursor = 0;

    highlights.forEach((h, i) => {
      const start = Math.max(h.start, cursor);
      if (start > cursor) segments.push(<span key={`p-${i}`}>{text.slice(cursor, start)}</span>);
      if (start < h.end) {
        segments.push(
          <mark
            key={`hl-${i}`}
            className="rounded px-0.5 py-0 font-medium"
            style={{ backgroundColor: h.color + "30", color: "inherit" }}
            title={`${h.dimension}: ${h.justification}`}
          >
            {text.slice(start, h.end)}
          </mark>
        );
      }
      cursor = Math.max(cursor, h.end);
    });

    if (cursor < text.length) segments.push(<span key="tail">{text.slice(cursor)}</span>);
    return <>{segments}</>;
  };

  /* ═══════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════ */
  if (loading) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#f7f7f8]">
        <LoadSplash />
      </div>
    );
  }

  if (!session) return null;

  const isActive = session.status === "active";
  const isCompleted = session.status === "completed";
  const isGroup = session.type === "group";
  const hasRubric = rubricMetrics.length > 0;

  /* ═══════════════════════════════════════════════════
     RESULTS VIEW — student cards after End Session
     ═══════════════════════════════════════════════════ */
  if (viewMode === "results" && isCompleted) {
    // Expanded student detail
    if (expandedStudent) {
      const sr = studentResults.find((s) => s.studentId === expandedStudent);
      if (!sr) { setExpandedStudent(null); return null; }
      const colors = speakerColorMap.get(sr.studentId) || SPEAKER_COLORS[0];

      return (
        <div className="flex flex-1 min-h-0 flex-col bg-[#f7f7f8]">
          {/* Header */}
          <div className="shrink-0 px-4 pt-4 pb-3 bg-[#f7f7f8]">
            <button
              onClick={() => setExpandedStudent(null)}
              className="flex items-center gap-1 text-[#0a84ff] font-medium text-base"
            >
              <ChevronLeft className="h-5 w-5" /> Results
            </button>
            <div className="mt-3 flex items-center gap-3">
              <div className={`h-10 w-10 rounded-full ${colors.badge} flex items-center justify-center`}>
                <User className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold">{sr.studentName}</h2>
                <p className="text-xs text-gray-500">
                  {sr.chunks.length} segment{sr.chunks.length !== 1 ? "s" : ""}
                  {sr.groupId && ` · ${sr.groupId}`}
                </p>
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
            {/* AI Grade Card */}
            {sr.isGrading && (
              <div className="bg-white rounded-2xl p-5 shadow-sm mb-4 mt-2 flex items-center gap-3">
                <div className="h-4 w-4 border-2 border-gray-300 border-t-[#0a84ff] rounded-full animate-spin" />
                <span className="text-sm text-gray-500">Generating AI suggested grade...</span>
              </div>
            )}
            {sr.gradeResult && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-2xl shadow-sm overflow-hidden mb-4 mt-2"
              >
                <div className="px-5 pt-5 pb-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Award className="h-4 w-4 text-[#0a84ff]" />
                    <h3 className="text-sm font-bold text-gray-900">AI Suggested Grade</h3>
                  </div>
                  <div className="flex items-center gap-3 mt-3">
                    <div
                      className="h-14 w-14 rounded-2xl flex items-center justify-center"
                      style={{ backgroundColor: (GRADE_COLORS[sr.gradeResult.overallGrade] || "#999") + "1A" }}
                    >
                      <span
                        className="text-xl font-bold"
                        style={{ color: GRADE_COLORS[sr.gradeResult.overallGrade] || "#999" }}
                      >
                        {sr.gradeResult.overallGrade}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">
                        {sr.gradeResult.overallScore}/100
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                        {sr.gradeResult.overallFeedback}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Per-dimension grades */}
                {sr.gradeResult.dimensions.length > 0 && (
                  <div className="px-5 pb-5 pt-2 space-y-3">
                    <div className="h-px bg-gray-100" />
                    {sr.gradeResult.dimensions.map((dim) => {
                      const metric = rubricMetrics.find((m) => m.id === dim.metricId);
                      const color = metricColorMap[dim.metricId] || "#999";
                      return (
                        <div key={dim.metricId}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                              <span className="text-xs font-medium text-gray-700 truncate">
                                {metric?.name || dim.metricId}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span
                                className="text-[11px] font-bold px-1.5 py-0.5 rounded"
                                style={{ backgroundColor: (GRADE_COLORS[dim.grade] || "#999") + "1A", color: GRADE_COLORS[dim.grade] || "#999" }}
                              >
                                {dim.grade}
                              </span>
                              <span className="text-[11px] text-gray-500">{dim.score}</span>
                            </div>
                          </div>
                          <p className="text-[11px] text-gray-500 pl-4 leading-relaxed">{dim.feedback}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            )}

            {/* Transcript */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="h-3.5 w-3.5 text-gray-400" />
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Full Transcript</h3>
              </div>
              {sr.chunks.map((chunk) => {
                const sa = chunkTags[chunk.id];
                const uniqueRubricIds = [...new Set((sa?.analysis || []).map((a) => a.rubric_id).filter(Boolean))];
                const primaryColor = uniqueRubricIds.length > 0 ? (metricColorMap[uniqueRubricIds[0]] || null) : null;

                return (
                  <div
                    key={chunk.id}
                    className="bg-white rounded-2xl px-4 py-3 shadow-sm"
                    style={primaryColor ? { borderLeft: `3px solid ${primaryColor}` } : { borderLeft: "3px solid transparent" }}
                  >
                    <p className="text-sm text-gray-900 leading-relaxed">
                      {renderTaggedText(chunk)}
                    </p>
                    <div className="flex items-center justify-between mt-2 gap-2">
                      <div className="flex flex-wrap gap-1 min-w-0">
                        {uniqueRubricIds.map((rid) => {
                          const metric = rubricMetrics.find((m) => m.id === rid);
                          const color = metricColorMap[rid] || "#999";
                          if (!metric) return null;
                          return (
                            <span key={rid} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ backgroundColor: color + "1A", color }}>
                              <span className="h-1 w-1 rounded-full" style={{ backgroundColor: color }} />
                              {metric.name}
                            </span>
                          );
                        })}
                      </div>
                      <span className="text-[10px] text-gray-400 font-mono shrink-0">
                        {new Date(chunk.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      );
    }

    // Student cards list
    return (
      <div className="flex flex-1 min-h-0 flex-col bg-[#f7f7f8]">
        <div className="shrink-0 px-4 pt-4 pb-3 bg-[#f7f7f8]">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate("/engage")}
              className="flex items-center gap-1 text-[#0a84ff] font-medium text-base"
            >
              <ChevronLeft className="h-5 w-5" /> Engage
            </button>
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-gray-100 border border-gray-200">
              <CheckCircle2 className="h-3 w-3 text-gray-500" />
              <span className="text-xs font-semibold text-gray-500">ENDED</span>
            </div>
          </div>
          <h2 className="text-lg font-bold mt-3">{session.assessmentTitle}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{session.courseCode}</p>

          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={() => setViewMode("results")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 text-white text-xs font-semibold"
            >
              <Award className="h-3 w-3" /> Results
            </button>
            <button
              onClick={() => { setViewMode("live"); setShowSummary(true); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-200 text-gray-700 text-xs font-semibold"
            >
              <FileText className="h-3 w-3" /> Full Feed
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
          <p className="text-xs text-gray-500 mt-2 mb-3">
            {studentResults.length} student{studentResults.length !== 1 ? "s" : ""} submitted
          </p>

          {studentResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="h-12 w-12 rounded-xl bg-gray-100 flex items-center justify-center mb-3">
                <Users className="h-6 w-6 text-gray-400" />
              </div>
              <p className="text-sm font-medium text-gray-500">No submissions recorded</p>
            </div>
          ) : (
            <div className="space-y-3">
              {studentResults.map((sr) => {
                const colors = speakerColorMap.get(sr.studentId) || SPEAKER_COLORS[0];
                const grade = sr.gradeResult;

                return (
                  <motion.button
                    key={sr.studentId}
                    onClick={() => setExpandedStudent(sr.studentId)}
                    className="w-full bg-white rounded-2xl p-4 shadow-sm text-left active:scale-[0.98] transition-all"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`h-10 w-10 rounded-full ${colors.badge} flex items-center justify-center shrink-0`}>
                        <User className="h-5 w-5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">{sr.studentName}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {sr.chunks.length} segment{sr.chunks.length !== 1 ? "s" : ""}
                          {sr.groupId && ` · ${sr.groupId}`}
                        </p>
                      </div>

                      {/* Grade badge */}
                      {sr.isGrading && (
                        <div className="h-4 w-4 border-2 border-gray-300 border-t-[#0a84ff] rounded-full animate-spin shrink-0" />
                      )}
                      {grade && (
                        <div
                          className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
                          style={{ backgroundColor: (GRADE_COLORS[grade.overallGrade] || "#999") + "1A" }}
                        >
                          <span className="text-sm font-bold" style={{ color: GRADE_COLORS[grade.overallGrade] || "#999" }}>
                            {grade.overallGrade}
                          </span>
                        </div>
                      )}
                      <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                    </div>
                  </motion.button>
                );
              })}
            </div>
          )}
        </div>

        <div className="shrink-0 bg-[#f7f7f8] px-4 pb-4 pt-2">
          <button
            onClick={() => navigate("/engage")}
            className="w-full h-11 rounded-xl bg-[#0a84ff] text-white text-sm font-medium flex items-center justify-center gap-2 active:scale-[0.97] transition-all"
          >
            Back to Engage
          </button>
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════
     LIVE MONITOR VIEW
     ═══════════════════════════════════════════════════ */
  return (
    <div className="flex flex-1 min-h-0 flex-col bg-[#f7f7f8] relative">
      {/* ── Header ── */}
      <div className="shrink-0 px-4 pt-4 pb-3 bg-[#f7f7f8]">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate("/engage")}
            className="flex items-center gap-1 text-[#0a84ff] font-medium text-base"
          >
            <ChevronLeft className="h-5 w-5" />
            Engage
          </button>
          {isActive && (
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-green-50 border border-green-200">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs font-semibold text-green-700">LIVE</span>
            </div>
          )}
          {isCompleted && (
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-gray-100 border border-gray-200">
              <CheckCircle2 className="h-3 w-3 text-gray-500" />
              <span className="text-xs font-semibold text-gray-500">ENDED</span>
            </div>
          )}
        </div>

        {/* Session info */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <h2 className="text-lg font-bold truncate flex-1 min-w-0">{session.assessmentTitle}</h2>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold text-white shrink-0 ${isGroup ? "bg-[#af52de]" : "bg-[#0a84ff]"}`}>
            {isGroup ? <Users className="h-3 w-3" /> : <User className="h-3 w-3" />}
            {isGroup ? "Group" : "Individual"}
          </span>
        </div>
        <p className="text-xs text-gray-500 mt-0.5">
          {session.courseCode}
        </p>

        {/* Currently speaking banner */}
        {isActive && currentlySpeaking && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="mt-2 flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-50 border border-blue-100"
          >
            <motion.div
              className="h-2.5 w-2.5 rounded-full bg-[#0a84ff]"
              animate={{ scale: [1, 1.4, 1] }}
              transition={{ repeat: Infinity, duration: 1.2 }}
            />
            <span className="text-xs font-semibold text-[#0a84ff]">
              {currentlySpeaking}
            </span>
            <span className="text-xs text-blue-400">is currently speaking</span>
          </motion.div>
        )}

        {/* Rubric legend */}
        {hasRubric && (
          <div className="mt-3">
            <button
              onClick={() => setShowLegend(!showLegend)}
              className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 mb-1.5"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[#0a84ff]" />
              Rubric: {rubricName}
              {showLegend ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
            {showLegend && (
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setActiveFilter(null)}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold transition-all active:scale-[0.95] ${
                    activeFilter === null ? "bg-gray-800 text-white" : "bg-gray-200 text-gray-600"
                  }`}
                >
                  All
                </button>
                {rubricMetrics.map((m, i) => {
                  const color = METRIC_COLORS[i % METRIC_COLORS.length];
                  const isFilterActive = activeFilter === m.id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => setActiveFilter(isFilterActive ? null : m.id)}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold transition-all active:scale-[0.95] ${
                        isFilterActive
                          ? "text-white ring-2 ring-offset-1"
                          : activeFilter !== null
                          ? "opacity-40 text-white"
                          : "text-white"
                      }`}
                      style={{ backgroundColor: color, ...(isFilterActive ? { ringColor: color } : {}) }}
                    >
                      {m.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Scrollable content ── */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto px-4 pb-4"
        onScroll={() => {
          if (!scrollRef.current) return;
          const el = scrollRef.current;
          const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 100;
          isNearBottomRef.current = nearBottom;
          if (nearBottom) setShowScrollBtn(false);
        }}
      >
        {/* Coverage Summary */}
        {showSummary && hasRubric && isCompleted && (
          <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="mb-4 mt-2">
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 pt-5 pb-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-[#0a84ff]" />
                    <h3 className="text-sm font-bold text-gray-900">Rubric Coverage</h3>
                  </div>
                  <button onClick={() => setShowSummary(false)} className="text-xs text-[#0a84ff] font-medium">Hide</button>
                </div>
                <p className="text-xs text-gray-500">
                  {coverageStats.totalChunks} sentence{coverageStats.totalChunks !== 1 ? "s" : ""} analysed &middot; {coverageStats.taggedCount} tagged to rubric
                </p>
              </div>
              <div className="flex items-center justify-center py-4">
                <div className="relative h-28 w-28">
                  <svg className="h-28 w-28 -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="42" fill="none" stroke="#e5e7eb" strokeWidth="8" />
                    <circle cx="50" cy="50" r="42" fill="none"
                      stroke={coverageStats.overallPct >= 80 ? "#34c759" : coverageStats.overallPct >= 50 ? "#ff9f0a" : "#ff3b30"}
                      strokeWidth="8" strokeLinecap="round"
                      strokeDasharray={`${(coverageStats.overallPct / 100) * 264} 264`}
                      className="transition-all duration-700" />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold text-gray-900">{coverageStats.overallPct}%</span>
                    <span className="text-[10px] text-gray-500 font-medium">metrics covered</span>
                  </div>
                </div>
              </div>
              <div className="px-5 pb-5 space-y-3">
                {coverageStats.perMetric.map((m) => (
                  <div key={m.id}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
                        <span className="text-xs font-medium text-gray-700 truncate">{m.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[11px] font-semibold text-gray-900">{m.count}</span>
                        <span className="text-[10px] text-gray-400">({m.pct}%)</span>
                        {m.addressed ? (
                          <CheckCircle2 className="h-3 w-3" style={{ color: m.color }} />
                        ) : (
                          <span className="h-3 w-3 rounded-full border-2 border-gray-200" />
                        )}
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <motion.div className="h-full rounded-full" style={{ backgroundColor: m.color }}
                        initial={{ width: 0 }} animate={{ width: `${Math.min(m.pct, 100)}%` }}
                        transition={{ duration: 0.6, delay: 0.1 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {!showSummary && isCompleted && hasRubric && coverageStats.totalChunks > 0 && (
          <button
            onClick={() => setShowSummary(true)}
            className="flex items-center gap-2 mx-auto mt-2 mb-3 px-4 py-2 rounded-xl bg-white shadow-sm text-sm font-medium text-[#0a84ff] active:scale-[0.97] transition-all"
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Show Coverage Summary ({coverageStats.overallPct}%)
          </button>
        )}

        {/* Transcript Feed */}
        {(() => {
          const allFinalChunks = transcripts.filter((t) => t.isFinal);
          if (allFinalChunks.length === 0) {
            return (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <motion.div
                  className="h-16 w-16 rounded-full bg-blue-50 flex items-center justify-center mb-4"
                  animate={isActive ? { scale: [1, 1.1, 1], opacity: [0.7, 1, 0.7] } : {}}
                  transition={{ repeat: Infinity, duration: 2 }}
                >
                  <Mic className="h-8 w-8 text-[#0a84ff]" />
                </motion.div>
                <h3 className="text-base font-semibold text-gray-900 mb-1">
                  {isActive ? "Waiting for students..." : "No transcripts recorded"}
                </h3>
                <p className="text-sm text-gray-500 max-w-xs">
                  {isActive ? "Transcripts will appear here in real time as students speak." : "This session has ended."}
                </p>
                {isActive && hasRubric && (
                  <p className="text-xs text-gray-400 mt-3 max-w-xs">
                    Use the <strong>Run Test</strong> button below to simulate a student presentation.
                  </p>
                )}
              </div>
            );
          }

          const filteredChunks = activeFilter
            ? allFinalChunks.filter((c) => chunkTags[c.id]?.analysis?.some((a) => a.rubric_id === activeFilter))
            : allFinalChunks;

          if (activeFilter && filteredChunks.length === 0) {
            const filterMetric = rubricMetrics.find((m) => m.id === activeFilter);
            return (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="h-10 w-10 rounded-full flex items-center justify-center mb-3"
                  style={{ backgroundColor: (metricColorMap[activeFilter] || "#ccc") + "1A" }}>
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: metricColorMap[activeFilter] || "#ccc" }} />
                </div>
                <p className="text-sm font-medium text-gray-500">No sentences tagged to</p>
                <p className="text-sm font-bold" style={{ color: metricColorMap[activeFilter] }}>
                  {filterMetric?.name || "this metric"}
                </p>
              </div>
            );
          }

          let lastSpeakerId = "";
          return (
            <div className="space-y-2 pt-2">
              <AnimatePresence initial={false}>
                {filteredChunks.map((chunk) => {
                  const sa = chunkTags[chunk.id];
                  const analysisEntries = sa?.analysis || [];
                  const uniqueRubricIds = [...new Set(analysisEntries.map((a) => a.rubric_id).filter(Boolean))];
                  const primaryColor = uniqueRubricIds.length > 0
                    ? (metricColorMap[uniqueRubricIds[0]] || analysisEntries[0]?.color || null)
                    : null;
                  const colors = speakerColorMap.get(chunk.studentId) || SPEAKER_COLORS[0];
                  const showSpeakerLabel = chunk.studentId !== lastSpeakerId;
                  lastSpeakerId = chunk.studentId;

                  return (
                    <motion.div key={chunk.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                      {showSpeakerLabel && (
                        <div className="flex items-center gap-2 pl-1 mb-1 mt-2">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold text-white ${colors.badge}`}>
                            {isGroup && chunk.groupId && `[${chunk.groupId}] `}
                            {chunk.studentName}
                          </span>
                        </div>
                      )}
                      <div
                        className={`rounded-2xl px-4 py-3 shadow-sm transition-all ${isGroup ? colors.bg : "bg-white"}`}
                        style={primaryColor ? { borderLeft: `3px solid ${primaryColor}` } : { borderLeft: "3px solid transparent" }}
                      >
                        <p className="text-sm text-gray-900 leading-relaxed">{renderTaggedText(chunk)}</p>
                        <div className="flex items-center justify-between mt-2 gap-2">
                          <div className="flex flex-wrap gap-1 min-w-0">
                            {uniqueRubricIds.map((rid) => {
                              const metric = rubricMetrics.find((m) => m.id === rid);
                              const color = metricColorMap[rid] || "#999";
                              if (!metric) return null;
                              return (
                                <span key={rid} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold"
                                  style={{ backgroundColor: color + "1A", color }}>
                                  <span className="h-1 w-1 rounded-full" style={{ backgroundColor: color }} />
                                  {metric.name}
                                </span>
                              );
                            })}
                          </div>
                          <span className="text-[10px] text-gray-400 font-mono shrink-0">
                            {new Date(chunk.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {isAiProcessing && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 text-gray-400 px-2 py-1.5 text-xs">
                  <div className="h-3 w-3 border-2 border-gray-300 border-t-[#0a84ff] rounded-full animate-spin" />
                  Analysing with AI...
                </motion.div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Scroll-to-bottom FAB */}
      <AnimatePresence>
        {showScrollBtn && !isNearBottomRef.current && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.15 }}
            onClick={() => {
              if (scrollRef.current) {
                scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
                setShowScrollBtn(false);
              }
            }}
            className="absolute right-4 bottom-28 z-10 h-9 w-9 rounded-full bg-white shadow-lg border border-gray-200 flex items-center justify-center text-gray-600 active:scale-[0.9] transition-all"
          >
            <ArrowDown className="h-4 w-4" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Bottom Controls ── */}
      {isActive && (
        <div className="shrink-0 bg-[#f7f7f8] px-4 pb-4 pt-2 space-y-2">
          {hasRubric && (
            <div className="flex gap-2">
              {!isTestRunning ? (
                <button onClick={startTestSimulation}
                  className="flex-1 h-10 rounded-xl bg-[#5856d6]/10 text-[#5856d6] text-sm font-medium flex items-center justify-center gap-2 active:scale-[0.97] transition-all">
                  <FlaskConical className="h-3.5 w-3.5" /> Run Test
                </button>
              ) : (
                <button onClick={stopTestSimulation}
                  className="flex-1 h-10 rounded-xl bg-[#ff9f0a]/10 text-[#ff9f0a] text-sm font-medium flex items-center justify-center gap-2 active:scale-[0.97] transition-all">
                  <StopCircle className="h-3.5 w-3.5" /> Stop Test ({testIndexRef.current}/{TEST_SENTENCES.length})
                </button>
              )}
              <button onClick={fetchTranscripts}
                className="h-10 px-4 rounded-xl bg-[#767680]/[0.08] text-gray-600 text-sm font-medium flex items-center gap-2">
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {!hasRubric && (
            <button onClick={fetchTranscripts}
              className="w-full h-10 rounded-xl bg-[#767680]/[0.08] text-gray-600 text-sm font-medium flex items-center justify-center gap-2">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
          )}
          <button onClick={handleEndSession}
            className="w-full h-11 rounded-xl bg-red-500 text-white text-sm font-medium flex items-center justify-center gap-2 active:scale-[0.97] transition-all">
            <StopCircle className="h-3.5 w-3.5" /> End Session
          </button>
        </div>
      )}

      {isCompleted && viewMode === "live" && (
        <div className="shrink-0 bg-[#f7f7f8] px-4 pb-4 pt-2 space-y-2">
          <button
            onClick={() => { setViewMode("results"); }}
            className="w-full h-11 rounded-xl bg-[#0a84ff] text-white text-sm font-medium flex items-center justify-center gap-2 active:scale-[0.97] transition-all"
          >
            <Award className="h-3.5 w-3.5" /> View Student Results
          </button>
          <button
            onClick={() => navigate("/engage")}
            className="w-full h-11 rounded-xl bg-white shadow-sm text-gray-600 text-sm font-medium flex items-center justify-center gap-2 active:scale-[0.97] transition-all"
          >
            Back to Engage
          </button>
        </div>
      )}
    </div>
  );
}
