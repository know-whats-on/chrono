import React, { useState, useEffect } from "react";
import { useParams } from "react-router";
import { request } from "../lib/api";
import { CheckCircle2, Loader2, X, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { SplashScreen } from "./splash-screen";

type Rating = "sad" | "happy" | "exceeded" | null;

export function FeedbackPage() {
  const { sessionId } = useParams();
  const [rating, setRating] = useState<Rating>(null);
  const [comment, setComment] = useState("");
  
  // Data loading state
  const [dataLoading, setDataLoading] = useState(true);
  const [sessionInfo, setSessionInfo] = useState<{sessionTitle: string, eventTitle: string} | null>(null);
  const [error, setError] = useState("");
  
  // App state
  const [showSplash, setShowSplash] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Data fetch
  useEffect(() => {
    const fetchInfo = async () => {
      try {
        const data = await request(`/open-sessions/${sessionId}/feedback-info`);
        setSessionInfo(data);
      } catch (err) {
        setError("Session not found");
      } finally {
        setDataLoading(false);
      }
    };
    
    fetchInfo();
  }, [sessionId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rating) return;
    
    setSubmitting(true);
    try {
      await request(`/open-sessions/${sessionId}/feedback`, {
        method: "POST",
        body: JSON.stringify({ rating, comment })
      });
      setSubmitted(true);
    } catch (err) {
      console.error(err);
      setError("Failed to submit feedback. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const isLoading = dataLoading || showSplash;

  if (isLoading) {
    return <SplashScreen onComplete={() => setShowSplash(false)} />;
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center bg-[#FAECE8] dark:bg-[#1B1446] p-4 font-sans overflow-hidden">
      {/* Warm background gradient & liquid blobs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-pink-400/20 dark:bg-pink-500/10 rounded-full blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-orange-400/20 dark:bg-orange-500/10 rounded-full blur-[100px]" />
        <div className="absolute top-[40%] left-[40%] w-[30%] h-[30%] bg-purple-400/20 dark:bg-purple-500/10 rounded-full blur-[80px]" />
      </div>

      <AnimatePresence mode="wait">
        {error && !sessionInfo ? (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="z-10 bg-white/60 dark:bg-white/10 backdrop-blur-2xl border border-white/50 dark:border-white/20 p-8 rounded-[32px] max-w-md w-full text-center shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)]"
          >
            <h1 className="text-2xl font-bold mb-2 text-slate-900 dark:text-white">Oops</h1>
            <p className="text-slate-600 dark:text-slate-300">{error}</p>
          </motion.div>
        ) : (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="z-10 bg-white/60 dark:bg-black/20 backdrop-blur-3xl border border-white/60 dark:border-white/10 w-full max-w-md rounded-[32px] p-8 shadow-[0_30px_80px_-15px_rgba(0,0,0,0.15)] relative"
          >
            {submitted ? (
              <div className="text-center py-10">
                <motion.div 
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", bounce: 0.5 }}
                  className="w-20 h-20 bg-gradient-to-br from-green-400 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-8 shadow-lg shadow-green-500/30"
                >
                  <CheckCircle2 className="w-10 h-10 text-white" />
                </motion.div>
                <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-3">Thank you!</h2>
                <p className="text-slate-600 dark:text-slate-300 text-lg leading-relaxed">
                  Your feedback for <span className="font-semibold text-slate-800 dark:text-white">{sessionInfo?.sessionTitle}</span> has been received.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-8">
                  <h1 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-pink-500 to-orange-500">Share Review</h1>
                  <button className="w-8 h-8 rounded-full bg-white/50 dark:bg-white/10 hover:bg-white dark:hover:bg-white/20 flex items-center justify-center text-slate-500 dark:text-slate-400 transition-all shadow-sm">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-3 text-center tracking-tight leading-tight">Did we meet your expectations?</h2>
                <p className="text-center text-slate-600 dark:text-slate-300 text-[15px] mb-10 px-2 leading-relaxed">
                  Rate your experience at<br/>
                  <span className="font-semibold text-slate-800 dark:text-white">{sessionInfo?.sessionTitle}!</span>
                </p>

                <form onSubmit={handleSubmit}>
                  <div className="flex justify-center items-end gap-4 sm:gap-6 mb-12 h-32">
                    {/* Didn't Meet */}
                    <div className="relative flex flex-col items-center group">
                      <button
                        type="button"
                        onClick={() => setRating("sad")}
                        className={`text-6xl sm:text-7xl transition-all duration-400 relative z-10 ${
                          rating === "sad" ? "scale-110 sm:scale-125 filter drop-shadow-xl grayscale-0 -translate-y-2" : rating ? "opacity-40 grayscale hover:grayscale-[50%] hover:opacity-80" : "hover:scale-110 hover:-translate-y-1 drop-shadow-md"
                        }`}
                      >
                        😞
                      </button>
                      <AnimatePresence>
                        {rating === "sad" && (
                          <motion.div 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            className="absolute -bottom-12 bg-slate-800 text-white text-[11px] font-bold px-4 py-2 rounded-xl whitespace-nowrap shadow-lg"
                          >
                            Didn't meet
                            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-800 rotate-45" />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Met */}
                    <div className="relative flex flex-col items-center group">
                      <button
                        type="button"
                        onClick={() => setRating("happy")}
                        className={`text-6xl sm:text-7xl transition-all duration-400 relative z-10 ${
                          rating === "happy" ? "scale-110 sm:scale-125 filter drop-shadow-xl grayscale-0 -translate-y-2" : rating ? "opacity-40 grayscale hover:grayscale-[50%] hover:opacity-80" : "hover:scale-110 hover:-translate-y-1 drop-shadow-md"
                        }`}
                      >
                        😊
                      </button>
                      <AnimatePresence>
                        {rating === "happy" && (
                          <motion.div 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            className="absolute -bottom-12 bg-slate-800 text-white text-[11px] font-bold px-4 py-2 rounded-xl whitespace-nowrap shadow-lg"
                          >
                            Met
                            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-800 rotate-45" />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Exceeded */}
                    <div className="relative flex flex-col items-center group">
                      <button
                        type="button"
                        onClick={() => setRating("exceeded")}
                        className={`text-6xl sm:text-7xl transition-all duration-400 relative z-10 ${
                          rating === "exceeded" ? "scale-110 sm:scale-125 filter drop-shadow-xl grayscale-0 -translate-y-2" : rating ? "opacity-40 grayscale hover:grayscale-[50%] hover:opacity-80" : "hover:scale-110 hover:-translate-y-1 drop-shadow-md"
                        }`}
                      >
                        🤩
                      </button>
                      <AnimatePresence>
                        {rating === "exceeded" && (
                          <motion.div 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            className="absolute -bottom-12 bg-slate-800 text-white text-[11px] font-bold px-4 py-2 rounded-xl whitespace-nowrap shadow-lg"
                          >
                            Exceeded
                            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-800 rotate-45" />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  <div className="relative mb-8">
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="What could be better..."
                      className="w-full h-32 p-5 rounded-2xl border border-white/40 dark:border-white/10 bg-white/40 dark:bg-black/20 backdrop-blur-md text-slate-900 dark:text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-pink-400/50 resize-none transition-all shadow-inner"
                    />
                  </div>

                  {error && <p className="text-red-500 text-sm mb-4 text-center font-medium bg-red-50 dark:bg-red-900/20 py-2 rounded-lg">{error}</p>}

                  <button
                    type="submit"
                    disabled={!rating || submitting}
                    className="w-full py-4 rounded-2xl bg-gradient-to-r from-pink-500 to-orange-500 hover:from-pink-600 hover:to-orange-600 text-white font-bold text-lg transition-all shadow-lg shadow-pink-500/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transform hover:scale-[1.02] active:scale-[0.98]"
                  >
                    {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : "Submit Review"}
                  </button>
                </form>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}