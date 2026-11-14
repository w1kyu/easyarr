# Troubleshooting

The most common problems and how to fix them, all from the EasyArr dashboard. Can't find yours?
Use **Get help with AI** (see [Getting help](getting-help.md)).

## Setup

### The VPN doesn't connect

EasyArr shows what went wrong under **Connect** in the VPN step (or **Settings** → **VPN**). The
most common messages:

- **The key isn't right** or **Username or password was refused**: copy the key or login again
  from your VPN provider's website. For most providers this is *not* your normal account password
  but a separate VPN login. The [VPN guide](vpn/README.md) for your provider shows where to find it.
- **No server matches your choice**: pick another country, or turn off **Port forwarding** or
  **Free plan** if you don't need them.
- **Couldn't reach the VPN server**: try again in a few minutes, or pick another country.
- **Your home IP is NOT hidden**: don't use EasyArr for downloads until this is fixed. Check the
  settings against the guide and connect again.

While the VPN is down, downloads stop. That's on purpose: the kill switch makes sure nothing goes
out without the VPN.

### Connecting the apps (Finish step) didn't work

1. Wait two minutes and press **Try again**. Right after an install or update, some apps need a moment
   before they answer.
2. If the same line keeps failing, press **Get help with AI** next to it.
3. If you need to, press **Finish anyway**. You can repair the connections later in
   **Settings** → **Advanced** → **Repair connections**.

## On the home screen

### "Not answering: …"

An app isn't responding. Most of the time it's still starting (right after an update or a restart
of your Umbrel, this can take a few minutes).

1. Wait five minutes.
2. Still there? Restart EasyArr: on your Umbrel's home screen, right-click (or long-press) the
   EasyArr icon → **Restart**.
3. Still there after a restart? Use **Get help with AI**.

### "Some connections didn't work"

Press **Repair connections**. It runs the setup's connection step again and explains what's wrong.
Repairing never changes settings you made yourself in the apps.

### "Search sites can't be reached"

Your search sites (indexers) aren't answering through the VPN. Often it's the site itself, or the
VPN server is blocked by that site.

1. Wait 15 minutes: EasyArr tries the sites again by itself.
2. If it stays: pick another VPN country in **Settings** → **VPN**.
3. Some sites block VPNs or bots. Add another site in Prowlarr (see [Search sites](indexers.md)).

### "Storage is almost full"

Your Umbrel's disk has less than 10 % free. Delete movies or shows you've watched (in Jellyfin, or
in Sonarr/Radarr with **Delete files**), or move them to another drive.

## Downloads

### A request never starts downloading

Look at **Needs your attention** on the home screen. EasyArr explains there why something hasn't
arrived:

- **Nothing found yet**: your search sites don't have it (yet). EasyArr keeps searching by itself;
  **Search now** searches right away. Adding more search sites helps most.
- **Only in another language or a lower quality**: press the button (for example **Download that
  version**) to take it anyway.
- **A download is stuck**: press **Try another version**. EasyArr removes it and looks for another
  one.

### A torrent is stuck on "Downloading metadata"

Nobody shares this torrent at the moment. EasyArr removes torrents that are stuck for too long by
itself and searches for another one, usually within 15–30 minutes.

### Usenet downloads fail

Check your Usenet provider in **Settings** → **Usenet** and press **Test this provider**. "Server requires
username and password" means the login is wrong. "Timed out" usually means the server name or port
is wrong. See [Usenet explained](usenet-101.md).

## Watching

### I can't sign in to Jellyfin or Jellyseerr

Use the username and password you chose in the setup's **Account** step. Family members get their
own accounts, see [Family accounts](family-accounts.md).

### There are two Jellyfins

If the official Umbrel Jellyfin app is installed too, you have two separate libraries. See
[Two Jellyfins](two-jellyfins.md).

## Backups

### A restore asks for a password

The backup was made with **Protect with a password** on. Without that password the file can't be
opened. See [Backups](backup-restore.md).
