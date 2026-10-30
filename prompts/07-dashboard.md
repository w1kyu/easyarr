# Phase 07 — Dashboard + Settings

Follow the session protocol in `CLAUDE.md`. Relevant spec: §12, §14.

## Tasks
1. `/api/status`: services health + versions, VPN state (country, port forwarding), active downloads
   (qBittorrent + SABnzbd queues), disk usage, recently added (Jellyfin), warnings. Efficient polling/caching.
2. **Simple mode** (default): big "Watch" (Jellyfin URL on port 39096) and "Request" (Jellyseerr on 39055)
   tiles, status strip, downloads list, recently added.
3. **Advanced mode** toggle (persisted): tiles for every service (umbrelOS app-grid look), per-service
   health/version, VPN details, redacted log viewer.
4. **Warnings banner**: VPN down, disk < 10 % free, service unhealthy, official Umbrel Jellyfin app also
   installed (detect via port/host probing or document limitation), update available (compare with
   latest GitHub release).
5. **Settings** reusing wizard step components: account, download method, VPN, Usenet, libraries/quality,
   advanced (re-run wiring, repair connections), about (version, links). Changing a setting re-runs the
   relevant wiring with the live checklist. Backups section placeholder (Phase 08).
6. Responsive + accessible; Playwright tests for mode toggle and a settings change.

## Done when
- I can use EasyArr daily without opening the *arr apps.
- PROGRESS.md updated; next = `prompts/08-backup-restore.md`.

## My checklist (owner)
- [ ] Dashboard shows real downloads, VPN status, disk
- [ ] Switch Simple/Advanced; open each app
- [ ] Change VPN server country in Settings → reconnects, status updates
- [ ] Stop the VPN (wrong key) → warning banner appears
