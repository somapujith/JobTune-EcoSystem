const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requirePlan } = require('../middleware/requirePlan');
const { callAI, extractJSON } = require('../utils/aiClient');
const { pool } = require('../config/database');

// ───────────────────────────────────────────────────────────────────────────
// Constants
// ───────────────────────────────────────────────────────────────────────────

const GH_HEADERS = {
  'Accept': 'application/vnd.github.v3+json',
  'User-Agent': 'JobTune-Optimizer',
};

const BAD_NAME_PATTERN = /^(test|project|untitled|asdf|temp|new|repo|app|my|demo|hello|world|practice|sample|example|homework|assignment)\d*$/i;

const HOSTING_TOPICS = ['vercel', 'netlify', 'deployed', 'live', 'demo', 'github-pages'];

const DIVERSITY_CATEGORIES = {
  frontend: ['javascript', 'typescript', 'html', 'css', 'vue', 'svelte', 'react', 'angular', 'next', 'nextjs', 'tailwind'],
  backend: ['python', 'java', 'go', 'golang', 'rust', 'php', 'ruby', 'c#', 'c++', 'kotlin', 'swift', 'node', 'nodejs', 'express', 'django', 'flask', 'spring'],
  database: ['sql', 'mysql', 'postgres', 'postgresql', 'mongo', 'mongodb', 'redis', 'database', 'db', 'sqlite'],
  aiml: ['python', 'jupyter', 'ml', 'ai', 'machine-learning', 'tensorflow', 'pytorch', 'keras', 'scikit-learn', 'nlp', 'deep-learning'],
  devops: ['docker', 'kubernetes', 'k8s', 'aws', 'azure', 'gcp', 'ci', 'cd', 'ci-cd', 'devops', 'terraform', 'jenkins'],
};

const LANG_COLORS = {
  JavaScript: { hex: 'F7DF1E', logo: 'javascript' },
  TypeScript: { hex: '3178C6', logo: 'typescript' },
  Python:     { hex: '3776AB', logo: 'python' },
  Java:       { hex: 'ED8B00', logo: 'java' },
  'C++':      { hex: '00599C', logo: 'cplusplus' },
  'C#':       { hex: '239120', logo: 'csharp' },
  PHP:        { hex: '777BB4', logo: 'php' },
  Ruby:       { hex: 'CC342D', logo: 'ruby' },
  Go:         { hex: '00ADD8', logo: 'go' },
  Rust:       { hex: '000000', logo: 'rust' },
  HTML:       { hex: 'E34F26', logo: 'html5' },
  CSS:        { hex: '1572B6', logo: 'css3' },
  Kotlin:     { hex: '7F52FF', logo: 'kotlin' },
  Swift:      { hex: 'FA7343', logo: 'swift' },
};

const HOSTING_RULES = {
  JavaScript: { platform: 'Vercel', reason: 'JS/React apps deploy to Vercel in under 2 minutes — recruiters can view a live demo.' },
  TypeScript: { platform: 'Vercel', reason: 'TS/React apps deploy to Vercel instantly with zero config.' },
  HTML:       { platform: 'GitHub Pages', reason: 'Static sites host free on GitHub Pages — no account needed.' },
  CSS:        { platform: 'GitHub Pages', reason: 'Static sites host free on GitHub Pages — no account needed.' },
  Python:     { platform: 'Railway', reason: 'Python apps deploy to Railway with a single command and free tier.' },
  Vue:        { platform: 'Vercel', reason: 'Vue apps deploy to Vercel in under 2 minutes.' },
};

// ───────────────────────────────────────────────────────────────────────────
// Stage 1 — Data Collection
// ───────────────────────────────────────────────────────────────────────────

async function fetchGitHubData(username) {
  try {
    const [userRes, reposRes] = await Promise.all([
      fetch(`https://api.github.com/users/${username}`, { headers: GH_HEADERS }),
      fetch(`https://api.github.com/users/${username}/repos?per_page=100&sort=updated`, { headers: GH_HEADERS }),
    ]);

    if (!userRes.ok) return null;

    const user = await userRes.json();
    const repos = reposRes.ok ? await reposRes.json() : [];

    const publicRepos = Array.isArray(repos) ? repos.filter(r => !r.fork) : [];
    const totalStars = publicRepos.reduce((sum, r) => sum + (r.stargazers_count || 0), 0);
    const reposWithDescription = publicRepos.filter(r => r.description && r.description.length > 10).length;
    const reposWithTopics = publicRepos.filter(r => Array.isArray(r.topics) && r.topics.length >= 2).length;
    const languages = [...new Set(publicRepos.map(r => r.language).filter(Boolean))];
    const hasProfileReadme = publicRepos.some(r => r.name.toLowerCase() === username.toLowerCase());

    // Optional third call — only if the profile README repo exists.
    let existingReadmeContent = null;
    if (hasProfileReadme) {
      try {
        const readmeRes = await fetch(
          `https://api.github.com/repos/${username}/${username}/readme`,
          { headers: GH_HEADERS }
        );
        if (readmeRes.ok) {
          const readmeJson = await readmeRes.json();
          if (readmeJson.content) {
            existingReadmeContent = Buffer.from(readmeJson.content, 'base64').toString('utf8');
          }
        }
      } catch (e) {
        // Non-fatal — profile README content is a nice-to-have.
        console.warn('Profile README fetch failed:', e.message);
      }
    }

    return {
      login: user.login,
      name: user.name,
      bio: user.bio,
      followers: user.followers,
      following: user.following,
      publicRepos: user.public_repos,
      company: user.company,
      location: user.location,
      blog: user.blog,
      createdAt: user.created_at,
      totalStars,
      reposWithDescription,
      reposWithTopics,
      languages,
      hasProfileReadme,
      existingReadmeContent,
      repos: publicRepos.map(r => ({
        name: r.name,
        description: r.description,
        language: r.language,
        topics: Array.isArray(r.topics) ? r.topics : [],
        stars: r.stargazers_count || 0,
        forks: r.forks_count || 0,
        homepage: r.homepage,
        updatedAt: r.pushed_at || r.updated_at,
        size: r.size || 0,
      })),
    };
  } catch (err) {
    console.error('GitHub API error:', err.message);
    return null;
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Stage 2 — Portfolio Scoring Engine (deterministic, no AI)
// ───────────────────────────────────────────────────────────────────────────

function isHostedRepo(r) {
  if (r.homepage && r.homepage.length > 0) return true;
  return (r.topics || []).some(t => HOSTING_TOPICS.includes(String(t).toLowerCase()));
}

function daysSince(dateStr) {
  if (!dateStr) return Infinity;
  return (Date.now() - new Date(dateStr).getTime()) / 86400000;
}

function scorePortfolio(ghData) {
  const repos = ghData.repos || [];
  const total = Math.max(repos.length, 1);
  const issues = [];

  // Profile README (15)
  let profileReadme = 0;
  if (ghData.hasProfileReadme) {
    profileReadme = 15;
  } else {
    issues.push(`No profile README — create a repo named exactly '${ghData.login}' to enable your GitHub homepage card.`);
  }

  // Bio (10)
  let bio = 0;
  const bioLen = (ghData.bio || '').trim().length;
  if (bioLen >= 20) bio = 10;
  else if (bioLen > 0) bio = 5;
  if (bioLen < 10) issues.push('Your bio is missing or too short. A concise bio helps recruiters evaluate you in seconds.');

  // Repo Naming (10)
  const goodNameCount = repos.filter(r => !BAD_NAME_PATTERN.test(r.name) && r.name.length >= 4).length;
  const repoNaming = Math.round((goodNameCount / total) * 10);
  if (goodNameCount < repos.length) {
    issues.push('Some repositories have generic names (e.g. "test123", "project1"). Rename them descriptively.');
  }

  // Descriptions (10)
  const withDesc = repos.filter(r => r.description && r.description.length > 10).length;
  const descriptions = Math.round((withDesc / total) * 10);
  if (repos.length > 0 && withDesc / total < 0.5) {
    issues.push('Less than half your repos have descriptions. Add a one-line summary to each.');
  }

  // Topics (10)
  const withTopics = repos.filter(r => Array.isArray(r.topics) && r.topics.length >= 2).length;
  const topics = Math.round((withTopics / total) * 10);
  if (topics < 5) {
    issues.push('Most repos have no topics. Add 3–5 relevant tags so they surface in GitHub search.');
  }

  // README Quality (15) — description length as a no-extra-API-call proxy.
  const maxDescLen = repos.reduce((m, r) => Math.max(m, (r.description || '').length), 0);
  let readmeQuality = 0;
  if (maxDescLen > 150) readmeQuality = 15;
  else if (maxDescLen > 80) readmeQuality = 10;
  else if (maxDescLen > 20) readmeQuality = 5;

  // Hosting (10)
  const hostedCount = repos.filter(isHostedRepo).length;
  const hosting = Math.min(hostedCount * 2, 10);
  if (hostedCount === 0 && repos.length > 0) {
    issues.push('None of your projects are deployed. A live demo URL dramatically increases recruiter engagement.');
  }

  // Activity (10)
  const minDays = repos.reduce((m, r) => Math.min(m, daysSince(r.updatedAt)), Infinity);
  let activity = 0;
  if (minDays <= 30) activity = 10;
  else if (minDays <= 90) activity = 6;
  else if (minDays <= 180) activity = 3;
  if (activity === 0 && repos.length > 0) {
    issues.push('No recent activity in the last 6 months. Recruiters look for active contributors.');
  }

  // Project Diversity (10)
  const haystack = repos
    .flatMap(r => [r.language, ...(r.topics || []), r.name])
    .filter(Boolean)
    .map(s => String(s).toLowerCase());
  let detected = 0;
  for (const keywords of Object.values(DIVERSITY_CATEGORIES)) {
    if (keywords.some(k => haystack.some(h => h.includes(k)))) detected += 1;
  }
  const diversity = Math.min(detected * 2, 10);

  const overall = profileReadme + bio + repoNaming + descriptions + topics + readmeQuality + hosting + activity + diversity;

  let grade = 'Needs Work';
  if (overall >= 90) grade = 'Excellent';
  else if (overall >= 75) grade = 'Good';
  else if (overall >= 55) grade = 'Average';

  return {
    scores: { profileReadme, bio, repoNaming, descriptions, topics, readmeQuality, hosting, activity, diversity, overall },
    grade,
    issues,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Stage 3 — Project Categorization (deterministic, no AI)
// ───────────────────────────────────────────────────────────────────────────

function categorizeProjects(repos) {
  const ranked = [...repos]
    .map(r => {
      const recency = Math.max(0, 1 - daysSince(r.updatedAt) / 365);
      const composite =
        (r.stars || 0) * 0.4 +
        (r.forks || 0) * 0.2 +
        recency * 0.2 +
        (r.description && r.description.length > 10 ? 0.1 : 0) +
        (r.homepage && r.homepage.length > 0 ? 0.1 : 0);
      return { name: r.name, composite };
    })
    .sort((a, b) => b.composite - a.composite);

  const showcaseProjects = ranked.slice(0, 5).map(r => r.name);

  const portfolioPattern = /portfolio|resume|personal.?site|my.?website|website/i;
  const hasPortfolio = repos.some(r =>
    portfolioPattern.test(r.name) ||
    portfolioPattern.test(r.description || '') ||
    (r.topics || []).some(t => portfolioPattern.test(t))
  );

  return { showcaseProjects, hasPortfolio };
}

// ───────────────────────────────────────────────────────────────────────────
// generateReadme — template fallback for the profile README (kept verbatim)
// ───────────────────────────────────────────────────────────────────────────

function generateReadme(ghData) {
  const name = ghData.name || ghData.login;
  const bio = ghData.bio || 'Passionate developer building interesting projects.';

  const badges = ghData.languages.map(lang => {
    const info = LANG_COLORS[lang];
    if (info) {
      return `![${lang}](https://img.shields.io/badge/-${encodeURIComponent(lang)}-${info.hex}?style=flat-square&logo=${info.logo}&logoColor=white)`;
    }
    return `\`${lang}\``;
  }).join(' ');

  const topRepos = [...ghData.repos]
    .sort((a, b) => (b.stars || 0) - (a.stars || 0))
    .slice(0, 5);

  const projects = topRepos.map(r =>
    `- **[${r.name}](https://github.com/${ghData.login}/${r.name})**: ${r.description || 'No description provided'} *(⭐ ${r.stars} | ${r.language || 'Unknown'})*`
  ).join('\n');

  let connect = '';
  if (ghData.blog) {
    connect += `[Website/Blog](${ghData.blog.startsWith('http') ? ghData.blog : `https://${ghData.blog}`}) · `;
  }
  connect += `[GitHub](https://github.com/${ghData.login})`;

  return `# Hi, I'm ${name} 👋

${bio}

## 🛠 Tech Stack
${badges || '_No languages detected yet_'}

## 📂 Featured Projects
${projects || '_No public projects available_'}

## 📊 GitHub Stats
![stats](https://github-readme-stats.vercel.app/api?username=${ghData.login}&show_icons=true&theme=transparent)

## 📫 Connect
${connect}`;
}

// ───────────────────────────────────────────────────────────────────────────
// Stage 4 — Single AI Enhancement call (with deterministic fallback)
// ───────────────────────────────────────────────────────────────────────────

function unhostedFrontendRepos(repos) {
  const frontendLangs = ['JavaScript', 'TypeScript', 'HTML', 'CSS', 'Vue'];
  return repos.filter(r => frontendLangs.includes(r.language) && !isHostedRepo(r));
}

function buildFallbackEnhancements(ghData, scores) {
  const repos = ghData.repos || [];

  const bioSuggestion = (
    `${ghData.languages[0] || 'Software'} Developer | ${ghData.languages.slice(0, 3).join(' · ')}`
  ).slice(0, 160);

  const repoSuggestions = repos
    .filter(r => (BAD_NAME_PATTERN.test(r.name) || r.name.length < 4) || !(r.description && r.description.length > 10))
    .slice(0, 5)
    .map(r => ({
      currentName: r.name,
      suggestedName: r.name,
      suggestedDescription: r.description && r.description.length > 10
        ? r.description
        : 'Add a clear one-line description for this project.',
    }));

  const hostingRecs = unhostedFrontendRepos(repos).slice(0, 5).map(r => {
    const rule = HOSTING_RULES[r.language] || { platform: 'Vercel', reason: 'A live demo URL makes your project far more reviewable.' };
    return {
      repo: r.name,
      platform: rule.platform,
      priority: 'High',
      reason: rule.reason,
      steps: rule.platform === 'GitHub Pages'
        ? ['Open repo Settings → Pages', 'Select branch & root', 'Save — your site goes live']
        : [`Go to ${rule.platform.toLowerCase()}.com/new`, `Import the ${r.name} repo`, 'Click Deploy'],
    };
  });

  let recruiterSummary;
  if (scores.overall >= 75) {
    recruiterSummary = 'Strong, recruiter-ready portfolio with consistent activity and good documentation. A few deployment links would push it further.';
  } else if (scores.overall >= 55) {
    recruiterSummary = 'Solid foundation, but visibility gaps — missing descriptions, undeployed projects, or no profile README — are reducing recruiter engagement.';
  } else {
    recruiterSummary = 'Your GitHub needs work before it helps your job search. Focus on a profile README, project descriptions, and deploying at least one project.';
  }

  return {
    profileReadme: generateReadme(ghData),
    bioSuggestion,
    repoSuggestions,
    hostingRecs,
    recruiterSummary,
  };
}

async function getAIEnhancements(ghData, scores, showcaseProjects, issues) {
  const repos = ghData.repos || [];
  const unhosted = unhostedFrontendRepos(repos).map(r => `${r.name} (${r.language})`);

  const systemPrompt = `You are a GitHub profile career advisor. Given a developer's GitHub audit data, return a JSON object with exactly these keys:
- profileReadme: string (a complete GitHub profile README in markdown, personalized to their actual languages and top repos, with shields.io badges, a GitHub stats widget, and a connect section)
- bioSuggestion: string (under 160 characters, role-first, e.g. "Full Stack Developer | React · Python · Node.js")
- repoSuggestions: array of objects { currentName, suggestedName, suggestedDescription } for repos with generic names or missing descriptions, max 5 items
- hostingRecs: array of objects { repo, platform, priority, reason, steps } for unhosted frontend/fullstack repos, max 5 items. platform must be one of: Vercel, Railway, Render, GitHub Pages. steps is an array of short strings.
- recruiterSummary: string (2-3 sentences, direct honest assessment of the portfolio's recruiter readiness)
Return valid JSON only. No markdown fences, no extra commentary.`;

  const userPrompt = `Developer GitHub data:
- Username: ${ghData.login}
- Name: ${ghData.name || ghData.login}
- Bio: ${ghData.bio || '(none)'}
- Followers: ${ghData.followers}
- Public repos: ${ghData.publicRepos}
- Languages: ${ghData.languages.join(', ') || '(none detected)'}
- Total stars: ${ghData.totalStars}
- Has profile README: ${ghData.hasProfileReadme}

Audit scores (out of category max): ${JSON.stringify(scores)}
Overall: ${scores.overall}/100

Detected issues:
${issues.map(i => `- ${i}`).join('\n') || '- none'}

Top showcase projects: ${showcaseProjects.join(', ') || '(none)'}
Unhosted frontend repos: ${unhosted.join(', ') || '(none)'}

Top repos (name | language | stars | description):
${repos.slice(0, 8).map(r => `${r.name} | ${r.language || '?'} | ${r.stars} | ${r.description || '(no description)'}`).join('\n')}

Generate the JSON now.`;

  const aiResult = await callAI({
    systemPrompt,
    userPrompt,
    maxTokens: 1500,
    temperature: 0.5,
    model: process.env.LM_STUDIO_MODEL_GITHUB || process.env.LM_STUDIO_MODEL,
    structuredJson: true,
  });

  if (aiResult.ok && aiResult.data) {
    const parsed = extractJSON(aiResult.data);
    if (parsed && parsed.profileReadme && parsed.recruiterSummary) {
      return {
        profileReadme: parsed.profileReadme,
        bioSuggestion: parsed.bioSuggestion || buildFallbackEnhancements(ghData, scores).bioSuggestion,
        repoSuggestions: Array.isArray(parsed.repoSuggestions) ? parsed.repoSuggestions.slice(0, 5) : [],
        hostingRecs: Array.isArray(parsed.hostingRecs) ? parsed.hostingRecs.slice(0, 5) : [],
        recruiterSummary: parsed.recruiterSummary,
        aiPowered: true,
      };
    }
  }

  return { ...buildFallbackEnhancements(ghData, scores), aiPowered: false };
}

// ───────────────────────────────────────────────────────────────────────────
// Stage 5 — Final Report Assembly (deterministic priority rules)
// ───────────────────────────────────────────────────────────────────────────

function assembleFinalReport(scores, ghData, stage4) {
  const repos = ghData.repos || [];
  const topPriorities = [];

  // Priority 1 — no profile README
  if (!ghData.hasProfileReadme) {
    topPriorities.push({
      rank: 1,
      impact: 'high',
      action: 'Create your GitHub profile README',
      why: "It's the first thing a recruiter sees when they open your GitHub. Without it, your profile shows nothing.",
      effort: '15 minutes',
    });
  }

  // Priority 2 — unhosted frontend repos
  const unhosted = unhostedFrontendRepos(repos);
  if (unhosted.length > 0) {
    topPriorities.push({
      rank: topPriorities.length + 1,
      impact: 'high',
      action: `Deploy ${unhosted[0].name} to Vercel`,
      why: 'Frontend projects without live URLs are often skipped in hiring reviews.',
      effort: '5 minutes',
    });
  }

  // Priority 3 — repos with no description at all
  const noDesc = repos.filter(r => !r.description || r.description.length === 0);
  if (noDesc.length > 0) {
    topPriorities.push({
      rank: topPriorities.length + 1,
      impact: 'medium',
      action: `Add descriptions to ${noDesc.length} repo${noDesc.length === 1 ? '' : 's'}`,
      why: 'Repos without descriptions signal incomplete work — even a one-liner changes that perception.',
      effort: '10 minutes',
    });
  }

  // Priority 4 — bad repo names
  const badNames = repos.filter(r => BAD_NAME_PATTERN.test(r.name) || r.name.length < 4);
  if (badNames.length > 0) {
    topPriorities.push({
      rank: topPriorities.length + 1,
      impact: 'medium',
      action: 'Rename generic repos',
      why: 'Professional repo names (e.g. "react-dashboard" vs "project2") show attention to detail.',
      effort: '5 minutes',
    });
  }

  // Priority 5 — repos with no topics
  const noTopics = repos.filter(r => !Array.isArray(r.topics) || r.topics.length === 0);
  if (noTopics.length > 0) {
    topPriorities.push({
      rank: topPriorities.length + 1,
      impact: 'low',
      action: 'Add topics/tags to repos',
      why: 'Topics improve discoverability in GitHub search and signal your focus areas.',
      effort: '10 minutes',
    });
  }

  // Quick wins
  const quickWins = [];
  if (noDesc.length > 0) quickWins.push(`Add descriptions to ${noDesc.length} repo${noDesc.length === 1 ? '' : 's'} that have none`);
  if (noTopics.length > 0) quickWins.push(`Add topics to ${noTopics.length} repo${noTopics.length === 1 ? '' : 's'}`);
  if (!ghData.bio || ghData.bio.length < 20) quickWins.push('Write a one-line bio with your role and stack');

  // Strengths
  const strengths = [];
  if (scores.activity === 10) strengths.push('Active commit history in the last 30 days');
  if (scores.diversity >= 6) strengths.push(`Diverse tech stack across ${ghData.languages.length} languages`);
  if (ghData.totalStars >= 10) strengths.push(`${ghData.totalStars} total stars shows community interest`);
  if (ghData.publicRepos >= 15) strengths.push(`${ghData.publicRepos} public repos demonstrates consistent activity`);
  if (ghData.hasProfileReadme) strengths.push('You have a profile README — good first impression');
  if (scores.hosting >= 6) strengths.push('Multiple projects are deployed with live URLs');
  if (strengths.length === 0) strengths.push('You have a public GitHub presence — a solid starting point');

  return {
    summary: stage4.recruiterSummary,
    strengths: strengths.slice(0, 5),
    quickWins,
    topPriorities,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// GitHub endpoints
// ═══════════════════════════════════════════════════════════════════════════

// POST /api/profiles/github/analyze — runs the full 5-stage pipeline.
router.post('/github/analyze', authenticateToken, requirePlan(2), async (req, res) => {
  try {
    let { username } = req.body;
    if (!username) return res.status(400).json({ error: 'GitHub username or URL is required' });

    username = String(username).trim()
      .replace(/^https?:\/\//i, '')
      .replace(/^github\.com\//i, '')
      .split('/')[0]
      .split('?')[0]
      .toLowerCase();

    if (!username || !/^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(username)) {
      return res.status(400).json({ error: 'Invalid GitHub username format.' });
    }

    const ghData = await fetchGitHubData(username);
    if (!ghData) {
      return res.status(404).json({ error: `GitHub user "${username}" not found or API unavailable.` });
    }

    const { scores, grade, issues } = scorePortfolio(ghData);
    const { showcaseProjects, hasPortfolio } = categorizeProjects(ghData.repos);
    const stage4 = await getAIEnhancements(ghData, scores, showcaseProjects, issues);
    const report = assembleFinalReport(scores, ghData, stage4);

    const reposAnnotated = ghData.repos.map(r => {
      const goodName = !BAD_NAME_PATTERN.test(r.name) && r.name.length >= 4;
      const hasDesc = !!(r.description && r.description.length > 10);
      const hasTopics = Array.isArray(r.topics) && r.topics.length >= 2;
      const isHosted = isHostedRepo(r);
      const recentlyUpdated = daysSince(r.updatedAt) <= 180;
      const checks = { goodName, hasDescription: hasDesc, hasTopics, isHosted, recentlyUpdated };
      const passCount = Object.values(checks).filter(Boolean).length;
      const status = passCount >= 4 ? 'good' : passCount >= 2 ? 'warning' : 'critical';
      return { ...r, status, checks };
    });

    res.json({
      username,
      profile: {
        login: ghData.login,
        name: ghData.name,
        bio: ghData.bio,
        followers: ghData.followers,
        publicRepos: ghData.publicRepos,
        languages: ghData.languages,
        totalStars: ghData.totalStars,
        hasProfileReadme: ghData.hasProfileReadme,
        existingReadmeContent: ghData.existingReadmeContent || null,
        blog: ghData.blog,
        location: ghData.location,
      },
      scores,
      grade,
      issues,
      repos: reposAnnotated,
      showcaseProjects,
      hasPortfolio,
      stage4,
      report,
      // Backward-compatible flat fields for any older consumer.
      score: scores.overall,
      scoreLabel: grade,
      generatedReadme: stage4.profileReadme,
      strengths: report.strengths,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('GitHub analyze error:', err);
    res.status(500).json({ error: 'Analysis failed. Please try again.' });
  }
});

// POST /api/profiles/github/generate-repo-readme — on-demand single-repo README.
router.post('/github/generate-repo-readme', authenticateToken, requirePlan(2), async (req, res) => {
  try {
    const { username, repoName, repoDescription, language, topics, stars } = req.body || {};
    if (!repoName) return res.status(400).json({ error: 'repoName is required' });

    const topicList = Array.isArray(topics) ? topics : [];

    const systemPrompt = `You are a technical writer who creates professional, useful GitHub project README files. Write clear documentation that helps other developers understand and use the project. Return only the markdown, no commentary.`;

    const userPrompt = `Generate a complete README.md for this GitHub repository:
- Repo name: ${repoName}
- Description: ${repoDescription || '(none provided)'}
- Primary language: ${language || 'unknown'}
- Topics: ${topicList.join(', ') || '(none)'}
- Stars: ${stars || 0}

Include these sections:
# ${repoName}
A one-sentence hook describing what it does.

## Features
3-5 bullet points (infer from the name, language, and topics)

## Tech Stack
List the main technologies

## Installation
Language-appropriate steps (npm install / pip install / go get / cargo build)

## Usage
A short code or command example

## Contributing
A standard contributing blurb

## License
MIT

Return only the markdown.`;

    const aiResult = await callAI({
      systemPrompt,
      userPrompt,
      maxTokens: 1800,
      temperature: 0.5,
      model: process.env.LM_STUDIO_MODEL_GITHUB || process.env.LM_STUDIO_MODEL,
      structuredJson: false,
    });

    if (aiResult.ok && aiResult.data && aiResult.data.trim().length > 50) {
      return res.json({
        readme: aiResult.data.trim(),
        aiPowered: true,
        repoName,
        generatedAt: new Date().toISOString(),
      });
    }

    // Fallback — language-aware template.
    const installCmd = (language === 'JavaScript' || language === 'TypeScript')
      ? 'npm install'
      : language === 'Python' ? 'pip install -r requirements.txt'
      : language === 'Go' ? 'go mod download'
      : language === 'Rust' ? 'cargo build'
      : 'echo "See docs for setup"';
    const runCmd = (language === 'JavaScript' || language === 'TypeScript')
      ? 'npm start'
      : language === 'Python' ? 'python main.py'
      : language === 'Go' ? 'go run .'
      : language === 'Rust' ? 'cargo run'
      : './run';

    const fallbackReadme = `# ${repoName}

${repoDescription || `A project built with ${language || 'modern tooling'}.`}

## Features
- Core functionality
- Easy to set up and use
- Clean, documented code

## Tech Stack
- ${language || 'See repository'}
${topicList.map(t => `- ${t}`).join('\n')}

## Installation
\`\`\`bash
# Clone the repository
git clone https://github.com/${username || 'your-username'}/${repoName}.git
cd ${repoName}

# Install dependencies
${installCmd}
\`\`\`

## Usage
\`\`\`bash
# Start the project
${runCmd}
\`\`\`

## Contributing
Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## License
MIT
`;

    return res.json({
      readme: fallbackReadme,
      aiPowered: false,
      repoName,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Repo README generation error:', err);
    res.status(500).json({ error: 'Failed to generate README' });
  }
});

// POST /api/profiles/github/optimize-bio — rewrite a bio under 160 chars.
router.post('/github/optimize-bio', authenticateToken, requirePlan(2), async (req, res) => {
  try {
    const { currentBio, name, languages, targetRole } = req.body || {};
    const langArr = Array.isArray(languages) ? languages : [];

    const systemPrompt = `You are a GitHub profile bio optimizer. Rewrite bios to be professional, keyword-rich, and under 160 characters. Return JSON only with keys: rewritten (string, under 160 chars), characterCount (number), keywords (array of strings).`;

    const userPrompt = `Rewrite this GitHub bio:
- Current bio: ${currentBio || '(none)'}
- Name: ${name || '(unknown)'}
- Languages: ${langArr.join(', ') || '(none)'}
- Target role: ${targetRole || '(not specified)'}

Make it role-first and recruiter-friendly. Return the JSON now.`;

    const aiResult = await callAI({
      systemPrompt,
      userPrompt,
      maxTokens: 200,
      temperature: 0.3,
      model: process.env.LM_STUDIO_MODEL_GITHUB || process.env.LM_STUDIO_MODEL,
      structuredJson: true,
    });

    if (aiResult.ok && aiResult.data) {
      const parsed = extractJSON(aiResult.data);
      if (parsed && parsed.rewritten) {
        const rewritten = String(parsed.rewritten).slice(0, 160);
        return res.json({
          original: currentBio || '',
          rewritten,
          characterCount: rewritten.length,
          keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
          aiPowered: true,
        });
      }
    }

    // Fallback — rule-based.
    const role = targetRole || (langArr[0] ? `${langArr[0]} Developer` : 'Software Developer');
    const stack = langArr.slice(0, 3).join(' · ');
    const rewritten = (`${role}${stack ? ' | ' + stack : ''}`).slice(0, 160);

    return res.json({
      original: currentBio || '',
      rewritten,
      characterCount: rewritten.length,
      keywords: langArr.slice(0, 5),
      aiPowered: false,
    });
  } catch (err) {
    console.error('Bio optimization error:', err);
    res.status(500).json({ error: 'Failed to optimize bio' });
  }
});

// POST /api/profiles/github/save — persist an analysis.
router.post('/github/save', authenticateToken, requirePlan(2), async (req, res) => {
  try {
    const { username, scores, grade, report, stage4 } = req.body || {};
    const userId = req.user.id;

    const result = await pool.query(
      'INSERT INTO github_analyses (user_id, username, overall_score, grade, report) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [userId, username || 'unknown', scores?.overall || 0, grade || 'N/A', JSON.stringify({ scores, grade, report, stage4 })]
    );

    res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
    console.error('GitHub save error:', err);
    res.status(500).json({ error: 'Failed to save analysis' });
  }
});

// GET /api/profiles/github/history — last 5 analyses for this user.
router.get('/github/history', authenticateToken, requirePlan(2), async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      'SELECT id, username, overall_score, grade, created_at FROM github_analyses WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5',
      [userId]
    );
    res.json({ history: result.rows });
  } catch (err) {
    console.error('GitHub history error:', err);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// LinkedIn endpoint (unchanged)
// ═══════════════════════════════════════════════════════════════════════════

router.post('/linkedin/analyze', authenticateToken, requirePlan(2), async (req, res) => {
  const { headline, about, skills, experienceCount, yearsOfExperience, connections, hasPhoto, hasFeatured } = req.body;

  const headlineStr = (headline || '').trim();
  const aboutStr = (about || '').trim();
  const skillsStr = (skills || '').trim();
  const expCount = Number(experienceCount) || 0;
  const yearsExp = Number(yearsOfExperience) || 0;

  // Headline Scoring
  let headlineScore = 0;
  const hLen = headlineStr.length;
  if (hLen >= 60 && hLen <= 220) headlineScore += 50;
  else if (hLen >= 30 && hLen <= 59) headlineScore += 30;
  else if (hLen >= 1 && hLen <= 29) headlineScore += 15;

  const hlLower = headlineStr.toLowerCase();
  if (/(engineer|developer|software|frontend|backend|data|intern|fresher)/.test(hlLower)) headlineScore += 20;
  if (hlLower.includes('|') || hlLower.includes(' at ')) headlineScore += 15;
  if (/(2024|2025|2026|2027)/.test(hlLower)) headlineScore += 10;
  headlineScore = Math.min(headlineScore, 100);

  // About Section Depth
  let aboutScore = 0;
  const words = aboutStr.split(/\s+/).filter(Boolean);
  const wCount = words.length;
  if (wCount >= 200) aboutScore += 50;
  else if (wCount >= 100) aboutScore += 35;
  else if (wCount >= 50) aboutScore += 20;
  else if (wCount > 0) aboutScore += 10;

  const firstPersonCount = (aboutStr.match(/\b(I|my|me)\b/gi) || []).length;
  if (firstPersonCount >= 3) aboutScore += 15;

  const actionVerbCount = (aboutStr.match(/\b(built|developed|led|created|launched|implemented|improved|delivered)\b/gi) || []).length;
  aboutScore += Math.min(actionVerbCount * 7, 25);

  if (/(email|linkedin\.com|portfolio|website|github\.com)/i.test(aboutStr)) aboutScore += 10;
  aboutScore = Math.min(aboutScore, 100);

  // Experience Keywords
  let expScore = 0;
  if (expCount >= 3) expScore += 40;
  else if (expCount === 2) expScore += 30;
  else if (expCount === 1) expScore += 20;

  expScore += Math.min(yearsExp * 8, 30);
  expScore += Math.min(actionVerbCount * 5, 20);
  if (hasFeatured) expScore += 10;
  expScore = Math.min(expScore, 100);

  // Skills & Endorsements
  let skillScore = 0;
  const skillCount = skillsStr.split(',').filter(s => s.trim().length > 0).length;
  if (skillCount >= 50) skillScore += 100;
  else if (skillCount >= 20) skillScore += 80;
  else if (skillCount >= 10) skillScore += 65;
  else if (skillCount >= 5) skillScore += 45;
  else if (skillCount >= 1) skillScore += 25;

  if (hasPhoto) skillScore += 10;
  if (connections === '500plus') skillScore += 10;
  else if (connections === '100to500') skillScore += 5;
  skillScore = Math.min(skillScore, 100);

  // Overall Score
  const score = Math.round(headlineScore * 0.25 + aboutScore * 0.30 + expScore * 0.25 + skillScore * 0.20);
  let scoreLabel = "Needs Work";
  if (score >= 80) scoreLabel = "Excellent";
  else if (score >= 60) scoreLabel = "Good";
  else if (score >= 40) scoreLabel = "Average";

  // Suggestions
  const suggestions = [];
  if (headlineScore < 50) suggestions.push("Your headline needs keywords. Target 60–120 chars with role + stack + goal.");
  if (!hasPhoto) suggestions.push("Add a profile photo. Profiles with photos get up to 21x more views.");
  if (wCount < 100) suggestions.push("Expand About section to 150+ words with what you build and your goals.");
  if (skillCount < 10) suggestions.push("Add at least 10 skills. LinkedIn's search algorithm surfaces profiles with more skills.");
  if (!hasFeatured) suggestions.push("Use the Featured section to pin your best project or GitHub link.");
  if (connections === 'lt100') suggestions.push("Grow past 100 connections — classmates, professors, online communities.");
  if (expCount === 0) suggestions.push("Add at least one experience entry — internships or projects count.");

  const firstWordOfHeadline = headlineStr.split(/\s+/)[0] || '';
  const scoreDescription = `${firstWordOfHeadline || 'Your'} profile scores ${score}/100 — ${suggestions.length} improvement${suggestions.length===1?'':'s'} identified.`;

  res.json({
    score,
    scoreLabel,
    scoreDescription,
    metrics: [
      { label: "Headline Impact", val: headlineScore, status: headlineScore >= 75 ? 'good' : 'warning' },
      { label: "About Section Depth", val: aboutScore, status: aboutScore >= 75 ? 'good' : 'warning' },
      { label: "Experience Keywords", val: expScore, status: expScore >= 75 ? 'good' : 'warning' },
      { label: "Skills & Endorsements", val: skillScore, status: skillScore >= 75 ? 'good' : 'warning' }
    ],
    suggestions
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Job Match endpoint (unchanged)
// ═══════════════════════════════════════════════════════════════════════════

router.post('/jobmatch', authenticateToken, (req, res) => {
  const { jobDescription, userSkills } = req.body;
  if (!jobDescription || !userSkills) {
    return res.status(400).json({ error: 'Job description and user skills are required' });
  }

  const TECH_VOCABULARY = [
    'react', 'angular', 'vue', 'svelte', 'javascript', 'typescript', 'node', 'node.js', 'express',
    'python', 'django', 'flask', 'fastapi', 'java', 'spring', 'spring boot', 'c++', 'c#', '.net',
    'ruby', 'rails', 'go', 'golang', 'rust', 'php', 'laravel', 'sql', 'mysql', 'postgresql', 'postgres',
    'mongodb', 'nosql', 'redis', 'elasticsearch', 'docker', 'kubernetes', 'k8s', 'aws', 'azure', 'gcp',
    'html', 'css', 'sass', 'tailwind', 'bootstrap', 'git', 'github', 'gitlab', 'ci/cd', 'jenkins',
    'linux', 'unix', 'bash', 'shell', 'agile', 'scrum', 'kanban', 'jira', 'confluence', 'rest', 'graphql',
    'api', 'microservices', 'serverless', 'machine learning', 'ml', 'ai', 'data science', 'pandas', 'numpy',
    'tensorflow', 'keras', 'pytorch', 'scikit-learn', 'hadoop', 'spark', 'kafka', 'blockchain', 'web3',
    'solidity', 'smart contracts', 'ethereum', 'react native', 'flutter', 'dart', 'swift', 'ios', 'kotlin',
    'android', 'mobile', 'unity', 'unreal', 'c', 'assembly', 'ruby on rails', 'asp.net', 'django rest framework',
    'next.js', 'nextjs', 'nuxt.js', 'nuxtjs', 'graphql', 'apollo', 'redux', 'mobx', 'context api', 'jest',
    'mocha', 'chai', 'cypress', 'selenium', 'puppeteer', 'playwright', 'webdriver', 'appium', 'cucumber',
    'jasmine', 'karma', 'enzyme', 'sinon', 'supertest', 'nock', 'faker', 'factory_boy', 'pytest', 'unittest'
  ];

  const CATEGORY_MAP = {
    'frontend': ['react', 'angular', 'vue', 'svelte', 'javascript', 'typescript', 'html', 'css', 'sass', 'tailwind', 'bootstrap', 'react native', 'next.js', 'nextjs', 'nuxt.js', 'nuxtjs', 'redux', 'mobx'],
    'backend': ['node', 'node.js', 'express', 'python', 'django', 'flask', 'fastapi', 'java', 'spring', 'spring boot', 'c++', 'c#', '.net', 'ruby', 'rails', 'go', 'golang', 'rust', 'php', 'laravel'],
    'database': ['sql', 'mysql', 'postgresql', 'postgres', 'mongodb', 'nosql', 'redis', 'elasticsearch'],
    'devops': ['docker', 'kubernetes', 'k8s', 'aws', 'azure', 'gcp', 'ci/cd', 'jenkins', 'linux', 'unix', 'bash', 'shell'],
    'testing': ['jest', 'mocha', 'chai', 'cypress', 'selenium', 'puppeteer', 'playwright', 'webdriver', 'appium', 'cucumber', 'jasmine', 'karma', 'enzyme', 'sinon', 'supertest', 'nock', 'pytest', 'unittest'],
    'mobile': ['react native', 'flutter', 'dart', 'swift', 'ios', 'kotlin', 'android', 'mobile']
  };

  const jdLower = jobDescription.toLowerCase();
  const jdKeywords = TECH_VOCABULARY.filter(term => jdLower.includes(term));

  if (jdKeywords.length === 0) {
    return res.json({
      matchScore: 0,
      matchLabel: "Cannot Analyze",
      matchedKeywords: [],
      missingKeywords: [],
      gapsByCategory: {},
      suggestions: ["Could not detect any standard tech keywords in the job description."],
      totalJdKeywords: 0,
      totalMatched: 0
    });
  }

  const userSkillsList = userSkills.split(/[,\n]/).map(s => s.trim().toLowerCase()).filter(Boolean);

  const matchedKeywords = [];
  const missingKeywords = [];

  jdKeywords.forEach(keyword => {
    const hasMatch = userSkillsList.some(skill => skill.includes(keyword) || (keyword.includes(skill) && skill.length > 2));
    if (hasMatch) {
      matchedKeywords.push(keyword);
    } else {
      missingKeywords.push(keyword);
    }
  });

  const totalJdKeywords = jdKeywords.length;
  const totalMatched = matchedKeywords.length;
  let matchScore = Math.round((totalMatched / Math.max(totalJdKeywords, 1)) * 100);
  matchScore = Math.min(matchScore, 100);

  let matchLabel = "Skill Gap Detected";
  if (matchScore >= 80) matchLabel = "Strong Match";
  else if (matchScore >= 60) matchLabel = "Good Match";
  else if (matchScore >= 40) matchLabel = "Partial Match";

  const gapsByCategory = {};
  missingKeywords.forEach(kw => {
    let assigned = false;
    for (const [category, keywords] of Object.entries(CATEGORY_MAP)) {
      if (keywords.includes(kw)) {
        if (!gapsByCategory[category]) gapsByCategory[category] = [];
        gapsByCategory[category].push(kw);
        assigned = true;
        break;
      }
    }
    if (!assigned) {
      if (!gapsByCategory['other']) gapsByCategory['other'] = [];
      gapsByCategory['other'].push(kw);
    }
  });

  const suggestions = [];
  if (matchScore < 50) {
    suggestions.push("You are missing more than half of the required keywords. Consider if this role aligns with your core stack.");
  }
  if (missingKeywords.length > 0) {
    suggestions.push(`Focus on learning or highlighting: ${missingKeywords.slice(0, 3).join(', ')}`);
  }
  for (const category in gapsByCategory) {
    if (gapsByCategory[category].length >= 2) {
      suggestions.push(`You have a significant gap in ${category} technologies.`);
    }
  }
  if (matchedKeywords.length >= 3) {
    suggestions.push(`Leverage your strengths in ${matchedKeywords.slice(0, 3).join(', ')} during the interview.`);
  }

  res.json({
    matchScore,
    matchLabel,
    matchedKeywords,
    missingKeywords,
    gapsByCategory,
    suggestions,
    totalJdKeywords,
    totalMatched
  });
});

module.exports = router;
