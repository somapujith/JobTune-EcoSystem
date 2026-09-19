# JobTube Eco System — Potential Changes & Additions

## Context
Career acceleration platform with AI resume tools, mock interviews, job matching, LinkedIn/GitHub optimizers. Stack: React+Vite frontend, Express+MySQL backend, Gemini AI.

---

## Feature Additions (Prioritized)

### HIGH IMPACT — Core Career Features

1. **Job Application Tracker**
   - Track applied jobs (company, role, status, date, notes)
   - Kanban board: Applied → Interview → Offer → Rejected
   - Reminder/follow-up alerts
   - Files: new `JobTracker.jsx` page + `backend/src/routes/jobs.js`

2. **Cover Letter Generator**
   - AI-generated cover letters from resume + job description input
   - Templates + tone selector (formal/casual/creative)
   - Export PDF/DOCX like resume
   - Files: new page or extend `ResumeBuilder.jsx` + resume route

3. **Interview Prep Expansion**
   - Current MockInterview exists — extend with:
     - Company-specific question banks
     - STAR method scoring
     - Video recording + playback (browser MediaRecorder API)
     - AI feedback on answer quality

4. **Salary Insights**
   - Role + location → salary range estimates
   - Powered by Gemini or scraped data
   - Integrate into JobMatcher or new page

5. **Job Search Integration**
   - Connect to job board APIs (LinkedIn Jobs, Indeed, JSearch RapidAPI)
   - Auto-match postings to user's resume
   - Extend `JobMatcher.jsx`

---

### MEDIUM IMPACT — UX & Quality

6. **Notifications System**
   - In-app notifications for: resume score improvements, interview reminders, job matches
   - Bell icon in navbar, notification table in DB

7. **Resume Score Dashboard Widget**
   - Real-time ATS score on Dashboard
   - Show keyword gaps, length warnings, section completeness

8. **Dark Mode**
   - Tailwind `dark:` classes already supported
   - Add toggle, persist in localStorage

9. **Resume Comparison View**
   - Side-by-side diff between resume versions in `ResumeHistory.jsx`
   - Highlight changes

10. **Profile Completeness Meter**
    - Progress bar showing % profile filled
    - Link to incomplete sections

---

### LOWER IMPACT — Polish & Infrastructure

11. **Tests** (currently zero)
    - Vitest for frontend components
    - Jest + Supertest for backend routes
    - Critical: auth, resume CRUD, AI endpoints

12. **Rate Limiting on AI Endpoints**
    - Currently missing
    - Add express-rate-limit to `/resume/optimize`, `/interview`, etc.

13. **Email Notifications**
    - Nodemailer or Resend for: account verify, resume send confirmation
    - `ResumeSend.jsx` already exists — wire real email

14. **Analytics Dashboard Improvements**
    - `Dashboard.jsx` uses Recharts — add:
      - Application funnel chart
      - Skills heatmap over time
      - Interview pass rate

15. **OAuth Login**
    - Google/GitHub OAuth via Passport.js
    - Extend `auth.js` route

16. **Admin Panel**
    - `admin.js` route exists but likely stub
    - Build admin UI: user management, feature flags, usage stats

---

## Tech Debt / Fixes

- Remove `console.log` debug statements
- Add input validation (Joi) to all backend routes uniformly
- Fix OpenAI commented code in `resume.js` — remove or implement
- Add error boundaries in React frontend
- `.env` audit — ensure no secrets committed

---

## Verification
After implementing any feature:
1. `npm run dev` both frontend + backend
2. Test feature flow end-to-end in browser
3. Check network tab for API errors
4. Verify no hardcoded secrets in new files
