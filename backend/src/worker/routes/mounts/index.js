'use strict';

/**
 * Aggregates every slice's route mounts. Slices own disjoint prefixes except where noted in each
 * slice file (the /api/jobs, /api/resume and /api/ats groups live entirely inside one slice each, so
 * Express's registration order within a shared prefix is preserved). Order between slices is irrelevant.
 */
const SLICES = [
  require('./auth'),
  require('./leaf1'),
  require('./leaf2'),
  require('./mid1'),
  require('./mid2'),
  require('./jobs'),
  require('./large1'),
  require('./large2'),
  require('./large3'),
  require('./docs'),
];

function mountAll(app) {
  for (const slice of SLICES) slice.mount(app);
}

module.exports = { mountAll };
