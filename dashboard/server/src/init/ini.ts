/**
 * Minimal line-preserving INI editor for qBittorrent.conf and sabnzbd.ini.
 * Keeps comments, unknown keys and ordering; only the keys we set are changed.
 * Keys are matched exactly (qBittorrent uses backslashes, e.g. `WebUI\\Port`).
 */
export class IniFile {
  private lines: string[];

  constructor(text = '') {
    this.lines = text.length ? text.replace(/\r\n/g, '\n').split('\n') : [];
    if (this.lines.length && this.lines[this.lines.length - 1] === '') this.lines.pop();
  }

  private sectionRange(section: string): { start: number; end: number } | undefined {
    const header = `[${section}]`;
    const start = this.lines.findIndex((l) => l.trim() === header);
    if (start === -1) return undefined;
    let end = this.lines.length;
    for (let i = start + 1; i < this.lines.length; i++) {
      if (/^\s*\[.*\]\s*$/.test(this.lines[i] ?? '')) {
        end = i;
        break;
      }
    }
    return { start, end };
  }

  private findKey(section: string, key: string): number {
    const range = this.sectionRange(section);
    if (!range) return -1;
    for (let i = range.start + 1; i < range.end; i++) {
      const line = this.lines[i] ?? '';
      const eq = line.indexOf('=');
      if (eq > 0 && line.slice(0, eq).trim() === key) return i;
    }
    return -1;
  }

  get(section: string, key: string): string | undefined {
    const i = this.findKey(section, key);
    if (i === -1) return undefined;
    const line = this.lines[i] ?? '';
    return line.slice(line.indexOf('=') + 1).trim();
  }

  /** Sets a value. Returns true if the file changed. `sep` controls `k=v` vs `k = v`. */
  set(section: string, key: string, value: string, sep = '='): boolean {
    const i = this.findKey(section, key);
    if (i !== -1) {
      if (this.get(section, key) === value) return false;
      this.lines[i] = `${key}${sep}${value}`;
      return true;
    }
    let range = this.sectionRange(section);
    if (!range) {
      if (this.lines.length && (this.lines[this.lines.length - 1] ?? '').trim() !== '')
        this.lines.push('');
      this.lines.push(`[${section}]`);
      range = this.sectionRange(section);
      if (!range) throw new Error('unreachable');
    }
    // Insert after the last non-empty line of the section.
    let at = range.end;
    while (at > range.start + 1 && (this.lines[at - 1] ?? '').trim() === '') at--;
    this.lines.splice(at, 0, `${key}${sep}${value}`);
    return true;
  }

  /** Sets a value only if the key is missing. Returns true if the file changed. */
  setDefault(section: string, key: string, value: string, sep = '='): boolean {
    if (this.get(section, key) !== undefined) return false;
    return this.set(section, key, value, sep);
  }

  toString(): string {
    return `${this.lines.join('\n')}\n`;
  }
}
