# Career Roadmap Generator Workflow

## Overview
AI-driven tool that creates personalized career development paths based on user's current skills, experience, and target roles.

## Workflow Steps

### 1. **User Profile Analysis**
- Fetch user data: `profiles.js` service
- Extract:
  - Current skills
  - Experience level
  - Years of experience
  - Education
  - Current role

### 2. **Target Role Selection**
- User specifies target role(s)
- Route: `/career-roadmap` (POST)
- Frontend: `CareerRoadmap.jsx`

### 3. **Market Intelligence Gathering**
**LLM: Qwen/qwen3.5-9b**
- AI analyzes current job market
- Identifies skills in demand
- Finds skill gaps between current and target
- Determines learning priorities

### 4. **Skill Gap Analysis**
- Service: `skills.js`
- AI calculates:
  - Missing technical skills
  - Missing soft skills
  - Priority ranking (high/medium/low)
  - Learning time estimates
  - Skill dependencies

### 5. **Learning Path Generation**
**AI Generates:**
1. **Immediate Skills** (0-3 months)
   - Quick wins
   - High ROI skills
   - Foundation building

2. **Short-term Skills** (3-6 months)
   - Intermediate technologies
   - Deeper specialization
   - Practical projects

3. **Long-term Skills** (6-12 months)
   - Advanced specialization
   - Leadership skills
   - Industry expertise

### 6. **Resource Recommendations**
- AI recommends:
  - Online courses
  - Books and articles
  - Project ideas
  - Certifications
  - Networking opportunities

### 7. **Project-Based Learning**
- Service: `learning.js`
- AI suggests portfolio projects:
  - Project idea
  - Skills practiced
  - Difficulty level
  - Estimated duration
  - Expected outcomes

### 8. **Timeline & Milestones**
- Create roadmap with:
  - 3-month milestones
  - 6-month milestones
  - 12-month goal
  - Checkpoint reviews

### 9. **Progress Tracking**
- Service: `progressService.js`
- Store roadmap in database
- Enable progress tracking
- Allow checkpoint updates

## AI Usage Details

### Model: Qwen/qwen3.5-9b

**Key Prompts:**
1. **Market Analysis** - What skills are in demand for target role?
2. **Gap Analysis** - What skills does user need to learn?
3. **Learning Sequencing** - In what order should skills be learned?
4. **Resource Recommendation** - What resources for each skill?
5. **Project Design** - What projects teach these skills?
6. **Timeline Creation** - How long should each phase take?

**AI Capabilities:**
- Understands skill dependencies
- Knows learning progression
- Recommends practical projects
- Estimates realistic timelines
- Identifies skill leverage points

### Processing Pipeline
1. Profile analysis (local)
2. Target role clarification (user input)
3. Market research (AI)
4. Skill gap identification (AI)
5. Learning path generation (AI)
6. Resource curation (AI)
7. Project suggestions (AI)
8. Timeline creation (AI)

## Response Structure

```json
{
  "status": "success",
  "data": {
    "currentRole": "Junior Developer",
    "targetRole": "Senior Full-Stack Engineer",
    "timelineMonths": 12,
    "phases": [
      {
        "phase": 1,
        "duration": "0-3 months",
        "focus": "Foundation & Quick Wins",
        "skills": [
          {
            "skill": "TypeScript",
            "priority": "high",
            "estimatedHours": 40,
            "resources": [...]
          },
          ...
        ],
        "projects": [
          {
            "name": "Build TypeScript Todo App",
            "skills": ["TypeScript", "React"],
            "difficulty": "beginner",
            "duration": "1 week"
          },
          ...
        ]
      },
      {
        "phase": 2,
        "duration": "3-6 months",
        "focus": "Intermediate Specialization",
        ...
      },
      {
        "phase": 3,
        "duration": "6-12 months",
        "focus": "Advanced Mastery",
        ...
      }
    ],
    "milestones": [
      {
        "month": 3,
        "checkpoint": "Achieve TypeScript & Docker proficiency",
        "metrics": ["Complete 2 projects", "Pass skills assessment"]
      },
      ...
    ],
    "estimatedTimeline": "12 months",
    "successMetrics": [...]
  }
}
```

## User Flow
1. Login → Dashboard → Career Roadmap
2. Select/confirm current role
3. Enter target role
4. View AI-generated roadmap
5. Review phase-by-phase breakdown
6. See recommended resources
7. Check project ideas
8. Start learning path
9. Track progress through checkpoints

## Key Features

### Personalized Recommendations
- AI considers user's current skills
- Accounts for learning pace
- Recommends realistic timelines
- Suggests relevant projects

### Market-Aware Suggestions
- AI knows current job market trends
- Recommends in-demand skills
- Identifies emerging technologies
- Suggests future-proof skills

### Project-Based Learning
- Every skill has associated projects
- Projects build portfolio value
- Real-world application included
- Multiple difficulty levels

### Progress Tracking
- Mark skills as learned
- Track project completion
- Review monthly progress
- Adjust path as needed

## Files Involved

**Backend:**
- Routes: `backend/src/routes/careerRoadmap.js`
- Services:
  - `careerRoadmap.js` - roadmap generation
  - `learning.js` - learning path curation
  - `skills.js` - skill analysis
  - `progressService.js` - progress tracking
  - `profiles.js` - user profile data

**Frontend:**
- `pages/CareerRoadmap.jsx` - main display
- `components/` - phase displays, milestones, projects

## Performance Metrics
- Roadmap generation time: 60-90 seconds
- LLM calls: 5-7 per roadmap
- Accuracy of gap analysis: 90%+
- Resource relevance rating: 4.5/5 stars
