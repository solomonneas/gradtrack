import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseConfig } from '../src/config.js';

describe('config loader', () => {
  it('parses the shipped example config', () => {
    const raw = JSON.parse(
      readFileSync(join(__dirname, '..', 'gradtrack.config.example.json'), 'utf8'),
    );
    const cfg = parseConfig(raw, 'example');
    expect(cfg.requirements.length).toBeGreaterThan(0);
    expect(cfg.program.competencies.length).toBeGreaterThan(0);
    // Every source ships disabled in the example so it runs with no real data.
    expect(cfg.sources.github.enabled).toBe(false);
    expect(cfg.sources.obsidian.enabled).toBe(false);
    expect(cfg.sources.canvas.enabled).toBe(false);
    expect(cfg.sources.blog.enabled).toBe(false);
    expect(cfg.sources.programInfo.enabled).toBe(false);
    expect(cfg.snapshot.enabled).toBe(false);
  });

  it('falls back to safe defaults for an empty config', () => {
    const cfg = parseConfig({}, null);
    expect(cfg.requirements).toEqual([]);
    expect(cfg.program.competencies).toEqual([]);
    expect(cfg.graduation.target_term).toBe('Fall 2026');
    expect(cfg.theme.accent).toMatch(/^#/);
    expect(cfg.site.port).toBe(4321);
  });

  it('normalizes requirement and competency fields', () => {
    const cfg = parseConfig(
      {
        requirements: [
          { id: 'r1', label: 'Do a thing' },
          { id: '', label: 'dropped: no id' },
          { label: 'dropped: no id either' },
        ],
        program: {
          competencies: [{ id: 'c1', label: 'C One', group: 'bogus' }],
        },
      },
      null,
    );
    expect(cfg.requirements.map((r) => r.id)).toEqual(['r1']);
    expect(cfg.requirements[0]?.status).toBe('todo');
    expect(cfg.requirements[0]?.category).toBe('admin');
    expect(cfg.program.competencies[0]?.group).toBe('core');
  });
});
