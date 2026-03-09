import React, { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router";
import * as kv from "../utils/kv";
import * as api from "../utils/api";
import { Assessment, Session, TranscriptChunk, RubricMetric, SavedRubric, SentenceAnalysis } from "../types";
import { ChevronLeft, Search, User, Download, FileText, Award, ChevronDown } from "lucide-react";
import { Input } from "../components/ui/input";
import { LoadSplash } from "../components/LoadSplash";
import { motion } from "motion/react";
import { Document, Packer, Paragraph, TextRun } from "docx";
import JSZip from "jszip";

const METRIC_COLORS = [
  "#0a84ff", "#af52de", "#ff9f0a", "#34c759",
  "#ff3b30", "#5856d6", "#30b0c7", "#ff6482",
];

const GRADE_COLORS: Record<string, string> = {
  HD: "#0a84ff", D: "#34c759", C: "#ff9f0a", P: "#af52de", F: "#ff3b30",
};

interface Submission {
  id: string;
  sessionId: string;
  assessmentId: string;
  studentId: string;
  studentName: string;
  groupId?: string;
  submittedAt: string;
  late: boolean;
}

interface ProcessedSubmission extends Submission {
  chunks: TranscriptChunk[];
  gradeResult?: any;
  isGrading?: boolean;
}

export default function AssessmentResults() {
  const { assessmentId } = useParams<{ assessmentId: string }>();
  const navigate = useNavigate();
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [submissions, setSubmissions] = useState<ProcessedSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "ontime" | "late">("all");
  const [sortOption, setSortOption] = useState<"name" | "score_desc" | "score_asc" | "date_desc" | "date_asc">("name");
  const [isGradingAll, setIsGradingAll] = useState(false);
  
  const [rubricMetrics, setRubricMetrics] = useState<RubricMetric[]>([]);
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  
  // Tag cache
  const [allChunkTags, setAllChunkTags] = useState<Record<string, SentenceAnalysis>>({});

  useEffect(() => {
    async function loadData() {
      if (!assessmentId) return;
      try {
        const a = await kv.get(`CHATGPT_assessments_${assessmentId}`) as Assessment;
        setAssessment(a);

        if (a?.linkedRubricId) {
          const rubric = await kv.get(`CHATGPT_rubrics_${a.linkedRubricId}`) as SavedRubric;
          if (rubric?.metrics) setRubricMetrics(rubric.metrics);
        }

        // Load existing grade results for this assessment
        let gradeMap: Record<string, any> = {};
        try {
          const gradeResults = await kv.getByPrefix(`CHATGPT_gradeResult_${assessmentId}_`);
          if (Array.isArray(gradeResults)) {
            gradeResults.forEach((gr: any) => {
              if (gr?.studentId && gr?.result) {
                gradeMap[gr.studentId] = gr.result;
              }
            });
          }
        } catch (gradeErr) {
          console.error("Failed to load grade results:", gradeErr);
        }

        let processed: ProcessedSubmission[] = [];

        if (a?.type?.includes("debate")) {
          // Find all sessions for this assessment
          const allSessions = (await kv.getByPrefix("CHATGPT_session_")) as Session[];
          const mySessions = allSessions.filter(s => s.assessmentId === assessmentId);
          const sessionIds = mySessions.map(s => s.id);
          
          const allTranscripts: TranscriptChunk[] = [];
          let combinedTags: Record<string, SentenceAnalysis> = {};
          
          for (const sid of sessionIds) {
            const ts = await api.getTranscripts(sid);
            allTranscripts.push(...ts);
            const tags = await kv.get(`CHATGPT_session_tags_${sid}`);
            if (tags) combinedTags = { ...combinedTags, ...tags as any };
          }
          setAllChunkTags(combinedTags);

          // Find unique teams across all transcripts
          const uniqueTeams = [...new Set(allTranscripts.map(t => t.groupId).filter(Boolean))];
          console.log("[AssessmentResults] Debate mode - sessions:", sessionIds.length, "transcripts:", allTranscripts.length, "teams:", uniqueTeams);
          
          processed = uniqueTeams.map(teamId => {
            const teamChunks = allTranscripts.filter(t => t.groupId === teamId && t.isFinal);
            const gradeResult = gradeMap[teamId!]; // We grade by teamId for debates
            return {
              id: `debate_${teamId}`,
              sessionId: sessionIds[0] || "",
              assessmentId,
              studentId: teamId!,
              studentName: `Team ${teamId!.toUpperCase()}`,
              groupId: teamId,
              submittedAt: mySessions[0]?.createdAt || new Date().toISOString(),
              late: false,
              chunks: teamChunks,
              gradeResult
            };
          });
        } else {
          const subs = await kv.get(`CHATGPT_submissions_${assessmentId}`) as Submission[] || [];
          const sessionIds = [...new Set(subs.map(s => s.sessionId))];
          const allTranscripts: TranscriptChunk[] = [];
          let combinedTags: Record<string, SentenceAnalysis> = {};
          
          for (const sid of sessionIds) {
            const ts = await api.getTranscripts(sid);
            allTranscripts.push(...ts);
            const tags = await kv.get(`CHATGPT_session_tags_${sid}`);
            if (tags) combinedTags = { ...combinedTags, ...tags as any };
          }
          
          setAllChunkTags(combinedTags);

          processed = subs.map(sub => {
            const chunks = allTranscripts.filter(t => t.sessionId === sub.sessionId && t.studentId === sub.studentId && t.isFinal);
            const gradeResult = gradeMap[sub.studentId];
            return { ...sub, chunks, gradeResult };
          });
        }

        setSubmissions(processed);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [assessmentId]);

  const metricColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    rubricMetrics.forEach((m, i) => { map[m.id] = METRIC_COLORS[i % METRIC_COLORS.length]; });
    return map;
  }, [rubricMetrics]);

  const filteredAndSortedSubmissions = useMemo(() => {
    let result = submissions.filter(s => {
      if (filter === "ontime" && s.late) return false;
      if (filter === "late" && !s.late) return false;
      return s.studentName.toLowerCase().includes(search.toLowerCase());
    });

    result.sort((a, b) => {
      if (sortOption === "name") {
        return a.studentName.localeCompare(b.studentName);
      } else if (sortOption === "score_desc") {
        const scoreA = a.gradeResult?.overallScore ?? -1;
        const scoreB = b.gradeResult?.overallScore ?? -1;
        return scoreB - scoreA;
      } else if (sortOption === "score_asc") {
        const scoreA = a.gradeResult?.overallScore ?? -1;
        const scoreB = b.gradeResult?.overallScore ?? -1;
        return scoreA - scoreB;
      } else if (sortOption === "date_desc") {
        return new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime();
      } else if (sortOption === "date_asc") {
        return new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime();
      }
      return 0;
    });

    return result;
  }, [submissions, filter, search, sortOption]);

  const generateGrade = async (sub: ProcessedSubmission) => {
    if (sub.gradeResult || sub.isGrading || rubricMetrics.length === 0) return;
    setSubmissions(prev => prev.map(s => s.id === sub.id ? { ...s, isGrading: true } : s));
    try {
      const text = sub.chunks.map(c => c.text).join(" ");
      const metricsInput = rubricMetrics.map(m => ({
        id: m.id, name: m.name, weight: m.weight, hdDescription: m.grades?.highDistinction || "",
      }));
      const result = await api.suggestGrade(sub.studentName, text, metricsInput);
      
      await kv.set(`CHATGPT_gradeResult_${assessmentId}_${sub.studentId}`, {
        studentId: sub.studentId,
        result
      });

      setSubmissions(prev => prev.map(s => s.id === sub.id ? { ...s, gradeResult: result, isGrading: false } : s));
    } catch (err) {
      setSubmissions(prev => prev.map(s => s.id === sub.id ? { ...s, isGrading: false } : s));
    }
  };

  const handleGradeAll = async () => {
    if (isGradingAll || rubricMetrics.length === 0) return;
    setIsGradingAll(true);
    
    // Find submissions that need grading and have content
    const needsGrading = submissions.filter(s => !s.gradeResult && !s.isGrading && s.chunks.length > 0);
    
    for (const sub of needsGrading) {
      setSubmissions(prev => prev.map(s => s.id === sub.id ? { ...s, isGrading: true } : s));
      try {
        const text = sub.chunks.map(c => c.text).join(" ");
        const metricsInput = rubricMetrics.map(m => ({
          id: m.id, name: m.name, weight: m.weight, hdDescription: m.grades?.highDistinction || "",
        }));
        const result = await api.suggestGrade(sub.studentName, text, metricsInput);
        
        await kv.set(`CHATGPT_gradeResult_${assessmentId}_${sub.studentId}`, {
          studentId: sub.studentId,
          result
        });

        setSubmissions(prev => prev.map(s => s.id === sub.id ? { ...s, gradeResult: result, isGrading: false } : s));
      } catch (err) {
        setSubmissions(prev => prev.map(s => s.id === sub.id ? { ...s, isGrading: false } : s));
      }
    }
    
    setIsGradingAll(false);
  };

  const handleExportWord = async (sub: ProcessedSubmission) => {
    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          new Paragraph({ children: [new TextRun({ text: `Transcript: ${sub.studentName}`, bold: true, size: 32 })] }),
          new Paragraph({ text: `Assessment: ${assessment?.title}` }),
          new Paragraph({ text: `Date: ${new Date(sub.submittedAt).toLocaleString()}` }),
          new Paragraph({ text: "" }),
          ...sub.chunks.map(chunk => {
            const timeStr = chunk.timestamp ? new Date(chunk.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : "";
            const text = timeStr ? `[${timeStr}] ${chunk.text}` : chunk.text;
            return new Paragraph({ text });
          }),
        ],
      }],
    });
    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sub.studentName.replace(/ /g, "_")}_Transcript.docx`;
    a.click();
  };

  const handleExportAllZip = async () => {
    const zip = new JSZip();
    for (const sub of filteredAndSortedSubmissions) {
      const doc = new Document({
        sections: [{
          properties: {},
          children: [
            new Paragraph({ children: [new TextRun({ text: `Transcript: ${sub.studentName}`, bold: true, size: 32 })] }),
            ...sub.chunks.map(chunk => {
              const timeStr = chunk.timestamp ? new Date(chunk.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : "";
              const text = timeStr ? `[${timeStr}] ${chunk.text}` : chunk.text;
              return new Paragraph({ text });
            }),
          ],
        }],
      });
      const blob = await Packer.toBlob(doc);
      zip.file(`${sub.studentName.replace(/ /g, "_")}_Transcript.docx`, blob);
    }
    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${assessment?.title.replace(/ /g, "_")}_Transcripts.zip`;
    a.click();
  };

  if (loading) return <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#f7f7f8]"><LoadSplash /></div>;

  if (expandedStudent) {
    const sr = submissions.find(s => s.id === expandedStudent);
    if (!sr) { setExpandedStudent(null); return null; }
    if (!sr.gradeResult && !sr.isGrading && rubricMetrics.length > 0) generateGrade(sr);

    const renderTaggedText = (chunk: TranscriptChunk) => {
      const sa = allChunkTags[chunk.id];
      if (!sa?.analysis?.length) return <span>{chunk.text}</span>;
      const text = chunk.text;
      const highlights: any[] = [];
      sa.analysis.forEach((a: any) => {
        if (!a.phrase) return;
        const idx = text.toLowerCase().indexOf(a.phrase.toLowerCase());
        if (idx >= 0) highlights.push({
          start: idx, end: idx + a.phrase.length,
          color: a.color || metricColorMap[a.rubric_id] || "#999",
          dimension: a.dimension, justification: a.justification,
        });
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
            <mark key={`hl-${i}`} className="rounded px-0.5 py-0 font-medium" style={{ backgroundColor: h.color + "30", color: "inherit" }} title={`${h.dimension}: ${h.justification}`}>
              {text.slice(start, h.end)}
            </mark>
          );
        }
        cursor = Math.max(cursor, h.end);
      });
      if (cursor < text.length) segments.push(<span key="tail">{text.slice(cursor)}</span>);
      return <>{segments}</>;
    };

    return (
      <div className="flex flex-1 min-h-0 flex-col bg-[#f7f7f8]">
        <div className="shrink-0 px-4 pt-4 pb-3 bg-white border-b sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <button onClick={() => setExpandedStudent(null)} className="flex items-center gap-1 text-[#0a84ff] font-medium text-base">
              <ChevronLeft className="h-5 w-5" /> Back
            </button>
            <button onClick={() => handleExportWord(sr)} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0a84ff] text-white rounded-full text-xs font-semibold">
              <Download className="h-3.5 w-3.5" /> Export Word
            </button>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-[#0a84ff]/10 flex items-center justify-center">
              <User className="h-5 w-5 text-[#0a84ff]" />
            </div>
            <div>
              <h2 className="text-lg font-bold">{sr.studentName}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-gray-500">{sr.chunks.length} segment{sr.chunks.length !== 1 ? "s" : ""}</span>
                {sr.late && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-600">LATE</span>}
              </div>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {sr.isGrading && (
            <div className="bg-white rounded-2xl p-5 shadow-sm flex items-center gap-3">
              <div className="h-4 w-4 border-2 border-gray-300 border-t-[#0a84ff] rounded-full animate-spin" />
              <span className="text-sm text-gray-500">Generating AI suggested grade...</span>
            </div>
          )}
          {sr.gradeResult && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 pt-5 pb-3">
                <div className="flex items-center gap-2 mb-2">
                  <Award className="h-4 w-4 text-[#0a84ff]" />
                  <h3 className="text-sm font-bold text-gray-900">AI Suggested Grade</h3>
                </div>
                <div className="flex items-center gap-3 mt-3">
                  <div className="h-14 w-14 rounded-2xl flex items-center justify-center" style={{ backgroundColor: (GRADE_COLORS[sr.gradeResult.overallGrade] || "#999") + "1A" }}>
                    <span className="text-xl font-bold" style={{ color: GRADE_COLORS[sr.gradeResult.overallGrade] || "#999" }}>{sr.gradeResult.overallGrade}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{sr.gradeResult.overallScore}/100</p>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{sr.gradeResult.overallFeedback}</p>
                  </div>
                </div>
              </div>
              {sr.gradeResult.dimensions.length > 0 && (
                <div className="px-5 pb-5 pt-2 space-y-3">
                  <div className="h-px bg-gray-100" />
                  {sr.gradeResult.dimensions.map((dim: any) => {
                    const metric = rubricMetrics.find((m) => m.id === dim.metricId);
                    const color = metricColorMap[dim.metricId] || "#999";
                    return (
                      <div key={dim.metricId}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                            <span className="text-xs font-medium text-gray-700 truncate">{metric?.name || dim.metricId}</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: (GRADE_COLORS[dim.grade] || "#999") + "1A", color: GRADE_COLORS[dim.grade] || "#999" }}>{dim.grade}</span>
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

          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="h-3.5 w-3.5 text-gray-400" />
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Full Transcript</h3>
            </div>
            {rubricMetrics.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                <button
                  onClick={() => setActiveFilter(null)}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold transition-all active:scale-[0.95] ${
                    activeFilter === null ? "bg-gray-800 text-white" : "bg-gray-200 text-gray-600"
                  }`}
                >
                  All
                </button>
                {rubricMetrics.map((m) => {
                  const color = metricColorMap[m.id] || "#999";
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
                      style={
                        isFilterActive
                          ? { backgroundColor: color, ringColor: color }
                          : { backgroundColor: color }
                      }
                    >
                      {m.name}
                    </button>
                  );
                })}
              </div>
            )}
            {(() => {
              const filteredChunks = sr.chunks.filter(chunk => {
                if (!activeFilter) return true;
                const sa = allChunkTags[chunk.id];
                return sa?.analysis?.some((a: any) => a.rubric_id === activeFilter);
              });

              if (activeFilter && filteredChunks.length === 0) {
                const filterMetric = rubricMetrics.find(m => m.id === activeFilter);
                return (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <p className="text-sm font-medium text-gray-500">No sentences tagged to</p>
                    <p className="text-sm font-bold mt-1" style={{ color: metricColorMap[activeFilter] || "#999" }}>
                      {filterMetric?.name || "this metric"}
                    </p>
                  </div>
                );
              }

              return filteredChunks.map(chunk => {
                const sa = allChunkTags[chunk.id];
                const uniqueRubricIds = [...new Set((sa?.analysis || []).map((a: any) => a.rubric_id).filter(Boolean))];
                const primaryColor = uniqueRubricIds.length > 0 ? metricColorMap[uniqueRubricIds[0] as string] : null;
                return (
                <div key={chunk.id} className="bg-white rounded-2xl px-4 py-3 shadow-sm" style={primaryColor ? { borderLeft: `3px solid ${primaryColor}` } : { borderLeft: "3px solid transparent" }}>
                  <p className="text-sm text-gray-900 leading-relaxed">{renderTaggedText(chunk)}</p>
                  <div className="flex items-center justify-between mt-2 gap-2">
                    <div className="flex flex-wrap gap-1 min-w-0">
                      {uniqueRubricIds.map(rid => {
                        const metric = rubricMetrics.find(m => m.id === rid);
                        const color = metricColorMap[rid as string] || "#999";
                        if (!metric) return null;
                        return (
                          <span key={rid as string} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ backgroundColor: color + "1A", color }}>
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
            })
          })()}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col bg-[#f7f7f8]">
      <div className="shrink-0 px-4 pt-4 pb-2 space-y-4 bg-white border-b border-gray-100 shadow-sm z-10 sticky top-0">
        <div className="flex items-center justify-between">
          <button onClick={() => navigate("/results")} className="flex items-center gap-1 text-[#0a84ff] font-medium text-base">
            <ChevronLeft className="h-5 w-5" /> Back
          </button>
          <button onClick={handleExportAllZip} disabled={filteredAndSortedSubmissions.length === 0} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0a84ff] text-white rounded-full text-xs font-semibold disabled:opacity-50">
            <Download className="h-3.5 w-3.5" /> Export All (Zip)
          </button>
        </div>
        <h1 className="text-2xl font-bold tracking-tight truncate">{assessment?.title} Results</h1>
        
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Search students..." value={search} onChange={e => setSearch(e.target.value)} className="h-9 rounded-[10px] bg-[#767680]/[0.12] pl-9 border-none shadow-none text-base" />
        </div>

        <div className="flex items-center gap-2 mt-2 overflow-x-auto pb-1 hide-scrollbar">
          <div className="flex gap-2 shrink-0">
            {["all", "ontime", "late"].map(f => (
              <button key={f} onClick={() => setFilter(f as any)} className={`h-7 px-3 flex items-center justify-center rounded-full text-xs font-semibold capitalize ${filter === f ? 'bg-[#0a84ff] text-white' : 'bg-[#767680]/[0.08] text-gray-600'}`}>
                {f}
              </button>
            ))}
          </div>
          <div className="w-px h-5 bg-gray-200 shrink-0 mx-1" />
          <div className="relative shrink-0 flex items-center">
            <select 
              value={sortOption} 
              onChange={(e) => setSortOption(e.target.value as any)}
              className="h-7 pl-3 pr-7 rounded-full text-xs font-semibold bg-[#767680]/[0.08] text-gray-600 border-none outline-none focus:ring-2 focus:ring-[#0a84ff]/50 appearance-none"
            >
              <option value="name">Sort by Name</option>
              <option value="score_desc">Score (Highest first)</option>
              <option value="score_asc">Score (Lowest first)</option>
              <option value="date_desc">Newest First</option>
              <option value="date_asc">Oldest First</option>
            </select>
            <ChevronDown className="absolute right-2.5 h-3.5 w-3.5 text-gray-500 pointer-events-none" />
          </div>
          {rubricMetrics.length > 0 && submissions.some(s => !s.gradeResult) && (
            <>
              <div className="w-px h-5 bg-gray-200 shrink-0 mx-1" />
              <button 
                onClick={handleGradeAll} 
                disabled={isGradingAll}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded-full text-xs font-semibold disabled:opacity-50"
              >
                <Award className="h-3.5 w-3.5" />
                {isGradingAll ? "Grading..." : "Grade All AI"}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
        {filteredAndSortedSubmissions.length === 0 ? (
          <div className="text-center text-gray-500 py-10">No students found.</div>
        ) : (
          filteredAndSortedSubmissions.map(sub => (
            <div key={sub.id} onClick={() => setExpandedStudent(sub.id)} className="bg-white rounded-xl p-4 shadow-sm active:scale-[0.98] transition-all cursor-pointer">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-gray-900">{sub.studentName}</h3>
                  {sub.isGrading && (
                    <div className="h-3 w-3 border-2 border-gray-300 border-t-[#0a84ff] rounded-full animate-spin" />
                  )}
                  {sub.gradeResult && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ backgroundColor: (GRADE_COLORS[sub.gradeResult.overallGrade] || "#999") + "1A", color: GRADE_COLORS[sub.gradeResult.overallGrade] || "#999" }}>
                      {sub.gradeResult.overallGrade} · {sub.gradeResult.overallScore}
                    </span>
                  )}
                </div>
                {sub.late ? (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-600">LATE</span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-600">ON TIME</span>
                )}
              </div>
              <p className="text-xs text-gray-500 mb-1">{sub.studentId} {sub.groupId ? `· ${sub.groupId}` : ""}</p>
              <p className="text-xs text-gray-400">{new Date(sub.submittedAt).toLocaleString()}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}