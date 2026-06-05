/**
 * GitHub Profile README Markdown Generator
 * Converts form data into professional markdown
 */

export function generateReadme(formData) {
  let markdown = '';

  // Header
  if (formData.name) {
    markdown += `# Hi 👋, I'm ${formData.name}\n`;
  }

  if (formData.tagline) {
    markdown += `### ${formData.tagline}\n`;
  }

  markdown += '\n';

  // About Me Section
  const aboutItems = [];
  if (formData.currentWork) {
    aboutItems.push(`🔭 I'm currently working on **${formData.currentWork}**`);
  }
  if (formData.learning) {
    aboutItems.push(`🌱 I'm currently learning **${formData.learning}**`);
  }
  if (formData.askAbout) {
    aboutItems.push(`💬 Ask me about **${formData.askAbout}**`);
  }
  if (formData.email) {
    aboutItems.push(`📫 How to reach me: **${formData.email}**`);
  }
  if (formData.bio) {
    aboutItems.push(`✨ ${formData.bio}`);
  }

  if (aboutItems.length > 0) {
    markdown += '## About Me\n';
    aboutItems.forEach(item => {
      markdown += `- ${item}\n`;
    });
    markdown += '\n';
  }

  // Skills Section
  if (formData.skills && formData.skills.length > 0) {
    markdown += '## Skills & Languages\n';
    markdown += `\`\`\`\n`;
    markdown += formData.skills.join(', ');
    markdown += `\n\`\`\`\n\n`;
  }

  // Tech Stack Section
  if (formData.techStack) {
    markdown += '## Tech Stack\n';
    const stacks = formData.techStack.split(',').map(s => s.trim()).filter(Boolean);
    const badges = stacks.map(tech => {
      const slug = tech.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      return `![${tech}](https://img.shields.io/badge/${slug}-000?style=flat&logo=${slug})`;
    }).join(' ');
    markdown += badges + '\n\n';
  }

  // Connect Section
  const socialLinks = [];
  if (formData.linkedin) {
    socialLinks.push(`[LinkedIn](${formData.linkedin})`);
  }
  if (formData.twitter) {
    socialLinks.push(`[Twitter](https://twitter.com/${formData.twitter})`);
  }
  if (formData.github) {
    socialLinks.push(`[GitHub](https://github.com/${formData.github})`);
  }
  if (formData.instagram) {
    socialLinks.push(`[Instagram](https://instagram.com/${formData.instagram})`);
  }
  if (formData.portfolio) {
    socialLinks.push(`[Portfolio](${formData.portfolio})`);
  }
  if (formData.blog) {
    socialLinks.push(`[Blog](${formData.blog})`);
  }

  if (socialLinks.length > 0) {
    markdown += '## Connect With Me\n';
    markdown += socialLinks.join(' | ') + '\n\n';
  }

  // GitHub Stats
  if (formData.showGithubStats && formData.github) {
    markdown += '## GitHub Stats\n';
    markdown += `![${formData.github}'s GitHub Stats](https://github-readme-stats.vercel.app/api?username=${formData.github}&show_icons=true&theme=radical)\n\n`;
  }

  // Streak Stats
  if (formData.showStreakStats && formData.github) {
    markdown += '## GitHub Streak\n';
    markdown += `![GitHub Streak](https://github-readme-streak-stats.herokuapp.com/?user=${formData.github}&theme=radical)\n\n`;
  }

  // Top Languages
  if (formData.showTopLanguages && formData.github) {
    markdown += '## Top Languages\n';
    markdown += `![Top Languages](https://github-readme-stats.vercel.app/api/top-langs/?username=${formData.github}&layout=compact&theme=radical)\n\n`;
  }

  // Visitors Counter
  if (formData.showVisitors) {
    markdown += '## Profile Views\n';
    markdown += `![Visitors](https://api.visitorbadge.io/api/visitors?path=https%3A%2F%2Fgithub.com%2F${formData.github}&label=Visitors&countColor=%23263759&style=flat)\n\n`;
  }

  // Buy Me A Coffee
  if (formData.buyMeCoffee) {
    markdown += `## Support\n`;
    markdown += `[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](${formData.buyMeCoffee})\n\n`;
  }

  // Custom Section
  if (formData.customSection) {
    markdown += `## ${formData.customSectionTitle || 'More'}\n`;
    markdown += formData.customSection + '\n\n';
  }

  // Footer
  markdown += '---\n';
  markdown += `*Generated with ❤️ by JobTube Eco System*`;

  return markdown;
}

/**
 * Get popular skills organized by category
 */
export const SKILLS_BY_CATEGORY = {
  'Languages': [
    'JavaScript',
    'TypeScript',
    'Python',
    'Go',
    'Rust',
    'Java',
    'C++',
    'C#',
    'PHP',
    'Ruby',
    'Swift',
    'Kotlin',
  ],
  'Frontend': [
    'React',
    'Vue.js',
    'Angular',
    'Svelte',
    'Next.js',
    'Nuxt.js',
    'HTML5',
    'CSS3',
    'Tailwind CSS',
    'Material UI',
  ],
  'Backend': [
    'Node.js',
    'Express',
    'Django',
    'Flask',
    'Spring Boot',
    'FastAPI',
    'NestJS',
    'Gin',
    'Laravel',
    'ASP.NET',
  ],
  'Databases': [
    'MongoDB',
    'PostgreSQL',
    'MySQL',
    'Redis',
    'DynamoDB',
    'Firebase',
    'SQLite',
    'Elasticsearch',
  ],
  'DevOps & Tools': [
    'Docker',
    'Kubernetes',
    'AWS',
    'Google Cloud',
    'Azure',
    'Git',
    'CI/CD',
    'Linux',
    'Nginx',
    'Apache',
  ],
};
