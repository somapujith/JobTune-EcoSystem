# JobTube Eco System — Complete Project Architecture & Technology Guide

**Last Updated:** June 13, 2026  
**Version:** 2.0  
**Status:** Production-Ready (with ongoing feature additions)

---

## 📋 Table of Contents

1. [Project Overview](#project-overview)
2. [Technology Stack](#technology-stack)
3. [Architecture Diagram](#architecture-diagram)
4. [Project Structure](#project-structure)
5. [Key Components & Their Functions](#key-components--their-functions)
6. [Data Flow & Communication](#data-flow--communication)
7. [How Each Feature Works](#how-each-feature-works)
8. [Setup & Deployment](#setup--deployment)
9. [Configuration & Environment](#configuration--environment)
10. [Testing & Quality Assurance](#testing--quality-assurance)
11. [Future Enhancements](#future-enhancements)

---

## 🎯 Project Overview

### Mission
JobTube Eco System is an **AI-powered career acceleration platform** designed to help freshers and early-career professionals:
- Build and optimize AI-powered resumes with ATS scoring
- Prepare for interviews with real-time AI mock interviews
- Optimize LinkedIn and GitHub profiles
- Track job applications with Kanban boards
- Discover job opportunities and analyze job-candidate fit
- Build career roadmaps with AI guidance

### Core Problem Solved
- Freshers lack access to professional resume standards and ATS optimization
- Interview preparation is fragmented and lacks real feedback
- Profile optimization tools (LinkedIn/GitHub) are disconnected
- Job search process is chaotic without tracking or data insights
- No centralized platform for career readiness assessment

### Key Differentiators
1. **All-in-one ecosystem** — resume, interview, profiles, job tracking in one platform
2. **AI-powered insights** — uses Claude AI, Anthropic SDK, and custom NLP engines
3. **Resume ATS Scoring** — advanced ATS scoring with role-specific analysis
4. **Real-time Feedback** — interview prep with instant AI feedback
5. **Personalized Recommendations** — onboarding quiz generates action plans

---

## 🛠 Technology Stack

### Frontend Stack

| Technology | Purpose | Version |
|-----------|---------|---------|
| **React** | UI framework | 18.2.0 |
| **Vite** | Build tool & dev server | 5.1.0 |
| **Tailwind CSS** | Utility-first styling | 3.4.1 |
| **React Router** | Client-side routing | 6.22.1 |
| **Zustand** | State management (stores) | 4.5.1 |
| **React Hook Form** | Form state & validation | 7.50.1 |
| **Zod** | Schema validation | 3.22.4 |
| **Axios** | HTTP client | 1.6.7 |
| **Recharts** | Data visualization | 2.12.1 |
| **Lucide React** | Icon library | 0.344.0 |
| **@hookform/resolvers** | Form validation adapters | 3.3.4 |
| **@tailwindcss/forms** | Form component styles | 0.5.11 |

### Backend Stack

| Technology | Purpose | Version |
|-----------|---------|---------|
| **Node.js** | JavaScript runtime | 18+ |
| **Express.js** | REST API framework | 5.2.1 |
| **PostgreSQL** | Primary database | 12+ |
| **Sequelize** | ORM for database queries | Latest |
| **JWT (jsonwebtoken)** | Authentication tokens | 9.0.3 |
| **Bcrypt** | Password hashing | 6.0.0 |
| **Multer** | File upload handling | 2.1.1 |
| **@anthropic-ai/sdk** | Claude AI API integration | 0.103.0 |
| **Axios** | HTTP requests | 1.17.0 |
| **Joi** | Input validation | 18.1.2 |
| **Winston** | Structured logging | 3.19.0 |
| **Dotenv** | Environment variables | 17.4.2 |
| **CORS** | Cross-origin resource sharing | 2.8.6 |
| **PDF-Parse** | PDF text extraction | 1.1.4 |
| **Mammoth** | DOCX to HTML conversion | 1.12.0 |
| **PDFKit** | PDF generation | 0.16.0 |
| **JSZIP** | ZIP file handling | 3.10.1 |
| **xml2js** | XML parsing | 0.6.2 |

### AI & External Services

| Service | Purpose | Integration |
|---------|---------|------------|
| **Claude AI (Anthropic)** | Resume analysis, interview feedback, career roadmap generation | @anthropic-ai/sdk |
| **Google Gemini API** | Initial AI analysis (legacy, being migrated to Claude) | API key in .env |
| **Resume Parser** | Extract structured data from PDF/DOCX | Custom implementation with pdf-parse + mammoth |
| **ATS Scoring Engine** | Keyword matching & formatting analysis | Custom NLP services |

### Infrastructure & DevOps

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Frontend Hosting** | Vercel (or Netlify) | Fast global CDN delivery |
| **Backend Hosting** | Railway, Render, or AWS EC2 | Node.js API server |
| **Database** | PostgreSQL (managed on Railway/Heroku/AWS RDS) | Persistent data storage |
| **Authentication** | JWT + localStorage | Stateless auth |
| **File Storage** | Local (development) or S3 (production) | Resume/export files |
| **Logging** | Winston + console | Request/error tracking |
| **Environment Management** | .env files | Configuration secrets |

---

## 🏗 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                              │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ React 18 Application (Vite Bundle)                           │  │
│  ├─────────────────┬──────────────────┬───────────────────────┤  │
│  │ Pages           │ Components       │ Hooks & Stores        │  │
│  ├─────────────────┼──────────────────┼───────────────────────┤  │
│  │ • Onboarding    │ • Layout         │ • useAuthStore        │  │
│  │ • Dashboard     │ • ErrorBoundary  │ • useResume           │  │
│  │ • ResumeBuilder │ • Loading        │ • useDarkMode         │  │
│  │ • AtsChecker    │ • Protected      │ • Zustand providers   │  │
│  │ • Interview     │ • Navigation     │                       │  │
│  │ • JobTracker    │ • Forms          │                       │  │
│  └─────────────────┴──────────────────┴───────────────────────┘  │
│                             ↓ (Axios)                              │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                    HTTP/HTTPS   │   (REST API)
                                 ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    BACKEND (Node.js/Express)                         │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ Express.js Application (Port 5000/3000)                      │  │
│  ├──────────────────┬─────────────────┬────────────────────────┤  │
│  │ Routes           │ Middleware      │ Services               │  │
│  ├──────────────────┼─────────────────┼────────────────────────┤  │
│  │ • /auth          │ • CORS          │ • atsScorer.js        │  │
│  │ • /resume        │ • JWT Verify    │ • resumeAnalyzer.js   │  │
│  │ • /interview     │ • Error Handler │ • jobFitter.js        │  │
│  │ • /ats           │ • Audit Logger  │ • aiClient.js         │  │
│  │ • /jobs          │ • File Upload   │ • pdfParser.js        │  │
│  │ • /career        │ (Multer)        │ • docxConverter.js    │  │
│  │ • /linkedin      │                 │                       │  │
│  │ • /github        │                 │                       │  │
│  └──────────────────┴─────────────────┴────────────────────────┘  │
│         ↓                              ↓                             │
│  ┌──────────────┐              ┌──────────────────┐              │
│  │ Models       │              │ Config & Utils   │              │
│  ├──────────────┤              ├──────────────────┤              │
│  │ • User       │              │ • database.js    │              │
│  │ • Resume     │              │ • validation.js  │              │
│  │ • JobApp     │              │ • errorHandler   │              │
│  │ • Interview  │              │ • auditLogger    │              │
│  │ • Onboarding │              │ • env config     │              │
│  └──────────────┘              └──────────────────┘              │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                    SQL Queries   │   API Calls
                                 ↓
┌─────────────────────────────────────────────────────────────────────┐
│                         EXTERNAL SERVICES                            │
│  ┌────────────────────┐  ┌────────────────────┐                  │
│  │ PostgreSQL DB      │  │ Claude AI API      │                  │
│  │ • User data        │  │ • Resume analysis  │                  │
│  │ • Resumes          │  │ • Interview gen    │                  │
│  │ • Job apps         │  │ • Career roadmap   │                  │
│  │ • Sessions         │  │ • Cover letters    │                  │
│  └────────────────────┘  └────────────────────┘                  │
│  ┌────────────────────┐  ┌────────────────────┐                  │
│  │ Google Gemini API  │  │ File Storage       │                  │
│  │ • Suggestions      │  │ • PDF exports      │                  │
│  │ • Optimization     │  │ • DOCX downloads   │                  │
│  └────────────────────┘  └────────────────────┘                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 📁 Project Structure

### Frontend Structure

```
frontend/
├── src/
│   ├── pages/                              # Page-level components
│   │   ├── Onboarding.jsx                 # Quiz-based personalization
│   │   ├── Dashboard.jsx                  # Overview & stats
│   │   ├── ResumeBuilder.jsx              # Create/edit resume
│   │   ├── ResumeOptimizer.jsx            # AI optimization workflow
│   │   ├── ResumeComparison.jsx           # Version diff viewer
│   │   ├── ATSChecker.jsx                 # ATS score checker
│   │   ├── ATSCheckerV2.jsx               # Enhanced ATS with resume upload
│   │   ├── MockInterview.jsx              # Interview prep with AI
│   │   ├── LinkedInOptimizer.jsx          # Profile improvement suggestions
│   │   ├── GitHubOptimizer.jsx            # Repo visibility tips
│   │   ├── JobTracker.jsx                 # Kanban board for applications
│   │   ├── CareerRoadmap.jsx              # AI-generated career path
│   │   ├── CoverLetterGenerator.jsx       # AI letter generation
│   │   ├── JobDiscovery.jsx               # Job search & discovery
│   │   ├── Login.jsx                      # Auth entry point
│   │   ├── Register.jsx                   # User registration
│   │   └── NotFound.jsx                   # 404 page
│   │
│   ├── components/                         # Reusable UI components
│   │   ├── Layout.jsx                     # Header, nav, footer
│   │   ├── Navbar.jsx                     # Navigation bar with auth
│   │   ├── Footer.jsx                     # Footer with links
│   │   ├── ErrorBoundary.jsx              # React error boundary
│   │   ├── LoadingButton.jsx              # Button with loading state
│   │   ├── LoadingSpinner.jsx             # Spinner component
│   │   ├── Modal.jsx                      # Reusable modal dialog
│   │   ├── Card.jsx                       # Card wrapper
│   │   ├── Badge.jsx                      # Status badge
│   │   ├── SuggestionTracker.jsx          # Checkbox tracker
│   │   ├── ProtectedRoute.jsx             # Auth guard wrapper
│   │   ├── Form*.jsx                      # Form components
│   │   └── Charts/                        # Recharts wrappers
│   │       ├── LineChart.jsx
│   │       ├── BarChart.jsx
│   │       └── PieChart.jsx
│   │
│   ├── hooks/                              # Custom React hooks
│   │   ├── useDarkMode.js                 # Dark mode toggle + storage
│   │   ├── useAuth.js                     # Auth context/state
│   │   ├── useFetch.js                    # Data fetching logic
│   │   └── useLocalStorage.js             # LocalStorage wrapper
│   │
│   ├── store/                              # Zustand state management
│   │   ├── useAuthStore.js                # User auth state
│   │   ├── useResume Store.js             # Resume data state
│   │   ├── useJobStore.js                 # Job application state
│   │   └── useUIStore.js                  # UI/modal states
│   │
│   ├── utils/                              # Utility functions
│   │   ├── api.js                         # Axios instance & interceptors
│   │   ├── validation.js                  # Form validation schemas
│   │   ├── formatters.js                  # Data formatting helpers
│   │   ├── storage.js                     # LocalStorage helpers
│   │   └── pdf-export.js                  # PDF download logic
│   │
│   ├── styles/                             # Global styles
│   │   ├── globals.css                    # Tailwind imports
│   │   ├── animations.css                 # Custom animations
│   │   └── variables.css                  # CSS variables
│   │
│   ├── App.jsx                            # Root component & routing
│   ├── main.jsx                           # React entry point
│   └── index.html                         # HTML template
│
├── public/                                 # Static assets
│   ├── logo.svg
│   ├── favicon.ico
│   └── images/
│
├── vite.config.js                         # Vite configuration
├── tailwind.config.js                     # Tailwind CSS config
├── postcss.config.js                      # PostCSS plugins
├── package.json                           # Dependencies & scripts
└── .env.local                             # Local env variables

```

### Backend Structure

```
backend/
├── src/
│   ├── routes/                             # API route handlers
│   │   ├── auth.js                        # /api/auth/* endpoints
│   │   ├── resume.js                      # /api/resume/* endpoints
│   │   ├── resumeV2.js                    # V2 resume endpoints
│   │   ├── atsChecker.js                  # /api/jobs/check ATS
│   │   ├── atsCheckerV2.js                # V2 ATS checker (PDF upload)
│   │   ├── interview.js                   # /api/interview/* endpoints
│   │   ├── linkedin.js                    # /api/linkedin/* endpoints
│   │   ├── github.js                      # /api/github/* endpoints
│   │   ├── jobTracker.js                  # /api/jobs/* (CRUD)
│   │   ├── careerRoadmap.js               # /api/career/* endpoints
│   │   ├── coverLetter.js                 # /api/jobs/cover-letter
│   │   ├── jobDiscovery.js                # /api/jobs/discover
│   │   ├── jobAnalyzer.js                 # /api/jobs/analyze
│   │   ├── dashboard.js                   # /api/dashboard/* stats
│   │   ├── admin.js                       # /api/admin/* (admin only)
│   │   ├── subscriptions.js               # /api/subscriptions/*
│   │   ├── guides.js                      # /api/guides/*
│   │   ├── benchmarks.js                  # /api/benchmarks/*
│   │   └── ... (other routes)
│   │
│   ├── services/                           # Business logic & AI integration
│   │   ├── v1/                            # Legacy services
│   │   │   ├── geminiClient.js            # Google Gemini API wrapper
│   │   │   └── resumeOptimizer.js         # Legacy optimizer
│   │   │
│   │   ├── v2/                            # Advanced analysis engines
│   │   │   ├── atsScorer.js               # ATS scoring algorithm
│   │   │   ├── resumeAnalysisEngine.js    # Multi-metric analysis
│   │   │   ├── resumeOptimizationEngine.js # AI suggestions
│   │   │   ├── resumeCriticEngine.js      # Feedback generator
│   │   │   ├── jobDescriptionParser.js    # JD analysis
│   │   │   ├── skillClassifier.js         # Skill extraction & matching
│   │   │   ├── roleDetectionEngine.js     # Job role detection
│   │   │   ├── keywordAnalyzer.js         # Keyword ranking
│   │   │   ├── actionVerbAnalyzer.js      # Action verb scoring
│   │   │   ├── formattingAnalyzer.js      # Format quality check
│   │   │   ├── sectionAnalyzer.js         # Resume section analysis
│   │   │   ├── metricsAnalyzer.js         # KPI extraction
│   │   │   ├── missingInfoEngine.js       # Gap detection
│   │   │   └── resumeExportEngine.js      # PDF/DOCX export
│   │   │
│   │   ├── aiClient.js                    # Claude AI SDK wrapper
│   │   ├── pdfParser.js                   # PDF text extraction
│   │   ├── docxConverter.js               # DOCX to text conversion
│   │   └── fileHandler.js                 # Upload/download logic
│   │
│   ├── models/                             # Database models (Sequelize)
│   │   ├── User.js                        # User accounts
│   │   ├── Resume.js                      # Resume documents
│   │   ├── JobApplication.js              # Job tracker entries
│   │   ├── InterviewSession.js            # Mock interview history
│   │   ├── OnboardingResponse.js          # Quiz answers
│   │   ├── Subscription.js                # User subscriptions
│   │   ├── AuditLog.js                    # Action history
│   │   └── ... (other models)
│   │
│   ├── middleware/                         # Express middleware
│   │   ├── auth.js                        # JWT verification
│   │   ├── errorHandler.js                # Global error handling
│   │   ├── auditLogger.js                 # Request logging
│   │   ├── rateLimit.js                   # Rate limiting
│   │   ├── validation.js                  # Input validation
│   │   └── cors.js                        # CORS configuration
│   │
│   ├── config/                             # Configuration files
│   │   ├── database.js                    # PostgreSQL/Sequelize setup
│   │   ├── env.js                         # Environment variables
│   │   ├── logger.js                      # Winston logger setup
│   │   └── constants.js                   # App-wide constants
│   │
│   ├── utils/                              # Utility functions
│   │   ├── validation.js                  # Joi schemas
│   │   ├── pdfExport.js                   # PDF generation (PDFKit)
│   │   ├── emailQueue.js                  # Email service (stub)
│   │   ├── formatters.js                  # Data formatting
│   │   └── errorLogger.js                 # Error tracking
│   │
│   ├── app.js                             # Express app setup & routes mount
│   ├── server.js                          # Server entry point (Port 5000)
│   └── index.js                           # (Alternative entry)
│
├── .env                                    # Environment variables (secrets)
├── .env.example                            # Template for .env
├── .gitignore                              # Git exclusions
├── package.json                            # Dependencies & scripts
└── README.md                               # Backend documentation
```

---

## 🔧 Key Components & Their Functions

### Frontend Components

#### Pages

| Page | Purpose | Key Features |
|------|---------|------------|
| **Onboarding.jsx** | First-time user personalization | 4-question quiz, action plan generation |
| **Dashboard.jsx** | User overview & metrics | Stats cards, charts, quick links |
| **ResumeBuilder.jsx** | Resume creation UI | Rich text editor, template selection |
| **ResumeOptimizer.jsx** | AI-powered improvements | ATS scoring, suggestions, side-by-side diff |
| **ATSChecker.jsx** | Text-based ATS analysis | Paste text, get instant score |
| **ATSCheckerV2.jsx** | File-based ATS checker | Upload PDF/DOCX, detailed analysis |
| **MockInterview.jsx** | Interview preparation | Real-time conversation, STAR feedback |
| **LinkedInOptimizer.jsx** | Profile improvement tips | AI suggestions, character counters |
| **GitHubOptimizer.jsx** | Repository enhancement | Visibility tips, README suggestions |
| **JobTracker.jsx** | Application pipeline | Kanban board, notes, follow-up alerts |
| **CareerRoadmap.jsx** | AI-generated growth path | Milestones, skill recommendations |
| **CoverLetterGenerator.jsx** | Letter generation | AI template + customization |
| **JobDiscovery.jsx** | Job search interface | Filters, job-fit scoring |

#### Hooks

| Hook | State Managed | Persistence |
|------|---------------|------------|
| **useDarkMode()** | Dark/light theme | localStorage |
| **useAuth()** | User login status, JWT | localStorage + Zustand |
| **useFetch()** | Loading, error, data | In-memory |
| **useLocalStorage()** | Key-value storage | Browser localStorage |

#### State Management (Zustand)

```javascript
// useAuthStore.js
- user: User object
- token: JWT token
- isAuthenticated: Boolean
- login(email, password): JWT → store
- logout(): Clear state
- checkAuth(): Verify token validity

// useResumeStore.js
- currentResume: Resume object
- versions: Array of versions
- selectedVersion: Current version ID
- updateResume(data): Merge changes
- saveVersion(): Create snapshot

// useJobStore.js
- jobs: Array of applications
- filter: Active column filter
- addJob(jobData): Create entry
- updateJob(id, data): Modify entry
- deleteJob(id): Remove entry
```

### Backend Services (v2)

| Service | Function | Input | Output |
|---------|----------|-------|--------|
| **atsScorer.js** | Calculate ATS match percentage | Resume text, JD text | Score (0-100), keyword matches |
| **resumeAnalysisEngine.js** | Multi-metric analysis | Resume object | Scores: ATS, formatting, content |
| **jobDescriptionParser.js** | Extract structured JD data | JD text | Skills, requirements, level |
| **skillClassifier.js** | Identify & rank skills | Resume/JD text | Skill array with match score |
| **roleDetectionEngine.js** | Infer job role from resume | Resume data | Job title, industry, seniority |
| **keywordAnalyzer.js** | Analyze keyword effectiveness | Resume text | High/medium/low impact words |
| **actionVerbAnalyzer.js** | Score action verbs in bullets | Bullet points | Verb strength rating |
| **formattingAnalyzer.js** | Check formatting quality | Resume text | Format score, issues |
| **resumeOptimizationEngine.js** | Generate improvement suggestions | Resume + JD | Actionable suggestions |
| **resumeCriticEngine.js** | Provide feedback | Resume data | Constructive criticism |

### Routes & Endpoints

#### Authentication (`/api/auth/`)
```
POST   /register          → Create account
POST   /login             → Issue JWT
GET    /me                → Get current user (protected)
POST   /logout            → Invalidate token
POST   /refresh           → Get new token
POST   /forgot-password   → Reset password flow
```

#### Resume Management (`/api/resume/`)
```
GET    /                  → Get all resumes
GET    /:id               → Get specific resume
POST   /                  → Create resume
PUT    /:id               → Update resume
DELETE /:id               → Delete resume
POST   /analyze           → Run analysis (V1)
POST   /upload            → Upload PDF/DOCX
POST   /optimize          → Get AI suggestions
POST   /export/:format    → Export (pdf/docx)
```

#### ATS Checker (`/api/ats/` or `/api/jobs/check`)
```
POST   /check             → Analyze resume text vs JD text
POST   /check-v2          → Upload file & analyze
POST   /detailed-report   → Full ATS analysis report
POST   /match-skills      → Skill-by-skill matching
```

#### Interview (`/api/interview/`)
```
POST   /start             → Begin mock interview
POST   /submit-answer     → Submit answer + get feedback
POST   /end               → Conclude session
GET    /history           → Get past sessions
GET    /:sessionId        → Get session transcript
```

#### Job Tracker (`/api/jobs/`)
```
GET    /applications      → Get all job applications
POST   /applications      → Create new application
PUT    /applications/:id  → Update application
DELETE /applications/:id  → Delete application
POST   /move              → Change Kanban column
POST   /notes/:id         → Add/update notes
GET    /stats             → Get pipeline statistics
```

#### Career Roadmap (`/api/career/`)
```
POST   /generate          → Generate personalized roadmap
GET    /:id               → Get specific roadmap
PUT    /:id               → Update progress
POST   /recommend-skills  → Skill recommendations
```

---

## 🔄 Data Flow & Communication

### Typical Request Flow

```
1. USER ACTION (e.g., "Click Optimize Resume")
   ↓
2. FRONTEND EVENT HANDLER
   - Collect form data
   - Validate with Zod schema
   ↓
3. API CALL (Axios)
   - POST /api/resume/optimize
   - Headers: { Authorization: `Bearer ${token}` }
   - Body: { resumeText, jobDescription, language }
   ↓
4. BACKEND ROUTE HANDLER (resumeV2.js)
   - Extract & validate request body
   - Check JWT validity (auth middleware)
   - Log request (audit logger)
   ↓
5. BUSINESS LOGIC (services/v2/)
   a) atsScorer.js
      - Tokenize resume
      - Extract keywords
      - Match against JD
      - Calculate score (0-100)
   b) resumeAnalysisEngine.js
      - Run section analyzer
      - Run formatting analyzer
      - Run action verb analyzer
      - Aggregate scores
   c) resumeOptimizationEngine.js
      - Call Claude AI API
      - Generate suggestions
      - Format response
   ↓
6. DATABASE QUERY (if needed)
   - Save analysis to Resume model
   - Update resume version
   ↓
7. RESPONSE
   - 200 OK + analysis data
   - Error handling (4xx/5xx)
   ↓
8. FRONTEND RECEIVES DATA
   - axios.then() callback
   - Update Zustand store
   - Re-render UI with results
   ↓
9. USER SEES RESULTS
   - ATS score badge
   - Suggestion list
   - Before/after preview
```

### Authentication Flow

```
REGISTRATION:
User input → POST /api/auth/register
→ Hash password (bcrypt)
→ Create User record
→ Issue JWT token
→ Return { token, user } to frontend
→ Store in localStorage + Zustand
→ Redirect to onboarding

LOGIN:
Credentials → POST /api/auth/login
→ Find user by email
→ Compare bcrypt hash
→ Issue JWT token
→ Return { token, user }
→ Store in localStorage
→ Redirect to dashboard

PROTECTED REQUEST:
Axios interceptor checks localStorage
→ Attach Authorization header
→ Backend auth middleware verifies JWT
→ Extract user ID from token
→ Proceed to route handler
→ If invalid, return 401 → logout user
```

### File Upload Flow (Resume)

```
USER SELECTS PDF/DOCX
↓
FRONTEND (multipart/form-data)
→ POST /api/resume/upload
→ Multer middleware parses file
↓
BACKEND FILE HANDLER
→ Validate file type (pdf, docx only)
→ Validate file size (max 5MB)
→ Save to /uploads/ directory
↓
TEXT EXTRACTION
→ If PDF: pdf-parse library
→ If DOCX: mammoth.js library
→ Extract plain text
↓
ANALYSIS ENGINES
→ Resume Analysis Engine v2
→ ATS Scoring Engine
→ Skill Classification
→ Generate suggestions
↓
DATABASE SAVE
→ Create Resume record
→ Store file path
→ Store extracted text
→ Store analysis results
↓
RESPONSE TO FRONTEND
→ { resumeId, fileName, fileText, analysis }
→ Frontend displays analysis UI
```

---

## 🎯 How Each Feature Works

### 1. Resume Optimization Flow

**User Story:** "I want to optimize my resume for a specific job"

```
1. User navigates to ResumeOptimizer.jsx
2. Pastes/uploads resume text (or selects from previous)
3. Pastes job description
4. Clicks "Optimize Resume"

BACKEND PROCESS:
5. Receives POST /api/resume/optimize
6. Runs v2 Analysis:
   a) atsScorer.js
      - Tokenize resume: ["python", "javascript", "react", "nodejs"]
      - Tokenize JD: ["python", "react", "nodejs", "database"]
      - Calculate intersection: ["python", "react", "nodejs"] = 3/4
      - ATS Score = (3/4) * 100 = 75%
   
   b) formattingAnalyzer.js
      - Check: dates, font sizes, line spacing
      - Format Score = 85%
   
   c) resumeOptimizationEngine.js
      - Calls Claude AI
      - Prompt: "Analyze this resume for job fit"
      - Response: structured suggestions
      
   d) skillClassifier.js
      - Extract skills from resume
      - Match with JD required skills
      - Show: [{ skill: "Python", match: 95% }, ...]

7. Returns analysis object to frontend
8. Frontend displays:
   - ATS Score (75%)
   - Missing Keywords
   - Formatting Issues
   - AI Suggestions
   - Skill Match Chart

9. User clicks "Apply Suggestion"
10. Frontend updates resume text
11. POST /api/resume/optimize (again)
12. New score: 82%

RESULT: User iteratively improves resume
```

### 2. ATS Checker V2 (File Upload)

**User Story:** "I want to upload my resume PDF and see how it compares to a job"

```
1. User navigates to ATSCheckerV2.jsx
2. Uploads resume.pdf file
3. System extracts text using pdf-parse
4. Option to paste JD or use generic criteria
5. Clicks "Check ATS Score"

BACKEND:
6. Files received in /api/ats/check-v2
7. Multer parses PDF file
8. pdf-parse extracts text
9. Resume Analysis Engine v2:
   - atsScorer.js: 78 score
   - actionVerbAnalyzer.js: {"Led": 95, "Managed": 90, "Used": 60}
   - sectionAnalyzer.js: {summary: ok, experience: good, skills: weak}
   - metricsAnalyzer.js: {projects: 5, years_exp: 3, companies: 2}

10. Claude AI generates:
    - "Your resume is strong in project delivery but lacks metrics"
    - "Add 3-5 quantifiable achievements per role"
    - "Reorganize skills section with top 10 relevant skills"

11. Frontend displays dashboard:
    ┌─────────────────────────────────┐
    │ ATS Score: 78/100 (Good)        │
    ├─────────────────────────────────┤
    │ Formatting: 85%  ▓▓▓▓▓          │
    │ Content: 72%     ▓▓▓▓           │
    │ Keywords: 80%    ▓▓▓▓▓          │
    ├─────────────────────────────────┤
    │ Improvements:                   │
    │ ☐ Add quantified metrics        │
    │ ☐ Strengthen action verbs       │
    │ ☐ Optimize skill keywords       │
    └─────────────────────────────────┘

RESULT: User gets actionable feedback on resume quality
```

### 3. Mock Interview Flow

**User Story:** "I want to practice answering interview questions"

```
1. User navigates to MockInterview.jsx
2. Selects industry (Tech, Finance, HR, etc.)
3. Selects role (Software Engineer, Product Manager, etc.)
4. Clicks "Start Interview"

BACKEND:
5. POST /api/interview/start
6. Creates InterviewSession record
7. Calls Claude AI:
   - Prompt: "Generate 5 interview questions for Software Engineer role"
   - Response: ["Tell me about a challenging project", "How do you handle conflicts?", ...]

FRONTEND:
8. Displays first question
9. User types/records answer
10. Clicks "Submit Answer"

BACKEND (Analysis):
11. POST /api/interview/submit-answer
12. Claude AI analyzes answer:
    - STAR format completeness (Situation/Task/Action/Result)
    - Communication clarity
    - Technical depth
    - Relevance to question
13. Returns feedback + rating

FRONTEND:
14. Displays feedback:
    "Your answer was clear and well-structured. 
     You covered the Action and Result well. 
     Consider adding more detail to the Situation setup.
     Score: 8/10"
15. Shows next question

16-onwards: Repeat for all questions

END OF SESSION:
- Save transcript to InterviewSession
- Calculate average score
- Show summary report
- Option to download transcript

RESULT: User gets AI feedback on interview performance
```

### 4. Job Tracker (Kanban Board)

**User Story:** "I want to track where I am in the job application pipeline"

```
1. User navigates to JobTracker.jsx
2. Sees 4-column board:
   [Applied] [Interview] [Offer] [Rejected]
   
3. Clicks "Add Job"
4. Fills form:
   - Company name
   - Job title
   - Applied date
   - Application link
   
5. Clicks "Save"

FRONTEND:
6. Calls POST /api/jobs/applications
7. Creates JobApplication record
8. Card appears in "Applied" column

9. User drags card to "Interview" column
10. Calls POST /api/jobs/move with status change
11. Updates JobApplication.status = "INTERVIEW"

12. User clicks "Add Note"
13. Adds interview feedback
14. POST updates JobApplication.notes

DASHBOARD STATS:
15. Fetches from GET /api/jobs/stats
16. Calculates:
    - Total applied: 12
    - In interviews: 3
    - Offers received: 1
    - Reply rate: 25%

RESULT: User has clear visibility on job pipeline
```

### 5. Career Roadmap Generation

**User Story:** "I want a personalized 12-month career plan"

```
1. User navigates to CareerRoadmap.jsx
2. Fills assessment:
   - Current role
   - Target role
   - Skills gaps
   - Time commitment
   
3. Clicks "Generate Roadmap"

BACKEND:
4. POST /api/career/generate
5. Claude AI generates roadmap:
   - Month 1: Build project portfolio
   - Month 2: Learn advanced JS/React
   - Month 3: Practice system design
   - Month 4: Network & apply
   - ... (12 months)

6. Each milestone includes:
   - Description
   - Skills to develop
   - Resources (YouTube, courses, projects)
   - Success metrics

FRONTEND:
7. Displays timeline visualization
8. User can:
   - Mark milestones as complete
   - Add custom milestones
   - Set reminders
   - Track progress

RESULT: User has structured growth path
```

---

## 🚀 Setup & Deployment

### Local Development Setup

#### Prerequisites
```bash
# Required
- Node.js 18+
- npm or yarn
- PostgreSQL 12+
- Git

# Optional (for AI features)
- Claude API key (Anthropic)
- Google Gemini API key
```

#### Frontend Setup
```bash
cd frontend
npm install
npm run dev
# Opens http://localhost:5173
```

#### Backend Setup
```bash
cd backend
npm install

# Create .env file with:
DATABASE_URL=postgresql://user:pass@localhost:5432/jobtube
JWT_SECRET=your-secret-key
CLAUDE_API_KEY=your-claude-key
GEMINI_API_KEY=your-gemini-key
PORT=5000
FRONTEND_URL=http://localhost:5173

# Start server
npm run dev
# Listening on http://localhost:5000
```

### Production Deployment

#### Frontend (Vercel)
```bash
# Vercel auto-deploys from GitHub
# Set environment variables in Vercel dashboard:
VITE_API_URL=https://api.jobtube.com

# Build command: npm run build
# Output directory: dist
```

#### Backend (Railway/Render)
```bash
# Set environment variables:
DATABASE_URL=postgresql://...
JWT_SECRET=...
CLAUDE_API_KEY=...

# Deploy from GitHub repository
# Auto-detect Node.js
# Start command: npm run start
```

#### Database Migration
```bash
# Run on production database:
npx sequelize-cli db:migrate
npx sequelize-cli db:seed:all
```

---

## 🔐 Configuration & Environment

### Environment Variables (.env)

**Frontend (.env.local)**
```
VITE_API_URL=http://localhost:5000
VITE_APP_NAME=JobTube Eco System
```

**Backend (.env)**
```
# Database
DATABASE_URL=postgresql://user:pass@localhost/jobtube
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your-password
DB_NAME=jobtube

# Server
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173

# Authentication
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRATION=7d

# AI Services
CLAUDE_API_KEY=your-anthropic-key
GEMINI_API_KEY=your-google-key

# Email (if implemented)
EMAIL_SERVICE=sendgrid
SENDGRID_API_KEY=...

# File Storage
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=5242880  # 5MB

# Logging
LOG_LEVEL=debug
```

---

## 🧪 Testing & Quality Assurance

### Backend Testing
```bash
npm run test              # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage report (target: 80%)
```

### Frontend Linting
```bash
npm run lint             # ESLint check
npm run lint:fix         # Auto-fix issues
```

### API Testing
```bash
# Manual testing with cURL
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"pass"}'

# Or use Postman/Insomnia for testing
```

---

## 🎨 Key Technologies Explained

### Why React 18 + Vite?
- **React 18**: Latest hooks, concurrent rendering, automatic batching
- **Vite**: 10x faster builds than Webpack, instant HMR (hot reload)
- **Tailwind CSS**: Utility-first styling = faster UI development

### Why Express.js?
- Lightweight and flexible
- Large ecosystem (middleware, plugins)
- Easy REST API development
- Perfect for MVP → scaling

### Why PostgreSQL?
- ACID compliance (data integrity)
- JSONB support (flexible schemas)
- Advanced querying (window functions, CTEs)
- Great for structured user/resume data

### Why Claude AI?
- Advanced reasoning for nuanced resume analysis
- Better context understanding for interview feedback
- Superior code/career recommendations
- Faster processing than Gemini for most tasks

### Why Zustand?
- Minimal boilerplate (vs Redux)
- No Provider hell (vs Context API)
- Supports persistence (localStorage)
- Great DevTools integration

---

## 🔮 Future Enhancements

### Planned Features (Phase 2)
1. **Video Interview Practice** — Webcam + speech recognition
2. **LinkedIn Auto-Connection** — Browser extension for networking
3. **GitHub Auto-Portfolio** — Scrape projects, auto-generate portfolio
4. **AI Job Matching** — ML model to match candidate to jobs
5. **Resume Content Library** — Pre-written bullet points by role
6. **Subscription/Payments** — Stripe integration for premium features
7. **Email Notifications** — Follow-up reminders, new jobs in feed
8. **Batch Processing** — Optimize multiple resumes at once
9. **Role-Specific Benchmarks** — Compare to other candidates
10. **Skill Development Tracking** — Gamified skill acquisition

### Infrastructure Improvements
- [ ] Caching layer (Redis) for frequently accessed data
- [ ] Message queue (Bull) for async jobs
- [ ] Webhook system for real-time notifications
- [ ] Analytics dashboard (Mixpanel/Amplitude)
- [ ] A/B testing framework for UX optimization
- [ ] CDN for faster asset delivery
- [ ] API rate limiting & quotas

---

## 📞 Support & Contact

**GitHub:** [JobTube-EcoSystem](https://github.com/your-username/jobtube)  
**Email:** support@jobtube.com  
**Documentation:** https://docs.jobtube.com  

---

**Document Version:** 2.0  
**Last Updated:** June 13, 2026  
**Maintained By:** Development Team
