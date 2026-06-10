/**
 * Keyword Analyzer - Detects relevant keywords for role
 * Max Score: 25 Points
 * Latency Target: <10ms
 */

class KeywordAnalyzer {
  static MAX_SCORE = 25;

  // Role-specific keyword databases
  static ROLE_KEYWORDS = {
    'frontend-developer': {
      technical: ['react', 'vue', 'angular', 'javascript', 'typescript', 'html', 'css',
                   'responsive', 'ui', 'ux', 'webpack', 'babel', 'redux', 'vite', 'nextjs',
                   'tailwind', 'bootstrap', 'css-in-js', 'testing', 'jest', 'cypress'],
      soft: ['attention to detail', 'user-focused', 'collaboration', 'communication']
    },
    'backend-developer': {
      technical: ['node.js', 'python', 'java', 'golang', 'rust', 'database', 'sql', 'mongodb',
                   'postgresql', 'api', 'rest', 'graphql', 'microservices', 'docker', 'kubernetes',
                   'aws', 'azure', 'ci/cd', 'testing', 'mocha', 'pytest'],
      soft: ['problem-solving', 'system design', 'scalability', 'reliability']
    },
    'full-stack-developer': {
      technical: ['react', 'node.js', 'javascript', 'typescript', 'database', 'api', 'docker',
                   'aws', 'git', 'agile', 'rest', 'html', 'css', 'sql'],
      soft: ['collaboration', 'communication', 'problem-solving', 'adaptability']
    },
    'data-scientist': {
      technical: ['python', 'machine learning', 'tensorflow', 'pytorch', 'pandas', 'numpy',
                   'statistics', 'sql', 'tableau', 'powerbi', 'visualization', 'scikit-learn',
                   'deep learning', 'nlp', 'computer vision'],
      soft: ['analytical', 'communication', 'storytelling', 'problem-solving']
    },
    'devops-engineer': {
      technical: ['docker', 'kubernetes', 'ci/cd', 'jenkins', 'gitlab', 'github', 'aws', 'azure',
                   'terraform', 'ansible', 'linux', 'bash', 'python', 'monitoring', 'prometheus',
                   'grafana', 'infrastructure-as-code'],
      soft: ['automation', 'reliability', 'scalability', 'collaboration']
    },
    'product-manager': {
      technical: ['product strategy', 'roadmap', 'metrics', 'analytics', 'agile', 'user research',
                   'prototyping', 'jira', 'figma', 'competitor analysis'],
      soft: ['leadership', 'communication', 'vision', 'stakeholder management', 'decision-making']
    },
    'ui-ux-designer': {
      technical: ['figma', 'adobe xd', 'sketch', 'prototyping', 'wireframing', 'user research',
                   'usability testing', 'interaction design', 'visual design', 'information architecture'],
      soft: ['creativity', 'empathy', 'communication', 'user-centered thinking']
    },
    'mobile-developer': {
      technical: ['swift', 'kotlin', 'react-native', 'flutter', 'ios', 'android', 'objective-c',
                   'java', 'mobile ui', 'responsive design', 'api integration', 'testing'],
      soft: ['attention to detail', 'user-focused', 'collaboration', 'problem-solving']
    }
  };

  /**
   * Analyze resume keywords for a given role
   * @param {string} resumeText - Raw resume text
   * @param {string} detectedRole - Detected role (from role detector)
   * @returns {object} Keyword analysis
   */
  static analyze(resumeText, detectedRole = null) {
    if (!resumeText || typeof resumeText !== 'string') {
      return {
        score: 0,
        maxScore: this.MAX_SCORE,
        detectedRole,
        keywords: {
          found: [],
          missing: []
        },
        coverage: 0
      };
    }

    const text = resumeText.toLowerCase();

    // If no role detected, try to infer from keywords
    const role = detectedRole || this._inferRole(text);
    const roleKeywords = this.ROLE_KEYWORDS[role] || this.ROLE_KEYWORDS['frontend-developer'];

    // Find keywords in resume
    const allRoleKeywords = [...roleKeywords.technical, ...roleKeywords.soft];
    const foundKeywords = this._findKeywords(text, allRoleKeywords);
    const missingKeywords = allRoleKeywords.filter(k => !foundKeywords.includes(k));

    const score = this._calculateScore(foundKeywords.length, allRoleKeywords.length);
    const coverage = (foundKeywords.length / allRoleKeywords.length) * 100;

    return {
      score: Math.min(score, this.MAX_SCORE),
      maxScore: this.MAX_SCORE,
      percentage: (score / this.MAX_SCORE) * 100,
      detectedRole: role,
      keywords: {
        found: foundKeywords,
        missing: missingKeywords,
        total: allRoleKeywords.length,
        technical: {
          found: foundKeywords.filter(k => roleKeywords.technical.includes(k)),
          missing: roleKeywords.technical.filter(k => !foundKeywords.includes(k))
        },
        soft: {
          found: foundKeywords.filter(k => roleKeywords.soft.includes(k)),
          missing: roleKeywords.soft.filter(k => !foundKeywords.includes(k))
        }
      },
      coverage,
      quality: this._assessQuality(coverage),
      recommendations: this._getRecommendations(foundKeywords.length, allRoleKeywords.length, missingKeywords)
    };
  }

  /**
   * Find keywords in text
   * @private
   */
  static _findKeywords(text, keywords) {
    const found = [];

    for (const keyword of keywords) {
      // Handle multi-word keywords
      const pattern = keyword
        .split(/[\s\-\/]/)
        .map(w => `\\b${w}\\b`)
        .join('\\s*[-/]?\\s*');

      const regex = new RegExp(pattern, 'i');

      if (regex.test(text)) {
        found.push(keyword);
      }
    }

    return found;
  }

  /**
   * Infer role from keywords found
   * @private
   */
  static _inferRole(text) {
    let topRole = 'frontend-developer';
    let topScore = 0;

    for (const [role, keywords] of Object.entries(this.ROLE_KEYWORDS)) {
      const allKeywords = [...keywords.technical, ...keywords.soft];
      const found = this._findKeywords(text, allKeywords);
      const score = found.length;

      if (score > topScore) {
        topScore = score;
        topRole = role;
      }
    }

    return topRole;
  }

  /**
   * Calculate score based on keyword coverage
   * @private
   */
  static _calculateScore(foundCount, totalCount) {
    if (totalCount === 0) return 0;

    const coverage = (foundCount / totalCount) * 100;

    if (coverage >= 80) return this.MAX_SCORE;
    if (coverage >= 60) return 20;
    if (coverage >= 40) return 15;
    if (coverage >= 20) return 10;
    if (foundCount > 0) return 5;

    return 0;
  }

  /**
   * Assess quality
   * @private
   */
  static _assessQuality(coverage) {
    if (coverage >= 80) return 'excellent';
    if (coverage >= 60) return 'good';
    if (coverage >= 40) return 'fair';
    if (coverage >= 20) return 'poor';
    return 'critical';
  }

  /**
   * Get recommendations
   * @private
   */
  static _getRecommendations(foundCount, totalCount, missingKeywords) {
    const recommendations = [];
    const coverage = (foundCount / totalCount) * 100;

    if (coverage < 40) {
      recommendations.push({
        severity: 'critical',
        message: `Low keyword coverage (${Math.round(coverage)}%). Add key skills like: ${missingKeywords.slice(0, 3).join(', ')}`
      });
    } else if (coverage < 60) {
      recommendations.push({
        severity: 'high',
        message: `Improve keyword coverage (${Math.round(coverage)}%). Consider mentioning: ${missingKeywords.slice(0, 3).join(', ')}`
      });
    } else if (coverage < 80) {
      recommendations.push({
        severity: 'medium',
        message: `Good keyword coverage. Consider adding: ${missingKeywords.slice(0, 2).join(', ')}`
      });
    }

    return recommendations;
  }

  /**
   * Get all supported roles
   */
  static getSupportedRoles() {
    return Object.keys(this.ROLE_KEYWORDS);
  }

  /**
   * Get keywords for a specific role
   */
  static getKeywordsForRole(role) {
    return this.ROLE_KEYWORDS[role] || null;
  }
}

module.exports = KeywordAnalyzer;
