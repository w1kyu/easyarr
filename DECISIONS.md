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
