# Resume Analyzer & Optimizer Workflow

## Overview
Comprehensive AI-powered tool that analyzes resume content, structure, and ATS compatibility, then provides optimization suggestions.

## Workflow Steps

### 1. **Resume Upload**
- User uploads PDF/DOCX resume
- Frontend: `ResumeOptimizer.jsx` handles file upload
- Files processed through `resumeDatabase.js` service

### 2. **Resume Parsing**
- Extract text and metadata from uploaded file
- Route: `/resume` (POST)
- Service: `resumeDatabase.js` - parses resume structure
- Output: Structured resume data with sections

### 3. **AI Analysis Phase**
**LLM Integration (Qwen 3.5-9b via LM Studio)**
- Analyzes resume content using **Qwen/qwen3.5-9b** model
- Checks for:
  - Content clarity and professionalism
  - Keyword density and relevance
  - Impact statement quality
  - Formatting consistency
  - Section completeness

### 4. **ATS Scoring**
- Service: `atsScoring.js`
- AI evaluates ATS compatibility
- Checks:
  - Keywords recognition by ATS systems
  - Format compatibility
  - Sections visibility
  - Spacing and formatting issues
- Generates ATS score (0-100)

### 5. **Missing Information Detection**
- Service: `missingInfoEngine.js`
- AI identifies gaps:
  - Missing contact information
  - Incomplete work history
  - Weak action verbs
  - Missing impact metrics
  - Weak skill descriptions

### 6. **Keyword Intelligence**
- Service: `keywordIntelligence.js`
- AI recommends keywords based on:
  - Job market trends
  - Industry standards
  - ATS expectations
  - User's target roles

### 7. **Optimization Suggestions**
- Service: `resumeOptimizer.js`
- AI generates specific improvements:
  - Rewritten bullet points
  - Better action verbs
  - Quantified achievements
  - Section reordering suggestions
  - Keyword placement recommendations

### 8. **Structure Analysis**
- Service: `resumeStructure.js`
- Validates:
  - Proper section ordering
  - Consistency in formatting
  - Length optimization
  - Visual hierarchy

### 9. **Export Options**
- Service: `resumeExport.js`
- Generate optimized resume in:
  - PDF (formatted)
  - DOCX (editable)
  - Plain text (ATS-friendly)

### 10. **Results Display**
- Frontend displays:
  - Overall score (0-100)
  - ATS compatibility score
  - Detailed analysis sections
  - Improvement suggestions
  - Before/after comparison

## AI Usage Details

### Model: Qwen/qwen3.5-9b
**Why Qwen:**
- Fast processing for real-time feedback
- Good at understanding resume content
- Excellent at generating professional text
- Cost-effective for multiple analyses

**Prompts Used:**
1. Content analysis prompt
2. ATS compatibility prompt
3. Keyword extraction prompt
4. Optimization suggestion prompt
5. Missing info detection prompt

**Processing:**
- Streaming responses for real-time UI updates
- Loading state maintained during processing (3-5 sessions typically)
- Multiple AI calls: 3-5 per full analysis

## Response Structure

```json
{
  "status": "success",
  "data": {
    "overallScore": 85,
    "atsScore": 78,
    "sections": {
      "contact": { score: 95, issues: [] },
      "summary": { score: 65, issues: [...] },
      "experience": { score: 82, issues: [...] },
      "skills": { score: 72, issues: [...] },
      "education": { score: 90, issues: [] }
    },
    "suggestions": [...],
    "missingInfo": [...],
    "keywords": [...],
    "exportUrls": {
      "pdf": "...",
      "docx": "...",
      "txt": "..."
    }
  }
}
```

## User Flow
1. Login → Dashboard → Resume Optimizer
2. Upload resume file
3. Wait for AI analysis (3-5 LLM sessions)
4. Review analysis results with scores
5. View improvement suggestions
6. Download optimized versions
7. Apply suggestions and re-upload for improvement tracking

## Files Involved

**Backend:**
- Routes: `backend/src/routes/resume.js`
- Services:
  - `resumeDatabase.js` - parsing & storage
  - `atsScoring.js` - ATS analysis
  - `missingInfoEngine.js` - gap detection
  - `keywordIntelligence.js` - keyword recommendations
  - `resumeOptimizer.js` - optimization logic
  - `resumeStructure.js` - structure validation
  - `resumeExport.js` - export generation

**Frontend:**
- `pages/ResumeOptimizer.jsx` - main page
- `store/useAuthStore.js` - auth management
- Components for analysis display

## Performance Notes
- Average analysis time: 45-90 seconds
- LLM calls: 4-5 per analysis
- Storage: Database + file system
- Cache: Analysis results cached for 7 days
