/**
 * Resume Enhancement Engine - AI-powered resume improvement for specific job
 * Uses Qwen 3.5 9B to insert keywords and improve relevance
 * Latency Target: 10 seconds
 */

const axios = require('axios');

class ResumeEnhancementEngine {
  static LM_STUDIO_URL = process.env.LM_STUDIO_URL || 'http://localhost:1234/v1';
  static MODEL = 'qwen-3.5-9b';
  static TIMEOUT = 45000;

  /**
   * Enhance resume for specific job
   * @param {string} resumeText - Original resume
   * @param {object} jobDescription - Parsed JD
   * @param {object} atsAnalysis - ATS analysis results
   * @returns {Promise} Enhanced resume
   */
  static async enhance(resumeText, jobDescription, atsAnalysis) {
    if (!resumeText || !jobDescription) {
      return {
        status: 'error',
        message: 'Invalid input'
      };
    }

    try {
      const prompt = this._buildEnhancementPrompt(
        resumeText,
        jobDescription,
        atsAnalysis
      );

      const enhancedResume = await this._callLLM(prompt);

      return {
        status: 'success',
        originalResume: resumeText,
        enhancedResume,
        enhancements: this._trackEnhancements(resumeText, enhancedResume),
        notes: this._generateNotes(jobDescription, atsAnalysis)
      };
    } catch (error) {
      console.error('Resume enhancement error:', error);
      return {
        status: 'error',
        message: error.message || 'Enhancement failed',
        originalResume: resumeText
      };
    }
  }

  /**
   * Build enhancement prompt
   * @private
   */
  static _buildEnhancementPrompt(resume, jd, analysis) {
    const missingSkills = analysis?.analysis?.missingSkills || {};
    const critical = (missingSkills.critical || []).slice(0, 5).join(', ');
    const important = (missingSkills.important || []).slice(0, 5).join(', ');

    return `You are an ATS optimization expert.

Enhance this resume to better match this job description.

ORIGINAL RESUME:
${resume}

TARGET JOB REQUIREMENTS:
Title: ${jd.sections?.summary || 'Not specified'}

Key Requirements:
- Critical Skills: ${jd.skills?.critical?.join(', ') || 'Not available'}
- Important Skills: ${jd.skills?.important?.join(', ') || 'Not available'}

Responsibilities:
${(jd.responsibilities || []).slice(0, 3).map((r, i) => `${i + 1}. ${r}`).join('\n')}

CURRENT GAPS:
Missing Critical Skills: ${critical || 'None'}
Missing Important Skills: ${important || 'None'}

ENHANCEMENT INSTRUCTIONS:
1. Add missing keywords naturally within existing content
2. Do NOT add false information
3. Reframe existing achievements to highlight relevant skills
4. Improve clarity and impact of descriptions
5. Maintain truthfulness and professionalism
6. Focus on the missing critical skills first
7. Return enhanced resume as plain text
8. Keep original structure and format

ENHANCED RESUME:`;
  }

  /**
   * Call LLM for enhancement
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
              content: 'You are an expert ATS resume optimizer. Enhance resumes while preserving truthfulness and professionalism. Never add false claims.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.6,
          max_tokens: 2500,
          top_p: 0.9
        },
        { timeout: this.TIMEOUT }
      );

      return response.data?.choices?.[0]?.message?.content || '';
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error('LM Studio unavailable on port 1234');
      }
      throw error;
    }
  }

  /**
   * Track what was enhanced
   * @private
   */
  static _trackEnhancements(original, enhanced) {
    const changes = [];

    // Count length changes
    if (enhanced.length > original.length) {
      changes.push({
        type: 'expansion',
        difference: enhanced.length - original.length
      });
    }

    // Track skill additions
    // (In a real scenario, would use edit distance or diff)
    const originalWords = new Set(original.toLowerCase().match(/\b\w+\b/g) || []);
    const enhancedWords = new Set(enhanced.toLowerCase().match(/\b\w+\b/g) || []);

    const addedWords = [...enhancedWords].filter(w => !originalWords.has(w));

    if (addedWords.length > 0) {
      changes.push({
        type: 'keywords_added',
        count: addedWords.length,
        examples: addedWords.slice(0, 5)
      });
    }

    return changes;
  }

  /**
   * Generate enhancement notes
   * @private
   */
  static _generateNotes(jd, analysis) {
    const notes = [];

    const missingCritical = analysis?.analysis?.missingSkills?.critical || [];
    const missingImportant = analysis?.analysis?.missingSkills?.important || [];

    if (missingCritical.length > 0) {
      notes.push(`Added context for critical skills: ${missingCritical.slice(0, 2).join(', ')}`);
    }

    if (missingImportant.length > 0) {
      notes.push(`Highlighted experience with: ${missingImportant.slice(0, 2).join(', ')}`);
    }

    notes.push('Improved clarity of achievements');
    notes.push('Optimized for ATS keyword matching');

    return notes;
  }

  /**
   * Validate enhanced resume
   */
  static validateEnhanced(enhanced) {
    const errors = [];

    if (!enhanced || enhanced.length === 0) {
      errors.push('Empty enhanced resume');
    }

    if (enhanced.length < 100) {
      errors.push('Enhanced resume too short');
    }

    // Check for placeholder text
    if (/\[.*?\]|{.*?}|TODO|PLACEHOLDER/i.test(enhanced)) {
      errors.push('Contains placeholder text');
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * Get enhancement suggestions (rule-based fallback)
   */
  static getBasicSuggestions(resume, jd) {
    const suggestions = [];

    const missingSkills = jd.skills?.critical || [];
    for (const skill of missingSkills.slice(0, 3)) {
      if (!resume.toLowerCase().includes(skill.toLowerCase())) {
        suggestions.push({
          type: 'missing_skill',
          skill,
          suggestion: `Add experience with ${skill} to relevant job duties`
        });
      }
    }

    // Check for weak verbs
    const weakVerbs = ['was', 'helped', 'worked', 'did'];
    for (const verb of weakVerbs) {
      if (new RegExp(`\\b${verb}\\b`, 'i').test(resume)) {
        suggestions.push({
          type: 'weak_verb',
          verb,
          suggestion: `Replace "${verb}" with stronger action verb like "led", "built", or "developed"`
        });
      }
    }

    return suggestions;
  }
}

module.exports = ResumeEnhancementEngine;
