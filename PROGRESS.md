# PROGRESS.md — EasyArr status & handoff log

> Living document. Every Claude session reads this first and updates it last.
> Newest session log entries go on top.

## Current phase
**Phase 00 — done ✅.** Both repos exist, workspace builds, CI green.
Next prompt to run: `prompts/01-umbrel-stack.md`.

## Phase status
| Phase | Title | Status | Notes |
|---|---|---|---|
| 00 | Repos, structure, tooling | ✅ done | w1kyu/easyarr + w1kyu/umbrel-app-store, CI green |
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
- 2026-10-30 — Node 26 is the current LTS line (v26.13.0 "Lithium", 2026-10-28) → `.nvmrc` = 26. — https://nodejs.org/dist/index.json
- 2026-10-30 — typescript-eslint 8.72 supports TypeScript `>=4.8.4 <6.1.0` → TS pinned to ~6.0 (D-021). — https://www.npmjs.com/package/typescript-eslint
- 2026-10-30 — umbrelOS UI path to add a store: App Store → **⋯** button (top right) → **Community App Stores** (once a store is added: Community App Stores → **Manage**) → paste URL → **Add**. — https://github.com/getumbrel/umbrel/blob/11e7f5bdfcb5bb8b46f39edd6defb4c37641763a/packages/ui/src/features/app-store/components/store-header.tsx
- 2026-10-30 — Community store template's default branch is `master`; the generated `w1kyu/umbrel-app-store` keeps `master`. — https://github.com/getumbrel/umbrel-community-app-store
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
- The template's comment says the store name shows as "<name> App Store" (→ "w1kyu Apps App Store");
  current umbrelOS UI shows `meta.name` as-is in the menu. Owner: check how it looks after adding the store.
- Add a Renovate config (planned in phase 11) — could also bump GitHub Actions versions.

## Session log
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
