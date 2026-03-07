import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import { getLiveSessionConfig, updateLiveSessionConfig, getLiveSessionResults, updateLiveSessionResults } from "../lib/api";
import { copyToClipboard } from "../lib/clipboard";
import { QRCodeSVG } from "qrcode.react";
import { motion } from "motion/react";
import { Copy, Check, BarChart2, MessageSquare, Cloud, Trash2, ArrowLeft, Play, Pause, ExternalLink, RefreshCw, Eye, Edit, Download } from "lucide-react";
import { toast } from "sonner";

export function LiveSessionDashboardPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  
  const [config, setConfig] = useState<any>(null);
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isCopied, setIsCopied] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [editedQuestion, setEditedQuestion] = useState("");

  const fetchSession = async () => {
    try {
      if (!sessionId) return;
      const c = await getLiveSessionConfig(sessionId);
      if (!c) {
        setConfig("not_found");
        return;
      }
      if (!isEditing && c.question) setEditedQuestion(c.question);
      setConfig(c);
      const r = await getLiveSessionResults(sessionId);
      setResults(r);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSession();
    const interval = setInterval(fetchSession, 3000);
    return () => clearInterval(interval);
  }, [sessionId]);

  const toggleStatus = async () => {
    if (!config || !sessionId) return;
    try {
      const updatedConfig = { ...config, isPublicActive: !config.isPublicActive };
      await updateLiveSessionConfig(sessionId, updatedConfig);
      setConfig(updatedConfig);
      toast.success(`Session ${updatedConfig.isPublicActive ? "resumed" : "paused"}`);
    } catch (e) {
      toast.error("Failed to update status");
    }
  };

  const clearResults = async () => {
    if (!config || !sessionId) return;
    if (!window.confirm("Are you sure you want to clear all results? This cannot be undone.")) return;
    try {
      let emptyResults: any = null;
      if (config.type === "poll") emptyResults = {};
      else if (config.type === "qna") emptyResults = [];
      else if (config.type === "wordcloud") emptyResults = [];
      
      await updateLiveSessionResults(sessionId, emptyResults);
      setResults(emptyResults);
      toast.success("Results cleared");
    } catch (e) {
      toast.error("Failed to clear results");
    }
  };

  const copyPublicLink = async () => {
    const url = `${window.location.origin}/live/${sessionId}`;
    const ok = await copyToClipboard(url);
    if (ok) {
      setIsCopied(true);
      toast.success("Link copied to clipboard!");
      setTimeout(() => setIsCopied(false), 2000);
    } else {
      toast.error("Failed to copy link");
    }
  };

  const deleteQuestion = async (qId: string) => {
    if (!sessionId || !results || !Array.isArray(results)) return;
    try {
      const updated = results.filter((q: any) => q.id !== qId);
      await updateLiveSessionResults(sessionId, updated);
      setResults(updated);
    } catch (e) {
      toast.error("Failed to delete question");
    }
  };

  const toggleLiveQuestion = async (qId: string) => {
    if (!sessionId || !results || !Array.isArray(results)) return;
    try {
      const updated = results.map((q: any) => ({
        ...q,
        isLive: q.id === qId ? !q.isLive : false
      }));
      await updateLiveSessionResults(sessionId, updated);
      setResults(updated);
    } catch (e) {
      toast.error("Failed to update live question status");
    }
  };

  const saveEdit = async () => {
    if (!config || !sessionId) return;
    try {
      const updatedConfig = { ...config, question: editedQuestion };
      await updateLiveSessionConfig(sessionId, updatedConfig);
      setConfig(updatedConfig);
      setIsEditing(false);
      toast.success("Question updated successfully");
    } catch (e) {
      toast.error("Failed to update question");
    }
  };

  const exportToCSV = () => {
    if (!config || !results) {
      toast.error("No results to export");
      return;
    }
    
    let csvContent = "data:text/csv;charset=utf-8,";
    
    if (config.type === "poll") {
      csvContent += "Option,Votes\n";
      (config.options || []).forEach((opt: string, idx: number) => {
        const votes = results?.[idx] || 0;
        csvContent += `"${opt.replace(/"/g, '""')}",${votes}\n`;
      });
    } else if (config.type === "qna") {
      csvContent += "Question,Upvotes,IsLive\n";
      if (Array.isArray(results)) {
        [...results].sort((a: any, b: any) => b.upvotes - a.upvotes).forEach((q: any) => {
          csvContent += `"${(q.text || "").replace(/"/g, '""')}",${q.upvotes || 0},${q.isLive ? 'Yes' : 'No'}\n`;
        });
      }
    } else if (config.type === "wordcloud") {
      csvContent += "Word,Count\n";
      if (Array.isArray(results)) {
        const grouped = results.reduce((acc: any[], curr: any) => {
          const existing = acc.find(w => w.word === curr.word);
          if (existing) {
            existing.count += curr.count;
          } else {
            acc.push({ ...curr });
          }
          return acc;
        }, []);
        grouped.sort((a: any, b: any) => b.count - a.count).forEach((item: any) => {
          csvContent += `"${(item.word || "").replace(/"/g, '""')}",${item.count}\n`;
        });
      }
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `session_${sessionId}_results.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success("Results exported to CSV!");
  };

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto bg-gradient-to-br from-[#fef3ec] via-[#f2effb] to-[#eaf5fc] dark:from-background dark:via-background dark:to-background flex flex-col items-center justify-center p-6 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!config || config === "not_found") {
    return (
      <div className="flex-1 overflow-y-auto bg-gradient-to-br from-[#fef3ec] via-[#f2effb] to-[#eaf5fc] dark:from-background dark:via-background dark:to-background flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-2xl font-bold text-foreground mb-2">Session Not Found</h1>
        <p className="text-muted-foreground mb-6">This session may have been deleted.</p>
        <button onClick={() => navigate("/engage")} className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary/90 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Engage
        </button>
      </div>
    );
  }

  const publicUrl = `${window.location.origin}/live/${sessionId}`;
  const totalVotes = config.type === "poll" && results && !Array.isArray(results) ? (Object.values(results).reduce((a: any, b: any) => a + b, 0) as number) : 0;
  const activeCount = config.type === "poll" ? totalVotes : config.type === "qna" && Array.isArray(results) ? results.length : (Array.isArray(results) ? results.reduce((acc: number, cur: any) => acc + cur.count, 0) : 0);

  return (
    <div className="flex-1 overflow-y-auto w-full h-full relative bg-gradient-to-br from-[#fef3ec] via-[#f2effb] to-[#eaf5fc] dark:from-background dark:via-background dark:to-background">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-orange-400/10 blur-[80px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-pink-500/10 blur-[80px] pointer-events-none" />

      <div className="px-4 md:px-6 pt-6 pb-24 max-w-5xl mx-auto space-y-6 relative z-10">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <button 
            onClick={() => navigate("/engage")}
            className="flex w-max items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">Exit Dashboard</span>
          </button>
          
          <div className="flex items-center gap-2">
            <button
              onClick={toggleStatus}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${config.isPublicActive ? "bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-500/20 dark:text-amber-400" : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400"}`}
            >
              {config.isPublicActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {config.isPublicActive ? "Pause Session" : "Resume Session"}
            </button>
            <button
              onClick={() => window.open(publicUrl, "_blank")}
              className="flex items-center gap-2 px-4 py-2 bg-white/50 hover:bg-white/80 dark:bg-black/20 dark:hover:bg-black/40 border border-black/5 dark:border-white/5 rounded-xl text-sm font-semibold transition-colors"
            >
              <ExternalLink className="w-4 h-4" /> View as Attendee
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          <div className="lg:col-span-2 space-y-6">
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass rounded-3xl p-6 sm:p-8 shadow-sm border border-white/20 dark:border-white/10 bg-white/40 dark:bg-black/20 backdrop-blur-xl"
            >
              <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                  <div className="flex items-center gap-2 text-muted-foreground mb-2">
                    {config.type === "poll" ? <BarChart2 className="w-4 h-4" /> : config.type === "qna" ? <MessageSquare className="w-4 h-4" /> : <Cloud className="w-4 h-4" />}
                    <span className="text-sm font-bold uppercase tracking-wider">{config.type} Results</span>
                  </div>
                  {isEditing ? (
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                      <input 
                        type="text" 
                        value={editedQuestion} 
                        onChange={(e) => setEditedQuestion(e.target.value)}
                        className="w-full sm:w-[300px] md:w-[400px] bg-white/60 dark:bg-black/40 border border-black/10 dark:border-white/10 rounded-xl px-4 py-2 text-lg font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                        autoFocus
                      />
                      <div className="flex items-center gap-2 mt-2 sm:mt-0">
                        <button onClick={saveEdit} className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors">Save</button>
                        <button onClick={() => { setIsEditing(false); setEditedQuestion(config.question); }} className="px-3 py-1.5 bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 rounded-lg text-sm font-semibold transition-colors">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">{config.question}</h2>
                      <button onClick={() => setIsEditing(true)} className="p-1.5 rounded-lg text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 transition-colors shrink-0" title="Edit Question">
                        <Edit className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={exportToCSV}
                    className="p-2.5 rounded-xl text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors shrink-0"
                    title="Export Results (CSV)"
                  >
                    <Download className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={clearResults}
                    className="p-2.5 rounded-xl text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors shrink-0"
                    title="Clear Results"
                  >
                    <RefreshCw className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {config.type === "poll" && (
                <div className="space-y-5">
                  {(config.options || []).map((opt: string, idx: number) => {
                    const votes = results?.[idx] || 0;
                    const percentage = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
                    return (
                      <div key={idx} className="relative">
                        <div className="flex items-end justify-between mb-2">
                          <span className="font-semibold text-foreground">{opt}</span>
                          <span className="text-sm font-bold text-muted-foreground">{votes} votes ({percentage}%)</span>
                        </div>
                        <div className="h-6 w-full bg-black/5 dark:bg-white/5 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${percentage}%` }}
                            transition={{ duration: 1, ease: "easeOut" }}
                            className="h-full bg-gradient-to-r from-orange-400 to-pink-500 rounded-full"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {config.type === "qna" && (
                <div className="space-y-4">
                  {!results || !Array.isArray(results) || results.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-20" />
                      <p>No questions yet.</p>
                    </div>
                  ) : (
                    [...results].sort((a: any, b: any) => b.upvotes - a.upvotes).map((q: any) => (
                      <motion.div 
                        layout
                        key={q.id} 
                        className={`p-4 rounded-2xl border transition-all ${q.isLive ? "bg-orange-50 border-orange-200 dark:bg-orange-500/10 dark:border-orange-500/20 shadow-md" : "bg-white/60 dark:bg-black/20 border-black/5 dark:border-white/5 shadow-sm"}`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex flex-col items-center justify-center p-2 rounded-xl bg-black/5 dark:bg-white/5 min-w-[3rem]">
                            <span className="text-xs font-semibold uppercase text-muted-foreground">Votes</span>
                            <span className="text-lg font-bold">{q.upvotes}</span>
                          </div>
                          <p className={`flex-1 text-base font-medium pt-1 ${q.isLive ? "text-orange-900 dark:text-orange-100" : "text-foreground"}`}>{q.text}</p>
                          <div className="flex items-center gap-1 shrink-0">
                            <button 
                              onClick={() => toggleLiveQuestion(q.id)}
                              className={`p-2 rounded-xl transition-colors ${q.isLive ? "text-orange-600 bg-orange-100 dark:bg-orange-500/20 hover:bg-orange-200" : "text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5"}`}
                              title={q.isLive ? "Hide from Live View" : "Show in Live View"}
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => deleteQuestion(q.id)}
                              className="p-2 rounded-xl text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                              title="Delete Question"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>
              )}

              {config.type === "wordcloud" && (
                <div className="min-h-[300px] flex flex-wrap items-center justify-center gap-4 p-6 bg-white/40 dark:bg-black/20 rounded-2xl border border-black/5 dark:border-white/5">
                  {!results || !Array.isArray(results) || results.length === 0 ? (
                    <div className="text-center text-muted-foreground">
                      <Cloud className="w-12 h-12 mx-auto mb-3 opacity-20" />
                      <p>Waiting for responses...</p>
                    </div>
                  ) : (
                    results.reduce((acc: any[], curr: any) => {
                      const existing = acc.find(w => w.word === curr.word);
                      if (existing) {
                        existing.count += curr.count;
                      } else {
                        acc.push({ ...curr });
                      }
                      return acc;
                    }, []).map((item: any, idx: number) => {
                      const size = Math.min(1.2 + (item.count * 0.5), 6);
                      return (
                        <motion.span
                          key={idx}
                          layout
                          className="font-bold bg-clip-text text-transparent bg-gradient-to-r from-orange-500 to-pink-500"
                          style={{ fontSize: `${size}rem`, opacity: Math.min(0.5 + (item.count * 0.1), 1) }}
                        >
                          {item.word}
                        </motion.span>
                      );
                    })
                  )}
                </div>
              )}
            </motion.div>
          </div>

          <div className="space-y-6">
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="glass rounded-3xl p-6 shadow-sm border border-white/20 dark:border-white/10 bg-white/40 dark:bg-black/20 backdrop-blur-xl"
            >
              <h3 className="text-lg font-bold text-foreground tracking-tight mb-4">Share with Audience</h3>
              
              <div className="space-y-4">
                <div className="bg-white dark:bg-white/10 p-4 rounded-2xl shadow-sm border border-black/5 dark:border-white/5 flex flex-col items-center justify-center gap-3">
                  <div className="p-2 bg-white rounded-xl shadow-sm">
                    <QRCodeSVG value={publicUrl} size={160} fgColor="#000" bgColor="#fff" />
                  </div>
                  <p className="text-xs text-muted-foreground font-medium text-center max-w-[200px]">
                    Scan to join the session
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Public Link</label>
                  <div className="flex items-center gap-2 bg-white/60 dark:bg-black/40 border border-black/10 dark:border-white/10 rounded-xl p-1 overflow-hidden">
                    <div className="flex-1 truncate px-3 text-sm font-medium text-foreground">
                      {publicUrl.replace(/^https?:\/\//, "")}
                    </div>
                    <button 
                      onClick={copyPublicLink}
                      className="shrink-0 flex items-center justify-center w-10 h-10 rounded-lg bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 text-foreground transition-colors"
                    >
                      {isCopied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="glass rounded-3xl p-6 shadow-sm border border-white/20 dark:border-white/10 bg-white/40 dark:bg-black/20 backdrop-blur-xl"
            >
              <h3 className="text-lg font-bold text-foreground tracking-tight mb-4">Session Stats</h3>
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between p-4 rounded-2xl bg-white/50 dark:bg-black/20 border border-black/5 dark:border-white/5">
                  <span className="text-sm font-semibold text-muted-foreground">Status</span>
                  <span className={`text-sm font-bold px-2.5 py-1 rounded-lg ${config.isPublicActive ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                    {config.isPublicActive ? "Live" : "Paused"}
                  </span>
                </div>
                <div className="flex items-center justify-between p-4 rounded-2xl bg-white/50 dark:bg-black/20 border border-black/5 dark:border-white/5">
                  <span className="text-sm font-semibold text-muted-foreground">Total Responses</span>
                  <span className="text-2xl font-bold text-foreground">{activeCount}</span>
                </div>
              </div>
            </motion.div>
          </div>

        </div>

        <div className="pt-12 pb-4 w-full flex justify-center shrink-0 mt-8 border-t border-black/5 dark:border-white/5">
          <p className="text-center text-sm font-medium tracking-wide text-muted-foreground">
            Powered by <a href="https://knowwhatson.com" target="_blank" rel="noopener noreferrer" className="hover:underline font-bold text-foreground">What&apos;s On!</a>
            <span className="mx-2 opacity-50">•</span>
            Chrono Event Mode
          </p>
        </div>

      </div>
    </div>
  );
}
