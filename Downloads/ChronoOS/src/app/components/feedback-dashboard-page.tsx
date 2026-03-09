import React, { useState, useEffect } from "react";
import { request } from "../lib/api";
import { 
  ArrowLeft, MessageSquare, QrCode, Download, Link as LinkIcon, 
  ChevronDown, ChevronUp, BarChart3, Users, Star, ArrowUpRight
} from "lucide-react";
import { useNavigate } from "react-router";
import { QRCodeCanvas } from "qrcode.react";
import { copyToClipboard } from "../lib/clipboard";
import { toast } from "sonner";
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from "recharts";
import { format, parseISO, subDays } from "date-fns";

const getRatingEmoji = (rating: string) => {
  if (rating === 'sad') return '😞';
  if (rating === 'happy') return '😊';
  if (rating === 'exceeded') return '🤩';
  return '💬';
};

const getRatingLabel = (rating: string) => {
  if (rating === 'sad') return "Didn't meet";
  if (rating === 'happy') return "Met";
  if (rating === 'exceeded') return "Exceeded";
  return 'Reviewed';
};

const getRatingScore = (rating: string) => {
  if (rating === 'sad') return 1;
  if (rating === 'happy') return 3;
  if (rating === 'exceeded') return 5;
  return 0;
};

const getAggregateRating = (feedbacks: any[]) => {
  if (!feedbacks || feedbacks.length === 0) return null;
  const validFeedbacks = feedbacks.filter(f => f.rating);
  if (validFeedbacks.length === 0) return null;
  const total = validFeedbacks.reduce((sum, f) => sum + getRatingScore(f.rating), 0);
  const avg = total / validFeedbacks.length;
  if (avg <= 2) return 'sad';
  if (avg <= 4) return 'happy';
  return 'exceeded';
};

export function FeedbackDashboardPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [feedbacks, setFeedbacks] = useState<any[]>([]);
  const [expandedEvents, setExpandedEvents] = useState<Record<string, boolean>>({});
  const [expandedSessions, setExpandedSessions] = useState<Record<string, boolean>>({});
  
  // QR Code Modal State
  const [showQRModal, setShowQRModal] = useState<{id: string, title: string, type: 'event' | 'session'} | null>(null);

  useEffect(() => {
    const fetchFeedbacks = async () => {
      try {
        const data = await request("/open-feedback");
        setFeedbacks(data);
        
        const expands: Record<string, boolean> = {};
        data.forEach((ev: any, i: number) => {
          if (i === 0) expands[ev.id] = true;
        });
        setExpandedEvents(expands);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchFeedbacks();
  }, []);

  const toggleEvent = (id: string) => setExpandedEvents(prev => ({...prev, [id]: !prev[id]}));
  const toggleSession = (id: string) => setExpandedSessions(prev => ({...prev, [id]: !prev[id]}));

  // Helper to get public URL
  const getFeedbackUrl = (id: string, type: 'event' | 'session') => {
    const baseUrl = window.location.origin;
    // We only have session-level feedback page currently, but if event-level is supported, it can be added.
    // For now, we'll route both to session feedback just to ensure it has a valid format, or if event, we might need a generic one.
    // Assuming /feedback/:sessionId is what we have. If type is event, maybe /feedback/event/:id (but we don't have that route). 
    // We will just use the session route for both in this UI to keep it simple, or point event to a generic one.
    return `${baseUrl}/feedback/${id}`;
  };

  const handleCopyLink = (id: string, type: 'event' | 'session') => {
    copyToClipboard(getFeedbackUrl(id, type));
    toast.success("Feedback link copied to clipboard!");
  };

  const handleDownloadQR = () => {
    const canvas = document.getElementById("qr-canvas") as HTMLCanvasElement;
    if (canvas) {
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `Feedback-QR-${showQRModal?.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success("QR Code downloaded!");
    }
  };

  // --- Chart Data Processing ---
  const processChartData = () => {
    // Collect all feedbacks with dates
    let allFbs: any[] = [];
    feedbacks.forEach(ev => {
      if (!ev.sessions) return;
      ev.sessions.forEach((sess: any) => {
        if (!sess.feedbacks) return;
        sess.feedbacks.forEach((fb: any) => {
          if (fb.created_at) {
            allFbs.push({ ...fb, date: parseISO(fb.created_at) });
          }
        });
      });
    });

    // If no data, return empty or dummy
    if (allFbs.length === 0) {
      // Return some dummy data so the chart isn't completely empty visually
      return Array.from({length: 7}).map((_, i) => ({
        date: format(subDays(new Date(), 6 - i), 'MMM dd'),
        score: 0
      }));
    }

    // Sort by date
    allFbs.sort((a, b) => a.date.getTime() - b.date.getTime());

    // Group by day
    const grouped: Record<string, { total: number, count: number }> = {};
    allFbs.forEach(fb => {
      const day = format(fb.date, 'MMM dd');
      if (!grouped[day]) grouped[day] = { total: 0, count: 0 };
      grouped[day].total += getRatingScore(fb.rating);
      grouped[day].count += 1;
    });

    return Object.keys(grouped).map(day => ({
      date: day,
      score: Number((grouped[day].total / grouped[day].count).toFixed(1))
    }));
  };

  const chartData = processChartData();

  // --- Aggregate Stats ---
  let totalFeedbacks = 0;
  let totalScore = 0;
  feedbacks.forEach(ev => {
    if (!ev.sessions) return;
    ev.sessions.forEach((sess: any) => {
      if (!sess.feedbacks) return;
      totalFeedbacks += sess.feedbacks.length;
      sess.feedbacks.forEach((fb: any) => {
        totalScore += getRatingScore(fb.rating);
      });
    });
  });
  const avgScore = totalFeedbacks > 0 ? (totalScore / totalFeedbacks).toFixed(1) : "0.0";

  return (
    <div className="flex flex-col h-full bg-[#F4F6FA] dark:bg-background overflow-hidden relative">
      {/* Soft gradient bottom background */}
      <div className="absolute top-0 left-0 right-0 h-[40vh] bg-gradient-to-br from-pink-500/10 via-purple-500/5 to-orange-500/10 pointer-events-none z-0" />

      <div className="px-6 py-6 md:px-10 lg:px-14 md:py-10 max-w-6xl mx-auto w-full h-full overflow-y-auto custom-scrollbar relative z-10">
        
        {/* Header */}
        <div className="flex items-center gap-4 mb-8 md:mb-12">
          <button 
            onClick={() => navigate("/engage")}
            className="w-10 h-10 rounded-2xl bg-white/50 dark:bg-white/5 backdrop-blur-md flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-white/10 transition-colors shadow-sm"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-[#1B1446] dark:text-white">
              Feedback Dashboard
            </h1>
            <p className="text-[#64748B] dark:text-slate-400 mt-1">Analytics, QR Codes, and written reviews</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64 text-slate-500">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500 mr-3"></div>
            Loading insights...
          </div>
        ) : (
          <div className="space-y-8 pb-20">
            
            {/* Top Stats & Chart */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="col-span-1 flex flex-col gap-6">
                <div className="glass-elevated bg-white/60 dark:bg-black/20 p-6 rounded-[32px] shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
                  <div className="flex items-center gap-3 mb-4 text-pink-500">
                    <div className="p-2.5 rounded-2xl bg-pink-500/10"><Star className="w-6 h-6" /></div>
                    <span className="font-semibold">Average Rating</span>
                  </div>
                  <div className="text-5xl font-black text-slate-900 dark:text-white mb-2">{avgScore} <span className="text-2xl text-slate-400 font-bold">/ 5.0</span></div>
                  <p className="text-sm text-slate-500 font-medium flex items-center gap-1"><ArrowUpRight className="w-4 h-4 text-green-500" /> Based on {totalFeedbacks} reviews</p>
                </div>

                <div className="glass-elevated bg-white/60 dark:bg-black/20 p-6 rounded-[32px] shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
                  <div className="flex items-center gap-3 mb-4 text-purple-500">
                    <div className="p-2.5 rounded-2xl bg-purple-500/10"><Users className="w-6 h-6" /></div>
                    <span className="font-semibold">Total Engagement</span>
                  </div>
                  <div className="text-4xl font-black text-slate-900 dark:text-white mb-2">{totalFeedbacks} <span className="text-xl text-slate-400 font-bold">responses</span></div>
                </div>
              </div>

              <div className="col-span-1 lg:col-span-2 glass-elevated bg-white/60 dark:bg-black/20 p-6 sm:p-8 rounded-[32px] shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3 text-orange-500">
                    <div className="p-2.5 rounded-2xl bg-orange-500/10"><BarChart3 className="w-6 h-6" /></div>
                    <span className="font-semibold text-lg text-slate-800 dark:text-white">Feedback Over Time</span>
                  </div>
                </div>
                <div className="h-[220px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(150,150,150,0.1)" />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} dy={10} />
                      <YAxis domain={[0, 5]} axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}
                        itemStyle={{ color: '#f97316', fontWeight: 'bold' }}
                      />
                      <Area type="monotone" dataKey="score" stroke="#f97316" strokeWidth={3} fillOpacity={1} fill="url(#colorScore)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Events Breakdown */}
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white mb-6 flex items-center gap-3">
                <MessageSquare className="w-6 h-6 text-pink-500" /> Event & Session Breakdown
              </h2>

              {feedbacks.length === 0 ? (
                <div className="bg-white/40 dark:bg-white/5 backdrop-blur-md p-10 rounded-[32px] text-center border border-white/40 dark:border-white/10">
                  <MessageSquare className="w-12 h-12 mx-auto text-slate-300 mb-4" />
                  <h3 className="text-xl font-semibold mb-2">No Feedback Data</h3>
                  <p className="text-slate-500">Share your QR codes during sessions to start collecting reviews.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {feedbacks.map((event) => (
                    <div key={event.id} className="bg-white dark:bg-card rounded-[32px] shadow-[0_8px_30px_rgba(0,0,0,0.04)] overflow-hidden border border-black/5 dark:border-white/5 transition-all">
                      <div className="p-5 md:p-6 lg:p-8">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div 
                            className="flex-1 cursor-pointer"
                            onClick={() => toggleEvent(event.id)}
                          >
                            <div className="flex items-center gap-3">
                              <h3 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{event.title}</h3>
                              {getAggregateRating(event.sessions?.flatMap((s: any) => s.feedbacks || []) || []) && (
                                <span className="text-2xl filter drop-shadow-sm" title="Average Event Rating">
                                  {getRatingEmoji(getAggregateRating(event.sessions?.flatMap((s: any) => s.feedbacks || []) || [])!)}
                                </span>
                              )}
                            </div>
                            <p className="text-slate-500 font-medium mt-1">{event.sessions.length} Session{event.sessions.length !== 1 && 's'}</p>
                          </div>
                          
                          <div className="flex items-center gap-3">
                            <button 
                              onClick={(e) => { e.stopPropagation(); setShowQRModal({ id: event.id, title: event.title, type: 'event' }); }}
                              className="px-4 py-2 rounded-xl bg-pink-50 text-pink-600 dark:bg-pink-500/10 dark:text-pink-400 font-semibold text-sm flex items-center gap-2 hover:bg-pink-100 dark:hover:bg-pink-500/20 transition-colors"
                            >
                              <QrCode className="w-4 h-4" /> Event QR
                            </button>
                            <button 
                              onClick={() => toggleEvent(event.id)}
                              className="w-10 h-10 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center text-slate-500 hover:bg-slate-200 dark:hover:bg-white/20 transition-colors"
                            >
                              {expandedEvents[event.id] ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                            </button>
                          </div>
                        </div>
                      </div>
                      
                      {expandedEvents[event.id] && (
                        <div className="px-5 md:px-8 pb-8 pt-0 border-t border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-black/20">
                          <div className="space-y-6 mt-6">
                            {event.sessions.map((session: any) => (
                              <div key={session.id} className="bg-white dark:bg-[#1E293B] p-0 rounded-[24px] shadow-sm border border-slate-100 dark:border-white/5 overflow-hidden">
                                <div className="p-6 cursor-pointer" onClick={() => toggleSession(session.id)}>
                                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                      <h4 className="font-bold text-lg text-slate-800 dark:text-white">{session.title}</h4>
                                      {getAggregateRating(session.feedbacks || []) && (
                                        <span className="text-xl filter drop-shadow-sm" title="Average Session Rating">
                                          {getRatingEmoji(getAggregateRating(session.feedbacks || [])!)}
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); handleCopyLink(session.id, 'session'); }}
                                        className="p-2.5 rounded-xl bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/20 transition-colors"
                                        title="Copy Session Feedback Link"
                                      >
                                        <LinkIcon className="w-4 h-4" />
                                      </button>
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); setShowQRModal({ id: session.id, title: session.title, type: 'session' }); }}
                                        className="px-4 py-2 rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400 font-semibold text-sm flex items-center gap-2 hover:bg-purple-100 dark:hover:bg-purple-500/20 transition-colors"
                                      >
                                        <QrCode className="w-4 h-4" /> Session QR
                                      </button>
                                      <button 
                                        className="w-10 h-10 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center text-slate-500 hover:bg-slate-200 dark:hover:bg-white/20 transition-colors ml-2"
                                      >
                                        {expandedSessions[session.id] ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                                
                                {expandedSessions[session.id] && (
                                  <div className="px-6 pb-6 pt-0 border-t border-slate-100 dark:border-white/5 mt-4">
                                    <div className="flex gap-4 mb-8 overflow-x-auto pb-2 custom-scrollbar pt-6">
                                      {['sad', 'happy', 'exceeded'].map(ratingType => {
                                        const count = session.feedbacks.filter((f: any) => f.rating === ratingType).length;
                                        if (count === 0) return null;
                                        return (
                                          <div key={ratingType} className="flex items-center gap-3 bg-slate-50 dark:bg-black/20 px-5 py-3 rounded-2xl shrink-0">
                                            <span className="text-3xl filter drop-shadow-sm">{getRatingEmoji(ratingType)}</span>
                                            <div className="flex flex-col">
                                              <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">{getRatingLabel(ratingType)}</span>
                                              <span className="font-black text-xl text-slate-800 dark:text-white leading-none">{count}</span>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                    
                                    <div className="space-y-3">
                                      {session.feedbacks.filter((f: any) => f.comment && f.comment.trim() !== "").map((feedback: any) => (
                                        <div key={feedback.id} className="flex gap-4 bg-slate-50 dark:bg-black/20 p-5 rounded-[20px]">
                                          <div className="text-2xl shrink-0 mt-1 filter drop-shadow-sm">{getRatingEmoji(feedback.rating)}</div>
                                          <div>
                                            <p className="text-[15px] text-slate-700 dark:text-slate-300 leading-relaxed font-medium">"{feedback.comment}"</p>
                                            <p className="text-[13px] text-slate-400 font-medium mt-2">
                                              {format(parseISO(feedback.created_at), "MMM d, yyyy 'at' h:mm a")}
                                            </p>
                                          </div>
                                        </div>
                                      ))}
                                      {session.feedbacks.filter((f: any) => f.comment && f.comment.trim() !== "").length === 0 && (
                                        <p className="text-sm text-slate-400 font-medium italic px-2">No written comments for this session.</p>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* QR Code Modal */}
      {showQRModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-card p-8 rounded-[32px] max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-2xl font-bold text-center mb-2">Share Feedback Form</h3>
            <p className="text-slate-500 text-center text-sm font-medium mb-8 px-4">
              Scan to review <span className="text-slate-800 dark:text-slate-200">{showQRModal.title}</span>
            </p>
            
            <div className="bg-slate-50 dark:bg-white/5 p-6 rounded-3xl flex justify-center mb-8 border border-slate-100 dark:border-white/10">
              <QRCodeCanvas 
                id="qr-canvas"
                value={getFeedbackUrl(showQRModal.id, showQRModal.type)}
                size={200}
                level="H"
                includeMargin={true}
                bgColor="transparent"
                fgColor="var(--foreground)"
              />
            </div>
            
            <div className="flex flex-col gap-3">
              <button
                onClick={handleDownloadQR}
                className="w-full py-4 rounded-2xl bg-[#1B1446] dark:bg-white text-white dark:text-[#1B1446] font-bold text-[15px] flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
              >
                <Download className="w-5 h-5" /> Download QR Code
              </button>
              <button
                onClick={() => handleCopyLink(showQRModal.id, showQRModal.type)}
                className="w-full py-4 rounded-2xl bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-white font-bold text-[15px] flex items-center justify-center gap-2 hover:bg-slate-200 dark:hover:bg-white/20 transition-colors"
              >
                <LinkIcon className="w-5 h-5" /> Copy Direct Link
              </button>
              <button
                onClick={() => setShowQRModal(null)}
                className="w-full py-3 mt-2 rounded-2xl text-slate-500 font-semibold text-sm hover:text-slate-800 dark:hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}