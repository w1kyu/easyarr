import { Writable } from 'node:stream';
import { redactText, redactValue, type LogLine } from '@easyarr/shared';
import pino, { type DestinationStream, type Logger } from 'pino';
import { currentKnown } from './support/known.js';

export { registerSecrets } from './support/known.js';

/**
 * Every log line is redacted before it is written (SPEC §13, CLAUDE.md): values of secret-looking
 * fields, every secret/username/host EasyArr stores, and pattern matches (keys, tokens, e-mail
 * addresses, public IPs, external host names). Lines are written to stdout and kept in a small
 * in-memory buffer for the log viewer and the diagnostics bundle.
 */
export function createLogger(level: string, destination?: DestinationStream): Logger {
  const options: pino.LoggerOptions = {
    level,
    base: null,
    formatters: {
      level: (label) => ({ level: label }),
      log: (obj) => redactValue(obj, { known: currentKnown() }),
    },
    hooks: {
      logMethod(args, method) {
        const cleaned = args.map((a) =>
          typeof a === 'string' ? redactText(a, { known: currentKnown() }) : a,
        );
        method.apply(this, cleaned as Parameters<typeof method>);
      },
    },
  };
  return destination ? pino(options, destination) : pino(options);
}

/** The last `size` lines EasyArr logged (already redacted), for diagnostics and the log viewer. */
export class LogBuffer extends Writable {
  private readonly buf: string[] = [];
  private partial = '';

  constructor(private readonly size = 1000) {
    super();
  }

  override _write(chunk: Buffer | string, _enc: BufferEncoding, cb: (err?: Error | null) => void) {
    const text = this.partial + chunk.toString();
    const parts = text.split('\n');
    this.partial = parts.pop() ?? '';
    for (const p of parts) if (p.trim()) this.buf.push(p);
    if (this.buf.length > this.size) this.buf.splice(0, this.buf.length - this.size);
    cb();
  }

  /** Raw JSON lines, oldest first. */
  raw(): string[] {
    return [...this.buf];
  }

  /** Parsed for display: "message key=value …". */
  lines(limit = 200): LogLine[] {
    return this.buf.slice(-limit).map(parseLogLine);
  }
}

const LEVELS: Record<string, LogLine['level']> = {
  trace: 'debug',
  debug: 'debug',
  info: 'info',
  warn: 'warn',
  error: 'error',
  fatal: 'error',
};

export function parseLogLine(raw: string): LogLine {
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const { level, time, msg, ...rest } = o;
    const extra = Object.entries(rest)
      .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
      .join(' ');
    return {
      time: typeof time === 'number' ? new Date(time).toISOString() : null,
      level: LEVELS[String(level)] ?? 'info',
      message: [typeof msg === 'string' ? msg : '', extra].filter(Boolean).join(' '),
    };
  } catch {
    return { time: null, level: 'info', message: raw };
  }
}
