import React, { useState } from 'react';
import { api } from '../store/useAuthStore';
import { Copy, Download, CheckCircle, AlertCircle } from 'lucide-react';

export default function CoverLetterGenerator() {
  const [formData, setFormData] = useState({
    companyName: '',
    position: '',
    yourName: '',
    jobDescription: '',
    experience: '',
    tone: 'formal'
  });

  const [loading, setLoading] = useState(false);
  const [letter, setLetter] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleGenerate = async (e) => {
    e.preventDefault();

    if (!formData.companyName || !formData.position || !formData.yourName || !formData.jobDescription) {
      setError('Please fill in all required fields');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/jobs/generate-cover-letter', formData);
      setLetter(data.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate cover letter');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(letter.letterText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const element = document.createElement('a');
    const file = new Blob([letter.letterText], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `cover-letter-${formData.companyName.replace(/\s+/g, '-')}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const loadTestData = () => {
    setFormData({
      companyName: 'TechCorp',
      position: 'Senior Software Engineer',
      yourName: 'John Doe',
      jobDescription: `Senior Software Engineer - Full Stack

About Us
TechCorp is a fast-growing SaaS company specializing in AI-powered analytics. We're looking for talented engineers to help us scale our platform.

Key Responsibilities
- Design and develop new features using React and Node.js
- Optimize database queries and API performance
- Implement CI/CD pipelines
- Mentor junior engineers
- Troubleshoot production issues

Required Qualifications
- 5+ years of professional software development
- Strong proficiency in JavaScript/TypeScript
- React and Node.js expertise
- SQL and NoSQL database experience
- Docker and AWS knowledge
- REST API and microservices architecture experience

Nice-to-Have
- GraphQL experience
- Kubernetes knowledge
- AWS certifications
- Open source contributions

Compensation
- Salary: $130,000 - $180,000
- 100% remote
- Full benefits package
- Unlimited PTO`,
      experience: 'I have 6 years of full-stack development experience. At my current company, I led the development of a microservices architecture that improved performance by 40%. I\'m proficient in React, Node.js, TypeScript, and have extensive experience with AWS and Docker. I\'ve also mentored 3 junior developers on best practices and code quality.',
      tone: 'formal'
    });
    setLetter(null);
    setError('');
  };

  return (
    <div className="w-full max-w-5xl mx-auto py-16 px-4 sm:px-6">
      <div className="text-center mb-16">
        <div className="inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-slate-900/5 mb-6">
          <span className="material-symbols-outlined text-slate-900 text-3xl" style={{ fontVariationSettings: "'FILL' 0" }}>mail</span>
        </div>
        <h1 className="text-4xl font-black text-on-surface font-headline mb-4">
          Cover Letter Generator
        </h1>
        <p className="text-lg text-on-surface-variant font-medium max-w-2xl mx-auto">
          Generate a personalized cover letter for any job application in seconds.
        </p>
      </div>

      {/* How It Works Guide */}
      <div className="max-w-5xl mx-auto mb-12 glass-card border-emerald-200/50 rounded-3xl p-8">
        <h3 className="text-xl font-bold text-on-surface mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-emerald-600">info</span>
          How It Works
        </h3>
        <div className="space-y-3 text-slate-700 dark:text-slate-300">
          <div>
            <p className="mb-2"><strong>1. Fill in Your Details:</strong></p>
            <ul className="list-disc list-inside ml-4 space-y-1">
              <li><strong>Company Name:</strong> The company you're applying to</li>
              <li><strong>Position Title:</strong> The job title you're applying for</li>
              <li><strong>Your Name:</strong> Your full name for the signature</li>
              <li><strong>Job Description:</strong> Copy-paste the complete job posting</li>
              <li><strong>Your Background:</strong> Brief description of your relevant experience (optional but recommended)</li>
              <li><strong>Tone:</strong> Choose between Formal, Friendly, or Confident</li>
            </ul>
          </div>
          <p><strong>2. AI Generation:</strong> Our AI creates a personalized, compelling cover letter (3-4 paragraphs) tailored to the specific job and company</p>
          <p><strong>3. Use Immediately:</strong> Copy the letter to your clipboard or download it as a text file. Customize as needed and send with your application</p>
        </div>
      </div>

      {error && (
        <div className="max-w-3xl mx-auto mb-6 glass-card border-rose-200/50 p-4 rounded-2xl text-rose-600 text-sm font-medium flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Form Section */}
        <form onSubmit={handleGenerate} className="space-y-6">
          {/* Company Name */}
          <div>
            <label className="block text-sm font-bold text-on-surface mb-2">Company Name *</label>
            <input
              type="text"
              name="companyName"
              value={formData.companyName}
              onChange={handleInputChange}
              placeholder="e.g., Google, Microsoft"
              className="w-full px-4 py-2 bg-surface-container/50 border border-outline/20 rounded-xl text-on-surface placeholder:text-outline/50 focus:ring-1 focus:ring-blue-500 outline-none"
            />
          </div>

          {/* Position Title */}
          <div>
            <label className="block text-sm font-bold text-on-surface mb-2">Position Title *</label>
            <input
              type="text"
              name="position"
              value={formData.position}
              onChange={handleInputChange}
              placeholder="e.g., Senior Software Engineer"
              className="w-full px-4 py-2 bg-surface-container/50 border border-outline/20 rounded-xl text-on-surface placeholder:text-outline/50 focus:ring-1 focus:ring-blue-500 outline-none"
            />
          </div>

          {/* Your Name */}
          <div>
            <label className="block text-sm font-bold text-on-surface mb-2">Your Full Name *</label>
            <input
              type="text"
              name="yourName"
              value={formData.yourName}
              onChange={handleInputChange}
              placeholder="e.g., John Doe"
              className="w-full px-4 py-2 bg-surface-container/50 border border-outline/20 rounded-xl text-on-surface placeholder:text-outline/50 focus:ring-1 focus:ring-blue-500 outline-none"
            />
          </div>

          {/* Experience */}
          <div>
            <label className="block text-sm font-bold text-on-surface mb-2">Your Background</label>
            <textarea
              name="experience"
              value={formData.experience}
              onChange={handleInputChange}
              placeholder="Describe your relevant experience (optional)..."
              rows={4}
              className="w-full px-4 py-2 bg-surface-container/50 border border-outline/20 rounded-xl text-on-surface placeholder:text-outline/50 focus:ring-1 focus:ring-blue-500 outline-none resize-none"
            />
          </div>

          {/* Tone */}
          <div>
            <label className="block text-sm font-bold text-on-surface mb-2">Tone</label>
            <select
              name="tone"
              value={formData.tone}
              onChange={handleInputChange}
              className="w-full px-4 py-2 bg-surface-container/50 border border-outline/20 rounded-xl text-on-surface focus:ring-1 focus:ring-blue-500 outline-none"
            >
              <option value="formal">Formal & Professional</option>
              <option value="friendly">Friendly & Warm</option>
              <option value="confident">Confident & Bold</option>
            </select>
          </div>

          {/* Job Description */}
          <div>
            <label className="block text-sm font-bold text-on-surface mb-2">Job Description *</label>
            <textarea
              name="jobDescription"
              value={formData.jobDescription}
              onChange={handleInputChange}
              placeholder="Paste the job posting here..."
              rows={6}
              className="w-full px-4 py-2 bg-surface-container/50 border border-outline/20 rounded-xl text-on-surface placeholder:text-outline/50 focus:ring-1 focus:ring-blue-500 outline-none resize-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="submit"
              disabled={loading}
              className="px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 text-white rounded-xl font-bold transition-all shadow-lg flex items-center justify-center gap-3"
            >
              {loading ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>sync</span>
                  Generating...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>mail</span>
                  Generate Cover Letter
                </>
              )}
            </button>
            <button
              type="button"
              onClick={loadTestData}
              className="px-8 py-3 glass-card hover:bg-white/40 text-on-surface rounded-xl font-bold transition-all flex items-center justify-center gap-3"
            >
              <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>dataset</span>
              Load Test Data
            </button>
          </div>
        </form>

        {/* Letter Display */}
        <div className="h-full">
          {letter ? (
            <div className="glass-card rounded-3xl p-8 h-full flex flex-col">
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-200 dark:border-slate-700">
                <h3 className="text-lg font-bold text-on-surface">Generated Letter</h3>
                <div className="flex gap-2">
                  <button
                    onClick={handleCopy}
                    className="p-2 hover:bg-surface-container/50 rounded-lg transition-colors"
                    title="Copy"
                  >
                    {copied ? (
                      <CheckCircle className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <Copy className="w-5 h-5 text-slate-600" />
                    )}
                  </button>
                  <button
                    onClick={handleDownload}
                    className="p-2 hover:bg-surface-container/50 rounded-lg transition-colors"
                    title="Download"
                  >
                    <Download className="w-5 h-5 text-slate-600" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto prose dark:prose-invert prose-sm max-w-none">
                <div className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                  {letter.letterText}
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                <p className="text-xs text-slate-400">
                  Generated at {new Date(letter.generatedAt).toLocaleString()}
                </p>
              </div>
            </div>
          ) : (
            <div className="glass-card bg-surface-container/30 rounded-3xl p-8 h-full flex items-center justify-center border-2 border-dashed border-outline/20">
              <p className="text-center text-slate-500 dark:text-slate-400">
                Fill in the form and click "Generate Cover Letter" to see your personalized letter here.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
