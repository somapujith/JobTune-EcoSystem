const planService = require('./planService');

class RecommendationEngine {
  async recommendPlan(careerGoal, experienceLevel, painPoints) {
    let score = { 'Learn & Build': 0, 'Tune & Polish': 0, 'Zero to Hero': 0 };

    // Career goal scoring (40 points max)
    if (careerGoal === 'service-role') {
      score['Learn & Build'] += 40;
      score['Tune & Polish'] += 20;
    } else if (careerGoal === 'skill-development') {
      score['Tune & Polish'] += 40;
      score['Zero to Hero'] += 30;
    } else if (careerGoal === 'faang-or-top-company') {
      score['Zero to Hero'] += 40;
      score['Tune & Polish'] += 25;
    } else {
      score['Tune & Polish'] += 30;
    }

    // Experience level scoring (30 points max)
    if (experienceLevel === 'beginner') {
      score['Learn & Build'] += 25;
      score['Tune & Polish'] += 30;
    } else if (experienceLevel === 'intermediate') {
      score['Tune & Polish'] += 30;
      score['Zero to Hero'] += 20;
    } else if (experienceLevel === 'advanced') {
      score['Zero to Hero'] += 30;
      score['Tune & Polish'] += 15;
    }

    // Pain points scoring (30 points max)
    if (Array.isArray(painPoints) && painPoints.length > 0) {
      const painPointScores = {
        'resume-portfolio': { 'Tune & Polish': 25, 'Zero to Hero': 15, 'Learn & Build': 5 },
        'interviews': { 'Zero to Hero': 25, 'Tune & Polish': 15, 'Learn & Build': 10 },
        'job-search': { 'Zero to Hero': 20, 'Tune & Polish': 15, 'Learn & Build': 10 },
        'skill-gaps': { 'Learn & Build': 20, 'Tune & Polish': 15, 'Zero to Hero': 15 },
        'networking': { 'Tune & Polish': 20, 'Zero to Hero': 15, 'Learn & Build': 5 },
        'project-building': { 'Learn & Build': 25, 'Tune & Polish': 20, 'Zero to Hero': 15 }
      };

      painPoints.forEach(point => {
        if (painPointScores[point]) {
          Object.keys(painPointScores[point]).forEach(plan => {
            score[plan] += painPointScores[point][plan];
          });
        }
      });
    }

    // Normalize scores (higher is better)
    const ranked = Object.entries(score)
      .sort((a, b) => b[1] - a[1])
      .map(([plan, pts]) => ({ plan, score: pts }));

    // Get plan ID for recommended plan
    const recommendedPlanName = ranked[0].plan;
    const recommendedPlan = await planService.getPlanByName(recommendedPlanName);

    return {
      recommendedPlan: recommendedPlan,
      allPlans: ranked.map(r => ({ ...r, details: null })),
      scores: score
    };
  }
}

module.exports = new RecommendationEngine();
