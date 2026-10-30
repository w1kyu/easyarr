import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';

describe('password hashing', () => {
  it('hashes with scrypt, a random salt, and verifies', async () => {
    const a = await hashPassword('summer-rain7');
    const b = await hashPassword('summer-rain7');
    expect(a).toMatch(/^scrypt\$16384\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain('summer');
    expect(await verifyPassword('summer-rain7', a)).toBe(true);
    expect(await verifyPassword('summer-rain8', a)).toBe(false);
  });

  it('treats composed and decomposed Unicode the same', async () => {
    const hash = await hashPassword('Kaffee-mit-Milch-\u00e4');
    expect(await verifyPassword('Kaffee-mit-Milch-a\u0308', hash)).toBe(true);
  });

  it('rejects malformed hashes instead of throwing', async () => {
    for (const bad of ['', 'plain', 'scrypt$1$2$3', 'bcrypt$a$b$c$d$e', 'scrypt$x$8$1$AAAA$AAAA']) {
      expect(await verifyPassword('x', bad)).toBe(false);
    }
  });
});
