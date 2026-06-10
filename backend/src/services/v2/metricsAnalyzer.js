/**
 * Metrics Analyzer - Detects quantifiable achievements
 * Max Score: 15 Points
 * Latency Target: <5ms
 */

class MetricsAnalyzer {
  static MAX_SCORE = 15;

  // Scoring thresholds
  static THRESHOLDS = {
    excellent: 8, // 8+ metrics
    good: 5,      // 5-7 metrics
    fair: 2,      // 2-4 metrics
    poor: 0       // 0-1 metrics
  };

  /**
   * Analyze resume for metrics
   * @param {string} resumeText - Raw resume text
   * @returns {object} Metrics analysis
   */
  static analyze(resumeText) {
    if (!resumeText || typeof resumeText !== 'string') {
      return {
        score: 0,
        maxScore: this.MAX_SCORE,
        metrics: [],
        count: 0,
        quality: 'poor'
      };
    }

    const metrics = this._extractMetrics(resumeText);
    const score = this._calculateScore(metrics.length);

    return {
      score: Math.min(score, this.MAX_SCORE),
      maxScore: this.MAX_SCORE,
      percentage: (score / this.MAX_SCORE) * 100,
      metrics,
      count: metrics.length,
      quality: this._assessQuality(metrics.length),
      recommendations: this._getRecommendations(metrics.length)
    };
  }

  /**
   * Extract all metrics from resume text
   * @private
   */
  static _extractMetrics(text) {
    const metrics = [];

    // Percentage metrics (e.g., "35%", "improved by 40%")
    const percentageRegex = /(\d+(?:\.\d+)?)\s*%/g;
    let match;
    while ((match = percentageRegex.exec(text)) !== null) {
      metrics.push({
        type: 'percentage',
        value: match[1],
        unit: '%',
        context: this._getContext(text, match.index)
      });
    }

    // Currency metrics (e.g., "$12,000", "$1.2M")
    const currencyRegex = /\$\s*(\d+(?:,\d{3})*(?:\.\d+)?[KMB]?)/g;
    while ((match = currencyRegex.exec(text)) !== null) {
      metrics.push({
        type: 'currency',
        value: match[1],
        unit: '$',
        context: this._getContext(text, match.index)
      });
    }

    // Number metrics with context (e.g., "reduced load time by 48%")
    const numberContextRegex = /(\d+)\s*(projects?|users?|teams?|customers?|clients?|hours?|days?|weeks?|months?|years?|seconds?|milliseconds?|hours?|servers?|databases?|endpoints?|deployments?)/gi;
    while ((match = numberContextRegex.exec(text)) !== null) {
      // Don't duplicate percentages
      if (!text.substring(match.index, match.index + 20).includes('%')) {
        metrics.push({
          type: 'quantity',
          value: match[1],
          unit: match[2],
          context: this._getContext(text, match.index)
        });
      }
    }

    // Time-based improvements (e.g., "2x faster", "3x improvement")
    const multiplierRegex = /(\d+(?:\.\d+)?)\s*x\s*(faster|slower|bigger|smaller|improvement|increase|decrease)/gi;
    while ((match = multiplierRegex.exec(text)) !== null) {
      metrics.push({
        type: 'multiplier',
        value: match[1],
        unit: 'x',
        context: this._getContext(text, match.index)
      });
    }

    // Remove duplicates
    return Array.from(new Map(metrics.map(m => [m.context, m])).values());
  }

  /**
   * Get context around metric (for quality assessment)
   * @private
   */
  static _getContext(text, index) {
    const start = Math.max(0, index - 50);
    const end = Math.min(text.length, index + 50);
    return text.substring(start, end).trim();
  }

  /**
   * Calculate score based on metric count
   * @private
   */
  static _calculateScore(count) {
    if (count >= this.THRESHOLDS.excellent) return this.MAX_SCORE;
    if (count >= this.THRESHOLDS.good) return 12;
    if (count >= this.THRESHOLDS.fair) return 8;
    if (count > 0) return 4;
    return 0;
  }

  /**
   * Assess quality based on metric count
   * @private
   */
  static _assessQuality(count) {
    if (count >= this.THRESHOLDS.excellent) return 'excellent';
    if (count >= this.THRESHOLDS.good) return 'good';
    if (count >= this.THRESHOLDS.fair) return 'fair';
    if (count > 0) return 'poor';
    return 'critical';
  }

  /**
   * Get recommendations for improving metrics
   * @private
   */
  static _getRecommendations(count) {
    const recommendations = [];

    if (count === 0) {
      recommendations.push({
        severity: 'critical',
        message: 'Add quantifiable metrics to achievements (e.g., percentages, dollar amounts, project counts)'
      });
    } else if (count < this.THRESHOLDS.fair) {
      recommendations.push({
        severity: 'high',
        message: `Add more metrics. Found ${count}, aim for at least ${this.THRESHOLDS.fair}`
      });
    } else if (count < this.THRESHOLDS.good) {
      recommendations.push({
        severity: 'medium',
        message: `Consider adding more quantifiable metrics. Found ${count}, good target is ${this.THRESHOLDS.good}+`
      });
    }

    return recommendations;
  }
}

module.exports = MetricsAnalyzer;
