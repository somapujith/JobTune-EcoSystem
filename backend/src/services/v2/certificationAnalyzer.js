/**
 * Certification Analyzer - Validates Certifications section
 * Max Score: 5 Points — optional section, no penalty if missing entirely.
 */

class CertificationAnalyzer {
  static MAX_SCORE = 5;

  static analyze(resumeText) {
    if (!resumeText || typeof resumeText !== 'string') {
      return { score: 0, maxScore: this.MAX_SCORE, entries: [], present: false, recommendations: [] };
    }

    const block = this._extractBlock(resumeText);

    if (!block) {
      // Optional section — missing entirely costs nothing.
      return {
        score: this.MAX_SCORE,
        maxScore: this.MAX_SCORE,
        percentage: 100,
        entries: [],
        present: false,
        recommendations: []
      };
    }

    const entries = block.split('\n').map(l => l.trim()).filter(Boolean).map(line => this._evaluateEntry(line));
    const validEntries = entries.filter(e => e.hasName);

    const score = validEntries.length > 0 ? this.MAX_SCORE : Math.round(this.MAX_SCORE * 0.5);

    return {
      score,
      maxScore: this.MAX_SCORE,
      percentage: (score / this.MAX_SCORE) * 100,
      entries,
      present: true,
      recommendations: validEntries.length === 0
        ? [{ severity: 'low', message: 'Certifications section is empty or unclear — list certification name and issuer' }]
        : []
    };
  }

  static _extractBlock(text) {
    const headingPattern = /^(certifications?|certificates?|licenses?)\s*:?\s*$/im;
    const lines = text.split('\n');
    const startIdx = lines.findIndex(line => headingPattern.test(line.trim()));
    if (startIdx === -1) return null;

    const otherHeadings = /^(education|technical\s+skills|skills|quantified\s+results|key\s+projects|projects?)\s*:?\s*$/i;
    let endIdx = lines.length;
    for (let i = startIdx + 1; i < lines.length; i++) {
      if (otherHeadings.test(lines[i].trim())) { endIdx = i; break; }
    }

    return lines.slice(startIdx + 1, endIdx).join('\n').trim();
  }

  static _evaluateEntry(line) {
    const hasName = line.length > 3;
    const hasIssuer = /\b(aws|google|microsoft|azure|coursera|udemy|cisco|comptia|pmi|oracle|salesforce)\b/i.test(line) || /\(.*\)/.test(line);
    return { text: line, hasName, hasIssuer };
  }
}

module.exports = CertificationAnalyzer;
