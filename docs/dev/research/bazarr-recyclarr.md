# Bazarr 1.6.2 + Recyclarr 8.8.1: reference for the EasyArr wiring engine

Researched 2026-10-31 from the upstream source at these exact commits (no code changed anywhere):

| Repo | Ref | Commit |
|---|---|---|
| morpheus65535/bazarr | tag `v1.6.2` | `8c68f16a1e12f8e7985baeb73fb4199b5149108a` |
| linuxserver/docker-bazarr | tag `v1.6.2-ls367` | `c4d11ba6a1eb48812477c442303c380b0fd28385` |
| recyclarr/recyclarr (holds the Docker files too, `Dockerfile` + `docker/scripts/`) | tag `v8.8.1` | `874cb274f8b419dff6fb211fc326e4f2dd63c4fb` |
| recyclarr/config-templates | `master` (8.8.1 resolves `v8` → `master`, see §7) | `89eebadd429952069182a22930af4d768cacda36` |
| TRaSH-Guides/Guides (what Recyclarr pulls at runtime, `master`) | master on 2026-10-28 | `d24f13ceea5e82ccc20d08b7814fca93840e4046` |

URL prefixes used below:
- `BZ` = https://github.com/morpheus65535/bazarr/blob/8c68f16a1e12f8e7985baeb73fb4199b5149108a
- `LS` = https://github.com/linuxserver/docker-bazarr/blob/c4d11ba6a1eb48812477c442303c380b0fd28385
- `RC` = https://github.com/recyclarr/recyclarr/blob/874cb274f8b419dff6fb211fc326e4f2dd63c4fb
- `CT` = https://github.com/recyclarr/config-templates/blob/89eebadd429952069182a22930af4d768cacda36
- `TG` = https://github.com/TRaSH-Guides/Guides/blob/d24f13ceea5e82ccc20d08b7814fca93840e4046

(Spelled out in full the first time each file is cited, then shortened to the prefix.)

---

## Part A: Bazarr 1.6.2

### 1. Config file: location, format, keys

**Location and format: YAML at `/config/config/config.yaml`.**
- The linuxserver image starts Bazarr with `--config /config` and keeps port 6767 hard-coded in its health check (`nc -z localhost 6767`): https://github.com/linuxserver/docker-bazarr/blob/c4d11ba6a1eb48812477c442303c380b0fd28385/root/etc/s6-overlay/s6-rc.d/svc-bazarr/run#L4-L12 . **Keep the port at 6767.**
- The config file path is `<config_dir>/config/config.yaml`, which you can override with env `BAZARR_CONFIG_BASE_FILE_PATH`. If an old `config.ini` exists and there is no `config.yaml`, Bazarr converts it once and renames it to `config.ini.old`. If neither file exists, Bazarr creates an empty `config.yaml`: https://github.com/morpheus65535/bazarr/blob/8c68f16a1e12f8e7985baeb73fb4199b5149108a/bazarr/app/config.py#L517-L526 (conversion: `BZ/bazarr/app/config.py#L498-L514`).
- The database is SQLite at `/config/db/bazarr.db`: `BZ/bazarr/app/database.py#L82`. **Language profiles and enabled languages live in the database, not in config.yaml** (`BZ/bazarr/app/database.py#L252-L262`, `#L329-L336`).
- The linuxserver init step runs `lsiown -R abc:abc /config` (PUID/PGID) on every start: `LS/root/etc/s6-overlay/s6-rc.d/init-bazarr-config/run#L4-L7`. The image ships `ffmpeg` and `mediainfo`: `LS/Dockerfile#L27-L32`. It also has `EXPOSE 6767` and `VOLUME /config`: `LS/Dockerfile#L75-L77`.

**Key reference.** Every key is declared as a Dynaconf `Validator(..., must_exist=True, default=...)`: `BZ/bazarr/app/config.py#L83-L495`.

| Key | Default | Type / allowed values | Source |
|---|---|---|---|
| `general.ip` | `'*'` | str, IP or `*` | `BZ/bazarr/app/config.py#L87` |
| `general.port` | `6767` | int 1–65535 (CLI `-p` wins over it, `BZ/bazarr/app/server.py#L36-L37`) | `#L88` |
| `general.base_url` | `''` | str | `#L90` |
| `general.path_mappings` / `general.path_mappings_movie` | `[]` | list of `[from, to]` pairs | `#L93`, `#L117` |
| `general.use_sonarr` / `general.use_radarr` | `False` | bool | `#L113-L114` |
| `general.serie_default_enabled` / `general.serie_default_profile` | `False` / `''` | bool / int or str (profileId) | `#L121-L122` |
| `general.movie_default_enabled` / `general.movie_default_profile` | `False` / `''` | same | `#L123-L124` |
| `general.use_embedded_subs` ("Treat embedded subs as downloaded") | `True` | bool | `#L131` |
| `general.enabled_providers` | `[]` (**no provider is enabled by default**) | list | `#L142` |
| `general.minimum_score` / `general.minimum_score_movie` | `90` / `70` | int | `#L99`, `#L130` |
| `auth.apikey` | random 32 hex chars, generated at start if missing | str | `#L185` |
| `auth.type` | `None` | `None` \| `'basic'` \| `'form'` | `#L186-L187` |
| `auth.username` / `auth.password` | `''` | str (the password is stored as an MD5 hex digest, `#L768-L770`) | `#L188-L189` |
| `sonarr.ip` / `.port` / `.base_url` / `.ssl` / `.apikey` | `127.0.0.1` / `8989` / `'/'` / `False` / `''` | | `#L214-L220` |
| `sonarr.http_timeout` | `60` | one of 60,120,180,240,300,600 | `#L218-L219` |
| `sonarr.series_sync` / `sonarr.series_sync_on_live` / `sonarr.only_monitored` / `sonarr.excluded_tags` / `sonarr.full_update*` | `60` / `True` / `False` / `[]` / Daily | | `#L221-L235` |
| `radarr.ip` / `.port` / `.base_url` / `.ssl` / `.apikey` | `127.0.0.1` / `7878` / `'/'` / `False` / `''` | | `#L238-L244` |
| `radarr.movies_sync`, `radarr.movies_sync_on_live`, … | | | `#L245-L256` |
| `analytics.enabled` | `True` (consider `false`) | bool | `#L400` |
| `opensubtitlescom.username` / `.password` | `''` | | `#L311-L312` |
| `embeddedsubtitles.*` | | | `#L418-L423` |

How the Sonarr/Radarr URL is built: `{http|https}://{ip}{:port}{base_url}`. Bazarr normalises `base_url` in memory to a leading `/` and no trailing `/`, then appends `/api/v3/`: `BZ/bazarr/sonarr/info.py#L90-L112`. **Write `/apps/sonarr` and `/apps/radarr` already normalised** so the in-memory value never differs from the file.

Path mappings: in YAML, `path_mappings: [["/from", "/to"], ...]`. Via the API, send one form value per mapping in the form `"from,to"` (`BZ/bazarr/app/config.py#L737-L739`). In EasyArr Sonarr, Radarr and Bazarr share one network namespace. If they also mount media at the same container path, no mappings are needed.

### 2. Pre-written config on first start: what gets merged or overwritten

What happens at start:
1. Bazarr loads `config.yaml` (YAML only, `apply_default_on_none=True`): `BZ/bazarr/app/config.py#L531-L535`.
2. It runs the validators in a loop. **A missing key gets its default. An invalid value (wrong type or not in the allowed list) is logged as `VALIDATOR RESET` and replaced with the default.** A failing key without a default stops Bazarr: `#L537-L555`.
3. It applies a few hard-coded migrations: `series_sync < 15 → 60`, `//` collapsed in the three `base_url` keys, removal of a `podnapisi` section, and others: `#L606-L645`.
4. `write_config()` compares the in-memory settings with a fresh load of the file. If they differ, it writes the **complete** settings dict (every default included, keys lower-cased at the top level) through a `.tmp` file plus `move`: `#L558-L576`, called at `#L648`. Keys Bazarr doesn't know (for example an `easyarr:` section) stay in `as_dict()` and survive the rewrite (inferred from Dynaconf `as_dict()`; not tested). **YAML comments and formatting are lost.**

What this means for "write defaults only if absent, own a few keys":
- A minimal pre-written `config.yaml` is safe. Bazarr fills in every other key on first start and rewrites the file once.
- Init must compare **parsed YAML values** of the owned keys, never file text, because Bazarr reformats the whole file.
- Value types matter: write `port: 6767` (int), `ssl: false` (bool), `http_timeout: 60` (a listed value). Otherwise Bazarr silently resets the value, init sets it again, and the two keep overwriting each other.
- `general.base_url` is read **once at import** into a module-level `base_url` (`BZ/bazarr/app/config.py#L579`). The Flask blueprints and the socket.io path are built from it (`BZ/bazarr/app/server.py#L21-L22`, `BZ/bazarr/app/app.py#L46-L47`). Changing it later needs a restart (`POST /api/system?action=restart`, `BZ/bazarr/api/system/system.py#L11-L29`), so **pre-write it in the file.**
- Env-var override (not tested): Dynaconf 3.2.13's default loader list includes the env loader with prefix `DYNACONF` (`BZ/libs/dynaconf/default_settings.py#L118`, `#L200-L206`). `DYNACONF_GENERAL__BASE_URL=/apps/bazarr` would probably force the value without touching the file. Watch the typing: the env loader parses values TOML-style, so a hex API key like `12e45…` could turn into a number. Use the file instead.

**Recommended minimal `/config/config/config.yaml`** (written by init only if the file doesn't exist; afterwards only the owned keys are checked):
```yaml
general:
  ip: '*'
  port: 6767
  base_url: /apps/bazarr          # owned
  use_sonarr: false               # enabled via the API after the language profile exists (see §3 order)
  use_radarr: false
  enabled_providers: [subtitlecat, yifysubtitles, gestdown, tvsubtitles]   # default only, see §5
auth:
  type: null                      # the dashboard proxy sits behind the Umbrel login
  apikey: <32 hex chars generated by EasyArr>   # owned
sonarr:
  ip: 127.0.0.1
  port: 8989
  base_url: /apps/sonarr          # owned
  ssl: false
  apikey: <sonarr api key>        # owned
radarr:
  ip: 127.0.0.1
  port: 7878
  base_url: /apps/radarr
  ssl: false
  apikey: <radarr api key>
analytics:
  enabled: false
```
Security note: when `auth.type` is `None`, the HTML page injects `apiKey` for every visitor (`BZ/bazarr/app/ui.py#L106-L115`). That is acceptable only because `/apps/bazarr/` is reachable solely through the Umbrel-authenticated dashboard proxy.

### 3. HTTP API

- Blueprint prefix: `<base_url>/api` (`BZ/bazarr/app/server.py#L21`). **With `base_url=/apps/bazarr`, even direct calls on port 6767 must use `/apps/bazarr/api/...`**, for example `http://w1kyu-easyarr_vpn_1:6767/apps/bazarr/api/system/status`.
- Authentication: the key is accepted from the `X-API-KEY` header, the `apikey` query parameter or the `apikey` form field. Anything else gets a 401: `BZ/bazarr/api/utils.py#L100-L115`. The Swagger security scheme uses the header `X-API-KEY`: `BZ/bazarr/api/__init__.py#L35-L43`.
- `GET /api/system/ping`: **no auth**, returns `{"status":"OK"}`. Good readiness probe: `BZ/bazarr/api/system/ping.py#L8-L13`.
- `GET /api/system/status`: authenticated, returns `{"data":{"bazarr_version", "sonarr_version", "radarr_version", ...}}`: `BZ/bazarr/api/system/status.py#L20-L55`.
- `GET /api/system/settings`: returns the full settings dict (minus `flask_secret_key`) plus `notifications.providers`: `BZ/bazarr/api/system/settings.py#L23-L41`, `BZ/bazarr/app/config.py#L651-L667`.
- `POST /api/system/settings`, **form-encoded** (`application/x-www-form-urlencoded`; the web UI does the same: `BZ/frontend/src/apis/raw/base.ts#L11-L51`). Handler: `BZ/bazarr/api/system/settings.py#L43-L128`.
  - `languages-enabled` (repeatable, ISO-639-1 `code2`). When at least one value is sent, **every language is set to disabled first**, then the listed ones are enabled (`#L45-L55`). Send the full list.
  - `languages-profiles` = **one JSON string holding the complete list of profiles**. Existing `profileId`s are updated, new ones inserted, and **profiles missing from the list are deleted** (`#L57-L99`). To keep user changes, always `GET /api/system/languages/profiles` first (`BZ/bazarr/api/system/languages_profiles.py#L12-L20`) and either skip when any profile exists or send the existing list plus your addition.
  - `settings-<section>-<key>=value` (or `settings-<section>-<sub>-<key>`). Values are type-cast: `"true"`/`"false"` become bool, digit strings become int (except `str_keys`), and array keys are repeatable (`BZ/bazarr/app/config.py#L716-L744`, `#L867-L871`). Everything is validated and then written to config.yaml. A validation error returns HTTP 406 and the in-memory settings are reloaded (`BZ/bazarr/app/config.py#L945-L952`, `BZ/bazarr/api/system/settings.py#L121-L128`).
  - Side effects: changing any `use_sonarr` or `sonarr-{ip,port,base_url,ssl,apikey}` key restarts the SignalR client (`BZ/bazarr/app/config.py#L793-L799`, `#L974-L986`). On connect, with `series_sync_on_live` (default true), Bazarr immediately queues a full series sync (`BZ/bazarr/app/signalr_client.py#L149-L154`). Radarr works the same way.
- Language profile item format (DB/API, snake_case; booleans are the **strings** `"True"`/`"False"`; `hi` can also be `"Excluded"`): `BZ/frontend/src/types/api.d.ts#L27-L47`, `BZ/frontend/src/types/basic.d.ts#L4-L6`, `BZ/bazarr/constants.py#L14-L17`. Default values for a new item come from the UI: `BZ/frontend/src/components/forms/ProfileEditForm.tsx#L156-L176`. The UI sends the list via `JSON.stringify` (`BZ/frontend/src/pages/Settings/Languages/table.tsx#L41-L53`). `cutoff` is an item `id`, `65535` (any), or `null`.
- The default profile is applied **only when a series/movie is first inserted** into Bazarr's DB (`BZ/bazarr/sonarr/sync/parser.py#L87-L88`, `BZ/bazarr/sonarr/sync/series.py#L156-L161`). `table_shows.profileId` has a foreign key to `table_languages_profiles` (`BZ/bazarr/app/database.py#L285`, `#L363`), and SQLite foreign keys are turned on (`#L94`). So **the profile must exist before the default points at it, and the default must be set before the first Sonarr/Radarr sync.** Fallback for items that already exist: `POST /api/series` with `seriesid=<id>&profileid=<pid>` (repeatable) and `POST /api/movies` with `radarrid=…&profileid=…` (`BZ/bazarr/api/series/series.py#L193-L203`, `BZ/bazarr/api/movies/movies.py#L158-L168`).

**Recommended wiring order and exact calls** (`B=http://w1kyu-easyarr_vpn_1:6767/apps/bazarr`, `K=<apikey>`):
```bash
# 0. wait until it answers
curl -fsS "$B/api/system/ping"
# 1. only if no profile exists yet (never clobber user profiles)
curl -fsS -H "X-API-KEY: $K" "$B/api/system/languages/profiles"     # -> [] on a fresh install
# 2. enable English and create profile 1 "English"
curl -fsS -H "X-API-KEY: $K" -X POST "$B/api/system/settings" \
  --data-urlencode 'languages-enabled=en' \
  --data-urlencode 'languages-profiles=[{"profileId":1,"name":"English","cutoff":null,"items":[{"id":1,"language":"en","audio_exclude":"False","audio_only_include":"False","hi":"False","forced":"False"}],"mustContain":[],"mustNotContain":[],"originalFormat":false,"tag":null}]'
# 3. make it the default for new series/movies, then switch the integrations on (this triggers the first sync)
curl -fsS -H "X-API-KEY: $K" -X POST "$B/api/system/settings" \
  --data-urlencode 'settings-general-serie_default_enabled=true' \
  --data-urlencode 'settings-general-serie_default_profile=1' \
  --data-urlencode 'settings-general-movie_default_enabled=true' \
  --data-urlencode 'settings-general-movie_default_profile=1' \
  --data-urlencode 'settings-general-use_sonarr=true' \
  --data-urlencode 'settings-general-use_radarr=true'
# -> 204 No Content on success, 406 + message on validation error
```
Multiple languages: `languages-enabled=en&languages-enabled=de`, plus one item per language (`"id":1`, `"id":2`, …). `profileId` is the primary key you choose (`BZ/bazarr/api/system/settings.py#L80-L94`).

### 4. base_url behind a reverse proxy that keeps the prefix; socket.io

- With `base_url=/apps/bazarr`, the UI blueprint is mounted at `/apps/bazarr` and the API at `/apps/bazarr/api` (`BZ/bazarr/app/server.py#L21-L22`). The SPA template gets `baseUrl` with a trailing slash (`BZ/bazarr/app/ui.py#L117-L123`). Unknown paths 302-redirect to `base_url` (`BZ/bazarr/app/app.py#L49-L51`). This matches a proxy that forwards `/apps/bazarr/...` unchanged. Write `/apps/bazarr` (leading slash, no trailing slash). Bazarr only collapses `//` (`BZ/bazarr/app/config.py#L36-L39`, `#L612-L615`) and `rstrip('/')`s (`#L579`).
- Socket.IO path: `<base_url>/api/socket.io`, i.e. `/apps/bazarr/api/socket.io`. It uses **`transports='polling'` and `allow_upgrades=False`**, so long-polling over plain HTTP only. The proxy needs **no WebSocket upgrade** for Bazarr: `BZ/bazarr/app/app.py#L46-L47`.
- Image routes `/images/series/...` and `/images/movies/...` proxy posters from Sonarr/Radarr using `sonarr.base_url` (`BZ/bazarr/app/ui.py#L155-L180`).

### 5. Subtitle providers that need no account

Nothing is enabled by default (`general.enabled_providers: []`, `BZ/bazarr/app/config.py#L142`). `podnapisi` no longer exists: Bazarr deletes its settings section (`#L636-L638`) and has no provider module for it.
Provider list with credential inputs: `BZ/frontend/src/pages/Settings/Providers/list.tsx`.

| Provider key | Account? | Coverage | Source |
|---|---|---|---|
| `subtitlecat` | none (only an option to include machine translations) | multi-language, series and movies | `list.tsx#L657`, `BZ/custom_libs/subliminal_patch/providers/subtitlecat.py#L144-L147` |
| `yifysubtitles` | none | movies only, multi-language | `list.tsx#L795`, `.../yifysubtitles.py#L58-L105` |
| `gestdown` | none ("Proxy for Addic7ed website. No need for login or cookies.") | series only | `list.tsx#L225`, `.../gestdown.py#L94-L100` |
| `tvsubtitles` | none | series only | `list.tsx#L731`, `.../tvsubtitles.py#L30-L35` |
| `animetosho` | none (AniDB client optional) | anime | `list.tsx#L84` |
| `embeddedsubtitles` | none, but only works if `general.use_embedded_subs` is turned off; it extracts tracks that are already in the file (uses the ffmpeg shipped in the LSIO image) | local | `list.tsx#L187-L190` |
| `opensubtitlescom` | **username + password required** (`ConfigurationError` otherwise) | multi | `.../opensubtitlescom.py#L166-L175` |
| `subdl`, `subsource`, `jimaku`, `subx`, `subsro` | API key required | | `list.tsx#L474`, `#L531`, `#L258`, `#L642`, `#L601` |

Suggested beginner default: `[subtitlecat, yifysubtitles, gestdown, tvsubtitles]`, plus a dashboard hint that adding an OpenSubtitles.com account gives the best results. Keep `use_embedded_subs: true` (default) so files that already carry subs aren't searched again. Only `get_providers()` filters on names that actually exist in the registry (`BZ/bazarr/app/get_providers.py#L198-L201`). `tvsubtitles` appears in `PROVIDERS_FORCED_OFF` (`#L143-L144`), but that list is only referenced in commented-out code (`#L216-L219`).

---

## Part B: Recyclarr 8.8.1

### 6. Config location in the container, schema, v8 breaking changes

**Image** (`https://github.com/recyclarr/recyclarr/blob/874cb274f8b419dff6fb211fc326e4f2dd63c4fb/Dockerfile#L32-L48`): `ENV RECYCLARR_CONFIG_DIR=/config CRON_SCHEDULE="@daily" RECYCLARR_CREATE_CONFIG=false`. It installs `bash tzdata supercronic git tini`, runs as `USER 1000:1000`, declares `VOLUME /config` and uses entrypoint `tini -- /entrypoint.sh`.

**Files that are read:** every `*.yml`/`*.yaml` in `/config/configs/` plus `/config/recyclarr.yml` (or `.yaml`; having both is an error): `RC/src/Recyclarr.Core/Config/Parsing/ConfigurationFinder.cs#L10-L28`, `RC/src/Recyclarr.Core/Common/Extensions/FileSystemExtensions.cs#L17-L31`. Other paths under `/config`:
- `state/`: trash_id→service_id ownership state, per instance (`RC/src/Recyclarr.Core/Platform/AppPaths.cs#L17`).
- `includes/`: local include files (`#L19`).
- `resources/` (git clones of TRaSH-Guides and config-templates) and `logs/cli/`. These go under `RECYCLARR_DATA_DIR` when set, otherwise under the config dir (`#L13-L14`, `RC/src/Recyclarr.Core/Platform/DefaultAppDataSetup.cs#L38-L45`).
- `settings.yml`: optional global settings such as `git_path`, `resource_providers` and notifications (`RC/src/Recyclarr.Core/Settings/SettingsLoader.cs#L87`).
- `secrets.yml`: optional, used for `!secret key` (`RC/src/Recyclarr.Core/Config/Secrets/SecretsProvider.cs#L22`, `.../SecretsYamlBehavior.cs#L13`).

Recyclarr needs outbound HTTPS to github.com (git clone) and the `git` binary (`RC/src/Recyclarr.Core/VersionControl/GitRepository.cs#L22`, `RC/src/Recyclarr.Core/Repo/GitPath.cs#L9-L10`).

**Instance schema** (`RC/schemas/config-schema.json#L5-L118`; `sonarr:` and `radarr:` each map *instance-name* → instance with `additionalProperties: false`):

| Key | Notes | Source |
|---|---|---|
| `base_url` | Full URL **including UrlBase**, e.g. `http://localhost:8989/apps/sonarr`. A trailing slash is trimmed (`RC/src/Recyclarr.Core/Config/Parsing/ConfigYamlExtensions.cs#L249-L254`; there was a 401 bug with trailing slashes before 8.5.1, `RC/CHANGELOG.md#L113`). The HttpClient sends `X-Api-Key` and calls `/api/v3/...` under that base (`RC/src/Recyclarr.Core/Http/RefitClientExtensions.cs#L33-L34`). The schema examples include sub-path URLs (`config-schema.json#L39-L43`, `#L82-L86`). | `#L24-L27` |
| `api_key` | string, minLength 1 (plain text, `!secret`, or `!env_var`) | `#L45-L49`, `#L88-L92` |
| `quality_definition` | `{type: series\|anime (Sonarr) / movie\|anime\|sqp-streaming\|sqp-uhd (Radarr), preferred_ratio: 0–1, qualities: [{name,min,max,preferred}]}` | `RC/schemas/config/quality-definition.json#L1-L53`, type names in `TG/docs/json/sonarr/quality-size/series.json#L3`, `TG/docs/json/radarr/quality-size/movie.json#L3` |
| `quality_profiles[]` | `trash_id` (guide-backed) and/or `name`; `reset_unmatched_scores {enabled, except[], except_patterns[]}`; `score_set`; `upgrade {allowed, until_quality, until_score}`; `min_format_score`; `min_upgrade_format_score`; `quality_sort`; `qualities[] {name, enabled, qualities[]}`; per-profile `quality_definition` (Sonarr v5 only) | `RC/schemas/config/quality-profiles.json#L1-L107` |
| `custom_formats[]` | `{trash_ids[], score?, assign_scores_to[] {trash_id\|name, score?}}` | `RC/schemas/config/custom-formats.json#L1-L37` |
| `custom_format_groups` | `{skip: [group trash_id], add: [{trash_id, assign_scores_to?, select_all?, select[]?, exclude[]?}]}`; groups marked `default: true` sync automatically for guide-backed profiles | `RC/schemas/config/custom-format-groups.json#L1-L60` |
| `delete_old_custom_formats` | default `false`; deletes only CFs Recyclarr owns that you removed from config | `config-schema.json#L28-L32` |
| `include[]` | `{config: <path>}` (relative to **`/config/includes/`**, see doubts) or `{template: <id>}` | `RC/schemas/config/includes.json#L1-L30`, `RC/src/Recyclarr.Core/Config/Parsing/PostProcessing/ConfigMerging/ConfigIncludeProcessor.cs#L31-L46` |
| `media_naming` | Sonarr: `season`, `series`, `episodes{rename,standard,daily,anime}`; Radarr: `folder`, `movie{rename,standard}` | `RC/schemas/config/media-naming-sonarr.json`, `media-naming-radarr.json` |
| `media_management` | `propers_and_repacks: prefer_and_upgrade\|do_not_upgrade\|do_not_prefer` | `RC/schemas/config/media-management.json#L6-L10` |
| ~~`replace_existing_custom_formats`~~ | **Removed in v8.** Since 8.2.1 it produces a deprecation warning instead of blocking sync. Matching existing CFs/QPs by name is now automatic ("adopt") | `RC/CHANGELOG.md#L314-L315`, `#L198-L199`, `#L145-L146` |

**v7 → v8 breaking changes that matter here** (`RC/CHANGELOG.md#L260-L327`):
- `replace_existing_custom_formats` is gone. The deprecated `quality_profiles` list *under `custom_formats`* is gone; use `assign_scores_to` (`#L314-L317`).
- Include files in `configs/` are no longer allowed; move them to `includes/` (`#L318-L319`).
- `repositories` was replaced by `resource_providers` (`#L320-L321`). `--app-data` and `RECYCLARR_APP_DATA` were replaced by `RECYCLARR_CONFIG_DIR` (`#L324-L327`).
- New: guide-backed `quality_profiles[].trash_id`, which pulls qualities, CFs, scores and language from the guide; `custom_format_groups`; `media_management`; `RECYCLARR_DATA_DIR` (`#L269-L295`).
- 8.4.0: existing same-name CFs/QPs are adopted automatically; `state repair` is deprecated. Docker `latest` is no longer published, so pin `8.8.1` or `8` (`#L143-L153`).
- 8.6.0: cron mode prints log lines instead of the TUI (`#L95`). 8.8.0: Sonarr v5 support with per-profile sizes (`#L25-L32`).
- **`include: template:` no longer resolves anything official.** Template includes only resolve against an `includes.json` registry (`RC/src/Recyclarr.Core/Config/Parsing/PostProcessing/ConfigMerging/TemplateIncludeProcessor.cs#L19-L27`, `RC/src/Recyclarr.Core/ResourceProviders/Infrastructure/ConfigTemplatesStrategy.cs#L49-L60`). config-templates emptied that registry on 2026-02-08 (commit `b307b8cbad56728dbacbdf0d1b3746c5d546c508`) and deleted it on 2026-08-07 (commit `9faf65ff745d74ab906fd73cadaa25f08eb9d981`). **v7-style configs with `include: - template: sonarr-quality-definition-series` and similar now fail with "Unable to find include template".** EasyArr must write self-contained instance configs (below).

### 7. Official config templates (config-templates @ `89eebad`)

Branch resolution: Recyclarr tries `v8`, then `master`, then `main` (`RC/src/Recyclarr.Core/ResourceProviders/Infrastructure/ConfigTemplatesStrategy.cs#L15-L16`). config-templates has no `v8` branch (checked with `git ls-remote`), so `master` is used. TRaSH-Guides is cloned from `master`/`main` (`RC/src/Recyclarr.Core/ResourceProviders/Infrastructure/TrashGuidesStrategy.cs#L15`), **i.e. unpinned**. You can pin it with `settings.yml` → `resource_providers[{name,type:trash-guides,clone_url,reference,replace_default:true}]` (`RC/schemas/settings/resource-providers.json#L24-L60`).

Templates are listed in `CT/templates.json#L1-L234`. They are used only via `recyclarr config create -t <id>` (copied locally, `RC/src/Recyclarr.Cli/Processors/Config/LocalConfigCreator.cs#L26`). **There are no include templates any more.** Each template is now a self-contained guide-backed profile (`quality_profiles: - trash_id`) plus commented CF-group toggles.

| Service | Template ids (non-language-specific) | Guide profile trash_id |
|---|---|---|
| Sonarr | `web-1080p` (`CT/sonarr/templates/web-1080p.yml#L13-L19`) | `72dae194fc92bf828f32cde7744e51a1` WEB-1080p |
| Sonarr | `web-1080p-alternative` | `9d142234e45d6143785ac55f5a9e8dc9` |
| Sonarr | `web-2160p` (`CT/sonarr/templates/web-2160p.yml#L13-L19`) | `d1498e7d189fbe6c7110ceaabb7473e6` |
| Sonarr | `web-2160p-combined` (2160p, falls back to 1080p) | `c4cadd6b35b95f62c3d47a408e53e2f7` (`TG/docs/json/sonarr/quality-profiles/web-2160p-combined.json#L2-L3`) |
| Sonarr | `web-2160p-alternative` | `dfa5eaae7894077ad6449169b6eb03e0` |
| Sonarr | `sonarr-remux-web-1080p`, `sonarr-remux-web-2160p`, `sonarr-remux-2160p-combined`, `sonarr-remux-2160p-alternative` | `fe9470e5…`, `76a5053b…`, `911df0e0…`, `361717d5…` |
| Sonarr | `sonarr-anime-remux-1080p` | `20e0fc95…` |
| Radarr | `hd-bluray-web` (`CT/radarr/templates/hd-bluray-web.yml#L13-L19`) | `d1d67249d3890e49bc12e275d989a7e9` HD Bluray + WEB |
| Radarr | `uhd-bluray-web` (`CT/radarr/templates/uhd-bluray-web.yml#L14-L20`) | `64fb5f9858489bdac2af690e27c8f42f` (2160p only, **no 1080p fallback**) |
| Radarr | `radarr-remux-web-1080p`, `radarr-remux-web-2160p`, `radarr-remux-2160p-combined`, `radarr-remux-2160p-alternative` | `9ca12ea8…`, `fd161a61…`, `d1d31067…`, `dd3cd75d…` |
| Radarr | `radarr-anime-remux-1080p`; `sqp-1-1080p` … `sqp-5` (advanced SQP) | |
| (no template; guide profile only) | Radarr `WEB 1080p` | `e8c5acb741363a0dbda67d3978f4912f` (`TG/docs/json/radarr/quality-profiles/web-1080p.json#L2-L3`) |
| (no template; guide profile only) | Radarr `WEBDL 2160p (Combined)` | `05fbf054ac8ad0303335026cc2632f1a` (`TG/docs/json/radarr/quality-profiles/web-2160p-combined.json#L2-L3`) |

French, German and other language variants also exist (`french-*`, `sonarr-german-*`, `radarr-german-*`).

**Recommended EasyArr preset mapping (beginner-safe).** All presets stay WEB-centric, avoid Remux (25–80 GB per movie), and always keep a 1080p fallback so items never stay "missing" just because no 4K release exists.

| Preset | Sonarr profile | Radarr profile | quality_definition |
|---|---|---|---|
| **Best quality** | WEB-2160p (Combined) `c4cadd6b…` (2160p, else 1080p WEB) | WEBDL 2160p (Combined) `05fbf054…` (2160p, else 1080p/720p WEB) | guide default |
| **Balanced** (default) | WEB-1080p `72dae194…` (TRaSH's standard choice) | HD Bluray + WEB `d1d67249…` (Bluray-1080p / WEB 1080p / Bluray-720p) | guide default |
| **Save space** | WEB-1080p `72dae194…` | WEB 1080p `e8c5acb7…` (WEB only; Bluray encodes are bigger) | `preferred_ratio: 0.25` (preferred size = min + 0.25·(max−min), `RC/src/Recyclarr.Cli/Pipelines/QualitySize/QualitySizeCalculator.cs#L22-L25`) |

Optional stronger "Save space": allow x265 at HD by excluding `x265 (HD)` from the default-on Golden Rule HD group:
- Sonarr: group `158188097a58d7687dee647e04af0da3`, CF `47435ece6b99a0b477caf360e79ba0bb` (`TG/docs/json/sonarr/cf-groups/optional-golden-rule-hd.json#L3-L11`).
- Radarr: group `f8bf8eab4617f12dfdbd16303d8da245`, CF `dc98083864ea246d05a42df0d05f81cc` (`TG/docs/json/radarr/cf-groups/optional-golden-rule-hd.json#L3-L11`).

TRaSH deliberately blocks HD x265 (often lossy re-encodes, and older TVs may need transcoding), so this is left out of the default.

Profile naming: give each profile an explicit EasyArr `name`. A guide-backed profile is stored by the key `(trash_id, name)`, and a single name match in Sonarr is **adopted and overwritten** (`RC/docs/architecture/trash-id-state-system.md#L96-L99`). So never use a name a user might already have, such as plain "WEB-1080p".

Drop-in YAML. Write one file per service into `/config/configs/`, or both into `/config/recyclarr.yml`. Replace the placeholders. `!secret` keys would go into `/config/secrets.yml`.

*Balanced* (default):
```yaml
# yaml-language-server: $schema=https://schemas.recyclarr.dev/v8/config-schema.json
sonarr:
  easyarr-sonarr:
    base_url: http://localhost:8989/apps/sonarr
    api_key: <SONARR_API_KEY>
    delete_old_custom_formats: false
    quality_definition:
      type: series
    quality_profiles:
      - trash_id: 72dae194fc92bf828f32cde7744e51a1   # WEB-1080p
        name: EasyArr (Balanced)
        reset_unmatched_scores:
          enabled: true

radarr:
  easyarr-radarr:
    base_url: http://localhost:7878/apps/radarr
    api_key: <RADARR_API_KEY>
    delete_old_custom_formats: false
    quality_definition:
      type: movie
    quality_profiles:
      - trash_id: d1d67249d3890e49bc12e275d989a7e9   # HD Bluray + WEB
        name: EasyArr (Balanced)
        reset_unmatched_scores:
          enabled: true
```

*Best quality*:
```yaml
sonarr:
  easyarr-sonarr:
    base_url: http://localhost:8989/apps/sonarr
    api_key: <SONARR_API_KEY>
    delete_old_custom_formats: false
    quality_definition:
      type: series
    quality_profiles:
      - trash_id: c4cadd6b35b95f62c3d47a408e53e2f7   # WEB-2160p (Combined)
        name: EasyArr (Best quality)
        reset_unmatched_scores:
          enabled: true

radarr:
  easyarr-radarr:
    base_url: http://localhost:7878/apps/radarr
    api_key: <RADARR_API_KEY>
    delete_old_custom_formats: false
    quality_definition:
      type: movie
    quality_profiles:
      - trash_id: 05fbf054ac8ad0303335026cc2632f1a   # WEBDL 2160p (Combined)
        name: EasyArr (Best quality)
        reset_unmatched_scores:
          enabled: true
```

*Save space*:
```yaml
sonarr:
  easyarr-sonarr:
    base_url: http://localhost:8989/apps/sonarr
    api_key: <SONARR_API_KEY>
    delete_old_custom_formats: false
    quality_definition:
      type: series
      preferred_ratio: 0.25
    quality_profiles:
      - trash_id: 72dae194fc92bf828f32cde7744e51a1   # WEB-1080p
        name: EasyArr (Save space)
        reset_unmatched_scores:
          enabled: true
    # optional: allow x265 at 1080p (smaller files, may need transcoding)
    # custom_format_groups:
    #   add:
    #     - trash_id: 158188097a58d7687dee647e04af0da3   # [Optional] Golden Rule HD
    #       exclude:
    #         - 47435ece6b99a0b477caf360e79ba0bb         # x265 (HD)

radarr:
  easyarr-radarr:
    base_url: http://localhost:7878/apps/radarr
    api_key: <RADARR_API_KEY>
    delete_old_custom_formats: false
    quality_definition:
      type: movie
      preferred_ratio: 0.25
    quality_profiles:
      - trash_id: e8c5acb741363a0dbda67d3978f4912f   # WEB 1080p
        name: EasyArr (Save space)
        reset_unmatched_scores:
          enabled: true
    # custom_format_groups:
    #   add:
    #     - trash_id: f8bf8eab4617f12dfdbd16303d8da245   # [Optional] Golden Rule HD
    #       exclude:
    #         - dc98083864ea246d05a42df0d05f81cc         # x265 (HD)
```
Notes:
- `localhost` works because everything shares one network namespace. Use the same instance names in every preset so state and `-i` stay stable.
- Default-on CF groups (Unwanted Formats, Golden Rule, Streaming Services General, and so on) sync automatically for guide-backed profiles even though they aren't listed (`RC/CHANGELOG.md#L274-L277`, template comments in `CT/sonarr/templates/web-1080p.yml#L21-L35`).
- Recyclarr creates profiles but **doesn't assign them to series/movies**, and doesn't set the root folder or import-list default. The wiring engine must do that through the Sonarr/Radarr API after the first sync. Quality profiles are never deleted, so switching presets leaves the old "EasyArr (…)" profile behind (`RC/docs/architecture/quality-profile-pipeline.md#L42-L46`).

### 8. Docker run modes, triggering a sync on demand, standalone binary

- Entrypoint (`RC/docker/scripts/entrypoint.sh#L4-L17`):
  - If `RECYCLARR_CREATE_CONFIG=true` and `/config/recyclarr.yml` is missing, it runs `recyclarr config create` (a sample config).
  - **If the container gets arguments, it runs `exec recyclarr "$@"` once and exits.** Example: `command: ["sync"]` syncs once at start.
  - Otherwise it writes `"$CRON_SCHEDULE /cron.sh"` to `/tmp/crontab` and execs `supercronic`.
  - `cron.sh` runs `recyclarr sync --log [$RECYCLARR_LOG_LEVEL]` (`RC/docker/scripts/cron.sh#L7-L8`).
  - Default schedule `@daily` (`RC/Dockerfile#L34`). **No sync happens at container start in cron mode, and there is no built-in file or HTTP trigger.**
- CLI: `recyclarr sync [sonarr|radarr] [-c file…] [-i instance…] [-p/--preview]` (`RC/src/Recyclarr.Cli/Console/Commands/SyncCommand.cs#L26-L50`). Exit code 0 = success, 1 = failure (`RC/src/Recyclarr.Cli/Processors/ExitStatus.cs#L3-L7`, `SyncCommand.cs#L66`).
- Standalone binary: release assets for `linux-x64`/`linux-arm64`/`linux-arm` are **self-contained single files** (glibc) (`RC/.github/workflows/build.yml#L59-L68`, `RC/ci/Publish.ps1#L25-L35`). The **`linux-musl-*` builds are published with `-NoSingleFile`, i.e. `--self-contained=false`**, so they need a .NET 10 runtime installed (`RC/.github/workflows/build.yml#L84-L95`). EasyArr's dashboard is `node:…-alpine` (musl), so embedding Recyclarr would need .NET 10 runtime + git (+ ICU or invariant globalisation), or glibc compat. Not worth it. License: MIT (`RC/LICENSE#L1`, image label `RC/Dockerfile#L27`).
- **Least-bad option (recommended): keep the official image and override the entrypoint with a small runner loop.** It syncs at start, then whenever the dashboard drops a trigger file into the shared `/config` volume, plus a daily safety net. Everything uses tools already in the image (bash, tini, recyclarr):
  ```yaml
  recyclarr:
    image: ghcr.io/recyclarr/recyclarr:8.8.1@sha256:<digest>
    user: "1000:1000"
    network_mode: service:vpn          # whatever EasyArr already uses for the shared namespace
    volumes: ["${APP_DATA_DIR}/data/recyclarr:/config"]
    entrypoint: ["/sbin/tini", "--", "bash", "-c"]
    command:
      - |
        trap 'exit 0' TERM INT
        mkdir -p /config/.easyarr
        run() { recyclarr sync --log info > /config/.easyarr/last-sync.log 2>&1; echo "{\"exit\":$?,\"at\":\"$(date -Iseconds)\"}" > /config/.easyarr/last-sync.json; }
        [ -f /config/recyclarr.yml ] && run
        last=$(date +%s)
        while :; do
          if [ -f /config/.easyarr/sync-request ] || [ $(( $(date +%s) - last )) -ge 86400 ]; then
            rm -f /config/.easyarr/sync-request; run; last=$(date +%s)
          fi
          sleep 5 & wait $!
        done
  ```
  The dashboard writes `.easyarr/sync-request` and polls `last-sync.json` / `last-sync.log`. `sleep & wait` keeps SIGTERM responsive. If you would rather not run periodic syncs (see §9), drop the 86400 branch and sync only on preset changes.
  The alternative without an entrypoint override is `CRON_SCHEDULE="*/5 * * * *"`. That runs a full sync including a git fetch every 5 minutes: wasteful, and it reverts user edits within 5 minutes.

### 9. What Recyclarr does to user changes

- "Config is authoritative": anything referenced in the YAML is owned by Recyclarr. That covers explicit CFs, the profile `formatItems` of guide-backed QPs, and default CF groups. Each sync updates owned resources by stored ID. A same-named resource that isn't in the state yet is **adopted with a warning and overwritten**: `RC/docs/architecture/trash-id-state-system.md#L67-L103`, `#L129-L140`; `RC/docs/architecture/custom-format-pipeline.md#L46-L48`; `RC/CHANGELOG.md#L145-L146`.
- Quality profiles: the precedence is Service < Guide < Config (`RC/docs/architecture/quality-profile-pipeline.md#L17-L25`). On every sync the managed profile's qualities, ordering, cutoff, upgrade-allowed flag, min/cutoff/upgrade format scores, CF scores (and language on Radarr) are reset to guide/config values. **Edits a user makes in Sonarr/Radarr to a managed profile are reverted on the next sync.** `reset_unmatched_scores.enabled: true` additionally zeroes scores of CFs not in the config (`RC/schemas/config/quality-profiles.json#L22-L46`). Use `except` / `except_patterns` to protect named CFs.
- Untouched:
  - Profiles not listed in the config.
  - CFs not referenced (state scope: `trash-id-state-system.md#L37-L58`).
  - Media naming and media management, unless configured (8.8.0 fixed media management resetting unmanaged settings: `RC/CHANGELOG.md#L38`).
  - CF deletion only happens with `delete_old_custom_formats: true` (`RC/docs/architecture/custom-format-pipeline.md#L16-L25`).
  - QPs are never deleted (`quality-profile-pipeline.md#L42-L46`).
- `quality_definition` overwrites the **global** quality size table on Sonarr v4 / Radarr every sync, which also affects user-created profiles. On Sonarr v5 it applies only to the listed profiles (`RC/CHANGELOG.md#L31-L32`).
- How to honour "never overwrite user changes":
  1. Use distinct `EasyArr (…)` profile names, never user names.
  2. Sync only when the user applies or changes a preset, or presses "re-apply" (trigger file, §8). Avoid frequent cron. If you keep a daily sync, state clearly in the UI that "EasyArr (…)" profiles are managed and that users should clone a profile to customise it.
  3. Keep `delete_old_custom_formats: false`.
  4. Leave `media_naming` / `media_management` out unless EasyArr explicitly owns them.
  5. Optionally omit `quality_definition` if users' global size tweaks must survive (you lose the TRaSH sizes).

---

## Doubts / unconfirmed
1. **Recyclarr `include: config:` relative paths.** The schema text says relative paths resolve from the `configs` dir (`RC/schemas/config/includes.json#L11`), but the code resolves them under `includes/` (`ConfigIncludeProcessor.cs#L39`, CHANGELOG `#L318-L319`). I trust the code. Not tested.
2. **Switching presets.** Different trash_id + different name creates a new profile and leaves the old one (no delete), which is safe. Reusing one fixed name across trash_ids would adopt and re-point the existing profile, but the state then holds two trash_ids for one service_id ("detected and cleaned up", `trash-id-state-system.md#L142-L161`). Not tested; distinct names per preset is the safer recommendation.
3. **Guide churn.** The TRaSH guide profile trash_ids and WEB 2160p/1080p "Combined" profiles were checked at TRaSH `master` @ `d24f13ce` (2026-10-28). Recyclarr pulls TRaSH `master` at runtime (unpinned), so profiles can change over time. The Radarr `WEBDL 2160p (Combined)` and `WEB 1080p` profiles have no official config template; they are guide-only profiles (valid for `trash_id`, but less "blessed").
4. **The `preferred_ratio: 0.25` value** for Save space is my judgment, not a TRaSH recommendation. So is excluding x265 (HD) as the optional variant.
5. **Bazarr preserving unknown top-level keys on rewrite** is inferred from Dynaconf `as_dict()` + `write(merge=False)`. Not run. Same for the `DYNACONF_*` env override path (§2), which is untested and has typing risks.
6. **Bazarr `use_sonarr: true` from the very first start + default profile.** Pre-writing `serie_default_profile: 1` before profile 1 exists would hit the FK constraint on series insert (`database.py#L285`, `PRAGMA foreign_keys=ON` `#L94`). That is inferred, not run. The recommended order (connections off → create profile → set default → enable) avoids it.
7. **`languages-profiles` payload** (`originalFormat: false`, `tag: null`, `mustContain: []`) is derived from the handler and frontend types. Not executed against a live 1.6.2. Verify once in the stack e2e (GET after POST).
8. **linuxserver tag.** I read `v1.6.2-ls367`. Newer `-ls368…370` tags exist; their s6 run scripts are assumed identical (not diffed).
9. **Bazarr `analytics.enabled` default `True`.** I didn't check what the analytics actually send; I recommend `false` in any case.
10. **Recyclarr `latest` tag** is no longer published (8.4.0). Pin `8.8.1` with a digest, as already planned.
