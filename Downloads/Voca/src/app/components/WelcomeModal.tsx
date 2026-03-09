import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { Sparkles, X } from "lucide-react";
import { LoadSplash } from "./LoadSplash";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function WelcomeModal({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9998] flex items-center justify-center px-6"
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
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden"
          >
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 z-10 h-8 w-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/40 transition-colors"
            >
              <X className="h-4 w-4 text-white" />
            </button>

            {/* Gradient header with logo */}
            <div
              className="relative overflow-hidden px-6 pt-8 pb-6 text-center"
              style={{
                background: "linear-gradient(135deg, #6B4BC8 0%, #904498 30%, #DE6231 70%, #CA3C43 100%)",
              }}
            >
              <div className="absolute inset-0 opacity-20">
                <div
                  className="absolute inset-0 animate-pulse"
                  style={{
                    background: "radial-gradient(circle at 30% 40%, rgba(255,255,255,0.4) 0%, transparent 50%)",
                  }}
                />
              </div>
              <div className="relative">
                <LoadSplash
                  className="w-16 h-14 mx-auto"
                  color="rgba(255,255,255,0.9)"
                  colorLight="rgba(255,255,255,0.6)"
                />
                <p className="text-white/60 text-[10px] tracking-[1px] mt-1 font-medium italic">
                  Read between the lines
                </p>
              </div>
            </div>

            {/* Body */}
            <div className="px-6 py-5">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-5 w-5 text-amber-500" />
                <h2 className="text-lg font-bold text-gray-900">Welcome to Voca!</h2>
              </div>

              <p className="text-[14px] text-gray-700 leading-relaxed">
                A warm greeting from the{" "}
                <a
                  href="https://chrono.knowwhatson.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-purple-600 hover:underline"
                >
                  ChronoOS
                </a>{" "}
                team by{" "}
                <a
                  href="https://knowwhatson.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-purple-600 hover:underline"
                >
                  What's On!
                </a>
              </p>

              <div className="mt-4 p-3.5 rounded-2xl bg-gradient-to-br from-purple-50 to-orange-50 border border-purple-100/60">
                <p className="text-[13px] text-gray-600 leading-relaxed">
                  The version you're seeing has been{" "}
                  <strong className="text-gray-800">hyper-personalised</strong> as a demo
                  for you. Voca is a versatile speech analytics platform that can cater to{" "}
                  <strong className="text-gray-800">
                    coaches, educators, recruiters, job applicants, sales people
                  </strong>{" "}
                  and more!
                </p>
              </div>

              <button
                onClick={onClose}
                className="mt-5 w-full h-12 rounded-2xl bg-gray-900 text-white font-semibold text-[15px] active:scale-[0.97] transition-all hover:bg-gray-800"
              >
                Let's Go
              </button>

              <p className="text-[9px] text-gray-300 text-center mt-3 leading-relaxed">
                Confidential demo. Intended only for NDA signatories of What's On! Campus Pty Ltd (ABN 75 673 795 465).
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
