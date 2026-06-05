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

      {error && (
        <div className="max-w-3xl mx-auto mb-6 bg-rose-50 border border-rose-100 p-4 rounded-2xl text-rose-600 text-sm font-medium flex items-center gap-3">
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
              className="w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-on-surface dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 outline-none"
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
              className="w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-on-surface dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 outline-none"
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
              className="w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-on-surface dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 outline-none"
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
              className="w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-on-surface dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
            />
          </div>

          {/* Tone */}
          <div>
            <label className="block text-sm font-bold text-on-surface mb-2">Tone</label>
            <select
              name="tone"
              value={formData.tone}
              onChange={handleInputChange}
              className="w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-on-surface dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
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
              className="w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-on-surface dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-8 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold transition-colors flex items-center justify-center gap-3"
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
        </form>

        {/* Letter Display */}
        <div className="h-full">
          {letter ? (
            <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 border border-slate-100 dark:border-slate-700 h-full flex flex-col">
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-200 dark:border-slate-700">
                <h3 className="text-lg font-bold text-on-surface">Generated Letter</h3>
                <div className="flex gap-2">
                  <button
                    onClick={handleCopy}
                    className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
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
                    className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
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
            <div className="bg-slate-50 dark:bg-slate-700 rounded-3xl p-8 h-full flex items-center justify-center border-2 border-dashed border-slate-200 dark:border-slate-600">
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
