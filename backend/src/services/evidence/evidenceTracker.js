/**
 * Evidence Tracker Service
 * Extracts, hashes, embeds, and tracks resume bullet reuse.
 */

const crypto = require('crypto');
const { pool } = require('../../config/database');
const { embedText } = require('../../utils/embeddings');

// Skills keyword list for simple NLP extraction
const SKILL_KEYWORDS = [
  'node.js', 'nodejs', 'react', 'vue', 'angular', 'typescript', 'javascript',
  'python', 'java', 'golang', 'go', 'rust', 'c++', 'c#', 'ruby', 'php',
  'postgresql', 'postgres', 'mysql', 'mongodb', 'redis', 'elasticsearch',
  'docker', 'kubernetes', 'aws', 'gcp', 'azure', 'terraform', 'ansible',
  'git', 'ci/cd', 'jenkins', 'github actions', 'gitlab',
  'rest', 'graphql', 'grpc', 'microservices', 'api',
  'jest', 'mocha', 'pytest', 'junit', 'testing',
  'sql', 'nosql', 'kafka', 'rabbitmq',
  'linux', 'bash', 'shell',
  'machine learning', 'ml', 'ai', 'tensorflow', 'pytorch',
  'leadership', 'agile', 'scrum', 'kanban'
];

/**
 * Hash bullet text with SHA256
 * @param {string} text
 * @returns {string} 64-char hex hash
 */
function hashBullet(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

/**
 * Extract skills from bullet text using keyword matching
 * @param {string} text
 * @returns {string[]}
 */
function extractSkillsFromText(text) {
  const lower = text.toLowerCase();
  return SKILL_KEYWORDS.filter(skill => lower.includes(skill.toLowerCase()));
}

/**
 * Extract bullet objects from resume text.
 * Splits on -, •, * bullet markers.
 * Returns objects with { text, skills, hash }.
 *
 * @param {string} resumeText
 * @returns {Array<{text: string, skills: string[], hash: string}>}
 */
function extractBullets(resumeText) {
  if (!resumeText) return [];

  const lines = resumeText.split('\n');
  const bullets = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Match lines starting with -, •, or *
    const match = trimmed.match(/^[-•*]\s+(.*)/);
    if (!match) continue;

    const text = match[1].trim();
    if (!text) continue;

    bullets.push({
      text,
      skills: extractSkillsFromText(text),
      hash: hashBullet(text)
    });
  }

  return bullets;
}

/**
 * Save a bullet to evidence_bullets (deduped by user_id + hash).
 * Uses ON CONFLICT DO NOTHING due to UNIQUE(user_id, bullet_hash).
 *
 * @param {number} userId
 * @param {object} bullet - { text, skills, hash }
 * @param {string} sourceSection
 * @returns {Promise<{id: number}|null>}
 */
async function saveBullet(userId, bullet, sourceSection = 'experience') {
  const embedding = await embedText(bullet.text);

  const result = await pool.query(
    `INSERT INTO evidence_bullets (user_id, bullet_text, bullet_hash, source_section, skills, embedding)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, bullet_hash) DO NOTHING
     RETURNING id`,
    [userId, bullet.text, bullet.hash, sourceSection, JSON.stringify(bullet.skills), JSON.stringify(embedding)]
  );

  return result.rows[0] || null;
}

/**
 * Log bullet usage in evidence_usage.
 *
 * @param {number} bulletId
 * @param {number|null} applicationId
 * @param {string} context - 'tailored_resume' | 'cover_letter'
 * @returns {Promise<{id: number}>}
 */
async function logUsage(bulletId, applicationId, context) {
  if (bulletId === null || bulletId === undefined) {
    throw new Error('bulletId is required');
  }
  if (!context) {
    throw new Error('context is required');
  }

  const result = await pool.query(
    `INSERT INTO evidence_usage (bullet_id, application_id, context)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [bulletId, applicationId, context]
  );

  return result.rows[0];
}

/**
 * Calculate diversity score (0–100).
 * 100 = all bullets used exactly once, lower if heavily concentrated.
 * Uses coefficient of variation approach: lower variance → higher diversity.
 *
 * @param {Array<{usage_count: string}>} rows
 * @returns {number}
 */
function calculateDiversityScore(rows) {
  if (!rows || rows.length === 0) return 0;

  const counts = rows.map(r => parseInt(r.usage_count, 10));
  const usedCounts = counts.filter(c => c > 0);

  if (usedCounts.length === 0) return 0;

  // If all used exactly once → perfect diversity
  const allOne = usedCounts.every(c => c === 1);
  if (allOne && usedCounts.length === rows.length) return 100;

  const mean = usedCounts.reduce((a, b) => a + b, 0) / usedCounts.length;
  if (mean === 0) return 0;

  const variance = usedCounts.reduce((acc, c) => acc + Math.pow(c - mean, 2), 0) / usedCounts.length;
  const stdDev = Math.sqrt(variance);
  const cv = stdDev / mean; // coefficient of variation (0 = perfect uniformity)

  // Map cv to diversity: cv=0 → 100, cv=1 → ~37, cv=2 → lower
  const diversity = Math.round(100 * Math.exp(-cv));
  return Math.min(100, Math.max(0, diversity));
}

/**
 * Get reuse report for a user.
 *
 * @param {number} userId
 * @returns {Promise<{overUsed, underUsed, uniqueBullets, diversity, suggestions}>}
 */
async function getReuseReport(userId) {
  const result = await pool.query(
    `SELECT eb.id, eb.bullet_text, eb.skills,
            COUNT(eu.id)::text AS usage_count
     FROM evidence_bullets eb
     LEFT JOIN evidence_usage eu ON eu.bullet_id = eb.id
     WHERE eb.user_id = $1
     GROUP BY eb.id, eb.bullet_text, eb.skills
     ORDER BY usage_count DESC`,
    [userId]
  );

  const rows = result.rows;

  if (rows.length === 0) {
    return {
      overUsed: [],
      underUsed: [],
      uniqueBullets: 0,
      diversity: 0,
      suggestions: []
    };
  }

  const overUsed = rows
    .filter(r => parseInt(r.usage_count, 10) > 2)
    .map(r => ({ bullet: r.bullet_text, count: parseInt(r.usage_count, 10) }));

  const underUsed = rows
    .filter(r => parseInt(r.usage_count, 10) <= 1)
    .map(r => ({ bullet: r.bullet_text, count: parseInt(r.usage_count, 10) }));

  const diversity = calculateDiversityScore(rows);

  const suggestions = [];
  if (overUsed.length > 0) {
    suggestions.push(`${overUsed.length} bullet(s) reused more than twice — consider creating variants.`);
  }
  if (underUsed.length > 0) {
    suggestions.push(`${underUsed.length} bullet(s) rarely used — consider highlighting them in upcoming applications.`);
  }
  if (diversity < 50) {
    suggestions.push('Diversity score is low — try incorporating a wider range of bullets per application.');
  }

  return {
    overUsed,
    underUsed,
    uniqueBullets: rows.length,
    diversity,
    suggestions
  };
}

module.exports = {
  extractBullets,
  saveBullet,
  logUsage,
  getReuseReport,
  hashBullet,
  extractSkillsFromText,
  calculateDiversityScore
};
