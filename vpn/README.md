# vpn/

The EasyArr VPN image (`ghcr.io/w1kyu/easyarr-vpn`): a thin wrapper around
[Gluetun](https://github.com/qdm12/gluetun) that reloads VPN settings without restarting the
container and keeps a default-deny kill switch active whenever the VPN isn't up (SPEC §5.2–5.3).

Built in phase 01 (basic) and phase 04 (live reload + leak tests).
