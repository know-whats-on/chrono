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

export const router = createBrowserRouter([
  {
    path: "/login",
    Component: LoginPage,
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
    path: "/book/:code",
    Component: BookingPage,
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
    ],
  },
  {
    path: "*",
    Component: NotFoundRedirect,
  },
]);