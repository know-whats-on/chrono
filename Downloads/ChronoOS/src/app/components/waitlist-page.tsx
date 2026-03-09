import React, { useState, useEffect } from "react";
import { request } from "../lib/api";
import { Clock, Mail, Calendar as CalendarIcon, CheckCircle2, XCircle, Loader2, ChevronRight, ArrowLeft, Users, CalendarDays } from "lucide-react";

export function WaitlistPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [view, setView] = useState<'events' | 'sessions' | 'waitlist'>('events');
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [selectedSession, setSelectedSession] = useState<any>(null);

  const [promoting, setPromoting] = useState<any>(null);
  const [confirmPromote, setConfirmPromote] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const evs = await request("/open-events");
      let allEvents: any[] = [];
      
      for (const ev of evs) {
        const details = await request(`/open-events/${ev.id}`);
        let eventWaitlistCount = 0;
        
        const enhancedSessions = [];
        for (const session of details.sessions || []) {
          let sessionWaitlist: any[] = [];
          if (session.bookings) {
            const w = session.bookings.filter((b:any) => b.status === "waitlist");
            for (const b of w) {
              const slot = session.slots?.find((s:any) => s.id === b.slot_id);
              const confirmedAttendees = session.bookings.filter((cb:any) => cb.status === "confirmed" && cb.slot_id === b.slot_id);
              const confirmedName = confirmedAttendees.length > 0 ? confirmedAttendees[0].name : "an existing attendee";
              
              sessionWaitlist.push({
                ...b,
                event_title: ev.title,
                session_title: session.title,
                slot_start: slot ? slot.start_time : null,
                slot: slot,
                confirmed_name: confirmedName
              });
            }
          }
          
          sessionWaitlist.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
          
          enhancedSessions.push({
            ...session,
            waitlist: sessionWaitlist,
            waitlistCount: sessionWaitlist.length
          });
          eventWaitlistCount += sessionWaitlist.length;
        }
        
        allEvents.push({
          ...ev,
          sessions: enhancedSessions,
          waitlistCount: eventWaitlistCount
        });
      }
      
      setEvents(allEvents);
      
      // Keep selected state consistent after refresh
      if (selectedEvent) {
        const updatedEvent = allEvents.find(e => e.id === selectedEvent.id);
        if (updatedEvent) {
          setSelectedEvent(updatedEvent);
          if (selectedSession) {
            const updatedSession = updatedEvent.sessions.find((s:any) => s.id === selectedSession.id);
            if (updatedSession) {
              setSelectedSession(updatedSession);
            }
          }
        }
      }
    } catch (e) {
      console.error("Failed to fetch waitlist data:", e);
    } finally {
      setLoading(false);
    }
  };

  const handlePromoteClick = (w: any) => {
    setPromoting(w);
    setConfirmPromote(true);
  };

  const executePromote = async () => {
    if (!promoting) return;
    try {
      await request(`/waitlist/${promoting.id}/promote`, { method: "POST" });
      await fetchData();
    } catch (e) {
      console.error(e);
      alert("Failed to promote");
    } finally {
      setConfirmPromote(false);
      setPromoting(null);
    }
  };

  const executeDelete = async (w: any) => {
    if (!window.confirm(`Are you sure you want to remove ${w.name} from the waitlist?`)) return;
    setDeletingId(w.id);
    try {
      await request(`/waitlist/${w.id}/delete`, { method: "POST" });
      await fetchData();
    } catch (e) {
      console.error(e);
      alert("Failed to remove");
    } finally {
      setDeletingId(null);
    }
  };

  const toggleEventWaitlist = async (ev: any) => {
    // Optimistic update
    setEvents(prev => prev.map(e => e.id === ev.id ? { ...e, waitlist_full: !e.waitlist_full } : e));
    try {
      await request(`/open-events/${ev.id}/toggle-waitlist-full`, { method: "POST" });
      fetchData();
    } catch (e) { console.error(e); fetchData(); }
  };

  const toggleSessionWaitlist = async (session: any) => {
    // Optimistic update
    setEvents(prev => prev.map(e => {
      if (e.id === selectedEvent?.id) {
        return {
          ...e,
          sessions: e.sessions.map((s:any) => s.id === session.id ? { ...s, waitlist_full: !s.waitlist_full } : s)
        };
      }
      return e;
    }));
    if (selectedEvent) {
      setSelectedEvent((prev:any) => ({
        ...prev,
        sessions: prev.sessions.map((s:any) => s.id === session.id ? { ...s, waitlist_full: !s.waitlist_full } : s)
      }));
    }
    try {
      await request(`/open-sessions/${session.id}/toggle-waitlist-full`, { method: "POST" });
      fetchData();
    } catch (e) { console.error(e); fetchData(); }
  };

  const toggleSlotWaitlist = async (slot: any) => {
    // Optimistic update
    setEvents(prev => prev.map(e => {
      if (e.id === selectedEvent?.id) {
        return {
          ...e,
          sessions: e.sessions.map((s:any) => {
            if (s.id === selectedSession?.id) {
              return {
                ...s,
                slots: s.slots?.map((sl:any) => sl.id === slot.id ? { ...sl, waitlist_full: !sl.waitlist_full } : sl)
              };
            }
            return s;
          })
        };
      }
      return e;
    }));
    if (selectedSession) {
      setSelectedSession((prev:any) => ({
        ...prev,
        slots: prev.slots?.map((sl:any) => sl.id === slot.id ? { ...sl, waitlist_full: !sl.waitlist_full } : sl)
      }));
    }
    try {
      await request(`/open-slots/${slot.id}/toggle-waitlist-full`, { method: "POST" });
      fetchData();
    } catch (e) { console.error(e); fetchData(); }
  };

  return (
    <div className="flex-1 overflow-y-auto relative w-full h-full bg-gradient-to-br from-[#fef3ec] via-[#f2effb] to-[#eaf5fc] dark:from-background dark:via-background dark:to-background">
      <div className="px-3 sm:px-4 md:px-6 pt-8 pb-20 md:pb-6 relative z-10 max-w-4xl mx-auto space-y-4 md:space-y-6">
        
        {/* Header and Breadcrumbs */}
        <div className="flex flex-col gap-2 mb-6 sm:mb-8 shrink-0 relative">
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-[#1a1423] dark:text-foreground text-center md:text-left mt-2 md:mt-0">Waitlist Management</h1>
            <p className="text-sm md:text-base text-muted-foreground text-center md:text-left">Manage waitlisted attendees across your events and sessions.</p>
          
          {view !== 'events' && (
            <div className="mt-4 flex justify-center md:justify-start">
              {/* Desktop Breadcrumbs */}
              <div className="hidden sm:flex items-center gap-2 text-sm font-medium">
                <button 
                  onClick={() => { setView('events'); setSelectedEvent(null); setSelectedSession(null); }}
                  className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                >
                  <ArrowLeft size={16} /> All Events
                </button>
                {view === 'waitlist' && selectedEvent && (
                  <>
                    <ChevronRight size={14} className="text-muted-foreground" />
                    <button 
                      onClick={() => { setView('sessions'); setSelectedSession(null); }}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {selectedEvent.title}
                    </button>
                  </>
                )}
              </div>

              {/* Mobile Back Button */}
              <div className="flex sm:hidden w-full">
                <button 
                  onClick={() => { setView('events'); setSelectedEvent(null); setSelectedSession(null); }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white dark:bg-white/5 border border-black/5 dark:border-white/10 text-sm font-medium shadow-sm active:scale-95 transition-all"
                >
                  <ArrowLeft size={16} className="text-primary" /> Back to Main Events
                </button>
              </div>
            </div>
          )}
        </div>

        {loading ? (
          <div className="text-muted-foreground animate-pulse flex items-center justify-center p-12 glass rounded-3xl">
            Loading waitlist data...
          </div>
        ) : (
          <>
            {/* EVENTS VIEW */}
            {view === 'events' && (
              <div className="grid gap-4">
                {events.length === 0 ? (
                   <div className="text-center py-16 glass rounded-3xl shadow-sm border border-border/10">
                     <CalendarIcon size={32} className="text-primary/60 mx-auto mb-4" />
                     <h3 className="text-lg font-medium tracking-tight">No events found</h3>
                   </div>
                ) : (
                  events.map((ev) => (
                    <div key={ev.id} className="bg-[#fcfaf8] dark:bg-white/5 p-6 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm border border-black/5 dark:border-white/10 transition-all hover:border-primary/20">
                      <div className="flex items-start gap-4 cursor-pointer flex-1" onClick={() => { setSelectedEvent(ev); setView('sessions'); }}>
                        <div className="w-12 h-12 rounded-full bg-[#e6e2f1] dark:bg-primary/20 flex items-center justify-center shrink-0 text-[#2f274a] dark:text-primary">
                          <CalendarIcon size={22} className="opacity-80" />
                        </div>
                        <div>
                          <h3 className="text-xl font-bold tracking-tight text-foreground mb-1">{ev.title}</h3>
                          <div className="flex items-center gap-1.5 text-[13px] font-medium text-amber-600 dark:text-amber-500">
                            <Users size={14} />
                            {ev.waitlistCount} Waitlisted across {ev.sessions?.length || 0} sessions
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col sm:items-end gap-3 border-t sm:border-t-0 border-border/50 pt-4 sm:pt-0">
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <span className="text-sm font-medium text-muted-foreground">Waitlist Full</span>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); toggleEventWaitlist(ev); }}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${ev.waitlist_full ? 'bg-red-500' : 'bg-slate-200 dark:bg-slate-700'}`}
                          >
                            <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${ev.waitlist_full ? 'translate-x-5' : 'translate-x-1'}`} />
                          </button>
                        </div>
                        <button 
                          onClick={() => { setSelectedEvent(ev); setView('sessions'); }}
                          className="px-4 py-2 rounded-xl text-sm font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors flex items-center justify-center gap-1"
                        >
                          View Sessions <ChevronRight size={16} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* SESSIONS VIEW */}
            {view === 'sessions' && selectedEvent && (
              <div className="grid gap-4">
                <div className="mb-2">
                  <h2 className="text-xl font-bold">{selectedEvent.title}</h2>
                  <p className="text-muted-foreground text-sm">Select a session to view its specific waitlist.</p>
                </div>
                {selectedEvent.sessions?.length === 0 ? (
                  <div className="text-center py-16 glass rounded-3xl shadow-sm border border-border/10">
                    <CalendarDays size={32} className="text-primary/60 mx-auto mb-4" />
                    <h3 className="text-lg font-medium tracking-tight">No sessions for this event</h3>
                  </div>
                ) : (
                  selectedEvent.sessions?.map((session: any) => (
                    <div key={session.id} className="bg-[#fcfaf8] dark:bg-white/5 p-6 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm border border-black/5 dark:border-white/10 transition-all hover:border-primary/20">
                      <div className="flex items-start gap-4 cursor-pointer flex-1" onClick={() => { setSelectedSession(session); setView('waitlist'); }}>
                        <div className="w-12 h-12 rounded-full bg-[#e6e2f1] dark:bg-primary/20 flex items-center justify-center shrink-0 text-[#2f274a] dark:text-primary">
                          <CalendarDays size={22} className="opacity-80" />
                        </div>
                        <div>
                          <h3 className="text-xl font-bold tracking-tight text-foreground mb-1">{session.title}</h3>
                          <div className="flex items-center gap-1.5 text-[13px] font-medium text-amber-600 dark:text-amber-500">
                            <Users size={14} />
                            {session.waitlistCount} Waitlisted
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col sm:items-end gap-3 border-t sm:border-t-0 border-border/50 pt-4 sm:pt-0" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <span className="text-sm font-medium text-muted-foreground">Waitlist Full</span>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); toggleSessionWaitlist(session); }}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${session.waitlist_full ? 'bg-red-500' : 'bg-slate-200 dark:bg-slate-700'}`}
                          >
                            <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${session.waitlist_full ? 'translate-x-5' : 'translate-x-1'}`} />
                          </button>
                        </div>
                        <button 
                          onClick={() => { setSelectedSession(session); setView('waitlist'); }}
                          className="px-4 py-2 rounded-xl text-sm font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors flex items-center justify-center gap-1"
                        >
                          View Waitlist <ChevronRight size={16} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* WAITLIST VIEW */}
            {view === 'waitlist' && selectedSession && (
              <div className="grid gap-4">
                <div className="mb-2">
                  <h2 className="text-xl font-bold">{selectedSession.title}</h2>
                  <p className="text-muted-foreground text-sm">Manage waitlisted attendees by time slot.</p>
                </div>
                {(!selectedSession.slots || selectedSession.slots.length === 0) ? (
                  <div className="text-center py-16 glass rounded-3xl shadow-sm border border-border/10">
                    <Clock size={32} className="text-primary/60 mx-auto mb-4" />
                    <h3 className="text-lg font-medium tracking-tight">No slots found</h3>
                    <p className="text-muted-foreground mt-2 text-sm max-w-sm mx-auto">This session does not have any time slots yet.</p>
                  </div>
                ) : (
                  selectedSession.slots?.sort((a:any, b:any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()).map((slot: any) => {
                    const slotWaitlist = selectedSession.waitlist?.filter((w:any) => w.slot_id === slot.id) || [];
                    return (
                      <div key={slot.id} className="bg-[#fcfaf8] dark:bg-white/5 p-6 rounded-3xl flex flex-col shadow-sm border border-black/5 dark:border-white/10 transition-colors">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 pb-4 border-b border-black/5 dark:border-white/10">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-xl bg-[#e6e2f1] dark:bg-primary/20 text-[#2f274a] dark:text-primary">
                              <CalendarIcon size={18} />
                            </div>
                            <div>
                              <h3 className="font-semibold text-foreground tracking-tight">
                                {new Date(slot.start_time).toLocaleString('en-US', { 
                                  weekday: 'short', month: 'short', day: 'numeric',
                                  hour: 'numeric', minute: '2-digit'
                                })}
                              </h3>
                              <div className="text-[13px] font-medium text-amber-600 dark:text-amber-500">
                                {slotWaitlist.length} Waitlisted
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-muted-foreground">Waitlist Full</span>
                            <button
                              type="button"
                              onClick={() => toggleSlotWaitlist(slot)}
                              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${slot.waitlist_full ? 'bg-red-500' : 'bg-slate-200 dark:bg-slate-700'}`}
                            >
                              <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${slot.waitlist_full ? 'translate-x-5' : 'translate-x-1'}`} />
                            </button>
                          </div>
                        </div>

                        {slotWaitlist.length === 0 ? (
                          <div className="py-6 text-center">
                            <p className="text-sm text-muted-foreground italic">No users on waitlist for this slot.</p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {slotWaitlist.map((w: any, idx: number) => (
                              <div key={`${w.id}-${idx}`} className="bg-white dark:bg-black/20 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-black/5 dark:border-white/5">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-full bg-[#f2effb] dark:bg-white/5 flex items-center justify-center shrink-0 text-[#2f274a] dark:text-foreground text-sm font-bold">
                                    {w.name ? w.name.charAt(0).toUpperCase() : <Clock size={16} className="opacity-80" />}
                                  </div>
                                  <div>
                                    <h4 className="font-semibold text-sm text-foreground">{w.name}</h4>
                                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                                      <Mail size={10} className="opacity-70" />
                                      <a href={`mailto:${w.email}`} className="hover:text-primary transition-colors truncate">{w.email}</a>
                                    </div>
                                  </div>
                                </div>
                                
                                <div className="flex items-center gap-2">
                                  <button 
                                    onClick={() => executeDelete(w)}
                                    disabled={deletingId === w.id}
                                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-600 hover:bg-red-500/20 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                                  >
                                    {deletingId === w.id ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                                    Remove
                                  </button>
                                  <button 
                                    onClick={() => handlePromoteClick(w)}
                                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors flex items-center gap-1.5"
                                  >
                                    <CheckCircle2 size={14} />
                                    Promote
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
                
                {/* Fallback for users without a slot matching the list, should be rare */}
                {(() => {
                  const unassignedWaitlist = selectedSession.waitlist?.filter((w:any) => !selectedSession.slots?.find((s:any) => s.id === w.slot_id)) || [];
                  if (unassignedWaitlist.length === 0) return null;
                  return (
                    <div className="bg-[#fcfaf8] dark:bg-white/5 p-6 rounded-3xl flex flex-col shadow-sm border border-black/5 dark:border-white/10 transition-colors mt-4">
                      <div className="mb-4 pb-4 border-b border-black/5 dark:border-white/10">
                        <h3 className="font-semibold text-foreground tracking-tight flex items-center gap-2">
                          <Users size={18} className="text-amber-500" /> Unassigned / Unknown Slot Waitlist
                        </h3>
                      </div>
                      <div className="space-y-3">
                        {unassignedWaitlist.map((w: any, idx: number) => (
                          <div key={`${w.id}-unassigned-${idx}`} className="bg-white dark:bg-black/20 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-black/5 dark:border-white/5">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-[#f2effb] dark:bg-white/5 flex items-center justify-center shrink-0 text-[#2f274a] dark:text-foreground text-sm font-bold">
                                {w.name ? w.name.charAt(0).toUpperCase() : <Clock size={16} className="opacity-80" />}
                              </div>
                              <div>
                                <h4 className="font-semibold text-sm text-foreground">{w.name}</h4>
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                                  <Mail size={10} className="opacity-70" />
                                  <a href={`mailto:${w.email}`} className="hover:text-primary transition-colors truncate">{w.email}</a>
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <button 
                                onClick={() => executeDelete(w)}
                                disabled={deletingId === w.id}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-600 hover:bg-red-500/20 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                              >
                                {deletingId === w.id ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                                Remove
                              </button>
                              <button 
                                onClick={() => handlePromoteClick(w)}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors flex items-center gap-1.5"
                              >
                                <CheckCircle2 size={14} />
                                Promote
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </>
        )}
      </div>

      {confirmPromote && promoting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="glass w-full max-w-md p-6 rounded-3xl shadow-2xl">
            <h2 className="text-xl font-semibold mb-3 tracking-tight">Confirm Promotion</h2>
            <p className="text-muted-foreground text-[15px] leading-relaxed mb-6">
              Are you sure you want to promote <strong>{promoting.name}</strong>? The current confirmed attendee, <strong>{promoting.confirmed_name}</strong> will be informed about them losing their spot!
            </p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => { setConfirmPromote(false); setPromoting(null); }}
                className="px-4 py-2.5 rounded-xl font-medium bg-muted hover:bg-muted/80 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={executePromote}
                className="px-4 py-2.5 rounded-xl font-medium bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center gap-2"
              >
                <CheckCircle2 size={16} /> Yes, Promote
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
