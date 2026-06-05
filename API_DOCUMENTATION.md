# JobTube API Documentation

**Base URL:** `http://localhost:3000` (development)

**Authentication:** All protected endpoints require JWT token in header:
```
Authorization: Bearer <token>
```

**Response Format:**
```json
{
  "success": true,
  "data": { /* endpoint-specific */ },
  "error": null
}
```

---

## Authentication Endpoints

### 1. Register
**Endpoint:** `POST /auth/register`  
**Auth:** ❌ Public

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securepassword123",
  "fullName": "John Doe"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "123",
      "email": "user@example.com",
      "fullName": "John Doe"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Errors:**
- `400` — Missing fields or invalid email
- `409` — Email already registered

---

### 2. Login
**Endpoint:** `POST /auth/login`  
**Auth:** ❌ Public

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "123",
      "email": "user@example.com",
      "fullName": "John Doe"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Errors:**
- `400` — Missing email or password
- `401` — Invalid credentials

---

### 3. Get Current User
**Endpoint:** `GET /auth/me`  
**Auth:** ✅ Required

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "123",
    "email": "user@example.com",
    "fullName": "John Doe",
    "createdAt": "2026-04-20T10:00:00Z"
  }
}
```

**Errors:**
- `401` — Invalid or missing token

---

## Resume Endpoints

### 4. Get User's Resume
**Endpoint:** `GET /resume`  
**Auth:** ✅ Required

**Query Parameters:**
- `version` (optional) — Get specific version ID. Default: latest

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "resume_123",
    "userId": "123",
    "content": {
      "personalInfo": {
        "fullName": "John Doe",
        "email": "john@example.com",
        "phone": "+1234567890",
        "location": "San Francisco, CA",
        "summary": "Full Stack Engineer with 3 years experience"
      },
      "workExperience": [
        {
          "company": "TechCo",
          "title": "Senior Engineer",
          "startDate": "2023-01-01",
          "endDate": null,
          "description": "Led team of 5 engineers..."
        }
      ],
      "education": [
        {
          "school": "MIT",
          "degree": "BS Computer Science",
          "graduationDate": "2021-05-01"
        }
      ],
      "skills": ["React", "Node.js", "PostgreSQL"],
      "certifications": [],
      "projects": []
    },
    "createdAt": "2026-04-20T10:00:00Z",
    "updatedAt": "2026-04-21T11:00:00Z"
  }
}
```

**Errors:**
- `401` — Not authenticated
- `404` — No resume found

---

### 5. Create Resume
**Endpoint:** `POST /resume`  
**Auth:** ✅ Required

**Request:**
```json
{
  "personalInfo": { /* same as above */ },
  "workExperience": [ /* array */ ],
  "education": [ /* array */ ],
  "skills": [ /* array */ ],
  "certifications": [ /* array */ ],
  "projects": [ /* array */ ]
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "resume_123",
    "userId": "123",
    "content": { /* submitted content */ },
    "createdAt": "2026-04-21T11:00:00Z",
    "updatedAt": "2026-04-21T11:00:00Z"
  }
}
```

**Errors:**
- `400` — Invalid content
- `401` — Not authenticated

---

### 6. Update Resume
**Endpoint:** `PUT /resume/:id`  
**Auth:** ✅ Required

**Request:** Same as Create Resume

**Response (200):** Updated resume object

**Errors:**
- `401` — Not authenticated
- `403` — Not owner of resume
- `404` — Resume not found

---

### 7. Delete Resume
**Endpoint:** `DELETE /resume/:id`  
**Auth:** ✅ Required

**Response (200):**
```json
{
  "success": true,
  "data": { "message": "Resume deleted successfully" }
}
```

**Errors:**
- `401` — Not authenticated
- `403` — Not owner
- `404` — Resume not found

---

### 8. Optimize Resume (AI)
**Endpoint:** `POST /resume/optimize`  
**Auth:** ✅ Required

**Request:**
```json
{
  "resumeId": "resume_123"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "score": 78,
    "scoreRange": { "min": 0, "max": 100 },
    "keyword_match": 82,
    "formatting_score": 75,
    "length_score": 70,
    "missingKeywords": [
      "Kubernetes",
      "Docker",
      "CI/CD",
      "Agile",
      "AWS"
    ],
    "suggestions": [
      {
        "priority": 1,
        "title": "Add missing technical keywords",
        "description": "Include Kubernetes, Docker, CI/CD in your experience descriptions",
        "impact": "ATS score +15"
      },
      {
        "priority": 2,
        "title": "Quantify achievements",
        "description": "Replace 'Led team' with 'Led team of 5, delivering 20% performance improvement'",
        "impact": "ATS score +10"
      },
      {
        "priority": 3,
        "title": "Remove passive language",
        "description": "Use action verbs like 'Architected', 'Implemented', 'Spearheaded'",
        "impact": "ATS score +8"
      }
    ]
  }
}
```

**Errors:**
- `401` — Not authenticated
- `404` — Resume not found
- `429` — Rate limit exceeded

---

### 9. Get Resume History
**Endpoint:** `GET /resume/history`  
**Auth:** ✅ Required

**Query Parameters:**
- `limit` (optional) — Max records. Default: 10
- `offset` (optional) — Pagination offset. Default: 0

**Response (200):**
```json
{
  "success": true,
  "data": {
    "versions": [
      {
        "id": "resume_123",
        "createdAt": "2026-04-21T11:00:00Z",
        "score": 78,
        "tag": "ATS Optimized"
      },
      {
        "id": "resume_122",
        "createdAt": "2026-04-20T10:00:00Z",
        "score": 65,
        "tag": null
      }
    ],
    "total": 5
  }
}
```

---

## Interview Endpoints

### 10. Start Mock Interview
**Endpoint:** `POST /interview/start`  
**Auth:** ✅ Required

**Request:**
```json
{
  "role": "Software Engineer",
  "industry": "Tech",
  "level": "mid",
  "duration": 30
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "sessionId": "interview_123",
    "question": "Tell me about a challenging project you led and how you overcame obstacles.",
    "questionNumber": 1,
    "totalQuestions": 10
  }
}
```

---

### 11. Submit Interview Answer
**Endpoint:** `POST /interview/submit`  
**Auth:** ✅ Required

**Request:**
```json
{
  "sessionId": "interview_123",
  "answer": "At TechCo, I led a team of 5 engineers to rebuild our payment processing system..."
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "feedback": {
      "starScore": 8,
      "contentScore": 8,
      "clarityScore": 7,
      "overallScore": 7.7,
      "tips": [
        "Great use of STAR method—you clearly stated the Situation, Task, Action, Result.",
        "Consider quantifying the business impact: 'reduced processing time by 40%' instead of 'improved efficiency'.",
        "Excellent! Short pause before answering helps organize your thoughts."
      ],
      "followUp": "What was the most difficult technical decision you made during this project, and how did you approach it?"
    },
    "nextQuestion": "What was the most difficult technical decision you made during this project, and how did you approach it?",
    "questionNumber": 2,
    "totalQuestions": 10,
    "sessionId": "interview_123"
  }
}
```

**Errors:**
- `400` — Missing answer or session ID
- `404` — Session not found
- `429` — Rate limit exceeded

---

### 12. Get Interview History
**Endpoint:** `GET /interview/history`  
**Auth:** ✅ Required

**Response (200):**
```json
{
  "success": true,
  "data": {
    "sessions": [
      {
        "id": "interview_123",
        "role": "Software Engineer",
        "date": "2026-04-21T11:00:00Z",
        "duration": 28,
        "overallScore": 7.8,
        "questionsAnswered": 8
      }
    ],
    "total": 12
  }
}
```

---

### 13. Get Interview Transcript
**Endpoint:** `GET /interview/:sessionId`  
**Auth:** ✅ Required

**Response (200):**
```json
{
  "success": true,
  "data": {
    "sessionId": "interview_123",
    "role": "Software Engineer",
    "date": "2026-04-21T11:00:00Z",
    "duration": 28,
    "exchanges": [
      {
        "questionNumber": 1,
        "question": "Tell me about a challenging project...",
        "userAnswer": "At TechCo, I led a team...",
        "feedback": { /* feedback object */ },
        "score": 7.7
      }
    ],
    "overallScore": 7.8
  }
}
```

---

## LinkedIn Endpoints

### 14. Optimize LinkedIn Profile
**Endpoint:** `POST /linkedin/optimize`  
**Auth:** ✅ Required

**Request:**
```json
{
  "linkedInUrl": "https://linkedin.com/in/johndoe"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "score": 72,
    "scoreRange": { "min": 0, "max": 100 },
    "currentProfile": {
      "headline": "Engineer at TechCo",
      "aboutSection": "Experienced engineer working in tech...",
      "skills": ["Python", "AWS"]
    },
    "improvements": [
      {
        "section": "headline",
        "priority": 1,
        "current": "Engineer at TechCo",
        "suggested": "Full Stack Engineer | Python | AWS | Cloud Architecture | TechCo",
        "characterCount": 67,
        "maxCharacters": 120,
        "impactScore": 45,
        "reason": "Include 4-5 keywords to improve recruiter match"
      },
      {
        "section": "about",
        "priority": 2,
        "current": "Experienced engineer working in tech...",
        "suggested": "Experienced Full Stack Engineer with 5+ years building scalable systems using Python, AWS, and Kubernetes. Passionate about mentoring junior engineers and leading cross-functional teams. Open to Senior Engineering roles in FinTech or EdTech.",
        "characterCount": 45,
        "maxCharacters": 2600,
        "impactScore": 35,
        "reason": "Expand About section with specific skills, achievements, and job interests"
      },
      {
        "section": "skills",
        "priority": 3,
        "current": ["Python", "AWS"],
        "suggested": ["Python", "AWS", "Kubernetes", "Docker", "CI/CD", "System Design", "Mentoring"],
        "impactScore": 20,
        "reason": "Add 5 more skills aligned with current market demand"
      }
    ],
    "nextSteps": [
      {
        "order": 1,
        "action": "Update headline with keywords",
        "estimatedTime": 5,
        "impact": "High"
      },
      {
        "order": 2,
        "action": "Expand About section",
        "estimatedTime": 15,
        "impact": "High"
      },
      {
        "order": 3,
        "action": "Add recommended skills",
        "estimatedTime": 5,
        "impact": "Medium"
      }
    ]
  }
}
```

**Errors:**
- `400` — Invalid LinkedIn URL
- `429` — Rate limit exceeded

---

## GitHub Endpoints

### 15. Optimize GitHub Profile
**Endpoint:** `POST /github/optimize`  
**Auth:** ✅ Required

**Request:**
```json
{
  "githubUsername": "johndoe"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "score": 58,
    "scoreRange": { "min": 0, "max": 100 },
    "currentProfile": {
      "username": "johndoe",
      "bio": "Software engineer",
      "publicRepos": 12,
      "pinnedRepos": 0,
      "followers": 45
    },
    "suggestions": [
      {
        "type": "profile_readme",
        "priority": 1,
        "title": "Add a GitHub Profile README",
        "description": "Create a README.md in your [johndoe] repository with introduction, tech stack, and portfolio links",
        "impactScore": 30,
        "howTo": "1. Create new repo named 'johndoe'\n2. Add README.md\n3. Include bio, tech skills, projects, contact"
      },
      {
        "type": "pin_projects",
        "priority": 2,
        "title": "Pin your best 6 projects",
        "description": "Pin your most impressive repositories to be visible on profile",
        "current": 0,
        "target": 6,
        "impactScore": 25
      },
      {
        "type": "readme_quality",
        "priority": 3,
        "title": "Improve project READMEs",
        "issues": [
          { "repo": "project-x", "issue": "No description" },
          { "repo": "project-y", "issue": "Missing setup instructions" },
          { "repo": "project-z", "issue": "No usage examples" }
        ],
        "impactScore": 20
      },
      {
        "type": "contribution_streak",
        "priority": 4,
        "title": "Maintain contribution streak",
        "description": "Aim for consistent commits. Recruiters value active developers.",
        "current": 12,
        "impactScore": 15
      }
    ],
    "nextSteps": [
      {
        "order": 1,
        "action": "Create Profile README",
        "estimatedTime": 20,
        "impact": "High"
      },
      {
        "order": 2,
        "action": "Pin top 6 projects",
        "estimatedTime": 5,
        "impact": "High"
      },
      {
        "order": 3,
        "action": "Update 3 READMEs",
        "estimatedTime": 30,
        "impact": "Medium"
      }
    ]
  }
}
```

**Errors:**
- `400` — Invalid GitHub username
- `404` — GitHub user not found
- `429` — Rate limit exceeded

---

## Onboarding Endpoints

### 16. Complete Onboarding Quiz
**Endpoint:** `POST /onboarding/complete`  
**Auth:** ✅ Required

**Request:**
```json
{
  "resume_status": "yes",
  "linkedin_status": "needs_work",
  "interview_prep": "some_prep",
  "github_status": "exists"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "userId": "123",
    "answers": {
      "resume_status": "yes",
      "linkedin_status": "needs_work",
      "interview_prep": "some_prep",
      "github_status": "exists"
    },
    "recommendations": [
      {
        "priority": 1,
        "path": "/resume",
        "label": "Optimize Resume",
        "reason": "Your resume can benefit from AI-powered optimization for ATS matching"
      },
      {
        "priority": 2,
        "path": "/linkedin",
        "label": "LinkedIn Optimizer",
        "reason": "Your LinkedIn profile needs optimization to attract recruiters"
      },
      {
        "priority": 3,
        "path": "/interview",
        "label": "Mock Interview",
        "reason": "Practice interviewing with AI feedback"
      }
    ],
    "completedAt": "2026-04-21T11:00:00Z"
  }
}
```

**Errors:**
- `400` — Missing required fields
- `401` — Not authenticated

---

## Job Tracker Endpoints (Planned)

### 17. Get All Job Applications
**Endpoint:** `GET /jobs`  
**Auth:** ✅ Required

**Query Parameters:**
- `status` (optional) — Filter: applied, interview, offer, rejected
- `limit` — Default: 20
- `offset` — Default: 0

**Response (200):**
```json
{
  "success": true,
  "data": {
    "applications": [
      {
        "id": "job_123",
        "company": "Google",
        "role": "Senior Engineer",
        "status": "interview",
        "appliedDate": "2026-04-15",
        "lastUpdated": "2026-04-20",
        "daysInPipeline": 5,
        "notes": "Phone screen scheduled for April 25"
      }
    ],
    "total": 15,
    "stats": {
      "totalApplied": 15,
      "inInterview": 3,
      "offers": 1,
      "rejected": 2,
      "replyRate": 0.27
    }
  }
}
```

---

### 18. Create Job Application
**Endpoint:** `POST /jobs`  
**Auth:** ✅ Required

**Request:**
```json
{
  "company": "Google",
  "role": "Senior Engineer",
  "appliedDate": "2026-04-15",
  "status": "applied",
  "jobUrl": "https://careers.google.com/...",
  "salary": "180000-200000",
  "notes": "Strong opportunity, great team"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "job_123",
    "company": "Google",
    "role": "Senior Engineer",
    "status": "applied",
    "appliedDate": "2026-04-15",
    "daysInPipeline": 0,
    "createdAt": "2026-04-21T11:00:00Z"
  }
}
```

---

### 19. Update Job Application
**Endpoint:** `PUT /jobs/:id`  
**Auth:** ✅ Required

**Request:** Same as Create (any field can be updated)

**Response (200):** Updated application object

---

### 20. Delete Job Application
**Endpoint:** `DELETE /jobs/:id`  
**Auth:** ✅ Required

**Response (200):**
```json
{
  "success": true,
  "data": { "message": "Job application deleted" }
}
```

---

## Error Handling

All endpoints return errors in standard format:

```json
{
  "success": false,
  "data": null,
  "error": "Error message describing what went wrong"
}
```

### HTTP Status Codes
- `200` — Success
- `201` — Created
- `400` — Bad request (validation error)
- `401` — Unauthorized (missing/invalid token)
- `403` — Forbidden (not owner)
- `404` — Not found
- `409` — Conflict (duplicate email, etc.)
- `429` — Rate limit exceeded
- `500` — Server error

---

## Rate Limiting

Currently not implemented. Planned:
- `/resume/optimize` — 5 requests per hour per user
- `/interview/submit` — 10 requests per hour per user
- `/linkedin/optimize` — 3 requests per hour per user
- `/github/optimize` — 3 requests per hour per user

---

## Testing Endpoints

### Mock Mode
When `MOCK_AI=true` in `.env`, all Gemini API calls return mock data.

**Example Mock Resume Score:**
```json
{
  "score": 75,
  "missingKeywords": ["Kubernetes", "Docker"],
  "suggestions": [
    {
      "priority": 1,
      "title": "Add cloud technologies",
      "description": "Include Kubernetes and Docker in your experience"
    }
  ]
}
```

---

## Pagination

For list endpoints:

**Request:**
```
GET /resume/history?limit=10&offset=20
```

**Response includes:**
```json
{
  "data": {
    "items": [ /* array */ ],
    "total": 50,
    "limit": 10,
    "offset": 20,
    "hasMore": true
  }
}
```

---

## Authentication Examples

### cURL
```bash
# Register
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securepassword",
    "fullName": "John Doe"
  }'

# Login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securepassword"
  }'

# Protected request
curl -X GET http://localhost:3000/resume \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### JavaScript (Fetch)
```javascript
// Register
const response = await fetch('http://localhost:3000/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'securepassword',
    fullName: 'John Doe'
  })
});
const data = await response.json();
const token = data.data.token;

// Protected request
const result = await fetch('http://localhost:3000/resume', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

---

**Last Updated:** 2026-04-21  
**API Version:** 1.0.0
