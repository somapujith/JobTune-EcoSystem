/**
 * Resume Analysis Engine V2 - Main orchestrator
 * Fully deterministic, rule-based ATS Score Checker — no AI/LLM anywhere.
 *
 * ATS Score formula (100 pts total):
 *   Contact 10 | Structure 20 | Formatting 20 | Skills 15
 *   Experience 15 | Projects 10 | Education 5 | Readability 5
 *
 * Every deduction has a visible reason (issues[]) and every recommendation
 * is generated from a predefined rule (recommendations[]).
 *
 * Latency Target: <100ms
 */

const SectionAnalyzer = require('./sectionAnalyzer');
const MetricsAnalyzer = require('./metricsAnalyzer');
const ActionVerbAnalyzer = require('./actionVerbAnalyzer');
const FormattingAnalyzer = require('./formattingAnalyzer');
const RoleDetectionEngine = require('./roleDetectionEngine');
const MissingInfoEngine = require('./missingInfoEngine');
const ContactValidator = require('./contactValidator');
const ProjectAnalyzer = require('./projectAnalyzer');
const ExperienceAnalyzer = require('./experienceAnalyzer');
const ReadabilityAnalyzer = require('./readabilityAnalyzer');
const SkillsAnalyzer = require('./skillsAnalyzer');
const EducationAnalyzer = require('./educationAnalyzer');
const CertificationAnalyzer = require('./certificationAnalyzer');

class ResumeAnalysisEngine {
  // Weighted contribution of each category toward the 100-point ATS Score
  static WEIGHTS = {
    contact: 10,
    structure: 20,
    formatting: 20,
    skills: 15,
    experience: 15,
    projects: 10,
    education: 5,
    readability: 5
  };

  static analyze(resumeText, fileContent = null) {
    if (!resumeText || typeof resumeText !== 'string' || resumeText.trim().length === 0) {
      return this._emptyAnalysis();
    }

    const startTime = Date.now();

    const roleDetection = RoleDetectionEngine.detect(resumeText);

    // Run every deterministic analyzer
    const contactAnalysis = ContactValidator.analyze(resumeText);
    const sectionAnalysis = SectionAnalyzer.analyze(resumeText);
    const formattingAnalysis = FormattingAnalyzer.analyze(resumeText, fileContent);
    const skillsAnalysis = SkillsAnalyzer.analyze(resumeText);
    const experienceAnalysis = ExperienceAnalyzer.analyze(resumeText);
    const projectAnalysis = ProjectAnalyzer.analyze(resumeText);
    const educationAnalysis = EducationAnalyzer.analyze(resumeText);
    const certificationAnalysis = CertificationAnalyzer.analyze(resumeText);
    const readabilityAnalysis = ReadabilityAnalyzer.analyze(resumeText);
    const metricsAnalysis = MetricsAnalyzer.analyze(resumeText);
    const actionVerbAnalysis = ActionVerbAnalyzer.analyze(resumeText);
    const missingInfoAnalysis = MissingInfoEngine.analyze(resumeText);

    // Rescale each category's raw score onto its weight in the 100-point formula
    const categoryScores = {
      contact: this._rescale(contactAnalysis.score, ContactValidator.MAX_SCORE, this.WEIGHTS.contact),
      structure: this._rescale(sectionAnalysis.score, SectionAnalyzer.MAX_SCORE, this.WEIGHTS.structure),
      formatting: this._rescale(formattingAnalysis.score, FormattingAnalyzer.MAX_SCORE, this.WEIGHTS.formatting),
      skills: this._rescale(skillsAnalysis.score, SkillsAnalyzer.MAX_SCORE, this.WEIGHTS.skills),
      experience: this._rescale(experienceAnalysis.score, ExperienceAnalyzer.MAX_SCORE, this.WEIGHTS.experience),
      projects: this._rescale(projectAnalysis.score, ProjectAnalyzer.MAX_SCORE, this.WEIGHTS.projects),
      education: this._rescale(educationAnalysis.score, EducationAnalyzer.MAX_SCORE, this.WEIGHTS.education),
      readability: this._rescale(readabilityAnalysis.score, ReadabilityAnalyzer.MAX_SCORE, this.WEIGHTS.readability)
    };

    const overallScore = Math.round(Object.values(categoryScores).reduce((sum, v) => sum + v, 0));
    const completeness = this._calculateCompleteness({
      contactAnalysis, sectionAnalysis, skillsAnalysis, experienceAnalysis,
      projectAnalysis, educationAnalysis
    });

    const issues = this._buildIssueList({
      contactAnalysis, sectionAnalysis, formattingAnalysis, skillsAnalysis,
      experienceAnalysis, projectAnalysis, educationAnalysis, metricsAnalysis
    });

    const recommendations = this._buildRecommendationEngine(issues);

    const processingTime = Date.now() - startTime;

    return {
      status: 'success',
      overallScore: Math.min(overallScore, 100),
      maxScore: 100,
      processingTimeMs: processingTime,
      atsCompatible: formattingAnalysis.atsCompatible && overallScore >= 60,

      detectedRole: {
        role: roleDetection.role,
        displayName: RoleDetectionEngine.getRoleDisplayName(roleDetection.role),
        confidence: Math.round(roleDetection.confidence * 100)
      },

      // ATS Score breakdown — weight-scaled, sums to 100
      scores: {
        contact: Math.round(categoryScores.contact * 10) / 10,
        structure: Math.round(categoryScores.structure * 10) / 10,
        formatting: Math.round(categoryScores.formatting * 10) / 10,
        skills: Math.round(categoryScores.skills * 10) / 10,
        experience: Math.round(categoryScores.experience * 10) / 10,
        projects: Math.round(categoryScores.projects * 10) / 10,
        education: Math.round(categoryScores.education * 10) / 10,
        readability: Math.round(categoryScores.readability * 10) / 10
      },
      maxScores: { ...this.WEIGHTS },

      contactInfo: {
        score: contactAnalysis.score,
        maxScore: contactAnalysis.maxScore,
        found: contactAnalysis.found,
        missing: contactAnalysis.missingLabels
      },

      // Detailed per-category analysis (raw, unscaled)
      analysis: {
        section: sectionAnalysis,
        metrics: metricsAnalysis,
        actionVerbs: actionVerbAnalysis,
        formatting: formattingAnalysis,
        skills: skillsAnalysis,
        missingInfo: missingInfoAnalysis,
        experience: experienceAnalysis,
        projects: projectAnalysis,
        education: educationAnalysis,
        certifications: certificationAnalysis,
        readability: readabilityAnalysis,
        contact: contactAnalysis
      },

      summary: {
        foundSections: sectionAnalysis.foundSections,
        missingSections: sectionAnalysis.missingSections,
        metricsCount: metricsAnalysis.count,
        strongVerbsCount: actionVerbAnalysis.strongVerbCount,
        weakVerbsCount: actionVerbAnalysis.weakVerbCount,
        skillsCount: skillsAnalysis.count,
        completeness,
        criticalIssues: issues.filter(i => i.severity === 'critical').length,
        jobsFound: experienceAnalysis.jobsFound,
        projectsFound: projectAnalysis.projectsFound
      },

      // Step 17: Issue Detection Engine output
      issues,

      // Step 18: Recommendation Engine output
      recommendations,

      quality: {
        overallQuality: this._assessOverallQuality(overallScore),
        readyForSubmission: overallScore >= 75,
        keyStrengths: this._getKeyStrengths({ categoryScores, contactAnalysis, metricsAnalysis, actionVerbAnalysis, formattingAnalysis, skillsAnalysis, projectAnalysis }),
        keyWeaknesses: this._getKeyWeaknesses({ categoryScores, issues })
      }
    };
  }

  /**
   * Rescale a raw score from its native max onto a target weight
   * @private
   */
  static _rescale(rawScore, rawMax, targetWeight) {
    if (!rawMax || rawMax <= 0) return 0;
    return Math.max(0, Math.min(targetWeight, (rawScore / rawMax) * targetWeight));
  }

  /**
   * Step 15: Resume Completeness Score = completed fields / expected fields x 100
   * @private
   */
  static _calculateCompleteness({ contactAnalysis, sectionAnalysis, skillsAnalysis, experienceAnalysis, projectAnalysis, educationAnalysis }) {
    const expectedFields = [
      contactAnalysis.found.name,
      contactAnalysis.found.email,
      contactAnalysis.found.phone,
      contactAnalysis.found.linkedin,
      contactAnalysis.found.github,
      sectionAnalysis.foundSections.length > 0,
      skillsAnalysis.count > 0,
      experienceAnalysis.jobsFound > 0,
      projectAnalysis.projectsFound > 0,
      educationAnalysis.entries.length > 0
    ];

    const completed = expectedFields.filter(Boolean).length;
    return Math.round((completed / expectedFields.length) * 100);
  }

  /**
   * Step 17: Issue Detection Engine — every issue has a visible, specific reason.
   * @private
   */
  static _buildIssueList({ contactAnalysis, sectionAnalysis, formattingAnalysis, skillsAnalysis, experienceAnalysis, projectAnalysis, educationAnalysis, metricsAnalysis }) {
    const issues = [];

    for (const missing of contactAnalysis.missing) {
      issues.push({ severity: missing === 'email' || missing === 'name' ? 'critical' : 'medium', message: `Missing ${ContactValidator.FIELDS[missing]?.label || missing}` });
    }

    for (const missingSection of sectionAnalysis.missingSections) {
      issues.push({ severity: 'high', message: `No ${missingSection} section found` });
    }

    for (const formattingIssue of formattingAnalysis.issues) {
      issues.push({ severity: formattingIssue.penalty >= 5 ? 'high' : 'medium', message: formattingIssue.message });
    }

    if (skillsAnalysis.count === 0) {
      issues.push({ severity: 'critical', message: 'No recognized technical skills found' });
    }
    if (skillsAnalysis.duplicates.length > 0) {
      issues.push({ severity: 'low', message: `Duplicate skills listed: ${skillsAnalysis.duplicates.join(', ')}` });
    }

    for (const job of experienceAnalysis.jobs) {
      for (const field of job.missing) {
        issues.push({ severity: 'high', message: `Experience entry "${job.title}" is missing ${field}` });
      }
    }

    for (const project of projectAnalysis.projects) {
      for (const field of project.missing) {
        issues.push({ severity: 'medium', message: `Project "${project.title}" is missing ${field}` });
      }
    }

    if (educationAnalysis.issues) {
      for (const issue of educationAnalysis.issues) {
        issues.push({ severity: 'medium', message: issue.message });
      }
    }

    if (metricsAnalysis.count === 0) {
      issues.push({ severity: 'high', message: 'No quantified achievements detected (numbers, percentages, metrics)' });
    }

    return issues;
  }

  /**
   * Step 18: Recommendation Engine — one rule-based recommendation per issue category.
   * @private
   */
  static _buildRecommendationEngine(issues) {
    const recommendations = [];
    const seen = new Set();

    const ruleFor = (issue) => {
      const msg = issue.message.toLowerCase();
      if (msg.includes('missing email') || msg.includes('missing full name')) {
        return { recommendation: 'Add complete contact information', reason: issue.message };
      }
      if (msg.includes('linkedin')) {
        return { recommendation: 'Add your LinkedIn profile URL', reason: issue.message };
      }
      if (msg.includes('github')) {
        return { recommendation: 'Add your GitHub profile URL', reason: issue.message };
      }
      if (msg.includes('no professional summary') || msg.includes('no summary')) {
        return { recommendation: 'Add a Professional Summary section', reason: 'Professional Summary section not found' };
      }
      if (msg.includes('section found')) {
        return { recommendation: `Add the missing section: ${issue.message.replace('No ', '').replace(' section found', '')}`, reason: issue.message };
      }
      if (msg.includes('table') || msg.includes('column') || msg.includes('image') || msg.includes('icon') || msg.includes('header/footer') || msg.includes('text box')) {
        return { recommendation: 'Simplify resume formatting for ATS compatibility', reason: issue.message };
      }
      if (msg.includes('no recognized technical skills')) {
        return { recommendation: 'Add a Technical Skills section with relevant technologies', reason: issue.message };
      }
      if (msg.includes('duplicate skills')) {
        return { recommendation: 'Remove duplicate skill entries', reason: issue.message };
      }
      if (msg.includes('missing company') || msg.includes('missing role') || msg.includes('missing duration') || msg.includes('missing description')) {
        return { recommendation: 'Complete all experience entry fields (company, role, duration, description)', reason: issue.message };
      }
      if (msg.includes('project') && (msg.includes('missing project name') || msg.includes('missing description') || msg.includes('missing technologies'))) {
        return { recommendation: 'Add measurable project outcomes and technologies used', reason: issue.message };
      }
      if (msg.includes('no quantified achievements')) {
        return { recommendation: 'Add measurable project outcomes', reason: 'No quantified achievements detected' };
      }
      return { recommendation: issue.message, reason: issue.message };
    };

    for (const issue of issues) {
      const { recommendation, reason } = ruleFor(issue);
      const key = recommendation;
      if (seen.has(key)) continue;
      seen.add(key);
      recommendations.push({ severity: issue.severity, message: recommendation, reason });
    }

    return recommendations;
  }

  static _assessOverallQuality(score) {
    if (score >= 90) return 'excellent';
    if (score >= 75) return 'good';
    if (score >= 60) return 'fair';
    if (score >= 40) return 'poor';
    return 'critical';
  }

  static _getKeyStrengths({ categoryScores, contactAnalysis, metricsAnalysis, actionVerbAnalysis, formattingAnalysis, skillsAnalysis, projectAnalysis }) {
    const strengths = [];

    if (contactAnalysis.score === contactAnalysis.maxScore) {
      strengths.push('Complete contact information (name, email, phone, LinkedIn, GitHub)');
    }
    if (categoryScores.skills >= this.WEIGHTS.skills * 0.85) {
      strengths.push(`Good Skills Section (${skillsAnalysis.count} recognized skills)`);
    }
    if (categoryScores.projects >= this.WEIGHTS.projects * 0.8) {
      strengths.push('Strong Projects');
    }
    if (metricsAnalysis.count >= 5) {
      strengths.push(`Strong use of metrics (${metricsAnalysis.count} quantified achievements)`);
    }
    if (actionVerbAnalysis.strongVerbCount >= 10) {
      strengths.push(`Excellent action verb usage (${actionVerbAnalysis.strongVerbCount} strong verbs)`);
    }
    if (formattingAnalysis.atsCompatible) {
      strengths.push('Good ATS formatting — no compatibility issues detected');
    }

    return strengths.slice(0, 3);
  }

  static _getKeyWeaknesses({ categoryScores, issues }) {
    const weaknesses = [];
    const critical = issues.filter(i => i.severity === 'critical' || i.severity === 'high');

    for (const issue of critical.slice(0, 3)) {
      weaknesses.push(issue.message);
    }

    return weaknesses;
  }

  static _emptyAnalysis() {
    return {
      status: 'error',
      message: 'Invalid or empty resume text',
      overallScore: 0,
      maxScore: 100,
      atsCompatible: false,
      analysis: {},
      issues: [{ severity: 'critical', message: 'No resume content detected' }],
      recommendations: [{ severity: 'critical', message: 'Upload a valid resume file', reason: 'No resume content detected' }]
    };
  }
}

module.exports = ResumeAnalysisEngine;
