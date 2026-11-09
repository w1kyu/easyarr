# Quality presets

In the setup's "What do you want?" step you pick one of three presets. It decides which versions
EasyArr looks for and how much disk space your library takes. You can switch later; files you
already have stay as they are.

| Preset | Movies and shows | Music | Roughly per movie | per hour of TV | per album |
| --- | --- | --- | --- | --- | --- |
| **Best quality** | 4K (2160p) from streaming services when it exists, otherwise 1080p | Lossless (FLAC) | 15–30 GB | 4–12 GB | 300–600 MB |
| **Balanced** (default) | 1080p from Blu-ray or streaming services | High-quality MP3/AAC, upgraded to lossless when available | 6–15 GB | 1.5–4 GB | 100–600 MB |
| **Save space** | 1080p, preferring smaller files | High-quality MP3/AAC | 3–8 GB | 1–2 GB | 80–150 MB |

Sizes are rough averages — a three-hour film is bigger than a short one, and animation is
usually smaller.

## Which one should I pick?

- **Balanced** suits most people: sharp on a big TV, and a 4 TB disk holds a few hundred movies.
- **Best quality** if you have a 4K TV and plenty of storage. Not every movie or show exists
  in 4K — then EasyArr takes 1080p, so nothing stays missing.
- **Save space** for phones, tablets, laptops or a small disk.

Your Umbrel's home screen and Settings show how much space is free.

## What EasyArr sets up

- **Shows and movies:** EasyArr uses [Recyclarr](https://recyclarr.dev) to create a quality
  profile in Sonarr and Radarr from the [TRaSH guides](https://trash-guides.info) — a community
  guide to good releases. The profile is called **"EasyArr (Best quality)"**, **"EasyArr
  (Balanced)"** or **"EasyArr (Save space)"**.
  - Best quality: TRaSH profiles *WEB-2160p* (shows) and *WEBDL 2160p* (movies), both with a
    1080p fallback.
  - Balanced: *WEB-1080p* (shows) and *HD Bluray + WEB* (movies).
  - Save space: *WEB-1080p* (shows) and *WEB 1080p* (movies), with sizes leaning to the small end.
- **Two changes to the TRaSH profiles:**
  - Releases from groups the guide calls low quality (for example YTS) aren't blocked. They're a
    last resort: EasyArr takes one only when nothing better exists at the same resolution, and
    replaces it automatically when a better version shows up. On public torrent sites they're often
    the only releases there are, and without them your request would just stay "Missing".
  - Balanced movies: 1080p from Blu-ray and from streaming services count as the same quality, so
    the release's score decides. Otherwise a low-quality "Blu-ray" would beat a good streaming
    release.
- **Music:** EasyArr creates its own Lidarr profile with the same name.

## Languages

In the setup you pick two lists, each best first:

- **Audio** (what you hear), for example 1. German, 2. Original language, 3. English. "Original
  language" means the language the film or show was made in.
- **Subtitles** (what you read), for example 1. German, 2. English. The list may be empty.

Any language can be marked **Must have**:

- **Audio must-haves:** a file needs at least one of them. If none of them is available, EasyArr
  doesn't download anything else without asking you. Without must-haves any language is fine and
  the order only says what you prefer.
- **Subtitle must-haves:** downloads don't wait for subtitles. Bazarr keeps looking, and the home
  screen shows which movies and episodes are still missing them.

What each app does with this:

- **Sonarr and Radarr:** EasyArr adds its own "EasyArr – Language: …" rules. A release in your first
  audio language scores highest, the next one a bit less, and so on. Quality still comes first: a
  1080p release in your second language beats a 720p one in your first. When a better-ranked language
  shows up at the same quality, it replaces the file automatically.
- **Bazarr:** looks for subtitles in your subtitle languages, in that order.
- **Jellyfin:** plays your first audio language when a file has several, shows your first subtitle
  language when the audio is in another language, and uses that language for titles and descriptions.
- **Request page (Jellyseerr):** has no language setting of its own. Requests use the EasyArr
  profiles above, so they follow your languages too.

If you installed EasyArr before this, your lists now read: audio "Original language, then <the
language you chose>", subtitles "<the language you chose>", nothing marked as must-have. Change them
in **Settings → Libraries & quality**.

## Whole seasons and trying again

- **Whole seasons:** when you ask for a show or a season that's already finished, Sonarr searches
  season by season, and EasyArr's profile gives a whole-season pack a bonus over single episodes.
  Seasons that are still airing come episode by episode. A season pack alone never makes EasyArr
  download episodes you already have again.
- **Trying again:** if nothing was found when you asked for something, EasyArr asks Sonarr and
  Radarr to search again every 6 hours, a few items at a time so your search sites don't block you.
  Change how often (or switch it off) in **Settings → Advanced**. It pauses while the VPN is down
  or every search site is unreachable.

## When something doesn't arrive

If a movie or episode you asked for still hasn't started downloading after about 12 hours, EasyArr
asks Sonarr or Radarr why and shows it under **Needs your OK** on the home screen, in plain words,
with a button where there's a way out:

- Only available in a language you didn't mark as a must-have → **Download in English** (or
  whichever language exists).
- Only a lower quality exists → **Accept 720p** (cinema recordings are never offered).
- Every version failed before → **Try the best one again**.
- Nothing found, or nobody is sharing it → **Search now** (EasyArr also keeps looking by itself).
- A download got stuck or couldn't be added to your library → **Try another version**.
- Your request didn't reach Sonarr or Radarr → **Send it again**.

Nothing switches to another language or quality unless you click. If you'd rather not be asked,
turn on **Settings → Advanced → Accept alternatives automatically**: EasyArr then takes the best
other version itself and tells you on the home screen. Problems with the whole setup (VPN down,
search sites unreachable, disk full, an app not answering) show in the warnings at the top instead.

## Want to fine-tune?

EasyArr owns the "EasyArr (…)" profiles and resets them when it updates them. To customise, open
Sonarr or Radarr → **Settings → Profiles**, clone the EasyArr profile, edit the copy and use that
one instead.
