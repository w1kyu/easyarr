# Servarr HTTP API reference for the EasyArr wiring engine

Versions researched (exact linuxserver image tags → upstream git tags → commit):

| App | linuxserver tag | upstream tag | commit (all citations below are pinned to it) |
|---|---|---|---|
| Sonarr | `4.0.20` = `version-4.0.20.3014` | `v4.0.20.3014` | `cab419ade8ac7fcab5bf80394ee492abd35d5f5a` |
| Radarr | `6.4.4` = `version-6.4.4.10685` | `v6.4.4.10685` | `a96bf7c3ecb23cb76993770727285dc17a613fbc` |
| Lidarr | `3.1.6` = `version-3.1.6.5079` | `v3.1.6.5079` | `da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd` |
| Prowlarr | `2.7.0` = `version-2.7.0.5723` | `v2.7.0.5723` | `0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b` |

(Tag ↔ image mapping from Docker Hub `linuxserver/<app>` tag list and `git ls-remote --tags`; in Sonarr/Radarr/Lidarr the `.3012/.3014`, `.10684/.10685`, `.5078/.5079` tag pairs point to the same commit.)

Base URLs used in every example (shared network namespace, UrlBase set in config.xml):

```
SONARR=http://localhost:8989/apps/sonarr    API=/api/v3
RADARR=http://localhost:7878/apps/radarr    API=/api/v3
LIDARR=http://localhost:8686/apps/lidarr    API=/api/v1
PROWLARR=http://localhost:9696/apps/prowlarr API=/api/v1
Header on every API call:  X-Api-Key: <key>      Content-Type: application/json
```

OpenAPI path index (exists in the shipped spec at that commit): Sonarr `/api/v3/downloadclient` ([spec](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Api.V3/openapi.json#L1498)), `/api/v3/config/downloadclient/{id}` ([spec](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Api.V3/openapi.json#L1814)), `/api/v3/rootfolder` ([spec](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Api.V3/openapi.json#L6598)), `/api/v3/config/mediamanagement/{id}` ([spec](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Api.V3/openapi.json#L4365)), `/api/v3/config/naming/{id}` ([spec](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Api.V3/openapi.json#L4827)), `/api/v3/tag` ([spec](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Api.V3/openapi.json#L7218)), `/api/v3/qualityprofile` ([spec](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Api.V3/openapi.json#L5535)), `/api/v3/system/status` ([spec](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Api.V3/openapi.json#L7151)), `/ping` ([spec](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Api.V3/openapi.json#L5306)). Radarr: same paths ([downloadclient](https://github.com/Radarr/Radarr/blob/a96bf7c3ecb23cb76993770727285dc17a613fbc/src/Radarr.Api.V3/openapi.json#L1856), [config/downloadclient/{id}](https://github.com/Radarr/Radarr/blob/a96bf7c3ecb23cb76993770727285dc17a613fbc/src/Radarr.Api.V3/openapi.json#L2182), [rootfolder](https://github.com/Radarr/Radarr/blob/a96bf7c3ecb23cb76993770727285dc17a613fbc/src/Radarr.Api.V3/openapi.json#L7377), [config/mediamanagement/{id}](https://github.com/Radarr/Radarr/blob/a96bf7c3ecb23cb76993770727285dc17a613fbc/src/Radarr.Api.V3/openapi.json#L4386), [tag](https://github.com/Radarr/Radarr/blob/a96bf7c3ecb23cb76993770727285dc17a613fbc/src/Radarr.Api.V3/openapi.json#L7657), [qualityprofile](https://github.com/Radarr/Radarr/blob/a96bf7c3ecb23cb76993770727285dc17a613fbc/src/Radarr.Api.V3/openapi.json#L6258), [system/status](https://github.com/Radarr/Radarr/blob/a96bf7c3ecb23cb76993770727285dc17a613fbc/src/Radarr.Api.V3/openapi.json#L7580)). Lidarr v1: [downloadclient](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/Lidarr.Api.V1/openapi.json#L2221), [config/downloadclient/{id}](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/Lidarr.Api.V1/openapi.json#L2422), [rootfolder](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/Lidarr.Api.V1/openapi.json#L7241) (+ PUT [rootfolder/{id}](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/Lidarr.Api.V1/openapi.json#L7124)), [qualityprofile](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/Lidarr.Api.V1/openapi.json#L5918), [qualityprofile/schema](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/Lidarr.Api.V1/openapi.json#L6119), [metadataprofile](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/Lidarr.Api.V1/openapi.json#L4737), [system/status](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/Lidarr.Api.V1/openapi.json#L7398). Prowlarr v1: [applications](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/Prowlarr.Api.V1/openapi.json#L144), [applications/{id}](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/Prowlarr.Api.V1/openapi.json#L49), [appprofile](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/Prowlarr.Api.V1/openapi.json#L345), [indexerproxy](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/Prowlarr.Api.V1/openapi.json#L2122), [command](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/Prowlarr.Api.V1/openapi.json#L720), [tag](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/Prowlarr.Api.V1/openapi.json#L3738), [system/status](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/Prowlarr.Api.V1/openapi.json#L3584). Note: Sonarr/Radarr have no PUT on rootfolder; config resources only have PUT at `/{id}` in the spec (use id `1`).

---

## 0. Cross-cutting rules (apply to all four apps)

- **Routing.** Controllers are mounted at `api/v{N}/{resource}` ([Sonarr](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Http/VersionedApiControllerAttribute.cs#L16), [Radarr](https://github.com/Radarr/Radarr/blob/a96bf7c3ecb23cb76993770727285dc17a613fbc/src/Radarr.Http/VersionedApiControllerAttribute.cs#L16), [Lidarr](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/Lidarr.Http/VersionedApiControllerAttribute.cs#L16), [Prowlarr](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/Prowlarr.Http/VersionedApiControllerAttribute.cs#L16)), all *below* `UsePathBase(UrlBase)` ([Sonarr](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/NzbDrone.Host/Startup.cs#L247), [Radarr](https://github.com/Radarr/Radarr/blob/a96bf7c3ecb23cb76993770727285dc17a613fbc/src/NzbDrone.Host/Startup.cs#L263), [Lidarr](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/NzbDrone.Host/Startup.cs#L263), [Prowlarr](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/NzbDrone.Host/Startup.cs#L262)). So the real path is `<UrlBase>/api/v3/...` and `<UrlBase>/ping`.
- **Request without the UrlBase prefix** → `UrlBaseMiddleware` answers **307** with `Location: <UrlBase><path><query>` ([Sonarr](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Http/Middleware/UrlBaseMiddleware.cs#L20-L23), [Radarr](https://github.com/Radarr/Radarr/blob/a96bf7c3ecb23cb76993770727285dc17a613fbc/src/Radarr.Http/Middleware/UrlBaseMiddleware.cs#L20-L23), [Lidarr](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/Lidarr.Http/Middleware/UrlBaseMiddleware.cs#L20-L23), [Prowlarr](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/Prowlarr.Http/Middleware/UrlBaseMiddleware.cs#L20-L23)). It runs *after* `UseAuthorization` ([Sonarr L257 vs L262](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/NzbDrone.Host/Startup.cs#L257)), so an un-prefixed API call without key gets 401, with key gets 307. **Always use the prefixed path**; treat 307 as "UrlBase misconfigured".
- **API key**: header `X-Api-Key`, or query `apikey`, or `Authorization: Bearer <key>` ([Sonarr handler](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Http/Authentication/ApiKeyAuthenticationHandler.cs#L41-L52), [scheme config](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Http/Authentication/AuthenticationBuilderExtensions.cs#L59-L63); same in [Radarr](https://github.com/Radarr/Radarr/blob/a96bf7c3ecb23cb76993770727285dc17a613fbc/src/Radarr.Http/Authentication/AuthenticationBuilderExtensions.cs#L55-L56), [Lidarr](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/Lidarr.Http/Authentication/AuthenticationBuilderExtensions.cs#L55-L56), [Prowlarr](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/Prowlarr.Http/Authentication/AuthenticationBuilderExtensions.cs#L55-L56)). Every endpoint not marked `[AllowAnonymous]` requires the `API` scheme via the fallback policy ([Sonarr](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/NzbDrone.Host/Startup.cs#L186), [Radarr](https://github.com/Radarr/Radarr/blob/a96bf7c3ecb23cb76993770727285dc17a613fbc/src/NzbDrone.Host/Startup.cs#L187), [Lidarr](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/NzbDrone.Host/Startup.cs#L187), [Prowlarr](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/NzbDrone.Host/Startup.cs#L186)). `AuthenticationMethod=External` only maps the **UI** policy to a no-op handler ([Sonarr AddExternal → NoAuthenticationHandler](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Http/Authentication/AuthenticationBuilderExtensions.cs#L31-L34), [UI policy uses AuthenticationMethod](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Http/Authentication/UiAuthorizationPolicyProvider.cs#L31)); the API still needs the key.
- **Wrong key** → 401 empty body ([handler](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Http/Authentication/ApiKeyAuthenticationHandler.cs#L82-L86)).
- **JSON**: System.Text.Json, camelCase properties, enums as camelCase strings (case-insensitive on input), nulls omitted on output ([Sonarr STJson](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/NzbDrone.Common/Serializer/System.Text.Json/STJson.cs#L27-L33), [used by MVC](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/NzbDrone.Host/Startup.cs#L91); identical in [Radarr](https://github.com/Radarr/Radarr/blob/a96bf7c3ecb23cb76993770727285dc17a613fbc/src/NzbDrone.Common/Serializer/System.Text.Json/STJson.cs#L33), [Lidarr](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/NzbDrone.Common/Serializer/System.Text.Json/STJson.cs#L33), [Prowlarr](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/NzbDrone.Common/Serializer/System.Text.Json/STJson.cs#L33)).
- **Response version header**: every `/api` response carries `X-Application-Version` ([Sonarr](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Http/Middleware/VersionMiddleware.cs#L10-L25)). Prowlarr relies on it when testing an application ([SonarrV3Proxy](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/NzbDrone.Core/Applications/Sonarr/SonarrV3Proxy.cs#L132)).
- **Create/Update responses**: POST returns **201** + the full resource (re-read by id); PUT returns **202** + full resource ([Sonarr RestController](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Http/REST/RestController.cs#L144-L154), [Radarr](https://github.com/Radarr/Radarr/blob/a96bf7c3ecb23cb76993770727285dc17a613fbc/src/Radarr.Http/REST/RestController.cs#L143-L149), [Lidarr](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/Lidarr.Http/REST/RestController.cs#L126-L132), [Prowlarr](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/Prowlarr.Http/REST/RestController.cs#L140-L146)). PUT routes are `/{id}`; if the body `id` is 0 the route id is copied in ([Sonarr](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Http/REST/RestController.cs#L86)).

### Provider resources (download clients, Prowlarr applications, indexer proxies)

Common shape `{ id, name, fields:[{name,value}], implementationName, implementation, configContract, infoLink, message, tags:[int], presets }` ([Sonarr ProviderResource](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Api.V3/ProviderResource.cs#L11-L20), [Lidarr](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/Lidarr.Api.V1/ProviderResource.cs#L13-L18), [Prowlarr](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/Prowlarr.Api.V1/ProviderResource.cs#L13-L18)).

- `implementation` = provider class name, `configContract` = settings class name ([ProviderFactory](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/NzbDrone.Core/ThingiProvider/ProviderFactory.cs#L55-L56)).
- **Field names** = camelCase of the C# property that has a `[FieldDefinition]` (not the Label) ([SchemaBuilder](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Http/ClientSchema/SchemaBuilder.cs#L134); same line in [Radarr](https://github.com/Radarr/Radarr/blob/a96bf7c3ecb23cb76993770727285dc17a613fbc/src/Radarr.Http/ClientSchema/SchemaBuilder.cs#L134), [Lidarr](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/Lidarr.Http/ClientSchema/SchemaBuilder.cs#L133), [Prowlarr](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/Prowlarr.Http/ClientSchema/SchemaBuilder.cs#L134)).
- **Missing fields fall back to the settings constructor defaults**: the server builds a *fresh* settings object and only copies fields present in the request ([SchemaBuilder.ReadFromSchema](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Http/ClientSchema/SchemaBuilder.cs#L52-L84)). E.g. omitting `port` on a SABnzbd client silently gives 8080, omitting `tvCategory` on qBittorrent gives `tv-sonarr`. **Always send every field.**
- **Secrets are masked on GET**: fields with privacy ApiKey/Password come back as `"********"` ([L40-L44](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Http/ClientSchema/SchemaBuilder.cs#L40-L44)); sending `"********"` back on PUT keeps the stored value ([L67-L75](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Http/ClientSchema/SchemaBuilder.cs#L67-L75)). Usernames are *not* masked.
- **Validation/test on save** (Sonarr [L81-L125](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Api.V3/ProviderControllerBase.cs#L81-L125), Radarr [same](https://github.com/Radarr/Radarr/blob/a96bf7c3ecb23cb76993770727285dc17a613fbc/src/Radarr.Api.V3/ProviderControllerBase.cs#L81-L125), Lidarr [L81-L127](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/Lidarr.Api.V1/ProviderControllerBase.cs#L81-L127), Prowlarr [L80-L109](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/Prowlarr.Api.V1/ProviderControllerBase.cs#L80-L109)):
  - Settings validation and the live connection test only run when the definition is **enabled** (`validate && (definition.Enable || forceValidate)` [Sonarr L172](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Api.V3/ProviderControllerBase.cs#L172); test guarded by `if (providerDefinition.Enable)` [L85-L88](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Api.V3/ProviderControllerBase.cs#L85-L88)).
  - **POST `?forceSave=true` does NOT skip the connection test.** It still calls `Test(def, includeWarnings: false)` ([L87](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Api.V3/ProviderControllerBase.cs#L87)); `VerifyValidationResult` then throws on *errors* and only ignores *warnings* ([L307-L319](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Api.V3/ProviderControllerBase.cs#L307-L319); `IsValid => Errors.Empty()` [NzbDroneValidationResult](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/NzbDrone.Core/Validation/NzbDroneValidationResult.cs#L56)). "Unable to connect" is an error → 400 even with forceSave.
  - **PUT `?forceSave=true` skips the test entirely** (`if (Enable && !forceSave && hasDefinitionChanged)` [Sonarr L114](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Api.V3/ProviderControllerBase.cs#L114); Prowlarr [L102](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/Prowlarr.Api.V1/ProviderControllerBase.cs#L102)); settings validation still runs (errors only).
  - The web UI only sets forceSave when the user re-submits an identical body ([frontend](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/frontend/src/Store/Actions/Creators/createSaveProviderHandler.js#L38)).
  - Recipe to store a provider while the target is not reachable yet: POST with `enable:false` (download client) / `syncLevel:"disabled"` (Prowlarr app) / no tags (indexer proxy), later PUT the enabled version with `?forceSave=true`.
- Other endpoints on every provider controller: `GET /schema` (templates incl. all fields + defaults, [L197](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Api.V3/ProviderControllerBase.cs#L197)), `POST /test` (body = resource; 200 `{}` or 400 failures, [L221-L231](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Api.V3/ProviderControllerBase.cs#L221-L231)), `POST /testall`, `PUT/DELETE /bulk`, `DELETE /{id}`.
- Name must be unique (case-insensitive) per provider type ([L45](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Api.V3/ProviderControllerBase.cs#L45)) → 400 `"Should be unique"`. Use the name as the idempotency key.

---

## 1. Health / readiness

| | Sonarr | Radarr | Lidarr | Prowlarr |
|---|---|---|---|---|
| Liveness (anonymous) | `GET http://localhost:8989/apps/sonarr/ping` | `GET http://localhost:7878/apps/radarr/ping` | `GET http://localhost:8686/apps/lidarr/ping` | `GET http://localhost:9696/apps/prowlarr/ping` |
| Readiness (key) | `GET .../apps/sonarr/api/v3/system/status` | `GET .../apps/radarr/api/v3/system/status` | `GET .../apps/lidarr/api/v1/system/status` | `GET .../apps/prowlarr/api/v1/system/status` |

- `/ping` is `[AllowAnonymous] [HttpGet("/ping")] [HttpHead("/ping")]`, reads the config table (5 s cache) and returns `200 {"status":"OK"}` or `500 {"status":"Error"}` if the DB read throws ([Sonarr](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Http/Ping/PingController.cs#L23-L44), [Radarr](https://github.com/Radarr/Radarr/blob/a96bf7c3ecb23cb76993770727285dc17a613fbc/src/Radarr.Http/Ping/PingController.cs#L22-L42), [Lidarr](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/Lidarr.Http/Ping/PingController.cs#L22-L42), [Prowlarr](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/Prowlarr.Http/Ping/PingController.cs#L23-L43)). Un-prefixed `/ping` → 307 (see §0).
- `system/status` fields ([Sonarr](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Api.V3/System/SystemController.cs#L56-L92), [Radarr](https://github.com/Radarr/Radarr/blob/a96bf7c3ecb23cb76993770727285dc17a613fbc/src/Radarr.Api.V3/System/SystemController.cs#L56-L92), [Lidarr](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/Lidarr.Api.V1/System/SystemController.cs#L56-L93), [Prowlarr](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/Prowlarr.Api.V1/System/SystemController.cs#L56-L93)): `appName, instanceName, version, buildTime, isDebug, isProduction, isAdmin, isUserInteractive, startupPath, appData, osName, osVersion, isNetCore, isLinux, isOsx, isWindows, isDocker, (isContainerized: Radarr/Lidarr/Prowlarr), mode, branch, authentication, databaseType, databaseVersion, migrationVersion, urlBase, runtimeVersion, runtimeName, startTime, packageVersion, packageAuthor, packageUpdateMechanism, packageUpdateMechanismMessage`. **Validate**: HTTP 200, `appName` (`Sonarr`/`Radarr`/`Lidarr`/`Prowlarr`), `version` starts with expected `4.0.20`/`6.4.4`/`3.1.6`/`2.7.0`, `urlBase == "/apps/<name>"`, `authentication == "external"` (enum → camelCase string).
- **Startup phases as seen by a client:**
  1. **DB init/migrations run inside `Startup.Configure` before Kestrel listens** (`_ = mainDatabaseFactory.Value; // instantiate the databases to initialize/migrate them` — [Sonarr](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/NzbDrone.Host/Startup.cs#L221-L222), [Radarr](https://github.com/Radarr/Radarr/blob/a96bf7c3ecb23cb76993770727285dc17a613fbc/src/NzbDrone.Host/Startup.cs#L238), [Lidarr](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/NzbDrone.Host/Startup.cs#L238), [Prowlarr](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/NzbDrone.Host/Startup.cs#L237)) → client sees **connection refused** during migration.
  2. Listening but `IsStarting == true` → `StartingUpMiddleware` returns **503**: for `/api/...` `{"errorMessage":"Sonarr is starting up, please try again later"}` (application/json), otherwise the same text as text/plain ([Sonarr](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Http/Middleware/StartingUpMiddleware.cs#L12-L35), [Radarr](https://github.com/Radarr/Radarr/blob/a96bf7c3ecb23cb76993770727285dc17a613fbc/src/Radarr.Http/Middleware/StartingUpMiddleware.cs#L12-L30), [Lidarr](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/Lidarr.Http/Middleware/StartingUpMiddleware.cs#L12-L30), [Prowlarr](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/Prowlarr.Http/Middleware/StartingUpMiddleware.cs#L12-L30); "is API" = path starts with `/api` [RequestExtensions](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Http/Extensions/RequestExtensions.cs#L41-L43)). It sits after auth, so a bad key still yields 401 first. `/ping` is also 503 in this phase.
  3. `IsStarting=false` is set **just before** `ApplicationStartedEvent` is published ([Sonarr AppLifetime](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/NzbDrone.Host/AppLifetime.cs#L58-L67), [Radarr](https://github.com/Radarr/Radarr/blob/a96bf7c3ecb23cb76993770727285dc17a613fbc/src/NzbDrone.Host/AppLifetime.cs#L57-L66), [Lidarr](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/NzbDrone.Host/AppLifetime.cs#L57-L66), [Prowlarr](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/NzbDrone.Host/AppLifetime.cs#L57-L66)). Default quality/metadata/app profiles are created by handlers of that event (§7, §8, §6.2) → a brief window exists where `system/status` is 200 but `qualityprofile` is still `[]`. **Readiness = status 200 AND (for Lidarr) `qualityprofile` + `metadataprofile` non-empty; (for Prowlarr) `appprofile` non-empty; (Sonarr/Radarr) `qualityprofile` non-empty.** Poll with backoff.

```bash
curl -s -H "X-Api-Key: $SONARR_KEY" http://localhost:8989/apps/sonarr/api/v3/system/status
```

---

## 2. Download clients (Sonarr / Radarr / Lidarr)

Endpoints: `GET|POST {base}{API}/downloadclient`, `GET|PUT|DELETE {base}{API}/downloadclient/{id}`, `GET .../downloadclient/schema`, `POST .../downloadclient/test` ([Sonarr controller](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Api.V3/DownloadClient/DownloadClientController.cs#L7-L14), [Radarr](https://github.com/Radarr/Radarr/blob/a96bf7c3ecb23cb76993770727285dc17a613fbc/src/Radarr.Api.V3/DownloadClient/DownloadClientController.cs#L8-L17), [Lidarr](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/Lidarr.Api.V1/DownloadClient/DownloadClientController.cs#L8-L17)).

Top-level resource fields: `enable, protocol, priority, removeCompletedDownloads, removeFailedDownloads` + provider fields ([Sonarr](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Api.V3/DownloadClient/DownloadClientResource.cs#L8-L12), [Radarr](https://github.com/Radarr/Radarr/blob/a96bf7c3ecb23cb76993770727285dc17a613fbc/src/Radarr.Api.V3/DownloadClient/DownloadClientResource.cs#L8-L12), [Lidarr](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/Lidarr.Api.V1/DownloadClient/DownloadClientResource.cs#L7-L11)).

- `removeCompletedDownloads` / `removeFailedDownloads` default to `true` on the *definition* ([Sonarr](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/NzbDrone.Core/Download/DownloadClientDefinition.cs#L15-L18), [Radarr](https://github.com/Radarr/Radarr/blob/a96bf7c3ecb23cb76993770727285dc17a613fbc/src/NzbDrone.Core/Download/DownloadClientDefinition.cs#L15-L17), [Lidarr](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/NzbDrone.Core/Download/DownloadClientDefinition.cs#L8-L10)) but the API **resource** bools default to `false` and are copied verbatim ([Sonarr mapper](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Api.V3/DownloadClient/DownloadClientResource.cs#L35-L50)) → **send them explicitly** (`true` = Servarr removes the item from the client after import; this is the "remove completed" setting in v4+, there is no global one any more).
- `priority`: definition default 1; Radarr and Lidarr validate 1–50 ([Radarr](https://github.com/Radarr/Radarr/blob/a96bf7c3ecb23cb76993770727285dc17a613fbc/src/Radarr.Api.V3/DownloadClient/DownloadClientController.cs#L17), [Lidarr](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/Lidarr.Api.V1/DownloadClient/DownloadClientController.cs#L17)); Sonarr has no rule at this commit (send 1 anyway).
- `protocol` is not persisted ([Sonarr TableMapping](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/NzbDrone.Core/Datastore/TableMapping.cs#L108-L110), [Lidarr](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/NzbDrone.Core/Datastore/TableMapping.cs#L103-L105)) and is overwritten from the implementation on read ([DownloadClientFactory](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/NzbDrone.Core/Download/DownloadClientFactory.cs#L42)). Values: Sonarr/Radarr enum `"torrent"`/`"usenet"` ([TorrentClientBase](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/NzbDrone.Core/Download/TorrentClientBase.cs#L44), [UsenetClientBase](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/NzbDrone.Core/Download/UsenetClientBase.cs#L36)); **Lidarr uses strings `"TorrentDownloadProtocol"` / `"UsenetDownloadProtocol"`** ([Lidarr](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/NzbDrone.Core/Download/TorrentClientBase.cs#L44), [usenet](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/NzbDrone.Core/Download/UsenetClientBase.cs#L36)).
- `implementation`/`configContract`: `QBittorrent`/`QBittorrentSettings` and `Sabnzbd`/`SabnzbdSettings` (class names: [Sonarr QBittorrent](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/NzbDrone.Core/Download/Clients/QBittorrent/QBittorrent.cs#L21), [Sabnzbd](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/NzbDrone.Core/Download/Clients/Sabnzbd/Sabnzbd.cs#L20); same in [Radarr](https://github.com/Radarr/Radarr/blob/a96bf7c3ecb23cb76993770727285dc17a613fbc/src/NzbDrone.Core/Download/Clients/QBittorrent/QBittorrent.cs#L21), [Lidarr](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/NzbDrone.Core/Download/Clients/QBittorrent/QBittorrent.cs#L21)).

### 2.1 qBittorrent fields

| field name | type | Sonarr | Radarr | Lidarr | notes |
|---|---|---|---|---|---|
| `host` | string | ✔ | ✔ | ✔ | default `localhost` |
| `port` | int | ✔ | ✔ | ✔ | default **8080** → must send 8090 |
| `useSsl` | bool | ✔ | ✔ | ✔ | |
| `urlBase` | string | ✔ | ✔ | ✔ | must not be a full URL |
| `apiKey` | string (masked) | ✔ | ✔ | ✔ | qBittorrent API key; if set, username/password **must be empty** |
| `username` | string | ✔ | ✔ | ✔ | |
| `password` | string (masked) | ✔ | ✔ | ✔ | |
| category | string | `tvCategory` (default `tv-sonarr`) | `movieCategory` (default `radarr`) | `musicCategory` (default `lidarr`) | no `\`, no `//`, no leading/trailing `/` |
| post-import category | string | `tvImportedCategory` | `movieImportedCategory` | `musicImportedCategory` | |
| recent priority | int 0=Last,1=First | `recentTvPriority` | `recentMoviePriority` | `recentMusicPriority` | ≠0 requires qBit queueing enabled |
| older priority | int | `olderTvPriority` | `olderMoviePriority` | `olderMusicPriority` | |
| `initialState` | int 0=Start,1=ForceStart,2=Stop | ✔ | ✔ | ✔ | |
| `sequentialOrder` | bool | ✔ | ✔ | ✔ | |
| `firstAndLast` | bool | ✔ | ✔ | ✔ | |
| `contentLayout` | int 0=Default,1=Original,2=Subfolder | ✔ | ✔ | ✔ | |

Sources: Sonarr settings [L8-L84](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/NzbDrone.Core/Download/Clients/QBittorrent/QBittorrentSettings.cs#L8-L84) (category default [L36](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/NzbDrone.Core/Download/Clients/QBittorrent/QBittorrentSettings.cs#L36)); Radarr [L8-L84](https://github.com/Radarr/Radarr/blob/a96bf7c3ecb23cb76993770727285dc17a613fbc/src/NzbDrone.Core/Download/Clients/QBittorrent/QBittorrentSettings.cs#L8-L84) (default [L36](https://github.com/Radarr/Radarr/blob/a96bf7c3ecb23cb76993770727285dc17a613fbc/src/NzbDrone.Core/Download/Clients/QBittorrent/QBittorrentSettings.cs#L36)); Lidarr [L9-L83](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/NzbDrone.Core/Download/Clients/QBittorrent/QBittorrentSettings.cs#L9-L83) (default [L37](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/NzbDrone.Core/Download/Clients/QBittorrent/QBittorrentSettings.cs#L37)); enums [QBittorrentPriority](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/NzbDrone.Core/Download/Clients/QBittorrent/QBittorrentPriority.cs#L5), [QBittorrentState](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/NzbDrone.Core/Download/Clients/QBittorrent/QBittorrentState.cs#L8-L14), [QBittorrentContentLayout](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/NzbDrone.Core/Download/Clients/QBittorrent/QBittorrentContentLayout.cs#L5).

What the connection test does (runs on POST/PUT when enabled):
- Auth failure → error on `ApiKey`/`Username`; connect failure → error on `Host` ([Sonarr QBittorrent.cs L474-L503](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/NzbDrone.Core/Download/Clients/QBittorrent/QBittorrent.cs#L474-L503)).
- **Error** if qBittorrent is configured to *remove* torrents when the share ratio/seed-time limit is reached ([L466-L473](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/NzbDrone.Core/Download/Clients/QBittorrent/QBittorrent.cs#L466-L473)) → EasyArr's qBittorrent seed config must use "pause/stop", not "remove".
- **Creates the category in qBittorrent if missing** (`Proxy.AddLabel`, no save path) ([L527-L539](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/NzbDrone.Core/Download/Clients/QBittorrent/QBittorrent.cs#L527-L539); Radarr [L527](https://github.com/Radarr/Radarr/blob/a96bf7c3ecb23cb76993770727285dc17a613fbc/src/NzbDrone.Core/Download/Clients/QBittorrent/QBittorrent.cs#L527), Lidarr [L526](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/NzbDrone.Core/Download/Clients/QBittorrent/QBittorrent.cs#L526)). Pre-create `tv`/`movies`/`music` with the right save paths in qBittorrent first so the auto-created ones don't win.
- Warning (not error) if category empty ([L456-L463](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/NzbDrone.Core/Download/Clients/QBittorrent/QBittorrent.cs#L456-L463)).

**Sonarr – add qBittorrent** `POST http://localhost:8989/apps/sonarr/api/v3/downloadclient`
```json
{
  "enable": true,
  "protocol": "torrent",
  "priority": 1,
  "removeCompletedDownloads": true,
  "removeFailedDownloads": true,
  "name": "qBittorrent",
  "implementation": "QBittorrent",
  "configContract": "QBittorrentSettings",
  "tags": [],
  "fields": [
    { "name": "host", "value": "localhost" },
    { "name": "port", "value": 8090 },
    { "name": "useSsl", "value": false },
    { "name": "urlBase", "value": "" },
    { "name": "apiKey", "value": "" },
    { "name": "username", "value": "QBIT_USER" },
    { "name": "password", "value": "QBIT_PASS" },
    { "name": "tvCategory", "value": "tv" },
    { "name": "tvImportedCategory", "value": "" },
    { "name": "recentTvPriority", "value": 0 },
    { "name": "olderTvPriority", "value": 0 },
    { "name": "initialState", "value": 0 },
    { "name": "sequentialOrder", "value": false },
    { "name": "firstAndLast", "value": false },
    { "name": "contentLayout", "value": 0 }
  ]
}
```
**Radarr** (`POST http://localhost:7878/apps/radarr/api/v3/downloadclient`): identical but `"tvCategory"→"movieCategory":"movies"`, `"tvImportedCategory"→"movieImportedCategory"`, `"recentTvPriority"→"recentMoviePriority"`, `"olderTvPriority"→"olderMoviePriority"`.
**Lidarr** (`POST http://localhost:8686/apps/lidarr/api/v1/downloadclient`): `"protocol":"TorrentDownloadProtocol"`, `musicCategory:"music"`, `musicImportedCategory`, `recentMusicPriority`, `olderMusicPriority`.

### 2.2 SABnzbd fields

| field | Sonarr | Radarr | Lidarr | notes |
|---|---|---|---|---|
| `host`, `port` (default 8080), `useSsl`, `urlBase` | ✔ | ✔ | ✔ | |
| `apiKey` (masked) | ✔ | ✔ | ✔ | required unless username+password given |
| `username`, `password` (masked) | ✔ | ✔ | ✔ | |
| category | `tvCategory` (default `tv`) | `movieCategory` (default `movies`) | `musicCategory` (default `music`) | empty → *warning* "A category is recommended" |
| recent / older priority | `recentTvPriority`/`olderTvPriority` | `recentMoviePriority`/`olderMoviePriority` | `recentMusicPriority`/`olderMusicPriority` | int: -100=Default, -2=Paused, -1=Low, 0=Normal, 1=High, 2=Force; default -100 |

Sources: [Sonarr](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/NzbDrone.Core/Download/Clients/Sabnzbd/SabnzbdSettings.cs#L8-L78), [Radarr](https://github.com/Radarr/Radarr/blob/a96bf7c3ecb23cb76993770727285dc17a613fbc/src/NzbDrone.Core/Download/Clients/Sabnzbd/SabnzbdSettings.cs#L8-L78), [Lidarr](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/NzbDrone.Core/Download/Clients/Sabnzbd/SabnzbdSettings.cs#L9-L76), [SabnzbdPriority](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/NzbDrone.Core/Download/Clients/Sabnzbd/SabnzbdPriority.cs#L5-L10).
Test errors to expect: category not defined in SABnzbd ([Sonarr L475](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/NzbDrone.Core/Download/Clients/Sabnzbd/Sabnzbd.cs#L475)), job folders disabled ([L464](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/NzbDrone.Core/Download/Clients/Sabnzbd/Sabnzbd.cs#L464)), TV/movie/date sorting enabled for the category ([L486-L513](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/NzbDrone.Core/Download/Clients/Sabnzbd/Sabnzbd.cs#L486-L513)). → SABnzbd categories `tv/movies/music` must exist (with dirs under `/data/downloads/usenet/complete/...`), sorting off.

**Sonarr – add SABnzbd** `POST http://localhost:8989/apps/sonarr/api/v3/downloadclient`
```json
{
  "enable": true,
  "protocol": "usenet",
  "priority": 1,
  "removeCompletedDownloads": true,
  "removeFailedDownloads": true,
  "name": "SABnzbd",
  "implementation": "Sabnzbd",
  "configContract": "SabnzbdSettings",
  "tags": [],
  "fields": [
    { "name": "host", "value": "localhost" },
    { "name": "port", "value": 8080 },
    { "name": "useSsl", "value": false },
    { "name": "urlBase", "value": "" },
    { "name": "apiKey", "value": "SAB_API_KEY" },
    { "name": "username", "value": "" },
    { "name": "password", "value": "" },
    { "name": "tvCategory", "value": "tv" },
    { "name": "recentTvPriority", "value": -100 },
    { "name": "olderTvPriority", "value": -100 }
  ]
}
```
Radarr: `movieCategory:"movies"`, `recentMoviePriority`, `olderMoviePriority`. Lidarr: `"protocol":"UsenetDownloadProtocol"`, `musicCategory:"music"`, `recentMusicPriority`, `olderMusicPriority`.

List: `GET .../downloadclient` → array sorted by name. **Validate** per item: `implementation`, `enable`, field values for host/port/category (ignore masked secrets), `removeCompletedDownloads`.

### 2.3 Completed download handling (global)

`GET|PUT {base}{API}/config/downloadclient/1` ([Sonarr](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Api.V3/Config/DownloadClientConfigController.cs#L6), [Radarr](https://github.com/Radarr/Radarr/blob/a96bf7c3ecb23cb76993770727285dc17a613fbc/src/Radarr.Api.V3/Config/DownloadClientConfigController.cs#L6), [Lidarr](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/Lidarr.Api.V1/Config/DownloadClientConfigController.cs#L6)). Fields:
- Sonarr: `id, downloadClientWorkingFolders, enableCompletedDownloadHandling, autoRedownloadFailed, autoRedownloadFailedFromInteractiveSearch` ([resource](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Api.V3/Config/DownloadClientConfigResource.cs#L8-L12)).
- Radarr: + `checkForFinishedDownloadInterval` (default 1) ([resource](https://github.com/Radarr/Radarr/blob/a96bf7c3ecb23cb76993770727285dc17a613fbc/src/Radarr.Api.V3/Config/DownloadClientConfigResource.cs#L8-L14), [default](https://github.com/Radarr/Radarr/blob/a96bf7c3ecb23cb76993770727285dc17a613fbc/src/NzbDrone.Core/Configuration/ConfigService.cs#L229)).
- Lidarr: same as Sonarr ([resource](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/Lidarr.Api.V1/Config/DownloadClientConfigResource.cs#L8-L11)).
- Defaults: CDH `true`, autoRedownloadFailed `true`, …FromInteractiveSearch `true`, workingFolders `_UNPACK_|_FAILED_` ([Sonarr ConfigService](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/NzbDrone.Core/Configuration/ConfigService.cs#L136-L178), [Radarr](https://github.com/Radarr/Radarr/blob/a96bf7c3ecb23cb76993770727285dc17a613fbc/src/NzbDrone.Core/Configuration/ConfigService.cs#L160-L223), [Lidarr](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/NzbDrone.Core/Configuration/ConfigService.cs#L135-L177)).
- Remove-completed is per download client (§2), not here.

```json
{ "id": 1, "downloadClientWorkingFolders": "_UNPACK_|_FAILED_", "enableCompletedDownloadHandling": true, "autoRedownloadFailed": true, "autoRedownloadFailedFromInteractiveSearch": true }
```
(Radarr adds `"checkForFinishedDownloadInterval": 1`.)

**Config PUT semantics (all `config/*` controllers):** the controller reflects *every* public property of the deserialized body into `SaveConfigDictionary` ([Sonarr ConfigController](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Api.V3/Config/ConfigController.cs#L35-L46)); `SaveConfigDictionary` skips `null` values and writes only values whose string form differs ([Sonarr](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/NzbDrone.Core/Configuration/ConfigService.cs#L55-L76), [Radarr](https://github.com/Radarr/Radarr/blob/a96bf7c3ecb23cb76993770727285dc17a613fbc/src/NzbDrone.Core/Configuration/ConfigService.cs#L54-L61), [Lidarr](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/NzbDrone.Core/Configuration/ConfigService.cs#L53-L60)). Omitted strings are null → untouched, but **omitted bools/ints deserialize as false/0 and ARE written**. → Always GET, modify, PUT the full object.

---

## 3. Root folders

Sonarr `POST http://localhost:8989/apps/sonarr/api/v3/rootfolder` → `{"path":"/data/media/tv"}`; Radarr `POST http://localhost:7878/apps/radarr/api/v3/rootfolder` → `{"path":"/data/media/movies"}`.
- Resource: `id, path, accessible, freeSpace, unmappedFolders` ([Sonarr](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Api.V3/RootFolders/RootFolderResource.cs#L11-L15), [Radarr](https://github.com/Radarr/Radarr/blob/a96bf7c3ecb23cb76993770727285dc17a613fbc/src/Radarr.Api.V3/RootFolders/RootFolderResource.cs#L11-L15)). No PUT (spec has only GET/POST/DELETE).
- Validators on `path`: not already a root folder, path exists, writable, not system/startup/recycle-bin folder ([Sonarr L32-L41](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Api.V3/RootFolders/RootFolderController.cs#L32-L41), [Radarr](https://github.com/Radarr/Radarr/blob/a96bf7c3ecb23cb76993770727285dc17a613fbc/src/Radarr.Api.V3/RootFolders/RootFolderController.cs#L32-L41)). → the directory must exist and be writable by the app user **before** POST; POSTing an existing path gives 400 (idempotency: GET list, match `path`, skip).

Lidarr `POST http://localhost:8686/apps/lidarr/api/v1/rootfolder` — extra required fields ([resource](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/Lidarr.Api.V1/RootFolders/RootFolderResource.cs#L12-L20)): `name` (NotEmpty), `defaultMetadataProfileId` and `defaultQualityProfileId` (valid id > 0 that exists) ([controller L35-L57](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/Lidarr.Api.V1/RootFolders/RootFolderController.cs#L35-L57)), `defaultMonitorOption` (`all|future|missing|existing|latest|first|none|unknown`, [enum](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/NzbDrone.Core/Music/Model/MonitorTypes.cs#L3-L13)), `defaultNewItemMonitorOption` (`all|none|new`, [enum](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/NzbDrone.Core/Music/Model/NewItemMonitorTypes.cs#L3-L8)), `defaultTags` (null → `[]`, [mapper](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/Lidarr.Api.V1/RootFolders/RootFolderResource.cs#L70)).
```json
{
  "name": "Music",
  "path": "/data/media/music",
  "defaultMetadataProfileId": 1,
  "defaultQualityProfileId": 2,
  "defaultMonitorOption": "all",
  "defaultNewItemMonitorOption": "all",
  "defaultTags": []
}
```
Resolve the two ids by **name** from `GET /api/v1/metadataprofile` and `GET /api/v1/qualityprofile` (never hard-code). Lidarr has `PUT /api/v1/rootfolder/{id}` but the path cannot change ([L76-L88](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/Lidarr.Api.V1/RootFolders/RootFolderController.cs#L76-L88): `"Cannot edit root folder path"`).

---

## 4. Media management (hardlinks) and naming

`GET|PUT {base}{API}/config/mediamanagement/1` ([Sonarr](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Api.V3/Config/MediaManagementConfigController.cs#L10), [Radarr](https://github.com/Radarr/Radarr/blob/a96bf7c3ecb23cb76993770727285dc17a613fbc/src/Radarr.Api.V3/Config/MediaManagementConfigController.cs#L10), [Lidarr](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/Lidarr.Api.V1/Config/MediaManagementConfigController.cs#L10)). GET, set `copyUsingHardlinks: true`, PUT the whole object (§2.3 semantics).
- `copyUsingHardlinks` default **true** in all three ([Sonarr](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/NzbDrone.Core/Configuration/ConfigService.cs#L206), [Radarr](https://github.com/Radarr/Radarr/blob/a96bf7c3ecb23cb76993770727285dc17a613fbc/src/NzbDrone.Core/Configuration/ConfigService.cs#L258), [Lidarr](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/NzbDrone.Core/Configuration/ConfigService.cs#L205)) — enforce anyway.
- Sonarr fields ([resource](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Api.V3/Config/MediaManagementConfigResource.cs#L11-L32)): `autoUnmonitorPreviouslyDownloadedEpisodes, recycleBin, recycleBinCleanupDays, downloadPropersAndRepacks, createEmptySeriesFolders, deleteEmptyFolders, fileDate, rescanAfterRefresh, setPermissionsLinux, chmodFolder, chownGroup, episodeTitleRequired, skipFreeSpaceCheckWhenImporting, minimumFreeSpaceWhenImporting, copyUsingHardlinks, useScriptImport, scriptImportPath, importExtraFiles, extraFileExtensions, enableMediaInfo`.
- Radarr ([resource](https://github.com/Radarr/Radarr/blob/a96bf7c3ecb23cb76993770727285dc17a613fbc/src/Radarr.Api.V3/Config/MediaManagementConfigResource.cs#L10-L32)): `autoUnmonitorPreviouslyDownloadedMovies, … createEmptyMovieFolders, … autoRenameFolders, pathsDefaultStatic, …` (no episodeTitleRequired).
- Lidarr ([resource](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/Lidarr.Api.V1/Config/MediaManagementConfigResource.cs#L10-L32)): `autoUnmonitorPreviouslyDownloadedTracks, … createEmptyArtistFolders, … watchLibraryForChanges, rescanAfterRefresh, allowFingerprinting, …`.
- Validation: `minimumFreeSpaceWhenImporting >= 100`, `recycleBinCleanupDays >= 0`, `recycleBin` (if set) must exist/be writable/not a root folder ([Sonarr L24-L39](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Api.V3/Config/MediaManagementConfigController.cs#L24-L39)).

Naming: `GET|PUT {base}{API}/config/naming/1` ([Sonarr](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Api.V3/Config/NamingConfigController.cs#L14-L57), [Radarr](https://github.com/Radarr/Radarr/blob/a96bf7c3ecb23cb76993770727285dc17a613fbc/src/Radarr.Api.V3/Config/NamingConfigController.cs#L14-L48), [Lidarr](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/Lidarr.Api.V1/Config/NamingConfigController.cs#L14-L64)). Rename is **off** by default: `RenameEpisodes=false` ([Sonarr NamingConfig](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/NzbDrone.Core/Organizer/NamingConfig.cs#L7-L19): standard `{Series Title} - S{season:00}E{episode:00} - {Episode Title} {Quality Full}`, series folder `{Series Title}`, season folder `Season {season}`), `RenameMovies=false` ([Radarr](https://github.com/Radarr/Radarr/blob/a96bf7c3ecb23cb76993770727285dc17a613fbc/src/NzbDrone.Core/Organizer/NamingConfig.cs#L7-L13): `{Movie Title} ({Release Year}) {Quality Full}`, folder `{Movie Title} ({Release Year})`), `RenameTracks=false` ([Lidarr](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/NzbDrone.Core/Organizer/NamingConfig.cs#L7-L14)). Resource field types differ: `colonReplacementFormat` is an **int** in Sonarr/Lidarr ([Sonarr](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Api.V3/Config/NamingConfigResource.cs#L9), [Lidarr](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/Lidarr.Api.V1/Config/NamingConfigResource.cs#L9)) but an **enum string** in Radarr ([Radarr](https://github.com/Radarr/Radarr/blob/a96bf7c3ecb23cb76993770727285dc17a613fbc/src/Radarr.Api.V3/Config/NamingConfigResource.cs#L10)). Formats are validated server-side (e.g. Sonarr [L32-L39](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Api.V3/Config/NamingConfigController.cs#L32-L39)) — GET, flip `rename*`, PUT back.

---

## 5. Tags

`GET {base}{API}/tag` → `[{id,label}]`; `POST {base}{API}/tag` with `{"label":"flaresolverr"}`; also `GET|PUT|DELETE /tag/{id}` ([Sonarr](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Api.V3/Tags/TagController.cs#L33-L50)).
- **POST is idempotent**: if a tag with that label exists it is returned instead of inserted; labels are lower-cased on insert ([Sonarr TagService](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/NzbDrone.Core/Tags/TagService.cs#L156-L165), [Radarr](https://github.com/Radarr/Radarr/blob/a96bf7c3ecb23cb76993770727285dc17a613fbc/src/NzbDrone.Core/Tags/TagService.cs#L156-L163), [Lidarr](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/NzbDrone.Core/Tags/TagService.cs#L158-L165), [Prowlarr](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/NzbDrone.Core/Tags/TagService.cs#L123-L130)). Response is 201 with the (existing or new) tag.
- Label rules: Radarr and Prowlarr enforce `^[a-z0-9-]+$` ([Radarr](https://github.com/Radarr/Radarr/blob/a96bf7c3ecb23cb76993770727285dc17a613fbc/src/Radarr.Api.V3/Tags/TagController.cs#L29-L31), [Prowlarr](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/Prowlarr.Api.V1/Tags/TagController.cs#L26-L28)); Lidarr only NotEmpty ([L28](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/Lidarr.Api.V1/Tags/TagController.cs#L28)); Sonarr has no rule at this commit. Use `[a-z0-9-]` everywhere.
- Attaching: every provider resource has `tags: [int]` (§0). Semantics in Sonarr/Radarr/Lidarr: a download client **with** tags is only used for series/movies/artists sharing a tag; untagged clients serve everything else ([Sonarr DownloadClientProvider](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/NzbDrone.Core/Download/DownloadClientProvider.cs#L41-L57), [Radarr](https://github.com/Radarr/Radarr/blob/a96bf7c3ecb23cb76993770727285dc17a613fbc/src/NzbDrone.Core/Download/DownloadClientProvider.cs#L53-L57), [Lidarr](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/NzbDrone.Core/Download/DownloadClientProvider.cs#L53-L57)). → EasyArr should leave download-client tags empty.
- Prowlarr: tags on an **application** restrict which indexers sync to it (no tags = all indexers; else intersection) ([ApplicationService](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/NzbDrone.Core/Applications/ApplicationService.cs#L205-L225)); tags on an **indexer proxy** decide which indexers use it (§6.3).

---

## 6. Prowlarr

### 6.1 Applications

`GET|POST http://localhost:9696/apps/prowlarr/api/v1/applications`, `GET|PUT|DELETE .../applications/{id}`, `GET .../applications/schema` ([controller](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/Prowlarr.Api.V1/Applications/ApplicationController.cs#L7)). Resource = provider resource + `syncLevel` (`disabled|addOnly|fullSync`, [enum](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/NzbDrone.Core/Applications/ApplicationSyncLevel.cs#L5-L7)) + read-only `enable` (derived: `syncLevel` is addOnly/fullSync, [definition](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/NzbDrone.Core/Applications/ApplicationDefinition.cs#L7-L9); `enable` in the body is ignored by the mapper [L33-L43](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/Prowlarr.Api.V1/Applications/ApplicationResource.cs#L33-L43)) + `testCommand`.

Settings fields (`implementation` = `Sonarr`/`Radarr`/`Lidarr` [class](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/NzbDrone.Core/Applications/Sonarr/Sonarr.cs#L17), `configContract` = `SonarrSettings`/`RadarrSettings`/`LidarrSettings`):

| field | Sonarr | Radarr | Lidarr |
|---|---|---|---|
| `prowlarrUrl` (valid URL) | ✔ default `http://localhost:9696` | ✔ | ✔ |
| `baseUrl` (valid URL) | ✔ default `http://localhost:8989` | ✔ default `:7878` | ✔ default `:8686` |
| `apiKey` (masked, NotEmpty) | ✔ | ✔ | ✔ |
| `authUsername`, `authPassword` | ✔ (basic auth to the app, optional) | ✔ | ✔ |
| `syncCategories` (int[]) | default `[5000,5010,5020,5030,5040,5045,5050,5090]` | default `[2000,2010,2020,2030,2040,2045,2050,2060,2070,2080,2090]` (NotEmpty) | default `[3000,3010,3030,3040,3050,3060]` |
| `animeSyncCategories` (int[]) | default `[5070]` | – | – |
| `syncAnimeStandardFormatSearch` (bool) | default true | – | – |
| `syncRejectBlocklistedTorrentHashesWhileGrabbing` (bool) | ✔ | ✔ | ✔ |

Sources: [SonarrSettings](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/NzbDrone.Core/Applications/Sonarr/SonarrSettings.cs#L9-L56), [RadarrSettings](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/NzbDrone.Core/Applications/Radarr/RadarrSettings.cs#L9-L50), [LidarrSettings](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/NzbDrone.Core/Applications/Lidarr/LidarrSettings.cs#L9-L49).

**UrlBase handling (answer: both URLs must contain the sub-path):**
- `baseUrl` is used verbatim (trailing `/` trimmed) as the root for `/api/v3/...` calls to the app ([SonarrV3Proxy L29-L30, L197-L202](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/NzbDrone.Core/Applications/Sonarr/SonarrV3Proxy.cs#L197-L202)) → must be `http://localhost:8989/apps/sonarr`. Without the prefix the app answers 307 and the test reports `"Sonarr URL is invalid, Prowlarr cannot connect to Sonarr - are you missing a URL base?"` ([Sonarr.cs L66-L69](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/NzbDrone.Core/Applications/Sonarr/Sonarr.cs#L66-L69)).
- `prowlarrUrl` becomes the Torznab/Newznab `baseUrl` written into the app's indexer: `{prowlarrUrl}/{indexerId}/` ([Sonarr.cs L269](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/NzbDrone.Core/Applications/Sonarr/Sonarr.cs#L269)); Prowlarr serves `{id}/api` under its own PathBase ([NewznabController](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/Prowlarr.Api.V1/Indexers/NewznabController.cs#L58)). → must be `http://localhost:9696/apps/prowlarr`. Existing-indexer matching uses `baseUrl.StartsWith(prowlarrUrl)` and the regex `/(\d{1,3})(/(api)?/?)?$` ([Sonarr.cs L106](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/NzbDrone.Core/Applications/Sonarr/Sonarr.cs#L106), [regex](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/NzbDrone.Core/Applications/ApplicationBase.cs#L19)), so changing `prowlarrUrl` later orphans/duplicates indexers in the apps — pick it once.
- Test performed on POST/PUT (when enabled): Prowlarr POSTs a dummy indexer (id 0, `baseUrl={prowlarrUrl}/0/`) to `{baseUrl}/api/v3/indexer/test` ([SonarrV3Proxy L124-L144](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/NzbDrone.Core/Applications/Sonarr/SonarrV3Proxy.cs#L124-L144)); the app then calls back Prowlarr's `/0/api` (special-cased for id 0, [NewznabController L81](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/Prowlarr.Api.V1/Indexers/NewznabController.cs#L81)). 401 → "API Key is invalid", 400 → "Prowlarr URL is invalid, Sonarr cannot connect to Prowlarr" ([Sonarr.cs L58-L64](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/NzbDrone.Core/Applications/Sonarr/Sonarr.cs#L58-L64)). So the target app must be **ready** and able to reach Prowlarr before the POST.

**Add Sonarr** `POST http://localhost:9696/apps/prowlarr/api/v1/applications`
```json
{
  "name": "Sonarr",
  "implementation": "Sonarr",
  "configContract": "SonarrSettings",
  "syncLevel": "fullSync",
  "tags": [],
  "fields": [
    { "name": "prowlarrUrl", "value": "http://localhost:9696/apps/prowlarr" },
    { "name": "baseUrl", "value": "http://localhost:8989/apps/sonarr" },
    { "name": "apiKey", "value": "SONARR_API_KEY" },
    { "name": "syncCategories", "value": [5000, 5010, 5020, 5030, 5040, 5045, 5050, 5090] },
    { "name": "animeSyncCategories", "value": [5070] },
    { "name": "syncAnimeStandardFormatSearch", "value": true },
    { "name": "syncRejectBlocklistedTorrentHashesWhileGrabbing", "value": false }
  ]
}
```
**Add Radarr**
```json
{
  "name": "Radarr",
  "implementation": "Radarr",
  "configContract": "RadarrSettings",
  "syncLevel": "fullSync",
  "tags": [],
  "fields": [
    { "name": "prowlarrUrl", "value": "http://localhost:9696/apps/prowlarr" },
    { "name": "baseUrl", "value": "http://localhost:7878/apps/radarr" },
    { "name": "apiKey", "value": "RADARR_API_KEY" },
    { "name": "syncCategories", "value": [2000, 2010, 2020, 2030, 2040, 2045, 2050, 2060, 2070, 2080, 2090] },
    { "name": "syncRejectBlocklistedTorrentHashesWhileGrabbing", "value": false }
  ]
}
```
**Add Lidarr**
```json
{
  "name": "Lidarr",
  "implementation": "Lidarr",
  "configContract": "LidarrSettings",
  "syncLevel": "fullSync",
  "tags": [],
  "fields": [
    { "name": "prowlarrUrl", "value": "http://localhost:9696/apps/prowlarr" },
    { "name": "baseUrl", "value": "http://localhost:8686/apps/lidarr" },
    { "name": "apiKey", "value": "LIDARR_API_KEY" },
    { "name": "syncCategories", "value": [3000, 3010, 3030, 3040, 3050, 3060] },
    { "name": "syncRejectBlocklistedTorrentHashesWhileGrabbing", "value": false }
  ]
}
```
**Validate**: 201, `syncLevel == "fullSync"`, `enable == true`, `baseUrl`/`prowlarrUrl` field values.

**Sync triggering:** not needed after adding. Adding or updating an enabled application triggers an async sync of all enabled indexers to it ([HandleAsync ProviderAddedEvent<IApplication>](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/NzbDrone.Core/Applications/ApplicationService.cs#L41-L52), [Updated](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/NzbDrone.Core/Applications/ApplicationService.cs#L54-L65)); adding/updating an indexer pushes it to all sync-enabled apps ([L67](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/NzbDrone.Core/Applications/ApplicationService.cs#L67), [L91](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/NzbDrone.Core/Applications/ApplicationService.cs#L91)); a scheduled `ApplicationIndexerSync` runs every 6 h ([TaskManager](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/NzbDrone.Core/Jobs/TaskManager.cs#L109-L113)). Manual full re-sync (also removes stale remote indexers): `POST http://localhost:9696/apps/prowlarr/api/v1/command` with `{"name":"ApplicationIndexerSync","forceSync":true}` (command name = class name minus `Command` [CommandController](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/Prowlarr.Api.V1/Commands/CommandController.cs#L50-L70); `ForceSync` property [here](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/NzbDrone.Core/Applications/ApplicationIndexerSyncCommand.cs#L7); executed with removeRemote=true [L119-L125](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/NzbDrone.Core/Applications/ApplicationService.cs#L119-L125)). Response 201 = queued command `{id, name, status:"queued", ...}`; poll `GET /api/v1/command/{id}` until `status` is `completed`/`failed`.

### 6.2 App profiles

`GET http://localhost:9696/apps/prowlarr/api/v1/appprofile` ([controller](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/Prowlarr.Api.V1/Profiles/App/AppProfileController.cs#L11-L20)). Resource: `id, name, enableRss, enableAutomaticSearch, enableInteractiveSearch, minimumSeeders` ([resource](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/Prowlarr.Api.V1/Profiles/App/AppProfileResource.cs#L10-L14)). Fresh install creates one profile **"Standard"** (rss/auto/interactive all true, minimumSeeders 1) on ApplicationStartedEvent when the table is empty ([AppSyncProfileService L72-L95](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/NzbDrone.Core/Profiles/AppSyncProfileService.cs#L72-L95)) — id is normally 1 (look it up by name). Indexers reference it via `appProfileId`.

### 6.3 Indexer proxy: FlareSolverr

`POST http://localhost:9696/apps/prowlarr/api/v1/indexerproxy` ([controller](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/Prowlarr.Api.V1/IndexerProxies/IndexerProxyController.cs#L9)). `implementation:"FlareSolverr"` ([class](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/NzbDrone.Core/IndexerProxies/FlareSolverr/FlareSolverr.cs#L21)), `configContract:"FlareSolverrSettings"`. Fields: `host` (NotEmpty, default `http://localhost:8191/`), `requestTimeout` (seconds, 1–180, default 60; sent as FlareSolverr `maxTimeout` ms) ([settings](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/NzbDrone.Core/IndexerProxies/FlareSolverr/FlareSolverrSettings.cs#L7-L30), [maxTimeout](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/NzbDrone.Core/IndexerProxies/FlareSolverr/FlareSolverr.cs#L108)).
- **Tag-based**: a proxy definition is "enabled" only if it has ≥1 tag (`Enable => Tags.Any()` [IndexerProxyDefinition](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/NzbDrone.Core/IndexerProxies/IndexerProxyDefinition.cs#L8)). Saved indexers use a proxy only when they share a tag ([IndexerHttpClient L56-L67](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/NzbDrone.Core/Indexers/IndexerHttpClient.cs#L56-L67)); while *testing a new, unsaved* indexer (id 0) with no matching proxy, Prowlarr falls back to any FlareSolverr proxy ([L73-L76](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/NzbDrone.Core/Indexers/IndexerHttpClient.cs#L73-L76)).
- Consequence: with `tags: []` the POST skips validation **and** the connection test (Enable=false → §0) and the proxy is inert. With a tag, POST runs the test: FlareSolverr is asked to fetch `https://prowlarr.servarr.com/v1/ping` ([Test](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/NzbDrone.Core/IndexerProxies/FlareSolverr/FlareSolverr.cs#L184-L190), [cloud URL](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/NzbDrone.Common/Cloud/ProwlarrCloudRequestBuilder.cs#L15)) → needs FlareSolverr up **and** internet (through the VPN).

Steps: (1) `POST /api/v1/tag {"label":"flaresolverr"}` → id T; (2)
```json
{
  "name": "FlareSolverr",
  "implementation": "FlareSolverr",
  "configContract": "FlareSolverrSettings",
  "tags": [T],
  "fields": [
    { "name": "host", "value": "http://localhost:8191/" },
    { "name": "requestTimeout", "value": 60 }
  ]
}
```
(3) users (or EasyArr) add tag T to Cloudflare-protected indexers.

---

## 7. Lidarr quality & metadata profiles

### 7.1 Music qualities (id → name) at this commit ([Quality.cs L73-L110](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/NzbDrone.Core/Qualities/Quality.cs#L73-L110))
0 Unknown · 1 MP3-192 · 2 MP3-VBR-V0 · 3 MP3-256 · 4 MP3-320 · 5 MP3-160 · 6 FLAC · 7 ALAC · 8 MP3-VBR-V2 · 9 AAC-192 · 10 AAC-256 · 11 AAC-320 · 12 AAC-VBR · 13 WAV · 14 OGG Vorbis Q10 · 15 OGG Vorbis Q9 · 16 OGG Vorbis Q8 · 17 OGG Vorbis Q7 · 18 OGG Vorbis Q6 · 19 OGG Vorbis Q5 · 20 WMA · 21 FLAC 24bit · 22 MP3-128 · 23 MP3-96 · 24 MP3-80 · 25 MP3-64 · 26 MP3-56 · 27 MP3-48 · 28 MP3-40 · 29 MP3-32 · 30 MP3-24 · 31 MP3-16 · 32 MP3-8 · 33 MP3-112 · 34 MP3-224 · 35 APE · 36 WavPack · 37 ALAC 24bit.

Default groups (from `DefaultQualityDefinitions` [L164-L201](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/NzbDrone.Core/Qualities/Quality.cs#L164-L201)); the schema/defaults number groups from **1000** in GroupWeight order ([QualityProfileService L186-L222](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/NzbDrone.Core/Profiles/Qualities/QualityProfileService.cs#L186-L222)):

| order | item | qualities |
|---|---|---|
| 1 | single | 0 Unknown |
| 2 | group **1000** "Trash Quality Lossy" | 32,31,30,29,28,27,26,25,24 |
| 3 | group **1001** "Poor Quality Lossy" | 23,33,22,19,5 |
| 4 | group **1002** "Low Quality Lossy" | 1,18,9,20,34 |
| 5 | group **1003** "Mid Quality Lossy" | 17,8,3,16,10 |
| 6 | group **1004** "High Quality Lossy" | 2,12,4,15,11,14 |
| 7 | group **1005** "Lossless" | 6,7,35,36,21,37 |
| 8 | single | 13 WAV |

### 7.2 Defaults on a fresh install
- Quality profiles (created on ApplicationStartedEvent only if none exist; [L92-L151](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/NzbDrone.Core/Profiles/Qualities/QualityProfileService.cs#L92-L151)), insertion order **Any**, **Lossless**, **Standard** (ids normally 1, 2, 3):
  - Any: Unknown + every group 1000–1005 allowed (APE/WavPack become allowed via the Lossless group); WAV not allowed; cutoff Unknown (0).
  - Lossless: FLAC, ALAC, FLAC 24bit, ALAC 24bit → whole group 1005 allowed, cutoff 1005.
  - Standard: MP3-192/256/320 → groups 1002, 1003, 1004 allowed (whole group is allowed when any member is: `Allowed = groupAllowed` [L211-L213](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/NzbDrone.Core/Profiles/Qualities/QualityProfileService.cs#L211-L213)), cutoff 1002.
- Metadata profiles: **"Standard"** (primary Album, secondary Studio, status Official) and the special **"None"** (nothing allowed; cannot be updated/deleted) ([MetadataProfileService L25, L52-L54, L118-L161](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/NzbDrone.Core/Profiles/Metadata/MetadataProfileService.cs#L118-L161)). Ids normally Standard=1, None=2.

### 7.3 Create "EasyArr – Balanced"
Endpoint `POST http://localhost:8686/apps/lidarr/api/v1/qualityprofile` ([controller](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/Lidarr.Api.V1/Profiles/Quality/QualityProfileController.cs#L24-L52)). Resource: `name, upgradeAllowed, cutoff, items[], minFormatScore, cutoffFormatScore, formatItems[]`; item = `{id?, name?, quality?, items[], allowed}` ([resource](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/Lidarr.Api.V1/Profiles/Quality/QualityProfileResource.cs#L12-L39)).
Server rules ([QualityItemsValidator](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/Lidarr.Api.V1/Profiles/Quality/QualityItemsValidator.cs#L28-L159), [cutoff](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/Lidarr.Api.V1/Profiles/Quality/QualityCutoffValidator.cs#L18), [controller](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/Lidarr.Api.V1/Profiles/Quality/QualityProfileController.cs#L24-L44)): at least one allowed; **must contain all 38 qualities exactly once**; groups need a unique non-zero `id`, a `name` and ≥2 qualities; single qualities must not be named; `cutoff` = id of an allowed group or allowed single quality id; `formatItems` must list every custom format (fresh install: none → `[]`); keep `minFormatScore` 0 (with empty `formatItems` a positive minimum hits `Max()` on an empty list).
Safest flow: `GET /api/v1/qualityprofile/schema` (all groups, all `allowed:false`, [schema controller](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/Lidarr.Api.V1/Profiles/Quality/QualityProfileSchemaController.cs#L7-L23)), set `allowed` on the wanted groups, set `name`/`cutoff`/`upgradeAllowed`, POST. Item order = preference (later = better), keep the schema order. Example body (High-quality lossy + lossless, prefer/upgrade to lossless):
```json
{
  "name": "EasyArr – Balanced",
  "upgradeAllowed": true,
  "cutoff": 1005,
  "minFormatScore": 0,
  "cutoffFormatScore": 0,
  "formatItems": [],
  "items": [
    { "quality": { "id": 0, "name": "Unknown" }, "items": [], "allowed": false },
    { "id": 1000, "name": "Trash Quality Lossy", "allowed": false, "items": [
      { "quality": { "id": 32, "name": "MP3-8" }, "items": [], "allowed": false },
      { "quality": { "id": 31, "name": "MP3-16" }, "items": [], "allowed": false },
      { "quality": { "id": 30, "name": "MP3-24" }, "items": [], "allowed": false },
      { "quality": { "id": 29, "name": "MP3-32" }, "items": [], "allowed": false },
      { "quality": { "id": 28, "name": "MP3-40" }, "items": [], "allowed": false },
      { "quality": { "id": 27, "name": "MP3-48" }, "items": [], "allowed": false },
      { "quality": { "id": 26, "name": "MP3-56" }, "items": [], "allowed": false },
      { "quality": { "id": 25, "name": "MP3-64" }, "items": [], "allowed": false },
      { "quality": { "id": 24, "name": "MP3-80" }, "items": [], "allowed": false } ] },
    { "id": 1001, "name": "Poor Quality Lossy", "allowed": false, "items": [
      { "quality": { "id": 23, "name": "MP3-96" }, "items": [], "allowed": false },
      { "quality": { "id": 33, "name": "MP3-112" }, "items": [], "allowed": false },
      { "quality": { "id": 22, "name": "MP3-128" }, "items": [], "allowed": false },
      { "quality": { "id": 19, "name": "OGG Vorbis Q5" }, "items": [], "allowed": false },
      { "quality": { "id": 5, "name": "MP3-160" }, "items": [], "allowed": false } ] },
    { "id": 1002, "name": "Low Quality Lossy", "allowed": false, "items": [
      { "quality": { "id": 1, "name": "MP3-192" }, "items": [], "allowed": false },
      { "quality": { "id": 18, "name": "OGG Vorbis Q6" }, "items": [], "allowed": false },
      { "quality": { "id": 9, "name": "AAC-192" }, "items": [], "allowed": false },
      { "quality": { "id": 20, "name": "WMA" }, "items": [], "allowed": false },
      { "quality": { "id": 34, "name": "MP3-224" }, "items": [], "allowed": false } ] },
    { "id": 1003, "name": "Mid Quality Lossy", "allowed": false, "items": [
      { "quality": { "id": 17, "name": "OGG Vorbis Q7" }, "items": [], "allowed": false },
      { "quality": { "id": 8, "name": "MP3-VBR-V2" }, "items": [], "allowed": false },
      { "quality": { "id": 3, "name": "MP3-256" }, "items": [], "allowed": false },
      { "quality": { "id": 16, "name": "OGG Vorbis Q8" }, "items": [], "allowed": false },
      { "quality": { "id": 10, "name": "AAC-256" }, "items": [], "allowed": false } ] },
    { "id": 1004, "name": "High Quality Lossy", "allowed": true, "items": [
      { "quality": { "id": 2, "name": "MP3-VBR-V0" }, "items": [], "allowed": true },
      { "quality": { "id": 12, "name": "AAC-VBR" }, "items": [], "allowed": true },
      { "quality": { "id": 4, "name": "MP3-320" }, "items": [], "allowed": true },
      { "quality": { "id": 15, "name": "OGG Vorbis Q9" }, "items": [], "allowed": true },
      { "quality": { "id": 11, "name": "AAC-320" }, "items": [], "allowed": true },
      { "quality": { "id": 14, "name": "OGG Vorbis Q10" }, "items": [], "allowed": true } ] },
    { "id": 1005, "name": "Lossless", "allowed": true, "items": [
      { "quality": { "id": 6, "name": "FLAC" }, "items": [], "allowed": true },
      { "quality": { "id": 7, "name": "ALAC" }, "items": [], "allowed": true },
      { "quality": { "id": 35, "name": "APE" }, "items": [], "allowed": true },
      { "quality": { "id": 36, "name": "WavPack" }, "items": [], "allowed": true },
      { "quality": { "id": 21, "name": "FLAC 24bit" }, "items": [], "allowed": true },
      { "quality": { "id": 37, "name": "ALAC 24bit" }, "items": [], "allowed": true } ] },
    { "quality": { "id": 13, "name": "WAV" }, "items": [], "allowed": false }
  ]
}
```
Metadata profiles: `GET|POST|PUT|DELETE /api/v1/metadataprofile`, template `GET /api/v1/metadataprofile/schema` ([schema controller](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/Lidarr.Api.V1/Profiles/Metadata/MetadataProfileSchemaController.cs#L8)); resource `name, primaryAlbumTypes[{albumType:{id,name},allowed}], secondaryAlbumTypes[...], releaseStatuses[{releaseStatus:{id,name},allowed}]` ([resource](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/Lidarr.Api.V1/Profiles/Metadata/MetadataProfileResource.cs#L10-L31)). Ids: primary Album 0, EP 1, Single 2, Broadcast 3, Other 4 ([src](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/NzbDrone.Core/Music/Model/PrimaryAlbumType.cs#L68-L72)); secondary Studio 0 … Audio drama 11 ([src](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/NzbDrone.Core/Music/Model/SecondaryAlbumType.cs#L68-L79)); status Official 0, Promotion 1, Bootleg 2, Pseudo-Release 3 ([src](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/NzbDrone.Core/Music/Model/ReleaseStatus.cs#L68-L71)). Using the built-in "Standard" for the root folder is enough.

---

## 8. Sonarr / Radarr quality profiles (what exists before Recyclarr)

Created on ApplicationStartedEvent if the table is empty, in this order (ids normally 1…6): **Any, SD, HD-720p, HD-1080p, Ultra-HD, HD - 720p/1080p** — Sonarr [L86-L151](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/NzbDrone.Core/Profiles/Qualities/QualityProfileService.cs#L86-L151), Radarr [L122-L210](https://github.com/Radarr/Radarr/blob/a96bf7c3ecb23cb76993770727285dc17a613fbc/src/NzbDrone.Core/Profiles/Qualities/QualityProfileService.cs#L122-L210). Endpoint `GET {base}/api/v3/qualityprofile`. Recyclarr will add/modify its own; EasyArr should only read these (e.g. to wait for non-empty list on first start).

---

## 9. Idempotency: server-side mutations and change detection

Server behaviours that make "PUT what you GET" non-trivial:
1. **Masked secrets**: GET returns `"********"` for apiKey/password fields ([SchemaBuilder L40-L44](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Http/ClientSchema/SchemaBuilder.cs#L40-L44)). You cannot detect a changed secret by comparing; PUT `"********"` keeps the stored one. To (re)apply a known secret, send the real value — on Sonarr/Radarr/Lidarr this counts as "changed" only if it differs from the stored value (settings compared after materialisation, [Sonarr L111](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Api.V3/ProviderControllerBase.cs#L111)).
2. **Omitted fields reset to constructor defaults** ([ReadFromSchema](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Http/ClientSchema/SchemaBuilder.cs#L58-L80)) — a partial `fields` array is *not* a patch.
3. **Type normalisation**: ints/longs/doubles/int[] are converted ([SchemaBuilder L265-L310](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Http/ClientSchema/SchemaBuilder.cs#L265-L310)); GET returns numbers/arrays, so compare normalised values (e.g. `"8090"` vs `8090`).
4. **GET adds metadata** to each field (label, helpText, type, order, advanced, privacy, selectOptions, …); compare only `{name,value}` and only the fields you own.
5. `protocol` (download clients) and `enable` (Prowlarr apps/proxies) are derived on read — don't compare them as user input.
6. Volatile read-only fields: root folder `accessible/freeSpace/totalSpace/unmappedFolders`; provider `message`, `presets`, `infoLink`.
7. Config resources: `id` is always 1 on GET ([ConfigController L30](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Api.V3/Config/ConfigController.cs#L30)); bools/ints missing in a PUT are written as false/0 (§2.3).
8. Lidarr quality profiles get `formatItems` rewritten when custom formats are added/removed ([QualityProfileService L152-L183](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/NzbDrone.Core/Profiles/Qualities/QualityProfileService.cs#L152-L183)).
9. **Update side effects**: Sonarr/Radarr skip DB write and test when nothing changed ([Sonarr L111-L122](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Api.V3/ProviderControllerBase.cs#L111-L122)); Lidarr compares JSON of definition + settings ([L112-L124](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/Lidarr.Api.V1/ProviderControllerBase.cs#L112-L124)); **Prowlarr always writes, tests (unless forceSave) and fires ProviderUpdatedEvent** ([L97-L109](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/Prowlarr.Api.V1/ProviderControllerBase.cs#L97-L109)) — and an updated application triggers a full indexer sync to that app ([L54-L65](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/NzbDrone.Core/Applications/ApplicationService.cs#L54-L65)). **Never PUT unchanged resources; diff client-side first.**

Recommended "user changed this" detection: store, per resource EasyArr creates, `{id, name, implementation, ownedFields: {name: value}, topLevel: {enable, priority, removeCompletedDownloads, removeFailedDownloads, tags}}` hashed at write time. On reconcile: GET by id (fallback: by name), normalise, compare owned non-secret fields with what EasyArr last wrote. Equal → nothing to do. Different from last-written and different from desired → user edited it: report, don't overwrite (or overwrite only on explicit "repair"). Missing → recreate. For secrets, keep a hash of the last value EasyArr sent and re-send only when the source of truth changed.

---

## 10. Validation error format

`ValidationException` → **400** with body = JSON array of FluentValidation 9.5.4 failures serialized by STJson ([Sonarr ErrorPipeline L46-L53](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Http/ErrorManagement/SonarrErrorPipeline.cs#L46-L53), [Radarr](https://github.com/Radarr/Radarr/blob/a96bf7c3ecb23cb76993770727285dc17a613fbc/src/Radarr.Http/ErrorManagement/RadarrErrorPipeline.cs#L46-L52), [Lidarr](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/Lidarr.Http/ErrorManagement/LidarrErrorPipeline.cs#L51-L57), [Prowlarr](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/Prowlarr.Http/ErrorManagement/ProwlarrErrorPipeline.cs#L46-L52); FluentValidation version from `Sonarr.Core.csproj`). Provider test failures add `isWarning`, `detailedDescription`, `infoLink` ([NzbDroneValidationFailure](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/NzbDrone.Core/Validation/NzbDroneValidationFailure.cs#L7-L9)). Typical element:
```json
[
  {
    "isWarning": false,
    "detailedDescription": "Please verify the hostname and port.",
    "propertyName": "Host",
    "errorMessage": "Unable to connect to qBittorrent",
    "severity": "error"
  }
]
```
- `propertyName` is the **C# property name (PascalCase)** — `Host`, `TvCategory`, `ApiKey`, `Path`, `Name` — or `""` for general failures; map to field names case-insensitively.
- Body validation (resource validators) and provider settings validation share this format ([RestController](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Http/REST/RestController.cs#L115-L141)).
- Other errors: `{"message": "...", "description": "..."}` with 404 (not found), 409 (DB constraint on POST/PUT), 500 ([L32-L84](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Http/ErrorManagement/SonarrErrorPipeline.cs#L32-L84)); `BadRequestException` (e.g. `"Cannot edit root folder path"`) → 400 `{"message":...}`.
- Plain-language mapping: prefer `errorMessage` + `detailedDescription`; treat `isWarning:true` entries as advisory (they only block POST without forceSave).

---

## 11. Sub-path reverse proxy (`/apps/<name>`)

- **UrlBase semantics**: the getter trims `/` on both ends and re-adds one leading `/` (`"apps/sonarr/"` → `"/apps/sonarr"`; empty stays empty) ([Sonarr](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/NzbDrone.Core/Configuration/ConfigFileProvider.cs#L255-L267), [Radarr](https://github.com/Radarr/Radarr/blob/a96bf7c3ecb23cb76993770727285dc17a613fbc/src/NzbDrone.Core/Configuration/ConfigFileProvider.cs#L272-L284), [Lidarr](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/NzbDrone.Core/Configuration/ConfigFileProvider.cs#L271-L283), [Prowlarr](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/NzbDrone.Core/Configuration/ConfigFileProvider.cs#L274-L286)). Canonical config.xml value: `<UrlBase>/apps/sonarr</UrlBase>`. The `_serverOptions.UrlBase` term means an env override (`SONARR__SERVER__URLBASE` style) wins over config.xml.
- **The proxy must NOT strip the prefix.** The app applies `UsePathBase(UrlBase)` and redirects any request whose path lacks the prefix (307, §0); a stripping proxy would loop. The SPA's HTML/JS/CSS get `__URL_BASE__` replaced with the UrlBase server-side ([HtmlMapperBase](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Http/Frontend/Mappers/HtmlMapperBase.cs#L69-L72), [UrlBaseReplacementResourceMapperBase](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Http/Frontend/Mappers/UrlBaseReplacementResourceMapperBase.cs#L51)), so asset and API URLs are absolute `/apps/sonarr/...`.
- **SignalR**: hub at `<UrlBase>/signalr/messages` ([Sonarr Startup L281](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/NzbDrone.Host/Startup.cs#L281), [Radarr L297](https://github.com/Radarr/Radarr/blob/a96bf7c3ecb23cb76993770727285dc17a613fbc/src/NzbDrone.Host/Startup.cs#L297), [Lidarr L297](https://github.com/Lidarr/Lidarr/blob/da7b4dfb1a9e7e1d6625c2dbc3fff96971ab26bd/src/NzbDrone.Host/Startup.cs#L297), [Prowlarr L296](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/NzbDrone.Host/Startup.cs#L296)), auth policy `SignalR` = API key via header or `?access_token=` ([L179-L183](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/NzbDrone.Host/Startup.cs#L179-L183), [scheme](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Http/Authentication/AuthenticationBuilderExtensions.cs#L64-L68)); the UI connects with `${urlBase}/signalr/messages?access_token=<apiKey>` ([SignalRConnector](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/frontend/src/Components/SignalRConnector.js#L104-L108)). `app.UseWebSockets()` is enabled ([L268](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/NzbDrone.Host/Startup.cs#L268)). Proxy needs: pass `Upgrade`/`Connection` headers (HTTP/1.1) for WebSockets on `/apps/<name>/signalr/messages`, keep query strings, long read timeouts (≥ 100 s), no response buffering for SSE/long-polling fallbacks. SignalR uses default transports (`AddSignalR()` without options, [L165](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/NzbDrone.Host/Startup.cs#L165)), so it degrades to SSE/long-polling if WS is blocked.
- **Forwarded headers**: honours `X-Forwarded-For/Proto/Host` only from known proxies — ASP.NET default loopback plus optional `TrustedNetworks` config ([ForwardedHeadersConfigurator](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/NzbDrone.Host/ForwardedHeadersConfigurator.cs#L15-L44); present in all four, e.g. [Prowlarr ConfigFileProvider](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/NzbDrone.Core/Configuration/ConfigFileProvider.cs#L289)). A proxy on localhost (shared netns) is trusted by default. `X-Forwarded-Prefix` is not used.
- **Host filtering**: `AllowedHosts` config empty (default) → any Host header accepted ([ConfigureHostFilteringOptions](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/NzbDrone.Host/ConfigureHostFilteringOptions.cs#L28-L45); config key in all four, e.g. [Radarr](https://github.com/Radarr/Radarr/blob/a96bf7c3ecb23cb76993770727285dc17a613fbc/src/NzbDrone.Core/Configuration/ConfigFileProvider.cs#L241)). Don't set it, or include the Umbrel host names.
- CORS for `/api` is `AllowAnyOrigin/Method/Header` ([Startup L67-L73](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/NzbDrone.Host/Startup.cs#L67-L73)).

---

## Doubts (not confirmed from source)

1. **Exact startup timing** — that Kestrel is not listening while migrations run relies on ASP.NET Core calling `Startup.Configure` before the server starts (framework behaviour, not Servarr code). Treat ECONNREFUSED, 503 and 200-with-empty-profiles all as "not ready yet".
2. **Prowlarr ↔ app redirects**: Prowlarr sets `AllowAutoRedirect = true` on app requests ([SonarrV3Proxy L214](https://github.com/Prowlarr/Prowlarr/blob/0dc20d8495bad9951c3fafe53f32b6e1c70fcf3b/src/NzbDrone.Core/Applications/Sonarr/SonarrV3Proxy.cs#L214)) and yet maps 307 to "missing URL base"; whether the Servarr HttpClient really follows a 307 POST was not traced. Same for the apps calling a Prowlarr `prowlarrUrl` without the prefix. Always include both prefixes — then it doesn't matter.
3. **Sonarr/Radarr "unchanged" detection** uses `MemberwiseEqualityComparer` on the definition ([L111](https://github.com/Sonarr/Sonarr/blob/cab419ade8ac7fcab5bf80394ee492abd35d5f5a/src/Sonarr.Api.V3/ProviderControllerBase.cs#L111)); I didn't verify how it treats `Tags` (HashSet) or non-persisted members (`ImplementationName`), so an identical PUT may still be treated as changed (→ re-test + write). Don't rely on it; diff client-side.
4. **Profile ids** (Any/Lossless/Standard = 1/2/3, Standard/None = 1/2, Prowlarr Standard = 1, Sonarr/Radarr 1…6) assume a fresh SQLite DB with autoincrement in insertion order. Look up by name.
5. **qBittorrent with "bypass auth for localhost"** and empty username/password: not verified how the v2 proxy behaves (it may still POST `/api/v2/auth/login`). Safer to send real credentials (or the new `apiKey` field — which qBittorrent build supports API keys wasn't checked).
6. **Validation error JSON shape**: field list derived from FluentValidation 9.5.4 `ValidationFailure` public properties + STJson (null-omitting); extra keys such as `attemptedValue`, `errorCode`, `formattedMessagePlaceholderValues`, `customState` may or may not appear. Only rely on `propertyName`, `errorMessage`, `isWarning`, `detailedDescription`, `severity`.
7. **FlareSolverr test** needs internet through FlareSolverr (servarr.com ping). If the VPN is down, a tagged POST will fail; workaround: POST untagged, then PUT with tag and `?forceSave=true` (PUT with forceSave skips the test — verified for the generic controller, not exercised live).
8. Whether a reverse proxy *must* support WebSockets: SignalR should fall back to SSE/long-polling (default transports), but that wasn't tested; plan for WS support.
9. Nothing here was exercised against running containers; all of it is from reading source at the pinned commits.
