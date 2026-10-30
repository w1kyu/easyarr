# Phase 04 — VPN: wrapper, leak-proof kill switch, VPN wizard step

Follow the session protocol in `CLAUDE.md`. Relevant spec: §5.2–5.4, §9, D-003, D-013.
This is the most safety-critical phase. Be thorough; test leaks explicitly.

## Research first (record in PROGRESS.md)
- Gluetun: current env variables per provider/protocol, list of supported providers, which support
  automatic port forwarding, control server endpoints + auth requirements, how to stop it gracefully,
  custom WireGuard/OpenVPN config support. Use the official gluetun wiki/source.

## Tasks
1. **`vpn/` image** (`ghcr.io/w1kyu/easyarr-vpn`, FROM `qmcgaw/gluetun`, multi-arch, CI build):
   wrapper as PID 1 implementing SPEC §5.3 — default-deny egress whenever Gluetun isn't running,
   wait for `vpn.env`, start/stop Gluetun process on reload signal, write `wrapper-status.json`,
   forward signals correctly, never exit while idle. Inbound from the Docker network to service ports
   must always work.
2. **Leak tests** (automated in CI with a dev compose): unconfigured → no egress; invalid config →
   no egress; during reload → no egress; Gluetun crash → no egress; dashboard → `vpn:8989` always works.
3. **Provider catalog** `dashboard/shared/src/vpn-providers.ts` per SPEC §9.2, generated/checked against
   Gluetun's provider list; groups: recommended (port forwarding) / works / custom.
4. **Server**: `POST /api/vpn/config` (validate per provider+protocol, write `vpn.env` + custom files
   chmod 600, trigger reload), `GET /api/vpn/status`, `POST /api/vpn/test` (connected?, public IP + country,
   home IP hidden check, port forwarding status) with plain-language error mapping.
5. **Port-forward sync**: background job keeps qBittorrent's listening port equal to the forwarded port
   (qBittorrent API); tested with mocks.
6. **Wizard step 5 VPN** UI per SPEC §9.1: searchable provider list with groups and badges, protocol
   choice (WireGuard recommended), tutorial + form side by side, connection test with clear results,
   "skip for now" with an honest warning.
7. **Tutorials**: `docs/vpn/README.md` (VPN + port forwarding in plain words), full guides for ProtonVPN,
   Mullvad, NordVPN, Surfshark, PIA, AirVPN, plus `generic.md` and `custom.md`. Each with
   "Last checked: <date>". Verify every step against the provider's current website/docs.
8. Switch the Umbrel compose to the wrapper image; sync to store.

## Done when
- A beginner can connect a VPN from the wizard without a terminal; status + test are honest.
- All leak tests pass in CI and manually on my Umbrel.
- PROGRESS.md updated; next = `prompts/05-wiring.md`.

## My checklist (owner)
- [ ] Set up my VPN through the wizard following only the in-app tutorial
- [ ] Test shows VPN IP + country, not my home IP
- [ ] Change provider/settings again → reconnects without reinstalling
- [ ] Leak check from Claude's checklist passes
