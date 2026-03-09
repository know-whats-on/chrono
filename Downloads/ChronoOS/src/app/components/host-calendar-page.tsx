import React, { useState, useEffect } from "react";
import { supabase, request } from "../lib/api";
import { format, startOfWeek, addDays, isSameDay, startOfDay } from "date-fns";
import { Users, Clock, Loader2 } from "lucide-react";

export function HostCalendarView() {
  const [slots, setSlots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());

  useEffect(() => {
    fetchSlots();
  }, []);

  const fetchSlots = async () => {
    try {
      const data = await request("/open-events-calendar");
      setSlots(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const dayCount = 1;
  const weekDays = [startOfDay(currentDate)];

  if (loading) {
    return <div className="flex h-[calc(100vh-200px)] items-center justify-center text-muted-foreground"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  }

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-4 py-3 sm:py-4 md:h-[calc(100dvh-56px-26px)] md:flex md:flex-col md:overflow-hidden">
      <div className="mb-3 sm:mb-4 space-y-2 sm:space-y-0 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="text-center sm:text-left">
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Event Host Schedule</h1>
            <p className="text-sm text-muted-foreground mt-1">Viewing all upcoming open scheduling sessions and bookings.</p>
          </div>
          <div className="flex items-center justify-center sm:justify-end gap-2">
            <button 
              onClick={() => setCurrentDate(addDays(currentDate, -1))}
              className="p-1.5 sm:p-2 glass rounded-lg hover:bg-white/10 transition"
            >
              &larr;
            </button>
            <input 
              type="date"
              value={format(currentDate, "yyyy-MM-dd")}
              onChange={(e) => {
                if (e.target.value) {
                  setCurrentDate(new Date(e.target.value + 'T00:00:00'));
                }
              }}
              className="glass px-3 py-1.5 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
            />
            <button 
              onClick={() => setCurrentDate(addDays(currentDate, 1))}
              className="p-1.5 sm:p-2 glass rounded-lg hover:bg-white/10 transition"
            >
              &rarr;
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 glass rounded-2xl border overflow-hidden flex flex-col min-h-[500px]">
        <div className="overflow-x-auto flex-1 flex flex-col">
          <div className="min-w-[300px] sm:min-w-[800px] flex-1 flex flex-col h-full">
            <div className="grid border-b border-border/10 bg-black/5 shrink-0" style={{ gridTemplateColumns: `repeat(${dayCount}, 1fr)` }}>
              {weekDays.map(day => (
                <div key={day.toISOString()} className={`p-3 text-center border-r border-border/5 last:border-r-0 ${isSameDay(day, new Date()) ? 'bg-primary/5 text-primary' : 'text-muted-foreground'}`}>
                  <div className="text-[10px] uppercase font-bold tracking-widest">{format(day, "EEE")}</div>
                  <div className="text-lg font-medium mt-1">{format(day, "d")}</div>
                </div>
              ))}
            </div>
            
            <div className="flex-1 overflow-y-auto">
              <div className="grid min-h-full" style={{ gridTemplateColumns: `repeat(${dayCount}, 1fr)` }}>
                {weekDays.map(day => {
                  const daySlots = slots.filter(s => isSameDay(new Date(s.start_time), day)).sort((a,b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
                  
                  const groupedSlots: Record<string, typeof daySlots> = {};
                  daySlots.forEach(slot => {
                    const timeKey = new Date(slot.start_time).getTime().toString();
                    if (!groupedSlots[timeKey]) groupedSlots[timeKey] = [];
                    groupedSlots[timeKey].push(slot);
                  });
                  
                  return (
                    <div key={day.toISOString()} className="border-r border-border/5 last:border-r-0 p-4 space-y-6 min-h-[400px]">
                      {daySlots.length === 0 ? (
                        <div className="text-center py-4 text-xs text-muted-foreground/50 hidden sm:block">No events</div>
                      ) : (
                        Object.entries(groupedSlots).sort((a,b) => Number(a[0]) - Number(b[0])).map(([timeKey, slotsAtTime]) => {
                          const timeVal = Number(timeKey);
                          // Is happening now if current time is within slot start_time and end_time. 
                          // If end_time is not accessible, assume a 30 min duration for highlight.
                          const now = new Date().getTime();
                          const isHappeningNow = slotsAtTime.some(s => {
                            const start = new Date(s.start_time).getTime();
                            const end = s.end_time ? new Date(s.end_time).getTime() : start + 30 * 60000;
                            return now >= start && now <= end;
                          });

                          return (
                            <div key={timeKey} className={`relative p-3 rounded-2xl transition-colors ${isHappeningNow ? 'bg-primary/5 ring-1 ring-primary/20' : ''}`}>
                              {isHappeningNow && (
                                <div className="absolute -left-1 top-4 bottom-4 w-1 bg-primary rounded-full" />
                              )}
                              <div className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                                <Clock className="w-4 h-4" />
                                {format(new Date(timeVal), "h:mm a")}
                                {isHappeningNow && <span className="text-xs text-primary font-bold uppercase tracking-wider ml-2 px-2 py-0.5 bg-primary/10 rounded-full">Now</span>}
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                                {slotsAtTime.map(slot => {
                                  const confirmed = slot.bookings?.filter((b:any) => b.status === "confirmed") || [];
                                  const waitlist = slot.bookings?.filter((b:any) => b.status === "waitlist") || [];
                                  const isFull = confirmed.length >= slot.capacity;
                                  
                                  return (
                                    <div key={slot.id} className={`p-3 rounded-xl text-xs border transition-all hover:shadow-md ${isFull ? 'bg-emerald-500/15 border-emerald-500/30 dark:bg-emerald-500/10 dark:border-emerald-500/20' : 'bg-white/40 dark:bg-white/5 border-border/20'}`}>
                                      <div className="font-semibold text-sm leading-tight tracking-tight mb-1">{slot.session_title}</div>
                                      <div className="text-[10px] uppercase tracking-wider opacity-60 mb-2 truncate" title={slot.event_title}>{slot.event_title}</div>
                                      
                                      <div className="flex items-center gap-2 mt-auto pt-2 border-t border-black/5 dark:border-white/5">
                                        <span className={`font-bold flex items-center gap-1.5 ${isFull ? 'text-emerald-700 dark:text-emerald-400' : 'text-green-600 dark:text-green-400'}`}>
                                          <Users className="w-3.5 h-3.5" />
                                          {confirmed.length}/{slot.capacity}
                                        </span>
                                        {waitlist.length > 0 && (
                                          <span className="text-primary font-medium text-[10px] px-1.5 py-0.5 bg-primary/10 rounded-md">+{waitlist.length} WL</span>
                                        )}
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
