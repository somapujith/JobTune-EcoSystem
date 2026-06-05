/**
 * Job Fit Scorer Strategy
 *
 * Computes a composite fit score between a candidate resume and a job description.
 *
 * Score = 0.35 * domainMatch + 0.35 * seniorityMatch + 0.30 * skillOverlap
 *
 * Each component is 0-100. LLM-powered with rule-based fallback.
 */

const { findOccupation, getDomain } = require('../../taxonomy/onetLoader');
const { callAI, extractJSON } = require('../../../utils/aiClient');

// ─── Weights ──────────────────────────────────────────────────────────────────

const WEIGHTS = {
  domain: 0.35,
  seniority: 0.35,
  skills: 0.30
};

// ─── Seniority ────────────────────────────────────────────────────────────────

const SENIORITY_LEVELS = ['intern', 'junior', 'mid', 'senior', 'lead', 'principal', 'staff'];

const LEVEL_SCORES = {
  intern: 0,
  junior: 1,
  mid: 2,
  senior: 3,
  lead: 4,
  principal: 5,
  staff: 5
};

/**
 * Infers seniority level string from text.
 * Falls back to years-of-experience regex.
 * @param {string} text
 * @returns {string} seniority level key
 */
function inferSeniority(text) {
  if (!text || typeof text !== 'string') return 'mid';
  const lower = text.toLowerCase();

  // Explicit level keywords (ordered most senior first to avoid false junior matches)
  for (const level of ['principal', 'staff', 'lead', 'senior', 'junior', 'intern']) {
    if (lower.includes(level)) return level;
  }

  // Years of experience
  const yearsMatch = lower.match(/(\d+)\s*\+?\s*years?/);
  if (yearsMatch) {
    const yrs = parseInt(yearsMatch[1], 10);
    if (yrs <= 1) return 'junior';
    if (yrs <= 3) return 'mid';
    if (yrs <= 6) return 'senior';
    return 'lead';
  }

  // Entry-level / new grad signals
  if (/entry.?level|new grad|graduate|fresh/.test(lower)) return 'junior';

  return 'mid';
}

/**
 * Compute seniority match score 0-100.
 * The closer the inferred levels, the higher the score.
 */
function computeSeniorityScore(resumeLevel, jobLevel) {
  const rScore = LEVEL_SCORES[resumeLevel] ?? 2;
  const jScore = LEVEL_SCORES[jobLevel] ?? 2;
  const diff = Math.abs(rScore - jScore);
  const maxDiff = SENIORITY_LEVELS.length - 1; // 5
  return Math.max(0, Math.round(100 * (1 - diff / maxDiff)));
}

// ─── Skill extraction ─────────────────────────────────────────────────────────

/** Common tech skill tokens to look for (kept compact) */
const SKILL_TOKENS = new Set([
  'python','javascript','typescript','java','go','rust','c++','c#','ruby','php','swift','kotlin',
  'react','angular','vue','next','nuxt','svelte','jquery',
  'node','express','django','flask','fastapi','spring','rails','laravel',
  'sql','mysql','postgresql','postgres','mongodb','redis','elasticsearch','cassandra','dynamodb','sqlite',
  'docker','kubernetes','k8s','terraform','ansible','jenkins','github','gitlab','circleci','argo',
  'aws','gcp','azure','cloud','lambda','s3','ec2','rds','bigquery','cloudflare',
  'git','linux','bash','powershell','rest','graphql','grpc','kafka','rabbitmq','spark','hadoop',
  'pytorch','tensorflow','keras','scikit','pandas','numpy','matplotlib','r','matlab',
  'html','css','tailwind','bootstrap','sass',
  'figma','sketch','photoshop','illustrator','xd',
  'agile','scrum','kanban','jira','confluence',
  'excel','tableau','powerbi','looker','dbt','airflow','snowflake','databricks',
  'machine learning','deep learning','nlp','ai','ml','llm',
  'ci/cd','devops','sre','microservices','serverless',
  'security','penetration','networking','tcp/ip','vpc','iam'
]);

/**
 * Extracts skill tokens from text.
 * @param {string} text
 * @returns {Set<string>}
 */
function extractSkills(text) {
  if (!text || typeof text !== 'string') return new Set();
  const lower = text.toLowerCase();
  const found = new Set();
  for (const skill of SKILL_TOKENS) {
    if (lower.includes(skill)) found.add(skill);
  }
  return found;
}

/**
 * Jaccard similarity between two sets.
 * @param {Set} a
 * @param {Set} b
 * @returns {number} 0-1
 */
function jaccard(a, b) {
  if (!a.size && !b.size) return 0;
  const intersection = [...a].filter(x => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

// ─── Domain matching ──────────────────────────────────────────────────────────

/**
 * Rule-based domain score: find ONET domain for both resume + JD and compare.
 * @param {string} resumeText
 * @param {string} jobDescription
 * @returns {number} 0-100
 */
function ruleDomainScore(resumeText, jobDescription) {
  const resumeOcc = findOccupation(resumeText.slice(0, 200));
  const jobOcc = findOccupation(jobDescription.slice(0, 200));

  const resumeDomain = getDomain(resumeOcc);
  const jobDomain = getDomain(jobOcc);

  if (resumeDomain === 'Unknown' || jobDomain === 'Unknown') return 50;
  if (resumeDomain === jobDomain) return 100;

  // Partial credit for related domains
  const RELATED = {
    'IT': ['Data & Analytics', 'Cybersecurity', 'Networking'],
    'Data & Analytics': ['IT', 'Finance'],
    'Cybersecurity': ['IT', 'Networking'],
    'Finance': ['Consulting & Management', 'Data & Analytics'],
    'Design & Creative': ['IT'],
    'Engineering': ['IT']
  };

  const related = RELATED[resumeDomain] || [];
  if (related.includes(jobDomain)) return 60;

  return 20;
}

// ─── LLM scoring ─────────────────────────────────────────────────────────────

/**
 * Attempts LLM-powered domain + seniority scoring via local LM Studio.
 * Returns null if LLM is unavailable.
 */
async function tryLLMScore(resumeText, jobDescription) {
  try {
    const systemPrompt = `You are a job fit analyzer. Given the resume snippet and job description below, output ONLY valid JSON with this exact shape:
{
  "resumeDomain": "<ONET domain name>",
  "jobDomain": "<ONET domain name>",
  "domainScore": <0-100 integer>,
  "resumeSeniority": "<intern|junior|mid|senior|lead|principal>",
  "jobSeniority": "<intern|junior|mid|senior|lead|principal>",
  "seniorityScore": <0-100 integer>
}
Return ONLY the JSON object. No markdown, no extra text.`;

    const userPrompt = `RESUME SNIPPET (first 300 chars):
${(resumeText || '').slice(0, 300)}

JOB DESCRIPTION SNIPPET (first 300 chars):
${(jobDescription || '').slice(0, 300)}`;

    const result = await callAI({
      systemPrompt,
      userPrompt,
      maxTokens: 500,
      temperature: 0.2,
      model: process.env.LM_STUDIO_MODEL_FIT || 'qwen2.5-7b'
    });

    if (!result.ok || !result.data) return null;

    const parsed = extractJSON(result.data);
    if (!parsed) return null;

    const domainScore = Math.max(0, Math.min(100, Number(parsed.domainScore) || 0));
    const seniorityScore = Math.max(0, Math.min(100, Number(parsed.seniorityScore) || 0));

    return { domainScore, seniorityScore };
  } catch {
    return null;
  }
}

// ─── Main scorer ──────────────────────────────────────────────────────────────

/**
 * Computes job fit score.
 *
 * @param {{ resumeText: string|null, jobDescription: string|null }} params
 * @returns {Promise<{ score: number, breakdown: { domain: number, seniority: number, skills: number }, method: 'llm'|'rule' }>}
 */
async function score({ resumeText, jobDescription }) {
  const resume = (resumeText || '').trim();
  const jd = (jobDescription || '').trim();

  // Both empty → zero score
  if (!resume && !jd) {
    return {
      score: 0,
      breakdown: { domain: 0, seniority: 0, skills: 0 },
      method: 'rule'
    };
  }

  // ── Skill overlap (always rule-based / fast) ───────────────────────────────
  const resumeSkills = extractSkills(resume);
  const jdSkills = extractSkills(jd);
  const skillScore = Math.round(jaccard(resumeSkills, jdSkills) * 100);

  // ── Domain + Seniority via LLM, fallback to rule ──────────────────────────
  let domainScore;
  let seniorityScore;
  let method = 'rule';

  const llmResult = await tryLLMScore(resume, jd);
  if (llmResult) {
    domainScore = llmResult.domainScore;
    seniorityScore = llmResult.seniorityScore;
    method = 'llm';
  } else {
    domainScore = ruleDomainScore(resume, jd);
    const resumeLevel = inferSeniority(resume);
    const jobLevel = inferSeniority(jd);
    seniorityScore = computeSeniorityScore(resumeLevel, jobLevel);
  }

  const compositeScore = Math.round(
    WEIGHTS.domain * domainScore +
    WEIGHTS.seniority * seniorityScore +
    WEIGHTS.skills * skillScore
  );

  return {
    score: Math.max(0, Math.min(100, compositeScore)),
    breakdown: {
      domain: domainScore,
      seniority: seniorityScore,
      skills: skillScore
    },
    method
  };
}

module.exports = { score };
