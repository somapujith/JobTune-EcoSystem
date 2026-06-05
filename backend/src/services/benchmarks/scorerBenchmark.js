/**
 * Scorer Benchmark Service
 * Evaluates scorer strategies against human-labelled fixture data.
 * Computes MAE, Pearson correlation, and precision@threshold.
 */

const { pool } = require('../../config/database');

// ─── Fixture dataset (5–10 labelled resume/job pairs) ────────────────────────

const FIXTURE_DATASET = [
  {
    role: 'Backend Engineer',
    resumeText:
      'Senior Node.js developer with 6 years building REST APIs, microservices, and PostgreSQL schemas.',
    jobDescription:
      'Looking for a backend engineer proficient in Node.js, REST APIs, and relational databases.',
    humanScore: 88
  },
  {
    role: 'Frontend Engineer',
    resumeText:
      'React developer with 3 years experience, skilled in TypeScript, Redux, and Jest testing.',
    jobDescription:
      'Frontend role requiring React, TypeScript, and unit testing with Jest.',
    humanScore: 82
  },
  {
    role: 'Data Scientist',
    resumeText:
      'Machine learning engineer with Python, TensorFlow, and 4 years of NLP project experience.',
    jobDescription:
      'Data scientist role focused on NLP, Python, and deploying ML models to production.',
    humanScore: 79
  },
  {
    role: 'DevOps Engineer',
    resumeText:
      'Sysadmin background with 2 years Kubernetes, Terraform, and AWS. Limited CI/CD experience.',
    jobDescription:
      'DevOps engineer with strong Kubernetes, Terraform, AWS, and CI/CD pipeline ownership.',
    humanScore: 65
  },
  {
    role: 'Product Manager',
    resumeText:
      'Marketing manager transitioning to product. Experience in user research and roadmap presentations.',
    jobDescription:
      'PM with 3+ years owning product roadmaps, working with engineering, and driving OKRs.',
    humanScore: 52
  },
  {
    role: 'Full Stack Engineer',
    resumeText:
      '5 years full stack with React, Node.js, PostgreSQL, Docker, and agile delivery.',
    jobDescription:
      'Full stack developer with React, Node.js, databases, and container experience.',
    humanScore: 91
  },
  {
    role: 'Mobile Developer',
    resumeText:
      'iOS developer (Swift, SwiftUI) with 4 years publishing apps on the App Store.',
    jobDescription:
      'React Native mobile developer for cross-platform iOS and Android applications.',
    humanScore: 45
  }
];

// ─── Scorer strategies ────────────────────────────────────────────────────────

/**
 * Keyword-overlap ATS-style scorer.
 * Returns a score 0-100 based on keyword match ratio.
 */
function atsScore(resumeText, jobDescription) {
  const jobWords = new Set(
    jobDescription
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3)
  );

  const resumeWords = resumeText
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3);

  if (jobWords.size === 0) return 50;

  const matches = resumeWords.filter(w => jobWords.has(w)).length;
  const ratio = Math.min(matches / jobWords.size, 1);
  return Math.round(40 + ratio * 55); // scale to 40-95
}

/**
 * HR holistic scorer — weights title match and experience length signals.
 */
function hrScore(resumeText, jobDescription, role) {
  const base = atsScore(resumeText, jobDescription);
  const roleWords = (role || '').toLowerCase().split(/\s+/);
  const resumeLower = resumeText.toLowerCase();
  const roleBonus = roleWords.some(w => resumeLower.includes(w)) ? 5 : 0;
  return Math.min(base + roleBonus, 100);
}

/**
 * Fit scorer — penalises mismatch signals.
 */
function fitScore(resumeText, jobDescription, role) {
  const base = hrScore(resumeText, jobDescription, role);
  // Simple heuristic: if resume mentions "transitioning" or "limited" penalise
  const resumeLower = resumeText.toLowerCase();
  const penalty =
    resumeLower.includes('transitioning') || resumeLower.includes('limited') ? 10 : 0;
  return Math.max(base - penalty, 0);
}

const SCORERS = {
  ats: (item) => atsScore(item.resumeText, item.jobDescription),
  hr: (item) => hrScore(item.resumeText, item.jobDescription, item.role),
  fit: (item) => fitScore(item.resumeText, item.jobDescription, item.role)
};

// ─── Metric calculations ──────────────────────────────────────────────────────

/**
 * Compute benchmark metrics.
 *
 * @param {number[]} humanScores
 * @param {number[]} modelScores
 * @param {{ threshold?: number }} [opts]
 * @returns {{ mae: number, correlation: number, precisionAtThreshold: number }}
 */
function computeMetrics(humanScores, modelScores, { threshold = 70 } = {}) {
  if (humanScores.length === 0 || modelScores.length === 0) {
    throw new Error('Score arrays must not be empty');
  }

  if (humanScores.length !== modelScores.length) {
    throw new Error('Score arrays must have the same length');
  }

  const n = humanScores.length;

  // MAE
  const mae =
    humanScores.reduce((sum, h, i) => sum + Math.abs(h - modelScores[i]), 0) / n;

  // Pearson correlation
  const meanH = humanScores.reduce((s, v) => s + v, 0) / n;
  const meanM = modelScores.reduce((s, v) => s + v, 0) / n;

  let num = 0;
  let denH = 0;
  let denM = 0;
  for (let i = 0; i < n; i++) {
    const dh = humanScores[i] - meanH;
    const dm = modelScores[i] - meanM;
    num += dh * dm;
    denH += dh * dh;
    denM += dm * dm;
  }
  const correlation = denH === 0 || denM === 0 ? 0 : num / Math.sqrt(denH * denM);

  // Precision@threshold: among items human scored >= threshold,
  // what fraction did the model also score >= threshold?
  const humanPositives = humanScores.filter(s => s >= threshold);
  const truePositives = humanScores.filter(
    (h, i) => h >= threshold && modelScores[i] >= threshold
  );
  const precisionAtThreshold =
    humanPositives.length === 0 ? 0 : truePositives.length / humanPositives.length;

  return {
    mae: Math.round(mae * 100) / 100,
    correlation: Math.round(correlation * 10000) / 10000,
    precisionAtThreshold: Math.round(precisionAtThreshold * 10000) / 10000
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Run benchmark for a named scorer strategy against the fixture dataset.
 * Persists results and returns metrics.
 *
 * @param {{ scorerName: string, datasetName: string }} opts
 * @returns {Promise<{ mae: number, correlation: number, precisionAtThreshold: number, sampleSize: number }>}
 */
async function runBenchmark({ scorerName, datasetName }) {
  if (!scorerName) throw new Error('scorerName is required');
  if (!datasetName) throw new Error('datasetName is required');

  const scorer = SCORERS[scorerName] || SCORERS.ats;

  const humanScores = FIXTURE_DATASET.map(item => item.humanScore);
  const modelScores = FIXTURE_DATASET.map(item => scorer(item));

  const metrics = computeMetrics(humanScores, modelScores);
  const sampleSize = FIXTURE_DATASET.length;

  await pool.query(
    'INSERT INTO scorer_benchmarks (scorer_name, dataset_name, metrics, sample_size) VALUES ($1, $2, $3, $4)',
    [scorerName, datasetName, JSON.stringify(metrics), sampleSize]
  );

  return { ...metrics, sampleSize };
}

module.exports = { runBenchmark, computeMetrics, FIXTURE_DATASET };
