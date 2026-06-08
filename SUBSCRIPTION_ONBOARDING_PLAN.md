# 3-Tier Subscription Onboarding System - Complete Implementation Plan

## 1. Database Schema Updates

### New Tables Required

```sql
-- Subscription Plans
CREATE TABLE IF NOT EXISTS subscription_plans (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  tier_level INT NOT NULL (1=Entry, 2=Mid, 3=Premium),
  display_name VARCHAR(100) NOT NULL,
  description TEXT,
  price_monthly DECIMAL(10, 2),
  price_yearly DECIMAL(10, 2),
  features JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_subscription_plans_tier ON subscription_plans(tier_level);

-- User Subscriptions
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE,
  plan_id INTEGER NOT NULL REFERENCES subscription_plans(id),
  status VARCHAR(50) DEFAULT 'active' (active, cancelled, expired),
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  renews_at TIMESTAMP,
  cancelled_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX idx_user_subscriptions_user_id ON user_subscriptions(user_id);
CREATE INDEX idx_user_subscriptions_plan_id ON user_subscriptions(plan_id);

-- Plan Questionnaire Responses
CREATE TABLE IF NOT EXISTS onboarding_responses (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE,
  career_goal VARCHAR(255),
  experience_level VARCHAR(50),
  pain_points JSONB,
  recommended_plan_id INTEGER,
  selected_plan_id INTEGER,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (recommended_plan_id) REFERENCES subscription_plans(id),
  FOREIGN KEY (selected_plan_id) REFERENCES subscription_plans(id)
);
CREATE INDEX idx_onboarding_responses_user_id ON onboarding_responses(user_id);
```

### Update Existing Users Table

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_plan_id INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS has_completed_subscription_onboarding BOOLEAN DEFAULT false;
CREATE INDEX idx_users_subscription_plan_id ON users(subscription_plan_id);
```

## 2. File Structure - Frontend

```
frontend/src/
├── pages/
│   ├── SubscriptionOnboarding.jsx          # Main full-page questionnaire wrapper
│   └── SubscriptionSelection.jsx           # Plan selection & confirmation
├── components/
│   ├── onboarding/
│   │   ├── OnboardingQuestionnaire.jsx     # AI chatbot-style Q&A interface
│   │   ├── QuestionCard.jsx                # Individual question component
│   │   ├── OptionButton.jsx                # Reusable option button
│   │   ├── ProgressIndicator.jsx           # Progress bar/step counter
│   │   └── RecommendationDisplay.jsx       # Shows AI-recommended plan
│   ├── subscriptions/
│   │   ├── PlanCard.jsx                    # Individual plan display
│   │   ├── PlanComparison.jsx              # Side-by-side plan comparison
│   │   ├── FeatureList.jsx                 # Features for selected plan
│   │   └── UpgradePrompt.jsx               # Feature locked overlay (plan-based)
│   └── layout/
│       └── PlanGate.jsx                    # HOC to restrict access by plan
├── hooks/
│   ├── useSubscription.js                  # Subscription state & logic
│   ├── usePlanRecommendation.js            # Plan recommendation algorithm
│   └── usePlanPermissions.js               # Permission checking by plan
├── store/
│   └── useSubscriptionStore.js             # Zustand subscription state
└── utils/
    ├── planConfig.js                       # Plan definitions & features
    └── permissionMatrix.js                 # Feature→Plan mapping
```

## 3. File Structure - Backend

```
backend/src/
├── routes/
│   └── subscriptions.js                    # All subscription endpoints
├── services/
│   ├── subscriptions/
│   │   ├── index.js                        # Main subscription service
│   │   ├── planService.js                  # Plan CRUD operations
│   │   ├── recommendationEngine.js         # AI-powered plan recommendation
│   │   └── permissionService.js            # Feature access control
│   └── onboarding/
│       ├── index.js                        # Onboarding orchestration
│       └── questionnaireService.js         # Question & response handling
├── middleware/
│   └── planGate.js                         # Route-level plan validation
└── utils/
    └── initializeTables.js                 # Include new tables (already exists)
```

## 4. Component Hierarchy - Subscription Onboarding

```
SubscriptionOnboarding (page wrapper)
├── ProgressIndicator
│   └── Step dots (visual progress)
└── OnboardingQuestionnaire
    └── Loop through questions (currentStep state)
        ├── QuestionCard
        │   ├── Icon + Question Text
        │   └── OptionButton[] (map through options)
        │       └── Animated selection effect
        └── Navigation Buttons
            ├── Back (disabled on step 0)
            └── Next/Complete

RecommendationDisplay (after all Q&A)
├── Recommended Plan Card (highlighted)
├── Plan Description
├── Feature List
└── Action Buttons
    ├── Accept Recommendation
    └── View All Plans

SubscriptionSelection (final step)
├── PlanCard[] x3 (Entry, Mid, Premium)
│   ├── Plan Name
│   ├── Price
│   ├── Feature List
│   └── Select Button
├── PlanComparison (optional expanded view)
└── Confirmation Dialog
```

## 5. Plan Recommendation Algorithm

Location: `backend/src/services/subscriptions/recommendationEngine.js`

```javascript
// Algorithm Logic:
function recommendPlan(responses) {
  const scores = {
    'Learn & Build': 0,      // Entry tier
    'Tune & Polish': 0,      // Mid tier
    'Zero to Hero': 0        // Premium
  };

  // Career Goal Scoring
  if (responses.career_goal === 'service_role') {
    scores['Learn & Build'] += 40;
  } else if (responses.career_goal === 'skill_development') {
    scores['Tune & Polish'] += 40;
  } else if (responses.career_goal === 'faang_target') {
    scores['Zero to Hero'] += 40;
  }

  // Experience Level Scoring
  if (responses.experience_level === 'beginner') {
    scores['Learn & Build'] += 30;
  } else if (responses.experience_level === 'intermediate') {
    scores['Tune & Polish'] += 30;
  } else if (responses.experience_level === 'advanced') {
    scores['Zero to Hero'] += 30;
  }

  // Pain Points Analysis
  responses.pain_points.forEach(pain => {
    const weights = PAIN_POINT_WEIGHTS[pain];
    scores['Learn & Build'] += weights.entry;
    scores['Tune & Polish'] += weights.mid;
    scores['Zero to Hero'] += weights.premium;
  });

  // Return highest scoring plan
  return Object.keys(scores).reduce((a, b) => 
    scores[a] > scores[b] ? a : b
  );
}
```

## 6. Dashboard Permission/Visibility Rules

Location: `frontend/src/utils/permissionMatrix.js`

```javascript
const PLAN_PERMISSIONS = {
  'Learn & Build': {
    tools: [
      'Learning Resources',
      'Project Ideas (service-role)',
      'Skill Assessment'
    ],
    locked: [
      'Resume Optimizer',
      'LinkedIn Optimizer',
      'GitHub Optimizer',
      'Portfolio Builder',
      'Mock Interview',
      'Job Fit Analysis'
    ]
  },
  'Tune & Polish': {
    tools: [
      'Resume Optimizer',
      'LinkedIn Optimizer',
      'GitHub Optimizer',
      'Portfolio Builder',
      'Project Ideas',
      'Learning Resources',
      'Skill Assessment'
    ],
    locked: [
      'Mock Interview',
      'Job Fit Analysis',
      'Career Roadmap',
      'Job Matcher',
      'ATS Checker'
    ]
  },
  'Zero to Hero': {
    tools: [
      'ALL TOOLS'
    ],
    locked: []
  }
};
```

## 7. Backend Questionnaire Questions & Scoring

Location: `backend/src/services/onboarding/questionnaireService.js`

```javascript
const QUESTIONNAIRE = [
  {
    id: 'career_goal',
    question: 'What is your primary career goal?',
    type: 'single_select',
    options: [
      { value: 'service_role', label: 'Get a service/support role' },
      { value: 'skill_development', label: 'Develop specific skills', },
      { value: 'faang_target', label: 'Target FAANG companies' }
    ]
  },
  {
    id: 'experience_level',
    question: 'What is your experience level?',
    type: 'single_select',
    options: [
      { value: 'beginner', label: '0-1 years' },
      { value: 'intermediate', label: '1-3 years' },
      { value: 'advanced', label: '3+ years' }
    ]
  },
  {
    id: 'pain_points',
    question: 'What are your main challenges? (Select all that apply)',
    type: 'multi_select',
    options: [
      { value: 'resume_building', label: 'Building/optimizing resume' },
      { value: 'linkedin_visibility', label: 'LinkedIn visibility' },
      { value: 'interview_prep', label: 'Interview preparation' },
      { value: 'portfolio_gaps', label: 'Portfolio/project gaps' },
      { value: 'skill_gaps', label: 'Skill gaps' },
      { value: 'job_search', label: 'Finding right opportunities' }
    ]
  }
];
```

## 8. Implementation Order (Phases)

### Phase 1: Foundation (Week 1)
1. **Database**: Create new tables for plans, subscriptions, onboarding responses
2. **Backend Services**: 
   - `planService.js` - CRUD operations
   - Seed initial 3 plans into DB
3. **Backend Routes**: 
   - `GET /api/subscriptions/plans` - List plans
   - `POST /api/subscriptions/onboarding/responses` - Save questionnaire

### Phase 2: Onboarding Flow (Week 2)
4. **Recommendation Engine**: `recommendationEngine.js` with algorithm
5. **Backend Endpoints**:
   - `POST /api/subscriptions/recommend` - Get recommended plan
   - `POST /api/subscriptions/select` - Save user plan selection
6. **Frontend Components**:
   - `OnboardingQuestionnaire.jsx`
   - `QuestionCard.jsx`, `OptionButton.jsx`
   - `RecommendationDisplay.jsx`

### Phase 3: Plan Selection & Assignment (Week 2)
7. **Frontend Page**: `SubscriptionSelection.jsx`
8. **Frontend Components**:
   - `PlanCard.jsx`
   - `PlanComparison.jsx`
9. **Backend Middleware**: `planGate.js` for route protection

### Phase 4: Dashboard Permission System (Week 3)
10. **Frontend Hooks**:
    - `useSubscription.js` - Fetch user plan
    - `usePlanPermissions.js` - Check feature access
11. **Frontend Component**: `PlanGate.jsx` HOC wrapper
12. **Locked Feature Overlay**: `UpgradePrompt.jsx`
13. **Dashboard Integration**: Update `Dashboard.jsx` to filter tools by plan

### Phase 5: User Store Integration (Week 3)
14. **Update `useAuthStore.js`**: Add subscription plan to auth state
15. **New Store**: `useSubscriptionStore.js` for subscription data
16. **Routing**: Update `App.jsx` to redirect new users → onboarding

### Phase 6: Polish & Testing (Week 4)
17. **E2E Tests**: Onboarding flow → plan selection → dashboard visibility
18. **Permission Tests**: Verify locked features show upgrade prompts
19. **Seeding**: Initialize plans for development/staging

## 9. API Endpoint Specifications

```javascript
// GET /api/subscriptions/plans
// Response: List of all subscription plans with features

// POST /api/subscriptions/onboarding/responses
// Body: { career_goal, experience_level, pain_points }
// Response: { success, recommendedPlan }

// POST /api/subscriptions/recommend
// Body: { responses }
// Response: { recommendedPlan, rationale }

// POST /api/subscriptions/select
// Body: { planId }
// Response: { success, userSubscription }

// GET /api/subscriptions/my-plan
// Response: { plan, features, remainingUsage }

// POST /api/subscriptions/check-feature
// Body: { featureName }
// Response: { hasAccess, planRequired }
```

## 10. Key Function Names & Exports

### Backend
- `recommendationEngine.recommendPlan(responses)` → planName
- `planService.getPlanById(id)` → Plan object
- `planService.getAllPlans()` → [Plan]
- `permissionService.hasFeatureAccess(userId, feature)` → boolean
- `permissionService.getLockedFeatures(planId)` → [features]

### Frontend Hooks
- `useSubscription()` → { plan, status, features, loading }
- `usePlanRecommendation()` → { recommend, loading, error }
- `usePlanPermissions()` → { hasAccess(feature), getLockedFor(feature) }

### Frontend Components
- `<SubscriptionOnboarding />` - Wrapper page
- `<OnboardingQuestionnaire questions={[]} />` - Q&A interface
- `<SubscriptionSelection />` - Plan selection page
- `<PlanGate feature="mock-interview" />` - Wrapper HOC
- `<UpgradePrompt lockedFeature="Mock Interview" />` - Modal

## 11. Validation Rules

**Questionnaire Validation:**
- All single-select questions required
- Pain points must have 1-6 selections
- All responses must map to valid enum values

**Plan Assignment Validation:**
- User can only have one active subscription
- Plan selection must be from available plans list
- Recommendation shown but user can always override

**Feature Access Validation:**
- Check user subscription on every protected route
- Return 403 with feature info if locked
- Client-side: disable/hide features before request

## 12. Testing Checklist

- [ ] Questionnaire flows through all 3 questions
- [ ] Recommendation algorithm returns correct plan for all answer combos
- [ ] User can override recommended plan
- [ ] Plan assignment saves to DB correctly
- [ ] Dashboard filters tools by plan
- [ ] Locked features show upgrade prompts
- [ ] Permission middleware blocks unauthorized access
- [ ] Onboarding redirect works on first login
- [ ] Users can view all plans from settings
- [ ] Permission matrix covers all 7 tools
