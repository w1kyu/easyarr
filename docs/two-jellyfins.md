# Two Jellyfins on one Umbrel

EasyArr brings its own Jellyfin (port **39096**). If the **Jellyfin app from the Umbrel App Store**
is installed too, you have two separate media servers:

- each has its own users, libraries and watch history;
- EasyArr's downloads only show up in **EasyArr's** Jellyfin;
- both use the processor and the disk, which slows things down when they scan or play.

## What to do

Most people only need one. If you don't use the other Jellyfin for anything else:

1. Open the Umbrel App Store → **Jellyfin** → **Uninstall**.
2. On your TV, phone or tablet, connect the Jellyfin app to `http://umbrel.local:39096`
   (EasyArr's Jellyfin) and sign in with your EasyArr account.

If you want to keep both, that's fine too. EasyArr keeps working. Just remember which one has
which movies, and use port **39096** for the ones EasyArr downloads.

The warning on the EasyArr home screen goes away a few minutes after the other app is uninstalled.
