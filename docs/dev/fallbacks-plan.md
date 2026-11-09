# Plan: why didn't it download? (owner's item 11) — waiting for the owner's OK

Status 2026-11-09: **planned, not built.** Items 1–10 of the owner's list are done (D-064 – D-067).
Item 11 is much bigger than the others, so per the owner's instructions this list waits for
their OK before anything is built.

Goal: for every common reason a request doesn't arrive, (a) detect it, (b) show it on the home screen
in plain words, (c) offer a one-click alternative where one exists. Never switch language or quality
without the user agreeing, unless they turned on **"Accept alternatives automatically"** (off by
default).

## Failure cases and planned handling

| # | Case | How EasyArr detects it | What the user sees | One-click choice |
|---|---|---|---|---|
| 1 | Only releases in a language the user didn't choose | Interactive search (`GET /api/v3/release?movieId=` / `?episodeId=`): releases whose custom formats include "EasyArr – Language: none of yours" (D-066) | "*Dune* isn't available in German, Original. It is in English." | "Download in English" → grab that release (`POST /api/v3/release`) — this item only, nothing else changes; it's upgraded later if a chosen language shows up |
| 2 | Only a lower quality than the preset allows (720p/SD/CAM) | Same search: rejections "Quality … not wanted in profile" | "Only a 720p version exists so far." | "Accept 720p" → grab that release (CAM/TS never offered) |
| 3 | Nothing at all on the search sites | Same search returns no releases | "Your search sites have nothing for this yet. EasyArr looks again every 6 h." | "Add more search sites" (→ Prowlarr guide) |
| 4 | No seeders | Rejections "Not enough seeders"; qBittorrent `stalledDL` with 0 seeds | "Nobody is sharing this file right now." | "Try another release" → queue `DELETE …?blocklist=true` + search |
| 5 | Every search site failing | Existing `indexersDown` (D-062) + Prowlarr `/indexerstatus`, `/health` reasons | "None of your search sites answer (since 14:02)." + the reason per site | "Retry now" (run the healer), "Switch VPN server" |
| 6 | Cloudflare / FlareSolverr failure | Prowlarr test/health text "blocked by CloudFlare Protection"; FlareSolverr health probe | "*1337x* blocks automated access; the helper that gets around this isn't working." | "Retry", "Repair connections" (re-tag the proxy) |
| 7 | VPN down, kill switch active | Existing `vpnDown` + `vpn.problem` codes | Existing plain reason, plus "downloads are paused to keep you safe" | "Reconnect" (`POST /api/vpn/reconnect`), "Change server" |
| 8 | Download client unreachable | `/api/status` `reachable`, Servarr `/health` DownloadClientCheck | "qBittorrent isn't answering." | "Repair connections" |
| 9 | Disk full / almost full | Existing `diskLow`, plus < 2 GB, qBittorrent "No space left", Servarr root-folder health | "Your Umbrel is full — downloads stopped." | Link to Umbrel Files; explain what to delete (no automatic deleting) |
| 10 | Stalled / stuck download | qBittorrent `stalledDL`/`metaDL` age, SABnzbd failed jobs; Cleanuparr already removes after ~30 min (D-057) | "Stuck at 43 % for 2 h." | "Try another release now" (same as 4) |
| 11 | Downloaded but not imported | Servarr queue `trackedDownloadState` `importPending`/`importBlocked` + `statusMessages` (sample, unpack error, unknown file, no video) | "Downloaded, but Radarr couldn't add it: only a sample file." | "Remove and try another"; "Retry import" when the reason is temporary |
| 12 | Usenet job failed (missing articles, password, encrypted) | SABnzbd history `fail_message`; Servarr marks failed + searches again (`autoRedownloadFailed`) | "The Usenet download was incomplete; trying another one." | none needed (automatic), "Try another release now" |
| 13 | Every candidate blocklisted | Rejections "Release is blocklisted" | "Every version found failed before." | "Give them another chance" → clear this item's blocklist entries |
| 14 | Not released yet | Radarr `isAvailable=false`, Sonarr unaired episodes | "Comes out on 12 Dec — EasyArr downloads it then." | none |
| 15 | Search site rate limit (429 / query limit) | Prowlarr health / indexer status | "A search site asked us to slow down; EasyArr waits and retries." | none |
| 16 | Request never reached Sonarr/Radarr | Seerr request status `failed` (`/api/v1/request?filter=failed`) | "Your request for *X* didn't go through." | "Send again" (Seerr retry endpoint) |

## Building blocks

- **Stuck finder** (`status/stuck.ts`, every 30 min): monitored items still missing ≥ 12 h after being
  added and searched at least once (D-067). One interactive search every 2 min at most, results
  cached 6 h, so indexers aren't hammered. It turns rejections into the cases above.
- **"Needs your OK" section** on the home screen (Simple mode too): one card per item with poster,
  plain reason, and the button(s). Problems with the whole setup (5–9) stay in the warnings banner.
- **`POST /api/fallback/:id`** → grabs the offered release, removes and searches again, or clears a
  blocklist. Records what the user accepted.
- **Settings → Advanced → "Accept alternatives automatically"** (off): the stuck finder grabs the best
  offer itself (next language first, then the next lower quality, never CAM) and tells the user on
  the home screen.
- Fakes: release search results with rejections, queue states, SAB history, Seerr failed requests.

## To verify before building

- [VERIFY] `POST /api/v3/release` grabs a release Sonarr/Radarr rejected (the UI's "grab anyway") at
  Sonarr 4.0.20 / Radarr 6.4.4.
- [VERIFY] exact rejection texts per version (match on `DownloadRejectionReason` where the API
  exposes it, not on English text).
- [VERIFY] Seerr v3.5.1 retry endpoint for failed requests.
