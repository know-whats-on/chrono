export interface DebateRound {
  id: string;
  name: string;
  speakingTeam: "for" | "against" | "both";
  timeLimit: number; // in seconds
}

export interface DebateTeam {
  name: "for" | "against";
  studentIds: string[];
}

export interface DebateConfig {
  topic: string;
  teamSizeLimit: number;
  rounds: DebateRound[];
  teams: DebateTeam[];
}

export interface Assessment {
  id: string;
  title: string;
  courseId: string;
  courseCode?: string;
  courseName?: string;
  date: string;
  type: string; // e.g. "presentation", "debate-general", "debate-business", etc.
  term?: string;
  year?: string;
  status: "draft" | "active" | "completed";
  students: Student[];
  rubric: RubricItem[];
  linkedRubricId?: string | null;
  debateConfig?: DebateConfig;
}

export interface GradeDescriptors {
  highDistinction: string;
  distinction: string;
  credit: string;
  pass: string;
  fail: string;
}

export interface RubricMetric {
  id: string;
  name: string;
  weight: number;
  grades: GradeDescriptors;
}

export interface SavedRubric {
  id: string;
  name: string;
  assessmentName?: string; // backward compat
  courseName: string;
  format: string;
  year: string;
  term: string;
  metrics: RubricMetric[];
  items: RubricItem[]; // backward compat
  linkedAssessmentId?: string | null;
  updatedAt: string;
}

export interface Student {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  studentNumber: string;
  groupId?: string;
  tutorialWorkshop?: string;
  courseId?: string;
}

export interface Course {
  id: string;
  code: string;
  name: string;
  term: string;
  year: string;
  school?: string;
  campus?: string;
  studentsCount?: number;
}

export interface RubricItem {
  id: string;
  label: string;
  description: string;
  maxScore: number;
  weight: number;
}

export interface Grade {
  assessmentId: string;
  studentId: string;
  scores: Record<string, number>; // rubricItemId -> score
  totalScore: number;
  feedback: string;
  gradedAt: string;
  gradedBy: string;
}

export interface TranscriptSegment {
  id: string;
  text: string;
  speaker: string;
  startTime: number;
  endTime: number;
  aiSuggestedRubricItemId?: string;
  aiSuggestedScore?: number;
  confidenceScore?: number;
}

export const GRADE_CATEGORY_KEYS = ["highDistinction", "distinction", "credit", "pass", "fail"] as const;
export type GradeCategory = typeof GRADE_CATEGORY_KEYS[number];

export const GRADE_CATEGORY_LABELS: Record<GradeCategory, string> = {
  highDistinction: "High Distinction",
  distinction: "Distinction",
  credit: "Credit",
  pass: "Pass",
  fail: "Fail",
};

export const GRADE_CATEGORY_SHORT: Record<GradeCategory, string> = {
  highDistinction: "HD",
  distinction: "D",
  credit: "C",
  pass: "P",
  fail: "F",
};

export const GRADE_CATEGORY_COLORS: Record<GradeCategory, string> = {
  highDistinction: "#0a84ff",
  distinction: "#34c759",
  credit: "#ff9f0a",
  pass: "#af52de",
  fail: "#ff3b30",
};

/* ─── Engage / Session types ─── */
export interface DebateState {
  currentRoundIndex: number;
  roundStatus: "not_started" | "in_progress" | "completed";
  timeRemaining: number; // in seconds
  votesFor: number;
  votesAgainst: number;
  audienceCount: number;
}

export interface Session {
  id: string;
  assessmentId: string;
  assessmentTitle: string;
  courseCode: string;
  type: "individual" | "group" | "debate";
  status: "active" | "paused" | "completed";
  joinCode: string;
  createdAt: string;
  completedAt?: string;
  debateState?: DebateState;
}

export interface TranscriptChunk {
  id: string;
  sessionId: string;
  studentId: string;
  studentName: string;
  groupId?: string;
  text: string;
  timestamp: number;
  isFinal: boolean;
}

/* ─── Voca Semantic Engine types ─── */
export interface PhraseAnalysis {
  phrase: string;
  rubric_id: string;
  color: string;
  dimension: string;
  justification: string;
}

export interface SentenceAnalysis {
  sentence_id: string;
  text: string;
  analysis: PhraseAnalysis[];
}

/** Determine if an assessment format is group-based */
export function isGroupAssessment(type: string): boolean {
  const lower = type.toLowerCase();
  return lower.includes("group") || lower.includes("debate") || lower.includes("mock-trial") || lower.includes("moot-court") || lower.includes("panel");
}