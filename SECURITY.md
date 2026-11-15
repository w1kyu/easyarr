# Security policy

EasyArr runs on people's home servers, next to their files and behind their VPN. Security reports
are very welcome.

## Report a problem privately

**Please don't open a public issue for a security problem.**

Use GitHub's private reporting instead:

1. Go to [github.com/w1kyu/easyarr/security](https://github.com/w1kyu/easyarr/security).
2. Press **Report a vulnerability** and describe what you found.

Only the maintainer sees the report. You'll get an answer within 7 days. Once a fix is released,
you're credited in the release notes (unless you'd rather not be).

## What counts

Anything that could let someone who shouldn't:

- see downloads or your home IP address, or get around the VPN kill switch,
- reach EasyArr or the apps it manages without the Umbrel login,
- read passwords, API keys or VPN keys (including through logs, the diagnostics file or the
  AI help prompt),
- change settings, or run code on the Umbrel.

Problems in the bundled apps themselves (Sonarr, Jellyfin, qBittorrent, Gluetun, …) are best
reported to those projects. If EasyArr's setup makes such a problem worse, report it here too.

## Supported versions

Only the newest version in the w1kyu Apps community store gets fixes. Updating EasyArr in the
Umbrel app store is the way to get them.
