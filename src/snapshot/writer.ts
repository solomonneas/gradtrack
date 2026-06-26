import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { GradtrackPayload, SnapshotMeta } from '../types.js';
import {
  FRONTMATTER_DELIM,
  JSON_TAIL_OPEN,
  JSON_TAIL_CLOSE,
  SNAPSHOT_VERSION_LINE,
} from './format.js';

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

function fmtCreated(date: string): string {
  // Obsidian-style frontmatter timestamp: "YYYY-MM-DD HH:mm" (local).
  const now = new Date();
  return `${date} ${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
}

function counts(p: GradtrackPayload) {
  return {
    competencies: p.program.competencies.length,
    coursework: p.coursework.length,
    repos: p.repos.length,
    blog: p.blog.length,
    announcements: p.announcements.length,
    coverage_filled: p.coverage.filter((c) => c.artifact_count > 0).length,
    coverage_total: p.coverage.length,
    days_remaining: p.graduation.days_remaining,
  };
}

function renderChecklistSection(checklist: ChecklistRow[]): string {
  if (checklist.length === 0) return '## Requirements\n\n_(no items yet)_\n';
  const lines: string[] = ['## Requirements', ''];
  for (const c of checklist) {
    const box = c.status === 'done' ? 'x' : c.status === 'in-progress' ? '~' : ' ';
    lines.push(`- [${box}] **${c.label}** - ${c.description}`);
  }
  return lines.join('\n') + '\n';
}

export interface ChecklistRow {
  id: string;
  label: string;
  description: string;
  status: 'todo' | 'in-progress' | 'done';
}

function renderCoverageSection(p: GradtrackPayload): string {
  const lines: string[] = ['## Coverage by competency', ''];
  for (const comp of p.program.competencies) {
    const entry = p.coverage.find((c) => c.competency_id === comp.id);
    const n = entry?.artifact_count ?? 0;
    const status = n === 0 ? '✗' : n >= 2 ? '✓✓' : '✓';
    lines.push(`- ${status} \`${comp.id}\` ${comp.label} (${n} artifact${n === 1 ? '' : 's'})`);
  }
  return lines.join('\n') + '\n';
}

function renderArtifactSection(p: GradtrackPayload): string {
  const lines: string[] = ['## Artifacts', '', '### Coursework'];
  for (const c of p.coursework) {
    lines.push(`- [${c.course_code}] ${c.title} - ${c.semester} (${c.status})`);
  }
  lines.push('', '### Blog (gold + silver tier)');
  for (const b of p.blog.filter((x) => x.tier === 'gold' || x.tier === 'silver')) {
    lines.push(`- [${b.tier}] ${b.title} (${b.word_count} words, ${b.pub_date ?? 'undated'})`);
  }
  lines.push('', '### Repos');
  for (const r of p.repos.filter((x) => x.is_security_themed)) {
    lines.push(`- [${r.visibility}] **${r.name}** - ${r.description ?? '(no description)'}`);
  }
  return lines.join('\n') + '\n';
}

function renderAnnouncementSection(p: GradtrackPayload): string {
  const lines: string[] = ['## Recent course announcements', ''];
  if (p.announcements.length === 0) {
    lines.push('_(no announcements with graduation keywords)_');
    return lines.join('\n') + '\n';
  }
  for (const a of p.announcements.slice(0, 8)) {
    const kw = a.graduation_keywords.length > 0
      ? ` _[${a.graduation_keywords.join(', ')}]_`
      : '';
    lines.push(`- **${a.title}**${kw}`);
    if (a.posted_at) lines.push(`  posted ${a.posted_at}`);
    if (a.summary) lines.push(`  ${a.summary.slice(0, 280)}`);
  }
  return lines.join('\n') + '\n';
}

export interface WriteOptions {
  checklist?: ChecklistRow[];
}

export function renderSnapshot(
  payload: GradtrackPayload,
  meta: SnapshotMeta,
  checklist: ChecklistRow[],
): string {
  const c = counts(payload);
  const frontmatter = [
    FRONTMATTER_DELIM,
    'tags:',
    '  - eportfolio',
    '  - gradtrack',
    `created: ${fmtCreated(meta.date)}`,
    `date: ${meta.date}`,
    `target_term: ${payload.graduation.target_term}`,
    `days_remaining: ${c.days_remaining}`,
    `competencies: ${c.competencies}`,
    `coverage: ${c.coverage_filled}/${c.coverage_total}`,
    `coursework: ${c.coursework}`,
    `repos: ${c.repos}`,
    `blog: ${c.blog}`,
    `announcements: ${c.announcements}`,
    `sources_ok_program: ${payload.sources_ok.program}`,
    `sources_ok_coursework: ${payload.sources_ok.coursework}`,
    `sources_ok_repos: ${payload.sources_ok.repos}`,
    `sources_ok_blog: ${payload.sources_ok.blog}`,
    `sources_ok_canvas: ${payload.sources_ok.canvas}`,
    FRONTMATTER_DELIM,
    '',
    SNAPSHOT_VERSION_LINE,
    '',
    `# ePortfolio status - ${meta.date}`,
    '',
    `**${payload.program.degree}** - target ${payload.graduation.target_term} (${c.days_remaining} days remaining)`,
    '',
  ].join('\n');

  const body = [
    renderChecklistSection(checklist),
    renderCoverageSection(payload),
    renderArtifactSection(payload),
    renderAnnouncementSection(payload),
  ].join('\n');

  const tail = `${JSON_TAIL_OPEN}${JSON.stringify(payload, null, 2)}${JSON_TAIL_CLOSE}`;

  return `${frontmatter}\n${body}\n${tail}`;
}

// Writes the markdown snapshot to <outDir>/<date>.md and returns the path.
export function writeSnapshot(
  payload: GradtrackPayload,
  meta: SnapshotMeta,
  checklist: ChecklistRow[],
  outDir: string,
): string {
  mkdirSync(outDir, { recursive: true });
  const md = renderSnapshot(payload, meta, checklist);
  const outPath = join(outDir, `${meta.date}.md`);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, md, 'utf8');
  return outPath;
}
