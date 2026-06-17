/**
 * Resume Critic Engine - Rule-based feedback generation
 * Builds strengths/weaknesses/next-steps from the deterministic analysis report.
 * No AI/LLM involved.
 */

class ResumeCriticEngine {
  /**
   * Generate quick feedback from a deterministic analysis report
   */
  static generateQuickFeedback(analysis) {
    const feedback = {
      strengths: [],
      weaknesses: [],
      observations: '',
      hiringPerspective: '',
      nextSteps: []
    };

    if (analysis?.quality?.keyStrengths) {
      feedback.strengths = analysis.quality.keyStrengths;
    }

    if (analysis?.quality?.keyWeaknesses) {
      feedback.weaknesses = analysis.quality.keyWeaknesses;
    }

    const score = analysis?.overallScore || 0;
    if (score >= 80) {
      feedback.observations = 'Your resume is well-structured with strong content. Focus on tailoring for specific roles.';
    } else if (score >= 60) {
      feedback.observations = 'Good foundation. Add more quantified achievements and stronger action verbs to improve impact.';
    } else {
      feedback.observations = 'Needs improvement. Focus on adding metrics, restructuring, and enhancing keyword coverage.';
    }

    if (score >= 75) {
      feedback.hiringPerspective = 'A hiring manager would likely move this to the next round of screening.';
    } else if (score >= 60) {
      feedback.hiringPerspective = 'Would be considered, but needs stronger differentiation from other candidates.';
    } else {
      feedback.hiringPerspective = 'May be filtered out by ATS or initial screening due to weak optimization.';
    }

    if (analysis?.recommendations) {
      feedback.nextSteps = analysis.recommendations
        .slice(0, 3)
        .map(r => r.message);
    }

    return feedback;
  }
}

module.exports = ResumeCriticEngine;
