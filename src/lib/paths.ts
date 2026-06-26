// Centralized path resolution for gradtrack's own files (CLI state + the data
// the Astro site reads). Source paths (vault, blog, canvas snapshots) come
// from the config file instead - see src/config.ts. Override via env for
// tests + CI.

import { homedir } from 'node:os';
import { join } from 'node:path';

const HOME = homedir();

// Per-user requirements state (status toggles), separate from the seed in the
// config file. Override with GRADTRACK_STATE_DIR.
export const STATE_DIR = process.env.GRADTRACK_STATE_DIR ?? join(HOME, '.gradtrack');
export const STATE_FILE = join(STATE_DIR, 'state.json');

// The repo root is the package directory; the Astro site lives in ./site and
// reads JSON from ./site/src/data. Resolve relative to this module so the CLI
// works regardless of cwd. From dist/lib/paths.js, the repo root is two levels
// up; from src/lib/paths.ts (tsx) it is the same.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
// HERE = <repo>/dist/lib or <repo>/src/lib -> repo root is two up.
export const REPO_ROOT = process.env.GRADTRACK_ROOT ?? resolve(HERE, '..', '..');
export const SITE_DIR = join(REPO_ROOT, 'site');
export const SITE_DATA_DIR = join(SITE_DIR, 'src', 'data');
export const SITE_SNAPSHOT_JSON = join(SITE_DATA_DIR, 'snapshot.json');
export const SITE_STATE_JSON = join(SITE_DATA_DIR, 'state.json');
export const SITE_THEME_JSON = join(SITE_DATA_DIR, 'theme.json');
