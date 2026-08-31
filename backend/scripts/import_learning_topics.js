// One-off importer: reads Topic_workflows/Frontend/{Beginner,Intermediate,Job_Tune}/<NN-slug>/README.md
// and upserts each into the learning_topics table.
//
// Usage: node backend/scripts/import_learning_topics.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/config/database');

const SUBJECT = 'Frontend';
const TIERS = ['Beginner', 'Intermediate', 'Job_Tune'];
const ROOT = path.join(__dirname, '..', '..', 'Topic_workflows', 'Frontend');

// Matches the topic order/titles used in Topic_workflows/Frontend/README.md.
// Keyed by folder slug (post number-prefix-strip) since that's stable across tiers.
const TITLES_BY_SLUG = {
  internet: 'Internet',
  html: 'HTML',
  css: 'CSS',
  javascript: 'JavaScript',
  'version-control': 'Version Control (Git)',
  'package-managers': 'Package Managers',
  'pick-a-framework': 'Pick a Framework',
  'writing-css': 'Writing CSS',
  'build-tools': 'Build Tools',
  testing: 'Testing',
  authentication: 'Authentication Strategies',
  'web-security': 'Web Security Basics',
  'web-components': 'Web Components',
  'type-checkers': 'Type Checkers (TypeScript)',
  ssr: 'Server-Side Rendering (SSR)',
  graphql: 'GraphQL',
  'static-site-generators': 'Static Site Generators',
  pwas: 'Progressive Web Apps (PWAs)',
  'mobile-apps': 'Mobile Apps',
  'desktop-apps': 'Desktop Apps',
  'browser-apis': 'Browser APIs',
  performance: 'Measuring & Improving Performance',
};

function titleFromSlug(slug) {
  return (
    TITLES_BY_SLUG[slug] ||
    slug
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  );
}

async function importTier(tier) {
  const tierDir = path.join(ROOT, tier);
  const entries = fs
    .readdirSync(tierDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  let count = 0;
  for (const folderName of entries) {
    const readmePath = path.join(tierDir, folderName, 'README.md');
    if (!fs.existsSync(readmePath)) continue;

    const contentMd = fs.readFileSync(readmePath, 'utf-8');
    const orderMatch = folderName.match(/^(\d+)-/);
    const topicOrder = orderMatch ? parseInt(orderMatch[1], 10) : count + 1;
    const slug = folderName.replace(/^\d+-/, '');
    const title = titleFromSlug(slug);

    await pool.query(
      `INSERT INTO learning_topics (subject, tier, topic_order, slug, title, content_md, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
       ON CONFLICT (subject, tier, slug)
       DO UPDATE SET title = $5, content_md = $6, topic_order = $3, updated_at = CURRENT_TIMESTAMP`,
      [SUBJECT, tier, topicOrder, slug, title, contentMd]
    );
    count += 1;
  }
  console.log(`✅ ${tier}: imported ${count} topics`);
}

async function main() {
  if (!fs.existsSync(ROOT)) {
    console.error(`❌ Source folder not found: ${ROOT}`);
    process.exit(1);
  }

  for (const tier of TIERS) {
    await importTier(tier);
  }

  const totalResult = await pool.query(
    'SELECT COUNT(*) FROM learning_topics WHERE subject = $1',
    [SUBJECT]
  );
  console.log(`✅ Done. ${totalResult.rows[0].count} total rows for subject "${SUBJECT}".`);
  await pool.end();
}

main().catch((err) => {
  console.error('❌ Import failed:', err);
  process.exit(1);
});
