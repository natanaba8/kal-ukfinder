#!/usr/bin/env node
import { cp, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

/**
 * Post-processes the Expo web export for static hosting.
 *
 * expo-router writes dynamic routes to files with the parameter in brackets —
 * `item/[id].html`. Square brackets are reserved characters in a URL, so a host
 * rewrite pointing at that filename is fragile. This copies each one to a
 * bracket-free twin (`item/_id.html`) that `vercel.json` can safely target,
 * leaving the original in place so nothing else breaks.
 *
 * Run automatically by `npm run build:web`.
 */

const dist = new URL('../apps/mobile/dist/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const walk = async (dir) => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else files.push(full);
  }

  return files;
};

let copied = 0;

try {
  const files = await walk(dist);

  for (const file of files) {
    const base = path.basename(file);
    const match = /^\[(\.\.\.)?([^\]]+)\]\.html$/.exec(base);
    if (!match) continue;

    const twin = path.join(path.dirname(file), `_${match[2]}.html`);
    await cp(file, twin);
    copied += 1;
    console.log(`  ${path.relative(dist, file)}  ->  ${path.relative(dist, twin)}`);
  }

  if (copied === 0) {
    console.log('  no dynamic routes found — nothing to prepare');
  } else {
    console.log(`\n${copied} dynamic route(s) given a URL-safe filename for static hosting.`);
  }
} catch (error) {
  console.error(`prepare-web failed: ${error.message}`);
  console.error('Run `npm run build:web` first so apps/mobile/dist exists.');
  process.exit(1);
}
