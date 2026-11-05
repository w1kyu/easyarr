// Prints EasyArr's recyclarr.yml for dev/recyclarr-test.sh (needs `pnpm build`).
// Usage: node recyclarr-config.mjs <preset> <radarrUrl> <radarrKey> <sonarrUrl> <sonarrKey> [--v0.0.8]
// --v0.0.8 drops what v0.0.9 added (LQ scores, minimum score, quality groups) to test the upgrade.
import { parse, stringify } from 'yaml';
import { recyclarrConfig } from '../dist/wiring/services/recyclarr.js';

const [preset, radarrUrl, radarrKey, sonarrUrl, sonarrKey, flag] = process.argv.slice(2);
let out = recyclarrConfig(preset, {
  radarr: { baseUrl: radarrUrl, apiKey: radarrKey },
  sonarr: { baseUrl: sonarrUrl, apiKey: sonarrKey },
});
if (flag === '--v0.0.8') {
  const doc = parse(out);
  for (const app of ['radarr', 'sonarr']) {
    for (const inst of Object.values(doc[app])) {
      delete inst.custom_formats;
      for (const p of inst.quality_profiles) {
        delete p.min_format_score;
        delete p.qualities;
        delete p.upgrade;
      }
    }
  }
  out = stringify(doc);
}
process.stdout.write(out);
