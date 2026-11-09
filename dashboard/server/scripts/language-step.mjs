// Runs EasyArr's real `<app>.languages` wiring step (D-066) against the Radarr/Sonarr containers of
// dev/recyclarr-test.sh (needs `pnpm build`). Prints how many changes it made.
// Usage: node language-step.mjs <radarrUrl> <radarrKey> <sonarrUrl> <sonarrKey> <preset> <audio>
//   <audio> = comma list, "!" marks a must-have, e.g. "de!,en!,original"
// The test containers have no URL base, so the /apps/<app> prefix the step adds is stripped here.
import { buildSteps } from '../dist/wiring/steps.js';

const [radarrUrl, radarrKey, sonarrUrl, sonarrKey, preset, audioArg] = process.argv.slice(2);
const audio = audioArg
  .split(',')
  .map((c) => ({ code: c.replace('!', ''), required: c.endsWith('!') }));
const urls = { radarr: radarrUrl, sonarr: sonarrUrl };
const unprefixed = (input, init) =>
  fetch(String(input).replace(/\/apps\/(radarr|sonarr)\//, '/'), init);

const { steps } = buildSteps({
  url: (id) => urls[id],
  keys: async () => ({ radarr: radarrKey, sonarr: sonarrKey }),
  fetch: unprefixed,
});
let changes = 0;
const ctx = {
  plan: {
    libraries: { movies: true, tv: true, music: false },
    quality: preset,
    audio,
    subtitles: [],
    language: 'en',
    country: 'US',
  },
  changed: (n = 1) => void (changes += n),
};
for (const id of ['radarr.languages', 'sonarr.languages']) {
  const step = steps.find((s) => s.id === id);
  if (!step) throw new Error(`no step ${id}`);
  await step.run(ctx);
}
process.stdout.write(`${changes}\n`);
