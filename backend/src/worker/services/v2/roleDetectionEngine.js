/**
 * Role Detection Engine - Detects user's primary role
 * Uses simple keyword matching (no embeddings needed initially)
 * Latency Target: <10ms
 */

class RoleDetectionEngine {
  static ROLES = {
    'frontend-developer': {
      keywords: ['react', 'vue', 'angular', 'frontend', 'ui', 'javascript', 'typescript', 'nextjs', 'html', 'css'],
      weight: 1.0
    },
    'backend-developer': {
      keywords: ['backend', 'node.js', 'python', 'java', 'api', 'database', 'microservices', 'server-side'],
      weight: 1.0
    },
    'full-stack-developer': {
      keywords: ['full-stack', 'full stack', 'fullstack', 'frontend', 'backend', 'react', 'node.js'],
      weight: 1.0
    },
    'data-scientist': {
      keywords: ['data scientist', 'machine learning', 'ml', 'python', 'tensorflow', 'analytics', 'data analysis'],
      weight: 1.0
    },
    'devops-engineer': {
      keywords: ['devops', 'docker', 'kubernetes', 'ci/cd', 'infrastructure', 'linux', 'terraform'],
      weight: 1.0
    },
    'product-manager': {
      keywords: ['product manager', 'product', 'strategy', 'roadmap', 'agile', 'stakeholder'],
      weight: 1.0
    },
    'ui-ux-designer': {
      keywords: ['ux', 'ui', 'designer', 'design', 'figma', 'user experience', 'interaction'],
      weight: 1.0
    },
    'mobile-developer': {
      keywords: ['mobile', 'ios', 'android', 'swift', 'kotlin', 'react-native', 'flutter'],
      weight: 1.0
    }
  };

  /**
   * Detect primary role from resume
   * @param {string} resumeText - Raw resume text
   * @returns {object} Role detection result
   */
  static detect(resumeText) {
    if (!resumeText || typeof resumeText !== 'string') {
      return {
        role: 'software-engineer',
        confidence: 0,
        candidates: []
      };
    }

    const text = resumeText.toLowerCase();
    const scores = {};

    // Score each role
    for (const [role, config] of Object.entries(this.ROLES)) {
      let score = 0;

      for (const keyword of config.keywords) {
        // Count keyword occurrences
        const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
        const matches = text.match(regex) || [];
        score += matches.length * config.weight;
      }

      scores[role] = score;
    }

    // Get top candidates
    const sorted = Object.entries(scores)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3);

    const topRole = sorted[0];
    const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
    const confidence = totalScore > 0 ? topRole[1] / totalScore : 0;

    return {
      role: topRole[0] || 'software-engineer',
      confidence: Math.min(confidence, 1),
      candidates: sorted.map(([role, score]) => ({
        role,
        score,
        confidence: totalScore > 0 ? score / totalScore : 0
      }))
    };
  }

  /**
   * Get all supported roles
   */
  static getSupportedRoles() {
    return Object.keys(this.ROLES);
  }

  /**
   * Get role details
   */
  static getRoleDetails(role) {
    return this.ROLES[role] || null;
  }

  /**
   * Check if confidence is high enough
   */
  static isHighConfidence(confidence) {
    return confidence >= 0.6;
  }

  /**
   * Get role display name
   */
  static getRoleDisplayName(role) {
    const displayNames = {
      'frontend-developer': 'Frontend Developer',
      'backend-developer': 'Backend Developer',
      'full-stack-developer': 'Full Stack Developer',
      'data-scientist': 'Data Scientist',
      'devops-engineer': 'DevOps Engineer',
      'product-manager': 'Product Manager',
      'ui-ux-designer': 'UI/UX Designer',
      'mobile-developer': 'Mobile Developer'
    };

    return displayNames[role] || role;
  }
}

module.exports = RoleDetectionEngine;
