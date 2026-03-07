import { Link, useNavigate } from "react-router";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "../lib/auth-context";

export function TermsOfUsePage() {
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
            Terms of Use
          </h1>
          <p className="text-sm mb-6" style={{ color: "var(--muted-foreground)" }}>
            Last updated: March 4, 2026
          </p>

          <div className="space-y-5 text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>
            <section>
              <h2 className="text-base font-semibold mb-2">1. Acceptance of Terms</h2>
              <p style={{ color: "var(--muted-foreground)" }}>
                By accessing or using Chrono ("the Service"), operated by What's On!, you agree to be bound
                by these Terms of Use. If you do not agree to these terms, please do not use the Service.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold mb-2">2. Description of Service</h2>
              <p style={{ color: "var(--muted-foreground)" }}>
                Chrono is a personal productivity application that provides calendar management, task tracking,
                email integration, AI-powered assistance, focus mode, weekly reviews, and collaborative list
                features. The Service integrates with third-party platforms (Google Calendar, Gmail) with your
                explicit authorisation.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold mb-2">3. Account Registration</h2>
              <ul className="list-disc pl-5 space-y-1.5" style={{ color: "var(--muted-foreground)" }}>
                <li>You must provide accurate and complete information when creating an account.</li>
                <li>You are responsible for maintaining the security of your account credentials.</li>
                <li>You must be at least 16 years of age to use the Service.</li>
                <li>You are responsible for all activity that occurs under your account.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-semibold mb-2">4. Acceptable Use</h2>
              <p className="mb-2" style={{ color: "var(--muted-foreground)" }}>You agree not to:</p>
              <ul className="list-disc pl-5 space-y-1.5" style={{ color: "var(--muted-foreground)" }}>
                <li>Use the Service for any unlawful purpose or in violation of any applicable laws.</li>
                <li>Attempt to gain unauthorised access to any part of the Service or its related systems.</li>
                <li>Interfere with or disrupt the integrity or performance of the Service.</li>
                <li>Upload or share content that is harmful, offensive, or infringes on others' rights.</li>
                <li>Use automated means to access the Service except through provided APIs.</li>
                <li>Share your account credentials with others or allow multiple people to use a single account.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-semibold mb-2">5. Third-Party Integrations</h2>
              <p style={{ color: "var(--muted-foreground)" }}>
                Chrono integrates with third-party services including Google Calendar and Gmail. Your use of
                these integrations is subject to the respective third-party terms of service. We are not
                responsible for the availability, accuracy, or practices of third-party services. You may
                disconnect third-party integrations at any time through Settings.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold mb-2">6. Collaborative Features</h2>
              <p style={{ color: "var(--muted-foreground)" }}>
                When you share calendars, lists, or other content with other users, you grant them permission
                to view and interact with that shared content as enabled by the sharing settings you choose.
                You are responsible for the content you share and the people you share it with.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold mb-2">7. Intellectual Property</h2>
              <p style={{ color: "var(--muted-foreground)" }}>
                The Service, including its design, code, features, and branding, is owned by What's On! and
                protected by intellectual property laws. You retain ownership of the content you create within
                Chrono. By using the Service, you grant us a limited licence to store and process your content
                solely for the purpose of providing the Service.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold mb-2">8. Service Availability</h2>
              <p style={{ color: "var(--muted-foreground)" }}>
                We strive to keep Chrono available at all times but do not guarantee uninterrupted access.
                We may perform maintenance, updates, or modifications that temporarily affect availability.
                We reserve the right to modify, suspend, or discontinue any part of the Service with
                reasonable notice.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold mb-2">9. Limitation of Liability</h2>
              <p style={{ color: "var(--muted-foreground)" }}>
                The Service is provided "as is" without warranties of any kind. To the maximum extent permitted
                by law, What's On! shall not be liable for any indirect, incidental, special, consequential, or
                punitive damages arising from your use of the Service, including but not limited to loss of data,
                missed appointments, or scheduling conflicts.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold mb-2">10. Termination</h2>
              <p style={{ color: "var(--muted-foreground)" }}>
                You may terminate your account at any time by contacting us. We may suspend or terminate your
                account if you violate these Terms. Upon termination, your right to use the Service ceases
                immediately, though we may retain certain data as required by law or legitimate business purposes.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold mb-2">11. Changes to Terms</h2>
              <p style={{ color: "var(--muted-foreground)" }}>
                We may update these Terms from time to time. We will notify you of material changes via in-app
                notification or email. Continued use of the Service after changes constitutes acceptance of the
                updated Terms.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold mb-2">12. Governing Law</h2>
              <p style={{ color: "var(--muted-foreground)" }}>
                These Terms shall be governed by and construed in accordance with applicable laws. Any disputes
                arising from these Terms or your use of the Service shall be resolved through good-faith
                negotiation first, and if necessary, through binding arbitration.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold mb-2">13. Contact Us</h2>
              <p style={{ color: "var(--muted-foreground)" }}>
                If you have questions about these Terms, contact us at{" "}
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
