import { Link, useNavigate } from "react-router";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "../lib/auth-context";

export function PrivacyPolicyPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  const handleBack = () => {
    // Prevent splash animation when returning to the app
    sessionStorage.setItem("chrono_skip_splash", "1");
    navigate(user ? "/settings" : "/login");
  };

  return (
    <div className="h-dvh overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-8 pb-16">
        {/* Back link */}
        {!loading && (
          <button
            onClick={handleBack}
            className="inline-flex items-center gap-1.5 text-sm font-medium mb-6 hover:underline"
            style={{ color: "var(--primary)" }}
          >
            <ArrowLeft className="w-4 h-4" />
            {user ? "Back to Settings" : "Back to Login"}
          </button>
        )}

        <div
          className="glass-elevated rounded-2xl p-6 sm:p-8"
          style={{ overflow: "visible" }}
        >
          <h1 className="text-2xl font-semibold mb-1" style={{ color: "var(--foreground)" }}>
            Privacy Policy
          </h1>
          <p className="text-sm mb-6" style={{ color: "var(--muted-foreground)" }}>
            Last updated: March 4, 2026
          </p>

          <div className="space-y-5 text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>
            <section>
              <h2 className="text-base font-semibold mb-2">1. Introduction</h2>
              <p style={{ color: "var(--muted-foreground)" }}>
                Chrono ("we", "our", "us") is a personal productivity application operated by What's On!
                This Privacy Policy explains how we collect, use, and protect your information when you use
                the Chrono application and related services.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold mb-2">2. Information We Collect</h2>
              <p className="mb-2" style={{ color: "var(--muted-foreground)" }}>We collect the following types of information:</p>
              <ul className="list-disc pl-5 space-y-1.5" style={{ color: "var(--muted-foreground)" }}>
                <li><strong style={{ color: "var(--foreground)" }}>Account Information:</strong> Name, email address, and password when you create an account.</li>
                <li><strong style={{ color: "var(--foreground)" }}>Calendar Data:</strong> Events and scheduling information from connected calendar services (Google Calendar, ICS feeds, CalDAV) that you explicitly authorise.</li>
                <li><strong style={{ color: "var(--foreground)" }}>Email Data:</strong> Email metadata and content from connected Gmail accounts, accessed only with your explicit OAuth consent.</li>
                <li><strong style={{ color: "var(--foreground)" }}>Tasks & Lists:</strong> Tasks, lists, and notes you create within Chrono.</li>
                <li><strong style={{ color: "var(--foreground)" }}>Usage Data:</strong> Timezone, preferences, and feature usage patterns to improve the service.</li>
                <li><strong style={{ color: "var(--foreground)" }}>Device Information:</strong> Push notification tokens and browser information for delivering notifications you opt into.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-semibold mb-2">3. How We Use Your Information</h2>
              <ul className="list-disc pl-5 space-y-1.5" style={{ color: "var(--muted-foreground)" }}>
                <li>Provide and operate the Chrono productivity features (calendar, tasks, email, assistant, focus mode, weekly reviews).</li>
                <li>Sync and display your calendar events and email across devices.</li>
                <li>Generate personalised daily briefings, time audits, and productivity insights.</li>
                <li>Deliver push notifications you have opted into.</li>
                <li>Enable social features such as calendar sharing and collaborative lists with people you invite.</li>
                <li>Improve and develop new features based on aggregated, anonymised usage patterns.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-semibold mb-2">4. Google API Services</h2>
              <p style={{ color: "var(--muted-foreground)" }}>
                Chrono's use and transfer to any other app of information received from Google APIs will adhere to the{" "}
                <a
                  href="https://developers.google.com/terms/api-services-user-data-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-medium"
                  style={{ color: "var(--primary)" }}
                >
                  Google API Services User Data Policy
                </a>
                , including the Limited Use requirements. We only request the minimum scopes necessary
                (calendar.events, gmail.modify) and never share your Google data with third parties.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold mb-2">5. Data Storage & Security</h2>
              <p style={{ color: "var(--muted-foreground)" }}>
                Your data is stored securely using Supabase infrastructure with encryption at rest and in transit.
                Authentication tokens are handled via Supabase Auth with industry-standard security practices.
                We do not sell, rent, or share your personal data with third parties for marketing purposes.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold mb-2">6. Data Sharing</h2>
              <p className="mb-2" style={{ color: "var(--muted-foreground)" }}>We only share your information in these circumstances:</p>
              <ul className="list-disc pl-5 space-y-1.5" style={{ color: "var(--muted-foreground)" }}>
                <li><strong style={{ color: "var(--foreground)" }}>With your consent:</strong> When you explicitly share calendars or lists with other Chrono users.</li>
                <li><strong style={{ color: "var(--foreground)" }}>Service providers:</strong> Infrastructure providers (Supabase, cloud hosting) that process data on our behalf under strict data processing agreements.</li>
                <li><strong style={{ color: "var(--foreground)" }}>Legal requirements:</strong> When required by law, regulation, or legal process.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-semibold mb-2">7. Your Rights</h2>
              <p className="mb-2" style={{ color: "var(--muted-foreground)" }}>You have the right to:</p>
              <ul className="list-disc pl-5 space-y-1.5" style={{ color: "var(--muted-foreground)" }}>
                <li>Access and export your personal data.</li>
                <li>Correct inaccurate information in your account.</li>
                <li>Delete your account and associated data.</li>
                <li>Disconnect third-party services (Google Calendar, Gmail) at any time via Settings.</li>
                <li>Opt out of push notifications at any time.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-semibold mb-2">8. Cookies & Local Storage</h2>
              <p style={{ color: "var(--muted-foreground)" }}>
                Chrono uses browser local storage and session storage to maintain your authentication session,
                preferences, and cached data for performance. We do not use third-party tracking cookies.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold mb-2">9. Changes to This Policy</h2>
              <p style={{ color: "var(--muted-foreground)" }}>
                We may update this Privacy Policy from time to time. We will notify you of significant changes
                via in-app notification or email. Continued use of Chrono after changes constitutes acceptance
                of the updated policy.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold mb-2">10. Contact Us</h2>
              <p style={{ color: "var(--muted-foreground)" }}>
                If you have questions about this Privacy Policy or your data, contact us at{" "}
                <a
                  href="mailto:info@knowwhatson.com"
                  className="underline font-medium"
                  style={{ color: "var(--primary)" }}
                >
                  info@knowwhatson.com
                </a>
                .
              </p>
            </section>
          </div>
        </div>

        {/* Footer credit */}
        <p
          className="text-center text-[11px] font-light tracking-wide mt-8"
          style={{ color: "var(--muted-foreground)" }}
        >
          Chrono by{" "}
          <a
            href="https://knowwhatson.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
            style={{ color: "inherit" }}
          >
            What's On!
          </a>
        </p>
      </div>
    </div>
  );
}
