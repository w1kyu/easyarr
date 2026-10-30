import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createLogger, registerSecrets } from './logger.js';

function capture() {
  const lines: string[] = [];
  const dest = new Writable({
    write(chunk: Buffer, _enc, cb) {
      lines.push(chunk.toString());
      cb();
    },
  });
  return { log: createLogger('info', dest), output: () => lines.join('') };
}

describe('logger', () => {
  it('redacts secret fields and registered secrets in messages', () => {
    const key = 'feedfacefeedfacefeedfacefeedface';
    registerSecrets([key]);
    const { log, output } = capture();
    log.info({ apiKey: key, port: 8989, url: `http://x/api?apikey=${key}` }, `calling with ${key}`);
    const out = output();
    expect(out).not.toContain(key);
    expect(out).toContain('8989');
    expect(out).toContain('[redacted]');
  });
});
