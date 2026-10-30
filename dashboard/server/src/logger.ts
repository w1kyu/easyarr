import pino, { type DestinationStream, type Logger } from 'pino';
import { redact, redactString } from './redact.js';

/** Known secret values (API keys etc.), registered once they are loaded. */
const knownSecrets = new Set<string>();

export function registerSecrets(values: Iterable<string>): void {
  for (const v of values) if (v) knownSecrets.add(v);
}

export function createLogger(level: string, destination?: DestinationStream): Logger {
  const options: pino.LoggerOptions = {
    level,
    base: null,
    formatters: {
      level: (label) => ({ level: label }),
      log: (obj) => redact(obj, [...knownSecrets]),
    },
    hooks: {
      logMethod(args, method) {
        const cleaned = args.map((a) =>
          typeof a === 'string' ? redactString(a, [...knownSecrets]) : a,
        );
        method.apply(this, cleaned as Parameters<typeof method>);
      },
    },
  };
  return destination ? pino(options, destination) : pino(options);
}
