import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { ShieldX, ArrowLeft, Loader2, Mail, Lock, ShieldCheck } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "../context/AuthContext";
import svgPaths from "../../imports/svg-vcwu2vcxfq";
import * as api from "../utils/api";

const ADMIN_EMAIL = "talkwithrushi@gmail.com";

type Step = "email" | "otp" | "denied" | "admin-pw1" | "admin-pw2";

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isLoggedIn, login } = useAuth();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const [otpError, setOtpError] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminPwError, setAdminPwError] = useState("");
  const adminPwRef = useRef<HTMLInputElement | null>(null);

  // Resolve the redirect target from query string (e.g. /login?redirect=/courses)
  const redirectTo = searchParams.get("redirect") || "/courses";

  useEffect(() => {
    if (isLoggedIn) navigate(redirectTo, { replace: true });
  }, [isLoggedIn, navigate, redirectTo]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const isAdmin = email.trim().toLowerCase() === ADMIN_EMAIL;

  /* ─── Email step ─── */
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes("@")) return;
    setLoading(true);
    setOtpError("");
    try {
      const result = await api.sendOtp(trimmed);
      if (!result.allowed) {
        setStep("denied");
        api.notifyDeniedLogin(trimmed);
        setLoading(false);
        return;
      }
      setStep("otp");
      setCodeSent(true);
      setResendCooldown(60);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch (err) {
      console.error("Login OTP send failed:", err);
      setOtpError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  /* ─── OTP input handlers ─── */
  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) value = value.slice(-1);
    if (value && !/^\d$/.test(value)) return;
    const newDigits = [...otpDigits];
    newDigits[index] = value;
    setOtpDigits(newDigits);
    setOtpError("");
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
    if (value && index === 5) {
      const code = newDigits.join("");
      if (code.length === 6) verifyCode(code);
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted.length) return;
    const newDigits = [...otpDigits];
    for (let i = 0; i < 6; i++) newDigits[i] = pasted[i] || "";
    setOtpDigits(newDigits);
    const nextEmpty = newDigits.findIndex((d) => !d);
    inputRefs.current[nextEmpty >= 0 ? nextEmpty : 5]?.focus();
    if (pasted.length === 6) verifyCode(pasted);
  };

  /* ─── OTP verification ─── */
  const verifyCode = async (code: string) => {
    setLoading(true);
    setOtpError("");
    try {
      const result = await api.verifyOtp(email.trim(), code);
      if (!result.verified) {
        setOtpError(result.error || "Invalid code. Please try again.");
        setOtpDigits(["", "", "", "", "", ""]);
        setTimeout(() => inputRefs.current[0]?.focus(), 100);
        setLoading(false);
        return;
      }
      // OTP verified
      if (isAdmin) {
        // Admin needs 2 more passwords
        setStep("admin-pw1");
        setAdminPassword("");
        setAdminPwError("");
        setTimeout(() => adminPwRef.current?.focus(), 100);
        setLoading(false);
      } else {
        // Regular user — log in
        api.notifyLogin(email.trim());
        login(email.trim());
        navigate(redirectTo);
      }
    } catch (err) {
      console.error("OTP verification failed:", err);
      setOtpError("Verification failed. Please try again.");
      setLoading(false);
    }
  };

  /* ─── Resend OTP ─── */
  const handleResendCode = async () => {
    if (resendCooldown > 0) return;
    setLoading(true);
    try {
      await api.sendOtp(email.trim());
      setResendCooldown(60);
      setOtpDigits(["", "", "", "", "", ""]);
      setOtpError("");
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch {
      setOtpError("Failed to resend. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  /* ─── Admin password steps ─── */
  const handleAdminPwSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const pw = adminPassword.trim();
    if (!pw) return;
    setLoading(true);
    setAdminPwError("");
    const pwStep = step === "admin-pw1" ? 1 : 2;
    try {
      const result = await api.verifyAdminPassword(email.trim(), pw, pwStep);
      if (!result.verified) {
        setAdminPwError(result.error || "Incorrect password.");
        setAdminPassword("");
        adminPwRef.current?.focus();
        setLoading(false);
        return;
      }
      if (pwStep === 1) {
        // Move to second password
        setStep("admin-pw2");
        setAdminPassword("");
        setAdminPwError("");
        setTimeout(() => adminPwRef.current?.focus(), 100);
        setLoading(false);
      } else {
        // Both passwords verified — log in admin
        login(email.trim());
        navigate(redirectTo);
      }
    } catch (err) {
      console.error("Admin password verification failed:", err);
      setAdminPwError("Verification failed. Please try again.");
      setLoading(false);
    }
  };

  /* ─── Shared: admin password card ─── */
  const renderAdminPwCard = (pwStep: 1 | 2) => (
    <motion.div
      key={`admin-pw${pwStep}-step`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
    >
      <div className="rounded-3xl bg-white/40 backdrop-blur-2xl border border-white/40 shadow-2xl overflow-hidden px-5 py-5">
        <button
          onClick={() => {
            if (pwStep === 1) {
              setStep("email");
              setOtpDigits(["", "", "", "", "", ""]);
            } else {
              setStep("admin-pw1");
            }
            setAdminPassword("");
            setAdminPwError("");
          }}
          className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-800 mb-4 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <div className="flex items-center gap-2.5 mb-4">
          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-purple-500 to-orange-500 flex items-center justify-center shrink-0">
            {pwStep === 1 ? (
              <Lock className="h-4 w-4 text-white" />
            ) : (
              <ShieldCheck className="h-4 w-4 text-white" />
            )}
          </div>
          <div>
            <p className="text-[13px] font-semibold text-gray-800">
              Admin Verification {pwStep}/2
            </p>
            <p className="text-[11px] text-gray-500">
              {pwStep === 1 ? "Enter your first security key" : "Enter your second security key"}
            </p>
          </div>
        </div>

        <form onSubmit={handleAdminPwSubmit}>
          <input
            ref={adminPwRef}
            type="password"
            placeholder={pwStep === 1 ? "First password" : "Second password"}
            value={adminPassword}
            onChange={(e) => { setAdminPassword(e.target.value); setAdminPwError(""); }}
            autoFocus
            className="w-full h-[48px] px-4 bg-white/60 rounded-xl border-2 border-gray-200 text-[16px] text-gray-900 placeholder:text-gray-400 outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-200/50 transition-all"
          />

          <AnimatePresence>
            {adminPwError && (
              <motion.p
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-xs text-red-500 mt-2 font-medium"
              >
                {adminPwError}
              </motion.p>
            )}
          </AnimatePresence>

          <button
            type="submit"
            disabled={loading || !adminPassword.trim()}
            className="mt-4 w-full h-[48px] rounded-xl bg-gray-900 text-white text-[15px] font-semibold
                       active:scale-[0.97] transition-all disabled:opacity-50 disabled:pointer-events-none
                       flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Verifying...
              </>
            ) : pwStep === 1 ? (
              "Continue"
            ) : (
              <>
                <ShieldCheck className="h-4 w-4" />
                Sign In
              </>
            )}
          </button>
        </form>
      </div>

      {/* Security badge */}
      <div className="mt-4 flex items-center justify-center gap-1.5">
        <div className="flex gap-0.5">
          <div className={`h-1.5 w-6 rounded-full ${pwStep >= 1 ? "bg-green-400" : "bg-white/20"}`} />
          <div className={`h-1.5 w-6 rounded-full ${pwStep >= 2 ? "bg-green-400" : "bg-white/20"}`} />
        </div>
        <p className="text-[10px] text-white/40 ml-1">Dual-factor admin security</p>
      </div>
    </motion.div>
  );

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden bg-white">
      {/* ── Gradient blob background ── */}
      <div className="absolute inset-0">
        <div className="absolute w-[45vw] h-[45vw] rounded-full bg-[#6B4BC8] opacity-70 blur-[80px] will-change-transform" style={{ top: '70%', left: '5%', animation: 'blob0 18s ease-in-out infinite' }} />
        <div className="absolute w-[50vw] h-[50vw] rounded-full bg-[#904498] opacity-70 blur-[80px] will-change-transform" style={{ top: '5%', right: '-5%', animation: 'blob1 22s ease-in-out infinite' }} />
        <div className="absolute w-[55vw] h-[55vw] rounded-full bg-[#DE6231] opacity-70 blur-[80px] will-change-transform" style={{ top: '10%', left: '-10%', animation: 'blob2 20s ease-in-out infinite' }} />
        <div className="absolute w-[48vw] h-[48vw] rounded-full bg-[#CA3C43] opacity-70 blur-[80px] will-change-transform" style={{ bottom: '5%', right: '0%', animation: 'blob3 16s ease-in-out infinite' }} />
        <div className="absolute w-[40vw] h-[40vw] rounded-full bg-[#6B4BC8] opacity-60 blur-[80px] will-change-transform" style={{ top: '40%', left: '30%', animation: 'blob4 24s ease-in-out infinite' }} />
        <style>{`
          @keyframes blob0 { 0%,100%{transform:translate(0,0)} 20%{transform:translate(30vw,-35vh)} 40%{transform:translate(-10vw,15vh)} 60%{transform:translate(40vw,-20vh)} 80%{transform:translate(10vw,30vh)} }
          @keyframes blob1 { 0%,100%{transform:translate(0,0)} 20%{transform:translate(-30vw,40vh)} 40%{transform:translate(15vw,-15vh)} 60%{transform:translate(-20vw,30vh)} 80%{transform:translate(10vw,-35vh)} }
          @keyframes blob2 { 0%,100%{transform:translate(0,0)} 20%{transform:translate(40vw,20vh)} 40%{transform:translate(-8vw,45vh)} 60%{transform:translate(30vw,-15vh)} 80%{transform:translate(-15vw,35vh)} }
          @keyframes blob3 { 0%,100%{transform:translate(0,0)} 20%{transform:translate(-25vw,-40vh)} 40%{transform:translate(15vw,20vh)} 60%{transform:translate(-35vw,-15vh)} 80%{transform:translate(20vw,35vh)} }
          @keyframes blob4 { 0%,100%{transform:translate(0,0)} 20%{transform:translate(-20vw,30vh)} 40%{transform:translate(30vw,-20vh)} 60%{transform:translate(-15vw,-30vh)} 80%{transform:translate(25vw,18vh)} }
        `}</style>
      </div>

      {/* ── Content layer ── */}
      <div className="relative flex flex-1 flex-col items-center justify-center px-6">
        {/* ── Logo + wordmark ── */}
        <div className="flex flex-col items-center justify-center mb-8">
          <svg
            className="w-52 h-auto drop-shadow-lg"
            fill="none"
            viewBox="200 580 700 740"
            style={{ mixBlendMode: "exclusion", filter: "saturate(1.5) contrast(1.05)" }}
          >
            <g>
              <path d={svgPaths.p3c555cc0} fill="rgba(255,255,255,0.88)" />
              <path d={svgPaths.p15749d00} fill="rgba(255,255,255,0.88)" />
              <path d={svgPaths.p2ceeff00} fill="rgba(255,255,255,0.88)" />
              <path d={svgPaths.pfa0a100} fill="rgba(255,255,255,0.88)" />
              <path d={svgPaths.p18900a00} fill="rgba(255,255,255,0.88)" />
              <path d={svgPaths.p2090b700} fill="rgba(255,255,255,0.88)" />
              <path d={svgPaths.p3a5c9400} fill="rgba(255,255,255,0.88)" />
              <path d={svgPaths.p33ea31f0} fill="rgba(255,255,255,0.88)" />
              <path d={svgPaths.p1420a400} fill="rgba(255,255,255,0.88)" />
              <path d={svgPaths.p3890b900} fill="rgba(255,255,255,0.88)" />
              <path d={svgPaths.pee6f580} fill="rgba(255,255,255,0.88)" />
              <path d={svgPaths.p11263080} fill="rgba(255,255,255,0.88)" />
              <path d={svgPaths.p37715180} fill="rgba(255,255,255,0.88)" />
              <path d={svgPaths.p2ed03a80} fill="rgba(255,255,255,0.88)" />
              <path d={svgPaths.p61113c0} fill="rgba(255,255,255,0.88)" />
              <motion.g style={{ transformOrigin: "467px 830px" }} animate={{ scaleY: [1, 0.7, 1] }} transition={{ repeat: Infinity, duration: 1.2, delay: 0.3, ease: "easeInOut" }}>
                <path d={svgPaths.p1f000b00} fill="rgba(255,255,255,0.72)" />
                <path d={svgPaths.p25d3e580} fill="rgba(255,255,255,0.72)" />
              </motion.g>
              <motion.g style={{ transformOrigin: "498px 833px" }} animate={{ scaleY: [1, 0.5, 1] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0.1, ease: "easeInOut" }}>
                <path d={svgPaths.p1645d80} fill="rgba(255,255,255,0.68)" />
                <path d={svgPaths.p2e628900} fill="rgba(255,255,255,0.68)" />
              </motion.g>
              <motion.g style={{ transformOrigin: "529px 832px" }} animate={{ scaleY: [1, 0.4, 1] }} transition={{ repeat: Infinity, duration: 1.7, delay: 0, ease: "easeInOut" }}>
                <path d={svgPaths.p24f19f00} fill="rgba(255,255,255,0.62)" />
                <path d={svgPaths.pd106880} fill="rgba(255,255,255,0.62)" />
              </motion.g>
              <motion.g style={{ transformOrigin: "621px 860px" }} animate={{ scaleY: [1, 0.4, 1] }} transition={{ repeat: Infinity, duration: 1.6, delay: 0.15, ease: "easeInOut" }}>
                <path d={svgPaths.p2a93180} fill="rgba(255,255,255,0.62)" />
              </motion.g>
              <motion.g style={{ transformOrigin: "652px 853px" }} animate={{ scaleY: [1, 0.55, 1] }} transition={{ repeat: Infinity, duration: 1.35, delay: 0.25, ease: "easeInOut" }}>
                <path d={svgPaths.p38b46f00} fill="rgba(255,255,255,0.68)" />
              </motion.g>
              <motion.g style={{ transformOrigin: "683px 843px" }} animate={{ scaleY: [1, 0.65, 1] }} transition={{ repeat: Infinity, duration: 1.15, delay: 0.35, ease: "easeInOut" }}>
                <path d={svgPaths.p2d5efec0} fill="rgba(255,255,255,0.72)" />
                <path d={svgPaths.p3ba50600} fill="rgba(255,255,255,0.72)" />
                <path d={svgPaths.p3ce7b880} fill="rgba(255,255,255,0.72)" />
              </motion.g>
              <motion.g style={{ transformOrigin: "737px 820px" }} animate={{ scaleY: [1, 0.75, 1] }} transition={{ repeat: Infinity, duration: 1.05, delay: 0.45, ease: "easeInOut" }}>
                <path d={svgPaths.p1c5c4880} fill="rgba(255,255,255,0.72)" />
                <path d={svgPaths.p31109e00} fill="rgba(255,255,255,0.72)" />
              </motion.g>
            </g>
            <g>
              <path d={svgPaths.p19abc00} fill="rgba(255,255,255,0.92)" />
              <path d={svgPaths.p357bdb00} fill="rgba(255,255,255,0.92)" />
              <path d={svgPaths.pc335a40} fill="rgba(255,255,255,0.92)" />
              <path d={svgPaths.p220ea900} fill="rgba(255,255,255,0.92)" />
            </g>
            <path d={svgPaths.p3a114300} fill="#DE5E29" />
          </svg>
        </div>

        {/* ── Card area ── */}
        <div className="w-full max-w-sm shrink-0">
          <AnimatePresence mode="wait">
            {/* ═══ STEP: EMAIL ═══ */}
            {step === "email" && (
              <motion.div key="email-step" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
                <div className="rounded-3xl bg-white/40 backdrop-blur-2xl border border-white/40 shadow-2xl overflow-hidden">
                  <form onSubmit={handleEmailSubmit}>
                    <div className="px-5 pt-1">
                      <input
                        type="email"
                        placeholder="Enter your email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full h-[52px] bg-transparent text-[16px] text-gray-800 placeholder:text-gray-500 outline-none"
                      />
                    </div>
                  </form>
                </div>
                <button
                  type="submit"
                  disabled={loading || !email.trim().includes("@")}
                  onClick={handleEmailSubmit}
                  className="mt-4 w-full h-[52px] rounded-2xl bg-white text-gray-900 text-[17px] font-semibold active:scale-[0.97] transition-all shadow-lg disabled:opacity-60 disabled:pointer-events-none flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Checking...</>
                  ) : (
                    <><Mail className="h-4 w-4" /> Continue with Email</>
                  )}
                </button>
                <p className="text-[11px] text-white/40 text-center mt-4 leading-relaxed px-4">
                  We'll send a one-time sign-in code to your email. No password needed.
                </p>
              </motion.div>
            )}

            {/* ═══ STEP: OTP ═══ */}
            {step === "otp" && (
              <motion.div key="otp-step" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
                <div className="rounded-3xl bg-white/40 backdrop-blur-2xl border border-white/40 shadow-2xl overflow-hidden px-5 py-5">
                  <button onClick={() => { setStep("email"); setOtpDigits(["","","","","",""]); setOtpError(""); }} className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-800 mb-4 transition-colors">
                    <ArrowLeft className="h-4 w-4" /> Back
                  </button>
                  <p className="text-[14px] text-gray-700 leading-relaxed mb-1">Enter the 6-digit code sent to</p>
                  <p className="text-[15px] font-semibold text-gray-900 mb-5">{email.trim()}</p>
                  <div className="flex gap-2 justify-center mb-4" onPaste={handleOtpPaste}>
                    {otpDigits.map((digit, i) => (
                      <input
                        key={i}
                        ref={(el) => { inputRefs.current[i] = el; }}
                        type="text" inputMode="numeric" maxLength={1}
                        value={digit}
                        onChange={(e) => handleOtpChange(i, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(i, e)}
                        disabled={loading}
                        className={`w-11 h-14 text-center text-[22px] font-bold rounded-xl border-2 bg-white/60 outline-none transition-all ${otpError ? "border-red-300 text-red-600" : "border-gray-200 text-gray-900 focus:border-purple-400 focus:ring-2 focus:ring-purple-200/50"} disabled:opacity-50`}
                      />
                    ))}
                  </div>
                  <AnimatePresence>
                    {otpError && (
                      <motion.p initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-xs text-red-500 text-center mb-3 font-medium">{otpError}</motion.p>
                    )}
                  </AnimatePresence>
                  {loading && (
                    <div className="flex items-center justify-center gap-2 mb-3">
                      <Loader2 className="h-4 w-4 animate-spin text-purple-500" />
                      <span className="text-sm text-gray-500">Verifying...</span>
                    </div>
                  )}
                  <div className="text-center">
                    <button onClick={handleResendCode} disabled={resendCooldown > 0 || loading} className="text-[13px] text-purple-600 font-medium disabled:text-gray-400 disabled:cursor-not-allowed transition-colors">
                      {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend code"}
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-white/40 text-center mt-4 leading-relaxed px-4">
                  Code expires in 10 minutes. Check your spam folder if you don't see it.
                </p>
              </motion.div>
            )}

            {/* ═══ STEP: DENIED ═══ */}
            {step === "denied" && (
              <motion.div key="denied-step" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
                <div className="rounded-3xl bg-white/40 backdrop-blur-2xl border border-red-200/60 shadow-2xl overflow-hidden px-5 py-5">
                  <div className="text-center mb-4">
                    <ShieldX className="h-10 w-10 text-red-400 mx-auto mb-3" />
                    <h3 className="text-lg font-bold text-gray-800">Invite Only</h3>
                  </div>
                  <p className="text-[13px] text-gray-600 leading-relaxed text-center mb-4">
                    Voca is currently available by invitation only. Access is restricted to
                    individuals who have been approved and have executed a Non-Disclosure
                    Agreement (NDA) with <strong>What's On! Campus Pty Ltd</strong>.
                  </p>
                  <div className="p-3 rounded-xl bg-red-50/80 border border-red-100 mb-4">
                    <p className="text-[11px] text-red-700/80 leading-relaxed text-justify">
                      <strong>Confidential &amp; Privileged.</strong> This application and its
                      contents are strictly confidential and intended only for authorised
                      recipients who have signed an NDA with What's On! Campus Pty Ltd
                      (ABN 75 673 795 465). Unauthorised access attempts are logged and may
                      constitute a breach of the <em>Privacy Act 1988</em> (Cth), the{" "}
                      <em>Corporations Act 2001</em> (Cth), and applicable laws of New South
                      Wales, Australia.
                    </p>
                  </div>
                  <button
                    onClick={() => { setStep("email"); setEmail(""); }}
                    className="w-full h-11 rounded-xl bg-gray-800 text-white text-sm font-semibold active:scale-[0.97] transition-all flex items-center justify-center gap-2"
                  >
                    <ArrowLeft className="h-4 w-4" /> Try a different email
                  </button>
                </div>
              </motion.div>
            )}

            {/* ═══ STEP: ADMIN PASSWORD 1 ═══ */}
            {step === "admin-pw1" && renderAdminPwCard(1)}

            {/* ═══ STEP: ADMIN PASSWORD 2 ═══ */}
            {step === "admin-pw2" && renderAdminPwCard(2)}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}