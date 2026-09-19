const fs = require('fs');
const path = require('path');

const REPO_ROOT = '/tmp/developer-roadmap';
const OUTPUT_DIR = path.join(__dirname, '..', 'src', 'data');

const TARGET_ROADMAPS = [
  'frontend',
  'backend',
  'javascript',
  'react',
  'python',
  'nodejs',
  'datastructures-and-algorithms',
  'computer-science',
];

const TRACK_META = {
  frontend: { name: 'Frontend Development', icon: 'web', skills: ['HTML', 'CSS', 'JavaScript', 'React', 'TypeScript', 'Tailwind', 'Git'] },
  backend: { name: 'Backend Development', icon: 'dns', skills: ['Node.js', 'Python', 'SQL', 'REST', 'GraphQL', 'Docker', 'Git'] },
  javascript: { name: 'JavaScript', icon: 'code', skills: ['Variables', 'Functions', 'Arrays', 'Objects', 'DOM', 'Async', 'ES6+'] },
  react: { name: 'React', icon: 'widgets', skills: ['JSX', 'Components', 'Hooks', 'State', 'Props', 'Router', 'Redux'] },
  python: { name: 'Python', icon: 'terminal', skills: ['Syntax', 'Data Types', 'OOP', 'Modules', 'File I/O', 'Libraries'] },
  nodejs: { name: 'Node.js', icon: 'memory', skills: ['npm', 'Express', 'APIs', 'Middleware', 'Databases', 'Auth'] },
  'datastructures-and-algorithms': { name: 'Data Structures & Algorithms', icon: 'account_tree', skills: ['Arrays', 'Linked Lists', 'Trees', 'Graphs', 'Sorting', 'DP'] },
  'computer-science': { name: 'Computer Science', icon: 'school', skills: ['OS', 'Networking', 'Databases', 'Security', 'Compilers'] },
};

function parseRoadmapJson(roadmapId) {
  const jsonPath = path.join(REPO_ROOT, 'src/data/roadmaps', roadmapId, `${roadmapId}.json`);
  if (!fs.existsSync(jsonPath)) return null;
  return JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
}

function loadContentFiles(roadmapId) {
  const contentDir = path.join(REPO_ROOT, 'src/data/roadmaps', roadmapId, 'content');
  if (!fs.existsSync(contentDir)) return { byId: {}, bySlug: {} };

  const files = fs.readdirSync(contentDir).filter(f => f.endsWith('.md'));
  const byId = {};
  const bySlug = {};

  for (const file of files) {
    if (!file.includes('@')) continue;
    const [slugPart, idPart] = file.split('@');
    const nodeId = idPart.replace('.md', '');
    const raw = fs.readFileSync(path.join(contentDir, file), 'utf-8');
    const entry = { slug: slugPart, content: raw, file };
    byId[nodeId] = entry;
    if (!bySlug[slugPart]) bySlug[slugPart] = [];
    bySlug[slugPart].push(entry);
  }

  return { byId, bySlug };
}

function parseResources(markdownContent) {
  const resources = [];
  const lines = markdownContent.split('\n');
  for (const line of lines) {
    const match = line.match(/^-\s+\[@(\w+)@([^\]]+)\]\(([^)]+)\)/);
    if (match) {
      resources.push({ type: match[1], title: match[2], url: match[3] });
    }
  }
  return resources;
}

function extractDescription(markdownContent) {
  const lines = markdownContent.split('\n');
  const descLines = [];
  let pastTitle = false;
  for (const line of lines) {
    if (line.startsWith('# ')) { pastTitle = true; continue; }
    if (!pastTitle) continue;
    if (line.startsWith('Visit the following') || line.startsWith('- [@')) break;
    const trimmed = line.trim();
    if (trimmed) descLines.push(trimmed);
  }
  return descLines.join(' ').trim();
}

function labelToSlug(label) {
  return label.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function findContent(nodeId, label, contentStore) {
  if (contentStore.byId[nodeId]) {
    return contentStore.byId[nodeId];
  }

  const slug = labelToSlug(label);
  const slugMatches = contentStore.bySlug[slug];
  if (slugMatches && slugMatches.length > 0) {
    return slugMatches[0];
  }

  const altSlugs = [
    slug.replace(/-/g, ''),
    slug.split('-').slice(0, 2).join('-'),
    `what-is-${slug}`,
    `${slug}-basics`,
  ];
  for (const alt of altSlugs) {
    if (contentStore.bySlug[alt]) {
      return contentStore.bySlug[alt][0];
    }
  }

  return null;
}

function extractModules(roadmapId) {
  const data = parseRoadmapJson(roadmapId);
  if (!data) return [];

  const contentStore = loadContentFiles(roadmapId);
  const nodes = data.nodes || [];
  const edges = data.edges || [];

  const nodeMap = {};
  for (const n of nodes) {
    const label = (n.data?.label || '').trim();
    const type = n.type || '';
    if (label && (type === 'topic' || type === 'subtopic' || type === 'todo')) {
      nodeMap[n.id] = { id: n.id, label, type, y: n.position?.y || 0 };
    }
  }

  const childrenOf = {};
  for (const e of edges) {
    const parentNode = nodeMap[e.source];
    const childNode = nodeMap[e.target];
    if (parentNode && childNode) {
      if (parentNode.type === 'topic' && (childNode.type === 'subtopic' || childNode.type === 'todo')) {
        if (!childrenOf[e.source]) childrenOf[e.source] = [];
        childrenOf[e.source].push(e.target);
      }
    }
  }

  const topicNodes = Object.values(nodeMap)
    .filter(n => n.type === 'topic')
    .sort((a, b) => a.y - b.y);

  const modules = [];

  for (let i = 0; i < topicNodes.length; i++) {
    const topic = topicNodes[i];
    const subtopicIds = childrenOf[topic.id] || [];
    const subtopicNodes = subtopicIds
      .map(id => nodeMap[id])
      .filter(Boolean)
      .sort((a, b) => a.y - b.y);

    const subtopics = [];
    for (const st of subtopicNodes) {
      const contentEntry = findContent(st.id, st.label, contentStore);
      let description = '';
      let resources = [];
      if (contentEntry) {
        description = extractDescription(contentEntry.content);
        resources = parseResources(contentEntry.content);
      }
      if (!description) {
        description = `Learn about ${st.label} as part of ${topic.label}.`;
      }
      subtopics.push({
        id: labelToSlug(st.label) || st.id,
        title: st.label,
        description,
        resources,
      });
    }

    const topicContent = findContent(topic.id, topic.label, contentStore);
    let topicDescription = '';
    let topicResources = [];
    if (topicContent) {
      topicDescription = extractDescription(topicContent.content);
      topicResources = parseResources(topicContent.content);
    }
    if (!topicDescription) {
      topicDescription = `Learn the fundamentals of ${topic.label}.`;
    }

    if (subtopics.length === 0) {
      subtopics.push({
        id: labelToSlug(topic.label) + '-overview',
        title: `${topic.label} Overview`,
        description: topicDescription,
        resources: topicResources,
      });
    }

    const moduleId = `${roadmapId}__${labelToSlug(topic.label)}`;
    const estimatedHours = Math.max(1, Math.ceil(subtopics.length * 1.5));

    modules.push({
      id: moduleId,
      roadmap: roadmapId,
      topic: topic.label,
      order: i + 1,
      description: topicDescription,
      resources: topicResources,
      subtopics,
      estimatedHours,
      prerequisites: i > 0 ? [modules[i - 1].id] : [],
    });
  }

  return modules;
}

function extractQuestions() {
  const questionsDir = path.join(REPO_ROOT, 'src/data/question-groups');
  if (!fs.existsSync(questionsDir)) return [];

  const groups = fs.readdirSync(questionsDir).filter(d =>
    fs.statSync(path.join(questionsDir, d)).isDirectory()
  );

  const allQuestions = [];

  for (const group of groups) {
    const mdPath = path.join(questionsDir, group, `${group}.md`);
    if (!fs.existsSync(mdPath)) continue;

    const raw = fs.readFileSync(mdPath, 'utf-8');
    const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) continue;

    const fm = fmMatch[1];
    const questionBlocks = fm.split(/\n  - question:\s*/);

    for (let i = 1; i < questionBlocks.length; i++) {
      const block = questionBlocks[i];
      const questionMatch = block.match(/^(.+?)$/m);
      const answerMatch = block.match(/answer:\s*(.+)/);
      const topicsMatch = block.match(/topics:\s*\n\s*-\s*'(.+?)'/);

      if (!questionMatch) continue;

      const questionText = questionMatch[1].trim();
      const answerFile = answerMatch ? answerMatch[1].trim() : null;
      const difficulty = topicsMatch ? topicsMatch[1] : 'Beginner';

      let answer = '';
      if (answerFile) {
        const answerPath = path.join(questionsDir, group, 'content', answerFile);
        if (fs.existsSync(answerPath)) {
          answer = fs.readFileSync(answerPath, 'utf-8').trim();
        }
      }

      allQuestions.push({
        id: `${group}-q${i}`,
        group,
        question: questionText,
        answer,
        difficulty,
      });
    }
  }

  return allQuestions;
}

function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log('Extracting roadmap.sh content...\n');

  const allModules = {};
  let totalModules = 0;
  let totalSubtopics = 0;
  let withContent = 0;
  let withoutContent = 0;

  for (const roadmapId of TARGET_ROADMAPS) {
    const modules = extractModules(roadmapId);
    const meta = TRACK_META[roadmapId] || { name: roadmapId, icon: 'route', skills: [] };

    allModules[roadmapId] = {
      id: roadmapId,
      name: meta.name,
      icon: meta.icon,
      skills: meta.skills,
      moduleCount: modules.length,
      modules,
    };

    let trackWithContent = 0;
    let trackWithout = 0;
    for (const m of modules) {
      for (const s of m.subtopics) {
        if (s.description && !s.description.startsWith('Learn about ') && !s.description.startsWith('Learn the fundamentals')) {
          trackWithContent++;
        } else {
          trackWithout++;
        }
      }
    }
    withContent += trackWithContent;
    withoutContent += trackWithout;

    const subtopicCount = modules.reduce((sum, m) => sum + m.subtopics.length, 0);
    totalModules += modules.length;
    totalSubtopics += subtopicCount;

    console.log(`  ${meta.name}: ${modules.length} modules, ${subtopicCount} subtopics (${trackWithContent} with content)`);
  }

  const modulesPath = path.join(OUTPUT_DIR, 'modules.json');
  fs.writeFileSync(modulesPath, JSON.stringify(allModules, null, 2));
  console.log(`\nWrote ${modulesPath}`);
  console.log(`Total: ${totalModules} modules, ${totalSubtopics} subtopics (${withContent} with content, ${withoutContent} auto-generated)`);

  console.log('\nExtracting question bank...');
  const questions = extractQuestions();

  const questionsPath = path.join(OUTPUT_DIR, 'questions.json');
  fs.writeFileSync(questionsPath, JSON.stringify(questions, null, 2));
  console.log(`Wrote ${questionsPath}`);
  console.log(`Total: ${questions.length} questions across ${[...new Set(questions.map(q => q.group))].length} groups`);

  const diffDist = {};
  questions.forEach(q => { diffDist[q.difficulty] = (diffDist[q.difficulty] || 0) + 1; });
  console.log('Difficulty distribution:', diffDist);

  console.log('\nDone!');
}

main();
