// `gradtrack doctor` - verify the config loaded and that every ENABLED source
// points at inputs that exist. Disabled sources are reported as skipped, not
// failed, so a minimal config (config-only requirements, no external sources)
// is fully green.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadConfig } from '../config.js';
import { STATE_DIR } from '../lib/paths.js';
import { log } from '../lib/log.js';

interface Check {
  name: string;
  ok: boolean;
  skipped?: boolean;
  detail: string;
}

function checkPath(name: string, path: string): Check {
  const ok = existsSync(path);
  return { name, ok, detail: ok ? path : `MISSING: ${path}` };
}

function skip(name: string, detail = 'disabled'): Check {
  return { name, ok: true, skipped: true, detail };
}

function checkGh(): Check {
  try {
    const out = execFileSync('gh', ['auth', 'status'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const loggedIn = /Logged in to github\.com/i.test(out);
    return {
      name: 'gh auth',
      ok: loggedIn,
      detail: loggedIn ? 'authenticated' : out.trim().slice(0, 200),
    };
  } catch (err) {
    return { name: 'gh auth', ok: false, detail: `gh not available: ${String(err).slice(0, 200)}` };
  }
}

export async function runDoctor(): Promise<number> {
  const cfg = loadConfig();
  const checks: Check[] = [];

  checks.push({
    name: 'config',
    ok: cfg.configPath !== null,
    detail: cfg.configPath
      ? cfg.configPath
      : 'no gradtrack.config.json found (copy gradtrack.config.example.json)',
  });
  checks.push({
    name: 'requirements',
    ok: cfg.requirements.length > 0,
    detail: cfg.requirements.length > 0
      ? `${cfg.requirements.length} requirement(s) configured`
      : 'no requirements configured',
  });
  checks.push({
    name: 'competencies',
    ok: true,
    detail: `${cfg.program.competencies.length} competency(ies) configured`,
  });

  // Optional sources: only validated when enabled.
  const pi = cfg.sources.programInfo;
  checks.push(
    pi.enabled && pi.path ? checkPath('program info file', pi.path) : skip('program info file'),
  );

  const ob = cfg.sources.obsidian;
  checks.push(
    ob.enabled && ob.schoolDir
      ? checkPath('coursework dir', join(ob.schoolDir, 'Classes'))
      : skip('coursework dir'),
  );

  const gh = cfg.sources.github;
  checks.push(gh.enabled && gh.username ? checkGh() : skip('gh auth'));

  const bl = cfg.sources.blog;
  if (bl.enabled && bl.dirs && bl.dirs.length > 0) {
    for (const d of bl.dirs) checks.push(checkPath(`blog dir (${d.collection})`, d.path));
  } else {
    checks.push(skip('blog dir'));
  }

  const cv = cfg.sources.canvas;
  checks.push(
    cv.enabled && cv.snapshotDir
      ? checkPath('canvas snapshot dir', cv.snapshotDir)
      : skip('canvas snapshot dir'),
  );

  if (cfg.snapshot.enabled && cfg.snapshot.outDir) {
    // The out dir is created on write, so a missing dir is fine - just report
    // the configured target.
    checks.push({ name: 'snapshot out dir', ok: true, detail: cfg.snapshot.outDir });
  } else {
    checks.push(skip('snapshot out dir'));
  }

  checks.push(checkPath('state dir', STATE_DIR));

  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) {
    const pre = c.skipped ? ' skip ' : c.ok ? '  ok  ' : ' FAIL ';
    process.stdout.write(`[${pre}] ${c.name.padEnd(24)} ${c.detail}\n`);
  }

  if (failed.length === 0) {
    log.info({ checks: checks.length }, 'doctor.all-green');
    return 0;
  }
  log.warn({ failed: failed.length, total: checks.length }, 'doctor.failures');
  return 1;
}
