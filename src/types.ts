// gradtrack public types. The full GradtrackPayload is the canonical
// snapshot shape; everything downstream (Astro site, requirements UI) reads
// this and only this.

export type ArtifactKind = 'paper' | 'project' | 'blog' | 'intel' | 'repo';
export type ChecklistStatus = 'todo' | 'in-progress' | 'done';
export type Tier = 'gold' | 'silver' | 'bronze';

// ---- Program info (from config, optionally enriched by a program-info file) ----

export interface Competency {
  id: string;           // slug, e.g. "competency-1"
  group: 'core' | 'concentration' | 'other';
  label: string;        // short title
  description: string;  // 1-2 sentence definition
  source_path: string;  // where it came from (config, file:line, etc.)
}

export interface ProgramInfo {
  degree: string;            // "M.S. in Your Program"
  total_credits: number;
  competencies: Competency[];
  comp_exam_rules: {
    timing: string;          // e.g. "During the term in which you plan to graduate"
    rubric_dimensions: string[]; // e.g. ["Content", "Critical Thinking"]
    notes: string[];
  };
  source_path: string;
}

// ---- Coursework artifacts (from an Obsidian-style coursework folder) ----

export interface CourseworkArtifact {
  id: string;             // slug
  kind: 'paper' | 'project' | 'final';
  course_code: string;    // e.g. "ABC 1234"
  course_name: string | null;
  title: string;
  semester: string;       // "Fall 2025"
  status: 'completed' | 'in-progress' | 'planned';
  summary: string | null; // pulled from frontmatter or first paragraph
  obsidian_path: string;  // absolute path
  competency_hints: string[]; // heuristic-tagged competency ids
}

// ---- GitHub repos ----

export interface GitHubRepo {
  name: string;
  url: string;
  description: string | null;
  visibility: 'public' | 'private';
  primary_language: string | null;
  pushed_at: string;
  star_count: number;
  is_security_themed: boolean;   // keyword-tagged (only when securityThemed mode on)
  is_shipped: boolean;            // last push <90 days
}

// ---- Blog posts (from an Astro-style content collection) ----

export interface BlogPost {
  slug: string;
  title: string;
  collection: 'blog' | 'intel';
  pub_date: string | null;       // YYYY-MM-DD
  word_count: number;
  tags: string[];
  tier: Tier;                    // gold = >1500 words + flagged tag; silver = 800-1500; bronze otherwise
  is_security_themed: boolean;
  content_path: string;
  excerpt: string;               // first paragraph or summary
}

// ---- Canvas announcements (from an optional Canvas snapshot source) ----

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
  graduation_keywords: string[]; // matched: graduation, portfolio, capstone, comprehensive
}

// ---- Checklist (user-mutable state) ----

export interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  status: ChecklistStatus;
  category: 'admin' | 'artifact' | 'review' | 'submission';
  updated_at: string | null;
  blocking: boolean;             // surface above the fold if true
}

// ---- Coverage rollup ----

export interface CoverageEntry {
  competency_id: string;
  artifact_count: number;
  artifact_ids: string[];        // mixed kind+id refs, e.g. "paper:abc-1234-final"
}

// ---- Top-level payload ----

export interface GradtrackPayload {
  fetched_at: string;            // ISO 8601
  program: ProgramInfo;
  coursework: CourseworkArtifact[];
  repos: GitHubRepo[];
  blog: BlogPost[];
  announcements: CanvasAnnouncement[];
  coverage: CoverageEntry[];
  graduation: {
    target_term: string;         // "Fall 2026"
    target_date: string;         // YYYY-MM-DD, end-of-term approximation
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

export interface SnapshotMeta {
  date: string;            // YYYY-MM-DD
  generatedAt: string;     // ISO 8601
}
