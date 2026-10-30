/**
 * Secret redaction (CLAUDE.md: secrets never in logs or diagnostics).
 * Two layers: values of secret-looking keys are replaced, and any known secret string
 * (API keys, VPN keys, …) is masked wherever it appears inside other strings.
 */
export const REDACTED = '[redacted]';

const SECRET_KEY =
  /(pass(word|phrase)?|secret|token|api[-_]?key|apikey|nzb[-_]?key|private[-_]?key|preshared|credential|cookie|authorization|session)/i;

/** Secrets shorter than this are not masked inside free text (too many false positives). */
const MIN_SECRET_LENGTH = 6;

export function isSecretKey(key: string): boolean {
  return SECRET_KEY.test(key);
}

export function redactString(text: string, secrets: readonly string[] = []): string {
  let out = text;
  for (const secret of secrets) {
    if (secret.length < MIN_SECRET_LENGTH) continue;
    out = out.split(secret).join(REDACTED);
  }
  return out;
}

/** Returns a redacted deep copy; never mutates the input. Handles cycles. */
export function redact<T>(value: T, secrets: readonly string[] = []): T {
  const seen = new WeakMap<object, unknown>();
  const walk = (v: unknown, key?: string): unknown => {
    if (key !== undefined && isSecretKey(key) && v !== null && v !== undefined && v !== '') {
      return typeof v === 'object' ? walkObject(v as object) : REDACTED;
    }
    if (typeof v === 'string') return redactString(v, secrets);
    if (v === null || typeof v !== 'object') return v;
    return walkObject(v);
  };
  const walkObject = (obj: object): unknown => {
    if (seen.has(obj)) return seen.get(obj);
    if (obj instanceof Error) {
      const copy: Record<string, unknown> = { name: obj.name, message: walk(obj.message) };
      if (obj.stack) copy['stack'] = walk(obj.stack);
      seen.set(obj, copy);
      return copy;
    }
    if (Array.isArray(obj)) {
      const arr: unknown[] = [];
      seen.set(obj, arr);
      for (const item of obj) arr.push(walk(item));
      return arr;
    }
    const out: Record<string, unknown> = {};
    seen.set(obj, out);
    for (const [k, v] of Object.entries(obj)) out[k] = walk(v, k);
    return out;
  };
  return walk(value) as T;
}
