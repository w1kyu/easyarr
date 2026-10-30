# Phase 08 — Backup & restore

Follow the session protocol in `CLAUDE.md`. Relevant spec: §11, D-015.

## Research first (record in PROGRESS.md)
- Servarr backup/restore API endpoints (Sonarr, Radarr, Lidarr, Prowlarr), Jellyfin built-in backup/restore
  in the shipped version, SABnzbd/qBittorrent/Bazarr/Jellyseerr config backup options, how each service
  can be restarted via its own API, and whether the compose restart policy brings it back.

## Tasks
1. **Format** `.easyarr` (tar.gz + `manifest.json`, checksums, format version) with a versioned
   reader/writer and migrations. Optional AES-256-GCM encryption with scrypt key derivation.
   Unit tests: round-trip, wrong password, corrupted file, older format, newer format refused.
2. **Create**: state + secrets + native service backups where available (SPEC §11). Never media, never
   in-progress downloads. `POST /api/backup` streams the file to the browser.
3. **Automatic backups**: daily at 04:00 local (configurable), keep last 7 (configurable), stored in
   `/data/backups/`; shown in Settings with date, size, download, restore, delete.
4. **Restore**: upload or pick an automatic backup → validate → password if encrypted → summary of what
   will be restored → confirm → live SSE progress → restore state + native backups → restart services via
   their APIs → VPN test → wiring check. Available from wizard step 1 ("Restore from backup") and
   Settings → Backup.
5. Clear UI copy: "This backs up your setup, not your movies", encryption recommended for downloads.
6. Write `docs/backup-restore.md` (incl. how to copy backups off the Umbrel via Files).
7. CI integration test: configure → backup → wipe volumes → fresh start → restore → compare
   (ledger, download clients, indexer apps, Jellyfin libraries, VPN config).

## Done when
- Backup on one install → fresh install → restore = same working setup.
- PROGRESS.md updated; next = `prompts/09-support.md`.

## My checklist (owner)
- [ ] Download an encrypted backup
- [ ] Uninstall EasyArr, reinstall, choose "Restore from backup" → everything back
- [ ] Wrong password shows a clear message
