import React, { useState, useEffect, useMemo } from "react";
import { Maximize2, Settings, Minimize2, Play, Pause, RotateCcw, X, Users, MessageSquareHeart } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { format, differenceInSeconds, isValid } from "date-fns";
import { useLocation, useNavigate } from "react-router";
import svgPaths from "../../imports/svg-6bmvk84f5e";

function GlassBubble({
  size, cLeft, cTop, cWidth, cHeight,
  strokeViewBox, strokePath, strokeGradientId, strokeGradient,
  specX, specY,
}: {
  size: number; cLeft: number; cTop: number; cWidth: number; cHeight: number;
  strokeViewBox: string; strokePath: React.ReactNode;
  strokeGradientId: string; strokeGradient: React.ReactNode;
  specX: number; specY: number;
}) {
  const dx = size > 80 ? 3 : 2;
  return (
    <div style={{ width: size, height: size, position: "relative" }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: "50%", overflow: "hidden" }}>
        <div style={{ position: "absolute", left: cLeft, top: cTop, width: cWidth, height: cHeight, opacity: 0.55 }}>
          <svg viewBox="0 0 438.776 536.282" style={{ width: "100%", height: "100%" }} fill="none">
            <path d={svgPaths.p15267700} fill="white" />
          </svg>
        </div>
        <div style={{ position: "absolute", left: cLeft + dx, top: cTop - 1, width: cWidth, height: cHeight, opacity: 0.2, mixBlendMode: "screen" }}>
          <svg viewBox="0 0 438.776 536.282" style={{ width: "100%", height: "100%" }} fill="none"><path d={svgPaths.p15267700} fill="#ffb0a0" /></svg>
        </div>
        <div style={{ position: "absolute", left: cLeft - dx, top: cTop + 1, width: cWidth, height: cHeight, opacity: 0.2, mixBlendMode: "screen" }}>
          <svg viewBox="0 0 438.776 536.282" style={{ width: "100%", height: "100%" }} fill="none"><path d={svgPaths.p15267700} fill="#90b8ff" /></svg>
        </div>
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: `radial-gradient(circle at ${specX}% ${specY}%, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.15) 20%, transparent 55%)`, pointerEvents: "none" }} />
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", boxShadow: "inset 0 0 8px 2px rgba(255,255,255,0.18), inset 0 0 20px 4px rgba(180,210,255,0.06)", pointerEvents: "none" }} />
      </div>
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} fill="none" viewBox={strokeViewBox}>
        {strokePath}
        <defs>{strokeGradient}</defs>
      </svg>
    </div>
  );
}

function EmbossedLogo({ isLightBackground = false }: { isLightBackground?: boolean }) {
  const textColor = isLightBackground ? 'text-black/30' : 'text-white/30';
  const textShadow = isLightBackground 
    ? '1px 1px 1px rgba(255,255,255,0.8), -1px -1px 1px rgba(0,0,0,0.1)'
    : '1px 1px 1px rgba(0,0,0,0.4), -1px -1px 1px rgba(255,255,255,0.1)';
    
  return (
    <div className={`font-black tracking-[0.3em] uppercase text-lg sm:text-xl ${textColor}`} style={{ textShadow }}>
      CHRONO
    </div>
  );
}

const ICEBREAKERS = [
  // Small (2-10) - Professional
  { id: 1, min: 2, max: 10, category: 'professional', title: "First Job Lessons", desc: "Share one thing you learned from your very first job.", content: "Think of your first job.\n\nShare one valuable lesson you learned.\n\nKeep it to 60 seconds." },
  { id: 2, min: 2, max: 10, category: 'professional', title: "Unusual Skills", desc: "Share a professional skill you have that rarely gets used.", content: "Think of a skill you possess.\n\nShare how you acquired it.\n\nDiscuss when it might be useful." },
  { id: 3, min: 2, max: 10, category: 'professional', title: "Recent Wins", desc: "Share a small, recent victory you had at work.", content: "Reflect on the past month.\n\nShare one small victory.\n\nCelebrate with the group." },
  
  // Small (2-10) - Casual
  { id: 4, min: 2, max: 10, category: 'casual', title: "Best Advice", desc: "What's the best piece of advice you've ever received?", content: "Think of advice that stuck with you.\n\nShare who gave it to you.\n\nExplain how it helps you today." },
  { id: 5, min: 2, max: 10, category: 'casual', title: "Hidden Hobbies", desc: "What's a hobby you enjoy that might surprise people?", content: "Think of what you do on weekends.\n\nShare your favorite hidden hobby.\n\nTell us why you love it." },
  { id: 6, min: 2, max: 10, category: 'casual', title: "Favorite Places", desc: "Describe a place where you feel most relaxed.", content: "Close your eyes and think of a calming place.\n\nDescribe it in 3 sentences.\n\nShare why it's special." },

  // Medium (11-49) - Professional
  { id: 7, min: 11, max: 49, category: 'professional', title: "Two-Minute Mentorship", desc: "Pair up. Share a current challenge and get quick advice.", content: "Find a partner.\n\nPerson A shares a challenge (1 min).\n\nPerson B gives advice (1 min).\n\nSwitch roles!" },
  { id: 8, min: 11, max: 49, category: 'professional', title: "Industry Predictions", desc: "Share one prediction for our industry in the next 5 years.", content: "Turn to a neighbor.\n\nShare your top prediction.\n\nDiscuss briefly." },
  { id: 9, min: 11, max: 49, category: 'professional', title: "Inspiring Figures", desc: "Who is someone in your field that inspires you?", content: "Think of an inspiring professional.\n\nTurn to a neighbor.\n\nShare their name and why they inspire you." },

  // Medium (11-49) - Casual
  { id: 10, min: 11, max: 49, category: 'casual', title: "Weekend Highlights", desc: "Pair up and share the best part of your recent weekend.", content: "Find a partner.\n\nShare the highlight of your weekend.\n\nKeep it under 60 seconds." },
  { id: 11, min: 11, max: 49, category: 'casual', title: "Favorite Books", desc: "What's a book you've read recently that you'd recommend?", content: "Turn to a neighbor.\n\nShare the title of the book.\n\nGive a 30-second pitch on why they should read it." },
  { id: 12, min: 11, max: 49, category: 'casual', title: "Go-to Meals", desc: "What is your go-to meal when you don't want to cook?", content: "Pair up.\n\nShare your favorite easy meal.\n\nDebate who has the better recipe!" },

  // Large (50-149) - Professional
  { id: 13, min: 50, max: 149, category: 'professional', title: "Goal Alignment", desc: "Share one goal you hope to achieve by the end of today.", content: "Turn to the person next to you.\n\nShare your main goal for today.\n\nFind out if your goals align." },
  { id: 14, min: 50, max: 149, category: 'professional', title: "Current Focus", desc: "What is the main project you are focused on this week?", content: "Turn to a neighbor.\n\nShare your primary project.\n\nKeep it to 3 sentences." },
  { id: 15, min: 50, max: 149, category: 'professional', title: "Career Advice", desc: "What advice would you give to someone starting in your field?", content: "Turn to the person behind you.\n\nShare your top piece of advice.\n\nKeep it brief and impactful." },

  // Large (50-149) - Casual
  { id: 16, min: 50, max: 149, category: 'casual', title: "Dream Vacations", desc: "If you could travel anywhere tomorrow, where would you go?", content: "Turn to a neighbor.\n\nShare your dream destination.\n\nExplain what you'd do there." },
  { id: 17, min: 50, max: 149, category: 'casual', title: "First Concerts", desc: "What was the very first concert you attended?", content: "Turn to the person next to you.\n\nShare the artist and the year.\n\nDiscuss the experience." },
  { id: 18, min: 50, max: 149, category: 'casual', title: "Favorite Movies", desc: "What is a movie you can watch over and over without getting bored?", content: "Turn to a neighbor.\n\nShare your favorite re-watchable movie.\n\nExplain why it never gets old." },

  // Massive (150+) - Professional
  { id: 19, min: 150, max: 1000, category: 'professional', title: "Word Association", desc: "When you hear [Industry Topic], what's the first word that comes to mind?", content: "Think of the first word that comes to mind.\n\nTurn to a neighbor.\n\nShare your word and discuss for 1 minute." },
  { id: 20, min: 150, max: 1000, category: 'professional', title: "Quick Connections", desc: "Introduce yourself to someone you haven't met yet.", content: "Stand up.\n\nFind someone you don't know.\n\nExchange names and roles in 60 seconds." },
  { id: 21, min: 150, max: 1000, category: 'professional', title: "Energy Check", desc: "Rate your current energy level from 1 to 10.", content: "Think of a number from 1 to 10.\n\nTurn to a neighbor.\n\nShare your number and one reason why." },

  // Massive (150+) - Casual
  { id: 22, min: 150, max: 1000, category: 'casual', title: "Morning Routines", desc: "What is one thing you must do every morning to start your day right?", content: "Turn to a neighbor.\n\nShare your morning non-negotiable.\n\nKeep it under 30 seconds." },
  { id: 23, min: 150, max: 1000, category: 'casual', title: "Favorite Seasons", desc: "Which season do you prefer and why?", content: "Turn to a neighbor.\n\nShare your favorite season.\n\nGive one reason why you love it." },
  { id: 24, min: 150, max: 1000, category: 'casual', title: "Coffee or Tea", desc: "Are you a coffee person, a tea person, or neither?", content: "Turn to the person next to you.\n\nShare your preference.\n\nDiscuss your go-to order." },

  // Classroom
  { id: 25, min: 2, max: 1000, category: 'classroom', title: "Best Subject", desc: "What was your favorite subject in school?", content: "Think back to your school days.\n\nShare your favorite subject.\n\nExplain why it interested you." },
  { id: 26, min: 2, max: 1000, category: 'classroom', title: "Memorable Teacher", desc: "Describe a teacher who had a significant impact on you.", content: "Think of a teacher who inspired you.\n\nShare what made them special.\n\nKeep it brief." },
  { id: 27, min: 2, max: 1000, category: 'classroom', title: "Study Hacks", desc: "What is your top tip for retaining information?", content: "Share your best study habit.\n\nExplain how you use it.\n\nSee if others use the same trick." },
  { id: 28, min: 2, max: 1000, category: 'classroom', title: "Group Projects", desc: "Are you a leader or a follower in group projects?", content: "Reflect on your teamwork style.\n\nShare your preferred role.\n\nGive a quick example." },
  { id: 29, min: 2, max: 1000, category: 'classroom', title: "Dream Course", desc: "If you could design a new course, what would it be?", content: "Invent a new, fun subject.\n\nShare the course title.\n\nWhat would students learn?" },
  { id: 30, min: 2, max: 1000, category: 'classroom', title: "Early Bird or Night Owl", desc: "When do you study best?", content: "Share your optimal study hours.\n\nExplain why that time works for you.\n\nFind your study counterpart." },
  { id: 31, min: 2, max: 1000, category: 'classroom', title: "Extracurriculars", desc: "What club or activity were you most involved in?", content: "Think of your after-school activities.\n\nShare your favorite one.\n\nWhat did you learn from it?" },
  { id: 32, min: 2, max: 1000, category: 'classroom', title: "Favorite Book", desc: "What is the best book you were assigned to read?", content: "Share a required reading you actually loved.\n\nExplain what made it engaging.\n\nRecommend it to the group." },
  { id: 33, min: 2, max: 1000, category: 'classroom', title: "Lunchbox Trade", desc: "What was your favorite thing to find in your lunchbox?", content: "Think of your childhood lunches.\n\nShare the best snack you ever traded for.\n\nNostalgia time!" },
  { id: 34, min: 2, max: 1000, category: 'classroom', title: "Field Trips", desc: "Where was your favorite class field trip?", content: "Recall your best school trip.\n\nShare the destination.\n\nWhat was the highlight?" },
  { id: 35, min: 2, max: 1000, category: 'classroom', title: "Learning Style", desc: "Are you a visual, auditory, or kinesthetic learner?", content: "Think about how you grasp concepts.\n\nShare your primary learning style.\n\nGive a quick example." },
  { id: 36, min: 2, max: 1000, category: 'classroom', title: "Future Goals", desc: "What did you want to be when you grew up?", content: "Share your childhood dream job.\n\nDoes it relate to what you do now?\n\nKeep it to 60 seconds." }
];

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  
  if (h > 0) {
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function EventModeToday() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [mode, setMode] = useState<'duration' | 'target'>('duration');

  const [targetDate, setTargetDate] = useState<Date>(() => {
    const d = new Date(); d.setHours(d.getHours() + 1); return d;
  });

  const [durHours, setDurHours] = useState(0);
  const [durMins, setDurMins] = useState(15);
  const [durSecs, setDurSecs] = useState(0);

  const [timeRemaining, setTimeRemaining] = useState(15 * 60);
  const [initialTime, setInitialTime] = useState(15 * 60);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [headingText, setHeadingText] = useState("");

  const [isIcebreakerBoxOpen, setIsIcebreakerBoxOpen] = useState(false);
  const [selectedDeck, setSelectedDeck] = useState<'formal' | 'social' | 'classroom' | null>(null);
  const [activeCardId, setActiveCardId] = useState<number | null>(null);

  const [shuffleIndex, setShuffleIndex] = useState(0);

  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (location.state?.openIcebreaker) {
      setIsIcebreakerBoxOpen(true);
      // Clean up the state so it doesn't trigger again on refresh
      navigate(".", { replace: true, state: {} });
    }
  }, [location.state, navigate]);

  const activeCards = useMemo(() => {
    if (!selectedDeck) return [];
    const cat = selectedDeck === 'formal' ? 'professional' : selectedDeck === 'social' ? 'casual' : 'classroom';
    return ICEBREAKERS.filter(ib => ib.category === cat).slice(shuffleIndex * 3, shuffleIndex * 3 + 3);
  }, [selectedDeck, shuffleIndex]);
  
  const PRESETS = ["Ice-breaker", "Group Discussion", "Individual Task", "Break"];

  const handleReset = () => {
    setIsRunning(false);
    if (mode === 'duration') {
      const total = durHours * 3600 + durMins * 60 + durSecs;
      setTimeRemaining(total); setInitialTime(total);
    } else {
      if (isValid(targetDate)) {
        const total = Math.max(0, differenceInSeconds(targetDate, new Date()));
        setTimeRemaining(total); setInitialTime(total);
      }
    }
  };

  useEffect(() => {
    if (isRunning) return;
    if (mode === 'duration') {
       const total = durHours * 3600 + durMins * 60 + durSecs;
       setTimeRemaining(total); setInitialTime(total);
    } else {
       if (isValid(targetDate)) {
           const total = Math.max(0, differenceInSeconds(targetDate, new Date()));
           setTimeRemaining(total); setInitialTime(total);
       }
    }
  }, [mode, durHours, durMins, durSecs, targetDate]);

  useEffect(() => {
    if (!isRunning) return;
    let endTime: number;
    if (mode === 'target') endTime = targetDate.getTime();
    else endTime = Date.now() + timeRemaining * 1000;

    const interval = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((endTime - now) / 1000));
      setTimeRemaining(remaining);
      if (remaining <= 0) { setIsRunning(false); clearInterval(interval); }
    }, 100);
    return () => clearInterval(interval);
  }, [isRunning, mode, targetDate]);

  const toggleFullscreen = () => setIsFullscreen(!isFullscreen);

  const activeIbObj = useMemo(() => {
    if (!activeCardId) return null;
    return ICEBREAKERS.find(ib => ib.id === activeCardId);
  }, [activeCardId]);

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-[9999] bg-black text-white flex flex-col items-center justify-center">
        <button onClick={toggleFullscreen} className="absolute top-6 right-6 sm:top-8 sm:right-8 p-4 rounded-full hover:bg-white/10 transition-colors text-white/50 hover:text-white group z-50 cursor-pointer">
          <Minimize2 className="w-8 h-8 sm:w-10 sm:h-10 transition-transform group-hover:scale-90" />
        </button>
        {headingText && (
          <div className="text-4xl sm:text-6xl md:text-8xl font-semibold mb-8 sm:mb-12 tracking-tight text-white/90 text-center px-8">
            {headingText}
          </div>
        )}
        <div className="text-[25vw] sm:text-[18vw] font-bold tabular-nums tracking-tighter leading-none px-4 mb-8 sm:mb-12">
          {formatTime(timeRemaining)}
        </div>
        <div className="flex items-center justify-center gap-8">
          <button onClick={handleReset} className="w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-full bg-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/20 transition-all hover:scale-105 cursor-pointer">
            <RotateCcw className="w-6 h-6 sm:w-8 sm:h-8" />
          </button>
          <button onClick={() => setIsRunning(!isRunning)} className="w-20 h-20 sm:w-[96px] sm:h-[96px] rounded-full bg-white flex items-center justify-center text-black shadow-[0_8px_32px_rgba(255,255,255,0.15)] transition-transform hover:scale-105 hover:bg-gray-100 cursor-pointer">
            {isRunning ? <Pause className="w-8 h-8 sm:w-10 sm:h-10 fill-current" /> : <Play className="w-8 h-8 sm:w-10 sm:h-10 fill-current ml-1 sm:ml-2" />}
          </button>
        </div>

        {/* Footer Credit for Fullscreen Mode */}
        <div className="absolute bottom-0 left-0 right-0 w-full flex flex-col justify-end pointer-events-auto z-50" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
          <p className="hidden md:block text-center text-xs font-medium tracking-wide py-1.5 shrink-0 text-white/90 drop-shadow-sm">
            Created with <span className="text-red-500 drop-shadow-md">&#9829;</span> by <a href="https://knowwhatson.com" target="_blank" rel="noopener noreferrer" className="hover:underline font-bold text-white drop-shadow-md">What's On!</a>
          </p>
          <div className="md:hidden">
            <p className="text-center text-[11px] font-medium tracking-wide pt-1.5 pb-0 text-white/90 drop-shadow-sm">
              Created with <span className="text-red-500 drop-shadow-md">&#9829;</span> by <a href="https://knowwhatson.com" target="_blank" rel="noopener noreferrer" className="hover:underline font-bold text-white drop-shadow-md">What's On!</a>
            </p>
            {/* Spacer to match the vertical footprint of the mobile bottom nav in Work Mode */}
            <div className="h-[58px] w-full pointer-events-none" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto custom-scrollbar relative">
      {/* Tab attached to bottom in mobile, top in desktop */}
      <div className="fixed bottom-[4.5rem] md:bottom-auto md:top-[57px] left-1/2 -translate-x-1/2 z-20 transition-all duration-500" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        {/* Mobile Tab */}
        <motion.button 
          onClick={() => setIsIcebreakerBoxOpen(true)} 
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
          className="md:hidden bg-gradient-to-br from-pink-500 via-rose-500 to-pink-600 text-white px-8 pt-4 pb-8 -mb-4 rounded-t-[24px] shadow-[0_-8px_30px_rgba(236,72,153,0.3)] flex items-center gap-3 cursor-pointer font-bold text-base border-t border-white/20"
        >
          <MessageSquareHeart className="w-5 h-5" /> Icebreakers
        </motion.button>
        {/* Desktop Tab */}
        <motion.button 
          onClick={() => setIsIcebreakerBoxOpen(true)} 
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
          className="hidden md:flex bg-gradient-to-br from-pink-500 via-rose-500 to-pink-600 text-white px-8 pb-4 pt-8 -mt-4 rounded-b-[24px] shadow-[0_8px_30px_rgba(236,72,153,0.3)] items-center gap-3 cursor-pointer font-bold text-base border-b border-white/20"
        >
          <MessageSquareHeart className="w-5 h-5" /> Icebreakers
        </motion.button>
      </div>

      <div className="p-4 sm:p-6 md:p-10 pb-20 space-y-12 max-w-6xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-[28px] font-bold text-[#1B1446] dark:text-white tracking-tight">
            Home
          </h1>
          <div className="flex items-center gap-3">
            <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} className="w-11 h-11 rounded-full bg-white dark:bg-white/10 shadow-sm flex items-center justify-center text-[#1B1446]/60 dark:text-white/60 hover:text-[#1B1446] dark:hover:text-white transition-colors cursor-pointer">
              <Settings className="w-[18px] h-[18px]" />
            </button>
            <button onClick={toggleFullscreen} className="w-11 h-11 rounded-full bg-white dark:bg-white/10 shadow-sm flex items-center justify-center text-[#1B1446]/60 dark:text-white/60 hover:text-[#1B1446] dark:hover:text-white transition-colors cursor-pointer">
              <Maximize2 className="w-[18px] h-[18px]" />
            </button>
          </div>
        </div>

        {/* Timer Section */}
        <div className="flex flex-col items-center justify-center relative gap-8 sm:gap-10 pt-4">
          {headingText && (
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-semibold text-[#1B1446] dark:text-white tracking-tight text-center px-4">
              {headingText}
            </h2>
          )}

          <div className="flex justify-center w-full">
            <div className="relative w-[280px] h-[280px] sm:w-[320px] sm:h-[320px] md:w-[380px] md:h-[380px] rounded-full bg-white dark:bg-white/5 shadow-[0_12px_40px_rgba(27,20,70,0.06)] dark:shadow-none flex items-center justify-center overflow-hidden border border-black/5 dark:border-white/10">
              <div className="absolute top-[-4%] left-[-4%] w-[108%] h-[108%] rounded-full border-[1.5px] border-gray-100/60 dark:border-white/5 pointer-events-none" />
              <div className="text-center z-10 flex flex-col items-center">
                <div className="text-[11px] sm:text-[12px] font-bold uppercase tracking-[0.2em] text-[#1B1446]/70 dark:text-white/50 mb-2 sm:mb-3">
                  {mode === 'duration' ? 'Duration' : 'Target Time'}
                </div>
                <div className="text-[4.5rem] sm:text-[5.5rem] md:text-[6.5rem] font-black tabular-nums tracking-tighter text-[#1B1446] dark:text-white leading-none">
                  {formatTime(timeRemaining)}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-6">
            <button onClick={handleReset} className="w-[52px] h-[52px] rounded-full bg-white dark:bg-white/10 flex items-center justify-center shadow-sm text-[#1B1446]/60 dark:text-white/60 hover:text-[#1B1446] dark:hover:text-white transition-transform hover:scale-105 cursor-pointer">
              <RotateCcw className="w-5 h-5" />
            </button>
            <button onClick={() => setIsRunning(!isRunning)} className="w-[72px] h-[72px] rounded-full bg-[#1B1446] dark:bg-white flex items-center justify-center shadow-lg text-white dark:text-[#1B1446] transition-transform hover:scale-105 hover:bg-[#1B1446]/95 cursor-pointer">
              {isRunning ? <Pause className="w-8 h-8 fill-current" /> : <Play className="w-8 h-8 fill-current ml-1" />}
            </button>
          </div>
        </div>

        {/* Icebreaker Peeping Box */}
        <AnimatePresence>
          {isIcebreakerBoxOpen && (
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed inset-0 bg-gradient-to-br from-pink-500 via-rose-500 to-pink-600 z-[100] p-6 sm:p-12 flex flex-col items-center overflow-y-auto"
            >
              <button onClick={() => { setIsIcebreakerBoxOpen(false); setSelectedDeck(null); }} className="absolute top-6 right-6 p-3 rounded-full hover:bg-white/10 text-white/80 hover:text-white transition-colors cursor-pointer z-10">
                <X className="w-8 h-8" />
              </button>

              {!selectedDeck ? (
                <div className="w-full max-w-6xl flex flex-col items-center flex-1 justify-center min-h-0">
                  <h2 className="text-4xl sm:text-5xl font-black text-white mb-12 sm:mb-16 flex items-center gap-4 drop-shadow-sm">
                    <MessageSquareHeart className="w-10 h-10 text-white/80" />
                    Choose a Deck
                  </h2>
                  <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-8 sm:gap-12 w-full px-4">
                    {/* Formal Deck */}
                    <div onClick={() => setSelectedDeck('formal')} className="relative cursor-pointer group w-full max-w-[280px] sm:max-w-[320px]">
                      <div className="absolute inset-0 bg-[#4a2e5d]/40 rounded-[2rem] transform -rotate-6 transition-transform group-hover:-rotate-12" />
                      <div className="absolute inset-0 bg-[#4a2e5d]/60 rounded-[2rem] transform -rotate-3 transition-transform group-hover:-rotate-6" />
                      <div className="relative bg-[#4a2e5d] rounded-[2rem] aspect-[1.25/1] sm:aspect-[3/4] flex flex-col items-center justify-center p-6 border border-white/20 shadow-2xl transition-transform group-hover:-translate-y-4">
                        <h3 className="text-3xl sm:text-4xl font-black text-white mt-4">Formal</h3>
                        <p className="text-white/70 text-sm mt-2 font-medium tracking-widest uppercase mb-8">Professional</p>
                        <div className="absolute bottom-8 opacity-80"><EmbossedLogo /></div>
                      </div>
                    </div>
                    {/* Social Deck */}
                    <div onClick={() => setSelectedDeck('social')} className="relative cursor-pointer group w-full max-w-[280px] sm:max-w-[320px]">
                      <div className="absolute inset-0 bg-[#1e5a48]/40 rounded-[2rem] transform rotate-6 transition-transform group-hover:rotate-12" />
                      <div className="absolute inset-0 bg-[#1e5a48]/60 rounded-[2rem] transform rotate-3 transition-transform group-hover:rotate-6" />
                      <div className="relative bg-[#1e5a48] rounded-[2rem] aspect-[1.25/1] sm:aspect-[3/4] flex flex-col items-center justify-center p-6 border border-white/20 shadow-2xl transition-transform group-hover:-translate-y-4">
                        <h3 className="text-3xl sm:text-4xl font-black text-white mt-4">Social</h3>
                        <p className="text-white/70 text-sm mt-2 font-medium tracking-widest uppercase mb-8">Casual</p>
                        <div className="absolute bottom-8 opacity-80"><EmbossedLogo /></div>
                      </div>
                    </div>
                    {/* Classroom Deck */}
                    <div onClick={() => setSelectedDeck('classroom')} className="relative cursor-pointer group w-full max-w-[280px] sm:max-w-[320px]">
                      <div className="absolute inset-0 bg-[#f6d365]/40 rounded-[2rem] transform -rotate-6 transition-transform group-hover:-rotate-12" />
                      <div className="absolute inset-0 bg-[#f6d365]/60 rounded-[2rem] transform rotate-3 transition-transform group-hover:rotate-6" />
                      <div className="relative bg-[#f6d365] rounded-[2rem] aspect-[1.25/1] sm:aspect-[3/4] flex flex-col items-center justify-center p-6 border border-black/10 shadow-2xl transition-transform group-hover:-translate-y-4">
                        <h3 className="text-3xl sm:text-4xl font-black text-black/80 mt-4">Classroom</h3>
                        <p className="text-black/50 text-sm mt-2 font-medium tracking-widest uppercase mb-8">Educational</p>
                        <div className="absolute bottom-8 opacity-80"><EmbossedLogo isLightBackground={true} /></div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="w-full max-w-5xl flex flex-col items-center">
                  <div className="flex items-center gap-4 mb-8">
                    <button onClick={() => setShuffleIndex(prev => (prev + 1) % 4)} className="p-2 hover:bg-white/10 rounded-full text-white/50 hover:text-white transition-colors cursor-pointer group">
                      <RotateCcw className="w-6 h-6 group-hover:-rotate-180 transition-transform duration-500" />
                    </button>
                    <h2 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-widest">{selectedDeck === 'formal' ? 'Formal' : selectedDeck === 'social' ? 'Social' : 'Classroom'} Deck</h2>
                  </div>
                  
                  <div className="relative w-full max-w-[320px] mx-auto h-[700px] mt-4">
                    <AnimatePresence mode="popLayout">
                      {activeCards.map((ib, idx) => {
                        const isLight = selectedDeck === 'classroom';
                        return (
                          <motion.div
                            key={ib.id}
                            initial={{ opacity: 0, y: -50, scale: 0.95 }}
                            animate={{ opacity: 1, y: idx * 140, scale: 1 }}
                            exit={{ opacity: 0, y: 50, scale: 0.95 }}
                            transition={{ type: "spring", damping: 25, stiffness: 150, delay: idx * 0.1 }}
                            onClick={() => setActiveCardId(ib.id)}
                            className={`absolute top-0 left-0 right-0 cursor-pointer group ${selectedDeck === 'formal' ? 'bg-[#4a2e5d]' : selectedDeck === 'social' ? 'bg-[#1e5a48]' : 'bg-[#f6d365]'} rounded-[2rem] aspect-[3/4] p-6 flex flex-col items-center shadow-[0_-5px_25px_rgba(0,0,0,0.3)] hover:-translate-y-4 transition-transform border ${isLight ? 'border-black/10' : 'border-white/10'} overflow-hidden`}
                            style={{ zIndex: idx }}
                          >
                            <div className={`mt-16 flex w-full justify-center text-center px-2`}>
                              <h4 className={`text-2xl sm:text-[26px] font-black leading-tight ${isLight ? 'text-black/80' : 'text-white'}`}>{ib.title}</h4>
                            </div>
                            <div className="absolute bottom-6 flex flex-col items-center gap-1 w-full opacity-60">
                              <EmbossedLogo isLightBackground={isLight} />
                            </div>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                  
                  <div className="mt-8 mb-4 flex items-center justify-center">
                    <button onClick={() => setSelectedDeck(null)} className="px-6 py-3 rounded-full bg-white/10 hover:bg-white/20 text-white font-semibold transition-colors cursor-pointer text-sm">
                      Back to Decks
                    </button>
                  </div>
                </div>
              )}

              {/* Branding Footer */}
              <div className="mt-auto pt-8 pb-4 sm:pb-0 w-full flex justify-center shrink-0">
                <p className="text-center text-[11px] sm:text-xs font-medium tracking-wide text-white/90 drop-shadow-sm">
                  Created with <span className="text-white drop-shadow-md">&#9829;</span> by <a href="https://knowwhatson.com" target="_blank" rel="noopener noreferrer" className="hover:underline text-white font-bold drop-shadow-md">What's On!</a>
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Full Screen Active Card */}
        <AnimatePresence>
          {activeCardId && activeIbObj && (
            <div className="fixed inset-0 z-[10000] perspective-[2000px] flex items-center justify-center p-6 sm:p-12">
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }} 
                className="absolute inset-0 bg-slate-900/90 backdrop-blur-md" 
                onClick={() => setActiveCardId(null)} 
              />
              
              <button onClick={() => setActiveCardId(null)} className="absolute top-6 right-6 sm:top-8 sm:right-8 z-[10010] p-4 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-colors cursor-pointer">
                <X className="w-8 h-8" />
              </button>

              <motion.div
                initial={{ rotateY: -180, scale: 0.8, opacity: 0 }}
                animate={{ rotateY: 0, scale: 1, opacity: 1 }}
                exit={{ rotateY: 180, scale: 0.8, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 150 }}
                style={{ transformStyle: "preserve-3d" }}
                className={`relative z-[10005] w-full max-w-4xl aspect-[3/4] sm:aspect-auto sm:min-h-[600px] rounded-[3rem] shadow-2xl flex flex-col items-center justify-center p-12 sm:p-20 text-center border ${activeIbObj.category === 'classroom' ? 'bg-[#f6d365] border-black/10' : activeIbObj.category === 'professional' ? 'bg-[#4a2e5d] border-white/20' : 'bg-[#1e5a48] border-white/20'}`}
              >
                <div className={`absolute top-10 ${activeIbObj.category === 'classroom' ? 'text-black/40' : 'text-white/40'} text-sm font-black tracking-widest uppercase flex flex-col items-center gap-3`}>
                  {activeIbObj.category === 'professional' ? 'Formal' : activeIbObj.category === 'casual' ? 'Social' : 'Classroom'}
                </div>

                <h1 className={`text-4xl sm:text-6xl md:text-7xl font-black ${activeIbObj.category === 'classroom' ? 'text-black/80' : 'text-white'} mb-8 tracking-tight leading-tight mt-12 drop-shadow-md`}>
                  {activeIbObj.title}
                </h1>
                <p className={`text-xl sm:text-3xl ${activeIbObj.category === 'classroom' ? 'text-black/70' : 'text-white/90'} font-medium leading-relaxed whitespace-pre-wrap drop-shadow-sm max-w-3xl`}>
                  {activeIbObj.content}
                </p>

                <div className="absolute bottom-10 opacity-80">
                  <EmbossedLogo isLightBackground={activeIbObj.category === 'classroom'} />
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Settings Modal/Panel */}
        <AnimatePresence>
          {isSettingsOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="fixed inset-0 z-50 flex items-center justify-center px-4"
            >
              <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setIsSettingsOpen(false)} />
              
              <div className="relative bg-white dark:bg-[#1A1A24] rounded-3xl p-6 shadow-2xl w-full max-w-sm border border-black/5 dark:border-white/10">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="font-semibold text-lg flex items-center gap-2 text-[#1B1446] dark:text-white">
                    <Settings className="w-5 h-5 text-indigo-500" /> Timer Settings
                  </h3>
                  <button onClick={() => setIsSettingsOpen(false)} className="p-2 rounded-full bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 transition-colors">
                    <X className="w-4 h-4 text-slate-500 dark:text-white" />
                  </button>
                </div>
                
                <div className="space-y-6">
                  <div className="space-y-3">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Heading Text</label>
                    <input 
                      type="text" placeholder="e.g. Ice-breaker" value={headingText}
                      onChange={(e) => setHeadingText(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl text-sm font-medium bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 text-[#1B1446] dark:text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                    />
                    <div className="flex flex-wrap gap-2 pt-1">
                      {PRESETS.map(preset => (
                        <button key={preset} onClick={() => setHeadingText(preset)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/20 transition-colors">
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex p-1 rounded-xl bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-white/5">
                    <button onClick={() => setMode('duration')} className={`flex-1 text-[13px] py-2 rounded-lg font-semibold transition-all ${mode === 'duration' ? 'bg-white dark:bg-white/10 text-indigo-600 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                      Duration
                    </button>
                    <button onClick={() => setMode('target')} className={`flex-1 text-[13px] py-2 rounded-lg font-semibold transition-all ${mode === 'target' ? 'bg-white dark:bg-white/10 text-indigo-600 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                      Target Time
                    </button>
                  </div>

                  {mode === 'target' ? (
                    <div>
                      <input 
                        type="datetime-local"
                        value={isValid(targetDate) ? format(targetDate, "yyyy-MM-dd'T'HH:mm") : ""}
                        onChange={(e) => setTargetDate(new Date(e.target.value))}
                        className="w-full px-4 py-3 rounded-xl text-sm font-medium bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 text-[#1B1446] dark:text-white outline-none focus:border-indigo-500 transition-all"
                      />
                    </div>
                  ) : (
                    <div className="flex gap-3">
                      <div className="flex-1 relative">
                        <input type="number" min="0" value={durHours} onChange={(e) => setDurHours(Math.max(0, parseInt(e.target.value) || 0))} className="w-full px-2 py-3 rounded-xl text-center text-lg font-bold bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 text-[#1B1446] dark:text-white outline-none focus:border-indigo-500 transition-all" />
                        <div className="text-[10px] font-bold text-center mt-2 uppercase tracking-widest text-slate-400">Hours</div>
                      </div>
                      <div className="flex-1 relative">
                        <input type="number" min="0" max="59" value={durMins} onChange={(e) => setDurMins(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))} className="w-full px-2 py-3 rounded-xl text-center text-lg font-bold bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 text-[#1B1446] dark:text-white outline-none focus:border-indigo-500 transition-all" />
                        <div className="text-[10px] font-bold text-center mt-2 uppercase tracking-widest text-slate-400">Mins</div>
                      </div>
                      <div className="flex-1 relative">
                        <input type="number" min="0" max="59" value={durSecs} onChange={(e) => setDurSecs(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))} className="w-full px-2 py-3 rounded-xl text-center text-lg font-bold bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 text-[#1B1446] dark:text-white outline-none focus:border-indigo-500 transition-all" />
                        <div className="text-[10px] font-bold text-center mt-2 uppercase tracking-widest text-slate-400">Secs</div>
                      </div>
                    </div>
                  )}

                  <div className="pt-4">
                    <button onClick={() => setIsSettingsOpen(false)} className="w-full py-3.5 rounded-xl text-[15px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-sm">
                      Done
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}