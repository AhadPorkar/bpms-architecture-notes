#!/usr/bin/env node
// Generates synthetic test users for the k6 scripts.
//
//   node load-testing/scripts/generate-users.mjs 5000 4 > load-testing/k6/data/users.csv
//
// Arguments: number of users (default 400), number of organizations (default 4).
// The same accounts must exist in the system under test; create them with the
// platform's own user import, never by copying production accounts.

const count = Number(process.argv[2] || 400);
const orgs = Number(process.argv[3] || 4);
const lines = ['username,password,organization'];
for (let i = 1; i <= count; i += 1) {
  const org = `org-${String.fromCharCode(97 + ((i - 1) % orgs))}`;
  lines.push(`user${String(i).padStart(4, '0')},load-test-only,${org}`);
}
process.stdout.write(`${lines.join('\n')}\n`);
