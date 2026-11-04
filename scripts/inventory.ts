/**
 * Builds data/urls.json: every published page to crawl.
 * Sources (merged, de-duplicated): sitemap.xml, the Delivery API, data/urls.extra.txt.
 */
import fs from 'node:fs';
import path from 'node:path';
import { basicAuthHeader } from '../lib/env';
import { parity } from '../parity.config';
import { URLS_FILE, type UrlEntry } from '../lib/urls';

const base = (process.env.INVENTORY_URL || process.env.V17_URL || '').replace(/\/$/, '');
const auth = basicAuthHeader();

const found = new Map<string, UrlEntry>();
const key = (p: string) => p.replace(/\/$/, '').toLowerCase() || '/';

function add(rawPath: string, source: string, contentType?: string) {
  const p = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  if (parity.excludePaths.some((re) => re.test(p))) return;
  const existing = found.get(key(p));
  if (existing) {
    existing.contentType ??= contentType;
    if (!existing.source.split('+').includes(source)) existing.source += `+${source}`;
  } else {
    found.set(key(p), { path: p, contentType, source });
  }
}

async function get(url: string, headers: Record<string, string> = {}) {
  return fetch(url, { headers: { ...auth, ...headers } });
}

async function fromSitemap(url: string, depth = 0): Promise<number> {
  const res = await get(url);
  if (!res.ok) {
    console.warn(`  sitemap ${url} → ${res.status}, skipped`);
    return 0;
  }
  const xml = await res.text();
  const locs = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, '&'));
  if (/<sitemapindex/i.test(xml) && depth < 2) {
    let n = 0;
    for (const loc of locs) n += await fromSitemap(loc, depth + 1);
    return n;
  }
  const host = new URL(base).host.replace(/^www\./, '');
  let n = 0;
  for (const loc of locs) {
    const u = new URL(loc, base);
    if (u.host.replace(/^www\./, '') !== host) continue;
    add(u.pathname + u.search, 'sitemap');
    n++;
  }
  return n;
}

async function fromDeliveryApi(): Promise<number> {
  const headers: Record<string, string> = {};
  if (process.env.DELIVERY_API_KEY) headers['Api-Key'] = process.env.DELIVERY_API_KEY;
  if (process.env.DELIVERY_START_ITEM) headers['Start-Item'] = process.env.DELIVERY_START_ITEM;
  const cultures = (process.env.DELIVERY_CULTURES || '').split(',').map((c) => c.trim()).filter(Boolean);

  let n = 0;
  for (const culture of cultures.length ? cultures : [undefined]) {
    const h = culture ? { ...headers, 'Accept-Language': culture } : headers;
    const take = 100;
    for (let skip = 0; ; skip += take) {
      const res = await get(`${base}/umbraco/delivery/api/v2/content?skip=${skip}&take=${take}`, h);
      if (!res.ok) {
        console.warn(`  Delivery API → ${res.status}. Is it enabled, and does it need DELIVERY_API_KEY? Skipped.`);
        return n;
      }
      const body = (await res.json()) as { total: number; items: { contentType: string; route: { path: string } }[] };
      for (const item of body.items) {
        add(item.route.path, 'delivery', item.contentType);
        n++;
      }
      if (skip + take >= body.total) break;
    }
  }
  return n;
}

function fromExtraFile(): number {
  const file = path.join(path.dirname(URLS_FILE), 'urls.extra.txt');
  if (!fs.existsSync(file)) return 0;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  lines.forEach((l) => add(l, 'extra'));
  return lines.length;
}

async function main() {
  if (!base) throw new Error('Set V17_URL (or INVENTORY_URL) in .env');
  console.log(`Inventory from ${base}`);

  console.log(`  sitemap: ${await fromSitemap(base + (process.env.SITEMAP_PATH || '/sitemap.xml'))}`);
  if (process.env.DELIVERY_API !== '0') console.log(`  delivery api: ${await fromDeliveryApi()}`);
  console.log(`  extra file: ${fromExtraFile()}`);

  const urls = [...found.values()].sort((a, b) => a.path.localeCompare(b.path));
  if (!urls.length) throw new Error('No URLs found. Check SITEMAP_PATH / DELIVERY_API settings, or add data/urls.extra.txt.');

  fs.mkdirSync(path.dirname(URLS_FILE), { recursive: true });
  fs.writeFileSync(URLS_FILE, JSON.stringify(urls, null, 2));

  const byType = new Map<string, number>();
  urls.forEach((u) => byType.set(u.contentType ?? '(unknown)', (byType.get(u.contentType ?? '(unknown)') ?? 0) + 1));
  console.log(`\n${urls.length} URLs → data/urls.json`);
  [...byType].sort((a, b) => b[1] - a[1]).forEach(([t, c]) => console.log(`  ${String(c).padStart(5)}  ${t}`));

  const onlySitemap = urls.filter((u) => u.source === 'sitemap').length;
  const onlyDelivery = urls.filter((u) => u.source === 'delivery').length;
  const usedBoth = urls.some((u) => u.source.includes('delivery')) && urls.some((u) => u.source.includes('sitemap'));
  if (usedBoth && (onlySitemap || onlyDelivery)) {
    console.log(`\nOnly in sitemap: ${onlySitemap}. Only in Delivery API: ${onlyDelivery}. Worth a look: these often point at sitemap or routing differences.`);
  }
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
