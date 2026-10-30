# PROGRESS.md — EasyArr status & handoff log

> Living document. Every Claude session reads this first and updates it last.
> Newest session log entries go on top.

## Current phase
**Phase 00 — not started.** Planning is complete (see SPEC.md, DECISIONS.md).
Next prompt to run: `prompts/00-setup.md`.

## Phase status
| Phase | Title | Status | Notes |
|---|---|---|---|
| 00 | Repos, structure, tooling | ⬜ todo | |
| 01 | Umbrel app + compose stack | ⬜ todo | |
| 02 | Dashboard skeleton + design system + CI | ⬜ todo | |
| 03 | Wizard basics (steps 1–4) | ⬜ todo | |
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
- 2026-10-30 — Umbrel `app_proxy` uses `APP_HOST`/`APP_PORT` to point at the app's web container (seen in umbrel-apps PR reviews; re-check current format). — https://github.com/getumbrel/umbrel-apps/pull/468

## Open [VERIFY] items
Copy from SPEC as they get resolved. Highest priority first:
- [ ] Umbrel compose: `depends_on` conditions, restart policies allowed, `APP_SEED`, container naming for `APP_HOST`
- [ ] umbrelOS 1.x user storage path (`${UMBREL_ROOT}/home/...`) + PUID/PGID
- [ ] Jellyfin `/dev/dri` handling with/without GPU (check official Umbrel Jellyfin app)
- [ ] Gluetun control server endpoints + auth requirements; port-forwarding provider list
- [ ] Sub-path support per service (Servarr, Bazarr, SABnzbd, qBittorrent, Cleanuparr)
- [ ] Jellyfin startup API + backup/restore API; Jellyseerr setup API + project/image status
- [ ] Servarr backup/restore API endpoints
- [ ] Port range 39000/39096/39055 free in official + popular community stores
- [ ] Cleanuparr image name, port, config format
- [ ] umbrelOS UI code: where components/design tokens live upstream; exact LICENSE text incl. any "Required Notice"
- [ ] Origin + license of umbrelOS wallpapers, fonts and icons before vendoring any of them

## Known issues
_None yet._

## Ideas / later
_Out-of-scope ideas noted during work go here._

## Session log
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
