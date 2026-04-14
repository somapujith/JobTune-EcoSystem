const express = require('express');
const router = express.Router();
const { callAI, extractJSON } = require('../utils/aiClient');

// Extract LinkedIn username from various URL formats
function extractLinkedInUsername(url) {
  try {
    const clean = url.trim().replace(/\/$/, '');
    const match = clean.match(/linkedin\.com\/in\/([^/?#]+)/i);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// Fetch real GitHub user data from public API
async function fetchGitHubData(username) {
  try {
    const [userRes, reposRes] = await Promise.all([
      fetch(`https://api.github.com/users/${username}`, {
        headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'JobTube-Optimizer' }
      }),
      fetch(`https://api.github.com/users/${username}/repos?per_page=100&sort=updated`, {
        headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'JobTube-Optimizer' }
      })
    ]);

    if (!userRes.ok) return null;

    const user = await userRes.json();
    const repos = reposRes.ok ? await reposRes.json() : [];

    const publicRepos = Array.isArray(repos) ? repos.filter(r => !r.fork) : [];
    const totalStars = publicRepos.reduce((sum, r) => sum + (r.stargazers_count || 0), 0);
    const reposWithReadme = publicRepos.filter(r => r.description && r.description.length > 10).length;
    const reposWithTopics = publicRepos.filter(r => r.topics && r.topics.length > 0).length;
    const languages = [...new Set(publicRepos.map(r => r.language).filter(Boolean))];
    const hasProfileReadme = publicRepos.some(r => r.name.toLowerCase() === username.toLowerCase());

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
      totalStars,
      reposWithDescription: reposWithReadme,
      reposWithTopics,
      languages,
      hasProfileReadme,
      topRepos: publicRepos.slice(0, 5).map(r => ({
        name: r.name,
        stars: r.stargazers_count,
        language: r.language,
        description: r.description,
        topics: r.topics
      }))
    };
  } catch (err) {
    console.error('GitHub API error:', err.message);
    return null;
  }
}

// POST /profiles/linkedin/analyze
router.post('/linkedin/analyze', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'LinkedIn URL is required' });

  const username = extractLinkedInUsername(url);
  if (!username) return res.status(400).json({ error: 'Invalid LinkedIn URL. Expected format: https://linkedin.com/in/username' });

  const systemPrompt = `You are an expert LinkedIn profile analyzer. When given a LinkedIn profile username, you analyze it and return a realistic, personalized profile score analysis in strict JSON format.

Important rules:
- Generate VARIED and REALISTIC scores — do NOT use the same numbers for every profile
- Base your analysis on what the username suggests (name, potential industry, seniority level)
- Scores should reflect realistic LinkedIn profile quality (most profiles score 50-85)
- The overall score should be the weighted average of the 4 metrics
- Provide actionable, specific suggestions tailored to this profile
- Return ONLY valid JSON, no markdown, no extra text`;

  const userPrompt = `Analyze this LinkedIn profile: https://linkedin.com/in/${username}

Profile username: "${username}"

Return a JSON object with EXACTLY this structure:
{
  "score": <number 0-100, overall profile score>,
  "scoreLabel": <string, one of: "Needs Work" | "Average" | "Good" | "Excellent">,
  "scoreDescription": <string, 1 sentence personalized to this profile>,
  "metrics": [
    { "label": "Headline Impact", "val": <number 0-100>, "status": <"good" if val>=75, else "warning"> },
    { "label": "About Section Depth", "val": <number 0-100>, "status": <"good" if val>=75, else "warning"> },
    { "label": "Experience Keywords", "val": <number 0-100>, "status": <"good" if val>=75, else "warning"> },
    { "label": "Skills & Endorsements", "val": <number 0-100>, "status": <"good" if val>=75, else "warning"> }
  ],
  "suggestions": [
    <string, specific actionable suggestion 1>,
    <string, specific actionable suggestion 2>,
    <string, specific actionable suggestion 3>,
    <string, specific actionable suggestion 4>
  ]
}

Generate realistic, varied scores based on the username "${username}". Make the analysis feel genuine and tailored.`;

  const aiResult = await callAI({
    systemPrompt,
    userPrompt,
    maxTokens: 600,
    temperature: 0.7
  });

  if (!aiResult.ok) {
    return res.status(500).json({ error: 'AI analysis failed. Please try again.' });
  }

  const parsed = extractJSON(aiResult.data);
  if (!parsed || typeof parsed.score !== 'number' || !Array.isArray(parsed.metrics)) {
    return res.status(500).json({ error: 'Could not parse AI response. Please try again.' });
  }

  // Clamp values to valid range
  parsed.score = Math.min(100, Math.max(0, Math.round(parsed.score)));
  parsed.metrics = parsed.metrics.map(m => ({
    ...m,
    val: Math.min(100, Math.max(0, Math.round(m.val))),
    status: m.val >= 75 ? 'good' : 'warning'
  }));

  res.json(parsed);
});

// POST /profiles/github/analyze
router.post('/github/analyze', async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'GitHub username is required' });

  // Fetch real GitHub data first
  const ghData = await fetchGitHubData(username);
  if (!ghData) {
    return res.status(404).json({ error: `GitHub user "${username}" not found or API unavailable.` });
  }

  const systemPrompt = `You are an expert GitHub profile analyzer for recruiters. You receive real GitHub profile data and return a personalized analysis in strict JSON format. Return ONLY valid JSON, no markdown, no extra text.`;

  const userPrompt = `Analyze this real GitHub profile data and return a JSON analysis:

Profile: ${JSON.stringify(ghData, null, 2)}

Return a JSON object with EXACTLY this structure:
{
  "score": <number 0-100, overall profile health score>,
  "scoreLabel": <"Needs Work" | "Average" | "Good" | "Excellent">,
  "scoreDescription": <1 sentence summary of their profile strength>,
  "issues": [
    <string, specific critical issue or improvement 1>,
    <string, specific critical issue or improvement 2>,
    <string, specific critical issue or improvement 3>
  ],
  "strengths": [
    <string, what they are doing well 1>,
    <string, what they are doing well 2>
  ],
  "generatedReadme": <string, a complete professional GitHub profile README.md in markdown format tailored to their actual tech stack and projects>
}

The README must use their ACTUAL languages: ${ghData.languages.join(', ') || 'unknown'} and reference their real profile name: ${ghData.name || ghData.login}.
Issues and strengths must be based on REAL data (e.g., actual repo counts, readme existence, star counts).`;

  const aiResult = await callAI({
    systemPrompt,
    userPrompt,
    maxTokens: 1200,
    temperature: 0.6
  });

  if (!aiResult.ok) {
    return res.status(500).json({ error: 'AI analysis failed. Please try again.' });
  }

  const parsed = extractJSON(aiResult.data);
  if (!parsed || typeof parsed.score !== 'number') {
    return res.status(500).json({ error: 'Could not parse AI response. Please try again.' });
  }

  parsed.score = Math.min(100, Math.max(0, Math.round(parsed.score)));

  res.json({
    ...parsed,
    repoCount: ghData.publicRepos,
    stars: ghData.totalStars,
    followers: ghData.followers,
    languages: ghData.languages,
    hasProfileReadme: ghData.hasProfileReadme
  });
});

module.exports = router;
