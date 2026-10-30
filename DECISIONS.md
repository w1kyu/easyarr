# DECISIONS.md — EasyArr decision log

> Append-only. Newest at the bottom. Format:
> `### D-NNN — Title (YYYY-MM-DD)` · **Decision** · **Why** · **Alternatives considered**
> If a later decision replaces one, add a new entry and mark the old one "Superseded by D-NNN".

### D-001 — Public beginner product, not a personal setup (2026-10-30)
**Decision:** EasyArr is a public app in a community store (official Umbrel store later). Everything user-specific is detected or asked by the wizard.
**Why:** Owner's goal is that any beginner can set it up.

### D-002 — Service set for v1 (2026-10-30)
**Decision:** Gluetun, Prowlarr, Sonarr, Radarr, FlareSolverr, qBittorrent, SABnzbd, Lidarr, Bazarr, Jellyseerr, Jellyfin (bundled), Recyclarr, Unpackerr, Cleanuparr, plus EasyArr dashboard/wizard and wiring engine.
**Why:** Chosen by owner from a candidate list. Readarr excluded (retired upstream). Cleanuparr over Decluttarr because it has a web UI.
**Alternatives:** Transmission/Deluge, NZBGet, Overseerr, Plex, Autobrr, Tdarr, Mylar3 — not in v1.

### D-003 — VPN boundary (2026-10-30)
**Decision:** All downloading/searching services run inside Gluetun's network namespace with a kill switch. Dashboard/wizard, Jellyfin and Jellyseerr run outside.
**Why:** Wizard must be reachable before the VPN is configured; media streaming through a VPN breaks remote access and adds nothing.

### D-004 — All services always installed (2026-10-30)
**Decision:** Umbrel can't conditionally start containers per user, so every service is installed; the wizard decides what is wired and shown.
**Why:** Simplicity and reliability; idle *arr apps are cheap.

### D-005 — Single /data mount (2026-10-30)
**Decision:** `EasyArr/{downloads,media,backups}` on Umbrel storage, mounted as one `/data` in all file-handling containers.
**Why:** Hardlinks require a single mount point; also visible in Umbrel Files for beginners.

### D-006 — UI language (2026-10-30)
**Decision:** English only in v1, but fully i18n-ready from day one.

### D-007 — Dashboard tech stack (2026-10-30)
**Decision:** React + Vite + TypeScript frontend, Fastify + TypeScript backend, one container image; settings in JSON files, no database; pnpm workspaces.
**Why:** Most common stack, strong tooling, fits a small single-container app.

### D-008 — License (2026-10-30) — *Superseded by D-020*
**Decision:** GPL-3.0.
**Why:** Matches the *arr ecosystem; forks stay open.

### D-009 — Name (2026-10-30)
**Decision:** Working title **EasyArr** (replaced "EasyFlix": name clashes with an existing self-hosted streaming server and an unofficial Kodi add-on; "-flix" brand risk). Name defined in one place to allow renaming.
**Note:** Similar names exist ("Ezarr", "easiarr"); re-check before a major public launch.

### D-010 — Identity (2026-10-30)
**Decision:** GitHub `w1kyu`; store id `w1kyu`, store name "w1kyu Apps"; app id `w1kyu-easyarr`; images on `ghcr.io/w1kyu/`.

### D-011 — Look & feel (2026-10-30) — *"built from scratch" part superseded by D-020*
**Decision:** Look exactly like umbrelOS (dark, frosted glass, rounded, app-grid tiles), built from scratch.
**Why:** Feels native. umbrelOS is PolyForm Noncommercial → no code/asset copying; own logo/wallpaper so it's never mistaken for an official Umbrel component.

### D-012 — Service UIs behind the dashboard proxy (2026-10-30)
**Decision:** *arr/download-client UIs are reverse-proxied under `/apps/<service>/` behind the Umbrel login instead of published ports. Jellyfin + Jellyseerr get published ports.
**Why:** One login for beginners, fewer port conflicts, no exposed unauthenticated UIs.
**Fallback:** If a service can't run behind a sub-path, publish a port for it and log a new decision.

### D-013 — Live VPN reload without Docker socket (2026-10-30)
**Decision:** Custom image wrapping Gluetun; wrapper keeps the container (and network namespace) alive, restarts only the Gluetun process on config change, and enforces default-deny egress whenever Gluetun isn't running.
**Why:** Restarting the container detaches dependent containers; Docker socket is a security risk.

### D-014 — Wiring ledger semantics (2026-10-30)
**Decision:** Wiring is idempotent, records what it creates, never overwrites user changes, and does not auto-recreate resources the user deleted (only via explicit "Repair connections").

### D-015 — Backup & restore (2026-10-30)
**Decision:** Two layers — EasyArr state replay (always works) + native service backups (full fidelity). Manual backups optionally password-encrypted (AES-256-GCM/scrypt); automatic daily backups, keep 7, stored in `EasyArr/backups/`. Media and in-progress downloads never included.
**Why:** Owner wants to restore a full setup from an uploaded backup; state replay guarantees restore works even if a native backup format changes.

### D-016 — Support via AI help prompt (2026-10-30)
**Decision:** "Get help with AI" button generates a redacted, copy-paste prompt (context, system, state, problem, logs, docs links) combined with the diagnostics bundle; `llms.txt` published for AI assistants. Owner's idea.

### D-017 — Scope cuts for v1 (2026-10-30)
**Decision:** No notifications (v1.1), no remote access in wizard (docs: Tailscale), no external drives (v2), no mobile-app direct access (v2).

### D-018 — Agent continuity (2026-10-30)
**Decision:** CLAUDE.md + SPEC.md + PROGRESS.md + DECISIONS.md + prompts/ in the repo; every session reads first and updates PROGRESS last.
**Why:** Owner wants any new Claude agent to continue without re-explaining.

### D-019 — Two repositories (2026-10-30)
**Decision:** `w1kyu/easyarr` holds source, docs, CI and the app definition; `w1kyu/umbrel-app-store` is the community store, receiving the app folder on release.
**Why:** Keeps the store lean and makes a later official-store submission a matter of copying one folder.

### D-020 — MIT license + vendored umbrelOS code (2026-10-30)
**Decision:** EasyArr's own code is licensed **MIT**. UI code from umbrelOS may be copied into `vendor/umbrel/`, where it keeps its **PolyForm Noncommercial 1.0.0** license (verbatim LICENSE + PROVENANCE.md per file). EasyArr as a whole is therefore noncommercial-only. Umbrel logo/name/brand marks are never copied; wallpapers/images/fonts/icons only with clear origin and license. Rules in SPEC §14.1.
**Why:** Owner wants EasyArr to look exactly like umbrelOS; reusing its React + Tailwind UI code is the fastest way to a pixel-exact look. GPL-3.0 can't be combined with a noncommercial license; MIT can, and keeps EasyArr's own code freely reusable.
**Alternatives considered:** PolyForm Noncommercial for the whole project (simplest, but not OSI open source); asking Umbrel for a separate permission (still worth doing before an official store submission); keeping GPL and rebuilding the look from scratch (previous plan, D-008/D-011).
**Consequences:** No commercial use of EasyArr (sales, paid support, preinstalled hardware). Notices must ship in the Docker image and be linked from the About page. Re-confirm with Umbrel before submitting to the official store.

### D-021 — Workspace tooling baseline (2026-10-30)
**Decision:** Node 26 (current LTS, `.nvmrc` = `26`), pnpm 12, TypeScript **6.0.x** (pinned `~6.0`), ESLint 10 flat config with `typescript-eslint` strict + `eslint-config-prettier`, Prettier 3, Vitest 5 (root `vitest.config.ts` runs every `dashboard/*` package as a project). Packages export a custom `@easyarr/source` condition pointing at `src/index.ts`; typecheck uses it (no prior build needed), `tsconfig.build.json` disables it so builds consume `dist/`. Vitest aliases `@easyarr/shared` to its source.
**Why:** TypeScript 7 (native Go compiler) is out, but `typescript-eslint` 8.x only supports `<6.1`; staying on 6.0 keeps lint + typecheck on one compiler. The source condition avoids the classic "build shared before you can typecheck server" monorepo friction.
**Alternatives considered:** TS 7 without type-aware linting; TS project references (more config, slower feedback).
**Revisit:** when `typescript-eslint` supports TS 7.

### D-022 — Phase work runs from Hermes on the owner's Umbrel (2026-10-30)
**Decision:** Phases may be executed by the Hermes agent running on the owner's umbrelOS server (repo at `/opt/data/easyarr`) instead of Claude Code on a laptop. There, `gh` is not installed; GitHub actions (repo creation, CI status) use the REST API with the owner's token instead. The Docker daemon is not reachable from that sandbox, so Docker/buildx-dependent work (image builds, e2e) is verified in GitHub Actions, not locally.
**Why:** That's where the owner ran phase 00; installing a Docker socket into the agent sandbox would contradict the project's own security stance.
**Consequences:** Later phases that need local `docker compose` (01, 04, 05) must either run in CI or on a machine with Docker; note this in each phase's session log.

### D-023 — Storage path, data root and ownership (2026-10-30)
**Decision:** The shared media folder is mounted as `${UMBREL_ROOT}/data/storage/EasyArr:/data` in every file-handling container. Per-service config lives in `${APP_DATA_DIR}/data/<service>` → `/config` (committed `.gitkeep` scaffolding). The manifest declares `storage: dataRoot: data`. PUID/PGID `1000`, `UMASK=002`.
**Why:** umbrelOS 2.0 rewrites `${UMBREL_ROOT}/data/storage/...` to `${UMBREL_ROOT}/home/...` (shown as Files → Home → EasyArr), and older versions expect the legacy path. Official apps use the same convention (e.g. paperless). `dataRoot: data` lets users move app data to another drive on 2.0, and Umbrel's packaging guide asks new apps to include it. Umbrel installs package files as `1000:1000`.
**Alternatives considered:** `${UMBREL_ROOT}/home/EasyArr` directly (2.0-only); using the shared `Downloads` folder (mixes EasyArr data with the user's other downloads and breaks the "one EasyArr folder" promise in SPEC §6).

### D-024 — Phase 01 init container (2026-10-30)
**Decision:** Until phase 02, `init` is a pinned `busybox` one-shot that creates the `/data` tree and runs `chown 1000:1000` + `chmod 2775` on each folder of the tree. It never recurses, so it doesn't touch user files. Every service waits for it with `depends_on: condition: service_completed_successfully`. Phase 02 replaces it with the dashboard image's `init` command. The API-key strategy (seed vs read, SPEC §7.4) is decided there, where it's implemented.
**Why:** It needs no custom image yet and is idempotent. The compose condition is supported on umbrelOS: official apps such as affine and plane use it.

### D-025 — Temporary kill switch: Gluetun with an unusable WireGuard config (2026-10-30)
**Decision:** Until the VPN wrapper exists (phase 04), the `vpn` service runs plain Gluetun with `VPN_SERVICE_PROVIDER=custom` and WireGuard pointed at `192.0.2.1:51820`. That is TEST-NET-1 (RFC 5737), which is never routed. The keys are Gluetun's public documentation examples, not secrets. Gluetun brings up its firewall and keeps retrying, so the namespace has no route out. `FIREWALL_OUTBOUND_SUBNETS=${NETWORK_IP}/16` allows traffic to other containers on Umbrel's network.
**Why:** With no config at all, Gluetun exits. The container then restart-loops and dependent containers lose their namespace. A valid-but-dead config keeps the namespace alive with the kill switch active. CI proves it: `dev/stack.sh leaktest` checks IP, DNS and HTTP from inside the namespace on amd64 and arm64.
**Consequences:** The `vpn` container reports *unhealthy* until a real VPN is configured, so dependents use `condition: service_started`. Known gaps, closed by the wrapper (phase 04): (1) a sub-second window at container start before Gluetun installs its rules, (2) a Gluetun crash drops the rules and dependents lose networking until restarted.

### D-026 — Addressing VPN-side services: container names, not `vpn` (2026-10-30)
**Decision:** Code and config outside the VPN namespace reach VPN-side services as `w1kyu-easyarr_vpn_1:<port>`. Inside the namespace, services use `localhost:<port>`. Other services are reached as `w1kyu-easyarr_<service>_1`. SPEC §3/§5.2 updated.
**Why:** Every Umbrel app shares `umbrel_main_network`, so a short service alias like `vpn` could clash with another app's service. umbreld always sets `container_name: <app-id>_<service>_1`, and the official guide tells apps to use those names.

### D-027 — GPU via Umbrel's `GPU` permission (2026-10-30)
**Decision:** The manifest requests `permissions: [GPU]`, and the compose file maps no `/dev/dri` itself. Supersedes the options listed in SPEC §18.
**Why:** On umbrelOS 2.0, umbreld adds the host's GPU devices and groups to the app's services when a GPU exists and does nothing when there is none. It also strips manual `/dev/dri` mappings. The official Jellyfin app works the same way. Side effect: every EasyArr service gets the device mapping, not only Jellyfin. That's harmless, but it can't be scoped.

### D-028 — Image sources (2026-10-30)
**Decision:** Images come from these sources:
- linuxserver images from Docker Hub (`linuxserver/<app>:<version>`), like the official Umbrel apps.
- Gluetun from `qmcgaw/gluetun`.
- FlareSolverr, Recyclarr, Unpackerr and Cleanuparr from their official GHCR images.
- Jellyseerr is now **Seerr** (`ghcr.io/seerr-team/seerr`); the official Umbrel Jellyseerr app moved to it too. The service keeps the name `jellyseerr` for now (UI wording is decided in phase 06/07).

Every image is pinned as `tag@sha256:<multi-arch index digest>`. All images were checked for both `linux/amd64` and `linux/arm64`.
**Why:** These are maintained upstream sources, and Umbrel's linter accepts them (`--check-images` passes). Pinning by digest is required by CLAUDE.md and the Umbrel guidelines.

### D-029 — Host ports, restart policy, healthchecks (2026-10-30)
**Decision:**
- Ports: manifest port `39000`, Jellyfin `39096:8096`, Jellyseerr `39055:5055`. All three are unused in the official store and in Big Bear's community store. Jellyfin's `7359/udp` LAN discovery is **not** published, because it would collide with the official Jellyfin app.
- Restart policy: every long-running service uses `restart: on-failure`, the Umbrel convention.
- Healthchecks: added wherever the image has a usable HTTP endpoint and tool (curl/wget).

### D-030 — Dev stack + CI run the real Umbrel compose (2026-10-30)
**Decision:** `dev/docker-compose.dev.yml` is an *override* on top of the Umbrel compose, not a copy. It adds the `umbrel_main_network` network, the Umbrel container names, a disabled `app_proxy` and the dashboard published on 39000. `dev/stack.sh` sets Umbrel-like env vars and runs `up | wait | leaktest | down`. CI (`umbrel-app.yml`) runs Umbrel's official linter plus the stack + leak test on amd64 **and** arm64 runners.
**Why:** One source of truth for the stack. It also gives a real Docker test of the kill switch even though the agent sandbox has no Docker (D-022). This still doesn't replace testing on a real Umbrel.
