/**
 * Experience Analyzer - Scores the Professional Experience section
 * Max Score: 15 Points
 * Rule: each job entry starts at full per-entry credit and loses points for
 * each missing field (Company -5, Role -5, Duration -5, Description -5),
 * then the average across all entries is scaled to MAX_SCORE.
 */

class ExperienceAnalyzer {
  static MAX_SCORE = 15;
  static FIELD_PENALTY = 5;
  static PER_ENTRY_MAX = 20; // 4 fields x 5 pts, scaled down to MAX_SCORE

  static analyze(resumeText) {
    if (!resumeText || typeof resumeText !== 'string') {
      return { score: 0, maxScore: this.MAX_SCORE, jobsFound: 0, jobs: [], recommendations: [] };
    }

    const block = this._extractExperienceBlock(resumeText);

    if (!block) {
      return {
        score: 0,
        maxScore: this.MAX_SCORE,
        jobsFound: 0,
        jobs: [],
        recommendations: [{ severity: 'critical', message: 'No Professional Experience section found.' }]
      };
    }

    const jobs = this._splitJobEntries(block);
    const evaluated = jobs.map(job => this._evaluateJob(job));

    const avgRaw = evaluated.length > 0
      ? evaluated.reduce((sum, j) => sum + j.rawScore, 0) / evaluated.length
      : 0;

    const score = Math.round((avgRaw / this.PER_ENTRY_MAX) * this.MAX_SCORE);

    return {
      score: Math.max(0, Math.min(score, this.MAX_SCORE)),
      maxScore: this.MAX_SCORE,
      percentage: (Math.max(0, Math.min(score, this.MAX_SCORE)) / this.MAX_SCORE) * 100,
      jobsFound: evaluated.length,
      jobs: evaluated,
      recommendations: this._getRecommendations(evaluated)
    };
  }

  static _extractExperienceBlock(text) {
    const headingPattern = /^(professional\s+experience|work\s+experience|experience|employment(\s+history)?|career\s+history)\s*:?\s*$/im;
    const lines = text.split('\n');
    const startIdx = lines.findIndex(line => headingPattern.test(line.trim()));
    if (startIdx === -1) return null;

    const otherHeadings = /^(key\s+projects(\s*(&|and)\s*achievements)?|projects?(\s*(&|and)\s*achievements)?|education|technical\s+skills|skills|quantified\s+results|certifications?)\s*:?\s*$/i;
    let endIdx = lines.length;
    for (let i = startIdx + 1; i < lines.length; i++) {
      if (otherHeadings.test(lines[i].trim())) { endIdx = i; break; }
    }

    return lines.slice(startIdx + 1, endIdx).join('\n').trim();
  }

  static _splitJobEntries(block) {
    const lines = block.split('\n');
    const entries = [];
    let current = null;
    const dateOnlyLine = /^[A-Za-z]{3,9}\.?\s+\d{4}\s*[-–—]\s*([A-Za-z]{3,9}\.?\s+\d{4}|present|current)$/i;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      const isBullet = /^[-•*]/.test(line);
      if (!isBullet && !dateOnlyLine.test(line)) {
        if (current) entries.push(current);
        current = { header: line, dateLine: '', bullets: [] };
      } else if (!isBullet && dateOnlyLine.test(line) && current) {
        current.dateLine = line;
      } else if (current) {
        current.bullets.push(line.replace(/^[-•*]\s*/, ''));
      }
    }
    if (current) entries.push(current);

    return entries;
  }

  /**
   * Evaluate one job entry against the 4 required fields.
   * Each present field contributes 5 pts (PER_ENTRY_MAX = 20); missing fields are listed as issues.
   */
  static _evaluateJob(entry) {
    const headerText = entry.header;
    const fullText = [entry.header, entry.dateLine, ...entry.bullets].join(' ');

    const hasCompany = /\|/.test(headerText) || /\b(inc\.?|llc|ltd|corp\.?|studio|labs?|technologies|systems|solutions|venture)\b/i.test(headerText);
    const hasRole = /\b(engineer|developer|designer|manager|analyst|intern|lead|architect|consultant|specialist|director)\b/i.test(headerText);
    const hasDuration = entry.dateLine.length > 0 || /\b\d{4}\s*[-–—]\s*(\d{4}|present|current)\b/i.test(fullText);
    const hasDescription = entry.bullets.length > 0 && entry.bullets.some(b => b.length > 20);

    const missing = [];
    let rawScore = this.PER_ENTRY_MAX;

    if (!hasCompany) { rawScore -= this.FIELD_PENALTY; missing.push('Company'); }
    if (!hasRole) { rawScore -= this.FIELD_PENALTY; missing.push('Role'); }
    if (!hasDuration) { rawScore -= this.FIELD_PENALTY; missing.push('Duration'); }
    if (!hasDescription) { rawScore -= this.FIELD_PENALTY; missing.push('Description'); }

    return {
      title: entry.header,
      rawScore: Math.max(0, rawScore),
      maxRawScore: this.PER_ENTRY_MAX,
      criteria: { hasCompany, hasRole, hasDuration, hasDescription },
      bulletCount: entry.bullets.length,
      missing
    };
  }

  static _getRecommendations(evaluated) {
    const recommendations = [];

    if (evaluated.length === 0) {
      recommendations.push({ severity: 'critical', message: 'Add at least one work experience entry with role, company, and dates.' });
      return recommendations;
    }

    for (const job of evaluated) {
      for (const field of job.missing) {
        recommendations.push({ severity: 'high', message: `Missing ${field} in "${job.title}"` });
      }
    }

    return recommendations;
  }
}

module.exports = ExperienceAnalyzer;
