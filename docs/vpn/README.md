# VPN basics

_Last checked: 31 October 2026_

EasyArr only downloads through a **VPN**. This page explains what that means, why it matters, and
how to choose a provider. Each provider has its own step-by-step guide (links below).

## What is a VPN?

Normally, every website and every person you exchange data with sees your **IP address**. That's
the internet address of your home. Your internet provider can see what you connect to.

A **VPN** (virtual private network) is a service you pay for (a few euros/dollars per month).
It creates a locked tunnel from your Umbrel to one of the VPN's servers. Your traffic leaves the
internet from **there**, not from your home. So:

- other people see the **VPN server's address**, not yours,
- your internet provider only sees that you talk to a VPN — not what you download.

## Why EasyArr needs one

With [torrents](../torrents-101.md), everyone who shares the same file can see the address of
everyone else. Copyright companies watch torrents and collect these addresses. Without a VPN,
that would be your home address — and your internet provider could send you a letter or a fine.

With [Usenet](../usenet-101.md), nobody else sees you, but your internet provider still sees what
you download. A VPN hides that too.

That's why EasyArr sends **all** download traffic through the VPN: Sonarr, Radarr, Lidarr,
Prowlarr, qBittorrent and SABnzbd. Jellyfin and Jellyseerr (watching and requesting) don't use the
VPN, so streaming at home stays fast.

## The kill switch

A VPN connection can drop — for example when the VPN server restarts. Many apps then quietly carry
on over your normal connection. EasyArr doesn't.

The **kill switch** blocks **all** internet traffic of the download apps whenever the VPN isn't
connected. Downloads simply pause, and they continue by themselves once the VPN is back. Your home
address is never used for downloading, not even for a second.

## "Your home IP is hidden"

After you connect, EasyArr runs a **connection test** and shows:

- **The VPN's address and country** — that's where your downloads appear to come from.
- **"Your home IP is hidden"** — EasyArr also looks up your real home address (outside the VPN)
  and compares the two. If they're different, the VPN is protecting you. If they're the same,
  EasyArr warns you and keeps downloads blocked.
- **Port forwarding** — on or off, and which port (see below).

Sometimes EasyArr can't look up your home address (that check needs the internet outside the VPN).
It then says so. The VPN itself is still connected and the kill switch still works.

## Port forwarding in plain words

With a VPN, other people can't start a connection **to** you — only you can connect to them.
For torrents, that means you can only exchange data with people who accept incoming connections.
You find fewer people to share with, and downloads are slower. Rare files may not finish at all.

**Port forwarding** opens one "door" (a **port**) on the VPN server that leads to you. Now other
people can connect to you too: more people to share with, faster torrents, better ratios on
private trackers.

- **Automatic:** some providers hand out a port when you connect. EasyArr picks it up and sets it
  in qBittorrent for you.
- **Reserved:** with AirVPN you reserve a port in your account once and enter it in EasyArr.
  EasyArr sets it in qBittorrent.
- **Usenet doesn't need port forwarding at all.** If you only use Usenet, any provider is fine.

Without port forwarding, torrents still work — just slower.

## Which provider?

This isn't a ranking. Every provider below works with EasyArr. If you use torrents, port
forwarding is the one feature that really makes a difference.

| Provider                      | Port forwarding                          | Guide                           |
| ----------------------------- | ---------------------------------------- | ------------------------------- |
| Proton VPN                    | Yes, automatic (paid plans only)         | [Proton VPN](protonvpn.md)      |
| Private Internet Access (PIA) | Yes, automatic                           | [PIA](pia.md)                   |
| AirVPN                        | Yes, a port you reserve yourself         | [AirVPN](airvpn.md)             |
| PrivateVPN                    | Yes, automatic                           | [Other providers](generic.md)   |
| Perfect Privacy               | Yes, automatic                           | [Other providers](generic.md)   |
| Mullvad                       | No                                       | [Mullvad](mullvad.md)           |
| NordVPN                       | No                                       | [NordVPN](nordvpn.md)           |
| Surfshark                     | No                                       | [Surfshark](surfshark.md)       |
| Other providers in the list   | No                                       | [Other providers](generic.md)   |
| Not in the list               | Only a fixed port your provider gave you | [Custom config file](custom.md) |

Already have a VPN? Use the one you have. Prices, server locations and features change often —
check the provider's website before you buy.

## WireGuard or OpenVPN?

These are two ways to build the VPN tunnel. Some providers offer both, some only one. If you can
choose, pick **WireGuard**: it's faster, connects in seconds, and usually needs just one key
instead of a username and password. **OpenVPN** is older and works everywhere; it's the fallback
when your provider has no WireGuard option. Both are equally safe with EasyArr's kill switch.

## Free plans

**Proton VPN** has a free plan, and EasyArr supports it ("I use the free plan"). It works, with
limits:

- no port forwarding,
- only a few server countries, and they're often busy,
- Proton doesn't allow torrent (P2P) traffic on free servers.

So the free plan is good for **Usenet** or for trying EasyArr out. For torrents you need a paid
plan. EasyArr's free-plan option is only for Proton VPN; free tiers of other providers usually have
data limits that make downloading impractical.

## "Skip for now"

You can skip the VPN step in the setup. Nothing leaks: the kill switch is already on. But until you
connect a VPN, the download apps can't reach the internet at all, so **nothing downloads**.
Jellyfin, Jellyseerr and everything already in your library keep working.

Add the VPN later in **Settings → VPN**.

## Changing provider later

Open **Settings → VPN**, pick the new provider, fill in the fields and press **Connect**. EasyArr
runs the connection test again. No reinstall, and your library and settings stay as they are.
Keys and passwords are stored only on your Umbrel and are never shown again. If you keep the same
provider and only change, say, the server location, you can leave the saved fields empty.

## Be responsible

A VPN protects your privacy. It doesn't make downloading things you have no right to legal. Only
download content you have the right to download and share. Laws differ between countries — you are
responsible for following yours.
