// Lightweight typed loader for the JSON written by `gradtrack sync`.
// Imports happen at build/render time; Astro inlines the JSON into output.

import payload from '../data/snapshot.json';
import state from '../data/state.json';
import themeData from '../data/theme.json';

export interface Competency {
  id: string;
  group: 'core' | 'concentration' | 'other';
  label: string;
  description: string;
  source_path: string;
}

export interface CourseworkArtifact {
  id: string;
  kind: 'paper' | 'project' | 'final';
  course_code: string;
  course_name: string | null;
  title: string;
  semester: string;
  status: 'completed' | 'in-progress' | 'planned';
  summary: string | null;
  obsidian_path: string;
  competency_hints: string[];
}

export interface GitHubRepo {
  name: string;
  url: string;
  description: string | null;
  visibility: 'public' | 'private';
  primary_language: string | null;
  pushed_at: string;
  star_count: number;
  is_security_themed: boolean;
  is_shipped: boolean;
}

export interface BlogPost {
  slug: string;
  title: string;
  collection: 'blog' | 'intel';
  pub_date: string | null;
  word_count: number;
  tags: string[];
  tier: 'gold' | 'silver' | 'bronze';
  is_security_themed: boolean;
  content_path: string;
  excerpt: string;
}

export interface CanvasAnnouncement {
  notification_id: string;
  course_id: string;
  course_code: string;
  course_name: string;
  kind: string;
  title: string;
  summary: string;
  url: string;
  posted_at: string | null;
  labels: string[];
  graduation_keywords: string[];
}

export interface CoverageEntry {
  competency_id: string;
  artifact_count: number;
  artifact_ids: string[];
}

export interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  status: 'todo' | 'in-progress' | 'done';
  category: 'admin' | 'artifact' | 'review' | 'submission';
  updated_at: string | null;
  blocking: boolean;
}

export interface ThemeConfig {
  label: string;
  accent: string;
  accentSoft: string;
  accentAlt: string;
  accentAltSoft: string;
}

export interface GradtrackData {
  fetched_at: string;
  program: {
    degree: string;
    total_credits: number;
    competencies: Competency[];
    comp_exam_rules: {
      timing: string;
      rubric_dimensions: string[];
      notes: string[];
    };
    source_path: string;
  };
  coursework: CourseworkArtifact[];
  repos: GitHubRepo[];
  blog: BlogPost[];
  announcements: CanvasAnnouncement[];
  coverage: CoverageEntry[];
  graduation: {
    target_term: string;
    target_date: string;
    days_remaining: number;
  };
  sources_ok: {
    program: boolean;
    coursework: boolean;
    repos: boolean;
    blog: boolean;
    canvas: boolean;
  };
}

export const data = payload as unknown as GradtrackData;
export const checklist = state as unknown as ChecklistItem[];
export const theme = themeData as unknown as ThemeConfig;

export function artifactsForCompetency(id: string) {
  const refs = data.coverage.find((c) => c.competency_id === id)?.artifact_ids ?? [];
  return refs.map((ref) => {
    const [kind, ...rest] = ref.split(':');
    const refId = rest.join(':');
    if (kind === 'blog') {
      const post = data.blog.find((b) => b.slug === refId);
      return post ? { kind: 'blog' as const, post } : null;
    }
    if (kind === 'repo') {
      const repo = data.repos.find((r) => r.name === refId);
      return repo ? { kind: 'repo' as const, repo } : null;
    }
    const art = data.coursework.find((c) => c.id === refId);
    return art ? { kind: 'paper' as const, art } : null;
  }).filter((x): x is NonNullable<typeof x> => x !== null);
}
