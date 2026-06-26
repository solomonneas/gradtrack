import type { ChecklistStatus } from '../types.js';
import { applyStatus, loadChecklist, saveChecklist } from '../state/checklist.js';
import { log } from '../lib/log.js';

export interface CheckOptions {
  id: string;
  status: ChecklistStatus;
}

export interface CheckResult {
  matched: boolean;
  total: number;
}

export async function runCheck(opts: CheckOptions): Promise<CheckResult> {
  const items = loadChecklist();
  const before = items.find((i) => i.id === opts.id);
  if (!before) {
    log.warn({ id: opts.id }, 'check.unknown-id');
    return { matched: false, total: items.length };
  }
  const next = applyStatus(items, opts);
  saveChecklist(next);
  log.info({ id: opts.id, status: opts.status, prev: before.status }, 'check.applied');
  return { matched: true, total: next.length };
}
