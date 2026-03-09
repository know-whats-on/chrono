import React from "react";
import { createBrowserRouter, Navigate } from "react-router";
import RootLayout from "./layout/RootLayout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import CoursesList from "./pages/CoursesList";
import CreateAssessment from "./pages/CreateAssessment";
import AssessmentDetails from "./pages/AssessmentDetails";
import LiveSession from "./pages/LiveSession";
import GradeAssessment from "./pages/GradeAssessment";
import RubricEditor from "./pages/RubricEditor";
import StudentsList from "./pages/StudentsList";
import PublicDisplay from "./pages/PublicDisplay";
import AudienceVote from "./pages/AudienceVote";
import AssessmentShare from "./pages/AssessmentShare";
import ResultsTab from "./pages/ResultsTab";
import AssessmentResults from "./pages/AssessmentResults";

import Engage from "./pages/Engage";
import EngageMonitor from "./pages/EngageMonitor";
import StudentPortal from "./pages/StudentPortal";
import DebateTeamPortal from "./pages/DebateTeamPortal";
import DebateAudiencePortal from "./pages/DebateAudiencePortal";
import DebateLiveView from "./pages/DebateLiveView";
import About from "./pages/About";
import AccessExpired from "./pages/AccessExpired";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: RootLayout,
    children: [
      { index: true, element: <Navigate to="/courses" replace /> },

      /* ── Auth ──────────────────────────────────────── */
      { path: "login", Component: Login },

      /* ── Assessments ─────────────────────────────────── */
      { path: "assessments", Component: Dashboard },
      { path: "assessments/new", Component: CreateAssessment },
      { path: "assessments/:year/:term/:courseCode/:name", Component: AssessmentDetails },
      { path: "assessments/:year/:term/:courseCode/:name/share", Component: AssessmentShare },
      { path: "assessments/:year/:term/:courseCode/:name/live", Component: LiveSession },
      { path: "assessments/:year/:term/:courseCode/:name/vote", Component: AudienceVote },
      { path: "assessments/:year/:term/:courseCode/:name/grade", Component: GradeAssessment },

      /* ── Courses ─────────────────────────────────────── */
      { path: "courses", Component: CoursesList },
      { path: "courses/new", Component: CoursesList },
      { path: "courses/:year/:term/:courseCode", Component: CoursesList },

      /* ── Rubrics ─────────────────────────────────────── */
      { path: "rubrics", Component: RubricEditor },
      { path: "rubrics/new", Component: RubricEditor },
      { path: "rubrics/:year/:term/:courseCode/:name", Component: RubricEditor },

      /* ── Students ────────────────────────────────────── */
      { path: "students", Component: StudentsList },
      { path: "students/new", Component: StudentsList },
      { path: "students/:studentId", Component: StudentsList },

      /* ── Other tabs ──────────────────────────────────── */
      { path: "results", Component: ResultsTab },
      { path: "results/:assessmentId", Component: AssessmentResults },
      { path: "engage", Component: Engage },
      { path: "engage/monitor/:sessionId", Component: EngageMonitor },
      { path: "about", Component: About },

      /* ── Catch-all ───────────────────────────────────── */
      { path: "*", Component: Dashboard },
    ],
  },
  /* ── Public standalone pages (no auth required) ─── */
  {
    path: "/access-expired",
    Component: AccessExpired,
  },
  {
    path: "/assess/:sessionId",
    Component: StudentPortal,
  },
  {
    path: "/public-display/:sessionId",
    Component: PublicDisplay,
  },
  {
    path: "/debate/:sessionId/team-for",
    element: <DebateTeamPortal team="for" />,
  },
  {
    path: "/debate/:sessionId/team-against",
    element: <DebateTeamPortal team="against" />,
  },
  {
    path: "/debate/:sessionId/audience",
    Component: DebateAudiencePortal,
  },
  {
    path: "/debate/:sessionId/live",
    Component: DebateLiveView,
  },
]);