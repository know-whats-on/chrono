import React, { useState, useEffect } from "react";
import { QrCode, MessageSquareShare, MailPlus, Radio, MessageSquareHeart, BarChart, Send, Users, Sparkles, ChevronDown, Activity, Play, Pause, Trash2, Edit } from "lucide-react";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { getLiveSessions, deleteLiveSession } from "../lib/api";
import { toast } from "sonner";

export function EngagePage() {
  const navigate = useNavigate();
  const [openSection, setOpenSection] = useState<'before' | 'during' | 'after'>('during');
  const [sessions, setSessions] = useState<any[]>([]);

  useEffect(() => {
    let mounted = true;
    const fetchSessions = async () => {
      try {
        const allSessions = await getLiveSessions();
        if (mounted) {
          // Sort by newest first
          const sorted = allSessions.sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));
          setSessions(sorted);
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchSessions();
    return () => { mounted = false; };
  }, []);

  const toggleSection = (section: 'before' | 'during' | 'after') => {
    setOpenSection(prev => prev === section ? section : section); // Or allow closing all if desired? Let's just always have one open, or close if clicked again.
    // Wait, the prompt says "opening one closes the other", so standard accordion. 
    // Usually clicking an open one closes it, but since it says "only one opens at a time", let's just make it toggle.
    setOpenSection(prev => prev === section ? prev : section);
  };

  const handleDeleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this session?")) return;
    try {
      await deleteLiveSession(id);
      setSessions(prev => prev.filter(s => s.id !== id));
      toast.success("Session deleted");
    } catch (err) {
      toast.error("Failed to delete session");
    }
  };

  // Helper component for accordions
  const AccordionSection = ({ 
    id, title, icon: Icon, iconColor, children 
  }: { 
    id: 'before' | 'during' | 'after', 
    title: string, 
    icon: any, 
    iconColor: string, 
    children: React.ReactNode 
  }) => {
    const isOpen = openSection === id;
    return (
      <div className={`glass rounded-3xl overflow-hidden shadow-sm transition-all duration-300 border ${isOpen ? 'border-primary/20 bg-white/60 dark:bg-white/10' : 'border-border/50 hover:border-primary/20'}`}>
        <button 
          onClick={() => toggleSection(id)}
          className="w-full px-5 py-4 flex items-center justify-between bg-transparent hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconColor}`}>
              <Icon className="w-5 h-5" />
            </div>
            <h2 className="text-[16px] font-bold tracking-tight text-foreground">{title}</h2>
          </div>
          <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
            >
              <div className="px-5 pb-5 pt-2 border-t border-black/5 dark:border-white/5 space-y-3">
                {children}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto px-3 sm:px-4 md:px-6 pt-4 pb-20 md:pb-6 relative w-full h-full">
      <div className="max-w-3xl mx-auto space-y-4 md:space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 sm:mb-6 shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-sm shrink-0">
              <Radio className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-foreground">Engage</h1>
              <p className="text-sm md:text-base text-muted-foreground mt-1">
                Tools to interact with your audience and manage live events.
              </p>
            </div>
          </div>
        </div>

        {/* Accordions Container */}
        <div className="space-y-4">
          
          {/* BEFORE THE EVENT */}
          <AccordionSection 
            id="before" 
            title="Before the Event" 
            icon={Send} 
            iconColor="bg-blue-50 text-blue-500 dark:bg-blue-500/10 dark:text-blue-400"
          >
            <div className="bg-[#fcfaf8] dark:bg-black/20 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-black/5 dark:border-white/5 group hover:border-blue-500/20 transition-all">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center shrink-0 text-blue-500 group-hover:scale-110 transition-transform">
                  <MailPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold tracking-tight text-foreground mb-1">Email Broadcast</h3>
                  <p className="text-muted-foreground text-[13px] leading-relaxed max-w-sm">
                    Send updates, announcements, and follow-ups to your attendee list.
                  </p>
                </div>
              </div>
              <button 
                onClick={() => navigate("/email")}
                className="w-full sm:w-auto px-4 py-2 rounded-xl text-[13px] font-semibold bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-500/20 transition-colors shrink-0 mt-1 sm:mt-0"
              >
                Compose Email
              </button>
            </div>
          </AccordionSection>

          {/* DURING THE EVENT */}
          <AccordionSection 
            id="during" 
            title="During the Event" 
            icon={Sparkles} 
            iconColor="bg-pink-50 text-pink-500 dark:bg-pink-500/10 dark:text-pink-400"
          >
            {sessions.length > 0 && (
              <div className="bg-amber-50/50 dark:bg-amber-500/5 p-4 rounded-2xl border border-amber-200/50 dark:border-amber-500/20 mb-2">
                <div className="flex items-center gap-2 mb-3">
                  <Activity className="w-4 h-4 text-amber-500 animate-pulse" />
                  <h3 className="text-sm font-bold text-amber-700 dark:text-amber-500 uppercase tracking-wider">Your Sessions</h3>
                </div>
                <div className="space-y-2">
                  {sessions.map((session, i) => (
                    <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-black/40 p-3 rounded-xl border border-black/5 dark:border-white/5">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/10 font-medium uppercase tracking-wider text-muted-foreground">
                            {session.type}
                          </span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider flex items-center gap-1 ${session.isPublicActive ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"}`}>
                            {session.isPublicActive ? <><Play className="w-2.5 h-2.5" /> Live</> : <><Pause className="w-2.5 h-2.5" /> Paused</>}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-foreground line-clamp-1">{session.question}</p>
                      </div>
                      <div className="flex flex-col sm:flex-row items-center gap-2 mt-2 sm:mt-0 w-full sm:w-auto">
                        <button
                          onClick={() => navigate(`/live-session/dashboard/${session.id}`)}
                          className="w-full sm:w-auto px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-500/20 dark:text-amber-400 dark:hover:bg-amber-500/30 transition-colors shrink-0 text-center"
                        >
                          Manage
                        </button>
                        <button
                          onClick={(e) => handleDeleteSession(session.id, e)}
                          className="w-full sm:w-auto px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-500/20 dark:text-red-400 dark:hover:bg-red-500/30 transition-colors shrink-0 text-center"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-[#fcfaf8] dark:bg-black/20 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-black/5 dark:border-white/5 group hover:border-pink-500/20 transition-all">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-pink-50 dark:bg-pink-500/10 flex items-center justify-center shrink-0 text-pink-500 group-hover:scale-110 transition-transform">
                  <MessageSquareHeart className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold tracking-tight text-foreground mb-1">Ice-breakers</h3>
                  <p className="text-muted-foreground text-[13px] leading-relaxed max-w-sm">
                    Interactive cards and prompts to get your audience talking.
                  </p>
                </div>
              </div>
              <button 
                onClick={() => navigate("/", { state: { openIcebreaker: true } })}
                className="w-full sm:w-auto px-4 py-2 rounded-xl text-[13px] font-semibold bg-pink-50 text-pink-600 hover:bg-pink-100 dark:bg-pink-500/10 dark:text-pink-400 dark:hover:bg-pink-500/20 transition-colors shrink-0 mt-1 sm:mt-0"
              >
                Open Decks
              </button>
            </div>

            <div className="bg-[#fcfaf8] dark:bg-black/20 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-black/5 dark:border-white/5 group hover:border-purple-500/20 transition-all">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-purple-50 dark:bg-purple-500/10 flex items-center justify-center shrink-0 text-purple-500 group-hover:scale-110 transition-transform">
                  <BarChart className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold tracking-tight text-foreground mb-1">Live Poll / Q&A / Word Cloud</h3>
                  <p className="text-muted-foreground text-[13px] leading-relaxed max-w-sm">
                    Host real-time interactive Slido-like sessions during your event.
                  </p>
                </div>
              </div>
              <button 
                onClick={() => navigate("/live-session/create")}
                className="w-full sm:w-auto px-4 py-2 rounded-xl text-[13px] font-semibold bg-purple-50 text-purple-600 hover:bg-purple-100 dark:bg-purple-500/10 dark:text-purple-400 dark:hover:bg-purple-500/20 transition-colors shrink-0 mt-1 sm:mt-0"
              >
                Start Session
              </button>
            </div>
          </AccordionSection>

          {/* AFTER THE EVENT */}
          <AccordionSection 
            id="after" 
            title="After the Event" 
            icon={Users} 
            iconColor="bg-emerald-50 text-emerald-500 dark:bg-emerald-500/10 dark:text-emerald-400"
          >
            <div className="bg-[#fcfaf8] dark:bg-black/20 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-black/5 dark:border-white/5 group hover:border-emerald-500/20 transition-all">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center shrink-0 text-emerald-500 group-hover:scale-110 transition-transform">
                  <QrCode className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold tracking-tight text-foreground mb-1">Feedback Collection</h3>
                  <p className="text-muted-foreground text-[13px] leading-relaxed max-w-sm">
                    Generate QR codes from Open Events to gather instant feedback.
                  </p>
                </div>
              </div>
              <button 
                onClick={() => navigate("/feedback-dashboard")}
                className="w-full sm:w-auto px-4 py-2 rounded-xl text-[13px] font-semibold bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:hover:bg-emerald-500/20 transition-colors shrink-0 mt-1 sm:mt-0"
              >
                View Feedback
              </button>
            </div>
            
            <div className="bg-[#fcfaf8] dark:bg-black/20 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-black/5 dark:border-white/5 group hover:border-blue-500/20 transition-all">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center shrink-0 text-blue-500 group-hover:scale-110 transition-transform">
                  <MailPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold tracking-tight text-foreground mb-1">Follow-up Broadcast</h3>
                  <p className="text-muted-foreground text-[13px] leading-relaxed max-w-sm">
                    Send "thank you" emails, resources, and next steps to attendees.
                  </p>
                </div>
              </div>
              <button 
                onClick={() => navigate("/email")}
                className="w-full sm:w-auto px-4 py-2 rounded-xl text-[13px] font-semibold bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-500/20 transition-colors shrink-0 mt-1 sm:mt-0"
              >
                Compose Email
              </button>
            </div>
          </AccordionSection>

        </div>
      </div>
    </div>
  );
}