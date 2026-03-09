import React, { useState, useEffect, useMemo } from "react";
import { useParams, Link } from "react-router";
import { Clock, Calendar as CalendarIcon, CheckCircle, Info, Globe, ChevronDown, ArrowLeft } from "lucide-react";
import { request } from "../lib/api";
import { ExpandableDescription } from "./expandable-description";
import { SplashScreen } from "./splash-screen";

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

function formatSlotInTz(iso: string, tz: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: tz,
  });
}

const COMMON_TIMEZONES = [
  "Pacific/Auckland", "Australia/Sydney", "Australia/Adelaide", "Australia/Perth",
  "Asia/Tokyo", "Asia/Shanghai", "Asia/Kolkata", "Asia/Dubai",
  "Europe/Moscow", "Europe/Istanbul", "Europe/Berlin", "Europe/London",
  "Atlantic/Azores", "America/Sao_Paulo", "America/New_York",
  "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Anchorage", "Pacific/Honolulu",
];

export function OpenBookPage() {
  const { code } = useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showSplash, setShowSplash] = useState(true);
  const [error, setError] = useState("");
  
  const [selectedSlot, setSelectedSlot] = useState<any>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  
  const [bookingStatus, setBookingStatus] = useState<"idle" | "submitting" | "success">("idle");
  const [bookingResult, setBookingResult] = useState<any>(null);
  const [waitlistMissed, setWaitlistMissed] = useState(false);

  // Timezone state
  const [visitorTz, setVisitorTz] = useState(() => detectTimezone());
  const [showTzPicker, setShowTzPicker] = useState(false);
  const [tzSearch, setTzSearch] = useState("");

  const filteredTimezones = useMemo(() => {
    const q = tzSearch.toLowerCase().replace(/\s+/g, "");
    if (!q) return COMMON_TIMEZONES;
    return COMMON_TIMEZONES.filter(tz => tz.toLowerCase().replace(/[_/\s]+/g, "").includes(q));
  }, [tzSearch]);

  useEffect(() => {
    fetchSession();
  }, [code]);

  const fetchSession = async () => {
    try {
      const json = await request(`/open-book/${code}`, {}, true);
      if (json.error) setError(json.error);
      else setData(json);
    } catch (e: any) {
      setError(e.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlot || !name || !email) return;
    
    setBookingStatus("submitting");
    setError("");
    setWaitlistMissed(false);
    
    try {
      const json = await request(`/open-book/${code}/book`, {
        method: "POST",
        body: JSON.stringify({ name, email, slot_id: selectedSlot.id, timezone: visitorTz })
      }, true);
      
      if (json.error) {
        if (json.error === "Waitlist is full for this slot.") {
          setWaitlistMissed(true);
        } else {
          setError(json.error || "Failed to book slot");
        }
        setBookingStatus("idle");
      } else {
        setBookingResult(json);
        setBookingStatus("success");
      }
    } catch (e: any) {
      setError(e.message || "An error occurred");
      setBookingStatus("idle");
    }
  };

  const isLoading = loading || showSplash;
  if (isLoading) return <SplashScreen onComplete={() => setShowSplash(false)} />;
  if (error && !data) return <div className="flex min-h-screen items-center justify-center bg-stone-50"><div className="text-red-500 bg-white p-6 rounded-lg shadow-sm border border-red-100">{error}</div></div>;
  if (!data) return null;

  const { session, event, slots } = data;

  if (bookingStatus === "success") {
    return (
      <div className="h-[100dvh] overflow-y-auto py-12 px-4 sm:px-6">
        <div className="max-w-xl mx-auto glass-elevated rounded-3xl p-8 text-center">
          <CheckCircle className="w-16 h-16 text-green-500 dark:text-green-400 mx-auto mb-6" />
          <h2 className="text-2xl sm:text-3xl font-semibold text-foreground tracking-tight mb-2">
            {bookingResult.isFull ? "You're on the waitlist!" : "Booking Confirmed!"}
          </h2>
          <p className="text-muted-foreground mb-6 text-lg">
            {bookingResult.isFull 
              ? `The time slot was full, so we've added you to the waitlist. We'll notify you if a spot opens up.`
              : `You are confirmed for ${session.title}. A confirmation email has been sent to ${bookingResult.booking.email}.`
            }
          </p>
          <div className="bg-black/5 dark:bg-white/5 rounded-2xl p-4 mb-8 text-left border border-border/10">
            <h3 className="font-medium mb-2">Event Details</h3>
            <p className="text-muted-foreground text-sm mb-1"><strong>Event:</strong> {event.title}</p>
            <p className="text-muted-foreground text-sm mb-1"><strong>Session:</strong> {session.title}</p>
            <p className="text-muted-foreground text-sm">
              <strong>Time:</strong> {new Date(selectedSlot.start_time).toLocaleString('en-US', { 
                weekday: 'long', month: 'long', day: 'numeric', timeZone: visitorTz 
              })} at {formatSlotInTz(selectedSlot.start_time, visitorTz)} ({visitorTz.replace(/_/g, " ")})
            </p>
          </div>
          <button 
            onClick={() => window.location.reload()}
            className="px-6 py-2.5 glass-btn-primary rounded-xl font-medium"
          >
            Book Another Session
          </button>
        </div>
      </div>
    );
  }

  // Sort slots chronologically
  const sortedSlots = [...slots].sort((a,b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

  // Group by date in the selected timezone
  const slotsByDate: Record<string, any[]> = {};
  sortedSlots.forEach(slot => {
    const dateStr = new Date(slot.start_time).toLocaleDateString('en-US', { 
      weekday: 'long', month: 'long', day: 'numeric', timeZone: visitorTz 
    });
    if (!slotsByDate[dateStr]) slotsByDate[dateStr] = [];
    slotsByDate[dateStr].push(slot);
  });

  const renderTzSelector = () => (
    <div className="relative mb-6 z-50">
      <button
        type="button"
        onClick={() => setShowTzPicker(!showTzPicker)}
        className="flex items-center gap-1.5 text-[13px] text-primary font-medium hover:underline bg-primary/5 px-3 py-1.5 rounded-lg border border-primary/10 transition-colors"
      >
        <Globe className="w-3.5 h-3.5" />
        <span className="truncate max-w-[260px]">{visitorTz.replace(/_/g, " ")}</span>
        <ChevronDown className="w-3.5 h-3.5" />
      </button>
      {showTzPicker && (
        <div className="absolute top-full left-0 mt-2 z-[100] bg-background/95 backdrop-blur-xl rounded-xl shadow-xl border border-border/20 w-72 max-h-64 overflow-hidden flex flex-col">
          <div className="p-2 border-b border-border/10">
            <input
              autoFocus
              value={tzSearch}
              onChange={(e) => setTzSearch(e.target.value)}
              placeholder="Search timezone..."
              className="w-full text-xs px-3 py-2 rounded-lg bg-black/5 dark:bg-white/5 border border-border/10 outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="overflow-y-auto flex-1 p-1 custom-scrollbar">
            {filteredTimezones.map(tz => (
              <button
                key={tz}
                onClick={() => { setVisitorTz(tz); setShowTzPicker(false); setTzSearch(""); }}
                className={`w-full text-left px-3 py-2.5 text-xs rounded-md transition-colors ${tz === visitorTz ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5"}`}
              >
                {tz.replace(/_/g, " ")}
              </button>
            ))}
            {filteredTimezones.length === 0 && (
              <p className="text-xs text-muted-foreground p-4 text-center">No results</p>
            )}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="h-[100dvh] overflow-y-auto py-12 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto flex flex-col md:flex-row gap-8">
        
        {/* Left Column: Details */}
        <div className="w-full md:w-1/3">
          <div className="mb-6 md:mb-8">
            <Link 
              to={`/open-event/${event.code}`}
              className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft size={16} /> Go to Main Event
            </Link>
          </div>
          <div className="glass rounded-3xl p-6 sticky top-8">
            <div className="text-xs font-bold tracking-widest text-primary uppercase mb-2">{event.title}</div>
            <h1 className="text-2xl font-semibold text-foreground tracking-tight mb-4">{session.title}</h1>
            <div className="flex items-center text-muted-foreground gap-2 mb-4 text-sm font-medium">
              <Clock size={16} />
              <span>{session.duration} minutes</span>
            </div>
            {session.description && (
              <ExpandableDescription 
                text={session.description} 
                maxLength={250}
                className="mb-6"
                textClassName="text-muted-foreground text-sm leading-relaxed"
              />
            )}
            <div className="bg-primary/5 text-primary p-4 rounded-2xl text-sm flex gap-3 border border-primary/10">
              <Info className="shrink-0 mt-0.5" size={16} />
              <div>Select an available time slot to request a meeting. You can only hold one booking at a time across parallel sessions.</div>
            </div>
          </div>
        </div>

        {/* Right Column: Selection / Form */}
        <div className="w-full md:w-2/3">
          {!selectedSlot ? (
            <div className="glass-elevated rounded-3xl p-6 sm:p-8 !overflow-visible">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 relative z-50">
                <h2 className="text-xl font-semibold tracking-tight text-foreground flex items-center gap-2">
                  <CalendarIcon className="text-muted-foreground" /> Select a Time
                </h2>
                {renderTzSelector()}
              </div>
              
              {Object.keys(slotsByDate).length === 0 ? (
                <div className="text-center py-12 text-muted-foreground bg-black/5 dark:bg-white/5 rounded-2xl border border-border/10">
                  No time slots available for this session yet.
                </div>
              ) : (
                <div className="space-y-8">
                  {Object.entries(slotsByDate).map(([date, daySlots]) => (
                    <div key={date}>
                      <h3 className="font-medium text-primary mb-4 sticky top-0 bg-background/80 backdrop-blur-md py-2 z-10">{date}</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {daySlots.map(slot => {
                          const isFull = slot.isFull;
                          const isWaitlistFull = event.waitlist_full || session.waitlist_full || slot.waitlist_full;
                          return (
                            <button
                              key={slot.id}
                              onClick={() => !isWaitlistFull && setSelectedSlot(slot)}
                              disabled={isWaitlistFull}
                              className={`
                                text-left p-4 rounded-2xl transition-all border
                                ${isWaitlistFull 
                                  ? 'border-border/5 bg-black/5 dark:bg-white/5 opacity-60 cursor-not-allowed'
                                  : isFull 
                                    ? 'border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20' 
                                    : 'border-border/10 hover:border-primary hover:ring-1 hover:ring-primary glass hover:bg-white/10 dark:hover:bg-white/5'
                                }
                              `}
                            >
                              <div className="font-medium text-lg mb-1">
                                {formatSlotInTz(slot.start_time, visitorTz)}
                              </div>
                              <div className={`text-sm ${isWaitlistFull ? 'text-muted-foreground font-medium' : isFull ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-muted-foreground'}`}>
                                {isWaitlistFull ? 'Waitlist Full' : isFull ? 'Join Waitlist' : `${slot.capacity - slot.bookedCount} spots left`}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="glass-elevated rounded-3xl p-6 sm:p-8 !overflow-visible">
              <div className="flex items-center justify-between mb-8 pb-6 border-b border-border/10 relative z-50">
                <div className="flex-1">
                  <div className="text-sm font-medium text-muted-foreground mb-1">Selected Time</div>
                  <h2 className="text-xl font-semibold text-foreground tracking-tight">
                    {new Date(selectedSlot.start_time).toLocaleString('en-US', { 
                      weekday: 'long', month: 'long', day: 'numeric', timeZone: visitorTz
                    })} at {formatSlotInTz(selectedSlot.start_time, visitorTz)}
                  </h2>
                  {selectedSlot.isFull && (
                    <div className="inline-block mt-2 px-2.5 py-1 bg-amber-500/20 text-amber-700 dark:text-amber-400 text-xs font-bold rounded uppercase tracking-wider">
                      Waitlist
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  {renderTzSelector()}
                  <button 
                    type="button"
                    onClick={() => {
                      setSelectedSlot(null);
                      setWaitlistMissed(false);
                    }}
                    className="text-sm font-medium text-muted-foreground hover:text-foreground underline decoration-border/50 underline-offset-4"
                  >
                    Change Time
                  </button>
                </div>
              </div>

              {waitlistMissed ? (
                <div className="text-center py-8 px-4 animate-in fade-in zoom-in duration-300">
                  <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Info className="w-8 h-8" />
                  </div>
                  <h3 className="text-2xl font-bold tracking-tight text-foreground mb-3">
                    Oh no! You were so close.
                  </h3>
                  <p className="text-muted-foreground text-base leading-relaxed mb-8 max-w-md mx-auto">
                    We're incredibly sorry, but the waitlist for this specific time slot reached its maximum capacity just while you were filling out your details. 
                  </p>
                  <button 
                    onClick={() => {
                      setSelectedSlot(null);
                      setWaitlistMissed(false);
                      fetchSession(); // Refresh slots to show the updated availability
                    }}
                    className="px-6 py-3 glass-btn-primary rounded-xl font-medium w-full sm:w-auto"
                  >
                    Browse Other Available Times
                  </button>
                </div>
              ) : (
                <form onSubmit={handleBook}>
                {error && (
                  <div className="mb-6 p-4 bg-red-500/10 text-red-600 dark:text-red-400 rounded-2xl text-sm border border-red-500/20">
                    {error}
                  </div>
                )}
                
                <div className="space-y-5 mb-8">
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">Full Name</label>
                    <input 
                      type="text" required
                      value={name} onChange={e => setName(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl glass-input focus:outline-none"
                      placeholder="Jane Doe"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">Email Address</label>
                    <input 
                      type="email" required
                      value={email} onChange={e => setEmail(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl glass-input focus:outline-none"
                      placeholder="jane@example.com"
                    />
                  </div>
                </div>

                <button 
                  type="submit" 
                  disabled={bookingStatus === "submitting"}
                  className={`w-full py-3.5 rounded-xl text-lg font-medium transition-colors ${
                    bookingStatus === "submitting" 
                      ? "opacity-50 cursor-not-allowed glass" 
                      : selectedSlot.isFull
                        ? "bg-amber-600 text-white hover:bg-amber-700 shadow-sm"
                        : "glass-btn-primary"
                  }`}
                >
                  {bookingStatus === "submitting" 
                    ? "Submitting..." 
                    : selectedSlot.isFull 
                      ? "Join Waitlist" 
                      : "Confirm Booking"
                  }
                </button>
              </form>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
