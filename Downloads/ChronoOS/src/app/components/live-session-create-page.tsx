import React, { useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, BarChart2, MessageSquare, Cloud, Plus, Trash2, ArrowRight } from "lucide-react";
import { updateLiveSessionConfig, updateLiveSessionResults } from "../lib/api";
import { motion } from "motion/react";
import { toast } from "sonner";

type SessionType = "poll" | "qna" | "wordcloud";

export function LiveSessionCreatePage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [type, setType] = useState<SessionType>("poll");
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (!question.trim()) {
      toast.error("Please enter a question or prompt.");
      return;
    }
    if (type === "poll") {
      const validOptions = options.filter(o => o.trim());
      if (validOptions.length < 2) {
        toast.error("Please provide at least 2 options for the poll.");
        return;
      }
    }

    setIsCreating(true);
    try {
      const sessionId = Math.random().toString(36).substring(2, 9);
      
      const config = {
        id: sessionId,
        type,
        question: question.trim(),
        options: type === "poll" ? options.filter(o => o.trim()) : undefined,
        isPublicActive: true, // defaults to on
        createdAt: Date.now()
      };

      await updateLiveSessionConfig(sessionId, config);
      
      // Initialize results
      if (type === "poll") {
        await updateLiveSessionResults(sessionId, {});
      } else if (type === "qna") {
        await updateLiveSessionResults(sessionId, []);
      } else if (type === "wordcloud") {
        await updateLiveSessionResults(sessionId, []);
      }

      toast.success("Live session created!");
      navigate(`/live-session/dashboard/${sessionId}`);
    } catch (error) {
      console.error(error);
      toast.error("Failed to create session. Please try again.");
    } finally {
      setIsCreating(false);
    }
  };

  const addOption = () => setOptions([...options, ""]);
  const removeOption = (idx: number) => {
    if (options.length <= 2) return;
    setOptions(options.filter((_, i) => i !== idx));
  };
  const updateOption = (idx: number, val: string) => {
    const newOptions = [...options];
    newOptions[idx] = val;
    setOptions(newOptions);
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-6 pt-6 pb-20 relative w-full h-full bg-[#fcfaf8] dark:bg-black/5">
      <div className="max-w-2xl mx-auto">
        <button 
          onClick={() => step === 2 ? setStep(1) : navigate(-1)}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm font-medium">{step === 2 ? "Back to Type" : "Back to Engage"}</span>
        </button>

        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-3xl p-6 sm:p-8 shadow-sm border border-border/50 bg-white/60 dark:bg-white/5"
        >
          {step === 1 ? (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-foreground tracking-tight">Create a Live Session</h1>
                <p className="text-muted-foreground mt-1">Choose the type of interaction you want to host.</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <button
                  onClick={() => { setType("poll"); setStep(2); }}
                  className="p-6 rounded-2xl border-2 border-transparent bg-purple-50 dark:bg-purple-500/10 hover:border-purple-200 dark:hover:border-purple-500/30 text-left transition-all group"
                >
                  <div className="w-12 h-12 rounded-xl bg-purple-100 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <BarChart2 className="w-6 h-6" />
                  </div>
                  <h3 className="font-bold text-foreground">Live Poll</h3>
                  <p className="text-xs text-muted-foreground mt-1">Multiple choice voting</p>
                </button>

                <button
                  onClick={() => { setType("qna"); setStep(2); }}
                  className="p-6 rounded-2xl border-2 border-transparent bg-blue-50 dark:bg-blue-500/10 hover:border-blue-200 dark:hover:border-blue-500/30 text-left transition-all group"
                >
                  <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <MessageSquare className="w-6 h-6" />
                  </div>
                  <h3 className="font-bold text-foreground">Q&A</h3>
                  <p className="text-xs text-muted-foreground mt-1">Audience questions</p>
                </button>

                <button
                  onClick={() => { setType("wordcloud"); setStep(2); }}
                  className="p-6 rounded-2xl border-2 border-transparent bg-pink-50 dark:bg-pink-500/10 hover:border-pink-200 dark:hover:border-pink-500/30 text-left transition-all group"
                >
                  <div className="w-12 h-12 rounded-xl bg-pink-100 text-pink-600 dark:bg-pink-500/20 dark:text-pink-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Cloud className="w-6 h-6" />
                  </div>
                  <h3 className="font-bold text-foreground">Word Cloud</h3>
                  <p className="text-xs text-muted-foreground mt-1">Visual word responses</p>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-foreground tracking-tight">
                  {type === "poll" ? "Configure Poll" : type === "qna" ? "Configure Q&A" : "Configure Word Cloud"}
                </h1>
                <p className="text-muted-foreground mt-1">Set up your question and options.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-foreground mb-1.5">
                    {type === "poll" ? "Question" : "Prompt / Heading"}
                  </label>
                  <input 
                    type="text"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder={type === "poll" ? "e.g. What is your favorite color?" : "e.g. What comes to mind when you hear 'Future'?"}
                    className="w-full px-4 py-3 rounded-xl border border-border/50 bg-white/50 dark:bg-black/20 focus:outline-none focus:ring-2 focus:ring-primary/20"
                    autoFocus
                  />
                </div>

                {type === "poll" && (
                  <div className="space-y-3">
                    <label className="block text-sm font-semibold text-foreground mb-1">Options</label>
                    {options.map((opt, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input 
                          type="text"
                          value={opt}
                          onChange={(e) => updateOption(idx, e.target.value)}
                          placeholder={`Option ${idx + 1}`}
                          className="flex-1 px-4 py-2.5 rounded-xl border border-border/50 bg-white/50 dark:bg-black/20 focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />
                        {options.length > 2 && (
                          <button 
                            onClick={() => removeOption(idx)}
                            className="p-2.5 text-muted-foreground hover:text-red-500 bg-white/50 dark:bg-black/20 rounded-xl hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors border border-border/50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                    <button 
                      onClick={addOption}
                      className="flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors py-2"
                    >
                      <Plus className="w-4 h-4" /> Add Option
                    </button>
                  </div>
                )}
              </div>

              <div className="pt-4 flex justify-end">
                <button
                  onClick={handleCreate}
                  disabled={isCreating}
                  className="flex items-center gap-2 px-6 py-3 bg-foreground text-background font-semibold rounded-xl hover:bg-foreground/90 transition-colors disabled:opacity-50"
                >
                  {isCreating ? "Creating..." : "Create Session"}
                  {!isCreating && <ArrowRight className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}