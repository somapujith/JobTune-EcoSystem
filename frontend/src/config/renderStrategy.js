/**
 * Rendering strategy per route.
 *
 * SSR  — public, SEO-critical pages: HTML rendered on the server, hydrated on the client.
 * CSR  — authenticated app shell: empty root + client bundle (no SSR of private data).
 */

const SSR_PATHS = new Set(['/', '/blog', '/login']);

export const DEFAULT_META = {
  title: 'JobTune — AI Career Preparation Ecosystem',
  description:
    'Skill assessment, resume optimization, interview prep, and job tracking — one connected ecosystem for tech careers.',
};

export const ROUTE_META = {
  '/': {
    title: 'JobTune — Your AI-Powered Career Ecosystem',
    description:
      'Assess skills, optimize your resume and profiles, practice interviews, and land your dream tech role with JobTune.',
  },
  '/blog': {
    title: 'JobTune Blog — Career & Interview Insights',
    description:
      'Resume tips, interview strategies, and AI-powered job search advice for students and early-career professionals.',
  },
  '/login': {
    title: 'Sign In — JobTune',
    description: 'Sign in to your JobTune account and access your personalized career tools.',
  },
};

export function normalizePathname(pathname = '/') {
  const path = pathname.split('?')[0].split('#')[0];
  if (path === '/' || path === '') return '/';
  return path.replace(/\/+$/, '') || '/';
}

export function getRenderStrategy(pathname) {
  return SSR_PATHS.has(normalizePathname(pathname)) ? 'ssr' : 'csr';
}

export function getRouteMeta(pathname) {
  return ROUTE_META[normalizePathname(pathname)] || DEFAULT_META;
}

export function buildHeadTags(pathname) {
  const { title, description } = getRouteMeta(pathname);
  return `
    <title>${title}</title>
    <meta name="description" content="${description}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
  `.trim();
}
