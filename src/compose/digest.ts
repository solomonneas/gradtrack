// Computes coverage (competency -> artifact references) from all sources and
// derives the graduation countdown from config.

import type {
  GradtrackPayload, BlogPost, GitHubRepo, CourseworkArtifact, CoverageEntry, Competency,
} from '../types.js';
import { loadConfig } from '../config.js';

// Builds the set of lowercase tokens that "name" a competency: its id and the
// words in its label. An artifact whose tags or text contain any of these
// tokens is heuristically mapped to that competency.
function competencyTokens(comp: Competency): string[] {
  const tokens = new Set<string>();
  for (const part of comp.id.toLowerCase().split(/[^a-z0-9]+/)) {
    if (part.length >= 3) tokens.add(part);
  }
  for (const part of comp.label.toLowerCase().split(/[^a-z0-9]+/)) {
    if (part.length >= 3) tokens.add(part);
  }
  return [...tokens];
}

function blogHints(post: BlogPost, competencies: Competency[]): string[] {
  const hay = `${post.title} ${post.excerpt} ${post.tags.join(' ')}`.toLowerCase();
  const hints: string[] = [];
  for (const comp of competencies) {
    if (competencyTokens(comp).some((tok) => hay.includes(tok))) {
      hints.push(comp.id);
    }
  }
  return [...new Set(hints)];
}

function repoHints(repo: GitHubRepo, competencies: Competency[]): string[] {
  const hay = `${repo.name} ${repo.description ?? ''}`.toLowerCase();
  const hints: string[] = [];
  for (const comp of competencies) {
    if (competencyTokens(comp).some((tok) => hay.includes(tok))) {
      hints.push(comp.id);
    }
  }
  return [...new Set(hints)];
}

export function computeCoverage(
  competencies: Competency[],
  coursework: CourseworkArtifact[],
  blog: BlogPost[],
  repos: GitHubRepo[],
): CoverageEntry[] {
  const buckets = new Map<string, CoverageEntry>();
  for (const c of competencies) {
    buckets.set(c.id, { competency_id: c.id, artifact_count: 0, artifact_ids: [] });
  }
  function push(competencyId: string, ref: string) {
    const entry = buckets.get(competencyId);
    if (!entry) return;
    if (entry.artifact_ids.includes(ref)) return;
    entry.artifact_ids.push(ref);
    entry.artifact_count = entry.artifact_ids.length;
  }
  // Coursework carries explicit competency hints (from the courseToCompetency
  // map in config); blog posts and repos are matched heuristically by name.
  for (const a of coursework) {
    for (const cid of a.competency_hints) push(cid, `${a.kind}:${a.id}`);
  }
  for (const b of blog) {
    for (const cid of blogHints(b, competencies)) push(cid, `blog:${b.slug}`);
  }
  for (const r of repos) {
    if (!r.is_security_themed) continue;
    for (const cid of repoHints(r, competencies)) push(cid, `repo:${r.name}`);
  }
  return [...buckets.values()];
}

function subtractDays(yyyymmdd: string, days: number): string {
  const d = new Date(`${yyyymmdd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function graduationFor(
  target: string,
  today: Date = new Date(),
): GradtrackPayload['graduation'] {
  const cfg = loadConfig();
  const m = target.match(/^(Spring|Summer|Fall)\s+(\d{4})$/i);
  if (!m || !m[1] || !m[2]) {
    return { target_term: target, target_date: '', days_remaining: 0 };
  }
  const key = m[1].toLowerCase();
  const termEndMd = cfg.graduation.term_ends[key] ?? '12-12';
  const termEnd = `${m[2]}-${termEndMd}`;
  // The countdown surfaces the portfolio deadline (term end minus the offset),
  // not the ceremony date.
  const targetDate = subtractDays(termEnd, cfg.graduation.deadline_offset_days);
  const days = Math.max(0, Math.ceil(
    (new Date(`${targetDate}T23:59:59Z`).getTime() - today.getTime()) / 86_400_000,
  ));
  return {
    target_term: `${m[1][0]!.toUpperCase()}${m[1].slice(1).toLowerCase()} ${m[2]}`,
    target_date: targetDate,
    days_remaining: days,
  };
}
