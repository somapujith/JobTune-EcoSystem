import React, { useState } from 'react';
import { api } from '../store/useAuthStore';
import { AlertCircle, Code2, Briefcase, Users } from 'lucide-react';

export default function JobAnalyzer() {
  const [jobDescription, setJobDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleAnalyze = async (e) => {
    e.preventDefault();
    if (!jobDescription.trim()) {
      setError('Job description is required');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/jobs/analyze-description', {
        jobDescription
      });
      setResult(data.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to analyze job description');
    } finally {
      setLoading(false);
    }
  };

  const loadTestData = () => {
    const testJobDescription = `Senior Full Stack Engineer - Remote

About Us
TechCorp is a fast-growing SaaS company specializing in AI-powered analytics. We're looking for talented engineers to help us scale our platform to serve thousands of customers worldwide.

About the Role
We are seeking a Senior Full Stack Engineer to join our 15-person engineering team. You will own full product features from concept to production, working across our React frontend and Node.js backend. You'll have the opportunity to mentor junior developers and shape our technical culture.

Key Responsibilities
- Design and develop new features for our web application using React and Node.js
- Optimize database queries and API performance for millions of users
- Implement and maintain automated testing and CI/CD pipelines
- Participate in architectural decisions and design reviews
- Mentor junior engineers and conduct code reviews
- Troubleshoot production issues and implement monitoring solutions
- Collaborate with product and design teams to deliver exceptional user experiences

Required Qualifications
- 5+ years of professional software development experience
- Strong proficiency in JavaScript/TypeScript
- Demonstrated expertise in React and modern frontend frameworks
- Backend experience with Node.js, Express, or similar frameworks
- Solid understanding of SQL and NoSQL databases (PostgreSQL, MongoDB)
- Experience with REST APIs and microservices architecture
- Familiarity with Docker and AWS or similar cloud platforms
- Experience with Git and collaborative development workflows
- Strong problem-solving and communication skills

Nice-to-Have Qualifications
- Experience with GraphQL
- Kubernetes and container orchestration
- AWS certifications or GCP experience
- Open source contributions
- Experience with payment processing systems
- Knowledge of data pipeline and ETL tools

Compensation & Benefits
- Competitive salary: $130,000 - $180,000 based on experience
- 100% remote work
- Comprehensive health insurance
- 401(k) with company matching
- Unlimited PTO
- $3,000 annual professional development budget
- Equity options

Location
Remote (US-based preferred, but global candidates considered)`;

    setJobDescription(testJobDescription);
    setError('');
    setResult(null);
  };

  return (
    <div className="w-full max-w-5xl mx-auto py-16 px-4 sm:px-6">
      <div className="text-center mb-16">
        <div className="inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-slate-900/5 mb-6">
          <span className="material-symbols-outlined text-slate-900 text-3xl" style={{ fontVariationSettings: "'FILL' 0" }}>work</span>
        </div>
        <h1 className="text-4xl font-black text-on-surface font-headline mb-4">
          Job Description Analyzer
        </h1>
        <p className="text-lg text-on-surface-variant font-medium max-w-2xl mx-auto">
          Paste a job description to extract skills, experience requirements, and key responsibilities.
        </p>
      </div>

      {/* How It Works Guide */}
      <div className="max-w-3xl mx-auto mb-12 glass-card border-purple-200/50 rounded-3xl p-8">
        <h3 className="text-xl font-bold text-on-surface mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-purple-600">info</span>
          How It Works
        </h3>
        <div className="space-y-3 text-slate-700 dark:text-slate-300">
          <p><strong>1. Paste Job Description:</strong> Copy the complete job posting (including all requirements, responsibilities, and qualifications)</p>
          <div>
            <p className="mb-2"><strong>2. AI Analysis:</strong> Our AI analyzes the posting and extracts:</p>
            <ul className="list-disc list-inside ml-4 space-y-1">
              <li><strong>Required Skills:</strong> Must-have technical skills for the role</li>
              <li><strong>Nice-to-Have Skills:</strong> Bonus skills that are preferred but not required</li>
              <li><strong>Seniority Level:</strong> Junior, Mid, or Senior</li>
              <li><strong>Experience Required:</strong> Years of experience needed</li>
              <li><strong>Key Responsibilities:</strong> Main duties of the position</li>
              <li><strong>Keywords & Concepts:</strong> Important tools, frameworks, and concepts</li>
            </ul>
          </div>
          <p><strong>3. Use Results:</strong> Compare with your skills to identify gaps and prepare accordingly</p>
        </div>
      </div>

      {error && (
        <div className="max-w-3xl mx-auto mb-6 glass-card border-rose-200/50 p-4 rounded-2xl text-rose-600 text-sm font-medium flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={handleAnalyze} className="max-w-3xl mx-auto mb-12">
        <div className="glass-card rounded-3xl p-8">
          <label className="block text-sm font-bold text-on-surface mb-3">Job Description</label>
          <textarea
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            placeholder="Paste the complete job posting here..."
            rows={12}
            className="w-full bg-surface-container border border-outline/20 rounded-xl px-4 py-3 text-on-surface placeholder:text-outline/50 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
          />
          <p className="text-xs text-slate-400 mt-2">{jobDescription.length} characters</p>
        </div>

        <div className="max-w-3xl mx-auto mt-6 flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="submit"
            disabled={loading}
            className="px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 text-white rounded-2xl font-bold transition-all shadow-lg flex items-center justify-center gap-3"
          >
            {loading ? (
              <>
                <span className="material-symbols-outlined animate-spin text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>sync</span>
                Analyzing...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>analytics</span>
                Analyze Job Description
              </>
            )}
          </button>
          <button
            type="button"
            onClick={loadTestData}
            className="px-8 py-3 glass-card hover:bg-white/40 text-on-surface rounded-2xl font-bold transition-all flex items-center justify-center gap-3"
          >
            <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>dataset</span>
            Load Test Data
          </button>
        </div>
      </form>

      {/* Results */}
      {result && !loading && (
        <div className="max-w-3xl mx-auto space-y-8">
          {/* Seniority & Experience */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="glass-card border-blue-500/20 rounded-2xl p-6">
              <p className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase mb-2">Seniority Level</p>
              <p className="text-2xl font-black text-blue-700 dark:text-blue-300">{result.seniority}</p>
            </div>
            <div className="glass-card border-purple-500/20 rounded-2xl p-6">
              <p className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase mb-2">Experience</p>
              <p className="text-lg font-black text-purple-700 dark:text-purple-300">{result.experienceLevel}</p>
            </div>
            <div className="glass-card border-amber-500/20 rounded-2xl p-6">
              <p className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase mb-2">Salary Range</p>
              <p className="text-lg font-black text-amber-700 dark:text-amber-300">{result.salaryRange}</p>
            </div>
          </div>

          {/* Required Skills */}
          {result.requiredSkills.length > 0 && (
            <div className="glass-card rounded-3xl p-8">
              <div className="flex items-center gap-3 mb-4">
                <Code2 className="w-6 h-6 text-emerald-600" />
                <h3 className="text-xl font-bold text-on-surface">Required Skills</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {result.requiredSkills.map(skill => (
                  <span key={skill} className="px-4 py-2 bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 rounded-full font-semibold text-sm">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Nice-to-Have Skills */}
          {result.niceToHaveSkills.length > 0 && (
            <div className="glass-card rounded-3xl p-8">
              <div className="flex items-center gap-3 mb-4">
                <Code2 className="w-6 h-6 text-blue-600" />
                <h3 className="text-xl font-bold text-on-surface">Nice-to-Have Skills</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {result.niceToHaveSkills.map(skill => (
                  <span key={skill} className="px-4 py-2 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full font-semibold text-sm">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Responsibilities */}
          {result.responsibilities.length > 0 && (
            <div className="glass-card rounded-3xl p-8">
              <div className="flex items-center gap-3 mb-4">
                <Briefcase className="w-6 h-6 text-purple-600" />
                <h3 className="text-xl font-bold text-on-surface">Key Responsibilities</h3>
              </div>
              <ul className="space-y-2">
                {result.responsibilities.map((resp, i) => (
                  <li key={i} className="flex gap-3 text-slate-700 dark:text-slate-300">
                    <span className="text-purple-600 font-bold flex-shrink-0">•</span>
                    <span>{resp}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Keywords */}
          {result.keywords.length > 0 && (
            <div className="glass-card rounded-3xl p-8">
              <div className="flex items-center gap-3 mb-4">
                <Users className="w-6 h-6 text-blue-600" />
                <h3 className="text-xl font-bold text-on-surface">Key Concepts & Tools</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {result.keywords.map(keyword => (
                  <span key={keyword} className="px-3 py-1 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium">
                    {keyword}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
