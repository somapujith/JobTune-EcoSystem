/**
 * Job Guide Generator
 * Generates interview prep guides (questions, talking points, company research)
 * using LLM with a rule-based fallback when AI is unavailable.
 */

const { pool } = require('../../config/database');
const { callAI } = require('../../utils/aiClient');

// ─── Fallback template ────────────────────────────────────────────────────────

const GENERIC_QUESTIONS = [
  'Tell me about yourself and your professional background.',
  'Why are you interested in this role and company?',
  'Describe a challenging project you worked on and how you overcame obstacles.',
  'How do you prioritise tasks when managing multiple deadlines?',
  'Where do you see yourself in 3-5 years?',
  'What is your greatest professional achievement?',
  'How do you handle feedback and criticism?'
];

const GENERIC_TALKING_POINTS = [
  'Quantify your accomplishments with metrics where possible (e.g. reduced latency by 30%).',
  'Align your experience with the core requirements listed in the job description.',
  'Show enthusiasm for the company mission and recent initiatives.',
  'Prepare a concise 2-minute "about me" narrative that highlights your most relevant experience.'
];

/**
 * Build a template-based guide when LLM is unavailable.
 * @param {{ role?: string, company?: string }} context
 * @returns {{ questions: string[], talkingPoints: string[], companyResearch: string }}
 */
function buildFallbackGuide({ role, company } = {}) {
  const safeRole = role || 'this role';
  const safeCompany = company || 'the company';

  const questions = [
    ...GENERIC_QUESTIONS,
    `What specific skills have prepared you for the ${safeRole} position?`,
    `How does your experience align with the expectations for a ${safeRole}?`
  ];

  const talkingPoints = [
    ...GENERIC_TALKING_POINTS,
    `Research ${safeCompany}'s recent news, products, and culture before the interview.`
  ];

  const companyResearch =
    `Research ${safeCompany} thoroughly before your interview: ` +
    'review their official website, recent press releases, LinkedIn company page, ' +
    'and Glassdoor reviews. Understand their core products/services, target customers, ' +
    'recent funding or growth milestones, and stated company values. ' +
    'Come prepared with 2-3 thoughtful questions that demonstrate your knowledge.';

  return { questions, talkingPoints, companyResearch };
}

// ─── LLM guide builder ────────────────────────────────────────────────────────

/**
 * Call LLM and parse the response into the expected shape.
 * Returns null on any failure so callers can fall back gracefully.
 * @param {{ role: string, company: string, jobDescription: string }} context
 * @returns {Promise<{ questions: string[], talkingPoints: string[], companyResearch: string }|null>}
 */
async function buildLLMGuide({ role, company, jobDescription }) {
  const systemPrompt =
    'You are an expert career coach. Respond ONLY with valid JSON matching the schema: ' +
    '{ "questions": string[], "talkingPoints": string[], "companyResearch": string }. ' +
    'No markdown, no extra text.';

  const userPrompt =
    `Generate an interview preparation guide for a candidate applying to ${company} ` +
    `for the role: ${role}.\n\n` +
    `Job Description:\n${jobDescription}\n\n` +
    'Include 5-8 likely interview questions, 4-6 talking points to highlight, ' +
    'and a concise company research summary.';

  try {
    const { ok, data } = await callAI({ systemPrompt, userPrompt, maxTokens: 1024, temperature: 0.5 });

    if (!ok || !data) return null;

    // Strip markdown fences if present
    const cleaned = data.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    if (
      !Array.isArray(parsed.questions) ||
      !Array.isArray(parsed.talkingPoints) ||
      typeof parsed.companyResearch !== 'string'
    ) {
      return null;
    }

    return parsed;
  } catch (_err) {
    return null;
  }
}

// ─── Persist guide ────────────────────────────────────────────────────────────

async function persistGuide({ userId, applicationId, guide }) {
  const result = await pool.query(
    'INSERT INTO job_guides (user_id, application_id, guide) VALUES ($1, $2, $3) RETURNING id',
    [userId, applicationId || null, JSON.stringify(guide)]
  );
  return result.rows[0].id;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate (and persist) an interview prep guide.
 *
 * @param {{ applicationId?: number, jobDescription?: string, role?: string, userId: number }} opts
 * @returns {Promise<{ questions: string[], talkingPoints: string[], companyResearch: string, savedId: number }>}
 */
async function generateJobGuide({ applicationId, jobDescription, role, userId }) {
  if (!applicationId && !jobDescription) {
    throw new Error('applicationId or jobDescription is required');
  }

  let company = '';
  let resolvedRole = role || '';
  let resolvedDescription = jobDescription || '';
  let resolvedAppId = applicationId || null;

  if (applicationId) {
    const { rows } = await pool.query(
      'SELECT * FROM job_applications WHERE id = $1 AND user_id = $2',
      [applicationId, userId]
    );

    if (rows.length === 0) {
      throw new Error(`Application ${applicationId} not found`);
    }

    const app = rows[0];
    company = app.company || '';
    resolvedRole = app.role || resolvedRole;
    resolvedDescription = app.job_description || resolvedDescription;
  }

  // Try LLM first
  let guide = await buildLLMGuide({
    role: resolvedRole,
    company,
    jobDescription: resolvedDescription
  });

  // Fall back to template
  if (!guide) {
    guide = buildFallbackGuide({ role: resolvedRole, company });
  }

  const savedId = await persistGuide({ userId, applicationId: resolvedAppId, guide });

  return { ...guide, savedId };
}

/**
 * Fetch a previously saved guide by id, scoped to the requesting user.
 *
 * @param {{ id: number, userId: number }} opts
 */
async function getJobGuide({ id, userId }) {
  const { rows } = await pool.query(
    'SELECT * FROM job_guides WHERE id = $1 AND user_id = $2',
    [id, userId]
  );

  if (rows.length === 0) {
    throw new Error(`Guide ${id} not found`);
  }

  return rows[0];
}

module.exports = { generateJobGuide, getJobGuide, buildFallbackGuide };
