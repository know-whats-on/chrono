import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import { Button } from "../components/ui/button";
import { CheckCircle2, Share2, ExternalLink, Play } from "lucide-react";
import * as kv from "../utils/kv";
import { Assessment } from "../types";
import { toast } from "sonner";
import { LoadSplash } from "../components/LoadSplash";
import { slugMatch, buildAssessmentUrl } from "../utils/urlHelpers";

export default function AssessmentShare() {
  const { year, term, courseCode, name: nameSlug } = useParams();
  const navigate = useNavigate();
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [loading, setLoading] = useState(true);

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
        console.error("Failed to load assessment:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [year, term, courseCode, nameSlug]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#f7f7f8]">
        <LoadSplash />
      </div>
    );
  }

  if (!assessment) {
    return (
      <div className="flex flex-1 min-h-0 flex-col items-center justify-center p-8 bg-[#f7f7f8]">
        <p className="text-gray-500">Assessment not found.</p>
        <Button variant="link" onClick={() => navigate("/assessments")}>Go back</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col bg-[#f7f7f8]">
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col items-center px-6 pt-8 pb-6">
          <div className="w-16 h-16 rounded-full bg-[#34c759]/10 flex items-center justify-center mb-4">
            <CheckCircle2 className="h-8 w-8 text-[#34c759]" />
          </div>
          <h1 className="text-2xl font-bold text-center">Assessment Created!</h1>
          <p className="text-sm text-gray-500 mt-1 text-center">
            Your assessment is ready. Go to the Engage tab to start a session.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
            {assessment.courseCode && (
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-[#ff9f0a] text-white">
                {assessment.courseCode}
              </span>
            )}
            {assessment.term && (
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-[#34c759] text-white">
                Term {assessment.term}
              </span>
            )}
            {assessment.year && (
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-[#0a84ff] text-white">
                {assessment.year}
              </span>
            )}
          </div>

          <div className="w-full mt-4 bg-white rounded-2xl p-4 shadow-sm text-center py-8">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Assessment</p>
            <p className="text-base font-semibold text-[#1d1d1f]">{assessment.title}</p>
          </div>
        </div>
      </div>

      <div className="p-6 pt-4 space-y-3 bg-[#f7f7f8]">
        <Button
          className="w-full text-base h-12 rounded-xl bg-[#0a84ff] hover:bg-[#0a84ff]/90"
          onClick={() => navigate("/engage")}
        >
          <Play className="mr-2 h-4 w-4 fill-white" />
          Go to Engage
        </Button>
        <Button
          variant="outline"
          className="w-full text-base h-12 rounded-xl bg-white border-none shadow-sm"
          onClick={() => navigate(buildAssessmentUrl(assessment))}
        >
          <ExternalLink className="mr-2 h-4 w-4" />
          View Details
        </Button>
      </div>
    </div>
  );
}