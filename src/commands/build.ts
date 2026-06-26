import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { log } from '../lib/log.js';
import { SITE_DIR, SITE_SNAPSHOT_JSON } from '../lib/paths.js';

export async function runBuild(): Promise<number> {
  if (!existsSync(SITE_SNAPSHOT_JSON)) {
    process.stderr.write(`no site data at ${SITE_SNAPSHOT_JSON} - run \`gradtrack sync\` first\n`);
    return 2;
  }
  log.info({ siteDir: SITE_DIR }, 'build.starting');
  return await runIn(SITE_DIR, 'pnpm', ['exec', 'astro', 'build']);
}

function runIn(cwd: string, cmd: string, args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, stdio: 'inherit' });
    child.on('exit', (code) => resolve(code ?? 1));
    child.on('error', (err) => {
      log.error({ err: String(err) }, 'build.spawn-failed');
      resolve(2);
    });
  });
}
