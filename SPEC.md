# EasyArr — Product & Technical Specification

> **Status:** v1 plan, written before implementation.
> **Owner:** w1kyu (GitHub: `w1kyu`)
> **Working title:** EasyArr. The name must live in ONE place (see §4) so it can be renamed later.
>
> This file is the single source of truth. If code and this spec disagree, either fix the code
> or update this spec **and** log the change in `DECISIONS.md`.
> Items marked **[VERIFY]** are assumptions that must be checked against current upstream
> docs/behaviour before relying on them. Record results in `PROGRESS.md → Verified facts`.

---

## 1. What EasyArr is

EasyArr is a **public Umbrel app** (first in a community app store, maybe the official Umbrel
App Store later) that installs a complete, pre-wired media automation stack and guides a
**complete beginner** through setup with a wizard — no terminal, no config files.

After setup the user can request a movie/show/album and it gets found, downloaded through a
VPN, organised, subtitled and shows up in Jellyfin automatically.

### Goals
- Install from the store → wizard → working stack. Zero terminal.
- All downloading/searching traffic goes through a VPN with a kill switch.
- Every step explained in plain language, with in-app tutorials.
- Safe, idempotent updates that never break a user's setup.
- Works on ARM64 (Raspberry Pi 5) and x86-64 (Umbrel Home/Pro, PCs).
- Looks and feels native to umbrelOS.
- Easy to get help: diagnostics + a ready-made "Get help with AI" prompt.
- Backup & restore of the whole setup.

### Non-goals (v1)
- External drive / NAS media storage (v2).
- Remote access built into the wizard (v1 = docs tutorial for Tailscale).
- Notifications (v1.1).
- Languages other than English (v1 is i18n-ready, English only).
- Mobile companion apps (LunaSea, nzb360) needing direct *arr access (v2).
- Any commercial use (selling EasyArr, paid support, preinstalled hardware) — not allowed because
  EasyArr contains umbrelOS code under PolyForm Noncommercial 1.0.0 (§14.1).

### Target user
Someone who owns an Umbrel, has never used Docker, Sonarr, a VPN config or Usenet,
and follows instructions if they are clear. Every design decision is judged against this person.

---

## 2. Product principles

1. **Zero terminal.** If a user would need SSH, it's a bug.
2. **Safe defaults.** Clicking "Next" everywhere yields a working, secure setup.
3. **Plain language.** Every technical term gets a one-line explanation or a "What's this?" link.
4. **Never break the user's setup.** Wiring only adds what's missing; never overwrites user changes.
5. **Hardware-agnostic.** Multi-arch images; graceful degradation (e.g. no GPU → still works).
6. **Built for support.** Clear errors, diagnostics, AI help prompt, issue templates.
7. **Honest UI.** Always show real VPN state. Never claim "protected" without having checked.

---

## 3. Services (v1)

All services are **always installed**. The wizard decides which ones are wired up and shown
(e.g. "torrents only" → SABnzbd runs idle, unwired, hidden).

| Service | Purpose | Image (pin by digest) | Network | Internal port | Exposure |
|---|---|---|---|---|---|
| vpn (Gluetun + EasyArr wrapper) | VPN + kill switch, network for everything below | `ghcr.io/w1kyu/easyarr-vpn` (FROM `qmcgaw/gluetun`) | own | control 8000 | internal |
| qBittorrent | Torrent client | `lscr.io/linuxserver/qbittorrent` | **VPN** | 8090 (`WEBUI_PORT`) | via dashboard proxy |
| SABnzbd | Usenet client | `lscr.io/linuxserver/sabnzbd` | **VPN** | 8080 | via dashboard proxy |
| Prowlarr | Indexer manager | `lscr.io/linuxserver/prowlarr` | **VPN** | 9696 | via dashboard proxy |
| FlareSolverr | Cloudflare solver for Prowlarr | `ghcr.io/flaresolverr/flaresolverr` | **VPN** | 8191 | internal |
| Sonarr | TV | `lscr.io/linuxserver/sonarr` | **VPN** | 8989 | via dashboard proxy |
| Radarr | Movies | `lscr.io/linuxserver/radarr` | **VPN** | 7878 | via dashboard proxy |
| Lidarr | Music | `lscr.io/linuxserver/lidarr` | **VPN** | 8686 | via dashboard proxy |
| Bazarr | Subtitles | `lscr.io/linuxserver/bazarr` | **VPN** | 6767 | via dashboard proxy |
| Recyclarr | Applies TRaSH quality profiles to Sonarr/Radarr | `ghcr.io/recyclarr/recyclarr` | **VPN** | — | none |
| Unpackerr | Extracts RAR downloads | `ghcr.io/unpackerr/unpackerr` | **VPN** | — | none |
| Cleanuparr | Removes stalled/broken downloads | `ghcr.io/cleanuparr/cleanuparr` (env `PORT`, `BASE_PATH`) | **VPN** | 11011 | via dashboard proxy |
| Jellyfin | Media server | `lscr.io/linuxserver/jellyfin` | normal | 8096 | published port |
| Jellyseerr | Request page | `ghcr.io/seerr-team/seerr` (Jellyseerr merged into **Seerr**, D-028) | normal | 5055 | published port |
| init | One-shot: folders, seed configs | `ghcr.io/w1kyu/easyarr` (cmd `init`) | normal | — | none |
| dashboard | Wizard, dashboard, wiring engine, backups, diagnostics | `ghcr.io/w1kyu/easyarr` | normal | 3000 | Umbrel `app_proxy` (behind Umbrel login) |

Notes:
- Readarr is **not** included (retired upstream June 2025). Books = v2 candidate (Bookshelf / LazyLibrarian).
- Recyclarr does not cover Lidarr → the wiring engine sets sensible Lidarr profiles itself.
- Everything in the **VPN** network shares Gluetun's network namespace (`network_mode: service:vpn`),
  so they share one port space → internal ports above are chosen to **not collide**
  (qBittorrent moved to 8090 because SABnzbd uses 8080).
- Containers inside the VPN namespace reach each other via `localhost:<port>`.
  Containers outside reach them via `w1kyu-easyarr_vpn_1:<port>` (Umbrel's injected container name;
  the short alias `vpn` is not safe on the shared `umbrel_main_network`, D-026).
- linuxserver images come from Docker Hub (`linuxserver/<app>`), all images pinned `tag@sha256:<index digest>` (D-028).

---

## 4. Identity & repositories

| Thing | Value |
|---|---|
| Display name | `EasyArr` (defined once in `shared/src/brand.ts` + `umbrel-app.yml`; docs use `{{APP_NAME}}`-style placeholders where practical) |
| GitHub user | `w1kyu` |
| Community store ID | `w1kyu` |
| Community store name | `w1kyu Apps` |
| Umbrel app ID | `w1kyu-easyarr` |
| Container registry | `ghcr.io/w1kyu/easyarr`, `ghcr.io/w1kyu/easyarr-vpn` |
| License | **MIT** for EasyArr's own code. Files copied from umbrelOS keep **PolyForm Noncommercial 1.0.0** (see §14.1) → EasyArr as a whole may only be used noncommercially. |

Name note: similarly named projects exist in the same niche (e.g. "Ezarr", "easiarr").
Fine for now; re-check before a big public launch.

### Repo 1 — `w1kyu/easyarr` (source of truth)
```
easyarr/
  CLAUDE.md                 # agent instructions (auto-read by Claude Code)
  SPEC.md                   # this file
  PROGRESS.md               # living status + handoff log
  DECISIONS.md              # decision log
  prompts/                  # phase prompts used to build the project
  dashboard/
    server/                 # Fastify + TypeScript (API, wiring, backups, proxy, init)
    web/                    # React + Vite + TypeScript (wizard + dashboard)
      src/vendor/umbrel/    # files copied from umbrelOS — PolyForm Noncommercial 1.0.0,
                            #   own LICENSE + PROVENANCE.md (see §14.1)
    shared/                 # shared types, brand constants, provider catalog schema
    Dockerfile              # multi-stage, multi-arch; one image, commands: serve | init
  vpn/
    Dockerfile              # FROM qmcgaw/gluetun + wrapper
    wrapper.sh              # config reload + kill switch while unconfigured
  umbrel/
    w1kyu-easyarr/          # the Umbrel app definition (copied to store repo on release)
      umbrel-app.yml
      docker-compose.yml
      icon.svg / gallery/
  dev/
    docker-compose.dev.yml  # run the stack on a laptop with Umbrel-like env vars
  docs/                     # user + developer docs (also rendered in-app)
  llms.txt                  # all docs concatenated for AI assistants (generated)
  .github/
    workflows/              # CI: lint, test, e2e, multi-arch image build, release
    ISSUE_TEMPLATE/
  renovate.json
  LICENSE                   # MIT (EasyArr's own code)
  NOTICE.md                 # licensing overview: MIT + vendored umbrelOS (noncommercial) + third parties
```
Package manager: **pnpm workspaces**. Node LTS. Strict TypeScript everywhere.

### Repo 2 — `w1kyu/umbrel-app-store` (community store)
Created from Umbrel's community store template:
```
umbrel-app-store.yml        # id: w1kyu, name: "w1kyu Apps"
w1kyu-easyarr/              # synced from easyarr/umbrel/w1kyu-easyarr on release
```
App IDs must be prefixed with the store ID (`w1kyu-…`).

---

## 5. Networking & VPN

### 5.1 Layout
```
Outside VPN (normal Docker network)        Inside VPN (network_mode: service:vpn)
───────────────────────────────────        ───────────────────────────────────────
app_proxy → dashboard (Umbrel login)       qBittorrent, SABnzbd
Jellyfin   (published port)                Prowlarr, FlareSolverr
Jellyseerr (published port)                Sonarr, Radarr, Lidarr, Bazarr
init (one-shot)                            Recyclarr, Unpackerr, Cleanuparr
```

### 5.2 Kill switch — must hold at ALL times
- Gluetun's firewall blocks non-VPN egress while it runs.
- **Gap to close:** while the VPN is *not configured yet* or *reloading*, Gluetun's process is not
  running, so its firewall rules are gone. The EasyArr wrapper must install its own
  **default-deny egress rules** (allow only loopback + Docker-internal subnet) whenever Gluetun
  is not running. → No leak before setup, during reloads, or after a crash.
- Inbound from the Docker network to service ports must keep working in all states
  (so the dashboard can always reach the *arr apps, even with the VPN down).
- Acceptance test: with VPN unconfigured, `curl` to the internet from inside qBittorrent fails;
  `curl w1kyu-easyarr_vpn_1:8989` from the dashboard succeeds.
  Automated in `dev/stack.sh leaktest`, run in CI on amd64 + arm64 (D-030).

### 5.3 VPN wrapper (`vpn/wrapper.sh`) — live reload without Docker socket
Problem: the wizard must change VPN settings at runtime, but EasyArr does **not** mount the Docker
socket (security + Umbrel guidelines), and restarting the Gluetun *container* would detach every
container sharing its network namespace.

Design:
- The container stays up permanently (it owns the namespace). The wrapper is PID 1.
- Config lives in `${APP_DATA_DIR}/data/vpn/vpn.env` (written by the dashboard; chmod 600).
- Loop: apply default-deny → wait until `vpn.env` exists → start Gluetun process with that env →
  watch for a reload signal (e.g. file `reload.request` mtime change, or inotify) → stop Gluetun
  process gracefully → re-apply default-deny → start again.
- WireGuard/OpenVPN custom config files go to `${APP_DATA_DIR}/data/vpn/custom/`.
- Expose status to the dashboard via Gluetun's control server (port 8000) **[VERIFY current
  endpoints and whether the control server now requires an auth config]** plus a small
  `wrapper-status.json` (state: unconfigured | starting | connected | error, last error).

### 5.4 Port forwarding (torrents)
- Gluetun supports automatic forwarding natively for some providers (at least ProtonVPN and PIA)
  **[VERIFY current list]**; AirVPN uses static ports reserved in its panel.
- **Single owner:** the dashboard backend polls Gluetun for the forwarded port and sets
  qBittorrent's listening port via the qBittorrent API whenever it changes.
- Dashboard shows: Port forwarding = Active (port N) / Not supported by provider / Not working.

### 5.5 Service web UIs — proxied through the dashboard
- *arr apps, Prowlarr, qBittorrent, SABnzbd, Bazarr, Cleanuparr are **not** published on host ports.
  The dashboard reverse-proxies them under `/apps/<service>/` (HTTP + WebSocket), so they sit behind
  the Umbrel login → one login for beginners, fewer port conflicts.
- Each service is seeded with a matching URL base (`/apps/sonarr`, …). **[VERIFY per service:**
  Servarr `UrlBase`, Bazarr `base_url`, SABnzbd `url_base`, qBittorrent behind sub-path
  (host header / CSRF / clickjacking settings), Cleanuparr base path support**]**.
  If a service can't work behind a sub-path, document it in DECISIONS.md and publish a port instead.
- Authentication inside these apps: Servarr "Disabled for local addresses", qBittorrent
  "bypass auth for whitelisted subnets" = Docker subnet. Safe because they are only reachable
  via the dashboard (which is behind the Umbrel login).

### 5.6 Published ports (host)
| Service | Host port | Why |
|---|---|---|
| dashboard | via `app_proxy`; `port:` in umbrel-app.yml = **39000** | Umbrel opens the app here |
| Jellyfin | **39096** → 8096 | TV/phone apps need a direct URL |
| Jellyseerr | **39055** → 5055 | family request page |
Verified unused in the official store and Big Bear's community store (2026-10-30). Jellyfin's 7359/udp
discovery port is not published (would clash with the official Jellyfin app, D-029).

---

## 6. Storage

One shared folder on Umbrel's main storage, visible in the Umbrel Files app:
```
${UMBREL_ROOT}/home/EasyArr/              # compose uses ${UMBREL_ROOT}/data/storage/EasyArr; umbrelOS 2.0 rewrites it (D-023)
  downloads/
    torrents/{movies,tv,music}
    usenet/{incomplete,complete/{movies,tv,music}}
  media/{movies,tv,music}
  backups/                                 # automatic backups (see §11)
```
- Mounted as **one** volume `/data` in every container that touches files.
  Hardlinks fail across separate mounts even on the same disk (EXDEV), so never split
  `downloads` and `media` into two mounts.
- Per-service configs: `${APP_DATA_DIR}/data/<service>/` → `/config`.
- PUID/PGID 1000 (Umbrel user, verified); `UMASK=002`.
- `init` creates the tree with correct ownership on every start (idempotent).
- External drives: v2.

---

## 7. Dashboard application

### 7.1 Tech
- **server:** Node LTS, Fastify, TypeScript, `zod` validation, `pino` logs, `undici` for HTTP,
  `@fastify/http-proxy` (or equivalent) for `/apps/*` with WebSocket support.
- **web:** React, Vite, TypeScript, Tailwind CSS, Radix UI primitives (MIT) / shadcn-style components,
  TanStack Query, react-i18next, react-router.
- **shared:** types, zod schemas, brand constants, VPN provider catalog.
- One Docker image, two commands: `serve` (dashboard) and `init` (one-shot seeding).
- Tests: Vitest (unit), Playwright (web e2e), docker-compose-based integration tests in CI.

### 7.2 State
- `${APP_DATA_DIR}/data/easyarr/state.json` (chmod 600), versioned schema with migrations.
- Contains: schemaVersion, wizard progress + answers, account (hashed where possible), VPN config
  reference, chosen features (torrent/usenet, libraries, language, quality preset), wiring ledger
  (what EasyArr created, with IDs), backup settings, UI prefs (simple/advanced).
- Secrets (API keys, VPN keys) stored in `secrets.json` (chmod 600), never logged, always redacted
  in diagnostics.
- No database in v1.

### 7.3 API (outline)
```
GET  /api/health                      # dashboard alive
GET  /api/status                      # all services + VPN + disk, for the dashboard
GET  /api/system-check                # arch, RAM, disk, GPU
GET/POST /api/wizard/:step            # load/save step answers
POST /api/vpn/config                  # write vpn.env + trigger reload
GET  /api/vpn/status                  # state, public IP/country, port forwarding
POST /api/vpn/test                    # run connection test
POST /api/wiring/run                  # run wiring (SSE stream of progress)
POST /api/wiring/repair               # re-create resources the ledger says are missing
GET/POST /api/settings/...            # same forms as wizard steps
POST /api/backup                      # create backup (manual), returns file
GET  /api/backups                     # list automatic backups
POST /api/restore                     # upload + restore (SSE progress)
GET  /api/diagnostics                 # redacted bundle (zip)
GET  /api/diagnostics/ai-prompt       # redacted help prompt text
ALL  /apps/:service/*                 # reverse proxy to services
```

### 7.4 init command (one-shot, runs before services)
`depends_on: { init: { condition: service_completed_successfully } }` for all services (verified:
used by official Umbrel apps).
- Create `/data` tree, fix ownership.
- Seed minimal config files **only if absent**: Servarr `config.xml` (UrlBase, AuthenticationMethod,
  ApiKey, Port), qBittorrent.conf (WebUI port 8090, sub-path settings, subnet whitelist, save paths),
  sabnzbd.ini (url_base, port), Bazarr config, Recyclarr/Unpackerr/Cleanuparr configs pointing at
  `localhost` ports.
- API keys: generated once, stored in `secrets.json`, so EasyArr knows every key before services start.
  (Alternative if seeding proves fragile: read keys from generated configs. Decide in Phase 1, log it.)
- Never overwrite an existing value the user may have changed, except keys EasyArr owns and documents
  (UrlBase, ports) — and only if they would break the stack.

---

## 8. Setup wizard

Shown on first open (state not complete). Each step: title, plain explanation, "What's this?" links
into docs, Back/Next, progress indicator. Answers saved per step (refresh-safe).

| # | Step | Content |
|---|---|---|
| 1 | **Welcome** | What EasyArr does, short legal note (use only for content you have the right to download/share; you're responsible for local laws). Buttons: **Start setup** / **Restore from backup** (→ §11). |
| 2 | **System check** (automatic) | Arch, RAM, free disk, GPU. Plain verdicts: ✅ / ⚠️ / ❌ with explanation. Thresholds: RAM < 4 GB ❌ (allow continue with warning), 4–8 GB ⚠️, ≥ 8 GB ✅; disk < 50 GB free ⚠️. No GPU → "Jellyfin works, heavy transcoding will be slow". |
| 3 | **Create your account** | Username + password (strength meter). Used for Jellyfin admin (and Jellyseerr via Jellyfin login), plus any service that needs its own auth. Explain that family accounts are created later (link to doc). |
| 4 | **How do you want to download?** | Torrents / Usenet / Both. Cards with pros/cons. Usenet card links to *Usenet 101*. |
| 5 | **VPN** | See §9. Must end with a successful connection test (or explicit "skip for now" which keeps the kill switch closed → downloads won't work; clearly explained). |
| 6 | **Usenet** (if chosen) | Explains provider vs indexer. Guided forms: provider (host, port, SSL, username, password, connections) with presets for common providers **[VERIFY presets]**; indexer(s) (URL, API key). "Test" buttons. |
| 7 | **Indexers** (if torrents) | Tutorial for adding indexers in Prowlarr (opens `/apps/prowlarr/` in new tab with step-by-step side guide). EasyArr does not pre-select or recommend specific trackers. |
| 8 | **What do you want?** | Libraries: Movies / TV / Music (toggles). Preferred language. Quality preset: **Best quality / Balanced (default) / Save space** → mapped to Recyclarr templates (Sonarr/Radarr) and EasyArr's own Lidarr profile. |
| 9 | **Finish** | Runs wiring with a live checklist (SSE): "✅ Sonarr connected to Prowlarr", … Failures show plain explanation + "Retry" + "Get help with AI". Ends on the dashboard with a short "what now" tour (request something in Jellyseerr, watch in Jellyfin). |

---

## 9. VPN setup (wizard step 5 + Settings)

### 9.1 Flow
1. **Choose provider** from a searchable list, grouped:
   - *Best for torrents* (port forwarding): ProtonVPN, PIA, AirVPN, … **[VERIFY]**
   - *Works (no port forwarding → slower torrents)*: Mullvad, NordVPN, Surfshark, Windscribe, IVPN, …
   - *Custom*: upload a WireGuard `.conf` or OpenVPN `.ovpn`.
   The list contains all providers Gluetun supports **[VERIFY: generate from Gluetun's provider list]**.
2. **Choose protocol**: only protocols that provider supports in Gluetun; WireGuard pre-selected + "Recommended" badge.
3. **Tutorial + form side by side**: provider-specific steps (where to log in, which page, what to copy),
   and only the fields that provider+protocol needs (e.g. WireGuard private key + addresses; OpenVPN
   username/password). Server country picker (optional, default "fastest/any").
4. **Test connection**: shows ✅ Connected, VPN public IP + country, ✅ "Your home IP is hidden",
   port forwarding status. On failure: plain-language reason (wrong key, auth failed, timeout) + fix hints.

### 9.2 Provider catalog (`shared/src/vpn-providers.ts`)
```ts
{
  id: 'protonvpn',
  displayName: 'Proton VPN',
  gluetunName: 'protonvpn',
  group: 'recommended' | 'works' | 'custom',
  protocols: { wireguard: { fields: [...] }, openvpn: { fields: [...] } },
  portForwarding: 'auto' | 'static' | 'none',
  portForwardingNotes?: string,     // e.g. "requires Plus plan"
  signupUrl: string,
  tutorial: 'docs/vpn/protonvpn.md' | 'docs/vpn/generic.md',
}
```
- Full tutorials in v1: **ProtonVPN, Mullvad, NordVPN, Surfshark, PIA, AirVPN**. Others use `generic.md`.
- Tutorials are Markdown in `docs/vpn/` and rendered in-app (one source for GitHub + app).
- Each tutorial states the date it was last checked; provider UIs change — keep them short and robust.

---

## 10. Wiring engine

Connects everything via each service's API. Runs at the end of the wizard, after Settings changes,
on app start (silently, "add missing only"), and on "Repair connections".

### 10.1 What it wires
- Prowlarr: add Sonarr/Radarr/Lidarr as Applications (sync indexers); add FlareSolverr as indexer proxy (tag-based).
- Sonarr/Radarr/Lidarr: download clients (qBittorrent and/or SABnzbd, categories `tv`/`movies`/`music`),
  root folders `/data/media/{tv,movies,music}`, hardlinks on, completed download handling on.
- qBittorrent: save paths `/data/downloads/torrents/<category>`, categories, sensible seeding defaults,
  listening port from VPN port forwarding.
- SABnzbd: servers (from wizard), categories → `/data/downloads/usenet/complete/<category>`.
- Bazarr: connect to Sonarr/Radarr, language profile from wizard.
- Recyclarr: generate `recyclarr.yml` from quality preset; trigger sync.
- Lidarr: EasyArr quality/metadata profile matching the preset.
- Unpackerr + Cleanuparr: point to Sonarr/Radarr/Lidarr.
- Jellyfin: complete first-run via API (admin user from wizard, skip startup wizard), libraries for chosen
  media types **[VERIFY Jellyfin startup API]**; GPU hardware acceleration if available.
- Jellyseerr: initialise with Jellyfin, add Sonarr/Radarr (and Lidarr if supported) **[VERIFY Jellyseerr API setup flow]**.

### 10.2 Rules (non-negotiable)
- **Idempotent:** running twice changes nothing.
- **Ledger:** every resource EasyArr creates is recorded (service, type, id, name) in state.
  Names are prefixed "EasyArr – …" for recognisability.
- **Never overwrite user changes:** if a ledger resource exists but differs, leave it.
- **Respect deletions:** if a ledger resource is missing, assume the user deleted it → do not recreate
  automatically; "Repair connections" (explicit) recreates it.
- **Ordered + dependency-aware:** wait for each service's health endpoint with timeout + backoff.
- Every step reports progress events (for the live checklist) and a plain-language error.
- Unit-tested with mocked APIs; integration-tested in CI against real containers.

---

## 11. Backup & restore

Two layers so restore always works, even when a service's native backup can't be used:

1. **EasyArr state replay (always works):** state.json + secrets.json + wizard answers. Restoring
   re-runs the wiring → same structure, same connections, same VPN, same accounts.
2. **Native service backups (full fidelity):** history, custom settings, monitored items.
   - Sonarr/Radarr/Lidarr/Prowlarr: trigger built-in backup via API, include the zip; restore via API
     upload **[VERIFY endpoints per app/version]**.
   - Jellyfin: use built-in backup/restore if available in the shipped version **[VERIFY]**; otherwise
     v1 restores via state replay (libraries, admin) and documents what's lost (watch history).
   - qBittorrent / SABnzbd / Bazarr / Jellyseerr: config files where safe **[VERIFY]**; else state replay.
   - Active torrents / in-progress downloads: **not** included (documented).
   - Media files are **never** included (documented clearly: "this backs up your setup, not your movies").

### File format
- `easyarr-backup-<YYYY-MM-DD-HHmm>.easyarr` = tar.gz with `manifest.json`
  (format version, EasyArr version, created at, included parts, encrypted: bool, checksums).
- **Manual backup** (Settings → Backup → Download): user may set a password → AES-256-GCM with
  scrypt-derived key. Strongly suggested, because backups contain VPN keys and passwords.
- **Automatic backups:** daily (default 04:00 local), keep last 7, stored in `EasyArr/backups/`
  (visible in Umbrel Files so users can copy them off the device). Not encrypted (they stay on the device);
  UI says so.

### Restore
- From the wizard Welcome step or Settings → Backup → Restore. Upload file (or pick an automatic backup).
- Validate manifest + checksums + version compatibility (migrate older formats; refuse newer with clear message).
- Ask for password if encrypted. Show what will be restored. Confirm.
- Live progress (SSE). Restarts services through their own APIs where needed (never Docker socket).
  Services restarted via clean shutdown need a restart policy that brings them back **[VERIFY Umbrel
  allows `restart: unless-stopped`; else find alternative]**.
- Ends with a VPN connection test and a wiring check.

---

## 12. Dashboard (after setup)

- **Simple mode (default):** big tiles "Watch" (Jellyfin), "Request" (Jellyseerr); status strip
  (VPN ✅ country, downloads active, disk free); current downloads list; recently added.
- **Advanced mode (toggle, remembered):** adds tiles for every service (open `/apps/<service>/`),
  per-service health, versions, VPN details (IP, server, port forwarding), logs viewer (redacted).
- **Warnings banner** for: VPN down, disk < 10 % free, a service unhealthy, the official Umbrel
  Jellyfin app also installed (two Jellyfins), update available.
- **Settings:** account, download method, VPN, Usenet, libraries/quality, backups, advanced
  (re-run wiring, repair connections), about. Settings reuse the wizard step components.
- **Help:** in-app docs viewer, "Get help with AI", "Download diagnostics", link to GitHub issues.

---

## 13. Diagnostics & "Get help with AI"

### Diagnostics bundle (zip)
- EasyArr version, umbrelOS version (if detectable), arch, RAM, disk, GPU.
- Wizard progress, enabled features (no secrets).
- Service health + versions, VPN state (no IPs/keys), wiring ledger summary.
- Last N log lines per service (from EasyArr's own logs + service APIs where possible).
- **Redaction** (always, unit-tested): passwords, API keys, tokens, WireGuard/OpenVPN keys, usernames,
  emails, public IPs, private IPs (optional), hostnames of indexers/providers → `[REDACTED:type]`.

### AI help prompt
Button in dashboard + on every wizard error screen. Generates text the user pastes into any AI chat:
```
[Context]   What EasyArr is + architecture summary; user is a beginner;
            answer step by step; avoid terminal commands unless unavoidable;
            EasyArr docs: <link to llms.txt>
[System]    EasyArr + umbrelOS version, arch, RAM, disk
[State]     Wizard steps done, VPN status, service health
[Problem]   Failed step / error message + relevant redacted log lines (~50)
[Docs]      Links to matching docs pages
[Question]  "What I was trying to do: ____"   (user fills in)
```
- Preview before copying (user sees exactly what's shared). Size cap (~12k chars).
- One-click copy; buttons to open popular AI chats in a new tab.
- `llms.txt` (all docs concatenated) is generated in CI and published with the repo.
- Same bundle can be attached to a GitHub issue (issue templates ask for it).

---

## 14. Design — native umbrelOS look

Goal: users should feel EasyArr is part of umbrelOS.

- **Visual language to match:** dark UI over a soft blurred wallpaper; frosted-glass panels
  (translucent white fill, backdrop blur, subtle 1px light border); generous rounding (large radius on
  cards/dialogs); white/near-white text with muted secondary text; soft shadows; smooth, quick
  transitions; clean sans-serif typography; icon-forward tiles similar to Umbrel's app grid; centered
  dialogs/sheets like umbrelOS settings.
- **Method:** reuse umbrelOS UI code where it helps (design tokens, Tailwind config, layout and
  component code) by vendoring it under the rules in §14.1; build everything else ourselves in the
  same style, using MIT-licensed libraries (Radix, Tailwind, Lucide icons). Screenshots of the owner's
  Umbrel serve as visual reference.
- **Own identity:** EasyArr has its own name, logo and wallpaper so it's never mistaken for an official
  Umbrel component.

### 14.1 Reusing umbrelOS code (licensing rules)
umbrelOS (`getumbrel/umbrel`) is licensed **PolyForm Noncommercial 1.0.0**: copying, modifying and
redistributing is allowed for noncommercial purposes, with the license and notices passed on.
EasyArr's own code is MIT so it can be combined with it (GPL-3.0 could not — see D-020).

- **Where:** all copied files live in `dashboard/web/src/vendor/umbrel/` (or a matching `vendor/umbrel/`
  folder in another package if ever needed). Never mix copied code into our own files.
- **License file:** `vendor/umbrel/LICENSE` = umbrelOS's LICENSE copied verbatim from upstream, including
  any "Required Notice:" lines.
- **Provenance:** `vendor/umbrel/PROVENANCE.md` lists for every file: upstream path, upstream commit hash,
  date copied, and whether/how it was modified. Modified files get a header comment
  `Modified by EasyArr — originally from getumbrel/umbrel <path>@<commit>`.
- **Allowed to copy:** UI code — components, hooks, utility functions, Tailwind config/design tokens,
  CSS, layout code.
- **Not allowed to copy:** the Umbrel logo, name or other brand marks (a copyright license grants no
  trademark rights), anything that would make EasyArr look like an official Umbrel product.
- **Check individually before copying:** wallpapers, images, fonts and icons — they may be third-party
  works not covered by Umbrel's license. Only vendor them if their origin and license are clear;
  record it in PROVENANCE.md. Default: use our own wallpaper.
- **Distribution:** the built Docker image must ship the notices too (e.g. `/licenses/` in the image
  with LICENSE, NOTICE.md and the vendored LICENSE), and the dashboard's About page links to
  NOTICE.md.
- **README + NOTICE.md** state clearly: "EasyArr's own code is MIT. It includes code from umbrelOS
  under PolyForm Noncommercial 1.0.0, so EasyArr as a whole may only be used for noncommercial purposes."
- **Before an official Umbrel store submission** (v2): ask Umbrel (help@getumbrel.com) to confirm the
  vendored code is fine, or replace it.
- Responsive (phone → desktop), keyboard accessible, WCAG AA contrast, reduced-motion support.
- Design tokens in `web/src/styles/tokens.css`; a `/dev/ui` page lists all components (dev builds only).

---

## 15. Internationalisation

- All UI strings via react-i18next keys from day one; `web/src/locales/en.json` only in v1.
- No hard-coded user-facing strings in components (lint rule if feasible).
- Docs English only in v1; structure `docs/` so `docs/de/` etc. can be added later.

---

## 16. Documentation

Single Markdown source, shown on GitHub and in the in-app help viewer.
```
README.md                     # what it is, screenshots, install in 3 steps, links
docs/getting-started.md
docs/how-it-works.md          # plain-language overview of every service
docs/torrents-101.md
docs/usenet-101.md
docs/vpn/README.md            # VPN basics, port forwarding explained
docs/vpn/<provider>.md        # protonvpn, mullvad, nordvpn, surfshark, pia, airvpn, generic, custom
docs/indexers.md
docs/quality-presets.md
docs/family-accounts.md       # Jellyfin users, Jellyseerr permissions
docs/remote-access-tailscale.md
docs/backup-restore.md
docs/troubleshooting.md
docs/faq.md
docs/getting-help.md          # diagnostics, AI help, GitHub issues
docs/dev/architecture.md
docs/dev/development.md       # local dev, testing on a real Umbrel
docs/dev/release.md
CONTRIBUTING.md
SECURITY.md
llms.txt                      # generated
```
Style: short sentences, numbered steps, one action per step, screenshots where helpful,
"Last checked: <date>" on provider tutorials.

---

## 17. Security

- No Docker socket. No privileged containers unless strictly needed (Gluetun needs `NET_ADMIN`
  + `/dev/net/tun`).
- Dashboard only reachable through Umbrel's `app_proxy` (Umbrel login).
- Proxied services trust only the Docker subnet; never published on host ports.
- Jellyfin/Jellyseerr published but protected by their own logins (admin from wizard).
- Secrets in chmod-600 files, never logged, always redacted. Backups optionally encrypted.
- Pin all images by digest; Renovate keeps them updated.
- CSP + secure headers on the dashboard.
- `SECURITY.md` with a private reporting channel.

---

## 18. Hardware & GPU

- Multi-arch images only (linux/amd64 + linux/arm64). Verify every third-party image supports both.
- Jellyfin hardware transcoding: the manifest requests `permissions: [GPU]`; umbrelOS 2.0 then maps the
  host's GPU devices (DRI, ROCm, NVIDIA) into the app when present and nothing when absent. The compose
  file never maps `/dev/dri` itself (umbreld strips it) (D-027). System check reports GPU availability;
  wiring enables hardware acceleration in Jellyfin only when a usable device exists.
- Resource limits: consider memory limits for heavy services to protect the rest of the Umbrel.

---

## 19. Umbrel packaging

- `umbrel-app.yml`: manifestVersion, id `w1kyu-easyarr`, category `media`, name, version (semver),
  tagline, description (beginner-friendly), releaseNotes, developer `w1kyu`, website/repo/support
  (GitHub), port 39000, gallery, path "", no default credentials (wizard creates them).
- `docker-compose.yml`: `app_proxy` with `APP_HOST: w1kyu-easyarr_dashboard_1`, `APP_PORT: 3000`
  (verified); Umbrel env vars `APP_DATA_DIR`, `UMBREL_ROOT`, `NETWORK_IP`, `APP_SEED`, `APP_PASSWORD`,
  `DEVICE_DOMAIN_NAME` (verified, see PROGRESS.md); `restart: on-failure`; healthchecks; `depends_on`
  with conditions.
- `storage: dataRoot: data` + `permissions: [GPU]` in the manifest (D-023, D-027).
- Umbrel's official linter (`getumbrel/umbrel-apps/.tools/lint-apps.mjs --check-images`) runs in CI.

---

## 20. Testing & release

### Local dev
- `dev/docker-compose.dev.yml` mimics Umbrel (sets `APP_DATA_DIR`, `UMBREL_ROOT`, no app_proxy).
- `pnpm dev` runs web (Vite) + server with hot reload against the dev stack.
- A "VPN-less test mode" exists **only** in dev/CI compose overrides (replaces the VPN container with a
  plain namespace container). Never shipped in the Umbrel compose.

### CI (GitHub Actions)
- Lint + typecheck + unit tests (server, web, shared).
- Integration: spin up real Sonarr/Radarr/Prowlarr/qBittorrent/SABnzbd/Jellyfin containers, run wiring
  twice (idempotency), run backup → wipe → restore → compare.
- Build multi-arch images (buildx, QEMU) → push to GHCR on tags.
- Generate `llms.txt`; check docs links.
- License check: every file in `vendor/umbrel/` is listed in PROVENANCE.md; no vendored code outside
  `vendor/`; dependency licenses compatible (no GPL/AGPL npm deps bundled into the dashboard).

### Manual release checklist (on a real Umbrel, ARM + x86 if possible)
Fresh install → wizard (each VPN group) → request a test item → update from previous version
(settings intact) → uninstall/reinstall → restore from backup → kill-switch leak test.

### Versioning & updates
- SemVer. `umbrel-app.yml` version + releaseNotes every release.
- Renovate PRs for image digests; each merged bump = patch release after CI passes.
- Release workflow syncs `umbrel/w1kyu-easyarr/` into `w1kyu/umbrel-app-store` (PR or direct commit).

---

## 21. Agent continuity

Any new Claude (Code) session must be able to continue without the owner re-explaining anything:
- `CLAUDE.md` — how to work in this repo (auto-loaded by Claude Code).
- `SPEC.md` — what to build (this file).
- `PROGRESS.md` — where we are, what's next, verified facts, known issues, session log.
- `DECISIONS.md` — why things are the way they are.
- `prompts/` — the phase prompts; `prompts/CONTINUE.md` for resuming.
Every session ends by updating PROGRESS.md (+ DECISIONS.md if anything was decided) and committing.

---

## 22. Build phases

| Phase | Scope | Done when |
|---|---|---|
| 00 | Repos, structure, tooling, planning docs committed | Both repos exist; pnpm workspace builds |
| 01 | Umbrel app definition + full compose stack, VPN namespace, kill switch (basic), `/data` layout, placeholder dashboard | Installs on a real Umbrel; all containers healthy |
| 02 | Dashboard skeleton (server + web), umbrelOS-style design system, i18n, init command, CI multi-arch images | Empty EasyArr dashboard opens inside Umbrel |
| 03 | Wizard framework + steps 1–4 (welcome, system check, account, download method) | Steps work; answers persist |
| 04 | VPN: wrapper (reload + leak-proof kill switch), provider catalog, step 5 UI, tests, port-forward sync | Beginner connects VPN without terminal; leak test passes |
| 05 | Wiring engine (all services), ledger, idempotency, service proxy `/apps/*` | Fresh install → everything connected; run twice = no changes |
| 06 | Wizard steps 6–9 (Usenet, indexers, libraries/quality, finish with live checklist) | Full first-run flow end-to-end |
| 07 | Dashboard (simple/advanced), settings pages, warnings | Daily use without opening *arr apps |
| 08 | Backup & restore (manual, encrypted, automatic, restore in wizard + settings) | Backup → fresh install → restore = same setup |
| 09 | Diagnostics, redaction, AI help prompt, issue templates | Error → copyable, redacted help prompt |
| 10 | Documentation + llms.txt + in-app docs viewer polish | Beginner can follow docs alone |
| 11 | Release: test matrix, Renovate, release workflow, store sync, v0.1.0 | Public v0.1.0 in `w1kyu Apps` |

---

## 23. Roadmap after v1
- v1.1: notifications (Discord, ntfy, Telegram), German translation.
- v2: external drives/NAS, books (Bookshelf/LazyLibrarian), remote access in wizard, mobile-app access,
  optional Plex instead of Jellyfin, official Umbrel store submission.
