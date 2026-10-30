# Phase 03 — Wizard framework + steps 1–4

Follow the session protocol in `CLAUDE.md`. Relevant spec: §8 (steps 1–4), §7.2, §7.3, §15.

## Goal
A reusable wizard framework and the first four steps: Welcome, System check, Create your account,
How do you want to download?

## Tasks
1. **Wizard framework**: step registry (id, title, component, `isVisible(state)`, `validate()`),
   progress indicator, Back/Next, per-step persistence via `/api/wizard/:step` (refresh-safe),
   resume where the user left off, "What's this?" links that open the in-app docs viewer
   (a simple Markdown viewer reading from `docs/` — polish comes in Phase 10).
   Steps must be reusable later as Settings pages (SPEC §12).
2. **Step 1 Welcome**: plain explanation + short legal note; buttons "Start setup" and
   "Restore from backup" (disabled with "coming soon" until Phase 08).
3. **Step 2 System check**: `/api/system-check` (arch, RAM, free disk on `/data`, GPU presence per the
   Phase 01 decision). Thresholds + wording per SPEC §8. Unit-test the verdict logic.
4. **Step 3 Create your account**: username + password with strength meter and confirmation; store
   username + a password hash in state and the plaintext only in `secrets.json` (it must be applied to
   Jellyfin later). Explain family accounts come later.
5. **Step 4 Download method**: Torrents / Usenet / Both cards with plain pros/cons; links to
   `docs/torrents-101.md` and `docs/usenet-101.md` (create short first drafts now).
6. Playwright e2e test for steps 1–4 against the dev stack.

## Out of scope
VPN step (Phase 04), remaining steps (Phase 06), applying the account to services (Phase 05).

## Done when
- I can click through steps 1–4 on my Umbrel, refresh mid-way and continue.
- All text via i18n keys; e2e test passes in CI.
- PROGRESS.md updated; next = `prompts/04-vpn.md`.

## My checklist (owner)
- [ ] Go through steps 1–4; wording is clear for a beginner
- [ ] System check shows correct values for my Umbrel
- [ ] Refreshing the page keeps my progress
