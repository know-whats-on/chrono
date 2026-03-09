import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "react-router";
import { Mic, MicOff, Square, AlertCircle, Users, CheckCircle2, Clock, ShieldAlert, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import * as api from "../utils/api";
import * as kv from "../utils/kv";
import { Session, TranscriptChunk } from "../types";
import { LoadSplash } from "../components/LoadSplash";

interface Props {
  team: "for" | "against";
}

type Stage = "loading" | "error" | "validate" | "ready" | "recorder" | "done";

interface DebateStateRemote {
  currentRoundIndex: number;
  roundName: string;
  speakingTeam: "for" | "against" | "both";
  timeRemaining: number;
  totalRounds: number;
  running: boolean;
  finished: boolean;
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
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration / 1000);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration / 1000);
    setTimeout(() => ctx.close(), duration + 100);
  } catch {}
}

export default function DebateTeamPortal({ team }: Props) {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [stage, setStage] = useState<Stage>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const [studentNumber, setStudentNumber] = useState("");
  const [validating, setValidating] = useState(false);
  const [validatedStudent, setValidatedStudent] = useState<any>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [liveText, setLiveText] = useState("");
  const [finalizedChunks, setFinalizedChunks] = useState<TranscriptChunk[]>([]);
  const recognitionRef = useRef<any>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunkCounterRef = useRef(0);
  const isMutedRef = useRef(false);

  // ─── Debate state from classroom screen ───
  const [debateState, setDebateState] = useState<DebateStateRemote | null>(null);
  const lastBeepRef = useRef(-1);

  // Is this team allowed to speak right now?
  const canSpeak = !debateState || debateState.speakingTeam === "both" || debateState.speakingTeam === team;
  const otherTeamLabel = team === "for" ? "Against" : "For";

  useEffect(() => {
    if (!sessionId) {
      setErrorMsg("Invalid session link");
      setStage("error");
      return;
    }
    (async () => {
      try {
        const s = await api.getSession(sessionId);
        if (s.status !== "active") {
          setErrorMsg("This session has ended");
          setStage("error");
          return;
        }
        setSession(s);
        setStage("validate");
      } catch (err: any) {
        setErrorMsg(err.message || "Session not found");
        setStage("error");
      }
    })();
  }, [sessionId]);

  // ─── Poll debate state from KV ───
  useEffect(() => {
    if (!session) return;
    const poll = async () => {
      try {
        const state = await kv.get(`CHATGPT_debate_state_${session.id}`) as DebateStateRemote | null;
        if (state) {
          setDebateState(prev => {
            // Beep countdown on team portals too
            if (state.timeRemaining <= 3 && state.timeRemaining > 0 && state.running) {
              if (lastBeepRef.current !== state.timeRemaining) {
                lastBeepRef.current = state.timeRemaining;
                playBeep(state.timeRemaining === 1 ? 1200 : 880, state.timeRemaining === 1 ? 300 : 150);
              }
            } else if (state.timeRemaining > 3) {
              lastBeepRef.current = -1;
            }
            return state;
          });
        }
      } catch {}
    };
    poll();
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, [session]);

  // ─── Auto-stop recording when team is not allowed to speak ───
  const isRecordingRef = useRef(false);
  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    if (!canSpeak && isRecording) {
      // Force stop recording
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
      setIsRecording(false);
      toast.info(`Mic paused — it's Team ${otherTeamLabel}'s turn`);
    }
  }, [canSpeak, isRecording, otherTeamLabel]);

  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRecording]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  const handleValidate = async () => {
    if (!session || !studentNumber.trim()) {
      toast.error("Please enter your Student ID");
      return;
    }
    setValidating(true);
    try {
      const result = await api.validateStudent(session.id, studentNumber.trim());
      if (result.valid && result.student) {
        setValidatedStudent(result.student);
        setStage("ready");
        toast.success(`Joined Team ${team === "for" ? "For" : "Against"}, ${result.student.firstName}!`);
      } else {
        toast.error(result.error || "Validation failed");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to validate");
    } finally {
      setValidating(false);
    }
  };

  const toggleRecording = useCallback(() => {
    if (!canSpeak) {
      toast.error(`It's not your team's turn to speak right now.`);
      return;
    }

    if (isRecording) {
      // Full stop — end the session recording entirely
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
      setIsRecording(false);
      setIsMuted(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("Speech recognition is not supported in this browser. Please use Chrome.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-AU";

    recognition.onresult = (event: any) => {
      if (!isRecordingRef.current || isMutedRef.current) return;
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          const rawText = transcript.trim();
          if (!rawText) continue;
          const chunkId = `chunk_${Date.now()}_${chunkCounterRef.current++}`;

          const chunk: TranscriptChunk = {
            id: chunkId,
            sessionId: session!.id,
            studentId: validatedStudent.id,
            studentName: `${validatedStudent.firstName} ${validatedStudent.lastName}`,
            groupId: team,
            text: rawText,
            timestamp: Date.now(),
            isFinal: true
          };

          (async () => {
            try {
              const punctuated = await api.punctuateText(rawText);
              const cleanChunk = { ...chunk, text: punctuated };
              setFinalizedChunks(prev =>
                prev.map(c => c.id === chunkId ? cleanChunk : c)
              );
              await api.appendTranscript(session!.id, cleanChunk);
              console.log("[DebateTeamPortal] Transcript chunk sent (punctuated):", chunkId);
            } catch (err) {
              console.error("[DebateTeamPortal] Punctuation failed, sending raw:", err);
              try {
                await api.appendTranscript(session!.id, chunk);
                console.log("[DebateTeamPortal] Transcript chunk sent (raw):", chunkId);
              } catch (e) {
                console.error("[DebateTeamPortal] Transcript send FAILED entirely:", e);
              }
            }
          })();

          setFinalizedChunks(prev => [...prev, chunk]);
        } else {
          interimText += transcript;
        }
      }
      setLiveText(isMutedRef.current ? "" : interimText);
    };

    recognition.onerror = (event: any) => {
      if (event.error === "no-speech") return;
      console.error("Speech recognition error", event.error);
      if (isRecordingRef.current && !isMutedRef.current && event.error !== "aborted") {
        setTimeout(() => {
          if (isRecordingRef.current && !isMutedRef.current) {
            try { recognitionRef.current?.start(); } catch {}
          }
        }, 1000);
      }
    };

    recognition.onend = () => {
      if (isRecordingRef.current && !isMutedRef.current) {
        try { recognitionRef.current?.start(); } catch {}
      }
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setIsRecording(true);
      setStage("recorder");
      toast.success("Microphone active");
    } catch (e: any) {
      console.error("Error starting recognition", e);
      toast.error("Could not start microphone.");
    }
  }, [isRecording, session, validatedStudent, team, canSpeak]);

  // ─── Mute / Unmute toggle ───
  const toggleMute = useCallback(() => {
    if (!canSpeak) {
      toast.error(`It's not your team's turn to speak right now.`);
      return;
    }
    if (!isRecording) return;

    if (isMuted) {
      // Unmute: restart recognition
      setIsMuted(false);
      setLiveText("");
      if (!recognitionRef.current) {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRecognition) {
          const recognition = new SpeechRecognition();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = "en-AU";

          recognition.onresult = (event: any) => {
            if (!isRecordingRef.current || isMutedRef.current) return;
            let interimText = "";
            for (let i = event.resultIndex; i < event.results.length; i++) {
              const transcript = event.results[i][0].transcript;
              if (event.results[i].isFinal) {
                const rawText = transcript.trim();
                if (!rawText) continue;
                const chunkId = `chunk_${Date.now()}_${chunkCounterRef.current++}`;
                const chunk: TranscriptChunk = {
                  id: chunkId,
                  sessionId: session!.id,
                  studentId: validatedStudent.id,
                  studentName: `${validatedStudent.firstName} ${validatedStudent.lastName}`,
                  groupId: team,
                  text: rawText,
                  timestamp: Date.now(),
                  isFinal: true
                };
                (async () => {
                  try {
                    const punctuated = await api.punctuateText(rawText);
                    const cleanChunk = { ...chunk, text: punctuated };
                    setFinalizedChunks(prev => prev.map(c => c.id === chunkId ? cleanChunk : c));
                    await api.appendTranscript(session!.id, cleanChunk);
                  } catch {
                    try { await api.appendTranscript(session!.id, chunk); } catch {}
                  }
                })();
                setFinalizedChunks(prev => [...prev, chunk]);
              } else {
                interimText += transcript;
              }
            }
            setLiveText(isMutedRef.current ? "" : interimText);
          };
          recognition.onerror = (event: any) => {
            if (event.error === "no-speech") return;
            if (isRecordingRef.current && !isMutedRef.current && event.error !== "aborted") {
              setTimeout(() => {
                if (isRecordingRef.current && !isMutedRef.current) {
                  try { recognitionRef.current?.start(); } catch {}
                }
              }, 1000);
            }
          };
          recognition.onend = () => {
            if (isRecordingRef.current && !isMutedRef.current) {
              try { recognitionRef.current?.start(); } catch {}
            }
          };
          try {
            recognition.start();
            recognitionRef.current = recognition;
          } catch {}
        }
      } else {
        try { recognitionRef.current.start(); } catch {}
      }
      toast.success("Microphone unmuted");
    } else {
      // Mute: stop recognition but stay in recorder stage
      setIsMuted(true);
      setLiveText("");
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
      toast("Microphone muted", { icon: "🔇" });
    }
  }, [isMuted, isRecording, canSpeak, session, validatedStudent, team]);

  const handleSubmit = async () => {
    if (isRecording) {
      if (recognitionRef.current) recognitionRef.current.stop();
      setIsRecording(false);
    }
    setStage("done");
  };

  const teamColorClass = team === "for" ? "bg-blue-600" : "bg-red-600";
  const teamBgClass = team === "for" ? "bg-blue-50" : "bg-red-50";
  const teamAccent = team === "for" ? "blue" : "red";

  // ─── Round Info Bar Component ───
  const RoundInfoBar = () => {
    if (!debateState) return null;
    const urgent = debateState.timeRemaining <= 3 && debateState.timeRemaining > 0;
    return (
      <div className={`w-full px-4 py-3 flex items-center justify-between ${
        team === "for" ? "bg-blue-600/10 border-b border-blue-200/50" : "bg-red-600/10 border-b border-red-200/50"
      }`}>
        <div className="flex items-center gap-2 min-w-0">
          <Clock className={`h-4 w-4 shrink-0 text-${teamAccent}-500`} />
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
              Round {debateState.currentRoundIndex + 1}/{debateState.totalRounds}
            </p>
            <p className="text-sm font-bold text-gray-900 truncate">{debateState.roundName}</p>
          </div>
        </div>
        <div className={`text-2xl font-mono font-bold tabular-nums ${
          urgent ? "text-red-500 animate-pulse" :
          debateState.finished ? "text-gray-400" :
          "text-gray-800"
        }`}>
          {debateState.finished ? "DONE" : formatTime(debateState.timeRemaining)}
        </div>
      </div>
    );
  };

  // ─── Not-your-turn Alert Component ───
  const NotYourTurnAlert = () => {
    if (canSpeak || !debateState) return null;
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-4 mt-3 p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-3"
      >
        <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-amber-800">
            {debateState.roundName} is for Team {otherTeamLabel}
          </p>
          <p className="text-xs text-amber-600 mt-0.5 leading-relaxed">
            Your microphone is paused during this round. You'll be able to speak again when it's your turn.
          </p>
        </div>
      </motion.div>
    );
  };

  if (stage === "loading") return <div className="fixed inset-0 flex items-center justify-center"><LoadSplash /></div>;

  if (stage === "error") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-6">
        <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
        <h2 className="text-xl font-bold mb-2">Cannot Join Session</h2>
        <p className="text-gray-500 text-center">{errorMsg}</p>
      </div>
    );
  }

  if (stage === "validate") {
    return (
      <div className={`flex min-h-screen flex-col bg-gray-50`}>
        <div className={`w-full px-6 py-12 ${teamColorClass} text-white`}>
          <h1 className="text-3xl font-bold text-center">Debate Team: {team === "for" ? "FOR" : "AGAINST"}</h1>
          <p className="text-center mt-2 opacity-90">{session?.assessmentTitle}</p>
        </div>
        <RoundInfoBar />
        <div className="flex-1 px-6 py-10 max-w-md w-full mx-auto">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 space-y-6">
            <h2 className="text-xl font-bold text-center">Join Team</h2>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Student ID</label>
                <input
                  type="text"
                  placeholder="e.g. 12345678"
                  value={studentNumber}
                  onChange={e => setStudentNumber(e.target.value)}
                  className="w-full h-12 px-4 rounded-xl bg-gray-50 border-none outline-none focus:ring-2 focus:ring-[#0a84ff]/50"
                  onKeyDown={e => e.key === "Enter" && handleValidate()}
                />
              </div>
              <button
                onClick={handleValidate}
                disabled={validating || !studentNumber}
                className={`w-full h-12 rounded-xl text-white font-semibold flex justify-center items-center ${teamColorClass} hover:opacity-90 disabled:opacity-50`}
              >
                {validating ? "Joining..." : "Join Debate"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (stage === "ready") {
    return (
      <div className={`flex min-h-screen flex-col ${teamBgClass}`}>
        <RoundInfoBar />
        <NotYourTurnAlert />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="bg-white p-8 rounded-3xl shadow-lg border border-gray-100 max-w-sm w-full text-center space-y-6">
            <div className={`mx-auto h-20 w-20 rounded-full flex items-center justify-center ${teamColorClass} text-white`}>
              <Users className="h-10 w-10" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Ready, {validatedStudent?.firstName}?</h2>
              <p className="text-gray-500 mt-2">You are speaking for Team {team.toUpperCase()}.</p>
            </div>
            <button
              onClick={toggleRecording}
              disabled={!canSpeak}
              className={`w-full h-14 rounded-2xl text-white font-bold text-lg flex justify-center items-center gap-2 ${
                canSpeak ? `${teamColorClass} hover:opacity-90` : "bg-gray-300 cursor-not-allowed"
              }`}
            >
              {canSpeak ? (
                <><Mic className="h-5 w-5" /> Start Speaking</>
              ) : (
                <><MicOff className="h-5 w-5" /> Waiting for your turn...</>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (stage === "recorder") {
    const urgent = debateState && debateState.timeRemaining <= 3 && debateState.timeRemaining > 0;
    return (
      <div className={`flex min-h-screen flex-col ${teamBgClass}`}>
        <RoundInfoBar />
        <NotYourTurnAlert />

        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="text-center space-y-6 w-full max-w-md">
            <h2 className="text-2xl font-bold text-gray-900">
              Team {team.toUpperCase()} {canSpeak ? "is speaking" : "— waiting"}
            </h2>

            {/* Round timer from classroom */}
            {debateState && !debateState.finished && (
              <div className={`mx-auto px-6 py-2 rounded-2xl ${
                urgent ? "bg-red-100 border border-red-300" : "bg-white/80 border border-gray-200"
              }`}>
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider text-center">
                  {debateState.roundName} — Round {debateState.currentRoundIndex + 1}/{debateState.totalRounds}
                </p>
                <p className={`text-4xl font-mono font-bold text-center tabular-nums ${
                  urgent ? "text-red-500 animate-pulse" : "text-gray-800"
                }`}>
                  {formatTime(debateState.timeRemaining)}
                </p>
              </div>
            )}

            {debateState?.finished && (
              <div className="mx-auto px-6 py-3 rounded-2xl bg-green-50 border border-green-200">
                <p className="text-lg font-bold text-green-700 text-center">Debate Complete</p>
              </div>
            )}

            {/* Elapsed speaking time */}
            <div className="text-5xl font-mono font-light tracking-tighter text-gray-800">
              {formatTime(elapsed)}
            </div>

            {/* ─── Mic Controls ─── */}
            <div className="flex items-center justify-center gap-6">
              {/* Mute / Unmute button */}
              <button
                onClick={toggleMute}
                disabled={!canSpeak || !isRecording}
                className={`h-16 w-16 rounded-full flex flex-col items-center justify-center shadow-lg transition-all ${
                  !canSpeak || !isRecording ? "bg-gray-200 text-gray-400 cursor-not-allowed" :
                  isMuted ? "bg-amber-500 text-white ring-2 ring-amber-300" :
                  "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
                }`}
              >
                {isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
              </button>

              {/* Main record / stop button */}
              <button
                onClick={canSpeak ? toggleRecording : undefined}
                disabled={!canSpeak}
                className={`h-32 w-32 rounded-full flex flex-col items-center justify-center gap-2 text-white shadow-2xl transition-all ${
                  !canSpeak ? "bg-gray-300 cursor-not-allowed" :
                  isRecording && !isMuted ? "bg-red-500 animate-pulse" :
                  isRecording && isMuted ? "bg-red-400" :
                  "bg-gray-400"
                }`}
              >
                {!canSpeak ? (
                  <><MicOff className="h-10 w-10" /><span className="font-bold text-xs">Locked</span></>
                ) : isRecording ? (
                  <><Square className="h-10 w-10 fill-white" /><span className="font-bold">End</span></>
                ) : (
                  <><Mic className="h-10 w-10" /><span className="font-bold">Resume</span></>
                )}
              </button>

              {/* Spacer to keep main button centered */}
              <div className="h-16 w-16" />
            </div>

            {/* Mute status label */}
            <AnimatePresence>
              {isMuted && isRecording && (
                <motion.p
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="text-amber-600 font-semibold text-sm flex items-center justify-center gap-1.5"
                >
                  <MicOff className="h-4 w-4" /> Muted — tap to unmute
                </motion.p>
              )}
            </AnimatePresence>

            <div className="max-w-md w-full h-32 mx-auto bg-white rounded-2xl p-4 shadow-sm border border-gray-100 overflow-y-auto">
              <p className="text-sm text-gray-400 text-center mb-2">Live Transcript</p>
              <p className="text-base text-gray-800 italic">
                {isMuted ? "Microphone muted..." : liveText || (isRecording ? "Listening..." : canSpeak ? "Tap to start" : "Waiting for your turn...")}
              </p>
            </div>
          </div>
        </div>
        <div className="p-6">
          <button
            onClick={handleSubmit}
            className="w-full h-14 rounded-2xl bg-gray-900 text-white font-bold text-lg flex justify-center items-center"
          >
            Finish & Leave
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-6">
      <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
      <h2 className="text-2xl font-bold mb-2">Great Job!</h2>
      <p className="text-gray-500 text-center">Your speech has been recorded. You can close this window.</p>
    </div>
  );
}