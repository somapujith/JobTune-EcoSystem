import React, { useState } from 'react';
import axios from 'axios';
import './ATSCheckerV2.css';

export default function ATSCheckerV2() {
  const [resumeText, setResumeText] = useState('');
  const [jobDescriptionText, setJobDescriptionText] = useState('');
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState(null);
  const [enhancedResume, setEnhancedResume] = useState(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('input');

  // Immediate ATS check
  const handleCheck = async () => {
    if (!resumeText.trim() || !jobDescriptionText.trim()) {
      setError('Please provide both resume and job description');
      return;
    }

    setError('');
    setLoading(true);
    setResults(null);

    try {
      const response = await axios.post('/api/ats/v2/check', {
        resumeText,
        jobDescriptionText
      });

      if (response.data.status === 'success') {
        setResults(response.data.analysis);
        setActiveTab('results');

        // Start background enhancement immediately
        setAnalyzing(true);
        enhanceResumeBackground();
      }
    } catch (err) {
      setError(err.response?.data?.message || 'ATS check failed');
      console.error('ATS check error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Background enhancement (non-blocking)
  const enhanceResumeBackground = async () => {
    try {
      const response = await axios.post('/api/ats/v2/enhance', {
        resumeText,
        jobDescriptionText
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
            <div className="input-grid">
              {/* Resume Input */}
              <div className="input-group">
                <label htmlFor="resume">Your Resume</label>
                <textarea
                  id="resume"
                  placeholder="Paste your resume text here..."
                  value={resumeText}
                  onChange={(e) => setResumeText(e.target.value)}
                  rows={10}
                />
                <span className="char-count">{resumeText.length} characters</span>
              </div>

              {/* Job Description Input */}
              <div className="input-group">
                <label htmlFor="jd">Job Description</label>
                <textarea
                  id="jd"
                  placeholder="Paste the job description here..."
                  value={jobDescriptionText}
                  onChange={(e) => setJobDescriptionText(e.target.value)}
                  rows={10}
                />
                <span className="char-count">{jobDescriptionText.length} characters</span>
              </div>
            </div>

            {error && <div className="error-message">{error}</div>}

            <button
              className="btn-check"
              onClick={handleCheck}
              disabled={loading || !resumeText.trim() || !jobDescriptionText.trim()}
            >
              {loading ? (
                <>
                  <span className="spinner"></span>
                  Analyzing...
                </>
              ) : (
                'Check ATS Score'
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

            {/* Job Match & Interview Probability */}
            <div className="analysis-grid">
              {/* Job Match Card */}
              <div className="analysis-card">
                <h3>Job Match</h3>
                <div className="match-display">
                  <div className="match-circle" style={{ color: getScoreColor(results.jobMatch.overall) }}>
                    {results.jobMatch.overall}%
                  </div>
                </div>
                <p>{results.jobMatch.interpretation}</p>

                <div className="match-breakdown">
                  <div className="match-item">
                    <span>Skill Match</span>
                    <span className="match-percent">{results.jobMatch.skillMatch}%</span>
                  </div>
                  <div className="match-item">
                    <span>Responsibility Match</span>
                    <span className="match-percent">{results.jobMatch.responsibilityMatch}%</span>
                  </div>
                  <div className="match-item">
                    <span>Experience Match</span>
                    <span className="match-percent">{results.jobMatch.experienceMatch}%</span>
                  </div>
                </div>
              </div>

              {/* Interview Probability Card */}
              <div className="analysis-card">
                <h3>Interview Probability</h3>
                <div className="probability-display">
                  <div
                    className="probability-circle"
                    style={{ color: getScoreColor(results.interviewProbability.probability) }}
                  >
                    {results.interviewProbability.probability}%
                  </div>
                </div>

                <div className="recommendation-box" style={{
                  borderLeft: `4px solid ${getScoreColor(results.interviewProbability.probability)}`
                }}>
                  <h4>{results.interviewProbability.recommendation.action}</h4>
                  <p>{results.interviewProbability.recommendation.reasoning}</p>
                  <p className="next-step">
                    <strong>Next:</strong> {results.interviewProbability.recommendation.next}
                  </p>
                </div>

                <div className="timeline">
                  <span>⏱️ {results.interviewProbability.timeline.estimatedDaysToResponse} days expected response</span>
                  <span>📊 Confidence: {results.interviewProbability.timeline.confidenceLevel}</span>
                </div>
              </div>
            </div>

            {/* Keywords Section */}
            <div className="keywords-section">
              <h3>Keyword Analysis</h3>
              <div className="keywords-grid">
                <div className="keywords-group">
                  <h4>✓ Found Keywords ({results.keywords.found.length})</h4>
                  <div className="keywords-list">
                    {results.keywords.found.map((kw, i) => (
                      <span key={i} className="keyword found">{kw}</span>
                    ))}
                  </div>
                </div>

                <div className="keywords-group">
                  <h4>✗ Missing Keywords ({results.keywords.missing.length})</h4>
                  <div className="keywords-list">
                    {results.keywords.missing.map((kw, i) => (
                      <span key={i} className="keyword missing">{kw}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

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
