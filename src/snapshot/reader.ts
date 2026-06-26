// Parse a gradtrack snapshot markdown file back into a GradtrackPayload.
// The fenced JSON tail is the source of truth; the human-readable body is
// derived and discarded on read.

import { readFileSync } from 'node:fs';
import type { GradtrackPayload } from '../types.js';
import { JSON_TAIL_OPEN, JSON_TAIL_CLOSE } from './format.js';

export function parseSnapshot(md: string): GradtrackPayload {
  const openIdx = md.indexOf(JSON_TAIL_OPEN);
  if (openIdx < 0) throw new Error('snapshot has no JSON tail');
  const jsonStart = openIdx + JSON_TAIL_OPEN.length;
  const jsonEnd = md.indexOf(JSON_TAIL_CLOSE, jsonStart);
  if (jsonEnd < 0) throw new Error('snapshot JSON tail not closed');
  const jsonText = md.slice(jsonStart, jsonEnd);
  return JSON.parse(jsonText) as GradtrackPayload;
}

export function readSnapshot(path: string): GradtrackPayload {
  return parseSnapshot(readFileSync(path, 'utf8'));
}
