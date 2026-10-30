# Phase 01 — Umbrel app definition + full compose stack

Follow the session protocol in `CLAUDE.md`. Relevant spec: §3, §5, §6, §18, §19.

## Goal
EasyArr installs on a real Umbrel from the `w1kyu Apps` store, and every container comes up healthy
with the correct network layout — no dashboard features yet.

## Research first (record in PROGRESS.md → Verified facts)
Read the current official app packaging docs and several real apps in `getumbrel/umbrel-apps`
(Sonarr, Radarr, qBittorrent, Jellyfin, and any app using Gluetun or `network_mode: service:`).
Resolve these [VERIFY] items:
- `umbrel-app.yml` fields, `app_proxy` format (`APP_HOST` container naming, `APP_PORT`),
  `PROXY_AUTH_*` options, available env vars (`APP_DATA_DIR`, `UMBREL_ROOT`, `APP_SEED`, …).
- Whether `depends_on` conditions and `restart: unless-stopped` work on umbrelOS; healthchecks.
- umbrelOS 1.x user storage path for `EasyArr/` (visible in Files) and correct PUID/PGID.
- How the official Jellyfin app handles `/dev/dri` with and without a GPU.
- Port availability for 39000 / 39096 / 39055.
- Fastest dev loop for testing an app on a real Umbrel (store refresh, CLI, etc.).
- Every image in SPEC §3 supports amd64 + arm64; Cleanuparr image/port; Jellyseerr project status.

## Tasks
1. `umbrel/w1kyu-easyarr/umbrel-app.yml` + `docker-compose.yml` per SPEC (all services, pinned by digest).
2. VPN namespace: `vpn` service = plain `qmcgaw/gluetun` for now (wrapper comes in Phase 04) with
   `NET_ADMIN`, `/dev/net/tun`. All VPN services use `network_mode: service:vpn`; internal ports per SPEC §3
   (no collisions). **Temporary safety:** until Phase 04, the VPN-side services must not reach the internet —
   use Gluetun's firewall/kill switch with no valid config, and verify nothing leaks.
3. Placeholder dashboard behind `app_proxy` (e.g. a tiny static page image) so the app opens in Umbrel.
4. `/data` single mount + folder tree per SPEC §6 (temporary init via a small one-shot container is fine;
   the real `init` command arrives in Phase 02).
5. Jellyfin + Jellyseerr published on 39096 / 39055.
6. `dev/docker-compose.dev.yml` that runs the same stack on a laptop with Umbrel-like env vars.
7. Script/workflow to sync `umbrel/w1kyu-easyarr/` into the `w1kyu/umbrel-app-store` repo (manual
   script is fine now; automation in Phase 11). Sync it.
8. A short `docs/dev/development.md`: how to test on a real Umbrel.

## Out of scope
Dashboard UI, wizard, VPN wrapper/live reload, wiring.

## Done when
- Installs from the store on a real Umbrel; all containers running/healthy; Jellyfin + Jellyseerr reachable.
- From inside qBittorrent's namespace, internet access fails (no VPN configured yet).
- Every decision (ports, paths, GPU handling, init approach) logged in DECISIONS.md.
- PROGRESS.md updated; next = `prompts/02-dashboard-skeleton.md`.

## My checklist (owner)
- [ ] Add store URL `https://github.com/w1kyu/umbrel-app-store` in umbrelOS
- [ ] Install EasyArr; it opens (placeholder page)
- [ ] `umbrel.local:39096` shows the Jellyfin setup page, `umbrel.local:39055` shows Jellyseerr
- [ ] `EasyArr` folder with downloads/media/backups appears in Files
- [ ] Uninstall + reinstall works
