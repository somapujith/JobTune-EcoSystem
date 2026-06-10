/**
 * Job Description Parser - Intelligently extracts requirements from JD
 * No AI - Uses NLP and pattern matching
 * Latency Target: <100ms
 */

class JobDescriptionParser {
  // Skill keywords database
  static SKILL_KEYWORDS = {
    frontend: ['react', 'vue', 'angular', 'javascript', 'typescript', 'html', 'css', 'nextjs', 'svelte'],
    backend: ['node.js', 'python', 'java', 'golang', 'rust', 'c#', 'php', 'ruby'],
    databases: ['postgresql', 'mysql', 'mongodb', 'redis', 'firebase', 'dynamodb', 'oracle'],
    devops: ['docker', 'kubernetes', 'aws', 'azure', 'gcp', 'ci/cd', 'jenkins', 'gitlab'],
    mobile: ['swift', 'kotlin', 'react-native', 'flutter', 'objective-c'],
    tools: ['git', 'jira', 'figma', 'slack', 'salesforce', 'datadog'],
    soft: ['communication', 'leadership', 'problem-solving', 'collaboration', 'teamwork']
  };

  static SENIORITY_KEYWORDS = {
    entry: ['junior', 'graduate', 'entry-level', 'fresh', 'new'],
    mid: ['mid-level', 'experienced', '3-5 years', 'senior', 'lead'],
    senior: ['senior', 'staff', '8+ years', 'principal', 'architect', 'director']
  };

  /**
   * Parse job description
   * @param {string} jdText - Raw job description text
   * @returns {object} Parsed JD with extracted components
   */
  static parse(jdText) {
    if (!jdText || typeof jdText !== 'string') {
      return this._emptyParse();
    }

    const text = jdText.toLowerCase();

    return {
      status: 'success',
      content: jdText,
      sections: this._extractSections(jdText),
      skills: this._extractSkills(text),
      seniority: this._detectSeniority(text),
      responsibilities: this._extractResponsibilities(jdText),
      requirements: this._extractRequirements(jdText),
      compensation: this._extractCompensation(jdText),
      metadata: {
        length: jdText.length,
        wordCount: jdText.split(/\s+/).length,
        hasSalary: /\$|salary|compensation|pay/i.test(jdText)
      }
    };
  }

  /**
   * Extract main sections from JD
   * @private
   */
  static _extractSections(text) {
    const sections = {};
    const sectionPatterns = {
      summary: /^(.*?)(?=\n(about|responsibilities|requirements|qualifications|what|we are|this is|overview)|$)/is,
      responsibilities: /(about the (role|position)|responsibilities|key responsibilities|you will|your role)([\s\S]*?)(?=\n(requirements|qualifications|what we|preferred|about you)|$)/i,
      requirements: /(requirements|required|must have|qualifications)([\s\S]*?)(?=\n(preferred|nice to have|about you|benefits|apply)|$)/i,
      preferred: /(preferred|nice to have|bonus|plus|would be great)([\s\S]*?)(?=\n(about|benefits|apply|why|company)|$)/i,
      benefits: /(benefits|perks|compensation|what we offer)([\s\S]*?)(?=\n(apply|contact|how to|requirements|about)|$)/i
    };

    for (const [section, pattern] of Object.entries(sectionPatterns)) {
      const match = text.match(pattern);
      if (match) {
        sections[section] = match[0].trim().substring(0, 500);
      }
    }

    return sections;
  }

  /**
   * Extract skills from JD
   * @private
   */
  static _extractSkills(text) {
    const skills = {
      critical: [],
      important: [],
      bonus: [],
      all: []
    };

    // Extract all found skills
    const allFound = new Set();

    for (const category of Object.values(this.SKILL_KEYWORDS)) {
      for (const skill of category) {
        const regex = new RegExp(`\\b${skill}\\b`, 'gi');
        if (regex.test(text)) {
          allFound.add(skill.toLowerCase());
        }
      }
    }

    // Classify by importance
    const criticalPatterns = /(required|must have|essential|critical)/i;
    const importantPatterns = /(preferred|should have|important)/i;
    const bonusPatterns = /(nice to have|bonus|plus|would be great)/i;

    // Find context for each skill
    for (const skill of allFound) {
      const regex = new RegExp(`([^.!?]*${skill}[^.!?]*)`, 'gi');
      const matches = text.matchAll(regex);

      for (const match of matches) {
        const context = match[1] || '';

        if (criticalPatterns.test(context)) {
          if (!skills.critical.includes(skill)) {
            skills.critical.push(skill);
          }
        } else if (importantPatterns.test(context)) {
          if (!skills.important.includes(skill)) {
            skills.important.push(skill);
          }
        } else if (bonusPatterns.test(context)) {
          if (!skills.bonus.includes(skill)) {
            skills.bonus.push(skill);
          }
        }

        break; // Only process first occurrence
      }

      // If not classified, default to critical
      if (!skills.critical.includes(skill) &&
          !skills.important.includes(skill) &&
          !skills.bonus.includes(skill)) {
        skills.critical.push(skill);
      }
    }

    // Limit sizes
    skills.critical = skills.critical.slice(0, 10);
    skills.important = skills.important.slice(0, 10);
    skills.bonus = skills.bonus.slice(0, 10);
    skills.all = [...skills.critical, ...skills.important, ...skills.bonus];

    return skills;
  }

  /**
   * Detect seniority level
   * @private
   */
  static _detectSeniority(text) {
    for (const [level, keywords] of Object.entries(this.SENIORITY_KEYWORDS)) {
      for (const keyword of keywords) {
        if (text.includes(keyword)) {
          return {
            level,
            confidence: 0.8,
            yearsRange: this._extractYearsRange(text)
          };
        }
      }
    }

    return {
      level: 'mid',
      confidence: 0.5,
      yearsRange: null
    };
  }

  /**
   * Extract years of experience range
   * @private
   */
  static _extractYearsRange(text) {
    const regex = /(\d+)\s*[-+]?\s*(\d+)?\s*years?/gi;
    const matches = text.match(regex);

    if (matches && matches.length > 0) {
      const nums = matches[0].match(/\d+/g);
      return {
        min: parseInt(nums[0]),
        max: nums[1] ? parseInt(nums[1]) : parseInt(nums[0]) + 3
      };
    }

    return null;
  }

  /**
   * Extract responsibilities
   * @private
   */
  static _extractResponsibilities(text) {
    const responsibilities = [];
    const lines = text.split('\n');

    let inResponsibilitiesSection = false;
    let count = 0;

    for (let line of lines) {
      if (/responsibilities|your role|you will/i.test(line)) {
        inResponsibilitiesSection = true;
        continue;
      }

      if (inResponsibilitiesSection && /requirements|qualifications|benefits/i.test(line)) {
        break;
      }

      if (inResponsibilitiesSection && line.match(/^[\s]*[-•*]/)) {
        const resp = line.replace(/^[\s]*[-•*]/, '').trim();
        if (resp.length > 10) {
          responsibilities.push(resp);
          count++;
          if (count >= 8) break;
        }
      }
    }

    return responsibilities;
  }

  /**
   * Extract requirements
   * @private
   */
  static _extractRequirements(text) {
    const requirements = [];
    const lines = text.split('\n');

    let inRequirementsSection = false;
    let count = 0;

    for (let line of lines) {
      if (/requirements|qualifications|must have|required/i.test(line)) {
        inRequirementsSection = true;
        continue;
      }

      if (inRequirementsSection && /preferred|nice to have|benefits/i.test(line)) {
        break;
      }

      if (inRequirementsSection && line.match(/^[\s]*[-•*]/)) {
        const req = line.replace(/^[\s]*[-•*]/, '').trim();
        if (req.length > 10) {
          requirements.push(req);
          count++;
          if (count >= 8) break;
        }
      }
    }

    return requirements;
  }

  /**
   * Extract compensation info
   * @private
   */
  static _extractCompensation(text) {
    const salaryRegex = /\$[\d,]+(?:\s*-\s*\$[\d,]+)?/;
    const match = text.match(salaryRegex);

    if (match) {
      return {
        salary: match[0],
        currency: 'USD',
        mentioned: true
      };
    }

    return { mentioned: false };
  }

  /**
   * Empty parse result
   * @private
   */
  static _emptyParse() {
    return {
      status: 'error',
      message: 'Invalid or empty job description',
      skills: { critical: [], important: [], bonus: [], all: [] },
      seniority: { level: 'mid', confidence: 0 },
      responsibilities: [],
      requirements: []
    };
  }

  /**
   * Validate parsed JD
   */
  static validate(parsed) {
    const errors = [];

    if (!parsed.skills || parsed.skills.all.length === 0) {
      errors.push('No skills detected');
    }

    if (!parsed.sections || Object.keys(parsed.sections).length < 2) {
      errors.push('Job description appears incomplete');
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }
}

module.exports = JobDescriptionParser;
