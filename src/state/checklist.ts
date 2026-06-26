// User-mutable requirements checklist. The seed comes from the config file
// (config.requirements). Per-user status toggles are read from and written to
// ~/.gradtrack/state.json (override the dir with GRADTRACK_STATE_DIR).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ChecklistItem, ChecklistStatus } from '../types.js';
import { STATE_DIR, STATE_FILE } from '../lib/paths.js';
import { loadConfig } from '../config.js';
import { log } from '../lib/log.js';

// The default seed is whatever the config supplies, in config order.
function seedChecklist(): ChecklistItem[] {
  return loadConfig().requirements.map((c) => ({ ...c }));
}

function ensureStateDir(): void {
  try {
    mkdirSync(STATE_DIR, { recursive: true });
  } catch {
    /* noop */
  }
}

export function loadChecklist(path: string = STATE_FILE): ChecklistItem[] {
  const seed = seedChecklist();
  if (!existsSync(path)) {
    return seed.map((c) => ({ ...c }));
  }
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    log.warn({ err: String(err), path }, 'checklist.read-failed');
    return seed.map((c) => ({ ...c }));
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    log.warn({ path }, 'checklist.parse-failed');
    return seed.map((c) => ({ ...c }));
  }
  const onDisk = Array.isArray(parsed) ? (parsed as ChecklistItem[]) : [];
  return mergeWithSeed(seed, onDisk);
}

function mergeWithSeed(seed: ChecklistItem[], onDisk: ChecklistItem[]): ChecklistItem[] {
  const byId = new Map<string, ChecklistItem>();
  for (const def of seed) byId.set(def.id, { ...def });
  for (const row of onDisk) {
    if (!row || typeof row.id !== 'string') continue;
    const existing = byId.get(row.id);
    if (existing) {
      // Preserve the user's status + updated_at, take fresh label/description
      // from the config seed so wording fixes propagate without losing state.
      byId.set(row.id, {
        ...existing,
        status: row.status ?? existing.status,
        updated_at: row.updated_at ?? existing.updated_at,
      });
    } else {
      byId.set(row.id, row);
    }
  }
  return [...byId.values()];
}

export function saveChecklist(items: ChecklistItem[], path: string = STATE_FILE): void {
  ensureStateDir();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(items, null, 2), 'utf8');
}

export interface CheckUpdate {
  id: string;
  status: ChecklistStatus;
}

export function applyStatus(items: ChecklistItem[], update: CheckUpdate): ChecklistItem[] {
  const now = new Date().toISOString();
  return items.map((c) =>
    c.id === update.id ? { ...c, status: update.status, updated_at: now } : c,
  );
}

export function defaultChecklist(): ChecklistItem[] {
  return seedChecklist();
}
