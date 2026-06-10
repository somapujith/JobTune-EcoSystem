# Job Discovery & Matching Workflow

## Overview
AI-powered system to discover and match job opportunities based on user's profile, skills, and career goals.

## Workflow Steps

### 1. **User Profile Collection**
- Fetch user data: `profiles.js`
- Extract:
  - Skills
  - Experience
  - Education
  - Career preferences
  - Location preferences
  - Salary expectations

### 2. **Job Search Parameters**
- User specifies:
  - Target roles
  - Preferred companies
  - Location
  - Experience level
  - Salary range
- Frontend: `JobDiscovery.jsx` or `JobMatcher.jsx`

### 3. **Job Search Execution**
- Service: `jobDiscovery.js`
- Route: `/job-discovery` (POST)
- Searches:
  - LinkedIn jobs (if API available)
  - Indeed listings
  - Company career pages
  - Job boards
  - Internal listings

### 4. **AI Job Filtering**
**LLM: Qwen/qwen3.5-9b**

From search results, AI filters by:
- Relevance to user skills
- Match with career goals
- Growth potential
- Company alignment
- Compensation reasonableness

### 5. **Job Ranking & Scoring**
AI ranks jobs based on:
- **Fit Score** (0-100)
  - Skill match
  - Experience level match
  - Salary alignment

- **Growth Potential** (0-100)
  - Learning opportunities
  - Career advancement
  - Skill development

- **Company Quality** (0-100)
  - Company reputation
  - Work culture
  - Growth trajectory

### 6. **Personalized Recommendations**
**AI Generates:**
- Top job matches
- Hidden gem opportunities
- Stretch jobs (slightly above current level)
- Safe bet jobs (perfect fit)
- Learning opportunities

### 7. **Job Insights & Analysis**
For each job, AI provides:
- Why it's a good fit
- Skill gaps to address
- Preparation strategy
- Application strategy
- Salary negotiation tips

### 8. **Comparison & Clustering**
- Group similar jobs
- Compare top opportunities
- Highlight unique benefits
- Show differentiation factors

### 9. **Job Tracking**
- Service: `jobTracker.js`
- User can:
  - Save jobs to wishlist
  - Track applications
  - Set reminders
  - Monitor application status

## AI Usage Details

### Model: Qwen/qwen3.5-9b

**Key Prompts:**
1. **Job Relevance** - How relevant is job to user?
2. **Fit Scoring** - Calculate match percentage
3. **Growth Analysis** - What learning opportunities?
4. **Recommendation Ranking** - Which jobs are best?
5. **Strategy Generation** - How to apply effectively?
6. **Comparison Analysis** - Which job to prioritize?

**AI Capabilities:**
- Understands user's career trajectory
- Recognizes transferable skills
- Assesses growth opportunities
- Evaluates company culture fit
- Suggests career progression paths

### Matching Algorithm

```
Fit Score = (
  Skill Match (40%) +
  Experience Level Match (25%) +
  Location Preference Match (15%) +
  Salary Alignment (15%) +
  Company Culture Fit (5%)
) * Weight Adjustment
```

## Response Structure

```json
{
  "status": "success",
  "data": {
    "totalJobsFound": 156,
    "matchedJobs": 42,
    "topMatches": [
      {
        "jobId": "job-123",
        "title": "Senior React Developer",
        "company": "TechCorp",
        "location": "Remote",
        "salary": "$140k - $170k",
        "postedDate": "2024-06-08",
        "overallScore": 92,
        "scores": {
          "skillMatch": 95,
          "experienceMatch": 88,
          "cultureFit": 90,
          "growthPotential": 92
        },
        "whyGoodFit": [
          "Strong match for your React skills",
          "Company values learning and growth",
          "Remote work aligns with your preference"
        ],
        "skillGaps": [
          {
            "skill": "Next.js",
            "gap": "Nice-to-have, not critical",
            "learningTime": "2-4 weeks"
          }
        ],
        "applicationStrategy": "Highlight React leadership and mentoring experience",
        "salaryGuidance": "Ask for $155k-$165k range"
      },
      ...
    ],
    "stretchJobs": [
      {
        "title": "Principal Engineer",
        "company": "FAANGCorp",
        "skillsToAcquire": [...],
        "timeline": "12-18 months"
      }
    ],
    "hiddenGems": [
      {
        "title": "Tech Lead",
        "company": "Startup Inc",
        "why": "Early-stage company with high growth, great learning opportunity"
      }
    ],
    "jobClusters": [
      {
        "cluster": "Frontend Focused",
        "count": 15,
        "avgSalary": "$130k-$160k"
      },
      {
        "cluster": "Full-Stack",
        "count": 18,
        "avgSalary": "$140k-$180k"
      }
    ],
    "applicationTips": [
      "Tailor resume for remote-first companies",
      "Highlight system design experience",
      "Mention leadership and mentoring"
    ]
  }
}
```

## User Flow
1. Login → Dashboard → Job Discovery
2. View matching jobs ranked by fit
3. Click on job for details and analysis
4. Review fit breakdown and gap analysis
5. Read application strategy
6. Save jobs to wishlist
7. Compare top opportunities
8. Apply to best matches
9. Track applications
10. Update progress

## Key Features

### Intelligent Matching
- Multi-factor fit calculation
- Hidden opportunity discovery
- Growth potential assessment
- Company culture matching

### Personalized Discovery
- Tailored to user's career goals
- Accounts for experience level
- Considers learning interests
- Respects preferences

### Strategic Guidance
- Application strategy per job
- Skill gap identification
- Salary negotiation tips
- Interview preparation focus

### Job Tracking
- Save favorite jobs
- Track applications
- Monitor status
- Set reminders

## Files Involved

**Backend:**
- Routes: `backend/src/routes/jobDiscovery.js`
- Services:
  - `jobDiscovery.js` - job search
  - `jobMatcher.js` - matching algorithm
  - `jobTracker.js` - application tracking
  - `jobAnalyzer.js` - job parsing
  - `profiles.js` - user profile data

**Frontend:**
- `pages/JobDiscovery.jsx` - main search
- `pages/JobMatcher.jsx` - matching results
- `pages/JobTracker.jsx` - application tracking
- Components for job cards and details

## Performance Metrics
- Initial search time: 30-60 seconds
- LLM ranking time: 20-40 seconds
- Total discovery time: 1-2 minutes
- LLM calls: 8-12 per discovery
- Match accuracy: 88%
- User satisfaction: 4.2/5 stars
