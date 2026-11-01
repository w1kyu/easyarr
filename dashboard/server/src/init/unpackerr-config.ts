/**
 * Unpackerr 1.0 config (TOML). Unpackerr runs in the VPN namespace, so it reaches the apps on
 * localhost, with their URL bases. Only torrents: SABnzbd unpacks its own downloads.
 * Research: docs/dev/research/downloaders.md §3.
 */
export function unpackerrConfig(keys: { sonarr: string; radarr: string; lidarr: string }): string {
  const instance = (app: string, port: number, key: string, category: string) =>
    [
      `[${app}.0]`,
      `url = "http://localhost:${port}/apps/${app}"`,
      `api_key = "${key}"`,
      `paths = ["/data/downloads/torrents/${category}"]`,
      'protocols = "torrent,TorrentDownloadProtocol"',
      '',
    ].join('\n');
  return [
    '# Written by EasyArr — changes here are replaced when EasyArr starts.',
    '',
    '[webserver]',
    '# Off: with the web UI on, Unpackerr would rewrite this file to store a generated password.',
    'listen_addr = ""',
    '',
    instance('sonarr', 8989, keys.sonarr, 'tv'),
    instance('radarr', 7878, keys.radarr, 'movies'),
    instance('lidarr', 8686, keys.lidarr, 'music'),
  ].join('\n');
}
