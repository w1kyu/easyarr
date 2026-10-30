# Development: running and testing EasyArr

## 1. Quick checks (no Docker)

```sh
pnpm install
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## 2. Dashboard development (no Docker needed)

```sh
pnpm dev     # server on :3000 (tsx watch) + web on :5173 (Vite, proxies /api to :3000)
```

Open http://localhost:5173. In dev builds, http://localhost:5173/dev/ui shows every UI component.
The dev server keeps its state in `dev/data/dashboard-state/`. To try `init` against throwaway
folders:

```sh
cd dashboard/server && pnpm build
EASYARR_DATA_ROOT=/tmp/ea/data EASYARR_APPDATA_DIR=/tmp/ea/appdata node dist/index.js init
```

UI code copied from umbrelOS lives in `dashboard/web/src/vendor/umbrel/` and is imported as `@/…`.
Our own code is imported as `~/…`. If you vendor another file, add it to `PROVENANCE.md`.
`pnpm lint` fails otherwise (SPEC §14.1).

## 3. Run the whole stack on a laptop

Needs Docker with Compose v2. `dev/stack.sh` runs the real Umbrel compose
(`umbrel/w1kyu-easyarr/docker-compose.yml`) plus a small override (`dev/docker-compose.dev.yml`)
that mimics umbrelOS: the shared `umbrel_main_network` (10.21.0.0/16), container names
`w1kyu-easyarr_<service>_1`, and the env vars `UMBREL_ROOT`, `APP_DATA_DIR`, `NETWORK_IP`.
Everything is stored in `dev/data/` (git-ignored).

```sh
dev/stack.sh up         # start
dev/stack.sh wait       # wait until all healthchecks pass (vpn is expected to stay unhealthy)
dev/stack.sh leaktest   # kill switch + reachability checks
dev/stack.sh logs -f sonarr
dev/stack.sh down       # stop (keeps dev/data)
dev/stack.sh reset      # stop and delete dev/data
```

Then open:

| What | URL |
|---|---|
| Dashboard | http://localhost:39000 |
| Jellyfin | http://localhost:39096 |
| Jellyseerr | http://localhost:39055 |

The *arr apps, qBittorrent and SABnzbd aren't published. They'll be reachable through the
dashboard proxy (`/apps/<service>/`) from phase 05 onwards.

CI (`.github/workflows/umbrel-app.yml`) runs Umbrel's official app linter, plus
`up → wait → leaktest` on both amd64 and arm64 for every change under `umbrel/` or `dev/`.

## 4. Test on a real Umbrel

A local compose run doesn't count as proof that the app works on umbrelOS. Before you release,
test the full install on a real device.

### Normal path (what users do)

1. Commit your changes, then sync the app folder into the store repo:
   `scripts/sync-store.sh [path-to-umbrel-app-store-clone]`.
2. On the Umbrel, go to **App Store → ⋯ (top right) → Community App Stores**, paste
   `https://github.com/w1kyu/umbrel-app-store` and click **Add** (one-time).
3. umbrelOS pulls community stores every **5 minutes**. Once the new version shows up, install
   or update **EasyArr** from the store.

### Fast loop (skip the 5-minute wait)

umbrelOS keeps each store as a git checkout at
`/home/umbrel/umbrel/app-stores/w1kyu-umbrel-app-store-github-3363c2d3/`. The suffix is the
first 8 hex characters of `sha256("https://github.com/w1kyu/umbrel-app-store")`. To try local
changes without pushing:

```sh
rsync -av --delete --exclude=.gitkeep umbrel/w1kyu-easyarr/ \
  umbrel@umbrel.local:/home/umbrel/umbrel/app-stores/w1kyu-umbrel-app-store-github-3363c2d3/w1kyu-easyarr/

ssh umbrel@umbrel.local
sudo umbreld client apps.install.mutate --appId w1kyu-easyarr   # or apps.update.mutate
sudo umbreld client apps.state.query  --appId w1kyu-easyarr
sudo umbreld client apps.logs.query   --appId w1kyu-easyarr
sudo umbreld client apps.restart.mutate --appId w1kyu-easyarr
```

The next store refresh (git pull) may undo the rsync. That's fine, because by then the change
should be pushed anyway. On umbrelOS 2.0 you can also use **Settings → AI agents (MCP)** to let
an agent check app state and logs. Copying files onto the device still needs SSH.

### Checks on the device

- `docker ps --filter name=w1kyu-easyarr` lists every service as running or healthy. `vpn` stays
  unhealthy until a VPN is configured (phase 04).
- Kill switch: `docker exec w1kyu-easyarr_qbittorrent_1 curl -m 8 https://1.1.1.1` must fail.
- Files app: **Home → EasyArr** contains `downloads`, `media` and `backups`.

## 5. Where things live on umbrelOS

| What | Path on the device | In compose |
|---|---|---|
| App package + data | `/home/umbrel/umbrel/app-data/w1kyu-easyarr/` | `${APP_DATA_DIR}` |
| Per-service config | `…/app-data/w1kyu-easyarr/data/<service>/` | `${APP_DATA_DIR}/data/<service>` → `/config` |
| Media + downloads | `/home/umbrel/umbrel/home/EasyArr/` (Files → Home → EasyArr) | `${UMBREL_ROOT}/data/storage/EasyArr` → `/data` |

The compose file uses the legacy `${UMBREL_ROOT}/data/storage/...` form on purpose. umbrelOS 2.0
rewrites it to `${UMBREL_ROOT}/home/...` when it installs the app, and older versions expect the
legacy path. This is the same convention the official apps use (D-023).
