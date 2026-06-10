/**
 * ATS Scorer - Deterministic ATS scoring
 * No AI - Pure rule-based scoring
 * Latency Target: <200ms
 */

const SkillClassifier = require('./skillClassifier');

class ATSScorer {
  static MAX_SCORE = 100;

  static SCORE_WEIGHTS = {
    keywordMatch: 0.30,      // 30 points
    skillsCoverage: 0.30,    // 30 points
    experienceAlignment: 0.20, // 20 points
    atsFormatting: 0.10,     // 10 points
    resumeQuality: 0.10      // 10 points
  };

  /**
   * Calculate ATS score
   * @param {string} resumeText - Resume content
   * @param {object} jobDescription - Parsed JD
   * @param {object} resumeAnalysis - Resume analysis (from ResumeAnalysisEngine)
   * @returns {object} ATS score breakdown
   */
  static score(resumeText, jobDescription, resumeAnalysis = {}) {
    if (!resumeText || !jobDescription) {
      return this._emptyScore();
    }

    const text = resumeText.toLowerCase();

    // Calculate individual scores
    const keywordMatchScore = this._scoreKeywordMatch(text, jobDescription);
    const skillsCoverageScore = this._scoreSkillsCoverage(text, jobDescription);
    const experienceAlignmentScore = this._scoreExperienceAlignment(text, jobDescription);
    const atsFormattingScore = this._scoreATSFormatting(resumeAnalysis);
    const resumeQualityScore = this._scoreResumeQuality(resumeAnalysis);

    // Calculate weighted total
    const totalScore = Math.round(
      keywordMatchScore * this.SCORE_WEIGHTS.keywordMatch +
      skillsCoverageScore * this.SCORE_WEIGHTS.skillsCoverage +
      experienceAlignmentScore * this.SCORE_WEIGHTS.experienceAlignment +
      atsFormattingScore * this.SCORE_WEIGHTS.atsFormatting +
      resumeQualityScore * this.SCORE_WEIGHTS.resumeQuality
    );

    return {
      status: 'success',
      totalScore: Math.min(totalScore, this.MAX_SCORE),
      maxScore: this.MAX_SCORE,
      breakdown: {
        keywordMatch: keywordMatchScore,
        skillsCoverage: skillsCoverageScore,
        experienceAlignment: experienceAlignmentScore,
        atsFormatting: atsFormattingScore,
        resumeQuality: resumeQualityScore
      },
      weights: this.SCORE_WEIGHTS,
      analysis: {
        keywordMatches: this._findKeywordMatches(text, jobDescription),
        missingSkills: this._findMissingSkills(text, jobDescription),
        foundSkills: this._findFoundSkills(text, jobDescription)
      }
    };
  }

  /**
   * Score keyword matching (30 points)
   * @private
   */
  static _scoreKeywordMatch(resumeText, jobDescription) {
    if (!jobDescription.skills || !jobDescription.skills.all) {
      return 0;
    }

    const allSkills = jobDescription.skills.all;
    let matchCount = 0;

    for (const skill of allSkills) {
      const regex = new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      if (regex.test(resumeText)) {
        matchCount++;
      }
    }

    // Calculate percentage and convert to 0-30 scale
    const matchPercentage = allSkills.length > 0 ? (matchCount / allSkills.length) * 100 : 0;
    return Math.round((matchPercentage / 100) * 30);
  }

  /**
   * Score skills coverage (30 points)
   * @private
   */
  static _scoreSkillsCoverage(resumeText, jobDescription) {
    if (!jobDescription.skills) {
      return 0;
    }

    let score = 0;
    let totalWeight = 0;

    // Critical skills (weight: 3) - up to 15 points
    for (const skill of jobDescription.skills.critical || []) {
      totalWeight += 3;
      const regex = new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      if (regex.test(resumeText)) {
        score += 3;
      }
    }

    // Important skills (weight: 2) - up to 10 points
    for (const skill of jobDescription.skills.important || []) {
      totalWeight += 2;
      const regex = new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      if (regex.test(resumeText)) {
        score += 2;
      }
    }

    // Bonus skills (weight: 1) - up to 5 points
    for (const skill of jobDescription.skills.bonus || []) {
      totalWeight += 1;
      const regex = new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      if (regex.test(resumeText)) {
        score += 1;
      }
    }

    // Normalize to 30-point scale
    const maxPossible = 30;
    return totalWeight > 0 ? Math.round((score / totalWeight) * maxPossible) : 0;
  }

  /**
   * Score experience alignment (20 points)
   * @private
   */
  static _scoreExperienceAlignment(resumeText, jobDescription) {
    let score = 0;

    // Check for years of experience match
    const yearsRange = jobDescription.seniority?.yearsRange;
    if (yearsRange) {
      // Look for year ranges in resume
      const yearRegex = /(\d+)\s*years?/gi;
      const matches = resumeText.match(yearRegex);
      if (matches && matches.length > 0) {
        score += 8; // 8 points for having years mentioned
      }
    }

    // Check for responsibility keywords
    const responsibilityKeywords = [
      'led', 'managed', 'built', 'developed', 'designed',
      'architected', 'implemented', 'deployed', 'delivered'
    ];

    let responsibilityMatches = 0;
    for (const keyword of responsibilityKeywords) {
      if (new RegExp(`\\b${keyword}\\b`, 'i').test(resumeText)) {
        responsibilityMatches++;
      }
    }

    score += Math.min((responsibilityMatches / responsibilityKeywords.length) * 8, 8);

    // Check for relevant tools/technologies
    const toolMatches = (jobDescription.skills?.all || []).filter(skill => {
      const regex = new RegExp(`\\b${skill}\\b`, 'i');
      return regex.test(resumeText);
    }).length;

    score += Math.min((toolMatches / Math.max(jobDescription.skills?.all?.length || 1, 1)) * 4, 4);

    return Math.round(Math.min(score, 20));
  }

  /**
   * Score ATS formatting (10 points)
   * @private
   */
  static _scoreATSFormatting(resumeAnalysis) {
    if (!resumeAnalysis || !resumeAnalysis.analysis) {
      return 5; // Default middle score if no analysis provided
    }

    let score = 10;

    // Deduct for ATS issues
    if (!resumeAnalysis.atsCompatible) {
      const issueCount = resumeAnalysis.analysis.formatting?.issues?.length || 0;
      score -= Math.min(issueCount * 2, 5); // Max deduction: 5
    }

    // Bonus for good formatting
    if (resumeAnalysis.analysis.formatting?.atsCompatible) {
      score = 10;
    }

    return Math.max(score, 0);
  }

  /**
   * Score resume quality (10 points)
   * @private
   */
  static _scoreResumeQuality(resumeAnalysis) {
    if (!resumeAnalysis.quality) {
      return 5;
    }

    const qualityMap = {
      'excellent': 10,
      'good': 8,
      'fair': 5,
      'poor': 2,
      'critical': 0
    };

    return qualityMap[resumeAnalysis.quality.overallQuality] || 5;
  }

  /**
   * Find keyword matches
   * @private
   */
  static _findKeywordMatches(resumeText, jobDescription) {
    const found = [];
    const notFound = [];

    for (const skill of jobDescription.skills?.all || []) {
      const regex = new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      if (regex.test(resumeText)) {
        found.push(skill);
      } else {
        notFound.push(skill);
      }
    }

    return {
      found,
      notFound,
      matchPercentage: found.length > 0 ?
        Math.round((found.length / (found.length + notFound.length)) * 100) : 0
    };
  }

  /**
   * Find missing skills
   * @private
   */
  static _findMissingSkills(resumeText, jobDescription) {
    const missing = {
      critical: [],
      important: [],
      bonus: []
    };

    for (const skill of jobDescription.skills?.critical || []) {
      const regex = new RegExp(`\\b${skill}\\b`, 'i');
      if (!regex.test(resumeText)) {
        missing.critical.push(skill);
      }
    }

    for (const skill of jobDescription.skills?.important || []) {
      const regex = new RegExp(`\\b${skill}\\b`, 'i');
      if (!regex.test(resumeText)) {
        missing.important.push(skill);
      }
    }

    for (const skill of jobDescription.skills?.bonus || []) {
      const regex = new RegExp(`\\b${skill}\\b`, 'i');
      if (!regex.test(resumeText)) {
        missing.bonus.push(skill);
      }
    }

    return missing;
  }

  /**
   * Find found skills
   * @private
   */
  static _findFoundSkills(resumeText, jobDescription) {
    const found = {
      critical: [],
      important: [],
      bonus: []
    };

    for (const skill of jobDescription.skills?.critical || []) {
      const regex = new RegExp(`\\b${skill}\\b`, 'i');
      if (regex.test(resumeText)) {
        found.critical.push(skill);
      }
    }

    for (const skill of jobDescription.skills?.important || []) {
      const regex = new RegExp(`\\b${skill}\\b`, 'i');
      if (regex.test(resumeText)) {
        found.important.push(skill);
      }
    }

    for (const skill of jobDescription.skills?.bonus || []) {
      const regex = new RegExp(`\\b${skill}\\b`, 'i');
      if (regex.test(resumeText)) {
        found.bonus.push(skill);
      }
    }

    return found;
  }

  /**
   * Empty score response
   * @private
   */
  static _emptyScore() {
    return {
      status: 'error',
      totalScore: 0,
      maxScore: this.MAX_SCORE,
      message: 'Invalid input for scoring'
    };
  }

  /**
   * Get score interpretation
   */
  static interpretScore(score) {
    if (score >= 90) return 'Excellent - Very likely to pass ATS';
    if (score >= 80) return 'Good - Likely to pass ATS';
    if (score >= 70) return 'Fair - May pass ATS';
    if (score >= 60) return 'Poor - Unlikely to pass ATS';
    return 'Critical - Will likely be filtered by ATS';
  }

  /**
   * Get score color (for UI)
   */
  static getScoreColor(score) {
    if (score >= 90) return '#10b981'; // Green
    if (score >= 80) return '#3b82f6'; // Blue
    if (score >= 70) return '#f59e0b'; // Amber
    if (score >= 60) return '#ef4444'; // Red
    return '#7f1d1d'; // Dark red
  }
}

module.exports = ATSScorer;
