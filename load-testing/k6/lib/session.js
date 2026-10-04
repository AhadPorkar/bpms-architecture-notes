// One authenticated session per virtual user, kept between iterations like a real browser tab.

import http from 'k6/http';
import { check, fail } from 'k6';
import { BASE_URL } from './config.js';
import { txDuration, txFailed } from './metrics.js';

let current = null; // module scope = one copy per VU

export function login(user) {
  const started = Date.now();
  const res = http.post(
    `${BASE_URL}/api/auth/token`,
    JSON.stringify({ username: user.username, password: user.password, organization: user.organization }),
    { headers: { 'Content-Type': 'application/json' }, tags: { name: 'POST /api/auth/token', tx: 'login' } },
  );
  const ok = check(res, {
    'login: status 200': (r) => r.status === 200,
    'login: token present': (r) => Boolean(r.json('accessToken')),
  });
  txDuration.add(Date.now() - started, { tx: 'login' });
  txFailed.add(!ok, { tx: 'login' });
  if (!ok) {
    current = null;
    return null;
  }
  const body = res.json();
  current = {
    user,
    token: body.accessToken,
    csrf: body.antiForgeryToken,
    // Renew 30 s before expiry so that no request is sent with an expired token.
    renewAt: Date.now() + (Number(body.expiresIn) - 30) * 1000,
  };
  return current;
}

export function ensureSession(user) {
  if (!current || Date.now() >= current.renewAt) {
    login(user);
  }
  if (!current) fail(`could not log in as ${user.username}`);
  return current;
}

function params(session, name, tx, extraHeaders = {}) {
  return {
    headers: {
      Authorization: `Bearer ${session.token}`,
      'X-Anti-Forgery-Token': session.csrf,
      ...extraHeaders,
    },
    tags: { name, tx, org: session.user.organization },
  };
}

/** Sends a request; on 401 logs in again once and repeats it. */
export function request(session, method, path, body, { name, tx, headers } = {}) {
  const url = `${BASE_URL}${path}`;
  const send = (s) => http.request(method, url, body, params(s, name || `${method} ${path}`, tx, headers));
  let res = send(session);
  if (res.status === 401) {
    const renewed = login(session.user);
    if (renewed) res = send(renewed);
  }
  return res;
}
