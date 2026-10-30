# Torrents 101

Torrents are one of two ways EasyArr can download things. The other one is
[Usenet](usenet-101.md). You can use both.

## How torrents work

1. A file is split into many small pieces.
2. People who have the file share those pieces with each other.
3. Your download client (qBittorrent) collects the pieces from many people at once.
4. While you download, you also share pieces with others. That's called **seeding**.

Nobody runs a central server. That's why torrents cost nothing.

## Where torrents come from

Websites that list torrents are called **indexers** or **trackers**. EasyArr asks them for you
through Prowlarr. You add the indexers yourself later in the setup. EasyArr doesn't recommend
any specific site.

- **Public trackers** are open to everyone. They are easy to start with, but files are
  sometimes fake or slow.
- **Private trackers** need an invite. They are usually faster and cleaner, but have rules
  (for example: share back as much as you download).

## Pros and cons

| 👍 Good                              | 👎 Not so good                                       |
| ------------------------------------ | ---------------------------------------------------- |
| Free                                 | Speed depends on how many people share a file        |
| Huge choice, also old or rare things | Old or rare things can take a long time              |
| No account needed to start           | Everyone sharing a file can see your IP address      |
|                                      | Needs a VPN (EasyArr makes that the default, see below) |

## Why EasyArr needs a VPN for torrents

When you share a file, everyone else sharing it can see your internet address (IP).
A **VPN** hides it. EasyArr sends all download traffic through a VPN and blocks it completely
when the VPN is down (a **kill switch**). You set the VPN up in the next part of the setup.

A VPN with **port forwarding** makes torrents faster, because other people can connect to you
directly.

## Be responsible

Only download content you have the right to download and share. Laws differ between countries
— you are responsible for following yours.
