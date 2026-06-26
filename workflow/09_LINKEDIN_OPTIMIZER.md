# LinkedIn Profile Optimizer Workflow

## Goal
Build a real-data LinkedIn optimization pipeline that helps a user turn their profile into a recruiter-ready asset. The pipeline must use only data the user provides or data that can be fetched from publicly available profile pages. It must not invent jobs, employers, metrics, recommendations, endorsements, or credentials.

## Current Implementation
- Frontend: `frontend/src/pages/LinkedInOptimizer.jsx`
- API route: `POST /api/profiles/linkedin/analyze`
- Pipeline service: `backend/src/services/linkedinOptimizerService.js`
- Local LLM adapter: `backend/src/utils/aiClient.js`
- Model env override: `LM_STUDIO_MODEL_LINKEDIN`
- Access level: authenticated users with Tune & Polish plan or higher

## Data Policy
LinkedIn blocks or limits many unauthenticated profile requests. This workflow therefore has three real-data modes:

1. User-entered structured fields
   - Headline
   - About
   - Skills
   - Target roles and industries
   - Experience entries
   - Profile completeness signals

2. User-pasted LinkedIn profile text
   - Copy/paste from the user's own profile
   - LinkedIn export text when available
   - No scraping assumptions

3. Best-effort public URL fetch
   - URL must match `https://www.linkedin.com/in/...`
   - Fetches public HTML only
   - Extracts title, meta description, and visible page text when LinkedIn allows it
   - If LinkedIn blocks access, the response records the failure reason and continues with user-provided data

## Pipeline Stages

### 1. Input Normalization
Accepts:

```json
{
  "profileUrl": "https://www.linkedin.com/in/example",
  "headline": "Frontend Engineer | React | TypeScript",
  "about": "Profile about text...",
  "skills": "React, TypeScript, Node.js",
  "targetRoles": "Frontend Engineer, Full Stack Engineer",
  "targetIndustries": "SaaS, FinTech",
  "experiences": [
    {
      "title": "Frontend Developer",
      "company": "Acme",
      "description": "Built dashboards used by 2,000 users."
    }
  ],
  "experienceCount": 3,
  "yearsOfExperience": 2,
  "connections": "100to500",
  "hasPhoto": true,
  "hasFeatured": true,
  "openToWork": true,
  "activityLevel": "monthly"
}
```

Normalization converts comma/newline strings into arrays, trims text fields, and keeps a clear distinction between user-provided and fetched data.

### 2. Public Data Fetch
`fetchLinkedInPublicData(profileUrl)` attempts a real HTTP fetch of the public LinkedIn page.

Returned source metadata:

```json
{
  "fetched": true,
  "source": "public_linkedin_page",
  "title": "...",
  "description": "...",
  "pageText": "..."
}
```

If blocked:

```json
{
  "fetched": false,
  "status": 999,
  "reason": "LinkedIn returned HTTP 999."
}
```

No fallback mock profile is inserted. The pipeline uses only real available input.

### 3. Signal Extraction
The service derives:
- Detected technical and role keywords
- Quantified claims
- Action verb count
- Total available word count
- Experience proof density

These signals feed scoring and the LLM prompt.

### 4. Deterministic Scoring
The profile receives five section scores:

| Section | Weight | What It Measures |
| --- | ---: | --- |
| Headline Impact | 22% | Role clarity, keywords, positioning, structure |
| About Section Depth | 24% | Length, story, proof, measurable outcomes, CTA |
| Experience Proof | 20% | Entry count, years, action verbs, quantified results |
| Skills Search Fit | 19% | Skill count, target-role alignment, recruiter keywords |
| Profile Completeness | 15% | Photo, Featured, network, activity, Open to Work |

The deterministic layer always returns a useful report, even if the local LLM is offline.

### 5. Keyword Intelligence
The keyword stage compares:
- Current explicit skills
- Keywords detected in headline/about/experience
- Target role and industry terms

Output:

```json
{
  "current": ["react", "typescript", "api"],
  "missingHighValue": ["aws", "docker"],
  "opportunities": [
    "Put the top 3 role keywords in the headline.",
    "Use the same keywords naturally in About and Experience.",
    "Keep skills ordered by target-role relevance."
  ]
}
```

### 6. Local LLM Optimization
The optimizer calls LM Studio through `callAI`.

Prompt rules:
- Use only the supplied real profile data
- Do not invent employers, degrees, awards, metrics, or endorsements
- Return structured JSON only
- Focus on recruiter search visibility, truthful rewrites, and practical next actions

Expected LLM output:

```json
{
  "headlineOptions": ["..."],
  "aboutRewrite": "...",
  "experienceImprovements": [
    {
      "current": "...",
      "improved": "...",
      "reason": "..."
    }
  ],
  "quickWins": [
    {
      "action": "Rewrite headline with role + stack + outcome.",
      "effort": "5 minutes",
      "impact": "high"
    }
  ],
  "recruiterSummary": "...",
  "activityRecommendations": ["..."],
  "skillRecommendations": ["..."]
}
```

If the model is unreachable or returns invalid JSON, the service uses deterministic fallback suggestions and marks `aiPowered: false`.

### 7. API Response Shape
`POST /api/profiles/linkedin/analyze` returns:

```json
{
  "success": true,
  "score": 72,
  "scoreLabel": "Strong",
  "scoreDescription": "Your LinkedIn profile scores 72/100 based on real supplied profile data.",
  "dataSources": {
    "userProvided": {
      "headline": true,
      "about": true,
      "skills": 12,
      "pastedText": false,
      "experiences": 2
    },
    "publicFetch": {
      "fetched": false,
      "reason": "LinkedIn returned HTTP 999."
    }
  },
  "metrics": [
    { "label": "Headline Impact", "val": 80, "status": "good" }
  ],
  "audit": {
    "headline": {
      "score": 80,
      "current": "Frontend Engineer | React | TypeScript",
      "issues": []
    }
  },
  "keywords": {
    "current": ["react", "typescript"],
    "missingHighValue": ["docker"],
    "opportunities": []
  },
  "optimizations": {
    "aiPowered": true,
    "headlineOptions": [],
    "aboutRewrite": "",
    "quickWins": []
  },
  "suggestions": [],
  "aiPowered": true,
  "generatedAt": "2026-06-18T00:00:00.000Z"
}
```

Legacy frontend fields remain supported:
- `score`
- `scoreLabel`
- `scoreDescription`
- `metrics`
- `suggestions`

## Frontend Workflow
1. User opens LinkedIn Optimizer.
2. User provides a LinkedIn URL and/or real profile text and fields.
3. Frontend posts to `/api/profiles/linkedin/analyze`.
4. UI shows:
   - Overall score
   - Section metrics
   - Real data source status
   - AI headline options
   - Rewritten About section
   - Quick wins
   - Keyword gaps
   - Detailed suggestions

## Implementation Checklist
- [x] Move LinkedIn pipeline into `backend/src/services/linkedinOptimizerService.js`
- [x] Add real-data public URL fetch with blocked-state reporting
- [x] Add deterministic scoring and keyword intelligence
- [x] Link pipeline to local LM Studio via `callAI`
- [x] Keep rule-based fallback for LLM outage or malformed output
- [x] Replace old `/profiles/linkedin/analyze` route logic
- [x] Expand frontend fields for URL, target roles, activity, and experience entries
- [x] Add history persistence for LinkedIn analyses
- [ ] Add export/copy actions for optimized headline and About section
- [ ] Add integration with Recruiter Visibility Checker

## Guardrails
- Never fabricate LinkedIn data.
- Never claim private LinkedIn fields were fetched when only public data was available.
- Store source metadata with every analysis.
- Keep local LLM usage optional and recoverable.
- Prefer precise suggestions over generic motivational advice.
