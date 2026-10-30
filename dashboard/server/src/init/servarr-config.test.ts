import { describe, expect, it } from 'vitest';
import { parseServarrConfig, serializeServarrConfig } from './servarr-config.js';

const SAMPLE = `<Config>
  <BindAddress>*</BindAddress>
  <Port>8989</Port>
  <SslPort>9898</SslPort>
  <ApiKey>0123456789abcdef0123456789abcdef</ApiKey>
  <UrlBase></UrlBase>
  <InstanceName>My &amp; Sonarr</InstanceName>
  <SslCertPath />
</Config>`;

describe('servarr config.xml', () => {
  it('parses flat keys including empty and self-closing ones', () => {
    const c = parseServarrConfig(SAMPLE);
    expect(c.get('Port')).toBe('8989');
    expect(c.get('UrlBase')).toBe('');
    expect(c.get('SslCertPath')).toBe('');
    expect(c.get('InstanceName')).toBe('My & Sonarr');
  });

  it('keeps key order and escapes on write', () => {
    const c = parseServarrConfig(SAMPLE);
    c.set('UrlBase', '/apps/sonarr');
    const out = serializeServarrConfig(c);
    expect(out.indexOf('<BindAddress>')).toBeLessThan(out.indexOf('<Port>'));
    expect(out).toContain('<UrlBase>/apps/sonarr</UrlBase>');
    expect(out).toContain('My &amp; Sonarr');
    expect(parseServarrConfig(out).get('InstanceName')).toBe('My & Sonarr');
  });

  it('rejects files that are not a Servarr config', () => {
    expect(() => parseServarrConfig('<foo/>')).toThrow();
  });
});
