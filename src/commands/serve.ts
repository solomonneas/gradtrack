import { spawn } from 'node:child_process';
import { log } from '../lib/log.js';
import { SITE_DIR } from '../lib/paths.js';
import { loadConfig } from '../config.js';

export async function runServe(): Promise<number> {
  const cfg = loadConfig();
  const port = cfg.site.port;
  log.info({ siteDir: SITE_DIR, port }, 'serve.starting');
  process.stdout.write(`gradtrack site dev server: http://localhost:${port}\n`);
  return new Promise((resolve) => {
    const child = spawn('pnpm', ['exec', 'astro', 'dev', '--port', String(port)], {
      cwd: SITE_DIR,
      stdio: 'inherit',
    });
    child.on('exit', (code) => resolve(code ?? 1));
    child.on('error', (err) => {
      log.error({ err: String(err) }, 'serve.spawn-failed');
      resolve(2);
    });
  });
}
