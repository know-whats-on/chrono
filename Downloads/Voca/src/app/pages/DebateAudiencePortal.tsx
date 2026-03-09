import React, { useState, useEffect } from "react";
import { useParams } from "react-router";
import { ThumbsUp, Heart, Trophy, Zap, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import * as api from "../utils/api";
import * as kv from "../utils/kv";
import { Session } from "../types";
import { LoadSplash } from "../components/LoadSplash";

export default function DebateAudiencePortal() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const [hasVoted, setHasVoted] = useState<string | null>(null);
  const [audienceId] = useState(() => crypto.randomUUID());
  
  // Particle effects for clicking cheers
  const [particles, setParticles] = useState<{id: string, icon: any, x: number, y: number}[]>([]);

  useEffect(() => {
    if (!sessionId) return;
    api.getSession(sessionId)
      .then(s => {
        setSession(s);
        setLoading(false);
      })
      .catch(err => {
        setErrorMsg("Session not found");
        setLoading(false);
      });
  }, [sessionId]);

  const sendEvent = async (type: string, value?: string, x?: number, y?: number) => {
    if (!session) return;
    const eventId = crypto.randomUUID();
    const event = {
      id: eventId,
      sessionId: session.id,
      audienceId,
      type,
      value,
      timestamp: Date.now()
    };
    
    // Add visual particle
    if (x && y) {
      let icon = ThumbsUp;
      if (type === "heart") icon = Heart;
      if (type === "zap") icon = Zap;
      
      const newParticle = { id: eventId, icon, x, y };
      setParticles(p => [...p, newParticle]);
      setTimeout(() => {
        setParticles(p => p.filter(x => x.id !== eventId));
      }, 2000);
    }

    try {
      await kv.set(`CHATGPT_debate_event_${session.id}_${eventId}`, event);
      if (type === "vote") {
        setHasVoted(value as string);
        toast.success(`Voted for Team ${value?.toUpperCase()}!`);
      }
    } catch (e) {
      console.error("Failed to send event", e);
    }
  };

  if (loading) return <div className="fixed inset-0 flex items-center justify-center"><LoadSplash /></div>;
  if (errorMsg || !session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-6">
        <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
        <h2 className="text-xl font-bold mb-2">Error</h2>
        <p className="text-gray-500 text-center">{errorMsg}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#f7f7f8] relative overflow-hidden">
      <div className="pt-12 pb-6 px-6 bg-white shadow-sm z-10 relative">
        <h1 className="text-xl font-bold text-center">Audience Portal</h1>
        <p className="text-sm text-gray-500 text-center">{session.assessmentTitle}</p>
      </div>

      <div className="flex-1 p-6 flex flex-col justify-center space-y-10 z-10 relative">
        {/* Vote Section */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-lg font-bold text-center mb-6">Vote for the Best Point</h2>
          <div className="flex gap-4">
            <button
              onClick={() => sendEvent("vote", "for")}
              className={`flex-1 flex flex-col items-center gap-3 p-4 rounded-2xl border-2 transition-all ${
                hasVoted === "for" ? "border-blue-500 bg-blue-50" : "border-gray-100 hover:border-blue-200"
              }`}
            >
              <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                <Trophy className={`h-6 w-6 ${hasVoted === "for" ? "text-blue-500" : "text-blue-300"}`} />
              </div>
              <span className={`font-bold ${hasVoted === "for" ? "text-blue-700" : "text-gray-600"}`}>
                Team FOR
              </span>
            </button>
            <button
              onClick={() => sendEvent("vote", "against")}
              className={`flex-1 flex flex-col items-center gap-3 p-4 rounded-2xl border-2 transition-all ${
                hasVoted === "against" ? "border-red-500 bg-red-50" : "border-gray-100 hover:border-red-200"
              }`}
            >
              <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
                <Trophy className={`h-6 w-6 ${hasVoted === "against" ? "text-red-500" : "text-red-300"}`} />
              </div>
              <span className={`font-bold ${hasVoted === "against" ? "text-red-700" : "text-gray-600"}`}>
                Team AGAINST
              </span>
            </button>
          </div>
          {hasVoted && (
            <p className="text-center text-sm text-gray-400 mt-4">
              You can change your vote at any time.
            </p>
          )}
        </div>

        {/* Reaction Section */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 text-center">
          <h2 className="text-lg font-bold mb-6">Send Reactions</h2>
          <div className="flex justify-center gap-6">
            {[
              { id: "clap", icon: ThumbsUp, color: "text-green-500", bg: "bg-green-100" },
              { id: "heart", icon: Heart, color: "text-pink-500", bg: "bg-pink-100" },
              { id: "zap", icon: Zap, color: "text-amber-500", bg: "bg-amber-100" }
            ].map(reaction => (
              <button
                key={reaction.id}
                onClick={(e) => sendEvent(reaction.id, undefined, e.clientX, e.clientY)}
                className={`h-16 w-16 rounded-full ${reaction.bg} flex items-center justify-center hover:scale-110 active:scale-90 transition-transform shadow-sm`}
              >
                <reaction.icon className={`h-8 w-8 ${reaction.color} fill-current`} />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Floating Particles */}
      <AnimatePresence>
        {particles.map((p) => {
          const Icon = p.icon;
          return (
            <motion.div
              key={p.id}
              initial={{ opacity: 1, x: p.x - 20, y: p.y - 20, scale: 0.5 }}
              animate={{ opacity: 0, y: p.y - 150, scale: 2 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.5, ease: "easeOut" }}
              className="fixed pointer-events-none z-50 text-orange-500"
            >
              <Icon className="h-8 w-8 fill-current" />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}