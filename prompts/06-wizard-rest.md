# Phase 06 — Wizard steps 6–9 (complete first-run flow)

Follow the session protocol in `CLAUDE.md`. Relevant spec: §8 (steps 6–9), §10.

## Tasks
1. **Step 6 Usenet** (only if chosen): plain "provider vs indexer" explainer; provider form (host, port,
   SSL, username, password, connections) with presets for common providers [VERIFY each preset];
   indexer form(s) (name, URL, API key); "Test" buttons using SABnzbd/Prowlarr test APIs with
   plain-language results. Finish `docs/usenet-101.md`.
2. **Step 7 Indexers** (only if torrents): guided tutorial for adding indexers in Prowlarr (opens
   `/apps/prowlarr/` in a new tab, side-by-side steps), "I added at least one" check via Prowlarr API.
   EasyArr does not recommend specific trackers. Write `docs/indexers.md`.
3. **Step 8 What do you want?**: library toggles (Movies/TV/Music), preferred language, quality preset
   (Best / Balanced default / Save space) with plain explanations and disk-usage hints.
   Write `docs/quality-presets.md`.
4. **Step 9 Finish**: runs wiring with the live SSE checklist, plain errors + Retry + "Get help with AI"
   placeholder (real in Phase 09), success screen with a short "what now" tour.
5. Remove the temporary dev wiring button from Phase 05 (or keep it under Advanced only).
6. Full Playwright e2e: torrents-only, usenet-only, both (VPN-less test mode).

## Done when
- A complete first run works end-to-end on my Umbrel: wizard → request something in Jellyseerr →
  it downloads via VPN → appears in Jellyfin.
- PROGRESS.md updated; next = `prompts/07-dashboard.md`.

## My checklist (owner)
- [ ] Reset EasyArr (reinstall) and do the whole wizard like a beginner would
- [ ] Request a legal test item (e.g. public-domain film) end-to-end
- [ ] Note every confusing sentence → tell Claude
