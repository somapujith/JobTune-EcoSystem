# JobTube Supabase Setup Guide

## Status
✅ Backend configured for PostgreSQL/Supabase
✅ All 50+ SQL queries converted to PostgreSQL syntax
⚠️ Network connectivity issue: Port 5432 appears blocked

## Your Supabase Details

**Credentials redacted** — this doc originally had a real project host/username/password committed in plaintext (since rotated; see security note at the top of [docs/archive/](README.md)). Get current values from your own Supabase project dashboard → Settings → Database.

- **Project URL:** `https://<project-ref>.supabase.co`
- **Database Host:** `db.<project-ref>.supabase.co`
- **Port:** 5432 (direct) / 6543 (pooler, recommended — see below)
- **Username:** your Supabase DB username
- **Password:** your Supabase DB password (URL-encode special characters, e.g. `@` → `%40`)
- **Database:** `postgres`

## Connection String (Example Shape)
```
DATABASE_URL=postgresql://<username>:<url-encoded-password>@db.<project-ref>.supabase.co:5432/postgres?sslmode=require
```

## Troubleshooting Network Connectivity

### Issue: Connection Timeout
Your ISP or firewall may block port 5432 (PostgreSQL default port).

### Solution 1: Use Supabase Connection Pooler (RECOMMENDED)
1. Go to Supabase Dashboard → Settings → Database
2. Find "Connection String - Transaction mode"
3. Replace connection string with pooler URL:
   ```
   postgresql://<username>:<url-encoded-password>@db.<project-ref>.supabase.co:6543/postgres?sslmode=require
   ```
4. Update `.env`:
   ```
   DATABASE_URL=postgresql://<username>:<url-encoded-password>@db.<project-ref>.supabase.co:6543/postgres?sslmode=require
   ```
5. Restart backend

### Solution 2: Use VPN
- Enable VPN (changes IP, may bypass ISP restrictions)
- Restart backend

### Solution 3: SSH Tunnel (Advanced)
- Create SSH tunnel to Supabase server
- Forward port 5432 locally
- Connect through tunnel

### Solution 4: Switch to Local PostgreSQL
If network restrictions prevent Supabase:
```bash
# Windows: Download PostgreSQL installer
# Create database:
CREATE DATABASE fresher_ecosystem;

# Update .env (remove DATABASE_URL line):
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
```

## Backend Configuration Status

### Environment Variables
- ✅ DATABASE_URL configured
- ✅ LM Studio models configured
- ✅ JWT secret configured
- ✅ PORT set to 3000

### Database Routes
All 15 routes updated for PostgreSQL:
- ✅ auth.js - Signup/Login
- ✅ resume.js - Resume operations
- ✅ interview.js - Mock interviews
- ✅ skills.js - Skill assessments
- ✅ learning.js - Learning paths
- ✅ dashboard.js - Dashboard data
- ✅ careerRoadmap.js - Career planning
- ✅ jobAnalyzer.js - Job analysis
- ✅ coverLetter.js - Cover letter generation
- ✅ resumeChat.js - Resume RAG
- ✅ atsChecker.js - ATS scoring
- ✅ admin.js - Admin panel
- ✅ profiles.js - GitHub profiles
- ✅ projects.js - Project ideas
- ✅ auditLogger.js - Audit logs

### LLM Models
- ✅ Resume: mistralai/mistral-7b-instruct-v0.3
- ✅ Interview: meta-llama-3.1-8b-instruct
- ✅ Job Tools: mistralai/mistral-7b-instruct-v0.3
- ✅ Skills: qwen/qwen3.5-9b
- ✅ Roadmap: phi-4-mini-reasoning
- ✅ Embeddings: text-embedding-nomic-embed-text-v1.5@q3_k_m

## Next Steps

1. **Choose a solution** (Pooler recommended):
   - Get pooler connection string from Supabase
   - Update `DATABASE_URL` in `.env`

2. **Restart backend:**
   ```bash
   cd backend && npm run dev
   ```

3. **Verify connection:**
   - Look for: "✅ Successfully connected to PostgreSQL database"
   - If connected, tables auto-create on first API call

4. **Test endpoints:**
   ```bash
   # Test login
   curl -X POST http://localhost:3000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"test123"}'
   ```

## Support

- Supabase Docs: https://supabase.com/docs
- Connection issues: https://supabase.com/docs/guides/database/connecting-to-postgres
- Contact Supabase support if credentials issues

---
Generated: 2026-06-06
