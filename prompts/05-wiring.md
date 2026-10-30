# Phase 05 — Wiring engine + service proxy

Follow the session protocol in `CLAUDE.md`. Relevant spec: §5.5, §10, D-012, D-014.

## Research first (record in PROGRESS.md)
- Current APIs: Sonarr v4 / Radarr / Lidarr / Prowlarr (applications, download clients, root folders,
  indexer proxies, tags), qBittorrent WebUI API (preferences, categories, auth bypass), SABnzbd API
  (servers, categories), Bazarr API, Jellyfin startup + library API, Jellyseerr setup API,
  Recyclarr config + templates, Unpackerr + Cleanuparr config.
- Sub-path support for each proxied service (SPEC §5.5) — test each one for real.

## Tasks
1. **Service proxy** `/apps/:service/*` with HTTP + WebSocket, correct headers, per-service URL base.
   Services that can't work behind a sub-path → fall back to a published port and log a decision.
2. **Service clients**: typed, small client per service (zod-validated responses), health waits with
   timeout + backoff.
3. **Wiring engine** per SPEC §10: ordered steps, progress events (SSE on `/api/wiring/run`),
   ledger in state, idempotency, never overwrite user changes, respect deletions, `/api/wiring/repair`.
   Only wire what the wizard answers enable (torrent/usenet, libraries).
4. Apply the wizard account to Jellyfin admin (+ Jellyseerr via Jellyfin) and anything else needing auth.
5. Quality presets → Recyclarr config (Sonarr/Radarr) + EasyArr Lidarr profile (SPEC §8 step 8;
   use temporary defaults until Phase 06 adds the UI).
6. Jellyfin hardware acceleration only if the GPU check passed.
7. **Tests**: unit tests with mocked APIs for every step; CI integration test with real containers
   (VPN-less test mode, SPEC §20): run wiring twice → second run changes nothing; delete a ledger
   resource → not recreated; repair → recreated.
8. Temporary dev button (Advanced/dev only) to trigger wiring until Phase 06 adds the Finish step.

## Done when
- Fresh install + wizard answers → everything connected; second run = no changes.
- All proxied UIs open from the dashboard behind the Umbrel login.
- PROGRESS.md updated; next = `prompts/06-wizard-rest.md`.

## My checklist (owner)
- [ ] Trigger wiring; open Sonarr/Radarr/Prowlarr/qBittorrent via EasyArr — all connected
- [ ] Log into Jellyfin with my wizard account; libraries exist
- [ ] Jellyseerr is set up and linked
