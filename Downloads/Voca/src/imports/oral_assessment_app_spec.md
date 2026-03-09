
# Oral Assessment — Product Spec (Mobile-first, Production-ready)
> Single-file markdown ready to paste into Figma Make / Lovable.

---

## 1. Product Overview
A mobile-first web application for university teaching teams to create, run, transcribe, and grade oral assessments (presentations, debates, vivas, group presentations/debates) using AI-assisted speech analysis and rubric alignment.

Tech stack assumptions:
- Backend: Supabase
- AI processing: OpenAI API
- Email invitations: Resend API
- Speech-to-text: low-cost STT (e.g., Whisper / Vosk)
- Frontend: Mobile-first responsive web app

---

## 2. User Roles
- Super Admin
- Teaching Team Admin (Instructor)
- Tutor / Marker
- Student Presenter
- Student Audience
- Guest Observer

---

## 3. Onboarding Flow
1. Sign up (SSO or email)
2. Create or join teaching team
3. Upload class list CSV
4. Upload rubric CSV
5. Configure assessment defaults

---

## 4. Core User Journeys

### Instructor
Create assessment → Upload rubric → Invite students → Run session → Grade with AI suggestions.

### Student
Receive invite → Join assessment → Upload preparation materials → Deliver presentation → Transcript generated.

### Tutor
Open transcript → View AI rubric suggestions → Assign scores → Export grades.

---

## 5. UI Screens
1. Login
2. Dashboard
3. Create Assessment Wizard
4. Rubric Editor
5. Participant Manager
6. Student Join Screen
7. Live Presentation Screen
8. Instructor Control Panel
9. Public Debate Screen
10. Interactive Grading Interface
11. Reports & Export

---

## 6. UX Interaction Logic
- Real-time transcript streaming
- Transcript ↔ rubric matching
- Highlight text → attach rubric
- AI suggestions with confidence score
- Offline resilience
- Accessible design (WCAG AA)

---

## 7. Database Schema (Core Tables)
users, teams, courses, assessments, rubrics, rubric_items, students, groups, group_members, submissions, transcript_segments, grades, invites, ai_jobs

---

## 8. CSV Templates

### Class List
student_number,first_name,last_name,email,group_id

### Rubric
rubric_id,rubric_title,criterion_id,criterion_label,criterion_description,max_score,weight

### Grades Export
assessment_id,student_number,student_email,total_score,graded_by,graded_at,feedback

---

## 9. AI Processing Pipeline
1. Audio captured via WebRTC
2. Sent to streaming STT
3. Transcript segments stored
4. Embeddings generated
5. AI maps transcript → rubric
6. Suggested score generated
7. Instructor confirms or edits

---

## 10. Debate Mode Mechanics
- Timed speaking rounds
- Speaker queue
- Live argument detection
- Audience voting (For / Against)
- Public display screen

---

## 11. Security & Permissions
- Supabase Auth
- Role-based access control
- Expiring invite tokens
- Audio retention policies
- Audit logs

---

## 12. Visual Design System
Style: minimalist Apple-inspired UI

Typography: system fonts  
Primary color: #0a84ff  
Surface: #f7f7f8  
Radius: 12px cards

---

## 13. API Architecture

Endpoints:
POST /api/assessments  
POST /api/invite  
POST /api/stt/stream  
POST /api/ai/map  
POST /api/ai/summarize  
POST /api/vote

Realtime events:
- transcript.segment.finalized
- ai.mapping.suggestion
- debate.badge.issued
- audience.vote.update

---

## 14. Cost & Operations
- Host whisper.cpp for STT
- Cache embeddings
- Limit AI calls
- Storage lifecycle policies

---

## 15. Acceptance Criteria
- Instructor can create assessments
- Students can deliver live presentations
- Real-time transcripts generated
- AI rubric suggestions available
- Debate mode operational

---

End of specification.
