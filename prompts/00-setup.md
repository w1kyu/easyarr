# Phase 00 — Repositories, structure, tooling

Follow the session protocol in `CLAUDE.md`. The planning files (`SPEC.md`, `CLAUDE.md`,
`PROGRESS.md`, `DECISIONS.md`, `prompts/`) already exist in this folder — they are the plan.

## Goal
Two GitHub repositories exist with a clean, building skeleton and all planning docs committed.

## Tasks
1. **Check prerequisites.** `git`, `gh` (logged in as `w1kyu`), Node LTS, pnpm, Docker with buildx.
   If something is missing or `gh` isn't logged in, tell me exactly what to run/install and stop.
2. **Repo `w1kyu/easyarr`** (public, MIT — see SPEC §4 + §14.1, D-020), structure per SPEC §4:
   - pnpm workspace: `dashboard/server`, `dashboard/web`, `dashboard/shared` (empty but building
     TypeScript packages with strict tsconfig, ESLint, Prettier, Vitest wired up).
   - `dashboard/shared/src/brand.ts` with `APP_NAME = 'EasyArr'`, app id, repo URL, docs URL.
   - Empty-but-present folders with a short README each: `vpn/`, `umbrel/w1kyu-easyarr/`, `dev/`, `docs/`.
   - Root scripts matching the Commands section of CLAUDE.md (`dev`, `lint`, `typecheck`, `test`,
     `test:e2e` placeholder, `build`).
   - `.editorconfig`, `.gitignore`, `.nvmrc`, `LICENSE` (MIT, copyright w1kyu), `NOTICE.md`
     (licensing overview per SPEC §14.1), short `README.md` ("work in progress" + one-paragraph pitch
     + a License section stating the noncommercial restriction).
   - Move the planning files into the repo root and `prompts/`.
   - Basic CI workflow: install, lint, typecheck, test on push/PR.
3. **Repo `w1kyu/umbrel-app-store`** (public) from Umbrel's community store template
   (https://github.com/getumbrel/umbrel-community-app-store): `umbrel-app-store.yml` with
   `id: w1kyu`, `name: "w1kyu Apps"`; remove the template's example app; README explaining what the
   store is and how to add it in umbrelOS (App Store → ⋯ → Community App Stores → paste URL)
   **[VERIFY the current UI path]**.
4. Push both. Confirm CI is green on `w1kyu/easyarr`.

## Out of scope
Any Docker compose, dashboard features, VPN.

## Done when
- Both repos exist on GitHub; `pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build` pass locally and in CI.
- PROGRESS.md: Phase 00 ✅, session logged, next = `prompts/01-umbrel-stack.md`.

## My checklist (owner)
- [ ] Both repos visible on github.com/w1kyu
- [ ] CI badge/checks green
