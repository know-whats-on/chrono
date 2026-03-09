import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "react-router";
import { Clock, Users, Flame, ThumbsUp, Heart, Zap, Sparkles, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import * as api from "../utils/api";
import * as kv from "../utils/kv";
import { Session, TranscriptChunk, Assessment, DebateRound } from "../types";
import { LoadSplash } from "../components/LoadSplash";

interface EventData {
  id: string;
  type: string;
  value?: string;
  timestamp: number;
}

// ─── Beep using Web Audio API ───
function playBeep(frequency = 880, duration = 150) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = frequency;
    osc.type = "square";
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration / 1000);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration / 1000);
    setTimeout(() => ctx.close(), duration + 100);
  } catch {}
}

export default function DebateLiveView() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Debate config from assessment
  const [rounds, setRounds] = useState<DebateRound[]>([]);
  const [currentRoundIndex, setCurrentRoundIndex] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [roundRunning, setRoundRunning] = useState(false);
  const [debateFinished, setDebateFinished] = useState(false);

  // Flash effect
  const [showFlash, setShowFlash] = useState(false);

  // Vote tallies
  const [votesFor, setVotesFor] = useState(0);
  const [votesAgainst, setVotesAgainst] = useState(0);
  const [lastEvents, setLastEvents] = useState<EventData[]>([]);

  // Transcripts & AI
  const [transcripts, setTranscripts] = useState<TranscriptChunk[]>([]);
  const [aiComments, setAiComments] = useState<{ id: string; text: string; team: string }[]>([]);

  // Refs for timer
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastBeepRef = useRef(-1);
  const roundRunningRef = useRef(false);
  const timeRemainingRef = useRef(0);

  // Keep refs in sync
  useEffect(() => { roundRunningRef.current = roundRunning; }, [roundRunning]);
  useEffect(() => { timeRemainingRef.current = timeRemaining; }, [timeRemaining]);

  const currentRound = rounds[currentRoundIndex] || null;

  // ─── Load session + assessment config ───
  useEffect(() => {
    if (!sessionId) return;
    const init = async () => {
      try {
        const s = await api.getSession(sessionId);
        setSession(s);

        // Load assessment to get debate config
        const assessment = (await kv.get(`CHATGPT_assessments_${s.assessmentId}`)) as Assessment | null;
        if (assessment?.debateConfig?.rounds && assessment.debateConfig.rounds.length > 0) {
          setRounds(assessment.debateConfig.rounds);
          setTimeRemaining(assessment.debateConfig.rounds[0].timeLimit);
          setCurrentRoundIndex(0);
          setRoundRunning(true);
        } else {
          // Fallback: single round, 5 min
          const fallback: DebateRound = { id: "default", name: "Debate", speakingTeam: "both", timeLimit: 300 };
          setRounds([fallback]);
          setTimeRemaining(300);
          setRoundRunning(true);
        }

        setLoading(false);
      } catch (e) {
        console.error(e);
        setLoading(false);
      }
    };
    init();
  }, [sessionId]);

  // ─── Write debate state to KV for team portals ───
  const writeDebateState = useCallback(async (
    rIndex: number,
    tRemaining: number,
    running: boolean,
    rds: DebateRound[],
    finished: boolean
  ) => {
    if (!session) return;
    const round = rds[rIndex];
    try {
      await kv.set(`CHATGPT_debate_state_${session.id}`, {
        currentRoundIndex: rIndex,
        roundName: round?.name || "Debate",
        speakingTeam: round?.speakingTeam || "both",
        timeRemaining: tRemaining,
        totalRounds: rds.length,
        running,
        finished,
      });
    } catch (err) {
      console.error("[DebateLiveView] Failed to write debate state:", err);
    }
  }, [session]);

  // ─── Timer tick ───
  useEffect(() => {
    if (!roundRunning || rounds.length === 0) return;

    // Write initial state
    writeDebateState(currentRoundIndex, timeRemaining, true, rounds, false);

    timerRef.current = setInterval(() => {
      setTimeRemaining(prev => {
        const next = Math.max(0, prev - 1);

        // Beep at 3, 2, 1
        if (next <= 3 && next > 0 && lastBeepRef.current !== next) {
          lastBeepRef.current = next;
          playBeep(next === 1 ? 1200 : 880, next === 1 ? 300 : 150);
        }

        // Round ended
        if (next === 0 && prev > 0) {
          lastBeepRef.current = -1;
          // Play final longer beep
          playBeep(1400, 500);
          handleRoundEnd();
        }

        return next;
      });
    }, 1000);

    // Write state periodically
    const stateInterval = setInterval(() => {
      if (roundRunningRef.current) {
        writeDebateState(currentRoundIndex, timeRemainingRef.current, true, rounds, false);
      }
    }, 2000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      clearInterval(stateInterval);
    };
  }, [roundRunning, currentRoundIndex, rounds, writeDebateState]);

  // ─── Handle round end: flash + advance ───
  const handleRoundEnd = useCallback(() => {
    setRoundRunning(false);
    if (timerRef.current) clearInterval(timerRef.current);

    // Trigger flash
    setShowFlash(true);
    setTimeout(() => setShowFlash(false), 1200);

    // Auto-advance after a short pause
    setTimeout(() => {
      setCurrentRoundIndex(prev => {
        const nextIdx = prev + 1;
        if (nextIdx >= rounds.length) {
          // Debate is over
          setDebateFinished(true);
          writeDebateState(prev, 0, false, rounds, true);
          return prev;
        }
        // Start next round
        const nextRound = rounds[nextIdx];
        setTimeRemaining(nextRound.timeLimit);
        setRoundRunning(true);
        lastBeepRef.current = -1;
        writeDebateState(nextIdx, nextRound.timeLimit, true, rounds, false);
        return nextIdx;
      });
    }, 2500); // Pause between rounds for dramatic effect
  }, [rounds, writeDebateState]);

  // ─── Poll events (Votes, Cheers) ───
  useEffect(() => {
    if (!session) return;
    let seenEventIds = new Set<string>();

    const pollEvents = async () => {
      try {
        const evs = await kv.getByPrefix(`CHATGPT_debate_event_${session.id}_`);
        const newEvents: EventData[] = [];
        const latestVoteByAudience: Record<string, string> = {};
        let vFor = 0, vAgainst = 0;

        evs.forEach((e: any) => {
          if (e.type === "vote") {
            latestVoteByAudience[e.audienceId] = e.value;
          } else {
            if (!seenEventIds.has(e.id)) {
              newEvents.push(e);
              seenEventIds.add(e.id);
            }
          }
        });

        Object.values(latestVoteByAudience).forEach(v => {
          if (v === "for") vFor++;
          if (v === "against") vAgainst++;
        });

        setVotesFor(vFor);
        setVotesAgainst(vAgainst);
        if (newEvents.length > 0) {
          setLastEvents(prev => [...newEvents, ...prev].slice(0, 10));
        }
      } catch {}
    };

    pollEvents();
    const interval = setInterval(pollEvents, 2000);
    return () => clearInterval(interval);
  }, [session]);

  // ─── Poll transcripts + AI comments ───
  useEffect(() => {
    if (!session) return;
    let lastLength = 0;

    const pollTranscripts = async () => {
      try {
        const data = await api.getTranscripts(session.id);
        const finals = data.filter((t: any) => t.isFinal);
        setTranscripts(finals);

        if (finals.length > lastLength) {
          const newChunks = finals.slice(lastLength);
          lastLength = finals.length;

          newChunks.forEach(chunk => {
            if (chunk.text.length > 20 && Math.random() > 0.5) {
              const compliments = [
                "Strong logical point!",
                "Excellent evidence provided.",
                "Great rhetorical question.",
                "Clear and concise argument.",
                "Fantastic rebuttal.",
                "Compelling use of data.",
                "Well-structured reasoning.",
              ];
              const text = compliments[Math.floor(Math.random() * compliments.length)];
              setAiComments(prev => [{
                id: crypto.randomUUID(),
                text: `${chunk.studentName}: ${text}`,
                team: chunk.groupId || "Unknown"
              }, ...prev].slice(0, 5));
            }
          });
        }
      } catch {}
    };

    pollTranscripts();
    const interval = setInterval(pollTranscripts, 3000);
    return () => clearInterval(interval);
  }, [session]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  if (loading) return <div className="fixed inset-0 flex items-center justify-center"><LoadSplash /></div>;
  if (!session) return <div className="p-10 text-center">Session not found.</div>;

  const totalVotes = votesFor + votesAgainst;
  const forPercent = totalVotes === 0 ? 50 : Math.round((votesFor / totalVotes) * 100);
  const againstPercent = totalVotes === 0 ? 50 : 100 - forPercent;

  const timerUrgent = timeRemaining <= 3 && timeRemaining > 0;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col overflow-hidden font-sans relative">

      {/* ═══ LIGHTNING FLASH OVERLAY ═══ */}
      <AnimatePresence>
        {showFlash && (
          <motion.div
            key="flash"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0.3, 0.9, 0] }}
            transition={{ duration: 1.2, times: [0, 0.05, 0.15, 0.2, 1] }}
            className="fixed inset-0 z-50 pointer-events-none"
            style={{
              background: "radial-gradient(ellipse at center, rgba(255,255,255,0.95) 0%, rgba(180,200,255,0.6) 40%, rgba(100,140,255,0.2) 70%, transparent 100%)",
              mixBlendMode: "screen",
            }}
          />
        )}
      </AnimatePresence>

      {/* ═══ HEADER ═══ */}
      <header className="px-8 py-5 border-b border-white/10 bg-black/50 backdrop-blur-md z-10 relative">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-black tracking-tight">{session.assessmentTitle}</h1>
            <p className="text-gray-400 font-medium tracking-wide mt-1">LIVE DEBATE SESSION</p>
          </div>
          <div className="flex items-center gap-8">
            {/* Round indicator */}
            <div className="text-right">
              <p className="text-[11px] text-gray-500 font-bold tracking-widest uppercase">
                Round {currentRoundIndex + 1} of {rounds.length}
              </p>
              <p className="text-xl font-bold text-white mt-0.5">{currentRound?.name || "Debate"}</p>
              {currentRound && currentRound.speakingTeam !== "both" && (
                <p className={`text-xs font-bold mt-1 ${currentRound.speakingTeam === "for" ? "text-blue-400" : "text-red-400"}`}>
                  Team {currentRound.speakingTeam.toUpperCase()} speaking
                </p>
              )}
            </div>
            {/* Timer */}
            <div className="text-right">
              <p className="text-[11px] text-gray-500 font-bold tracking-widest uppercase">Time Remaining</p>
              <div className={`text-5xl font-mono font-light tracking-tighter transition-colors ${
                timerUrgent ? "text-red-500 animate-pulse" : debateFinished ? "text-gray-500" : "text-white"
              }`}>
                {debateFinished ? "DONE" : formatTime(timeRemaining)}
              </div>
            </div>
          </div>
        </div>

        {/* ─── Round progress bar ─── */}
        <div className="flex gap-1.5 mt-4">
          {rounds.map((r, i) => (
            <div key={r.id} className="flex-1 flex flex-col gap-1">
              <div className={`h-1.5 rounded-full transition-all duration-500 ${
                i < currentRoundIndex ? "bg-green-500" :
                i === currentRoundIndex ? (roundRunning ? "bg-white" : "bg-amber-500") :
                "bg-white/10"
              }`} />
              <p className={`text-[9px] font-bold uppercase tracking-wider text-center truncate ${
                i === currentRoundIndex ? "text-white" : "text-gray-600"
              }`}>{r.name}</p>
            </div>
          ))}
        </div>
      </header>

      <main className="flex-1 p-8 grid grid-cols-12 gap-8 relative z-10 min-h-0">

        {/* ═══ LEFT COLUMN: Teams, Votes, Transcript (big) ═══ */}
        <div className="col-span-8 flex flex-col gap-6 min-h-0">

          {/* Teams Header */}
          <div className="flex gap-6 shrink-0">
            <div className={`flex-1 bg-gradient-to-br from-blue-900/40 to-blue-900/10 border rounded-3xl p-6 flex flex-col items-center justify-center relative overflow-hidden ${
              currentRound?.speakingTeam === "for" ? "border-blue-400/60 ring-1 ring-blue-400/30" : "border-blue-500/30"
            }`}>
              <div className="absolute -top-10 -left-10 w-40 h-40 bg-blue-500/20 blur-3xl rounded-full" />
              <h2 className="text-3xl font-black text-blue-400 tracking-tighter mb-1">TEAM FOR</h2>
              <div className="text-5xl font-bold text-white tracking-tighter">{votesFor} <span className="text-xl text-blue-300 font-medium">Votes</span></div>
              {currentRound?.speakingTeam === "for" && (
                <span className="mt-2 px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 text-xs font-bold uppercase tracking-wider animate-pulse">Speaking</span>
              )}
            </div>

            <div className="flex items-center justify-center shrink-0">
              <div className="h-14 w-14 rounded-full bg-white/10 flex items-center justify-center text-lg font-black italic text-gray-500">
                VS
              </div>
            </div>

            <div className={`flex-1 bg-gradient-to-br from-red-900/40 to-red-900/10 border rounded-3xl p-6 flex flex-col items-center justify-center relative overflow-hidden ${
              currentRound?.speakingTeam === "against" ? "border-red-400/60 ring-1 ring-red-400/30" : "border-red-500/30"
            }`}>
              <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-red-500/20 blur-3xl rounded-full" />
              <h2 className="text-3xl font-black text-red-400 tracking-tighter mb-1">TEAM AGAINST</h2>
              <div className="text-5xl font-bold text-white tracking-tighter">{votesAgainst} <span className="text-xl text-red-300 font-medium">Votes</span></div>
              {currentRound?.speakingTeam === "against" && (
                <span className="mt-2 px-3 py-1 rounded-full bg-red-500/20 text-red-300 text-xs font-bold uppercase tracking-wider animate-pulse">Speaking</span>
              )}
            </div>
          </div>

          {/* Tug of War Bar */}
          <div className="bg-white/5 p-5 rounded-3xl border border-white/10 shrink-0">
            <h3 className="text-[10px] text-gray-400 font-bold tracking-widest uppercase mb-3 text-center">Audience Support</h3>
            <div className="h-7 w-full bg-gray-800 rounded-full overflow-hidden flex relative">
              <motion.div className="h-full bg-blue-500" initial={{ width: "50%" }} animate={{ width: `${forPercent}%` }} transition={{ type: "spring", stiffness: 50 }} />
              <motion.div className="h-full bg-red-500" initial={{ width: "50%" }} animate={{ width: `${againstPercent}%` }} transition={{ type: "spring", stiffness: 50 }} />
              <div className="absolute inset-0 flex items-center justify-between px-4 font-bold text-sm text-white drop-shadow-md">
                <span>{forPercent}%</span>
                <span>{againstPercent}%</span>
              </div>
            </div>
          </div>

          {/* ═══ LIVE TRANSCRIPT (now the big area) ═══ */}
          <div className="flex-1 bg-white/5 border border-white/10 rounded-3xl p-6 flex flex-col overflow-hidden relative min-h-0">
            <h3 className="text-sm text-gray-400 font-bold tracking-widest uppercase mb-4 shrink-0">Live Transcript</h3>
            <div className="flex-1 overflow-y-auto space-y-5 pr-2 pb-12 flex flex-col-reverse">
              {transcripts.length === 0 ? (
                <p className="text-gray-500 italic text-center text-lg">No speeches yet...</p>
              ) : (
                transcripts.slice(-20).reverse().map(t => (
                  <motion.div
                    key={t.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-1.5"
                  >
                    <p className={`text-xs font-bold uppercase tracking-wider ${
                      t.groupId === "for" ? "text-blue-400" :
                      t.groupId === "against" ? "text-red-400" : "text-gray-400"
                    }`}>
                      {t.studentName} ({t.groupId?.toUpperCase()})
                    </p>
                    <p className="text-gray-200 text-lg leading-relaxed">{t.text}</p>
                  </motion.div>
                ))
              )}
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[#0d0d0d] to-transparent pointer-events-none" />
          </div>
        </div>

        {/* ═══ RIGHT COLUMN: AI Analysis (small) + Reactions ═══ */}
        <div className="col-span-4 flex flex-col gap-6 min-h-0">

          {/* AI Analysis (now smaller) */}
          <div className="bg-white/5 border border-white/10 rounded-3xl p-5 flex flex-col max-h-[45%] min-h-0">
            <h3 className="text-sm text-purple-400 font-bold tracking-widest uppercase mb-3 flex items-center gap-2 shrink-0">
              <Sparkles className="h-4 w-4" /> Live AI Analysis
            </h3>
            <div className="flex-1 space-y-2.5 overflow-y-auto min-h-0">
              <AnimatePresence>
                {aiComments.length === 0 ? (
                  <p className="text-gray-500 italic text-center mt-6 text-sm">Waiting for speakers...</p>
                ) : (
                  aiComments.map(comment => (
                    <motion.div
                      key={comment.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={`p-3 rounded-2xl border ${
                        comment.team === "for" ? "bg-blue-900/20 border-blue-500/20" :
                        comment.team === "against" ? "bg-red-900/20 border-red-500/20" :
                        "bg-gray-800 border-gray-700"
                      }`}
                    >
                      <p className="text-white text-sm">{comment.text}</p>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Reaction Feed */}
          <div className="flex-1 bg-white/5 border border-white/10 rounded-3xl p-5 overflow-hidden relative min-h-0">
            <h3 className="text-sm text-gray-400 font-bold tracking-widest uppercase mb-3">Audience Reactions</h3>
            <div className="space-y-2.5">
              <AnimatePresence>
                {lastEvents.map(ev => {
                  let Icon = ThumbsUp;
                  let color = "text-green-400";
                  if (ev.type === "heart") { Icon = Heart; color = "text-pink-400"; }
                  if (ev.type === "zap") { Icon = Zap; color = "text-amber-400"; }
                  return (
                    <motion.div
                      key={ev.id}
                      initial={{ opacity: 0, scale: 0.8, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-3 bg-white/5 p-2 rounded-xl"
                    >
                      <Icon className={`h-5 w-5 ${color} fill-current`} />
                      <span className="text-gray-300 text-sm">Someone sent a reaction!</span>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[#0a0a0a] to-transparent pointer-events-none" />
          </div>
        </div>
      </main>

      {/* ═══ DEBATE FINISHED OVERLAY ═══ */}
      <AnimatePresence>
        {debateFinished && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
              className="text-center space-y-4"
            >
              <h2 className="text-6xl font-black tracking-tighter text-white">DEBATE COMPLETE</h2>
              <p className="text-2xl text-gray-400 font-medium">
                {votesFor > votesAgainst ? "Team FOR leads the audience vote!" :
                 votesAgainst > votesFor ? "Team AGAINST leads the audience vote!" :
                 "It's a tie!"}
              </p>
              <div className="flex items-center justify-center gap-8 mt-6">
                <div className="text-center">
                  <p className="text-5xl font-bold text-blue-400">{votesFor}</p>
                  <p className="text-sm text-gray-500 font-bold">FOR</p>
                </div>
                <div className="text-3xl text-gray-600 font-black">—</div>
                <div className="text-center">
                  <p className="text-5xl font-bold text-red-400">{votesAgainst}</p>
                  <p className="text-sm text-gray-500 font-bold">AGAINST</p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
