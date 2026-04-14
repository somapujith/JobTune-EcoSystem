const express = require('express');
const router = express.Router();

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

function scoreGitHubProfile(ghData) {
  let score = 0;
  const issues = [];
  const strengths = [];

  // Profile Completeness (25 pts)
  if (ghData.bio && ghData.bio.length >= 10) score += 8;
  else issues.push(`Your bio is missing. A concise bio helps recruiters evaluate you in seconds.`);
  
  if (ghData.name && ghData.name !== ghData.login) score += 5;
  if (ghData.blog && ghData.blog.length > 0) score += 5;
  if (ghData.location && ghData.location.length > 0) score += 4;
  if (ghData.company && ghData.company.length > 0) score += 3;

  // Repository Quality (40 pts)
  if (ghData.hasProfileReadme) {
    score += 15;
    strengths.push(`You have a profile README...`);
  } else {
    issues.push(`Create a repo named exactly '${ghData.login}' — it becomes your GitHub homepage card.`);
  }

  const pRepos = Math.max(ghData.publicRepos, 1);
  const descScore = Math.min((ghData.reposWithDescription / pRepos) * 10, 10);
  score += descScore;
  if (ghData.reposWithDescription / pRepos < 0.5 && ghData.publicRepos > 0) {
    issues.push(`Less than half your repos have descriptions...`);
  }

  const topicScore = Math.min((ghData.reposWithTopics / pRepos) * 8, 8);
  score += topicScore;
  if (ghData.reposWithTopics / pRepos < 0.3 && ghData.publicRepos > 0) {
    issues.push(`Most repos have no topics. Add 3–5 relevant tags...`);
  }

  const hasStarredRepo = ghData.topRepos.some(r => r.stars >= 5);
  if (hasStarredRepo) {
    score += 7;
  } else if (ghData.publicRepos >= 5) {
    issues.push(`None of your repos have been starred. Consider promoting 1–2 projects...`);
  }

  // Activity & Impact (20 pts)
  score += Math.min((ghData.publicRepos / 20) * 10, 10);
  if (ghData.publicRepos >= 15) {
    strengths.push(`${ghData.publicRepos} public repos demonstrates consistent activity.`);
  }

  score += Math.min((ghData.totalStars / 10) * 5, 10);
  if (ghData.totalStars >= 10) {
    strengths.push(`${ghData.totalStars} total stars shows real community interest.`);
  }

  // Community (15 pts)
  score += Math.min((ghData.followers / 20) * 8, 8);
  if (ghData.followers >= 20) {
    strengths.push(`${ghData.followers} followers gives your profile social proof.`);
  }

  score += Math.min((ghData.languages.length / 4) * 7, 7);
  if (ghData.languages.length >= 4) {
    strengths.push(`You work across ${ghData.languages.length} languages (${ghData.languages.slice(0,3).join(', ')})...`);
  } else if (ghData.languages.length < 2 && ghData.languages.length > 0) {
    issues.push(`Only one language visible. Breadth signals versatility to recruiters.`);
  }

  score = Math.round(score);
  score = Math.min(Math.max(score, 0), 100);

  let scoreLabel = "Needs Work";
  if (score >= 80) scoreLabel = "Excellent";
  else if (score >= 60) scoreLabel = "Good";
  else if (score >= 40) scoreLabel = "Average";

  const scoreDescription = `Your profile scores ${score}/100 — ${issues.length} improvement${issues.length === 1 ? '' : 's'} identified.`;

  return {
    score,
    scoreLabel,
    scoreDescription,
    issues: issues.slice(0, 3),
    strengths: strengths.slice(0, 3) 
  };
}

function generateReadme(ghData) {
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
    Rust:       { hex: '000000', logo: 'rust' }
  };

  const name = ghData.name || ghData.login;
  const bio = ghData.bio || "Passionate developer building interesting projects.";
  
  const badges = ghData.languages.map(lang => {
    const info = LANG_COLORS[lang];
    if (info) {
      return `![${lang}](https://img.shields.io/badge/-${encodeURIComponent(lang)}-${info.hex}?style=flat-square&logo=${info.logo}&logoColor=white)`;
    }
    return `\`${lang}\``;
  }).join(' ');

  const projects = ghData.topRepos.map(r => {
    return `- **[${r.name}](https://github.com/${ghData.login}/${r.name})**: ${r.description || 'No description provided'} *(⭐ ${r.stars} | ${r.language || 'Unknown'})*`;
  }).join('\\n');

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

// POST /profiles/github/analyze
router.post('/github/analyze', async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'GitHub username is required' });

  // Fetch real GitHub data first
  const ghData = await fetchGitHubData(username);
  if (!ghData) {
    return res.status(404).json({ error: \`GitHub user "\${username}" not found or API unavailable.\` });
  }

  const { score, scoreLabel, scoreDescription, issues, strengths } = scoreGitHubProfile(ghData);
  const generatedReadme = generateReadme(ghData);
  
  res.json({
    score,
    scoreLabel,
    scoreDescription,
    issues,
    strengths,
    generatedReadme,
    repoCount: ghData.publicRepos,
    stars: ghData.totalStars,
    followers: ghData.followers,
    languages: ghData.languages,
    hasProfileReadme: ghData.hasProfileReadme
  });
});

// POST /profiles/linkedin/analyze
router.post('/linkedin/analyze', async (req, res) => {
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
  const scoreDescription = \`\${firstWordOfHeadline || 'Your'} profile scores \${score}/100 — \${suggestions.length} improvement\${suggestions.length===1?'':'s'} identified.\`;

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

// POST /profiles/jobmatch
router.post('/jobmatch', (req, res) => {
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
    suggestions.push(\`Focus on learning or highlighting: \${missingKeywords.slice(0, 3).join(', ')}\`);
  }
  for (const category in gapsByCategory) {
    if (gapsByCategory[category].length >= 2) {
      suggestions.push(\`You have a significant gap in \${category} technologies.\`);
    }
  }
  if (matchedKeywords.length >= 3) {
    suggestions.push(\`Leverage your strengths in \${matchedKeywords.slice(0, 3).join(', ')} during the interview.\`);
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
