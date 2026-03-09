import React, { useState, useEffect, useMemo } from "react";
import { X, Send, Trash2, Shield, Mail, UserPlus, Loader2, CheckCircle2, Crown, Clock, Eye, ArrowLeft, Timer } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { LoadSplash } from "./LoadSplash";
import * as api from "../utils/api";
import type { AllowedEmailEntry } from "../utils/api";

const ADMIN_EMAIL = "talkwithrushi@gmail.com";

const DURATION_PRESETS = [
  { label: "15 min", value: 15 },
  { label: "30 min", value: 30 },
  { label: "1 hr", value: 60 },
  { label: "2 hr", value: 120 },
  { label: "24 hr", value: 1440 },
  { label: "No limit", value: 0 },
];

interface Props {
  open: boolean;
  onClose: () => void;
  adminEmail: string;
}

function formatDuration(minutes: number): string {
  if (minutes <= 0) return "Unlimited";
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? "s" : ""}`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h} hour${h > 1 ? "s" : ""}${m > 0 ? ` ${m} min` : ""}`;
}

function formatTimeRemaining(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m left`;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  if (hrs < 24) return `${hrs}h ${remainMins}m left`;
  const days = Math.floor(hrs / 24);
  return `${days}d ${hrs % 24}h left`;
}

// Email preview component
function EmailPreview({ email, durationMinutes }: { email: string; durationMinutes: number }) {
  const durationText = durationMinutes > 0 ? formatDuration(durationMinutes) : null;

  return (
    <div className="rounded-2xl overflow-hidden border border-gray-200 bg-white shadow-sm">
      {/* Banner with animated logo-splash */}
      <div className="relative overflow-hidden" style={{
        background: "linear-gradient(135deg, #6B4BC8 0%, #904498 30%, #DE6231 70%, #CA3C43 100%)",
      }}>
        {/* Animated gradient overlay */}
        <div className="absolute inset-0 opacity-30">
          <div className="absolute inset-0 animate-pulse" style={{
            background: "radial-gradient(circle at 30% 50%, rgba(255,255,255,0.3) 0%, transparent 50%)",
          }} />
          <div className="absolute inset-0 animate-pulse" style={{
            background: "radial-gradient(circle at 70% 30%, rgba(255,255,255,0.2) 0%, transparent 40%)",
            animationDelay: "0.5s",
          }} />
        </div>
        <div className="relative flex flex-col items-center py-6">
          <LoadSplash className="w-16 h-14" color="rgba(255,255,255,0.9)" colorLight="rgba(255,255,255,0.6)" />
          <p className="text-[10px] text-white/60 tracking-[1px] mt-1 font-medium italic">Read between the lines</p>
        </div>
      </div>

      {/* Email body */}
      <div className="px-4 py-4">
        <p className="text-[13px] text-gray-700 leading-relaxed">Hi there,</p>
        <p className="text-[13px] text-gray-700 leading-relaxed mt-2">
          You've been invited to join <strong>Voca</strong> — an intelligent speech analytics and assessment platform designed for interviewers, sales people, coaches and educators!
        </p>
        <p className="text-[13px] text-gray-700 leading-relaxed mt-2">
          Your email <strong className="text-gray-900">{email}</strong> has been granted access.
        </p>

        {durationText && (
          <div className="mt-3 p-3 rounded-xl text-center" style={{
            background: "linear-gradient(135deg, #FFF5F5, #FEF3E7)",
            border: "1px solid #FED7AA",
          }}>
            <p className="text-[10px] text-orange-800 font-semibold uppercase tracking-wider">Timed Access</p>
            <p className="text-[17px] font-bold text-orange-700 mt-0.5">{durationText}</p>
            <p className="text-[10px] text-orange-700 mt-0.5">Access will be automatically revoked after this period.</p>
          </div>
        )}

        <div className="mt-3 p-3 rounded-xl bg-gray-50 text-center">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider">Invited by</p>
          <p className="text-[12px] font-semibold text-gray-800 mt-0.5">The Team at <a href="https://chrono.knowwhatson.com" target="_blank" rel="noopener noreferrer" className="text-purple-600 font-bold no-underline hover:underline">ChronoOS</a></p>
        </div>

        <p className="text-[10px] text-gray-400 text-center mt-3">
          Part of <strong><a href="https://chrono.knowwhatson.com" target="_blank" rel="noopener noreferrer" className="text-purple-600 no-underline hover:underline">ChronoOS</a></strong> by What's On!
        </p>

        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-[8px] text-gray-300 leading-relaxed text-justify">
            <strong>Confidential &amp; Privileged.</strong> This demonstration access and communication is intended solely for the named recipient and is strictly confidential. It is intended only for individuals who have executed a Non-Disclosure Agreement (NDA) with What's On! Campus Pty Ltd (ABN 75 673 795 465). If you have received this in error, please notify the sender immediately and delete all copies. Unauthorised use, disclosure, copying or distribution of this material is prohibited and may constitute a breach of the <em>Privacy Act 1988</em> (Cth), the <em>Corporations Act 2001</em> (Cth), and applicable laws of New South Wales, Australia. All rights reserved. &copy; {new Date().getFullYear()} What's On! Campus Pty Ltd.
          </p>
        </div>
      </div>
    </div>
  );
}

export function AdminAccessModal({ open, onClose, adminEmail }: Props) {
  const [emails, setEmails] = useState<AllowedEmailEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(30); // Default 30 min
  const [customDuration, setCustomDuration] = useState("");
  const [sending, setSending] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (open) {
      loadEmails();
      setShowPreview(false);
      setNewEmail("");
      setDurationMinutes(30);
      setCustomDuration("");
    }
  }, [open]);

  // Refresh expiry timers every 30s
  useEffect(() => {
    if (!open) return;
    const interval = setInterval(() => loadEmails(), 30000);
    return () => clearInterval(interval);
  }, [open]);

  const loadEmails = async () => {
    setLoading(true);
    try {
      const list = await api.listAllowedEmails();
      setEmails(list);
    } catch (err) {
      console.error("Failed to load allowed emails:", err);
    } finally {
      setLoading(false);
    }
  };

  const canPreview = newEmail.trim().includes("@");

  const handlePreview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canPreview) return;
    setShowPreview(true);
  };

  const handleSendInvite = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) return;

    setSending(true);
    setSuccessMsg("");
    try {
      const actualDuration = durationMinutes > 0 ? durationMinutes : undefined;
      const result = await api.inviteEmail(email, adminEmail, actualDuration);
      setNewEmail("");
      setShowPreview(false);
      setSuccessMsg(result.emailSent ? `Invite sent to ${email}` : `${email} added (email delivery skipped)`);
      await loadEmails();
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (err: any) {
      setSuccessMsg("");
      alert(err.message || "Failed to invite");
    } finally {
      setSending(false);
    }
  };

  const handleRevoke = async (email: string) => {
    if (email.toLowerCase() === ADMIN_EMAIL) return;
    if (!confirm(`Remove access for ${email}? They will be locked out immediately.`)) return;

    setRevoking(email);
    try {
      await api.revokeEmail(email, adminEmail);
      await loadEmails();
    } catch (err: any) {
      alert(err.message || "Failed to revoke");
    } finally {
      setRevoking(null);
    }
  };

  const handleDurationSelect = (val: number) => {
    setDurationMinutes(val);
    setCustomDuration("");
  };

  const handleCustomDuration = (val: string) => {
    setCustomDuration(val);
    const num = parseInt(val, 10);
    if (!isNaN(num) && num > 0) {
      setDurationMinutes(num);
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
          className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[85vh] flex flex-col overflow-hidden"
          >
            {/* Drag indicator (mobile) */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>

            {/* Header */}
            <div className="px-6 pt-4 pb-3 flex items-center justify-between border-b border-gray-100">
              <div className="flex items-center gap-3">
                {showPreview ? (
                  <button
                    onClick={() => setShowPreview(false)}
                    className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
                  >
                    <ArrowLeft className="h-5 w-5 text-gray-600" />
                  </button>
                ) : (
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
                    <Shield className="h-5 w-5 text-white" />
                  </div>
                )}
                <div>
                  <h2 className="text-lg font-bold text-gray-900">
                    {showPreview ? "Email Preview" : "Access Control"}
                  </h2>
                  <p className="text-xs text-gray-500">
                    {showPreview ? `Sending to ${newEmail.trim()}` : "Invite-only management"}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
              >
                <X className="h-4 w-4 text-gray-500" />
              </button>
            </div>

            <AnimatePresence mode="wait">
              {showPreview ? (
                /* ═══ PREVIEW VIEW ═══ */
                <motion.div
                  key="preview"
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ duration: 0.2 }}
                  className="flex-1 overflow-y-auto"
                >
                  <div className="px-6 py-4">
                    <EmailPreview email={newEmail.trim().toLowerCase()} durationMinutes={durationMinutes} />

                    {/* Access duration info bar */}
                    <div className="mt-4 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-indigo-50 border border-indigo-100">
                      <Timer className="h-4 w-4 text-indigo-500 shrink-0" />
                      <p className="text-xs text-indigo-700 font-medium">
                        {durationMinutes > 0
                          ? `Access expires in ${formatDuration(durationMinutes)} after sending`
                          : "Unlimited access — no expiry"}
                      </p>
                    </div>
                  </div>

                  {/* Send button */}
                  <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50">
                    <button
                      onClick={handleSendInvite}
                      disabled={sending}
                      className="w-full h-12 rounded-2xl bg-indigo-600 text-white font-semibold text-[15px] flex items-center justify-center gap-2 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.97]"
                    >
                      {sending ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <>
                          <Send className="h-4 w-4" />
                          Send Invite
                        </>
                      )}
                    </button>
                    <AnimatePresence>
                      {successMsg && (
                        <motion.p
                          initial={{ opacity: 0, y: -5 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -5 }}
                          className="mt-2 text-xs text-green-600 font-medium flex items-center justify-center gap-1"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> {successMsg}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              ) : (
                /* ═══ MAIN VIEW ═══ */
                <motion.div
                  key="main"
                  initial={{ opacity: 0, x: -30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 30 }}
                  transition={{ duration: 0.2 }}
                  className="flex-1 overflow-y-auto flex flex-col"
                >
                  {/* Invite form */}
                  <form onSubmit={handlePreview} className="px-6 py-4 border-b border-gray-100">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
                      <UserPlus className="h-3.5 w-3.5 inline mr-1" />
                      Send Invite
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="email"
                        placeholder="colleague@university.edu"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        className="flex-1 h-11 px-4 rounded-xl bg-gray-50 border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all"
                        disabled={sending}
                      />
                      <button
                        type="submit"
                        disabled={!canPreview}
                        className="h-11 px-4 rounded-xl bg-indigo-600 text-white font-semibold text-sm flex items-center gap-1.5 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.97]"
                      >
                        <Eye className="h-4 w-4" /> Preview
                      </button>
                    </div>

                    {/* Duration picker */}
                    <div className="mt-3">
                      <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Access Duration
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {DURATION_PRESETS.map((preset) => (
                          <button
                            key={preset.value}
                            type="button"
                            onClick={() => handleDurationSelect(preset.value)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                              durationMinutes === preset.value && !customDuration
                                ? "bg-indigo-600 text-white shadow-sm"
                                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="number"
                          placeholder="Custom (min)"
                          min="1"
                          value={customDuration}
                          onChange={(e) => handleCustomDuration(e.target.value)}
                          className="w-32 h-8 px-3 rounded-lg bg-gray-50 border border-gray-200 text-xs outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all"
                        />
                        {customDuration && (
                          <span className="text-xs text-gray-500">
                            = {formatDuration(parseInt(customDuration, 10) || 0)}
                          </span>
                        )}
                      </div>
                    </div>

                    <AnimatePresence>
                      {successMsg && (
                        <motion.p
                          initial={{ opacity: 0, y: -5 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -5 }}
                          className="mt-2 text-xs text-green-600 font-medium flex items-center gap-1"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> {successMsg}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </form>

                  {/* Email list */}
                  <div className="flex-1 overflow-y-auto px-6 py-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                      <Mail className="h-3.5 w-3.5 inline mr-1" />
                      Allowed Users ({emails.length})
                    </p>

                    {loading ? (
                      <div className="flex items-center justify-center py-10">
                        <Loader2 className="h-6 w-6 animate-spin text-gray-300" />
                      </div>
                    ) : emails.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-8">No users yet. Send an invite above.</p>
                    ) : (
                      <div className="space-y-1">
                        {emails.map((entry) => {
                          const isAdmin = entry.isAdmin || entry.email.toLowerCase() === ADMIN_EMAIL;
                          const isRemoving = revoking === entry.email;
                          const hasExpiry = !!entry.expiresAt;
                          const isExpired = hasExpiry && new Date(entry.expiresAt!).getTime() <= Date.now();

                          return (
                            <motion.div
                              key={entry.email}
                              layout
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: 10 }}
                              className={`flex items-center justify-between px-3 py-2.5 rounded-xl transition-colors ${
                                isAdmin ? "bg-indigo-50" : isExpired ? "bg-red-50" : "bg-gray-50 hover:bg-gray-100"
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className={`h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${
                                  isAdmin ? "bg-gradient-to-br from-purple-500 to-indigo-600" : isExpired ? "bg-red-400" : "bg-gray-400"
                                }`}>
                                  {entry.email[0]?.toUpperCase() || "?"}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-gray-900 truncate">{entry.email}</p>
                                  {isAdmin && (
                                    <p className="text-[10px] text-indigo-600 font-semibold flex items-center gap-0.5">
                                      <Crown className="h-3 w-3" /> Admin
                                    </p>
                                  )}
                                  {!isAdmin && hasExpiry && !isExpired && (
                                    <p className="text-[10px] text-orange-600 font-medium flex items-center gap-0.5">
                                      <Clock className="h-3 w-3" /> {formatTimeRemaining(entry.expiresAt!)}
                                    </p>
                                  )}
                                  {!isAdmin && isExpired && (
                                    <p className="text-[10px] text-red-500 font-medium flex items-center gap-0.5">
                                      <Clock className="h-3 w-3" /> Expired
                                    </p>
                                  )}
                                  {!isAdmin && !hasExpiry && (
                                    <p className="text-[10px] text-gray-400 font-medium">
                                      Unlimited
                                    </p>
                                  )}
                                </div>
                              </div>
                              {!isAdmin && (
                                <button
                                  onClick={() => handleRevoke(entry.email)}
                                  disabled={isRemoving}
                                  className="h-8 w-8 rounded-full flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 transition-all shrink-0"
                                >
                                  {isRemoving ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-4 w-4" />
                                  )}
                                </button>
                              )}
                            </motion.div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/50">
                    <p className="text-[11px] text-gray-400 text-center">
                      Timed access auto-revokes when the period ends. Users are logged out immediately.
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}