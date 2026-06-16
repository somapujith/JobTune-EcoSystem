/**
 * Achievement Enhancer Service (Pipeline Tool #11)
 *
 * Converts a basic achievement (e.g. "Created Attendance System") into a
 * professional, resume-ready impact statement.
 *
 * Pipeline stages implemented here (pure / testable):
 *   1. Context Detection  -> detectContext()      (domain + skill signals)
 *   2. Impact Extraction  -> extractImpact()       (metrics + existing verbs)
 *   3. Rule-based Bullet  -> generateFallbackBullet() (deterministic fallback
 *                            used when the LLM call fails in the route layer)
 *
 * Reuses existing analyzers instead of duplicating their heuristics:
 *   - ActionVerbAnalyzer (strong/weak verb lists)
 *   - MetricsAnalyzer    (metric extraction)
 */

const ActionVerbAnalyzer = require('./v2/actionVerbAnalyzer');
const MetricsAnalyzer = require('./v2/metricsAnalyzer');

// Lightweight domain detection keyed off keywords commonly seen in achievements.
const DOMAIN_KEYWORDS = {
  software: ['system', 'app', 'application', 'api', 'website', 'platform', 'database', 'pipeline', 'feature', 'dashboard', 'automation', 'script', 'tool', 'software', 'code', 'bug', 'deployment', 'integration'],
  data: ['data', 'model', 'analytics', 'report', 'dashboard', 'ml', 'machine learning', 'forecast', 'prediction', 'dataset', 'etl', 'visualization'],
  design: ['design', 'ui', 'ux', 'wireframe', 'prototype', 'figma', 'mockup', 'branding', 'layout'],
  marketing: ['campaign', 'marketing', 'seo', 'social media', 'content', 'engagement', 'audience', 'leads', 'brand'],
  sales: ['sales', 'revenue', 'deal', 'client', 'quota', 'pipeline', 'account', 'closed'],
  operations: ['process', 'operations', 'workflow', 'logistics', 'inventory', 'efficiency', 'cost', 'supply'],
  leadership: ['team', 'mentored', 'led', 'managed', 'trained', 'coordinated', 'hired', 'onboarded'],
  finance: ['budget', 'finance', 'cost', 'savings', 'audit', 'forecast', 'expense', 'invoice'],
  research: ['research', 'study', 'experiment', 'paper', 'analysis', 'survey', 'hypothesis'],
};

// Phrasing scaffolds the rule-based generator appends to imply impact when the
// input has none. Chosen by detected domain.
const IMPACT_PHRASES = {
  software: 'streamlining workflows and improving system reliability',
  data: 'enabling data-driven decisions and improving reporting accuracy',
  design: 'enhancing user experience and increasing engagement',
  marketing: 'expanding audience reach and boosting engagement',
  sales: 'driving revenue growth and strengthening client relationships',
  operations: 'reducing operational overhead and improving efficiency',
  leadership: 'improving team productivity and delivery velocity',
  finance: 'improving cost control and financial accuracy',
  research: 'producing actionable insights and informing strategy',
  general: 'improving efficiency and delivering measurable results',
};

// Maps a leading weak/neutral verb to a strong resume verb.
const VERB_UPGRADE = {
  created: 'Developed',
  made: 'Built',
  built: 'Engineered',
  did: 'Delivered',
  worked: 'Engineered',
  helped: 'Spearheaded',
  used: 'Leveraged',
  added: 'Implemented',
  wrote: 'Authored',
  set: 'Established',
  setup: 'Configured',
  fixed: 'Resolved',
  handled: 'Managed',
  ran: 'Led',
  organized: 'Coordinated',
  improved: 'Optimized',
  designed: 'Designed',
  developed: 'Developed',
  implemented: 'Implemented',
  managed: 'Managed',
  led: 'Led',
};

function capitalize(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function tokenize(text) {
  return (text || '').toLowerCase().match(/[a-z0-9%$.]+/gi) || [];
}

/**
 * Stage 1 — Context Detection.
 * Detects the most likely domain plus any strong/weak verbs present.
 * @param {string} achievement
 * @param {string} [roleHint] optional role/context string to bias detection
 * @returns {{domain:string, domainScores:object, roleHint:(string|null),
 *            strongVerbs:string[], weakVerbs:string[]}}
 */
function detectContext(achievement, roleHint = '') {
  const haystack = `${achievement || ''} ${roleHint || ''}`.toLowerCase();

  const domainScores = {};
  let bestDomain = 'general';
  let bestScore = 0;

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (haystack.includes(kw)) score += 1;
    }
    domainScores[domain] = score;
    if (score > bestScore) {
      bestScore = score;
      bestDomain = domain;
    }
  }

  const verbAnalysis = ActionVerbAnalyzer.analyze(achievement || '');

  return {
    domain: bestDomain,
    domainScores,
    roleHint: roleHint ? roleHint.trim() : null,
    strongVerbs: verbAnalysis.strongVerbs || [],
    weakVerbs: verbAnalysis.weakVerbs || [],
  };
}

/**
 * Stage 2 — Impact Extraction.
 * Pulls quantifiable metrics and identifies whether the achievement already
 * expresses measurable impact.
 * @param {string} achievement
 * @returns {{metrics:array, hasMetrics:boolean, hasStrongVerb:boolean,
 *            leadingVerb:(string|null)}}
 */
function extractImpact(achievement) {
  const text = achievement || '';
  const metricsAnalysis = MetricsAnalyzer.analyze(text);

  const tokens = tokenize(text);
  const leadingVerb = tokens.length ? tokens[0].toLowerCase() : null;
  const hasStrongVerb = leadingVerb
    ? ActionVerbAnalyzer.STRONG_VERBS.includes(leadingVerb)
    : false;

  return {
    metrics: metricsAnalysis.metrics || [],
    hasMetrics: (metricsAnalysis.count || 0) > 0,
    hasStrongVerb,
    leadingVerb,
  };
}

/**
 * Stage 3 — Rule-based Bullet Generation (deterministic fallback).
 * Used by the route when callAI() is unavailable/fails. Produces a single
 * polished resume bullet from a raw achievement using strong action verbs and
 * impact-phrasing scaffolding.
 * @param {string} achievement
 * @param {string} [roleHint]
 * @returns {string}
 */
function generateFallbackBullet(achievement, roleHint = '') {
  const raw = (achievement || '').trim().replace(/[.\s]+$/, '');
  if (!raw) return '';

  const context = detectContext(raw, roleHint);
  const impact = extractImpact(raw);
  const tokens = raw.split(/\s+/);

  // 1. Determine a strong leading action verb.
  let verb;
  let remainder;
  const firstWordLower = (tokens[0] || '').toLowerCase();

  if (impact.hasStrongVerb) {
    verb = capitalize(firstWordLower);
    remainder = tokens.slice(1).join(' ');
  } else if (VERB_UPGRADE[firstWordLower]) {
    verb = VERB_UPGRADE[firstWordLower];
    remainder = tokens.slice(1).join(' ');
  } else {
    // No recognizable leading verb — pick a domain-appropriate default and
    // treat the entire phrase as the object.
    const domainVerb = {
      software: 'Developed',
      data: 'Built',
      design: 'Designed',
      marketing: 'Launched',
      sales: 'Drove',
      operations: 'Streamlined',
      leadership: 'Led',
      finance: 'Managed',
      research: 'Conducted',
      general: 'Delivered',
    }[context.domain] || 'Delivered';
    verb = domainVerb;
    remainder = raw;
  }

  remainder = remainder.trim();

  // 2. Add a descriptive qualifier when the object is sparse (e.g. just a noun).
  let core = remainder;
  if (remainder && !/\s/.test(remainder)) {
    // single-word object like "system" -> "an automated system"
    // Preserve all-caps acronyms (API, ML) rather than lowercasing them.
    const obj = /^[A-Z0-9]{2,}$/.test(remainder) ? remainder : remainder.toLowerCase();
    core = `an automated ${obj}`;
  } else if (remainder) {
    // Lowercase the leading word only if it is an ordinary capitalized word,
    // never an acronym/proper noun (e.g. keep "API", "AWS").
    const firstWord = remainder.split(/\s+/)[0];
    if (!/^[A-Z0-9]{2,}$/.test(firstWord)) {
      core = remainder.charAt(0).toLowerCase() + remainder.slice(1);
    }
  }

  // 3. Append impact phrasing only if the input lacks measurable impact.
  let bullet;
  if (impact.hasMetrics) {
    bullet = `${verb} ${core}`;
  } else {
    const phrase = IMPACT_PHRASES[context.domain] || IMPACT_PHRASES.general;
    bullet = `${verb} ${core}, ${phrase}`;
  }

  // 4. Normalize whitespace and punctuation.
  bullet = bullet.replace(/\s+/g, ' ').trim();
  if (!/[.!?]$/.test(bullet)) bullet += '.';
  return bullet;
}

/**
 * Convenience: enhance one or many achievements with the rule-based engine.
 * @param {string|string[]} input
 * @param {string} [roleHint]
 * @returns {string[]}
 */
function generateFallbackBullets(input, roleHint = '') {
  const list = Array.isArray(input) ? input : [input];
  return list
    .map((a) => (typeof a === 'string' ? a : ''))
    .filter((a) => a.trim().length > 0)
    .map((a) => generateFallbackBullet(a, roleHint));
}

module.exports = {
  detectContext,
  extractImpact,
  generateFallbackBullet,
  generateFallbackBullets,
  DOMAIN_KEYWORDS,
  IMPACT_PHRASES,
};
