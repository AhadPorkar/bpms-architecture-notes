// Run-time configuration, read once per VU from environment variables (k6 -e NAME=value).

const num = (name, fallback) => {
  const raw = __ENV[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (Number.isNaN(value)) throw new Error(`${name} must be a number, got "${raw}"`);
  return value;
};

/** Base URL of the system under test, without a trailing slash. */
export const BASE_URL = (__ENV.BASE_URL || 'http://localhost:8080').replace(/\/+$/, '');

/** Which load profile to run: smoke, load, stress, spike, soak, login-storm, throughput. */
export const PROFILE = __ENV.PROFILE || 'smoke';

/** Multiplies every user and rate target. Use e.g. SCALE=0.02 to rehearse a profile on a laptop. */
export const SCALE = num('SCALE', 1);

/** Multiplies every duration. Use e.g. DURATION_FACTOR=0.05 to compress a profile for a dry run. */
export const DURATION_FACTOR = num('DURATION_FACTOR', 1);

/** Think time between user actions, uniformly distributed, in seconds. Mean 9 s by default. */
export const THINK_MIN_S = num('THINK_MIN_S', 5);
export const THINK_MAX_S = num('THINK_MAX_S', 13);

/** Acceptance criteria. */
export const P95_MS = num('P95_MS', 2000);
export const MAX_ERROR_RATE = num('MAX_ERROR_RATE', 0.01);

/** Soak duration in minutes (default 48 h). */
export const SOAK_MINUTES = num('SOAK_MINUTES', 48 * 60);

/** Size of the uploaded attachment in KiB. */
export const UPLOAD_KIB = num('UPLOAD_KIB', 200);

export function thinkTime() {
  return THINK_MIN_S + Math.random() * Math.max(0, THINK_MAX_S - THINK_MIN_S);
}
