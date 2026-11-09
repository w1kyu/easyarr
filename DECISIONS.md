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

### D-031 — init seeds configs; API keys: seed + adopt (2026-10-30)
**Decision:** `init` (dashboard image, `node dist/index.js init`, run as root) creates the `/data` tree and writes EasyArr's `state.json` and `secrets.json` (both chmod 600). It also prepares the service configs:
- **Servarr** (`config.xml`):
  - **ApiKey:** if the config already has a valid key, EasyArr adopts it; otherwise it uses the key in `secrets.json` or generates one.
  - **Owned keys, always re-applied:** `Port`, `UrlBase=/apps/<id>`, `BindAddress=*`.
  - **Only on first creation:** `AuthenticationMethod=External` (Umbrel login protects the proxy) and `UpdateMechanism=Docker`.
- **qBittorrent:** written in the qBittorrent 5 layout (`[WebUI]` section). qBittorrent moves legacy `[Preferences] WebUI\*` keys only once (gated by `[Meta] MigrationVersion`), so init removes legacy duplicates of the keys it owns. EasyArr owns `Port=8090`, the auth-subnet whitelist (`${NETWORK_IP}/16`) and `HostHeaderValidation=false`. Defaults it sets once: the save path under `/data/downloads/torrents` and temp path off.
- **SABnzbd:** EasyArr owns `api_key`/`nzb_key` (adopted if present), `port=8080`, and adds `w1kyu-easyarr_vpn_1` to `host_whitelist`. Defaults it sets once: the download folders.

All other values are left alone. A second run changes nothing (unit-tested, and `dev/stack.sh leaktest` checks it in CI). Bazarr, Recyclarr, Unpackerr and Cleanuparr configs, plus sub-path specifics (SABnzbd `url_base`, qBittorrent reverse-proxy settings), move to phase 05, where the proxy is built and can be tested.
**Why:** Seeding means EasyArr knows every key before services start (SPEC §7.4), and adopting existing keys keeps installs from earlier versions and user changes intact. Folders only get mode/owner fixes and init never recurses, so it never touches media files.
**Alternatives considered:** reading keys back after first start, as Umbrel's media-app-configurator does. That means slower first runs and more moving parts.

### D-032 — No HSTS, no upgrade-insecure-requests (2026-10-30)
**Decision:** Helmet's security headers are on, with a strict CSP (`default-src 'self'`; inline styles allowed for Radix/motion), but **HSTS and `upgrade-insecure-requests` are disabled**.
**Why:** umbrelOS serves every app over HTTP *and* HTTPS on `umbrel.local`. HSTS would force HTTPS for every app on that host, and the CSP upgrade would break plain-HTTP access.

### D-033 — Web stack details + how vendored code is wired in (2026-10-30)
**Decision:**
- **Stack:** React 19, Vite 8, Tailwind 4 (`@tailwindcss/vite`, the vendored `tailwind.config.ts` loaded via `@config`), react-router 8, TanStack Query 5, i18next/react-i18next, Radix, sonner, lucide.
- **Import aliases:** `@/…` resolves to `src/vendor/umbrel/` so vendored files keep their upstream imports unchanged. Our own code uses `~/…`.
- **Lint/format:** the vendor folder is excluded from ESLint and Prettier and is guarded instead by `scripts/check-vendor.mjs`, which is part of `pnpm lint`.
- **TypeScript:** the web `tsconfig` stays `strict` but turns off `noUnusedLocals`/`noUnusedParameters`, because upstream code trips them. ESLint still catches unused code in our own files.
- **App name in HTML:** `index.html` gets the app name injected from `brand.ts` by a tiny Vite plugin.
**Why:** It's the least invasive way to reuse upstream code verbatim while keeping our own code strict.

### D-034 — Dashboard image + publishing (2026-10-30)
**Decision:**
- **Build:** `dashboard/Dockerfile` builds the JS once on `$BUILDPLATFORM`, then `pnpm deploy --prod`s the server. The runtime is `node:26.13.0-alpine` (pinned), with `serve` running as `node` (uid 1000).
- **Notices:** license notices go in `/licenses`.
- **init as root:** the compose file runs `init` with `user: "0:0"` so it can fix ownership.
- **CI tags:** `.github/workflows/image.yml` pushes `ghcr.io/w1kyu/easyarr` for amd64 + arm64 as `edge` and `sha-<short>` on main, and as semver on `v*` tags. It also runs a smoke test: health, SPA, licenses, and `init` run twice.
- **Pinning:** the Umbrel compose pins `sha-<short>@<index digest>`.
- **Visibility:** the GHCR package is public (anonymous pulls verified).
- **Existing installs:** a `hooks/pre-start` creates the new `data/easyarr` mount source, since umbrelOS only copies `data/` scaffolding on fresh installs.
**Why:** Fast multi-arch builds without running pnpm under QEMU. It follows the Umbrel image-pinning rules and is a safe update path from 0.0.1.

### D-035 — Own visual identity (2026-10-30)
**Decision:**
- **Logo:** a violet→blue rounded square with a play triangle and a down chevron (`assets/icon.svg`), approved by the owner. The store manifest's `icon` points to its raw GitHub URL.
- **Wallpaper:** a tiny pre-blurred WebP generated by `scripts/make-wallpaper.py`, so no full-screen CSS blur is needed.
- **Service tiles:** our own Lucide-icon tiles instead of upstream logos (trademarks).
**Why:** SPEC §14 requires our own identity. The pre-blurred image is cheap on low-power devices; a headless test showed full-screen CSS blur stalling rendering.

### D-036 — Account step: username rules, password hashing and strength (2026-10-31)
**Decision:**
- **Username:** 2–32 characters, letters/digits/`.`/`_`/`-`, starting with a letter or digit. That's a strict subset of what Jellyfin accepts (`^(?!\s)[\w\ \-'._@+]+(?<!\s)$`), so it also works in every other service and in URLs.
- **Password:** 8–128 characters, and a strength score of at least "okay" (2 of 4). The score comes from our own small estimator in `@easyarr/shared` (common-password list, username check, repeats/sequences, length × character variety). The web meter and the server use the same function.
- **Storage:** `state.json` keeps the username plus an **scrypt** hash (Node's built-in crypto, N=16384, r=8, p=1, random salt). The plaintext is only in `secrets.json` (needed for Jellyfin in phase 05), registered for log redaction as soon as it's saved. The API never returns either — only `hasPassword`. Leaving the fields empty later keeps the saved password.
- **Schema:** `state.json` and `secrets.json` go to schema v2 (`account`, nullable) with migrations.
**Why:** zxcvbn-style libraries are 400 KB+ and still need tuning for beginners; a few clear rules plus a meter are enough to stop "password123". scrypt needs no native module on arm64/amd64.

### D-037 — System check details (2026-10-31)
**Decision:**
- **RAM thresholds with slack:** ❌ below 3.5 GiB, ⚠️ below 7 GiB, ✅ otherwise. The OS reports less than the size on the box (an "8 GB" Pi shows ~7.6–7.8 GiB), so the SPEC's 4/8 GB limits are compared against what such boards actually report.
- **Disk:** free space of the `/data` mount, which the dashboard now gets **read-only** (`${UMBREL_ROOT}/data/storage/EasyArr:/data:ro`). Shown in GB/TB (decimal, like drive labels). Unreadable → ⚠️, not ❌.
- **GPU:** detected from what umbreld maps in for `permissions: [GPU]` (D-027): `/dev/dri/renderD*` → Intel/AMD, `/dev/nvidia*` or `NVIDIA_VISIBLE_DEVICES` → NVIDIA. None → ⚠️ with "Jellyfin works, transcoding is slow".
- **❌ never blocks:** the user can continue after ticking "I understand…" (SPEC §8). The server enforces the tick.
- Facts are collected on the server; verdicts are computed by `evaluateSystem` in `@easyarr/shared` (unit-tested).

### D-038 — State-changing API calls must be JSON (2026-10-31)
**Decision:** Every non-GET `/api/*` request must have `Content-Type: application/json`, otherwise the server answers 415.
**Why:** The dashboard sits behind the user's Umbrel login cookie. Browsers can send cross-site `text/plain`/form posts without a CORS preflight; JSON needs a preflight we never answer. This blocks CSRF without tokens. (Fastify would otherwise parse `text/plain` bodies.)

### D-039 — Wizard framework (2026-10-31)
**Decision:**
- **One registry, two halves.** `@easyarr/shared/wizard.ts` holds order, `isVisible(answers)`, stored-answer schemas and the "no skipping ahead" rule; the server enforces it (409 on skipping). `web/features/wizard/steps.tsx` maps each id to title/intro/help page/form.
- **URL per step** (`/setup/<step>`). A refresh stays on the step; `/` and `/setup` redirect to the first unfinished step. Answers are saved per step on **Next** (`POST /api/wizard/:step`).
- **Steps are plain forms** (`formId`, `view`, `onSaved`) without wizard chrome, so Settings can reuse them (SPEC §12). The wizard's Next button submits them via `form=`.
- **Validation messages are i18n keys** in the shared zod schemas; the web shows them via `t()`, a test checks every key exists.
- **Help viewer:** `docs/*.md` are bundled with `import.meta.glob` (one small chunk per page) and rendered with `react-markdown` + `remark-gfm` (MIT, no raw HTML). "What's this?" opens a dialog; `/help/<page>` shows the page.
- **After step 4** (until phase 04): the home screen says the first part is done and offers "Review your answers".
- **E2E:** Playwright (`e2e/`) walks steps 1–4 as one user, including refresh, help dialog and validation. It runs against a local dashboard with temporary state (CI job `Wizard e2e`) and against the full Docker stack in `umbrel-app.yml`.

### D-040 — VPN container: wrapper around Gluetun, kill switch owned by EasyArr (2026-10-31)
**Decision:** The `vpn` service runs `ghcr.io/w1kyu/easyarr-vpn` = Gluetun v3.41.3 + a POSIX-shell wrapper (PID 1 under tini).
- The wrapper applies a **default-deny** firewall (only loopback and the Docker network subnet are allowed, plus a guard rule that drops anything leaving the Docker interface without its own source address) *before* anything else, and again whenever Gluetun isn't running (waiting for settings, reload, crash, shutdown). Inbound from the Docker network to service ports always works, so the dashboard can reach Sonarr & co. even without a VPN.
- It never exits on VPN changes: the dashboard writes `vpn.env`; the wrapper restarts only the Gluetun process. Crash loops back off; the counter resets after 5 stable minutes.
- `vpn.env` keys are **allowlisted** (provider, protocol, credentials, server filters, port forwarding). Firewall, DNS, control-server and other Gluetun settings can't be changed from the dashboard side, so a bug or attacker there can't switch the kill switch off.
- An **iptables guard** shadows every iptables binary Gluetun may call and turns `-P OUTPUT/FORWARD ACCEPT` into DROP (Gluetun resets policies to ACCEPT while reconfiguring).
- The container health check means "kill switch in place", not "VPN connected" — a container without a VPN account is healthy and safe.
**Why:** Plain Gluetun exits or opens up while reconfiguring and needs a container restart (which restarts every service in the namespace) for new settings. SPEC §5.3 requires zero leaks in every state. Tested: `vpn/test/smoke.sh` in CI (amd64 + arm64): unconfigured, invalid config, reload and crash → no egress; Docker network → service port works.

### D-041 — VPN files, control-server auth, API access (2026-10-31)
**Decision:**
- `${APP_DATA_DIR}/data/vpn` is `/gluetun` in the vpn container and `/vpn` in the dashboard. `easyarr/` (0700, uid 1000) holds `vpn.env` + `custom/` (0600, written by the dashboard), `status.json` + `gluetun.log` (written by the wrapper). Secrets also live in `secrets.json`; `state.json` keeps only non-secret settings and the last test result.
- Gluetun's control server (:8000) is locked with an **API key** (`auth/config.toml`, written by init; the wrapper writes a random lock-out key if the file is missing). The dashboard sends it as `X-API-Key`.
- The dashboard's `/api/*` (except `/api/health`) only answers **loopback and Umbrel's app gateway** (`NETWORK_IP + 1`), by socket address (X-Forwarded-For is ignored). Every Umbrel app shares one Docker network; without this any other app could read or change EasyArr's VPN settings.
- Wizard step 5 is "configured" only after a passed connection test of the *current* settings; "skip" keeps the kill switch closed.
- The "home IP hidden" check asks a public what-is-my-IP service from the dashboard (outside the VPN) and compares it with Gluetun's public IP. If that service is unreachable the test passes but says it couldn't double-check.
**Why:** SPEC §5.4/§9; least privilege between containers.

### D-042 — VPN provider catalog and server list (2026-10-31)
**Decision:** `@easyarr/shared/vpn-providers.ts` lists every Gluetun provider with per-protocol fields, port-forwarding support (`auto` / `static` / `none`) and a tutorial. Groups: *Best for torrents* (port forwarding: Proton VPN, PIA, AirVPN, PrivateVPN, Perfect Privacy), *Also works*, *Custom* (WireGuard `.conf` / OpenVPN `.ovpn`). Tests compare it with Gluetun's own provider/WireGuard/port-forwarding lists. Server locations come from Gluetun v3.41.3's `servers.json` (`scripts/gen-vpn-servers.mjs`, checked in CI with `--check`), so the country picker only offers locations Gluetun can actually select (incl. "port forwarding only" and "free only" filters). IPv6 WireGuard addresses are dropped (Docker on Umbrel has no IPv6). Port forwarding: the dashboard keeps qBittorrent's listening port equal to the forwarded port (every 30 s and right after a passed test).
**Why:** One source of truth for the form, the validation and Gluetun's settings; a beginner can't pick a combination Gluetun would reject.

### D-043 — No name lookups through Docker's DNS from the VPN namespace (2026-10-31)
**Decision:** The kill switch drops all traffic to Docker's embedded DNS (`127.0.0.11`) from the VPN namespace, permanently (also while Gluetun runs). VPN-side apps resolve names only through Gluetun's DNS (127.0.0.1), which works only through the tunnel. Consequence: VPN-side apps can't resolve other containers by name; they talk to each other via `localhost`, and anything that must reach Jellyfin/Jellyseerr from inside the VPN namespace goes through the dashboard or a fixed address (phase 05).
**Why:** The stack leak test found that, with no VPN connected, apps could still *look up* names: `127.0.0.11` is loopback (allowed) and Docker answers by asking the host's resolver outside the VPN, so the internet provider would see which trackers/indexers are being looked up. Plain Gluetun hid this by pointing `resolv.conf` at itself; the wrapper restores Docker's file while Gluetun is stopped.

### D-044 — Kill-switch guard rule moves to the mangle table (2026-10-31)
**Decision:** The guard rule from D-040 (packets leaving the Docker interface must carry its own address) lives in `mangle POSTROUTING` instead of `filter OUTPUT`. The filter table only holds rules Gluetun's own parser understands (no negated addresses, no custom chains). The health check looks for the guard there; the image smoke test checks that the filter rules are parseable and lets Gluetun reconnect between several real servers (made-up key) without a single "cannot remove outdated" error, at most one VPN-server rule left and no egress.
**Why:** The owner's first real VPN connection (Proton, WireGuard) logged `cannot remove outdated VPN connection rule … ParseAddr("!10.21.0.16")` on every reconnect. Gluetun deletes its own rules by parsing `iptables -L`; our negated-source rule broke that parser, so every reconnect left the previous server's allow rule behind. Not a leak (those rules only allow the VPN protocol to VPN servers), but the rule list grew forever and Gluetun's firewall state drifted from what it believes. Gluetun never reads or changes the mangle table, and POSTROUTING sees the final output interface and source address, so the guard keeps the same effect.

### D-045 — Service proxy: one prefix per service, CSRF checked by the proxy (2026-10-31)
**Decision:** The dashboard proxies `/apps/<service>/` (HTTP + WebSocket) with `@fastify/http-proxy`. Services with a URL-base setting (Sonarr, Radarr, Lidarr, Prowlarr, SABnzbd, Bazarr, Cleanuparr) get the path unchanged; qBittorrent has none and gets it without the prefix (its web UI only uses relative links). `/apps/*` answers only loopback and Umbrel's gateway, like `/api/*` (D-041). The proxy itself refuses cross-site requests: any non-GET request or WebSocket handshake whose `Origin` (or, without Origin, `Referer`) isn't the page's own host gets 403; afterwards Origin/Referer are dropped, because the services would compare them with their own address (qBittorrent's CSRF check would refuse every POST). The dashboard's security headers (CSP) don't apply to proxied responses; the services send their own. A service that doesn't answer → a friendly "isn't answering, try again" page (`/unavailable/<service>`) for page loads, 502 for API calls.
**Why:** SPEC §5.5: one login (Umbrel's) for beginners. Inside the apps, authentication is off (External / subnet whitelist), so the proxy must be the gate: only the Umbrel gateway reaches it, and another website can't make the logged-in browser change things through it. Umbrel's app gateway keeps the browser's Host header (`changeOrigin: false` in umbreld's app-gateway), so comparing Origin with Host works.

### D-046 — Only the dashboard and the request page may connect to the VPN-side services (2026-10-31)
**Decision:** The VPN wrapper accepts *new* connections from the Docker network only from the addresses listed in `easyarr/allowed-clients`. The dashboard writes that file every 30 s: its own address plus the request page's (Jellyseerr talks to Sonarr/Radarr; its last known address is kept while it's down). The rule lives in the mangle table (chain `EASYARR_IN`, jumped to from `PREROUTING` for the Docker subnet), next to the D-044 guard. A missing or empty list allows the whole network, so a fresh start works before the dashboard has written it; the dashboard never writes an empty list. Replies to connections the services open themselves aren't affected, and VPN traffic never comes from the Docker subnet. Only well-formed IPv4 addresses are accepted, at most 16.
**Why:** Every Umbrel app shares one Docker network (`umbrel_main_network`). With authentication off inside the apps (D-045), any other installed app could otherwise control Sonarr, qBittorrent & co., read their API keys, or use FlareSolverr as an open browser. SPEC §5.5 assumed "only reachable via the dashboard"; this makes it true. Container addresses change when containers are re-created, hence the timer. Spoofing another container's address doesn't help an attacker: TCP replies go to the real owner of the address.

### D-047 — The wiring ledger: EasyArr remembers what it made, and respects what you delete (2026-11-01)
**Decision:** Every thing the wiring engine creates or adopts (download client, root folder, Prowlarr app, Jellyfin library, …) is recorded in `state.json` (`wiring.ledger`: key, service, id, name, adopted). A normal run creates only what isn't recorded yet; something recorded but gone was deleted by the user and stays deleted (a note says so). "Repair connections" re-creates it. Before creating, a step looks for an equivalent the user already has (same host/port, same folder, same name) and adopts it instead of adding a duplicate. One-time settings (hardlinks on, completed download handling, Bazarr's language profile, Jellyfin hardware acceleration, …) are applied once and remembered in `wiring.applied`; after that they're the user's. Steps run in a fixed order and each waits for the services it needs, which depend on the plan (a torrent-only setup never waits for SABnzbd).
**Why:** SPEC §10.2: wiring runs again on every start and after every settings change, so it must be idempotent and must never fight the user. Comparing every field to a desired state would undo the user's own changes; remembering ids is enough to tell "missing because new" from "missing because deleted".

### D-048 — Recyclarr syncs only when EasyArr asks (2026-11-01)
**Decision:** The Recyclarr container keeps its official image but runs a small loop instead of its cron: it syncs when the dashboard drops `.easyarr/sync-request` into its config folder and writes `last-sync.json` (exit code, time) and `last-sync.log`. The dashboard (which mounts that folder) writes `recyclarr.yml` from the quality choice with self-contained profiles named "EasyArr (…)" and asks for a sync only when that file changed or the profiles are missing in Sonarr/Radarr. No sync at start, no daily timer.
**Why:** Every sync resets the profiles it manages to the TRaSH guide, so a timer would quietly undo a user's tweaks; users who want their own profile clone the EasyArr one (the config file says so). Recyclarr 8 removed include templates, so the config must be complete. Embedding Recyclarr in the dashboard image would need a .NET runtime and git (research: bazarr-recyclarr.md §8).

### D-049 — Service setup the apps can't do through their API is seeded by init (2026-11-01)
**Decision:** init also writes: Bazarr's `config.yaml` (URL base `/apps/bazarr`, its API key, Sonarr/Radarr addresses and keys; connections off until the wiring engine has made the language profile), Unpackerr's `unpackerr.conf` (Sonarr/Radarr/Lidarr on localhost with their URL bases, web UI off), SABnzbd's `url_base = /apps/sabnzbd`, and qBittorrent's `LocalHostAuth=false` + `ReverseProxySupportEnabled=false`. Cleanuparr gets `BASE_PATH=/apps/cleanuparr`. Only values EasyArr owns are compared and put back; Bazarr's file is compared by parsed value, because Bazarr rewrites it with every default on start.
**Why:** Bazarr and SABnzbd read their URL base once at start (changing it through the API restarts SABnzbd); Unpackerr has no API. Sonarr & co. reach qBittorrent on localhost (shared VPN namespace) without a password; the inbound allowlist (D-046) keeps others out. With reverse-proxy support on, qBittorrent would check the browser's forwarded address instead of the dashboard's and lose the whitelist; for the same reason the proxy drops X-Forwarded-For (SABnzbd refuses non-private forwarded addresses, e.g. via Tailscale).

### D-050 — Usenet accounts: entered in the wizard, secrets by entry id, tests optional (2026-11-01)
**Decision:** Step 6 takes 1–5 providers and 1–10 indexers. Server/indexer settings are wizard answers in state.json; each password/API key lives in `secrets.json → usenet.{servers,indexers}[<entry id>]` (schema v4) and is never sent back — the view only lists which ids have one, an empty field keeps it, removed entries lose theirs. Provider presets fill host/port/connections (values checked on the providers' own pages, `usenet-presets.ts`); indexer presets are Prowlarr's own built-in Newznab list (Prowlarr 2.7.0 `Newznab.cs`), so EasyArr recommends nothing. "Test" asks SABnzbd (`mode=config&name=test_server`, POSTed so the password is never in a URL) and Prowlarr (`POST /indexer/test`) — through the VPN, like real downloads — and maps their messages to plain reasons (a failure while the VPN is down is reported as "no VPN"). Passing a test is not required to continue. Wiring then adds each server to SABnzbd (named after its host, adopting a server for the same host) and each indexer to Prowlarr ("EasyArr – <name>", the preset's own Prowlarr template when there is one, else Generic Newznab; Prowlarr's save-time test reports a wrong key in the checklist).
**Why:** Beginners make typos; testing where they type is the cheapest place to catch them, but someone who skipped the VPN (step 5) can't test anything yet and must still be able to finish. Ids instead of host names keep a secret attached when the user edits the address.

### D-051 — Torrent indexers: added by the user in Prowlarr, checked by EasyArr (2026-11-01)
**Decision:** Step 7 shows the guide (`docs/indexers.md`) next to a button that opens `/apps/prowlarr/` in a new tab and a live count of Prowlarr's indexers (polled every 10 s). "Next" saves `mode: added`, which the server only accepts when Prowlarr really has ≥1 indexer; with none, the button becomes "Do this later" with an honest confirmation (`mode: later`, the Finish tour reminds them).
**Why:** SPEC §8: EasyArr never suggests trackers, so the user must pick them in Prowlarr; a server-side check means "I added one" can't be a lie by accident. Adding sites needs the VPN, so "later" must exist.

### D-052 — Step 8: language means subtitles and Jellyfin metadata; presets map to TRaSH profiles (2026-11-01)
**Decision:** Libraries (≥1 of movies/TV/music), one language from a list of ISO 639-1 codes that Bazarr and Jellyfin both take unchanged (names from `Intl.DisplayNames`, no translations to maintain), and a quality preset (Best / Balanced (default) / Save space, mapped as in D-048 and EasyArr's Lidarr profile). The language sets Bazarr's first language profile and the Jellyfin libraries' metadata language/country; downloads stay in their original language (no dubbed-release preferences). Without step 8 answers (older installs, the stack test) the plan keeps phase 05's defaults: all libraries, English, Balanced.
**Why:** "Preferred language" for a beginner means "what I read"; choosing dubbed releases would need per-language TRaSH profiles and custom formats, which is v2 material.

### D-053 — Finish: the wizard is complete only after a wiring run; changes re-open it (2026-11-01)
**Decision:** Step 9 runs the wiring with the live checklist (SSE). It completes with `result: ok` (needs a successful last run) or, after an explicit "Finish anyway", `result: problems` (needs any run); the home screen then offers "Try connecting again". Saving any earlier step removes `finish` from the completed steps, so a changed answer is applied by running Finish again. Failed steps get a plain explanation per error code/step (VPN for the TRaSH sync and indexers, "still starting" for unreachable services) with the raw message under "Technical details". "Get help with AI" is a disabled placeholder until phase 09. The temporary `/dev/wiring` page is removed (Settings → Repair in phase 07).
**Why:** The wizard answers are only promises until the wiring applied them; letting a user finish with known problems (e.g. no VPN yet) is more honest than trapping them in the wizard.

### D-054 — Browser tests run against the same fakes as the wiring unit tests (2026-11-01)
**Decision:** The in-memory service fakes moved to `server/src/wiring/testing/fake-world.ts` (erasable TypeScript only, excluded from the build). `e2e/fake-services.mjs` loads it with Node's built-in type stripping and serves each service on a local port (`EASYARR_SERVICE_URLS`), seeds the API keys init would write and plays the Recyclarr runner. Playwright starts one fresh dashboard per flow (wizard details, torrents only, Usenet only, both). Against the real stack only the wizard spec runs; its Finish step wires the real services there.
**Why:** One set of fakes to keep honest (they are tuned to real fresh-install answers, phase 05), and the full first run can be tested without Docker or a VPN account in every CI run.


### D-055 — Low-quality (LQ) releases are a last resort, not blocked; 1080p Bluray + WEB rank equally in Balanced (2026-11-05)
**Decision:** EasyArr's Recyclarr config overrides the TRaSH guide in two places. (1) The custom formats "LQ" and "LQ (Release Title)" score −10 each instead of −10000, and every EasyArr profile's minimum custom-format score is −20 instead of 0. (2) Balanced movies (TRaSH "HD Bluray + WEB") put Bluray-1080p, WEBDL-1080p and WEBRip-1080p into one group "Bluray/WEB 1080p" (cutoff), with Bluray-720p below it. Every other unwanted format (BR-DISK, 3D, x265 HD, …) stays at −10000.
**Why:** The owner's first real request stayed "Missing": all four releases came from LQ groups (YTS & co.), which the guide blocks, and that is often all public torrent sites have. An LQ release now gets taken only when nothing normal exists at that quality, and Radarr/Sonarr upgrade it later (upgrades on, minimum upgrade +1, cutoff score 10000). Radarr and Sonarr compare quality before score (`DownloadDecisionComparer`), so with the guide's Bluray-1080p ranked above WEB 1080p, an LQ "Bluray" (typical for YTS) would beat a good WEB-DL and never be replaced. In one group the score decides, and the guide's tier scores already rank good Bluray groups (1700–1800) above WEB ones (1600–1700). No other guide score lies between −20 and 0 (the closest are −51 and −10000). The other presets already have one group per resolution. The rule for users: LQ only when there's nothing better at the same resolution. Proven against the real images by `dev/recyclarr-test.sh` (CI job "Recyclarr profiles"), including a v0.0.8 profile being converted.

### D-056 — The wiring runs again silently on every app start once the setup is finished (2026-11-05)
**Decision:** After the dashboard starts listening, it schedules a wiring run in mode `startup` (30 s, then retries after 2 and 10 minutes while a run fails), only if the wizard's Finish step is complete. If a run is already going, it waits for the next slot.
**Why:** SPEC §10 asks for it, and an update's wiring changes (e.g. D-055's new Recyclarr config) otherwise never reach existing installs. The engine already never re-creates what the user deleted outside "repair" (D-047), so this is safe to repeat. Each step waits up to 3 minutes for its service.

### D-057 — Cleanuparr's Queue Cleaner and proactive search are switched on by the wiring (2026-11-07)
**Decision:** `cleanuparr.setup` also (1) enables the Queue Cleaner (every 5 min; 3 strikes for "downloading metadata" ≈ 15 min, 3 for errored public torrents), (2) adds one stall rule "EasyArr – stalled downloads" (public torrents, 0–100 %, 6 strikes ≈ 30 min without progress, progress resets the count), and (3) turns on the Seeker's proactive search for every Sonarr/Radarr instance (every 5 min, monitored items, cycle ≥ 1 day). Queue Cleaner and Seeker are `once` settings: a user who switches them off keeps them off; the stall rule is a ledger resource (D-047).
**Why:** The owner's third request hung on "downloading metadata" for 20+ min and a second never reached qBittorrent. Cleanuparr was wired but did nothing, because a fresh Cleanuparr ships with the Queue Cleaner off and no rules. On removal Cleanuparr deletes through Sonarr/Radarr with `blocklist=true&skipRedownload=true` and queues its own replacement search (Seeker `SearchEnabled`, on by default), so a dead torrent gets replaced by another release without the user. Sonarr/Radarr search a missing item only once, when it's added, and later only via RSS, so a request with no release at that moment stays "Missing". Proactive search tries again. Private torrents are left alone (tracker ratio rules). Source: Cleanuparr v2.10.12 `QueueCleanerConfigController`, `QueueRulesController`, `SeekerConfigController`, `QBitServiceQC.CheckIfStuck`, `ArrClient.GetQueueDeleteUrlQuery`, `QueueItemRemover` (https://github.com/Cleanuparr/Cleanuparr/tree/b7d5918fbb4813427ce8c07f23830a12a1561c77/code/backend).

### D-058 — Seerr's "Open in Sonarr/Radarr" links go through the dashboard proxy (2026-11-08)
**Decision:** The wiring sets Seerr's `externalUrl` for Sonarr/Radarr to `<publicUrl>/apps/<name>`, where `publicUrl` = `http://${DEVICE_DOMAIN_NAME}:39000` (Umbrel's device domain, default `umbrel.local`; `EASYARR_PUBLIC_URL` overrides). Existing installs get it once on the next wiring run (startup, D-056); an external URL the user set is kept.
**Why:** Without `externalUrl` Seerr links to `hostname:port`, i.e. the container name `w1kyu-easyarr_vpn_1:7878`, which no browser resolves (owner report). Seerr is published on its own port (39055), so the link has to be absolute; the device domain is what Umbrel itself uses for app links. Limitation: from outside the LAN (e.g. Tailscale with another host name) the link still says `umbrel.local`. Seerr's GET returns entries unmasked and PUT replaces them (`server/routes/settings/radarr.ts`, seerr@564bfb0), so GET → set `externalUrl` → PUT is safe.

### D-059 — Dashboard status: one polled endpoint, short cache, no new dependencies (2026-11-08)
**Decision:** `GET /api/status` returns everything the home screen shows. The web polls it every 5 s while the tab is visible. Service probes are cached for 4 s and shared by concurrent requests. Each probe asks the service's own status endpoint with a 4 s timeout (Servarr `system/status`, qBittorrent `app/version`, SABnzbd `mode=version`, Bazarr `system/status`, Jellyfin `/System/Info/Public`, Cleanuparr `/api/status`, FlareSolverr `/`). Seerr shows no version: its `/api/v1/status` calls GitHub on every request. Recently added comes from Jellyfin `/Items` (cached 60 s) and posters go through `/api/media/:id/image`, so the CSP stays `img-src 'self'`. Warnings: VPN not set up (unless skipped) or down; less than 10 % disk free; a used service down (VPN-side services are left out while the VPN is down, so the VPN warning stands alone); the last wiring run failed; the official Jellyfin app is installed (DNS lookup of `jellyfin_server_1`, the container name in umbrel-apps/jellyfin); an update is available. The update check compares Umbrel's `APP_VERSION` with the version in the store's `umbrel-app.yml` (cached 6 h); the repo has no GitHub releases and the image only knows its commit. The log viewer shows the VPN log (minus the dashboard's own status calls) and the logs Sonarr/Radarr/Lidarr/Prowlarr/qBittorrent show in their UIs, with every known secret masked on the server.
**Why:** One request per poll keeps the page simple and cheap on a small server; nothing here needs Docker access (no socket, SPEC §17).

### D-060 — Settings → Account is read-only for now (2026-11-08)
**Decision:** Settings shows the username and explains how to change the password in Jellyfin. Changing the account from EasyArr comes later.
**Why:** Jellyfin and Seerr only take the account on the first run (`jellyfinKey` → `completeStartup`). Saving a new password in EasyArr would leave Jellyfin on the old one, and a later run that needs to log in would fail with "Jellyfin was already set up with a different account". Changing it properly needs Jellyfin's password API and Seerr's session handling. That is noted under Ideas / later.

### D-061 — A changed setting is applied at once with a full wiring run (2026-11-08)
**Decision:** Settings sections reuse the wizard step forms. "Save" stores the step (which re-opens Finish, D-053), then runs the whole wiring with the live checklist and saves Finish again (`ok`, or `problems`, which keeps the dashboard's repair warning). If the change needs another step first (e.g. Usenet after switching to "Both"), the wizard continues at that step. Advanced offers "Run the setup again" and "Repair connections".
**Why:** The engine is idempotent and never overwrites user changes (D-047), so a full run is safe and needs no per-setting mapping of which steps to repeat. A run on an installed system takes seconds.

### D-062 — Paused search sites are re-tested every 5 minutes (2026-11-09)
**Decision:** The dashboard runs an `IndexerHealer` (1 min after start, then every 5 min, only while the VPN is connected or deliberately skipped). It lists Prowlarr's enabled indexers and `GET /indexerstatus`, and tests (`POST /indexer/test` with the stored resource) each one whose `disabledTill` is in the future. Then it does the same in the Sonarr/Radarr/Lidarr the setup uses, unless every Prowlarr site is still paused (their indexers point at Prowlarr). When every enabled Prowlarr site is still paused, the home screen shows `indexersDown` ("Search sites can't be reached", button to the VPN settings), except while the VPN or Prowlarr is down.
**Why:** On 2026-11-07 the owner's sites were unreachable for a while; Prowlarr and the apps then backed off for hours (Servarr `EscalationBackOff` goes up to 24 h, and Prowlarr answers the apps with 429 meanwhile), so nothing downloaded long after the sites were back (confirmed reachable on 2026-11-09 from inside the VPN). A successful test clears the pause at once (`IndexerFactory.Test` → `RecordSuccess`, [Prowlarr v2.7.0](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/NzbDrone.Core/Indexers/IndexerFactory.cs#L255-L273), same in [Sonarr](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/NzbDrone.Core/Indexers/IndexerFactory.cs#L109-L127)); a failed one raises the level by at most one (`ProviderStatusServiceBase.RecordFailure`), so recovery takes at most ~5 minutes whatever the level. One test is one search per paused site per 5 min, far below any site's limits.

### D-063 — Lower minimum sizes so last-resort LQ releases aren't rejected as "too small" (2026-11-09)
**Decision:** EasyArr's Recyclarr config overrides the guide's minimum size (MB per minute) for WEBDL, WEBRip and Bluray: 5 at 720p, 10 at 1080p, 20 at 2160p, in Radarr and Sonarr, for every preset. Maximum and preferred sizes stay as the guide (or the preset's `preferred_ratio`) sets them; other qualities (HDTV, Remux) keep the guide's minimums.
**Why:** After D-055 the owner's requests still stayed "Missing" when every release came from YTS & co.: interactive search showed them with score −10 (accepted), but the guide's minimum sizes rejected them (Bluray-1080p 50.8 MB/min ≈ 6 GB for two hours; a YTS 1080p is ~2 GB ≈ 16 MB/min, a 720p ≈ 8 MB/min). The LQ score still ranks such releases last and upgrades replace them; samples and fakes below the floor stay rejected. Recyclarr 8.8.1 supports per-quality overrides (`QualitySizeItemConfigYaml`, `QualitySizePlanComponent.MergeQuality`, https://github.com/recyclarr/recyclarr/tree/874cb274f8b419dff6fb211fc326e4f2dd63c4fb/src). Checked against real Radarr/Sonarr by `dev/recyclarr-test.sh`.
