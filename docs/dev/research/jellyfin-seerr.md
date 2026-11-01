# Jellyfin 12.4 (linuxserver `version-12.4ubu2604`) + Seerr v3.5.1: headless setup reference

Research for the EasyArr wiring engine. Research only; nothing here was run against a live server.
Every fact links to a commit-pinned upstream line. Unconfirmed items are under **Doubts** at the end.

Pinned sources (shallow clones in `/opt/data/cache/scratch/`):

| Repo | Ref | Commit | Short name below |
|---|---|---|---|
| linuxserver/docker-jellyfin | tag `12.4ubu2604-ls57` | `5eb249fff32d0f67027d3fbdf2088c7592002431` | **LS** |
| jellyfin/jellyfin | tag `v12.4` | `83d0d0e7f76e23e2e085c8ff67d28b772d35967d` | **JF** |
| jellyfin/jellyfin-ffmpeg | tag `v8.1.3-1` | `253db2a7b0a8045c54ce68ce33d7f601229b1822` | **FF** |
| jellyfin/jellyfin.org (docs) | `master` HEAD | `3af5cf0d5ce40b9f17f31b4eedaab0d5ae91a05b` | **DOC** |
| seerr-team/seerr | tag `v3.5.1` | `564bfb08b54caa374bddaf820abfd226e5e69151` | **SR** |

URL prefixes:
- JF = `https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/`
- LS = `https://github.com/linuxserver/docker-jellyfin/blob/5eb249fff32d0f67027d3fbdf2088c7592002431/`
- SR = `https://github.com/seerr-team/seerr/blob/564bfb08b54caa374bddaf820abfd226e5e69151/`

---

## 0. Which Jellyfin is in `lscr.io/linuxserver/jellyfin:version-12.4ubu2604`?

**Jellyfin server 12.4.0** (Jellyfin moved from 10.x to 12.x numbering. The upstream tags are `v12.0` … `v12.4`, and `v12.4` points at `83d0d0e7…`).

- Docker Hub, checked 2026-10-31: `version-12.4ubu2604`, `12.4ubu2604-ls57` and `latest` all have the digest `sha256:3894d9eae88418d3cf9ac6349392d2c4dad818365a59565d19edc38098897044`. The GitHub release `12.4ubu2604-ls57` was published 2026-10-27. `version-12.4ubu2604` is a floating tag: a later `-ls58` rebuild would move it.
- The image installs the `jellyfin=${JELLYFIN_RELEASE}` deb from repo.jellyfin.org (ubuntu `resolute`): https://github.com/linuxserver/docker-jellyfin/blob/5eb249fff32d0f67027d3fbdf2088c7592002431/Dockerfile#L20-L33
- Package manifest for that build: `jellyfin 12.4+ubu2604`, `jellyfin-server 12.4+ubu2604`, `jellyfin-web 12.4+ubu2604`, `jellyfin-ffmpeg8 8.1.3-1-resolute`: https://github.com/linuxserver/docker-jellyfin/blob/5eb249fff32d0f67027d3fbdf2088c7592002431/package_versions.txt#L157-L161
- Upstream assembly version `12.4.0`, which matches the `12.4.0.0` plugin versions in the logs: https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/SharedVersion.cs#L3-L4
- LSIO runtime layout: config dir `/config`, data `/config/data`, ffmpeg `/usr/lib/jellyfin-ffmpeg/ffmpeg`, process runs as user `abc`: https://github.com/linuxserver/docker-jellyfin/blob/5eb249fff32d0f67027d3fbdf2088c7592002431/root/etc/s6-overlay/s6-rc.d/svc-jellyfin/run#L4-L19

---

# JELLYFIN 12.4

### Common conventions (read first)
- **JSON casing.** MVC responses are **PascalCase** (`PropertyNamingPolicy = null`), and null properties are omitted: https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/Jellyfin.Server/Extensions/ApiServiceCollectionExtensions.cs#L137-L155 and https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/src/Jellyfin.Extensions/Json/JsonDefaults.cs#L29-L53
  - **Send PascalCase bodies everywhere.** The named-config endpoint (`POST /System/Configuration/{key}`) deserializes with `JsonDefaults.Options`, which does not set case-insensitivity, so camelCase keys there would be silently ignored: https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/Jellyfin.Api/Controllers/ConfigurationController.cs#L29 and #L92-L106 of the same file.
- **Exception → HTTP status:** `ArgumentException`→400, `AuthenticationException`→401, `SecurityException`→403, `FileNotFoundException`→404: https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/Jellyfin.Api/Middleware/ExceptionMiddleware.cs#L127-L131
- **Auth header format.** Use `Authorization: MediaBrowser Client="EasyArr", Device="EasyArr", DeviceId="<stable id>", Version="<x>"`, and append `, Token="<token>"` once you have one.
  - The scheme must be `MediaBrowser`. `Emby`, the `X-Emby-Authorization` header and the `X-Emby-Token` / `X-MediaBrowser-Token` / `?api_key=` token forms only work if `EnableLegacyAuthorization` is true. It defaults to false.
  - `?ApiKey=<token>` works without legacy mode.
  - Sources: https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/Jellyfin.Server.Implementations/Security/AuthorizationContext.cs#L86-L110 , #L229-L260 of the same file, and https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/MediaBrowser.Model/Configuration/ServerConfiguration.cs#L287-L290
  - Values are URL-decoded and may be quoted: same file `GetParts`, #L276-L310.
  - Upstream test example: `MediaBrowser Client="Jellyfin.Server%20Integration%20Tests", DeviceId="69420", Device="Apple%20II", Version="10.8.0"`: https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/tests/Jellyfin.Server.Integration.Tests/AuthHelper.cs#L20 and token append at #L73-L76.
- **API keys are admins.** A request authenticated with an API key gets the `Administrator` role: https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/Jellyfin.Api/Auth/CustomAuthenticationHandler.cs#L53-L58
- **`RequiresElevation` policy** means an Administrator role claim: https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/Jellyfin.Server/Extensions/ApiServiceCollectionExtensions.cs#L86-L89

## 1. Readiness and "is the wizard complete?"

Jellyfin 12.4 boots in two phases.

**Phase A: temporary SetupServer (migrations/startup)**
- `/health` returns the health result: **Degraded** while starting, **Unhealthy** if startup failed: https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/Jellyfin.Server/ServerSetupApp/SetupServer.cs#L135 and #L276-L294
- `/System/Info/Public` answers with **`StartupWizardCompleted: false` hard-coded**, even on an already set-up server, or 503 with `Retry-After` if the host isn't built yet: same file #L160-L190.
- Every other path returns **503** `text/html` with `Retry-After: 005`: same file #L98 and #L194-L215.

**Phase B: real server, before core startup finishes**
- `ServerStartupMessageMiddleware` returns **503** for everything except `/system/ping` until `CoreStartupHasCompleted`: https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/Jellyfin.Api/Middleware/ServerStartupMessageMiddleware.cs#L33-L49
- The middleware is registered before the endpoints, so it covers `/health` too: https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/Jellyfin.Server/Startup.cs#L240-L257
- The real `/health` checks the DB context: same file #L128-L129.

**Recommended readiness probe**
1. Poll `GET http://w1kyu-easyarr_jellyfin_1:8096/health` until **HTTP 200 and body `Healthy`**.
   - A 200 with body `Degraded` is the SetupServer, so keep waiting.
   - Don't use `/System/Ping` for readiness: it skips the 503 gate (`Ping` returns the server name, https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/Jellyfin.Api/Controllers/SystemController.cs#L102-L106).
2. Then `GET /System/Info/Public` (anonymous) returns `PublicSystemInfo`:
   ```json
   {"LocalAddress":"http://172.x.x.x:8096","ServerName":"…","Version":"12.4.0","ProductName":"Jellyfin Server","OperatingSystem":"","Id":"<32 hex>","StartupWizardCompleted":false}
   ```
   - Controller: https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/Jellyfin.Api/Controllers/SystemController.cs#L92-L95
   - Implementation: https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/Emby.Server.Implementations/SystemManager.cs#L112-L123
   - Model: https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/MediaBrowser.Model/System/PublicSystemInfo.cs#L14-L53
   - Persisted flag `IsStartupWizardCompleted` (in `/config/system.xml`): https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/MediaBrowser.Model/Configuration/BaseApplicationConfiguration.cs#L31

## 2. Startup wizard via API

Auth: `StartupController` uses `[Authorize(Policy = FirstTimeSetupOrElevated)]`: https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/Jellyfin.Api/Controllers/StartupController.cs#L18
- The handler succeeds for **anyone, including anonymous callers, while `IsStartupWizardCompleted == false`**. After that it requires an admin: https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/Jellyfin.Api/Auth/FirstTimeSetupPolicy/FirstTimeSetupHandler.cs#L26-L54
- `DefaultAuthorizationHandler` skips anonymous requests ("only happens during the wizard"): https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/Jellyfin.Api/Auth/DefaultAuthorizationPolicy/DefaultAuthorizationHandler.cs#L44-L49
- After completion, an anonymous `GET /Startup/User` returns **401** (upstream test): https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/tests/Jellyfin.Server.Integration.Tests/Controllers/StartupControllerTests.cs#L106-L114
- **Security note:** until `/Startup/Complete`, anyone who can reach 8096 (host port 39096) can run the wizard. Run it immediately after first boot.

| # | Request | Body (PascalCase) | Response |
|---|---|---|---|
| 1 | `POST /Startup/Configuration` (optional, `[Obsolete]`) | `{"ServerName":"EasyArr","UICulture":"en-US","MetadataCountryCode":"US","PreferredMetadataLanguage":"en"}`. Every field is nullable, and **null becomes `""`** (it overwrites all four) | 204 |
| 1b | `GET /Startup/Configuration` | – | `{"ServerName","UICulture","MetadataCountryCode","PreferredMetadataLanguage"}` |
| 2 | **`GET /Startup/User`** (alias `GET /Startup/FirstUser`) | – | `{"Name":"abc"}` (Password omitted) |
| 3 | `POST /Startup/User` | `{"Name":"<wizard username>","Password":"<wizard password>"}` | 204 / 404 / **403** / 400 |
| 4 | `POST /Startup/RemoteAccess` (optional, `[Obsolete]`) | `{"EnableRemoteAccess":true}` (required bool) | 204 |
| 5 | `POST /Startup/Complete` | empty | 204 |

Sources: controller https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/Jellyfin.Api/Controllers/StartupController.cs#L40-L168
- DTOs: https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/Jellyfin.Api/Models/StartupDtos/StartupConfigurationDto.cs#L11-L26
- https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/Jellyfin.Api/Models/StartupDtos/StartupUserDto.cs#L11-L16
- https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/Jellyfin.Api/Models/StartupDtos/StartupRemoteAccessDto.cs#L13-L14

Gotchas, in order:
- **`GET /Startup/User` creates the first user.** It calls `UserManager.InitializeAsync()`, which creates an admin user with no password when the DB has no users (`StartupController.cs#L113-L122`).
  - The default name is `Environment.UserName`, which is **`abc`** under LSIO's `s6-setuidgid abc`. It falls back to `MyJellyfinUser`.
  - Source: https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/Jellyfin.Server.Implementations/Users/UserManager.cs#L745-L772
  - `InitializeAsync` has **no other caller** in the server, so on a fresh DB **`POST /Startup/User` without a prior GET returns 404** (`StartupController.cs#L137-L141`).
- **`POST /Startup/User` works once.** It returns **403 (`Forbid`) if the first user already has a password** (`#L143-L146`). Idempotency check: if wizard incomplete and POST returns 403, the user was already set. Verify with `AuthenticateByName` instead of retrying.
- **Empty or whitespace password returns 400** (`#L148-L151`). EasyArr's wizard must require a non-empty password.
- **Rename validation.** The rename goes through `ThrowIfInvalidUsername` (400 on failure).
  - Regex `^(?!\s)[\w\ \-'._@+]+(?<!\s)$`, not `.` or `..`: https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/Jellyfin.Server.Implementations/Users/UserManager.cs#L119-L120 and #L963-L971
  - EasyArr's username validation should be at least this strict.
  - The rename is skipped if the name only differs in case from the current one (`StartupController.cs#L156-L159`).
- **`/Startup/RemoteAccess` has only `EnableRemoteAccess`.** There is no `EnableAutomaticPortMapping` in 12.4 (DTO above). It is saved into `network.xml` (`StartupController.cs#L96-L102`).
  - The default is already `true`: https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/MediaBrowser.Common/Net/NetworkConfiguration.cs#L129
  - If set `false`, non-LAN IPs are rejected: https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/src/Jellyfin.Networking/Manager/NetworkManager.cs#L731-L743
  - **Recommendation:** leave it `true` or skip the call. Clients reaching the published port may appear with non-LAN source IPs depending on the Docker NAT/proxy.
- `/Startup/Configuration` and `/Startup/RemoteAccess` are `[Obsolete("Use configuration endpoints")]` but still present. Optional.
- **Libraries may be added before `/Startup/Complete`.** `LibraryStructureController` uses the same `FirstTimeSetupOrElevated` policy (§4). The official web wizard adds libraries between the user and remote-access steps. After completion they need an admin token or API key.
- The upstream integration test helper does exactly: `GET /Startup/User` → `POST /Startup/Complete` → `POST /Users/AuthenticateByName`: https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/tests/Jellyfin.Server.Integration.Tests/AuthHelper.cs#L22-L47

**Recommended EasyArr sequence (fresh Jellyfin)**
1. Wait for readiness (§1). If `StartupWizardCompleted == true`, skip to step 6.
2. `POST /Startup/Configuration` (optional).
3. `GET /Startup/User`.
4. `POST /Startup/User {Name, Password}`.
5. `POST /Startup/RemoteAccess {"EnableRemoteAccess":true}` (optional), then `POST /Startup/Complete`.
6. `POST /Users/AuthenticateByName`, get the admin token, then create or find the API key (§3).
7. Libraries (§4), encoding (§5).

Doing libraries after Complete with the API key is simpler and the same code then serves re-runs and repairs.

## 3. Authentication

**`POST /Users/AuthenticateByName`** (anonymous; the `Authorization` header with client info is **mandatory**)
- Body `{"Username":"<name>","Pw":"<password>"}` (DTO: https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/Jellyfin.Api/Models/UserDtos/AuthenticateUserByName.cs#L11-L16)
- Header `Authorization: MediaBrowser Client="EasyArr", Device="EasyArr", DeviceId="easyarr-dashboard", Version="1.0.0"`
- Controller: https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/Jellyfin.Api/Controllers/UserController.cs#L209-L232
- `App` (Client), `DeviceId`, `DeviceName` (Device) and `AppVersion` (Version) are all **required**. Missing ones throw `ArgumentException` → 400: https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/Emby.Server.Implementations/Session/SessionManager.cs#L1716-L1723
- Bad credentials → `AuthenticationException` → 401 (same file #L1742-L1746).
- **Each login logs out earlier sessions of the same user + DeviceId** (same file #L1784-L1806). Use one stable DeviceId for EasyArr. Seerr uses its own (`BOT_seerr`), so the two don't collide.
- Response `AuthenticationResult`: `{"User":{UserDto: "Name","ServerId","Id",…,"Policy":{"IsAdministrator":true,…}},"SessionInfo":{…},"AccessToken":"<32 hex>","ServerId":"<32 hex>"}`
  - https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/MediaBrowser.Controller/Authentication/AuthenticationResult.cs#L15-L30
  - https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/MediaBrowser.Model/Dto/UserDto.cs#L27-L102
- Afterwards send `Authorization: MediaBrowser Client="EasyArr", Device="EasyArr", DeviceId="easyarr-dashboard", Version="1.0.0", Token="<AccessToken>"`.

**Persistent API key**
- `POST /Auth/Keys?app=EasyArr` (admin) returns **204 with no body**. The key isn't returned.
  - https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/Jellyfin.Api/Controllers/ApiKeyController.cs#L52-L60
  - The query name binds case-insensitively; Seerr uses `?App=`.
- `GET /Auth/Keys` (admin) returns `{"Items":[{"Id":0,"AccessToken":"<32 hex>","DeviceId":"","AppName":"EasyArr","AppVersion":"","DeviceName":"","UserId":"00000000…","IsActive":false,"DateCreated":"…","DateLastActivity":"…"}],"TotalRecordCount":n,"StartIndex":0}`.
  - Only `AppName`, `AccessToken` and `DateCreated` are filled: https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/Jellyfin.Server.Implementations/Security/AuthenticationManager.cs#L26-L54
  - Model: https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/MediaBrowser.Controller/Security/AuthenticationInfo.cs#L15-L73 and https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/MediaBrowser.Model/Querying/QueryResult.cs#L47-L59
- `DELETE /Auth/Keys/{key}` (admin) → 204 (ApiKeyController `#L68-L76`).
- **Idempotent pattern:** `GET /Auth/Keys`. If an item with `AppName=="EasyArr"` exists, reuse it (take the newest by `DateCreated`). Otherwise POST, then GET and pick it. Seerr does the same for its own key: https://github.com/seerr-team/seerr/blob/564bfb08b54caa374bddaf820abfd226e5e69151/server/api/jellyfin.ts#L586-L606
- Using the key: `Authorization: MediaBrowser Token="<key>"` (also `Client=…` if desired), or `?ApiKey=<key>`. API keys skip per-user checks and are admin: `DefaultAuthorizationHandler.cs#L51-L56` and `CustomAuthenticationHandler.cs#L53-L58`.

## 4. Libraries

All `/Library/VirtualFolders*` routes use `FirstTimeSetupOrElevated` (anonymous during the wizard, admin/API key after): https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/Jellyfin.Api/Controllers/LibraryStructureController.cs#L35-L36

**`GET /Library/VirtualFolders`** returns `VirtualFolderInfo[]`:
```json
[{"Name":"Movies","Locations":["/data/media/movies"],"CollectionType":"movies",
  "LibraryOptions":{…},"ItemId":"<32 hex>","PrimaryImageItemId":"…","RefreshProgress":null,"RefreshStatus":"Idle"}]
```
- `LibraryStructureController.cs#L72-L77`
- Model: https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/MediaBrowser.Model/Entities/VirtualFolderInfo.cs#L26-L56

**`POST /Library/VirtualFolders?name=Movies&collectionType=movies&paths=/data/media/movies&refreshLibrary=true`** returns 204.
- Body (optional) `AddVirtualFolderDto`: `{"LibraryOptions":{…}}`.
  - `LibraryStructureController.cs#L89-L110`
  - https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/Jellyfin.Api/Models/LibraryStructureDto/AddVirtualFolderDto.cs#L13
- `paths` is comma-delimited or repeated. It overrides `LibraryOptions.PathInfos`.
- `collectionType` values: `movies` | `tvshows` | `music` | `musicvideos` | `homevideos` | `boxsets` | `books` | `mixed`: https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/MediaBrowser.Model/Entities/CollectionTypeOptions.cs#L5-L21
- `name` must have no leading or trailing whitespace (regex attribute, `#L93-L94`).
- With no body, `new LibraryOptions()` defaults apply: `Enabled=true`, `EnableRealtimeMonitor=false`, `TypeOptions=[]`, `SaveLocalMetadata=false`, etc.: https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/MediaBrowser.Model/Configuration/LibraryOptions.cs#L13-L47
  - Empty `TypeOptions` means **all remote metadata fetchers are enabled**: https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/MediaBrowser.Providers/Manager/ProviderManager.cs#L563-L568
  - Suggested body: `{"LibraryOptions":{"Enabled":true,"EnableRealtimeMonitor":true,"PreferredMetadataLanguage":"en","MetadataCountryCode":"US"}}`. `EnableRealtimeMonitor` lets new *arr imports show up without waiting for the scheduled scan.

Behaviour (`LibraryManager.AddVirtualFolder`): https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/Emby.Server.Implementations/Library/LibraryManager.cs#L3807-L3880
- **A duplicate name does NOT fail.** It silently creates `Movies2`, `Movies3`, … (`#L3818-L3826`), so blind re-POSTs create duplicate libraries.
- **Each path must already exist inside the container**, else `ArgumentException("The specified path does not exist: …")` → 400 (`#L3828-L3836`). Create `/data/media/{movies,tv,music}` before wiring.
- `refreshLibrary=true` starts a background scan (`#L3868-L3871`).

**Add a path to an existing library:** `POST /Library/VirtualFolders/Paths?refreshLibrary=true`
- Body `{"Name":"Movies","Path":"/data/media/movies"}`, or `{"Name":"Movies","PathInfo":{"Path":"…"}}`. Returns 204.
  - `LibraryStructureController.cs#L364-L399`
  - DTO: https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/Jellyfin.Api/Models/LibraryStructureDto/MediaPathDto.cs#L15-L25
- Missing path → `FileNotFoundException` → 404 (`LibraryManager.cs#L3951-L3970`).
- Remove a path: `DELETE /Library/VirtualFolders/Paths?name=&path=` (`#L429-L465`). Remove a library: `DELETE /Library/VirtualFolders?name=` (`#L120-L130`).

**Idempotency rule for EasyArr:** `GET /Library/VirtualFolders`. A desired library exists if any folder's `Locations` contains the exact path (normalise trailing `/`). Then:
- If found, do nothing. Optionally check `CollectionType`.
- If not found, and a folder with the desired `Name` exists, `POST /Library/VirtualFolders/Paths` to it.
- Otherwise `POST /Library/VirtualFolders`.

**Never key on name alone** (auto-suffixing).

Desired set: `Movies`/`movies`/`/data/media/movies`, `Shows`/`tvshows`/`/data/media/tv`, `Music`/`music`/`/data/media/music`.

## 5. Hardware acceleration (`encoding` named configuration)

- **Read:** `GET /System/Configuration/encoding`. Policy is plain `[Authorize]` (any user), returns the full `EncodingOptions`: https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/Jellyfin.Api/Controllers/ConfigurationController.cs#L21-L22 and #L77-L83
- **Write:** `POST /System/Configuration/encoding` (admin/API key). The body is **the whole object** deserialized to `EncodingOptions`; it is not merged. Returns 204 (`#L92-L106`).
  - Missing fields reset to constructor defaults, so **always GET → modify → POST back**.
  - Validation: a changed non-empty `EncoderAppPath` throws `InvalidOperationException("Unable to update encoder app path.")`, and a changed `TranscodingTempPath` must exist: https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/MediaBrowser.MediaEncoding/Configuration/EncodingConfigurationStore.cs#L19-L47
  - The round-trip keeps `EncoderAppPath` unchanged, so it passes.
- Store key `"encoding"`: `EncodingConfigurationStore.cs#L13-L17`.

**Fields** (PascalCase, defaults from the constructor): https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/MediaBrowser.Model/Configuration/EncodingOptions.cs#L17-L65

| Field | Type / values | Default | Line |
|---|---|---|---|
| `HardwareAccelerationType` | `none`,`amf`,`qsv`,`nvenc`,`v4l2m2m`,`vaapi`,`videotoolbox`,`rkmpp` (string enum) | `none` (0) | #L131; enum https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/MediaBrowser.Model/Entities/HardwareAccelerationType.cs#L5-L21 |
| `VaapiDevice` | path | `/dev/dri/renderD128` | #L31, #L146 |
| `QsvDevice` | path or `""` | `""` (auto: Intel `i915`/vendor 0x8086 device) | #L32, #L151 |
| `EnableHardwareEncoding` | bool | `true` | #L58, #L276 |
| `HardwareDecodingCodecs` | string[] of `h264`,`hevc`,`mpeg2video`,`vc1`,`vp8`,`vp9`,`av1` | `["h264","vc1"]` | #L64, #L301 |
| `EnableDecodingColorDepth10Hevc` / `…10Vp9` | bool | `true` / `true` | #L49-L50 |
| `EnableDecodingColorDepth10HevcRext` / `12HevcRext` | bool | `false` | #L51-L52 |
| `EnableTonemapping` | bool (OpenCL/Vulkan/CUDA tone-mapping) | `false` | #L33, #L156 |
| `EnableVppTonemapping` | bool (Intel VPP via `tonemap_vaapi`/`vpp_qsv`) | `false` | #L34, #L161 |
| `PreferSystemNativeHwDecoder` | bool | `true` | #L55, #L261 |
| `EnableIntelLowPowerH264HwEncoder` / `…HevcHwEncoder` | bool | `false` | #L56-L57 |
| `AllowHevcEncoding` / `AllowAv1Encoding` | bool | `false` | #L59-L60 |
| `EnableThrottling`, `EnableSegmentDeletion` | bool | `false` | #L24-L26 |

How the fields are used:
- The codec names in `HardwareDecodingCodecs` are matched in `EncodingHelper`: https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/MediaBrowser.Controller/MediaEncoding/EncodingHelper.cs#L6611 (and the QSV decoder map #L6849-L6889).
- On Linux, QSV is derived from a VA-API device with `driver=iHD`, `kernel_driver=i915`, `vendor_id=0x8086`. `QsvDevice`, if it is an existing path, takes priority. Source `EncodingHelper.cs#L916-L937` and #L953-L960.
- **QSV therefore needs the iHD driver**, which means Broadwell (Gen 8) or newer.
- OpenCL tonemapping requires `EnableTonemapping` (`#L358-L391`). VPP tonemapping requires `EnableVppTonemapping`, and on Linux `tonemap_vaapi` is preferred (`#L405-L425`).

**What the LSIO image ships for Intel**
- `jellyfin-ffmpeg8` bundles libva, `i965` and **`iHD`** drivers, gmmlib, MediaSDK (`libmfxhw64`), libvpl and vpl-gpu-rt (`libmfx-gen`): https://github.com/jellyfin/jellyfin-ffmpeg/blob/253db2a7b0a8045c54ce68ce33d7f601229b1822/docker-build.sh#L585-L699 and #L368-L398
- Only `Suggests: intel-opencl-icd`: https://github.com/jellyfin/jellyfin-ffmpeg/blob/253db2a7b0a8045c54ce68ce33d7f601229b1822/debian/control#L59-L61
- The LSIO manifest has `ocl-icd-libopencl1` but **no `intel-opencl-icd`** (package_versions.txt#L302). LSIO points Intel users to the "OpenCL-Intel" docker mod for OpenCL DV/HDR tone-mapping: https://github.com/linuxserver/docker-jellyfin/blob/5eb249fff32d0f67027d3fbdf2088c7592002431/README.md#L76-L82
- Device permissions are fixed automatically for `/dev/dri` (`ATTACHED_DEVICES_PERMS`): https://github.com/linuxserver/docker-jellyfin/blob/5eb249fff32d0f67027d3fbdf2088c7592002431/Dockerfile#L17
- Mount the device with `--device=/dev/dri:/dev/dri`: README#L88-L93.

**Jellyfin docs on Intel**
- On Linux: "**QSV – Preferred on mainstream GPUs**", "**VA-API – Required by pre-Broadwell legacy GPUs**". QSV on Linux is limited to Broadwell and newer: https://github.com/jellyfin/jellyfin.org/blob/3af5cf0d5ce40b9f17f31b4eedaab0d5ae91a05b/docs/general/post-install/transcoding/hardware-acceleration/intel.md#L16-L26
- Tone-mapping methods: OpenCL (needs the runtime) vs QSV VPP (Linux only, fixed-function): same file #L50-L66.
- Codec support by generation: H.264 on all QSV GPUs; HEVC 8-bit from Gen9 Skylake; HEVC 10-bit from Gen9.5 Kaby Lake / Apollo Lake / Gemini Lake; AV1 decode from Gen12 Tiger Lake: same file #L84-L118.

**Recommended EasyArr defaults**
- **No `/dev/dri/renderD128`:** leave `HardwareAccelerationType: "none"` (the default). Don't POST anything.
- **Intel iGPU present** (choose QSV per the docs). Merge into the GET result:
  ```json
  {"HardwareAccelerationType":"qsv","QsvDevice":"/dev/dri/renderD128","VaapiDevice":"/dev/dri/renderD128",
   "EnableHardwareEncoding":true,
   "HardwareDecodingCodecs":["h264","hevc","mpeg2video","vc1","vp8","vp9"],
   "EnableDecodingColorDepth10Hevc":true,"EnableDecodingColorDepth10Vp9":true,
   "EnableTonemapping":false,"EnableVppTonemapping":true,
   "PreferSystemNativeHwDecoder":true,
   "EnableIntelLowPowerH264HwEncoder":false,"EnableIntelLowPowerHevcHwEncoder":false,
   "AllowHevcEncoding":false,"AllowAv1Encoding":false}
  ```
  - Add `"av1"` to `HardwareDecodingCodecs` only on Gen12+ (Tiger Lake / 11th-gen Core and newer).
  - `EnableTonemapping` stays false because the LSIO image has no Intel OpenCL runtime.
  - Low-power encoders stay off because they need HuC firmware, per the docs' "Low-Power Encoding" section #L748-L800.
- **Conservative fallback** for unknown or old Intel (pre-Broadwell, i965 only) or AMD: `"HardwareAccelerationType":"vaapi","VaapiDevice":"/dev/dri/renderD128"`, `HardwareDecodingCodecs:["h264"]`, `EnableVppTonemapping:false`.
- **Picking the vendor.** EasyArr can read `/sys/class/drm/renderD128/device/vendor` (`0x8086` = Intel) from the host or a container with `/sys`. This is a suggestion, not upstream behaviour.
- **Check the result:** `GET /System/Configuration/encoding` shows what was stored. Real transcode success shows up only in `/config/log/FFmpeg.Transcode-*.log`.

## 6. Password changes later

- `POST /Users/Password?userId=<guid>` (current route) or legacy `POST /Users/{userId}/Password`, both `[Authorize]`. Returns 204, or 403/404 on failure: https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/Jellyfin.Api/Controllers/UserController.cs#L270-L341
- Body `{"CurrentPw":"…","NewPw":"…","ResetPassword":false}`: https://github.com/jellyfin/jellyfin/blob/83d0d0e7f76e23e2e085c8ff67d28b772d35967d/Jellyfin.Api/Models/UserDtos/UpdateUserPassword.cs#L11-L26
- An admin changing **another** user's password needs no `CurrentPw`. Changing your **own** password, or calling as a non-admin, requires a correct `CurrentPw` (`#L297-L311`).
- An API key is admin and has no user id, so `POST /Users/Password?userId=<adminId>` with the API key should skip `CurrentPw`. Unconfirmed, see Doubts.
- Afterwards, **all other tokens of that user are revoked** (`#L313-L315`). This includes Seerr's stored `jellyfinAuthToken`; Seerr itself uses its API key for background jobs.
- The user id is `AuthenticationResult.User.Id`, or `GET /Users/Me` with a user token.

---

# SEERR v3.5.1

- `package.json` `"version": "3.5.1"`: https://github.com/seerr-team/seerr/blob/564bfb08b54caa374bddaf820abfd226e5e69151/package.json#L3
- Image: `USER node:node` (uid 1000), `WORKDIR /app`, `EXPOSE 5055`: https://github.com/seerr-team/seerr/blob/564bfb08b54caa374bddaf820abfd226e5e69151/Dockerfile#L61-L75
- Docs: volume `/app/config`, chown 1000:1000, healthcheck on `/api/v1/settings/public`: https://github.com/seerr-team/seerr/blob/564bfb08b54caa374bddaf820abfd226e5e69151/docs/getting-started/docker.mdx#L107-L140

### Conventions
- **Request validation.** All `/api/v1` requests are validated against `seerr-api.yml` by `express-openapi-validator` (`validateRequests: true`). Required fields in the spec matter: https://github.com/seerr-team/seerr/blob/564bfb08b54caa374bddaf820abfd226e5e69151/server/index.ts#L239-L244
- **Two auth methods**, `cookieAuth` (`connect.sid`) or header `X-Api-Key`: https://github.com/seerr-team/seerr/blob/564bfb08b54caa374bddaf820abfd226e5e69151/seerr-api.yml#L2148-L2156 and #L8305-L8307
  - `checkUser`: if `X-API-Key` equals `settings.main.apiKey`, the request acts as **user id 1** (or `X-API-User: <id>`). Otherwise the session's `userId` is used: https://github.com/seerr-team/seerr/blob/564bfb08b54caa374bddaf820abfd226e5e69151/server/middleware/auth.ts#L9-L41
  - **API-key auth only works after user 1 exists**, i.e. after the first Jellyfin login.
- **Admin-only routes.** All `/api/v1/settings/*` except `/settings/public` require `Permission.ADMIN` (403 otherwise): https://github.com/seerr-team/seerr/blob/564bfb08b54caa374bddaf820abfd226e5e69151/server/routes/index.ts#L113-L156 and `auth.ts#L43-L58`
- **Session cookie.** express-session, cookie name `connect.sid` (default), `httpOnly`, `secure:'auto'`, so plain HTTP works. `sameSite: 'lax'` (CSRF protection defaults off), 30-day maxAge, stored in SQLite: https://github.com/seerr-team/seerr/blob/564bfb08b54caa374bddaf820abfd226e5e69151/server/index.ts#L216-L235
  - `csrfProtection: false`, `trustProxy: false` defaults: https://github.com/seerr-team/seerr/blob/564bfb08b54caa374bddaf820abfd226e5e69151/server/lib/settings/index.ts#L617-L637
  - A Node client must capture `Set-Cookie: connect.sid=…` from the login response and send `Cookie: connect.sid=…` afterwards.
- **Server-type enum:** `MediaServerType { PLEX=1, JELLYFIN=2, EMBY=3, NOT_CONFIGURED=4 }`: https://github.com/seerr-team/seerr/blob/564bfb08b54caa374bddaf820abfd226e5e69151/server/constants/server.ts#L1-L11
- **Readiness:** `GET /api/v1/settings/public` (anonymous). `/api/v1/status` calls GitHub when `versionCheck` is true (https://github.com/seerr-team/seerr/blob/564bfb08b54caa374bddaf820abfd226e5e69151/server/routes/index.ts#L50-L101), so avoid it for polling.

## 7. First-run setup without a browser

What the Setup UI does (`src/components/Setup`):
1. Pick Jellyfin.
2. `POST /api/v1/auth/jellyfin`: https://github.com/seerr-team/seerr/blob/564bfb08b54caa374bddaf820abfd226e5e69151/src/components/Setup/JellyfinSetup.tsx#L120-L131
3. Library step: `SettingsJellyfin isSetupSettings`. Continue is enabled only when **at least one library is `enabled`**: https://github.com/seerr-team/seerr/blob/564bfb08b54caa374bddaf820abfd226e5e69151/src/components/Setup/index.tsx#L78-L85 and #L238-L262
   - That component calls `POST /settings/jellyfin/library/sync`, `PUT /settings/jellyfin/library/:id {enabled}` and `POST /settings/jellyfin/sync {start:true}`: https://github.com/seerr-team/seerr/blob/564bfb08b54caa374bddaf820abfd226e5e69151/src/components/Settings/SettingsJellyfin.tsx#L163-L235
4. Services step (Sonarr/Radarr modals).
5. Finish: `POST /api/v1/settings/initialize`, then `POST /api/v1/settings/main {locale}`: https://github.com/seerr-team/seerr/blob/564bfb08b54caa374bddaf820abfd226e5e69151/src/components/Setup/index.tsx#L56-L69

> ⚠️ The library API changed. In v3.5.1, `GET /api/v1/settings/jellyfin/library` only **returns** the stored list. It has **no** `?sync=true` / `?enable=` query handling any more. Use `POST …/library/sync` + `PUT …/library/{id}` (below).

### 7.1 `POST /api/v1/auth/jellyfin` (anonymous)

Exact body for the first admin (what the UI sends):
```json
{"username":"<wizard user>","password":"<wizard pass>",
 "hostname":"w1kyu-easyarr_jellyfin_1","port":8096,"useSsl":false,"urlBase":"",
 "email":"<wizard user or an email>","serverType":2}
```
- **`hostname` is the bare host, not a URL.** Seerr builds `http(s)://${ip}:${port}${urlBase}` itself: https://github.com/seerr-team/seerr/blob/564bfb08b54caa374bddaf820abfd226e5e69151/server/utils/getHostname.ts#L10-L18
  - **Always send `port` and `urlBase: ""`.** Otherwise the URL becomes `…:undefined` / `…8096undefined` during login.
- `serverType` must be `2` (JELLYFIN) or `3` (EMBY) on first setup. Anything else returns 500 `NO_ADMIN_USER`.
- `email` is optional. It falls back to the Jellyfin user name.
- The spec only *requires* `username` + `password`: https://github.com/seerr-team/seerr/blob/564bfb08b54caa374bddaf820abfd226e5e69151/seerr-api.yml#L4057-L4093

Handler: https://github.com/seerr-team/seerr/blob/564bfb08b54caa374bddaf820abfd226e5e69151/server/routes/auth.ts#L246-L530
- Pre-checks (`#L260-L280`), all returning **500** with `{error}`:
  - Jellyfin login disabled once a non-Jellyfin server is configured.
  - `username` missing.
  - **`hostname` sent while `settings.jellyfin.ip` is already set** → `"Jellyfin hostname already configured"`.
  - No hostname on first run → `"No hostname provided."`.
- Seerr logs into Jellyfin with `Authorization: MediaBrowser Client="Seerr", Device="Seerr", DeviceId="BOT_seerr", Version=…`.
  - Device id at `auth.ts#L299-L306`.
  - Header and login: https://github.com/seerr-team/seerr/blob/564bfb08b54caa374bddaf820abfd226e5e69151/server/api/jellyfin.ts#L163-L198
- **First user:** if there are no Seerr users, or `mediaServerType` is still NOT_CONFIGURED (`#L334-L338`):
  - Requires `account.User.Policy.IsAdministrator` (else 403 `NOT_ADMIN`, `#L340-L342`).
  - Creates **user id 1 with `Permission.ADMIN`** (`#L352-L380`).
  - **Creates a Jellyfin API key named "Seerr"** (`#L413-L420`).
  - Stores `settings.jellyfin.{name,serverId,ip,port,urlBase,useSsl,apiKey}`, then `startJobs()` (`#L422-L432`).
- **Session:** `req.session.userId = user.id` (`#L525-L528`). The response is **200** with the filtered `User` JSON (`#L530`) plus a `Set-Cookie: connect.sid`.
- **Errors** come back as `{message: <ApiErrorCode>}`:
  - `INVALID_URL` (404): Jellyfin unreachable/no response.
  - `CONNECTION_ERROR` (502).
  - `INVALID_CREDENTIALS` (401).
  - `NOT_ADMIN` (403).
  - `NO_ADMIN_USER` (500).
  - Mapping: `auth.ts#L531-L637`; Jellyfin-side mapping `jellyfin.ts#L183-L240`.
- **Re-running** (Seerr already set up):
  - Send the same body **without `hostname`**. Seerr finds the existing user and updates name/avatar; still 200 + cookie (`#L435-L459`).
  - Sending `hostname` again returns 500 (see above), so EasyArr must branch on `GET /settings/public` → `mediaServerType`/`initialized` or `GET /settings/jellyfin` → `ip`.

### 7.2 Jellyfin settings / libraries (cookie or X-Api-Key, admin)

| Call | Body | Response | Source |
|---|---|---|---|
| `GET /api/v1/settings/jellyfin` | – | `{name, ip, port, useSsl, urlBase, externalHostname, jellyfinForgotPasswordUrl, libraries[], serverId, apiKey}` | `server/routes/settings/index.ts#L302-L306`; type https://github.com/seerr-team/seerr/blob/564bfb08b54caa374bddaf820abfd226e5e69151/server/lib/settings/index.ts#L47-L58 |
| `POST /api/v1/settings/jellyfin` | partial `JellyfinSettings`, e.g. `{"externalHostname":"http://umbrel.local:39096"}` | merged settings. Tests `/System/Info` first; `INVALID_URL` on failure | `settings/index.ts#L308-L363` |
| **`POST /api/v1/settings/jellyfin/library/sync`** | none | `[{id,name,enabled,type:'movie'\|'show',lastScan?}]`. **New libraries start `enabled:false`**; existing flags kept. 404 `SYNC_ERROR_NO_LIBRARIES` if none | `settings/index.ts#L394-L456` |
| `GET /api/v1/settings/jellyfin/library` | – | stored list (no sync) | `#L365-L369` |
| **`PUT /api/v1/settings/jellyfin/library/{id}`** | `{"enabled":true}` (zod-validated; 400 bad body; 404 unknown id) | the library object | `#L371-L392`, spec https://github.com/seerr-team/seerr/blob/564bfb08b54caa374bddaf820abfd226e5e69151/seerr-api.yml#L2338-L2391 |
| `POST /api/v1/settings/jellyfin/sync` | `{"start":true}` or `{"cancel":true}` | scanner status `{running,progress,total,currentLibrary,libraries}` | `#L485-L495` |

Library notes:
- Seerr reads libraries from Jellyfin `GET /Library/MediaFolders` with its API key. It **drops `music`, `books`, `musicvideos`, `homevideos`, `boxsets`**. The id is the Jellyfin item `Id`; `type` is `movie` if `CollectionType=='movies'`, else `show`: https://github.com/seerr-team/seerr/blob/564bfb08b54caa374bddaf820abfd226e5e69151/server/api/jellyfin.ts#L391-L447
- **Jellyfin libraries must exist before the Seerr library sync.** Enable all returned ones (Movies + Shows).
- Background jobs (recently-added every 5 min, full scan daily) start at login (`startJobs()`): https://github.com/seerr-team/seerr/blob/564bfb08b54caa374bddaf820abfd226e5e69151/server/job/schedule.ts#L112-L130
- A one-off `POST /settings/jellyfin/sync {"start":true}` is optional.

### 7.3 Finish
- `POST /api/v1/settings/initialize` (admin, no body) sets `public.initialized = true` and returns 200 `{"initialized":true}`: https://github.com/seerr-team/seerr/blob/564bfb08b54caa374bddaf820abfd226e5e69151/server/routes/settings/index.ts#L871-L882
- Optional: `POST /api/v1/settings/main {"locale":"en", "applicationUrl":"http://<host>:39055"}` lodash-merges into `main` and returns `main`: same file #L82-L89.
- `GET /api/v1/settings/public` (anonymous) returns `fullPublicSettings`: `initialized`, `mediaServerType`, `applicationTitle`, `jellyfinServerName`, `movie4kEnabled`, … `plexClientIdentifier`.
  - `server/routes/index.ts#L113-L122`
  - Shape: https://github.com/seerr-team/seerr/blob/564bfb08b54caa374bddaf820abfd226e5e69151/server/lib/settings/index.ts#L189-L222
  - Defaults `initialized:false`, `mediaServerType:4`: same file #L433 and #L466-L468.

**Recommended EasyArr Seerr sequence**
1. Poll `GET /api/v1/settings/public` until 200.
2. If `mediaServerType == 4` (NOT_CONFIGURED): `POST /auth/jellyfin` with the full body including `hostname`. Otherwise use the body without `hostname`, or skip it and use the API key. Keep the `connect.sid` cookie.
3. Switch to the API key: either `GET /api/v1/settings/main` → `apiKey`, or the `API_KEY` env var (§9).
4. `POST /settings/jellyfin/library/sync`, then `PUT /settings/jellyfin/library/{id} {"enabled":true}` for each entry not yet enabled.
5. Sonarr/Radarr (§8), idempotent by `hostname`+`port`+`baseUrl` match in `GET /settings/sonarr|radarr`.
6. `POST /settings/initialize` if `initialized` is false.

## 8. Sonarr / Radarr in Seerr

**Test (admin):** `POST /api/v1/settings/sonarr/test` and `/radarr/test`
- Body `{"hostname":"w1kyu-easyarr_vpn_1","port":8989,"apiKey":"<key>","useSsl":false,"baseUrl":"/apps/sonarr"}`. Spec-required: `hostname, port, apiKey, useSsl`.
- Sonarr success: 200 `{"profiles":[{"id":1,"name":"Any"},…],"rootFolders":[{"id":1,"path":"/data/media/tv"}],"languageProfiles":null|[…],"tags":[{"id":1,"label":"…"}],"urlBase":"/apps/sonarr"}`.
  - `languageProfiles` is only fetched for Sonarr ≤ v3.
  - Route: https://github.com/seerr-team/seerr/blob/564bfb08b54caa374bddaf820abfd226e5e69151/server/routes/settings/sonarr.ts#L39-L74
- Radarr: the same without `languageProfiles`: https://github.com/seerr-team/seerr/blob/564bfb08b54caa374bddaf820abfd226e5e69151/server/routes/settings/radarr.ts#L39-L77
- Failure: **500** `{message:"Failed to connect to Sonarr"}`.
- URL = `http(s)://${hostname}:${port}${baseUrl ?? ''}/api/v3`, plain concatenation: https://github.com/seerr-team/seerr/blob/564bfb08b54caa374bddaf820abfd226e5e69151/server/api/servarr/base.ts#L82-L86
  - So **`baseUrl` must start with `/` and have no trailing `/`**: `"/apps/sonarr"`. The UI enforces this: https://github.com/seerr-team/seerr/blob/564bfb08b54caa374bddaf820abfd226e5e69151/src/components/Settings/SonarrModal/index.tsx#L151-L162
- Profiles come from `/qualityProfile` as `{id,name}`: `base.ts#L46-L49` and #L130-L138.

**Create:** `POST /api/v1/settings/sonarr` and `/radarr` return **201** with the stored object, `id` auto-assigned as last id + 1 (starting at 0).
- `isDefault:true` clears other defaults with the same `is4k`.
- The body is **stored as-is** (no server-side defaults), so send every field the UI sends.
  - Sonarr: https://github.com/seerr-team/seerr/blob/564bfb08b54caa374bddaf820abfd226e5e69151/server/routes/settings/sonarr.ts#L15-L37
  - Radarr: `radarr.ts#L15-L36`
- Update: `PUT /settings/sonarr/{id}` (full replace). Delete: `DELETE /settings/sonarr/{id}` (`sonarr.ts#L76-L126`).
- Spec-required fields:
  - Sonarr: `name, hostname, port, apiKey, useSsl, activeProfileId, activeProfileName, activeDirectory, is4k, enableSeasonFolders, isDefault`.
  - Radarr: `name, hostname, port, apiKey, useSsl, activeProfileId, activeProfileName, activeDirectory, is4k, minimumAvailability, isDefault`.
  - https://github.com/seerr-team/seerr/blob/564bfb08b54caa374bddaf820abfd226e5e69151/seerr-api.yml#L558-L707
- Full types: https://github.com/seerr-team/seerr/blob/564bfb08b54caa374bddaf820abfd226e5e69151/server/lib/settings/index.ts#L68-L105

Sonarr body (mirrors the UI submission, https://github.com/seerr-team/seerr/blob/564bfb08b54caa374bddaf820abfd226e5e69151/src/components/Settings/SonarrModal/index.tsx#L276-L310; initial values #L240-L264):
```json
{"name":"Sonarr","hostname":"w1kyu-easyarr_vpn_1","port":8989,"apiKey":"<key>","useSsl":false,
 "baseUrl":"/apps/sonarr","activeProfileId":<id from test>,"activeProfileName":"<name from test>",
 "activeDirectory":"/data/media/tv","seriesType":"standard","animeSeriesType":"anime",
 "activeAnimeProfileId":<id>,"activeAnimeProfileName":"<name>","activeAnimeDirectory":"/data/media/tv",
 "tags":[],"animeTags":[],"is4k":false,"isDefault":true,"enableSeasonFolders":true,
 "externalUrl":"http://<umbrel-host>:<port>/apps/sonarr","syncEnabled":true,"preventSearch":false,
 "tagRequests":false,"monitorNewItems":"all"}
```
- `activeLanguageProfileId` is only for Sonarr v3 (omit for v4).
- `activeAnime*` may be omitted. Seerr falls back to `seriesType ?? 'standard'` / `animeSeriesType ?? 'anime'`: https://github.com/seerr-team/seerr/blob/564bfb08b54caa374bddaf820abfd226e5e69151/server/subscriber/MediaRequestSubscriber.ts#L589-L596
- Allowed values: `seriesType` `standard|daily|anime`; `monitorNewItems` `all|none` (type #L93-L105).

Radarr body (UI: https://github.com/seerr-team/seerr/blob/564bfb08b54caa374bddaf820abfd226e5e69151/src/components/Settings/RadarrModal/index.tsx#L253-L272):
```json
{"name":"Radarr","hostname":"w1kyu-easyarr_vpn_1","port":7878,"apiKey":"<key>","useSsl":false,
 "baseUrl":"/apps/radarr","activeProfileId":<id>,"activeProfileName":"<name>",
 "activeDirectory":"/data/media/movies","is4k":false,"minimumAvailability":"released",
 "tags":[],"isDefault":true,"externalUrl":"http://<umbrel-host>:<port>/apps/radarr",
 "syncEnabled":true,"preventSearch":false,"tagRequests":false}
```
- `minimumAvailability` is one of `announced|inCinemas|released`. The UI default is `released` (#L237, options #L625-L631).
- `externalUrl` is only used for UI links. `syncEnabled` enables Seerr's *arr scan job. `preventSearch:false` makes Seerr ask the *arr to search on approval.
- `activeDirectory` must equal a `rootFolders[].path` from the test call, as configured in Sonarr/Radarr themselves.

**Lidarr / music:** **not supported in Seerr v3.5.1**.
- No Lidarr code under `server/` or `src/` (`grep -ril lidarr` → none).
- Settings only have `radarr[]` and `sonarr[]` (`settings/index.ts#L52-L53` routes).
- Jellyfin music libraries are filtered out (`jellyfin.ts#L424-L430`).

## 9. Seerr API key vs cookie; settings.json pre-seeding

**Reading the key after setup**
- `GET /api/v1/settings/main` (admin session) returns `MainSettings` **including `apiKey`**. Non-admins get it stripped: https://github.com/seerr-team/seerr/blob/564bfb08b54caa374bddaf820abfd226e5e69151/server/routes/settings/index.ts#L60-L80
- Then send `X-Api-Key: <key>` on every call. It acts as admin user 1.
- `POST /settings/main/regenerate` rotates the key (`#L106-L116`).

**Better: fix the key via env**
- `API_KEY` env var: if set, it is used when generating the key, and **it overwrites any stored key on every start**: https://github.com/seerr-team/seerr/blob/564bfb08b54caa374bddaf820abfd226e5e69151/server/lib/settings/index.ts#L805-L861
- Documented: https://github.com/seerr-team/seerr/blob/564bfb08b54caa374bddaf820abfd226e5e69151/docs/using-seerr/settings/general.md#L15
- So EasyArr can generate a secret, put `API_KEY=${…}` in the Seerr service environment, and know the key without reading it.
- The key still only works once user 1 exists (`auth.ts#L13-L23`). The first `POST /auth/jellyfin` remains mandatory.

**settings.json location and load semantics**
- Path is `${CONFIG_DIRECTORY}/settings.json`, else `<app>/config/settings.json`. The Dockerfile sets no `CONFIG_DIRECTORY` and `WORKDIR` is `/app`, so it is **`/app/config/settings.json`**: https://github.com/seerr-team/seerr/blob/564bfb08b54caa374bddaf820abfd226e5e69151/server/lib/settings/index.ts#L396-L398
- Users and sessions live in the SQLite DB in the same config dir, not in settings.json.
- On start, the file is read, migrations run (`settings.old.json` backup written), then it is deep-merged with defaults. **Arrays replace**, so a partial file is fine: `settings/index.ts#L12-L15` and #L822-L878
- Migrator: https://github.com/seerr-team/seerr/blob/564bfb08b54caa374bddaf820abfd226e5e69151/server/lib/settings/migrator.ts#L8-L80
- Missing `apiKey`, `clientId`, `sessionSecret` and VAPID keys are generated.
- **Settings are loaded once into memory and written back atomically on every save** (`#L883-L895`). Edits made while Seerr runs are lost or overwritten, so only pre-seed **before first start**, or with Seerr stopped.

**Pre-seeding vs API**
- **Admin user:** pre-seeding cannot create it, because it lives in SQLite. `POST /auth/jellyfin` is required.
- **Jellyfin connection** (`jellyfin.ip` etc.): pre-seeding is ❌ **actively harmful**.
  - With `ip` pre-set, sending `hostname` gives 500 "hostname already configured" (`auth.ts#L273-L277`).
  - Without `hostname`, the first-admin branch **overwrites `settings.jellyfin.ip = body.hostname ?? ''` = `""`** (`auth.ts#L422-L426`).
  - Also, with `mediaServerType: 2` set and no `jellyfin.apiKey`, migration `0002` tries to create a Jellyfin token at startup: https://github.com/seerr-team/seerr/blob/564bfb08b54caa374bddaf820abfd226e5e69151/server/lib/settings/migrations/0002_migrate_apitokens.ts#L8-L39
  - Via the API it's ✅ one call.
- **`main.apiKey`:** pre-seeding works, but the `API_KEY` env is cleaner. Through the API: read it via `GET /settings/main`.
- **`sonarr[]`/`radarr[]`:** pre-seeding is possible because arrays replace, but profile ids aren't known before Sonarr/Radarr exist, and there's no validation. The API's `/test` call validates and returns profile ids.
- **`public.initialized`:** pre-seeding is possible, but setting it before the Jellyfin login leaves an "initialized" app without a media server. Through the API it's `POST /settings/initialize`.

**Recommendation:**
- Do **not** pre-seed `settings.json`.
- Set `API_KEY` in compose, a per-install secret generated by EasyArr init.
- Do the first `POST /api/v1/auth/jellyfin` with a throw-away cookie jar. Do everything else with `X-Api-Key`.
- Only optional exception: `network`/`main` cosmetic keys, which are also settable via `POST /settings/main` / `/settings/network`.

## 10. Sub-path
Seerr has **no base-URL setting** ("Base URLs cannot be configured in Seerr… only subdomain configurations are supported"; the subfolder nginx config is an unsupported workaround): https://github.com/seerr-team/seerr/blob/564bfb08b54caa374bddaf820abfd226e5e69151/docs/extending-seerr/reverse-proxy.mdx#L10-L12

Not an issue for EasyArr: Seerr gets its own published port 39055 at `/`.

---

## Doubts / unconfirmed
1. **Floating tag.** `version-12.4ubu2604` is floating. It currently equals `-ls57` (digest `sha256:3894d9ea…`), and a rebuild could change the bundled ffmpeg/driver versions. Pin by digest in compose.
2. **Health status codes (framework assumption).** ASP.NET Core's default `HealthCheckOptions.ResultStatusCodes` map Degraded→200 and Unhealthy→503, with the body being the status name. This is framework behaviour, not in the Jellyfin repo, so the probe checks the body text `Healthy`.
3. **MVC body casing.** Case-insensitive JSON for MVC `[FromBody]` binding is assumed from ASP.NET Core's `JsonOptions` web defaults, which Jellyfin doesn't override. The named-config endpoint is definitely case-sensitive. Use PascalCase everywhere to be safe.
4. **Remote-access LAN detection.** Whether connections through the published port 39096 count as "LAN" depends on the Docker NAT and Jellyfin's subnet detection. Not tested; hence the advice to keep `EnableRemoteAccess=true`.
5. **QSV recommendation.** Untested on real hardware.
   - VPP tonemapping on Gen9/9.5 relies on `tonemap_vaapi` (code comment `EncodingHelper.cs#L415-L416`).
   - `av1`/`vp9` decode support varies by generation. Enabling codecs the GPU lacks can break transcodes.
   - Detecting the GPU generation (e.g. `vainfo` in the Jellyfin container: `/usr/lib/jellyfin-ffmpeg/vainfo --display drm --device /dev/dri/renderD128`) would let EasyArr set `HardwareDecodingCodecs` from the actual capabilities.
6. **LSIO device permissions.** LSIO's group handling (`ATTACHED_DEVICES_PERMS`) should make `/dev/dri/renderD128` accessible to `abc` without `group_add`. Not verified on Umbrel.
7. **Password change with an API key.** With an API key, `User.GetUserId()` is empty, so `POST /Users/Password?userId=<adminId>` should skip the `CurrentPw` check (admin role, and userId ≠ caller). Inferred from `UserController.cs#L297-L311`; not run.
8. **`/Startup/User` race.** If something else (a human in the browser) calls `GET /Startup/User` first, nothing breaks. But if a human finishes the wizard first, EasyArr gets 401/403 and must ask the user for credentials.
9. **Seerr `X-Api-Key` and the OpenAPI validator.** The global `security` (cookieAuth OR apiKey) in `seerr-api.yml` could make `express-openapi-validator` 5.6.2 reject requests lacking both, on routes without `security: []`. The validator's `validateSecurity` default wasn't checked in node_modules. EasyArr always sends one of them, so this shouldn't matter.
10. **Library id mapping.** Seerr library ids equal Jellyfin `/Library/MediaFolders` item Ids. That they also equal `VirtualFolderInfo.ItemId` is likely but not verified.
11. **`settings.jellyfin.ip` on re-login.** On a re-run of `POST /auth/jellyfin` without `hostname`, the code takes the "existing user" branch and doesn't touch `ip`. That holds only while user 1 exists and `mediaServerType` ≠ 4. If the Seerr DB were wiped but `settings.json` kept, the first-admin branch would blank `ip`, as in §9.
