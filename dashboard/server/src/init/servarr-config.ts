/**
 * Servarr (Sonarr/Radarr/Lidarr/Prowlarr) config.xml: a flat `<Config><Key>value</Key>…</Config>` file.
 * We only touch the keys we own and keep everything else (including order) intact.
 */
export type XmlConfig = Map<string, string>;

const ENTRY = /<([A-Za-z][\w]*)>([\s\S]*?)<\/\1>|<([A-Za-z][\w]*)\s*\/>/g;

export function parseServarrConfig(xml: string): XmlConfig {
  const body = /<Config>([\s\S]*)<\/Config>/.exec(xml);
  if (!body) throw new Error('Not a Servarr config.xml (missing <Config>)');
  const map: XmlConfig = new Map();
  for (const m of (body[1] ?? '').matchAll(ENTRY)) {
    if (m[1] !== undefined) map.set(m[1], decode(m[2] ?? ''));
    else if (m[3] !== undefined) map.set(m[3], '');
  }
  return map;
}

export function serializeServarrConfig(config: XmlConfig): string {
  const lines = [...config].map(([k, v]) => `  <${k}>${encode(v)}</${k}>`);
  return `<Config>\n${lines.join('\n')}\n</Config>\n`;
}

function encode(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function decode(v: string): string {
  return v.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
