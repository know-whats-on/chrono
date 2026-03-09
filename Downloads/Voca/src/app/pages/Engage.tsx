import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router";
import {
  Play, Radio, Search, ChevronRight, X, Users, User,
  QrCode, Copy, ExternalLink, StopCircle, Mic,
} from "lucide-react";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { copyToClipboard } from "../utils/clipboard";
import QRCode from "react-qr-code";
import * as kv from "../utils/kv";
import * as api from "../utils/api";
import { LoadSplash } from "../components/LoadSplash";
import { Assessment, Session, isGroupAssessment } from "../types";

function generateJoinCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export default function Engage() {
  const navigate = useNavigate();
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Session creation flow
  const [selectedAssessment, setSelectedAssessment] = useState<Assessment | null>(null);
  const [showStartSheet, setShowStartSheet] = useState(false);
  const [creatingSession, setCreatingSession] = useState(false);

  // Active session share view
  const [activeSession, setActiveSession] = useState<Session | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [assessmentData, sessionData] = await Promise.all([
        kv.getByPrefix("CHATGPT_assessments_"),
        kv.getByPrefix("CHATGPT_session_"),
      ]);
      setAssessments((assessmentData || []) as Assessment[]);
      setSessions((sessionData || []) as Session[]);
    } catch (err) {
      console.error("Failed to load engage data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const activeSessions = useMemo(() =>
    sessions.filter(s => s.status === "active"),
  [sessions]);

  const filtered = useMemo(() =>
    assessments.filter(a =>
      a.title.toLowerCase().includes(search.toLowerCase()) ||
      (a.courseCode || "").toLowerCase().includes(search.toLowerCase())
    ),
  [assessments, search]);

  const handleStartSession = async () => {
    if (!selectedAssessment) return;
    setCreatingSession(true);
    try {
      const sessionId = crypto.randomUUID();
      const code = generateJoinCode();
      const isGroup = isGroupAssessment(selectedAssessment.type);
      const isDebate = selectedAssessment.type?.includes("debate");

      const session: Session = {
        id: sessionId,
        assessmentId: selectedAssessment.id,
        assessmentTitle: selectedAssessment.title,
        courseCode: selectedAssessment.courseCode || selectedAssessment.courseId,
        type: isDebate ? "debate" : isGroup ? "group" : "individual",
        status: "active",
        createdAt: new Date().toISOString(),
        joinCode: code,
        ...(isDebate && selectedAssessment.debateConfig && {
          debateState: {
            currentRoundIndex: 0,
            roundStatus: "not_started",
            timeRemaining: selectedAssessment.debateConfig.rounds[0]?.timeLimit || 0,
            votesFor: 0,
            votesAgainst: 0,
            audienceCount: 0
          }
        })
      };

      await api.createSession(session);
      setSessions(prev => [...prev, session]);
      setShowStartSheet(false);
      setSelectedAssessment(null);
      setActiveSession(session);
      toast.success("Session started!");
    } catch (err: any) {
      console.error("Failed to create session:", err);
      toast.error(err.message || "Failed to start session");
    } finally {
      setCreatingSession(false);
    }
  };

  const handleEndSession = async (session: Session) => {
    try {
      await api.updateSession(session.id, {
        status: "completed",
        completedAt: new Date().toISOString(),
      });
      setSessions(prev =>
        prev.map(s => s.id === session.id ? { ...s, status: "completed", completedAt: new Date().toISOString() } : s)
      );
      if (activeSession?.id === session.id) setActiveSession(null);
      toast.success("Session ended");
    } catch (err: any) {
      toast.error("Failed to end session");
    }
  };

  const copyLink = (session: Session, overrideUrl?: string) => {
    const url = overrideUrl || getStudentUrl(session);
    copyToClipboard(url);
    toast.success("Link copied to clipboard");
  };

  const getStudentUrl = (session: Session) =>
    `${window.location.origin}/assess/${session.id}`;

  const getDebateUrl = (session: Session, type: string) => 
    `${window.location.origin}/debate/${session.id}/${type}`;

  /* ─── Active Session Share View ─── */
  if (activeSession) {
    const isDebate = activeSession.type === "debate";

    return (
      <div className="flex flex-1 min-h-0 flex-col bg-[#f7f7f8]">
        <div className="shrink-0 px-4 pt-4 pb-3">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setActiveSession(null)}
              className="flex items-center gap-1 text-[#0a84ff] font-medium text-base"
            >
              <X className="h-5 w-5" />
              Close
            </button>
            <button
              onClick={() => {
                if (isDebate) {
                  window.open(getDebateUrl(activeSession, "live"), "_blank");
                } else {
                  navigate(`/engage/monitor/${activeSession.id}`);
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#0a84ff] text-white text-sm font-medium"
            >
              <Mic className="h-3.5 w-3.5" />
              Live Monitor
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-6">
          <div className="space-y-5 pt-2">
            {/* Header */}
            <div className="text-center space-y-1">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-100 text-green-700 text-xs font-semibold mb-2">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                LIVE SESSION
              </div>
              <h1 className="text-xl font-bold">{activeSession.assessmentTitle}</h1>
              <p className="text-sm text-gray-500">{activeSession.courseCode}</p>
              <div className="flex items-center justify-center gap-2 mt-1">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold text-white ${
                  activeSession.type === "group" ? "bg-[#af52de]" : activeSession.type === "debate" ? "bg-[#ff9f0a]" : "bg-[#0a84ff]"
                }`}>
                  {activeSession.type === "group" ? <Users className="h-3 w-3" /> : <User className="h-3 w-3" />}
                  {activeSession.type === "group" ? "Group" : activeSession.type === "debate" ? "Debate" : "Individual"}
                </span>
              </div>
            </div>

            {/* QR Code Card */}
            <div className="bg-white rounded-2xl p-6 shadow-sm text-center space-y-4">
              <p className="text-sm text-gray-500 font-medium">{isDebate ? "Scan for Audience Portal" : "Scan to join"}</p>
              <div className="flex justify-center">
                <div className="p-4 bg-white rounded-xl border border-gray-100">
                  <QRCode
                    value={isDebate ? getDebateUrl(activeSession, "audience") : getStudentUrl(activeSession)}
                    size={180}
                    level="H"
                  />
                </div>
              </div>
            </div>

            {/* Link Actions */}
            {isDebate ? (
              <div className="space-y-3">
                {[
                  { label: "For Team Portal", type: "team-for", color: "bg-blue-50 text-blue-700" },
                  { label: "Against Team Portal", type: "team-against", color: "bg-red-50 text-red-700" },
                  { label: "Audience Portal", type: "audience", color: "bg-gray-50 text-gray-700" },
                  { label: "Class Live View", type: "live", color: "bg-purple-50 text-purple-700" },
                ].map(link => (
                  <div key={link.type} className="bg-white rounded-2xl p-4 shadow-sm space-y-2">
                    <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">{link.label}</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => copyLink(activeSession, getDebateUrl(activeSession, link.type))}
                        className={`flex-1 h-10 rounded-xl ${link.color} font-medium text-sm flex items-center justify-center gap-2`}
                      >
                        <Copy className="h-4 w-4" /> Copy
                      </button>
                      <button
                        onClick={() => window.open(getDebateUrl(activeSession, link.type), "_blank")}
                        className={`flex-1 h-10 rounded-xl ${link.color} font-medium text-sm flex items-center justify-center gap-2`}
                      >
                        <ExternalLink className="h-4 w-4" /> Open
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
                <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Student Link</p>
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[#767680]/[0.06] text-sm">
                  <span className="flex-1 truncate text-gray-600 font-mono text-xs">
                    {getStudentUrl(activeSession)}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => copyLink(activeSession)}
                    className="flex-1 h-11 rounded-xl bg-[#767680]/[0.08] text-gray-700 font-medium text-sm flex items-center justify-center gap-2"
                  >
                    <Copy className="h-4 w-4" /> Copy Link
                  </button>
                  <button
                    onClick={() => window.open(getStudentUrl(activeSession), "_blank")}
                    className="flex-1 h-11 rounded-xl bg-[#767680]/[0.08] text-gray-700 font-medium text-sm flex items-center justify-center gap-2"
                  >
                    <ExternalLink className="h-4 w-4" /> Open
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom buttons */}
        <div className="shrink-0 bg-[#f7f7f8] px-4 pb-4 pt-2 space-y-2">
          <button
            onClick={() => {
              if (isDebate) {
                window.open(getDebateUrl(activeSession, "live"), "_blank");
              } else {
                navigate(`/engage/monitor/${activeSession.id}`);
              }
            }}
            className="w-full h-12 rounded-xl bg-[#0a84ff] text-white font-medium text-base flex items-center justify-center gap-2"
          >
            <Mic className="h-4 w-4" />
            Open Live Monitor
          </button>
          <button
            onClick={() => handleEndSession(activeSession)}
            className="w-full h-12 rounded-2xl bg-white shadow-sm text-red-500 font-medium text-base flex items-center justify-center gap-2"
          >
            <StopCircle className="h-4 w-4" />
            End Session
          </button>
        </div>
      </div>
    );
  }

  /* ─── Main List View ─── */
  return (
    <div className="flex flex-1 min-h-0 flex-col bg-[#f7f7f8]">
      <div className="shrink-0 px-4 pt-4 pb-2 space-y-4 bg-[#f7f7f8]">
        <div className="flex items-center justify-between mt-2">
          <h1 className="text-3xl font-bold tracking-tight">Engage</h1>
        </div>
        <p className="text-sm text-gray-500">
          Start a live assessment session. Students scan the QR code to join.
        </p>

        {/* Active sessions banner */}
        {activeSessions.length > 0 && (
          <div className="space-y-2">
            {activeSessions.map(s => (
              <button
                key={s.id}
                onClick={() => setActiveSession(s)}
                className="w-full bg-green-50 border border-green-200 rounded-2xl p-3.5 flex items-center gap-3 active:scale-[0.98] transition-all"
              >
                <div className="h-10 w-10 rounded-full bg-green-100 text-green-600 flex items-center justify-center shrink-0">
                  <Radio className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-semibold text-green-900 truncate">{s.assessmentTitle}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-green-600 font-medium">{s.courseCode}</span>
                    <span className="h-1 w-1 rounded-full bg-green-400" />
                    <span className="inline-flex items-center gap-1 text-xs text-green-600">
                      <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                      Live
                    </span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-green-400 shrink-0" />
              </button>
            ))}
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search assessments..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-9 rounded-[10px] bg-[#767680]/[0.12] pl-9 border-none shadow-none text-[17px] focus-visible:ring-0 placeholder:text-[17px] placeholder:text-[#3C3C43]/60 w-full"
          />
        </div>
      </div>

      {/* Assessment list */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-6">
        <div className="space-y-3 pt-2">
          {loading ? (
            <div className="fixed inset-0 z-40 flex items-center justify-center">
              <LoadSplash />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-gray-500 bg-[#767680]/[0.04] rounded-2xl">
              <div className="h-12 w-12 rounded-xl bg-[#767680]/[0.08] flex items-center justify-center mb-3">
                <Play className="h-6 w-6 text-gray-400" />
              </div>
              <p className="text-base font-semibold text-gray-900">No assessments found</p>
              <p className="text-sm mt-1 text-gray-500">Create an assessment first to start a session.</p>
            </div>
          ) : (
            filtered.map(assessment => {
              const isGroup = isGroupAssessment(assessment.type);
              const hasActiveSession = activeSessions.some(s => s.assessmentId === assessment.id);

              return (
                <Card
                  key={assessment.id}
                  className="border-0 shadow-sm rounded-2xl bg-white hover:shadow-md transition-all cursor-pointer active:scale-[0.98]"
                  onClick={() => {
                    if (hasActiveSession) {
                      const s = activeSessions.find(s => s.assessmentId === assessment.id);
                      if (s) setActiveSession(s);
                    } else {
                      setSelectedAssessment(assessment);
                      setShowStartSheet(true);
                    }
                  }}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-base tracking-tight truncate">{assessment.title}</p>
                        <p className="text-sm text-gray-500 mt-0.5">
                          {assessment.courseCode || assessment.courseId}
                        </p>
                        <div className="flex items-center flex-wrap gap-1.5 mt-2.5">
                          <span className={`px-2 py-0.5 rounded-md text-xs font-semibold text-white ${
                            isGroup ? "bg-[#af52de]" : "bg-[#0a84ff]"
                          }`}>
                            {isGroup ? "Group" : "Individual"}
                          </span>
                          <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-[#ff9f0a] text-white capitalize">
                            {assessment.type.replace(/-/g, " ")}
                          </span>
                          {hasActiveSession && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-[#34c759] text-white">
                              <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                              Live
                            </span>
                          )}
                        </div>
                      </div>
                      {hasActiveSession ? (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#34c759] text-white text-xs font-semibold shrink-0 ml-3">
                          <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                          Live
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0a84ff] text-white text-sm font-semibold shrink-0 ml-3 active:scale-95 transition-all shadow-sm shadow-blue-500/20">
                          <Play className="h-3.5 w-3.5 fill-white" />
                          Start
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>

      {/* Start Session Bottom Sheet */}
      {showStartSheet && selectedAssessment && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => { setShowStartSheet(false); setSelectedAssessment(null); }}
          />
          <div className="relative w-full max-w-lg bg-white rounded-t-[20px] shadow-[0_-4px_30px_rgb(0,0,0,0.1)] animate-in slide-in-from-bottom duration-300">
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-9 h-1 rounded-full bg-gray-300" />
            </div>

            <div className="px-5 pb-6 space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Start Assessment</h3>
                <button
                  onClick={() => { setShowStartSheet(false); setSelectedAssessment(null); }}
                  className="h-8 w-8 rounded-full bg-[#767680]/[0.12] flex items-center justify-center"
                >
                  <X className="h-4 w-4 text-gray-500" />
                </button>
              </div>

              {/* Assessment info */}
              <div className="bg-[#767680]/[0.04] rounded-2xl p-4 space-y-3">
                <h4 className="font-semibold text-base">{selectedAssessment.title}</h4>
                <p className="text-sm text-gray-500">{selectedAssessment.courseCode || selectedAssessment.courseId}</p>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-white ${
                    isGroupAssessment(selectedAssessment.type) ? "bg-[#af52de]" : "bg-[#0a84ff]"
                  }`}>
                    {isGroupAssessment(selectedAssessment.type)
                      ? <><Users className="h-3 w-3" /> Group Assessment</>
                      : <><User className="h-3 w-3" /> Individual Assessment</>
                    }
                  </span>
                </div>
                <p className="text-xs text-gray-400">
                  {isGroupAssessment(selectedAssessment.type)
                    ? "Students will provide their Group Number and Student ID to join."
                    : "Students will provide their Student ID to join."
                  }
                </p>
              </div>

              {/* Start button */}
              <button
                onClick={handleStartSession}
                disabled={creatingSession}
                className="w-full h-12 rounded-xl bg-[#0a84ff] text-white font-medium text-base flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {creatingSession ? (
                  <span className="animate-pulse">Creating session...</span>
                ) : (
                  <>
                    <Play className="h-4 w-4 fill-white" />
                    Start Session
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}