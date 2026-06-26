// `gradtrack sync` - refresh every configured source, optionally write a daily
// markdown snapshot, and emit JSON for the Astro site to render.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { GradtrackPayload, SnapshotMeta } from '../types.js';
import { loadConfig } from '../config.js';
import { loadProgramInfo } from '../sources/program-info.js';
import { loadCoursework } from '../sources/obsidian.js';
import { loadRepos } from '../sources/github.js';
import { loadBlog } from '../sources/astro-blog.js';
import { loadAnnouncements } from '../sources/canvas.js';
import { computeCoverage, graduationFor } from '../compose/digest.js';
import { loadChecklist } from '../state/checklist.js';
import { writeSnapshot } from '../snapshot/writer.js';
import {
  SITE_SNAPSHOT_JSON, SITE_STATE_JSON, SITE_THEME_JSON, STATE_DIR,
} from '../lib/paths.js';
import { log } from '../lib/log.js';

export interface SyncOptions {
  target_term?: string;
}

export interface SyncResult {
  snapshot_path: string | null;
  site_data_path: string;
  date: string;
  coverage_filled: number;
  coverage_total: number;
  artifacts_total: number;
  days_remaining: number;
}

function today(): { date: string; iso: string } {
  const d = new Date();
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return { date: `${y}-${m}-${day}`, iso: d.toISOString() };
}

export async function runSync(opts: SyncOptions = {}): Promise<SyncResult> {
  const cfg = loadConfig();
  const targetTerm = opts.target_term ?? cfg.graduation.target_term;

  const program = loadProgramInfo();
  const coursework = loadCoursework();
  const repos = loadRepos();
  const blog = loadBlog();
  const canvas = loadAnnouncements();

  const coverage = computeCoverage(
    program.program.competencies,
    coursework.artifacts,
    blog.posts,
    repos.repos,
  );
  const graduation = graduationFor(targetTerm);

  const { date, iso } = today();
  const payload: GradtrackPayload = {
    fetched_at: iso,
    program: program.program,
    coursework: coursework.artifacts,
    repos: repos.repos,
    blog: blog.posts,
    announcements: canvas.announcements,
    coverage,
    graduation,
    sources_ok: {
      program: program.ok,
      coursework: coursework.ok,
      repos: repos.ok,
      blog: blog.ok,
      canvas: canvas.ok,
    },
  };

  // Ensure the state dir exists so `doctor` is fully green even before the
  // user has marked their first requirement.
  mkdirSync(STATE_DIR, { recursive: true });

  const meta: SnapshotMeta = { date, generatedAt: iso };
  const checklist = loadChecklist();

  // The markdown snapshot is optional - only written when configured (for
  // example to mirror it into a notes vault).
  let snapshotPath: string | null = null;
  if (cfg.snapshot.enabled && cfg.snapshot.outDir) {
    snapshotPath = writeSnapshot(payload, meta, checklist, cfg.snapshot.outDir);
    log.info({ snapshotPath }, 'sync.snapshot-written');
  }

  mkdirSync(dirname(SITE_SNAPSHOT_JSON), { recursive: true });
  writeFileSync(SITE_SNAPSHOT_JSON, JSON.stringify(payload, null, 2), 'utf8');
  writeFileSync(SITE_STATE_JSON, JSON.stringify(checklist, null, 2), 'utf8');
  writeFileSync(SITE_THEME_JSON, JSON.stringify(cfg.theme, null, 2), 'utf8');
  log.info({ site: SITE_SNAPSHOT_JSON }, 'sync.site-data-written');

  return {
    snapshot_path: snapshotPath,
    site_data_path: SITE_SNAPSHOT_JSON,
    date,
    coverage_filled: coverage.filter((c) => c.artifact_count > 0).length,
    coverage_total: coverage.length,
    artifacts_total:
      coursework.artifacts.length + blog.posts.length + repos.repos.filter((r) => r.is_security_themed).length,
    days_remaining: graduation.days_remaining,
  };
}
