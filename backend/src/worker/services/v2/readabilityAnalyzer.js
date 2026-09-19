/**
 * Readability Analyzer - Scores recruiter readability
 * Max Score: 5 Points
 *
 * Checks (per spec):
 *  - Resume length: ideal 1 page, acceptable 2 pages, penalty beyond that
 *  - Bullet point usage: bullets present vs. large paragraphs
 *  - Consistent formatting: same bullet style, consistent date format
 */

class ReadabilityAnalyzer {
  static MAX_SCORE = 5;
  static WORDS_PER_PAGE = 500; // rough estimate for a standard 1-page resume

  static analyze(resumeText) {
    if (!resumeText || typeof resumeText !== 'string') {
      return { score: 0, maxScore: this.MAX_SCORE, checks: {}, recommendations: [] };
    }

    const lengthCheck = this._checkLength(resumeText);
    const bulletCheck = this._checkBulletUsage(resumeText);
    const consistencyCheck = this._checkFormattingConsistency(resumeText);

    const checks = { length: lengthCheck, bulletUsage: bulletCheck, formattingConsistency: consistencyCheck };
    const score = Math.max(0, Math.min(
      lengthCheck.points + bulletCheck.points + consistencyCheck.points,
      this.MAX_SCORE
    ));

    return {
      score,
      maxScore: this.MAX_SCORE,
      percentage: (score / this.MAX_SCORE) * 100,
      checks,
      recommendations: this._getRecommendations(checks)
    };
  }

  /** Ideal: 1 page (~500 words). Acceptable: 2 pages (~1000 words). Beyond that: penalty. (2 pts max) */
  static _checkLength(text) {
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const estimatedPages = wordCount / this.WORDS_PER_PAGE;

    let points = 2;
    let note = 'Good length (~1 page)';

    if (estimatedPages > 2) {
      points = 0;
      note = `Resume is too long (~${estimatedPages.toFixed(1)} pages) — trim to 1-2 pages`;
    } else if (estimatedPages > 1) {
      points = 1.5;
      note = `Acceptable length (~${estimatedPages.toFixed(1)} pages)`;
    }

    return { points, wordCount, estimatedPages: Math.round(estimatedPages * 10) / 10, note };
  }

  /** Bullet points present vs. large unbroken paragraphs (2 pts max) */
  static _checkBulletUsage(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const bulletLines = lines.filter(l => /^[-•*]/.test(l));
    const longParagraphLines = lines.filter(l => !/^[-•*]/.test(l) && l.length > 200);

    let points = 2;
    let note = 'Good bullet point usage';

    if (bulletLines.length === 0) {
      points = 0;
      note = 'No bullet points found — use bullets instead of paragraphs';
    } else if (longParagraphLines.length > 0) {
      points = 1;
      note = 'Some large paragraphs detected — break them into bullet points';
    }

    return { points, bulletCount: bulletLines.length, longParagraphCount: longParagraphLines.length, note };
  }

  /** Consistent bullet characters and date formats (1 pt max) */
  static _checkFormattingConsistency(text) {
    const bulletChars = new Set((text.match(/^[ \t]*([-•*])/gm) || []).map(m => m.trim()[0]));
    const dateFormats = new Set();
    if (/\d{1,2}\/\d{1,2}\/\d{4}/.test(text)) dateFormats.add('mm/dd/yyyy');
    if (/\d{1,2}\/\d{4}/.test(text)) dateFormats.add('mm/yyyy');
    if (/[A-Za-z]{3,9}\s+\d{4}/.test(text)) dateFormats.add('month yyyy');

    const issues = [];
    if (bulletChars.size > 1) issues.push('Mixed bullet characters');
    if (dateFormats.size > 1) issues.push('Mixed date formats');

    return {
      points: issues.length === 0 ? 1 : 0,
      issues,
      note: issues.length === 0 ? 'Consistent formatting' : issues.join('; ')
    };
  }

  static _getRecommendations(checks) {
    const recommendations = [];

    for (const check of Object.values(checks)) {
      if (check.points < (check === checks.formattingConsistency ? 1 : 2) && check.note) {
        recommendations.push({ severity: 'medium', message: check.note });
      }
    }

    return recommendations;
  }
}

module.exports = ReadabilityAnalyzer;
