# CLAUDE.md — How to work on EasyArr

You are working on **EasyArr**: a public, beginner-friendly Umbrel app that bundles a pre-wired,
VPN-protected media automation stack (Sonarr, Radarr, Lidarr, Prowlarr, qBittorrent, SABnzbd,
Bazarr, Jellyfin, Jellyseerr, …) with a setup wizard and an umbrelOS-style dashboard.
Owner: **w1kyu** (GitHub `w1kyu`). The owner is a CS student; explain decisions briefly and clearly.

## Read first — every session, in this order
1. `PROGRESS.md` — current phase, what's done, what's next, known issues, verified facts.
2. `SPEC.md` — the full specification. Treat it as the source of truth.
3. `DECISIONS.md` — why things are the way they are. Don't re-litigate logged decisions without reason.
4. The prompt for the current phase in `prompts/` if the user gave you one.

If you are resuming without a specific instruction, follow `prompts/CONTINUE.md`.

## Session protocol
**At the start**
- Read the files above. Summarise in 3–5 lines: current phase, last session's outcome, what you'll do now.
- Run the build/tests once to confirm the repo is green before changing things. If it isn't green,
  fixing that comes first.

**While working**
- Stay inside the scope of the current phase. Note out-of-scope ideas under
  `PROGRESS.md → Ideas / later` instead of building them.
- Before relying on anything marked **[VERIFY]** in SPEC.md, check current upstream docs/source,
  then record the result in `PROGRESS.md → Verified facts` (with date + source link).
- When you make a non-trivial decision (library, approach, deviation from SPEC), append it to
  `DECISIONS.md`. If it changes the spec, update `SPEC.md` too.
- Commit in small, logical steps with clear messages (Conventional Commits: `feat:`, `fix:`, `docs:`,
  `chore:`, `test:`, `refactor:`).

**At the end (always, even if unfinished)**
- Update `PROGRESS.md`: phase status, a dated session-log entry (what was done, what's next,
  blockers), and the manual test checklist for the owner if something needs testing on a real Umbrel.
- Commit and push.
- Tell the owner in plain words: what's done, what they must test, what the next prompt/phase is.

## Ask the owner only for
- Product decisions not covered by SPEC/DECISIONS (UX wording direction, scope changes).
- Things only they can do: create accounts/tokens, test on their Umbrel, approve publishing.
Everything technical: decide yourself, log it in DECISIONS.md.

## Non-negotiable rules
- **Beginner first.** No feature may require a terminal for end users.
- **Kill switch must never leak.** Any change touching `vpn/` needs the leak test (SPEC §5.2).
- **Wiring is idempotent and never overwrites user changes** (SPEC §10.2).
- **No Docker socket**, no privileged containers beyond Gluetun's `NET_ADMIN` + `/dev/net/tun`.
- **Secrets never in logs, commits, test fixtures, or diagnostics.** Redaction is unit-tested.
- **umbrelOS code may be reused only via `vendor/umbrel/`** under the rules in SPEC §14.1: verbatim
  upstream LICENSE, every file listed in PROVENANCE.md (path, commit, modified?), never mixed into our
  own files. **Never** copy the Umbrel logo/name/brand marks. Wallpapers, images, fonts and icons only
  if their origin and license are clear. Our own code is MIT.
- **All user-facing strings via i18n keys** (`web/src/locales/en.json`).
- **Multi-arch:** everything must work on linux/amd64 and linux/arm64.
- **App name lives in one place** (`dashboard/shared/src/brand.ts` + `umbrel-app.yml`). Don't hard-code it elsewhere.
- Pin images by digest in the Umbrel compose.

## Repo map (see SPEC §4)
- `dashboard/server` — Fastify API, wiring engine, backups, diagnostics, reverse proxy, `init` command
- `dashboard/web` — React wizard + dashboard
- `dashboard/shared` — types, zod schemas, brand, VPN provider catalog
- `vpn/` — Gluetun wrapper image
- `umbrel/w1kyu-easyarr/` — Umbrel app definition (synced to `w1kyu/umbrel-app-store` on release)
- `dev/` — local dev compose mimicking Umbrel
- `docs/` — user + dev docs (rendered in-app too); `llms.txt` generated from them

## Commands (keep this section up to date when tooling changes)
```
pnpm install
pnpm dev            # web + server with hot reload (against dev/docker-compose.dev.yml)
pnpm lint           # eslint + prettier --check + vendored-code license check
pnpm format         # prettier --write
pnpm typecheck
pnpm test           # unit tests (vitest, all dashboard/* packages)
pnpm test:e2e       # Playwright wizard e2e (after pnpm build; E2E_BASE_URL=… for the stack)
pnpm build
dev/stack.sh up|wait|leaktest|down   # full Umbrel stack locally (Docker), see docs/dev/development.md
```
Node 26 (`.nvmrc`), pnpm 12, TypeScript 6.0 (see D-021).

## Definition of done (per task)
- Builds, lint + typecheck + tests pass.
- New logic has tests (wiring, redaction, state migrations, backup format: always).
- User-facing text is plain English, via i18n keys, and docs are updated if behaviour changed.
- PROGRESS.md updated.
