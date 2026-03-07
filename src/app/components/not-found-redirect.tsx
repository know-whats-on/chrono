import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router";

/**
 * Catch-all route — redirects unknown paths to home.
 * Preserves the original path in sessionStorage so if the user
 * needs to log in first, they can be redirected back afterward.
 */
export function NotFoundRedirect() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Store the attempted path so login → home flow can redirect back if needed
    const attempted = location.pathname + location.search;
    if (attempted !== "/") {
      sessionStorage.setItem("chrono_redirect_after_login", attempted);
    }
    navigate("/", { replace: true });
  }, [navigate, location]);

  return (
    <div
      className="min-h-dvh flex items-center justify-center"
      style={{ background: "var(--bg-gradient)" }}
    >
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
