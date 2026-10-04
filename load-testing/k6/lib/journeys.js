// User journeys and their mix. The weights come from what users actually do in a BPM
// system: most clicks are inbox reads, then task completions, then new cases.
// Replace them with the mix measured in your own access logs before a real test.

import { check, group } from 'k6';
import http from 'k6/http';
import { request } from './session.js';
import { txDuration, txFailed } from './metrics.js';
import { UPLOAD_KIB } from './config.js';

const PROCESSES = ['leave-request', 'purchase-approval', 'field-inspection', 'contract-review', 'citizen-request'];
const ACTIONS = ['approve', 'approve', 'approve', 'reject', 'return']; // mostly approvals

const json = { 'Content-Type': 'application/json' };
const pick = (items) => items[Math.floor(Math.random() * items.length)];

function measure(tx, fn) {
  const started = Date.now();
  let ok = false;
  group(tx, () => {
    ok = fn();
  });
  txDuration.add(Date.now() - started, { tx });
  txFailed.add(!ok, { tx });
  return ok;
}

/** Open the inbox and page through it, as people do after every login and every completed task. */
export function browseInbox(session) {
  return measure('browse_inbox', () => {
    const first = request(session, 'GET', '/api/inbox?page=1&size=20', null, { name: 'GET /api/inbox', tx: 'browse_inbox' });
    const ok = check(first, { 'inbox: 200': (r) => r.status === 200 });
    if (ok && Math.random() < 0.3) {
      const second = request(session, 'GET', '/api/inbox?page=2&size=20', null, { name: 'GET /api/inbox', tx: 'browse_inbox' });
      return check(second, { 'inbox page 2: 200': (r) => r.status === 200 });
    }
    return ok;
  });
}

/** Open a work item, read its form, and act on it. This is the click users judge the system by. */
export function completeTask(session) {
  return measure('complete_task', () => {
    const inbox = request(session, 'GET', '/api/inbox?page=1&size=20', null, { name: 'GET /api/inbox', tx: 'complete_task' });
    if (!check(inbox, { 'inbox: 200': (r) => r.status === 200 })) return false;
    const items = inbox.json('items') || [];
    if (items.length === 0) return true; // nothing to do is a valid outcome
    const id = pick(items).workItemId;

    const item = request(session, 'GET', `/api/work-items/${id}`, null, { name: 'GET /api/work-items/{id}', tx: 'complete_task' });
    if (!check(item, { 'work item: 200': (r) => r.status === 200 })) return false;

    const body = JSON.stringify({ action: pick(ACTIONS), comment: 'load test', data: { amount: 1250, reason: 'k6' } });
    const done = request(session, 'POST', `/api/work-items/${id}/complete`, body, {
      name: 'POST /api/work-items/{id}/complete',
      tx: 'complete_task',
      headers: json,
    });
    return check(done, { 'complete: 200': (r) => r.status === 200 });
  });
}

/** Start a new case from the process catalog. */
export function startProcess(session) {
  return measure('start_process', () => {
    const catalog = request(session, 'GET', '/api/processes', null, { name: 'GET /api/processes', tx: 'start_process' });
    if (!check(catalog, { 'catalog: 200': (r) => r.status === 200 })) return false;
    const key = pick(PROCESSES);
    const body = JSON.stringify({ data: { subject: 'k6', amount: Math.round(Math.random() * 10000) } });
    const started = request(session, 'POST', `/api/processes/${key}/instances`, body, {
      name: 'POST /api/processes/{key}/instances',
      tx: 'start_process',
      headers: json,
    });
    return check(started, { 'start: 201': (r) => r.status === 201 });
  });
}

/** A management dashboard: few users, heavy queries. */
export function viewDashboard(session) {
  return measure('view_dashboard', () => {
    const res = request(session, 'GET', '/api/dashboards/process-overview', null, { name: 'GET /api/dashboards/{id}', tx: 'view_dashboard' });
    return check(res, { 'dashboard: 200': (r) => r.status === 200 });
  });
}

/** Attach a document to a case. */
export function uploadAttachment(session) {
  return measure('upload_attachment', () => {
    // Built per request and then garbage-collected: a payload kept in every VU would cost
    // gigabytes of generator memory at 5,000 VUs.
    const form = { file: http.file('x'.repeat(UPLOAD_KIB * 1024), 'scan.pdf', 'application/pdf') };
    const res = request(session, 'POST', '/api/files', form, { name: 'POST /api/files', tx: 'upload_attachment' });
    return check(res, { 'upload: 201': (r) => r.status === 201 });
  });
}

const MIX = [
  [45, browseInbox],
  [25, completeTask],
  [15, startProcess],
  [10, viewDashboard],
  [5, uploadAttachment],
];
const TOTAL = MIX.reduce((sum, [weight]) => sum + weight, 0);

/** Picks one journey according to the weights above. */
export function pickJourney() {
  let r = Math.random() * TOTAL;
  for (const [weight, journey] of MIX) {
    r -= weight;
    if (r < 0) return journey;
  }
  return MIX[0][1];
}
