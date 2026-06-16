/**
 * Achievement Enhancer Route (Pipeline Tool #11)
 *
 * Converts raw achievements into professional, resume-ready impact statements.
 * Tier: "Tune & Polish" => requirePlan(2).
 *
 * Pipeline: User Input -> Context Detection -> Impact Extraction
 *           -> Local LLM Enhancement (callAI) -> Resume Bullet Generation.
 *
 * The LLM is the primary enhancer, but a deterministic rule-based fallback
 * (achievementEnhancerService.generateFallbackBullet) guarantees output when
 * callAI is unavailable or fails — mirroring coverLetter.js's pattern.
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requirePlan } = require('../middleware/requirePlan');
const { callAI } = require('../utils/aiClient');
const enhancer = require('../services/achievementEnhancerService');

const MAX_ACHIEVEMENTS = 15;
const MAX_LEN = 500;

/** Normalize the request body into a clean array of achievement strings. */
function parseAchievements(body) {
  const { achievement, achievements } = body || {};
  let list = [];

  if (Array.isArray(achievements)) {
    list = achievements;
  } else if (typeof achievements === 'string') {
    // allow newline-separated input in a single string field
    list = achievements.split('\n');
  } else if (Array.isArray(achievement)) {
    list = achievement;
  } else if (typeof achievement === 'string') {
    list = achievement.split('\n');
  }

  return list
    .map((a) => (typeof a === 'string' ? a.trim() : ''))
    .filter((a) => a.length > 0)
    .slice(0, MAX_ACHIEVEMENTS)
    .map((a) => a.slice(0, MAX_LEN));
}

/** Build the LLM prompt for a batch of achievements. */
function buildPrompt(achievements, roleHint) {
  const roleLine = roleHint
    ? `The candidate's target role/context is: "${roleHint}". Tailor phrasing accordingly.\n`
    : '';

  const numbered = achievements.map((a, i) => `${i + 1}. ${a}`).join('\n');

  const systemPrompt = `You are an expert resume writer. Rewrite each basic achievement into a single polished, professional resume bullet.
Rules:
- Start each bullet with a strong past-tense action verb (Developed, Led, Optimized, Built, etc.).
- Imply concrete impact (efficiency, accuracy, scale, cost, revenue). Do NOT invent specific fake numbers.
- Keep each bullet to one concise sentence.
- Return ONLY the rewritten bullets, one per line, in the same order, with no numbering, labels, or extra commentary.`;

  const userPrompt = `${roleLine}Rewrite these achievements into resume bullets:\n${numbered}`;

  return { systemPrompt, userPrompt };
}

/** Parse the LLM's plaintext response into a clean array of bullets. */
function parseAIBullets(text, expectedCount) {
  const lines = (text || '')
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter((l) => l.length > 0);

  // Only trust the AI output if it produced roughly the right number of lines.
  if (lines.length >= expectedCount) {
    return lines.slice(0, expectedCount);
  }
  return null;
}

router.post('/enhance', authenticateToken, requirePlan(2), async (req, res) => {
  try {
    const achievements = parseAchievements(req.body);
    const roleHint = typeof req.body?.role === 'string'
      ? req.body.role.trim().slice(0, 200)
      : (typeof req.body?.roleHint === 'string' ? req.body.roleHint.trim().slice(0, 200) : '');

    if (achievements.length === 0) {
      return res.status(400).json({
        error: 'At least one achievement is required.',
      });
    }

    // Stages 1 & 2: context detection + impact extraction (per achievement).
    const analysis = achievements.map((a) => ({
      input: a,
      context: enhancer.detectContext(a, roleHint),
      impact: enhancer.extractImpact(a),
    }));

    // Stage 3: Local LLM enhancement, with deterministic fallback.
    const { systemPrompt, userPrompt } = buildPrompt(achievements, roleHint);

    let bullets = null;
    let source = 'rule-based';

    const aiResult = await callAI({
      systemPrompt,
      userPrompt,
      maxTokens: 600,
      temperature: 0.6,
      model: process.env.LM_STUDIO_MODEL_RESUME || process.env.LM_STUDIO_MODEL_JOB,
    });

    if (aiResult.ok && aiResult.data) {
      const parsed = parseAIBullets(aiResult.data, achievements.length);
      if (parsed) {
        bullets = parsed;
        source = 'ai';
      }
    }

    if (!bullets) {
      bullets = enhancer.generateFallbackBullets(achievements, roleHint);
    }

    const results = achievements.map((input, i) => ({
      original: input,
      enhanced: bullets[i] || enhancer.generateFallbackBullet(input, roleHint),
      domain: analysis[i].context.domain,
      hasMetrics: analysis[i].impact.hasMetrics,
    }));

    res.json({
      success: true,
      data: {
        source, // 'ai' or 'rule-based'
        roleHint: roleHint || null,
        count: results.length,
        results,
        bullets: results.map((r) => r.enhanced),
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('Achievement enhancement error:', err);
    res.status(500).json({ error: 'Failed to enhance achievements' });
  }
});

module.exports = router;
