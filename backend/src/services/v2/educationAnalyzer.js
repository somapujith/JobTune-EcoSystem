/**
 * Education Analyzer - Validates Education section completeness
 * Max Score: 5 Points
 * Rule: all fields present -> full score; missing degree/institution/year -> -3 each (floor 0)
 */

class EducationAnalyzer {
  static MAX_SCORE = 5;
  static FIELD_PENALTY = 3;

  static analyze(resumeText) {
    if (!resumeText || typeof resumeText !== 'string') {
      return { score: 0, maxScore: this.MAX_SCORE, entries: [], issues: [], recommendations: [] };
    }

    const block = this._extractBlock(resumeText);

    if (!block) {
      return {
        score: 0,
        maxScore: this.MAX_SCORE,
        entries: [],
        issues: [{ message: 'No Education section found' }],
        recommendations: [{ severity: 'critical', message: 'Add an Education section with degree, institution, and graduation year' }]
      };
    }

    const entries = this._splitEntries(block).map(entry => this._evaluateEntry(entry));
    const allComplete = entries.length > 0 && entries.every(e => e.hasDegree && e.hasInstitution && e.hasYear);

    let score = this.MAX_SCORE;
    const issues = [];

    if (entries.length === 0) {
      score = 0;
      issues.push({ message: 'Education section found but no entries detected' });
    } else if (!allComplete) {
      for (const entry of entries) {
        if (!entry.hasDegree) { score -= this.FIELD_PENALTY; issues.push({ message: `Missing degree in "${entry.text.slice(0, 40)}"` }); }
        if (!entry.hasInstitution) { score -= this.FIELD_PENALTY; issues.push({ message: `Missing institution in "${entry.text.slice(0, 40)}"` }); }
        if (!entry.hasYear) { score -= this.FIELD_PENALTY; issues.push({ message: `Missing graduation year in "${entry.text.slice(0, 40)}"` }); }
      }
    }

    score = Math.max(0, Math.min(score, this.MAX_SCORE));

    return {
      score,
      maxScore: this.MAX_SCORE,
      percentage: (score / this.MAX_SCORE) * 100,
      entries,
      issues,
      recommendations: issues.length > 0
        ? [{ severity: 'medium', message: 'Ensure every education entry lists degree, institution, and graduation year' }]
        : []
    };
  }

  static _extractBlock(text) {
    const headingPattern = /^(education|academic\s+background|academics)\s*:?\s*$/im;
    const lines = text.split('\n');
    const startIdx = lines.findIndex(line => headingPattern.test(line.trim()));
    if (startIdx === -1) return null;

    const otherHeadings = /^(certifications?|certificates?|technical\s+skills|skills|quantified\s+results|key\s+projects|projects?)\s*:?\s*$/i;
    let endIdx = lines.length;
    for (let i = startIdx + 1; i < lines.length; i++) {
      if (otherHeadings.test(lines[i].trim())) { endIdx = i; break; }
    }

    return lines.slice(startIdx + 1, endIdx).join('\n').trim();
  }

  static _splitEntries(block) {
    return block.split('\n').map(l => l.trim()).filter(Boolean).reduce((entries, line) => {
      const isContinuation = /^\d{4}|cgpa|gpa|percentage|%/i.test(line) && entries.length > 0;
      if (isContinuation) {
        entries[entries.length - 1].text += ' ' + line;
      } else {
        entries.push({ text: line });
      }
      return entries;
    }, []);
  }

  static _evaluateEntry(entry) {
    const text = entry.text;
    const hasDegree = /\b(b\.?tech|bachelor|master|m\.?tech|b\.?sc|m\.?sc|mba|ph\.?d|diploma|associate|degree|intermediate|class\s*x|class\s*xii)\b/i.test(text);
    const hasInstitution = /\b(university|college|institute|school|academy)\b/i.test(text);
    const hasYear = /\b(19|20)\d{2}\b/.test(text);

    return { text, hasDegree, hasInstitution, hasYear };
  }
}

module.exports = EducationAnalyzer;
