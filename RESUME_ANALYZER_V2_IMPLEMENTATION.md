# Resume Analyzer & Optimizer V2 - Implementation Guide

## Overview

Resume Analyzer V2 is a production-grade resume analysis and optimization system with:

- **Rule-Based Analysis (90%)** - Instant scoring in <100ms
- **Embeddings Intelligence (5%)** - Role detection
- **AI Optimization (5%)** - Quality improvements via Qwen 3.5 9B LLM

## Architecture

### 10-Stage Pipeline

```
Stage 1: Resume Upload
    ↓
Stage 2: Text Extraction & Parsing  
    ↓
Stage 3-6: Rule-Based Analysis (Instant)
    │
    ├─→ Section Analysis (30 pts)
    ├─→ Metrics Analysis (15 pts)
    ├─→ Action Verb Analysis (15 pts)
    ├─→ Formatting Analysis (15 pts)
    ├─→ Keyword Analysis (25 pts)
    ├─→ Missing Information Detection
    └─→ Overall Score (0-100)
    ↓
Stage 7: AI Optimization (Optional, 8-15s)
    ↓
Stage 8: Re-Scoring
    ↓
Stage 9: Detailed Feedback (Optional)
    ↓
Stage 10: Export (PDF/DOCX/TXT)
```

## Service Files

### Core Analyzers

#### 1. **SectionAnalyzer** (`sectionAnalyzer.js`)
- Max Score: 30 points
- Checks for required sections: Summary, Experience, Education, Skills, Projects, Certifications
- 5 points per section
- Latency: <10ms

```javascript
const SectionAnalyzer = require('./v2/sectionAnalyzer');
const result = SectionAnalyzer.analyze(resumeText);
// Returns: { score, details, foundSections, missingSections, quality }
```

#### 2. **MetricsAnalyzer** (`metricsAnalyzer.js`)
- Max Score: 15 points
- Detects quantifiable achievements
- Patterns: percentages (%), currency ($), multipliers (2x), quantities
- Latency: <5ms

```javascript
const MetricsAnalyzer = require('./v2/metricsAnalyzer');
const result = MetricsAnalyzer.analyze(resumeText);
// Returns: { score, metrics, count, quality, recommendations }
```

#### 3. **ActionVerbAnalyzer** (`actionVerbAnalyzer.js`)
- Max Score: 15 points
- Detects strong action verbs (led, built, developed, optimized, etc.)
- Penalizes weak verbs (was, helped, worked)
- Latency: <5ms

```javascript
const ActionVerbAnalyzer = require('./v2/actionVerbAnalyzer');
const result = ActionVerbAnalyzer.analyze(resumeText);
// Returns: { score, strongVerbCount, weakVerbCount, strongVerbs, recommendations }
```

#### 4. **FormattingAnalyzer** (`formattingAnalyzer.js`)
- Max Score: 15 points
- ATS compatibility checking
- Checks for: special characters, date consistency, tables, spacing
- Latency: <10ms

```javascript
const FormattingAnalyzer = require('./v2/formattingAnalyzer');
const result = FormattingAnalyzer.analyze(resumeText);
// Returns: { score, issues, warnings, atsCompatible, recommendations }
```

#### 5. **KeywordAnalyzer** (`keywordAnalyzer.js`)
- Max Score: 25 points
- Role-specific keyword detection
- 8 supported roles with curated keyword lists
- Latency: <10ms

```javascript
const KeywordAnalyzer = require('./v2/keywordAnalyzer');
const result = KeywordAnalyzer.analyze(resumeText, detectedRole);
// Returns: { score, keywords, coverage, quality, recommendations }
```

### Support Services

#### 6. **RoleDetectionEngine** (`roleDetectionEngine.js`)
- Detects user's primary role from resume
- 8 supported roles: Frontend, Backend, Full-Stack, Data Science, DevOps, Product, Design, Mobile
- Latency: <10ms

```javascript
const RoleDetectionEngine = require('./v2/roleDetectionEngine');
const result = RoleDetectionEngine.detect(resumeText);
// Returns: { role, confidence, candidates }
```

#### 7. **MissingInfoEngine** (`missingInfoEngine.js`)
- Identifies resume gaps
- Fields: contact, location, summary, experience, skills, education, projects, certifications
- Latency: <10ms

```javascript
const MissingInfoEngine = require('./v2/missingInfoEngine');
const result = MissingInfoEngine.analyze(resumeText);
// Returns: { missing, critical, optional, completeness, recommendations }
```

### Main Orchestrators

#### 8. **ResumeAnalysisEngine** (`resumeAnalysisEngine.js`)
- Coordinates all rule-based analyzers
- Calculates overall score (weighted average)
- Generates comprehensive analysis report
- Latency: <100ms

```javascript
const ResumeAnalysisEngine = require('./v2/resumeAnalysisEngine');
const analysis = ResumeAnalysisEngine.analyze(resumeText);
// Returns: complete analysis with scores, strengths, weaknesses, recommendations
```

#### 9. **ResumeOptimizationEngine** (`resumeOptimizationEngine.js`)
- AI-powered resume improvement
- Uses Qwen 3.5 9B LLM
- Improves: ATS compatibility, keywords, action verbs, metrics
- Latency: 8-15 seconds
- Requires LM Studio running on port 1234

```javascript
const ResumeOptimizationEngine = require('./v2/resumeOptimizationEngine');
const result = await ResumeOptimizationEngine.optimize(originalResume, role, analysis);
// Returns: { optimizedResume, optimizationNotes }
```

#### 10. **ResumeCriticEngine** (`resumeCriticEngine.js`)
- Generates detailed feedback
- AI analysis of strengths/weaknesses
- Provides hiring manager perspective
- Latency: 8-15 seconds
- Fallback to rule-based feedback if LLM unavailable

```javascript
const ResumeCriticEngine = require('./v2/resumeCriticEngine');
const feedback = await ResumeCriticEngine.generateFeedback(resume, role, analysis);
// Returns: { strengths, weaknesses, observations, hiringPerspective, nextSteps }
```

#### 11. **ResumeExportEngine** (`resumeExportEngine.js`)
- Exports resume in multiple formats
- Formats: PDF, DOCX, TXT (ATS-safe)
- Latency: <2 seconds

```javascript
const ResumeExportEngine = require('./v2/resumeExportEngine');
const exported = await ResumeExportEngine.export(resumeText, 'pdf');
// Returns: { format, mimeType, content, filename }
```

## API Routes

All routes require authentication via JWT.

### 1. POST `/api/resume/v2/analyze`
**Upload and analyze resume (Stages 1-6)**

Request:
```bash
POST /api/resume/v2/analyze
Content-Type: multipart/form-data
Authorization: Bearer <token>

Body:
- resume: <file> (PDF, DOCX, or TXT)
```

Response:
```json
{
  "status": "success",
  "resumeId": "resume_123",
  "analysis": {
    "overallScore": 78,
    "detectedRole": {
      "role": "frontend-developer",
      "displayName": "Frontend Developer",
      "confidence": 94
    },
    "scores": {
      "section": 28,
      "metrics": 12,
      "actionVerbs": 11,
      "formatting": 14,
      "keywords": 20
    },
    "summary": {
      "foundSections": ["Experience", "Education", "Skills"],
      "missingSections": ["Summary"],
      "metricsCount": 7,
      "keywordsCovered": 18
    },
    "quality": {
      "overallQuality": "good",
      "readyForOptimization": true,
      "keyStrengths": ["Good action verbs", "Solid keyword coverage"],
      "keyWeaknesses": ["Missing summary", "Few metrics"]
    },
    "recommendations": [
      {
        "severity": "high",
        "message": "Add professional summary at top"
      }
    ],
    "processingTimeMs": 42
  }
}
```

### 2. POST `/api/resume/v2/optimize`
**AI-optimize resume (Stages 7-9)**

Request:
```json
{
  "resumeId": "resume_123",
  "resumeText": "..."
}
```

Response:
```json
{
  "status": "success",
  "optimization": {
    "originalScore": 78,
    "optimizedScore": 89,
    "improvement": 11,
    "processingTimeMs": 12450
  },
  "optimizedResume": "...",
  "optimizedAnalysis": {
    "scores": { ... },
    "summary": { ... }
  }
}
```

### 3. POST `/api/resume/v2/feedback`
**Get detailed AI feedback (Stage 9)**

Request:
```json
{
  "resumeText": "..."
}
```

Response:
```json
{
  "status": "success",
  "score": 78,
  "feedback": {
    "source": "ai",
    "strengths": [
      "Strong problem-solving skills",
      "Good technical background"
    ],
    "weaknesses": [
      "Missing quantified metrics",
      "Weak action verbs in some bullets"
    ],
    "observations": "...",
    "hiringPerspective": "...",
    "nextSteps": ["Add metrics", "Strengthen summary"]
  }
}
```

### 4. POST `/api/resume/v2/export`
**Export resume (Stage 10)**

Request:
```json
{
  "resumeText": "...",
  "format": "pdf"  // or "docx", "txt"
}
```

Response: File download (binary)

### 5. GET `/api/resume/v2/history`
**Get user's resume analysis history**

Query parameters:
- `limit` (default: 10) - Number of records to return

Response:
```json
{
  "status": "success",
  "history": [
    {
      "id": "resume_123",
      "original_score": 78,
      "optimized_score": 89,
      "role_detected": "frontend-developer",
      "created_at": "2024-06-10T..."
    }
  ]
}
```

### 6. GET `/api/resume/v2/:resumeId`
**Get specific resume analysis**

Response:
```json
{
  "status": "success",
  "resume": { ... }
}
```

## Scoring System

### Overall Score (0-100)
Weighted average of five components:

| Component | Max | Weight | Category |
|-----------|-----|--------|----------|
| Section | 30 | 25% | Structure |
| Metrics | 15 | 20% | Content |
| Action Verbs | 15 | 20% | Content |
| Formatting | 15 | 15% | Format |
| Keywords | 25 | 20% | Keywords |

### Score Interpretation
- **90-100**: Excellent - Ready to submit
- **75-89**: Good - Minor optimizations recommended  
- **60-74**: Fair - Significant improvements needed
- **40-59**: Poor - Major restructuring needed
- **0-39**: Critical - Needs major work

## Performance Targets

| Stage | Operation | Target | Actual |
|-------|-----------|--------|--------|
| 1-2 | Upload & Parse | <1s | <500ms |
| 3-6 | Analysis | <100ms | <50ms |
| 7 | AI Optimization | 8-15s | ~12s |
| 8 | Re-scoring | <100ms | <50ms |
| 9 | Feedback | 8-15s | ~10s |
| 10 | Export | <2s | <1s |

## Database Schema

### resumes table
```sql
CREATE TABLE resumes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  original_resume TEXT NOT NULL,
  optimized_resume TEXT,
  original_score INTEGER,
  optimized_score INTEGER,
  score_before INTEGER,
  score_after INTEGER,
  role_detected VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### analyses table
```sql
CREATE TABLE analyses (
  id SERIAL PRIMARY KEY,
  resume_id INTEGER NOT NULL,
  section_completeness INTEGER,
  keyword_relevance INTEGER,
  formatting_score INTEGER,
  action_verbs_count INTEGER,
  metrics_count INTEGER,
  missing_sections JSONB,
  recommendations JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(resume_id),
  FOREIGN KEY (resume_id) REFERENCES resumes(id)
);
```

## Environment Variables

Required for V2:
```bash
# LM Studio configuration
LM_STUDIO_URL=http://localhost:1234/v1
LM_STUDIO_MODEL=qwen-3.5-9b

# Database
DATABASE_URL=postgresql://user:pass@localhost/jobtube

# Server
PORT=5000
FRONTEND_URL=http://localhost:5173
```

## Setup Instructions

### 1. Install Dependencies

```bash
cd backend
npm install axios pdfkit pdf-parse mammoth
```

### 2. Ensure LM Studio is Running

```bash
# Download and run LM Studio
# https://lmstudio.ai/

# Make sure Qwen 3.5 9B is loaded and running on port 1234
# Test: curl http://localhost:1234/v1/models
```

### 3. Database Setup

```bash
# Run migrations
npm run migrate

# Verify schema
psql $DATABASE_URL -c "\dt"
```

### 4. Start Backend

```bash
npm start

# Backend should start on port 5000
# Test: curl http://localhost:5000/api/health
```

### 5. Frontend Integration

Frontend should call V2 endpoints:
```javascript
// Upload and analyze
const formData = new FormData();
formData.append('resume', fileInput.files[0]);
const response = await fetch('/api/resume/v2/analyze', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: formData
});

// Optimize
const optimized = await fetch('/api/resume/v2/optimize', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ resumeId, resumeText })
});
```

## Error Handling

All errors return standard format:
```json
{
  "status": "error",
  "message": "Human-readable error message",
  "details": "Optional technical details"
}
```

### Common Errors
- 400: Invalid input (empty file, wrong format)
- 401: Unauthorized (missing/invalid token)
- 500: Server error (LLM unavailable, DB error)

## Troubleshooting

### "LM Studio service unavailable"
- Ensure LM Studio is running on port 1234
- Check: `curl http://localhost:1234/v1/models`
- Ensure Qwen 3.5 9B model is loaded

### "Failed to parse resume file"
- File may be corrupted
- Try exporting to PDF and re-uploading
- Supported formats: PDF, DOCX, TXT

### Low analysis scores
- Add missing sections
- Include quantified metrics
- Use stronger action verbs
- Improve keyword coverage

## Future Enhancements

- [ ] Embeddings-based role detection
- [ ] Multi-language support
- [ ] Video resume analysis
- [ ] Real-time collaboration
- [ ] Custom scoring profiles
- [ ] Industry-specific templates
- [ ] Job-specific optimization
- [ ] ATS system simulation

## Performance Optimization Notes

1. **Caching**: Analysis results cached for 7 days
2. **Async Processing**: Optimization runs async, doesn't block upload
3. **Connection Pooling**: Database uses connection pooling
4. **Rate Limiting**: 10 analyses/minute per user to prevent abuse

## Security Considerations

- All inputs validated and sanitized
- Sensitive data encrypted at rest
- TLS/SSL for data in transit
- User can only access their own resumes
- LM Studio must be on trusted network

---

**Version**: 1.0  
**Last Updated**: June 2024
