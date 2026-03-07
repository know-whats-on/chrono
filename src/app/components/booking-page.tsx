import React, { useState, useEffect, useMemo } from "react";
import { useParams } from "react-router";
import { getBookingInfo, getBookingSlots, submitBookingRequest } from "../lib/api";
import { SplashScreen } from "./splash-screen";
import {
  Clock, Loader2, ChevronLeft, ChevronRight,
  User, Mail, Send, CheckCircle2, MessageSquare, Globe, ChevronDown,
  CalendarDays,
} from "lucide-react";
import svgPaths from "../../imports/svg-6bmvk84f5e";
import imgBg from "/src/assets/01bc91df54c2f640585641427d670f790fedbad5.png";
import { getCachedAssetUrls } from "../lib/asset-manager";

const DURATIONS = [15, 30, 45, 60, 90];

/** Get the browser's IANA timezone, e.g. "America/New_York" */
function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

/** Format a time label like "10:00 AM" for an ISO string in a given tz */
function formatSlotInTz(iso: string, tz: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: tz,
  });
}

/** Friendly timezone label e.g. "America/New_York (EDT, UTC-4)" */
function tzLabel(tz: string): string {
  try {
    const now = new Date();
    const short = now.toLocaleTimeString("en-US", { timeZone: tz, timeZoneName: "short" }).split(" ").pop() || "";
    const offset = now.toLocaleTimeString("en-US", { timeZone: tz, timeZoneName: "longOffset" }).split(" ").pop() || "";
    return `${tz.replace(/_/g, " ")} (${short}, ${offset})`;
  } catch {
    return tz;
  }
}

/** Common timezones for the selector */
const COMMON_TIMEZONES = [
  "Pacific/Auckland", "Australia/Sydney", "Australia/Adelaide", "Australia/Perth",
  "Asia/Tokyo", "Asia/Shanghai", "Asia/Kolkata", "Asia/Dubai",
  "Europe/Moscow", "Europe/Istanbul", "Europe/Berlin", "Europe/London",
  "Atlantic/Azores", "America/Sao_Paulo", "America/New_York",
  "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Anchorage", "Pacific/Honolulu",
];

/* ── Refractive glass bubble — exact copy from login-page.tsx ── */
function GlassBubble({
  size, cLeft, cTop, cWidth, cHeight,
  strokeViewBox, strokePath, strokeGradientId, strokeGradient,
  specX, specY,
}: {
  size: number; cLeft: number; cTop: number; cWidth: number; cHeight: number;
  strokeViewBox: string; strokePath: React.ReactNode;
  strokeGradientId: string; strokeGradient: React.ReactNode;
  specX: number; specY: number;
}) {
  const dx = size > 80 ? 3 : 2;
  return (
    <div className="contents">
      <div style={{ position: "absolute", inset: 0, borderRadius: "50%", overflow: "hidden" }}>
        <div style={{ position: "absolute", left: cLeft, top: cTop, width: cWidth, height: cHeight, opacity: 0.55 }}>
          <svg viewBox="0 0 438.776 536.282" style={{ width: "100%", height: "100%" }} fill="none">
            <path d={svgPaths.p15267700} fill="white" />
          </svg>
        </div>
        <div style={{ position: "absolute", left: cLeft + dx, top: cTop - 1, width: cWidth, height: cHeight, opacity: 0.2, mixBlendMode: "screen" }}>
          <svg viewBox="0 0 438.776 536.282" style={{ width: "100%", height: "100%" }} fill="none">
            <path d={svgPaths.p15267700} fill="#ffb0a0" />
          </svg>
        </div>
        <div style={{ position: "absolute", left: cLeft - dx, top: cTop + 1, width: cWidth, height: cHeight, opacity: 0.2, mixBlendMode: "screen" }}>
          <svg viewBox="0 0 438.776 536.282" style={{ width: "100%", height: "100%" }} fill="none">
            <path d={svgPaths.p15267700} fill="#90b8ff" />
          </svg>
        </div>
        <div style={{ position: "absolute", left: cLeft + 1, top: cTop + dx, width: cWidth, height: cHeight, opacity: 0.1, mixBlendMode: "screen" }}>
          <svg viewBox="0 0 438.776 536.282" style={{ width: "100%", height: "100%" }} fill="none">
            <path d={svgPaths.p15267700} fill="#d4ff90" />
          </svg>
        </div>
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: `radial-gradient(circle at ${specX}% ${specY}%, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.15) 20%, transparent 55%)`, pointerEvents: "none" }} />
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", boxShadow: "inset 0 0 8px 2px rgba(255,255,255,0.18), inset 0 0 20px 4px rgba(180,210,255,0.06)", pointerEvents: "none" }} />
      </div>
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} fill="none" viewBox={strokeViewBox}>
        {strokePath}
        <defs>{strokeGradient}</defs>
      </svg>
    </div>
  );
}

/* ── Full Chrono logo with C letterform + 3 refractive bubbles (from login page) ── */
function ChronoLogo() {
  const S = 1.12;
  const cW = 130 * S;
  const cH = 160 * S;

  const b1cx = 75, b1ox = 25 - (-20), b1oy = 10 - (-10);
  const b1Left = b1cx + (b1ox - b1cx) * S;
  const b1Top  = b1cx + (b1oy - b1cx) * S;

  const b2cx = 57.5, b2ox = 25 - 65, b2oy = 10 - 75;
  const b2Left = b2cx + (b2ox - b2cx) * S;
  const b2Top  = b2cx + (b2oy - b2cx) * S;

  const b3cx = 35, b3ox = 25 - 105, b3oy = 10 - (-15);
  const b3Left = b3cx + (b3ox - b3cx) * S;
  const b3Top  = b3cx + (b3oy - b3cx) * S;

  return (
    <div className="relative" style={{ width: 180, height: 180 }}>
      {/* Base C letterform */}
      <div className="absolute" style={{ width: 130, height: 160, left: 25, top: 10 }}>
        <svg className="w-full h-full drop-shadow-lg" fill="none" viewBox="0 0 438.776 536.282">
          <path d={svgPaths.p15267700} fill="white" fillOpacity="0.9" />
        </svg>
      </div>

      {/* Bubble 1 — large, upper-left */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: 150, height: 150, left: -20, top: -10,
          animation: "bk-b1 7s ease-in-out infinite",
        }}
      >
        <GlassBubble
          size={150} cLeft={b1Left} cTop={b1Top} cWidth={cW} cHeight={cH}
          specX={35} specY={30}
          strokeViewBox="0 0 492 492" strokeGradientId="bk-b1sg"
          strokePath={
            <path d={svgPaths.p272f8700} stroke="url(#bk-b1sg)" strokeOpacity="0.7" strokeWidth="3" />
          }
          strokeGradient={
            <linearGradient gradientUnits="userSpaceOnUse" id="bk-b1sg" x1="0" x2="492" y1="246" y2="246">
              <stop stopColor="#F3FF4F" />
              <stop offset="1" stopColor="#707EC0" />
            </linearGradient>
          }
        />
      </div>

      {/* Bubble 2 — medium, lower-right */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: 115, height: 115, left: 65, top: 75,
          animation: "bk-b2 9s ease-in-out infinite",
        }}
      >
        <GlassBubble
          size={115} cLeft={b2Left} cTop={b2Top} cWidth={cW} cHeight={cH}
          specX={38} specY={28}
          strokeViewBox="0 0 346 346" strokeGradientId="bk-b2sg"
          strokePath={
            <circle cx="173" cy="173" r="171.5" stroke="url(#bk-b2sg)" strokeOpacity="0.7" strokeWidth="3" />
          }
          strokeGradient={
            <radialGradient cx="0" cy="0" gradientTransform="translate(173 173) scale(173)" gradientUnits="userSpaceOnUse" id="bk-b2sg" r="1">
              <stop stopColor="white" />
              <stop offset="1" stopColor="#98C1EA" />
            </radialGradient>
          }
        />
      </div>

      {/* Bubble 3 — small accent, upper-right */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: 70, height: 70, left: 105, top: -15,
          animation: "bk-b3 11s ease-in-out infinite",
        }}
      >
        <GlassBubble
          size={70} cLeft={b3Left} cTop={b3Top} cWidth={cW} cHeight={cH}
          specX={36} specY={32}
          strokeViewBox="0 0 492 492" strokeGradientId="bk-b3sg"
          strokePath={
            <path d={svgPaths.p272f8700} stroke="url(#bk-b3sg)" strokeOpacity="0.5" strokeWidth="4" />
          }
          strokeGradient={
            <linearGradient gradientUnits="userSpaceOnUse" id="bk-b3sg" x1="0" x2="492" y1="100" y2="400">
              <stop stopColor="#ffffff" />
              <stop offset="1" stopColor="#c4b5fd" />
            </linearGradient>
          }
        />
      </div>
    </div>
  );
}

export function BookingPage({ code: propCode, defaultName }: { code?: string; defaultName?: string }) {
  const params = useParams<{ code: string }>();
  const code = propCode || params.code;
  const [info, setInfo] = useState<{ user_name: string; timezone: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSplash, setShowSplash] = useState(true);
  const [error, setError] = useState("");

  // Step state
  const [step, setStep] = useState<"date" | "duration" | "slots" | "details" | "done">("date");
  const [selectedDate, setSelectedDate] = useState("");
  const [duration, setDuration] = useState(30);
  const [slots, setSlots] = useState<{ start_at: string; end_at: string }[]>([]);
  const [hostTz, setHostTz] = useState("UTC");
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{ start_at: string; end_at: string } | null>(null);
  const [visitorName, setVisitorName] = useState(defaultName || "");
  const [visitorEmail, setVisitorEmail] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Timezone
  const [visitorTz, setVisitorTz] = useState(() => detectTimezone());
  const [showTzPicker, setShowTzPicker] = useState(false);
  const [tzSearch, setTzSearch] = useState("");

  const filteredTimezones = useMemo(() => {
    const q = tzSearch.toLowerCase().replace(/\s+/g, "");
    if (!q) return COMMON_TIMEZONES;
    return COMMON_TIMEZONES.filter(tz => tz.toLowerCase().replace(/[_/\s]+/g, "").includes(q));
  }, [tzSearch]);

  // Calendar
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  useEffect(() => {
    if (!code) return;
    setLoading(true);
    getBookingInfo(code)
      .then((data) => {
        setInfo(data);
        setHostTz(data.timezone || "UTC");
      })
      .catch((e) => setError(e.message || "Booking link not found"))
      .finally(() => setLoading(false));
  }, [code]);

  const handleDateSelect = (dateStr: string) => {
    setSelectedDate(dateStr);
    setStep("duration");
  };

  const handleDurationSelect = async (d: number) => {
    setDuration(d);
    setStep("slots");
    setSlotsLoading(true);
    try {
      const result = await getBookingSlots(code!, selectedDate, d);
      setSlots(result.slots || []);
      if (result.timezone) setHostTz(result.timezone);
    } catch (e: any) {
      setSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  };

  const handleSlotSelect = (slot: { start_at: string; end_at: string }) => {
    setSelectedSlot(slot);
    setStep("details");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlot || !visitorName.trim() || !visitorEmail.trim()) return;
    setSubmitting(true);
    try {
      await submitBookingRequest(code!, {
        visitor_name: visitorName.trim(),
        visitor_email: visitorEmail.trim(),
        slot_start: selectedSlot.start_at,
        slot_end: selectedSlot.end_at,
        duration_minutes: duration,
        note: note.trim() || undefined,
      });
      setStep("done");
    } catch (e: any) {
      setError(e.message || "Failed to submit request");
    } finally {
      setSubmitting(false);
    }
  };

  // Calendar rendering
  const renderCalendar = () => {
    const { year, month } = calMonth;
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDow = firstDay.getDay();
    const daysInMonth = lastDay.getDate();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const weeks: (number | null)[][] = [];
    let week: (number | null)[] = Array(startDow).fill(null);

    for (let d = 1; d <= daysInMonth; d++) {
      week.push(d);
      if (week.length === 7) { weeks.push(week); week = []; }
    }
    if (week.length > 0) {
      while (week.length < 7) week.push(null);
      weeks.push(week);
    }

    const monthLabel = new Date(year, month).toLocaleDateString("en-US", { month: "long", year: "numeric" });

    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setCalMonth(p => p.month === 0 ? { year: p.year - 1, month: 11 } : { ...p, month: p.month - 1 })}
            className="p-2 rounded-xl hover:bg-white/30 transition"><ChevronLeft className="w-5 h-5 text-slate-600" /></button>
          <span className="text-sm font-semibold text-slate-700">{monthLabel}</span>
          <button onClick={() => setCalMonth(p => p.month === 11 ? { year: p.year + 1, month: 0 } : { ...p, month: p.month + 1 })}
            className="p-2 rounded-xl hover:bg-white/30 transition"><ChevronRight className="w-5 h-5 text-slate-600" /></button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center mb-2">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
            <span key={i} className="text-[11px] font-medium text-slate-400">{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {weeks.flat().map((day, i) => {
            if (day === null) return <div key={i} />;
            const date = new Date(year, month, day);
            const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const isPast = date < today;
            const isToday = date.getTime() === today.getTime();
            return (
              <button
                key={i}
                disabled={isPast}
                onClick={() => handleDateSelect(dateStr)}
                className={`w-full aspect-square rounded-xl text-sm font-medium transition
                  ${isPast ? "text-slate-300 cursor-not-allowed" : "hover:bg-violet-100 hover:text-violet-700 cursor-pointer"}
                  ${isToday ? "ring-2 ring-violet-400 ring-offset-1" : ""}
                  ${selectedDate === dateStr ? "bg-violet-500 text-white hover:bg-violet-600 hover:text-white" : "text-slate-700"}
                `}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  /** Timezone selector row shown on slots + details steps */
  const renderTzSelector = () => (
    <div className="relative mt-3 mb-1 z-50">
      <button
        onClick={() => setShowTzPicker(!showTzPicker)}
        className="flex items-center gap-1.5 text-[11px] text-violet-600 font-medium hover:underline"
      >
        <Globe className="w-3 h-3" />
        <span className="truncate max-w-[260px]">{visitorTz.replace(/_/g, " ")}</span>
        <ChevronDown className="w-3 h-3" />
      </button>
      {showTzPicker && (
        <div className="absolute top-full left-0 mt-1 z-[100] bg-white rounded-xl shadow-xl border border-slate-200 w-72 max-h-64 overflow-hidden flex flex-col">
          <div className="p-2 border-b border-slate-100">
            <input
              autoFocus
              value={tzSearch}
              onChange={(e) => setTzSearch(e.target.value)}
              placeholder="Search timezone..."
              className="w-full text-xs px-2 py-1.5 rounded-lg border border-slate-200 outline-none focus:ring-1 focus:ring-violet-300"
            />
          </div>
          <div className="overflow-y-auto flex-1">
            {filteredTimezones.map(tz => (
              <button
                key={tz}
                onClick={() => { setVisitorTz(tz); setShowTzPicker(false); setTzSearch(""); }}
                className={`w-full text-left px-3 py-2 text-xs hover:bg-violet-50 transition ${tz === visitorTz ? "bg-violet-50 text-violet-700 font-semibold" : "text-slate-600"}`}
              >
                {tz.replace(/_/g, " ")}
              </button>
            ))}
            {filteredTimezones.length === 0 && (
              <p className="text-xs text-slate-400 p-3 text-center">No results</p>
            )}
          </div>
        </div>
      )}
    </div>
  );

  const isLoading = loading || showSplash;

  if (isLoading) {
    return <SplashScreen onComplete={() => setShowSplash(false)} />;
  }

  if (error && !info) {
    return (
      <div className="min-h-dvh flex items-center justify-center px-4" style={{ background: "linear-gradient(135deg, #f8c0d8, #d8b4fe, #93c5fd, #99f6e4)" }}>
        <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-xl">
          <div className="text-4xl mb-4">😔</div>
          <h1 className="text-xl font-bold text-slate-800 mb-2">Link Not Found</h1>
          <p className="text-sm text-slate-500">This booking link is invalid or has been deactivated.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-start py-8 px-4" style={{ background: "linear-gradient(135deg, #f8c0d8 0%, #d8b4fe 25%, #93c5fd 55%, #99f6e4 100%)" }}>
      {/* Bubble breathing keyframes */}
      <style>{`
        @keyframes bk-b1 {
          0%, 100% { transform: translate(0,0) scale(1); }
          25%  { transform: translate(2px,1px) scale(1.03); }
          50%  { transform: translate(1px,-2px) scale(1.01); }
          75%  { transform: translate(-1px,1px) scale(1.04); }
        }
        @keyframes bk-b2 {
          0%, 100% { transform: translate(0,0) scale(1); }
          33%  { transform: translate(-3px,3px) scale(1.08); }
          66%  { transform: translate(2px,-2px) scale(0.96); }
        }
        @keyframes bk-b3 {
          0%, 100% { transform: translate(0,0) scale(1); }
          25%  { transform: translate(1px,1px) scale(1.02); }
          50%  { transform: translate(-1px,-1px) scale(1.01); }
          75%  { transform: translate(1px,1px) scale(1.03); }
        }
      `}</style>

      {/* Header with C Bubble */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center mb-3">
          <ChronoLogo />
        </div>
        <h1 className="text-xl font-bold text-slate-800">{info?.user_name}'s Calendar</h1>
        <p className="text-sm text-slate-600 mt-1">Book a meeting time</p>
      </div>

      {/* Card */}
      <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-xl max-w-md w-full overflow-visible" style={{ border: "1px solid rgba(255,255,255,0.6)" }}>
        {/* Progress */}
        <div className="px-5 pt-4 pb-2 flex items-center gap-2">
          {["date", "duration", "slots", "details"].map((s, i) => (
            <div className="contents" key={s}>
              <div className={`w-2.5 h-2.5 rounded-full transition ${
                step === s ? "bg-violet-500 scale-110" :
                ["date", "duration", "slots", "details"].indexOf(step) > i ? "bg-violet-300" : "bg-slate-200"
              }`} />
              {i < 3 && <div className={`flex-1 h-0.5 rounded-full transition ${
                ["date", "duration", "slots", "details"].indexOf(step) > i ? "bg-violet-300" : "bg-slate-200"
              }`} />}
            </div>
          ))}
        </div>

        <div className="px-5 pb-5">
          {/* Step 1: Date */}
          {step === "date" && (
            <div>
              <h2 className="text-base font-semibold text-slate-700 mt-3 mb-4 flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-violet-500" /> Pick a date
              </h2>
              {renderCalendar()}
              {/* Host timezone info */}
              <div className="mt-3 flex items-center gap-1.5 text-[10px] text-slate-400">
                <Globe className="w-3 h-3" />
                <span>Host timezone: {hostTz.replace(/_/g, " ")}</span>
              </div>
            </div>
          )}

          {/* Step 2: Duration */}
          {step === "duration" && (
            <div>
              <button onClick={() => setStep("date")} className="text-xs text-violet-600 font-medium mb-3 flex items-center gap-1 hover:underline">
                <ChevronLeft className="w-3 h-3" /> Change date
              </button>
              <h2 className="text-base font-semibold text-slate-700 mb-1 flex items-center gap-2">
                <Clock className="w-4 h-4 text-violet-500" /> How long?
              </h2>
              <p className="text-xs text-slate-500 mb-4">{new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>
              <div className="grid grid-cols-2 gap-2">
                {DURATIONS.map((d) => (
                  <button
                    key={d}
                    onClick={() => handleDurationSelect(d)}
                    className="py-3 rounded-xl text-sm font-medium transition hover:bg-violet-50 hover:text-violet-700 border border-slate-200 hover:border-violet-300 text-slate-700"
                  >
                    {d} min
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Slots */}
          {step === "slots" && (
            <div>
              <button onClick={() => setStep("duration")} className="text-xs text-violet-600 font-medium mb-3 flex items-center gap-1 hover:underline">
                <ChevronLeft className="w-3 h-3" /> Change duration
              </button>
              <h2 className="text-base font-semibold text-slate-700 mb-1 flex items-center gap-2">
                <Clock className="w-4 h-4 text-violet-500" /> Available times
              </h2>
              <p className="text-xs text-slate-500 mb-1">
                {new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} · {duration} min
              </p>
              {/* Timezone selector */}
              {renderTzSelector()}

              {slotsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-violet-500" />
                </div>
              ) : slots.length === 0 ? (
                <div className="text-center py-10">
                  <div className="text-3xl mb-3">😔</div>
                  <p className="text-sm text-slate-500">No available slots on this day.</p>
                  <p className="text-[11px] text-slate-400 mt-1">Slots are only available during work hours ({hostTz.replace(/_/g, " ")})</p>
                  <button onClick={() => setStep("date")} className="mt-3 text-sm text-violet-600 font-medium hover:underline">Try another date</button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto pr-1">
                  {slots.map((slot, i) => (
                    <button
                      key={i}
                      onClick={() => handleSlotSelect(slot)}
                      className="py-2.5 px-3 rounded-xl text-sm font-medium transition hover:bg-violet-50 hover:text-violet-700 border border-slate-200 hover:border-violet-300 text-slate-700 text-center"
                    >
                      {formatSlotInTz(slot.start_at, visitorTz)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 4: Details */}
          {step === "details" && (
            <div>
              <button onClick={() => setStep("slots")} className="text-xs text-violet-600 font-medium mb-3 flex items-center gap-1 hover:underline">
                <ChevronLeft className="w-3 h-3" /> Change time
              </button>
              <h2 className="text-base font-semibold text-slate-700 mb-1 flex items-center gap-2">
                <User className="w-4 h-4 text-violet-500" /> Your details
              </h2>
              {selectedSlot && (
                <div className="rounded-xl p-3 mb-4 mt-2" style={{ background: "rgba(124,58,237,0.06)", border: "1px solid rgba(124,58,237,0.15)" }}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">Date</span>
                    <span className="font-medium text-slate-700">{new Date(selectedSlot.start_at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: visitorTz })}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm mt-1">
                    <span className="text-slate-500">Time</span>
                    <span className="font-medium text-slate-700">{formatSlotInTz(selectedSlot.start_at, visitorTz)} – {formatSlotInTz(selectedSlot.end_at, visitorTz)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm mt-1">
                    <span className="text-slate-500">Duration</span>
                    <span className="font-medium text-slate-700">{duration} min</span>
                  </div>
                  <div className="flex items-center justify-between text-sm mt-1">
                    <span className="text-slate-500">Timezone</span>
                    <span className="font-medium text-slate-700 text-[11px]">{visitorTz.replace(/_/g, " ")}</span>
                  </div>
                </div>
              )}
              {renderTzSelector()}
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    value={visitorName}
                    onChange={(e) => setVisitorName(e.target.value)}
                    placeholder="Your name"
                    required
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent bg-white"
                  />
                </div>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    value={visitorEmail}
                    onChange={(e) => setVisitorEmail(e.target.value)}
                    type="email"
                    placeholder="Your email"
                    required
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent bg-white"
                  />
                </div>
                <div className="relative">
                  <MessageSquare className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Add a note (optional)"
                    rows={2}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent bg-white resize-none"
                  />
                </div>
                {error && <p className="text-xs text-red-500">{error}</p>}
                <button
                  type="submit"
                  disabled={submitting || !visitorName.trim() || !visitorEmail.trim()}
                  className="w-full py-3 rounded-xl text-sm font-semibold text-white transition disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background: "linear-gradient(135deg, #7c3aed, #6366f1)" }}
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Request Meeting
                </button>
              </form>
            </div>
          )}

          {/* Done */}
          {step === "done" && (
            <div className="text-center py-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-lg font-bold text-slate-800 mb-2">Request Sent!</h2>
              <p className="text-sm text-slate-500 leading-relaxed">
                {info?.user_name} has been notified. You'll receive an email at <strong>{visitorEmail}</strong> once they accept or suggest another time.
              </p>
              {selectedSlot && (
                <div className="mt-4 rounded-xl p-3 text-left" style={{ background: "rgba(124,58,237,0.06)", border: "1px solid rgba(124,58,237,0.15)" }}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">Date</span>
                    <span className="font-medium text-slate-700">{new Date(selectedSlot.start_at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: visitorTz })}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm mt-1">
                    <span className="text-slate-500">Time</span>
                    <span className="font-medium text-slate-700">{formatSlotInTz(selectedSlot.start_at, visitorTz)} – {formatSlotInTz(selectedSlot.end_at, visitorTz)}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] mt-2 text-slate-400">
                    <span className="flex items-center gap-1"><Globe className="w-3 h-3" /> {visitorTz.replace(/_/g, " ")}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <p className="text-center text-[10px] font-light tracking-wide mt-6" style={{ color: "rgba(100, 100, 130, 0.7)" }}>
        Powered by <a href="https://chrono.knowwhatson.com" className="hover:underline" style={{ color: "inherit" }}>Chrono</a> · Created with <span style={{ color: "rgba(200, 60, 80, 0.75)" }}>&#9829;</span> by <a href="https://knowwhatson.com" target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: "inherit" }}>What's On!</a>
      </p>
    </div>
  );
}