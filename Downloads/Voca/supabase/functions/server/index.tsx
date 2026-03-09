import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.tsx";
const app = new Hono();

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Health check endpoint
app.get("/make-server-09a7e7d0/health", (c) => {
  return c.json({ status: "ok" });
});

// KV Store Endpoints
// IMPORTANT: prefix route must come before the generic :key route
app.get("/make-server-09a7e7d0/kv/prefix/:prefix", async (c) => {
  try {
    const prefix = c.req.param("prefix");
    const values = await kv.getByPrefix(prefix);
    return c.json({ values });
  } catch (error: any) {
    console.log("Error in getByPrefix:", error.message);
    return c.json({ error: error.message }, 500);
  }
});

app.get("/make-server-09a7e7d0/kv/:key", async (c) => {
  try {
    const key = c.req.param("key");
    const value = await kv.get(key);
    return c.json({ value });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

app.post("/make-server-09a7e7d0/kv", async (c) => {
  try {
    const { key, value } = await c.req.json();
    await kv.set(key, value);
    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

app.delete("/make-server-09a7e7d0/kv/:key", async (c) => {
  try {
    const key = c.req.param("key");
    await kv.del(key);
    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

/* ─── Session management routes ─── */
// Create a new session
app.post("/make-server-09a7e7d0/sessions", async (c) => {
  try {
    const { session } = await c.req.json();
    if (!session?.id) return c.json({ error: "Session id is required" }, 400);
    await kv.set(`CHATGPT_session_${session.id}`, session);
    // Initialize empty transcript array
    await kv.set(`CHATGPT_transcripts_${session.id}`, []);
    // Initialize submitted students set
    await kv.set(`CHATGPT_submitted_${session.id}`, []);
    // Save join code -> session mapping for /join/:code route
    if (session.joinCode) {
      await kv.set(`CHATGPT_joincode_${session.joinCode}`, {
        sessionId: session.id,
        assessmentId: session.assessmentId,
      });
    }
    console.log(`Session created: ${session.id} (type=${session.type}, joinCode=${session.joinCode})`);
    return c.json({ success: true, session });
  } catch (error: any) {
    console.log("Error creating session:", error.message);
    return c.json({ error: error.message }, 500);
  }
});

// Get session by id
app.get("/make-server-09a7e7d0/sessions/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const session = await kv.get(`CHATGPT_session_${id}`);
    if (!session) return c.json({ error: "Session not found" }, 404);
    return c.json({ session });
  } catch (error: any) {
    console.log("Error getting session:", error.message);
    return c.json({ error: error.message }, 500);
  }
});

// Update session status
app.put("/make-server-09a7e7d0/sessions/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const updates = await c.req.json();
    const existing = await kv.get(`CHATGPT_session_${id}`);
    if (!existing) return c.json({ error: "Session not found" }, 404);
    const updated = { ...existing, ...updates };
    await kv.set(`CHATGPT_session_${id}`, updated);
    return c.json({ success: true, session: updated });
  } catch (error: any) {
    console.log("Error updating session:", error.message);
    return c.json({ error: error.message }, 500);
  }
});

// Validate student for a session
app.post("/make-server-09a7e7d0/sessions/:id/validate", async (c) => {
  try {
    const sessionId = c.req.param("id");
    const { studentNumber, groupId } = await c.req.json();

    const session = await kv.get(`CHATGPT_session_${sessionId}`);
    if (!session) return c.json({ error: "Session not found", valid: false }, 404);
    if (session.status !== "active") return c.json({ error: "Session has ended. You can no longer start.", valid: false }, 400);

    // Check if student already submitted
    const submitted = await kv.get(`CHATGPT_submitted_${sessionId}`);
    const submittedList = Array.isArray(submitted) ? submitted : [];

    // Load students
    const students = await kv.get("CHATGPT_students_global");
    if (!students || !Array.isArray(students)) {
      return c.json({ error: "No students found in database", valid: false }, 404);
    }

    const student = students.find((s: any) => s.studentNumber === studentNumber);
    if (!student) {
      return c.json({ error: "Student ID not found", valid: false }, 404);
    }

    // Check if this student already submitted for this session
    if (submittedList.includes(student.id)) {
      return c.json({ error: "You have already completed this assessment", valid: false, alreadySubmitted: true }, 400);
    }

    // Group validation
    if (session.type === "group" && groupId) {
      if (!student.groupId || student.groupId !== groupId) {
        return c.json({ error: `Student ID not found in ${groupId}`, valid: false }, 400);
      }
    }

    return c.json({
      valid: true,
      student: {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        studentNumber: student.studentNumber,
        groupId: student.groupId || null,
      }
    });
  } catch (error: any) {
    console.log("Error validating student:", error.message);
    return c.json({ error: error.message, valid: false }, 500);
  }
});

// Mark student as submitted (prevent re-entry) and save submission
app.post("/make-server-09a7e7d0/sessions/:id/submit", async (c) => {
  try {
    const sessionId = c.req.param("id");
    const { studentId } = await c.req.json();
    if (!studentId) return c.json({ error: "studentId is required" }, 400);

    const session = await kv.get(`CHATGPT_session_${sessionId}`);
    if (!session) return c.json({ error: "Session not found" }, 404);

    const isLate = session.status === "completed";

    // Load students to get details
    const students = await kv.get("CHATGPT_students_global");
    const studentInfo = Array.isArray(students) ? students.find((s: any) => s.id === studentId) : null;
    const studentName = studentInfo ? `${studentInfo.firstName} ${studentInfo.lastName}` : "Unknown Student";
    const groupId = studentInfo?.groupId;

    // Save to submissions list
    const assessmentId = session.assessmentId;
    const submissionsKey = `CHATGPT_submissions_${assessmentId}`;
    let submissions = await kv.get(submissionsKey);
    if (!Array.isArray(submissions)) submissions = [];
    
    // Check if already submitted
    const existingSubIndex = submissions.findIndex((s: any) => s.sessionId === sessionId && s.studentId === studentId);
    
    const submission = {
      id: crypto.randomUUID(),
      sessionId,
      assessmentId,
      studentId,
      studentName,
      groupId,
      submittedAt: new Date().toISOString(),
      late: isLate
    };

    if (existingSubIndex >= 0) {
      submissions[existingSubIndex] = submission;
    } else {
      submissions.push(submission);
    }
    await kv.set(submissionsKey, submissions);

    const existing = await kv.get(`CHATGPT_submitted_${sessionId}`);
    const submittedList = Array.isArray(existing) ? existing : [];
    if (!submittedList.includes(studentId)) {
      submittedList.push(studentId);
      await kv.set(`CHATGPT_submitted_${sessionId}`, submittedList);
    }
    console.log(`Student ${studentId} marked as submitted for session ${sessionId}, late: ${isLate}`);
    return c.json({ success: true, late: isLate });
  } catch (error: any) {
    console.log("Error marking student submitted:", error.message);
    return c.json({ error: error.message }, 500);
  }
});

// Append transcript chunks
app.post("/make-server-09a7e7d0/sessions/:id/transcript", async (c) => {
  try {
    const sessionId = c.req.param("id");
    const { chunk } = await c.req.json();
    if (!chunk) return c.json({ error: "Chunk is required" }, 400);

    const existing = await kv.get(`CHATGPT_transcripts_${sessionId}`);
    const transcripts = Array.isArray(existing) ? existing : [];

    // If it's an update to an existing interim chunk, replace it
    const existingIdx = transcripts.findIndex((t: any) => t.id === chunk.id);
    if (existingIdx >= 0) {
      transcripts[existingIdx] = chunk;
    } else {
      transcripts.push(chunk);
    }

    await kv.set(`CHATGPT_transcripts_${sessionId}`, transcripts);
    return c.json({ success: true });
  } catch (error: any) {
    console.log("Error appending transcript:", error.message);
    return c.json({ error: error.message }, 500);
  }
});

// Get transcripts for a session
app.get("/make-server-09a7e7d0/sessions/:id/transcript", async (c) => {
  try {
    const sessionId = c.req.param("id");
    const existing = await kv.get(`CHATGPT_transcripts_${sessionId}`);
    return c.json({ transcripts: Array.isArray(existing) ? existing : [] });
  } catch (error: any) {
    console.log("Error getting transcript:", error.message);
    return c.json({ error: error.message }, 500);
  }
});

/* ─── AI Punctuation — cleans up raw speech text ─── */
app.post("/make-server-09a7e7d0/ai/punctuate", async (c) => {
  try {
    const { text } = await c.req.json();
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return c.json({ punctuated: text || "" });
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      console.log("OPENAI_API_KEY not set — returning raw text");
      return c.json({ punctuated: text });
    }

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        max_tokens: 512,
        messages: [
          {
            role: "system",
            content: `You are a punctuation restorer. You receive raw speech-to-text output that lacks punctuation and proper capitalisation. Your job is to add correct punctuation (full stops, commas, question marks, apostrophes, etc.) and fix capitalisation WITHOUT changing any words, their order, or adding/removing any words. Return ONLY the corrected text, nothing else. Preserve the original meaning exactly.`,
          },
          { role: "user", content: text },
        ],
      }),
    });

    if (!res.ok) {
      console.log("OpenAI punctuation API error:", res.status);
      return c.json({ punctuated: text });
    }

    const data = await res.json();
    const punctuated = data.choices?.[0]?.message?.content?.trim() || text;
    return c.json({ punctuated });
  } catch (error: any) {
    console.log("Error in punctuation endpoint:", error.message);
    return c.json({ punctuated: c.req.raw ? "" : "" }, 500);
  }
});

/* ─── AI Suggested Grade — per-student rubric-aligned grading ─── */
app.post("/make-server-09a7e7d0/ai/suggest-grade", async (c) => {
  try {
    const { studentName, transcriptText, metrics } = await c.req.json();
    if (!transcriptText || !metrics || !Array.isArray(metrics)) {
      return c.json({ error: "transcriptText and metrics[] are required" }, 400);
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return c.json({ error: "OpenAI API key not configured" }, 500);
    }

    const metricsDesc = metrics.map((m: any) =>
      `- ID: "${m.id}" | Dimension: "${m.name}" | Weight: ${m.weight}%${m.hdDescription ? ` | HD Benchmark: "${m.hdDescription}"` : ""}`
    ).join("\n");

    const systemPrompt = `You are an expert Australian university oral assessment grader. Given a student's full oral transcript and the rubric dimensions below, suggest a grade for each dimension using the Australian grading scale:

- HD (High Distinction, 85-100): Outstanding demonstration
- D (Distinction, 75-84): Excellent demonstration  
- C (Credit, 65-74): Good demonstration
- P (Pass, 50-64): Adequate demonstration
- F (Fail, 0-49): Insufficient demonstration

RUBRIC DIMENSIONS:
${metricsDesc}

Analyse the transcript holistically — consider depth of content knowledge, quality of argumentation, use of evidence, communication clarity, and overall coherence. Do NOT just match keywords.

Return ONLY a JSON object with this structure:
{
  "overallGrade": "HD|D|C|P|F",
  "overallScore": <number 0-100>,
  "overallFeedback": "<2-3 sentence summary>",
  "dimensions": [
    {
      "metricId": "<metric ID>",
      "grade": "HD|D|C|P|F",
      "score": <number 0-100>,
      "feedback": "<1-2 sentence justification>"
    }
  ]
}

Be fair, balanced, and constructive. Return ONLY the JSON.`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        max_tokens: 1024,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Student: ${studentName || "Unknown"}\n\nTranscript:\n${transcriptText}` },
        ],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.log("OpenAI grade API error:", res.status, errBody);
      return c.json({ error: `OpenAI API error: ${res.status}` }, 502);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || "{}";

    let parsed;
    try {
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      console.log("Failed to parse grade response:", content);
      parsed = { overallGrade: "P", overallScore: 50, overallFeedback: "Unable to generate grade.", dimensions: [] };
    }

    return c.json({ result: parsed });
  } catch (error: any) {
    console.log("Error in suggest-grade:", error.message);
    return c.json({ error: error.message }, 500);
  }
});

/* ─── AI Rubric Tagging — Voca Semantic Engine ─── */
app.post("/make-server-09a7e7d0/ai/tag-rubric", async (c) => {
  try {
    const { sentences, metrics } = await c.req.json();
    if (!sentences || !Array.isArray(sentences) || !metrics || !Array.isArray(metrics)) {
      return c.json({ error: "sentences ({ id, text }[]) and metrics ({ id, name, color, description? }[]) are required" }, 400);
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      console.log("OPENAI_API_KEY not set");
      return c.json({ error: "OpenAI API key not configured" }, 500);
    }

    // Build rubric dimension list for the prompt
    const dimensionList = metrics.map((m: any) =>
      `- ID: "${m.id}" | Dimension: "${m.name}" | Hex: "${m.color}"${m.description ? ` | Benchmark: "${m.description}"` : ""}`
    ).join("\n");

    const systemPrompt = `**ROLE**: You are the Voca Semantic Engine, a high-precision AI Assessor Guide for Australian educational standards. Your objective is not to grade, but to provide Real-Time Evidence Mapping of oral transcripts against specific Rubric Dimensions.

**CORE LOGIC: SEMANTIC EVIDENCE MAPPING**
1. INPUT: You receive spoken sentences with unique IDs from a student oral assessment. These are raw speech-to-text outputs and may lack perfect grammar.
2. SEMANTIC ANALYSIS: Analyse each sentence for its MEANING and INTENT against the rubric dimensions. Go beyond surface-level keyword matching — understand the conceptual connection between what the student is saying and the rubric criteria.
3. EVIDENCE EXTRACTION: Identify specific multi-word phrases (typically 2-8 words) that serve as meaningful evidence for a rubric dimension. The phrase should capture a concept, argument, or demonstration of knowledge — not just isolated keywords.
4. CONTEXTUAL MATCHING: A phrase like "integrating restoration with strict telemetry based monitoring" demonstrates methodological knowledge even if the exact rubric keywords are different. Match on SEMANTIC MEANING, not string similarity.

**RUBRIC DIMENSIONS**:
${dimensionList}

**CRITICAL RULES**:
- NEVER return an empty analysis array just because you don't find exact keyword matches. Look for semantic connections, conceptual demonstrations, and evidence of understanding.
- DO highlight phrases that demonstrate critical thinking, argumentation, use of evidence, domain knowledge, or communication skill — even if the exact rubric terminology isn't used.
- DO NOT highlight entire sentences. Only highlight the most evidential multi-word phrase(s) within a sentence.
- A single sentence may have ZERO, ONE, or MULTIPLE highlighted phrases mapping to different dimensions.
- If a sentence genuinely contains no relevant evidence for any dimension (e.g., "thank you for listening"), return an empty analysis for that sentence.
- Phrases must be exact substrings of the original sentence text (case-insensitive).

**OUTPUT FORMAT**:
Return ONLY a JSON array. One object per input sentence, in the same order:
[
  {
    "sentence_id": "<id from input>",
    "analysis": [
      {
        "phrase": "exact words from the sentence",
        "rubric_id": "<RUBRIC_ID>",
        "color": "<HEX from rubric>",
        "dimension": "<Dimension name>",
        "justification": "Brief semantic reason (1 sentence max)"
      }
    ]
  }
]

Return ONLY the JSON array. No markdown, no commentary.`;

    // Build user message with sentence IDs
    const userMsg = sentences.map((s: any) => `[${s.id}]: "${s.text}"`).join("\n");

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.1,
        max_tokens: 2048,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMsg },
        ],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.log("OpenAI API error:", res.status, errBody);
      return c.json({ error: `OpenAI API error: ${res.status}` }, 502);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || "[]";

    // Parse JSON from response (handle markdown code blocks)
    let parsed;
    try {
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.log("Failed to parse Voca Engine response:", content);
      // Fallback: return empty analysis for all sentences
      parsed = sentences.map((s: any) => ({ sentence_id: s.id, analysis: [] }));
    }

    // Validate and normalise the response structure
    const normalised = sentences.map((s: any) => {
      const match = parsed.find((p: any) => p.sentence_id === s.id);
      if (match && Array.isArray(match.analysis)) {
        return {
          sentence_id: s.id,
          text: s.text,
          analysis: match.analysis.filter((a: any) => a.phrase && a.phrase.trim().length > 0).map((a: any) => ({
            phrase: a.phrase || "",
            rubric_id: a.rubric_id || "",
            color: a.color || "",
            dimension: a.dimension || "",
            justification: a.justification || "",
          })),
        };
      }
      return { sentence_id: s.id, text: s.text, analysis: [] };
    });

    return c.json({ results: normalised });
  } catch (error: any) {
    console.log("Error in Voca Semantic Engine:", error.message);
    return c.json({ error: error.message }, 500);
  }
});

/* ─── Resolve join code to session ─── */
app.get("/make-server-09a7e7d0/joincode/:code", async (c) => {
  try {
    const code = c.req.param("code").toUpperCase();
    const mapping = await kv.get(`CHATGPT_joincode_${code}`);
    if (!mapping || !mapping.sessionId) {
      return c.json({ error: "Invalid join code" }, 404);
    }
    return c.json({ sessionId: mapping.sessionId, assessmentId: mapping.assessmentId });
  } catch (error: any) {
    console.log("Error resolving join code:", error.message);
    return c.json({ error: error.message }, 500);
  }
});

/* ─── Access Control — Invite-only system ─── */
const ADMIN_EMAIL = "talkwithrushi@gmail.com";
const ALLOWED_EMAILS_KEY = "CHATGPT_allowed_emails";
const ACCESS_EXPIRY_PREFIX = "CHATGPT_access_expiry_";

// Helper: get allowed emails list (admin is always included)
async function getAllowedEmails(): Promise<string[]> {
  const stored = await kv.get(ALLOWED_EMAILS_KEY);
  const emails: string[] = Array.isArray(stored) ? stored : [];
  // Always include admin
  if (!emails.includes(ADMIN_EMAIL)) emails.push(ADMIN_EMAIL);
  return emails;
}

// Helper: check and handle expiry for a given email
async function checkExpiry(email: string): Promise<{ expired: boolean; expiresAt: string | null }> {
  const normEmail = email.trim().toLowerCase();
  if (normEmail === ADMIN_EMAIL) return { expired: false, expiresAt: null };
  const expiryData = await kv.get(`${ACCESS_EXPIRY_PREFIX}${normEmail}`);
  if (!expiryData || !expiryData.expiresAt) return { expired: false, expiresAt: null };
  const now = new Date().getTime();
  const expiresAt = new Date(expiryData.expiresAt).getTime();
  if (now >= expiresAt) {
    // Auto-revoke: remove from allowlist
    const allowed = await getAllowedEmails();
    const filtered = allowed.filter((e: string) => e.toLowerCase() !== normEmail);
    await kv.set(ALLOWED_EMAILS_KEY, filtered);
    await kv.del(`${ACCESS_EXPIRY_PREFIX}${normEmail}`);
    console.log(`Auto-revoked expired access for ${normEmail}`);
    return { expired: true, expiresAt: expiryData.expiresAt };
  }
  return { expired: false, expiresAt: expiryData.expiresAt };
}

// Check if an email is allowed
app.post("/make-server-09a7e7d0/access/check-email", async (c) => {
  try {
    const { email } = await c.req.json();
    if (!email) return c.json({ error: "Email is required" }, 400);
    const normalised = email.trim().toLowerCase();

    // Check expiry first (may auto-revoke)
    const { expired, expiresAt } = await checkExpiry(normalised);
    if (expired) {
      return c.json({ allowed: false, expired: true, expiresAt });
    }

    const allowed = await getAllowedEmails();
    const isAllowed = allowed.some((e: string) => e.toLowerCase() === normalised);

    // If allowed, also return expiresAt info
    if (isAllowed && expiresAt) {
      return c.json({ allowed: true, expired: false, expiresAt });
    }
    return c.json({ allowed: isAllowed, expired: false, expiresAt: null });
  } catch (error: any) {
    console.log("Error checking email access:", error.message);
    return c.json({ error: error.message }, 500);
  }
});

// List all allowed emails with expiry info (admin only)
app.get("/make-server-09a7e7d0/access/list", async (c) => {
  try {
    const emails = await getAllowedEmails();
    // Enrich with expiry data
    const enriched = await Promise.all(emails.map(async (email: string) => {
      const normEmail = email.toLowerCase();
      if (normEmail === ADMIN_EMAIL) return { email, expiresAt: null, isAdmin: true };
      const expiryData = await kv.get(`${ACCESS_EXPIRY_PREFIX}${normEmail}`);
      return { email, expiresAt: expiryData?.expiresAt || null, isAdmin: false };
    }));
    return c.json({ emails: enriched });
  } catch (error: any) {
    console.log("Error listing allowed emails:", error.message);
    return c.json({ error: error.message }, 500);
  }
});

// Invite a new email (admin only) — sends email via Resend, adds to allowlist
app.post("/make-server-09a7e7d0/access/invite", async (c) => {
  try {
    const { email, adminEmail, durationMinutes, emailHtml } = await c.req.json();
    if (!email) return c.json({ error: "Email is required" }, 400);
    if (!adminEmail || adminEmail.toLowerCase() !== ADMIN_EMAIL) {
      return c.json({ error: "Unauthorized — admin only" }, 403);
    }

    const normalised = email.trim().toLowerCase();
    const duration = typeof durationMinutes === "number" && durationMinutes > 0 ? durationMinutes : null;

    // Add to allowlist
    const allowed = await getAllowedEmails();
    if (!allowed.some((e: string) => e.toLowerCase() === normalised)) {
      allowed.push(normalised);
      await kv.set(ALLOWED_EMAILS_KEY, allowed);
    }

    // Store expiry if duration specified
    let expiresAt: string | null = null;
    if (duration) {
      expiresAt = new Date(Date.now() + duration * 60 * 1000).toISOString();
      await kv.set(`${ACCESS_EXPIRY_PREFIX}${normalised}`, { expiresAt, durationMinutes: duration });
      console.log(`Access for ${normalised} expires at ${expiresAt} (${duration} minutes)`);
    } else {
      // Clear any existing expiry
      await kv.del(`${ACCESS_EXPIRY_PREFIX}${normalised}`);
    }

    // Build duration text for email
    const durationText = duration
      ? duration >= 60
        ? `${Math.floor(duration / 60)} hour${Math.floor(duration / 60) > 1 ? "s" : ""}${duration % 60 > 0 ? ` ${duration % 60} min` : ""}`
        : `${duration} minute${duration > 1 ? "s" : ""}`
      : null;

    // Send invite email via Resend
    const resendKey = Deno.env.get("RESEND_API_KEY");
    let emailSent = false;
    if (resendKey) {
      try {
        // Use custom emailHtml if provided, otherwise use default
        const htmlBody = emailHtml || `
              <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:0;color:#1d1d1f">
                <div style="background:linear-gradient(135deg,#6B4BC8 0%,#904498 30%,#DE6231 70%,#CA3C43 100%);padding:32px 24px;text-align:center;border-radius:0 0 24px 24px">
                  <!--[if !mso]><!-->
                  <svg xmlns="http://www.w3.org/2000/svg" width="140" height="120" viewBox="0 0 140 120" style="display:block;margin:0 auto 8px">
                    <!-- V shape -->
                    <path d="M36 12 L70 82 L104 12" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
                    <!-- Left arm detail -->
                    <path d="M30 12 L38 12" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="3" stroke-linecap="round"/>
                    <!-- Right arm detail -->
                    <path d="M102 12 L110 12" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="3" stroke-linecap="round"/>
                    <!-- Soundwave bars with SMIL animation -->
                    <rect x="42" y="32" width="4" height="22" rx="2" fill="rgba(255,255,255,0.7)">
                      <animate attributeName="height" values="22;10;22" dur="1.2s" repeatCount="indefinite"/>
                      <animate attributeName="y" values="32;38;32" dur="1.2s" repeatCount="indefinite"/>
                    </rect>
                    <rect x="50" y="28" width="4" height="30" rx="2" fill="rgba(255,255,255,0.65)">
                      <animate attributeName="height" values="30;12;30" dur="1.5s" begin="0.1s" repeatCount="indefinite"/>
                      <animate attributeName="y" values="28;37;28" dur="1.5s" begin="0.1s" repeatCount="indefinite"/>
                    </rect>
                    <rect x="58" y="25" width="4" height="36" rx="2" fill="rgba(255,255,255,0.6)">
                      <animate attributeName="height" values="36;14;36" dur="1.7s" begin="0s" repeatCount="indefinite"/>
                      <animate attributeName="y" values="25;36;25" dur="1.7s" begin="0s" repeatCount="indefinite"/>
                    </rect>
                    <rect x="78" y="25" width="4" height="36" rx="2" fill="rgba(255,255,255,0.6)">
                      <animate attributeName="height" values="36;14;36" dur="1.6s" begin="0.15s" repeatCount="indefinite"/>
                      <animate attributeName="y" values="25;36;25" dur="1.6s" begin="0.15s" repeatCount="indefinite"/>
                    </rect>
                    <rect x="86" y="28" width="4" height="30" rx="2" fill="rgba(255,255,255,0.65)">
                      <animate attributeName="height" values="30;14;30" dur="1.35s" begin="0.25s" repeatCount="indefinite"/>
                      <animate attributeName="y" values="28;36;28" dur="1.35s" begin="0.25s" repeatCount="indefinite"/>
                    </rect>
                    <rect x="94" y="32" width="4" height="22" rx="2" fill="rgba(255,255,255,0.7)">
                      <animate attributeName="height" values="22;10;22" dur="1.15s" begin="0.35s" repeatCount="indefinite"/>
                      <animate attributeName="y" values="32;38;32" dur="1.15s" begin="0.35s" repeatCount="indefinite"/>
                    </rect>
                    <!-- Voca. text -->
                    <text x="70" y="108" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" font-size="24" font-weight="800" fill="rgba(255,255,255,0.92)" letter-spacing="-0.5">Voca<tspan fill="#DE5E29">.</tspan></text>
                  </svg>
                  <!--<![endif]-->
                  <!--[if mso]><h1 style="font-size:36px;font-weight:800;margin:0;color:#fff;letter-spacing:-0.5px">Voca<span style="color:#DE5E29">.</span></h1><![endif]-->
                  <p style="color:rgba(255,255,255,0.8);font-size:13px;margin-top:4px;letter-spacing:0.3px;font-style:italic">Read between the lines</p>
                </div>
                <div style="padding:32px 24px">
                  <p style="font-size:16px;line-height:1.6">Hi there,</p>
                  <p style="font-size:16px;line-height:1.6">You've been invited to join <strong>Voca</strong> — an intelligent speech analytics and assessment platform designed for interviewers, sales people, coaches and educators!</p>
                  <p style="font-size:16px;line-height:1.6">Your email <strong>${normalised}</strong> has been granted access. Simply visit the app and sign in with this email address.</p>
                  ${durationText ? `
                  <div style="margin:24px 0;padding:16px 20px;background:linear-gradient(135deg,#FFF5F5,#FEF3E7);border:1px solid #FED7AA;border-radius:12px;text-align:center">
                    <p style="font-size:12px;color:#9A3412;margin:0;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Timed Access</p>
                    <p style="font-size:20px;font-weight:700;margin:6px 0 2px;color:#C2410C">${durationText}</p>
                    <p style="font-size:12px;color:#9A3412;margin:0">Access will be automatically revoked after this period.</p>
                  </div>` : ""}
                  <div style="margin:24px 0;padding:16px;background:#f5f5f7;border-radius:12px;text-align:center">
                    <p style="font-size:12px;color:#86868b;margin:0;text-transform:uppercase;letter-spacing:0.5px">Invited by</p>
                    <p style="font-size:15px;font-weight:600;margin:4px 0 0;color:#1d1d1f">The Team at <a href="https://chrono.knowwhatson.com" style="color:#6B4BC8;text-decoration:none;font-weight:700">ChronoOS</a></p>
                  </div>
                  <p style="font-size:12px;color:#86868b;text-align:center;margin-top:28px">
                    Part of <strong><a href="https://chrono.knowwhatson.com" style="color:#6B4BC8;text-decoration:none">ChronoOS</a></strong> by What's On!
                  </p>
                  <div style="margin:28px 0 0;padding:16px 20px;border-top:1px solid #e5e5e7">
                    <p style="font-size:10px;color:#a1a1aa;line-height:1.6;text-align:justify">
                      <strong>Confidential &amp; Privileged.</strong> This demonstration access and communication is intended solely for the named recipient and is strictly confidential. It is intended only for individuals who have executed a Non-Disclosure Agreement (NDA) with What's On! Campus Pty Ltd (ABN 75 673 795 465). If you have received this in error, please notify the sender immediately and delete all copies. Unauthorised use, disclosure, copying or distribution of this material is prohibited and may constitute a breach of the <em>Privacy Act 1988</em> (Cth), the <em>Corporations Act 2001</em> (Cth), and applicable laws of New South Wales, Australia. All rights reserved. &copy; ${new Date().getFullYear()} What's On! Campus Pty Ltd.
                    </p>
                  </div>
                </div>
              </div>
            `;

        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${resendKey}`,
          },
          body: JSON.stringify({
            from: "Voca <info@knowwhatson.com>",
            to: [normalised],
            subject: duration
              ? `You've been invited to Voca (${durationText} access)`
              : "You've been invited to Voca",
            html: htmlBody,
          }),
        });
        emailSent = res.ok;
        if (!res.ok) {
          const errBody = await res.text();
          console.log("Resend API error:", res.status, errBody);
        }
      } catch (resendErr: any) {
        console.log("Resend send error:", resendErr.message);
      }
    } else {
      console.log("RESEND_API_KEY not set — skipping email send");
    }

    return c.json({ success: true, emailSent, email: normalised, expiresAt });
  } catch (error: any) {
    console.log("Error sending invite:", error.message);
    return c.json({ error: error.message }, 500);
  }
});

// Revoke access for an email (admin only)
app.post("/make-server-09a7e7d0/access/revoke", async (c) => {
  try {
    const { email, adminEmail } = await c.req.json();
    if (!email) return c.json({ error: "Email is required" }, 400);
    if (!adminEmail || adminEmail.toLowerCase() !== ADMIN_EMAIL) {
      return c.json({ error: "Unauthorized — admin only" }, 403);
    }

    const normalised = email.trim().toLowerCase();
    if (normalised === ADMIN_EMAIL) {
      return c.json({ error: "Cannot revoke admin access" }, 400);
    }

    const allowed = await getAllowedEmails();
    const filtered = allowed.filter((e: string) => e.toLowerCase() !== normalised);
    await kv.set(ALLOWED_EMAILS_KEY, filtered);
    // Also clean up expiry data
    await kv.del(`${ACCESS_EXPIRY_PREFIX}${normalised}`);

    return c.json({ success: true, email: normalised });
  } catch (error: any) {
    console.log("Error revoking access:", error.message);
    return c.json({ error: error.message }, 500);
  }
});

// Notify admin about denied login attempt (silent — user is not told)
app.post("/make-server-09a7e7d0/access/notify-denied", async (c) => {
  try {
    const { email } = await c.req.json();
    if (!email) return c.json({ success: true }); // Silently succeed

    const normalised = email.trim().toLowerCase();
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      console.log("RESEND_API_KEY not set — skipping denied login notification");
      return c.json({ success: true });
    }

    const timestamp = new Date().toLocaleString("en-AU", { timeZone: "Australia/Sydney" });

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: "Voca <info@knowwhatson.com>",
        to: [ADMIN_EMAIL],
        subject: `[Voca] New Access Attempt: ${normalised}`,
        html: `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:0;color:#1d1d1f">
            <div style="background:linear-gradient(135deg,#1d1d1f 0%,#2d2d30 100%);padding:24px;text-align:center;border-radius:0 0 16px 16px">
              <h1 style="font-size:24px;font-weight:700;margin:0;color:#fff">Voca<span style="color:#DE5E29">.</span></h1>
              <p style="color:rgba(255,255,255,0.5);font-size:11px;margin-top:2px;letter-spacing:1px">NEW ACCESS ATTEMPT</p>
            </div>
            <div style="padding:28px 24px">
              <p style="font-size:15px;line-height:1.6;margin:0 0 16px">Someone attempted to access Voca but is not on the approved list.</p>
              <div style="padding:16px;background:#FEF2F2;border:1px solid #FECACA;border-radius:12px;margin-bottom:16px">
                <p style="font-size:12px;color:#991B1B;margin:0 0 4px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Email</p>
                <p style="font-size:17px;font-weight:700;margin:0;color:#DC2626">${normalised}</p>
              </div>
              <p style="font-size:13px;color:#86868b;margin:0">Attempted at ${timestamp} (AEST)</p>
              <p style="font-size:13px;color:#86868b;margin:8px 0 0">If you'd like to grant them access, open the Admin panel in Voca.</p>
            </div>
          </div>
        `,
      }),
    });

    console.log(`New access attempt notification sent to admin for: ${normalised}`);
    return c.json({ success: true });
  } catch (error: any) {
    console.log("Error in notify-denied (silent):", error.message);
    return c.json({ success: true }); // Always succeed silently
  }
});

// ─── Passwordless OTP ───────────────────────────────────────────────
const OTP_PREFIX = "CHATGPT_otp_";

app.post("/make-server-09a7e7d0/access/send-otp", async (c) => {
  try {
    const { email } = await c.req.json();
    if (!email) return c.json({ error: "Email required" }, 400);

    const normalised = email.trim().toLowerCase();

    // Check if email is on the allowlist
    const allowed = await getAllowedEmails();
    const isAllowed = allowed.some((e: string) => e.toLowerCase() === normalised);
    if (!isAllowed) {
      return c.json({ allowed: false, error: "Not on the approved list" }, 403);
    }

    // Check expiry
    const expiryData = await kv.get(`${ACCESS_EXPIRY_PREFIX}${normalised}`);
    if (expiryData?.expiresAt) {
      const expiresAt = new Date(expiryData.expiresAt).getTime();
      if (Date.now() >= expiresAt) {
        // Auto-revoke expired user
        const updatedList = allowed.filter((e: string) => e.toLowerCase() !== normalised);
        await kv.set(ALLOWED_EMAILS_KEY, updatedList);
        await kv.del(`${ACCESS_EXPIRY_PREFIX}${normalised}`);
        return c.json({ allowed: false, error: "Access expired" }, 403);
      }
    }

    // Generate 6-digit OTP
    const code = String(Math.floor(100000 + Math.random() * 900000));
    // Store with 10 minute TTL
    await kv.set(`${OTP_PREFIX}${normalised}`, { code, createdAt: Date.now(), expiresAt: Date.now() + 10 * 60 * 1000 });

    // Send OTP email via Resend
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      console.log("RESEND_API_KEY not set — returning code in dev mode");
      return c.json({ allowed: true, sent: true });
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: "Voca <info@knowwhatson.com>",
        to: [normalised],
        subject: `${code} is your Voca sign-in code`,
        html: `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:0;color:#1d1d1f">
            <div style="background:linear-gradient(135deg,#6B4BC8 0%,#904498 30%,#DE6231 70%,#CA3C43 100%);padding:32px 24px;text-align:center;border-radius:0 0 24px 24px">
              <h1 style="font-size:36px;font-weight:800;margin:0;color:#fff;letter-spacing:-0.5px">Voca<span style="color:#DE5E29">.</span></h1>
              <p style="color:rgba(255,255,255,0.8);font-size:13px;margin-top:4px;letter-spacing:0.3px;font-style:italic">Read between the lines</p>
            </div>
            <div style="padding:32px 24px;text-align:center">
              <p style="font-size:16px;line-height:1.6;margin:0 0 24px;color:#1d1d1f">Enter this code to sign in:</p>
              <div style="display:inline-block;padding:20px 40px;background:#f5f5f7;border-radius:16px;margin-bottom:24px">
                <p style="font-size:40px;font-weight:800;letter-spacing:12px;margin:0;color:#1d1d1f;font-family:monospace">${code}</p>
              </div>
              <p style="font-size:13px;color:#86868b;margin:0">This code expires in 10 minutes.</p>
              <p style="font-size:13px;color:#86868b;margin:8px 0 0">If you didn't request this, you can safely ignore this email.</p>
              <div style="margin:28px 0 0;padding:16px 20px;border-top:1px solid #e5e5e7">
                <p style="font-size:10px;color:#a1a1aa;line-height:1.6;text-align:justify">
                  <strong>Confidential &amp; Privileged.</strong> This communication is intended solely for the named recipient and is strictly confidential. It is intended only for individuals who have executed a Non-Disclosure Agreement (NDA) with What's On! Campus Pty Ltd (ABN 75 673 795 465). Unauthorised use, disclosure, copying or distribution is prohibited and may constitute a breach of the <em>Privacy Act 1988</em> (Cth), the <em>Corporations Act 2001</em> (Cth), and applicable laws of New South Wales, Australia. All rights reserved. &copy; ${new Date().getFullYear()} What's On! Campus Pty Ltd.
                </p>
              </div>
            </div>
          </div>
        `,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.log("Resend OTP email error:", res.status, errBody);
      return c.json({ error: "Failed to send code" }, 500);
    }

    console.log(`OTP sent to ${normalised}`);
    return c.json({ allowed: true, sent: true });
  } catch (error: any) {
    console.log("Error in send-otp:", error.message);
    return c.json({ error: error.message }, 500);
  }
});

app.post("/make-server-09a7e7d0/access/verify-otp", async (c) => {
  try {
    const { email, code } = await c.req.json();
    if (!email || !code) return c.json({ error: "Email and code required" }, 400);

    const normalised = email.trim().toLowerCase();
    const stored = await kv.get(`${OTP_PREFIX}${normalised}`);

    if (!stored) {
      return c.json({ verified: false, error: "No code found. Please request a new one." }, 400);
    }

    if (Date.now() >= stored.expiresAt) {
      await kv.del(`${OTP_PREFIX}${normalised}`);
      return c.json({ verified: false, error: "Code expired. Please request a new one." }, 400);
    }

    if (stored.code !== code.trim()) {
      return c.json({ verified: false, error: "Invalid code. Please try again." }, 400);
    }

    // Code is valid — delete it (one-time use)
    await kv.del(`${OTP_PREFIX}${normalised}`);

    console.log(`OTP verified for ${normalised}`);
    return c.json({ verified: true });
  } catch (error: any) {
    console.log("Error in verify-otp:", error.message);
    return c.json({ error: error.message }, 500);
  }
});

// Notify admin when an approved user logs in
app.post("/make-server-09a7e7d0/access/notify-login", async (c) => {
  try {
    const { email } = await c.req.json();
    if (!email) return c.json({ success: true });

    const normalised = email.trim().toLowerCase();
    // Don't notify about admin's own login
    if (normalised === ADMIN_EMAIL) return c.json({ success: true });

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) return c.json({ success: true });

    const timestamp = new Date().toLocaleString("en-AU", { timeZone: "Australia/Sydney" });

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: "Voca <info@knowwhatson.com>",
        to: [ADMIN_EMAIL],
        subject: `${normalised} accessed Voca`,
        html: `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:0;color:#1d1d1f">
            <div style="background:linear-gradient(135deg,#065F46 0%,#047857 100%);padding:24px;text-align:center;border-radius:0 0 16px 16px">
              <h1 style="font-size:24px;font-weight:700;margin:0;color:#fff">Voca<span style="color:#DE5E29">.</span></h1>
              <p style="color:rgba(255,255,255,0.6);font-size:11px;margin-top:2px;letter-spacing:1px">USER LOGIN</p>
            </div>
            <div style="padding:28px 24px">
              <p style="font-size:15px;line-height:1.6;margin:0 0 16px">An approved user just signed in to Voca.</p>
              <div style="padding:16px;background:#ECFDF5;border:1px solid #A7F3D0;border-radius:12px;margin-bottom:16px">
                <p style="font-size:12px;color:#065F46;margin:0 0 4px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">User</p>
                <p style="font-size:17px;font-weight:700;margin:0;color:#059669">${normalised}</p>
              </div>
              <p style="font-size:13px;color:#86868b;margin:0">Signed in at ${timestamp} (AEST)</p>
            </div>
          </div>
        `,
      }),
    });

    console.log(`Login notification sent to admin for: ${normalised}`);
    return c.json({ success: true });
  } catch (error: any) {
    console.log("Error in notify-login (silent):", error.message);
    return c.json({ success: true });
  }
});

// ─── Admin dual-password verification ───────────────────────────────
app.post("/make-server-09a7e7d0/access/verify-admin-password", async (c) => {
  try {
    const { email, password, step } = await c.req.json();
    if (!email || !password || !step) {
      return c.json({ error: "Missing required fields" }, 400);
    }

    const normalised = email.trim().toLowerCase();
    if (normalised !== ADMIN_EMAIL) {
      return c.json({ error: "Unauthorised" }, 403);
    }

    // step 1 = first password, step 2 = second password
    const envKey = step === 1 ? "ADMIN_PASSWORD_1" : "ADMIN_PASSWORD_2";
    const storedPassword = Deno.env.get(envKey);

    if (!storedPassword) {
      console.log(`${envKey} not configured in environment`);
      return c.json({ error: "Server misconfiguration" }, 500);
    }

    if (password !== storedPassword) {
      console.log(`Admin password step ${step} failed for ${normalised}`);
      return c.json({ verified: false, error: "Incorrect password" }, 401);
    }

    console.log(`Admin password step ${step} verified for ${normalised}`);
    return c.json({ verified: true });
  } catch (error: any) {
    console.log("Error in verify-admin-password:", error.message);
    return c.json({ error: error.message }, 500);
  }
});

Deno.serve(app.fetch);