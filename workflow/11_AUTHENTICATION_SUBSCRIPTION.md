# Authentication & Subscription Management Workflow

## Overview
Comprehensive authentication system with subscription plans, plan management, and access control for premium features.

## Authentication Workflow

### 1. **User Registration**
- Frontend: `Login.jsx`
- Route: `/auth/register` (POST)
- User provides:
  - Email
  - Password
  - Name
- Service: `auth.js`

### 2. **Email Verification**
- Send verification email
- User clicks verification link
- Email confirmed in database
- Account activation

### 3. **Password Hashing & Storage**
- Hash password using bcrypt
- Store securely in database
- Never store plain text
- Service: `auth.mjs` (backend lib)

### 4. **Session Management**
- Create JWT token
- Set secure HttpOnly cookie
- Token contains user ID
- Expiration: 7 days
- Refresh tokens available

### 5. **Login Process**
- User provides email + password
- Verify credentials
- Check if account verified
- Create session token
- Return user data to frontend
- Store in auth store

### 6. **Protected Routes**
- Middleware checks authentication
- Verify JWT token validity
- Route: `middleware/auth.js`
- Redirect to login if unauthorized
- Return 401 if token invalid

### 7. **Logout**
- Clear authentication cookie
- Clear frontend auth store
- Invalidate session
- Redirect to home

### 8. **Password Reset**
- User requests reset
- Generate reset token
- Send email with reset link
- User sets new password
- Token becomes invalid

## Subscription Management Workflow

### 1. **Plan Selection**
- Frontend: `PlanSelection.jsx`
- User selects plan tier:
  - Free (Limited)
  - Pro ($9.99/month)
  - Premium ($29.99/month)
  - Enterprise (Custom)

### 2. **Plan Features Gate**
- Service: `toolAccess.js`
- Route: `components/PlanGate.jsx`
- Controls feature access based on plan:

**Free Plan:**
- 2 resume analyses/month
- Basic ATS check
- Limited job discovery
- No priority support

**Pro Plan:**
- Unlimited resume analyses
- Advanced ATS checker
- Job discovery & matching
- Interview prep (limited)
- Email support

**Premium Plan:**
- All Pro features
- Mock interviews (unlimited)
- Career roadmap
- LinkedIn/GitHub optimizer
- Priority support
- Personal coach (limited)

**Enterprise:**
- All features
- Team management
- Advanced analytics
- Dedicated support

### 3. **Payment Processing**
- Frontend: `PaymentConfirm.jsx`
- Route: `/subscriptions/checkout` (POST)
- Integration: Stripe/PayPal
- Secure payment handling
- PCI compliance

### 4. **Subscription Storage**
- Service: `subscriptions.js`
- Database storage:
  - User ID
  - Plan type
  - Start date
  - Renewal date
  - Payment status
  - Payment method

### 5. **Feature Access Control**
- Before rendering feature:
  - Check user subscription
  - Verify plan allows feature
  - Service: `useSubscriptionStore.js`
  - If unauthorized: show upgrade prompt

### 6. **Plan Change**
- Component: `PlanChangeModal.jsx`
- User can upgrade/downgrade
- Prorated billing applied
- Effective immediately (pro-rata)
- Usage limits updated

### 7. **Onboarding Flow**
- New user starts onboarding
- Component: `OnboardingQuestionnaire.jsx`
- Questions about:
  - Job search goals
  - Current experience level
  - Target roles
  - Learning interests
- Service: `recommendationEngine.js`
- Generates personalized recommendations
- Routes to Dashboard

### 8. **Subscription Renewal**
- Scheduled job checks renewal dates
- Charge user 24 hours before
- Send renewal confirmation email
- Update plan status
- Extend access

### 9. **Cancellation**
- User initiates cancellation
- Confirmation required
- Plan becomes inactive at end of period
- Access removed after expiration
- Option to rejoin

### 10. **Session & Progress Tracking**
- Service: `sessionService.js`
- Tracks:
  - Login sessions
  - Feature usage
  - Progress through tools
  - Analysis history
  - Saved content

## AI Usage in Auth/Subscription

### Onboarding Recommendations
**LLM: Qwen/qwen3.5-9b**

AI generates:
- Personalized tool recommendations
- Suggested learning path
- Feature priority ranking
- Skill development guidance

### Usage Analytics
- AI analyzes feature usage
- Recommends underused tools
- Suggests next steps
- Personalizes dashboard experience

## Response Structure - Auth

```json
{
  "status": "success",
  "data": {
    "user": {
      "id": "user-123",
      "email": "user@example.com",
      "name": "John Doe",
      "verified": true,
      "createdAt": "2024-06-10"
    },
    "token": "jwt-token-here",
    "expiresIn": 604800
  }
}
```

## Response Structure - Subscription

```json
{
  "status": "success",
  "data": {
    "subscription": {
      "id": "sub-123",
      "userId": "user-123",
      "plan": "premium",
      "status": "active",
      "startDate": "2024-06-10",
      "renewalDate": "2024-07-10",
      "features": {
        "resumeAnalysis": "unlimited",
        "atsChecker": true,
        "jobDiscovery": true,
        "interviewPrep": "unlimited",
        "careerRoadmap": true,
        "linkedinOptimizer": true,
        "githubOptimizer": true,
        "supportLevel": "priority"
      }
    }
  }
}
```

## User Flow - Registration

1. Click Sign Up
2. Enter email and password
3. Agree to terms
4. Verify email
5. Select plan
6. Complete payment (if not free)
7. Onboarding questionnaire
8. Dashboard access

## User Flow - Existing User

1. Login with email/password
2. Check subscription status
3. Load plan features
4. Show feature gates where applicable
5. Display upgrade prompts as needed

## Key Features

### Secure Authentication
- Password hashing with bcrypt
- JWT token-based sessions
- HttpOnly secure cookies
- CSRF protection
- Session expiration

### Plan Management
- Multiple subscription tiers
- Feature-level access control
- Plan change support
- Automatic renewal
- Usage tracking

### Access Control
- Middleware verification
- Feature gates
- Route protection
- API endpoint access
- Graceful upgrade prompts

### Onboarding
- Personalized questionnaire
- AI-generated recommendations
- Goal setting
- Feature introduction
- Progress tracking

## Files Involved

**Backend:**
- Routes: `backend/src/routes/auth.js`
- Routes: `backend/src/routes/subscriptions.js`
- Services:
  - `auth.mjs` - authentication logic
  - `subscriptions.js` - subscription management
  - `sessionService.js` - session tracking
  - `recommendationEngine.js` - personalization
- Middleware: `backend/src/middleware/auth.js`

**Frontend:**
- Pages:
  - `pages/Login.jsx` - auth interface
  - `pages/Onboarding.jsx` - onboarding flow
  - `pages/PlanSettings.jsx` - plan management
  - `pages/PaymentConfirm.jsx` - payment confirmation
- Components:
  - `OnboardingQuestionnaire.jsx` - questions
  - `PlanSelection.jsx` - plan choice
  - `PlanGate.jsx` - feature access
  - `PlanChangeModal.jsx` - plan changes
- Store: `store/useAuthStore.js`, `store/useSubscriptionStore.js`
- Config: `config/toolAccess.js` - feature mapping

## Security Features
- Password reset tokens (time-limited)
- Email verification
- Secure session management
- CORS protection
- Rate limiting on auth endpoints
- PCI compliance for payments

## Performance Metrics
- Login time: <2 seconds
- Onboarding completion: 5-10 minutes
- Subscription activation: <1 minute
- Session validation: <100ms
- Feature gate check: <50ms
