# JobTube Eco System — Tech Stack Visual Reference

---

## 🎯 Quick Technology Overview

### What Language Does Each Part Use?

```
┌──────────────────────────────────────────────────────────────────┐
│                      FULL STACK BREAKDOWN                         │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  FRONTEND                │  BACKEND            │  DATABASE       │
│  ──────────────────────  │  ──────────────────  │  ──────────    │
│  JavaScript (JSX/ES6)    │  JavaScript (Node)  │  SQL/PostgreSQL │
│  React 18               │  Express.js         │                 │
│  Vite (bundler)         │  Multer (files)     │  Sequelize ORM  │
│  Tailwind CSS           │  JWT (auth)         │  Migrations     │
│  Zustand (state)        │  Winston (logging)  │                 │
│  React Router (routing) │  Joi (validation)   │                 │
│  Axios (HTTP)           │  Bcrypt (password)  │                 │
│  Zod (schemas)          │  API (Express)      │                 │
│  Recharts (charts)      │  Services (v2)      │                 │
│                         │  @anthropic-ai (AI) │                 │
│                         │  pdf-parse (PDF)    │                 │
│                         │  mammoth (DOCX)     │                 │
│                                                                   │
│  Port: 5173             │  Port: 5000/3000    │  Port: 5432     │
│  npm run dev            │  npm run dev        │  Local/Cloud    │
│  Vite Dev Server        │  Node.js            │  Railway/Render │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 📊 Technology Matrix

### Core Technologies by Purpose

| Purpose | Frontend | Backend | Infrastructure |
|---------|----------|---------|-----------------|
| **Core Framework** | React 18 | Express.js | Node.js 18+ |
| **Build/Runtime** | Vite | npm/Node | Docker (optional) |
| **Styling** | Tailwind CSS | N/A | N/A |
| **State Management** | Zustand | Sessions | Redis (future) |
| **Database** | N/A | PostgreSQL | Cloud DB |
| **Authentication** | JWT (localStorage) | JWT (verification) | Bcrypt |
| **API Communication** | Axios | Express Routes | REST HTTP |
| **Form Validation** | Zod + React Hook Form | Joi | Both |
| **File Handling** | FormData API | Multer + pdf-parse | S3 (future) |
| **AI Integration** | Prompts | Claude API | @anthropic-ai/sdk |
| **Logging** | Console | Winston | Cloud Logging |
| **Error Handling** | Error Boundary | Error Middleware | Sentry (future) |
| **Charts/Viz** | Recharts | N/A | N/A |
| **Icons** | Lucide React | N/A | N/A |

---

## 🔗 Package Dependency Map

### Frontend Dependencies Tree

```
react@18.2.0
├── react-dom@18.2.0
├── react-router-dom@6.22.1  (Routing)
├── react-hook-form@7.50.1   (Form State)
├── axios@1.6.7              (HTTP Requests)
│
├── State Management
│   └── zustand@4.5.1
│
├── Styling
│   ├── tailwindcss@3.4.1
│   ├── @tailwindcss/forms@0.5.11
│   └── postcss@8.4.35
│
├── Form Validation
│   ├── zod@3.22.4
│   └── @hookform/resolvers@3.3.4
│
├── UI Components
│   ├── lucide-react@0.344.0  (Icons)
│   └── recharts@2.12.1       (Charts)
│
├── Build Tools
│   └── @vitejs/plugin-react@4.2.1
│
└── Dev Tools
    ├── eslint
    └── @types/react
```

### Backend Dependencies Tree

```
express@5.2.1
├── cors@2.8.6               (CORS Middleware)
├── dotenv@17.4.2            (Env Variables)
└── express-middleware-suite
    ├── jsonwebtoken@9.0.3   (JWT Auth)
    ├── bcrypt@6.0.0         (Password Hash)
    └── multer@2.1.1         (File Upload)

Database
├── pg@8.11.0                (PostgreSQL Driver)
├── sequelize@latest         (ORM)
└── sequelize-cli            (Migrations)

Request Processing
├── axios@1.17.0             (HTTP Calls)
├── joi@18.1.2               (Validation)
└── @anthropic-ai/sdk@0.103.0 (Claude API)

File Processing
├── pdf-parse@1.1.4          (PDF Extraction)
├── mammoth@1.12.0           (DOCX Parsing)
├── jszip@3.10.1             (ZIP Handling)
├── pdfkit@0.16.0            (PDF Generation)
├── docx@9.7.1               (DOCX Generation)
└── xml2js@0.6.2             (XML Parsing)

Utilities
├── winston@3.19.0           (Logging)
├── p-limit@5.0.0            (Concurrency)
└── unzipper@0.12.3          (ZIP Extraction)

Testing
├── jest@29.7.0
└── supertest@6.3.3
```

---

## 🔄 Data Flow by Technology

### User Authentication Flow

```
User Input (React)
    ↓
Axios POST /api/auth/login
    ↓
Express Route Handler
    ↓
Bcrypt Hash Comparison
    ↓
JWT Token Generation (jsonwebtoken)
    ↓
Response to Frontend
    ↓
Zustand Store (useAuthStore)
    ↓
localStorage (persist JWT)
    ↓
Axios Interceptor (auto-attach token to requests)
    ↓
Backend Auth Middleware (JWT verify)
```

### Resume Upload & Analysis Flow

```
User Selects File (Frontend React)
    ↓
FormData + Axios POST /api/resume/upload
    ↓
Multer Middleware (parse file)
    ↓
File Validation & Storage
    ↓
PDF-Parse or Mammoth (extract text)
    ↓
Services/v2/ Analysis Engines:
    ├── atsScorer.js (Keyword matching)
    ├── resumeAnalysisEngine.js (Multi-metric)
    ├── skillClassifier.js (Skill extraction)
    └── jobDescriptionParser.js (JD analysis)
    ↓
Claude AI API Call (@anthropic-ai/sdk)
    ↓
Sequelize ORM (save to PostgreSQL)
    ↓
Response JSON to Frontend
    ↓
Zustand useResumeStore (update state)
    ↓
React Component Re-render (display results)
```

### Interview Mock Session Flow

```
User Selects Industry/Role (React)
    ↓
Axios POST /api/interview/start
    ↓
Express Route Handler
    ↓
Claude AI: Generate 5 interview questions
    ↓
Sequelize: Create InterviewSession record
    ↓
Response: Questions array to Frontend
    ↓
React Display: Question 1
    ↓
User Types Answer
    ↓
Axios POST /api/interview/submit-answer
    ↓
Claude AI: Analyze answer (STAR method, clarity, depth)
    ↓
Joi Validate Response Format
    ↓
Sequelize: Save Q&A to session
    ↓
Response: Feedback + Next Question
    ↓
React Loop: Display next question
    ↓
Session End → Winston Logger (save transcript)
```

---

## 🎨 Component Architecture

### Frontend Component Hierarchy

```
App.jsx (Root)
├── Routes (React Router)
│   ├── Layout (Header/Footer)
│   │   ├── Navbar
│   │   │   ├── Logo
│   │   │   ├── NavLinks
│   │   │   └── UserMenu
│   │   └── Footer
│   │
│   ├── Pages/
│   │   ├── Login.jsx
│   │   ├── Onboarding.jsx
│   │   ├── Dashboard.jsx
│   │   ├── ResumeBuilder.jsx
│   │   ├── ResumeOptimizer.jsx
│   │   ├── ATSCheckerV2.jsx
│   │   ├── MockInterview.jsx
│   │   ├── JobTracker.jsx
│   │   └── ... (more pages)
│   │
│   └── ProtectedRoute (Auth Guard)
│       └── (Wrapped pages)
│
└── ErrorBoundary (Error Handler)

Global State (Zustand Stores)
├── useAuthStore
├── useResumeStore
├── useJobStore
└── useUIStore
```

### Backend Route Structure

```
app.js (Express App)
├── Middleware
│   ├── CORS
│   ├── JSON Parser
│   ├── Auth Middleware
│   ├── Error Handler
│   └── Audit Logger
│
├── Routes (API Endpoints)
│   ├── /api/auth (auth.js)
│   ├── /api/resume (resume.js + resumeV2.js)
│   ├── /api/ats (atsCheckerV2.js)
│   ├── /api/interview (interview.js)
│   ├── /api/jobs (jobTracker.js)
│   ├── /api/career (careerRoadmap.js)
│   ├── /api/dashboard (dashboard.js)
│   └── ... (more routes)
│
└── server.js (Listen on Port 5000)
```

---

## 📦 Database Schema (PostgreSQL + Sequelize)

### User-Related Tables

```sql
-- Users Table
CREATE TABLE "Users" (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,  -- bcrypt hashed
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Resumes Table
CREATE TABLE "Resumes" (
  id UUID PRIMARY KEY,
  user_id UUID FOREIGN KEY,
  title VARCHAR(255),
  content TEXT,                          -- Full resume text
  extracted_text TEXT,                   -- From PDF/DOCX
  ats_score DECIMAL(5,2),               -- 0-100
  analysis_result JSONB,                -- Detailed analysis
  file_path VARCHAR(255),                -- PDF/DOCX file location
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Job Applications Table
CREATE TABLE "JobApplications" (
  id UUID PRIMARY KEY,
  user_id UUID FOREIGN KEY,
  company_name VARCHAR(255),
  job_title VARCHAR(255),
  status ENUM('APPLIED', 'INTERVIEW', 'OFFER', 'REJECTED'),
  application_link VARCHAR(500),
  notes TEXT,                            -- User notes
  applied_date DATE,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Interview Sessions Table
CREATE TABLE "InterviewSessions" (
  id UUID PRIMARY KEY,
  user_id UUID FOREIGN KEY,
  industry VARCHAR(100),
  role VARCHAR(100),
  transcript JSONB,                      -- Q&A pairs
  average_score DECIMAL(5,2),           -- 0-100
  completed_at TIMESTAMP,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Onboarding Responses Table
CREATE TABLE "OnboardingResponses" (
  id UUID PRIMARY KEY,
  user_id UUID FOREIGN KEY,
  quiz_responses JSONB,                  -- 4 question answers
  generated_recommendations JSONB,       -- AI-generated action plan
  completed_at TIMESTAMP,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

---

## 🚀 Environment & Deployment Matrix

### Development Environment

```
Frontend:
  - Vite Dev Server (Port 5173)
  - Fast refresh (HMR)
  - Source maps enabled
  - Console logs visible
  - Mock data available

Backend:
  - Express (Port 5000)
  - Nodemon (auto-restart)
  - SQLite or Local PostgreSQL
  - Winston logs to console
  - MOCK_AI=true (no API calls)

Database:
  - Local PostgreSQL or SQLite
  - Seed data available
  - No migrations needed (auto-create)
```

### Production Environment

```
Frontend:
  - Vercel/Netlify CDN
  - Port 443 (HTTPS)
  - Optimized bundle (gzipped)
  - Environment: production
  - Analytics enabled
  - No console logs

Backend:
  - Railway/Render
  - Port 5000 (behind proxy)
  - PostgreSQL managed database
  - Winston logs to file/cloud
  - Environment: production
  - Rate limiting enabled
  - Error tracking (Sentry)

Database:
  - PostgreSQL managed (Railway/RDS)
  - Automated backups
  - Migrations auto-run
  - Connection pooling
```

---

## 🔐 Security Technologies

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Authentication** | JWT (jsonwebtoken) | Stateless user auth |
| **Password** | Bcrypt (6 rounds) | Secure hash storage |
| **Transport** | HTTPS/TLS | Encrypted network |
| **CORS** | Express CORS | Cross-origin security |
| **Validation** | Joi + Zod | Input validation |
| **Rate Limiting** | Express Rate Limit | DDoS protection (future) |
| **Secrets** | dotenv | Env variable security |
| **Logging** | Winston | Audit trail |
| **Headers** | Helmet.js | Security headers (future) |

---

## 📈 Scaling Technologies (Future)

| Need | Current | Future |
|------|---------|--------|
| **Database Caching** | None | Redis + Node Cache |
| **Async Jobs** | Synchronous | Bull + Redis Queue |
| **File Storage** | Local uploads | AWS S3 + CloudFront CDN |
| **Notifications** | None | WebSocket + Push |
| **Analytics** | Winston logs | Mixpanel/Amplitude |
| **Error Tracking** | Console.error | Sentry |
| **Performance** | Basic | New Relic/DataDog |
| **Search** | PostgreSQL LIKE | Elasticsearch |
| **Caching** | None | Redis + Memcached |
| **Message Queue** | None | RabbitMQ/Kafka |

---

## 🛠 Development Tools

### Frontend Dev Tools
```bash
# Build & Run
npm run dev          # Vite dev server
npm run build        # Production build
npm run preview      # Preview build
npm run lint         # ESLint check

# Debugging
React DevTools (Browser Extension)
Redux DevTools (Zustand support)
Network tab (Axios requests)
Console (error logging)

# Testing (future)
Jest + React Testing Library
Vitest (faster alternative)
```

### Backend Dev Tools
```bash
# Server Management
npm run dev          # Nodemon (auto-restart)
npm start            # Production start
npm run test         # Jest test suite
npm run test:coverage

# Database
npx sequelize-cli   # Migrations
npx sequelize db:migrate
npx sequelize db:seed

# API Testing
Postman / Insomnia  # REST client
cURL                # CLI requests
Thunder Client      # VSCode extension
```

---

## 📱 Full Tech Stack Summary

| Category | Technology | Role |
|----------|-----------|------|
| **Language** | JavaScript (ES6+) | Frontend & Backend |
| **Frontend Framework** | React 18 | UI Layer |
| **Frontend Bundler** | Vite | Fast builds |
| **Styling** | Tailwind CSS | Design system |
| **State Mgmt** | Zustand | Global state |
| **Form Management** | React Hook Form + Zod | Forms |
| **Routing** | React Router v6 | Client routing |
| **HTTP Client** | Axios | API calls |
| **Backend Runtime** | Node.js 18+ | Server runtime |
| **Backend Framework** | Express.js | REST API |
| **Database** | PostgreSQL | Data storage |
| **ORM** | Sequelize | DB queries |
| **Authentication** | JWT + Bcrypt | User auth |
| **AI Integration** | Claude API (@anthropic-ai/sdk) | AI features |
| **File Upload** | Multer | File handling |
| **PDF Processing** | pdf-parse | PDF extraction |
| **DOCX Processing** | mammoth | DOCX parsing |
| **Data Validation** | Joi + Zod | Input validation |
| **Logging** | Winston | Request logging |
| **Development** | VSCode + Nodemon | Dev environment |
| **Version Control** | Git/GitHub | Code management |
| **Deployment** | Vercel (FE), Railway (BE) | Hosting |

---

## 🎯 Quick Start Ports Reference

```
Frontend:     http://localhost:5173 (Vite)
Backend:      http://localhost:5000 (Express)
Database:     localhost:5432 (PostgreSQL)

Production:
Frontend:     https://jobtube.vercel.app
Backend:      https://api.jobtube.com (or Railway URL)
Database:     Managed (no direct access)
```

---

**Created:** June 13, 2026  
**Purpose:** Quick reference for all technologies used in JobTube Eco System  
**Audience:** Developers, DevOps, Product Managers
