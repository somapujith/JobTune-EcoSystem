/**
 * Project Analyzer - Scores the Projects section
 * Max Score: 10 Points (overall) — each project entry is scored out of 10
 * (Name 3 + Description 4 + Technologies 3), then averaged across all
 * projects found. Recommends a minimum of 2 projects.
 */

class ProjectAnalyzer {
  static MAX_SCORE = 10;
  static PER_PROJECT_MAX = 10;
  static POINTS = { name: 3, description: 4, technologies: 3 };
  static RECOMMENDED_MIN_PROJECTS = 2;

  static WEAK_PROJECT_NAMES = /^(mini\s*project|project\s*\d*|untitled|my\s*project|college\s*project|final\s*year\s*project)$/i;

  static analyze(resumeText) {
    if (!resumeText || typeof resumeText !== 'string') {
      return { score: 0, maxScore: this.MAX_SCORE, projectsFound: 0, projects: [], recommendations: [] };
    }

    const projectsBlock = this._extractProjectsBlock(resumeText);

    if (!projectsBlock) {
      return {
        score: 0,
        maxScore: this.MAX_SCORE,
        projectsFound: 0,
        projects: [],
        recommendations: [{ severity: 'high', message: 'No Projects section found. Add 2-3 projects with technologies and descriptions.' }]
      };
    }

    const projectEntries = this._splitProjectEntries(projectsBlock);
    const evaluated = projectEntries.map(entry => this._evaluateProject(entry));

    const avgRaw = evaluated.length > 0
      ? evaluated.reduce((sum, p) => sum + p.rawScore, 0) / evaluated.length
      : 0;

    const score = Math.round((avgRaw / this.PER_PROJECT_MAX) * this.MAX_SCORE);

    return {
      score: Math.max(0, Math.min(score, this.MAX_SCORE)),
      maxScore: this.MAX_SCORE,
      percentage: (Math.max(0, Math.min(score, this.MAX_SCORE)) / this.MAX_SCORE) * 100,
      projectsFound: evaluated.length,
      projects: evaluated,
      recommendations: this._getRecommendations(evaluated)
    };
  }

  static _extractProjectsBlock(text) {
    const headingPattern = /^(key\s+projects(\s*(&|and)\s*achievements)?|projects?(\s*(&|and)\s*achievements)?|notable\s+projects|portfolio)\s*:?\s*$/im;
    const lines = text.split('\n');
    const startIdx = lines.findIndex(line => headingPattern.test(line.trim()));

    if (startIdx === -1) return null;

    const otherHeadings = /^(professional\s+experience|experience|education|technical\s+skills|skills|quantified\s+results|certifications?)\s*:?\s*$/i;
    let endIdx = lines.length;
    for (let i = startIdx + 1; i < lines.length; i++) {
      if (otherHeadings.test(lines[i].trim())) { endIdx = i; break; }
    }

    return lines.slice(startIdx + 1, endIdx).join('\n').trim();
  }

  static _splitProjectEntries(block) {
    const lines = block.split('\n');
    const entries = [];
    let current = null;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      const isBullet = /^[-•*]/.test(line);
      if (!isBullet) {
        if (current) entries.push(current);
        current = { title: line, bullets: [] };
      } else if (current) {
        current.bullets.push(line.replace(/^[-•*]\s*/, ''));
      }
    }
    if (current) entries.push(current);

    return entries;
  }

  /**
   * Score one project entry: Name (3) + Description (4) + Technologies (3) = 10
   */
  static _evaluateProject(entry) {
    const fullText = [entry.title, ...entry.bullets].join(' ');

    const hasGoodName = entry.title.length > 0 && !this.WEAK_PROJECT_NAMES.test(entry.title.trim());
    const hasDescription = entry.bullets.length > 0 && entry.bullets.some(b => b.length > 30);
    const hasTech = /\b(react|node|python|java|javascript|typescript|next\.?js|three\.?js|webgl|aws|docker|sql|mongo|express|django|flask|vue|angular|figma|tailwind)\b/i.test(fullText);

    const rawScore =
      (hasGoodName ? this.POINTS.name : 0) +
      (hasDescription ? this.POINTS.description : 0) +
      (hasTech ? this.POINTS.technologies : 0);

    return {
      title: entry.title,
      rawScore,
      maxRawScore: this.PER_PROJECT_MAX,
      criteria: { hasGoodName, hasDescription, hasTech },
      missing: [
        ...(!hasGoodName ? ['Project Name'] : []),
        ...(!hasDescription ? ['Description'] : []),
        ...(!hasTech ? ['Technologies'] : [])
      ]
    };
  }

  static _getRecommendations(evaluated) {
    const recommendations = [];

    if (evaluated.length === 0) {
      recommendations.push({ severity: 'high', message: `Add at least ${this.RECOMMENDED_MIN_PROJECTS} projects with clear descriptions.` });
      return recommendations;
    }

    if (evaluated.length < this.RECOMMENDED_MIN_PROJECTS) {
      recommendations.push({ severity: 'medium', message: `Add more projects — recruiters look for at least ${this.RECOMMENDED_MIN_PROJECTS} strong examples.` });
    }

    const weakNames = evaluated.filter(p => !p.criteria.hasGoodName);
    if (weakNames.length > 0) {
      recommendations.push({ severity: 'medium', message: `Rename generic project titles: ${weakNames.map(p => p.title).join(', ')}` });
    }

    const noTech = evaluated.filter(p => !p.criteria.hasTech);
    if (noTech.length > 0) {
      recommendations.push({ severity: 'high', message: 'List the technologies used in each project.' });
    }

    const noDescription = evaluated.filter(p => !p.criteria.hasDescription);
    if (noDescription.length > 0) {
      recommendations.push({ severity: 'high', message: 'Add a clear description of what each project does.' });
    }

    return recommendations;
  }
}

module.exports = ProjectAnalyzer;
