/**
 * Skill Classifier - Categorizes skills by importance
 * No AI - Uses rules and patterns
 * Latency Target: <50ms
 */

class SkillClassifier {
  static SKILL_TAXONOMY = {
    // Frontend Skills
    'react': { category: 'frontend', type: 'framework', importance: 'critical' },
    'vue': { category: 'frontend', type: 'framework', importance: 'important' },
    'angular': { category: 'frontend', type: 'framework', importance: 'important' },
    'javascript': { category: 'frontend', type: 'language', importance: 'critical' },
    'typescript': { category: 'frontend', type: 'language', importance: 'important' },
    'html': { category: 'frontend', type: 'markup', importance: 'critical' },
    'css': { category: 'frontend', type: 'style', importance: 'critical' },
    'nextjs': { category: 'frontend', type: 'framework', importance: 'important' },
    'svelte': { category: 'frontend', type: 'framework', importance: 'bonus' },

    // Backend Skills
    'node.js': { category: 'backend', type: 'runtime', importance: 'critical' },
    'python': { category: 'backend', type: 'language', importance: 'critical' },
    'java': { category: 'backend', type: 'language', importance: 'critical' },
    'golang': { category: 'backend', type: 'language', importance: 'important' },
    'rust': { category: 'backend', type: 'language', importance: 'important' },
    'c#': { category: 'backend', type: 'language', importance: 'important' },
    'php': { category: 'backend', type: 'language', importance: 'important' },

    // Database Skills
    'postgresql': { category: 'database', type: 'relational', importance: 'critical' },
    'mysql': { category: 'database', type: 'relational', importance: 'critical' },
    'mongodb': { category: 'database', type: 'nosql', importance: 'important' },
    'redis': { category: 'database', type: 'cache', importance: 'important' },
    'firebase': { category: 'database', type: 'backend-as-service', importance: 'bonus' },
    'dynamodb': { category: 'database', type: 'nosql', importance: 'important' },

    // DevOps Skills
    'docker': { category: 'devops', type: 'containerization', importance: 'critical' },
    'kubernetes': { category: 'devops', type: 'orchestration', importance: 'important' },
    'aws': { category: 'cloud', type: 'cloud-provider', importance: 'critical' },
    'azure': { category: 'cloud', type: 'cloud-provider', importance: 'important' },
    'gcp': { category: 'cloud', type: 'cloud-provider', importance: 'important' },
    'ci/cd': { category: 'devops', type: 'automation', importance: 'critical' },
    'jenkins': { category: 'devops', type: 'automation', importance: 'important' },
    'gitlab': { category: 'devops', type: 'automation', importance: 'bonus' },

    // Tools
    'git': { category: 'tools', type: 'version-control', importance: 'critical' },
    'jira': { category: 'tools', type: 'project-management', importance: 'important' },
    'figma': { category: 'tools', type: 'design', importance: 'important' },

    // Soft Skills
    'communication': { category: 'soft', type: 'interpersonal', importance: 'critical' },
    'leadership': { category: 'soft', type: 'interpersonal', importance: 'important' },
    'problem-solving': { category: 'soft', type: 'cognitive', importance: 'critical' },
    'collaboration': { category: 'soft', type: 'interpersonal', importance: 'critical' },
    'teamwork': { category: 'soft', type: 'interpersonal', importance: 'important' }
  };

  /**
   * Classify skills
   * @param {string[]} skills - List of skills
   * @param {string} role - Target role (optional)
   * @returns {object} Classified skills
   */
  static classify(skills, role = null) {
    if (!Array.isArray(skills)) {
      return {
        critical: [],
        important: [],
        bonus: [],
        byCategory: {},
        unrecognized: []
      };
    }

    const classified = {
      critical: [],
      important: [],
      bonus: [],
      byCategory: {},
      unrecognized: []
    };

    for (const skill of skills) {
      const normalized = skill.toLowerCase().trim();
      const taxonomy = this.SKILL_TAXONOMY[normalized];

      if (taxonomy) {
        // Categorize by importance
        classified[taxonomy.importance].push({
          skill: skill,
          category: taxonomy.category,
          type: taxonomy.type,
          importance: taxonomy.importance
        });

        // Group by category
        if (!classified.byCategory[taxonomy.category]) {
          classified.byCategory[taxonomy.category] = [];
        }
        classified.byCategory[taxonomy.category].push(skill);
      } else {
        // Unknown skill - try fuzzy matching
        const fuzzyMatch = this._fuzzyMatch(normalized);
        if (fuzzyMatch) {
          classified[fuzzyMatch.importance].push({
            skill: skill,
            category: fuzzyMatch.category,
            type: fuzzyMatch.type,
            importance: fuzzyMatch.importance,
            fuzzyMatched: true
          });
        } else {
          classified.unrecognized.push(skill);
        }
      }
    }

    return this._cleanupClassification(classified);
  }

  /**
   * Fuzzy match unknown skills
   * @private
   */
  static _fuzzyMatch(skill) {
    // Check for partial matches
    for (const [knownSkill, taxonomy] of Object.entries(this.SKILL_TAXONOMY)) {
      if (skill.includes(knownSkill) || knownSkill.includes(skill)) {
        return taxonomy;
      }
    }

    // Check for known patterns
    if (skill.includes('js') || skill.includes('javascript')) {
      return this.SKILL_TAXONOMY['javascript'];
    }
    if (skill.includes('py') || skill.includes('python')) {
      return this.SKILL_TAXONOMY['python'];
    }
    if (skill.includes('sql')) {
      return this.SKILL_TAXONOMY['postgresql'];
    }

    return null;
  }

  /**
   * Cleanup and validate classification
   * @private
   */
  static _cleanupClassification(classified) {
    // Remove duplicates
    classified.critical = this._deduplicateSkills(classified.critical);
    classified.important = this._deduplicateSkills(classified.important);
    classified.bonus = this._deduplicateSkills(classified.bonus);

    // Sort by importance
    classified.critical = classified.critical.sort((a, b) =>
      b.category.localeCompare(a.category)
    );
    classified.important = classified.important.sort((a, b) =>
      b.category.localeCompare(a.category)
    );

    return classified;
  }

  /**
   * Remove duplicate skills
   * @private
   */
  static _deduplicateSkills(skills) {
    const seen = new Set();
    return skills.filter(item => {
      const key = item.skill.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Get skills for a specific role
   */
  static getRequiredSkillsForRole(role) {
    const roleSkillMap = {
      'frontend-developer': {
        critical: ['javascript', 'react', 'html', 'css'],
        important: ['typescript', 'git', 'problem-solving'],
        bonus: ['nextjs', 'vue']
      },
      'backend-developer': {
        critical: ['python', 'node.js', 'postgresql', 'problem-solving'],
        important: ['api', 'docker', 'git'],
        bonus: ['golang', 'kubernetes']
      },
      'full-stack-developer': {
        critical: ['javascript', 'react', 'node.js', 'postgresql'],
        important: ['typescript', 'docker', 'git'],
        bonus: ['devops', 'aws']
      },
      'devops-engineer': {
        critical: ['docker', 'kubernetes', 'aws', 'ci/cd'],
        important: ['terraform', 'linux', 'scripting'],
        bonus: ['golang', 'monitoring']
      }
    };

    return roleSkillMap[role] || null;
  }

  /**
   * Calculate skill match percentage
   */
  static calculateSkillMatch(resumeSkills, requiredSkills) {
    const resumeSkillsLower = resumeSkills.map(s => s.toLowerCase());

    let matchScore = 0;
    let totalWeight = 0;

    // Critical skills (weight: 3)
    for (const skill of requiredSkills.critical) {
      totalWeight += 3;
      if (resumeSkillsLower.some(rs => rs.includes(skill.toLowerCase()))) {
        matchScore += 3;
      }
    }

    // Important skills (weight: 2)
    for (const skill of requiredSkills.important) {
      totalWeight += 2;
      if (resumeSkillsLower.some(rs => rs.includes(skill.toLowerCase()))) {
        matchScore += 2;
      }
    }

    // Bonus skills (weight: 1)
    for (const skill of requiredSkills.bonus) {
      totalWeight += 1;
      if (resumeSkillsLower.some(rs => rs.includes(skill.toLowerCase()))) {
        matchScore += 1;
      }
    }

    return {
      score: totalWeight > 0 ? Math.round((matchScore / totalWeight) * 100) : 0,
      matched: matchScore,
      total: totalWeight,
      percentage: totalWeight > 0 ? (matchScore / totalWeight) * 100 : 0
    };
  }

  /**
   * Get missing skills
   */
  static getMissingSkills(resumeSkills, requiredSkills) {
    const resumeSkillsLower = resumeSkills.map(s => s.toLowerCase());
    const missing = {
      critical: [],
      important: [],
      bonus: []
    };

    for (const skill of requiredSkills.critical) {
      if (!resumeSkillsLower.some(rs => rs.includes(skill.toLowerCase()))) {
        missing.critical.push(skill);
      }
    }

    for (const skill of requiredSkills.important) {
      if (!resumeSkillsLower.some(rs => rs.includes(skill.toLowerCase()))) {
        missing.important.push(skill);
      }
    }

    for (const skill of requiredSkills.bonus) {
      if (!resumeSkillsLower.some(rs => rs.includes(skill.toLowerCase()))) {
        missing.bonus.push(skill);
      }
    }

    return missing;
  }
}

module.exports = SkillClassifier;
