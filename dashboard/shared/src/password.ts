/**
 * A small, dependency-free password strength estimate for the account step (D-036).
 * Not a security boundary on its own — it nudges beginners away from guessable passwords.
 *
 * Scores: 0 = too short, 1 = weak, 2 = okay, 3 = good, 4 = strong.
 */
export type PasswordScore = 0 | 1 | 2 | 3 | 4;

/** Lowest score the wizard accepts. */
export const PASSWORD_MIN_SCORE: PasswordScore = 2;

export interface PasswordStrength {
  score: PasswordScore;
  /** i18n key suffixes (`password.hint.*`) explaining what would make it stronger. */
  hints: PasswordHint[];
}

export type PasswordHint = 'length' | 'common' | 'username' | 'variety' | 'pattern';

// Most common passwords and words people build them from (lower case, without digits/symbols).
const COMMON = new Set([
  'password',
  'passwort',
  'qwerty',
  'qwertz',
  'azerty',
  'letmein',
  'welcome',
  'iloveyou',
  'admin',
  'administrator',
  'monkey',
  'dragon',
  'football',
  'baseball',
  'sunshine',
  'princess',
  'shadow',
  'master',
  'superman',
  'batman',
  'trustno',
  'whatever',
  'starwars',
  'hello',
  'freedom',
  'secret',
  'login',
  'abc',
  'qwertyuiop',
  'asdfgh',
  'asdfghjkl',
  'zxcvbn',
  'changeme',
  'default',
  'test',
  'guest',
  'user',
  'root',
  'jellyfin',
  'easyarr',
  'umbrel',
  'media',
  'movies',
  'netflix',
  'plex',
]);

const SEQUENCES = ['abcdefghijklmnopqrstuvwxyz', '01234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

function hasSequence(pw: string, length = 4): boolean {
  const lower = pw.toLowerCase();
  for (const seq of SEQUENCES) {
    const both = [seq, [...seq].reverse().join('')];
    for (const s of both) {
      for (let i = 0; i + length <= s.length; i++) {
        if (lower.includes(s.slice(i, i + length))) return true;
      }
    }
  }
  return false;
}

function charsetSize(pw: string): number {
  let size = 0;
  if (/[a-z]/.test(pw)) size += 26;
  if (/[A-Z]/.test(pw)) size += 26;
  if (/[0-9]/.test(pw)) size += 10;
  if (/[^A-Za-z0-9]/.test(pw)) size += 33;
  return size;
}

export function passwordStrength(pw: string, username = ''): PasswordStrength {
  const hints: PasswordHint[] = [];
  if (pw.length < 8) return { score: 0, hints: ['length'] };

  // "Password123!" → "password"; also catches leetspeak-free variants with digits/symbols around them.
  const core = pw.toLowerCase().replace(/[^a-z]/g, '');
  const isCommon = COMMON.has(core) || COMMON.has(pw.toLowerCase()) || /^\d+$/.test(pw);
  const user = username.trim().toLowerCase();
  const containsUser = user.length >= 3 && pw.toLowerCase().includes(user);
  if (isCommon) hints.push('common');
  if (containsUser) hints.push('username');
  if (isCommon || containsUser) return { score: 1, hints };

  // Effective length: repeated characters ("aaaa") and keyboard/alphabet runs count less.
  const unique = new Set(pw).size;
  let effective = Math.min(pw.length, unique * 2);
  const sequence = hasSequence(pw);
  if (sequence) {
    effective -= 3;
    hints.push('pattern');
  } else if (unique < pw.length / 2) {
    hints.push('pattern');
  }
  const bits = Math.max(0, effective) * Math.log2(Math.max(charsetSize(pw), 10));
  if (charsetSize(pw) <= 26 && pw.length < 16) hints.push('variety');
  if (pw.length < 12) hints.push('length');

  const score: PasswordScore = bits < 40 ? 1 : bits < 60 ? 2 : bits < 80 ? 3 : 4;
  return { score, hints: score === 4 ? [] : hints };
}
