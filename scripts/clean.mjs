#!/usr/bin/env node
import { rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

/**
 * Clears every build cache. Run this when a fix does not seem to take effect.
 *
 * Metro keys its transform cache on the babel config, so after `babel.config.js`
 * or `metro.config.js` changes it will happily keep serving the *old* bundle —
 * which looks exactly like "I fixed it and nothing changed".
 */
const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const TARGETS = [
  path.join(root, 'apps/mobile/.expo'),
  path.join(root, 'apps/mobile/dist'),
  path.join(root, 'apps/mobile/node_modules/.cache'),
  path.join(root, 'apps/admin/dist'),
  path.join(root, 'apps/admin/node_modules/.vite'),
  // Metro and Haste write here on every platform.
  ...['metro-cache', 'haste-map-metro', 'react-native-packager-cache'].map((name) =>
    path.join(os.tmpdir(), name),
  ),
];

let removed = 0;

for (const target of TARGETS) {
  try {
    await rm(target, { recursive: true, force: true, maxRetries: 2 });
    console.log(`  cleared  ${path.relative(root, target) || target}`);
    removed += 1;
  } catch (error) {
    console.log(`  skipped  ${target} (${error.code ?? error.message})`);
  }
}

console.log(`\n${removed} cache location(s) cleared. Next start will rebuild from scratch.`);
console.log('Tip: `npm run dev:clean` also passes --clear to Metro.\n');
