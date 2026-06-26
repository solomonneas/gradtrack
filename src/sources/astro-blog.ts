// Reads one or more Astro-style markdown content collections (configured via
// config.sources.blog.dirs) and classifies posts into gold/silver/bronze tiers
// for portfolio inclusion. This source is optional and no-ops gracefully when
// disabled or unconfigured.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import type { BlogPost, Tier } from '../types.js';
import { loadConfig } from '../config.js';
import { log } from '../lib/log.js';

// Tags that bump an eligible long post to "gold" tier. Tuned for a
// security/intelligence portfolio but harmless for other programs.
const FLAGGED_TAGS = new Set([
  'threat-intel', 'apt', 'malware', 'cybersecurity', 'security', 'mitre-attack',
  'soc', 'siem', 'osint', 'incident-response', 'ransomware', 'supply-chain',
  'vulnerability', 'cve', 'zero-day', 'forensics', 'cti', 'opsec',
]);

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function tierFor(wc: number, isSec: boolean): Tier {
  if (wc >= 1500 && isSec) return 'gold';
  if (wc >= 800) return 'silver';
  return 'bronze';
}

function normalizeDate(value: unknown): string | null {
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return null;
}

function readCollection(dir: string, collection: 'blog' | 'intel'): BlogPost[] {
  if (!existsSync(dir)) {
    log.warn({ dir, collection }, 'astro-blog.dir-missing');
    return [];
  }
  const out: BlogPost[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.toLowerCase().endsWith('.md') && !name.toLowerCase().endsWith('.mdx')) continue;
    const full = join(dir, name);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (!st.isFile()) continue;
    let raw: string;
    try {
      raw = readFileSync(full, 'utf8');
    } catch {
      continue;
    }
    const parsed = matter(raw);
    const fm = parsed.data ?? {};
    const title =
      typeof fm.title === 'string' && fm.title.length > 0
        ? fm.title
        : name.replace(/\.mdx?$/i, '');
    const tags = Array.isArray(fm.tags)
      ? fm.tags.filter((t): t is string => typeof t === 'string')
      : [];
    const isSec = tags.some((t) => FLAGGED_TAGS.has(t.toLowerCase()));
    const wc = wordCount(parsed.content);
    const desc =
      typeof fm.description === 'string' && fm.description.length > 0
        ? fm.description
        : parsed.content.trim().split(/\n\s*\n/)[0]?.replace(/\s+/g, ' ').slice(0, 280) ?? '';
    out.push({
      slug: name.replace(/\.mdx?$/i, ''),
      title,
      collection,
      pub_date: normalizeDate(fm.pubDate ?? fm.publishedDate ?? fm.date),
      word_count: wc,
      tags,
      tier: tierFor(wc, isSec),
      is_security_themed: isSec,
      content_path: full,
      excerpt: desc,
    });
  }
  return out;
}

export interface AstroBlogResult {
  ok: boolean;
  posts: BlogPost[];
  reason?: string;
}

export function loadBlog(): AstroBlogResult {
  const cfg = loadConfig();
  const src = cfg.sources.blog;
  if (!src.enabled || !src.dirs || src.dirs.length === 0) {
    return { ok: true, posts: [], reason: 'blog source disabled' };
  }
  const posts: BlogPost[] = [];
  for (const d of src.dirs) {
    posts.push(...readCollection(d.path, d.collection));
  }
  if (posts.length === 0) {
    return { ok: false, posts, reason: 'no blog posts found' };
  }
  posts.sort((a, b) => (b.pub_date ?? '').localeCompare(a.pub_date ?? ''));
  return { ok: true, posts };
}
