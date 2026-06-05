import React, { useState, useRef } from 'react';
import { api } from '../store/useAuthStore';
import { CheckCircle2, AlertCircle, TrendingUp, Upload, X } from 'lucide-react';

export default function ATSChecker() {
  const [resumeFile, setResumeFile] = useState(null);
  const [jobDescription, setJobDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(file.type)) {
      setError('Only PDF and DOCX files are supported');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('File size must be less than 5MB');
      return;
    }

    setResumeFile(file);
    setError('');
  };

  const handleCheck = async (e) => {
    e.preventDefault();
    if (!resumeFile) {
      setError('Please upload your resume');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('resume', resumeFile);

      const { data } = await api.post('/jobs/check-ats-score', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setResult(data.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to check ATS score');
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (score) => {
    if (score >= 80) return 'text-emerald-600';
    if (score >= 60) return 'text-blue-600';
    if (score >= 40) return 'text-amber-600';
    return 'text-rose-600';
  };

  const getScoreBg = (score) => {
    if (score >= 80) return 'bg-emerald-50';
    if (score >= 60) return 'bg-blue-50';
    if (score >= 40) return 'bg-amber-50';
    return 'bg-rose-50';
  };

  const loadTestData = () => {
    // Create a test resume file
    const testResumeText = `PUJITH KRISHNA SOMA
Email: somapujith@gmail.com | Phone: +91 7993429539 | LinkedIn: linkedin.com/in/pujith | GitHub: github.com/somapujith

PROFESSIONAL SUMMARY
B.Tech 2nd-year student with strong skills in coding and modern web development. Built multiple projects using React, JavaScript, and other advanced frontend tools. Proficient in Python, UI/UX design, and problem-solving. Quick learner motivated to gain real-world experience through internships and technical projects.

TECHNICAL SKILLS
Languages: JavaScript, Python, Java, C++
Frontend: React, HTML5, CSS3, Tailwind
Backend: Node.js, Express, MongoDB
Database: PostgreSQL, SQL
DevOps: Git, GitHub, Docker
Tools: VS Code, Figma, Photoshop

EXPERIENCE
Web Developer Intern | TechStartup (Jun 2024 - Present)
- Developed React components for e-commerce platform
- Built responsive UI with Tailwind CSS
- Integrated backend APIs using Axios
- Collaborated with team using Git version control

Freelance Developer | Self-employed (Jan 2024 - Present)
- Created 3 full-stack web applications
- Managed projects from design to deployment
- Optimized performance and UX

EDUCATION
B.Tech in Computer Science | University (2024-2028) CGPA: 8.9
Intermediate | Excellencia Junior College (2024) - 77%
CBSE 10th | Vikas The Concept School (2022) - 81%

PROJECTS
JobTube Eco System - Full stack platform with React, Node.js, MongoDB
Resume Optimizer - AI-powered resume enhancement tool
Portfolio Website - Personal portfolio with responsive design

CERTIFICATIONS
Google Cloud Associate Cloud Engineer (2024)

ADDITIONAL SKILLS
UI/UX Design, Figma, Photoshop, Video Editing, Project Management`;

    const blob = new Blob([testResumeText], { type: 'application/pdf' });
    const testFile = new File([blob], 'test_resume.pdf', { type: 'application/pdf' });

    setResumeFile(testFile);
    setError('');
    setResult(null);
  };

  return (
    <div className="w-full max-w-5xl mx-auto py-16 px-4 sm:px-6">
      <div className="text-center mb-16">
        <div className="inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-slate-900/5 mb-6">
          <span className="material-symbols-outlined text-slate-900 text-3xl" style={{ fontVariationSettings: "'FILL' 0" }}>check_circle</span>
        </div>
        <h1 className="text-4xl font-black text-on-surface font-headline mb-4">
          ATS Score Checker
        </h1>
        <p className="text-lg text-on-surface-variant font-medium max-w-2xl mx-auto">
          Upload your resume and get an instant AI-powered analysis of your ATS optimization. Identify issues and get actionable improvements.
        </p>
      </div>

      {/* How It Works Guide */}
      <div className="max-w-3xl mx-auto mb-12 glass-card border-blue-200/50 dark:border-blue-800/50 rounded-3xl p-8">
        <h3 className="text-xl font-bold text-on-surface mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-blue-600">info</span>
          How It Works
        </h3>
        <div className="space-y-3 text-slate-700 dark:text-slate-300">
          <p><strong>1. Upload Your Resume:</strong> Click the upload area and select your PDF or DOCX resume file (max 5MB)</p>
          <p><strong>2. Click "Check ATS Score":</strong> Our AI instantly analyzes your resume for ATS optimization</p>
          <div>
            <p className="mb-2"><strong>3. Get Detailed Analysis:</strong> Receive scores across 5 key areas:</p>
            <ul className="list-disc list-inside ml-4 space-y-1">
              <li><strong>Formatting (25%):</strong> ATS-friendly layout, no tables/images/columns</li>
              <li><strong>Structure (25%):</strong> Clear sections and proper organization</li>
              <li><strong>Keywords (30%):</strong> Keyword density and optimization</li>
              <li><strong>Length (10%):</strong> Optimal resume length (1-2 pages)</li>
              <li><strong>Clarity (10%):</strong> Clear writing and readability</li>
            </ul>
          </div>
          <p><strong>4. Review Feedback:</strong> See strengths, get actionable improvements, and identify any ATS-blocking issues</p>
        </div>
      </div>

      {error && (
        <div className="max-w-3xl mx-auto mb-6 glass-card border-rose-200/50 p-4 rounded-2xl text-rose-600 text-sm font-medium flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={handleCheck} className="max-w-2xl mx-auto mb-12">
        <div className="glass-card rounded-3xl p-8">
          {/* Resume Section - File Upload */}
          <div>
            <label className="block text-sm font-bold text-on-surface mb-3">Upload Your Resume</label>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-16 text-center cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              {resumeFile ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className="material-symbols-outlined text-blue-600 text-5xl">description</span>
                    <div className="text-left">
                      <p className="font-semibold text-on-surface text-lg">{resumeFile.name}</p>
                      <p className="text-sm text-slate-400">{(resumeFile.size / 1024).toFixed(2)} KB</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setResumeFile(null);
                    }}
                    className="p-2 hover:bg-red-100 dark:hover:bg-red-900 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5 text-red-600" />
                  </button>
                </div>
              ) : (
                <div>
                  <Upload className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                  <p className="text-lg font-semibold text-on-surface">Click to upload resume</p>
                  <p className="text-sm text-slate-400 mt-2">PDF or DOCX, max 5MB</p>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>
        </div>

        <div className="max-w-3xl mx-auto mt-6 flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="submit"
            disabled={loading}
            className="px-8 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold transition-colors flex items-center justify-center gap-3"
          >
            {loading ? (
              <>
                <span className="material-symbols-outlined animate-spin text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>sync</span>
                Checking...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>check_circle</span>
                Check ATS Score
              </>
            )}
          </button>
          <button
            type="button"
            onClick={loadTestData}
            className="px-8 py-3 bg-slate-400 hover:bg-slate-500 text-white rounded-xl font-bold transition-colors flex items-center justify-center gap-3"
          >
            <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>dataset</span>
            Load Test Data
          </button>
        </div>
      </form>

      {/* Results */}
      {result && !loading && (
        <div className="max-w-3xl mx-auto space-y-8">
          {/* Score Card */}
          <div className={`glass-card rounded-3xl p-8 text-center`}>
            <div className="flex items-center justify-center gap-4 mb-6">
              <div className="text-6xl font-black" style={{ color: result.atsScore >= 80 ? '#10b981' : result.atsScore >= 60 ? '#0ea5e9' : result.atsScore >= 40 ? '#f59e0b' : '#ef4444' }}>
                {result.atsScore}
              </div>
              <div className="text-left">
                <p className="text-xs font-bold text-slate-500 uppercase">ATS Score</p>
                <p className={`text-2xl font-black ${getScoreColor(result.atsScore)}`}>
                  {result.scoreLabel}
                </p>
              </div>
            </div>

            {/* Section Scores */}
            {result.sections && (
              <div className="grid grid-cols-2 gap-3 mt-6">
                {Object.entries(result.sections).map(([key, section]) => (
                  <div key={key} className="glass-card rounded-2xl p-4">
                    <p className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-2 capitalize">{section.feedback}</p>
                    <div className="flex items-end gap-2">
                      <p className="text-3xl font-black text-on-surface">{section.score}</p>
                      <p className="text-xs text-slate-500 mb-1">%</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ATS Issues */}
          {result.atsIssues && result.atsIssues.length > 0 && (
            <div className="glass-card rounded-3xl p-8 border border-red-200/50 dark:border-red-900/50">
              <div className="flex items-center gap-3 mb-4">
                <AlertCircle className="w-6 h-6 text-red-600" />
                <h3 className="text-xl font-bold text-red-600">ATS-Blocking Issues ({result.atsIssues.length})</h3>
              </div>
              <ul className="space-y-2">
                {result.atsIssues.map((issue, i) => (
                  <li key={i} className="flex gap-3 text-slate-700 dark:text-slate-300">
                    <span className="text-red-600 flex-shrink-0">⚠</span>
                    <span>{issue}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* AI Strengths */}
          {result.strengths && result.strengths.length > 0 && (
            <div className="glass-card rounded-3xl p-8 border border-cyan-200/50 dark:border-cyan-900/50">
              <div className="flex items-center gap-3 mb-4">
                <span className="material-symbols-outlined text-cyan-600 text-xl">star</span>
                <h3 className="text-xl font-bold text-cyan-600">Your Strengths (AI Analysis)</h3>
              </div>
              <ul className="space-y-2">
                {result.strengths.map((strength, i) => (
                  <li key={i} className="flex gap-3 text-slate-700 dark:text-slate-300">
                    <span className="text-cyan-600 flex-shrink-0">→</span>
                    <span>{strength}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Improvements */}
          {result.improvements && result.improvements.length > 0 && (
            <div className="glass-card rounded-3xl p-8 border border-blue-200/50 dark:border-blue-900/50">
              <div className="flex items-center gap-3 mb-4">
                <span className="material-symbols-outlined text-blue-600 text-xl">lightbulb</span>
                <h3 className="text-xl font-bold text-blue-600">How to Improve</h3>
              </div>
              <ul className="space-y-2">
                {result.improvements.map((improvement, i) => (
                  <li key={i} className="flex gap-3 text-slate-700 dark:text-slate-300">
                    <span className="text-blue-600 flex-shrink-0">{i + 1}.</span>
                    <span>{improvement}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recommendations */}
          {result.recommendations && result.recommendations.length > 0 && (
            <div className="glass-card rounded-3xl p-8 border border-amber-200/50 dark:border-amber-900/50">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <TrendingUp className="w-6 h-6 text-amber-600" />
                  <h3 className="text-xl font-bold text-amber-600">Recommendations</h3>
                </div>
                {result.aiPowered && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded-full text-xs font-bold">
                    <span className="material-symbols-outlined text-purple-600 text-sm">stars</span>
                    AI-Powered
                  </span>
                )}
              </div>
              <ul className="space-y-3">
                {result.recommendations.map((rec, i) => (
                  <li key={i} className="flex gap-3 text-slate-700 dark:text-slate-300">
                    <span className="text-amber-600 font-bold flex-shrink-0">{i + 1}.</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
