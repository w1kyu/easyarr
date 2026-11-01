# Adding search sites (indexers) in Prowlarr

EasyArr finds torrents through **Prowlarr**. Prowlarr asks the search sites you choose, and shares
them with Sonarr (shows), Radarr (movies) and Lidarr (music) by itself — you add each site only
once, in Prowlarr.

EasyArr doesn't choose, rank or recommend sites. Which sites you use — and what you download —
is up to you. Only download content you have the right to download and share.

**Needs the VPN:** Prowlarr checks every site when you add it, through the VPN. If you skipped the
VPN, set it up first (setup step 5) or add your sites later.

## Step by step

1. In the setup, press **Open Prowlarr**. Prowlarr opens in a new tab — you're already signed in.
2. On the **Indexers** page, press **Add Indexer** (or **Add New Indexer** when the list is still
   empty).
3. A long list of sites appears. Type the name of a site you use into the search box, or narrow
   the list with the filters:
   - **Protocol**: `torrent` for torrent sites.
   - **Privacy**: **Public** sites are open to everyone; **Private** and **Semi-Private** sites
     need an account (often by invite).
   - **Language**: sites in your language.
4. Click the site. A form opens.
   - **Public site**: usually nothing to fill in.
   - **Private site**: enter what the form asks for — usually your **Username** and **Password**,
     an **API Key**, or a **Cookie** from that site. The site's own help pages say where to find it.
5. Press **Test**. A green check means Prowlarr can reach the site.
6. Press **Save**.
7. Want more? Add another one the same way. Two or three sites are a good start.
8. Come back to EasyArr. It notices the new sites by itself (or press **Check again**).

That's it: Prowlarr hands the sites to Sonarr, Radarr and Lidarr within a minute.

## "Blocked by CloudFlare Protection"

Some sites sit behind Cloudflare's bot check. Prowlarr then says
*"Unable to access …, blocked by CloudFlare Protection."* EasyArr includes **FlareSolverr**,
which solves that check for Prowlarr:

1. In the site's form, find **Tags**.
2. Type `flaresolverr` and pick it from the list.
3. Press **Test** again, then **Save**.

Only sites with that tag go through FlareSolverr (it's slower, so not all of them do).

## Something doesn't work?

| Prowlarr says                              | What to do                                                                 |
| ------------------------------------------ | -------------------------------------------------------------------------- |
| "Unable to connect" or a time-out          | Check that the VPN is connected (EasyArr home screen). Try again later — sites go down sometimes. |
| "blocked by CloudFlare Protection"         | Add the `flaresolverr` tag (see above).                                   |
| Login / API key / cookie refused            | Copy it again from the site. Cookies expire — get a fresh one.            |
| The site isn't in the list                  | Prowlarr only lists sites it supports. Pick another one.                  |

## Usenet indexers

Using Usenet? You enter your Usenet indexers in EasyArr's setup (step 6) instead, and EasyArr adds
them to Prowlarr for you. See [Usenet 101](usenet-101.md).
