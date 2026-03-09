import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import * as kv from "../utils/kv";
import { Assessment, Session } from "../types";
import { Card, CardContent } from "../components/ui/card";
import { ChevronRight, Search, Play, FileText, CheckCircle2 } from "lucide-react";
import { Input } from "../components/ui/input";
import { LoadSplash } from "../components/LoadSplash";

export default function ResultsTab() {
  const navigate = useNavigate();
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [completedSessions, setCompletedSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [assessmentData, sessionData] = await Promise.all([
          kv.getByPrefix("CHATGPT_assessments_"),
          kv.getByPrefix("CHATGPT_session_"),
        ]);
        
        const allSessions = (sessionData || []) as Session[];
        const completed = allSessions.filter(s => s.status === "completed");
        setCompletedSessions(completed);

        // Only show assessments that have completed sessions
        const allAssessments = (assessmentData || []) as Assessment[];
        const assessmentIdsWithResults = new Set(completed.map(s => s.assessmentId));
        setAssessments(allAssessments.filter(a => assessmentIdsWithResults.has(a.id)));
      } catch (err) {
        console.error("Failed to load results:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const filtered = assessments.filter(a =>
    a.title.toLowerCase().includes(search.toLowerCase()) ||
    (a.courseCode || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-1 min-h-0 flex-col bg-[#f7f7f8]">
      <div className="shrink-0 px-4 pt-4 pb-2 space-y-4 bg-[#f7f7f8]">
        <div className="flex items-center justify-between mt-2">
          <h1 className="text-3xl font-bold tracking-tight">Results</h1>
        </div>
        <p className="text-sm text-gray-500">
          View completed assessments and student submissions.
        </p>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search assessments..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-9 rounded-[10px] bg-[#767680]/[0.12] pl-9 border-none shadow-none text-[17px] focus-visible:ring-0 placeholder:text-[17px] placeholder:text-[#3C3C43]/60 w-full"
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-6">
        <div className="space-y-3 pt-2">
          {loading ? (
            <div className="fixed inset-0 z-40 flex items-center justify-center">
              <LoadSplash />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-gray-500 bg-[#767680]/[0.04] rounded-2xl">
              <div className="h-12 w-12 rounded-xl bg-[#767680]/[0.08] flex items-center justify-center mb-3">
                <FileText className="h-6 w-6 text-gray-400" />
              </div>
              <p className="text-base font-semibold text-gray-900">No results found</p>
              <p className="text-sm mt-1 text-gray-500">End an active session to see results here.</p>
            </div>
          ) : (
            filtered.map(assessment => {
              const sessions = completedSessions.filter(s => s.assessmentId === assessment.id);
              return (
                <Card
                  key={assessment.id}
                  className="border-0 shadow-sm rounded-2xl bg-white hover:shadow-md transition-all cursor-pointer active:scale-[0.98]"
                  onClick={() => navigate(`/results/${assessment.id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-base tracking-tight truncate">{assessment.title}</p>
                        <p className="text-sm text-gray-500 mt-0.5">
                          {assessment.courseCode || assessment.courseId}
                        </p>
                        <div className="flex items-center flex-wrap gap-1.5 mt-2.5">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-[#34c759] text-white">
                            <CheckCircle2 className="h-3 w-3" />
                            {sessions.length} Completed Session{sessions.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-gray-400 shrink-0 ml-3 self-center" />
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}