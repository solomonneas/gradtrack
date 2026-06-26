import pino from 'pino';

// JSON logs to stderr so a service manager (systemd journal etc.) captures
// them structured. The one-line summary is the only thing printed to stdout,
// so a scheduled runner can still grep the journal for it.
export const log = pino({
  level: process.env.GRADTRACK_LOG_LEVEL ?? 'info',
  base: { service: 'gradtrack' },
  timestamp: pino.stdTimeFunctions.isoTime,
});
