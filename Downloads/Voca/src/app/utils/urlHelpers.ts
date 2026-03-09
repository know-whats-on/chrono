/**
 * URL helpers for human-readable, slug-based routing.
 *
 * Patterns:
 *   /courses/:year/:term/:courseCode
 *   /assessments/:year/:term/:courseCode/:name
 *   /rubrics/:year/:term/:courseCode/:name
 *   /students/:studentId
 */

/** Turn a display name into a URL-safe segment (spaces → hyphens) */
export function slugify(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9\-_.~]/g, (c) => encodeURIComponent(c));
}

/** Normalise a slug or original text for comparison */
function normalise(s: string): string {
  return decodeURIComponent(s).toLowerCase().replace(/[-\s_]+/g, "");
}

/** Case-insensitive match that treats hyphens/spaces/underscores as equivalent */
export function slugMatch(stored: string, fromUrl: string): boolean {
  return normalise(stored) === normalise(fromUrl);
}

/* ── URL builders ─────────────────────────────────────── */

export function buildCourseUrl(c: { year: string; term: string; code: string }): string {
  return `/courses/${enc(c.year)}/${enc(c.term)}/${enc(c.code)}`;
}

export function buildAssessmentUrl(a: {
  year?: string;
  term?: string;
  courseCode?: string;
  courseId?: string;
  title: string;
}): string {
  const code = a.courseCode || a.courseId || "_";
  return `/assessments/${enc(a.year || "_")}/${enc(a.term || "_")}/${enc(code)}/${slugify(a.title)}`;
}

export function buildRubricUrl(r: {
  year: string;
  term: string;
  courseCode?: string;
  courseName?: string;
  name: string;
}): string {
  const code = r.courseCode || r.courseName || "_";
  return `/rubrics/${enc(r.year || "_")}/${enc(r.term || "_")}/${enc(code)}/${slugify(r.name)}`;
}

export function buildStudentUrl(s: { studentNumber: string }): string {
  return `/students/${enc(s.studentNumber)}`;
}

/* ── internal ─────────────────────────────────────────── */
function enc(v: string): string {
  return encodeURIComponent(v);
}
