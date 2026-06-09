const ResumeStructure = require('./resumeStructure');

class MissingInfoEngine {
  /**
   * Dynamic questions for missing sections
   */
  static QUESTIONS = {
    summary: {
      field: 'Professional Summary',
      description: 'Concise overview of your professional background',
      type: 'textarea',
      placeholder: 'e.g., Senior Frontend Developer with 5+ years building scalable React applications. Skilled in TypeScript, performance optimization, and mentoring junior developers.'
    },
    experience: {
      field: 'Work Experience',
      description: 'Your professional roles and achievements',
      type: 'textarea',
      placeholder: 'e.g., Senior Software Engineer at Company | 2020-Present\n• Led development of 3 microservices, improving latency by 40%\n• Mentored 5 junior engineers'
    },
    skills: {
      field: 'Technical Skills',
      description: 'Programming languages, frameworks, tools',
      type: 'textarea',
      placeholder: 'e.g., Languages: JavaScript, TypeScript, Python\nFrameworks: React, Node.js, Express\nTools: Docker, Kubernetes, AWS'
    },
    projects: {
      field: 'Projects',
      description: 'Notable projects you\'ve built',
      type: 'textarea',
      placeholder: 'e.g., E-commerce Platform\n• Built full-stack app with 10k+ daily users\n• Reduced page load by 35% through optimization'
    },
    certifications: {
      field: 'Certifications',
      description: 'Professional certifications and credentials',
      type: 'text',
      placeholder: 'e.g., AWS Certified Solutions Architect, GCP Professional Data Engineer'
    },
    achievements: {
      field: 'Key Achievements',
      description: 'Major accomplishments and awards',
      type: 'textarea',
      placeholder: 'e.g., Led successful product launch reaching 100k users in first month'
    }
  };

  /**
   * Analyze resume and identify missing information
   */
  static analyzeMissingInfo(resumeText) {
    const structure = ResumeStructure.analyzeStructure(resumeText);
    const missing = [];

    // Check each section
    for (const [section, question] of Object.entries(this.QUESTIONS)) {
      if (!structure[section] || structure[section].length === 0 || this.isSectionMinimal(structure[section])) {
        missing.push({
          field: question.field,
          section,
          description: question.description,
          type: question.type,
          placeholder: question.placeholder,
          why: this.getWhyMissing(section)
        });
      }
    }

    return {
      count: missing.length,
      fields: missing,
      hasCriticalGaps: missing.some(f => ['summary', 'experience', 'skills'].includes(f.section))
    };
  }

  /**
   * Check if section content is minimal
   */
  static isSectionMinimal(sectionLines) {
    if (!sectionLines || sectionLines.length === 0) return true;

    const totalChars = sectionLines.join('').length;
    return totalChars < 50; // Less than 50 characters = minimal
  }

  /**
   * Get explanation for why a section is missing
   */
  static getWhyMissing(section) {
    const reasons = {
      summary: 'Summary helps ATS parsers understand your background immediately. It\'s often the first section reviewed.',
      experience: 'Work experience is critical for ATS matching against job requirements and achievement quantification.',
      skills: 'Dedicated skills section allows ATS to extract keywords efficiently. Essential for role matching.',
      projects: 'Projects demonstrate hands-on capability and provide proof of technical skills.',
      certifications: 'Certifications validate expertise and are often required by employers.',
      achievements: 'Quantified achievements show impact and are preferred by ATS algorithms.'
    };

    return reasons[section] || 'This section is important for ATS compatibility.';
  }

  /**
   * Validate user input
   */
  static validateInput(section, value) {
    if (!value || value.trim().length === 0) {
      return { valid: false, error: 'This field cannot be empty' };
    }

    const minLength = section === 'certifications' ? 10 : 30;
    if (value.length < minLength) {
      return { valid: false, error: `Please provide at least ${minLength} characters` };
    }

    return { valid: true };
  }

  /**
   * Generate contextual prompts based on missing info
   */
  static generatePrompts(missingInfo) {
    const prompts = [];

    for (const missing of missingInfo.fields.slice(0, 3)) {
      prompts.push({
        section: missing.section,
        prompt: missing.description,
        why: missing.why,
        example: missing.placeholder
      });
    }

    return prompts;
  }

  /**
   * Score missing information severity
   */
  static scoreGaps(missingInfo) {
    const criticalSections = ['summary', 'experience', 'skills'];
    const criticalGaps = missingInfo.fields.filter(f => criticalSections.includes(f.section)).length;

    let severity = 'low';
    if (criticalGaps >= 2) severity = 'critical';
    else if (criticalGaps === 1) severity = 'high';
    else if (missingInfo.count > 2) severity = 'medium';

    return {
      severity,
      criticalGaps,
      totalGaps: missingInfo.count,
      scoreImpact: this.scoreImpactCalculation(missingInfo)
    };
  }

  /**
   * Calculate score impact of missing info
   */
  static scoreImpactCalculation(missingInfo) {
    let impact = 0;

    for (const field of missingInfo.fields) {
      if (['summary', 'experience', 'skills'].includes(field.section)) {
        impact += 5;
      } else if (['projects', 'certifications'].includes(field.section)) {
        impact += 3;
      } else {
        impact += 2;
      }
    }

    return Math.min(impact, 30); // Max 30 point impact
  }
}

module.exports = MissingInfoEngine;
