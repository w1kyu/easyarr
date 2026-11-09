# PROGRESS.md — EasyArr status & handoff log

> Living document. Every Claude session reads this first and updates it last.
> Newest session log entries go on top.

## Current phase
**Phase 07 — 🟨 built, owner test pending (v0.0.12).** Dashboard home (Simple/Advanced, downloads,
recently added, warnings, VPN details, redacted logs) and Settings (download method, VPN, Usenet,
libraries/quality, account read-only, advanced re-run/repair, about; backups placeholder).
Phase 06 owner test still open: the last check (a download lands in Jellyfin) is blocked by the
owner's torrent sites being unreachable from inside the VPN (2026-11-07, see session log), which
the owner deferred; diagnose it before phase 08 if possible.
Next prompt: `prompts/08-backup-restore.md` (after the owner's phase 07 test).

## Phase status
| Phase | Title | Status | Notes |
|---|---|---|---|
| 00 | Repos, structure, tooling | ✅ done | w1kyu/easyarr + w1kyu/umbrel-app-store, CI green |
| 01 | Umbrel app + compose stack | ✅ done | v0.0.1 installed + restarted on owner's Umbrel (x86); CI green amd64/arm64 |
| 02 | Dashboard skeleton + design system + CI | ✅ done (owner test pending) | v0.0.2; image ghcr.io/w1kyu/easyarr amd64/arm64; stack test green on d72a564 |
| 03 | Wizard basics (steps 1–4) | ✅ done (owner test pending) | v0.0.3; wizard e2e green locally, in CI and against the stack (amd64 + arm64) |
| 04 | VPN (wrapper, kill switch, wizard step) | ✅ done (owner: VPN works) | v0.0.4; VPN image ghcr.io/w1kyu/easyarr-vpn amd64/arm64; leak tests green in CI (image smoke test + stack) |
| 05 | Wiring engine + service proxy | ✅ done (owner test pending) | v0.0.5–v0.0.7; wiretest green against real services (amd64 + arm64) |
| 06 | Wizard steps 6–9 | 🟨 owner test in progress | v0.0.8 → v0.0.10 (LQ last resort, wiring on start, Cleanuparr cleans up); e2e torrents/usenet/both + stack wizard e2e through Finish |
| 07 | Dashboard + settings | 🟨 built (owner test pending) | v0.0.12; /api/status, Simple/Advanced, warnings, Settings; e2e for mode toggle + settings change; stack test reads /api/status |
| 08 | Backup & restore | 🟨 in progress | built; stack test: Jellyfin native backup + Seerr after restore still red |
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

- 2026-10-31 — Gluetun v3.41.3 control server (:8000): routes `/v1/vpn/status`, `/v1/publicip/ip`, `/v1/portforward`; auth via a TOML role file (`HTTP_CONTROL_SERVER_AUTH_CONFIG_FILEPATH`, `auth = "apikey"`, header `X-API-Key`); unlisted routes are denied (D-041). — https://github.com/qdm12/gluetun/tree/v3.41.3/internal/server
- 2026-10-31 — Gluetun port forwarding: automatic for Perfect Privacy, PIA, PrivateVPN, ProtonVPN; `PORT_FORWARD_ONLY` defaults on for PIA/ProtonVPN when `VPN_PORT_FORWARDING=on`; FREE_ONLY + PORT_FORWARD_ONLY rejected for ProtonVPN; Gluetun does not append `+pmp` to Proton OpenVPN users (EasyArr does). — https://github.com/qdm12/gluetun/blob/v3.41.3/internal/configuration/settings/serverselection.go, internal/provider/protonvpn/portforward.go
- 2026-10-31 — Gluetun WireGuard providers: AirVPN (preshared key required), custom, FastestVPN, IVPN, Mullvad, NordVPN, ProtonVPN, Surfshark, Windscribe; default addresses only for NordVPN (10.5.0.2/32) and ProtonVPN (10.2.0.2/32); no native PIA WireGuard. — https://github.com/qdm12/gluetun/blob/v3.41.3/internal/configuration/settings/wireguard.go
- 2026-10-31 — Custom OpenVPN in Gluetun: `remote` must be an IP (host names rejected, `errHostNotIP`), only the first remote is used → EasyArr resolves names on save. — https://github.com/qdm12/gluetun/blob/v3.41.3/internal/openvpn/extract/extract.go
- 2026-10-31 — Gluetun resets iptables policies to ACCEPT while (re)configuring → EasyArr's iptables guard rewrites `-P OUTPUT/FORWARD ACCEPT` to DROP (D-040). — https://github.com/qdm12/gluetun/blob/v3.41.3/internal/firewall/enable.go
- 2026-10-31 — Mullvad removed OpenVPN on 2026-01-15 (WireGuard only) and port forwarding in 2023. — https://mullvad.net/en/blog/removing-openvpn-15th-january-2026
- 2026-10-31 — Provider setup steps for the 9 VPN guides were checked against the providers' help centres (sources listed in each guide's research; see docs/vpn/*.md "Last checked").
- 2026-11-01 — Usenet provider presets (host, SSL port 563, connections of the smallest current plan) for Easynews, Eweka, Giganews, NewsDemon, Newsgroup Ninja, Newshosting, Pure Usenet, theCubeNet, Tweaknews, UsenetServer, ViperNews — each from the provider's own help pages (URLs in `dashboard/shared/src/usenet-presets.ts`), SSL ports tried live. Left out (no official SSL port / connection limit): Frugal Usenet, Usenet.Farm, Supernews (still alive). Note: port 443 is *not* SSL on Newsgroup Ninja, theCubeNet, NewsDemon, Frugal; Easynews SSL-443 only on secure.news.easynews.com. — provider KB pages (D-050)
- 2026-11-01 — Prowlarr 2.7.0 built-in Newznab presets (names + URLs) used as EasyArr's indexer list; Usenet indexers need `redirect: true` (IndexerController.Validate); `POST /api/v1/indexer/test` tests capabilities. — https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/NzbDrone.Core/Indexers/Definitions/Newznab/Newznab.cs#L88-L108
- 2026-11-01 — SABnzbd 5.1.3 `mode=config&name=test_server` returns `{value:{result,message}}` with plain reasons ("Server requires username and password.", "Timed out", "Unknown SSL protocol…"); parameters may be POSTed. — https://github.com/sabnzbd/sabnzbd/blob/a647f73426cb70ad60ae7964b96c2d5e939b4727/sabnzbd/api.py#L1365
- 2026-11-01 — Prowlarr UI labels for the indexers guide: "Add Indexer" / "Add New Indexer", filters Protocol / Privacy (Public, Private, Semi-Private) / Language; Cloudflare error text "Unable to access {host}, blocked by CloudFlare Protection." — Prowlarr@0dc20d8 `src/NzbDrone.Core/Localization/Core/en.json`, `Http/CloudFlare/CloudFlareProtectionException.cs`
- 2026-11-05 — Radarr 6.4.4 / Sonarr 4.0.20 rank releases by quality first, then custom-format score (`DownloadDecisionComparer`: CompareQuality → CompareCustomFormatScore → protocol → indexer priority → peers/age → size). — https://github.com/Radarr/Radarr/blob/a96bf7c3ecb23cb76993770727285dc17a613fbc/src/NzbDrone.Core/DecisionEngine/DownloadDecisionComparer.cs#L31-L43
- 2026-11-05 — TRaSH LQ formats (Radarr `90a6f9a2…`, `e204b80c…`; Sonarr `9c11cd3f…`, `e2315f99…`) score −10000 and reach EasyArr's profiles through the default "[Unwanted] Unwanted Formats" group; YTS is in LQ. Other negative guide scores: −51 (v0), −10000, −35000. — https://github.com/TRaSH-Guides/Guides/tree/d24f13ceea5e82ccc20d08b7814fca93840e4046/docs/json/radarr/cf-groups/unwanted-formats.json
- 2026-11-05 — Recyclarr 8.8.1: an explicit `custom_formats[].assign_scores_to[].score` beats the guide score; `qualities` replaces the guide's list (highest first, Recyclarr reverses for the API), unlisted qualities get disabled, emptied groups are dropped; `upgrade.until_quality` may name a group. Proven against the real images (CI job "Recyclarr profiles"). — https://github.com/recyclarr/recyclarr/blob/874cb274f8b419dff6fb211fc326e4f2dd63c4fb/docs/architecture/sync-plan-phase.md , `src/Recyclarr.Cli/Pipelines/QualityProfile/QualityItemOrganizer.cs`
- 2026-11-09 — Servarr backup API (Sonarr 4.0.20 / Radarr 6.4.4 / Lidarr 3.1.6 / Prowlarr 2.7.0): `POST /command {"name":"Backup"}` (manual), `GET /system/backup` (path `/backup/manual/<name>`, served by BackupFileMapper), `POST /system/backup/restore/upload` (multipart .zip, moves config.xml + DB, `RestartRequired`), `POST /system/restart` = new process inside the container (`AppLifetime.OnAppStopped` → `SpawnNewProcess`), `/system/status.startTime` tells old and new process apart. — https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Api.V3/System/Backup/BackupController.cs (D-070)
- 2026-11-09 — Jellyfin 12.4 has the 10.11 backup API: `POST /Backup/Create` (Database/Metadata/Trickplay/Subtitles flags), `POST /Backup/Restore {ArchiveFileName}` (restores on an in-process restart), files in `<data>/backups` = `/config/data/backups` in the linuxserver image; no download/upload endpoint. — https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/Jellyfin.Api/Controllers/BackupController.cs (D-070)
- 2026-11-09 — SABnzbd 5.1.3: `mode=config&name=create_backup` writes a zip into the complete folder; restore only through the web form (`interface.py` `config_backup_file`) → not used, state replay instead. — https://github.com/sabnzbd/sabnzbd/blob/a647f73426cb70ad60ae7964b96c2d5e939b4727/sabnzbd/config.py#L1013
- 2026-11-09 — The compose restart policy isn't involved in restores: Servarr restarts in a new process, Jellyfin in-process → `restart: on-failure` stays (SPEC §11 [VERIFY]). (D-071)

## Open [VERIFY] items
Copy from SPEC as they get resolved. Highest priority first:
- [x] Umbrel compose: `depends_on` conditions, restart policies allowed, `APP_SEED`, container naming for `APP_HOST`
- [x] umbrelOS user storage path + PUID/PGID
- [x] Jellyfin `/dev/dri` handling with/without GPU (→ `permissions: [GPU]`)
- [x] Gluetun control server endpoints + auth requirements; port-forwarding provider list
- [x] Gluetun DNS: can VPN-side apps resolve Docker container names (e.g. Jellyfin) once the tunnel is up? → No, by design (D-043); use localhost / the dashboard.
- [x] Sub-path support per service (Servarr, Bazarr, SABnzbd incl. `host_whitelist`, qBittorrent, Cleanuparr `BASE_PATH`) — `docs/dev/research/`, D-045, D-049
- [x] Jellyfin startup API + backup/restore API; Seerr setup API (D-070)
- [x] Servarr backup/restore API endpoints (D-070)
- [x] Port range 39000/39096/39055 free in official + popular community stores
- [x] Cleanuparr image name, port, config format (config is created via its UI/API; format TBD in phase 05)
- [x] umbrelOS UI code: where components/design tokens live upstream; exact LICENSE text incl. any "Required Notice"
- [x] Origin + license of umbrelOS wallpapers, fonts and icons before vendoring any of them (none vendored; own wallpaper, Inter from `inter-ui` (OFL), Lucide icons)

## Known issues
- NordVPN WireGuard guide uses the new "download WireGuard config" option in Nord's dashboard (Oct 2026);
  not yet confirmed with a real account that its key works on every server Gluetun picks. Fallback if not:
  the access-token method from Gluetun's wiki.
- AirVPN only hands out reserved ports ≥ 2048; EasyArr accepts 1024–65535 (the guide says so).
- Help links with `#section` open the top of the page (anchors aren't scrolled to yet; phase 10).
- Settings → VPN doesn't exist yet (phase 07); changing the VPN = reopening wizard step 5 (`/setup/vpn`).
- Changing any wizard answer later = reopen that step (home → "Review your answers"), then run Finish
  again. Settings arrive in phase 07; "Repair connections" (the old /dev/wiring button) too.
- Media languages steer downloads since D-066, but Bazarr's profile and Jellyfin's library metadata
  language are still set only once; changing the languages later updates Sonarr/Radarr and
  Jellyfin's playback preferences, not those two.
- Releases without a must-have audio language are refused; "Needs your OK" offers them (D-068).
- "Needs your OK" is only proven against fakes; the real interactive-search/grab path needs an owner
  test (request something only available in another language).
- Usenet servers/indexers removed from the wizard later are not removed from SABnzbd/Prowlarr.
- "Get help with AI" on the Finish step is a disabled placeholder (phase 09).
- Bazarr, Recyclarr, Unpackerr and Cleanuparr configs plus sub-path settings (SABnzbd `url_base`, qBittorrent
  reverse proxy) are not seeded yet (phase 05, D-031).
- Service tiles on the home screen show static status pills (no live status until phase 07).
- The account isn't applied to Jellyfin/Jellyseerr yet (phase 05); changing it later = going back
  through the wizard until Settings exist (phase 07).

## Ideas / later
- Settings → Account: change the password everywhere (Jellyfin `POST /Users/{id}/Password` with the
  admin key, Seerr re-login) instead of read-only (D-060).
- Settings: a "Search sites" section (today Prowlarr is opened directly; the wizard's step 7 covers it).
- Indexer health on the dashboard: "search sites unreachable" + clearing stale Prowlarr/*arr
  backoffs (owner issue 2026-11-07, see session log).
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
### 2026-11-09 (afternoon) — Phase 08: backup & restore (Claude Code on the Mac) — IN PROGRESS
- Built: `.easyarr` format (D-069), native backups for Sonarr/Radarr/Lidarr/Prowlarr + Jellyfin
  (D-070), restore keeps this install's API keys (D-071), raw upload header (D-072); Settings →
  Backups, /restore (also from wizard step 1), automatic daily backups, `docs/backup-restore.md`.
- Verified: 309+ unit tests, Playwright 38 passed locally (incl. encrypted backup → wrong password →
  restore). Stack test `dev/stack.sh backuptest` (CI, real services, both arches) on 7060fc7:
  Servarr restore, re-keying, SABnzbd/Prowlarr key fixes, hand-made Sonarr tag — all PASS.
- Still failing there: (1) Jellyfin's own backup was skipped at backup time (reason unknown; the
  test now prints the manifest's skip reasons); (2) Jellyseerr refused the first session after its
  first sign-in on the fresh install (403) → retry added in `seerrKey` (unproven against real Seerr).
- Not released: v0.0.17 manifest + compose pin (sha-5c15910) are committed, but the store is NOT
  synced. Next: push the fix → Image → re-pin → `Umbrel app` green on both arches → sync store.
### 2026-11-09 (night) — Owner's 11-item list: UI fixes, media languages, season packs, re-search (D-064 – D-067)
- Phase 1 (UI, 6dd788a): logo → home; status-strip VPN/Downloads icons and recently-added posters
  clickable, dead hover effects removed; 44 px Simple/Advanced segmented control; switching to
  Advanced fades in the new sections + a "More options below" button; reopened account/Usenet
  steps say the saved password is hidden for security (never sent back, D-064); shown version = Umbrel's
  `APP_VERSION` from umbrel-app.yml (D-065).
- Phase 2 (languages, 0240a42 + follow-up): two ranked lists, audio (incl. "Original") and
  subtitles, each language optionally "must have" (owner: audio = a file needs at least one
  must-have, else EasyArr asks; subtitles = Bazarr keeps looking + home-screen warning
  `subtitlesMissing`). Sonarr/Radarr get "EasyArr – Language: …" custom formats (best rank only,
  2000 per rank, "none you need" −10000 only with must-haves), Radarr profile language → Any (the
  TRaSH profiles say "Original", which refused every dub — so before this, dubbed releases never
  downloaded), Recyclarr keeps those scores, Bazarr profile from the subtitle list, Jellyfin
  preferred audio/subtitles (D-066). Docs: `docs/quality-presets.md`.
- Phase 3 (b4eecb4): season packs +1000 with Sonarr min upgrade 1001; `MissingRecheck` asks
  Radarr/Sonarr to search missing items again (default 6 h, Settings → Advanced; ≤ 3 per app per
  10 min, 20 s apart, oldest `lastSearchTime` first, skips queued/unreleased/recent) (D-067).
- **Released v0.0.16** (pin sha-dcc52b0, release commit fb2ad4c, store 3af86ba): CI + stack test
  green on both arches, leak test passed. The stack test can't run the language steps (no TRaSH
  download in CI), so `dev/recyclarr-test.sh` (CI job "Recyclarr profiles", 3870177) now runs the
  real `radarr/sonarr.languages` step against real Radarr 6.4.4 / Sonarr 4.0.20: scores, German/French
  parsing, Radarr "Any", idempotent, scores survive a sync, season packs 1000 / min upgrade 1001 — all
  pass. Owner test of v0.0.16 still to do (owner: "do the test later").
- Item 11 (fallbacks, D-068) built after the owner's OK (2026-11-10): StuckFinder + home-screen
  "Needs your OK" + Settings → Advanced "Accept alternatives automatically". Owner's follow-ups the
  same day: saved passwords stay hidden with a note (D-064 revised); audio and subtitle lists with
  must-haves (D-066 revised).
- Verified locally: lint, typecheck, 269 unit tests, build, Playwright 35 passed (new checks: toggle
  ≥ 40 px, hint scrolls, VPN/poster links, logo → home, hidden-password note, language ranking).
  **Not pushed (owner's instruction), so no CI / stack test / image yet.** Docker-only parts are
  unproven against the real apps: the custom-format/profile PUT bodies (Sonarr 4.0.20, Radarr 6.4.4),
  Recyclarr's `except_patterns` + `min_upgrade_format_score`, Jellyfin `POST /Users/Configuration`.
  Next: owner OK → push → Image → pin → `Umbrel app` stack test + `dev/recyclarr-test.sh` job; add a
  real-API check for the language formats to `dev/recyclarr-test.sh` (it already runs real
  Sonarr/Radarr) before releasing.

### 2026-11-09 (later) — LQ releases rejected by size (D-063)
- Owner: some movies still stuck; interactive search shows releases with score −10. Cause: the
  guide's minimum sizes (Bluray-1080p 50.8 MB/min) reject YTS-sized encodes D-055 meant to allow.
  Recyclarr now lowers WEB/Bluray minimums to 5/10/20 MB/min (720p/1080p/2160p).

### 2026-11-09 — Search sites back; automatic un-pausing (D-062)
- Owner's in-netns test: DNS works (Gluetun 127.0.0.1), nyaa.si 200, YTS API 200, 1337x 403
  (Cloudflare challenge → FlareSolverr, which answers "ready"). So the 2026-11-07 outage was
  temporary; what kept downloads stuck were the hours-long indexer back-offs.
- `status/indexer-health.ts`: every 5 min test paused Prowlarr indexers, then the apps' ones; new
  home-screen warning `indexersDown`. Fakes: FakeServarr `paused`/`unreachable` + `/indexerstatus`.

### 2026-11-08 (night) — Hotfix v0.0.13
- Owner saw "Request page … Didn't work: request/body/id is read-only" after updating. The D-058
  externalUrl fill-in PUT sent Seerr's readOnly `id` back (seerr-api.yml v3.5.1); only pre-v0.0.11
  installs take that path, so fresh-install stack tests missed it. Fix strips `id`; the fake Seerr
  rejects it now. Pinned sha-9943610, stack test green (both arches, leak test passed), store synced.
- Indexer-unreachable issue still open: owner asked to test it; MCP can't exec/read EasyArr logs and
  SSH needs a password, so the in-netns commands were handed to the owner again.

### 2026-11-08 (later) — Phase 07: dashboard + settings → v0.0.12 (Claude Code on the Mac)
- Server: `GET /api/status` (D-059): health + version per service, qBittorrent + SABnzbd queues,
  disk, Jellyfin recently added (posters via `/api/media/:id/image`), warnings (VPN not set up/down,
  disk < 10 %, used service down, wiring problems, second Jellyfin via DNS `jellyfin_server_1`,
  update via store manifest vs `APP_VERSION`). `PUT /api/ui` stores Simple/Advanced in state.json.
  `GET /api/logs/:source` (VPN, qBittorrent, Sonarr, Radarr, Lidarr, Prowlarr), secrets masked.
- Web: dashboard home (Simple default; Advanced adds app tiles with health/version, VPN details,
  log viewer), warnings banner with links to the fix; Settings reusing the wizard step forms, a
  saved change re-runs the wiring with the live checklist and marks setup finished again (D-061).
  Account is read-only for now (D-060). New doc `docs/two-jellyfins.md`.
- Compose (pin commit): dashboard gets `APP_VERSION`.
- Verified: 244 unit tests; e2e 35 passed (incl. mode toggle remembered across reloads and a
  settings change end to end, screenshots checked at 1280 px and 390 px); stack test green on
  e97d8a0 (amd64 + arm64) incl. `/api/status` sees real Sonarr + Jellyfin, leak test passed; CI
  green on cd891ba (an e2e race fixed). Fresh clone frozen install green. Store synced v0.0.12.
- Not done / limits: log viewer has no SABnzbd/Bazarr/Jellyfin logs; Seerr shows no version;
  posters only for items with a Primary image; route-level code splitting still open.
- Owner test (v0.0.12): see `prompts/07-dashboard.md → My checklist`:
  - [ ] Home shows real downloads, VPN status (country), free space
  - [ ] Switch Simple/Advanced; reload → it stays; open each app from its tile
  - [ ] Settings → VPN: change the server country → reconnects, the home screen's VPN chip updates
  - [ ] Break the VPN (wrong key) → "The VPN isn't connected" warning appears; fix it → gone
  - [ ] Settings → Libraries & quality: change something → checklist runs → "Done"

### 2026-11-08 — Owner diagnostics; Seerr links → v0.0.11 (Claude Code on the Mac)
- v0.0.10 confirmed on the owner's Umbrel: Queue Cleaner on, the stuck metadata torrent was
  removed (Radarr `downloadFailed` 20:10, ~15 min after the update).
- Root cause of "never reached qBittorrent": all torrent sites (1337x, Nyaa, YTS via
  movies-api.accel.li) fail from inside the VPN since ~15:00 ("Unable to connect … DNS/SSL"),
  Prowlarr backs off (→ 429 to the *arrs), Sonarr/Radarr disable Prowlarr for up to 6 h ("No
  available indexers"). Not on Gluetun's malicious blocklist. Waiting for the owner's in-netns
  DNS/curl test to tell DNS vs blocked VPN server vs Cloudflare. Planned: clear stale backoffs
  automatically + say "search sites unreachable" in the dashboard.
- Fixed: Seerr "Open in Radarr/Sonarr" pointed at `w1kyu-easyarr_vpn_1:7878` (no externalUrl).
  D-058: `http://${DEVICE_DOMAIN_NAME}:39000/apps/<name>`; set once for existing installs.
  Stack test checks it in the real Seerr (amd64 + arm64, green on db79974). Store synced v0.0.11.

### 2026-11-07 — Stuck downloads → v0.0.10 (Claude Code on the Mac)
- Owner report: 2nd request never reached qBittorrent; 3rd stuck on "downloading metadata" 20+ min.
- Cause found for the 3rd: Cleanuparr was wired (instances + qBit) but a fresh Cleanuparr has the
  Queue Cleaner off and no rules, so nothing ever cleaned up. D-057: Queue Cleaner on (5 min;
  metadata/errored 3 strikes; stall rule "EasyArr – stalled downloads" 6 strikes, public only),
  Seeker proactive search on for Sonarr/Radarr. Removal goes through the *arr with blocklist and
  Cleanuparr queues the replacement search itself.
- Verified: unit tests (fake mirrors Cleanuparr 2.10.12 fresh answers), stack wiretest checks the
  three settings in the real Cleanuparr (amd64 + arm64, CI green on ed45cc4), leak test passed,
  fresh clone frozen install green. Store synced (v0.0.10).
- Not diagnosed: the 2nd request. Umbrel MCP can't read EasyArr logs/data (not granted).
- Owner test: update to v0.0.10, wait ~5 min after start, the stuck torrent should disappear within
  ~15 min and a new one appear (or the item shows as searched again in Cleanuparr → Events).

### 2026-11-05 — Phase 06 owner test feedback → v0.0.9 (Claude Code on the Mac)
- Owner checked VPN routing with a throwaway curl container in each service's network namespace:
  every VPN-side service exits with the VPN IP; dashboard, Jellyfin and Seerr use the home IP, as
  intended. No leak.
- Owner feedback: (1) adding FlareSolverr felt like it needed the Indexers settings page; it should
  only need the `flaresolverr` tag in the add-site form (that's the design, so something went
  wrong on the install; cause not found yet, diagnostic script sent). (2) The movie request stayed
  "Missing (Monitored)": all 4 releases were LQ (−10000 < minimum 0).
- v0.0.9: LQ as a last resort (D-055), with Balanced movies' Bluray/WEB 1080p in one group so an LQ
  "Bluray" can't beat a good WEB-DL; the wiring re-runs silently on app start once the setup is
  finished (D-056), which brings the new profiles to existing installs.
- New CI job `dev/recyclarr-test.sh`: real Recyclarr 8.8.1 + Radarr 6.4.4 + Sonarr 4.0.20 from the
  compose pins, all presets, v0.0.8 → v0.0.9 conversion, second sync changes nothing, YTS = LQ.
- Tests: 229 unit tests.
- Owner test (v0.0.9) — update EasyArr in the Umbrel app store, then wait ~5 minutes:
  - [ ] Radarr → Settings → Profiles → "EasyArr (Balanced)": a "Bluray/WEB 1080p" group; Custom
        Formats "LQ" and "LQ (Release Title)" at −10, minimum score −20
  - [ ] Radarr → the stuck movie → Interactive Search: the LQ rows no longer have the red icon;
        press Search (automatic) → it downloads → appears in Jellyfin (port 39096)
  - [ ] FlareSolverr: send the diagnostic script's last three sections (Prowlarr indexers,
        proxies, tags)
- Released: store synced (umbrel-app-store@67f6d8f, v0.0.9 from easyarr@c48cd3a); CI + stack test green (amd64 + arm64).
- Next: owner test, FlareSolverr fix, then `prompts/07-dashboard.md`.

### 2026-11-01 (afternoon) — Phase 06: wizard steps 6–9, full first-run e2e (Hermes)
- Step 6 Usenet: provider vs indexer explainer; 1–5 providers (11 verified presets) and 1–10
  indexers (Prowlarr's preset list); Test buttons via SABnzbd `test_server` / Prowlarr
  `indexer/test` with plain reasons (incl. "your VPN isn't connected"); passwords/API keys in
  secrets.json v4 by entry id, never returned (D-050). `docs/usenet-101.md` finished.
- Step 7 Indexers: guide (`docs/indexers.md`) beside "Open Prowlarr" + live count; server checks
  Prowlarr really has one, or "Do this later" with an honest dialog (D-051).
- Step 8 What do you want?: libraries, language (Bazarr + Jellyfin metadata), quality preset with
  size hints; `docs/quality-presets.md` (D-052).
- Step 9 Finish: wiring with the live checklist, plain explanations per failure, Retry, AI-help
  placeholder, "Finish anyway", what-now tour; saving an earlier step re-opens Finish (D-053).
  `/dev/wiring` removed. Wiring now adds Usenet servers to SABnzbd and indexers to Prowlarr.
- Tests: 218 unit tests; Playwright 29 tests — wizard spec + full first run for torrents-only,
  Usenet-only, both, each against a fresh dashboard with the shared service fakes (D-054); on the
  stack the wizard e2e goes through Finish with the real services (only the offline TRaSH sync fails).
- Released **v0.0.8** (easyarr sha-7c63806).
- Owner test (v0.0.8) — ideally reinstall EasyArr (fresh app data) and go through it like a beginner:
  - [ ] Whole wizard; at step 9 every line ends in "Done" (with your real VPN)
  - [ ] Torrents: add a site in Prowlarr from step 7; EasyArr notices it by itself
  - [ ] Usenet (if you have accounts): pick your provider, Test → "It works"; same for the indexer
  - [ ] Request a legal test item (e.g. a public-domain film) on the request page (port 39055)
        → it downloads through the VPN → appears in Jellyfin (port 39096)
  - [ ] Note every confusing sentence and tell the agent
- Next: owner test, then `prompts/07-dashboard.md`.

### 2026-11-01 — Phase 05, part 2: every service wired, proven against the real containers (Hermes)
- Research for all services moved into the repo: `docs/dev/research/*.md` (commit-pinned citations).
- Clients: Servarr (Sonarr/Radarr/Lidarr/Prowlarr), qBittorrent, SABnzbd, Cleanuparr (+ Jellyfin,
  Seerr, Bazarr, Recyclarr from part 1). Steps (`wiring/steps.ts`): download folders → Lidarr
  quality profile → Sonarr/Radarr/Lidarr root folders + download clients + hardlinks + completed
  download handling → Prowlarr apps + FlareSolverr → Recyclarr profiles → Bazarr → Jellyfin (wizard
  with the owner's account, API key, libraries, GPU) → request page (admin via Jellyfin, libraries,
  Sonarr/Radarr) → Cleanuparr (setup, apps, qBittorrent). Each step waits only for the services the
  plan needs (D-047). `/api/wiring` registered; temporary page `/dev/wiring`.
- init now seeds Bazarr, Unpackerr, SABnzbd `url_base`, qBittorrent localhost access; compose: Recyclarr
  runner (sync only on request, D-048), Cleanuparr `BASE_PATH`, Recyclarr folder in the dashboard
  (D-049). Proxy drops X-Forwarded-For.
- Tests: 18 wiring unit tests against faked services; `dev/stack.sh wiretest` in CI against the real
  containers: everything connected, second run = 0 changes, deleted connection stays deleted, repair
  puts it back. Found + fixed by the real run: a fresh SABnzbd has no categories section.
  In CI only Recyclarr fails (no internet without a real VPN) — expected; on a real Umbrel it syncs.
- Released **v0.0.7** (easyarr sha-13a178b).
- Owner test (v0.0.7):
  - [ ] Update EasyArr to 0.0.7; open `http://umbrel.local:39000/dev/wiring` (or EasyArr → add
        `/dev/wiring` to the address) → "Connect everything" → every line ends in "Done"
  - [ ] Press it again → "Everything was already connected"
  - [ ] Open Sonarr/Radarr/Prowlarr/qBittorrent from that page — downloaders, folders and apps are linked
  - [ ] Log into Jellyfin (port 39096) with your EasyArr account; Movies/Shows/Music exist
  - [ ] The request page (port 39055) lets you sign in with the same account
- Next: `prompts/06-wizard-rest.md`.

### 2026-10-31 (evening) — Phase 05, part 1: proxy, allowlist, engine core (Hermes agent on the owner's Umbrel)
- Owner confirmed the VPN works. Its logs showed Gluetun failing to clean up its own firewall rules on
  every reconnect (`cannot remove outdated VPN connection rule … "!10.21.0.16"`): our guard rule's
  negated address broke Gluetun's rule parser. Guard moved to the mangle table; image smoke test now
  makes Gluetun reconnect between real servers and checks the clean-up (D-044). **v0.0.5** released.
- Service proxy `/apps/<service>/` (HTTP + WebSocket; prefix kept, stripped for qBittorrent), own
  cross-site check, Origin/Referer/X-Forwarded-For dropped, loopback + Umbrel gateway only, "not
  answering" page (D-045).
- Found while designing the proxy: with authentication off inside the apps, every other Umbrel app
  on the shared Docker network could control Sonarr/qBittorrent/FlareSolverr. Fixed: the VPN
  wrapper only accepts connections from the dashboard and the request page (list written by the
  dashboard, D-046). Stack test proves other apps are refused. **v0.0.6** released (CI green
  amd64 + arm64, store synced).
- Research for every service API, from upstream source at the pinned versions:
  `docs/dev/research/{servarr,downloaders,jellyfin-seerr,bazarr-recyclarr}.md`.
- Wiring engine core: ledger in state.json (schema v4), idempotent resources (create / adopt /
  respect deletions / repair), one-time settings, SSE routes; clients for Jellyfin, Seerr, Bazarr,
  Recyclarr, Servarr. Not wired into the app yet.
- Next (same phase): qBittorrent/SABnzbd/Cleanuparr clients, the steps, init seeding (Bazarr,
  Unpackerr, qBittorrent LocalHostAuth, SABnzbd url_base), compose (Recyclarr runner, Cleanuparr
  BASE_PATH), dev trigger button, CI integration test with real containers.

### 2026-10-31 — Phase 04: VPN wrapper, kill switch, provider catalog, wizard step 5 (Hermes agent on the owner's Umbrel)
- Start: owner allowed phase 04 "if everything checks out" — installed 0.0.3 checked via Umbrel MCP
  (status, logs, API health, services reachable) → OK.
- VPN image `ghcr.io/w1kyu/easyarr-vpn` (`vpn/`): Gluetun v3.41.3 + POSIX-shell wrapper under tini —
  default-deny kill switch before anything else and whenever Gluetun isn't running, waits for
  `vpn.env`, live reload without restarting the container, crash back-off, `status.json`, capped
  `gluetun.log`, allowlisted settings, iptables guard, health check = "kill switch in place" (D-040).
  CI: shellcheck + unit tests (dash, busybox) and a Docker smoke test on amd64 + arm64
  (unconfigured / invalid config / reload / crash → no egress; Docker network → service port works).
- Provider catalog (`@easyarr/shared/vpn-providers.ts`): every Gluetun provider, fields per protocol,
  port forwarding auto/static/none, free plan; server locations generated from Gluetun's
  `servers.json` and checked in CI (D-042).
- Server: `/api/vpn/config|status|test|reconnect`, Gluetun control-server client with API key (init
  writes Gluetun's auth file), plain-language diagnosis from Gluetun's log, home-IP check, port sync
  to qBittorrent, API restricted to loopback + Umbrel's gateway (D-041). State schema v3.
- Web: wizard step 5 — searchable grouped provider list with badges, WireGuard pre-selected, guide
  next to the form (collapsible on phones), Connect → live "Connecting…" → ✅/❌ result with fix
  hints, "Skip for now" with an honest confirmation. Help pages moved to `/help/*` (sub-folders).
- Docs: `docs/vpn/README.md` + guides for Proton VPN, Mullvad, NordVPN, Surfshark, PIA, AirVPN,
  other providers and custom files (steps checked against the providers' help centres today).
- Tests: 152 unit tests; e2e 10 tests incl. a fake VPN side (wrong password → plain reason → fix →
  connected, home IP hidden, port forwarding) — 3 consecutive local runs green. Stack test now also
  saves a dead-end VPN through the dashboard and checks no egress while Gluetun tries + during a
  reload, the vpn container stays healthy, other apps get 403, Gluetun's control server needs the key.
- Umbrel app v0.0.4: vpn = `easyarr-vpn:sha-bbccd9c@sha256:1df45625…`, services wait for
  `vpn` healthy, dashboard + init `sha-19fe549@sha256:c679f7b8…`, dashboard mounts the VPN folder
  and gets `NETWORK_IP`. Linter: 0 errors.
- Caught by the stack leak test: with no VPN, apps could still look up names through Docker's DNS
  (127.0.0.11 → host resolver, outside the VPN). Fixed: the kill switch blocks Docker's DNS (D-043);
  image smoke test and stack test check lookups fail.
- Final: CI, VPN image, Umbrel linter and the stack + kill-switch test green on amd64 + arm64 for
  19c8ad4; fresh clone green (152 unit tests); store synced (v0.0.4, store 5a36ec1).
- Decisions D-040…D-043.
- Owner checklist (phase 04 — update to / install 0.0.4):
  - [x] Wizard step 5: set up your VPN following only the in-app guide (owner, 2026-10-31)
  - [x] The test shows the VPN's IP + country and "Your home IP is hidden" (owner, 2026-10-31)
  - [ ] Change a setting (e.g. another country) and press Connect again → reconnects, no reinstall
  - [ ] Leak check (Umbrel → Settings → Advanced → Terminal):
        `sudo docker exec w1kyu-easyarr_qbittorrent_1 curl -s -m 10 https://ipinfo.io/ip`
        → with the VPN connected it prints the VPN's IP (not yours); after saving a wrong key or password
        in step 5 the same command prints nothing / times out
  - [ ] "Skip for now" text is clear; the app still works after skipping (Jellyfin opens)

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
