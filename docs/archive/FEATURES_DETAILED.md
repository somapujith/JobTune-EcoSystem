# JobTube Features — Detailed Documentation

---

## 1. Authentication System

### Overview
JWT-based authentication with email/password. Session-less, stateless design for scalability.

### Flow
1. User registers with email + password
2. Backend hashes password (bcrypt)
3. Backend issues JWT token (expires in 7 days)
4. Frontend stores token in localStorage
5. All API calls include token in `Authorization: Bearer <token>` header

### Files
- **Frontend:** `src/store/useAuthStore.js` (Zustand store)
- **Backend:** `src/routes/auth.js`, `src/middleware/auth.js`

### Key Methods
```javascript
// useAuthStore
useAuthStore.register(email, password)
useAuthStore.login(email, password)
useAuthStore.logout()
useAuthStore.checkAuth()  // Verify token on app load
```

### API Endpoints
- `POST /auth/register` — Create account
- `POST /auth/login` — Issue JWT
- `GET /auth/me` — Verify token (protected)

---

## 2. Resume Management

### 2.1 Resume Builder
**Purpose:** Create or edit resume from scratch with guided UI

**Files:** `frontend/src/pages/ResumeBuilder.jsx`

**Sections:**
- Personal info (name, email, phone, location)
- Professional summary
- Work experience (company, title, dates, description)
- Education (school, degree, graduation date)
- Skills (comma-separated)
- Certifications (optional)
- Projects (optional)

**Features:**
- Real-time character counts
- Autosave to backend
- Drag-to-reorder sections (future)
- Undo/redo (future)
- Preview pane (side-by-side)

---

### 2.2 Resume Optimizer
**Purpose:** AI-powered resume improvement with ATS scoring

**Files:** `frontend/src/pages/ResumeOptimizer.jsx`, `backend/src/routes/resume.js`

**How It Works:**
1. User uploads/pastes resume text
2. Click "Analyze" → Gemini AI processes
3. Returns:
   - **ATS Score (0-100):** Keyword match against job descriptions
   - **Missing Keywords:** Industry-specific terms to add
   - **Formatting Issues:** Length, structure, gaps
   - **Top 5 Actions:** Prioritized improvement suggestions
4. User can apply suggestions directly or manually edit
5. See new score after each change (live update)

**Gemini Prompt:**
```
Analyze this resume for ATS compatibility:
- Score it 0-100 on keyword match, formatting, length
- List missing industry keywords
- Suggest top 5 specific improvements
- Format as JSON with: score, keywords, suggestions
```

**API:** `POST /resume/optimize` (protected)

---

### 2.3 Resume Comparison
**Purpose:** Side-by-side diff view of multiple resume versions

**Files:** `frontend/src/pages/ResumeComparison.jsx`

**How It Works:**
1. User selects 2 resume versions from history
2. Display side-by-side with diff highlighting:
   - **Green:** Added text
   - **Red:** Removed text
   - **Gray:** Unchanged
3. Show stats delta:
   - Word count change
   - Keyword count change
   - ATS score change
   - Section completeness

**Use Case:** Compare "initial" vs "optimized" to see impact

---

### 2.4 Resume History
**Purpose:** Track all resume versions with timestamps

**Files:** Integrated into `ResumeOptimizer.jsx` or new `ResumeHistory.jsx`

**Features:**
- List all versions with timestamps
- Select any version to view
- Restore previous version (duplicate)
- Delete old versions
- Tag versions (e.g., "ATS Optimized", "LinkedIn Version")

---

### 2.5 Resume Export
**Purpose:** Download resume as PDF or DOCX

**Libraries:** `html2pdf`, `docx` npm packages

**Flow:**
1. User clicks "Download"
2. Select format (PDF or DOCX)
3. Generate file with current resume data
4. Trigger browser download

---

## 3. Interview Preparation

### 3.1 Mock Interview
**Purpose:** Practice answering real interview questions with AI feedback

**Files:** `frontend/src/pages/MockInterview.jsx`, `backend/src/routes/interview.js`

**How It Works:**
1. User selects industry + role (e.g., "Software Engineer")
2. Click "Start Interview"
3. Gemini AI asks question (e.g., "Tell me about a project you led")
4. User types answer
5. Click "Submit Answer"
6. Gemini AI provides feedback:
   - **STAR Method Score:** Were S-T-A-R clearly presented?
   - **Content Quality:** Did they answer the question?
   - **Improvement Tips:** Specific suggestions
   - **Follow-up Question:** Dive deeper or move to next
7. Session transcript saved for review

**Gemini Prompt (Interview):**
```
You are an experienced technical interviewer. 
Ask a question for a [role] position at [company_type].
Be conversational. Ask one question at a time.
```

**Gemini Prompt (Feedback):**
```
The candidate answered: "[user_answer]"
The question was: "[question]"

Provide:
1. STAR method score (0-10)
2. Answer quality (0-10)
3. 2-3 specific improvement tips
4. A follow-up question
```

**API:** 
- `POST /interview/start` — Initialize session
- `POST /interview/submit` — Submit answer, get feedback

**Data Saved:**
- Interview session ID
- Questions asked
- User answers
- AI feedback
- Session duration
- Score breakdown

---

### 3.2 Interview History
**Purpose:** Review past interview sessions

**Features:**
- List all interviews with date, duration, score
- View full transcript
- See average scores over time
- Filter by role/industry
- Download transcript as PDF

---

## 4. LinkedIn Profile Optimizer

### 4.1 LinkedIn Optimizer
**Purpose:** Improve LinkedIn profile visibility and recruiter impact

**Files:** `frontend/src/pages/LinkedInOptimizer.jsx`, `backend/src/routes/linkedin.js`

**Current Data Extraction:**
- User pastes LinkedIn URL or profile screenshot
- Backend (or frontend mock) extracts:
  - Current headline
  - About section
  - Current skills
  - Experience summary

**AI Improvements (Gemini):**
- **Headline:** Suggest keyword-rich, recruiter-friendly headlines
- **About Section:** Expand/improve with industry keywords, storytelling
- **Skills:** Recommend skills to add based on role
- **Keyword Injection:** Identify power words missing from profile

**Example Output:**
```json
{
  "score": 72,
  "improvements": [
    {
      "section": "headline",
      "current": "Engineer at TechCo",
      "suggested": "Full Stack Engineer | React | Node.js | Cloud | TechCo",
      "impact": "recruiter keyword match +45%"
    },
    {
      "section": "about",
      "issues": ["Too vague", "Missing keywords"],
      "suggestions": ["Add 3-5 specific skills", "Quantify achievements"]
    }
  ],
  "nextSteps": [...]
}
```

**UI Features:**
- Character count (headline max 120, about max 2600)
- Real-time impact scoring
- Copy-to-clipboard for suggested text
- Before/after preview

**API:** `POST /linkedin/optimize` (protected)

---

### 4.2 LinkedIn Optimizer Enhanced
**Purpose:** Advanced version with visual scoring and priority ranking

**Files:** `frontend/src/pages/LinkedInOptimizerEnhanced.jsx`

**Additions:**
- **SVG Ring Score:** Visual 0-100 ring chart
- **Priority Ranking:** Numbered card list with impact sorting
- **Next Steps Card:** Ordered action items with estimated time to complete
- **Claim Badge:** Celebrate completed suggestions

---

## 5. GitHub Profile Optimizer

### 5.1 GitHub Optimizer
**Purpose:** Improve GitHub profile as a recruitment asset

**Files:** `frontend/src/pages/GitHubOptimizer.jsx`, `backend/src/routes/github.js`

**Current Analysis (Gemini):**
- Scans GitHub profile metadata
- Detects public repositories
- Analyzes README quality
- Checks for:
  - Missing pinned projects
  - Outdated READMEs
  - Poor repository descriptions
  - Low contribution consistency
  - Missing profile README

**Recommendations:**
```json
{
  "score": 58,
  "suggestions": [
    {
      "type": "profile_readme",
      "title": "Add a GitHub Profile README",
      "impact": "High visibility boost",
      "how": "Create README.md in your [username] repo with introduction, skills, projects"
    },
    {
      "type": "pin_projects",
      "title": "Pin your best 6 projects",
      "current": "No pinned projects",
      "impact": "Recruiters see your best work immediately"
    },
    {
      "type": "readme_quality",
      "title": "Improve project READMEs",
      "issues": ["Project X: No description", "Project Y: Missing setup instructions"],
      "impact": "Easier for recruiters to understand your work"
    }
  ]
}
```

**API:** `POST /github/optimize` (protected)

---

## 6. Job Application Tracker

### 6.1 Kanban Board
**Purpose:** Visual pipeline for job applications from applied → rejected

**Files:** `frontend/src/pages/JobTracker.jsx`

**Columns:**
1. **Applied** — Just submitted application
2. **Interview** — In interview process (phone, round 1, round 2, etc.)
3. **Offer** — Received job offer
4. **Rejected** — Application rejected or declined offer

**Card Features:**
- Company name + role
- Application date
- Days in pipeline
- Last action date
- Quick notes
- Click to expand for full details

**Actions:**
- Drag-drop cards between columns
- Click card → Edit details
- Add notes (e.g., "Passed phone screen", "Salary: $120k")
- Delete card
- Filter by company/date
- Archive old applications

---

### 6.2 Job Application Details
**Purpose:** Store comprehensive job application metadata

**Fields:**
- Company name
- Job title
- Application date
- Job posting URL
- Contact person (recruiter name/email)
- Status (Applied / Interview / Offer / Rejected)
- Notes (free-form)
- Salary range (if disclosed)
- Interview dates scheduled
- Offer details (if received)
- Follow-up date

**API:**
- `GET /jobs` — Fetch all applications (protected)
- `POST /jobs` — Create new application (protected)
- `PUT /jobs/:id` — Update application (protected)
- `DELETE /jobs/:id` — Archive/delete (protected)

---

### 6.3 Job Tracker Stats
**Purpose:** Dashboard stats for job search pipeline

**Metrics:**
- **Total Applied:** Count of all applications
- **In Interview:** Count in interview stage
- **Offers:** Count of offers received
- **Reply Rate:** % of applications that got responses
- **Avg Days to Interview:** Average time from apply to first interview
- **Avg Days to Offer:** Average time from apply to offer

**Visualization:** 
- Small stat cards (big numbers)
- Funnel chart (applied → interview → offer)
- Timeline chart (applications by week/month)

---

## 7. Onboarding & Personalization

### 7.1 Onboarding Quiz
**Purpose:** Assess user's career readiness and generate personalized action plan

**Files:** `frontend/src/pages/Onboarding.jsx`, `backend/src/routes/onboarding.js`

**4 Questions:**
1. **Resume Status**
   - "Yes, I have one"
   - "No, need to build one"
   - "Have one but needs updating"

2. **LinkedIn Profile**
   - "Profile complete and up-to-date"
   - "Profile needs optimization"
   - "Don't have a profile"

3. **Interview Prep**
   - "Very prepared, ready to practice"
   - "Could use some practice"
   - "Haven't practiced at all"

4. **GitHub Presence**
   - "Strong profile with projects"
   - "Profile exists, needs polish"
   - "Don't have public projects"

**Output: Personalized Recommendations**
```json
{
  "recommendations": [
    {
      "path": "/resume",
      "label": "Optimize Resume",
      "priority": 1,
      "reason": "You have a resume but it may benefit from ATS optimization"
    },
    {
      "path": "/linkedin",
      "label": "LinkedIn Optimizer",
      "priority": 2,
      "reason": "Your LinkedIn profile needs optimization"
    },
    {
      "path": "/interview",
      "label": "Mock Interview",
      "priority": 3,
      "reason": "Interview practice will boost your confidence"
    }
  ]
}
```

**UI:**
- Progress bar (step 1 of 4, etc.)
- One question per screen
- Auto-advance after selecting answer
- Back button to previous question
- "See My Path" button on last question
- Results screen showing ranked recommendations
- Buttons to start with top recommendation or go to dashboard

---

### 7.2 Onboarding Storage
**Purpose:** Save quiz answers to database for future reference

**Stored Data:**
- User ID
- Timestamp
- All 4 answers
- Generated recommendations
- Whether user completed onboarding

**API:** `POST /onboarding/complete` (protected)

---

## 8. Dashboard & Analytics

### 8.1 Dashboard Overview
**Purpose:** High-level view of all career metrics

**Files:** `frontend/src/pages/Dashboard.jsx`

**Sections:**
1. **Welcome Card** — Personalized greeting
2. **Quick Stats** — 4 metric cards:
   - Resume ATS Score
   - Interview Count
   - Job Applications
   - LinkedIn Profile Strength
3. **Recommendation Cards** — Top 3 next actions
4. **Charts:**
   - Resume Score Over Time (line chart)
   - Job Application Funnel (bar chart)
   - Interview History (timeline)
5. **Recent Activity** — Last 5 actions

---

### 8.2 Analytics Charts (Recharts)
**Purpose:** Visualize career progress trends

**Charts:**
- **Resume Score Trend** — Line chart of ATS scores over time
- **Application Funnel** — Bar chart showing Applied → Interview → Offer
- **Interview Performance** — Average scores by role/industry
- **Skills Growth** — Heatmap of skills added over time (future)

---

## 9. Dark Mode

### 9.1 Dark Mode Implementation
**Purpose:** Accessibility + user preference

**Files:** `frontend/src/hooks/useDarkMode.js`

**How It Works:**
1. Hook detects system preference on first load
2. Checks localStorage for saved preference
3. Applies `dark` class to `<html>` root element
4. Tailwind's `dark:` classes activate
5. Toggle button in navbar (sun/moon icon)
6. Preference persists in localStorage

**UI Component:**
- Moon icon (light mode) → Click → Sun icon (dark mode)
- Located in navbar via `Layout.jsx`

---

## 10. Error Handling

### 10.1 Error Boundary
**Purpose:** Prevent white-screen crashes from React errors

**Files:** `frontend/src/components/ErrorBoundary.jsx`

**How It Works:**
- Class component catching React errors
- Displays user-friendly fallback UI
- Shows error details in development mode
- Includes "Reset" button to recover

**Example Fallback:**
```
Something went wrong.
We've logged the error. Please try refreshing.
[Reset] [Go to Dashboard]
```

---

## 11. Loading & Button States

### 11.1 Loading Button Component
**Purpose:** Show loading state during API calls

**Files:** `frontend/src/components/LoadingButton.jsx`

**Features:**
- Disabled while loading
- Shows spinner or "Loading..." text
- Prevents double-clicks
- Accessible (aria-busy)

---

## 12. Suggestion Tracker

### 12.1 Suggestion Tracker Component
**Purpose:** Checkbox list for optimizer suggestions with progress

**Files:** `frontend/src/components/SuggestionTracker.jsx`

**Features:**
- List of 5-10 suggestions
- Checkbox to mark applied
- Progress bar (% completed)
- Points estimate (if you apply suggestion X, gain Y points)
- Auto-highlight high-impact suggestions first

---

## 13. Protected Routes

### 13.1 Protected Route Wrapper
**Purpose:** Require authentication to access certain pages

**Files:** Part of `App.jsx`

**How It Works:**
```javascript
<ProtectedRoute>
  <Dashboard />
</ProtectedRoute>
```

- Checks if user logged in (JWT token valid)
- Redirects to `/login` if not
- Prevents unauthorized access

---

## 14. Layout & Navigation

### 14.1 Layout Component
**Purpose:** Navbar + footer wrapper for all pages

**Files:** `frontend/src/components/Layout.jsx`

**Navbar:**
- JobTube logo (links to dashboard)
- Nav links (Resume, Interview, LinkedIn, GitHub, Jobs)
- Dark mode toggle (sun/moon icon)
- User dropdown (Profile, Logout)

**Footer:**
- Links (About, Terms, Privacy)
- Copyright

---

## Future Features (Planned)

### High Impact
1. **Cover Letter Generator** — AI-generated cover letters from resume + job description
2. **Salary Insights** — Role + location → salary ranges
3. **Job Search Integration** — Connect to LinkedIn Jobs, Indeed, JSearch APIs
4. **Email Notifications** — Resume score drops, interview reminders, job matches

### Medium Impact
5. **Notifications System** — In-app bell icon + notifications table
6. **Video Recording for Interviews** — Browser MediaRecorder API
7. **Resume PDF Parser** — Upload existing PDF → auto-extract data
8. **Skill Recommendations** — Based on role + industry trends

### Lower Impact
9. **Tests** — Vitest (frontend), Jest + Supertest (backend)
10. **Rate Limiting** — express-rate-limit on AI endpoints
11. **OAuth** — Google/GitHub login
12. **Admin Panel** — User management, feature flags
13. **Email Verification** — Nodemailer setup
14. **Analytics** — Usage tracking, heatmaps (privacy-respecting)

---

**Last Updated:** 2026-04-21
