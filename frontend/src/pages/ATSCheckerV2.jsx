import React, { useState } from 'react';
import axios from 'axios';
import './ATSCheckerV2.css';

export default function ATSCheckerV2() {
  const [resumeFile, setResumeFile] = useState(null);
  const [resumeFileName, setResumeFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState(null);
  const [enhancedResume, setEnhancedResume] = useState(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('input');

  // Handle resume file upload
  const handleResumeUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
    if (!allowed.includes(file.type)) {
      setError('Only PDF, DOCX, and TXT files allowed');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('File too large (max 5MB)');
      return;
    }

    setResumeFile(file);
    setResumeFileName(file.name);
    setError('');
  };

  // Immediate resume analysis
  const handleCheck = async () => {
    if (!resumeFile) {
      setError('Please upload a resume');
      return;
    }

    setError('');
    setLoading(true);
    setResults(null);

    try {
      // Step 1: Parse resume file on backend
      const formData = new FormData();
      formData.append('resume', resumeFile);

      const parseResponse = await axios.post('/api/ats/v2/parse', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (!parseResponse.data.resumeText) {
        throw new Error('Failed to parse resume');
      }

      const resumeText = parseResponse.data.resumeText;

      // Step 2: Analyze resume (general ATS quality)
      const response = await axios.post('/api/resume/v2/analyze', {
        resumeText
      });

      if (response.data.status === 'success') {
        setResults(response.data);
        setActiveTab('results');

        // Start background enhancement immediately
        setAnalyzing(true);
        enhanceResumeBackground(resumeText);
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Analysis failed');
      console.error('Analysis error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Background enhancement (non-blocking)
  const enhanceResumeBackground = async (resumeText) => {
    try {
      const response = await axios.post('/api/resume/v2/optimize', {
        resumeText
      });

      if (response.data.status === 'success') {
        setEnhancedResume(response.data);
      }
    } catch (err) {
      console.error('Enhancement error:', err);
    } finally {
      setAnalyzing(false);
    }
  };

  // Get score color
  const getScoreColor = (score) => {
    if (score >= 90) return '#10b981'; // Green
    if (score >= 80) return '#3b82f6'; // Blue
    if (score >= 70) return '#f59e0b'; // Amber
    if (score >= 60) return '#ef4444'; // Red
    return '#7f1d1d'; // Dark red
  };

  // Get score interpretation
  const getScoreInterpretation = (score) => {
    if (score >= 90) return 'Excellent - Very likely to pass ATS';
    if (score >= 80) return 'Good - Likely to pass ATS';
    if (score >= 70) return 'Fair - May pass ATS';
    if (score >= 60) return 'Poor - Unlikely to pass ATS';
    return 'Critical - Will likely be filtered';
  };

  return (
    <div className="ats-checker-v2">
      <div className="ats-container">
        <div className="ats-header">
          <h1>ATS Checker V2</h1>
          <p>Analyze your resume against job descriptions for ATS compatibility</p>
        </div>

        {/* Tabs */}
        <div className="ats-tabs">
          <button
            className={`tab ${activeTab === 'input' ? 'active' : ''}`}
            onClick={() => setActiveTab('input')}
          >
            Input
          </button>
          <button
            className={`tab ${activeTab === 'results' ? 'active' : ''}`}
            onClick={() => setActiveTab('results')}
            disabled={!results}
          >
            Results
          </button>
          <button
            className={`tab ${activeTab === 'enhanced' ? 'active' : ''}`}
            onClick={() => setActiveTab('enhanced')}
            disabled={!enhancedResume}
          >
            Enhanced {enhancedResume && <span className="badge">Ready</span>}
          </button>
        </div>

        {/* INPUT TAB */}
        {activeTab === 'input' && (
          <div className="ats-input-section">
            <div className="input-single">
              {/* Resume File Upload */}
              <div className="input-group">
                <label htmlFor="resume">Upload Your Resume</label>
                <div className="file-upload-box">
                  <input
                    id="resume"
                    type="file"
                    accept=".pdf,.docx,.txt"
                    onChange={handleResumeUpload}
                    style={{ display: 'none' }}
                  />
                  <label htmlFor="resume" className="file-upload-label">
                    {resumeFileName ? (
                      <>
                        <span className="file-icon">📄</span>
                        <span className="file-name">{resumeFileName}</span>
                        <span className="file-info">Click to change file</span>
                      </>
                    ) : (
                      <>
                        <span className="upload-icon">📤</span>
                        <span className="upload-text">Click to upload or drag & drop</span>
                        <span className="upload-info">PDF, DOCX, or TXT (max 5MB)</span>
                      </>
                    )}
                  </label>
                </div>
              </div>
            </div>

            {error && <div className="error-message">{error}</div>}

            <button
              className="btn-check"
              onClick={handleCheck}
              disabled={loading || !resumeFile}
            >
              {loading ? (
                <>
                  <span className="spinner"></span>
                  Analyzing Resume...
                </>
              ) : (
                'Analyze Resume'
              )}
            </button>
          </div>
        )}

        {/* RESULTS TAB */}
        {activeTab === 'results' && results && (
          <div className="ats-results-section">
            {/* Main Score Display */}
            <div className="score-card">
              <div className="score-circle">
                <svg viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    fill="none"
                    stroke="#e5e7eb"
                    strokeWidth="8"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    fill="none"
                    stroke={getScoreColor(results.atsScore.score)}
                    strokeWidth="8"
                    strokeDasharray={`${(results.atsScore.score / 100) * 282.7} 282.7`}
                    style={{ transition: 'stroke-dasharray 0.6s ease' }}
                  />
                </svg>
                <div className="score-text">
                  <span className="score-number">{results.atsScore.score}</span>
                  <span className="score-max">/100</span>
                </div>
              </div>

              <div className="score-info">
                <h3>ATS Compatibility Score</h3>
                <p className="interpretation">
                  {getScoreInterpretation(results.atsScore.score)}
                </p>

                {/* Breakdown */}
                <div className="score-breakdown">
                  <div className="breakdown-item">
                    <span>Keyword Match</span>
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{ width: `${(results.atsScore.breakdown.keywordMatch / 30) * 100}%` }}
                      ></div>
                    </div>
                    <span className="score-value">{results.atsScore.breakdown.keywordMatch}/30</span>
                  </div>

                  <div className="breakdown-item">
                    <span>Skills Coverage</span>
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{ width: `${(results.atsScore.breakdown.skillsCoverage / 30) * 100}%` }}
                      ></div>
                    </div>
                    <span className="score-value">{results.atsScore.breakdown.skillsCoverage}/30</span>
                  </div>

                  <div className="breakdown-item">
                    <span>Experience Alignment</span>
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{ width: `${(results.atsScore.breakdown.experienceAlignment / 20) * 100}%` }}
                      ></div>
                    </div>
                    <span className="score-value">{results.atsScore.breakdown.experienceAlignment}/20</span>
                  </div>

                  <div className="breakdown-item">
                    <span>ATS Formatting</span>
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{ width: `${(results.atsScore.breakdown.atsFormatting / 10) * 100}%` }}
                      ></div>
                    </div>
                    <span className="score-value">{results.atsScore.breakdown.atsFormatting}/10</span>
                  </div>

                  <div className="breakdown-item">
                    <span>Resume Quality</span>
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{ width: `${(results.atsScore.breakdown.resumeQuality / 10) * 100}%` }}
                      ></div>
                    </div>
                    <span className="score-value">{results.atsScore.breakdown.resumeQuality}/10</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Resume Quality Summary */}
            {results.analysis?.quality && (
              <div className="analysis-grid">
                <div className="analysis-card">
                  <h3>Resume Quality</h3>
                  <div className="match-display">
                    <div className="match-circle" style={{ color: getScoreColor(results.analysis.quality.overallScore * 10) }}>
                      {Math.round(results.analysis.quality.overallScore * 10)}/10
                    </div>
                  </div>
                  <p><strong>{results.analysis.quality.overallQuality}</strong> - This resume demonstrates {results.analysis.quality.overallQuality.toLowerCase()} ATS compatibility</p>
                </div>
              </div>
            )}

            {/* Resume Strengths & Gaps */}
            {results.analysis && (
              <div className="keywords-section">
                <h3>Resume Analysis</h3>
                {results.analysis.keyStrengths && results.analysis.keyStrengths.length > 0 && (
                  <div className="keywords-group">
                    <h4>✓ Strengths</h4>
                    <ul style={{ marginLeft: '20px', color: '#6b7280' }}>
                      {results.analysis.keyStrengths.map((strength, i) => (
                        <li key={i}>{strength}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {results.analysis.keyWeaknesses && results.analysis.keyWeaknesses.length > 0 && (
                  <div className="keywords-group">
                    <h4>⚠️ Areas to Improve</h4>
                    <ul style={{ marginLeft: '20px', color: '#6b7280' }}>
                      {results.analysis.keyWeaknesses.map((weakness, i) => (
                        <li key={i}>{weakness}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* AI Enhancement Status */}
            <div className="enhancement-status">
              {analyzing && (
                <div className="optimizing-banner">
                  <div className="spinner"></div>
                  <span>🤖 AI is analyzing your resume... Optimizing for this job...</span>
                </div>
              )}
              {enhancedResume && (
                <div className="enhanced-ready-banner">
                  <span>✅ Enhanced resume ready! Check the "Enhanced" tab for improvements</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ENHANCED TAB */}
        {activeTab === 'enhanced' && enhancedResume && (
          <div className="ats-enhanced-section">
            <div className="enhancement-comparison">
              <h3>Improvement Summary</h3>
              <div className="comparison-grid">
                <div className="comparison-item">
                  <span className="label">ATS Score</span>
                  <div className="before-after">
                    <span className="before">{enhancedResume.comparison.before.atsScore}</span>
                    <span className="arrow">→</span>
                    <span className="after">{enhancedResume.comparison.after.atsScore}</span>
                  </div>
                  <span className="gain">+{enhancedResume.comparison.improvement.atsScoreGain} points</span>
                </div>

                <div className="comparison-item">
                  <span className="label">Interview Probability</span>
                  <div className="before-after">
                    <span className="before">{enhancedResume.comparison.before.interviewProbability}%</span>
                    <span className="arrow">→</span>
                    <span className="after">{enhancedResume.comparison.after.interviewProbability}%</span>
                  </div>
                  <span className="gain">+{enhancedResume.comparison.improvement.probabilityGain}%</span>
                </div>
              </div>
            </div>

            <div className="enhancement-details">
              <h3>What Was Enhanced</h3>
              <ul className="enhancement-notes">
                {enhancedResume.enhancement.notes.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </div>

            <div className="enhanced-resume-box">
              <h3>Enhanced Resume</h3>
              <div className="enhanced-content">
                <pre>{enhancedResume.enhancement.enhancedResume}</pre>
              </div>
              <button
                className="btn-copy"
                onClick={() => {
                  navigator.clipboard.writeText(enhancedResume.enhancement.enhancedResume);
                  alert('Enhanced resume copied to clipboard!');
                }}
              >
                📋 Copy Enhanced Resume
              </button>
            </div>

            <div className="next-steps">
              <h3>Next Steps</h3>
              <ol>
                <li>Copy the enhanced resume above</li>
                <li>Apply to the job with the optimized version</li>
                <li>Use the original for other jobs to maintain authenticity</li>
              </ol>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
