'use strict';

/**
 * Service registry / container   (T2.1, T2.2 and every later service port)
 *
 * c.get('services') is a lazily-built container: a service factory only runs the
 * first time `services.<name>` is read in a request, and the instance is cached
 * for the rest of that request. Nothing is constructed at module scope.
 *
 * TO ADD A SERVICE (one line, in REGISTRY below):
 *
 *   activityService: ({ db }) => createActivityService({ db }),
 *
 * A factory receives `{ db, config, services }`; `services` is the same container,
 * so one service may depend on another lazily (`services.planService`). Factories
 * must not perform I/O or read ambient globals; take everything from the args.
 *
 * Tests can replace any entry: createServices({ db, config, overrides: { planService: fake } }).
 */
const { createSessionService } = require('./sessionService');
const { createPlanService } = require('./planService');

// One registry file per porting slice (ADR-001 Phase 2/3) so parallel ports never edit the same file.
const SLICE_REGISTRIES = [
  require('./registry/infra'),
  require('./registry/auth'),
  require('./registry/leaf1'),
  require('./registry/leaf2'),
  require('./registry/mid1'),
  require('./registry/mid2'),
  require('./registry/jobs'),
  require('./registry/large1'),
  require('./registry/large2'),
  require('./registry/large3'),
  require('./registry/docs'),
];

const REGISTRY = {
  sessionService: ({ db, config }) => createSessionService({ db, config }),
  planService: ({ db }) => createPlanService({ db }),
  ...Object.assign({}, ...SLICE_REGISTRIES),
};

/**
 * @param {{ db: object, config: object, overrides?: Record<string, object> }} deps
 */
function createServices({ db, config, overrides = {} }) {
  const cache = new Map();
  const services = {};

  const names = new Set([...Object.keys(REGISTRY), ...Object.keys(overrides)]);
  for (const name of names) {
    Object.defineProperty(services, name, {
      enumerable: true,
      get() {
        if (!cache.has(name)) {
          const instance = Object.prototype.hasOwnProperty.call(overrides, name)
            ? overrides[name]
            : REGISTRY[name]({ db, config, services });
          cache.set(name, instance);
        }
        return cache.get(name);
      },
    });
  }
  return Object.freeze(services);
}

module.exports = { createServices, REGISTRY };
