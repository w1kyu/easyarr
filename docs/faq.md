# Frequently asked questions

## About EasyArr

### What is EasyArr?

An app for your Umbrel that turns it into your own streaming service. You ask for a movie, a show
or an album, and EasyArr finds it, downloads it through a VPN, sorts it and makes it ready to watch
in Jellyfin. It installs and connects about a dozen well-known media apps for you. See
[How EasyArr works](how-it-works.md).

### Does it cost anything?

EasyArr is free and open source. You may need to pay for other things:

- a **VPN** (a few euros or dollars a month),
- for **Usenet** only: a Usenet provider and usually an indexer.

Torrents themselves cost nothing.

### Is it legal?

EasyArr is a tool, like a web browser. The apps inside it are legal, open-source software used by
millions of people. What you download with it is your responsibility: only download content you
have the right to download and share, and follow the laws where you live.

### Who makes EasyArr? Is it from Umbrel?

EasyArr is an independent open-source project by w1kyu. It isn't made, checked or endorsed by
Umbrel. The code is on [GitHub](https://github.com/w1kyu/easyarr).

### Does EasyArr send my data anywhere?

No. Your settings, passwords and keys stay on your Umbrel. EasyArr and the apps inside only go
online to:

- search and download (always through your VPN),
- fetch posters, descriptions and subtitles for your library (for example from TheMovieDB),
- check for updates (EasyArr reads the newest version number from its GitHub store).

Nothing is collected about you. EasyArr also switches off the anonymous usage statistics that
Sonarr, Radarr, Lidarr, Prowlarr and Bazarr would otherwise send to their developers. **Get help with AI** never sends anything
by itself: you see the text and copy it yourself, see [Getting help](getting-help.md).

## Setting up

### Do I really need a VPN?

For downloading, yes. EasyArr won't download without one. With torrents, everyone who shares a file
can see the internet address of everyone else who shares it. A VPN hides yours. See
[VPN basics](vpn/README.md).

You can finish the setup without a VPN and add one later in **Settings → VPN**. Watching what you
already have keeps working, but nothing new downloads until the VPN is connected.

### Which VPN should I use?

Any provider in the list works. For torrents, the **Best for torrents** group is best because those
providers offer **port forwarding**, which makes torrents faster. The [VPN basics](vpn/README.md)
page compares them, and every provider has a step-by-step guide.

### Torrents or Usenet?

Not sure? Start with torrents: free and nothing else to sign up for. Usenet is faster and more
reliable but costs money. You can switch, or use both, later in **Settings → Download method**. See
[Torrents 101](torrents-101.md) and [Usenet 101](usenet-101.md).

### Which search sites should I add?

EasyArr doesn't pick or recommend any. [Search sites](indexers.md) explains how to find and add
some in Prowlarr.

### My Umbrel only has 4 GB of memory. Will it work?

It will run, but slowly, and other Umbrel apps may become slow too. See
[System requirements](system-requirements.md).

## Everyday use

### Where are my movies and shows?

In **Files → Home → EasyArr → media** on your Umbrel. Jellyfin shows everything in there. See
[Where your files are](how-it-works.md#where-your-files-are).

### Can I use an external drive or a NAS?

Not yet. EasyArr stores everything on your Umbrel's main disk for now.

### How do I request music?

The request page only knows movies and shows. Music is added in **Lidarr**: on the EasyArr home
screen, switch to **Advanced**, open **Lidarr**, then **Add New** and search for an artist. EasyArr
already set Lidarr up, so the album downloads and appears in Jellyfin under **Music**.

### Can my family use it?

Yes. Everyone gets their own Jellyfin account, with their own watch history and the libraries you
choose. See [Family accounts](family-accounts.md).

### Can I watch when I'm not at home?

Yes, with the free Tailscale app. See [Remote access with Tailscale](remote-access-tailscale.md).

### Can I use Plex instead of Jellyfin?

No. EasyArr is built around Jellyfin, which is free and open source. Jellyfin has apps for most
TVs, phones and streaming sticks.

### I already have the Jellyfin app from the Umbrel App Store. What now?

Then you have two separate Jellyfins. See [Two Jellyfins](two-jellyfins.md).

### Why didn't my request download?

Look at **Needs your attention** on the EasyArr home screen. It explains the most common reasons,
for example that only another language or a lower quality exists, and offers a button to fix it.
See [Troubleshooting](troubleshooting.md#a-request-never-starts-downloading).

## Updates, backups, uninstalling

### How do I update EasyArr?

When there's a new version, the EasyArr home screen tells you. Install it from your Umbrel's
**App Store** (**Updates**). Your settings and media are kept.

### Should I make backups?

Yes. A backup keeps your answers, accounts, VPN settings and each app's history, so you can get
everything back after a broken disk or a new Umbrel. Turn on automatic backups in
**Settings → Backups**. See [Backups](backup-restore.md).

### What happens if I uninstall EasyArr?

Umbrel deletes EasyArr's settings and the apps' databases. Your movies, shows and music in
**Files → Home → EasyArr** stay, and so do the automatic backups in its `backups` folder. Delete
that folder yourself if you want the space back. Download a backup first if you might reinstall.
