/**
 * Shared hook that resolves an Assessment from human-readable URL params
 * (year / term / courseCode / name) instead of a UUID.
 */
import { useState, useEffect } from "react";
import { useParams } from "react-router";
import * as kv from "../utils/kv";
import { Assessment } from "../types";
import { slugMatch } from "../utils/urlHelpers";

export interface ResolvedAssessment {
  assessment: (Assessment & { joinCode?: string }) | null;
  id: string | null; // the KV UUID key
  loading: boolean;
}

export function useResolveAssessment(): ResolvedAssessment {
  const { year, term, courseCode, name } = useParams<{
    year: string;
    term: string;
    courseCode: string;
    name: string;
  }>();

  const [assessment, setAssessment] = useState<(Assessment & { joinCode?: string }) | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function resolve() {
      if (!year || !term || !courseCode || !name) {
        setLoading(false);
        return;
      }
      try {
        const all = (await kv.getByPrefix("CHATGPT_assessments_")) as (Assessment & { joinCode?: string })[];
        const match = all.find(
          (a) =>
            (a.year || "") === decodeURIComponent(year) &&
            (a.term || "") === decodeURIComponent(term) &&
            (a.courseCode || a.courseId || "") === decodeURIComponent(courseCode) &&
            slugMatch(a.title, name)
        );
        if (!cancelled) setAssessment(match || null);
      } catch (err) {
        console.error("Failed to resolve assessment from URL:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    resolve();
    return () => { cancelled = true; };
  }, [year, term, courseCode, name]);

  return { assessment, id: assessment?.id ?? null, loading };
}
