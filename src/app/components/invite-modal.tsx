import React, { useState, useEffect, useCallback } from "react";
import { sendInvite, getInvites, deleteInvite, resendInvite, uploadEmailLogo, getEmailLogoUrl, sendSmsInvite } from "../lib/api";
import {
  X, Send, Loader2, Trash2, RefreshCw, Mail, User,
  UserPlus, CheckCircle2, Clock, Sparkles, Eye, EyeOff, Phone, MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import svgPaths from "../../imports/svg-6bmvk84f5e";

interface Invite {
  id: string;
  email?: string;
  phone?: string;
  recipient_name?: string;
  personal_message?: string;
  status: string;
  sent_at: string;
  resent_at?: string;
  type?: "email" | "sms";
}

interface InviteModalProps {
  open: boolean;
  onClose: () => void;
  senderName?: string;
}

function timeAgo(dateStr: string): string {
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  } catch {
    return "";
  }
}

/* ═══════════════════════════════════════════════════════════════════
   Canvas-based static PNG generator for the email logo.
   Renders the pastel gradient, 3 refractive glass bubbles, and the
   white "C" with chromatic aberration — identical to the splash screen
   but as a flat raster image that Gmail/Outlook can display.
   ═══════════════════════════════════════════════════════════════════ */
const C_PATH = svgPaths.p15267700;
const C_VB = { w: 438.776, h: 536.282 };

function drawCPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, alpha: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(w / C_VB.w, h / C_VB.h);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  const p = new Path2D(C_PATH);
  ctx.fill(p);
  ctx.restore();
}

function drawBubble(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number,
  strokeColors: [string, string],
  cX: number, cY: number, cW: number, cH: number,
) {
  const dx = r > 40 ? 1.5 : 1;
  ctx.save();
  // Clip to circle
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.save();
  ctx.clip();
  // Refracted C inside bubble — main white
  drawCPath(ctx, cX, cY, cW, cH, "#ffffff", 0.55);
  // Chromatic splits
  drawCPath(ctx, cX + dx, cY - 0.5, cW, cH, "#ffb0a0", 0.2);
  drawCPath(ctx, cX - dx, cY + 0.5, cW, cH, "#90b8ff", 0.2);
  drawCPath(ctx, cX + 0.5, cY + dx, cW, cH, "#d4ff90", 0.1);
  // Specular highlight inside bubble
  const spec = ctx.createRadialGradient(cx - r * 0.15, cy - r * 0.2, 0, cx - r * 0.15, cy - r * 0.2, r * 0.55);
  spec.addColorStop(0, "rgba(255,255,255,0.5)");
  spec.addColorStop(0.35, "rgba(255,255,255,0.15)");
  spec.addColorStop(1, "transparent");
  ctx.fillStyle = spec;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
  // Gradient stroke ring
  const grad = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
  grad.addColorStop(0, strokeColors[0]);
  grad.addColorStop(1, strokeColors[1]);
  ctx.strokeStyle = grad;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.arc(cx, cy, r - 0.75, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

async function generateEmailBannerCanvas(): Promise<string> {
  const S = 2; // 2x retina resolution
  const W = 520 * S; // Full email width
  const H = 280 * S; // Header height
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // ── Full-width pastel gradient background (135deg) ──
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#f8c0d8");
  bg.addColorStop(0.25, "#d8b4fe");
  bg.addColorStop(0.55, "#93c5fd");
  bg.addColorStop(1, "#99f6e4");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // ── Logo area: 180×180 at 2x = 360×360, centered horizontally ──
  const logoSize = 180 * S;
  const logoX = (W - logoSize) / 2; // 340
  const logoY = 28 * S; // top padding

  // Frosted glass rounded-rect behind the logo (the purple-ish app-icon shape)
  const rrW = 190 * S, rrH = 190 * S;
  const rrX = (W - rrW) / 2, rrY = logoY - 5 * S;
  const rrR = 32 * S;
  ctx.save();
  ctx.globalAlpha = 0.22;
  const rrGrad = ctx.createLinearGradient(rrX, rrY, rrX + rrW, rrY + rrH);
  rrGrad.addColorStop(0, "#b8a0d8");
  rrGrad.addColorStop(1, "#8090c0");
  ctx.fillStyle = rrGrad;
  ctx.beginPath();
  ctx.roundRect(rrX, rrY, rrW, rrH, rrR);
  ctx.fill();
  ctx.restore();

  // Bubble math — positions relative to the 180×180 logo area
  const SC = 1.12;
  const cW = 130 * SC * S;
  const cH = 160 * SC * S;
  const b1cx = 75, b1ox = 45, b1oy = 20;
  const b2cx = 57.5, b2ox = -40, b2oy = -65;
  const b3cx = 35, b3ox = -80, b3oy = 25;
  const b1cLeft = (b1cx + (b1ox - b1cx) * SC) * S;
  const b1cTop = (b1cx + (b1oy - b1cx) * SC) * S;
  const b2cLeft = (b2cx + (b2ox - b2cx) * SC) * S;
  const b2cTop = (b2cx + (b2oy - b2cx) * SC) * S;
  const b3cLeft = (b3cx + (b3ox - b3cx) * SC) * S;
  const b3cTop = (b3cx + (b3oy - b3cx) * SC) * S;

  // Bubble 1 — large, top-left
  const b1r = 75 * S;
  const b1x = logoX + (-20 + 75) * S, b1y = logoY + (-10 + 75) * S;
  drawBubble(ctx, b1x, b1y, b1r, ["rgba(243,255,79,0.6)", "rgba(112,126,192,0.6)"],
    b1x - b1r + b1cLeft, b1y - b1r + b1cTop, cW, cH);

  // Bubble 2 — medium, bottom-right
  const b2r = 57.5 * S;
  const b2x = logoX + (65 + 57.5) * S, b2y = logoY + (75 + 57.5) * S;
  drawBubble(ctx, b2x, b2y, b2r, ["rgba(255,255,255,0.6)", "rgba(152,193,234,0.6)"],
    b2x - b2r + b2cLeft, b2y - b2r + b2cTop, cW, cH);

  // Bubble 3 — small, top-right
  const b3r = 35 * S;
  const b3x = logoX + (105 + 35) * S, b3y = logoY + (-15 + 35) * S;
  drawBubble(ctx, b3x, b3y, b3r, ["rgba(255,255,255,0.6)", "rgba(196,181,253,0.6)"],
    b3x - b3r + b3cLeft, b3y - b3r + b3cTop, cW, cH);

  // Main C letter — white with drop shadow
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.12)";
  ctx.shadowBlur = 14 * S;
  ctx.shadowOffsetY = 3 * S;
  drawCPath(ctx, logoX + 25 * S, logoY + 10 * S, 130 * S, 160 * S, "#ffffff", 0.92);
  ctx.restore();

  // ── "Chrono" title text ──
  const titleY = logoY + logoSize + 20 * S;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = `700 ${20 * S}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;
  ctx.fillStyle = "#1e1b4b";
  ctx.fillText("Chrono", W / 2, titleY);
  ctx.restore();

  // ── "CALM, UNIFIED & PERSONALISED" tagline ──
  const tagY = titleY + 24 * S + 4 * S;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = `500 ${10 * S}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;
  ctx.letterSpacing = `${1.5 * S}px`;
  ctx.fillStyle = "#4a3a6a";
  ctx.fillText("CALM, UNIFIED & PERSONALISED", W / 2, tagY);
  ctx.restore();

  return canvas.toDataURL("image/png");
}

// Singleton promise to avoid double uploads
let _logoUploadPromise: Promise<void> | null = null;

async function ensureEmailLogoUploaded() {
  if (_logoUploadPromise) return _logoUploadPromise;
  _logoUploadPromise = (async () => {
    try {
      const { url } = await getEmailLogoUrl();
      if (url) {
        console.log("Email logo already exists:", url);
        return;
      }
      console.log("Generating email logo canvas...");
      const base64 = await generateEmailBannerCanvas();
      const res = await uploadEmailLogo(base64);
      console.log("Email logo uploaded:", res);
    } catch (e) {
      console.error("Failed to ensure email logo:", e);
      _logoUploadPromise = null; // Allow retry
    }
  })();
  return _logoUploadPromise;
}

/* ═══════════════════════════════════════════════════════════════════
   Exact GlassBubble from splash-screen.tsx
*/
function GlassBubble({
  size, cLeft, cTop, cWidth, cHeight,
  strokeViewBox, strokePath, strokeGradient,
  specX, specY,
}: {
  size: number; cLeft: number; cTop: number; cWidth: number; cHeight: number;
  strokeViewBox: string; strokePath: React.ReactNode;
  strokeGradient: React.ReactNode;
  specX: number; specY: number;
}) {
  const dx = size > 80 ? 3 : 2;
  return (
    <>
      <div style={{ position: "absolute", inset: 0, borderRadius: "50%", overflow: "hidden" }}>
        {/* Main refracted C — white */}
        <div style={{ position: "absolute", left: cLeft, top: cTop, width: cWidth, height: cHeight, opacity: 0.55 }}>
          <svg viewBox="0 0 438.776 536.282" style={{ width: "100%", height: "100%" }} fill="none">
            <path d={svgPaths.p15267700} fill="white" />
          </svg>
        </div>
        {/* Chromatic split — red */}
        <div style={{ position: "absolute", left: cLeft + dx, top: cTop - 1, width: cWidth, height: cHeight, opacity: 0.2, mixBlendMode: "screen" as const }}>
          <svg viewBox="0 0 438.776 536.282" style={{ width: "100%", height: "100%" }} fill="none">
            <path d={svgPaths.p15267700} fill="#ffb0a0" />
          </svg>
        </div>
        {/* Chromatic split — blue */}
        <div style={{ position: "absolute", left: cLeft - dx, top: cTop + 1, width: cWidth, height: cHeight, opacity: 0.2, mixBlendMode: "screen" as const }}>
          <svg viewBox="0 0 438.776 536.282" style={{ width: "100%", height: "100%" }} fill="none">
            <path d={svgPaths.p15267700} fill="#90b8ff" />
          </svg>
        </div>
        {/* Chromatic split — green */}
        <div style={{ position: "absolute", left: cLeft + 1, top: cTop + dx, width: cWidth, height: cHeight, opacity: 0.1, mixBlendMode: "screen" as const }}>
          <svg viewBox="0 0 438.776 536.282" style={{ width: "100%", height: "100%" }} fill="none">
            <path d={svgPaths.p15267700} fill="#d4ff90" />
          </svg>
        </div>
        {/* Specular highlight */}
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: `radial-gradient(circle at ${specX}% ${specY}%, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.15) 20%, transparent 55%)`, pointerEvents: "none" as const }} />
        {/* Inner glass shadow */}
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", boxShadow: "inset 0 0 8px 2px rgba(255,255,255,0.18), inset 0 0 20px 4px rgba(180,210,255,0.06)", pointerEvents: "none" as const }} />
      </div>
      {/* Gradient stroke ring */}
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} fill="none" viewBox={strokeViewBox}>
        {strokePath}
        <defs>{strokeGradient}</defs>
      </svg>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   SplashLogo — exact replica of the splash-screen C + 3 refractive
   bubbles, rendered at a smaller scale for the email preview.
   Uses identical math, proportions, and SVG paths.
   ═══════════════════════════════════════════════════════════════════ */
function SplashLogo({ scale = 0.5 }: { scale?: number }) {
  // Identical bubble math from splash-screen.tsx
  const S = 1.12;
  const cW = 130 * S;
  const cH = 160 * S;
  const b1cx = 75, b1ox = 25 - (-20), b1oy = 10 - (-10);
  const b2cx = 57.5, b2ox = 25 - 65, b2oy = 10 - 75;
  const b3cx = 35, b3ox = 25 - 105, b3oy = 10 - (-15);

  const b1Left = b1cx + (b1ox - b1cx) * S;
  const b1Top = b1cx + (b1oy - b1cx) * S;
  const b2Left = b2cx + (b2ox - b2cx) * S;
  const b2Top = b2cx + (b2oy - b2cx) * S;
  const b3Left = b3cx + (b3ox - b3cx) * S;
  const b3Top = b3cx + (b3oy - b3cx) * S;

  const displaySize = 180 * scale;

  return (
    <div
      style={{
        width: displaySize,
        height: displaySize,
        position: "relative",
        margin: "0 auto",
      }}
    >
      {/* Breathing keyframes — same as splash */}
      <style>{`
        @keyframes ep-sb1-breathe { 0%,100%{transform:translate(0,0) scale(1)} 25%{transform:translate(6px,2px) scale(1.04)} 50%{transform:translate(3px,-4px) scale(1.02)} 75%{transform:translate(-3px,3px) scale(1.05)} }
        @keyframes ep-sb2-breathe { 0%,100%{transform:translate(0,0) scale(1)} 25%{transform:translate(-5px,-3px) scale(1.05)} 50%{transform:translate(2px,-6px) scale(0.98)} 75%{transform:translate(-3px,2px) scale(1.03)} }
        @keyframes ep-sb3-breathe { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(-5px,5px) scale(1.08)} 66%{transform:translate(3px,-3px) scale(0.96)} }
      `}</style>

      {/* Inner container at native 180x180, scaled down */}
      <div
        style={{
          width: 180,
          height: 180,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          position: "relative",
        }}
      >
        {/* Main C letter — white with drop shadow */}
        <div className="absolute" style={{ width: 130, height: 160, left: 25, top: 10 }}>
          <svg style={{ width: "100%", height: "100%", filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.08))" }} fill="none" viewBox="0 0 438.776 536.282">
            <path d={svgPaths.p15267700} fill="white" fillOpacity="0.9" />
          </svg>
        </div>

        {/* Bubble 1 — large, top-left (yellow→purple stroke) */}
        <div className="absolute pointer-events-none" style={{ width: 150, height: 150, left: -20, top: -10, animation: "ep-sb1-breathe 7s ease-in-out infinite" }}>
          <GlassBubble size={150} cLeft={b1Left} cTop={b1Top} cWidth={cW} cHeight={cH}
            specX={35} specY={30} strokeViewBox="0 0 492 492"
            strokePath={<path d={svgPaths.p272f8700} stroke="url(#ep-sb1sg)" strokeOpacity="0.7" strokeWidth="3" />}
            strokeGradient={<linearGradient gradientUnits="userSpaceOnUse" id="ep-sb1sg" x1="0" x2="492" y1="246" y2="246"><stop stopColor="#F3FF4F" /><stop offset="1" stopColor="#707EC0" /></linearGradient>}
          />
        </div>

        {/* Bubble 2 — medium, bottom-right (white→blue stroke) */}
        <div className="absolute pointer-events-none" style={{ width: 115, height: 115, left: 65, top: 75, animation: "ep-sb2-breathe 9s ease-in-out infinite" }}>
          <GlassBubble size={115} cLeft={b2Left} cTop={b2Top} cWidth={cW} cHeight={cH}
            specX={38} specY={28} strokeViewBox="0 0 346 346"
            strokePath={<circle cx="173" cy="173" r="171.5" stroke="url(#ep-sb2sg)" strokeOpacity="0.7" strokeWidth="3" />}
            strokeGradient={<radialGradient cx="0" cy="0" gradientTransform="translate(173 173) scale(173)" gradientUnits="userSpaceOnUse" id="ep-sb2sg" r="1"><stop stopColor="white" /><stop offset="1" stopColor="#98C1EA" /></radialGradient>}
          />
        </div>

        {/* Bubble 3 — small, top-right (white→violet stroke) */}
        <div className="absolute pointer-events-none" style={{ width: 70, height: 70, left: 105, top: -15, animation: "ep-sb3-breathe 11s ease-in-out infinite" }}>
          <GlassBubble size={70} cLeft={b3Left} cTop={b3Top} cWidth={cW} cHeight={cH}
            specX={36} specY={32} strokeViewBox="0 0 492 492"
            strokePath={<path d={svgPaths.p272f8700} stroke="url(#ep-sb3sg)" strokeOpacity="0.5" strokeWidth="4" />}
            strokeGradient={<linearGradient gradientUnits="userSpaceOnUse" id="ep-sb3sg" x1="0" x2="492" y1="100" y2="400"><stop stopColor="#ffffff" /><stop offset="1" stopColor="#c4b5fd" /></linearGradient>}
          />
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Email preview — rendered inside the invite modal.
   Uses exact splash-screen logo + refractive bubbles.
   ═══════════════════════════════════════════════════════════════════ */
function EmailPreview({ senderName, recipientName, personalMessage }: {
  senderName: string;
  recipientName: string;
  personalMessage?: string;
}) {
  const displayName = senderName || "You";
  const firstName = (recipientName || "Friend").split(" ")[0];

  return (
    <div
      style={{
        borderRadius: 14,
        overflow: "hidden",
        boxShadow: "0 2px 12px rgba(46,26,15,0.07)",
        fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
        background: "#fffdf9",
      }}
    >
      {/* ── Header: splash-screen pastel gradient with refractive logo ── */}
      <div
        style={{
          background: "linear-gradient(135deg, #f8c0d8 0%, #d8b4fe 25%, #93c5fd 55%, #99f6e4 100%)",
          textAlign: "center" as const,
          padding: "20px 20px 16px",
          position: "relative" as const,
        }}
      >
        <SplashLogo scale={0.45} />

        <div style={{ fontSize: 16, fontWeight: 700, color: "#1e1b4b", letterSpacing: -0.3, marginTop: 4 }}>
          Chrono
        </div>
        <div
          style={{
            fontSize: 8,
            color: "#4a3a6a",
            letterSpacing: 1.8,
            textTransform: "uppercase" as const,
            marginTop: 2,
            fontWeight: 500,
          }}
        >
          Calm, Unified & Personalised
        </div>
      </div>

      {/* ── Hook ── */}
      <div style={{ padding: "16px 20px 6px" }}>
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.55, color: "#000000", textAlign: "center" as const }}>
          <strong>{firstName}</strong>, it's time to STOP the "back-and-forth" admin chains.
        </p>
      </div>

      {/* ── Body copy ── */}
      <div style={{ padding: "6px 20px 6px" }}>
        <p style={{ margin: 0, fontSize: 10.5, lineHeight: 1.65, color: "#000000", textAlign: "center" as const }}>
          If you're still using a basic calendar and a notes app to run your life, you're working too hard. Chrono is Australia's first Conversational Calendar that turns your "yap" into a plan. Like ChatGPT but for your Calendar + Admin Work (and STILL secure)!
        </p>
        <p style={{ margin: "10px 0 0", fontSize: 10.5, lineHeight: 1.65, color: "#000000", textAlign: "center" as const }}>
          Find time for meetings, find time away from meetings, sync shared lists, and get your news &mdash; all in one place, all via chat! Chrono is <strong>INVITE-ONLY</strong> and you are one of the very few people to get to try it!
        </p>

        {/* Personal message */}
        {personalMessage && (
          <div
            style={{
              margin: "12px 0 8px",
              padding: "10px 14px",
              background: "rgba(92,58,32,0.05)",
              borderLeft: "2px solid #c4a87a",
              borderRadius: "0 8px 8px 0",
              fontStyle: "italic",
              fontSize: 11,
              lineHeight: 1.6,
              color: "#000000",
            }}
          >
            &ldquo;{personalMessage}&rdquo;
            <br />
            <span style={{ fontStyle: "normal", fontSize: 10, color: "#666666" }}>
              &mdash; {displayName}
            </span>
          </div>
        )}
      </div>

      {/* CTA button */}
      <div style={{ textAlign: "center" as const, padding: "14px 20px 6px" }}>
        <div
          style={{
            display: "inline-block",
            padding: "10px 32px",
            borderRadius: 10,
            background: "linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)",
            color: "#fff",
            fontSize: 13,
            fontWeight: 700,
            boxShadow: "0 3px 10px rgba(124,58,237,0.25)",
          }}
        >
          Claim Invite-Only Access
        </div>
      </div>

      {/* Sign-off */}
      <div style={{ textAlign: "center" as const, padding: "12px 20px 16px" }}>
        <div style={{ fontSize: 10.5, color: "#000000" }}>Best,</div>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: "#000000", marginTop: 2 }}>{displayName}</div>
        <div style={{ fontSize: 9, color: "#7a7a7a", marginTop: 1 }}>and The Chrono Team, in spirit!</div>
      </div>

      {/* ── Footer ── */}
      <div
        style={{
          background: "#f8f4ed",
          borderTop: "1px solid #ebe5d8",
          textAlign: "center" as const,
          padding: "10px 16px",
        }}
      >
        <div style={{ fontSize: 9, color: "#9a9080" }}>
          Invite-only access from {displayName}. Chrono-logically perfect!
        </div>
        <div style={{ fontSize: 8, color: "#b0a898", marginTop: 3 }}>
          Created with <span style={{ color: "#c25050" }}>&#9829;</span> by What's On!
        </div>
      </div>
    </div>
  );
}

export function InviteModal({ open, onClose, senderName = "You" }: InviteModalProps) {
  const [email, setEmail] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showMessage, setShowMessage] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [inviteMode, setInviteMode] = useState<"email" | "sms">("email");
  const [phone, setPhone] = useState("");

  const loadInvites = useCallback(async () => {
    try {
      setLoadingInvites(true);
      const data = await getInvites();
      setInvites(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Failed to load invites:", e);
    } finally {
      setLoadingInvites(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadInvites();
      setEmail("");
      setPhone("");
      setRecipientName("");
      setMessage("");
      setShowMessage(false);
      setShowPreview(false);
      setInviteMode("email");
      // Ensure the email logo PNG is uploaded to Supabase Storage
      ensureEmailLogoUploaded();
    }
  }, [open, loadInvites]);

  const handleSend = async () => {
    if (!recipientName.trim()) {
      toast.error("Please enter the recipient's name");
      return;
    }

    if (inviteMode === "sms") {
      // SMS mode: record the invite on server, then open native SMS app
      if (!phone.trim()) {
        toast.error("Please enter a phone number");
        return;
      }
      setSending(true);
      try {
        await sendSmsInvite(phone.trim(), recipientName.trim(), message.trim() || undefined);
        // Build SMS body and open native SMS app
        const smsBody = `Hey ${recipientName.trim().split(" ")[0]}! ${senderName} thinks you should try Chrono — a free conversational calendar app that helps you plan events, set reminders, and more. Check it out: https://Chrono.knowwhatson.com${message.trim() ? `\n\n"${message.trim()}"` : ""}`;
        const smsUrl = `sms:${phone.trim().replace(/[^+\d]/g, "")}?body=${encodeURIComponent(smsBody)}`;
        window.open(smsUrl, "_self");
        toast.success(`SMS invite recorded for ${recipientName.trim()}`);
        setPhone("");
        setRecipientName("");
        setMessage("");
        setShowMessage(false);
        await loadInvites();
      } catch (e: any) {
        toast.error(e.message || "Failed to record SMS invite");
      } finally {
        setSending(false);
      }
      return;
    }

    // Email mode
    if (!email.trim() || !email.includes("@")) {
      toast.error("Please enter a valid email address");
      return;
    }
    setSending(true);
    try {
      await sendInvite(email.trim(), recipientName.trim(), message.trim() || undefined);
      toast.success(`Invitation sent to ${recipientName.trim()}`);
      setEmail("");
      setRecipientName("");
      setMessage("");
      setShowMessage(false);
      setShowPreview(false);
      await loadInvites();
    } catch (e: any) {
      toast.error(e.message || "Failed to send invitation");
    } finally {
      setSending(false);
    }
  };

  const handleResend = async (id: string) => {
    setResendingId(id);
    try {
      await resendInvite(id);
      toast.success("Invitation re-sent!");
      await loadInvites();
    } catch (e: any) {
      toast.error(e.message || "Failed to re-send");
    } finally {
      setResendingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteInvite(id);
      setInvites((prev) => prev.filter((i) => i.id !== id));
      toast.success("Invite removed");
    } catch (e: any) {
      toast.error(e.message || "Failed to remove");
    } finally {
      setDeletingId(null);
    }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={(e) => e.target === e.currentTarget && onClose()}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

          {/* Modal */}
          <motion.div
            initial={{ y: 40, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0, scale: 0.97 }}
            transition={{ type: "spring", damping: 28, stiffness: 350 }}
            className="relative w-full sm:max-w-md bg-background rounded-t-2xl sm:rounded-2xl shadow-2xl border border-border/50 overflow-hidden max-h-[85dvh] flex flex-col"
          >
            {/* Header gradient bar */}
            <div
              className="h-1.5 w-full shrink-0"
              style={{ background: "linear-gradient(135deg, #f8c0d8 0%, #d8b4fe 25%, #93c5fd 55%, #99f6e4 100%)" }}
            />

            {/* Mobile drag indicator */}
            <div className="sm:hidden flex justify-center pt-2 shrink-0">
              <div className="w-8 h-1 rounded-full bg-muted-foreground/20" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg, rgba(196,168,130,0.2), rgba(180,200,230,0.15))" }}
                >
                  <UserPlus className="w-4.5 h-4.5" style={{ color: "#5c3a20" }} />
                </div>
                <div>
                  <h2 className="text-base font-semibold">Invite to Chrono</h2>
                  <p className="text-[11px] text-muted-foreground">Share the productivity love</p>
                </div>
              </div>
              <button onClick={onClose} className="p-2 rounded-xl hover:bg-muted transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-4">
              {/* Send form */}
              <div className="space-y-3">
                {/* Email / SMS mode toggle */}
                <div className="flex gap-1 p-1 bg-muted/40 rounded-xl">
                  <button
                    onClick={() => setInviteMode("email")}
                    className={`flex-1 py-2 text-xs font-medium rounded-lg transition flex items-center justify-center gap-1.5 ${inviteMode === "email" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    <Mail className="w-3.5 h-3.5" /> Email
                  </button>
                  <button
                    onClick={() => setInviteMode("sms")}
                    className={`flex-1 py-2 text-xs font-medium rounded-lg transition flex items-center justify-center gap-1.5 ${inviteMode === "sms" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    <MessageSquare className="w-3.5 h-3.5" /> SMS
                  </button>
                </div>

                {/* Email or Phone input */}
                {inviteMode === "email" ? (
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="email"
                      placeholder="friend@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && !sending && handleSend()}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border bg-muted/30 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
                      autoFocus
                    />
                  </div>
                ) : (
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="tel"
                      placeholder="+61 4XX XXX XXX"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && !sending && handleSend()}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border bg-muted/30 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
                      autoFocus
                    />
                  </div>
                )}

                {/* Recipient name field */}
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Recipient's name"
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border bg-muted/30 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
                  />
                </div>

                {/* Personal message toggle + field */}
                {!showMessage ? (
                  <button
                    onClick={() => setShowMessage(true)}
                    className="text-xs font-medium flex items-center gap-1 transition"
                    style={{ color: "#5c3a20", opacity: 0.7 }}
                  >
                    <Sparkles className="w-3 h-3" /> Add a personal message
                  </button>
                ) : (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    transition={{ duration: 0.2 }}
                  >
                    <textarea
                      placeholder="Hey! You should try Chrono — it's been a game-changer for my productivity..."
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      rows={3}
                      className="w-full px-3.5 py-2.5 rounded-xl border bg-muted/30 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30 transition resize-none"
                    />
                  </motion.div>
                )}

                {/* SMS hint */}
                {inviteMode === "sms" && (
                  <p className="text-[11px] text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
                    <MessageSquare className="w-3 h-3 inline mr-1 -mt-0.5" />
                    This will open your phone's SMS app with a pre-written invite message. The invite is also recorded in Chrono.
                  </p>
                )}

                {/* Preview toggle (email only) */}
                {inviteMode === "email" && (
                  <button
                    onClick={() => setShowPreview((p) => !p)}
                    className="text-xs font-medium flex items-center gap-1 transition text-muted-foreground hover:text-foreground"
                  >
                    {showPreview ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    {showPreview ? "Hide email preview" : "Preview email"}
                  </button>
                )}

                {/* Email preview */}
                <AnimatePresence>
                  {showPreview && inviteMode === "email" && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden"
                    >
                      <EmailPreview
                        senderName={senderName}
                        recipientName={recipientName}
                        personalMessage={message.trim() || undefined}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                <button
                  onClick={handleSend}
                  disabled={sending || (inviteMode === "email" ? !email.trim() : !phone.trim()) || !recipientName.trim()}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: sending ? "rgba(92,58,32,0.5)" : inviteMode === "sms"
                      ? "linear-gradient(135deg, #0d9488 0%, #14b8a6 100%)"
                      : "linear-gradient(135deg, #5c3a20 0%, #7a5234 100%)",
                    boxShadow: sending ? "none" : inviteMode === "sms"
                      ? "0 4px 14px rgba(13,148,136,0.25)"
                      : "0 4px 14px rgba(92,58,32,0.25)",
                  }}
                >
                  {sending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : inviteMode === "sms" ? (
                    <MessageSquare className="w-4 h-4" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  {sending ? "Sending..." : inviteMode === "sms" ? "Open SMS to Send" : "Send Email Invitation"}
                </button>
              </div>

              {/* Sent invites list */}
              {invites.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Sent Invitations ({invites.length})
                    </h3>
                  </div>

                  <div className="space-y-1.5">
                    {invites.map((inv) => (
                      <motion.div
                        key={inv.id}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/30 group"
                      >
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                          style={{ background: "rgba(92,58,32,0.08)" }}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" style={{ color: "#7a5234" }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {inv.recipient_name ? `${inv.recipient_name}` : (inv.email || inv.phone)}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                            {inv.type === "sms" ? <Phone className="w-2.5 h-2.5 shrink-0" /> : <Mail className="w-2.5 h-2.5 shrink-0" />}
                            {inv.email || inv.phone || ""}
                          </p>
                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                            <Clock className="w-2.5 h-2.5" />
                            <span>Sent {timeAgo(inv.resent_at || inv.sent_at)}</span>
                            {inv.resent_at && (
                              <span className="opacity-60">(re-sent)</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          {inv.type !== "sms" && (
                            <button
                              onClick={() => handleResend(inv.id)}
                              disabled={resendingId === inv.id}
                              className="p-1.5 rounded-lg hover:bg-muted transition disabled:opacity-50"
                              title="Re-send"
                            >
                              {resendingId === inv.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                              ) : (
                                <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
                              )}
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(inv.id)}
                            disabled={deletingId === inv.id}
                            className="p-1.5 rounded-lg hover:bg-destructive/10 transition disabled:opacity-50"
                            title="Remove"
                          >
                            {deletingId === inv.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5 text-destructive/70" />
                            )}
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {loadingInvites && invites.length === 0 && (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              )}

              {/* Empty state */}
              {!loadingInvites && invites.length === 0 && (
                <div className="text-center py-4">
                  <p className="text-xs text-muted-foreground">
                    No invitations sent yet. Be the first to share Chrono!
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}