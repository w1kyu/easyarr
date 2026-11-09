# Backups: keep your setup safe

An EasyArr backup holds **your setup, not your movies**. If your Umbrel breaks, or you reinstall
EasyArr, a backup brings everything back in a few minutes: your answers from the setup, your
account, your VPN, the connections between the apps, and what Sonarr, Radarr, Lidarr, Prowlarr
and Jellyfin remember.

## What's in a backup

| Comes back exactly as it was | Set up again from your answers | Never in a backup |
|---|---|---|
| Your answers, account and VPN settings | qBittorrent | Your movies, shows and music |
| Sonarr, Radarr, Lidarr: your shows, movies and artists, history, settings | SABnzbd | Downloads that aren't finished |
| Prowlarr: your search sites | Bazarr | |
| Jellyfin: users, what you watched, libraries, settings | Jellyseerr (past requests are not kept) | |
| | Cleanuparr, Recyclarr, Unpackerr | |

"Set up again" means EasyArr connects those apps the same way the setup did. Changes you made by
hand inside them are not kept.

Your media files stay in **Files → EasyArr → media** on your Umbrel. They are not touched by a
backup or a restore. To keep a copy of them, copy that folder to another drive.

## Download a backup

1. Open EasyArr → **Settings** → **Backups**.
2. Leave **Protect with a password** on and pick a password. Write it down somewhere safe:
   without it, the backup can't be opened, not even by EasyArr.
3. Press **Download backup**. It takes about a minute: each app makes its own backup first.
4. Keep the file (it ends in `.easyarr`) somewhere other than your Umbrel, for example on your
   computer or a USB stick.

Why a password? The backup contains your VPN key and your passwords. With a password, the file is
encrypted (AES-256), so anyone who finds it can't read them.

## Automatic backups

EasyArr makes a backup every day at 04:00 (your time) and keeps the newest 7. You can change the
time and how many to keep in **Settings → Backups**, or turn them off.

Automatic backups stay on your Umbrel, without a password, in **Files → EasyArr → backups**. That
protects you from mistakes and broken apps, but not from a broken Umbrel. To keep a copy somewhere
else:

1. Open **Files** on your Umbrel → **EasyArr** → **backups**.
2. Select the newest file → **Download**.
3. Store it somewhere other than your Umbrel.

Or download a password-protected backup from **Settings → Backups** (above).

## Restore a backup

You can restore at any time: from the first setup screen (**Restore from backup**) after a fresh
install, or later from **Settings → Backups**.

1. Press **Restore from backup** and choose your `.easyarr` file. (An automatic backup: press
   **Restore** next to it in **Settings → Backups**.)
2. If the backup has a password, enter it.
3. EasyArr shows what's in the backup. Check it, then press **Restore this backup**.
4. Keep the page open. You'll see each step: the apps restart while their data comes back, then
   EasyArr tests the VPN and connects all apps again. This takes a few minutes.
5. When it says **Your setup is back**, you're done.

Restoring replaces EasyArr's current settings with the ones in the backup.

### If something didn't work

- **"That password doesn't open this backup"**: check the password (upper and lower case count).
- **"This backup file is damaged"**: the file was cut off or changed, for example by an
  incomplete download. Try another copy.
- **"Made by a newer version of EasyArr"**: update EasyArr in the Umbrel App Store first.
- **An app couldn't take its own backup**: EasyArr set it up again from your answers instead.
  It works, but its history from the backup is missing.
- **The VPN didn't connect**: open **Settings → VPN** and test it. Your VPN account may have
  changed since the backup was made.
- **Some connections need attention**: open **Settings → Advanced** → **Repair connections**.
