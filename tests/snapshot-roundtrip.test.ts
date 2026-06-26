import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeSnapshot, renderSnapshot } from '../src/snapshot/writer.js';
import { parseSnapshot } from '../src/snapshot/reader.js';
import type { GradtrackPayload, SnapshotMeta } from '../src/types.js';

const fixturePayload: GradtrackPayload = {
  fetched_at: '2026-05-19T12:00:00Z',
  program: {
    degree: 'M.S. in Example Program',
    total_credits: 30,
    competencies: [
      {
        id: 'competency-1',
        group: 'core',
        label: 'First competency',
        description: 'Demonstrate the first program competency.',
        source_path: 'config',
      },
    ],
    comp_exam_rules: {
      timing: 'graduation term',
      rubric_dimensions: ['Content', 'Critical Thinking'],
      notes: [],
    },
    source_path: 'config',
  },
  coursework: [
    {
      id: 'abc-1234-final',
      kind: 'paper',
      course_code: 'ABC 1234',
      course_name: 'Example Course',
      title: 'Example final paper',
      semester: 'Fall 2025',
      status: 'completed',
      summary: 'A representative final paper.',
      obsidian_path: '/fake/path.md',
      competency_hints: ['competency-1'],
    },
  ],
  repos: [],
  blog: [],
  announcements: [],
  coverage: [
    { competency_id: 'competency-1', artifact_count: 1, artifact_ids: ['paper:abc-1234-final'] },
  ],
  graduation: {
    target_term: 'Fall 2026',
    target_date: '2026-11-12',
    days_remaining: 207,
  },
  sources_ok: {
    program: true,
    coursework: true,
    repos: true,
    blog: true,
    canvas: true,
  },
};

const meta: SnapshotMeta = {
  date: '2026-05-19',
  generatedAt: '2026-05-19T12:00:00Z',
};

describe('snapshot round-trip', () => {
  it('renders + parses identically', () => {
    const md = renderSnapshot(fixturePayload, meta, []);
    expect(md).toContain('gradtrack-snapshot-version: 1');
    expect(md).toContain('# ePortfolio status - 2026-05-19');
    const parsed = parseSnapshot(md);
    expect(parsed).toEqual(fixturePayload);
  });

  it('writes to disk and re-reads', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gradtrack-'));
    const path = writeSnapshot(fixturePayload, meta, [
      { id: 'c1', label: 'Apply for graduation', description: 'Submit the application.', status: 'todo' },
    ], dir);
    const md = readFileSync(path, 'utf8');
    expect(md).toContain('Apply for graduation');
    const parsed = parseSnapshot(md);
    expect(parsed.program.degree).toContain('Example Program');
  });

  it('throws on missing JSON tail', () => {
    expect(() => parseSnapshot('# no tail here')).toThrow(/JSON tail/);
  });
});
