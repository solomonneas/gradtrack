// gradtrack configuration. Everything that used to be hardcoded - program
// competencies, the requirements checklist, source paths, the graduation term
// - now lives in a user-supplied JSON config file. Parsed with the built-in
// JSON parser so there are no extra dependencies.
//
// Resolution order for the config file path:
//   1. GRADTRACK_CONFIG env var (absolute or relative to cwd)
//   2. ./gradtrack.config.json in the current working directory
//   3. ~/.config/gradtrack/config.json
// A bundled gradtrack.config.example.json documents every field.

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import type { ChecklistItem, Competency, ProgramInfo } from './types.js';
import { log } from './lib/log.js';

export interface ProgramInfoSourceConfig {
  enabled: boolean;
  path?: string;
}

export interface ObsidianSourceConfig {
  enabled: boolean;
  schoolDir?: string;
  // Maps a course code (e.g. "ABC 1234") to a competency id. Optional; an
  // unmapped course simply contributes no competency hints.
  courseToCompetency?: Record<string, string>;
}

export interface GitHubSourceConfig {
  enabled: boolean;
  username?: string;
  // When true, repos are tagged + filtered by the security keyword heuristic.
  // When false (default) every non-fork repo is treated as a portfolio repo.
  securityThemed?: boolean;
}

export interface BlogDirConfig {
  path: string;
  collection: 'blog' | 'intel';
}

export interface BlogSourceConfig {
  enabled: boolean;
  dirs?: BlogDirConfig[];
}

// Optional Canvas snapshot source. Reads the JSON tail written by an external
// Canvas snapshot tool (for example the sibling canvas-digest project) and
// surfaces graduation-related course announcements.
export interface CanvasSourceConfig {
  enabled: boolean;
  snapshotDir?: string;
  courseId?: string;
  lookbackDays?: number;
}

export interface SourcesConfig {
  programInfo: ProgramInfoSourceConfig;
  obsidian: ObsidianSourceConfig;
  github: GitHubSourceConfig;
  blog: BlogSourceConfig;
  canvas: CanvasSourceConfig;
}

export interface SnapshotConfig {
  enabled: boolean;
  outDir?: string;
}

export interface GraduationConfig {
  target_term: string;
  // Month-day (MM-DD) the term ends, keyed by lowercase term name.
  term_ends: Record<string, string>;
  // Portfolio deadline = term end minus this many days.
  deadline_offset_days: number;
}

export interface ThemeConfig {
  label: string;
  accent: string;
  accentSoft: string;
  accentAlt: string;
  accentAltSoft: string;
}

export interface SiteConfig {
  port: number;
  allowedHosts: string[];
}

export interface GradtrackConfig {
  program: ProgramInfo;
  graduation: GraduationConfig;
  requirements: ChecklistItem[];
  sources: SourcesConfig;
  snapshot: SnapshotConfig;
  theme: ThemeConfig;
  site: SiteConfig;
  // Absolute path the config was loaded from (or null when defaults are used).
  configPath: string | null;
}

const DEFAULT_THEME: ThemeConfig = {
  label: 'gradtrack',
  accent: '#3D5A80',
  accentSoft: '#6B89AD',
  accentAlt: '#D97757',
  accentAltSoft: '#ECA88A',
};

const DEFAULT_SITE: SiteConfig = {
  port: 4321,
  allowedHosts: ['localhost', '127.0.0.1'],
};

const DEFAULT_GRADUATION: GraduationConfig = {
  target_term: 'Fall 2026',
  term_ends: { spring: '05-03', summer: '08-08', fall: '12-12' },
  deadline_offset_days: 30,
};

const DEFAULT_PROGRAM: ProgramInfo = {
  degree: 'Graduate Program',
  total_credits: 0,
  competencies: [],
  comp_exam_rules: {
    timing: 'During the term in which you plan to graduate',
    rubric_dimensions: ['Content', 'Critical Thinking'],
    notes: [],
  },
  source_path: 'config',
};

function emptySources(): SourcesConfig {
  return {
    programInfo: { enabled: false },
    obsidian: { enabled: false },
    github: { enabled: false },
    blog: { enabled: false },
    canvas: { enabled: false },
  };
}

function defaultConfig(): GradtrackConfig {
  return {
    program: { ...DEFAULT_PROGRAM, competencies: [] },
    graduation: { ...DEFAULT_GRADUATION },
    requirements: [],
    sources: emptySources(),
    snapshot: { enabled: false },
    theme: { ...DEFAULT_THEME },
    site: { ...DEFAULT_SITE },
    configPath: null,
  };
}

export function resolveConfigPath(explicit?: string): string | null {
  const candidates: string[] = [];
  const fromEnv = explicit ?? process.env.GRADTRACK_CONFIG;
  if (fromEnv) {
    candidates.push(isAbsolute(fromEnv) ? fromEnv : resolve(process.cwd(), fromEnv));
  }
  candidates.push(join(process.cwd(), 'gradtrack.config.json'));
  candidates.push(join(homedir(), '.config', 'gradtrack', 'config.json'));
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

function normalizeCompetency(raw: unknown, idx: number): Competency | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'string' && r.id.length > 0 ? r.id : `competency-${idx + 1}`;
  const group =
    r.group === 'core' || r.group === 'concentration' || r.group === 'other'
      ? r.group
      : 'core';
  return {
    id,
    group,
    label: typeof r.label === 'string' ? r.label : id,
    description: typeof r.description === 'string' ? r.description : '',
    source_path: typeof r.source_path === 'string' ? r.source_path : 'config',
  };
}

function normalizeRequirement(raw: unknown): ChecklistItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || r.id.length === 0) return null;
  const status =
    r.status === 'todo' || r.status === 'in-progress' || r.status === 'done'
      ? r.status
      : 'todo';
  const category =
    r.category === 'admin' ||
    r.category === 'artifact' ||
    r.category === 'review' ||
    r.category === 'submission'
      ? r.category
      : 'admin';
  return {
    id: r.id,
    label: typeof r.label === 'string' ? r.label : r.id,
    description: typeof r.description === 'string' ? r.description : '',
    status,
    category,
    updated_at: null,
    blocking: r.blocking === true,
  };
}

function mergeProgram(raw: unknown): ProgramInfo {
  const base: ProgramInfo = { ...DEFAULT_PROGRAM, competencies: [] };
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;
  if (typeof r.degree === 'string') base.degree = r.degree;
  if (typeof r.total_credits === 'number') base.total_credits = r.total_credits;
  if (typeof r.source_path === 'string') base.source_path = r.source_path;
  if (Array.isArray(r.competencies)) {
    base.competencies = r.competencies
      .map((c, i) => normalizeCompetency(c, i))
      .filter((c): c is Competency => c !== null);
  }
  const rules = r.comp_exam_rules;
  if (rules && typeof rules === 'object') {
    const rr = rules as Record<string, unknown>;
    base.comp_exam_rules = {
      timing:
        typeof rr.timing === 'string' ? rr.timing : base.comp_exam_rules.timing,
      rubric_dimensions: Array.isArray(rr.rubric_dimensions)
        ? rr.rubric_dimensions.filter((x): x is string => typeof x === 'string')
        : base.comp_exam_rules.rubric_dimensions,
      notes: Array.isArray(rr.notes)
        ? rr.notes.filter((x): x is string => typeof x === 'string')
        : base.comp_exam_rules.notes,
    };
  }
  return base;
}

function mergeGraduation(raw: unknown): GraduationConfig {
  const base: GraduationConfig = {
    ...DEFAULT_GRADUATION,
    term_ends: { ...DEFAULT_GRADUATION.term_ends },
  };
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;
  if (typeof r.target_term === 'string') base.target_term = r.target_term;
  if (typeof r.deadline_offset_days === 'number') {
    base.deadline_offset_days = r.deadline_offset_days;
  }
  if (r.term_ends && typeof r.term_ends === 'object') {
    for (const [k, v] of Object.entries(r.term_ends as Record<string, unknown>)) {
      if (typeof v === 'string') base.term_ends[k.toLowerCase()] = v;
    }
  }
  return base;
}

function mergeSources(raw: unknown): SourcesConfig {
  const out = emptySources();
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;

  const pi = r.programInfo as Record<string, unknown> | undefined;
  if (pi && typeof pi === 'object') {
    out.programInfo = {
      enabled: pi.enabled === true,
      path: typeof pi.path === 'string' ? pi.path : undefined,
    };
  }

  const ob = r.obsidian as Record<string, unknown> | undefined;
  if (ob && typeof ob === 'object') {
    out.obsidian = {
      enabled: ob.enabled === true,
      schoolDir: typeof ob.schoolDir === 'string' ? ob.schoolDir : undefined,
      courseToCompetency:
        ob.courseToCompetency && typeof ob.courseToCompetency === 'object'
          ? (ob.courseToCompetency as Record<string, string>)
          : undefined,
    };
  }

  const gh = r.github as Record<string, unknown> | undefined;
  if (gh && typeof gh === 'object') {
    out.github = {
      enabled: gh.enabled === true,
      username: typeof gh.username === 'string' ? gh.username : undefined,
      securityThemed: gh.securityThemed === true,
    };
  }

  const bl = r.blog as Record<string, unknown> | undefined;
  if (bl && typeof bl === 'object') {
    const dirs = Array.isArray(bl.dirs)
      ? bl.dirs
          .map((d) => {
            if (!d || typeof d !== 'object') return null;
            const dd = d as Record<string, unknown>;
            if (typeof dd.path !== 'string') return null;
            const collection = dd.collection === 'intel' ? 'intel' : 'blog';
            return { path: dd.path, collection } as BlogDirConfig;
          })
          .filter((d): d is BlogDirConfig => d !== null)
      : undefined;
    out.blog = { enabled: bl.enabled === true, dirs };
  }

  const cv = r.canvas as Record<string, unknown> | undefined;
  if (cv && typeof cv === 'object') {
    out.canvas = {
      enabled: cv.enabled === true,
      snapshotDir: typeof cv.snapshotDir === 'string' ? cv.snapshotDir : undefined,
      courseId: typeof cv.courseId === 'string' ? cv.courseId : undefined,
      lookbackDays:
        typeof cv.lookbackDays === 'number' ? cv.lookbackDays : undefined,
    };
  }

  return out;
}

function mergeTheme(raw: unknown): ThemeConfig {
  const base = { ...DEFAULT_THEME };
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;
  if (typeof r.label === 'string') base.label = r.label;
  if (typeof r.accent === 'string') base.accent = r.accent;
  if (typeof r.accentSoft === 'string') base.accentSoft = r.accentSoft;
  if (typeof r.accentAlt === 'string') base.accentAlt = r.accentAlt;
  if (typeof r.accentAltSoft === 'string') base.accentAltSoft = r.accentAltSoft;
  return base;
}

function mergeSite(raw: unknown): SiteConfig {
  const base = { ...DEFAULT_SITE, allowedHosts: [...DEFAULT_SITE.allowedHosts] };
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;
  if (typeof r.port === 'number') base.port = r.port;
  if (Array.isArray(r.allowedHosts)) {
    base.allowedHosts = r.allowedHosts.filter((x): x is string => typeof x === 'string');
  }
  return base;
}

function mergeSnapshot(raw: unknown): SnapshotConfig {
  if (!raw || typeof raw !== 'object') return { enabled: false };
  const r = raw as Record<string, unknown>;
  return {
    enabled: r.enabled === true,
    outDir: typeof r.outDir === 'string' ? r.outDir : undefined,
  };
}

export function parseConfig(raw: unknown, configPath: string | null): GradtrackConfig {
  if (!raw || typeof raw !== 'object') return defaultConfig();
  const r = raw as Record<string, unknown>;
  const requirements = Array.isArray(r.requirements)
    ? r.requirements
        .map((q) => normalizeRequirement(q))
        .filter((q): q is ChecklistItem => q !== null)
    : [];
  return {
    program: mergeProgram(r.program),
    graduation: mergeGraduation(r.graduation),
    requirements,
    sources: mergeSources(r.sources),
    snapshot: mergeSnapshot(r.snapshot),
    theme: mergeTheme(r.theme),
    site: mergeSite(r.site),
    configPath,
  };
}

let cached: GradtrackConfig | null = null;

export function loadConfig(explicitPath?: string): GradtrackConfig {
  if (cached && !explicitPath) return cached;
  const path = resolveConfigPath(explicitPath);
  if (!path) {
    log.warn({}, 'config.not-found');
    const cfg = defaultConfig();
    if (!explicitPath) cached = cfg;
    return cfg;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    log.warn({ err: String(err), path }, 'config.parse-failed');
    const cfg = defaultConfig();
    if (!explicitPath) cached = cfg;
    return cfg;
  }
  const cfg = parseConfig(parsed, path);
  if (!explicitPath) cached = cfg;
  return cfg;
}

// Test/CLI hook to drop the memoized config (used after writing a config file
// in the same process, or in tests).
export function resetConfigCache(): void {
  cached = null;
}
