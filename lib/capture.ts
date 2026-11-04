import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { parity } from '../parity.config';
import { normaliseUrl, scrub } from './normalise';

export type Health = {
  status: number | null;
  finalPath: string;
  errorText: string[];
  pageErrors: string[];
  console: string[];
  badResponses: string[];
  failedRequests: string[];
};

export const HEALTH_LABELS: Record<Exclude<keyof Health, 'status' | 'finalPath'>, string> = {
  errorText: 'error text in HTML',
  pageErrors: 'uncaught JS errors',
  console: 'console errors',
  badResponses: 'HTTP 4xx/5xx sub-requests',
  failedRequests: 'failed sub-requests',
};

const HEALTH_DIR = path.join(__dirname, '..', 'baseline', 'health');
const ignored = (url: string) => parity.ignoreRequestPatterns.some((re) => re.test(url));

/** Attach listeners before navigation. Returns live arrays that fill as the page loads. */
export function watchHealth(page: Page, origins: string[]) {
  const h = { pageErrors: [] as string[], console: [] as string[], badResponses: [] as string[], failedRequests: [] as string[] };

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    // 404s etc. are already captured with their URL in badResponses
    if (text.startsWith('Failed to load resource')) return;
    if (ignored(msg.location().url ?? '')) return;
    h.console.push(scrub(text, origins));
  });
  page.on('pageerror', (err) => h.pageErrors.push(scrub(err.message, origins)));
  page.on('response', (res) => {
    if (res.status() >= 400 && !ignored(res.url())) {
      h.badResponses.push(`${res.status()} ${normaliseUrl(res.url(), res.url(), origins)}`);
    }
  });
  page.on('requestfailed', (req) => {
    const err = req.failure()?.errorText ?? 'failed';
    if (err.includes('ERR_ABORTED') || ignored(req.url())) return;
    h.failedRequests.push(`${err} ${normaliseUrl(req.url(), req.url(), origins)}`);
  });
  return h;
}

export function findErrorText(html: string): string[] {
  return parity.errorPatterns.flatMap((re) => {
    const m = html.match(re);
    return m ? [`${re.source} → ${m[0].slice(0, 120)}`] : [];
  });
}

/** Dismiss consent, scroll to trigger lazy content, then wait for the network to settle. */
export async function settle(page: Page) {
  if (parity.consentSelector) {
    await page.locator(parity.consentSelector).first().click({ timeout: 2_000 }).catch(() => {});
  }
  await page.evaluate(async () => {
    const step = Math.max(window.innerHeight, 400);
    for (let y = 0; y < document.body.scrollHeight && y < 60_000; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 80));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
}

export async function stripIgnored(page: Page) {
  if (!parity.ignoreSelectors.length) return;
  await page.evaluate((sel) => document.querySelectorAll(sel).forEach((el) => el.remove()), parity.ignoreSelectors.join(','));
}

/** Every media reference on the page: img/srcset/picture/video/iframe/background-image, including lazy-load data-* attributes. */
export async function collectMedia(page: Page, origins: string[]): Promise<string[]> {
  const raw = await page.evaluate(() => {
    const out: string[] = [];
    const push = (kind: string, v: string | null) => {
      if (v && v.trim()) out.push(`${kind}\t${v.trim()}`);
    };
    const pushSrcset = (kind: string, v: string | null) =>
      v?.split(/,\s+/).forEach((c) => push(kind, c.trim().split(/\s+/)[0]));

    document.querySelectorAll('img').forEach((el) => {
      push('img', el.getAttribute('src'));
      push('img', el.getAttribute('data-src'));
      pushSrcset('img', el.getAttribute('srcset'));
      pushSrcset('img', el.getAttribute('data-srcset'));
    });
    document.querySelectorAll('picture source').forEach((el) => {
      pushSrcset('source', el.getAttribute('srcset'));
      pushSrcset('source', el.getAttribute('data-srcset'));
    });
    document.querySelectorAll('video, video source, audio, audio source').forEach((el) => push('av', el.getAttribute('src')));
    document.querySelectorAll('iframe').forEach((el) => push('iframe', el.getAttribute('src') ?? el.getAttribute('data-src')));
    document.querySelectorAll<HTMLElement>('[style*="background"]').forEach((el) => {
      for (const m of el.style.backgroundImage.matchAll(/url\(["']?([^"')]+)["']?\)/g)) push('bg', m[1]);
    });
    return out;
  });

  const pageUrl = page.url();
  const normalised = raw.map((line) => {
    const [kind, url] = line.split('\t');
    return `${kind} ${normaliseUrl(url, pageUrl, origins)}`;
  });
  return [...new Set(normalised)].sort();
}

export function writeHealth(slug: string, health: Health) {
  fs.mkdirSync(HEALTH_DIR, { recursive: true });
  fs.writeFileSync(path.join(HEALTH_DIR, `${slug}.json`), JSON.stringify(health, null, 2));
}

export function readHealth(slug: string): Health | undefined {
  const file = path.join(HEALTH_DIR, `${slug}.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : undefined;
}
