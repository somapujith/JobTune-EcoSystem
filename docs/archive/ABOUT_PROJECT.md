# JobTube Eco System — Project Overview

## Mission
Accelerate career growth for freshers and early-career professionals through AI-powered resume optimization, interview preparation, LinkedIn/GitHub profile enhancement, and intelligent job application tracking.

---

## What is JobTube Eco System?

JobTube is an integrated career acceleration platform designed to solve the "job readiness gap" for students and fresher graduates. Instead of fragmented tools (resume builders, interview prep, job boards), JobTube consolidates everything into one intelligent ecosystem.

### Core Problem Solved
- Freshers lack professional resume standards
- Mock interviews feel disconnected from real feedback
- LinkedIn/GitHub profiles are often neglected or poorly optimized
- Job search is chaotic without tracking, follow-ups, or data
- No single place to measure career readiness

### Solution
One unified platform combining:
1. **AI Resume Optimization** — Generate/optimize resumes with ATS scoring
2. **Mock Interview Engine** — Practice with AI feedback + STAR method scoring
3. **LinkedIn Optimizer** — AI-driven profile improvement recommendations
4. **GitHub Optimizer** — Auto-detect projects, suggest visibility improvements
5. **Job Application Tracker** — Kanban board for tracking pipeline
6. **Onboarding Quiz** — Personalized recommendations based on user assessment

---

## Key Features (Current)

### 1. Resume Management
- **Resume Builder** — Guided UI to create/edit resumes
- **Resume Optimizer** — Gemini AI analyzes resume for:
  - ATS score (keyword matching)
  - Missing industry keywords
  - Formatting recommendations
  - Word count optimization
- **Resume Comparison** — Side-by-side diff view of versions with highlighting
- **Resume History** — Track all resume versions
- **Export** — PDF/DOCX download

### 2. Interview Preparation
- **Mock Interview** — Real-time conversation with Gemini AI
  - Industry-specific question banks
  - STAR method scoring
  - AI feedback on answer quality
  - Transcript saved for review

### 3. Profile Optimization
- **LinkedIn Optimizer** — AI recommendations for:
  - Headline improvements
  - About section optimization
  - Keyword injection
  - Character counters
  - Impact scoring
- **GitHub Optimizer** — Suggests:
  - Repository visibility tweaks
  - README improvements
  - Profile completeness tips

### 4. Job Application Tracking
- **Job Tracker (Kanban)** — 4-column board:
  - Applied
  - Interview
  - Offer
  - Rejected
- **Quick Stats** — Total applied, interviews, offers, reply rate
- **Notes** — Add/edit job application details
- **Alerts** — Follow-up reminders

### 5. Onboarding & Personalization
- **Onboarding Quiz** — 4-question assessment:
  - Resume status (have one / need to build / needs update)
  - LinkedIn profile maturity
  - Interview prep level
  - GitHub presence strength
- **Personalized Recommendations** — Quiz output generates priority-ranked next steps

### 6. Dashboard
- **Overview Stats** — Resume score, interview count, job applications
- **Recommendation Cards** — AI-generated action items
- **Analytics Charts** — Visualize career readiness metrics

---

## Tech Stack

### Frontend
- **Framework:** React 18 + Vite (fast build tool)
- **Styling:** Tailwind CSS (utility-first)
- **State Management:** Zustand (lightweight)
- **Routing:** React Router v6
- **UI Icons:** Lucide React
- **Export:** html2pdf, docx (resume downloads)
- **Charts:** Recharts (dashboard analytics)

### Backend
- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** MySQL (with Sequelize ORM)
- **Auth:** JWT (stored in localStorage on client)
- **AI Engine:** Google Gemini API (for resume optimization, interview, LinkedIn/GitHub suggestions)
- **Deployment:** Ready for Vercel (frontend) + AWS/Railway (backend)

### Infrastructure
- **Dev Mode:** `npm run dev` (frontend + backend)
- **Env Config:** `.env` file for API keys, DB credentials, secrets
- **Mock Mode:** `MOCK_AI=true` bypasses Gemini API (development fallback)

---

## Project Structure

```
JobTube Eco System/
├── frontend/                          # React + Vite SPA
│   ├── src/
│   │   ├── pages/                     # Page components
│   │   │   ├── Onboarding.jsx         # Quiz + personalized recommendations
│   │   │   ├── Dashboard.jsx          # Overview + quick stats
│   │   │   ├── ResumeBuilder.jsx      # Create/edit resume
│   │   │   ├── ResumeOptimizer.jsx    # AI optimization
│   │   │   ├── ResumeComparison.jsx   # Diff view
│   │   │   ├── MockInterview.jsx      # Interview prep
│   │   │   ├── LinkedInOptimizer.jsx  # LinkedIn profile suggestions
│   │   │   ├── LinkedInOptimizerEnhanced.jsx  # Enhanced version with scoring
│   │   │   ├── GitHubOptimizer.jsx    # GitHub visibility tips
│   │   │   ├── JobTracker.jsx         # Kanban board
│   │   │   ├── Login.jsx              # Auth entry point
│   │   │   └── ResumeSend.jsx         # Resume distribution
│   │   ├── components/
│   │   │   ├── Layout.jsx             # Navbar + footer (dark mode toggle)
│   │   │   ├── ErrorBoundary.jsx      # Error handler (React error boundary)
│   │   │   ├── LoadingButton.jsx      # Button with loading state
│   │   │   ├── SuggestionTracker.jsx  # Checkbox tracker for optimizer suggestions
│   │   │   └── ProtectedRoute.jsx     # Auth guard
│   │   ├── hooks/
│   │   │   └── useDarkMode.js         # Dark mode state + localStorage
│   │   ├── store/
│   │   │   └── useAuthStore.js        # Zustand auth store + API client
│   │   ├── App.jsx                    # Router setup, auth check, error boundary
│   │   └── main.jsx                   # React entry point
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── package.json
│
├── backend/                           # Express.js REST API
│   ├── src/
│   │   ├── server.js                  # Express app, middleware, port 3000
│   │   ├── routes/
│   │   │   ├── auth.js                # POST /register, /login, JWT issue
│   │   │   ├── resume.js              # GET/POST/PUT resume CRUD, /optimize
│   │   │   ├── interview.js           # POST /start, /submit (mock interview)
│   │   │   ├── linkedin.js            # POST /optimize (LinkedIn suggestions)
│   │   │   ├── github.js              # POST /optimize (GitHub suggestions)
│   │   │   ├── onboarding.js          # POST /complete (save quiz answers)
│   │   │   ├── jobs.js                # Job tracker CRUD (future)
│   │   │   └── admin.js               # Admin panel (stub)
│   │   ├── models/                    # Sequelize models
│   │   │   ├── User.js
│   │   │   ├── Resume.js
│   │   │   ├── OnboardingResponse.js
│   │   │   ├── InterviewSession.js
│   │   │   └── JobApplication.js
│   │   ├── middleware/
│   │   │   └── auth.js                # JWT verification
│   │   ├── utils/
│   │   │   ├── gemini.js              # Gemini API client wrapper
│   │   │   └── validation.js          # Input validation (Joi)
│   │   └── config/
│   │       └── database.js            # MySQL/Sequelize setup
│   ├── .env                           # Secrets (DB, API keys, JWT)
│   ├── package.json
│   └── .gitignore
│
├── DESIGN.md                          # Design system guidelines
├── ROADMAP.md                         # Feature roadmap + priorities
├── UX_IMPROVEMENTS.md                 # Recent UX enhancements
├── IMPLEMENTATION_SUMMARY.md          # Feature implementation notes
└── README.md                          # (corrupted, regenerate)
```

---

## How It Works — User Journey

### Step 1: Authentication
1. User lands on `/login`
2. Register or login with email/password
3. JWT token issued, stored in localStorage
4. Redirected to onboarding if first time

### Step 2: Onboarding Quiz
1. Answer 4 questions about resume, LinkedIn, interview prep, GitHub
2. Quiz generates personalized action plan
3. Priority-ranked recommendations displayed
4. User can skip or start with top recommendation

### Step 3: Resume Optimization (Core Flow)
1. User uploads/pastes resume or uses builder
2. Click "Optimize" → Gemini AI analyzes for:
   - ATS score (0-100)
   - Missing keywords
   - Formatting issues
   - Length recommendations
3. View suggestions, apply improvements
4. See updated score in real-time
5. Download optimized resume as PDF/DOCX

### Step 4: Interview Prep
1. Select industry + role
2. Start mock interview with Gemini AI
3. Answer questions in real-time
4. AI provides STAR method feedback
5. Transcript saved for later review

### Step 5: LinkedIn/GitHub Optimization
1. Connect or paste profile URL
2. AI analyzes current state
3. Provides actionable improvement suggestions
4. See character counts, impact scores
5. Copy suggestions directly to clipboard

### Step 6: Job Application Tracking
1. Add job applications via form
2. Drag-and-drop across Kanban columns (Applied → Interview → Offer → Rejected)
3. Add/edit notes per job
4. View stats dashboard (reply rate, offers, interviews)
5. Get follow-up reminders

### Step 7: Dashboard
1. Overview of all metrics
2. Trending resume scores
3. Interview history
4. Job application funnel
5. Quick access to next recommended action

---

## API Endpoints

### Auth
- `POST /auth/register` — Create account
- `POST /auth/login` — Issue JWT
- `GET /auth/me` — Current user (protected)

### Resume
- `GET /resume` — Fetch user's resume (protected)
- `POST /resume` — Create resume (protected)
- `PUT /resume/:id` — Update resume (protected)
- `DELETE /resume/:id` — Delete resume (protected)
- `POST /resume/optimize` — AI optimization (protected)
- `GET /resume/history` — All versions (protected)

### Interview
- `POST /interview/start` — Begin mock session (protected)
- `POST /interview/submit` — Submit answer, get feedback (protected)
- `GET /interview/history` — Past sessions (protected)

### LinkedIn
- `POST /linkedin/optimize` — AI suggestions (protected)

### GitHub
- `POST /github/optimize` — AI suggestions (protected)

### Onboarding
- `POST /onboarding/complete` — Save quiz answers (protected)

### Jobs (Planned)
- `GET /jobs` — Fetch user's job applications (protected)
- `POST /jobs` — Create job application (protected)
- `PUT /jobs/:id` — Update job (protected)
- `DELETE /jobs/:id` — Delete job (protected)

---

## Environment Variables

```env
# Backend (.env)
PORT=3000
DB_USER=root
DB_PASSWORD=<mysql_password>
DB_HOST=localhost
DB_PORT=3306
DB_NAME=fresher_ecosystem
JWT_SECRET=<secret_key>
NODE_ENV=development
GEMINI_API_KEY=<google_ai_api_key>
GEMINI_MODEL=gemini-2.0-flash
MOCK_AI=true  # Set to false to use real Gemini API
```

---

## Getting Started (Local Dev)

### Prerequisites
- Node.js 18+
- MySQL 8.0+
- Google Gemini API key (free tier available)

### Setup

**1. Clone & Install**
```bash
cd "h:\JobTube Eco System"
cd frontend && npm install
cd ../backend && npm install
```

**2. Configure Backend**
```bash
# backend/.env
PORT=3000
DB_USER=root
DB_PASSWORD=your_password
DB_HOST=localhost
DB_NAME=fresher_ecosystem
JWT_SECRET=your_secret_key
GEMINI_API_KEY=your_gemini_key
MOCK_AI=true  # Use false with real API key
```

**3. Database Setup**
```bash
# Create MySQL database
mysql -u root -p
CREATE DATABASE fresher_ecosystem;
```

**4. Start Servers**
```bash
# Terminal 1: Backend (port 3000)
cd backend
npm run dev

# Terminal 2: Frontend (port 5173)
cd frontend
npm run dev
```

**5. Access**
- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3000`

---

## Key Design Principles

### 1. User-Centric
- Onboarding personalizes next steps based on actual needs
- Dark mode for accessibility
- Error boundaries prevent white-screen crashes
- Clear, jargon-free language

### 2. AI-First
- Every major feature powered by Gemini AI (or mock fallback)
- Real-time feedback loops
- Continuous optimization suggestions

### 3. Data Privacy
- JWT auth (no session cookies)
- Passwords hashed (bcrypt)
- No hardcoded secrets in code
- `.env` excluded from git

### 4. Design System
- "The Digital Mentorship" aesthetic (see DESIGN.md)
- No 1px borders; color shifts define sections
- Glassmorphism for floating elements
- Generous whitespace
- Asymmetrical layouts

### 5. Scalability
- Modular React components
- RESTful API structure
- Prepared for cloud deployment (Vercel + AWS)
- Rate limiting ready (not yet implemented)

---

## Current Status

### Completed ✅
- Authentication (JWT)
- Resume builder + optimizer
- Resume comparison (diff view)
- Mock interview engine
- LinkedIn optimizer
- GitHub optimizer
- Job tracker (Kanban board)
- Onboarding quiz + recommendations
- Dark mode toggle
- Error boundaries
- Dashboard with analytics
- Responsive design (mobile-first)

### In Progress 🚧
- Cover letter generator
- Salary insights
- Job search API integration
- Email notifications

### Planned 📋
- Rate limiting on AI endpoints
- Test suite (Vitest + Jest)
- OAuth (Google/GitHub login)
- Admin panel
- Analytics enhancements
- Video recording for interviews

---

## Performance Metrics

- **Frontend Build:** Vite (< 500ms rebuild)
- **API Response:** < 200ms (Gemini calls vary, typically 1-3s)
- **Database Queries:** Indexed for fast retrieval
- **Bundle Size:** ~120KB gzipped (React + Tailwind + Zustand)

---

## Security Checklist

- [x] JWT authentication
- [x] Password hashing (bcrypt assumed)
- [x] No hardcoded secrets (uses .env)
- [x] Error boundaries (no white-screen crashes)
- [x] HTTPS ready for production
- [ ] Rate limiting (planned)
- [ ] Input validation (Joi ready, not fully integrated)
- [ ] CSRF protection (needed)
- [ ] SQL injection prevention (Sequelize ORM used)

---

## Contributing Guidelines

### Before PR
1. Test feature end-to-end locally
2. Follow design system (DESIGN.md)
3. No `console.log` statements
4. Add comments only for non-obvious logic
5. Ensure no secrets in `.env` or code

### Commit Format
```
<type>: <description>

<optional body>
```
Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`

---

## Support & Contact

For bugs, feature requests, or questions:
- Email: somapujith@gmail.com
- Issues: Track in project roadmap
- Design questions: See DESIGN.md

---

## License

Proprietary. All rights reserved.

---

**Last Updated:** 2026-04-21  
**Version:** 1.0.0 (Beta)
