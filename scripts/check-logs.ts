/**
 * Reports Error/Fatal entries from the v17 Umbraco log since the last Playwright run started.
 * Needs an API user (Users > API Users) with access to the Settings section.
 *
 * The log endpoint path and query parameters follow the Management API's log-viewer
 * resource. If this returns 404/400, check /umbraco/swagger on the site and adjust LOGS_PATH.
 */
import fs from 'node:fs';
import { basicAuthHeader } from '../lib/env';

const LOGS_PATH = '/umbraco/management/api/v1/log-viewer/log';

type LogItem = { timestamp: string; level: string; messageTemplate?: string; renderedMessage?: string; exception?: string };

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Set ${name} in .env`);
  return v;
}

async function main() {
  const base = need('V17_URL').replace(/\/$/, '');
  const since =
    process.env.LOG_SINCE ||
    (fs.existsSync('.parity/last-run-started') ? fs.readFileSync('.parity/last-run-started', 'utf8').trim() : '');
  if (!since) throw new Error('No start time: run `npm run compare` first, or set LOG_SINCE (ISO date).');

  const tokenRes = await fetch(`${base}/umbraco/management/api/v1/security/back-office/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...basicAuthHeader() },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: need('UMBRACO_CLIENT_ID'),
      client_secret: need('UMBRACO_CLIENT_SECRET'),
    }),
  });
  if (!tokenRes.ok) throw new Error(`Token request failed: ${tokenRes.status} ${await tokenRes.text()}`);
  const { access_token } = (await tokenRes.json()) as { access_token: string };

  const items: LogItem[] = [];
  const take = 100;
  for (let skip = 0; skip < 5_000; skip += take) {
    const q = new URLSearchParams({ skip: String(skip), take: String(take), orderDirection: 'Descending', startDate: since });
    q.append('logLevel', 'Error');
    q.append('logLevel', 'Fatal');
    // Bearer token goes in Authorization, so basic auth can't ride along on this request.
    const res = await fetch(`${base}${LOGS_PATH}?${q}`, { headers: { Authorization: `Bearer ${access_token}` } });
    if (!res.ok) throw new Error(`Log request failed: ${res.status}. Check LOGS_PATH against /umbraco/swagger.`);
    const page = (await res.json()) as { total: number; items: LogItem[] };
    items.push(...page.items);
    if (skip + take >= page.total) break;
  }

  if (!items.length) {
    console.log(`No Error/Fatal log entries since ${since}.`);
    return;
  }

  const groups = new Map<string, { count: number; sample: LogItem }>();
  for (const item of items) {
    const k = item.messageTemplate ?? item.renderedMessage ?? '(no message)';
    const g = groups.get(k);
    if (g) g.count++;
    else groups.set(k, { count: 1, sample: item });
  }

  console.log(`${items.length} Error/Fatal entries since ${since}, ${groups.size} distinct:\n`);
  for (const [, { count, sample }] of [...groups].sort((a, b) => b[1].count - a[1].count)) {
    console.log(`${String(count).padStart(5)}×  [${sample.level}] ${sample.renderedMessage ?? sample.messageTemplate}`);
    const firstLine = sample.exception?.split('\n')[0];
    if (firstLine) console.log(`        ${firstLine}`);
  }
  process.exit(1);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
