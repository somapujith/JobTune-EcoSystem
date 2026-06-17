/**
 * Resume Consistency Checker - cross-comparison engine (pipeline tool #10)
 *
 * Pure, deterministic, rule-based cross-comparison of a candidate's
 * professional profiles: Resume + LinkedIn + GitHub.
 *
 *  Resume + LinkedIn + GitHub  ->  Cross Comparison  ->  Mismatch Detection
 *                              ->  Consistency Report (categorized + score)
 *
 * Tolerates missing / partial inputs. No external calls, no LLM.
 *
 * Expected (loose) input shapes - every field is optional:
 *   resume = {
 *     name, headline/title,
 *     skills: [string],
 *     projects: [{ name, ... } | string],
 *     experience: [{ title, company, startDate, endDate }]
 *   }
 *   linkedin = {
 *     name, headline/title,
 *     skills: [string],
 *     experience: [{ title, company, startDate, endDate }]
 *   }
 *   github = {
 *     username,
 *     repos/projects: [{ name, language, ... } | string],
 *     languages: [string]   // optional, derived from repos if absent
 *   }
 */

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

function norm(value) {
  return String(value == null ? '' : value)
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === '') return [];
  return [value];
}

/** Pull a comparable "name" string out of a string or object item. */
function itemName(item) {
  if (item == null) return '';
  if (typeof item === 'string') return item;
  return item.name || item.title || item.label || item.repo || item.fullName || '';
}

/** Collect a deduped, normalized list of names from a list of items. */
function nameSet(items) {
  const map = new Map(); // normalized -> original display
  for (const it of toArray(items)) {
    const display = itemName(it);
    const key = norm(display);
    if (key && !map.has(key)) map.set(key, display);
  }
  return map;
}

/** Year extracted from a date-ish value, or null. */
function yearOf(value) {
  if (value == null) return null;
  const m = String(value).match(/(19|20)\d{2}/);
  return m ? parseInt(m[0], 10) : null;
}

// ---------------------------------------------------------------------------
// Skill extraction (resume / linkedin explicit lists, github via languages)
// ---------------------------------------------------------------------------

function skillSet(profile) {
  if (!profile) return new Map();
  const skills = toArray(profile.skills);
  // GitHub: derive from languages and repo languages when no explicit skills.
  if (skills.length === 0) {
    const langs = toArray(profile.languages);
    const repoLangs = toArray(profile.repos || profile.projects)
      .map((r) => (r && typeof r === 'object' ? r.language : null))
      .filter(Boolean);
    return nameSet([...langs, ...repoLangs]);
  }
  return nameSet(skills);
}

function projectSet(profile) {
  if (!profile) return new Map();
  return nameSet(profile.projects || profile.repos);
}

function experienceList(profile) {
  if (!profile) return [];
  return toArray(profile.experience).map((e) => ({
    title: itemName(e) || e.title || '',
    company: (e && e.company) || '',
    titleKey: norm(e && (e.title || itemName(e))),
    companyKey: norm(e && e.company),
    start: yearOf(e && (e.startDate || e.start || e.from)),
    end: yearOf(e && (e.endDate || e.end || e.to)),
  }));
}

// ---------------------------------------------------------------------------
// Comparison primitives
// ---------------------------------------------------------------------------

/** Items present in `a` but absent from `b`. Returns display strings. */
function presentInANotB(a, b) {
  const out = [];
  for (const [key, display] of a) {
    if (!b.has(key)) out.push(display);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

/**
 * @returns {{
 *   consistencyScore: number,
 *   summary: { totalMismatches: number, sourcesProvided: string[] },
 *   mismatches: Array<{ category: string, severity: string, source: string, target: string, items: string[], details?: string }>,
 *   generatedAt: string
 * }}
 */
function checkConsistency({ resume, linkedin, github } = {}) {
  const sourcesProvided = [];
  if (resume) sourcesProvided.push('resume');
  if (linkedin) sourcesProvided.push('linkedin');
  if (github) sourcesProvided.push('github');

  const mismatches = [];
  const push = (category, severity, source, target, items, details) => {
    if (!items || items.length === 0) return;
    mismatches.push({ category, severity, source, target, items, details });
  };

  // --- Skill sets ---
  const resumeSkills = skillSet(resume);
  const linkedinSkills = skillSet(linkedin);
  const githubSkills = skillSet(github);

  // --- Project sets ---
  const resumeProjects = projectSet(resume);
  const githubProjects = projectSet(github);

  // ----- Projects: GitHub repos missing from resume -----
  if (resume && github) {
    push(
      'Projects Missing in Resume',
      'medium',
      'github',
      'resume',
      presentInANotB(githubProjects, resumeProjects),
      'GitHub projects/repositories that do not appear on the resume.'
    );
    // Resume projects not surfaced on GitHub (informational).
    push(
      'Projects Missing in GitHub',
      'low',
      'resume',
      'github',
      presentInANotB(resumeProjects, githubProjects),
      'Resume projects without a matching public GitHub repository.'
    );
  }

  // ----- Skills: resume vs linkedin -----
  if (resume && linkedin) {
    push(
      'Skills Missing in LinkedIn',
      'medium',
      'resume',
      'linkedin',
      presentInANotB(resumeSkills, linkedinSkills),
      'Skills listed on the resume but absent from the LinkedIn profile.'
    );
    push(
      'Skills Missing in Resume',
      'medium',
      'linkedin',
      'resume',
      presentInANotB(linkedinSkills, resumeSkills),
      'Skills listed on LinkedIn but absent from the resume.'
    );
  }

  // ----- Skills: github-evidenced languages missing from resume -----
  if (resume && github) {
    push(
      'Skills Missing in Resume',
      'low',
      'github',
      'resume',
      presentInANotB(githubSkills, resumeSkills),
      'Languages/skills evidenced by GitHub activity but not on the resume.'
    );
  }

  // ----- Experience: title / date mismatches between resume and linkedin -----
  if (resume && linkedin) {
    const rExp = experienceList(resume);
    const lExp = experienceList(linkedin);
    const titleMismatches = [];
    const dateMismatches = [];
    const missingInLinkedin = [];

    for (const r of rExp) {
      if (!r.companyKey) continue;
      const match = lExp.find((l) => l.companyKey && l.companyKey === r.companyKey);
      if (!match) {
        missingInLinkedin.push(`${r.title || 'role'} @ ${r.company}`);
        continue;
      }
      // Title mismatch for the same company.
      if (r.titleKey && match.titleKey && r.titleKey !== match.titleKey) {
        titleMismatches.push(
          `${r.company}: resume "${r.title}" vs LinkedIn "${match.title}"`
        );
      }
      // Date mismatch for the same company.
      const startDiff = r.start != null && match.start != null && r.start !== match.start;
      const endDiff = r.end != null && match.end != null && r.end !== match.end;
      if (startDiff || endDiff) {
        dateMismatches.push(
          `${r.company}: resume ${r.start || '?'}-${r.end || 'present'} vs LinkedIn ${match.start || '?'}-${match.end || 'present'}`
        );
      }
    }

    push(
      'Title Mismatches',
      'high',
      'resume',
      'linkedin',
      titleMismatches,
      'Same employer with differing job titles across resume and LinkedIn.'
    );
    push(
      'Date Mismatches',
      'high',
      'resume',
      'linkedin',
      dateMismatches,
      'Same employer with differing employment dates across resume and LinkedIn.'
    );
    push(
      'Experience Missing in LinkedIn',
      'medium',
      'resume',
      'linkedin',
      missingInLinkedin,
      'Resume roles without a matching company on LinkedIn.'
    );
  }

  // ----- Headline / name consistency between resume and linkedin -----
  if (resume && linkedin) {
    const rHead = norm(resume.headline || resume.title);
    const lHead = norm(linkedin.headline || linkedin.title);
    if (rHead && lHead && rHead !== lHead) {
      push(
        'Headline Mismatches',
        'low',
        'resume',
        'linkedin',
        [`resume "${resume.headline || resume.title}" vs LinkedIn "${linkedin.headline || linkedin.title}"`],
        'Professional headline differs between resume and LinkedIn.'
      );
    }
    const rName = norm(resume.name);
    const lName = norm(linkedin.name);
    if (rName && lName && rName !== lName) {
      push(
        'Name Mismatches',
        'medium',
        'resume',
        'linkedin',
        [`resume "${resume.name}" vs LinkedIn "${linkedin.name}"`],
        'Candidate name differs across profiles.'
      );
    }
  }

  // ----- Scoring -----
  // Start at 100, deduct weighted per mismatch item, floor at 0.
  const weights = { high: 8, medium: 4, low: 1.5 };
  let totalMismatches = 0;
  let penalty = 0;
  for (const m of mismatches) {
    totalMismatches += m.items.length;
    penalty += m.items.length * (weights[m.severity] || 3);
  }

  // If fewer than two sources were provided, the score is not meaningful.
  const comparable = sourcesProvided.length >= 2;
  let consistencyScore = comparable ? Math.max(0, Math.round(100 - penalty)) : null;

  return {
    consistencyScore,
    summary: {
      totalMismatches,
      sourcesProvided,
      comparable,
    },
    mismatches,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  checkConsistency,
  // exported for testing / reuse
  norm,
  skillSet,
  projectSet,
  experienceList,
};
