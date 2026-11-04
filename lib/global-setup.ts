import fs from 'node:fs';

/** Records the run start so `npm run logs` only reports errors raised during this crawl. */
export default async function globalSetup() {
  fs.mkdirSync('.parity', { recursive: true });
  fs.writeFileSync('.parity/last-run-started', new Date().toISOString());
}
