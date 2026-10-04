// Load tests for a BPM-style web application.
//
//   k6 run -e BASE_URL=http://localhost:8080 -e PROFILE=smoke load-testing/k6/main.js
//
// Profiles are defined in lib/profiles.js, settings in lib/config.js.
// See docs/en/04-load-testing.md for the method behind them.

import http from 'k6/http';
import { sleep } from 'k6';
import { SharedArray } from 'k6/data';
import exec from 'k6/execution';
import { BASE_URL, PROFILE, thinkTime } from './lib/config.js';
import { buildScenarios, buildThresholds } from './lib/profiles.js';
import { ensureSession, login } from './lib/session.js';
import { pickJourney } from './lib/journeys.js';

// Test users: username,password,organization. Use at least as many users as VUs in a real test,
// so that no two virtual users share a session.
const USERS = new SharedArray('users', () =>
  open('./data/users.csv')
    .split(/\r?\n/)
    .slice(1)
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const [username, password, organization] = line.split(',').map((s) => s.trim());
      return { username, password, organization };
    }),
);

export const options = {
  scenarios: buildScenarios(PROFILE),
  thresholds: buildThresholds(PROFILE),
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  userAgent: 'bpms-architecture-notes-k6/1.0',
  // Any status >= 400 counts towards http_req_failed. A 401 caused by an expired token
  // is retried once in lib/session.js, after logging in again.
  setupTimeout: '60s',
};

function userForThisVu() {
  const vu = exec.vu.idInTest; // 1..N, unique across a distributed run
  return USERS[(vu - 1) % USERS.length];
}

export function setup() {
  const res = http.get(`${BASE_URL}/health`, { tags: { name: 'GET /health' } });
  if (res.status !== 200) {
    throw new Error(`System under test is not healthy at ${BASE_URL} (status ${res.status})`);
  }
  return { startedAt: new Date().toISOString(), profile: PROFILE, users: USERS.length };
}

/** Closed model: a user who logs in once, then works with think time between clicks. */
export function userJourney() {
  const session = ensureSession(userForThisVu());
  pickJourney()(session);
  sleep(thinkTime());
}

/** Open model: one business transaction per iteration, arrival rate set by the scenario. */
export function singleTransaction() {
  const session = ensureSession(userForThisVu());
  pickJourney()(session);
}

/** Login storm: every VU logs in exactly once. */
export function loginOnly() {
  login(userForThisVu());
}

export default userJourney;
