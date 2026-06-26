// Program info source. The competencies and comprehensive-exam rules come
// from the config file (config.program). This source optionally enriches the
// total_credits and exam notes from a plain-text/markdown "program info" file
// (for example an exported program handbook). It no-ops gracefully when the
// program-info source is disabled or the file is missing.

import { existsSync, readFileSync } from 'node:fs';
import type { ProgramInfo } from '../types.js';
import { loadConfig } from '../config.js';
import { log } from '../lib/log.js';

function findCompExamSection(md: string): string {
  const start = md.indexOf('## COMPREHENSIVE EXAM');
  if (start < 0) return '';
  const remainder = md.slice(start);
  const nextHeader = remainder.slice('## COMPREHENSIVE EXAM'.length).indexOf('\n## ');
  return nextHeader > 0
    ? remainder.slice(0, '## COMPREHENSIVE EXAM'.length + nextHeader).trim()
    : remainder.trim();
}

function extractTotalCredits(md: string): number | null {
  const m = md.match(/Total Minimum Hours[^0-9]*([0-9]+)/i);
  return m && m[1] ? parseInt(m[1], 10) : null;
}

export interface ProgramInfoResult {
  ok: boolean;
  program: ProgramInfo;
  reason?: string;
}

export function loadProgramInfo(): ProgramInfoResult {
  const cfg = loadConfig();
  // The config is the source of truth for the program shape.
  const program: ProgramInfo = {
    ...cfg.program,
    competencies: cfg.program.competencies.map((c) => ({ ...c })),
    comp_exam_rules: {
      ...cfg.program.comp_exam_rules,
      rubric_dimensions: [...cfg.program.comp_exam_rules.rubric_dimensions],
      notes: [...cfg.program.comp_exam_rules.notes],
    },
  };

  const src = cfg.sources.programInfo;
  if (!src.enabled || !src.path) {
    return { ok: true, program };
  }
  if (!existsSync(src.path)) {
    log.warn({ path: src.path }, 'program-info.file-missing');
    return { ok: true, program, reason: `program info file missing: ${src.path}` };
  }

  // Enrich from the file: pull total credits and a few comprehensive-exam
  // notes if present, without overriding what config already supplied.
  const md = readFileSync(src.path, 'utf8');
  const credits = extractTotalCredits(md);
  if (credits !== null) program.total_credits = credits;

  const compSection = findCompExamSection(md);
  if (compSection) {
    const compLines = compSection
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('##'));
    if (compLines.length > 0 && program.comp_exam_rules.notes.length === 0) {
      program.comp_exam_rules.notes = compLines.slice(0, 5);
    }
  }
  program.source_path = src.path;
  return { ok: true, program };
}
