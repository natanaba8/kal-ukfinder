#!/usr/bin/env node
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

/**
 * Serves the built web app the way Vercel will, so routing can be checked
 * before deploying rather than after.
 *
 * Mirrors `vercel.json`: cleanUrls (/jobs -> jobs.html), the dynamic-route
 * rewrites, and +not-found.html as the fallback. If a URL works here it will
 * work on Vercel; if it 404s here, it would have 404d there.
 */

const root = new URL('../apps/mobile/dist/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const port = Number(process.env.PORT ?? 4173);

/** Keep in step with the "rewrites" block in vercel.json. */
const REWRITES = [
  { pattern: /^\/item\/[^/]+\/?$/, destination: 'item/_id.html' },
  { pattern: /^\/job\/[^/]+\/?$/, destination: 'job/_id.html' },
];

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
};

const isFile = async (candidate) => {
  try {
    return (await stat(candidate)).isFile();
  } catch {
    return false;
  }
};

const resolve = async (urlPath) => {
  const clean = decodeURIComponent(urlPath.split('?')[0]);

  for (const rewrite of REWRITES) {
    if (rewrite.pattern.test(clean)) return path.join(root, rewrite.destination);
  }

  const candidates = [
    path.join(root, clean),
    path.join(root, `${clean}.html`), // cleanUrls
    path.join(root, clean, 'index.html'),
    path.join(root, clean === '/' ? 'index.html' : '+not-found.html'),
  ];

  for (const candidate of candidates) {
    if (await isFile(candidate)) return candidate;
  }

  return null;
};

createServer(async (request, response) => {
  const file = await resolve(request.url ?? '/');

  if (!file) {
    response.writeHead(404, { 'content-type': 'text/plain' }).end('404');
    console.log(`404  ${request.url}`);
    return;
  }

  const body = await readFile(file);
  response.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  response.end(body);
  console.log(`200  ${request.url}  ->  ${path.relative(root, file)}`);
}).listen(port, () => {
  console.log(`\nServing apps/mobile/dist on http://localhost:${port}`);
  console.log('Routing matches vercel.json — if it works here, it works on Vercel.\n');
});
