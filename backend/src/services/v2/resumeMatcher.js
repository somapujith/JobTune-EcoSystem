/**
 * Resume Matcher - Matches resume against job description
 * Uses text similarity and embeddings (simulated)
 * Latency Target: <200ms
 */

class ResumeMatcher {
  /**
   * Calculate match between resume and job description
   * @param {string} resumeText - Resume content
   * @param {object} jobDescription - Parsed job description
   * @returns {object} Match results
   */
  static match(resumeText, jobDescription) {
    if (!resumeText || !jobDescription) {
      return this._emptyMatch();
    }

    const results = {
      skillMatch: this._calculateSkillMatch(resumeText, jobDescription),
      responsibilityMatch: this._calculateResponsibilityMatch(resumeText, jobDescription),
      experienceMatch: this._calculateExperienceMatch(resumeText, jobDescription),
      seniorittyMatch: this._calculateSeniorityMatch(resumeText, jobDescription),
      overallMatch: 0
    };

    // Calculate overall match percentage
    results.overallMatch = Math.round(
      (results.skillMatch * 0.40) +
      (results.responsibilityMatch * 0.30) +
      (results.experienceMatch * 0.20) +
      (results.seniorittyMatch * 0.10)
    );

    return results;
  }

  /**
   * Calculate skill match percentage
   * @private
   */
  static _calculateSkillMatch(resumeText, jobDescription) {
    if (!jobDescription.skills || jobDescription.skills.all.length === 0) {
      return 0;
    }

    const text = resumeText.toLowerCase();
    let matched = 0;
    const criticalWeight = 1.5;

    // Critical skills
    for (const skill of jobDescription.skills.critical || []) {
      const regex = new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (regex.test(text)) {
        matched += criticalWeight;
      }
    }

    // Important skills
    for (const skill of jobDescription.skills.important || []) {
      const regex = new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (regex.test(text)) {
        matched += 1;
      }
    }

    // Bonus skills
    for (const skill of jobDescription.skills.bonus || []) {
      const regex = new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (regex.test(text)) {
        matched += 0.5;
      }
    }

    // Calculate percentage
    const criticalTotal = (jobDescription.skills.critical?.length || 0) * criticalWeight;
    const importantTotal = (jobDescription.skills.important?.length || 0) * 1;
    const bonusTotal = (jobDescription.skills.bonus?.length || 0) * 0.5;
    const totalWeight = criticalTotal + importantTotal + bonusTotal;

    return totalWeight > 0 ? Math.min(Math.round((matched / totalWeight) * 100), 100) : 0;
  }

  /**
   * Calculate responsibility match percentage
   * @private
   */
  static _calculateResponsibilityMatch(resumeText, jobDescription) {
    if (!jobDescription.responsibilities || jobDescription.responsibilities.length === 0) {
      return 50; // Default if no responsibilities extracted
    }

    const text = resumeText.toLowerCase();
    let matches = 0;

    // Extract keywords from responsibilities
    const keywords = this._extractKeywordsFromTexts(jobDescription.responsibilities);

    for (const keyword of keywords) {
      const regex = new RegExp(keyword, 'i');
      if (regex.test(text)) {
        matches++;
      }
    }

    const percentage = keywords.length > 0 ?
      (matches / keywords.length) * 100 : 50;

    return Math.round(Math.min(percentage, 100));
  }

  /**
   * Calculate experience match percentage
   * @private
   */
  static _calculateExperienceMatch(resumeText, jobDescription) {
    const text = resumeText.toLowerCase();

    // Check for experience indicators
    let score = 0;

    // Years of experience
    const yearsRange = jobDescription.seniority?.yearsRange;
    if (yearsRange) {
      const yearsRegex = /(\d+)\s*years?/gi;
      const matches = text.match(yearsRegex);

      if (matches && matches.length > 0) {
        const yearsFound = parseInt(matches[0]);
        if (yearsFound >= yearsRange.min && yearsFound <= yearsRange.max) {
          score += 30; // Good match
        } else if (yearsFound >= yearsRange.min - 1 && yearsFound <= yearsRange.max + 2) {
          score += 20; // Close match
        } else {
          score += 10; // Has experience but not exact range
        }
      }
    }

    // Check for relevant positions
    const roleIndicators = [
      'developer', 'engineer', 'architect', 'lead', 'senior',
      'manager', 'specialist', 'consultant'
    ];

    let roleMatches = 0;
    for (const role of roleIndicators) {
      if (text.includes(role)) {
        roleMatches++;
      }
    }

    score += Math.min(roleMatches * 5, 30);

    // Check for company types
    if (/startups?|startup|small|medium|enterprise|large|tech|company|corporation/i.test(text)) {
      score += 15;
    }

    // Check for relevant tools/tech
    const techKeywords = jobDescription.skills?.all || [];
    let techMatches = 0;
    for (const keyword of techKeywords.slice(0, 5)) {
      if (text.includes(keyword.toLowerCase())) {
        techMatches++;
      }
    }

    score += Math.min(techMatches * 5, 25);

    return Math.round(Math.min(score, 100));
  }

  /**
   * Calculate seniority match percentage
   * @private
   */
  static _calculateSeniorityMatch(resumeText, jobDescription) {
    const text = resumeText.toLowerCase();
    const seniorityLevel = jobDescription.seniority?.level;

    const seniorityKeywords = {
      entry: ['junior', 'graduate', 'internship', 'entry-level', 'fresh'],
      mid: ['mid-level', 'experienced', 'senior', 'lead', '3-5 years'],
      senior: ['senior', 'staff', 'principal', 'architect', 'director', '8+ years', 'leadership']
    };

    const keywords = seniorityKeywords[seniorityLevel] || [];
    let matches = 0;

    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        matches++;
      }
    }

    const percentage = keywords.length > 0 ?
      (matches / keywords.length) * 100 : 50;

    return Math.round(Math.min(percentage, 100));
  }

  /**
   * Extract keywords from text array
   * @private
   */
  static _extractKeywordsFromTexts(texts) {
    const keywords = new Set();
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'be', 'have',
      'has', 'do', 'does', 'did', 'will', 'would', 'should', 'can', 'could'
    ]);

    for (const text of texts) {
      const words = text.toLowerCase().match(/\b\w+\b/g) || [];
      for (const word of words) {
        if (word.length > 3 && !stopWords.has(word)) {
          keywords.add(word);
        }
      }
    }

    return Array.from(keywords).slice(0, 20);
  }

  /**
   * Generate match report
   */
  static generateReport(resumeText, jobDescription, matchResults) {
    return {
      overall: matchResults.overallMatch,
      skillMatch: matchResults.skillMatch,
      responsibilityMatch: matchResults.responsibilityMatch,
      experienceMatch: matchResults.experienceMatch,
      seniorityMatch: matchResults.seniorittyMatch,
      interpretation: this._interpretMatch(matchResults.overallMatch),
      recommendations: this._generateRecommendations(resumeText, jobDescription, matchResults)
    };
  }

  /**
   * Interpret match percentage
   * @private
   */
  static _interpretMatch(percentage) {
    if (percentage >= 90) return 'Excellent match for this position';
    if (percentage >= 80) return 'Very good match';
    if (percentage >= 70) return 'Good match with some gaps';
    if (percentage >= 60) return 'Moderate match - would need to upskill';
    if (percentage >= 50) return 'Below average match - significant gaps';
    return 'Poor match - consider different roles';
  }

  /**
   * Generate recommendations
   * @private
   */
  static _generateRecommendations(resumeText, jobDescription, matchResults) {
    const recommendations = [];

    if (matchResults.skillMatch < 70) {
      recommendations.push({
        category: 'skills',
        message: 'Add or highlight relevant technical skills mentioned in the job description'
      });
    }

    if (matchResults.responsibilityMatch < 70) {
      recommendations.push({
        category: 'responsibilities',
        message: 'Emphasize experience with similar responsibilities'
      });
    }

    if (matchResults.experienceMatch < 70) {
      recommendations.push({
        category: 'experience',
        message: 'Highlight relevant work experience and years'
      });
    }

    if (matchResults.seniorityMatch < 70) {
      recommendations.push({
        category: 'seniority',
        message: 'Ensure seniority level matches the job requirements'
      });
    }

    return recommendations;
  }

  /**
   * Empty match response
   * @private
   */
  static _emptyMatch() {
    return {
      skillMatch: 0,
      responsibilityMatch: 0,
      experienceMatch: 0,
      seniorityMatch: 0,
      overallMatch: 0,
      error: 'Invalid input'
    };
  }
}

module.exports = ResumeMatcher;
