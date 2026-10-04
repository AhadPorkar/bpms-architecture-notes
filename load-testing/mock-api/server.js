// Mock BPM API for exercising the k6 scripts locally and in CI.
//
// It imitates the *shape* of a typical BPM platform API (login, inbox, work items,
// process start, dashboards, uploads, server-sent events). It is not the API of any
// real product. Latency and error rate are configurable so that thresholds and
// dashboards can be tried out without a real system under test.
//
// Node.js >= 18, no dependencies:  node server.js
//
// Environment variables:
//   PORT              default 8080
//   MOCK_LATENCY_MS   base latency per request in ms (default 30)
//   MOCK_JITTER_MS    random extra latency 0..n ms (default 20)
//   MOCK_ERROR_RATE   share of requests answered with HTTP 503, 0..1 (default 0)
//   TOKEN_TTL_S       access-token lifetime in seconds (default 900)

'use strict';

const http = require('node:http');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 8080);
const BASE_LATENCY = Number(process.env.MOCK_LATENCY_MS || 30);
const JITTER = Number(process.env.MOCK_JITTER_MS || 20);
const ERROR_RATE = Number(process.env.MOCK_ERROR_RATE || 0);
const TOKEN_TTL_S = Number(process.env.TOKEN_TTL_S || 900);

// Relative cost of each operation, so that latency percentiles differ per transaction.
const COST = {
  login: 3,
  inbox: 1,
  workItem: 1,
  complete: 2.5,
  catalog: 0.5,
  start: 2,
  dashboard: 4,
  upload: 2,
  health: 0,
};

const sessions = new Map(); // accessToken -> { user, org, csrf, exp }
let instanceSeq = 100000;
let fileSeq = 500000;

const PROCESSES = [
  { key: 'leave-request', title: 'Leave request', steps: 4 },
  { key: 'purchase-approval', title: 'Purchase approval', steps: 7 },
  { key: 'field-inspection', title: 'Field inspection', steps: 9 },
  { key: 'contract-review', title: 'Contract review', steps: 12 },
  { key: 'citizen-request', title: 'Citizen request', steps: 5 },
];

function delay(kind) {
  const ms = BASE_LATENCY * (COST[kind] ?? 1) + Math.random() * JITTER;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function send(res, status, body, headers = {}) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(payload);
}

function readBody(req, limitBytes = 5 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(Object.assign(new Error('payload too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseJson(buffer) {
  if (!buffer.length) return {};
  try {
    return JSON.parse(buffer.toString('utf8'));
  } catch {
    return null;
  }
}

function authenticate(req) {
  const header = req.headers.authorization || '';
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) return null;
  const session = sessions.get(match[1]);
  if (!session) return null;
  if (session.exp < Date.now()) {
    sessions.delete(match[1]);
    return null;
  }
  return session;
}

function inboxItems(session, page, size) {
  const total = 37; // stable size so paging is predictable
  const start = (page - 1) * size;
  const items = [];
  for (let i = start; i < Math.min(start + size, total); i += 1) {
    const process = PROCESSES[i % PROCESSES.length];
    items.push({
      workItemId: `${session.user}-${i + 1}`,
      title: `${process.title} #${1000 + i}`,
      process: process.key,
      sender: `user${String((i * 7) % 400 + 1).padStart(4, '0')}`,
      receivedAt: new Date(Date.now() - i * 3600_000).toISOString(),
      seen: i % 3 === 0,
    });
  }
  return { page, size, total, items };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const path = url.pathname;
  const method = req.method || 'GET';

  try {
    if (method === 'GET' && path === '/health') {
      return send(res, 200, { status: 'ok', sessions: sessions.size });
    }

    if (ERROR_RATE > 0 && Math.random() < ERROR_RATE && path !== '/api/events') {
      await delay('health');
      return send(res, 503, { error: 'simulated outage' });
    }

    if (method === 'POST' && path === '/api/auth/token') {
      const body = parseJson(await readBody(req));
      await delay('login');
      if (!body || !/^user\d{4}$/.test(body.username || '') || !body.password) {
        return send(res, 401, { error: 'invalid credentials' });
      }
      const accessToken = crypto.randomBytes(24).toString('base64url');
      const csrf = crypto.randomBytes(16).toString('base64url');
      sessions.set(accessToken, {
        user: body.username,
        org: body.organization || 'org-a',
        csrf,
        exp: Date.now() + TOKEN_TTL_S * 1000,
      });
      return send(res, 200, {
        accessToken,
        antiForgeryToken: csrf,
        expiresIn: TOKEN_TTL_S,
        organization: body.organization || 'org-a',
      });
    }

    // Server-sent events: an idle stream with a heartbeat, to model open inbox tabs.
    if (method === 'GET' && path === '/api/events') {
      const session = authenticate(req);
      if (!session) return send(res, 401, { error: 'unauthorized' });
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
      });
      res.write(`event: hello\ndata: {"user":"${session.user}"}\n\n`);
      const timer = setInterval(() => res.write(': heartbeat\n\n'), 15_000);
      req.on('close', () => clearInterval(timer));
      return undefined;
    }

    if (!path.startsWith('/api/')) {
      return send(res, 404, { error: 'not found' });
    }

    const session = authenticate(req);
    if (!session) {
      await delay('health');
      return send(res, 401, { error: 'unauthorized' });
    }

    // State-changing requests must echo the anti-forgery token, like the real thing.
    if (method !== 'GET' && req.headers['x-anti-forgery-token'] !== session.csrf) {
      await delay('health');
      return send(res, 403, { error: 'anti-forgery token missing or invalid' });
    }

    if (method === 'GET' && path === '/api/inbox') {
      const page = Math.max(1, Number(url.searchParams.get('page') || 1));
      const size = Math.min(100, Math.max(1, Number(url.searchParams.get('size') || 20)));
      await delay('inbox');
      return send(res, 200, inboxItems(session, page, size));
    }

    let m = /^\/api\/work-items\/([\w-]+)$/.exec(path);
    if (method === 'GET' && m) {
      await delay('workItem');
      return send(res, 200, {
        workItemId: m[1],
        form: {
          fields: [
            { name: 'amount', type: 'decimal', required: true },
            { name: 'reason', type: 'text', required: true },
            { name: 'attachment', type: 'file', required: false },
          ],
        },
        actions: ['approve', 'reject', 'return'],
      });
    }

    m = /^\/api\/work-items\/([\w-]+)\/complete$/.exec(path);
    if (method === 'POST' && m) {
      const body = parseJson(await readBody(req));
      await delay('complete');
      if (!body || !['approve', 'reject', 'return'].includes(body.action)) {
        return send(res, 422, { error: 'unknown action' });
      }
      return send(res, 200, {
        workItemId: m[1],
        status: 'completed',
        next: body.action === 'reject' ? null : { step: 'Manager review', assignees: 1 },
      });
    }

    if (method === 'GET' && path === '/api/processes') {
      await delay('catalog');
      return send(res, 200, PROCESSES.map(({ key, title }) => ({ key, title })));
    }

    m = /^\/api\/processes\/([\w-]+)\/instances$/.exec(path);
    if (method === 'POST' && m) {
      const process = PROCESSES.find((p) => p.key === m[1]);
      await readBody(req);
      await delay('start');
      if (!process) return send(res, 404, { error: 'unknown process' });
      instanceSeq += 1;
      return send(res, 201, {
        instanceId: instanceSeq,
        process: process.key,
        firstWorkItemId: `${session.user}-${instanceSeq}`,
      });
    }

    m = /^\/api\/dashboards\/([\w-]+)$/.exec(path);
    if (method === 'GET' && m) {
      await delay('dashboard');
      const series = Array.from({ length: 30 }, (_, i) => ({
        day: i + 1,
        started: Math.round(50 + 40 * Math.sin(i / 4)),
        finished: Math.round(45 + 35 * Math.sin(i / 4 + 0.6)),
      }));
      return send(res, 200, { dashboardId: m[1], widgets: 10, series });
    }

    if (method === 'POST' && path === '/api/files') {
      const body = await readBody(req);
      await delay('upload');
      fileSeq += 1;
      return send(res, 201, { fileId: fileSeq, bytes: body.length });
    }

    return send(res, 404, { error: 'not found' });
  } catch (err) {
    return send(res, err.status || 500, { error: err.message || 'internal error' });
  }
});

server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`mock BPM API listening on http://localhost:${PORT}`);
});

// Housekeeping: drop expired sessions once a minute.
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (session.exp < now) sessions.delete(token);
  }
}, 60_000).unref();
