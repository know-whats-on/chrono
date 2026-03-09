import React, { useState, useEffect } from "react";
import { useParams } from "react-router";
import { Mic, Clock, Users, Trophy, Play, Pause, RefreshCcw, Hand, MessageCircle } from "lucide-react";
import { Card, CardContent } from "../components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar";
import { Progress } from "../components/ui/progress";
import * as kv from "../utils/kv";
import { Assessment, Student } from "../types";

export default function PublicDisplay() {
  const { sessionId } = useParams();
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [activeSpeaker, setActiveSpeaker] = useState<Student | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(300); // 5 minutes default
  const [isRunning, setIsRunning] = useState(false);
  const [audienceVotes, setAudienceVotes] = useState({ pro: 0, con: 0, neutral: 0 });
  
  // Real-time syncing via polling
  useEffect(() => {
    async function load() {
      if (!sessionId) return;
      try {
        const data = await kv.get(`CHATGPT_assessments_${sessionId}`);
        if (data) {
          setAssessment(data);
          if (data.students && data.students.length > 0) {
            setActiveSpeaker(data.students[0]);
          }
        }
      } catch (err) {
        console.error(err);
      }
    }
    load();
    
    // Real-time audience voting polling
    async function fetchVotes() {
      if (!sessionId) return;
      try {
        const votes = await kv.get(`CHATGPT_audience_votes_${sessionId}`);
        if (votes) {
          setAudienceVotes(votes);
        }
      } catch (err) {
        console.error(err);
      }
    }
    fetchVotes();
    
    const voteInterval = setInterval(() => {
      fetchVotes();
    }, 2000); // Poll every 2 seconds for snappier updates
    
    return () => clearInterval(voteInterval);
  }, [sessionId]);

  // Timer logic
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRunning && timeRemaining > 0) {
      interval = setInterval(() => {
        setTimeRemaining(prev => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRunning, timeRemaining]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getInitials = (first: string, last: string) => `${first?.charAt(0) || ''}${last?.charAt(0) || ''}`;

  const totalVotes = audienceVotes.pro + audienceVotes.con + audienceVotes.neutral;
  const proPct = Math.round((audienceVotes.pro / totalVotes) * 100) || 0;
  const conPct = Math.round((audienceVotes.con / totalVotes) * 100) || 0;

  if (!assessment) return (
    <div className="flex items-center justify-center min-h-screen bg-black text-white">
      <div className="animate-pulse flex flex-col items-center gap-4">
        <Mic className="h-12 w-12 text-[#0a84ff]" />
        <h2 className="text-2xl font-bold tracking-widest">CONNECTING TO SESSION...</h2>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col min-h-screen bg-black text-white p-8 font-sans overflow-hidden">
      {/* Header */}
      <header className="flex justify-between items-center mb-12 border-b border-gray-800 pb-6">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-[#0a84ff] flex items-center justify-center shadow-[0_0_30px_rgba(10,132,255,0.4)]">
            <Mic className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white">{assessment.title}</h1>
            <p className="text-gray-400 font-medium tracking-wide flex items-center gap-2 uppercase text-sm mt-1">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span> LIVE SESSION
            </p>
          </div>
        </div>
        <div className="flex gap-4 items-center bg-gray-900 px-6 py-3 rounded-2xl border border-gray-800">
          <Users className="h-6 w-6 text-[#0a84ff]" />
          <div>
            <p className="text-xs text-gray-400 font-bold tracking-widest uppercase">Audience</p>
            <p className="text-xl font-bold">{totalVotes}</p>
          </div>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-12 gap-8">
        {/* Main Speaker View */}
        <div className="col-span-8 flex flex-col gap-8">
          <Card className="flex-1 bg-gradient-to-br from-gray-900 to-black border-gray-800 rounded-[2rem] overflow-hidden shadow-2xl relative">
            <div className="absolute top-0 right-0 p-8">
              <div className="bg-white/10 backdrop-blur-md px-6 py-3 rounded-full border border-white/20 flex items-center gap-3 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
                <Clock className={`h-6 w-6 ${timeRemaining < 60 ? 'text-red-500 animate-pulse' : 'text-white'}`} />
                <span className={`text-4xl font-mono font-bold tracking-tight ${timeRemaining < 60 ? 'text-red-500' : 'text-white'}`}>
                  {formatTime(timeRemaining)}
                </span>
              </div>
            </div>
            
            <CardContent className="h-full flex flex-col items-center justify-center p-12 relative z-10">
              {activeSpeaker ? (
                <>
                  <div className="relative group">
                    <div className="absolute inset-0 bg-[#0a84ff] blur-[100px] opacity-20 rounded-full"></div>
                    <Avatar className="h-64 w-64 border-4 border-gray-800 shadow-2xl relative z-10 transition-transform duration-500 hover:scale-105">
                      <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${activeSpeaker.id}&backgroundColor=0a84ff`} />
                      <AvatarFallback className="bg-gray-800 text-6xl font-bold text-white">
                        {getInitials(activeSpeaker.firstName, activeSpeaker.lastName)}
                      </AvatarFallback>
                    </Avatar>
                    
                    {/* Audio wave animation */}
                    <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-1.5 h-12">
                      {[...Array(9)].map((_, i) => (
                        <div 
                          key={i} 
                          className="w-2 bg-[#0a84ff] rounded-full"
                          style={{
                            height: isRunning ? `${Math.max(20, Math.random() * 100)}%` : '20%',
                            transition: 'height 0.2s ease-in-out'
                          }}
                        />
                      ))}
                    </div>
                  </div>
                  
                  <div className="mt-16 text-center">
                    <h2 className="text-6xl font-extrabold tracking-tight mb-4 text-white">
                      {activeSpeaker.firstName} {activeSpeaker.lastName}
                    </h2>
                    <div className="inline-flex items-center gap-3 px-6 py-2 rounded-full bg-gray-800/80 border border-gray-700">
                      <span className="w-3 h-3 rounded-full bg-[#0a84ff]"></span>
                      <p className="text-xl font-semibold text-gray-300 tracking-wide uppercase">
                        {activeSpeaker.groupId || "Active Speaker"}
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center text-gray-500">
                  <Mic className="h-24 w-24 mx-auto mb-6 opacity-20" />
                  <p className="text-2xl font-medium">Waiting for speaker...</p>
                </div>
              )}
            </CardContent>
          </Card>
          
          {/* Debug/Control panel for demonstration */}
          <div className="flex gap-4 justify-center items-center opacity-30 hover:opacity-100 transition-opacity">
            <button onClick={() => setIsRunning(!isRunning)} className="p-4 rounded-full bg-gray-800 text-white hover:bg-gray-700 transition">
              {isRunning ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
            </button>
            <button onClick={() => setTimeRemaining(300)} className="p-4 rounded-full bg-gray-800 text-white hover:bg-gray-700 transition">
              <RefreshCcw className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Sidebar */}
        <div className="col-span-4 flex flex-col gap-8">
          {/* Real-time Voting */}
          <Card className="bg-gray-900 border-gray-800 rounded-[2rem] overflow-hidden">
            <div className="bg-gray-800/50 p-6 border-b border-gray-800 flex items-center gap-3">
              <Trophy className="h-6 w-6 text-yellow-500" />
              <h3 className="text-xl font-bold uppercase tracking-widest">Live Audience</h3>
            </div>
            <CardContent className="p-8 space-y-8">
              <div className="space-y-3">
                <div className="flex justify-between items-end">
                  <p className="text-lg font-bold text-green-400">AGREE</p>
                  <p className="text-3xl font-black">{proPct}%</p>
                </div>
                <Progress value={proPct} className="h-4 bg-gray-800" indicatorClassName="bg-green-500" />
              </div>
              
              <div className="space-y-3">
                <div className="flex justify-between items-end">
                  <p className="text-lg font-bold text-red-400">DISAGREE</p>
                  <p className="text-3xl font-black">{conPct}%</p>
                </div>
                <Progress value={conPct} className="h-4 bg-gray-800" indicatorClassName="bg-red-500" />
              </div>
              
              <div className="pt-6 border-t border-gray-800">
                <p className="text-center text-gray-500 text-sm font-medium tracking-widest uppercase mb-4">Join at menti.com • Code: 4859 2931</p>
                <div className="flex justify-center gap-4">
                  <div className="bg-gray-800 px-6 py-4 rounded-xl flex flex-col items-center gap-2">
                    <Hand className="h-6 w-6 text-gray-400" />
                    <span className="font-bold text-lg">{audienceVotes.neutral}</span>
                    <span className="text-xs text-gray-500 uppercase font-bold">Questions</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Up Next */}
          <Card className="bg-gray-900 border-gray-800 rounded-[2rem] overflow-hidden flex-1 flex flex-col">
            <div className="bg-gray-800/50 p-6 border-b border-gray-800 flex items-center gap-3">
              <MessageCircle className="h-6 w-6 text-purple-500" />
              <h3 className="text-xl font-bold uppercase tracking-widest">Up Next</h3>
            </div>
            <CardContent className="p-0 flex-1 overflow-y-auto custom-scrollbar">
              <div className="divide-y divide-gray-800">
                {assessment.students?.slice(1, 4).map((student, idx) => (
                  <div key={student.id} className="p-6 flex items-center gap-4 hover:bg-gray-800/30 transition-colors">
                    <div className="h-10 w-10 rounded-full bg-gray-800 flex items-center justify-center font-bold text-gray-400 shrink-0">
                      {idx + 1}
                    </div>
                    <Avatar className="h-14 w-14 border border-gray-700 shrink-0">
                      <AvatarFallback className="bg-gray-800 text-lg font-bold text-gray-300">
                        {getInitials(student.firstName, student.lastName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="font-bold text-lg truncate">{student.firstName} {student.lastName}</p>
                      <p className="text-sm text-gray-500 uppercase tracking-wider font-semibold truncate">{student.groupId || 'Speaker'}</p>
                    </div>
                  </div>
                ))}
                {(!assessment.students || assessment.students.length <= 1) && (
                  <div className="p-8 text-center text-gray-500 font-medium">
                    No other speakers queued.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
