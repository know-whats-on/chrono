import React from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { ChevronLeft } from "lucide-react";
import svgPaths from "../../imports/svg-syt4sq8lus";
import { useAuth } from "../context/AuthContext";
import { WelcomeModal } from "../components/WelcomeModal";
import * as api from "../utils/api";

const ADMIN_EMAIL = "talkwithrushi@gmail.com";

export default function RootLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isLoggedIn, email, logout, justLoggedIn, clearJustLoggedIn } = useAuth();

  const isAdmin = email?.toLowerCase() === ADMIN_EMAIL;
  const showWelcome = justLoggedIn && isLoggedIn && !isAdmin;

  const isLogin = location.pathname === "/login";
  const isDashboard = location.pathname === "/assessments";
  const isAssessments = location.pathname.startsWith("/assessments");
  const isRubrics = location.pathname.startsWith("/rubrics");
  const isStudents = location.pathname.startsWith("/students");
  const isCourses = location.pathname.startsWith("/courses");
  const isResults = location.pathname.startsWith("/results");
  const isEngage = location.pathname === "/engage";
  const isEngageMonitor = location.pathname.startsWith("/engage/monitor");
  const isAbout = location.pathname === "/about";

  // Public sub-pages that don't require authentication
  const isPublicPage =
    location.pathname.endsWith("/share") ||
    location.pathname.endsWith("/vote") ||
    location.pathname.startsWith("/debate/");

  // "Root" pages are the five tab landing pages (no back button)
  const isTabRoot =
    isDashboard ||
    location.pathname === "/courses" ||
    location.pathname === "/students" ||
    location.pathname === "/results" ||
    isEngage ||
    isAbout;

  const showBack = !isLogin && !isTabRoot;

  const getTitle = () => {
    if (isLogin) return "";
    if (isDashboard) return "Assessments";
    if (location.pathname === "/courses") return "Courses";
    if (location.pathname === "/students") return "Students";
    if (location.pathname === "/results") return "Results";
    if (isEngage || isEngageMonitor) return "Engage";
    if (isAbout) return "About";
    if (location.pathname.endsWith("/new")) return "New";
    if (location.pathname.includes("/share")) return "Share";
    if (location.pathname.includes("/live")) return "Live Session";
    if (location.pathname.includes("/grade")) return "Grading";
    if (isCourses) return "Course";
    if (isStudents) return "Student";
    if (isRubrics) return "Rubric";
    return "Details";
  };

  // Redirect to login if not authenticated (except login page and public pages)
  React.useEffect(() => {
    if (!isLoggedIn && !isLogin && !isPublicPage) {
      const currentPath = location.pathname + location.search;
      const redirectParam = currentPath && currentPath !== "/" ? `?redirect=${encodeURIComponent(currentPath)}` : "";
      navigate(`/login${redirectParam}`, { replace: true });
    }
  }, [isLoggedIn, isLogin, isPublicPage, navigate, location.pathname, location.search]);

  // Hide chrome (header + nav) on login page and public pages when not logged in
  const showChrome = !isLogin && (isLoggedIn || isPublicPage);

  // ─── Periodic access check — revoke kicks out instantly ───
  React.useEffect(() => {
    if (!isLoggedIn || !email) return;

    // Public pages (student portals) don't need access checks
    const isPublicRoute =
      location.pathname.endsWith("/share") ||
      location.pathname.endsWith("/vote") ||
      location.pathname.startsWith("/debate/");
    if (isPublicRoute) return;

    let cancelled = false;
    const checkAccess = async () => {
      try {
        const result = await api.checkEmailAccessDetailed(email);
        if (!cancelled && !result.allowed) {
          logout();
          if (result.expired) {
            navigate("/access-expired", { replace: true });
          } else {
            navigate("/login", { replace: true });
          }
        }
      } catch {
        // Network error — don't kick out
      }
    };

    // Check on mount and every 15 seconds (more responsive for timed access)
    checkAccess();
    const interval = setInterval(checkAccess, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [isLoggedIn, email, logout, navigate, location.pathname]);

  return (
    <div className="flex min-h-[100dvh] max-h-[100dvh] flex-col bg-[#f7f7f8] font-sans antialiased text-slate-900 mx-auto w-full max-w-md relative shadow-2xl overflow-hidden md:border-x md:border-gray-200">
      {showChrome && (
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between border-b bg-white/90 px-4 backdrop-blur-md">
          <div className="flex w-16 items-center">
            {showBack && (
              <button
                onClick={() => {
                  if (location.pathname.includes("/share")) {
                    navigate("/assessments");
                  } else {
                    navigate(-1);
                  }
                }}
                className="flex items-center text-[#0a84ff] font-medium active:opacity-70 transition-opacity"
              >
                <ChevronLeft className="h-5 w-5 -ml-1" />
                <span>Back</span>
              </button>
            )}
          </div>
          <h1 className="text-base font-semibold tracking-tight">
            <svg className="h-5 w-auto" fill="none" viewBox="-5 -5 1148 342">
              <path d={svgPaths.p36fbe580} fill="currentColor" />
              <path d={svgPaths.p5338fa0} fill="currentColor" />
              <path d={svgPaths.p2058800} fill="currentColor" />
              <path d={svgPaths.p34ab3a00} fill="currentColor" />
              <path d={svgPaths.p137f3780} fill="#DE5E29" />
            </svg>
          </h1>
          <div className="w-16 flex justify-end" />
        </header>
      )}

      <main className="flex-1 overflow-hidden w-full flex flex-col relative bg-[#f7f7f8]">
        <Outlet />
      </main>

      {showChrome && !isPublicPage && (
        <nav className="shrink-0 sticky bottom-0 z-20 w-full border-t border-gray-200 bg-white/90 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
          <div className="w-full pt-1.5 flex justify-center items-center text-[10px] text-gray-400 font-medium tracking-wide">
            A part of <a href="https://chrono.knowwhatson.com" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-[#0a84ff] transition-colors mx-1 underline decoration-gray-300 underline-offset-2">ChronoOS</a> ♥ by <a href="https://knowwhatson.com" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-[#0a84ff] transition-colors ml-1 underline decoration-gray-300 underline-offset-2">What's On!</a>
          </div>
          <div className="flex justify-around items-center h-16 px-2">
            <button 
              onClick={() => navigate("/courses")}
              className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${isCourses ? 'text-[#0a84ff]' : 'text-gray-500 hover:text-gray-900'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
              <span className="text-[10px] font-medium">Courses</span>
            </button>
            <button 
              onClick={() => navigate("/assessments")}
              className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${isAssessments || isRubrics ? 'text-[#0a84ff]' : 'text-gray-500 hover:text-gray-900'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
              <span className="text-[10px] font-medium">Assessments</span>
            </button>
            <button 
              onClick={() => navigate("/students")}
              className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${isStudents ? 'text-[#0a84ff]' : 'text-gray-500 hover:text-gray-900'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              <span className="text-[10px] font-medium">Students</span>
            </button>
            <button 
              onClick={() => navigate("/results")}
              className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${isResults ? 'text-[#0a84ff]' : 'text-gray-500 hover:text-gray-900'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><line x1="12" x2="12" y1="20" y2="10"/><line x1="18" x2="18" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="16"/></svg>
              <span className="text-[10px] font-medium">Results</span>
            </button>
            <button 
              onClick={() => navigate("/engage")}
              className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${isEngage || isEngageMonitor ? 'text-[#0a84ff]' : 'text-gray-500 hover:text-gray-900'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
              <span className="text-[10px] font-medium">Engage</span>
            </button>
            <button 
              onClick={() => navigate("/about")}
              className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${isAbout ? 'text-[#0a84ff]' : 'text-gray-500 hover:text-gray-900'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
              <span className="text-[10px] font-medium">About</span>
            </button>
          </div>
        </nav>
      )}
      {showWelcome && <WelcomeModal open={showWelcome} onClose={clearJustLoggedIn} />}
    </div>
  );
}