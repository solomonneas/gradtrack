// Walks a coursework folder (Obsidian-style: <schoolDir>/Classes/<term>/
// <course>/...) for portfolio-grade artifacts (final papers, final projects,
// capstone-quality module work). Tags each artifact with the competency its
// course covers, per the courseToCompetency map in the config. This source is
// optional and no-ops gracefully when disabled or unconfigured.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import matter from 'gray-matter';
import type { CourseworkArtifact } from '../types.js';
import { loadConfig } from '../config.js';
import { log } from '../lib/log.js';

type CourseMap = Record<string, string>;

const COURSE_DIR_RE = /^([A-Z]{3,4})\s+(\d{4})\s*[-–]\s*(.+)$/;
const SEMESTER_LABEL_RE = /^(\d{4})\s+(FALL|SPRING|SUMMER)$/i;

// Filename heuristics for portfolio-grade artifacts. Order matters: more
// specific patterns first.
const ARTIFACT_HEURISTICS: Array<{ kind: CourseworkArtifact['kind']; re: RegExp }> = [
  { kind: 'final', re: /final[\s_-]*(paper|project|draft|submission)/i },
  { kind: 'paper', re: /(paper|essay|report|analysis|case[\s_-]*study)/i },
  { kind: 'project', re: /(project|deliverable|capstone)/i },
];

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function parseSemesterLabel(label: string): string {
  const m = label.match(SEMESTER_LABEL_RE);
  if (!m || !m[1] || !m[2]) return label;
  const year = m[1];
  const term = m[2][0]!.toUpperCase() + m[2].slice(1).toLowerCase();
  return `${term} ${year}`;
}

function parseCourseDir(dir: string): { code: string; name: string } | null {
  const m = dir.match(COURSE_DIR_RE);
  if (!m || !m[1] || !m[2] || !m[3]) return null;
  return { code: `${m[1]} ${m[2]}`, name: m[3].trim() };
}

function classifyFile(filename: string): CourseworkArtifact['kind'] | null {
  for (const h of ARTIFACT_HEURISTICS) {
    if (h.re.test(filename)) return h.kind;
  }
  return null;
}

function readFirstParagraph(body: string): string | null {
  const stripped = body.replace(/^\s*#[^\n]+\n+/m, '').trim();
  const para = stripped.split(/\n\s*\n/)[0];
  if (!para) return null;
  return para.replace(/\s+/g, ' ').slice(0, 360);
}

function statusFromSemester(semester: string, today: Date): CourseworkArtifact['status'] {
  // Spring/Fall/Summer year → completion order. Anything before the current
  // semester is 'completed', current is 'in-progress', future is 'planned'.
  const m = semester.match(/^(Spring|Summer|Fall)\s+(\d{4})$/);
  if (!m || !m[1] || !m[2]) return 'in-progress';
  const termOrder: Record<string, number> = { Spring: 0, Summer: 1, Fall: 2 };
  const termIdx = termOrder[m[1]] ?? 1;
  const year = parseInt(m[2], 10);
  const thisYear = today.getFullYear();
  const thisMonth = today.getMonth() + 1;
  const thisTermIdx =
    thisMonth <= 4 ? 0 : thisMonth <= 7 ? 1 : 2;
  const semIdx = year * 3 + termIdx;
  const nowIdx = thisYear * 3 + thisTermIdx;
  if (semIdx < nowIdx) return 'completed';
  if (semIdx === nowIdx) return 'in-progress';
  return 'planned';
}

function collectArtifactsFromCourse(
  courseDir: string,
  courseCode: string,
  courseName: string,
  semester: string,
  today: Date,
  courseMap: CourseMap,
): CourseworkArtifact[] {
  const out: CourseworkArtifact[] = [];

  function walk(dir: string, depth: number) {
    if (depth > 3) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const full = join(dir, name);
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        // Treat Final Project / Final Paper directories as a single artifact
        // by recursing for their flagship .md file (or the first .md found).
        if (/^final/i.test(name) || /capstone/i.test(name)) {
          const dirArtifact = collectFromFinalDir(full, courseCode, courseName, semester, today, courseMap);
          if (dirArtifact) out.push(dirArtifact);
          continue;
        }
        walk(full, depth + 1);
        continue;
      }
      if (!name.toLowerCase().endsWith('.md')) continue;
      const kind = classifyFile(name);
      if (!kind) continue;
      const artifact = readArtifactFile(full, kind, courseCode, courseName, semester, today, courseMap);
      if (artifact) out.push(artifact);
    }
  }

  walk(courseDir, 0);
  return out;
}

function collectFromFinalDir(
  dir: string,
  courseCode: string,
  courseName: string,
  semester: string,
  today: Date,
  courseMap: CourseMap,
): CourseworkArtifact | null {
  let chosen: string | null = null;
  function scan(d: string) {
    let entries: string[];
    try {
      entries = readdirSync(d);
    } catch {
      return;
    }
    for (const name of entries) {
      const full = join(d, name);
      const st = (() => {
        try { return statSync(full); } catch { return null; }
      })();
      if (!st) continue;
      if (st.isDirectory()) {
        scan(full);
        continue;
      }
      if (!name.toLowerCase().endsWith('.md')) continue;
      if (!chosen || /final/i.test(name)) {
        chosen = full;
      }
    }
  }
  scan(dir);
  if (!chosen) {
    // No md inside, but the directory itself signals a final artifact exists.
    return {
      id: slugify(`${courseCode}-final-${basename(dir)}`),
      kind: 'final',
      course_code: courseCode,
      course_name: courseName,
      title: `${courseCode} - ${basename(dir)}`,
      semester,
      status: statusFromSemester(semester, today),
      summary: null,
      obsidian_path: dir,
      competency_hints: competenciesFor(courseCode, courseMap),
    };
  }
  return readArtifactFile(chosen, 'final', courseCode, courseName, semester, today, courseMap);
}

function readArtifactFile(
  path: string,
  kind: CourseworkArtifact['kind'],
  courseCode: string,
  courseName: string,
  semester: string,
  today: Date,
  courseMap: CourseMap,
): CourseworkArtifact | null {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return null;
  }
  const parsed = matter(raw);
  const fm = parsed.data ?? {};
  const titleFromFm =
    typeof fm.title === 'string' && fm.title.trim().length > 0 ? fm.title : null;
  const titleFromH1 = parsed.content.match(/^#\s+(.+?)$/m);
  const title = titleFromFm ?? (titleFromH1 ? titleFromH1[1]!.trim() : basename(path, '.md'));
  const summaryFromFm =
    typeof fm.summary === 'string' && fm.summary.trim().length > 0 ? fm.summary : null;
  const summary = summaryFromFm ?? readFirstParagraph(parsed.content);

  return {
    id: slugify(`${courseCode}-${kind}-${title}`),
    kind,
    course_code: courseCode,
    course_name: courseName,
    title,
    semester,
    status: statusFromSemester(semester, today),
    summary,
    obsidian_path: path,
    competency_hints: competenciesFor(courseCode, courseMap),
  };
}

function competenciesFor(courseCode: string, courseMap: CourseMap): string[] {
  const id = courseMap[courseCode];
  return id ? [id] : [];
}

export interface ObsidianResult {
  ok: boolean;
  artifacts: CourseworkArtifact[];
  reason?: string;
}

export function loadCoursework(today: Date = new Date()): ObsidianResult {
  const cfg = loadConfig();
  const src = cfg.sources.obsidian;
  if (!src.enabled || !src.schoolDir) {
    return { ok: true, artifacts: [], reason: 'obsidian source disabled' };
  }
  const courseMap: CourseMap = src.courseToCompetency ?? {};

  const classesDir = join(src.schoolDir, 'Classes');
  if (!existsSync(classesDir)) {
    log.warn({ classesDir }, 'obsidian.classes-missing');
    return { ok: false, artifacts: [], reason: `Classes dir missing: ${classesDir}` };
  }

  const artifacts: CourseworkArtifact[] = [];
  for (const entry of readdirSync(classesDir)) {
    const semesterPath = join(classesDir, entry);
    let st;
    try { st = statSync(semesterPath); } catch { continue; }
    if (!st.isDirectory()) continue;
    const semester = parseSemesterLabel(entry);
    if (semester === entry && !SEMESTER_LABEL_RE.test(entry)) continue;

    for (const courseDirName of readdirSync(semesterPath)) {
      const courseDir = join(semesterPath, courseDirName);
      let cs;
      try { cs = statSync(courseDir); } catch { continue; }
      if (!cs.isDirectory()) continue;
      const parsed = parseCourseDir(courseDirName);
      if (!parsed) continue;
      artifacts.push(
        ...collectArtifactsFromCourse(courseDir, parsed.code, parsed.name, semester, today, courseMap),
      );
    }
  }

  // Deduplicate by id (final dirs can shadow root mds).
  const seen = new Set<string>();
  const deduped = artifacts.filter((a) => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });

  return { ok: true, artifacts: deduped };
}
