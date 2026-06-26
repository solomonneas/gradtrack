// Optional Canvas snapshot source. Reads daily Canvas snapshots written by an
// external tool (for example the sibling canvas-digest project) and surfaces
// course announcements that mention graduation / portfolio / capstone keywords.
//
// The snapshot files are markdown with a fenced JSON tail (the same framing
// gradtrack uses for its own snapshots), so this source parses that tail and
// shapes it into CanvasAnnouncement[]. Off unless configured.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CanvasAnnouncement } from '../types.js';
import { loadConfig } from '../config.js';
import { log } from '../lib/log.js';

const GRADUATION_KEYWORDS = [
  'graduation', 'graduate', 'portfolio', 'eportfolio', 'e-portfolio',
  'capstone', 'comprehensive', 'final semester', 'commencement', 'apply to graduate',
];

// Snapshot JSON-tail framing. Kept in sync with src/snapshot/format.ts so a
// Canvas snapshot tool that reuses the same delimiters can be parsed directly.
const JSON_TAIL_OPEN = '## Raw payload\n```json\n';
const JSON_TAIL_CLOSE = '\n```\n';

interface SnapshotNotification {
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
}

interface SnapshotCanvas {
  notifications?: SnapshotNotification[];
}

interface SnapshotPayloadShape {
  canvas?: SnapshotCanvas;
}

function parseJsonTail(md: string): SnapshotPayloadShape | null {
  const openIdx = md.indexOf(JSON_TAIL_OPEN);
  if (openIdx < 0) return null;
  const jsonStart = openIdx + JSON_TAIL_OPEN.length;
  const jsonEnd = md.indexOf(JSON_TAIL_CLOSE, jsonStart);
  if (jsonEnd < 0) return null;
  try {
    return JSON.parse(md.slice(jsonStart, jsonEnd)) as SnapshotPayloadShape;
  } catch {
    return null;
  }
}

function findRecentSnapshots(dir: string, limit: number): string[] {
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f));
  files.sort();
  return files.slice(-limit).map((f) => join(dir, f));
}

function keywordsIn(text: string): string[] {
  const hay = text.toLowerCase();
  return GRADUATION_KEYWORDS.filter((kw) => hay.includes(kw));
}

export interface CanvasResult {
  ok: boolean;
  announcements: CanvasAnnouncement[];
  snapshot_path: string | null;
  reason?: string;
}

export function loadAnnouncements(): CanvasResult {
  const cfg = loadConfig();
  const src = cfg.sources.canvas;
  if (!src.enabled || !src.snapshotDir) {
    return { ok: true, announcements: [], snapshot_path: null, reason: 'canvas source disabled' };
  }
  const canvasDir = src.snapshotDir;
  const courseId = src.courseId ?? null;
  const lookbackDays = src.lookbackDays ?? 60;

  const paths = findRecentSnapshots(canvasDir, lookbackDays);
  if (paths.length === 0) {
    log.warn({ canvasDir }, 'canvas.no-snapshot');
    return { ok: false, announcements: [], snapshot_path: null, reason: 'no canvas snapshot found' };
  }

  // Aggregate by notification_id - snapshot tools typically capture *new* items
  // per day, so older grad-track announcements only appear on the day they were
  // first posted.
  const seen = new Map<string, CanvasAnnouncement>();
  let last_used: string | null = null;
  for (const p of paths) {
    let md: string;
    try {
      md = readFileSync(p, 'utf8');
    } catch {
      continue;
    }
    const payload = parseJsonTail(md);
    if (!payload) continue;
    const notes = payload.canvas?.notifications ?? [];
    for (const n of notes) {
      // When a courseId is configured, only that course's announcements show.
      // Otherwise every course's announcements are considered.
      if (courseId && n.course_id !== courseId) continue;
      if (seen.has(n.notification_id)) continue;
      seen.set(n.notification_id, {
        ...n,
        graduation_keywords: keywordsIn(`${n.title}\n${n.summary}`),
      });
    }
    last_used = p;
  }

  const announcements = [...seen.values()].sort(
    (a, b) => (b.posted_at ?? '').localeCompare(a.posted_at ?? ''),
  );

  return { ok: true, announcements, snapshot_path: last_used };
}
