const JobSource = require('./JobSource');

const MOCK_JOBS = [
  {
    title: 'Software Engineer',
    company: 'Acme Technologies',
    location: 'San Francisco, CA (Remote OK)',
    description:
      'We are looking for a passionate Software Engineer to join our growing team. ' +
      'You will design, build, and maintain efficient, reusable, and reliable code. ' +
      'Strong proficiency in JavaScript/TypeScript, Node.js, and React is required.',
    url: 'https://example.com/jobs/software-engineer',
    tags: ['javascript', 'node.js', 'react', 'full-stack']
  },
  {
    title: 'DevOps Engineer',
    company: 'CloudScale Inc',
    location: 'Remote',
    description:
      'Join our infrastructure team to build and maintain CI/CD pipelines, ' +
      'manage Kubernetes clusters, and ensure the reliability and scalability of ' +
      'our platform. Experience with AWS, Terraform, and Docker required.',
    url: 'https://example.com/jobs/devops-engineer',
    tags: ['devops', 'kubernetes', 'aws', 'terraform', 'docker']
  },
  {
    title: 'Product Manager',
    company: 'Nexus Ventures',
    location: 'New York, NY',
    description:
      'We need a strategic Product Manager to define product vision, gather ' +
      'requirements, and work cross-functionally with engineering and design. ' +
      'Experience with Agile methodologies and a data-driven mindset are essential.',
    url: 'https://example.com/jobs/product-manager',
    tags: ['product', 'agile', 'strategy', 'roadmap']
  },
  {
    title: 'UX/UI Designer',
    company: 'Pixel Perfect Studio',
    location: 'Austin, TX (Hybrid)',
    description:
      'Pixel Perfect Studio is seeking a talented Designer to craft exceptional ' +
      'user experiences. You will own the full design process from wireframes to ' +
      'high-fidelity prototypes. Proficiency in Figma and a strong portfolio required.',
    url: 'https://example.com/jobs/ux-ui-designer',
    tags: ['design', 'figma', 'ux', 'ui', 'prototyping']
  },
  {
    title: 'Data Scientist',
    company: 'Insight Analytics Corp',
    location: 'Remote',
    description:
      'Insight Analytics is looking for a Data Scientist to extract insights from ' +
      'large datasets and build predictive models. Strong knowledge of Python, ' +
      'pandas, scikit-learn, and SQL is required. Experience with ML pipelines is a plus.',
    url: 'https://example.com/jobs/data-scientist',
    tags: ['python', 'machine-learning', 'data-science', 'sql', 'pandas']
  }
];

class MockJobSource extends JobSource {
  async search(_query, _location) {
    return MOCK_JOBS.map((job, idx) => ({
      externalId: `mock_${idx}`,
      source: 'mock',
      title: job.title,
      company: job.company,
      location: job.location,
      description: job.description,
      url: job.url,
      tags: job.tags
    }));
  }
}

module.exports = MockJobSource;
