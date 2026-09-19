/**
 * Action Verb Analyzer - Detects strong resume action verbs
 * Max Score: 15 Points
 * Latency Target: <5ms
 */

class ActionVerbAnalyzer {
  static MAX_SCORE = 15;

  // Strong action verbs for resumes
  static STRONG_VERBS = [
    'led', 'built', 'developed', 'optimized', 'managed',
    'created', 'achieved', 'designed', 'implemented', 'architected',
    'engineered', 'increased', 'improved', 'accelerated', 'enhanced',
    'transformed', 'deployed', 'launched', 'established', 'pioneered',
    'spearheaded', 'drove', 'executed', 'delivered', 'orchestrated',
    'consolidated', 'streamlined', 'automated', 'scaled', 'expanded',
    'generated', 'reduced', 'minimized', 'eliminated', 'recovered',
    'resolved', 'solved', 'prevented', 'identified', 'discovered',
    'maintained', 'contributed', 'supported', 'trained', 'mentored',
    'innovated', 'pioneered', 'influenced', 'facilitated', 'coordinated'
  ];

  // Weak verbs to avoid
  static WEAK_VERBS = [
    'was', 'were', 'is', 'am', 'be', 'been',
    'helped', 'worked', 'did', 'made', 'used',
    'involved', 'responsible', 'attempted', 'tried'
  ];

  /**
   * Analyze resume for action verbs
   * @param {string} resumeText - Raw resume text
   * @returns {object} Action verb analysis
   */
  static analyze(resumeText) {
    if (!resumeText || typeof resumeText !== 'string') {
      return {
        score: 0,
        maxScore: this.MAX_SCORE,
        strongVerbCount: 0,
        weakVerbCount: 0,
        strongVerbs: [],
        weakVerbs: []
      };
    }

    const text = resumeText.toLowerCase();

    const strongVerbs = this._findVerbs(text, this.STRONG_VERBS);
    const weakVerbs = this._findVerbs(text, this.WEAK_VERBS);

    const score = this._calculateScore(strongVerbs.length, weakVerbs.length);

    return {
      score: Math.min(score, this.MAX_SCORE),
      maxScore: this.MAX_SCORE,
      percentage: (score / this.MAX_SCORE) * 100,
      strongVerbCount: strongVerbs.length,
      weakVerbCount: weakVerbs.length,
      strongVerbs: [...new Set(strongVerbs)], // Unique verbs
      weakVerbs: [...new Set(weakVerbs)],
      ratio: strongVerbs.length > 0 ? (strongVerbs.length / (strongVerbs.length + weakVerbs.length)) : 0,
      quality: this._assessQuality(strongVerbs.length),
      recommendations: this._getRecommendations(strongVerbs.length, weakVerbs.length)
    };
  }

  /**
   * Find verbs in text
   * @private
   */
  static _findVerbs(text, verbList) {
    const found = [];

    for (const verb of verbList) {
      // Match verb at start of bullet point or after common prefixes
      const regex = new RegExp(`(^|\\n|•|\\-|\\*|\\s)${verb}(\\s|ed|s|ing|d)?`, 'gim');
      let match;

      while ((match = regex.exec(text)) !== null) {
        found.push(verb);
      }
    }

    return found;
  }

  /**
   * Calculate score
   * @private
   */
  static _calculateScore(strongCount, weakCount) {
    if (strongCount === 0) return 0;

    // Base score from strong verb count
    let score = Math.min(strongCount * 1.5, this.MAX_SCORE);

    // Penalty for weak verbs
    if (weakCount > 0) {
      score -= weakCount * 0.5;
    }

    return Math.max(0, Math.min(score, this.MAX_SCORE));
  }

  /**
   * Assess quality
   * @private
   */
  static _assessQuality(strongCount) {
    if (strongCount >= 15) return 'excellent';
    if (strongCount >= 10) return 'good';
    if (strongCount >= 5) return 'fair';
    if (strongCount > 0) return 'poor';
    return 'critical';
  }

  /**
   * Get recommendations
   * @private
   */
  static _getRecommendations(strongCount, weakCount) {
    const recommendations = [];

    if (strongCount === 0) {
      recommendations.push({
        severity: 'critical',
        message: 'Use strong action verbs to start bullet points. Examples: Led, Built, Developed, Optimized'
      });
    } else if (strongCount < 5) {
      recommendations.push({
        severity: 'high',
        message: 'Increase strong action verbs. Found ' + strongCount + ', aim for 10+'
      });
    }

    if (weakCount > 3) {
      recommendations.push({
        severity: 'high',
        message: `Replace weak verbs like "was", "helped", "worked" with stronger alternatives`
      });
    }

    return recommendations;
  }

  /**
   * Get suggested replacements for weak verbs
   */
  static getSuggestions(weakVerb) {
    const suggestions = {
      'was': ['Led', 'Built', 'Developed', 'Managed'],
      'helped': ['Accelerated', 'Facilitated', 'Engineered', 'Supported'],
      'worked': ['Architected', 'Designed', 'Implemented', 'Executed'],
      'made': ['Created', 'Developed', 'Engineered', 'Built'],
      'used': ['Leveraged', 'Utilized', 'Implemented', 'Applied'],
      'did': ['Delivered', 'Executed', 'Accomplished', 'Completed'],
      'involved': ['Spearheaded', 'Led', 'Orchestrated', 'Coordinated']
    };

    return suggestions[weakVerb.toLowerCase()] || ['Replace with a strong action verb'];
  }
}

module.exports = ActionVerbAnalyzer;
