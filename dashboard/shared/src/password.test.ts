import { describe, expect, it } from 'vitest';
import { passwordStrength, PASSWORD_MIN_SCORE } from './password.js';

const score = (pw: string, user?: string) => passwordStrength(pw, user).score;

describe('passwordStrength', () => {
  it('rejects anything shorter than 8 characters', () => {
    expect(passwordStrength('Ab1!xyz')).toEqual({ score: 0, hints: ['length'] });
  });

  it('rates common passwords and their decorated variants as weak', () => {
    for (const pw of ['password', 'Password123!', 'qwertz2024', '12345678901', 'Jellyfin2026']) {
      expect(score(pw), pw).toBe(1);
    }
    expect(passwordStrength('Password123!').hints).toContain('common');
  });

  it('rates passwords containing the username as weak', () => {
    expect(passwordStrength('kevin-is-great-42', 'Kevin')).toEqual({
      score: 1,
      hints: ['username'],
    });
    // Very short usernames don't count (too many false positives).
    expect(score('xy-Plum-tree-Quartz', 'xy')).toBeGreaterThan(1);
  });

  it('penalises repeats and keyboard/alphabet runs', () => {
    expect(score('aaaaaaaaaa')).toBe(1);
    expect(score('abcdefgh')).toBe(1);
    expect(passwordStrength('zz1234zz99').hints).toContain('pattern');
  });

  it('accepts reasonable passwords and rewards length + variety', () => {
    expect(score('summer-rain7')).toBeGreaterThanOrEqual(PASSWORD_MIN_SCORE);
    expect(score('Tr0ub4dor&3')).toBe(3);
    expect(score('correct horse battery staple')).toBe(4);
    expect(passwordStrength('correct horse battery staple').hints).toEqual([]);
  });

  it('is monotonic for appended random characters (meter never drops while typing more)', () => {
    let prev = 0;
    const pw = 'gT7#vQ2!mZ9@rW4$';
    for (let i = 8; i <= pw.length; i++) {
      const s = score(pw.slice(0, i));
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });
});
