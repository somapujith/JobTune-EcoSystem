/**
 * ATS Checker V2 Routes
 * Comprehensive job-specific resume optimization
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const auth = require('../middleware/auth');

// V2 Services
const JobDescriptionParser = require('../services/v2/jobDescriptionParser');
const SkillClassifier = require('../services/v2/skillClassifier');
const ATSScorer = require('../services/v2/atsScorer');
const ResumeMatcher = require('../services/v2/resumeMatcher');
const ResumeEnhancementEngine = require('../services/v2/resumeEnhancementEngine');
const InterviewProbabilityPredictor = require('../services/v2/interviewProbabilityPredictor');
const ResumeAnalysisEngine = require('../services/v2/resumeAnalysisEngine');
const ResumeDatabase = require('../services/resumeDatabase');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

/**
 * POST /api/ats/v2/check
 * Main ATS check endpoint
 * Takes resume and job description, returns comprehensive analysis
 */
router.post('/v2/check', auth, async (req, res) => {
  try {
    const { resumeText, jobDescriptionText } = req.body;

    if (!resumeText || !jobDescriptionText) {
      return res.status(400).json({
        status: 'error',
        message: 'Both resume text and job description text required'
      });
    }

    const startTime = Date.now();

    // Stage 1-2: Parse job description
    const jobDescription = JobDescriptionParser.parse(jobDescriptionText);

    if (jobDescription.status === 'error') {
      return res.status(400).json({
        status: 'error',
        message: 'Failed to parse job description',
        details: jobDescription.message
      });
    }

    // Get resume analysis
    const resumeAnalysis = ResumeAnalysisEngine.analyze(resumeText);

    // Stage 3: Score ATS
    const atsResult = ATSScorer.score(resumeText, jobDescription, resumeAnalysis);

    // Stage 4: Match resume to JD
    const matchResult = ResumeMatcher.match(resumeText, jobDescription);
    const matchReport = ResumeMatcher.generateReport(resumeText, jobDescription, matchResult);

    // Stage 5: Predict interview probability
    const prediction = InterviewProbabilityPredictor.predict(
      atsResult.totalScore,
      matchResult.overallMatch,
      {
        hasMetrics: (resumeAnalysis.analysis?.metrics?.count || 0) >= 5,
        hasRelevantExperience: resumeText.length > 1000,
        hasMissingCriticalSkills: jobDescription.skills?.critical?.length > 0
      }
    );

    const processingTime = Date.now() - startTime;

    // Return comprehensive analysis
    return res.json({
      status: 'success',
      message: 'ATS analysis completed',
      analysis: {
        atsScore: {
          score: atsResult.totalScore,
          maxScore: atsResult.maxScore,
          breakdown: atsResult.breakdown,
          interpretation: ATSScorer.interpretScore(atsResult.totalScore)
        },
        jobMatch: {
          overall: matchResult.overallMatch,
          skillMatch: matchResult.skillMatch,
          responsibilityMatch: matchResult.responsibilityMatch,
          experienceMatch: matchResult.experienceMatch,
          seniorityMatch: matchResult.seniorittyMatch,
          interpretation: matchReport.interpretation,
          recommendations: matchReport.recommendations
        },
        keywords: atsResult.analysis,
        interviewProbability: prediction,
        jobDescription: {
          skills: jobDescription.skills,
          seniority: jobDescription.seniority,
          responsibilities: jobDescription.responsibilities.slice(0, 5)
        }
      },
      actionItems: this._generateActionItems(atsResult, matchResult, prediction),
      processingTimeMs: processingTime,
      next: 'Use /v2/enhance to improve resume for this specific job'
    });
  } catch (error) {
    console.error('ATS check error:', error);
    res.status(500).json({
      status: 'error',
      message: 'ATS analysis failed',
      details: error.message
    });
  }
});

/**
 * POST /api/ats/v2/enhance
 * Enhance resume for specific job
 */
router.post('/v2/enhance', auth, async (req, res) => {
  try {
    const { resumeText, jobDescriptionText } = req.body;

    if (!resumeText || !jobDescriptionText) {
      return res.status(400).json({
        status: 'error',
        message: 'Resume and job description text required'
      });
    }

    // Parse job description
    const jobDescription = JobDescriptionParser.parse(jobDescriptionText);

    // Get current analysis
    const currentAnalysis = ResumeAnalysisEngine.analyze(resumeText);
    const currentATS = ATSScorer.score(resumeText, jobDescription, currentAnalysis);

    // Enhance resume
    const startTime = Date.now();
    const enhancement = await ResumeEnhancementEngine.enhance(
      resumeText,
      jobDescription,
      {
        analysis: {
          missingSkills: {
            critical: (jobDescription.skills?.critical || []).filter(skill =>
              !resumeText.toLowerCase().includes(skill.toLowerCase())
            ),
            important: (jobDescription.skills?.important || []).filter(skill =>
              !resumeText.toLowerCase().includes(skill.toLowerCase())
            ),
            bonus: (jobDescription.skills?.bonus || []).filter(skill =>
              !resumeText.toLowerCase().includes(skill.toLowerCase())
            )
          }
        }
      }
    );
    const enhancementTime = Date.now() - startTime;

    if (enhancement.status !== 'success') {
      // Provide fallback suggestions
      const suggestions = ResumeEnhancementEngine.getBasicSuggestions(
        resumeText,
        jobDescription
      );

      return res.json({
        status: 'partial',
        message: 'AI enhancement unavailable, providing suggestions',
        suggestions,
        fallback: true
      });
    }

    // Re-analyze enhanced resume
    const enhancedAnalysis = ResumeAnalysisEngine.analyze(enhancement.enhancedResume);
    const enhancedATS = ATSScorer.score(enhancement.enhancedResume, jobDescription, enhancedAnalysis);

    // Compare predictions
    const currentPrediction = InterviewProbabilityPredictor.predict(
      currentATS.totalScore,
      75, // Default match
      {}
    );

    const enhancedPrediction = InterviewProbabilityPredictor.predict(
      enhancedATS.totalScore,
      75,
      {}
    );

    return res.json({
      status: 'success',
      message: 'Resume enhancement completed',
      enhancement: {
        originalResume: resumeText,
        enhancedResume: enhancement.enhancedResume,
        notes: enhancement.notes
      },
      comparison: {
        before: {
          atsScore: currentATS.totalScore,
          interviewProbability: currentPrediction.interviewProbability
        },
        after: {
          atsScore: enhancedATS.totalScore,
          interviewProbability: enhancedPrediction.interviewProbability
        },
        improvement: {
          atsScoreGain: enhancedATS.totalScore - currentATS.totalScore,
          probabilityGain: enhancedPrediction.interviewProbability - currentPrediction.interviewProbability
        }
      },
      processingTimeMs: enhancementTime,
      nextSteps: {
        download: 'Download the enhanced resume and apply',
        recheck: 'Use /v2/check to verify the improved ATS score'
      }
    });
  } catch (error) {
    console.error('Enhancement error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Enhancement failed',
      details: error.message
    });
  }
});

/**
 * POST /api/ats/v2/gap-report
 * Get detailed gap report between resume and JD
 */
router.post('/v2/gap-report', auth, async (req, res) => {
  try {
    const { resumeText, jobDescriptionText } = req.body;

    if (!resumeText || !jobDescriptionText) {
      return res.status(400).json({
        status: 'error',
        message: 'Both texts required'
      });
    }

    const jobDescription = JobDescriptionParser.parse(jobDescriptionText);
    const atsAnalysis = ATSScorer.score(resumeText, jobDescription);

    return res.json({
      status: 'success',
      gapReport: {
        skillGaps: {
          critical: atsAnalysis.analysis.missingSkills.critical,
          important: atsAnalysis.analysis.missingSkills.important,
          bonus: atsAnalysis.analysis.missingSkills.bonus
        },
        foundSkills: {
          critical: atsAnalysis.analysis.foundSkills.critical,
          important: atsAnalysis.analysis.foundSkills.important,
          bonus: atsAnalysis.analysis.foundSkills.bonus
        },
        keywordMatches: {
          matched: atsAnalysis.analysis.keywordMatches.found.length,
          missing: atsAnalysis.analysis.keywordMatches.notFound.length,
          matchPercentage: atsAnalysis.analysis.keywordMatches.matchPercentage
        },
        summary: {
          criticalGapCount: atsAnalysis.analysis.missingSkills.critical.length,
          totalSkillsRequired: jobDescription.skills.all.length,
          completeCoveragePercentage: Math.round(
            ((jobDescription.skills.all.length - atsAnalysis.analysis.missingSkills.critical.length) /
              jobDescription.skills.all.length) * 100
          )
        }
      }
    });
  } catch (error) {
    console.error('Gap report error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Gap report generation failed',
      details: error.message
    });
  }
});

/**
 * Helper: Generate action items
 */
router._generateActionItems = (atsResult, matchResult, prediction) => {
  const items = [];

  // ATS-based actions
  if (atsResult.totalScore < 70) {
    items.push({
      priority: 'high',
      action: 'Improve ATS Score',
      recommendation: `Current ATS score is ${atsResult.totalScore}. Add missing keywords and improve formatting.`
    });
  }

  // Match-based actions
  if (matchResult.skillMatch < 70) {
    items.push({
      priority: 'high',
      action: 'Address Skill Gaps',
      recommendation: 'Highlight experience with required skills or consider training.'
    });
  }

  // Interview probability guidance
  if (prediction.interviewProbability < 50) {
    items.push({
      priority: 'critical',
      action: 'Significant Improvements Needed',
      recommendation: prediction.recommendation.next
    });
  } else if (prediction.interviewProbability < 70) {
    items.push({
      priority: 'high',
      action: 'Optimize Before Applying',
      recommendation: 'Use enhancement tool to improve resume for this job.'
    });
  }

  return items;
};

module.exports = router;
