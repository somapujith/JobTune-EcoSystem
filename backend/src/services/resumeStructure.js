const SECTION_PATTERNS = {
  summary: /(?:summary|profile|overview|professional\s+summary|objective|about)/i,
  experience: /(?:experience|work\s+history|employment|professional\s+experience|career)/i,
  education: /(?:education|academic|degree|university|college|school)/i,
  skills: /(?:skills|technical\s+skills|competencies|expertise|abilities)/i,
  projects: /(?:projects|portfolio|work|portfolio\s+projects|personal\s+projects)/i,
  certifications: /(?:certifications|certificates|credentials|licenses|qualifications)/i,
  achievements: /(?:achievements|awards|honors|recognition|accomplishments)/i,
};

const ACTION_VERBS = [
  'developed', 'built', 'created', 'designed', 'architected',
  'implemented', 'deployed', 'optimized', 'improved', 'enhanced',
  'led', 'managed', 'directed', 'coordinated', 'oversaw',
  'increased', 'reduced', 'accelerated', 'streamlined', 'automated',
  'collaborated', 'partnered', 'communicated', 'presented', 'trained',
  'analyzed', 'researched', 'identified', 'solved', 'fixed',
  'launched', 'released', 'shipped', 'delivered', 'completed',
  'achieved', 'exceeded', 'surpassed', 'won', 'earned'
];

const METRICS_PATTERN = /(\d+)\s*(%|ms|sec|seconds|minutes|hours|days|weeks|months|years|gb|mb|kb|\$|€|£|₹|x|times|fold)/gi;

class ResumeStructure {
  /**
   * Analyze resume structure and extract sections
   */
  static analyzeStructure(resumeText) {
    if (!resumeText) return this.emptyStructure();

    const lines = resumeText.split('\n').map(l => l.trim()).filter(l => l);
    const structure = this.emptyStructure();
    let currentSection = 'summary';

    for (const line of lines) {
      // Detect section headers
      let foundSection = false;
      for (const [section, pattern] of Object.entries(SECTION_PATTERNS)) {
        if (pattern.test(line) && line.length < 100) {
          currentSection = section;
          foundSection = true;
          break;
        }
      }

      // Add content to current section
      if (!foundSection && line.length > 0) {
        if (!structure[currentSection]) structure[currentSection] = [];
        structure[currentSection].push(line);
      }
    }

    return structure;
  }

  /**
   * Detect which sections exist
   */
  static detectSections(resumeText) {
    const exists = {};
    for (const [section] of Object.entries(SECTION_PATTERNS)) {
      exists[section] = resumeText.toLowerCase().includes(section);
    }
    return exists;
  }

  /**
   * Get missing critical sections
   */
  static getMissingSections(structure) {
    const missing = [];
    const critical = ['summary', 'experience', 'education', 'skills'];

    for (const section of critical) {
      if (!structure[section] || structure[section].length === 0) {
        missing.push(section);
      }
    }

    return missing;
  }

  /**
   * Count action verbs in resume
   */
  static countActionVerbs(resumeText) {
    const text = resumeText.toLowerCase();
    const found = [];

    for (const verb of ACTION_VERBS) {
      if (text.includes(verb)) {
        found.push(verb);
      }
    }

    return {
      count: found.length,
      verbs: found,
      score: Math.min(found.length * 2, 15) // Max 15 points
    };
  }

  /**
   * Detect quantifiable metrics
   */
  static detectMetrics(resumeText) {
    const matches = resumeText.match(METRICS_PATTERN);
    const count = matches ? matches.length : 0;

    return {
      count,
      examples: matches ? matches.slice(0, 5) : [],
      score: Math.min(count * 1.5, 15) // Max 15 points
    };
  }

  /**
   * Analyze formatting issues
   */
  static analyzeFormatting(resumeText) {
    const issues = [];
    const lines = resumeText.split('\n');

    // Check for inconsistent spacing
    const emptyLineCount = lines.filter(l => l.trim() === '').length;
    if (emptyLineCount > lines.length * 0.3) {
      issues.push('Excessive whitespace - may confuse ATS parsing');
    }

    // Check for special characters
    const specialChars = resumeText.match(/[^\w\s\-.,;:\[\]()]/g);
    if (specialChars && specialChars.length > resumeText.length * 0.05) {
      issues.push('Too many special characters - ATS may struggle parsing');
    }

    // Check for consistent date formats
    const dateFormats = resumeText.match(/(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2}|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/gi);
    if (!dateFormats || dateFormats.length < 2) {
      issues.push('Missing or inconsistent date formats');
    }

    // Check line length
    const longLines = lines.filter(l => l.length > 120).length;
    if (longLines > lines.length * 0.2) {
      issues.push('Some lines exceed standard width - may break formatting');
    }

    return {
      count: issues.length,
      issues,
      score: Math.max(15 - issues.length * 3, 0) // Max 15 points
    };
  }

  /**
   * Check keyword density
   */
  static analyzeKeywords(resumeText, keywords = []) {
    if (keywords.length === 0) {
      return { coverage: 0, found: [], missing: [] };
    }

    const text = resumeText.toLowerCase();
    const found = keywords.filter(kw => text.includes(kw.toLowerCase()));
    const missing = keywords.filter(kw => !text.includes(kw.toLowerCase()));
    const coverage = (found.length / keywords.length) * 100;

    return {
      coverage: Math.round(coverage),
      found,
      missing,
      score: Math.min((coverage / 100) * 25, 25) // Max 25 points
    };
  }

  static emptyStructure() {
    return {
      summary: [],
      experience: [],
      education: [],
      skills: [],
      projects: [],
      certifications: [],
      achievements: []
    };
  }
}

module.exports = ResumeStructure;
