import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import * as kv from "../utils/kv";
import { Button } from "../components/ui/button";
import { ThumbsUp, ThumbsDown, Hand } from "lucide-react";
import { Assessment } from "../types";
import { slugMatch } from "../utils/urlHelpers";

export default function AudienceVote() {
  const { year, term, courseCode, name: nameSlug } = useParams();
  const navigate = useNavigate();
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasVoted, setHasVoted] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!year || !term || !courseCode || !nameSlug) return;
      try {
        const all = (await kv.getByPrefix("CHATGPT_assessments_")) as Assessment[];
        const match = all.find(
          (a) =>
            (a.year || "") === decodeURIComponent(year) &&
            (a.term || "") === decodeURIComponent(term) &&
            (a.courseCode || a.courseId || "") === decodeURIComponent(courseCode) &&
            slugMatch(a.title, nameSlug)
        );
        setAssessment(match || null);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [year, term, courseCode, nameSlug]);

  const castVote = async (type: 'pro' | 'con' | 'neutral') => {
    if (!assessment) return;
    try {
      const votesKey = `CHATGPT_audience_votes_${assessment.id}`;
      const currentVotes = (await kv.get(votesKey)) || { pro: 0, con: 0, neutral: 0 };
      
      // We don't have a specific student login right now to track unique voters perfectly
      // without auth, so we'll just increment it
      if (hasVoted) {
        // Remove previous vote if they are changing it
        if (currentVotes[hasVoted] > 0) currentVotes[hasVoted]--;
      }
      
      currentVotes[type]++;
      
      await kv.set(votesKey, currentVotes);
      setHasVoted(type);
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return <div className="flex h-screen items-center justify-center bg-black text-white">Loading...</div>;
  }

  if (!assessment) {
    return (
      <div className="flex flex-col h-screen items-center justify-center bg-black text-white">
        <p>Session not found.</p>
        <Button variant="link" onClick={() => navigate("/courses")} className="text-[#0a84ff]">Go Home</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-black text-white p-6 font-sans">
      <header className="mb-8 text-center">
        <div className="inline-block px-3 py-1 mb-4 rounded-full bg-red-500/20 text-red-500 text-xs font-bold tracking-widest uppercase border border-red-500/30">
          <span className="w-2 h-2 rounded-full bg-red-500 inline-block mr-2 animate-pulse"></span> 
          Live Session
        </div>
        <h1 className="text-2xl font-bold">{assessment.title}</h1>
        <p className="text-gray-400 mt-2">Cast your vote as an audience member</p>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center gap-6 max-w-sm mx-auto w-full">
        <Button 
          onClick={() => castVote('pro')}
          className={`w-full h-24 text-xl font-bold rounded-2xl flex items-center justify-center gap-4 transition-all ${hasVoted === 'pro' ? 'bg-green-600 hover:bg-green-700 ring-4 ring-green-600/30' : 'bg-green-900/40 text-green-400 border border-green-800 hover:bg-green-900/60'}`}
        >
          <ThumbsUp className="h-8 w-8" /> Pro / Agree
        </Button>
        
        <Button 
          onClick={() => castVote('con')}
          className={`w-full h-24 text-xl font-bold rounded-2xl flex items-center justify-center gap-4 transition-all ${hasVoted === 'con' ? 'bg-red-600 hover:bg-red-700 ring-4 ring-red-600/30' : 'bg-red-900/40 text-red-400 border border-red-800 hover:bg-red-900/60'}`}
        >
          <ThumbsDown className="h-8 w-8" /> Con / Disagree
        </Button>
        
        <Button 
          onClick={() => castVote('neutral')}
          className={`w-full h-24 text-xl font-bold rounded-2xl flex items-center justify-center gap-4 transition-all ${hasVoted === 'neutral' ? 'bg-gray-600 hover:bg-gray-700 ring-4 ring-gray-600/30' : 'bg-gray-800/60 text-gray-300 border border-gray-700 hover:bg-gray-800'}`}
        >
          <Hand className="h-8 w-8" /> Question / Neutral
        </Button>
      </div>
      
      {hasVoted && (
        <div className="mt-8 text-center text-[#0a84ff] font-medium animate-in fade-in slide-in-from-bottom-4">
          Vote recorded! You can change it at any time.
        </div>
      )}
    </div>
  );
}