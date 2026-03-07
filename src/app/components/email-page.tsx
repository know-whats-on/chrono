import React, { useState, useEffect } from "react";
import { ArrowLeft, Check, Layers, Users, Send, RefreshCw, ChevronDown, Sparkles, Paperclip, Type, Image as ImageIcon, Smile, Clock, Inbox } from "lucide-react";
import { useNavigate } from "react-router";
import { request } from "../lib/api";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";

type OpenEvent = { id: string; title: string; [key: string]: any };

export function EmailPage() {
  const navigate = useNavigate();
  const [appMode, setAppMode] = useState(() => typeof window !== "undefined" ? localStorage.getItem("chrono_mode") || "business" : "business");

  useEffect(() => {
    const handleStorageChange = () => setAppMode(localStorage.getItem("chrono_mode") || "business");
    window.addEventListener("chrono_mode_changed", handleStorageChange);
    return () => window.removeEventListener("chrono_mode_changed", handleStorageChange);
  }, []);

  const [events, setEvents] = useState<OpenEvent[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [targetTypes, setTargetTypes] = useState<string[]>(["confirmed", "waitlist"]);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    try {
      const data = await request("/open-events");
      setEvents(data);
      if (data.length > 0 && !selectedEventId) {
        setSelectedEventId(data[0].id);
      }
    } catch (e) {
      toast.error("Failed to load events");
    } finally {
      setLoading(false);
    }
  };

  const toggleTarget = (t: string) => {
    setTargetTypes(prev => 
      prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]
    );
  };

  const handleSend = async () => {
    if (!selectedEventId) {
      toast.error("Please select an event");
      return;
    }
    if (targetTypes.length === 0) {
      toast.error("Please select at least one recipient group");
      return;
    }
    if (!subject.trim() || !message.trim()) {
      toast.error("Please provide both a subject and a message");
      return;
    }

    setSending(true);
    try {
      const res = await request(`/open-events/${selectedEventId}/blast`, {
        method: "POST",
        body: JSON.stringify({ subject, message, targetTypes })
      });
      if (res.error) throw new Error(res.error);
      
      toast.success(`Email broadcast sent to ${res.sentCount} recipients!`);
      setSubject("");
      setMessage("");
    } catch (e: any) {
      toast.error(e.message || "Failed to send email");
    } finally {
      setSending(false);
    }
  };

  if (appMode === "business") {
    return (
      <div className="flex-1 overflow-y-auto w-full h-full relative font-[-apple-system,BlinkMacSystemFont,'Segoe_UI',Roboto,sans-serif]">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-400/10 blur-[80px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-purple-500/10 blur-[80px] pointer-events-none" />

        <div className="flex flex-col items-center justify-center min-h-[80vh] px-4 text-center z-10 relative">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="glass rounded-3xl p-10 max-w-md w-full shadow-lg border border-white/20 dark:border-white/10 flex flex-col items-center"
          >
            <div className="w-20 h-20 bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-500/20 dark:to-purple-500/20 rounded-2xl flex items-center justify-center mb-6 shadow-inner border border-white/50 dark:border-white/10">
              <Inbox className="w-10 h-10 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h1 className="text-2xl font-extrabold text-[#1B1446] dark:text-white mb-3 tracking-tight">Unified Inbox</h1>
            <p className="text-muted-foreground text-[15px] leading-relaxed mb-8">
              All your emails, messages, and calendar notifications in one beautiful, focused space. We're putting the final touches on this experience.
            </p>
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-full text-sm font-bold tracking-wide uppercase shadow-sm">
              <Sparkles className="w-4 h-4" /> Coming Soon
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  const selectedEvent = events.find(e => e.id === selectedEventId);

  return (
    <div className="min-h-dvh bg-[#F4F6FA] dark:bg-[#0B0A10] relative flex flex-col overflow-hidden font-[-apple-system,BlinkMacSystemFont,'Segoe_UI',Roboto,sans-serif]">
      {/* Background Liquid Gradients */}
      <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-pink-500/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-3/4 h-96 bg-gradient-to-tl from-blue-400/10 via-cyan-400/5 to-transparent blur-3xl pointer-events-none" />

      {/* Header */}
      <header className="relative z-30 w-full px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/engage")}
            className="w-10 h-10 rounded-full bg-white/60 dark:bg-white/5 backdrop-blur-md border border-white/50 dark:border-white/10 shadow-sm flex items-center justify-center hover:bg-white/90 dark:hover:bg-white/10 transition-all group"
          >
            <ArrowLeft className="w-5 h-5 text-[#1B1446] dark:text-white group-hover:-translate-x-0.5 transition-transform" />
          </button>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-[#1B1446] dark:text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-500" />
              Broadcast
            </h1>
          </div>
        </div>
      </header>

      {/* Main Composer Area */}
      <main className="flex-1 w-full max-w-4xl mx-auto px-4 md:px-8 pb-12 relative z-20 flex flex-col">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
          className="flex-1 bg-white/70 dark:bg-[#13111C]/70 backdrop-blur-2xl rounded-[32px] shadow-[0_8px_40px_rgba(0,0,0,0.04)] dark:shadow-[0_8px_40px_rgba(0,0,0,0.2)] border border-white/80 dark:border-white/10 overflow-hidden flex flex-col"
        >
          {/* macOS-style Window Header */}
          <div className="h-12 px-5 flex items-center justify-between border-b border-black/5 dark:border-white/5 bg-white/40 dark:bg-white/5">
            <div className="flex gap-2 items-center">
              <div className="w-3 h-3 rounded-full bg-[#FF5F56] shadow-sm border border-black/10"></div>
              <div className="w-3 h-3 rounded-full bg-[#FFBD2E] shadow-sm border border-black/10"></div>
              <div className="w-3 h-3 rounded-full bg-[#27C93F] shadow-sm border border-black/10"></div>
            </div>
            <div className="text-[13px] font-semibold text-[#64748B] dark:text-slate-400 tracking-wide">
              New Message
            </div>
            <div className="w-12"></div> {/* Spacer for centering */}
          </div>

          {/* Composer Meta Data */}
          <div className="px-4 sm:px-6 py-4 border-b border-black/5 dark:border-white/5 flex flex-col gap-3 sm:gap-4 bg-white/20 dark:bg-white/[0.02]">
            
            {/* Event Field */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
              <span className="w-auto sm:w-16 text-[12px] sm:text-[14px] font-medium text-[#64748B] dark:text-slate-400 sm:text-right pl-1 sm:pl-0">Event:</span>
              <div className="relative flex-1 max-w-full sm:max-w-md">
                <select
                  value={selectedEventId}
                  onChange={(e) => setSelectedEventId(e.target.value)}
                  className="w-full appearance-none bg-[#F4F6FA]/80 dark:bg-black/20 border border-transparent hover:border-black/5 dark:hover:border-white/10 focus:border-indigo-500/30 rounded-xl pl-3 sm:pl-4 pr-10 py-2 text-[13px] sm:text-[14px] font-medium text-[#1B1446] dark:text-white focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all cursor-pointer"
                >
                  {loading && <option value="">Loading events...</option>}
                  {!loading && events.length === 0 && <option value="">No events found</option>}
                  {events.map((e) => (
                    <option key={e.id} value={e.id}>{e.title}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B] pointer-events-none" />
              </div>
            </div>

            {/* To Field */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
              <span className="w-auto sm:w-16 text-[12px] sm:text-[14px] font-medium text-[#64748B] dark:text-slate-400 sm:text-right pl-1 sm:pl-0">To:</span>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => toggleTarget("confirmed")}
                  className={`px-3 py-1.5 rounded-lg text-[12px] sm:text-[13px] font-semibold flex items-center gap-1.5 transition-all ${
                    targetTypes.includes("confirmed") 
                      ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300" 
                      : "bg-[#F4F6FA]/80 text-[#64748B] hover:bg-[#E8EAED] dark:bg-white/5 dark:text-slate-400 dark:hover:bg-white/10"
                  }`}
                >
                  <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${targetTypes.includes("confirmed") ? "bg-indigo-600 border-indigo-600" : "border-slate-300 dark:border-slate-600"}`}>
                    {targetTypes.includes("confirmed") && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                  </div>
                  Confirmed Guests
                </button>
                <button
                  onClick={() => toggleTarget("waitlist")}
                  className={`px-3 py-1.5 rounded-lg text-[12px] sm:text-[13px] font-semibold flex items-center gap-1.5 transition-all ${
                    targetTypes.includes("waitlist") 
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300" 
                      : "bg-[#F4F6FA]/80 text-[#64748B] hover:bg-[#E8EAED] dark:bg-white/5 dark:text-slate-400 dark:hover:bg-white/10"
                  }`}
                >
                  <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${targetTypes.includes("waitlist") ? "bg-amber-500 border-amber-500" : "border-slate-300 dark:border-slate-600"}`}>
                    {targetTypes.includes("waitlist") && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                  </div>
                  Waitlist
                </button>
              </div>
            </div>

            {/* Subject Field */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
              <span className="w-auto sm:w-16 text-[12px] sm:text-[14px] font-medium text-[#64748B] dark:text-slate-400 sm:text-right pl-1 sm:pl-0">Subject:</span>
              <input
                type="text"
                placeholder="Enter an engaging subject line..."
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="flex-1 bg-transparent border-none text-[14px] sm:text-[15px] font-semibold text-[#1B1446] dark:text-white placeholder:text-slate-400 outline-none focus:ring-0 px-2 sm:px-2 py-1"
              />
            </div>
          </div>

          {/* Email Body */}
          <div className="flex-1 min-h-[350px] relative p-5 sm:p-8 group">
            <textarea
              placeholder="Write your update here...&#10;&#10;(The Chrono banner and your team's signature will be automatically included in the final email)"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full h-full bg-transparent border-none outline-none resize-none text-[16px] leading-[1.8] text-[#1B1446] dark:text-slate-200 placeholder:text-slate-400/70 placeholder:italic custom-scrollbar"
            />
            
            {/* Auto-signature visual hint */}
            <AnimatePresence>
              {message.trim().length > 0 && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute bottom-8 left-8 text-[15px] text-slate-400 pointer-events-none"
                >
                  <p>Best,</p>
                  <p className="font-bold text-slate-500 mt-0.5">{selectedEvent?.title || "Event"} Team</p>
                  <p className="text-[13px] mt-0.5">and the Chrono Team, in spirit</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Toolbar & Send Button */}
          <div className="px-4 sm:px-6 py-4 sm:py-5 bg-white/50 dark:bg-black/20 border-t border-black/5 dark:border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4 backdrop-blur-md">
            {/* Formatting Tools (Decorative) */}
            <div className="flex items-center gap-1.5 opacity-60 w-full sm:w-auto overflow-x-auto custom-scrollbar pb-1 sm:pb-0 justify-center sm:justify-start">
              <div className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer transition-colors"><Type className="w-4 h-4 text-[#1B1446] dark:text-white" /></div>
              <div className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer transition-colors"><Paperclip className="w-4 h-4 text-[#1B1446] dark:text-white" /></div>
              <div className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer transition-colors"><ImageIcon className="w-4 h-4 text-[#1B1446] dark:text-white" /></div>
              <div className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer transition-colors"><Smile className="w-4 h-4 text-[#1B1446] dark:text-white" /></div>
              <div className="w-px h-5 bg-black/10 dark:bg-white/10 mx-2"></div>
              <div className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer transition-colors"><Clock className="w-4 h-4 text-[#1B1446] dark:text-white" /></div>
            </div>

            {/* Send Action */}
            <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
              <span className="text-[12px] font-medium text-slate-400 inline-block">
                To: {targetTypes.length === 0 ? "0" : targetTypes.includes("confirmed") && targetTypes.includes("waitlist") ? "everyone" : targetTypes.join(" & ")}
              </span>
              <button
                onClick={handleSend}
                disabled={sending || !subject.trim() || !message.trim() || !selectedEventId || targetTypes.length === 0}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 disabled:opacity-50 disabled:grayscale text-white text-[14px] font-bold rounded-xl shadow-[0_4px_14px_rgba(99,102,241,0.3)] hover:shadow-[0_6px_20px_rgba(99,102,241,0.4)] transition-all active:scale-95"
              >
                {sending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {sending ? "Sending..." : "Send Now"}
              </button>
            </div>
          </div>
          
        </motion.div>
      </main>
    </div>
  );
}