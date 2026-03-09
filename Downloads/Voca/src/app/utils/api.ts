import { projectId, publicAnonKey } from "../../../utils/supabase/info";
import { Session, TranscriptChunk, SentenceAnalysis } from "../types";

const BASE = `https://${projectId}.supabase.co/functions/v1/make-server-09a7e7d0`;

const headers = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${publicAnonKey}`,
});

/* ─── Sessions ─── */
export async function createSession(session: Session): Promise<Session> {
  const res = await fetch(`${BASE}/sessions`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ session }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to create session");
  }
  const data = await res.json();
  return data.session;
}

export async function getSession(id: string): Promise<Session> {
  const res = await fetch(`${BASE}/sessions/${encodeURIComponent(id)}`, {
    headers: headers(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error(`[api.getSession] Failed for id "${id}": ${res.status}`, err);
    throw new Error(err.error || `Session not found (${res.status})`);
  }
  const data = await res.json();
  return data.session;
}

export async function updateSession(id: string, updates: Partial<Session>): Promise<Session> {
  const res = await fetch(`${BASE}/sessions/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to update session");
  }
  const data = await res.json();
  return data.session;
}

export async function validateStudent(
  sessionId: string,
  studentNumber: string,
  groupId?: string
): Promise<{ valid: boolean; student?: any; error?: string; alreadySubmitted?: boolean }> {
  const res = await fetch(`${BASE}/sessions/${encodeURIComponent(sessionId)}/validate`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ studentNumber, groupId }),
  });
  const data = await res.json();
  return data;
}

export async function markStudentSubmitted(sessionId: string, studentId: string): Promise<void> {
  const res = await fetch(`${BASE}/sessions/${encodeURIComponent(sessionId)}/submit`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ studentId }),
  });
  if (!res.ok) {
    console.error("Failed to mark student as submitted");
  }
}

export async function appendTranscript(sessionId: string, chunk: TranscriptChunk): Promise<void> {
  const res = await fetch(`${BASE}/sessions/${encodeURIComponent(sessionId)}/transcript`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ chunk }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = `Failed to append transcript for session ${sessionId}, chunk ${chunk.id}: ${err.error || res.statusText}`;
    console.error(msg);
    throw new Error(msg);
  }
}

export async function getTranscripts(sessionId: string): Promise<TranscriptChunk[]> {
  const res = await fetch(`${BASE}/sessions/${encodeURIComponent(sessionId)}/transcript`, {
    headers: headers(),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.transcripts || [];
}

/* ─── AI Punctuation ─── */
export async function punctuateText(text: string): Promise<string> {
  try {
    const res = await fetch(`${BASE}/ai/punctuate`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ text }),
    });
    if (!res.ok) return text;
    const data = await res.json();
    return data.punctuated || text;
  } catch {
    return text;
  }
}

/* ─── AI Rubric Tagging — Voca Semantic Engine ─── */
export async function tagRubric(
  sentences: { id: string; text: string }[],
  metrics: { id: string; name: string; color: string; description?: string }[]
): Promise<SentenceAnalysis[]> {
  const res = await fetch(`${BASE}/ai/tag-rubric`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ sentences, metrics }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error("Voca Semantic Engine error:", err.error);
    return sentences.map((s) => ({ sentence_id: s.id, text: s.text, analysis: [] }));
  }
  const data = await res.json();
  return data.results || [];
}

/* ─── AI Suggested Grade ─── */
export async function suggestGrade(
  studentName: string,
  transcriptText: string,
  metrics: { id: string; name: string; weight: number; hdDescription?: string }[]
): Promise<{
  overallGrade: string;
  overallScore: number;
  overallFeedback: string;
  dimensions: { metricId: string; grade: string; score: number; feedback: string }[];
}> {
  const res = await fetch(`${BASE}/ai/suggest-grade`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ studentName, transcriptText, metrics }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error("AI grade error:", err.error);
    return { overallGrade: "P", overallScore: 50, overallFeedback: "Unable to generate grade.", dimensions: [] };
  }
  const data = await res.json();
  return data.result || { overallGrade: "P", overallScore: 50, overallFeedback: "Unable to generate grade.", dimensions: [] };
}

/* ─── Join code resolution ─── */
export async function resolveJoinCode(code: string): Promise<{ sessionId: string; assessmentId: string } | null> {
  try {
    const res = await fetch(`${BASE}/joincode/${encodeURIComponent(code.toUpperCase())}`, {
      headers: headers(),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.sessionId ? { sessionId: data.sessionId, assessmentId: data.assessmentId } : null;
  } catch {
    return null;
  }
}

/* ─── Access Control ─── */
export async function checkEmailAccess(email: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/access/check-email`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ email }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.allowed === true;
  } catch (err) {
    console.error("Error checking email access:", err);
    return false;
  }
}

export async function checkEmailAccessDetailed(email: string): Promise<{
  allowed: boolean;
  expired: boolean;
  expiresAt: string | null;
}> {
  try {
    const res = await fetch(`${BASE}/access/check-email`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ email }),
    });
    if (!res.ok) return { allowed: false, expired: false, expiresAt: null };
    const data = await res.json();
    return {
      allowed: data.allowed === true,
      expired: data.expired === true,
      expiresAt: data.expiresAt || null,
    };
  } catch (err) {
    console.error("Error checking email access (detailed):", err);
    return { allowed: false, expired: false, expiresAt: null };
  }
}

export interface AllowedEmailEntry {
  email: string;
  expiresAt: string | null;
  isAdmin: boolean;
}

export async function listAllowedEmails(): Promise<AllowedEmailEntry[]> {
  try {
    const res = await fetch(`${BASE}/access/list`, { headers: headers() });
    if (!res.ok) return [];
    const data = await res.json();
    // Handle both old format (string[]) and new format (object[])
    if (Array.isArray(data.emails)) {
      if (typeof data.emails[0] === "string") {
        return data.emails.map((e: string) => ({ email: e, expiresAt: null, isAdmin: e.toLowerCase() === "talkwithrushi@gmail.com" }));
      }
      return data.emails;
    }
    return [];
  } catch {
    return [];
  }
}

export async function inviteEmail(
  email: string,
  adminEmail: string,
  durationMinutes?: number,
  emailHtml?: string
): Promise<{ success: boolean; emailSent: boolean; expiresAt?: string; error?: string }> {
  const res = await fetch(`${BASE}/access/invite`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ email, adminEmail, durationMinutes, emailHtml }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to invite");
  return data;
}

export async function revokeEmail(email: string, adminEmail: string): Promise<void> {
  const res = await fetch(`${BASE}/access/revoke`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ email, adminEmail }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to revoke");
  }
}

export async function notifyDeniedLogin(email: string): Promise<void> {
  try {
    await fetch(`${BASE}/access/notify-denied`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ email }),
    });
  } catch {
    // Silently fail — user should never know
  }
}

/* ─── Passwordless OTP ─── */
export async function sendOtp(email: string): Promise<{ allowed: boolean; sent?: boolean; error?: string }> {
  try {
    const res = await fetch(`${BASE}/access/send-otp`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { allowed: data.allowed ?? false, error: data.error || "Failed to send code" };
    }
    return { allowed: true, sent: data.sent };
  } catch (err: any) {
    console.error("Error sending OTP:", err);
    return { allowed: false, error: "Network error" };
  }
}

export async function verifyOtp(email: string, code: string): Promise<{ verified: boolean; error?: string }> {
  try {
    const res = await fetch(`${BASE}/access/verify-otp`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ email, code }),
    });
    const data = await res.json();
    return { verified: data.verified === true, error: data.error };
  } catch (err: any) {
    console.error("Error verifying OTP:", err);
    return { verified: false, error: "Network error" };
  }
}

export async function notifyLogin(email: string): Promise<void> {
  try {
    await fetch(`${BASE}/access/notify-login`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ email }),
    });
  } catch {
    // Silently fail
  }
}

export async function verifyAdminPassword(
  email: string,
  password: string,
  step: number
): Promise<{ verified: boolean; error?: string }> {
  try {
    const res = await fetch(`${BASE}/access/verify-admin-password`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ email, password, step }),
    });
    const data = await res.json();
    return { verified: data.verified === true, error: data.error };
  } catch (err: any) {
    console.error("Error verifying admin password:", err);
    return { verified: false, error: "Network error" };
  }
}