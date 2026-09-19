/**
 * Section Analyzer - Resume structure/section completeness scoring
 * Raw scale: 80 points (Summary 10, Skills 10, Experience 20, Projects 20,
 * Education 10, Certifications 10) — rescaled by the orchestrator onto the
 * 20-point "Structure" weight in the final ATS formula.
 */

class SectionAnalyzer {
  static SECTIONS = {
    summary: { name: 'Professional Summary', required: true, points: 10 },
    skills: { name: 'Skills', required: true, points: 10 },
    experience: { name: 'Experience', required: true, points: 20 },
    projects: { name: 'Projects', required: true, points: 20 },
    education: { name: 'Education', required: true, points: 10 },
    certifications: { name: 'Certifications', required: false, points: 10 }
  };

  static MAX_SCORE = 80;

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

    for (const [key, section] of Object.entries(this.SECTIONS)) {
      const found = this._sectionExists(text, key);

      if (found) {
        results[key] = section.points;
        totalScore += section.points;
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
      quality: this._assessQuality(foundSections)
    };
  }

  static _sectionExists(text, sectionKey) {
    const patterns = {
      summary: ['summary', 'objective', 'professional summary', 'about', 'profile', 'introduction'],
      experience: ['experience', 'employment', 'work experience', 'professional experience', 'career history'],
      education: ['education', 'academic', 'degree', 'university', 'college', 'qualification', 'school'],
      skills: ['skills', 'technical skills', 'core competencies', 'competencies', 'abilities', 'expertise', 'proficiencies'],
      projects: ['projects', 'portfolio', 'notable projects', 'key projects', 'accomplishments'],
      certifications: ['certifications', 'certificates', 'licenses', 'certification', 'certified', 'award', 'awards']
    };

    const keywordPatterns = patterns[sectionKey] || [];
    return keywordPatterns.some(keyword => {
      const regex = new RegExp(`\\b${keyword}\\b|^${keyword}|\\n${keyword}`, 'i');
      return regex.test(text);
    });
  }

  static _assessQuality(foundSections) {
    let quality = 'good';

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

  static getRecommendations(analysis) {
    const recommendations = [];

    if (analysis.missingSections.length > 0) {
      recommendations.push({
        severity: 'high',
        message: `Add missing sections: ${analysis.missingSections.join(', ')}`
      });
    }

    if (analysis.score < this.MAX_SCORE * 0.5) {
      recommendations.push({
        severity: 'critical',
        message: 'Resume lacks essential sections. Add Summary, Experience, Education, and Skills.'
      });
    }

    return recommendations;
  }
}

module.exports = SectionAnalyzer;
