# Tier 1 AI Features Implementation Plan

## Overview
Add 3 high-impact AI tools:
1. **Job Description Analyzer** — Extract skills from job posts
2. **Cover Letter Generator** — Auto-generate personalized letters
3. **ATS Score Checker** — Resume-job match score

---

## Architecture

```
JobTube/Dashboard
├─ Job Search Tools (new section)
│  ├─ Job Analyzer (new page)
│  ├─ Cover Letter Generator (new page)
│  └─ ATS Score Checker (new page)
└─ Navbar: Add "Job Tools" group
```

---

## Feature 1: Job Description Analyzer

### Backend
**New file:** `backend/src/routes/jobAnalyzer.js`

```
POST /api/jobs/analyze-description
  body: { jobDescription: string, userResume?: string }
  → returns:
  {
    requiredSkills: [],
    niceToHaveSkills: [],
    experienceLevel: string,
    seniority: 'Junior|Mid|Senior',
    keywords: string[],
    responsibilities: string[],
    salaryRange?: string,
    matchScore?: number,  // if resume provided
    skillGaps: string[],
    matchingSkills: string[]
  }
```

**LLM Prompt:**
```
Extract job requirements from this posting:
{jobDescription}

Return ONLY valid JSON:
{
  "requiredSkills": ["Skill1", "Skill2"],
  "niceToHaveSkills": ["Skill3"],
  "experienceLevel": "3-5 years",
  "seniority": "Mid",
  "keywords": ["Agile", "REST APIs"],
  "responsibilities": ["Build APIs", "Lead sprints"],
  "salaryRange": "$80k-$120k"
}
```

### Frontend
**New page:** `frontend/src/pages/JobAnalyzer.jsx`

```
┌─ Form Section ─────────────────┬─ Analysis Results ─────────┐
│ Job Description (textarea)      │ Required Skills (badges)    │
│ Upload Resume (optional)        │ Nice-to-Have Skills         │
│ [Analyze Button]                │ Experience Level            │
│                                 │ Seniority: [badge]          │
│                                 │ Keywords                    │
│                                 │ Your Match Score: 78%       │
│                                 │ Skill Gaps: [list]          │
│                                 │ Your Strengths: [list]      │
└─────────────────────────────────┴─────────────────────────────┘
```

---

## Feature 2: Cover Letter Generator

### Backend
**New file:** `backend/src/routes/coverLetter.js`

```
POST /api/jobs/generate-cover-letter
  body: {
    jobDescription: string,
    companyName: string,
    position: string,
    yourName: string,
    experience: string,
    tone: 'formal|friendly|confident'
  }
  → returns:
  {
    letterText: string,
    generatedAt: timestamp
  }
```

**LLM Prompt:**
```
Write a professional cover letter for:
- Company: {companyName}
- Position: {position}
- My background: {experience}
- Job requirements: {jobDescription}
- Tone: {tone}

Make it personalized, concise (3-4 paragraphs), and address the hiring manager.
```

### Frontend
**New page:** `frontend/src/pages/CoverLetterGenerator.jsx`

```
┌─ Form Section ─────────────────┬─ Generated Letter ──────────┐
│ Company Name                    │ [Copy] [Download] Buttons   │
│ Position Title                  │                             │
│ Job Description (textarea)      │ Generated Cover Letter:     │
│ Your Experience (textarea)      │ "Dear Hiring Manager,       │
│ Your Full Name                  │ I am excited to apply for   │
│ Tone: [Dropdown]                │ the {position} role at      │
│ [Generate Button]               │ {company}...                │
│                                 │                             │
│                                 │ [Download as .docx/.pdf]    │
└─────────────────────────────────┴─────────────────────────────┘
```

---

## Feature 3: ATS Score Checker

### Backend
**New file:** `backend/src/routes/atsChecker.js`

```
POST /api/jobs/check-ats-score
  body: {
    resume: string,          // resume text
    jobDescription: string
  }
  → returns:
  {
    atsScore: 0-100,
    scoreLabel: 'Poor|Fair|Good|Excellent',
    matchedKeywords: string[],
    missingKeywords: string[],
    recommendations: string[],
    hardSkillMatch: number,
    softSkillMatch: number,
    experienceMatch: number
  }
```

**Logic:**
1. Extract keywords from job description
2. Count matches in resume (case-insensitive)
3. Calculate scores: (matched / required) * 100
4. Identify missing critical keywords
5. Suggest improvements

**No LLM needed** — pure text matching + scoring algorithm

### Frontend
**New page:** `frontend/src/pages/ATSChecker.jsx`

```
┌─ Form Section ─────────────────┬─ ATS Score Results ─────────┐
│ Resume (textarea)               │ Overall ATS Score: 78/100   │
│ Job Description (textarea)      │ [Good] [Green Indicator]    │
│ [Check Score Button]            │                             │
│                                 │ Hard Skills Match: 85%      │
│                                 │ Soft Skills Match: 72%      │
│                                 │ Experience Match: 75%       │
│                                 │                             │
│                                 │ ✅ Matched Keywords (15):   │
│                                 │ React, Node.js, REST APIs   │
│                                 │                             │
│                                 │ ❌ Missing Keywords (8):    │
│                                 │ Kubernetes, Docker, AWS     │
│                                 │                             │
│                                 │ 💡 Recommendations:         │
│                                 │ - Add Kubernetes section    │
│                                 │ - Highlight AWS projects    │
└─────────────────────────────────┴─────────────────────────────┘
```

---

## Implementation Order

1. **ATS Score Checker** (1 hr) — No LLM, pure text matching
2. **Job Description Analyzer** (1.5 hrs) — LLM extraction
3. **Cover Letter Generator** (1 hr) — LLM generation

**Total: ~3.5 hours**

---

## Files to Create

### Backend
```
backend/src/routes/
├── jobAnalyzer.js (new)
├── coverLetter.js (new)
└── atsChecker.js (new)
```

### Frontend
```
frontend/src/pages/
├── JobAnalyzer.jsx (new)
├── CoverLetterGenerator.jsx (new)
└── ATSChecker.jsx (new)

frontend/src/
├── App.jsx (update: add 3 routes)
└── components/Layout.jsx (update: add "Job Tools" nav group)
```

---

## Nav Structure (Updated)

```
Layout.jsx NAV_GROUPS:

{
  label: 'Job Tools',
  items: [
    { label: 'Job Analyzer', path: '/job-analyzer', desc: 'Extract skills from postings' },
    { label: 'Cover Letter', path: '/cover-letter', desc: 'AI-generated letters' },
    { label: 'ATS Checker', path: '/ats-checker', desc: 'Resume-job match score' },
  ]
}
```

---

## LLM Requirements

| Tool | Model | Reason |
|------|-------|--------|
| Job Analyzer | Qwen2.5 7B | Good at JSON extraction |
| Cover Letter | Mistral 7B | Strong at text generation |
| ATS Checker | None | Pure algorithm, no LLM |

---

## Success Criteria

- [ ] Job Analyzer extracts skills, experience level, keywords
- [ ] ATS Score displays 0-100 with matching/missing keywords
- [ ] Cover Letter generates personalized 3-4 paragraph letters
- [ ] All tools have copy/download buttons
- [ ] All tools responsive on mobile
- [ ] Integrated into navbar "Job Tools" group
- [ ] No external APIs (100% local LLM)

---

## Next Steps

1. ✅ Review this plan
2. 🔨 Implement all 3 features
3. 🧪 Test end-to-end
4. ✅ Commit & push
5. 🎉 Done

**Approval needed before starting implementation.**
