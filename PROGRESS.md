# PROGRESS.md — EasyArr status & handoff log

> Living document. Every Claude session reads this first and updates it last.
> Newest session log entries go on top.

## Current phase
**Phase 03 — ✅ done by the agent, waiting for the owner's test (v0.0.3).**
The phase 02 checklist is still open too (EasyArr was not installed on the Umbrel on 2026-10-31,
checked via Umbrel MCP) — one fresh install of 0.0.3 covers both checklists.
Next prompt: `prompts/04-vpn.md` (after the owner's checklists below pass).

## Phase status
| Phase | Title | Status | Notes |
|---|---|---|---|
| 00 | Repos, structure, tooling | ✅ done | w1kyu/easyarr + w1kyu/umbrel-app-store, CI green |
| 01 | Umbrel app + compose stack | ✅ done | v0.0.1 installed + restarted on owner's Umbrel (x86); CI green amd64/arm64 |
| 02 | Dashboard skeleton + design system + CI | ✅ done (owner test pending) | v0.0.2; image ghcr.io/w1kyu/easyarr amd64/arm64; stack test green on d72a564 |
| 03 | Wizard basics (steps 1–4) | ✅ done (owner test pending) | v0.0.3; wizard e2e green locally, in CI and against the stack (amd64 + arm64) |
| 04 | VPN (wrapper, kill switch, wizard step) | ⬜ todo | |
| 05 | Wiring engine + service proxy | ⬜ todo | |
| 06 | Wizard steps 6–9 | ⬜ todo | |
| 07 | Dashboard + settings | ⬜ todo | |
| 08 | Backup & restore | ⬜ todo | |
| 09 | Diagnostics + AI help | ⬜ todo | |
| 10 | Documentation | ⬜ todo | |
| 11 | Release v0.1.0 | ⬜ todo | |

Legend: ⬜ todo · 🟨 in progress · ✅ done · ⛔ blocked

## Verified facts
Results of SPEC **[VERIFY]** items. Format: `- YYYY-MM-DD — <fact> — <source link>`.
- 2026-10-30 — Readarr retired upstream (June 2025) → not included. — https://github.com/Readarr/Readarr
- 2026-10-30 — umbrelOS is licensed PolyForm Noncommercial 1.0.0 (personal/nonprofit use, modification and redistribution allowed; no commercial use) → UI code may be vendored under SPEC §14.1; EasyArr's own code is MIT (D-020). — https://github.com/getumbrel/umbrel
- 2026-10-30 — Community store: `umbrel-app-store.yml` with `id` + `name`; app IDs must be prefixed with store id. — https://github.com/getumbrel/umbrel-community-app-store
- 2026-10-30 — Node 26 is the current LTS line (v26.13.0 "Lithium", 2026-10-28) → `.nvmrc` = 26. — https://nodejs.org/dist/index.json
- 2026-10-30 — typescript-eslint 8.72 supports TypeScript `>=4.8.4 <6.1.0` → TS pinned to ~6.0 (D-021). — https://www.npmjs.com/package/typescript-eslint
- 2026-10-30 — umbrelOS UI path to add a store: App Store → **⋯** button (top right) → **Community App Stores** (once a store is added: Community App Stores → **Manage**) → paste URL → **Add**. — https://github.com/getumbrel/umbrel/blob/11e7f5bdfcb5bb8b46f39edd6defb4c37641763a/packages/ui/src/features/app-store/components/store-header.tsx
- 2026-10-30 — Community store template's default branch is `master`; the generated `w1kyu/umbrel-app-store` keeps `master`. — https://github.com/getumbrel/umbrel-community-app-store
- 2026-10-30 — Umbrel `app_proxy` uses `APP_HOST`/`APP_PORT` to point at the app's web container (seen in umbrel-apps PR reviews; re-check current format). — https://github.com/getumbrel/umbrel-apps/pull/468
- 2026-10-30 — umbrelOS 2.0 (umbreld 2.0.0) injects `container_name: <app-id>_<service>_1` for every service → `APP_HOST: w1kyu-easyarr_dashboard_1`. `app_proxy` is in-process in umbreld 2.0 (no container); its env keys are `APP_HOST`, `APP_PORT`, `APP_PROTOCOL`, `PROXY_AUTH_ADD`, `PROXY_AUTH_WHITELIST`, `PROXY_AUTH_BLACKLIST`, `PROXY_TRUST_UPSTREAM`, `PROXY_TIMEOUT`. — https://github.com/getumbrel/umbrel/blob/11e7f5bdfcb5bb8b46f39edd6defb4c37641763a/packages/umbreld/source/modules/apps/legacy-compat/app-script
- 2026-10-30 — Compose env available: `APP_DATA_DIR` (= `${UMBREL_ROOT}/app-data/<id>`), `APP_DATA_ROOT`, `APP_ID`, `APP_VERSION`, `APP_PROXY_PORT`, `APP_DOMAIN`, `APP_SEED`, `APP_PASSWORD`, `DEVICE_HOSTNAME`, `DEVICE_DOMAIN_NAME`, `UMBREL_ROOT`, `NETWORK_IP` (10.21.0.0); the default network is the shared external `umbrel_main_network`. — same file + `docker-compose.common.yml`
- 2026-10-30 — Storage: umbreld rewrites `${UMBREL_ROOT}/data/storage/downloads` → `/home/Downloads` and `${UMBREL_ROOT}/data/storage` → `/home` (Files → Home); manifest `storage: dataRoot: data` makes `${APP_DATA_DIR}/data` movable. — https://github.com/getumbrel/umbrel/blob/11e7f5bdfcb5bb8b46f39edd6defb4c37641763a/packages/umbreld/source/modules/apps/app.ts
- 2026-10-30 — GPU: `permissions: [GPU]` makes umbreld add DRI/ROCm/NVIDIA devices + groups to **every** service when present, nothing when absent; manual `/dev/dri` mappings are removed. Official Jellyfin uses it. — app.ts (same commit) + https://github.com/getumbrel/umbrel-apps/blob/7eef63f742a66e78171a81ca3f54eb8a273b150e/jellyfin/umbrel-app.yml
- 2026-10-30 — `depends_on` with `service_completed_successfully`/`service_healthy`, `network_mode: "service:<x>"`, `cap_add: NET_ADMIN` + `/dev/net/tun` all appear in official apps (affine, plane, bisq2-node, nostr-vpn); `restart: on-failure` is the convention; PUID/PGID 1000. — https://github.com/getumbrel/umbrel-apps/tree/7eef63f742a66e78171a81ca3f54eb8a273b150e
- 2026-10-30 — Ports 39000/39096/39055 unused in the official store and Big Bear's community store (bigbeartechworld/big-bear-umbrel@88c0886); Umbrel's linter (host-port conflict check) passes. — https://github.com/getumbrel/umbrel-apps/blob/7eef63f742a66e78171a81ca3f54eb8a273b150e/.tools/lint-apps.mjs
- 2026-10-30 — Dev loop: community stores are git checkouts in `/home/umbrel/umbrel/app-stores/<user>-<repo>-github-<sha256(url)[:8]>` (ours: `w1kyu-umbrel-app-store-github-3363c2d3`), refreshed every 5 min; `sudo umbreld client apps.install.mutate --appId …` etc. — app-repository.ts/app-store.ts (same umbrel commit) + umbrel-apps `.agents/skills/umbrel-test-app/SKILL.md`
- 2026-10-30 — All SPEC §3 images publish linux/amd64 + linux/arm64 (registry manifest check + Umbrel linter `--check-images`). Cleanuparr: `ghcr.io/cleanuparr/cleanuparr`, port 11011 (`PORT`), supports `BASE_PATH`. Jellyseerr → Seerr (`ghcr.io/seerr-team/seerr`, used by the official Umbrel app). — https://github.com/Cleanuparr/Cleanuparr/blob/4e6b55dc1e18de7f33a575396c4b68ad6b9286ab/code/Dockerfile
- 2026-10-30 — Gluetun v3.41.3 with a dead WireGuard endpoint keeps running (restarts the tunnel internally) with the firewall up; inside the namespace IP, DNS and HTTP egress fail while inbound from the Docker network works. SABnzbd refuses unknown Host headers (needs `host_whitelist`, phase 05). — CI run 41067981634 (`dev/stack.sh leaktest`)
- 2026-10-30 — umbrelOS UI lives in `packages/ui` (Tailwind config, `index.css` material/glass tokens, shadcn-style `components/ui/*`); its LICENSE is PolyForm Noncommercial 1.0.0 with **no** "Required Notice:" line → our PROVENANCE.md + verbatim LICENSE.md satisfy §14.1. — https://github.com/getumbrel/umbrel/tree/11e7f5bdfcb5bb8b46f39edd6defb4c37641763a/packages/ui
- 2026-10-30 — qBittorrent 5 reads web-UI settings from `[WebUI]` (`Port`, `AuthSubnetWhitelist…`, `HostHeaderValidation`); it migrates `[Preferences] WebUI\\*` once (upgrade.cpp `migrateWebUISettings`, `[Meta] MigrationVersion` 11) and rewrites the file on start → init writes `[WebUI]` directly. — https://github.com/qbittorrent/qBittorrent/blob/release-5.3.0/src/app/upgrade.cpp
- 2026-10-30 — umbrelOS only copies an app's committed `data/` scaffolding on fresh install → new bind-mount sources need a `hooks/pre-start` for existing installs (D-034). — umbreld app.ts (same umbrel commit)
- 2026-10-31 — Jellyfin usernames must match `^(?!\s)[\w\ \-'._@+]+(?<!\s)$` (and not be `.`/`..`) → EasyArr allows the subset `^[A-Za-z0-9][A-Za-z0-9._-]{1,31}$` (D-036). — https://github.com/jellyfin/jellyfin/blob/a46fa4559daaea352257d0196b56e392c18dd09c/Jellyfin.Server.Implementations/Users/UserManager.cs
- 2026-10-31 — With `permissions: [GPU]`, umbreld maps `/dev/dri` (+ `/dev/kfd` for ROCm) and NVIDIA devices with `NVIDIA_VISIBLE_DEVICES=all` into every service, plus the device groups → the dashboard detects a GPU from `/dev/dri/renderD*`, `/dev/nvidia*` or that env var (D-037). — https://github.com/getumbrel/umbrel/blob/11e7f5bdfcb5bb8b46f39edd6defb4c37641763a/packages/umbreld/source/modules/hardware/gpu.ts
- 2026-10-30 — pnpm 12 fails `install` in CI on unapproved build scripts (`ERR_PNPM_IGNORED_BUILDS`) → `allowBuilds: { esbuild: true }` in `pnpm-workspace.yaml`. — CI run for 9552a61

## Open [VERIFY] items
Copy from SPEC as they get resolved. Highest priority first:
- [x] Umbrel compose: `depends_on` conditions, restart policies allowed, `APP_SEED`, container naming for `APP_HOST`
- [x] umbrelOS user storage path + PUID/PGID
- [x] Jellyfin `/dev/dri` handling with/without GPU (→ `permissions: [GPU]`)
- [ ] Gluetun control server endpoints + auth requirements; port-forwarding provider list
- [ ] Gluetun DNS: can VPN-side apps resolve Docker container names (e.g. Jellyfin) once the tunnel is up?
- [ ] Sub-path support per service (Servarr, Bazarr, SABnzbd incl. `host_whitelist`, qBittorrent, Cleanuparr `BASE_PATH`)
- [ ] Jellyfin startup API + backup/restore API; Seerr setup API
- [ ] Servarr backup/restore API endpoints
- [x] Port range 39000/39096/39055 free in official + popular community stores
- [x] Cleanuparr image name, port, config format (config is created via its UI/API; format TBD in phase 05)
- [x] umbrelOS UI code: where components/design tokens live upstream; exact LICENSE text incl. any "Required Notice"
- [x] Origin + license of umbrelOS wallpapers, fonts and icons before vendoring any of them (none vendored; own wallpaper, Inter from `inter-ui` (OFL), Lucide icons)

## Known issues
- `vpn` shows **unhealthy** until a VPN is configured. This is expected and intended (D-025).
- Kill-switch gaps until the phase 04 wrapper exists: (1) a sub-second window when the `vpn` container starts,
  before Gluetun has installed its firewall rules; (2) if the Gluetun process crashes, the dependent containers
  lose networking until they are restarted.
- SABnzbd refuses requests through other hostnames until `host_whitelist` is seeded (phase 05).
- Recyclarr and Unpackerr run with empty configs (they idle and log warnings) until wiring exists (phase 05).
- Bazarr, Recyclarr, Unpackerr and Cleanuparr configs plus sub-path settings (SABnzbd `url_base`, qBittorrent
  reverse proxy) are not seeded yet (phase 05, D-031).
- Service tiles on the home screen show static status pills (no live status until phase 07).
- The wizard ends after step 4 for now; the home screen says so and offers "Review your answers".
- The account isn't applied to Jellyfin/Jellyseerr yet (phase 05); changing it later = going back
  through the wizard until Settings exist (phase 07).

## Ideas / later
- "Both" download method: decide in phase 05 whether Usenet is preferred (Servarr delay profiles) —
  the docs currently only say EasyArr "takes whichever has it".
- Main JS chunk is ~710 KB (225 KB gzip) — split routes (wizard/dashboard/settings) in phase 07/10.
- Password reset + account change belong in Settings (phase 07); docs viewer polish in phase 10.
- The template's comment says the store name shows as "<name> App Store" (→ "w1kyu Apps App Store");
  current umbrelOS UI shows `meta.name` as-is in the menu. Owner: check how it looks after adding the store.
- Add a Renovate config (planned in phase 11) — could also bump GitHub Actions versions.
- umbrelOS 2.0 `folderAccess:` could let users point EasyArr's media folder at an external drive / NAS
  (v2 scope, SPEC §1 non-goals) — much easier than planned.
- umbrelOS 2.0 `environment:` manifest settings could expose a few safe knobs (e.g. TZ) in Umbrel's app settings.

## Session log
### 2026-10-31 — Phase 03: wizard framework + steps 1–4 (Hermes agent on the owner's Umbrel)
- Start: repo + CI green on 2d27e6f. Phase 02 owner test not done yet; EasyArr isn't installed on
  the Umbrel right now (Umbrel MCP) — started phase 03 anyway as asked ("continue").
- Shared (`@easyarr/shared`): wizard step registry (order, `isVisible`, schemas, no-skip rule),
  account/download schemas with i18n-key messages, password strength estimator, system-check
  verdicts (`evaluateSystem`) — all unit-tested.
- Server: `GET /api/system-check` (arch, RAM, free space on read-only `/data`, GPU from umbreld's
  device mapping), `GET /api/wizard`, `GET/POST /api/wizard/:step` (validated, serialized writes,
  409 on skipping ahead). Account: username + scrypt hash in state.json, plaintext only in
  secrets.json (redacted from logs at once), never returned. State/secrets schema v2 + migrations.
  Non-JSON POSTs → 415 (CSRF guard, D-038).
- Web: `/setup/<step>` wizard (Stepper, title, "What's this?", Back/Next, focus handling), steps
  Welcome (flow, legal note, Start / Restore-coming-soon), System check (✅/⚠️/❌, re-check,
  "continue anyway" for ❌), Account (fields, strength meter, confirm, family-accounts note),
  Download method (cards with pros/cons + help links). `/` and `/setup` resume at the first open
  step. In-app help: `docs/*.md` bundled, dialog + `/help/<page>`.
- Docs drafts: `how-it-works`, `system-requirements`, `torrents-101`, `usenet-101`, `family-accounts`.
- Tests: 103 unit tests (incl. jsdom wizard flow, i18n key coverage, doc links) + Playwright e2e
  (`e2e/`, 8 tests: steps 1–4, refresh, help dialog, validation, password never returned) — green
  locally, in CI (`Wizard e2e`) and against the Docker stack on amd64 + arm64 (`umbrel-app.yml`).
- Checked in a browser at desktop + 390 px against the real hardware values of this Umbrel
  (amd64, 23.3 GB RAM, 5.6 TB free; no GPU visible from the Hermes sandbox — the real app should
  find the i3-8100's Intel graphics).
- Umbrel app v0.0.3: dashboard + init on `sha-6286334@sha256:666a4744…`, dashboard mounts
  `/data` read-only. Umbrel linter: 0 errors (2 expected warnings). Synced to the store.
- Caught by the stack e2e: the image shipped without help pages (`.dockerignore` excluded `docs/`).
  Fixed: Dockerfile copies `docs/`, the web build fails without help pages, the image smoke test
  checks for them.
- Decisions D-036…D-039.
- Owner checklist (phase 03 — install 0.0.3 fresh, this covers the phase 02 list too):
  - [ ] Install EasyArr 0.0.3 from the w1kyu Apps store (store refreshes every ~5 min)
  - [ ] Opening EasyArr starts the wizard; go through steps 1–4 — is the wording clear for a beginner?
  - [ ] System check shows correct values (amd64, ~23 GB RAM, free space of your 6 TB mirror,
        graphics **found** — the i3-8100 has Intel UHD 630)
  - [ ] Refresh the page in the middle (e.g. on step 3) — you stay on the same step
  - [ ] "What's this?" links open the help pages
  - [ ] Looks right on the phone; logo/look feedback (phase 02 list)
  - [ ] Jellyfin (port 39096) and Jellyseerr (39055) still open; app restarts fine

### 2026-10-30 — Phase 02: dashboard skeleton, design system, image (Hermes agent on the owner's Umbrel)
- Server (`dashboard/server`): Fastify + helmet (no HSTS/upgrade-insecure-requests, D-032), pino logger with
  secret redaction, versioned JSON state/secrets store (atomic, mode 600), `/api/health`, SPA + `/licenses`.
- `init` (same image, root): `/data` tree, API keys seeded or adopted, minimal Servarr/qBittorrent/SABnzbd
  configs; idempotent incl. after services rewrite their files (unit tests + `dev/stack.sh leaktest` in CI) (D-031).
- Web (`dashboard/web`): React 19/Vite/Tailwind 4/Radix/react-router/TanStack Query/i18next (D-033).
  Owner-approved umbrelOS UI files vendored to `src/vendor/umbrel/` with LICENSE + PROVENANCE; CI guard
  `scripts/check-vendor.mjs` in `pnpm lint`. Own logo (`assets/icon.svg`), own pre-blurred wallpaper,
  stepper/status pill/empty state, `/dev/ui` showcase (dev only). Checked in a browser at desktop + 390 px.
- Image: `dashboard/Dockerfile` (build on $BUILDPLATFORM, node:26.13.0-alpine runtime, `serve` as uid 1000,
  notices in `/licenses`); `.github/workflows/image.yml` → `ghcr.io/w1kyu/easyarr` (edge, sha-*, semver) with
  smoke test (D-034). Package public.
- Umbrel app v0.0.2: dashboard + init use `ghcr.io/w1kyu/easyarr:sha-c17ca1b@sha256:822b1628…`; manifest icon;
  `hooks/pre-start` creates `data/easyarr` on existing installs. Umbrel linter: 0 errors (2 expected warnings).
  CI green on d72a564 (lint/test/build + stack/kill-switch amd64 + arm64). Fresh clone passes all checks.
- Fixes along the way: SPA fallback swallowed missing assets; relative config paths; pnpm 12 ignored builds;
  qBittorrent 5 `[WebUI]` layout (init flip-flopped every start).
- Owner checklist (phase 02):
  - [ ] Update EasyArr to 0.0.2 in the Umbrel App Store (store refreshes every ~5 min)
  - [ ] Open EasyArr: logo, "Setup is coming soon" and the app tiles appear; looks at home in umbrelOS
  - [ ] Looks right on the phone
  - [ ] Jellyfin and Jellyseerr still open; app restarts fine
  - [ ] Feedback on look & logo
### 2026-10-30 — Phase 01 verified on the owner's Umbrel (umbrelOS 2.0, Dell Precision 3630, x86_64)
- Owner: store added, EasyArr v0.0.1 installed, placeholder, Jellyfin and Jellyseerr open, restart OK.
- Agent via Umbrel MCP: app `ready`, no operation failures; app data scaffolding populated
  (`data/<service>/` configs created by each service); storage data root movable (`canMoveExternally: true`);
  logs show the kill switch holding on the real device (Gluetun retries against 192.0.2.1; Prowlarr/Radarr
  DNS lookups fail with "Resource temporarily unavailable"); memory use ≈1.1 GB idle.
- Not checked by the agent: `Home/EasyArr` (not granted to MCP) — owner confirmed Files shows it.

### 2026-10-30 — Phase 01: Umbrel app + compose stack (Hermes agent on the owner's Umbrel)
- Research: read umbreld 2.0 source (getumbrel/umbrel@11e7f5b) + umbrel-apps@7eef63f incl. its packaging/testing
  agent guides and linter; resolved the phase's [VERIFY] items (see Verified facts).
- Built `umbrel/w1kyu-easyarr/` (manifest + compose): 15 services, all pinned `tag@digest` and multi-arch;
  VPN namespace via `network_mode: "service:vpn"`; temporary dead-end Gluetun config as kill switch (D-025);
  busybox `init` for the `/data` tree (D-024); placeholder dashboard behind `app_proxy`; Jellyfin 39096,
  Jellyseerr/Seerr 39055. Umbrel's linter: 0 errors, 2 expected warnings (`vpn` cap_add + device).
- `dev/docker-compose.dev.yml` (override) + `dev/stack.sh` (up/wait/leaktest/down) run the real Umbrel compose
  locally; new CI workflow runs the Umbrel linter and the stack + leak test on amd64 **and** arm64 → green
  (run 41067981634).
- `scripts/sync-store.sh` → synced v0.0.1 into w1kyu/umbrel-app-store (a220db3). `docs/dev/development.md` written.
- Decisions D-023…D-030 logged; SPEC §3, §5, §6, §7.4, §18, §19 updated.
- Not done: install on a real Umbrel. Hermes can't do that (read-only Umbrel MCP, no Docker), so the owner tests it (checklist above).
- Next: owner test → then `prompts/02-dashboard-skeleton.md`.

### 2026-10-30 — Phase 00: repos, structure, tooling (Hermes agent on the owner's Umbrel)
- Ran from `/opt/data/easyarr` on the Umbrel (D-022): `gh` not installed → GitHub REST API with the
  owner's token; pnpm 12.16.1 installed user-space; Docker daemon not reachable (fine for phase 00).
- Moved planning files into the repo root. Created pnpm workspace `dashboard/{shared,server,web}`
  (strict TS 6.0, ESLint 10 + typescript-eslint strict, Prettier, Vitest 5; tooling in D-021),
  `brand.ts`, placeholder READMEs for `vpn/`, `umbrel/w1kyu-easyarr/`, `dev/`, `docs/`,
  LICENSE (MIT), NOTICE.md, README, CI workflow.
- Created https://github.com/w1kyu/easyarr (CI run 41062912035 ✅) and
  https://github.com/w1kyu/umbrel-app-store (generated from Umbrel's template, example app removed).
- Verified locally from a fresh clone: `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm build` ✅.
- Next: `prompts/01-umbrel-stack.md`. Note: phase 01 needs `docker compose` for local checks — the
  Umbrel sandbox has no Docker daemon, so use CI or a real Umbrel install for those (D-022).
- Owner test: add `https://github.com/w1kyu/umbrel-app-store` as a community store on your Umbrel
  (should show "w1kyu Apps" with 0 apps).

### 2026-10-30 — Planning addendum: license change (claude.ai chat)
- Owner chose to reuse umbrelOS UI code for an exact native look → license switched from GPL-3.0 to
  MIT for own code; umbrelOS code vendored under PolyForm Noncommercial 1.0.0 (D-020, SPEC §14.1).
- Updated SPEC, CLAUDE.md, DECISIONS.md and prompts 00, 02, 11 accordingly.

### 2026-10-30 — Planning (claude.ai chat)
- Planned EasyArr with the owner: services, VPN layout, wizard, dashboard, backup/restore,
  diagnostics + AI help, docs, design direction, agent continuity, 12 build phases.
- Produced SPEC.md, CLAUDE.md, PROGRESS.md, DECISIONS.md, prompts/.
- Next: owner puts this folder on their computer, opens Claude Code in it, and runs
  `prompts/00-setup.md` (Claude Code creates both GitHub repos via `gh`).
