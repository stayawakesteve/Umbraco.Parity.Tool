import './lib/env';
import { defineConfig, devices } from '@playwright/test';

const visual = process.env.VISUAL === '1';
const { HTTP_USERNAME, HTTP_PASSWORD } = process.env;

export default defineConfig({
  testDir: './tests',
  // One shared baseline: the v13 run writes it, the v17 run compares against it.
  snapshotPathTemplate: '{testDir}/../baseline/snapshots/{arg}{ext}',
  globalSetup: './lib/global-setup.ts',
  fullyParallel: true,
  workers: Number(process.env.WORKERS ?? 4),
  retries: 1,
  timeout: visual ? 120_000 : 60_000,
  // Missing baseline = failure in compare. `npm run baseline` overrides this with --update-snapshots=all.
  updateSnapshots: 'none',
  reporter: [['dot'], ['html', { open: 'never' }], ['json', { outputFile: 'test-results/results.json' }]],
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: Number(process.env.MAX_DIFF_RATIO ?? 0.01), animations: 'disabled' },
  },
  use: {
    ...devices['Desktop Chrome'],
    ignoreHTTPSErrors: true,
    trace: 'off',
    screenshot: 'only-on-failure',
    httpCredentials: HTTP_USERNAME ? { username: HTTP_USERNAME, password: HTTP_PASSWORD ?? '' } : undefined,
  },
  projects: [
    { name: 'baseline', use: { baseURL: process.env.V13_URL } },
    { name: 'compare', use: { baseURL: process.env.V17_URL } },
  ],
});
