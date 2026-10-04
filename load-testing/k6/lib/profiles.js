// Load profiles. Each one answers a different question; see docs/en/04-load-testing.md.
//
//   smoke        Does the script work against this environment at all?            (CI)
//   load         Does the system meet the targets at the expected peak (2,000 users)?
//   stress       Where is the breaking point, and how does the system fail?       (steps of +1,000)
//   spike        Does it survive 200 -> 5,000 users in one minute, and recover?
//   soak         Does it stay healthy for 48 h (leaks, log growth, plan drift)?
//   login-storm  2,000 people logging in at the same moment (start of the work day).
//   throughput   Open model: can it sustain 500 business transactions per second?

import { SCALE, DURATION_FACTOR, P95_MS, MAX_ERROR_RATE, SOAK_MINUTES } from './config.js';

const users = (n) => Math.max(1, Math.round(n * SCALE));
const dur = (minutes) => `${Math.max(1, Math.round(minutes * 60 * DURATION_FACTOR))}s`;

function stressStages() {
  const stages = [];
  for (let target = 1000; target <= 7000; target += 1000) {
    stages.push({ duration: dur(2), target: users(target) }); // ramp to the next step
    stages.push({ duration: dur(8), target: users(target) }); // hold and observe
  }
  stages.push({ duration: dur(3), target: 0 });
  return stages;
}

const PROFILES = {
  smoke: {
    smoke: { executor: 'constant-vus', exec: 'userJourney', vus: 2, duration: dur(0.5) },
  },

  load: {
    load: {
      executor: 'ramping-vus',
      exec: 'userJourney',
      startVUs: 0,
      stages: [
        { duration: dur(10), target: users(2000) },
        { duration: dur(30), target: users(2000) },
        { duration: dur(5), target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },

  stress: {
    stress: {
      executor: 'ramping-vus',
      exec: 'userJourney',
      startVUs: 0,
      stages: stressStages(),
      gracefulRampDown: '30s',
    },
  },

  spike: {
    spike: {
      executor: 'ramping-vus',
      exec: 'userJourney',
      startVUs: users(200),
      stages: [
        { duration: dur(5), target: users(200) }, // warm baseline
        { duration: dur(1), target: users(5000) }, // the spike
        { duration: dur(10), target: users(5000) }, // hold at peak
        { duration: dur(1), target: users(200) }, // drop
        { duration: dur(5), target: users(200) }, // recovery: are we back to baseline latency?
      ],
      gracefulRampDown: '30s',
    },
  },

  soak: {
    soak: {
      executor: 'constant-vus',
      exec: 'userJourney',
      vus: users(1500),
      duration: dur(SOAK_MINUTES),
    },
  },

  'login-storm': {
    login_storm: {
      executor: 'per-vu-iterations',
      exec: 'loginOnly',
      vus: users(2000),
      iterations: 1,
      maxDuration: dur(5),
    },
  },

  throughput: {
    throughput: {
      executor: 'ramping-arrival-rate',
      exec: 'singleTransaction',
      startRate: users(50),
      timeUnit: '1s',
      preAllocatedVUs: users(1000),
      maxVUs: users(6000),
      stages: [
        { duration: dur(10), target: users(500) },
        { duration: dur(20), target: users(500) },
        { duration: dur(2), target: 0 },
      ],
    },
  },
};

export function buildScenarios(profile) {
  const scenarios = PROFILES[profile];
  if (!scenarios) {
    throw new Error(`Unknown PROFILE "${profile}". Use one of: ${Object.keys(PROFILES).join(', ')}`);
  }
  return scenarios;
}

export function buildThresholds(profile) {
  const thresholds = {
    // Acceptance criteria: 95 % of requests under 2 s, fewer than 1 % errors.
    http_req_duration: [`p(95)<${P95_MS}`],
    http_req_failed: [`rate<${MAX_ERROR_RATE}`],
    checks: ['rate>0.99'],
  };
  if (profile !== 'login-storm') {
    // The two transactions users feel most: completing a task and starting a case.
    thresholds['tx_duration{tx:complete_task}'] = [`p(95)<${P95_MS * 2}`];
    thresholds['tx_duration{tx:start_process}'] = [`p(95)<${P95_MS * 2}`];
  } else {
    thresholds['tx_duration{tx:login}'] = [`p(95)<${P95_MS}`];
  }
  if (profile === 'stress') {
    // A stress test is supposed to break the system: report, but do not fail the run.
    for (const key of Object.keys(thresholds)) {
      thresholds[key] = thresholds[key].map((t) => ({ threshold: t, abortOnFail: false }));
    }
  }
  return thresholds;
}
