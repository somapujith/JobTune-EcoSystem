/**
 * Missing Information Engine - Identifies resume gaps
 * Latency Target: <10ms
 */

class MissingInfoEngine {
  static FIELDS = {
    contact: {
      name: 'Contact Information',
      required: true,
      patterns: [/\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i],
      description: 'Email address or phone number'
    },
    location: {
      name: 'Location',
      required: false,
      patterns: [
        /\b(?:new york|los angeles|chicago|san francisco|seattle|boston|denver|austin|miami)\b/i,
        /\b[a-z]{2}\b/i // State abbreviation
      ],
      description: 'City, state, or country'
    },
    summary: {
      name: 'Professional Summary',
      required: false,
      patterns: [/summary|objective|profile|about/i],
      description: '2-3 sentence professional statement'
    },
    experience: {
      name: 'Work Experience',
      required: true,
      patterns: [/experience|employment|career/i],
      description: 'Previous positions with dates and achievements'
    },
    skills: {
      name: 'Technical Skills',
      required: true,
      patterns: [/skills?|competencies|expertise|technical/i],
      description: 'Relevant technical and soft skills'
    },
    education: {
      name: 'Education',
      required: true,
      patterns: [/education|degree|university|college|bachelor|master/i],
      description: 'Degree, university, and graduation year'
    },
    projects: {
      name: 'Projects/Portfolio',
      required: false,
      patterns: [/projects?|portfolio|github|links?|repositories|notable/i],
      description: 'Links to projects or portfolio'
    },
    certifications: {
      name: 'Certifications',
      required: false,
      patterns: [/certifications?|certificates?|licenses?|certified/i],
      description: 'Relevant certifications or licenses'
    }
  };

  /**
   * Analyze resume for missing information
   * @param {string} resumeText - Raw resume text
   * @returns {object} Missing information analysis
   */
  static analyze(resumeText) {
    if (!resumeText || typeof resumeText !== 'string') {
      return {
        missing: [],
        critical: [],
        optional: [],
        count: 0
      };
    }

    const text = resumeText.toLowerCase();
    const missing = [];
    const critical = [];
    const optional = [];

    for (const [key, field] of Object.entries(this.FIELDS)) {
      const found = this._fieldExists(text, field.patterns);

      if (!found) {
        const missing_field = {
          field: key,
          name: field.name,
          required: field.required,
          description: field.description,
          severity: field.required ? 'critical' : 'optional'
        };

        missing.push(missing_field);

        if (field.required) {
          critical.push(missing_field);
        } else {
          optional.push(missing_field);
        }
      }
    }

    return {
      missing,
      critical,
      optional,
      count: missing.length,
      completeness: this._calculateCompleteness(missing.length),
      recommendations: this._getRecommendations(critical, optional)
    };
  }

  /**
   * Check if field exists in resume
   * @private
   */
  static _fieldExists(text, patterns) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Calculate completeness score
   * @private
   */
  static _calculateCompleteness(missingCount) {
    const totalFields = Object.keys(this.FIELDS).length;
    const presentCount = totalFields - missingCount;
    return Math.round((presentCount / totalFields) * 100);
  }

  /**
   * Get recommendations
   * @private
   */
  static _getRecommendations(critical, optional) {
    const recommendations = [];

    if (critical.length > 0) {
      recommendations.push({
        severity: 'critical',
        message: `Add missing critical sections: ${critical.map(f => f.name).join(', ')}`,
        fields: critical.map(f => f.field)
      });
    }

    if (optional.length > 2) {
      recommendations.push({
        severity: 'medium',
        message: `Consider adding: ${optional.map(f => f.name).join(', ')}`,
        fields: optional.map(f => f.field)
      });
    }

    return recommendations;
  }

  /**
   * Get detailed guidance for a missing field
   */
  static getFieldGuidance(fieldKey) {
    const field = this.FIELDS[fieldKey];

    if (!field) return null;

    const guidance = {
      contact: 'Include email and phone number at the top of your resume',
      location: 'Add your city and state or country for remote positions',
      summary: 'Write a 2-3 sentence summary of your professional background and career goals',
      experience: 'List your previous jobs in reverse chronological order with dates and achievements',
      skills: 'List 8-12 relevant technical and soft skills',
      education: 'Include degree, university name, graduation year, and GPA if 3.5+',
      projects: 'Add links to GitHub or portfolio showing your best work',
      certifications: 'List relevant industry certifications like AWS, Google, Azure, etc.'
    };

    return {
      field: fieldKey,
      name: field.name,
      description: field.description,
      guidance: guidance[fieldKey],
      required: field.required
    };
  }

  /**
   * Get template suggestion for missing field
   */
  static getTemplate(fieldKey) {
    const templates = {
      contact: `John Doe
john.doe@email.com | (555) 123-4567 | LinkedIn.com/in/johndoe | GitHub.com/johndoe`,

      summary: `Experienced Software Engineer with 5+ years of experience building scalable web applications using React and Node.js. Passionate about clean code and mentoring junior developers.`,

      experience: `Senior Software Engineer | TechCorp | Jan 2020 - Present
• Led development of microservices architecture, reducing API response time by 40%
• Mentored team of 3 junior developers on React and TypeScript best practices
• Architected real-time notification system serving 100K+ daily active users`,

      skills: `Languages: JavaScript, TypeScript, Python, SQL
Frameworks: React, Node.js, Django, Express
Databases: PostgreSQL, MongoDB, Redis
Tools: Git, Docker, AWS, CI/CD, Jira`,

      education: `Bachelor of Science in Computer Science
University of California, San Francisco | Graduated May 2019`,

      projects: `GitHub: github.com/johndoe
Portfolio: johndoe.dev
Notable Projects:
• Real-time Chat Application (React, Node.js, WebSockets)
• E-commerce Platform (React, Django, PostgreSQL)`,

      certifications: `AWS Certified Solutions Architect - Professional (2023)
Google Cloud Associate Cloud Engineer (2022)`,

      projects_alt: `Portfolio: linkedin.com/in/johndoe/
GitHub: github.com/johndoe
Personal Website: example.com`
    };

    return templates[fieldKey] || null;
  }
}

module.exports = MissingInfoEngine;
