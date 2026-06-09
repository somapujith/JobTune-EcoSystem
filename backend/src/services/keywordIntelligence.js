class KeywordIntelligence {
  /**
   * Role-specific keyword database
   */
  static ROLE_KEYWORDS = {
    'frontend_developer': {
      primary: ['React', 'Vue.js', 'Angular', 'TypeScript', 'JavaScript', 'Next.js', 'Svelte'],
      secondary: ['TailwindCSS', 'CSS', 'HTML', 'Redux', 'Zustand', 'REST API', 'GraphQL'],
      tools: ['Git', 'Webpack', 'Vite', 'ESLint', 'Jest', 'Cypress', 'Docker']
    },
    'backend_developer': {
      primary: ['Node.js', 'Express', 'Python', 'Java', 'Go', 'Rust', 'C#'],
      secondary: ['PostgreSQL', 'MongoDB', 'Redis', 'Docker', 'Kubernetes', 'REST API', 'GraphQL'],
      tools: ['Git', 'AWS', 'GCP', 'Azure', 'Jenkins', 'Terraform', 'Docker Compose']
    },
    'fullstack_developer': {
      primary: ['React', 'Node.js', 'Express', 'JavaScript', 'TypeScript', 'Next.js', 'PostgreSQL'],
      secondary: ['MongoDB', 'Redis', 'AWS', 'Docker', 'TailwindCSS', 'REST API', 'GraphQL'],
      tools: ['Git', 'Jest', 'Cypress', 'Webpack', 'Docker', 'Jenkins']
    },
    'data_scientist': {
      primary: ['Python', 'SQL', 'Machine Learning', 'TensorFlow', 'PyTorch', 'Pandas', 'NumPy'],
      secondary: ['Scikit-learn', 'Matplotlib', 'Statistics', 'Data Analysis', 'Deep Learning', 'NLP'],
      tools: ['Jupyter', 'Git', 'AWS SageMaker', 'GCP AI', 'Spark', 'Hadoop']
    },
    'devops_engineer': {
      primary: ['Docker', 'Kubernetes', 'AWS', 'CI/CD', 'Jenkins', 'Terraform', 'Linux'],
      secondary: ['Python', 'Bash', 'Ansible', 'CloudFormation', 'Monitoring', 'Logging'],
      tools: ['Git', 'Prometheus', 'Grafana', 'ELK Stack', 'Vault', 'ArgoCD']
    },
    'product_manager': {
      primary: ['Product Strategy', 'User Research', 'Roadmap', 'Analytics', 'Stakeholder Management', 'Agile'],
      secondary: ['A/B Testing', 'Product Design', 'OKRs', 'Metrics', 'Competitive Analysis', 'Documentation'],
      tools: ['Jira', 'Confluence', 'Figma', 'Amplitude', 'Mixpanel', 'Google Analytics']
    }
  };

  /**
   * Generic technical keywords applicable to most roles
   */
  static UNIVERSAL_KEYWORDS = [
    'Agile', 'Scrum', 'Git', 'CI/CD', 'Problem Solving', 'Communication',
    'Leadership', 'Mentoring', 'Code Review', 'Testing', 'Performance Optimization',
    'Debugging', 'Documentation', 'API Design', 'Database Design', 'Architecture'
  ];

  /**
   * Detect role from resume content
   */
  static detectRole(resumeText) {
    const text = resumeText.toLowerCase();
    const scores = {};

    for (const [role, keywords] of Object.entries(this.ROLE_KEYWORDS)) {
      let score = 0;
      const allKeywords = [...keywords.primary, ...keywords.secondary, ...keywords.tools];

      for (const keyword of allKeywords) {
        if (text.includes(keyword.toLowerCase())) {
          score += keywords.primary.includes(keyword) ? 3 : 1;
        }
      }

      scores[role] = score;
    }

    const detected = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
    return detected ? detected[0] : 'fullstack_developer';
  }

  /**
   * Analyze keyword coverage for a role
   */
  static analyzeKeywordCoverage(resumeText, role = null) {
    const detectedRole = role || this.detectRole(resumeText);
    const keywords = this.ROLE_KEYWORDS[detectedRole] || this.ROLE_KEYWORDS.fullstack_developer;
    const text = resumeText.toLowerCase();

    const coverage = {
      role: detectedRole,
      primary: this.matchKeywords(text, keywords.primary),
      secondary: this.matchKeywords(text, keywords.secondary),
      tools: this.matchKeywords(text, keywords.tools),
      universal: this.matchKeywords(text, this.UNIVERSAL_KEYWORDS)
    };

    coverage.totalCoverage = Math.round(
      (coverage.primary.found.length / keywords.primary.length) * 100
    );

    coverage.recommendations = this.generateKeywordRecommendations(coverage);

    return coverage;
  }

  /**
   * Match keywords against text
   */
  static matchKeywords(text, keywords) {
    const found = [];
    const missing = [];

    for (const keyword of keywords) {
      if (text.includes(keyword.toLowerCase())) {
        found.push(keyword);
      } else {
        missing.push(keyword);
      }
    }

    return {
      found,
      missing,
      coverage: Math.round((found.length / keywords.length) * 100)
    };
  }

  /**
   * Generate keyword recommendations
   */
  static generateKeywordRecommendations(coverage) {
    const recs = [];

    // Primary keywords (critical)
    if (coverage.primary.coverage < 80) {
      recs.push({
        priority: 'critical',
        category: 'Primary Technical Skills',
        missing: coverage.primary.missing.slice(0, 3),
        why: 'These are core skills for your role. Missing them significantly impacts ATS matching.',
        impact: 'High'
      });
    }

    // Secondary keywords (important)
    if (coverage.secondary.coverage < 60) {
      recs.push({
        priority: 'high',
        category: 'Secondary Skills & Tools',
        missing: coverage.secondary.missing.slice(0, 3),
        why: 'These expand your technical breadth and increase role fit score.',
        impact: 'Medium'
      });
    }

    // Universal keywords
    if (coverage.universal.coverage < 70) {
      recs.push({
        priority: 'medium',
        category: 'Soft Skills & Best Practices',
        missing: coverage.universal.missing.slice(0, 3),
        why: 'These are universally valued and show professional maturity.',
        impact: 'Medium'
      });
    }

    return recs;
  }

  /**
   * Get all keywords for a role
   */
  static getAllKeywordsForRole(role) {
    const keywords = this.ROLE_KEYWORDS[role];
    if (!keywords) return [];

    return {
      primary: keywords.primary,
      secondary: keywords.secondary,
      tools: keywords.tools,
      universal: this.UNIVERSAL_KEYWORDS
    };
  }
}

module.exports = KeywordIntelligence;
