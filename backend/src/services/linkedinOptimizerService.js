const { callAI, extractJSON } = require('../utils/aiClient');

const LINKEDIN_URL_RE = /^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/[A-Za-z0-9_.%-]+\/?/i;

const ACTION_VERBS = [
  'built', 'created', 'developed', 'designed', 'launched', 'led', 'implemented',
  'improved', 'optimized', 'delivered', 'managed', 'automated', 'reduced',
  'increased', 'scaled', 'owned', 'shipped', 'collaborated', 'analyzed',
];

const TECH_KEYWORDS = [
  'react', 'typescript', 'javascript', 'node', 'node.js', 'python', 'java',
  'spring', 'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'sql', 'postgres',
  'mongodb', 'redis', 'api', 'rest', 'graphql', 'microservices', 'machine learning',
  'data science', 'analytics', 'figma', 'tailwind', 'next.js', 'express',
];

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function toText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function splitList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  return toText(value)
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeProfileInput(input = {}) {
  const profileUrl = toText(input.profileUrl || input.linkedinUrl || input.url);
  const pastedText = toText(input.pastedText || input.profileText || input.rawText);
  const headline = toText(input.headline);
  const about = toText(input.about || input.summary);
  const skills = splitList(input.skills);
  const targetRoles = splitList(input.targetRoles || input.targetRole);
  const targetIndustries = splitList(input.targetIndustries || input.industry);
  const experiences = Array.isArray(input.experiences)
    ? input.experiences.map((exp) => ({
      title: toText(exp.title),
      company: toText(exp.company),
      description: toText(exp.description || exp.summary),
      start: toText(exp.start),
      end: toText(exp.end),
    })).filter((exp) => exp.title || exp.company || exp.description)
    : [];

  return {
    profileUrl,
    pastedText,
    headline,
    about,
    skills,
    targetRoles,
    targetIndustries,
    experiences,
    experienceCount: Number(input.experienceCount) || experiences.length || 0,
    yearsOfExperience: Number(input.yearsOfExperience) || 0,
    connections: toText(input.connections) || 'unknown',
    hasPhoto: Boolean(input.hasPhoto),
    hasFeatured: Boolean(input.hasFeatured),
    openToWork: Boolean(input.openToWork),
    activityLevel: toText(input.activityLevel || input.activity) || 'unknown',
  };
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function metaContent(html, property) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, 'i');
  const match = html.match(re);
  return match ? decodeEntities(match[1].trim()) : '';
}

function extractJsonLdText(html) {
  const chunks = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = re.exec(html))) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const records = Array.isArray(parsed) ? parsed : [parsed];
      for (const record of records) {
        if (!record || typeof record !== 'object') continue;
        chunks.push(
          record.name,
          record.headline,
          record.description,
          record.jobTitle,
          record.worksFor?.name,
          Array.isArray(record.knowsAbout) ? record.knowsAbout.join(', ') : record.knowsAbout,
          Array.isArray(record.alumniOf) ? record.alumniOf.map((item) => item?.name || item).join(', ') : record.alumniOf?.name
        );
      }
    } catch {
      // LinkedIn pages often include non-standard escaped JSON. Ignore malformed blocks.
    }
  }

  return chunks.filter(Boolean).join('\n');
}

function parseSkillsFromText(text) {
  const lower = text.toLowerCase();
  return TECH_KEYWORDS
    .filter((keyword) => lower.includes(keyword))
    .map((keyword) => keyword.replace(/\b\w/g, (ch) => ch.toUpperCase()));
}

function extractTargetRolesFromHeadline(headline) {
  const roleMatch = headline.match(/\b((?:senior|lead|principal|junior|entry-level)?\s*(?:software|frontend|front-end|backend|back-end|full stack|data|devops|cloud|machine learning|ai|product|ux|ui)?\s*(?:engineer|developer|analyst|scientist|designer|manager|architect|consultant|specialist|intern))\b/ig);
  return [...new Set((roleMatch || []).map((role) => role.replace(/\s+/g, ' ').trim()))].slice(0, 3);
}

async function fetchLinkedInPublicData(profileUrl) {
  if (!profileUrl) return { fetched: false, reason: 'No LinkedIn URL provided.' };
  if (!LINKEDIN_URL_RE.test(profileUrl)) {
    return { fetched: false, reason: 'LinkedIn URL must look like https://www.linkedin.com/in/username.' };
  }

  try {
    const response = await fetch(profileUrl, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'JobTune-LinkedIn-Optimizer/1.0',
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) {
      return { fetched: false, status: response.status, reason: `LinkedIn returned HTTP ${response.status}.` };
    }

    const html = await response.text();
    const title = decodeEntities((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').trim());
    const description = metaContent(html, 'og:description') || metaContent(html, 'description');
    const jsonLdText = extractJsonLdText(html);
    const pageText = [jsonLdText, stripHtml(html)].filter(Boolean).join('\n').slice(0, 8000);

    return {
      fetched: true,
      source: 'public_linkedin_page',
      title,
      description,
      pageText,
    };
  } catch (err) {
    return { fetched: false, reason: err.message || 'LinkedIn public fetch failed.' };
  }
}

function mergeFetchedData(profile, fetchedData) {
  if (!fetchedData?.fetched) return profile;
  const next = { ...profile };

  if (!next.headline && fetchedData.title) {
    next.headline = fetchedData.title
      .replace(/\s*\|\s*LinkedIn\s*$/i, '')
      .replace(/\s*-\s*LinkedIn\s*$/i, '')
      .trim();
  }

  if (!next.about && fetchedData.description) {
    next.about = fetchedData.description;
  }

  if (!next.pastedText && fetchedData.pageText) {
    next.pastedText = fetchedData.pageText;
  }

  const sourceText = [next.headline, next.about, next.pastedText].join('\n');
  if (next.skills.length === 0) {
    next.skills = parseSkillsFromText(sourceText);
  }

  if (next.targetRoles.length === 0 && next.headline) {
    next.targetRoles = extractTargetRolesFromHeadline(next.headline);
  }

  return next;
}

function deriveProfileSignals(profile) {
  const allText = [
    profile.headline,
    profile.about,
    profile.pastedText,
    profile.skills.join(' '),
    profile.experiences.map((exp) => `${exp.title} ${exp.company} ${exp.description}`).join(' '),
  ].join('\n');

  const lower = allText.toLowerCase();
  const detectedKeywords = TECH_KEYWORDS.filter((keyword) => lower.includes(keyword));
  const quantifiedClaims = (allText.match(/\b\d+[%+x]?\b|\b\d+\s*(users|clients|projects|features|apis|services|hours|days|months)\b/gi) || []);
  const actionVerbCount = ACTION_VERBS.reduce((sum, verb) => {
    const re = new RegExp(`\\b${verb}\\b`, 'gi');
    return sum + (allText.match(re) || []).length;
  }, 0);

  return {
    allText,
    detectedKeywords: [...new Set(detectedKeywords)],
    quantifiedClaims: [...new Set(quantifiedClaims)].slice(0, 12),
    actionVerbCount,
    wordCount: allText.split(/\s+/).filter(Boolean).length,
  };
}

function scoreHeadline(profile, signals) {
  const text = profile.headline;
  const len = text.length;
  let score = 0;
  const issues = [];

  if (len >= 70 && len <= 180) score += 35;
  else if (len >= 35) score += 24;
  else if (len > 0) score += 12;
  else issues.push('Headline is missing.');

  if (/(engineer|developer|designer|analyst|manager|specialist|consultant|architect|student|intern|lead)/i.test(text)) score += 20;
  else issues.push('Headline should include a clear role.');

  if (signals.detectedKeywords.length >= 3) score += 20;
  else issues.push('Headline needs stronger role and skill keywords.');

  if (/[|•-]/.test(text)) score += 10;
  if (/(building|scaling|automating|improving|helping|specializing|open to|seeking)/i.test(text)) score += 15;

  return { score: clamp(score), issues };
}

function scoreAbout(profile, signals) {
  const words = profile.about.split(/\s+/).filter(Boolean).length;
  let score = 0;
  const issues = [];

  if (words >= 180) score += 35;
  else if (words >= 100) score += 27;
  else if (words >= 50) score += 18;
  else if (words > 0) score += 8;
  else issues.push('About section is missing.');

  if (/\b(i|my|me)\b/i.test(profile.about)) score += 10;
  if (signals.actionVerbCount >= 4) score += 20;
  else issues.push('About section needs more proof verbs like built, led, improved, launched.');

  if (signals.quantifiedClaims.length >= 2) score += 20;
  else issues.push('About section should include measurable outcomes.');

  if (/(github\.com|portfolio|website|email|linkedin\.com|contact)/i.test(profile.about)) score += 15;

  return { score: clamp(score), issues };
}

function scoreExperience(profile, signals) {
  let score = 0;
  const issues = [];

  if (profile.experienceCount >= 3) score += 30;
  else if (profile.experienceCount >= 1) score += 18;
  else issues.push('Add experience entries. Projects, internships, and freelance work count.');

  score += Math.min(profile.yearsOfExperience * 6, 24);
  score += Math.min(signals.actionVerbCount * 4, 24);
  score += Math.min(signals.quantifiedClaims.length * 4, 16);
  if (profile.hasFeatured) score += 6;

  if (signals.quantifiedClaims.length === 0) issues.push('Experience descriptions need quantified impact.');
  if (signals.actionVerbCount < 3) issues.push('Experience descriptions need stronger action verbs.');

  return { score: clamp(score), issues };
}

function scoreSkills(profile, signals) {
  const skillCount = profile.skills.length;
  let score = 0;
  const issues = [];

  if (skillCount >= 30) score += 45;
  else if (skillCount >= 15) score += 36;
  else if (skillCount >= 8) score += 26;
  else if (skillCount > 0) score += 14;
  else issues.push('Skills list is missing.');

  const targetMatches = profile.targetRoles.length || profile.targetIndustries.length
    ? profile.skills.filter((skill) => {
      const skillLower = skill.toLowerCase();
      return [...profile.targetRoles, ...profile.targetIndustries].some((target) => target.toLowerCase().includes(skillLower) || skillLower.includes(target.toLowerCase()));
    }).length
    : 0;

  score += Math.min(signals.detectedKeywords.length * 5, 30);
  score += Math.min(targetMatches * 5, 15);
  if (profile.connections === '500plus') score += 10;
  else if (profile.connections === '100to500') score += 5;

  if (skillCount < 10) issues.push('Add at least 10 relevant skills for recruiter search coverage.');

  return { score: clamp(score), issues };
}

function scoreCompleteness(profile) {
  let score = 0;
  const issues = [];

  if (profile.hasPhoto) score += 20;
  else issues.push('Add a professional profile photo.');
  if (profile.hasFeatured) score += 18;
  else issues.push('Pin portfolio, resume, or flagship project links in Featured.');
  if (profile.profileUrl) score += 10;
  if (profile.connections === '500plus') score += 18;
  else if (profile.connections === '100to500') score += 12;
  else issues.push('Grow your network toward 500+ relevant connections.');
  if (profile.activityLevel === 'weekly') score += 18;
  else if (profile.activityLevel === 'monthly') score += 10;
  else issues.push('Add recent activity by commenting or posting in your target field.');
  if (profile.openToWork) score += 8;
  if (profile.targetRoles.length > 0) score += 8;

  return { score: clamp(score), issues };
}

function keywordIntelligence(profile, signals) {
  const targetText = [...profile.targetRoles, ...profile.targetIndustries].join(' ').toLowerCase();
  const targetHints = TECH_KEYWORDS.filter((keyword) => targetText.includes(keyword));
  const profileKeywords = new Set([
    ...profile.skills.map((skill) => skill.toLowerCase()),
    ...signals.detectedKeywords,
  ]);
  const missing = [...new Set(targetHints)].filter((keyword) => !profileKeywords.has(keyword));

  return {
    current: [...profileKeywords].slice(0, 20),
    missingHighValue: missing.slice(0, 12),
    opportunities: [
      'Put the top 3 role keywords in the headline.',
      'Use the same keywords naturally in About and Experience.',
      'Keep skills ordered by target-role relevance.',
    ],
  };
}

function deterministicSuggestions(profile, audit, keywords) {
  const suggestions = [];
  const allIssues = Object.values(audit).flatMap((section) => section.issues || []);

  if (audit.headline.score < 75) {
    suggestions.push('Rewrite the headline as: target role | strongest stack | proof or career direction.');
  }
  if (audit.about.score < 75) {
    suggestions.push('Open About with your role, add 2-3 proof points, and close with what opportunities you want.');
  }
  if (audit.experience.score < 75) {
    suggestions.push('Turn experience lines into accomplishment bullets with action verb + scope + measurable result.');
  }
  if (audit.skills.score < 75) {
    suggestions.push('Add and reorder skills around the exact tools recruiters search for in your target roles.');
  }
  if (!profile.hasFeatured) {
    suggestions.push('Use Featured for one resume/portfolio link and one flagship project.');
  }
  if (keywords.missingHighValue.length > 0) {
    suggestions.push(`Add missing target keywords where truthful: ${keywords.missingHighValue.slice(0, 5).join(', ')}.`);
  }

  return [...new Set([...suggestions, ...allIssues])].slice(0, 10);
}

function buildFallbackOptimizations(profile, audit, keywords) {
  const targetRole = profile.targetRoles[0] || 'Software Developer';
  const topSkills = profile.skills.slice(0, 4);
  const headlineOptions = [
    `${targetRole}${topSkills.length ? ` | ${topSkills.join(' | ')}` : ''}`.slice(0, 220),
    `${targetRole} | Building reliable products${topSkills[0] ? ` with ${topSkills[0]}` : ''}`.slice(0, 220),
  ];

  const aboutRewrite = [
    `I am a ${targetRole} focused on building practical, reliable solutions.`,
    topSkills.length ? `My core toolkit includes ${topSkills.join(', ')}.` : '',
    'I enjoy turning requirements into shipped work, documenting decisions clearly, and improving user-facing outcomes.',
    'I am currently looking for roles where I can contribute to strong engineering teams and keep growing through real product challenges.',
  ].filter(Boolean).join('\n\n');

  return {
    aiPowered: false,
    headlineOptions,
    aboutRewrite,
    experienceImprovements: [],
    quickWins: deterministicSuggestions(profile, audit, keywords).slice(0, 5).map((action) => ({
      action,
      effort: action.length > 90 ? '20 minutes' : '10 minutes',
      impact: /headline|featured|keywords/i.test(action) ? 'high' : 'medium',
    })),
    recruiterSummary: 'This analysis used real profile inputs and rule-based fallback suggestions because the local LLM did not return valid structured output.',
  };
}

function publicSourceSummary(fetchedData) {
  return {
    fetched: Boolean(fetchedData?.fetched),
    source: fetchedData?.source,
    status: fetchedData?.status,
    reason: fetchedData?.reason,
    title: fetchedData?.title,
    description: fetchedData?.description,
  };
}

function hasMeaningfulFetchedProfileData(profile, fetchedData) {
  if (!fetchedData?.fetched) return false;
  const text = [profile.headline, profile.about, profile.pastedText].join(' ').toLowerCase();
  if (!text || text.length < 80) return false;
  if (/authwall|sign in|join linkedin|login|captcha|security verification/i.test(text)) return false;
  return Boolean(profile.headline || profile.about || profile.skills.length > 0);
}

async function getLLMOptimizations(profile, audit, keywords, signals) {
  const fallback = buildFallbackOptimizations(profile, audit, keywords);

  const systemPrompt = `You are a LinkedIn profile optimization expert for job seekers. Use only the provided real profile data. Do not invent employers, degrees, metrics, awards, or endorsements. Return valid JSON only with:
{
  "headlineOptions": ["...", "...", "..."],
  "aboutRewrite": "...",
  "experienceImprovements": [{"current":"...", "improved":"...", "reason":"..."}],
  "quickWins": [{"action":"...", "effort":"5 minutes", "impact":"high|medium|low"}],
  "recruiterSummary": "...",
  "activityRecommendations": ["...", "..."],
  "skillRecommendations": ["...", "..."]
}`;

  const userPrompt = `LinkedIn profile data:
Headline: ${profile.headline || '(missing)'}
About: ${profile.about || '(missing)'}
Skills: ${profile.skills.join(', ') || '(missing)'}
Target roles: ${profile.targetRoles.join(', ') || '(not specified)'}
Target industries: ${profile.targetIndustries.join(', ') || '(not specified)'}
Experience count: ${profile.experienceCount}
Years of experience: ${profile.yearsOfExperience}
Connections: ${profile.connections}
Has photo: ${profile.hasPhoto}
Has featured section: ${profile.hasFeatured}
Activity level: ${profile.activityLevel}

Experience entries:
${profile.experiences.slice(0, 5).map((exp) => `- ${exp.title || '?'} at ${exp.company || '?'}: ${exp.description || '(no description)'}`).join('\n') || '- none provided'}

Audit:
${JSON.stringify(audit)}

Keyword intelligence:
${JSON.stringify(keywords)}

Detected proof signals:
${JSON.stringify({ detectedKeywords: signals.detectedKeywords, quantifiedClaims: signals.quantifiedClaims, actionVerbCount: signals.actionVerbCount })}

Generate truthful, specific optimization guidance.`;

  const aiResult = await callAI({
    systemPrompt,
    userPrompt,
    maxTokens: 1500,
    temperature: 0.35,
    model: process.env.LM_STUDIO_MODEL_LINKEDIN || process.env.LM_STUDIO_MODEL,
    structuredJson: true,
  });

  if (!aiResult.ok || !aiResult.data) return fallback;

  const parsed = extractJSON(aiResult.data);
  if (!parsed || !Array.isArray(parsed.headlineOptions) || !parsed.aboutRewrite) {
    return fallback;
  }

  return {
    ...fallback,
    ...parsed,
    headlineOptions: parsed.headlineOptions.slice(0, 5),
    experienceImprovements: Array.isArray(parsed.experienceImprovements) ? parsed.experienceImprovements.slice(0, 5) : [],
    quickWins: Array.isArray(parsed.quickWins) ? parsed.quickWins.slice(0, 6) : fallback.quickWins,
    activityRecommendations: Array.isArray(parsed.activityRecommendations) ? parsed.activityRecommendations.slice(0, 5) : [],
    skillRecommendations: Array.isArray(parsed.skillRecommendations) ? parsed.skillRecommendations.slice(0, 8) : [],
    aiPowered: true,
  };
}

async function analyzeLinkedInProfile(input = {}) {
  const normalized = normalizeProfileInput(input);
  if (!normalized.profileUrl && !normalized.headline && !normalized.about) {
    const err = new Error('Provide either a LinkedIn profile URL or profile data (headline, about, etc.).');
    err.statusCode = 400;
    throw err;
  }

  const fetchedData = normalized.profileUrl
    ? await fetchLinkedInPublicData(normalized.profileUrl)
    : { fetched: false, reason: 'No public fetch (using provided data only)' };

  const profile = mergeFetchedData(normalized, fetchedData);

  // Allow analysis with provided data even if fetch fails
  const hasProvidedData = normalized.headline || normalized.about || normalized.skills.length > 0 || normalized.experiences.length > 0;
  if (!hasProvidedData && !hasMeaningfulFetchedProfileData(profile, fetchedData)) {
    const err = new Error(
      fetchedData.reason
        ? `Could not fetch public LinkedIn profile data from that URL. ${fetchedData.reason}`
        : 'Could not fetch enough public LinkedIn profile data from that URL.'
    );
    err.statusCode = 400;
    err.details = publicSourceSummary(fetchedData);
    throw err;
  }

  const signals = deriveProfileSignals(profile);
  const audit = {
    headline: { ...scoreHeadline(profile, signals), current: profile.headline },
    about: { ...scoreAbout(profile, signals), wordCount: profile.about.split(/\s+/).filter(Boolean).length },
    experience: { ...scoreExperience(profile, signals), count: profile.experienceCount },
    skills: { ...scoreSkills(profile, signals), count: profile.skills.length, current: profile.skills },
    completeness: scoreCompleteness(profile),
  };

  const metrics = [
    { label: 'Headline Impact', val: audit.headline.score, status: audit.headline.score >= 75 ? 'good' : 'warning' },
    { label: 'About Section Depth', val: audit.about.score, status: audit.about.score >= 75 ? 'good' : 'warning' },
    { label: 'Experience Proof', val: audit.experience.score, status: audit.experience.score >= 75 ? 'good' : 'warning' },
    { label: 'Skills Search Fit', val: audit.skills.score, status: audit.skills.score >= 75 ? 'good' : 'warning' },
    { label: 'Profile Completeness', val: audit.completeness.score, status: audit.completeness.score >= 75 ? 'good' : 'warning' },
  ];

  const score = clamp(
    audit.headline.score * 0.22 +
    audit.about.score * 0.24 +
    audit.experience.score * 0.20 +
    audit.skills.score * 0.19 +
    audit.completeness.score * 0.15
  );

  const scoreLabel = score >= 85 ? 'Recruiter Ready' : score >= 70 ? 'Strong' : score >= 50 ? 'Needs Polish' : 'Needs Work';
  const keywords = keywordIntelligence(profile, signals);
  const llm = await getLLMOptimizations(profile, audit, keywords, signals);
  const suggestions = deterministicSuggestions(profile, audit, keywords);

  return {
    success: true,
    score,
    scoreLabel,
    scoreDescription: `Your LinkedIn profile scores ${score}/100 based on real supplied${fetchedData.fetched ? ' and publicly fetched' : ''} profile data.`,
    dataSources: {
      userProvided: {
        headline: Boolean(normalized.headline),
        about: Boolean(normalized.about),
        skills: normalized.skills.length,
        pastedText: Boolean(normalized.pastedText),
        experiences: normalized.experiences.length,
      },
      publicFetch: publicSourceSummary(fetchedData),
    },
    profile,
    metrics,
    audit,
    keywords,
    optimizations: llm,
    suggestions,
    aiPowered: llm.aiPowered,
    generatedAt: new Date().toISOString(),
  };
}

async function generateHeadline(roleInfo, companyContext, achievements, targetRoles) {
  const systemPrompt = `You are a LinkedIn profile expert. Generate 3 compelling, concise LinkedIn headlines (max 120 chars each) based on the provided information. Return only valid JSON:
{
  "options": ["headline1", "headline2", "headline3"],
  "tips": "Brief tip on what makes good headlines"
}`;

  const userPrompt = `Create headlines for:
Role: ${roleInfo}
Company/Context: ${companyContext || 'N/A'}
Key achievements: ${achievements || 'N/A'}
Target positions: ${Array.isArray(targetRoles) ? targetRoles.join(', ') : targetRoles || 'N/A'}`;

  const result = await callAI({
    systemPrompt,
    userPrompt,
    maxTokens: 500,
    temperature: 0.7,
    model: process.env.LM_STUDIO_MODEL_GITHUB || process.env.LM_STUDIO_MODEL,
    structuredJson: true,
  });

  if (!result.ok || !result.data) {
    return {
      options: [
        `${roleInfo}${targetRoles ? ' | ' + (Array.isArray(targetRoles) ? targetRoles[0] : targetRoles) : ''}`,
        `${roleInfo} | Passionate about crafting solutions`,
        `${roleInfo} | Focused on impact and growth`
      ],
      tips: 'Include your role, key skills, and what you\'re passionate about'
    };
  }

  const parsed = extractJSON(result.data);
  return parsed || {
    options: ['Failed to generate'],
    tips: 'Please try again'
  };
}

async function generateAbout(profileContext, skills, achievements, targetRoles, targetIndustries) {
  const systemPrompt = `You are a LinkedIn profile expert. Generate a compelling, professional about section (100-150 words) that highlights expertise, achievements, and career focus. Return only valid JSON:
{
  "about": "The generated about section text",
  "tips": "Brief tips for improvement"
}`;

  const userPrompt = `Generate an about section for:
Role/Background: ${profileContext}
Key skills: ${Array.isArray(skills) ? skills.join(', ') : skills}
Achievements: ${achievements || 'Building products and leading teams'}
Target roles: ${Array.isArray(targetRoles) ? targetRoles.join(', ') : targetRoles || 'N/A'}
Target industries: ${Array.isArray(targetIndustries) ? targetIndustries.join(', ') : targetIndustries || 'N/A'}

Make it professional, achievement-focused, and action-oriented.`;

  const result = await callAI({
    systemPrompt,
    userPrompt,
    maxTokens: 800,
    temperature: 0.7,
    model: process.env.LM_STUDIO_MODEL_GITHUB || process.env.LM_STUDIO_MODEL,
    structuredJson: true,
  });

  if (!result.ok || !result.data) {
    return {
      about: `Passionate ${profileContext} with expertise in ${Array.isArray(skills) ? skills.slice(0, 3).join(', ') : skills}. Focused on building impactful solutions and driving results. Interested in opportunities in ${Array.isArray(targetIndustries) ? targetIndustries.join(', ') : 'technology and innovation'}.`,
      tips: 'Add specific achievements and metrics to strengthen your profile'
    };
  }

  const parsed = extractJSON(result.data);
  return parsed || {
    about: 'Unable to generate at this time',
    tips: 'Please try again'
  };
}

async function generateExperienceDescription(jobTitle, company, responsibilities, achievements) {
  const systemPrompt = `You are a LinkedIn profile expert. Generate a compelling work experience description (2-3 sentences) that highlights impact and achievements. Include metrics where relevant. Return only valid JSON:
{
  "description": "The generated description",
  "tips": "Tips for making it more impactful"
}`;

  const userPrompt = `Generate a work experience description for:
Job Title: ${jobTitle}
Company: ${company}
Responsibilities: ${responsibilities || 'General role'}
Achievements/Impact: ${achievements || 'Contributed to team success'}

Focus on achievements, metrics, and impact.`;

  const result = await callAI({
    systemPrompt,
    userPrompt,
    maxTokens: 600,
    temperature: 0.7,
    model: process.env.LM_STUDIO_MODEL_GITHUB || process.env.LM_STUDIO_MODEL,
    structuredJson: true,
  });

  if (!result.ok || !result.data) {
    return {
      description: `${responsibilities || 'Worked on various projects'} at ${company}. ${achievements || 'Contributed to team success and product development.'}`,
      tips: 'Add specific metrics and measurable outcomes to strengthen impact'
    };
  }

  const parsed = extractJSON(result.data);
  return parsed || {
    description: 'Unable to generate at this time',
    tips: 'Please try again'
  };
}

module.exports = {
  analyzeLinkedInProfile,
  normalizeProfileInput,
  fetchLinkedInPublicData,
  deriveProfileSignals,
  keywordIntelligence,
  generateHeadline,
  generateAbout,
  generateExperienceDescription,
};
