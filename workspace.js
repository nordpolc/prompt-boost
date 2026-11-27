/**
 * Workspace hints: the few facts about the project the draft is being written
 * in, so an enhancement can stop guessing the stack.
 *
 * Nothing here reads file contents beyond package.json, and nothing leaves the
 * machine: the hints are appended to the system prompt of the same request.
 */
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';

/** DSH home, honouring the same variable the harness itself uses. */
const DSH_HOME = process.env.DSH_HOME && process.env.DSH_HOME.trim() !== ''
  ? process.env.DSH_HOME.trim()
  : join(homedir(), '.dsh');

/** Where DSH keeps one directory per workspace. */
const SESSIONS_ROOT = join(DSH_HOME, 'sessions');

/** How long one collected hint set is reused, in milliseconds. */
const CACHE_MS = 60_000;

/** Largest hint block we hand to the model, in characters. */
export const MAX_HINT_CHARS = 900;

let cached = { at: 0, value: null };

function run(command, args, cwd) {
  return new Promise((resolve) => {
    execFile(command, args, { cwd, timeout: 1500, maxBuffer: 64 * 1024 }, (error, stdout) => {
      resolve(error ? '' : String(stdout));
    });
  });
}

/**
 * Turn a session folder name back into a path: `--home-ubuntu-VibeCoding--`.
 * The encoding replaces `/` with `-`, so dashes inside real names are
 * ambiguous; resolve greedily against the filesystem and take what exists.
 */
async function decodeWorkspace(name) {
  const trimmed = name.replace(/^--/, '').replace(/--$/, '');
  const parts = trimmed.split('-');
  for (let take = parts.length; take > 0; take -= 1) {
    const candidate = `/${parts.slice(0, take).join('/')}`;
    try {
      const stats = await fs.stat(candidate);
      if (stats.isDirectory()) return candidate;
    } catch {
      // keep shortening
    }
  }
  return '';
}

/** The workspace touched most recently, or '' when the layout is unfamiliar. */
async function newestWorkspace() {
  let entries;
  try {
    entries = await fs.readdir(SESSIONS_ROOT, { withFileTypes: true });
  } catch {
    return '';
  }
  let best = { at: 0, path: '' };
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const full = join(SESSIONS_ROOT, entry.name);
    try {
      const stats = await fs.stat(full);
      if (stats.mtimeMs <= best.at) continue;
      const path = await decodeWorkspace(entry.name);
      if (path !== '') best = { at: stats.mtimeMs, path };
    } catch {
      // unreadable entry: skip
    }
  }
  if (best.path !== '') return best.path;
  /* No usable session folder (fresh install, other harness build): fall back to
     the directory the app was started in, but only when it looks like a project. */
  const cwd = process.cwd();
  for (const marker of ['package.json', '.git', 'pyproject.toml', 'go.mod', 'Cargo.toml']) {
    try {
      await fs.stat(join(cwd, marker));
      return cwd;
    } catch {
      // try the next marker
    }
  }
  return '';
}

function pickScripts(scripts) {
  const wanted = ['dev', 'build', 'test', 'start', 'lint'];
  return wanted.filter((key) => typeof scripts[key] === 'string').slice(0, 5);
}

/** Marker files that name a stack without reading source. */
const MARKERS = [
  ['package.json', 'Node'],
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['tsconfig.json', 'TypeScript'],
  ['vite.config.ts', 'Vite'],
  ['next.config.js', 'Next'],
  ['next.config.mjs', 'Next'],
  ['pyproject.toml', 'Python'],
  ['requirements.txt', 'Python'],
  ['Cargo.toml', 'Rust'],
  ['go.mod', 'Go'],
  ['composer.json', 'PHP'],
  ['pom.xml', 'Maven'],
  ['build.gradle', 'Gradle'],
  ['CMakeLists.txt', 'CMake'],
  ['*.csproj', 'C#'],
  ['Dockerfile', 'Docker'],
  ['compose.yaml', 'Docker'],
  ['docker-compose.yml', 'Docker'],
  ['Caddyfile', 'Caddy'],
];

/**
 * Collect hints for one directory.
 * @param root - absolute path to a workspace, or '' to pick the newest one.
 * @returns {{root: string, lines: string[], text: string}} what to tell the model.
 */
async function collect(root) {
  let at = '';
  if (typeof root === 'string' && root !== '') {
    /* An explicit path is a promise: if it is not a directory, say nothing
       rather than describing some other project. */
    if (!root.startsWith('/')) return { root: '', lines: [], text: '' };
    try {
      const stats = await fs.stat(root);
      if (!stats.isDirectory()) return { root: '', lines: [], text: '' };
      at = root;
    } catch {
      return { root: '', lines: [], text: '' };
    }
  }
  if (at === '') {
    const forced = process.env.DSH_PB_WORKSPACE;
    if (typeof forced === 'string' && forced.trim() !== '' && forced.startsWith('/')) {
      try {
        if ((await fs.stat(forced)).isDirectory()) at = forced;
      } catch {
        // ignore a stale override
      }
    }
  }
  if (at === '') at = await newestWorkspace();
  if (at === '') return { root: '', lines: [], text: '' };

  const lines = [];
  let names = [];
  try {
    names = (await fs.readdir(at, { withFileTypes: true })).map((entry) => entry.name);
  } catch {
    return { root: '', lines: [], text: '' };
  }

  const stacks = [];
  for (const [marker, label] of MARKERS) {
    if (marker.startsWith('*.')) {
      const suffix = marker.slice(1);
      if (names.some((name) => name.endsWith(suffix))) stacks.push(label);
    } else if (names.includes(marker)) {
      stacks.push(label);
    }
  }
  if (stacks.length > 0) lines.push(`技术栈线索：${[...new Set(stacks)].join(' / ')}`);

  const project = basename(at);
  const dirs = names.filter((name) => !name.startsWith('.')).slice(0, 12);
  if (dirs.length > 0) lines.push(`顶层条目：${project}/ ${dirs.join(' ')}`);

  try {
    const raw = await fs.readFile(join(at, 'package.json'), 'utf8');
    const manifest = JSON.parse(raw);
    const facts = [];
    if (typeof manifest.name === 'string' && manifest.name !== '') facts.push(`name=${manifest.name}`);
    if (typeof manifest.type === 'string') facts.push(`type=${manifest.type}`);
    const scripts = pickScripts(manifest.scripts ?? {});
    if (scripts.length > 0) facts.push(`scripts=${scripts.join(',')}`);
    if (facts.length > 0) lines.push(`package.json：${facts.join('；')}`);
  } catch {
    // no manifest, or not JSON: nothing to say
  }

  const branch = (await run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], at)).trim();
  if (branch !== '') {
    const changed = (await run('git', ['diff', '--name-only', 'HEAD'], at))
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '')
      .slice(0, 5);
    lines.push(
      changed.length > 0
        ? `git：分支 ${branch}，未提交改动 ${changed.join(' ')}`
        : `git：分支 ${branch}，工作区干净`,
    );
  }

  const text = lines.join('\n').slice(0, MAX_HINT_CHARS);
  return { root: at, lines, text };
}

/**
 * Cached hints. A missing or unreadable workspace yields an empty hint block,
 * never an invented one.
 * @param root - optional absolute path; '' or undefined picks the newest.
 */
export async function workspaceHints(root) {
  const explicit = typeof root === 'string' && root !== '';
  const now = Date.now();
  if (!explicit && cached.value !== null && now - cached.at < CACHE_MS) return cached.value;
  let value;
  try {
    value = await collect(root);
  } catch {
    value = { root: '', lines: [], text: '' };
  }
  if (!explicit) cached = { at: now, value };
  return value;
}
