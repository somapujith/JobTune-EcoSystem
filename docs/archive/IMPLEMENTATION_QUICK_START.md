# JobTube Eco System — Quick Start & Troubleshooting Guide

---

## 🚀 5-Minute Quick Start

### Step 1: Clone & Install

```bash
# Clone repository
git clone https://github.com/your-username/jobtube.git
cd jobtube

# Install root dependencies (for concurrent scripts)
npm install

# Install backend & frontend dependencies
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
```

### Step 2: Configure Environment

```bash
# Backend setup
cd backend
cp .env.example .env

# Edit .env with:
DATABASE_URL=postgresql://localhost:5432/jobtube
JWT_SECRET=your-secret-key-here
CLAUDE_API_KEY=sk-ant-...
GEMINI_API_KEY=AIzaSy...
PORT=5000
```

### Step 3: Setup Database

```bash
# From backend directory
npx sequelize-cli db:create
npx sequelize-cli db:migrate
npx sequelize-cli db:seed:all
```

### Step 4: Run Development Servers

```bash
# From root directory
npm run dev

# This runs both:
# - Frontend: http://localhost:5173
# - Backend: http://localhost:5000
```

### Step 5: Test Application

```
1. Open http://localhost:5173
2. Register new account
3. Complete onboarding quiz
4. Try uploading a resume
5. Click "Optimize Resume"
```

---

## 🔧 Commands Reference

### Frontend Commands

```bash
cd frontend

# Development
npm run dev              # Start Vite dev server (port 5173)
npm run build           # Build for production
npm run preview         # Preview production build
npm run lint            # Run ESLint
npm run lint:fix        # Auto-fix lint issues

# Testing (when implemented)
npm run test            # Run tests
npm run test:watch      # Watch mode
```

### Backend Commands

```bash
cd backend

# Server
npm run dev             # Start with auto-reload (Nodemon)
npm start               # Start production

# Testing
npm run test            # Run Jest tests
npm run test:watch      # Watch mode
npm run test:coverage   # Coverage report

# Database
npx sequelize-cli db:create           # Create database
npx sequelize-cli db:migrate          # Run migrations
npx sequelize-cli db:migrate:undo     # Rollback migration
npx sequelize-cli db:seed:all         # Run seeders
npx sequelize-cli migration:generate  # Create new migration
npx sequelize-cli model:generate      # Create new model

# Debugging
npm run debug           # Debug mode (inspect)
```

### Root Commands

```bash
# Run both frontend & backend simultaneously
npm run dev             # Uses concurrently
npm run dev:frontend    # Only frontend
npm run dev:backend     # Only backend
```

---

## ⚠️ Common Issues & Solutions

### Issue 1: Port Already in Use

**Error:** `Error: listen EADDRINUSE :::5000`

**Solution:**
```bash
# Find process using port 5000
lsof -i :5000          # macOS/Linux
netstat -ano | findstr :5000  # Windows

# Kill process
kill -9 <PID>          # macOS/Linux
taskkill /PID <PID> /F # Windows

# Or change port in .env
PORT=5001
```

### Issue 2: Database Connection Failed

**Error:** `connect ECONNREFUSED 127.0.0.1:5432`

**Solution:**
```bash
# Check if PostgreSQL is running
# macOS
brew services list

# Linux
sudo systemctl status postgresql

# Windows
# Check Services > PostgreSQL

# If not running, start it
brew services start postgresql  # macOS
sudo systemctl start postgresql # Linux

# Create database if doesn't exist
createdb jobtube        # macOS/Linux
```

### Issue 3: JWT Token Errors

**Error:** `AuthorizationError: Invalid token` or `TokenExpiredError`

**Solution:**
```bash
# Clear browser localStorage
# In DevTools Console:
localStorage.clear()

# Then logout & login again
# Or check .env for JWT_SECRET mismatch
```

### Issue 4: Resume Upload Fails

**Error:** `Error: ENOENT: no such file or directory '/uploads'`

**Solution:**
```bash
# Create uploads directory
mkdir -p backend/uploads

# Check file permissions
chmod 755 backend/uploads

# Ensure file size < 5MB in .env
MAX_FILE_SIZE=5242880
```

### Issue 5: Claude API Errors

**Error:** `401 Unauthorized` or `RateLimitError`

**Solution:**
```bash
# Verify API key in .env
echo $CLAUDE_API_KEY     # Should output your key

# Check API quota at:
# https://console.anthropic.com/account/usage

# If quota exceeded, wait for next billing cycle
# Or upgrade plan

# For testing, use mock mode:
CLAUDE_API_KEY=mock_key  # In .env
# (Requires MOCK_AI=true in code)
```

### Issue 6: CORS Errors

**Error:** `Access to XMLHttpRequest blocked by CORS policy`

**Solution:**
```bash
# Verify frontend URL in backend .env
FRONTEND_URL=http://localhost:5173

# Check backend CORS config in app.js
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true
}));

# Restart backend
npm run dev
```

### Issue 7: Build Errors

**Error:** `ReferenceError: undefined variable` or `Module not found`

**Solution:**
```bash
# Clear dependencies & reinstall
rm -rf node_modules package-lock.json
npm install

# Clear build cache
rm -rf dist/ .vite/

# Rebuild
npm run build

# Check for circular imports
npm run lint
```

### Issue 8: TypeScript/JSDoc Errors

**Error:** `Property does not exist on type 'any'`

**Solution:**
```bash
# Add type checking
// For React components:
import PropTypes from 'prop-types';

// Or use JSDoc comments:
/**
 * @param {Object} props
 * @param {string} props.title
 * @returns {JSX.Element}
 */
function MyComponent({ title }) { ... }
```

---

## 🧪 Testing the API

### Using cURL

#### Test Authentication
```bash
# Register
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!",
    "firstName": "John",
    "lastName": "Doe"
  }'

# Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!"
  }'

# Get current user (requires JWT token)
curl -X GET http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### Test Resume Upload
```bash
# Upload resume
curl -X POST http://localhost:5000/api/resume/upload \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "resume=@/path/to/resume.pdf"

# Get all resumes
curl -X GET http://localhost:5000/api/resume \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Optimize resume
curl -X POST http://localhost:5000/api/resume/optimize \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "resumeId": "uuid-here",
    "jobDescription": "Looking for Software Engineer with React..."
  }'
```

#### Test ATS Checker V2
```bash
# Check ATS score with file
curl -X POST http://localhost:5000/api/ats/check-v2 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "resume=@resume.pdf" \
  -F "jobDescription=Your job description"
```

### Using Postman/Insomnia

1. **Download** Postman or Insomnia
2. **Import** environment configuration:
   ```json
   {
     "base_url": "http://localhost:5000",
     "jwt_token": "your_token_here"
   }
   ```
3. **Create requests** in Collections
4. **Set auth header**: `Authorization: Bearer {{jwt_token}}`
5. **Test endpoints** from collection

---

## 📊 Database Management

### View Database

```bash
# Connect to PostgreSQL
psql -U postgres -d jobtube

# List tables
\dt

# View table schema
\d "Users"
\d "Resumes"

# Run SQL query
SELECT * FROM "Users";
SELECT * FROM "Resumes" WHERE "userId" = 'user-id';

# Exit
\q
```

### Reset Database

```bash
# Drop and recreate (WARNING: deletes all data)
npx sequelize-cli db:drop
npx sequelize-cli db:create
npx sequelize-cli db:migrate
npx sequelize-cli db:seed:all
```

### Create New Migration

```bash
# Generate migration file
npx sequelize-cli migration:generate --name add-new-column

# Edit generated file in backend/migrations/

# Run migration
npx sequelize-cli db:migrate
```

---

## 🔍 Debugging

### Frontend Debugging

```bash
# 1. React DevTools
# Install Chrome extension: React Developer Tools

# 2. Network Tab
# DevTools → Network → see all API calls

# 3. Console Logs
console.log('User:', user);
console.table(jobs);          // Pretty print array
console.error('Error:', err);

# 4. Breakpoints
// In DevTools → Sources tab
// Click line number to set breakpoint
// Step through execution

# 5. Zustand Store Inspector
// In browser console:
import useAuthStore from './store/useAuthStore';
console.log(useAuthStore.getState());
```

### Backend Debugging

```bash
# 1. Winston Logs
// In backend/src/config/logger.js
// Logs written to: backend/logs/

# 2. Console Output
console.log('Processing resume:', resumeId);
console.table(analysisResults);

# 3. Breakpoint Debugging
// Run with inspector:
npm run debug

# 4. Check Request/Response
// Winston middleware logs all requests
// See: backend/logs/combined.log

# 5. Database Query Logs
// In sequelize config:
logging: console.log  // Prints SQL queries
```

### Common Log Locations

```
Frontend:
- Browser console (DevTools)
- VSCode Debug Console (if debugging)

Backend:
- backend/logs/combined.log      # All requests
- backend/logs/errors.log        # Errors only
- Console output (npm run dev)

Database:
- PostgreSQL logs (system dependent)
- Winston logs (if configured)
```

---

## 🚢 Deployment Checklist

### Before Going Live

- [ ] All tests pass (`npm run test`)
- [ ] No console errors (check DevTools)
- [ ] No hardcoded URLs (use .env)
- [ ] Environment variables set
- [ ] Database migrations run
- [ ] API keys configured (Claude, Gemini)
- [ ] CORS origins updated
- [ ] JWT secrets strong (32+ chars)
- [ ] Password hashing enabled (bcrypt)
- [ ] Rate limiting configured
- [ ] Error logging set up (Winston)
- [ ] Database backups scheduled
- [ ] HTTPS enabled
- [ ] Logging monitored
- [ ] Performance monitored

### Production Environment Variables

```bash
# Frontend (.env.production)
VITE_API_URL=https://api.jobtube.com
VITE_NODE_ENV=production

# Backend (.env.production)
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@prod-db:5432/jobtube
JWT_SECRET=generate-new-strong-secret
CLAUDE_API_KEY=sk-ant-...
PORT=5000
FRONTEND_URL=https://jobtube.com
LOG_LEVEL=info
```

### Deploy Frontend (Vercel)

```bash
# 1. Push to GitHub
git push origin main

# 2. Vercel auto-deploys
# Watch deployment at: https://vercel.com

# 3. Or manual deploy
vercel --prod
```

### Deploy Backend (Railway)

```bash
# 1. Connect GitHub repo
# 2. Set environment variables in Railway dashboard
# 3. Railway auto-deploys on push
# 4. Monitor logs in Railway dashboard

# Or manual:
npm run build && npm start
```

---

## 📞 Getting Help

### Documentation
- **Project Architecture:** `PROJECT_ARCHITECTURE_GUIDE.md`
- **Tech Stack:** `TECH_STACK_VISUAL_GUIDE.md`
- **API Docs:** `API_DOCUMENTATION.md`
- **About Project:** `ABOUT_PROJECT.md`

### Debug Steps

1. **Read error message carefully**
   - Note exact error text
   - Check file/line number

2. **Search solution**
   - Google error message
   - Check GitHub issues
   - Read documentation

3. **Check logs**
   - Frontend: DevTools Console
   - Backend: terminal output
   - Database: PostgreSQL logs

4. **Isolate issue**
   - Is it frontend or backend?
   - Is it data or code?
   - Is it environment or logic?

5. **Create minimal reproduction**
   - Simplest code that shows issue
   - Helps debug faster

### Resources

- **Documentation:** `/docs` folder
- **Issues:** GitHub Issues
- **Discussions:** GitHub Discussions
- **Email:** support@jobtube.com

---

## 🎯 First-Time Setup Walkthrough

```bash
# 1. Clone repo
git clone <repo-url> && cd jobtube

# 2. Install dependencies
npm install && cd backend && npm install && cd ..

# 3. Setup backend env
cd backend
cp .env.example .env
# Edit .env with your keys

# 4. Create & migrate database
npx sequelize-cli db:create
npx sequelize-cli db:migrate
npx sequelize-cli db:seed:all

# 5. Return to root
cd ..

# 6. Start dev servers
npm run dev

# 7. Open browser
# Frontend: http://localhost:5173
# Backend: http://localhost:5000 (API only)

# 8. Register account & test
# Create account → Complete quiz → Upload resume → Optimize

# ✅ Done!
```

---

## 📈 Performance Tips

### Frontend Optimization
```javascript
// Use React.memo for expensive components
const ExpensiveComponent = React.memo(function Component(props) {
  return <div>...</div>;
});

// Use useMemo for expensive calculations
const memoizedValue = useMemo(() => {
  return computeExpensiveValue(a, b);
}, [a, b]);

// Use useCallback for function references
const memoizedCallback = useCallback(() => {
  doSomething(a, b);
}, [a, b]);

// Lazy load routes
const Dashboard = lazy(() => import('./Dashboard'));
const ResumeOptimizer = lazy(() => import('./ResumeOptimizer'));
```

### Backend Optimization
```javascript
// Use database indexes
await Resume.findAll({
  where: { userId: id },
  // Add index on userId in migration
});

// Use pagination
const resumes = await Resume.findAll({
  where: { userId: id },
  limit: 10,
  offset: 0,
});

// Cache frequently accessed data
const cached = redis.get('user:' + userId);

// Use select for specific fields
await Resume.findAll({
  attributes: ['id', 'title', 'atsScore'],
});
```

---

## 📱 Testing Workflow

```
1. Manual Testing (Development)
   ├── Test in Chrome DevTools
   ├── Check Network tab
   └── Verify console logs

2. Automated Testing (Optional)
   ├── Unit tests (Jest)
   ├── Integration tests (Supertest)
   └── E2E tests (Cypress/Playwright)

3. Staging Testing
   ├── Deploy to staging server
   ├── Run full test suite
   └── Get user feedback

4. Production Monitoring
   ├── Monitor error rates
   ├── Check API response times
   └── Track user metrics
```

---

**Last Updated:** June 13, 2026  
**Version:** 1.0  
**For:** Developers & DevOps Engineers
