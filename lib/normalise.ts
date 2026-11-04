import { createHash } from 'node:crypto';
import { parity } from '../parity.config';

/** Every origin that means "this site", longest first so replacements don't clip each other. */
export function originsFor(baseURL: string): string[] {
  const u = new URL(baseURL);
  const host = u.host.replace(/^www\./, '');
  const set = new Set<string>([u.origin]);
  for (const proto of ['http:', 'https:']) for (const h of [host, `www.${host}`]) set.add(`${proto}//${h}`);
  for (const o of parity.originAliases) set.add(o.replace(/\/$/, ''));
  return [...set].sort((a, b) => b.length - a.length);
}

/** Make text comparable across hosts: swap origins for {origin} and apply scrub patterns. */
export function scrub(text: string, origins: string[]): string {
  let out = text;
  for (const o of origins) out = out.split(o).join('{origin}');
  for (const o of origins) out = out.split(o.replace(/^https?:/, '')).join('{origin}');
  for (const [re, rep] of parity.scrubPatterns) out = out.replace(re, rep);
  return out;
}

/** Same-origin URLs become paths; query strings keep only the keys that change the output. */
export function normaliseUrl(raw: string, pageUrl: string, origins: string[]): string {
  if (raw.startsWith('data:')) return 'data:';
  let u: URL;
  try {
    u = new URL(raw, pageUrl);
  } catch {
    return raw;
  }
  const kept = [...u.searchParams.entries()]
    .filter(([k]) => parity.mediaQueryKeys.includes(k.toLowerCase()))
    .map(([k, v]) => [k.toLowerCase(), v] as [string, string])
    .sort(([a], [b]) => a.localeCompare(b));
  const qs = new URLSearchParams(kept).toString();
  const prefix = origins.includes(u.origin) ? '' : u.origin;
  return `${prefix}${u.pathname}${qs ? `?${qs}` : ''}`;
}

export function slugFor(path: string): string {
  const readable =
    path
      .replace(/^\/+|\/+$/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || 'home';
  const hash = createHash('sha1').update(path).digest('hex').slice(0, 8);
  return `${readable}--${hash}`;
}

/** Items in `current` beyond what `baseline` already had (multiset difference), de-duplicated. */
export function newItems(current: string[], baseline: string[] = []): string[] {
  const remaining = new Map<string, number>();
  for (const b of baseline) remaining.set(b, (remaining.get(b) ?? 0) + 1);
  const fresh: string[] = [];
  for (const c of current) {
    const n = remaining.get(c) ?? 0;
    if (n > 0) remaining.set(c, n - 1);
    else fresh.push(c);
  }
  return [...new Set(fresh)];
}
