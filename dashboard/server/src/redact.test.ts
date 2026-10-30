import { describe, expect, it } from 'vitest';
import { isSecretKey, REDACTED, redact, redactString } from './redact.js';

describe('redact', () => {
  it('replaces values of secret-looking keys, deeply', () => {
    const input = {
      apiKey: 'abc123456',
      nested: { password: 'hunter22', user: 'bob', list: [{ token: 'tok-123456' }] },
      WIREGUARD_PRIVATE_KEY: 'wOEI9rqq',
      nzb_key: 'nzbnzbnzb',
    };
    expect(redact(input)).toEqual({
      apiKey: REDACTED,
      nested: { password: REDACTED, user: 'bob', list: [{ token: REDACTED }] },
      WIREGUARD_PRIVATE_KEY: REDACTED,
      nzb_key: REDACTED,
    });
  });

  it('masks known secrets inside free text', () => {
    const key = '0123456789abcdef0123456789abcdef';
    expect(redactString(`GET /api?apikey=${key} failed`, [key])).toBe(
      `GET /api?apikey=${REDACTED} failed`,
    );
    expect(redact({ msg: `key ${key}` }, [key])).toEqual({ msg: `key ${REDACTED}` });
  });

  it('does not mask very short secrets inside text (false positives)', () => {
    expect(redactString('a b c', ['b'])).toBe('a b c');
  });

  it('never mutates its input and survives cycles', () => {
    const input: Record<string, unknown> = { password: 'secret!!', ok: 1 };
    input['self'] = input;
    const out = redact(input) as Record<string, unknown>;
    expect(input['password']).toBe('secret!!');
    expect(out['password']).toBe(REDACTED);
    expect(out['self']).toBe(out);
  });

  it('redacts error messages and stacks', () => {
    const key = 'supersecretvalue';
    const out = redact({ err: new Error(`bad ${key}`) }, [key]) as { err: { message: string } };
    expect(out.err.message).toBe(`bad ${REDACTED}`);
  });

  it('leaves empty secret values alone (nothing to hide)', () => {
    expect(redact({ password: '' })).toEqual({ password: '' });
  });

  it('classifies keys', () => {
    for (const k of [
      'password',
      'API_KEY',
      'apikey',
      'x-api-key',
      'secret',
      'Authorization',
      'cookie',
    ]) {
      expect(isSecretKey(k)).toBe(true);
    }
    for (const k of ['port', 'host', 'name', 'urlBase']) expect(isSecretKey(k)).toBe(false);
  });
});
