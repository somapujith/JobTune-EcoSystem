/**
 * Resume Critic Engine - AI-powered feedback generation
 * Provides detailed strengths and weaknesses analysis
 * Latency Target: 8-15 seconds
 */

const axios = require('axios');

class ResumeCriticEngine {
  static LM_STUDIO_URL = process.env.LM_STUDIO_URL || 'http://localhost:1234/v1';
  static MODEL = 'qwen-3.5-9b';
  static TIMEOUT = 45000; // 45 seconds

  /**
   * Generate detailed criticism and feedback
   * @param {string} resumeText - Resume text
   * @param {string} detectedRole - Detected role
   * @param {object} analysis - Analysis results
   * @returns {object} Critic feedback
   */
  static async generateFeedback(resumeText, detectedRole, analysis) {
    if (!resumeText || typeof resumeText !== 'string') {
      return {
        status: 'error',
        message: 'Invalid resume text'
      };
    }

    try {
      const prompt = this._buildCriticPrompt(resumeText, detectedRole, analysis);
      const response = await this._callLLM(prompt);

      return {
        status: 'success',
        feedback: this._parseFeedback(response),
        score: analysis?.overallScore || 0
      };
    } catch (error) {
      console.error('Resume criticism error:', error);
      return {
        status: 'error',
        message: error.message || 'Feedback generation failed'
      };
    }
  }

  /**
   * Build critic prompt
   * @private
   */
  static _buildCriticPrompt(resume, role, analysis) {
    return `You are an expert career coach and resume reviewer.

Analyze this resume for a ${role} position and provide specific, actionable feedback.

RESUME:
${resume}

Provide feedback in this exact format:

TOP STRENGTHS:
1. [Strength 1]
2. [Strength 2]
3. [Strength 3]

TOP AREAS FOR IMPROVEMENT:
1. [Area 1] - [Specific suggestion]
2. [Area 2] - [Specific suggestion]
3. [Area 3] - [Specific suggestion]

NOTABLE OBSERVATIONS:
[2-3 sentences about overall resume quality]

HIRING MANAGER PERSPECTIVE:
What would a hiring manager think? [Brief perspective]

NEXT STEPS FOR IMPROVEMENT:
1. [Action 1]
2. [Action 2]
3. [Action 3]`;
  }

  /**
   * Call LLM
   * @private
   */
  static async _callLLM(prompt) {
    try {
      const response = await axios.post(
        `${this.LM_STUDIO_URL}/chat/completions`,
        {
          model: this.MODEL,
          messages: [
            {
              role: 'system',
              content: 'You are an expert career coach with 20+ years of experience. Provide specific, actionable feedback.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 1500,
          top_p: 0.9
        },
        { timeout: this.TIMEOUT }
      );

      return response.data?.choices?.[0]?.message?.content || '';
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error('LM Studio service unavailable');
      }
      throw error;
    }
  }

  /**
   * Parse feedback response
   * @private
   */
  static _parseFeedback(response) {
    const feedback = {
      strengths: [],
      weaknesses: [],
      observations: '',
      hiringPerspective: '',
      nextSteps: []
    };

    // Parse strengths
    const strengthsMatch = response.match(/TOP STRENGTHS:\s*([\s\S]*?)(?=TOP AREAS|$)/i);
    if (strengthsMatch) {
      const strengths = strengthsMatch[1].trim().split('\n');
      feedback.strengths = strengths
        .filter(s => s.match(/^\d+\./))
        .map(s => s.replace(/^\d+\.\s*/, '').trim())
        .filter(s => s.length > 0)
        .slice(0, 5);
    }

    // Parse weaknesses
    const weaknessesMatch = response.match(/TOP AREAS FOR IMPROVEMENT:\s*([\s\S]*?)(?=NOTABLE|$)/i);
    if (weaknessesMatch) {
      const weaknesses = weaknessesMatch[1].trim().split('\n');
      feedback.weaknesses = weaknesses
        .filter(w => w.match(/^\d+\./))
        .map(w => w.replace(/^\d+\.\s*/, '').trim())
        .filter(w => w.length > 0)
        .slice(0, 5);
    }

    // Parse observations
    const observationsMatch = response.match(/NOTABLE OBSERVATIONS:\s*([\s\S]*?)(?=HIRING MANAGER|$)/i);
    if (observationsMatch) {
      feedback.observations = observationsMatch[1].trim().slice(0, 300);
    }

    // Parse hiring manager perspective
    const perspectiveMatch = response.match(/HIRING MANAGER PERSPECTIVE:\s*([\s\S]*?)(?=NEXT STEPS|$)/i);
    if (perspectiveMatch) {
      feedback.hiringPerspective = perspectiveMatch[1].trim().slice(0, 300);
    }

    // Parse next steps
    const nextStepsMatch = response.match(/NEXT STEPS FOR IMPROVEMENT:\s*([\s\S]*?)$/i);
    if (nextStepsMatch) {
      const steps = nextStepsMatch[1].trim().split('\n');
      feedback.nextSteps = steps
        .filter(s => s.match(/^\d+\./))
        .map(s => s.replace(/^\d+\.\s*/, '').trim())
        .filter(s => s.length > 0)
        .slice(0, 5);
    }

    return feedback;
  }

  /**
   * Generate quick feedback (rule-based fallback)
   */
  static generateQuickFeedback(analysis) {
    const feedback = {
      strengths: [],
      weaknesses: [],
      observations: '',
      hiringPerspective: '',
      nextSteps: []
    };

    // Build strengths from analysis
    if (analysis?.quality?.keyStrengths) {
      feedback.strengths = analysis.quality.keyStrengths;
    }

    // Build weaknesses from analysis
    if (analysis?.quality?.keyWeaknesses) {
      feedback.weaknesses = analysis.quality.keyWeaknesses;
    }

    // Add observations
    const score = analysis?.overallScore || 0;
    if (score >= 80) {
      feedback.observations = 'Your resume is well-structured with strong content. Focus on tailoring for specific roles.';
    } else if (score >= 60) {
      feedback.observations = 'Good foundation. Add more quantified achievements and stronger action verbs to improve impact.';
    } else {
      feedback.observations = 'Needs improvement. Focus on adding metrics, restructuring, and enhancing keyword coverage.';
    }

    // Hiring perspective
    if (score >= 75) {
      feedback.hiringPerspective = 'A hiring manager would likely move this to the next round of screening.';
    } else if (score >= 60) {
      feedback.hiringPerspective = 'Would be considered, but needs stronger differentiation from other candidates.';
    } else {
      feedback.hiringPerspective = 'May be filtered out by ATS or initial screening due to weak optimization.';
    }

    // Next steps
    if (analysis?.recommendations) {
      feedback.nextSteps = analysis.recommendations
        .slice(0, 3)
        .map(r => r.message);
    }

    return feedback;
  }
}

module.exports = ResumeCriticEngine;
