import React, { useState, useEffect } from "react";
import { useParams } from "react-router";
import { getLiveSessionConfig, getLiveSessionResults, updateLiveSessionResults } from "../lib/api";
import { motion, AnimatePresence } from "motion/react";
import { Send, Heart, Cloud, BarChart2, MessageSquare, QrCode } from "lucide-react";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { SplashScreen } from "./splash-screen";

export function LiveSessionPublicPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [config, setConfig] = useState<any>(null);
  const [results, setResults] = useState<any>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [showSplash, setShowSplash] = useState(true);
  const [upvotedQuestions, setUpvotedQuestions] = useState<string[]>([]);

  const publicUrl = window.location.href;

  const fetchSession = async () => {
    try {
      if (!sessionId) return;
      const c = await getLiveSessionConfig(sessionId);
      if (!c) {
        setConfig("not_found");
        return;
      }
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

  const handleVote = async (idx: number) => {
    if (hasVoted || !sessionId) return;
    setHasVoted(true);
    try {
      const data = await getLiveSessionResults(sessionId);
      const r = (data && !Array.isArray(data)) ? data : {};
      r[idx] = (r[idx] || 0) + 1;
      await updateLiveSessionResults(sessionId, r);
      setResults(r);
    } catch (e) {
      toast.error("Failed to submit vote");
      setHasVoted(false);
    }
  };

  const submitQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !sessionId) return;
    try {
      const data = await getLiveSessionResults(sessionId);
      const r = Array.isArray(data) ? data : [];
      const newQ = { id: Math.random().toString(36).substr(2, 9), text: inputValue.trim(), upvotes: 0, isLive: false };
      const updated = [...r, newQ];
      await updateLiveSessionResults(sessionId, updated);
      setResults(updated);
      setInputValue("");
      toast.success("Question submitted!");
    } catch (err) {
      toast.error("Failed to submit question");
    }
  };

  const upvoteQuestion = async (qId: string) => {
    if (!sessionId || upvotedQuestions.includes(qId)) return;
    setUpvotedQuestions(prev => [...prev, qId]);
    try {
      const data = await getLiveSessionResults(sessionId);
      const r = Array.isArray(data) ? data : [];
      const updated = r.map((q: any) => q.id === qId ? { ...q, upvotes: q.upvotes + 1 } : q);
      await updateLiveSessionResults(sessionId, updated);
      setResults(updated);
    } catch (err) {
      toast.error("Failed to upvote");
      setUpvotedQuestions(prev => prev.filter(id => id !== qId));
    }
  };

  const submitWord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !sessionId) return;
    try {
      const data = await getLiveSessionResults(sessionId);
      const r = Array.isArray(data) ? data : [];
      const word = inputValue.trim().toLowerCase();
      const existing = r.find((w: any) => w.word === word);
      let updated;
      if (existing) {
        updated = r.map((w: any) => w.word === word ? { ...w, count: w.count + 1 } : w);
      } else {
        updated = [...r, { word, count: 1 }];
      }
      await updateLiveSessionResults(sessionId, updated);
      setResults(updated);
      setInputValue("");
      setHasVoted(true);
      toast.success("Word added!");
    } catch (err) {
      toast.error("Failed to submit word");
    }
  };

  const isLoading = loading || showSplash;

  if (isLoading) {
    return <SplashScreen onComplete={() => setShowSplash(false)} />;
  }

  if (!config || config === "not_found") {
    return (
      <div className="min-h-screen bg-[#fcfaf8] flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-2xl font-bold text-foreground mb-2">Session Not Found</h1>
        <p className="text-muted-foreground">This session may have ended or does not exist.</p>
      </div>
    );
  }

  if (!config.isPublicActive) {
    return (
      <div className="min-h-screen bg-[#fcfaf8] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mb-4">
          <BarChart2 className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">Session Paused</h1>
        <p className="text-muted-foreground">The host has paused this session. Please wait...</p>
      </div>
    );
  }

  const liveQuestion = config.type === "qna" && Array.isArray(results) ? results.find((q: any) => q.isLive) : null;
  const totalVotes = config.type === "poll" && results && !Array.isArray(results) ? (Object.values(results).reduce((a: any, b: any) => a + b, 0) as number) : 0;

  // Aggregate wordcloud results on render to handle race condition duplicates
  const wordCloudResults = config.type === "wordcloud" && Array.isArray(results) ? results.reduce((acc: any[], curr: any) => {
    const existing = acc.find(w => w.word === curr.word);
    if (existing) {
      existing.count += curr.count;
    } else {
      acc.push({ ...curr });
    }
    return acc;
  }, []) : [];

  return (
    <div className="min-h-screen bg-[#fcfaf8] text-foreground flex flex-col items-center px-4 py-12 sm:px-6 sm:py-20 relative overflow-x-hidden overflow-y-auto">
      {/* Decorative blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-purple-500/5 blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-pink-500/5 blur-3xl pointer-events-none" />

      <div className="w-full max-w-2xl z-10 space-y-8">
        
        {/* Header with Title and QR */}
        <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-6 mb-8">
          <div className="text-center sm:text-left space-y-4 flex-1">
            <span className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full bg-black/5 text-xs font-semibold text-muted-foreground uppercase tracking-widest">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Live {config.type}
            </span>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-balance leading-tight">
              {config.question}
            </h1>
          </div>
          
          <div className="shrink-0 p-3 bg-white rounded-2xl shadow-sm border border-black/5 flex flex-col items-center gap-2">
            <QRCodeSVG value={publicUrl} size={96} fgColor="#000" bgColor="#fff" />
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <QrCode className="w-3 h-3" /> Scan to join
            </div>
          </div>
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/80 backdrop-blur-xl border border-black/5 shadow-xl rounded-3xl p-6 sm:p-8"
        >
          
          {/* POLL */}
          {config.type === "poll" && (
            <div className="space-y-4">
              {!hasVoted ? (
                (config.options || []).map((opt: string, idx: number) => (
                  <button
                    key={idx}
                    onClick={() => handleVote(idx)}
                    className="w-full p-4 rounded-2xl bg-black/5 hover:bg-primary hover:text-primary-foreground font-semibold text-left transition-all hover:scale-[1.02] active:scale-[0.98]"
                  >
                    {opt}
                  </button>
                ))
              ) : (
                <div className="space-y-5">
                  <h3 className="text-center font-bold text-lg mb-6">Live Results</h3>
                  {config.options.map((opt: string, idx: number) => {
                    const votes = results?.[idx] || 0;
                    const percentage = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
                    return (
                      <div key={idx} className="relative">
                        <div className="flex items-end justify-between mb-2">
                          <span className="font-semibold text-sm">{opt}</span>
                          <span className="text-xs font-bold text-muted-foreground">{votes} ({percentage}%)</span>
                        </div>
                        <div className="h-5 w-full bg-black/5 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${percentage}%` }}
                            transition={{ duration: 1, ease: "easeOut" }}
                            className="h-full bg-purple-500 rounded-full"
                          />
                        </div>
                      </div>
                    );
                  })}
                  <p className="text-center text-xs text-muted-foreground mt-4">{totalVotes} Total Votes</p>
                </div>
              )}
            </div>
          )}

          {/* Q&A */}
          {config.type === "qna" && (
            <div className="space-y-8">
              <AnimatePresence>
                {liveQuestion && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="p-6 rounded-2xl bg-blue-50 border border-blue-200 text-blue-900 shadow-sm"
                  >
                    <div className="flex items-center gap-2 text-blue-600 mb-2">
                      <MessageSquare className="w-4 h-4" />
                      <span className="text-xs font-bold uppercase tracking-wider">Live Question</span>
                    </div>
                    <p className="text-lg sm:text-xl font-bold">{liveQuestion.text}</p>
                  </motion.div>
                )}
              </AnimatePresence>

              <form onSubmit={submitQuestion} className="flex gap-2">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Ask a question..."
                  className="flex-1 px-4 py-3 rounded-xl border border-black/10 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
                <button 
                  type="submit"
                  disabled={!inputValue.trim()}
                  className="px-6 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>

              <div className="space-y-3 mt-8">
                <h3 className="font-bold text-sm text-muted-foreground uppercase tracking-wider mb-4">Recent Questions</h3>
                {[...(Array.isArray(results) ? results : [])].sort((a: any, b: any) => b.upvotes - a.upvotes).map((q: any) => (
                  <div key={q.id} className="p-4 rounded-xl bg-black/5 border border-transparent flex items-start gap-4">
                    <p className="flex-1 text-sm font-medium">{q.text}</p>
                    <button 
                      onClick={() => upvoteQuestion(q.id)}
                      disabled={upvotedQuestions.includes(q.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white shadow-sm hover:bg-gray-50 text-xs font-semibold transition-colors shrink-0 ${upvotedQuestions.includes(q.id) ? 'text-red-500 bg-red-50 border border-red-100 hover:bg-red-50 cursor-default' : 'text-muted-foreground hover:text-red-500'}`}
                    >
                      <Heart className={`w-3.5 h-3.5 ${upvotedQuestions.includes(q.id) ? 'fill-current' : ''}`} />
                      {q.upvotes}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* WORD CLOUD */}
          {config.type === "wordcloud" && (
            <div className="space-y-8">
              {!hasVoted && (
                <form onSubmit={submitWord} className="flex gap-2">
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="Enter a word..."
                    className="flex-1 px-4 py-3 rounded-xl border border-black/10 bg-white focus:outline-none focus:ring-2 focus:ring-pink-500/50"
                  />
                  <button 
                    type="submit"
                    disabled={!inputValue.trim()}
                    className="px-6 py-3 rounded-xl bg-pink-600 text-white font-semibold hover:bg-pink-700 transition-colors disabled:opacity-50"
                  >
                    Submit
                  </button>
                </form>
              )}

              <div className="min-h-[300px] flex flex-wrap items-center justify-center gap-3 p-4">
                {wordCloudResults.length === 0 ? (
                  <div className="text-center text-muted-foreground flex flex-col items-center">
                    <Cloud className="w-12 h-12 mb-3 opacity-20" />
                    <p>Be the first to add a word!</p>
                  </div>
                ) : (
                  wordCloudResults.map((item: any, idx: number) => {
                    const size = Math.min(1.5 + (item.count * 0.5), 6);
                    return (
                      <motion.span
                        key={idx}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="font-bold text-pink-500"
                        style={{ fontSize: `${size}rem`, opacity: Math.min(0.5 + (item.count * 0.1), 1) }}
                      >
                        {item.word}
                      </motion.span>
                    );
                  })
                )}
              </div>
            </div>
          )}

        </motion.div>

        {/* Footer Credit for Public View */}
        <div className="pt-8 pb-4 w-full flex justify-center shrink-0">
          <p className="text-center text-xs font-medium tracking-wide text-muted-foreground">
            Created with <span className="text-red-500">&#9829;</span> by <a href="https://knowwhatson.com" target="_blank" rel="noopener noreferrer" className="hover:underline font-bold text-foreground">What&apos;s On!</a>
          </p>
        </div>

      </div>
    </div>
  );
}