/**
 * Contact Validator - Checks presence of standard contact fields
 * Max Score: 10 Points (Name, Email, Phone, LinkedIn, GitHub)
 * Latency Target: <5ms
 */

class ContactValidator {
  static MAX_SCORE = 10;

  static FIELDS = {
    name: { label: 'Full Name', weight: 2 },
    email: { label: 'Email Address', weight: 2 },
    phone: { label: 'Phone Number', weight: 2 },
    linkedin: { label: 'LinkedIn Profile', weight: 2 },
    github: { label: 'GitHub Profile', weight: 2 }
  };

  /**
   * Validate contact information present in the resume
   * @param {string} resumeText - Raw resume text
   * @returns {object} Contact validation result
   */
  static analyze(resumeText) {
    if (!resumeText || typeof resumeText !== 'string') {
      return {
        score: 0,
        maxScore: this.MAX_SCORE,
        found: {},
        missing: Object.keys(this.FIELDS),
        recommendations: []
      };
    }

    const found = {
      name: this._hasName(resumeText),
      email: this._hasEmail(resumeText),
      phone: this._hasPhone(resumeText),
      linkedin: this._hasLinkedIn(resumeText),
      github: this._hasGitHub(resumeText)
    };

    let score = 0;
    const missing = [];

    for (const [key, present] of Object.entries(found)) {
      if (present) {
        score += this.FIELDS[key].weight;
      } else {
        missing.push(key);
      }
    }

    return {
      score: Math.min(score, this.MAX_SCORE),
      maxScore: this.MAX_SCORE,
      percentage: (score / this.MAX_SCORE) * 100,
      found,
      missing,
      missingLabels: missing.map(key => this.FIELDS[key].label),
      recommendations: this._getRecommendations(missing)
    };
  }

  static _hasName(text) {
    const firstLine = text.split('\n').map(l => l.trim()).find(l => l.length > 0) || '';
    return /^[A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*){1,3}$/.test(firstLine);
  }

  static _hasEmail(text) {
    return /[\w.+-]+@[\w-]+\.[\w.-]+/.test(text);
  }

  static _hasPhone(text) {
    return /(\+?\d[\d\s().-]{7,}\d)/.test(text);
  }

  static _hasLinkedIn(text) {
    return /linkedin\.com\/[\w-]+|linkedin:\s*\S+/i.test(text);
  }

  static _hasGitHub(text) {
    return /github\.com\/[\w-]+|github:\s*\S+/i.test(text);
  }

  /**
   * Get recommendations for missing contact fields
   */
  static _getRecommendations(missing) {
    if (missing.length === 0) return [];

    return [{
      severity: missing.includes('email') || missing.includes('name') ? 'critical' : 'medium',
      message: `Add missing contact info: ${missing.map(key => this.FIELDS[key].label).join(', ')}`
    }];
  }
}

module.exports = ContactValidator;
