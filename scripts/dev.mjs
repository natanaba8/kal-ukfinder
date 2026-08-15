#!/usr/bin/env node
import { spawn } from 'node:child_process';
import os from 'node:os';
import process from 'node:process';

/**
 * Runs the whole platform with one command.
 *
 *   npm run dev              API + admin panel + Expo (pick a target in Expo's menu)
 *   npm run dev:web          …with the app opened in a browser
 *   npm run dev:android      …opened on a connected device or emulator
 *   npm run dev:clean        …with the Metro cache cleared first
 *   node scripts/dev.mjs api API + admin panel only
 *
 * Output from every service is interleaved with a coloured prefix. Ctrl+C stops
 * all of them and leaves the terminal in a usable state.
 */

const argv = process.argv.slice(2);
const clear = argv.includes('--clear') || argv.includes('-c');
const requested = (argv.find((arg) => !arg.startsWith('-')) ?? 'start').toLowerCase();

// "app" is a friendlier alias for Expo's default interactive start.
const target = requested === 'app' ? 'start' : requested;
const VALID_TARGETS = ['start', 'web', 'android', 'ios', 'api'];

if (!VALID_TARGETS.includes(target)) {
  console.error(`Unknown target "${requested}". Use one of: ${VALID_TARGETS.join(', ')} (start is the default).`);
  process.exit(1);
}

const colour = (code) => (text) =>
  process.stdout.isTTY ? `[${code}m${text}[0m` : text;

/**
 * Each service is launched as `node <real entry point>` rather than `npm run`.
 *
 * Going through npm on Windows means cmd.exe runs a batch shim, and on Ctrl+C
 * cmd interrupts with "Terminate batch job (Y/N)?" — which hangs the terminal
 * waiting for input. Spawning node directly skips the shim entirely, and also
 * avoids both the EINVAL that .cmd files raise without a shell and the DEP0190
 * warning that an args array with `shell: true` triggers.
 */
const EXPO_ARGS = {
  start: [],
  web: ['--web'],
  android: ['--android'],
  ios: ['--ios'],
};

const SERVICES = [
  {
    name: 'api  ',
    cwd: 'server',
    args: ['--watch', '--env-file-if-exists=.env', 'src/index.js'],
    paint: colour(36),
  },
  {
    name: 'admin',
    cwd: 'apps/admin',
    args: ['node_modules/vite/bin/vite.js'],
    paint: colour(35),
  },
  ...(target === 'api'
    ? []
    : [
        {
          name: 'app  ',
          cwd: 'apps/mobile',
          args: [
            'node_modules/expo/bin/cli',
            'start',
            ...(EXPO_ARGS[target] ?? []),
            // Metro keys its transform cache on the babel config, so after a
            // babel/metro change a stale cache serves the *old* bundle — which
            // looks exactly like "the fix did nothing". `--clear` is the cure.
            ...(clear ? ['--clear'] : []),
          ],
          // Expo is the only interactive one; it needs the real stdin for its
          // keyboard menu ("a" for Android, "r" to reload).
          interactive: true,
          paint: colour(32),
        },
      ]),
];

const children = [];
let shuttingDown = false;

/**
 * Expo switches the TTY to raw mode for its keypress menu. If it dies without
 * restoring it, the terminal is left with no echo and a broken prompt — which
 * reads as "the terminal crashed". Put it back ourselves, every time.
 */
const restoreTerminal = () => {
  try {
    if (process.stdin.isTTY && typeof process.stdin.setRawMode === 'function') {
      process.stdin.setRawMode(false);
    }
    process.stdin.pause();
    if (process.stdout.isTTY) process.stdout.write('[?25h[0m');
  } catch {
    // Nothing useful to do if the console has already gone.
  }
};

process.on('exit', restoreTerminal);

const stillRunning = (child) => child.exitCode === null && child.signalCode === null;

const forceKill = (child) => {
  if (!stillRunning(child)) return;
  try {
    if (process.platform === 'win32') {
      // npm's shim spawns grandchildren, so the whole tree has to go.
      spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' }).on(
        'error',
        () => {},
      );
    } else {
      child.kill('SIGKILL');
    }
  } catch {
    // Already gone.
  }
};

const stopAll = async (code) => {
  if (shuttingDown) return;
  shuttingDown = true;

  restoreTerminal();
  process.stdout.write('\nStopping…\n');

  // On Windows the console delivers Ctrl+C to every process in the group, so
  // the children are usually already shutting down. Ask politely first and give
  // them a chance to clean up — Expo needs it to release the terminal.
  if (process.platform !== 'win32') {
    for (const child of children) {
      if (stillRunning(child)) {
        try {
          child.kill('SIGTERM');
        } catch {
          /* already gone */
        }
      }
    }
  }

  const exited = Promise.all(
    children.map(
      (child) =>
        new Promise((resolve) => (stillRunning(child) ? child.once('exit', resolve) : resolve())),
    ),
  );

  // Force only the stragglers, and only after they have had a fair chance.
  const timeout = new Promise((resolve) => setTimeout(resolve, 5000));
  await Promise.race([exited, timeout]);

  for (const child of children) forceKill(child);

  restoreTerminal();
  process.exit(code);
};

const prefixLines = (chunk, service) => {
  for (const line of chunk.toString().split(/\r?\n/)) {
    if (line.trim() === '') continue;
    process.stdout.write(`${service.paint(service.name)} │ ${line}\n`);
  }
};

/** The address a phone on the same Wi-Fi uses to reach this machine. */
const lanAddress = () => {
  const candidates = Object.values(os.networkInterfaces())
    .flat()
    .filter((entry) => entry && entry.family === 'IPv4' && !entry.internal)
    .map((entry) => entry.address);

  // Prefer a private range — VPN and virtual adapters often sit first.
  return (
    candidates.find((address) => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address)) ??
    candidates[0] ??
    'localhost'
  );
};

const lan = lanAddress();

console.log(`\nKal-UKFinder — starting ${SERVICES.map((s) => s.name.trim()).join(', ')}`);
console.log(`  API    http://localhost:4000        (phone: http://${lan}:4000)`);
console.log('  Admin  http://localhost:5173');
if (target !== 'api') {
  console.log(`  App    Expo${clear ? ' — cache cleared' : ''}`);
  console.log(`         QR code below · or open exp://${lan}:8081 in Expo Go`);
  console.log('         press a = Android · i = iOS · w = web · r = reload');
}
console.log('  Ctrl+C stops everything\n');

for (const service of SERVICES) {
  const child = spawn(process.execPath, service.args, {
    cwd: new URL(`../${service.cwd}/`, import.meta.url),
    // Expo gets the terminal outright. Piping its output would set isTTY false
    // in the child, and Expo then hides the QR code and the keyboard menu — so
    // the one service you actually interact with must not be piped. The other
    // two are piped and prefixed, which is what makes their logs readable.
    stdio: service.interactive ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    // Keep child output coloured through the pipe, but never override an
    // explicit NO_COLOR — setting both makes Node warn on every process.
    env: process.env.NO_COLOR ? process.env : { ...process.env, FORCE_COLOR: '1' },
  });

  child.stdout?.on('data', (chunk) => prefixLines(chunk, service));
  child.stderr?.on('data', (chunk) => prefixLines(chunk, service));

  child.on('exit', (code) => {
    if (shuttingDown) return;
    process.stdout.write(
      `\n${service.paint(service.name)} │ exited with code ${code}. Stopping the rest.\n`,
    );
    void stopAll(code ?? 1);
  });

  child.on('error', (error) => {
    process.stderr.write(`${service.paint(service.name)} │ failed to start: ${error.message}\n`);
    void stopAll(1);
  });

  children.push(child);
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
  process.on(signal, () => void stopAll(0));
}
