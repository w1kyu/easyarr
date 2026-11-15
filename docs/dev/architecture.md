# Architecture

How EasyArr is put together, for contributors. The full specification is [SPEC.md](../../SPEC.md);
why things are the way they are is in [DECISIONS.md](../../DECISIONS.md) (`D-NNN` below).

## The big picture

EasyArr is one Umbrel app (`w1kyu-easyarr`) made of 16 containers. Two of the images are
EasyArr's own: the **dashboard** (`ghcr.io/w1kyu/easyarr`, also used for the one-shot `init`) and
the **VPN** (`ghcr.io/w1kyu/easyarr-vpn`, Gluetun plus a wrapper). Every other image is an unmodified
upstream image, pinned by digest in `umbrel/w1kyu-easyarr/docker-compose.yml`.

```text
                Umbrel login (app_proxy)                     published ports
                         │                                    39096   39055
                         ▼                                      │       │
  ┌─────────────────────────────────────┐   ┌──────────────┐  ┌─▼───────┐ ┌▼───────────┐
  │ dashboard  :3000  (port 39000)      │   │ init         │  │Jellyfin │ │ Jellyseerr │
  │ API · wizard · wiring · status      │   │ (one-shot)   │  │ :8096   │ │ :5055      │
  │ backups · diagnostics · /apps proxy │   │ seeds configs│  └─────────┘ └─────┬──────┘
  └──────┬──────────────────────────────┘   └──────────────┘                    │
         │ HTTP to w1kyu-easyarr_vpn_1:<port>   (umbrel_main_network)           │
         ▼                                                                      ▼
  ┌──────────────────────────────────────────────────────────────────────────────────┐
  │ vpn  (network namespace shared by every service below, network_mode: service:vpn) │
  │  wrapper (PID 1) ── default-deny firewall ── Gluetun ── WireGuard/OpenVPN tunnel ──┼─▶ internet
  │                                                                                    │
  │  qBittorrent :8090  SABnzbd :8080  Prowlarr :9696  FlareSolverr :8191              │
  │  Sonarr :8989  Radarr :7878  Lidarr :8686  Bazarr :6767                            │
  │  Recyclarr  Unpackerr  Cleanuparr :11011                                           │
  └──────────────────────────────────────────────────────────────────────────────────┘
                 all of them: /data = Files → Home → EasyArr (one mount, hardlinks)
```

- **Outside the VPN:** the dashboard, `init`, Jellyfin and Jellyseerr. Jellyfin and Jellyseerr
  publish host ports because TV apps and family members need a direct address (SPEC §5.6).
- **Inside the VPN:** everything that searches or downloads. They share the `vpn` container's
  network namespace, so their only way out is the tunnel. The dashboard reaches them by the VPN
  container's name and the service port (D-026).
- **Storage:** one `/data` mount for media and downloads, so imports are hardlinks or renames, never
  copies (SPEC §6). Each service's config lives in `${APP_DATA_DIR}/data/<service>`.

## The dashboard

`dashboard/` is a pnpm workspace with three packages:

| Package | What's in it |
| ------- | ------------ |
| `shared` | Types, zod schemas and catalogs used by both sides: wizard steps and answers, VPN provider catalog, Usenet presets, services, redaction, brand (the app name lives only here and in `umbrel-app.yml`). |
| `server` | Fastify API (`serve`) and the `init` command. |
| `web` | React + Vite + Tailwind single-page app: wizard, home screen, settings, help. UI primitives copied from umbrelOS live in `src/vendor/umbrel/` (PolyForm Noncommercial, D-020). |

### Server modules (`dashboard/server/src/`)

| Module | Job |
| ------ | --- |
| `state/` | `state.json` (answers, wizard progress, wiring ledger) and `secrets.json` (passwords, API keys, VPN keys), JSON files with migrations and a mutex. Secrets never leave the server in clear text (D-064). |
| `wizard/` | Step API: validates answers with the shared schemas, enforces step order (D-039). |
| `system/` | System check: architecture, memory, disk, GPU (D-037). |
| `vpn/` | Writes the wrapper's settings, reads its status and Gluetun's control server, checks that the home IP is hidden, applies the forwarded port to qBittorrent. |
| `wiring/` | The wiring engine (below). One client per service in `services/`. |
| `status/` | `GET /api/status` for the home screen: probes, downloads, recently added, warnings, "Needs your OK" (D-059, D-068), indexer healer (D-062). |
| `backup/` | Backup file format, automatic backups, restore (D-069 – D-072). |
| `support/` | Diagnostics zip and the "Get help with AI" prompt, both redacted (D-074, D-075). |
| `proxy/` | `/apps/<service>/` reverse proxy to the VPN-side web UIs, with its own CSRF check (D-045). |
| `init/` | One-shot `init` command: creates folders and seeds the config files services can't set through their API (D-031, D-049). Idempotent: it only sets keys EasyArr owns. |
| `logger.ts` | pino logger that redacts every known secret; keeps the last 1000 lines for diagnostics. |

The API only answers loopback and Umbrel's gateway (`NETWORK_IP` + 1), so other apps on the shared
Docker network can't call it (D-041). State-changing calls must be JSON (D-038).

### Web (`dashboard/web/src/`)

Routes: `/setup/<step>` (wizard), `/` (home), `/settings/<section>`, `/restore`, `/help/<guide>`.
Data comes from the API with TanStack Query; the home screen polls `/api/status` every 5 s while
visible. Every user-facing string is an i18n key in `locales/en.json`. The in-app help renders the
Markdown in `docs/` (bundled at build time, ordered by `docs/nav.json`, D-077).

## Setup flow

1. **Install:** umbrelOS starts `init` first. It creates the folders, generates API keys, writes
   `config.xml`, `qBittorrent.conf`, `sabnzbd.ini` and friends, then exits. Every other container
   waits for it.
2. **Wizard:** the user answers steps 1–8. Each answer is saved on the server at once
   (`POST /api/wizard/<step>`); the VPN step tests the connection live.
3. **Finish:** `POST /api/wiring/run` runs the wiring engine and streams each step's progress as
   server-sent events. The wizard is complete only after a run (D-053).
4. **Afterwards:** the wiring runs again silently on every app start (D-056) and after every
   change in Settings (D-061). "Repair connections" runs it in repair mode.

## The wiring engine

`wiring/engine.ts` plus `wiring/steps.ts`. Each step talks to one service's API and either creates
what's missing or leaves it alone. Two rules make it safe to run any number of times:

- **Idempotent:** a second run with the same answers changes nothing (the stack test checks this).
- **Never overwrites user changes:** a **ledger** in `state.json` remembers every resource EasyArr
  created. A resource the user deleted stays deleted on a normal run; only "Repair connections"
  re-creates it. Settings the user changed in an app are left alone (D-047).

Services that can't be configured through their API get their settings from `init` instead
(D-049), and Recyclarr only syncs when EasyArr asks (D-048).

## The VPN wrapper

`vpn/` builds on Gluetun. The wrapper is PID 1 in the `vpn` container and owns the network
namespace, so the container never restarts (that would cut every service off).

- **Kill switch at all times:** whenever Gluetun isn't running (not configured yet, reloading,
  crashed), the wrapper installs its own default-deny egress rules: only loopback and the Docker
  network are allowed, and Docker's DNS (`127.0.0.11`) is blocked too, because it resolves outside
  the tunnel (D-040, D-043). Gluetun's own firewall takes over while it runs.
- **Only the dashboard and the request page** may open connections into the namespace from the
  shared Docker network. The dashboard keeps that list in `easyarr/allowed-clients` (D-046).
- **Live reload without the Docker socket:** the dashboard writes `easyarr/vpn.env` (0600) into the
  shared volume and touches `easyarr/reload`. The wrapper restarts the Gluetun process with the new
  settings and writes `easyarr/status.json`.
- **Status:** the dashboard reads `status.json` and Gluetun's control server (port 8000, API key from
  `auth/config.toml`, written by `init`).

The leak test (`dev/stack.sh leaktest`, in CI on amd64 and arm64) proves that nothing gets out
without the tunnel: by IP, by name and by URL, before setup and during a reload.

## Security model

- The Umbrel login protects the dashboard and, through its proxy, every VPN-side web UI. Those apps
  have their own login turned off (Servarr `External`, qBittorrent's subnet whitelist), which is
  only safe because nothing else can reach them (SPEC §5.5).
- No Docker socket, no privileged containers. Only the `vpn` container gets `NET_ADMIN` and
  `/dev/net/tun`.
- Secrets are stored only in `secrets.json`, masked in every API response, and redacted from logs,
  diagnostics and the AI prompt (D-074).

## Tests

| Layer | Where | What it proves |
| ----- | ----- | -------------- |
| Unit | `*.test.ts` next to the code (Vitest) | Logic, including every wiring step against fakes that mirror real fresh-install answers (`wiring/testing/fake-world.ts`). |
| Browser | `e2e/` (Playwright) | The wizard and a full first run (torrents, Usenet, both) against the same fakes and a fake VPN (D-054). |
| Stack | `dev/stack.sh`, workflow `umbrel-app.yml` | The real Umbrel compose with the pinned images on amd64 and arm64: leak test, wiring against the real services, backup and restore. |
| Device | the owner's Umbrel | Install and update from the store; checklists in `PROGRESS.md`. |

How to run them: [development.md](development.md). How a release is made: [release.md](release.md).
