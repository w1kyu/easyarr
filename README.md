# EasyArr

[![CI](https://github.com/w1kyu/easyarr/actions/workflows/ci.yml/badge.svg)](https://github.com/w1kyu/easyarr/actions/workflows/ci.yml)

> 🚧 **Work in progress** — not ready to install yet.

EasyArr is a beginner-friendly [Umbrel](https://umbrel.com) app that sets up a complete,
pre-wired media automation stack — Sonarr, Radarr, Lidarr, Prowlarr, Bazarr, qBittorrent, SABnzbd,
Jellyfin, Jellyseerr and friends — behind a VPN with a kill switch. A guided setup wizard asks a
few plain-English questions, connects every service to the others for you, and gives you a
dashboard that looks and feels native to umbrelOS. No terminal, no YAML, no API keys to copy around.

It will be available from the **w1kyu Apps** community app store
([w1kyu/umbrel-app-store](https://github.com/w1kyu/umbrel-app-store)).

## Development

Requires Node 26 (see `.nvmrc`) and pnpm.

```sh
pnpm install
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

The plan lives in [`SPEC.md`](SPEC.md), progress in [`PROGRESS.md`](PROGRESS.md), decisions in
[`DECISIONS.md`](DECISIONS.md).

## License

EasyArr's own code is MIT. It includes code from umbrelOS under PolyForm Noncommercial 1.0.0,
so EasyArr as a whole may only be used for **noncommercial** purposes. See [NOTICE.md](NOTICE.md)
and [LICENSE](LICENSE).

EasyArr is an independent project and is not affiliated with or endorsed by Umbrel.
