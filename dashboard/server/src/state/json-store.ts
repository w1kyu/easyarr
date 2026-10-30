import type { z } from 'zod';
import { readFileIfExists, writeFileAtomic } from '../fs-util.js';
import { migrate, type Migration } from './migrations.js';

export interface JsonStoreOptions<T> {
  file: string;
  schema: z.ZodType<T>;
  version: number;
  migrations: readonly Migration[];
  defaults: () => T;
}

/**
 * A versioned JSON document on disk (chmod 600, atomic writes, schema-validated, migrated on load).
 * A corrupt or invalid file is never overwritten silently — loading throws so a human can look.
 */
export class JsonStore<T> {
  constructor(private readonly opts: JsonStoreOptions<T>) {}

  get file(): string {
    return this.opts.file;
  }

  /** Load the document, creating it with defaults if missing. `created` = file was just written. */
  async load(): Promise<{ value: T; created: boolean; migrated: boolean }> {
    const raw = await readFileIfExists(this.opts.file);
    if (raw === undefined) {
      const value = this.opts.defaults();
      await this.save(value);
      return { value, created: true, migrated: false };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error(`${this.opts.file} is not valid JSON: ${(err as Error).message}`, {
        cause: err,
      });
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`${this.opts.file} must contain a JSON object`);
    }
    const { doc, migrated } = migrate(
      parsed as Record<string, unknown>,
      this.opts.version,
      this.opts.migrations,
    );
    const result = this.opts.schema.safeParse(doc);
    if (!result.success) {
      throw new Error(`${this.opts.file} failed validation: ${result.error.message}`);
    }
    if (migrated) await this.save(result.data);
    return { value: result.data, created: false, migrated };
  }

  async save(value: T): Promise<void> {
    const checked = this.opts.schema.parse(value);
    await writeFileAtomic(this.opts.file, `${JSON.stringify(checked, null, 2)}\n`, 0o600);
  }
}
