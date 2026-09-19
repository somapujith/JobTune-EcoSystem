'use strict';

/**
 * ONET Taxonomy Loader   (port of services/taxonomy/onetLoader.js, T2.5)
 * Bundled occupations list, upsert to onet_occupations, and fuzzy lookup helpers used by the job fit scorer.
 *
 * Public API, identical to the Express module's exports, as `getServices(c).onetLoader.<fn>`:
 *   loadONET() -> Promise<void>          upserts every occupation (throws on a db error). Nothing in the Express
 *                                        app calls it (only its test does), and no Worker route does either.
 *   findOccupation(title) -> occupation | null
 *   getDomain(occupation) -> string
 *
 * Deviations forced by the platform (behaviour unchanged):
 *   - The Express file loaded the data with a dynamic require of a path built from __dirname, which cannot be
 *     bundled. The list is now a static JSON require next to this file (./occupations.json).
 *     That file is a byte-for-byte copy of src/data/onet/occupations.json: the source-tree lint forbids
 *     relative imports outside src/worker/, so the shared data file cannot be required directly. A test
 *     (tests/worker/infra/onetLoader.test.js) fails if the two ever differ.
 *   - `pool` is replaced by the injected request-scoped db.
 */
const occupations = require('./occupations.json');

/**
 * Returns the occupations array.
 * @returns {Array}
 */
function getOccupations() {
  return occupations;
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

  const all = getOccupations();
  let bestScore = 0;
  let bestOcc = null;

  for (const occ of all) {
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

/**
 * @param {{ db: { query: Function } }} deps
 */
function createOnetLoader({ db } = {}) {
  /**
   * Upserts every entry of the bundled occupations list into onet_occupations.
   * Throws on DB error so callers can handle startup failures.
   */
  async function loadONET() {
    const list = getOccupations();

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

    for (const occ of list) {
      await db.query(upsertSQL, [
        occ.code,
        occ.title,
        occ.description,
        occ.domain,
        JSON.stringify(occ.skills),
        JSON.stringify(occ.keywords)
      ]);
    }
  }

  return { loadONET, findOccupation, getDomain };
}

module.exports = { createOnetLoader, findOccupation, getDomain };
