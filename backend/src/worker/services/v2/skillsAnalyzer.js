/**
 * Skills Analyzer - Deterministic skills section scoring
 * Max Score: 15 Points
 *
 * Rules (no AI / no role inference):
 *  - Skills section exists: +5
 *  - Skill count table: <5 -> 2, 5-10 -> 5, 10-20 -> 10 (scaled to remaining 10 pts), >20 -> 8
 *  - Duplicate skills: -2
 */

class SkillsAnalyzer {
  static MAX_SCORE = 15;
  static SECTION_EXISTS_POINTS = 5;
  static DUPLICATE_PENALTY = 2;

  // Predefined skill database — purely keyword matching, no AI.
  static SKILL_DATABASE = [
    // Programming languages
    'python', 'java', 'javascript', 'typescript', 'c++', 'c#', 'go', 'golang', 'rust', 'ruby', 'php', 'kotlin', 'swift', 'scala', 'r', 'matlab', 'perl', 'dart',
    // Web / frontend
    'react', 'react.js', 'vue', 'vue.js', 'angular', 'next.js', 'nextjs', 'nuxt', 'svelte', 'html', 'html5', 'css', 'css3', 'sass', 'tailwind', 'tailwind css', 'bootstrap', 'jquery', 'redux', 'webpack', 'vite', 'three.js', 'webgl', 'gsap',
    // Backend / frameworks
    'node.js', 'nodejs', 'express', 'express.js', 'django', 'flask', 'fastapi', 'spring', 'spring boot', '.net', 'asp.net', 'laravel', 'rails',
    // Databases
    'mysql', 'postgresql', 'mongodb', 'sqlite', 'redis', 'firebase', 'oracle', 'cassandra', 'dynamodb', 'sql', 'nosql',
    // Cloud / devops
    'aws', 'azure', 'gcp', 'google cloud', 'docker', 'kubernetes', 'terraform', 'ansible', 'jenkins', 'github actions', 'ci/cd', 'vercel', 'netlify', 'nginx',
    // Tools
    'git', 'github', 'gitlab', 'figma', 'photoshop', 'jira', 'postman', 'webpack',
    // Data / AI
    'machine learning', 'deep learning', 'tensorflow', 'pytorch', 'pandas', 'numpy', 'scikit-learn', 'nlp', 'computer vision', 'data analysis', 'tableau', 'power bi',
    // Mobile
    'react native', 'flutter', 'android', 'ios', 'swift', 'kotlin',
    // APIs / protocols
    'rest', 'rest api', 'rest apis', 'graphql', 'websocket', 'grpc',
    // Testing
    'jest', 'cypress', 'mocha', 'pytest', 'selenium', 'junit'
  ];

  static COUNT_TABLE = [
    { max: 5, points: 2 },
    { max: 10, points: 5 },
    { max: 20, points: 10 },
    { max: Infinity, points: 8 }
  ];

  static analyze(resumeText) {
    if (!resumeText || typeof resumeText !== 'string') {
      return { score: 0, maxScore: this.MAX_SCORE, sectionExists: false, skillsFound: [], count: 0, duplicates: [], recommendations: [] };
    }

    const sectionExists = this._sectionExists(resumeText);
    const skillsBlock = this._extractSkillsBlock(resumeText) || resumeText;
    const skillsFound = this._extractSkills(skillsBlock);
    const duplicates = this._findDuplicates(skillsBlock, skillsFound);

    let score = 0;
    const breakdown = { sectionExists: 0, countScore: 0, duplicatePenalty: 0 };

    if (sectionExists) {
      score += this.SECTION_EXISTS_POINTS;
      breakdown.sectionExists = this.SECTION_EXISTS_POINTS;
    }

    const countPoints = this._scoreByCount(skillsFound.length);
    score += countPoints;
    breakdown.countScore = countPoints;

    if (duplicates.length > 0) {
      score -= this.DUPLICATE_PENALTY;
      breakdown.duplicatePenalty = -this.DUPLICATE_PENALTY;
    }

    score = Math.max(0, Math.min(score, this.MAX_SCORE));

    return {
      score,
      maxScore: this.MAX_SCORE,
      percentage: (score / this.MAX_SCORE) * 100,
      sectionExists,
      skillsFound,
      count: skillsFound.length,
      duplicates,
      breakdown,
      categorized: this._categorize(skillsFound),
      recommendations: this._getRecommendations(sectionExists, skillsFound.length, duplicates)
    };
  }

  static _sectionExists(text) {
    return /^(technical\s+skills|skills|core\s+competencies|competencies)\s*:?\s*$/im.test(text);
  }

  /** Extract just the Skills section block so duplicate/count checks don't pick up mentions elsewhere in the resume. */
  static _extractSkillsBlock(text) {
    const headingPattern = /^(technical\s+skills|skills|core\s+competencies|competencies)\s*:?\s*$/im;
    const lines = text.split('\n');
    const startIdx = lines.findIndex(line => headingPattern.test(line.trim()));
    if (startIdx === -1) return null;

    const otherHeadings = /^(professional\s+experience|experience|education|key\s+projects(\s*(&|and)\s*achievements)?|projects?(\s*(&|and)\s*achievements)?|quantified\s+results|certifications?)\s*:?\s*$/i;
    let endIdx = lines.length;
    for (let i = startIdx + 1; i < lines.length; i++) {
      if (otherHeadings.test(lines[i].trim())) { endIdx = i; break; }
    }

    return lines.slice(startIdx + 1, endIdx).join('\n').trim();
  }

  static _extractSkills(text) {
    const lower = text.toLowerCase();
    const found = [];

    for (const skill of this.SKILL_DATABASE) {
      const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`, 'i');
      if (regex.test(lower)) found.push(skill);
    }

    return found;
  }

  static _findDuplicates(text, skillsFound) {
    const lower = text.toLowerCase();
    const duplicates = [];

    for (const skill of skillsFound) {
      const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`, 'gi');
      const matches = lower.match(regex) || [];
      if (matches.length > 1) duplicates.push(skill);
    }

    return duplicates;
  }

  static _scoreByCount(count) {
    if (count === 0) return 0;
    const tier = this.COUNT_TABLE.find(t => count < t.max) || this.COUNT_TABLE[this.COUNT_TABLE.length - 1];
    return tier.points;
  }

  static _categorize(skillsFound) {
    const categories = {
      'Programming Languages': ['python', 'java', 'javascript', 'typescript', 'c++', 'c#', 'go', 'golang', 'rust', 'ruby', 'php', 'kotlin', 'swift', 'scala', 'r', 'matlab', 'perl', 'dart'],
      'Frameworks & Libraries': ['react', 'react.js', 'vue', 'vue.js', 'angular', 'next.js', 'nextjs', 'nuxt', 'svelte', 'express', 'express.js', 'django', 'flask', 'fastapi', 'spring', 'spring boot', '.net', 'asp.net', 'laravel', 'rails', 'redux', 'three.js', 'gsap'],
      'Databases': ['mysql', 'postgresql', 'mongodb', 'sqlite', 'redis', 'firebase', 'oracle', 'cassandra', 'dynamodb', 'sql', 'nosql'],
      'Cloud & DevOps': ['aws', 'azure', 'gcp', 'google cloud', 'docker', 'kubernetes', 'terraform', 'ansible', 'jenkins', 'github actions', 'ci/cd', 'vercel', 'netlify', 'nginx'],
      'Developer Tools': ['git', 'github', 'gitlab', 'figma', 'photoshop', 'jira', 'postman', 'webpack', 'vite'],
      'Web Technologies': ['html', 'html5', 'css', 'css3', 'sass', 'tailwind', 'tailwind css', 'bootstrap', 'jquery', 'webgl'],
      'Data & AI': ['machine learning', 'deep learning', 'tensorflow', 'pytorch', 'pandas', 'numpy', 'scikit-learn', 'nlp', 'computer vision', 'data analysis', 'tableau', 'power bi'],
      'Mobile': ['react native', 'flutter', 'android', 'ios'],
      'Testing': ['jest', 'cypress', 'mocha', 'pytest', 'selenium', 'junit']
    };

    const result = {};
    for (const [category, members] of Object.entries(categories)) {
      const matched = skillsFound.filter(s => members.includes(s));
      if (matched.length > 0) result[category] = matched;
    }

    return result;
  }

  static _getRecommendations(sectionExists, count, duplicates) {
    const recommendations = [];

    if (!sectionExists) {
      recommendations.push({ severity: 'critical', message: 'Add a Technical Skills section.' });
    }

    if (count < 5) {
      recommendations.push({ severity: 'high', message: `Only ${count} recognized skills found — list more relevant technologies.` });
    } else if (count > 20) {
      recommendations.push({ severity: 'medium', message: 'Skill list is very long — focus on the most relevant skills for the role.' });
    }

    if (duplicates.length > 0) {
      recommendations.push({ severity: 'low', message: `Remove duplicate skill mentions: ${duplicates.join(', ')}` });
    }

    return recommendations;
  }
}

module.exports = SkillsAnalyzer;
