import { describe, expect, it } from 'vitest';
import { IniFile } from './ini.js';

describe('IniFile', () => {
  it('reads keys with backslashes and preserves unknown lines', () => {
    const ini = new IniFile(
      '; comment\n[Preferences]\nWebUI\\Port=8080\nOther=1\n\n[BitTorrent]\nX=y\n',
    );
    expect(ini.get('Preferences', 'WebUI\\Port')).toBe('8080');
    expect(ini.set('Preferences', 'WebUI\\Port', '8090')).toBe(true);
    expect(ini.set('Preferences', 'WebUI\\Port', '8090')).toBe(false);
    expect(ini.toString()).toBe(
      '; comment\n[Preferences]\nWebUI\\Port=8090\nOther=1\n\n[BitTorrent]\nX=y\n',
    );
  });

  it('adds keys to the right section and creates missing sections', () => {
    const ini = new IniFile('[a]\nx=1\n\n[b]\ny=2\n');
    ini.set('a', 'z', '3');
    ini.set('c', 'k', 'v', ' = ');
    expect(ini.toString()).toBe('[a]\nx=1\nz=3\n\n[b]\ny=2\n\n[c]\nk = v\n');
  });

  it('setDefault never overwrites', () => {
    const ini = new IniFile('[misc]\nport = 9999\n');
    expect(ini.setDefault('misc', 'port', '8080', ' = ')).toBe(false);
    expect(ini.get('misc', 'port')).toBe('9999');
  });

  it('treats [[subsections]] as section boundaries (sabnzbd)', () => {
    const ini = new IniFile('[misc]\na = 1\n[servers]\n[[news.example]]\nname = x\n');
    ini.set('misc', 'b', '2', ' = ');
    expect(ini.toString()).toBe('[misc]\na = 1\nb = 2\n[servers]\n[[news.example]]\nname = x\n');
  });

  it('removes keys', () => {
    const ini = new IniFile('[a]\nx=1\ny=2\n');
    expect(ini.remove('a', 'x')).toBe(true);
    expect(ini.remove('a', 'x')).toBe(false);
    expect(ini.toString()).toBe('[a]\ny=2\n');
  });
});
