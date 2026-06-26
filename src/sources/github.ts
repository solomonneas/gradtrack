// Lists a user's GitHub repos via the `gh` CLI as portfolio artifacts. The
// username comes from the config. Optionally tags "security-themed" repos by
// keyword (config.sources.github.securityThemed) for security/intelligence
// programs; otherwise every non-fork repo is treated as a portfolio repo.
// This source is optional and no-ops gracefully when disabled or `gh` is
// unavailable.

import { execFileSync } from 'node:child_process';
import type { GitHubRepo } from '../types.js';
import { loadConfig } from '../config.js';
import { log } from '../lib/log.js';

// Keyword set used only when securityThemed mode is enabled.
const SECURITY_KEYWORDS = [
  'security', 'cyber', 'threat', 'intel', 'osint', 'soc', 'siem', 'malware',
  'vuln', 'cve', 'forensics', 'incident', 'ids', 'ips', 'edr', 'xdr', 'ioc',
  'recon', 'apt',
];

interface GhRepoRow {
  name: string;
  description: string | null;
  url: string;
  visibility: 'PUBLIC' | 'PRIVATE';
  primaryLanguage: { name: string } | null;
  pushedAt: string;
  stargazerCount: number;
  isFork: boolean;
}

function ghReposJson(username: string, visibility: 'public' | 'private'): GhRepoRow[] {
  try {
    const out = execFileSync(
      'gh',
      [
        'repo', 'list', username,
        '--visibility', visibility,
        '--limit', '200',
        '--json', 'name,description,url,visibility,primaryLanguage,pushedAt,stargazerCount,isFork',
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return JSON.parse(out) as GhRepoRow[];
  } catch (err) {
    log.warn({ err: String(err), visibility }, 'github.gh-failed');
    return [];
  }
}

function isSecurityThemed(name: string, description: string | null): boolean {
  const hay = `${name} ${description ?? ''}`.toLowerCase();
  return SECURITY_KEYWORDS.some((kw) => hay.includes(kw));
}

function daysSince(iso: string): number {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return Number.MAX_SAFE_INTEGER;
  return Math.floor((Date.now() - t) / 86_400_000);
}

export interface GitHubResult {
  ok: boolean;
  repos: GitHubRepo[];
  reason?: string;
}

export function loadRepos(): GitHubResult {
  const cfg = loadConfig();
  const src = cfg.sources.github;
  if (!src.enabled || !src.username) {
    return { ok: true, repos: [], reason: 'github source disabled' };
  }
  const username = src.username;
  const securityMode = src.securityThemed === true;

  const pubRows = ghReposJson(username, 'public');
  const privRows = ghReposJson(username, 'private');
  if (pubRows.length === 0 && privRows.length === 0) {
    return { ok: false, repos: [], reason: 'gh returned no repos (auth?)' };
  }

  const all = [...pubRows, ...privRows]
    .filter((r) => !r.isFork)
    .map<GitHubRepo>((r) => {
      // When security mode is off, every repo is a portfolio repo (the site
      // surfaces all of them); the flag also drives the coverage heuristic.
      const themed = securityMode ? isSecurityThemed(r.name, r.description) : true;
      return {
        name: r.name,
        url: r.url,
        description: r.description,
        visibility: r.visibility.toLowerCase() as 'public' | 'private',
        primary_language: r.primaryLanguage?.name ?? null,
        pushed_at: r.pushedAt,
        star_count: r.stargazerCount,
        is_security_themed: themed,
        is_shipped: daysSince(r.pushedAt) < 90,
      };
    })
    .sort((a, b) => b.pushed_at.localeCompare(a.pushed_at));

  return { ok: true, repos: all };
}
