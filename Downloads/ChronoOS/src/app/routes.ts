import { createBrowserRouter } from "react-router";

import { AppLayout } from "./components/app-layout";
import { LoginPage } from "./components/login-page";
import { HomePage } from "./components/home-page";
import { CalendarPage } from "./components/calendar-page";
import { TrackPage } from "./components/track-page";
import { AssistantPage } from "./components/assistant-page";
import { SettingsPage } from "./components/settings-page";
import { JoinPage } from "./components/join-page";
import { InvoicePage } from "./components/invoice-page";
import { AgreementPage } from "./components/agreement-page";
import { InvoiceGeneratorPage } from "./components/invoice-generator-page";
import { WeeklyReviewPage } from "./components/weekly-review-page";
import { SmartInboxPage } from "./components/smart-inbox-page";
import { EmailPage } from "./components/email-page";
import { FocusPage } from "./components/focus-page";
import { PrivacyPolicyPage } from "./components/privacy-policy-page";
import { TermsOfUsePage } from "./components/terms-of-use-page";
import { NotFoundRedirect } from "./components/not-found-redirect";
import { BookingPage } from "./components/booking-page";
import { BookingActionPage } from "./components/booking-action-page";

import { OpenEventsPage } from "./components/open-events-page";
import { OpenEventDetailsPage } from "./components/open-event-details-page";
import { OpenBookPage } from "./components/open-book-page";
import { OpenEventPublicPage } from "./components/open-event-public-page";
import { WaitlistPage } from "./components/waitlist-page";
import { EngagePage } from "./components/engage-page";
import { FeedbackPage } from "./components/feedback-page";
import { FeedbackDashboardPage } from "./components/feedback-dashboard-page";

import { LiveSessionCreatePage } from "./components/live-session-create-page";
import { LiveSessionDashboardPage } from "./components/live-session-dashboard-page";
import { LiveSessionPublicPage } from "./components/live-session-public-page";

export const router = createBrowserRouter([
  {
    path: "/login",
    Component: LoginPage,
  },
  {
    path: "/live/:sessionId",
    Component: LiveSessionPublicPage,
  },
  {
    path: "/privacy",
    Component: PrivacyPolicyPage,
  },
  {
    path: "/terms",
    Component: TermsOfUsePage,
  },
  {
    path: "/join/:listId",
    Component: JoinPage,
  },
  {
    path: "/invoice/:listId",
    Component: InvoicePage,
  },
  {
    path: "/agreement/:listId",
    Component: AgreementPage,
  },
  {
    path: "/book/:code",
    Component: BookingPage,
  },
  {
    path: "/open-book/:code",
    Component: OpenBookPage,
  },
  {
    path: "/open-event/:code",
    Component: OpenEventPublicPage,
  },
  {
    path: "/feedback/:sessionId",
    Component: FeedbackPage,
  },
  {
    path: "/booking-action/:action/:code/:requestId",
    Component: BookingActionPage,
  },
  {
    path: "/",
    Component: AppLayout,
    children: [
      { index: true, Component: HomePage },
      { path: "calendar", Component: CalendarPage },
      { path: "track", Component: TrackPage },
      { path: "assistant", Component: AssistantPage },
      { path: "settings", Component: SettingsPage },
      { path: "invoice-generator/:listId", Component: InvoiceGeneratorPage },
      { path: "weekly-review", Component: WeeklyReviewPage },
      { path: "inbox", Component: SmartInboxPage },
      { path: "email", Component: EmailPage },
      { path: "focus", Component: FocusPage },
      { path: "open-events", Component: OpenEventsPage },
      { path: "open-events/:id", Component: OpenEventDetailsPage },
      { path: "waitlist", Component: WaitlistPage },
      { path: "engage", Component: EngagePage },
      { path: "live-session/create", Component: LiveSessionCreatePage },
      { path: "live-session/dashboard/:sessionId", Component: LiveSessionDashboardPage },
      { path: "feedback-dashboard", Component: FeedbackDashboardPage },
    ],
  },
  {
    path: "*",
    Component: NotFoundRedirect,
  },
]);