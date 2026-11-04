import { test, expect } from '@playwright/test';
import { parity } from '../parity.config';
import { loadUrls } from '../lib/urls';
import { originsFor, scrub, slugFor, newItems, normaliseUrl } from '../lib/normalise';
import {
  type Health,
  HEALTH_LABELS,
  watchHealth,
  findErrorText,
  settle,
  stripIgnored,
  collectMedia,
  writeHealth,
  readHealth,
} from '../lib/capture';

for (const entry of loadUrls()) {
  const slug = slugFor(entry.path);
  const title = entry.contentType ? `${entry.path} [${entry.contentType}]` : entry.path;

  test(title, async ({ page, baseURL }, testInfo) => {
    if (!baseURL) throw new Error(`Set ${testInfo.project.name === 'baseline' ? 'V13_URL' : 'V17_URL'} in .env`);
    const mode = testInfo.project.name as 'baseline' | 'compare';
    const origins = originsFor(baseURL);
    const watched = watchHealth(page, origins);

    const response = await page.goto(entry.path, { waitUntil: 'load' });
    await settle(page);

    const health: Health = {
      status: response?.status() ?? null,
      finalPath: normaliseUrl(page.url(), page.url(), origins),
      errorText: findErrorText(await page.content()),
      pageErrors: [...watched.pageErrors],
      console: [...watched.console],
      badResponses: [...watched.badResponses],
      failedRequests: [...watched.failedRequests],
    };

    // 1. Health: on v17, fail on anything v13 didn't already do.
    if (mode === 'baseline') {
      writeHealth(slug, health);
    } else {
      const base = readHealth(slug);
      expect.soft(base, 'No v13 baseline for this URL. Re-run `npm run baseline`.').toBeTruthy();
      expect.soft(health.status, 'HTTP status differs from v13').toBe(base?.status ?? 200);
      expect.soft(health.finalPath, 'Redirects somewhere different from v13').toBe(base?.finalPath ?? health.finalPath);
      for (const [key, label] of Object.entries(HEALTH_LABELS) as [keyof typeof HEALTH_LABELS, string][]) {
        expect.soft(newItems(health[key], base?.[key]), `New ${label}`).toEqual([]);
      }
    }

    await stripIgnored(page);

    // 2. Content and structure: headings, text, links, images (alt), lists, forms.
    const aria = scrub(await page.locator('body').ariaSnapshot(), origins);
    expect.soft(aria, 'Content/structure differs from v13').toMatchSnapshot(`${slug}.aria.yml`);

    // 3. Media: every image, crop, srcset, video and embed reference.
    const media = await collectMedia(page, origins);
    expect.soft(media.join('\n'), 'Media references differ from v13').toMatchSnapshot(`${slug}.media.txt`);

    // 4. Optional pixel comparison.
    if (parity.visual) {
      await expect.soft(page).toHaveScreenshot(`${slug}.png`, {
        fullPage: true,
        mask: parity.maskSelectors.map((s) => page.locator(s)),
      });
    }
  });
}
