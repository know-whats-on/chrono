import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "react-router";
import { Mic, MicOff, Square, AlertCircle, CheckCircle2, Users, User } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import * as api from "../utils/api";
import { Session, TranscriptChunk } from "../types";
import { LoadSplash } from "../components/LoadSplash";
import svgPaths from "../../imports/svg-syt4sq8lus";

/* ─── SpeechRecognition type shim ─── */
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

type Stage = "loading" | "error" | "validate" | "countdown" | "recorder" | "done";

export default function StudentPortal() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [stage, setStage] = useState<Stage>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Validation
  const [studentNumber, setStudentNumber] = useState("");
  const [groupId, setGroupId] = useState("");
  const [validating, setValidating] = useState(false);
  const [validatedStudent, setValidatedStudent] = useState<any>(null);

  // Countdown
  const [countdownValue, setCountdownValue] = useState(3);

  // Recorder
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [liveText, setLiveText] = useState("");
  const [finalizedChunks, setFinalizedChunks] = useState<TranscriptChunk[]>([]);
  const recognitionRef = useRef<any>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunkCounterRef = useRef(0);

  // Load session
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

  // Timer
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

  /* ─── Validation ─── */
  const handleValidate = async () => {
    if (!session || !studentNumber.trim()) {
      toast.error("Please enter your Student ID");
      return;
    }
    if (session.type === "group" && !groupId.trim()) {
      toast.error("Please enter your Group Number");
      return;
    }
    setValidating(true);
    try {
      const result = await api.validateStudent(
        session.id,
        studentNumber.trim(),
        session.type === "group" ? groupId.trim() : undefined,
      );
      if (result.alreadySubmitted) {
        toast.error("You have already completed this assessment.");
        setErrorMsg("You have already completed this assessment. You cannot rejoin.");
        setStage("error");
        return;
      }
      if (result.valid && result.student) {
        setValidatedStudent(result.student);
        setStage("recorder");
        toast.success(`Welcome, ${result.student.firstName}!`);
      } else {
        toast.error(result.error || "Validation failed");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to validate");
    } finally {
      setValidating(false);
    }
  };

  /* ─── Countdown then start recording ─── */
  const isRecordingRef = useRef(false);
  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  const startCountdownThenRecord = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("Speech recognition is not supported in this browser. Please use Chrome.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-AU";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      if (!isRecordingRef.current) return; // ignore during countdown
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          const rawText = transcript.trim();
          if (!rawText) continue; // skip empty
          const chunkId = `chunk_${Date.now()}_${chunkCounterRef.current++}`;
          
          const chunk: TranscriptChunk = {
            id: chunkId,
            sessionId: session!.id,
            studentId: validatedStudent.id,
            studentName: `${validatedStudent.firstName} ${validatedStudent.lastName}`,
            groupId: validatedStudent.groupId || undefined,
            text: rawText,
            timestamp: Date.now(),
            isFinal: true,
          };
          setFinalizedChunks(prev => [...prev, chunk]);
          setLiveText("");

          // Punctuate and send asynchronously
          (async () => {
            try {
              const punctuated = await api.punctuateText(rawText);
              const cleanChunk = { ...chunk, text: punctuated };
              setFinalizedChunks(prev =>
                prev.map(c => c.id === chunkId ? cleanChunk : c)
              );
              await api.appendTranscript(session!.id, cleanChunk);
            } catch (err) {
              console.error("Punctuation failed, sending raw:", err);
              api.appendTranscript(session!.id, chunk).catch(e =>
                console.error("Failed to send transcript chunk:", e)
              );
            }
          })();
        } else {
          interimText += transcript;
        }
      }
      if (interimText) setLiveText(interimText);
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      if (event.error !== "no-speech" && isRecordingRef.current) {
        toast.error(`Recognition error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      // Auto-restart if still recording
      if (recognitionRef.current) {
        try { recognition.start(); } catch {}
      }
    };

    recognitionRef.current = recognition;

    // Start immediately synchronously in the click handler to satisfy iOS Safari
    try {
      recognition.start();
    } catch (e) {
      console.error("Failed to start recognition immediately", e);
    }

    // Now request permissions and show countdown
    navigator.mediaDevices.getUserMedia({ audio: true }).then(() => {
      setStage("countdown");
      setCountdownValue(3);
      let count = 3;
      const iv = setInterval(() => {
        count--;
        if (count > 0) {
          setCountdownValue(count);
        } else {
          clearInterval(iv);
          setStage("recorder");
          setIsRecording(true);
          setElapsed(0);
        }
      }, 1000);
    }).catch(() => {
      toast.error("Microphone access denied");
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
    });
  }, [session, validatedStudent]);

  const stopRecording = useCallback(async () => {
    if (recognitionRef.current) {
      const rec = recognitionRef.current;
      recognitionRef.current = null;
      rec.stop();
    }
    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);

    // Mark student as submitted to prevent re-entry
    if (session && validatedStudent) {
      try {
        await api.markStudentSubmitted(session.id, validatedStudent.id);
      } catch (err) {
        console.error("Failed to mark student as submitted:", err);
      }
    }

    setStage("done");
  }, [session, validatedStudent]);

  /* ─── Render Stages ─── */
  if (stage === "loading") {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#f7f7f8]">
        <LoadSplash />
      </div>
    );
  }

  if (stage === "error") {
    return (
      <div className="min-h-[100dvh] bg-[#f7f7f8] flex flex-col items-center justify-center p-6 text-center">
        <div className="h-16 w-16 rounded-full bg-red-50 flex items-center justify-center mb-4">
          <AlertCircle className="h-8 w-8 text-red-500" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Session Unavailable</h1>
        <p className="text-sm text-gray-500 max-w-xs">{errorMsg}</p>
      </div>
    );
  }

  if (stage === "done") {
    return (
      <div className="min-h-[100dvh] bg-[#f7f7f8] flex flex-col items-center justify-center p-6 text-center">
        <div className="h-16 w-16 rounded-full bg-green-50 flex items-center justify-center mb-4">
          <CheckCircle2 className="h-8 w-8 text-[#34c759]" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Assessment Complete</h1>
        <p className="text-sm text-gray-500 max-w-xs">
          Your response has been recorded. You may close this page.
        </p>
        <p className="text-xs text-gray-400 mt-3">
          Duration: {formatTime(elapsed)} &middot; {finalizedChunks.length} segments captured
        </p>
      </div>
    );
  }

  /* ─── Countdown Stage ─── */
  if (stage === "countdown") {
    return (
      <div className="min-h-[100dvh] bg-[#f7f7f8] flex flex-col items-center justify-center p-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={countdownValue}
            initial={{ scale: 0.3, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.5, opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="flex flex-col items-center"
          >
            <div className="h-32 w-32 rounded-full bg-[#0a84ff] flex items-center justify-center shadow-lg shadow-blue-500/30">
              <span className="text-6xl font-bold text-white">{countdownValue}</span>
            </div>
            <p className="text-lg font-semibold text-gray-500 mt-6">Get ready to speak...</p>
          </motion.div>
        </AnimatePresence>
      </div>
    );
  }

  if (stage === "validate" && session) {
    return (
      <div className="min-h-[100dvh] bg-[#f7f7f8] flex flex-col">
        {/* Header */}
        <div className="shrink-0 px-6 pt-6 pb-4 bg-white border-b border-gray-100">
          <div className="flex items-center justify-center mb-4">
            <svg className="h-5 w-auto" fill="none" viewBox="-5 -5 1148 342">
              <path d={svgPaths.p36fbe580} fill="#1c1c1e" />
              <path d={svgPaths.p5338fa0} fill="#1c1c1e" />
              <path d={svgPaths.p2058800} fill="#1c1c1e" />
              <path d={svgPaths.p34ab3a00} fill="#1c1c1e" />
              <path d={svgPaths.p137f3780} fill="#DE5E29" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-center">{session.assessmentTitle}</h1>
          <p className="text-sm text-gray-500 text-center mt-1">{session.courseCode}</p>
          <div className="flex justify-center mt-3">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold text-white ${
              session.type === "group" ? "bg-[#af52de]" : "bg-[#0a84ff]"
            }`}>
              {session.type === "group" ? <Users className="h-3 w-3" /> : <User className="h-3 w-3" />}
              {session.type === "group" ? "Group Assessment" : "Individual Assessment"}
            </span>
          </div>
        </div>

        {/* Form */}
        <div className="flex-1 flex flex-col justify-center px-6 py-8">
          <div className="space-y-5 max-w-sm mx-auto w-full">
            {session.type === "group" && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Group Number</label>
                <input
                  type="text"
                  placeholder="e.g. Group A"
                  value={groupId}
                  onChange={e => setGroupId(e.target.value)}
                  className="flex h-12 w-full rounded-xl bg-[#767680]/[0.08] px-4 text-base outline-none placeholder:text-[#3C3C43]/50 focus:ring-2 focus:ring-[#0a84ff] transition-all"
                  onKeyDown={e => e.key === "Enter" && document.getElementById("sid-input")?.focus()}
                />
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Student ID</label>
              <input
                id="sid-input"
                type="text"
                placeholder="e.g. z5123456"
                value={studentNumber}
                onChange={e => setStudentNumber(e.target.value)}
                className="flex h-12 w-full rounded-xl bg-[#767680]/[0.08] px-4 text-base outline-none placeholder:text-[#3C3C43]/50 focus:ring-2 focus:ring-[#0a84ff] transition-all"
                onKeyDown={e => e.key === "Enter" && handleValidate()}
              />
            </div>

            <button
              onClick={handleValidate}
              disabled={validating}
              className="w-full h-12 rounded-xl bg-[#0a84ff] text-white font-medium text-base disabled:opacity-50 transition-all active:scale-[0.98]"
            >
              {validating ? "Validating..." : "Join Assessment"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ─── Recorder Stage ─── */
  if (stage === "recorder" && session && validatedStudent) {
    return (
      <div className="min-h-[100dvh] bg-[#f7f7f8] flex flex-col">
        {/* Header */}
        <div className="shrink-0 px-6 pt-5 pb-4 bg-white border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">
                {validatedStudent.firstName} {validatedStudent.lastName}
              </p>
              <p className="text-xs text-gray-500">
                {validatedStudent.studentNumber}
                {validatedStudent.groupId && ` · ${validatedStudent.groupId}`}
              </p>
            </div>
            {isRecording && (
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-red-50">
                <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-xs font-semibold text-red-600 font-mono">{formatTime(elapsed)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Transcript area */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {finalizedChunks.length === 0 && !liveText && !isRecording && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="h-16 w-16 rounded-full bg-blue-50 flex items-center justify-center mb-4">
                <Mic className="h-8 w-8 text-[#0a84ff]" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Ready to Record</h2>
              <p className="text-sm text-gray-500 max-w-xs">
                Tap the microphone button below to start your assessment. Speak clearly into your device.
              </p>
            </div>
          )}

          {finalizedChunks.map((chunk) => (
            <div key={chunk.id} className="bg-white rounded-xl px-4 py-3 shadow-sm">
              <p className="text-sm text-gray-900 leading-relaxed">{chunk.text}</p>
            </div>
          ))}

          {liveText && (
            <div className="bg-blue-50/60 rounded-xl px-4 py-3 border border-blue-100">
              <p className="text-sm text-gray-600 leading-relaxed italic">{liveText}</p>
            </div>
          )}
        </div>

        {/* Recording controls */}
        <div className="shrink-0 bg-white border-t border-gray-100 px-6 py-5">
          <div className="flex items-center justify-center gap-6">
            {!isRecording ? (
              <button
                onClick={startCountdownThenRecord}
                className="relative"
              >
                <motion.div
                  className="h-20 w-20 rounded-full bg-[#0a84ff] flex items-center justify-center shadow-lg shadow-blue-500/30"
                  whileTap={{ scale: 0.9 }}
                >
                  <Mic className="h-8 w-8 text-white" />
                </motion.div>
                <p className="text-xs text-gray-500 font-medium text-center mt-2">Tap to start</p>
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="relative"
              >
                <motion.div
                  className="h-20 w-20 rounded-full bg-red-500 flex items-center justify-center shadow-lg shadow-red-500/30"
                  animate={{ scale: [1, 1.08, 1] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                >
                  <Square className="h-7 w-7 text-white fill-white rounded-sm" />
                </motion.div>
                <p className="text-xs text-red-500 font-medium text-center mt-2">Tap to stop</p>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
