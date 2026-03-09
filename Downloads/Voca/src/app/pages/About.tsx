import React, { useState, useRef, useCallback } from "react";
import { motion } from "motion/react";
import { useNavigate } from "react-router";
import { LogOut } from "lucide-react";
import svgPaths from "../../imports/svg-qd05zunzc7";
import { useAuth } from "../context/AuthContext";
import { AdminAccessModal } from "../components/AdminAccessModal";

const ADMIN_EMAIL = "talkwithrushi@gmail.com";
const currentYear = new Date().getFullYear();

function Footer() {
  return (
    <div className="mt-8 mb-6 text-[11px] text-gray-400 text-center">
      <p>{`© ${currentYear} Voca. All rights reserved.`}</p>
      
    </div>
  );
}

export default function About() {
  const navigate = useNavigate();
  const { email, logout } = useAuth();

  // Hidden admin: 8 rapid clicks on logo
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const clickCountRef = useRef(0);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLogoClick = useCallback(() => {
    if (email?.toLowerCase() !== ADMIN_EMAIL) return; // silently ignore non-admin

    clickCountRef.current += 1;

    // Reset counter after 3s of no clicks
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    clickTimerRef.current = setTimeout(() => {
      clickCountRef.current = 0;
    }, 3000);

    if (clickCountRef.current >= 8) {
      clickCountRef.current = 0;
      setAdminModalOpen(true);
    }
  }, [email]);

  const handleSignOut = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="relative flex flex-1 min-h-0 flex-col items-center overflow-hidden bg-white">
      {/* ── Gradient blob background — CSS-based for GPU acceleration ── */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute w-[45vw] h-[45vw] rounded-full bg-[#6B4BC8] opacity-60 blur-[80px] will-change-transform" style={{ top: '70%', left: '5%', animation: 'blob0 18s ease-in-out infinite' }} />
        <div className="absolute w-[50vw] h-[50vw] rounded-full bg-[#904498] opacity-60 blur-[80px] will-change-transform" style={{ top: '5%', right: '-5%', animation: 'blob1 22s ease-in-out infinite' }} />
        <div className="absolute w-[55vw] h-[55vw] rounded-full bg-[#DE6231] opacity-60 blur-[80px] will-change-transform" style={{ top: '10%', left: '-10%', animation: 'blob2 20s ease-in-out infinite' }} />
        <div className="absolute w-[48vw] h-[48vw] rounded-full bg-[#CA3C43] opacity-60 blur-[80px] will-change-transform" style={{ bottom: '5%', right: '0%', animation: 'blob3 16s ease-in-out infinite' }} />
        <div className="absolute w-[40vw] h-[40vw] rounded-full bg-[#6B4BC8] opacity-50 blur-[80px] will-change-transform" style={{ top: '40%', left: '30%', animation: 'blob4 24s ease-in-out infinite' }} />
        <style>{`
          @keyframes blob0 { 0%,100%{transform:translate(0,0)} 20%{transform:translate(30vw,-35vh)} 40%{transform:translate(-10vw,15vh)} 60%{transform:translate(40vw,-20vh)} 80%{transform:translate(10vw,30vh)} }
          @keyframes blob1 { 0%,100%{transform:translate(0,0)} 20%{transform:translate(-30vw,40vh)} 40%{transform:translate(15vw,-15vh)} 60%{transform:translate(-20vw,30vh)} 80%{transform:translate(10vw,-35vh)} }
          @keyframes blob2 { 0%,100%{transform:translate(0,0)} 20%{transform:translate(40vw,20vh)} 40%{transform:translate(-8vw,45vh)} 60%{transform:translate(30vw,-15vh)} 80%{transform:translate(-15vw,35vh)} }
          @keyframes blob3 { 0%,100%{transform:translate(0,0)} 20%{transform:translate(-25vw,-40vh)} 40%{transform:translate(15vw,20vh)} 60%{transform:translate(-35vw,-15vh)} 80%{transform:translate(20vw,35vh)} }
          @keyframes blob4 { 0%,100%{transform:translate(0,0)} 20%{transform:translate(-20vw,30vh)} 40%{transform:translate(30vw,-20vh)} 60%{transform:translate(-15vw,-30vh)} 80%{transform:translate(25vw,18vh)} }
        `}</style>
      </div>

      {/* ── Frosted glass content layer ── */}
      <div className="relative z-10 flex flex-1 w-full flex-col items-center overflow-y-auto bg-white/60 backdrop-blur-2xl">
        {/* Centered content group */}
        <div className="flex flex-1 flex-col items-center justify-center px-6 w-full">
        {/* Voca Logo from Figma */}
        <div className="shrink-0 w-40 h-36" onClick={handleLogoClick}>
          <svg className="w-full h-full" fill="none" preserveAspectRatio="xMidYMid meet" viewBox="0 0 1015.76 896.692">
            <g clipPath="url(#clip0_about)">
              <g>
                {/* V outline + structural paths — static */}
                <path d={svgPaths.pbf61800} fill="#CA3C43" />
                <path d={svgPaths.p150d8e80} fill="#533AA4" />
                <path d={svgPaths.p229c9e00} fill="#6B4BC8" />
                <path d={svgPaths.p2dff2200} fill="#904498" />
                <path d={svgPaths.p32fe9bf0} fill="#B64237" />
                <path d={svgPaths.p1528c400} fill="#A63432" />
                <path d={svgPaths.p2a7060c0} fill="#B64237" />
                <path d={svgPaths.p20cdc600} fill="#A63432" />
                <path d={svgPaths.p2eb53200} fill="#B64237" />

                {/* Right inner bar — biggest pulse */}
                <motion.g
                  style={{ transformOrigin: "689px 425px" }}
                  animate={{ scaleY: [1, 0.45, 1] }}
                  transition={{ repeat: Infinity, duration: 1.1, delay: 0, ease: "easeInOut" }}
                >
                  <path d={svgPaths.p33998080} fill="#DE6231" />
                </motion.g>

                {/* Center bar group — animated */}
                <motion.g
                  style={{ transformOrigin: "552px 374px" }}
                  animate={{ scaleY: [1, 0.4, 1] }}
                  transition={{ repeat: Infinity, duration: 0.9, delay: 0.15, ease: "easeInOut" }}
                >
                  <path d={svgPaths.p249d7e00} fill="#D43B36" />
                  <path d={svgPaths.p32323ef0} fill="#A63432" />
                  <path d={svgPaths.p3938e180} fill="#A63432" />
                  <path d={svgPaths.p23466300} fill="#B64237" />
                  <path d={svgPaths.p3b94ea00} fill="#B64237" />
                  <path d={svgPaths.p32412900} fill="#B64237" />
                </motion.g>

                {/* Right V arm — static */}
                <path d={svgPaths.p2b908a00} fill="#DE6231" />
                <path d={svgPaths.p2392cc80} fill="#B64237" />
                <path d={svgPaths.p2905d400} fill="#D43B36" />

                {/* Right middle bar — medium pulse */}
                <motion.g
                  style={{ transformOrigin: "758px 410px" }}
                  animate={{ scaleY: [1, 0.6, 1] }}
                  transition={{ repeat: Infinity, duration: 1.5, delay: 0.05, ease: "easeInOut" }}
                >
                  <path d={svgPaths.p26b97b00} fill="#DE6231" />
                </motion.g>

                {/* Left inner bar — biggest pulse */}
                <motion.g
                  style={{ transformOrigin: "484px 361px" }}
                  animate={{ scaleY: [1, 0.45, 1] }}
                  transition={{ repeat: Infinity, duration: 1.25, delay: 0.3, ease: "easeInOut" }}
                >
                  <path d={svgPaths.p188dea00} fill="#6B4BC8" />
                  <path d={svgPaths.p27d93f00} fill="#533AA4" />
                </motion.g>

                {/* Right outer bar — smallest pulse */}
                <motion.g
                  style={{ transformOrigin: "827px 386px" }}
                  animate={{ scaleY: [1, 0.75, 1] }}
                  transition={{ repeat: Infinity, duration: 1.8, delay: 0.1, ease: "easeInOut" }}
                >
                  <path d={svgPaths.pdd8af00} fill="#DE6231" />
                  <path d={svgPaths.p328a6e00} fill="#B64237" />
                  <path d={svgPaths.p3c758380} fill="#D43B36" />
                </motion.g>

                {/* Left middle bar — medium pulse */}
                <motion.g
                  style={{ transformOrigin: "415px 364px" }}
                  animate={{ scaleY: [1, 0.6, 1] }}
                  transition={{ repeat: Infinity, duration: 1.35, delay: 0.22, ease: "easeInOut" }}
                >
                  <path d={svgPaths.p180fa600} fill="#6B4BC8" />
                  <path d={svgPaths.p3741ab00} fill="#533AA4" />
                </motion.g>

                {/* Left outer bar — smallest pulse */}
                <motion.g
                  style={{ transformOrigin: "346px 356px" }}
                  animate={{ scaleY: [1, 0.75, 1] }}
                  transition={{ repeat: Infinity, duration: 2.0, delay: 0.08, ease: "easeInOut" }}
                >
                  <path d={svgPaths.p2b8a9d00} fill="#6B4BC8" />
                  <path d={svgPaths.p3c37980} fill="#533AA4" />
                </motion.g>

                <path d={svgPaths.p2ecb6380} fill="#A63432" />
              </g>
            </g>
            <defs>
              <clipPath id="clip0_about">
                <rect fill="white" height="896.692" width="1015.76" />
              </clipPath>
            </defs>
          </svg>
        </div>

        {/* App Name */}
        <h1 className="text-3xl font-bold text-[#1d1d1f] mt-6 tracking-tight text-center">Voca<span className="text-[#0a84ff]">.</span></h1>

        {/* Tagline */}
        <p className="text-sm text-gray-500 mt-1.5 text-center font-medium">Listen to your Audience. Better.</p>
        <p className="text-xs text-gray-400 mt-1 text-center">
          <a
            href="https://chrono.knowwhatson.com"
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-gray-500 hover:text-[#0a84ff] transition-colors"
          >
            {`ChronoOS by What's On!`}
          </a>
        </p>

        {/* Version */}
        <span className="mt-3 px-3 py-1 rounded-full bg-[#767680]/[0.08] text-xs font-medium text-gray-500">Version 1.7.1</span>

        {/* Signed-in user & Sign Out */}
        <div className="mt-6 w-full max-w-xs space-y-2">
          {email && (
            null
          )}
          <button
            onClick={handleSignOut}
            className="w-full h-11 rounded-xl bg-white shadow-sm text-red-500 font-medium text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Footer pinned to bottom */}
      <div className="shrink-0 pb-2">
        <Footer />
      </div>
      </div>

      {/* Hidden admin modal */}
      <AdminAccessModal
        open={adminModalOpen}
        onClose={() => setAdminModalOpen(false)}
        adminEmail={email || ""}
      />
    </div>
  );
}