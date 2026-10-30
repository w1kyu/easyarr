# How EasyArr works

EasyArr puts a complete home media setup on your Umbrel and connects all the parts for you.

## The idea in one picture

1. **You ask for something** — a movie, a show, an album — in **Jellyseerr**.
2. **EasyArr's helpers look for it**: Sonarr (TV), Radarr (movies) and Lidarr (music) ask your
   search sources (**Prowlarr**) where to get it.
3. **It gets downloaded** with qBittorrent ([torrents](torrents-101.md)) and/or SABnzbd
   ([Usenet](usenet-101.md)) — always through a **VPN**.
4. **It gets sorted** into your library, with nice names, posters and subtitles (Bazarr).
5. **You watch it** in **Jellyfin**, on your TV, phone or browser.

## The apps inside

| App                    | What it does for you                         |
| ---------------------- | -------------------------------------------- |
| Jellyfin               | Watch movies, shows and music                |
| Jellyseerr             | Request new movies and shows                 |
| Sonarr / Radarr / Lidarr | Find and organise TV, movies and music     |
| Prowlarr               | Manages your search sources (indexers)       |
| qBittorrent / SABnzbd  | Download torrents / from Usenet              |
| Bazarr                 | Adds subtitles                               |
| Recyclarr              | Keeps quality settings up to date            |
| Unpackerr / Cleanuparr | Unpack downloads and remove stuck ones       |
| FlareSolverr           | Helps with search sites that block bots      |

You don't have to learn any of them. The setup asks a few simple questions and wires them
together. If you're curious, you can still open every app from EasyArr's dashboard.

## Safety

- **VPN with a kill switch.** All downloading goes through a VPN. If the VPN drops, downloads
  stop instead of using your normal connection.
- **Your Umbrel login protects EasyArr.** Jellyfin and Jellyseerr have their own login (the
  account you create during setup).

## Be responsible

Only download content you have the right to download and share. Laws differ between countries
— you are responsible for following yours.
