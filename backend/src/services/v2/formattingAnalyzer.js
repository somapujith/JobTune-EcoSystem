/**
 * Formatting Analyzer - Detects ATS compatibility issues
 * Max Score: 15 Points
 * Latency Target: <10ms
 */

class FormattingAnalyzer {
  static MAX_SCORE = 15;

  /**
   * Analyze resume formatting
   * @param {string} resumeText - Raw resume text
   * @param {string} fileContent - Original file content
   * @returns {object} Formatting analysis
   */
  static analyze(resumeText, fileContent = null) {
    if (!resumeText || typeof resumeText !== 'string') {
      return {
        score: 0,
        maxScore: this.MAX_SCORE,
        issues: [],
        warnings: [],
        recommendations: []
      };
    }

    const issues = [];
    const warnings = [];
    let score = this.MAX_SCORE;

    // Check for problematic characters
    const charIssues = this._checkCharacters(resumeText);
    if (charIssues.length > 0) {
      issues.push(...charIssues);
      score -= charIssues.length * 1.5;
    }

    // Check date consistency
    const dateIssues = this._checkDates(resumeText);
    if (dateIssues.length > 0) {
      issues.push(...dateIssues);
      score -= dateIssues.length;
    }

    // Check for tables and columns
    const tableIssues = this._checkForTables(resumeText);
    if (tableIssues.length > 0) {
      warnings.push(...tableIssues);
      score -= tableIssues.length * 2;
    }

    // Check for complex formatting
    const formatIssues = this._checkComplexFormatting(resumeText);
    if (formatIssues.length > 0) {
      warnings.push(...formatIssues);
      score -= formatIssues.length;
    }

    // Check line length
    const lineIssues = this._checkLineLengths(resumeText);
    if (lineIssues.length > 0) {
      warnings.push(...lineIssues);
    }

    // Check for proper spacing
    const spacingIssues = this._checkSpacing(resumeText);
    if (spacingIssues.length > 0) {
      warnings.push(...spacingIssues);
    }

    const recommendations = this._getRecommendations(issues, warnings);

    return {
      score: Math.max(0, Math.min(score, this.MAX_SCORE)),
      maxScore: this.MAX_SCORE,
      percentage: Math.max(0, (score / this.MAX_SCORE) * 100),
      issues,
      warnings,
      recommendations,
      atsCompatible: issues.length === 0,
      quality: this._assessQuality(issues.length, warnings.length)
    };
  }

  /**
   * Check for problematic characters for ATS
   * @private
   */
  static _checkCharacters(text) {
    const issues = [];

    // Check for special characters that ATS systems struggle with
    const problematicChars = [
      { char: '•', name: 'Bullet points', replacement: '-' },
      { char: '○', name: 'Circle bullets', replacement: '-' },
      { char: '★', name: 'Stars', replacement: '*' },
      { char: '→', name: 'Arrows', replacement: '->' },
      { char: '|', name: 'Pipes', replacement: '-' },
      { char: '–', name: 'En dashes', replacement: '-' },
      { char: '—', name: 'Em dashes', replacement: '-' }
    ];

    for (const { char, name, replacement } of problematicChars) {
      if (text.includes(char)) {
        issues.push({
          type: 'character',
          severity: 'high',
          character: name,
          message: `Replace ${name} (${char}) with ${replacement} for ATS compatibility`,
          count: (text.match(new RegExp(char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
        });
      }
    }

    return issues;
  }

  /**
   * Check date consistency
   * @private
   */
  static _checkDates(text) {
    const issues = [];
    const datePatterns = {
      mmddyyyy: /\d{1,2}\/\d{1,2}\/\d{4}/g,
      mmyyyy: /\d{1,2}\/\d{4}/g,
      mmmyyyy: /[A-Za-z]{3,9}\s+\d{4}/g,
      yyyymmdd: /\d{4}-\d{1,2}-\d{1,2}/g
    };

    const usedFormats = [];
    for (const [format, pattern] of Object.entries(datePatterns)) {
      if (pattern.test(text)) {
        usedFormats.push(format);
      }
    }

    // Check for inconsistent date formats
    if (usedFormats.length > 1) {
      issues.push({
        type: 'date',
        severity: 'medium',
        message: `Use consistent date format. Found: ${usedFormats.join(', ')}`,
        recommendation: 'Use MM/YYYY or Month YYYY consistently'
      });
    }

    // Check for "Present" vs "Current"
    const presentCount = (text.match(/\bpresent\b/gi) || []).length;
    const currentCount = (text.match(/\bcurrent\b/gi) || []).length;

    if (presentCount > 0 && currentCount > 0) {
      issues.push({
        type: 'date',
        severity: 'low',
        message: 'Use either "Present" or "Current" consistently for ongoing positions'
      });
    }

    return issues;
  }

  /**
   * Check for tables (ATS unfriendly)
   * @private
   */
  static _checkForTables(text) {
    const issues = [];

    // Check for table indicators
    const hasComplexFormatting = /\||\+\-+\+|\s{2,}(?=\S)/.test(text);

    if (hasComplexFormatting) {
      issues.push({
        type: 'formatting',
        severity: 'high',
        message: 'Avoid tables and complex column layouts - use simple text lists instead',
        recommendation: 'Convert tables to bullet-point format'
      });
    }

    return issues;
  }

  /**
   * Check for complex formatting
   * @private
   */
  static _checkComplexFormatting(text) {
    const issues = [];

    // Check for multiple spaces (often indicates columns)
    if (/\s{3,}/.test(text)) {
      issues.push({
        type: 'spacing',
        severity: 'medium',
        message: 'Multiple spaces detected - may indicate column alignment. Use simple spacing instead.'
      });
    }

    return issues;
  }

  /**
   * Check line lengths
   * @private
   */
  static _checkLineLengths(text) {
    const issues = [];
    const lines = text.split('\n');
    const veryLongLines = lines.filter(l => l.length > 120);

    if (veryLongLines.length > 0) {
      issues.push({
        type: 'line-length',
        severity: 'low',
        message: `${veryLongLines.length} lines exceed 120 characters - consider wrapping`,
        count: veryLongLines.length
      });
    }

    return issues;
  }

  /**
   * Check spacing and structure
   * @private
   */
  static _checkSpacing(text) {
    const issues = [];

    // Check for inconsistent spacing between sections
    const singleLineBreaks = (text.match(/[^\n]\n[^\n]/g) || []).length;
    const doubleLineBreaks = (text.match(/\n\n/g) || []).length;

    if (singleLineBreaks > doubleLineBreaks * 2) {
      issues.push({
        type: 'spacing',
        severity: 'low',
        message: 'Use consistent spacing - double line breaks between sections for readability'
      });
    }

    return issues;
  }

  /**
   * Assess overall quality
   * @private
   */
  static _assessQuality(issueCount, warningCount) {
    if (issueCount > 2) return 'poor';
    if (issueCount > 0) return 'fair';
    if (warningCount > 2) return 'fair';
    if (warningCount > 0) return 'good';
    return 'excellent';
  }

  /**
   * Get recommendations
   * @private
   */
  static _getRecommendations(issues, warnings) {
    const recommendations = [];

    if (issues.length > 0) {
      recommendations.push({
        priority: 'high',
        message: 'Fix formatting issues for ATS compatibility'
      });
    }

    if (warnings.length > 0) {
      recommendations.push({
        priority: 'medium',
        message: 'Address formatting warnings for better readability'
      });
    }

    return recommendations;
  }
}

module.exports = FormattingAnalyzer;
