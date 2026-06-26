#!/usr/bin/env node
import { Command } from 'commander';
import type { ChecklistStatus } from './types.js';
import { runSync } from './commands/sync.js';
import { runDoctor } from './commands/doctor.js';
import { runCheck } from './commands/check.js';
import { runBuild } from './commands/build.js';
import { runServe } from './commands/serve.js';
import { log } from './lib/log.js';

const program = new Command();
program
  .name('gradtrack')
  .description('Track graduation requirements and ePortfolio progress from configurable sources into a single-pane status site.')
  .option('-c, --config <path>', 'path to a gradtrack config file (overrides GRADTRACK_CONFIG)')
  .hook('preAction', (thisCommand) => {
    const cfgPath = thisCommand.opts().config as string | undefined;
    if (cfgPath) process.env.GRADTRACK_CONFIG = cfgPath;
  });

program
  .command('doctor')
  .description('Validate config and the inputs of every enabled source')
  .action(async () => {
    const code = await runDoctor();
    process.exit(code);
  });

program
  .command('sync')
  .description('Refresh all enabled sources, optionally write a snapshot, emit site data')
  .option('--target <term>', 'graduation target term (e.g. "Fall 2026"); defaults to config')
  .action(async (opts: { target?: string }) => {
    try {
      const r = await runSync({ target_term: opts.target });
      process.stdout.write(
        `sync ok: date=${r.date} coverage=${r.coverage_filled}/${r.coverage_total} ` +
          `artifacts=${r.artifacts_total} days_remaining=${r.days_remaining}\n`,
      );
    } catch (err) {
      log.error({ err: String(err) }, 'sync.fatal');
      process.exit(2);
    }
  });

program
  .command('check <id>')
  .description('Toggle a requirement status: todo | in-progress | done')
  .requiredOption('--status <status>', 'todo, in-progress, or done')
  .action(async (id: string, opts: { status: string }) => {
    const status = opts.status as ChecklistStatus;
    if (!['todo', 'in-progress', 'done'].includes(status)) {
      process.stderr.write(`invalid status: ${status}\n`);
      process.exit(2);
    }
    const r = await runCheck({ id, status });
    if (!r.matched) {
      process.stderr.write(`no requirement with id "${id}"\n`);
      process.exit(1);
    }
    process.stdout.write(`check ok: id=${id} status=${status} (of ${r.total})\n`);
  });

program
  .command('build')
  .description('Build the static status site (run after sync)')
  .action(async () => {
    const code = await runBuild();
    process.exit(code);
  });

program
  .command('serve')
  .description('Start the Astro dev server on http://localhost:<port> (port from config)')
  .action(async () => {
    const code = await runServe();
    process.exit(code);
  });

program.parseAsync(process.argv).catch((err) => {
  log.error({ err: String(err) }, 'cli.fatal');
  process.exit(2);
});
