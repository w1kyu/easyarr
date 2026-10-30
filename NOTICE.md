# Licensing overview

EasyArr's own code is MIT. It includes code from umbrelOS under PolyForm Noncommercial 1.0.0,
so EasyArr as a whole may only be used for noncommercial purposes.

## 1. EasyArr's own code — MIT

Everything in this repository that is **not** inside a `vendor/umbrel/` folder is written for
EasyArr and licensed under the [MIT License](LICENSE), copyright w1kyu.

## 2. Vendored umbrelOS code — PolyForm Noncommercial 1.0.0

UI code copied from [umbrelOS](https://github.com/getumbrel/umbrel) lives only in
`dashboard/web/src/vendor/umbrel/` (and matching `vendor/umbrel/` folders if ever needed).
Those files keep their original license, **PolyForm Noncommercial 1.0.0**:

- `vendor/umbrel/LICENSE` — umbrelOS's license, copied verbatim from upstream.
- `vendor/umbrel/PROVENANCE.md` — for every file: upstream path, upstream commit, date copied,
  and whether/how it was modified.

Because EasyArr ships this code, **EasyArr as a whole may only be used for noncommercial
purposes** (no selling it, no paid support, no shipping it preinstalled on hardware you sell).
Personal and nonprofit use, modification and redistribution are fine.

EasyArr is **not** an official Umbrel product and is not affiliated with or endorsed by Umbrel.
The Umbrel name, logo and brand marks are not used and not licensed to EasyArr.

_Status: no umbrelOS code has been vendored yet (planned for phase 02)._

## 3. Third-party software

EasyArr bundles and configures other open-source projects as separate container images
(Gluetun, Sonarr, Radarr, Lidarr, Prowlarr, Bazarr, qBittorrent, SABnzbd, Jellyfin, Jellyseerr,
FlareSolverr, Recyclarr, Unpackerr, Cleanuparr). Each one keeps its own license; they are run
as unmodified upstream images (except the VPN wrapper, which builds on Gluetun). A full list with
licenses will be added here before the first release.

npm dependencies of the dashboard keep their own licenses; CI will check they are compatible
(no GPL/AGPL code bundled into the dashboard).
