/**
 * ONET Taxonomy Loader
 * Reads bundled occupations.json, upserts to onet_occupations table,
 * and exposes fuzzy lookup helpers used by the job fit scorer.
 */

const path = require('path');
const { pool } = require('../../config/database');

const OCCUPATIONS_PATH = path.join(
  __dirname, '../../data/onet/occupations.json'
);

/** Cached in-memory occupations list (loaded once). */
let _occupations = null;

/**
 * Returns the occupations array, loading from disk once.
 * @returns {Array}
 */
function getOccupations() {
  if (!_occupations) {
    _occupations = require(OCCUPATIONS_PATH);
  }
  return _occupations;
}

/**
 * Reads occupations.json and upserts every entry into onet_occupations.
 * Throws on DB error so callers can handle startup failures.
 */
async function loadONET() {
  const occupations = getOccupations();

  const upsertSQL = `
    INSERT INTO onet_occupations (code, title, description, domain, skills, keywords)
    VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
    ON CONFLICT (code) DO UPDATE
      SET title       = EXCLUDED.title,
          description = EXCLUDED.description,
          domain      = EXCLUDED.domain,
          skills      = EXCLUDED.skills,
          keywords    = EXCLUDED.keywords
  `;

  for (const occ of occupations) {
    await pool.query(upsertSQL, [
      occ.code,
      occ.title,
      occ.description,
      occ.domain,
      JSON.stringify(occ.skills),
      JSON.stringify(occ.keywords)
    ]);
  }
}

/**
 * Tokenizes a string into lowercase words.
 * @param {string} text
 * @returns {string[]}
 */
function tokenize(text) {
  if (!text || typeof text !== 'string') return [];
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
}

/**
 * Computes a simple overlap score between two token arrays.
 * @param {string[]} a
 * @param {string[]} b
 * @returns {number} 0-1
 */
function overlapScore(a, b) {
  if (!a.length || !b.length) return 0;
  const setB = new Set(b);
  const matches = a.filter(t => setB.has(t)).length;
  return matches / Math.max(a.length, b.length);
}

/**
 * Finds the closest ONET occupation for a given job title using keyword overlap.
 * Returns null for empty / null / undefined input or when no match scores > 0.
 *
 * @param {string|null|undefined} title
 * @returns {object|null}
 */
function findOccupation(title) {
  if (title == null || title === '') return null;

  const query = tokenize(title);
  if (!query.length) return null;

  const occupations = getOccupations();
  let bestScore = 0;
  let bestOcc = null;

  for (const occ of occupations) {
    const titleTokens = tokenize(occ.title);
    const keywordTokens = occ.keywords.map(k => k.toLowerCase());
    const allTokens = [...titleTokens, ...keywordTokens];

    const s = overlapScore(query, allTokens);
    if (s > bestScore) {
      bestScore = s;
      bestOcc = occ;
    }
  }

  return bestOcc;
}

/**
 * Extracts the domain string from an occupation object.
 * Returns "Unknown" for null/undefined input or missing domain.
 *
 * @param {object|null|undefined} occupation
 * @returns {string}
 */
function getDomain(occupation) {
  if (!occupation || typeof occupation !== 'object') return 'Unknown';
  return occupation.domain || 'Unknown';
}

module.exports = { loadONET, findOccupation, getDomain };
