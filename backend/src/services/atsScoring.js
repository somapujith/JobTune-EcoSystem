const ResumeStructure = require('./resumeStructure');

class ATSScoring {
  /**
   * Calculate deterministic ATS score with detailed breakdown
   * Total: 100 points
   * - Section Completeness: 30
   * - Keyword Relevance: 25
   * - Formatting: 15
   * - Action Verbs: 15
   * - Quantifiable Achievements: 15
   */
  static calculateScore(resumeText, keywords = []) {
    const scores = {
      sections: this.scoreSectionCompleteness(resumeText),
      keywords: ResumeStructure.analyzeKeywords(resumeText, keywords).score,
      formatting: ResumeStructure.analyzeFormatting(resumeText).score,
      actionVerbs: ResumeStructure.countActionVerbs(resumeText).score,
      metrics: ResumeStructure.detectMetrics(resumeText).score
    };

    const total = Object.values(scores).reduce((a, b) => a + b, 0);

    return {
      total: Math.min(Math.round(total), 100),
      breakdown: {
        'Section Completeness (30)': scores.sections,
        'Keyword Relevance (25)': scores.keywords,
        'Formatting (15)': scores.formatting,
        'Action Verbs (15)': scores.actionVerbs,
        'Quantifiable Achievements (15)': scores.metrics
      },
      details: {
        sections: ResumeStructure.analyzeStructure(resumeText),
        missingSections: ResumeStructure.getMissingSections(ResumeStructure.analyzeStructure(resumeText)),
        actionVerbs: ResumeStructure.countActionVerbs(resumeText),
        metrics: ResumeStructure.detectMetrics(resumeText),
        formatting: ResumeStructure.analyzeFormatting(resumeText)
      }
    };
  }

  /**
   * Score section completeness (30 points max)
   * Professional Summary = 5
   * Experience = 5
   * Education = 5
   * Skills = 5
   * Projects = 5
   * Certifications = 5
   */
  static scoreSectionCompleteness(resumeText) {
    const structure = ResumeStructure.analyzeStructure(resumeText);
    let score = 0;

    const sections = [
      { name: 'summary', points: 5 },
      { name: 'experience', points: 5 },
      { name: 'education', points: 5 },
      { name: 'skills', points: 5 },
      { name: 'projects', points: 5 },
      { name: 'certifications', points: 5 }
    ];

    for (const section of sections) {
      if (structure[section.name] && structure[section.name].length > 0) {
        score += section.points;
      }
    }

    return score;
  }

  /**
   * Compare two scores and generate improvement summary
   */
  static compareScores(beforeScore, afterScore) {
    const improvement = afterScore - beforeScore;
    const percentImprovement = ((improvement / beforeScore) * 100).toFixed(1);

    return {
      before: beforeScore,
      after: afterScore,
      improvement,
      percentImprovement: parseFloat(percentImprovement),
      status: improvement > 20 ? 'excellent' : improvement > 10 ? 'good' : 'fair'
    };
  }

  /**
   * Generate actionable recommendations based on score
   */
  static generateRecommendations(analysis) {
    const recs = [];

    if (analysis.details.missingSections.includes('summary')) {
      recs.push({
        priority: 'high',
        action: 'Add Professional Summary',
        why: 'Professional summary is the first section ATS parsers read. It boosts compatibility significantly.',
        impact: '+5 points'
      });
    }

    if (analysis.details.missingSections.includes('skills')) {
      recs.push({
        priority: 'high',
        action: 'Create Dedicated Skills Section',
        why: 'ATS relies on this section for keyword extraction. Separate from work descriptions.',
        impact: '+5 points'
      });
    }

    if (analysis.details.actionVerbs.count < 5) {
      recs.push({
        priority: 'high',
        action: 'Add Strong Action Verbs',
        why: 'Action verbs signal ownership and impact. Preferred by ATS scoring algorithms.',
        impact: `+${Math.min((10 - analysis.details.actionVerbs.count) * 2, 10)} points`
      });
    }

    if (analysis.details.metrics.count < 3) {
      recs.push({
        priority: 'medium',
        action: 'Quantify Achievements',
        why: 'Metrics (%, $, numbers) demonstrate measurable impact. Increases relevance score.',
        impact: `+${Math.min((8 - analysis.details.metrics.count) * 2, 10)} points`
      });
    }

    if (analysis.details.formatting.issues.length > 0) {
      recs.push({
        priority: 'medium',
        action: 'Fix Formatting Issues',
        why: analysis.details.formatting.issues[0],
        impact: `+${Math.min(analysis.details.formatting.issues.length * 3, 10)} points`
      });
    }

    return recs;
  }
}

module.exports = ATSScoring;
