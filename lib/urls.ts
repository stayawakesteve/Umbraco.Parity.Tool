import fs from 'node:fs';
import path from 'node:path';

export type UrlEntry = { path: string; contentType?: string; source: string };

export const URLS_FILE = path.join(__dirname, '..', 'data', 'urls.json');

/** Loads the inventory, applying URL_FILTER and PER_TYPE_LIMIT. Deterministic, so baseline and compare see the same list. */
export function loadUrls(): UrlEntry[] {
  if (!fs.existsSync(URLS_FILE)) {
    throw new Error('data/urls.json not found. Run `npm run inventory` first.');
  }
  let urls: UrlEntry[] = JSON.parse(fs.readFileSync(URLS_FILE, 'utf8'));

  const filter = process.env.URL_FILTER;
  if (filter) {
    const re = new RegExp(filter, 'i');
    urls = urls.filter((u) => re.test(u.path) || re.test(u.contentType ?? ''));
  }

  const limit = Number(process.env.PER_TYPE_LIMIT ?? 0);
  if (limit > 0) {
    const seen = new Map<string, number>();
    urls = urls.filter((u) => {
      const key = u.contentType ?? '(unknown)';
      const n = (seen.get(key) ?? 0) + 1;
      seen.set(key, n);
      return n <= limit;
    });
  }
  return urls;
}
