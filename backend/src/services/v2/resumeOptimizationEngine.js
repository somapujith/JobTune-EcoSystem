/**
 * Resume Optimization Engine - AI-powered optimization
 * Uses Qwen 3.5 9B for improvements
 * Latency Target: 8-15 seconds
 */

const axios = require('axios');

class ResumeOptimizationEngine {
  static LM_STUDIO_URL = process.env.LM_STUDIO_URL || 'http://localhost:1234/v1';
  static MODEL = 'qwen-3.5-9b';
  static TIMEOUT = 45000; // 45 seconds

  /**
   * Optimize resume using AI
   * @param {string} originalResume - Original resume text
   * @param {string} detectedRole - User's detected role
   * @param {object} analysis - Initial analysis results
   * @returns {object} Optimization results
   */
  static async optimize(originalResume, detectedRole, analysis) {
    if (!originalResume || typeof originalResume !== 'string') {
      return {
        status: 'error',
        message: 'Invalid resume text'
      };
    }

    try {
      const optimizationPrompt = this._buildOptimizationPrompt(originalResume, detectedRole, analysis);

      const response = await this._callLLM(optimizationPrompt);

      return {
        status: 'success',
        originalResume,
        optimizedResume: response,
        optimizationNotes: this._generateOptimizationNotes(analysis)
      };
    } catch (error) {
      console.error('Resume optimization error:', error);
      return {
        status: 'error',
        message: error.message || 'Optimization failed',
        originalResume
      };
    }
  }

  /**
   * Build optimization prompt
   * @private
   */
  static _buildOptimizationPrompt(resume, role, analysis) {
    return `You are an expert resume writer and ATS optimizer.

Optimize the following resume for:
1. ATS (Applicant Tracking System) compatibility
2. Better keyword coverage
3. Stronger action verbs
4. Enhanced impact with metrics

RESUME:
${resume}

OPTIMIZATION REQUIREMENTS:
- Keep all information truthful and accurate
- Use ATS-friendly formatting (no special characters)
- Start bullet points with strong action verbs
- Add/enhance quantifiable metrics where possible
- Improve clarity and impact
- Return as plain text with clear section headers
- Maintain professional tone
- Do not add information that isn't in the original

TARGET ROLE: ${role}
CURRENT SCORE: ${analysis?.overallScore || 'unknown'}

OPTIMIZED RESUME:`;
  }

  /**
   * Call LLM API
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
              content: 'You are an expert resume writer. Provide clear, professional optimizations. Return plain text only.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 2000,
          top_p: 0.9
        },
        { timeout: this.TIMEOUT }
      );

      return response.data?.choices?.[0]?.message?.content || '';
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error('LM Studio service unavailable. Please ensure LM Studio is running on port 1234.');
      }
      throw error;
    }
  }

  /**
   * Generate optimization notes
   * @private
   */
  static _generateOptimizationNotes(analysis) {
    const notes = [];

    if (analysis?.summary?.metricsCount < 5) {
      notes.push('Added more quantifiable metrics to achievements');
    }

    if (analysis?.summary?.strongVerbsCount < 10) {
      notes.push('Replaced weak verbs with stronger action words');
    }

    if (analysis?.analysis?.keywords?.coverage < 60) {
      notes.push('Enhanced keyword coverage for better ATS matching');
    }

    if (!analysis?.atsCompatible) {
      notes.push('Fixed ATS compatibility issues with formatting');
    }

    notes.push('Improved overall impact and clarity of achievements');

    return notes;
  }

  /**
   * Validate optimized resume
   */
  static validateOptimizedResume(optimizedResume) {
    if (!optimizedResume || typeof optimizedResume !== 'string' || optimizedResume.length === 0) {
      return {
        valid: false,
        errors: ['Empty optimized resume']
      };
    }

    const errors = [];

    // Check minimum length
    if (optimizedResume.length < 200) {
      errors.push('Optimized resume too short (minimum 200 characters)');
    }

    // Check for required sections
    const hasExperience = /experience|employment/i.test(optimizedResume);
    const hasEducation = /education|degree|university/i.test(optimizedResume);
    const hasSkills = /skills?|expertise/i.test(optimizedResume);

    if (!hasExperience || !hasEducation || !hasSkills) {
      errors.push('Missing critical sections in optimized resume');
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }
}

module.exports = ResumeOptimizationEngine;
