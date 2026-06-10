/**
 * Resume Analysis Engine V2 - Main orchestrator
 * Combines all rule-based analyzers for instant scoring
 * Latency Target: <100ms
 */

const SectionAnalyzer = require('./sectionAnalyzer');
const MetricsAnalyzer = require('./metricsAnalyzer');
const ActionVerbAnalyzer = require('./actionVerbAnalyzer');
const FormattingAnalyzer = require('./formattingAnalyzer');
const KeywordAnalyzer = require('./keywordAnalyzer');
const RoleDetectionEngine = require('./roleDetectionEngine');
const MissingInfoEngine = require('./missingInfoEngine');

class ResumeAnalysisEngine {
  /**
   * Perform complete resume analysis (Stage 1-6)
   * @param {string} resumeText - Parsed resume text
   * @param {string} fileContent - Original file content (for format checking)
   * @returns {object} Complete analysis report
   */
  static analyze(resumeText, fileContent = null) {
    if (!resumeText || typeof resumeText !== 'string' || resumeText.trim().length === 0) {
      return this._emptyAnalysis();
    }

    const startTime = Date.now();

    // Stage 4: Role Detection
    const roleDetection = RoleDetectionEngine.detect(resumeText);

    // Stage 1: Section Analysis
    const sectionAnalysis = SectionAnalyzer.analyze(resumeText);

    // Stage 2: Metrics Analysis
    const metricsAnalysis = MetricsAnalyzer.analyze(resumeText);

    // Stage 3: Action Verb Analysis
    const actionVerbAnalysis = ActionVerbAnalyzer.analyze(resumeText);

    // Stage 4: Formatting Analysis
    const formattingAnalysis = FormattingAnalyzer.analyze(resumeText, fileContent);

    // Stage 5: Keyword Analysis
    const keywordAnalysis = KeywordAnalyzer.analyze(resumeText, roleDetection.role);

    // Stage 5: Missing Information
    const missingInfoAnalysis = MissingInfoEngine.analyze(resumeText);

    // Calculate overall score
    const overallScore = this._calculateOverallScore({
      section: sectionAnalysis.score,
      metrics: metricsAnalysis.score,
      actionVerbs: actionVerbAnalysis.score,
      formatting: formattingAnalysis.score,
      keywords: keywordAnalysis.score
    });

    const processingTime = Date.now() - startTime;

    return {
      // Overall Results
      status: 'success',
      overallScore: Math.round(overallScore),
      maxScore: 100,
      processingTimeMs: processingTime,
      atsCompatible: formattingAnalysis.atsCompatible && overallScore >= 60,

      // Detected Role
      detectedRole: {
        role: roleDetection.role,
        displayName: RoleDetectionEngine.getRoleDisplayName(roleDetection.role),
        confidence: Math.round(roleDetection.confidence * 100),
        candidates: roleDetection.candidates.map(c => ({
          role: RoleDetectionEngine.getRoleDisplayName(c.role),
          confidence: Math.round(c.confidence * 100)
        }))
      },

      // Individual Scores
      scores: {
        section: sectionAnalysis.score,
        metrics: metricsAnalysis.score,
        actionVerbs: actionVerbAnalysis.score,
        formatting: formattingAnalysis.score,
        keywords: keywordAnalysis.score
      },

      // Detailed Analysis
      analysis: {
        section: sectionAnalysis,
        metrics: metricsAnalysis,
        actionVerbs: actionVerbAnalysis,
        formatting: formattingAnalysis,
        keywords: keywordAnalysis,
        missingInfo: missingInfoAnalysis
      },

      // Key Metrics Summary
      summary: {
        foundSections: sectionAnalysis.foundSections,
        missingSections: sectionAnalysis.missingSections,
        metricsCount: metricsAnalysis.count,
        strongVerbsCount: actionVerbAnalysis.strongVerbCount,
        weakVerbsCount: actionVerbAnalysis.weakVerbCount,
        keywordsCovered: keywordAnalysis.keywords.found.length,
        keywordsTotal: keywordAnalysis.keywords.total,
        completeness: missingInfoAnalysis.completeness,
        criticalIssues: formattingAnalysis.issues.length
      },

      // Aggregated Recommendations
      recommendations: this._aggregateRecommendations({
        section: sectionAnalysis.missingSections.length > 0 ? SectionAnalyzer.getRecommendations(sectionAnalysis) : [],
        metrics: metricsAnalysis.recommendations,
        actionVerbs: actionVerbAnalysis.recommendations,
        formatting: formattingAnalysis.recommendations,
        keywords: keywordAnalysis.recommendations,
        missingInfo: missingInfoAnalysis.recommendations
      }),

      // Quality Assessment
      quality: {
        overallQuality: this._assessOverallQuality(overallScore),
        readyForSubmission: overallScore >= 75,
        readyForOptimization: overallScore < 85,
        keyStrengths: this._getKeyStrengths({
          section: sectionAnalysis,
          metrics: metricsAnalysis,
          actionVerbs: actionVerbAnalysis,
          formatting: formattingAnalysis,
          keywords: keywordAnalysis
        }),
        keyWeaknesses: this._getKeyWeaknesses({
          section: sectionAnalysis,
          metrics: metricsAnalysis,
          actionVerbs: actionVerbAnalysis,
          formatting: formattingAnalysis,
          keywords: keywordAnalysis,
          missingInfo: missingInfoAnalysis
        })
      }
    };
  }

  /**
   * Calculate overall score (weighted average)
   * @private
   */
  static _calculateOverallScore(scores) {
    const weights = {
      section: 0.25,    // 25%
      metrics: 0.20,    // 20%
      actionVerbs: 0.20, // 20%
      formatting: 0.15,  // 15%
      keywords: 0.20    // 20%
    };

    let total = 0;
    let weightSum = 0;

    for (const [key, weight] of Object.entries(weights)) {
      if (scores[key] !== undefined) {
        // Normalize to 0-100 scale
        const normalizedScore = (scores[key] / 30) * 100; // Assuming max is 30 or less per category
        total += normalizedScore * weight;
        weightSum += weight;
      }
    }

    return weightSum > 0 ? total / weightSum : 0;
  }

  /**
   * Assess overall quality
   * @private
   */
  static _assessOverallQuality(score) {
    if (score >= 90) return 'excellent';
    if (score >= 75) return 'good';
    if (score >= 60) return 'fair';
    if (score >= 40) return 'poor';
    return 'critical';
  }

  /**
   * Get key strengths
   * @private
   */
  static _getKeyStrengths(analyses) {
    const strengths = [];

    if (analyses.section.score >= 25) {
      strengths.push('Complete section structure with all essential components');
    }

    if (analyses.metrics.count >= 8) {
      strengths.push(`Strong use of metrics (${analyses.metrics.count} quantified achievements)`);
    }

    if (analyses.actionVerbs.strongVerbCount >= 10) {
      strengths.push(`Excellent action verb usage (${analyses.actionVerbs.strongVerbCount} strong verbs)`);
    }

    if (analyses.formatting.atsCompatible) {
      strengths.push('Good ATS formatting - no compatibility issues detected');
    }

    if (analyses.keywords.coverage >= 60) {
      strengths.push(`Good keyword coverage (${Math.round(analyses.keywords.coverage)}% of expected skills)`);
    }

    return strengths.slice(0, 3);
  }

  /**
   * Get key weaknesses
   * @private
   */
  static _getKeyWeaknesses(analyses) {
    const weaknesses = [];

    if (analyses.section.missingSections.length > 0) {
      weaknesses.push(`Missing sections: ${analyses.section.missingSections.join(', ')}`);
    }

    if (analyses.metrics.count < 3) {
      weaknesses.push('Few quantified metrics - add percentages, dollar amounts, or numbers');
    }

    if (analyses.actionVerbs.weakVerbCount > 3) {
      weaknesses.push(`${analyses.actionVerbs.weakVerbCount} weak verbs detected - replace with action words`);
    }

    if (!analyses.formatting.atsCompatible) {
      weaknesses.push(`${analyses.formatting.issues.length} ATS compatibility issues found`);
    }

    if (analyses.keywords.coverage < 40) {
      weaknesses.push(`Low keyword coverage (${Math.round(analyses.keywords.coverage)}%) - missing key skills`);
    }

    if (analyses.missingInfo.critical.length > 0) {
      weaknesses.push(`Missing critical information: ${analyses.missingInfo.critical.map(f => f.name).join(', ')}`);
    }

    return weaknesses.slice(0, 3);
  }

  /**
   * Aggregate all recommendations
   * @private
   */
  static _aggregateRecommendations(allRecommendations) {
    const recommendations = [];

    // Add high-priority recommendations from all analyzers
    for (const source of Object.values(allRecommendations)) {
      for (const rec of source) {
        if (rec.severity === 'critical' || rec.priority === 'high') {
          recommendations.push(rec);
        }
      }
    }

    // Add medium-priority recommendations
    if (recommendations.length < 5) {
      for (const source of Object.values(allRecommendations)) {
        for (const rec of source) {
          if (rec.severity === 'medium' || rec.priority === 'medium') {
            recommendations.push(rec);
          }
        }
      }
    }

    return recommendations.slice(0, 5); // Return top 5
  }

  /**
   * Empty analysis response
   * @private
   */
  static _emptyAnalysis() {
    return {
      status: 'error',
      message: 'Invalid or empty resume text',
      overallScore: 0,
      maxScore: 100,
      atsCompatible: false,
      analysis: {},
      recommendations: [{
        severity: 'critical',
        message: 'No resume content detected'
      }]
    };
  }
}

module.exports = ResumeAnalysisEngine;
