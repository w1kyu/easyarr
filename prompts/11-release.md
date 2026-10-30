# Phase 11 — Release v0.1.0

Follow the session protocol in `CLAUDE.md`. Relevant spec: §19, §20.

## Tasks
1. **Umbrel packaging check**: `umbrel-app.yml` complete (tagline, beginner-friendly description,
   gallery screenshots, release notes, links), all images pinned by digest, follow umbrel-apps
   guidelines and run their linter if available.
2. **Renovate**: digest pinning for compose images + npm deps; grouping; auto-merge only patch-level
   digest bumps after CI passes (or none — decide and log).
3. **Release workflow** (tag `vX.Y.Z`): CI green → build + push multi-arch images → update digests +
   version + releaseNotes in `umbrel/w1kyu-easyarr/` → sync into `w1kyu/umbrel-app-store` (PR or commit)
   → GitHub release with changelog. Document in `docs/dev/release.md`.
4. **Upgrade safety**: test updating from the previous build with existing state (migrations run, nothing
   overwritten, wiring "add missing only").
5. **Manual release checklist** (SPEC §20) as `docs/dev/release-checklist.md`; walk me through it.
6. Final name check ("EasyArr" vs similar projects) — report findings, I decide.
6b. **License audit** (SPEC §14.1): PROVENANCE.md complete and matching `vendor/umbrel/`; upstream
   LICENSE verbatim; notices in the Docker image and linked from the About page; README + NOTICE.md
   state the noncommercial restriction; no Umbrel logo/brand marks anywhere; npm dependency licenses OK.
   Draft a short email to help@getumbrel.com describing EasyArr and the vendored code, for me to send
   (useful now and required before any official store submission).
7. Tag v0.1.0, publish, announce text draft (Umbrel community forum + r/selfhosted) for me to post.

## Done when
- v0.1.0 installs from `w1kyu Apps` on a fresh Umbrel and passes the release checklist.
- PROGRESS.md: all phases ✅, "Ideas / later" turned into GitHub issues for v1.1/v2.

## My checklist (owner)
- [ ] Fresh Umbrel (or reinstall): full checklist passes
- [ ] Update from previous version keeps my settings
- [ ] Approve and post the announcement
