# Job Tracking & Dashboard Workflow

## Overview
Central hub for users to track job applications, view analytics, and manage their job search journey.

## Dashboard Workflow

### 1. **Dashboard Access**
- Frontend: `Dashboard.jsx`
- Route: `/dashboard` (GET)
- Requires authentication
- Loads user's data

### 2. **User Profile Integration**
- Service: `profiles.js`
- Fetch:
  - User name and email
  - Current resume
  - Skills
  - Experience level
  - Onboarding status

### 3. **Subscription Status Display**
- Service: `subscriptions.js`
- Show:
  - Current plan
  - Features available
  - Usage limits remaining
  - Renewal date
  - Upgrade option (if applicable)

### 4. **Job Application Tracking**
- Service: `jobTracker.js`
- Display:
  - Total applications
  - Applications by status
  - Application timeline
  - Response rates
  - Interview scheduled

### 5. **Feature Usage Analytics**
- Service: `sessionService.js`
- Track:
  - Resume analyses used
  - ATS checks performed
  - Tools accessed
  - Active hours
  - Feature adoption

### 6. **Progress Indicators**
- Calculate and display:
  - Resume improvement score trend
  - Interview prep progress
  - Skills developed
  - Goals achieved
  - Milestones completed

### 7. **Recommendations Widget**
- Service: `recommendationEngine.js`
- AI generates:
  - Next recommended tool
  - Skills to focus on
  - Job opportunities
  - Learning suggestions

### 8. **Recent Activity Feed**
- Display recent actions:
  - Last resume analysis
  - Last job searches
  - Recent interviews
  - Skill updates
  - Applications submitted

## Job Tracker Workflow

### 1. **Application Logging**
- User logs new job application
- Frontend: `JobTracker.jsx`
- Input:
  - Job title
  - Company
  - Position URL
  - Application date
  - Contact person

### 2. **Status Management**
- Status options:
  - Applied
  - Phone Screen
  - Interview Round 1
  - Interview Round 2
  - Offer
  - Rejected
  - Withdrawn

- Service: `jobTracker.js`
- Update status as process progresses

### 3. **Notes & Documentation**
- Add notes per application:
  - Interview questions asked
  - Feedback received
  - Follow-up needed
  - Compensation details
  - Next steps

### 4. **Reminder System**
- Set reminders for:
  - Follow-up emails
  - Interview dates
  - Deadline to respond
  - Skill practice

### 5. **Analytics Generation**
AI generates insights:
- **Application Velocity**
  - How many applied per week
  - Response rate
  - Interview conversion rate

- **Company Analysis**
  - Top companies applied to
  - Success rate by company
  - Average time to response

- **Improvement Trends**
  - Resume improvement impact
  - Skills gained
  - Interview performance improvement

### 6. **Interview Scheduling**
- Service: `interview.js`
- Schedule interviews through app
- Set reminders
- Prepare with mock interviews
- Log actual interview

### 7. **Offer Comparison**
- Track multiple offers
- Compare:
  - Salary
  - Benefits
  - Location
  - Growth opportunity
  - Company culture fit

### 8. **Archive & Export**
- Export application data
- Archive completed applications
- Generate job search report
- Download as PDF/CSV

## Analytics & Reporting

### 1. **Application Funnel**
```
Applied: 50
Phone Screen: 15 (30%)
Technical Interview: 8 (16%)
Final Interview: 4 (8%)
Offer: 2 (4%)
Accepted: 1 (2%)
```

### 2. **Response Analytics**
- Average time to first response
- Response rate by company size
- Phone screen conversion rate
- Interview to offer ratio

### 3. **Performance Metrics**
- Interview success rate
- Application quality score
- Resume effectiveness score
- Resume improvement impact

### 4. **Trend Analysis**
- Application rate over time
- Response rate trend
- Interview success trend
- Salary negotiation outcomes

## AI Usage in Dashboard

### Personalized Recommendations
**LLM: Qwen/qwen3.5-9b**

AI generates:
- What to work on next
- Which tools to prioritize
- Skills to focus on
- Job opportunities matching progress
- Interview preparation focus

### Progress Prediction
AI predicts:
- Likelihood of success in current applications
- Estimated time to offer
- Salary expectations
- Career trajectory

### Smart Insights
AI provides:
- Why response rates low (if applicable)
- How to improve interview performance
- Which companies best fit
- Optimal job search strategy

## Response Structure - Dashboard

```json
{
  "status": "success",
  "data": {
    "user": {
      "name": "John Doe",
      "email": "john@example.com"
    },
    "subscription": {
      "plan": "premium",
      "status": "active",
      "renewalDate": "2024-07-10"
    },
    "stats": {
      "totalApplications": 25,
      "applicationsByStatus": {
        "applied": 10,
        "phoneScreen": 5,
        "interview": 6,
        "offer": 2,
        "rejected": 2
      },
      "responseRate": 0.72,
      "interviewRate": 0.48,
      "offerRate": 0.08
    },
    "resumeScore": {
      "current": 88,
      "trend": "+12 (last 30 days)",
      "nextFocus": "Add quantified achievements"
    },
    "recentActivity": [
      {
        "date": "2024-06-10",
        "action": "Analyzed resume",
        "details": "ATS score: 82"
      }
    ],
    "recommendations": [
      {
        "priority": "high",
        "action": "Practice system design interviews",
        "why": "3 upcoming system design interviews"
      }
    ],
    "upcomingEvents": [
      {
        "date": "2024-06-12",
        "type": "Interview",
        "company": "TechCorp",
        "title": "Senior Engineer",
        "time": "2:00 PM"
      }
    ]
  }
}
```

## User Flow

1. Login → Dashboard
2. View overall stats (applications, responses)
3. See current opportunities (upcoming interviews)
4. Review recommendations
5. Check feature usage
6. Go to specific tools as needed
7. Log new application
8. Update application status
9. View analytics
10. Schedule/prepare for interviews

## Key Features

### Comprehensive Tracking
- All job applications in one place
- Status tracking
- Notes and documentation
- Interview scheduling
- Offer comparison

### Analytics & Insights
- Application funnel
- Response rates
- Success metrics
- Trend analysis
- Performance insights

### Personalized Recommendations
- AI-driven next steps
- Skill focus suggestions
- Interview prep recommendations
- Tool usage optimization

### Performance Metrics
- Resume improvement tracking
- Interview success rate
- Application quality
- Goal achievement
- Progress toward offer

## Files Involved

**Backend:**
- Routes: `backend/src/routes/dashboard.js`
- Routes: `backend/src/routes/jobTracker.js`
- Services:
  - `jobTracker.js` - application tracking
  - `progressService.js` - progress tracking
  - `profiles.js` - user profile
  - `subscriptions.js` - plan status
  - `recommendationEngine.js` - AI recommendations

**Frontend:**
- `pages/Dashboard.jsx` - main dashboard
- `pages/JobTracker.jsx` - application tracker
- Components for stats, charts, and recommendations

## Performance Metrics
- Dashboard load time: <2 seconds
- Application logging: <1 second
- Analytics generation: 2-5 seconds
- Chart rendering: <1 second
- Data sync: Real-time
