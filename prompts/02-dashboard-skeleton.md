# Phase 02 — Dashboard skeleton, umbrelOS-style design system, init, CI images

Follow the session protocol in `CLAUDE.md`. Relevant spec: §7, §14, §15, §20.

## Goal
The real EasyArr image replaces the placeholder: an empty but beautiful dashboard that looks native
to umbrelOS opens inside Umbrel, and the `init` command prepares folders and configs.

## Tasks
1. **Server** (`dashboard/server`): Fastify + TypeScript, zod, pino (with a redaction hook from day one),
   `GET /api/health`, static serving of the built web app, config from env (`APP_DATA_DIR` paths etc.),
   state store module (`state.json` + `secrets.json`, chmod 600, schemaVersion + migration framework,
   atomic writes) with unit tests.
2. **init command**: same image, `node dist/index.js init` → creates `/data` tree with ownership,
   generates API keys into `secrets.json`, seeds service config files **only if absent** (SPEC §7.4).
   Decide seed-vs-read API keys approach and log it. Idempotent; unit-tested against a temp dir.
3. **Web** (`dashboard/web`): React + Vite + TS + Tailwind + Radix, react-router, TanStack Query,
   react-i18next with `en.json`.
4. **Design system matching umbrelOS** (SPEC §14 + §14.1):
   - Study the umbrelOS UI source in `getumbrel/umbrel` (its web UI package) and identify what to reuse:
     Tailwind config / design tokens, glass panels, buttons, inputs, toggles, dialogs/sheets, app-grid
     tiles, toasts, layout pieces. Report the list to me before copying.
   - Vendor the chosen files into `dashboard/web/src/vendor/umbrel/` following SPEC §14.1 exactly:
     verbatim upstream LICENSE, PROVENANCE.md entry per file (path, commit hash, date, modified?),
     "Modified by EasyArr" headers on changed files, no copied code outside `vendor/`.
   - Adapt dependencies the vendored code needs (check each npm dependency's license; flag anything
     not MIT/Apache/BSD/ISC).
   - Do **not** copy the Umbrel logo, name or brand marks. Wallpapers/fonts/icons only if origin and
     license are clear (record in PROVENANCE.md); default to our own wallpaper.
   - Build the missing pieces ourselves in the same style: stepper, status pill, empty states.
   - `/dev/ui` showcase page (dev only) listing all components.
   - I'll send screenshots of my Umbrel if you ask — use them to check the result looks native.
   - Create a simple EasyArr logo (SVG) + app icon for the Umbrel store.
   - Ship license notices in the Docker image (`/licenses/`), add a CI check that every vendored file is
     listed in PROVENANCE.md.
5. App shell: header with logo + name (from `brand.ts`), placeholder home ("Setup coming soon").
6. **Dockerfile**: multi-stage, small, non-root where possible, multi-arch.
7. **CI**: build + push `ghcr.io/w1kyu/easyarr` for amd64 + arm64 on main (tag `edge`) and on version tags.
8. Update the Umbrel compose to use the real image for `dashboard` and `init`; sync to store repo.

## Out of scope
Wizard steps, VPN, wiring.

## Done when
- Dashboard opens inside Umbrel with the native look; works on phone width.
- `init` runs before services and is idempotent (run twice = no changes).
- Image builds for both architectures in CI.
- PROGRESS.md updated; next = `prompts/03-wizard-basics.md`.

## My checklist (owner)
- [ ] Update the app on Umbrel; EasyArr dashboard opens and looks like it belongs to umbrelOS
- [ ] Looks right on my phone
- [ ] Give feedback on look & logo (Claude logs changes)
