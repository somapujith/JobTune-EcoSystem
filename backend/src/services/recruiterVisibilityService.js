/**
 * Recruiter Visibility Service (pipeline tool #9)
 *
 * Measures how attractive a candidate's profile appears to recruiters by
 * combining signals from three sources — resume, LinkedIn, GitHub — plus a
 * keyword-coverage signal derived across all of them.
 *
 * Pipeline:
 *   Resume Analysis + LinkedIn Analysis + GitHub Analysis
 *     -> Keyword Analysis
 *     -> Visibility Scoring (weighted)
 *     -> Improvement Suggestions (ranked)
 *
 * Design notes:
 *  - Pure / testable: no req/res, no DB, no network. Inputs in, result out.
 *  - Tolerant of missing inputs: each source is scored only if present. The
 *    final score re-normalizes weights over the sources actually provided, so
 *    a candidate who only supplies a resume still gets a fair score (and is
 *    told what is missing).
 *  - Rule-based and deterministic. No LLM dependency.
 *
 * Inputs (all optional, but at least one of resume/linkedin/github required):
 *   resumeText   : string  - raw resume text (keyword stats are derived from it)
 *   linkedin     : object  - already-analyzed LinkedIn data, shape compatible
 *                            with POST /profiles/linkedin/analyze response:
 *                            { score, metrics?, suggestions? }  OR raw fields
 *                            { headline, about, skills, ... }
 *   github       : object  - already-analyzed GitHub data, shape compatible
 *                            with POST /profiles/github/analyze response:
 *                            { score, languages?, repoCount?, ... }
 *   targetKeywords : string[] | string - optional role keywords to match
 *                            against (e.g. from a target job). When omitted, a
 *                            built-in recruiter-relevant vocabulary is used.
 */

// Recruiter-relevant keyword vocabulary (skills, tools, signals recruiters search for).
const RECRUITER_VOCABULARY = [
  'react', 'angular', 'vue', 'svelte', 'javascript', 'typescript', 'node', 'node.js',
  'express', 'python', 'django', 'flask', 'fastapi', 'java', 'spring', 'spring boot',
  'c++', 'c#', '.net', 'ruby', 'rails', 'go', 'golang', 'rust', 'php', 'laravel',
  'sql', 'mysql', 'postgresql', 'postgres', 'mongodb', 'nosql', 'redis', 'elasticsearch',
  'docker', 'kubernetes', 'k8s', 'aws', 'azure', 'gcp', 'ci/cd', 'jenkins', 'terraform',
  'html', 'css', 'sass', 'tailwind', 'git', 'github', 'rest', 'graphql', 'api',
  'microservices', 'serverless', 'machine learning', 'ml', 'ai', 'data science',
  'pandas', 'numpy', 'tensorflow', 'pytorch', 'spark', 'kafka', 'agile', 'scrum',
  'next.js', 'redux', 'jest', 'cypress', 'react native', 'flutter', 'kotlin', 'swift',
];

// Action/impact words recruiters look for in a strong profile.
const IMPACT_WORDS = [
  'led', 'built', 'developed', 'designed', 'launched', 'shipped', 'delivered',
  'improved', 'increased', 'reduced', 'optimized', 'scaled', 'architected',
  'mentored', 'owned', 'drove', 'implemented',
];

function clamp(n, lo = 0, hi = 100) {
  return Math.min(Math.max(Math.round(n), lo), hi);
}

function toArray(val) {
  if (Array.isArray(val)) return val.filter(Boolean);
  if (typeof val === 'string') {
    return val.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function labelForScore(score) {
  if (score >= 80) return 'Highly Visible';
  if (score >= 60) return 'Visible';
  if (score >= 40) return 'Limited Visibility';
  return 'Low Visibility';
}

/**
 * Score the resume source from raw text. Rewards length/substance, quantified
 * impact (numbers + action verbs), contact/links, and keyword density.
 * Returns { score, available, signals, suggestions }.
 */
function scoreResume(resumeText) {
  const text = (resumeText || '').trim();
  if (!text) {
    return {
      score: 0,
      available: false,
      signals: {},
      suggestions: ['Add your resume text so recruiters can assess your experience and skills.'],
    };
  }

  const lower = text.toLowerCase();
  const words = lower.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  let score = 0;
  const suggestions = [];

  // Substance / length (max 25)
  if (wordCount >= 400) score += 25;
  else if (wordCount >= 250) score += 18;
  else if (wordCount >= 120) score += 10;
  else {
    score += 4;
    suggestions.push('Your resume looks thin. Expand to ~400+ words with detailed, role-relevant experience.');
  }

  // Quantified impact (max 25): numbers signal measurable achievements.
  const numberMatches = (text.match(/\b\d+(\.\d+)?%?\b/g) || []).length;
  if (numberMatches >= 6) score += 15;
  else if (numberMatches >= 3) score += 10;
  else {
    score += 3;
    suggestions.push('Quantify your impact with numbers (e.g. "reduced load time by 40%"). Recruiters scan for measurable results.');
  }

  const impactHits = IMPACT_WORDS.filter((w) => new RegExp(`\\b${w}\\b`, 'i').test(text)).length;
  score += Math.min(impactHits * 2.5, 10);
  if (impactHits < 3) {
    suggestions.push('Start bullets with strong action verbs (led, built, shipped, improved) to read as high-impact.');
  }

  // Contact & links (max 15)
  if (/(linkedin\.com)/i.test(text)) score += 6;
  else suggestions.push('Add your LinkedIn URL to the resume so recruiters can find your full profile.');
  if (/(github\.com)/i.test(text)) score += 5;
  if (/@[\w.-]+\.\w+/.test(text)) score += 4;
  else suggestions.push('Include a professional email so recruiters can reach you.');

  // Keyword richness (max 35): how many recruiter-searched terms appear.
  const matched = RECRUITER_VOCABULARY.filter((kw) => lower.includes(kw));
  const keywordScore = Math.min((matched.length / 12) * 35, 35);
  score += keywordScore;
  if (matched.length < 6) {
    suggestions.push('Surface more concrete skills/technologies — recruiters and ATS filters search by keyword.');
  }

  return {
    score: clamp(score),
    available: true,
    signals: {
      wordCount,
      quantifiedMetrics: numberMatches,
      impactVerbs: impactHits,
      keywordsFound: matched.length,
      keywords: matched,
    },
    suggestions,
  };
}

/**
 * Score the LinkedIn source. Accepts either an already-analyzed object
 * ({ score, metrics, suggestions }) or raw profile fields.
 */
function scoreLinkedIn(linkedin) {
  if (!linkedin || (typeof linkedin === 'object' && Object.keys(linkedin).length === 0)) {
    return {
      score: 0,
      available: false,
      signals: {},
      suggestions: ['Connect your LinkedIn profile — over 90% of recruiters source candidates there.'],
    };
  }

  // Already-analyzed shape (from /profiles/linkedin/analyze).
  if (typeof linkedin.score === 'number') {
    const suggestions = Array.isArray(linkedin.suggestions) ? linkedin.suggestions.slice(0, 3) : [];
    return {
      score: clamp(linkedin.score),
      available: true,
      signals: { source: 'analyzed', metrics: linkedin.metrics || [] },
      suggestions,
    };
  }

  // Raw fields fallback — lightweight heuristic.
  const headline = (linkedin.headline || '').trim();
  const about = (linkedin.about || '').trim();
  const skills = toArray(linkedin.skills);
  let score = 0;
  const suggestions = [];

  if (headline.length >= 40) score += 25;
  else if (headline.length > 0) score += 12;
  else suggestions.push('Write a keyword-rich LinkedIn headline (role + stack + goal).');

  const aboutWords = about.split(/\s+/).filter(Boolean).length;
  if (aboutWords >= 100) score += 30;
  else if (aboutWords >= 40) score += 18;
  else suggestions.push('Expand your LinkedIn About section to 100+ words.');

  if (skills.length >= 10) score += 25;
  else if (skills.length >= 5) score += 15;
  else suggestions.push('List at least 10 skills on LinkedIn — its search surfaces profiles with more skills.');

  if (linkedin.hasPhoto) score += 10;
  else suggestions.push('Add a profile photo — profiles with one get far more recruiter views.');

  if (linkedin.hasFeatured) score += 10;

  return {
    score: clamp(score),
    available: true,
    signals: { headlineLength: headline.length, aboutWords, skillCount: skills.length },
    suggestions,
  };
}

/**
 * Score the GitHub source. Accepts already-analyzed object
 * ({ score, languages, repoCount, stars, followers }) or raw-ish fields.
 */
function scoreGitHub(github) {
  if (!github || (typeof github === 'object' && Object.keys(github).length === 0)) {
    return {
      score: 0,
      available: false,
      signals: {},
      suggestions: ['Add your GitHub — public work is a strong, verifiable signal to technical recruiters.'],
    };
  }

  if (typeof github.score === 'number') {
    const suggestions = Array.isArray(github.issues) ? github.issues.slice(0, 3) : [];
    return {
      score: clamp(github.score),
      available: true,
      signals: {
        source: 'analyzed',
        repoCount: github.repoCount,
        stars: github.stars,
        followers: github.followers,
        languages: github.languages || [],
      },
      suggestions,
    };
  }

  // Raw fallback heuristic.
  let score = 0;
  const suggestions = [];
  const repoCount = Number(github.publicRepos || github.repoCount || 0);
  const stars = Number(github.totalStars || github.stars || 0);
  const followers = Number(github.followers || 0);
  const languages = toArray(github.languages);

  score += Math.min((repoCount / 15) * 30, 30);
  if (repoCount < 5) suggestions.push('Publish more public repositories — recruiters look for a body of visible work.');

  score += Math.min((stars / 10) * 25, 25);
  score += Math.min((followers / 20) * 20, 20);
  score += Math.min((languages.length / 4) * 25, 25);
  if (languages.length < 2) suggestions.push('Show breadth — repos across a couple of languages signal versatility.');

  return {
    score: clamp(score),
    available: true,
    signals: { repoCount, stars, followers, languages },
    suggestions,
  };
}

/**
 * Keyword analysis across all sources combined, against target keywords
 * (or the built-in recruiter vocabulary if none supplied).
 */
function scoreKeywords({ resumeText, linkedin, github, targetKeywords }) {
  const targets = toArray(targetKeywords).map((k) => k.toLowerCase());
  const vocabulary = targets.length > 0 ? targets : RECRUITER_VOCABULARY;

  // Aggregate searchable text from everything we have.
  const parts = [];
  if (resumeText) parts.push(String(resumeText));
  if (linkedin) {
    parts.push(linkedin.headline || '', linkedin.about || '');
    parts.push(toArray(linkedin.skills).join(' '));
    if (Array.isArray(linkedin.metrics)) parts.push(linkedin.metrics.map((m) => m.label).join(' '));
  }
  if (github) {
    parts.push(toArray(github.languages).join(' '));
    parts.push(github.bio || '');
  }
  const haystack = parts.join(' \n ').toLowerCase();

  if (!haystack.trim()) {
    return {
      score: 0,
      available: false,
      matched: [],
      missing: [],
      suggestions: ['No profile content available to analyze for recruiter keywords.'],
    };
  }

  const matched = [];
  const missing = [];
  vocabulary.forEach((kw) => {
    if (haystack.includes(kw)) matched.push(kw);
    else missing.push(kw);
  });

  // Coverage relative to a reasonable target count so generic profiles aren't punished.
  const denom = targets.length > 0 ? vocabulary.length : 12;
  const score = clamp((matched.length / Math.max(denom, 1)) * 100);

  const suggestions = [];
  if (score < 50) {
    suggestions.push(
      targets.length > 0
        ? `Your profile is missing key role keywords: ${missing.slice(0, 4).join(', ')}.`
        : 'Increase keyword coverage across your profile so recruiter searches surface you.'
    );
  }

  return {
    score,
    available: true,
    matched: matched.slice(0, 30),
    missing: missing.slice(0, 15),
    suggestions,
  };
}

/**
 * Main entry point. Computes the weighted Recruiter Visibility Score and
 * ranked improvement suggestions.
 */
function computeVisibility(input = {}) {
  const { resumeText, linkedin, github, targetKeywords } = input;

  const resume = scoreResume(resumeText);
  const li = scoreLinkedIn(linkedin);
  const gh = scoreGitHub(github);
  const keywords = scoreKeywords({ resumeText, linkedin, github, targetKeywords });

  if (!resume.available && !li.available && !gh.available) {
    const err = new Error('Provide at least one of: resume text, LinkedIn data, or GitHub data.');
    err.statusCode = 400;
    throw err;
  }

  // Base weights. Keyword coverage always counts (it's derived from whatever
  // sources exist). Source weights are re-normalized over present sources.
  const sourceWeights = { resume: 0.30, linkedin: 0.25, github: 0.20 };
  const keywordWeight = 0.25;

  const present = {};
  let presentWeightSum = 0;
  if (resume.available) { present.resume = sourceWeights.resume; presentWeightSum += sourceWeights.resume; }
  if (li.available) { present.linkedin = sourceWeights.linkedin; presentWeightSum += sourceWeights.linkedin; }
  if (gh.available) { present.github = sourceWeights.github; presentWeightSum += sourceWeights.github; }

  // Re-normalize present source weights to share (1 - keywordWeight).
  const sourceShare = 1 - keywordWeight;
  let weighted = keywords.score * keywordWeight;
  Object.keys(present).forEach((key) => {
    const normWeight = (present[key] / presentWeightSum) * sourceShare;
    const subScore = key === 'resume' ? resume.score : key === 'linkedin' ? li.score : gh.score;
    weighted += subScore * normWeight;
  });

  const overallScore = clamp(weighted);

  // Collect & rank suggestions: missing whole sources first (biggest lever),
  // then per-source improvements, then keyword gaps. De-duplicate.
  const ranked = [];
  const pushAll = (arr, priority) => (arr || []).forEach((text) => ranked.push({ text, priority }));

  if (!resume.available) ranked.push({ text: resume.suggestions[0], priority: 0 });
  if (!li.available) ranked.push({ text: li.suggestions[0], priority: 0 });
  if (!gh.available) ranked.push({ text: gh.suggestions[0], priority: 0 });

  if (resume.available) pushAll(resume.suggestions, 1);
  if (li.available) pushAll(li.suggestions, 1);
  if (gh.available) pushAll(gh.suggestions, 1);
  pushAll(keywords.suggestions, 2);

  const seen = new Set();
  const suggestions = ranked
    .filter((s) => s.text && !seen.has(s.text) && seen.add(s.text))
    .sort((a, b) => a.priority - b.priority)
    .map((s) => s.text)
    .slice(0, 8);

  const missingSources = [];
  if (!resume.available) missingSources.push('resume');
  if (!li.available) missingSources.push('linkedin');
  if (!gh.available) missingSources.push('github');

  return {
    visibilityScore: overallScore,
    scoreLabel: labelForScore(overallScore),
    scoreDescription: `Your recruiter visibility is ${overallScore}/100 — ${suggestions.length} improvement${suggestions.length === 1 ? '' : 's'} identified.`,
    subScores: {
      resume: { score: resume.score, available: resume.available, signals: resume.signals },
      linkedin: { score: li.score, available: li.available, signals: li.signals },
      github: { score: gh.score, available: gh.available, signals: gh.signals },
      keywords: {
        score: keywords.score,
        available: keywords.available,
        matched: keywords.matched,
        missing: keywords.missing,
      },
    },
    missingSources,
    suggestions,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  computeVisibility,
  // exported for testing
  scoreResume,
  scoreLinkedIn,
  scoreGitHub,
  scoreKeywords,
  RECRUITER_VOCABULARY,
};
