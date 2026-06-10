/**
 * Section Analyzer - Rule-based section completeness scoring
 * Max Score: 30 Points
 * Latency Target: <10ms
 */

class SectionAnalyzer {
  // Define required sections and their weights
  static SECTIONS = {
    summary: { name: 'Summary/Objective', required: true, weight: 5 },
    experience: { name: 'Experience', required: true, weight: 5 },
    education: { name: 'Education', required: true, weight: 5 },
    skills: { name: 'Skills', required: true, weight: 5 },
    projects: { name: 'Projects', required: false, weight: 5 },
    certifications: { name: 'Certifications', required: false, weight: 5 }
  };

  static MAX_SCORE = 30;

  /**
   * Analyze resume sections
   * @param {string} resumeText - Raw resume text
   * @returns {object} Section analysis with score
   */
  static analyze(resumeText) {
    if (!resumeText || typeof resumeText !== 'string') {
      return {
        score: 0,
        maxScore: this.MAX_SCORE,
        details: {},
        foundSections: [],
        missingSections: []
      };
    }

    const text = resumeText.toLowerCase();
    const results = {};
    const foundSections = [];
    const missingSections = [];

    let totalScore = 0;

    // Check each section
    for (const [key, section] of Object.entries(this.SECTIONS)) {
      const found = this._sectionExists(text, key);

      if (found) {
        results[key] = section.weight;
        totalScore += section.weight;
        foundSections.push(section.name);
      } else {
        results[key] = 0;
        if (section.required) {
          missingSections.push(section.name);
        }
      }
    }

    return {
      score: Math.min(totalScore, this.MAX_SCORE),
      maxScore: this.MAX_SCORE,
      percentage: (totalScore / this.MAX_SCORE) * 100,
      details: results,
      foundSections,
      missingSections,
      quality: this._assessQuality(text, foundSections)
    };
  }

  /**
   * Check if section exists in resume
   * @private
   */
  static _sectionExists(text, sectionKey) {
    const patterns = {
      summary: [
        'summary', 'objective', 'professional summary',
        'about', 'profile', 'introduction'
      ],
      experience: [
        'experience', 'employment', 'work experience',
        'professional experience', 'career history'
      ],
      education: [
        'education', 'academic', 'degree', 'university',
        'college', 'qualification', 'school'
      ],
      skills: [
        'skills', 'technical skills', 'core competencies',
        'competencies', 'abilities', 'expertise', 'proficiencies'
      ],
      projects: [
        'projects', 'portfolio', 'notable projects',
        'key projects', 'accomplishments'
      ],
      certifications: [
        'certifications', 'certificates', 'licenses',
        'certification', 'certified', 'award', 'awards'
      ]
    };

    const keywordPatterns = patterns[sectionKey] || [];
    return keywordPatterns.some(keyword => {
      // Look for section headers
      const regex = new RegExp(`\\b${keyword}\\b|^${keyword}|\\n${keyword}`, 'i');
      return regex.test(text);
    });
  }

  /**
   * Assess overall section quality
   * @private
   */
  static _assessQuality(text, foundSections) {
    let quality = 'good';

    // Check if critical sections are present
    const criticalSections = ['experience', 'education', 'skills'];
    const hasAllCritical = criticalSections.every(s =>
      foundSections.some(fs => fs.toLowerCase().includes(s))
    );

    if (!hasAllCritical) {
      quality = 'poor';
    } else if (foundSections.length >= 5) {
      quality = 'excellent';
    } else if (foundSections.length < 3) {
      quality = 'fair';
    }

    return quality;
  }

  /**
   * Get recommendations for missing sections
   */
  static getRecommendations(analysis) {
    const recommendations = [];

    if (analysis.missingSections.length > 0) {
      recommendations.push({
        severity: 'high',
        message: `Add missing sections: ${analysis.missingSections.join(', ')}`
      });
    }

    if (analysis.score < 20) {
      recommendations.push({
        severity: 'critical',
        message: 'Resume lacks essential sections. Add Summary, Experience, Education, and Skills.'
      });
    }

    return recommendations;
  }
}

module.exports = SectionAnalyzer;
