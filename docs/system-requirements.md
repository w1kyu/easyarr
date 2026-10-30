# System requirements

EasyArr checks your Umbrel during setup. Here's what the results mean.

## Processor (architecture)

EasyArr runs on the two kinds of processors Umbrel supports:

- **amd64** — Intel and AMD computers (Umbrel Home, most mini PCs and old laptops).
- **arm64** — for example a Raspberry Pi 5.

## Memory (RAM)

EasyArr runs about a dozen apps at the same time.

| RAM          | Result                                                            |
| ------------ | ----------------------------------------------------------------- |
| 8 GB or more | ✅ Good                                                           |
| 4–8 GB       | ⚠️ Works, but other Umbrel apps may get slower                    |
| Below 4 GB   | ❌ Not enough. You can continue, but expect apps to crash or stall |

## Free disk space

Movies and shows are big. A movie is often 2–10 GB, a TV season 5–30 GB.
With less than **50 GB** free, EasyArr warns you. Downloads stop when the disk is full.

All your media is stored in **Files → Home → EasyArr** on your Umbrel.

## Graphics (GPU)

Jellyfin sometimes has to convert a video so it plays on a phone or TV (**transcoding**).
A graphics chip (for example Intel Quick Sync) does that quickly.

- **Found** ✅ — Jellyfin can use it for fast transcoding.
- **Not found** ⚠️ — Jellyfin still works. Converting high-quality video will be slow, so pick
  devices that can play your files directly when you can.

Umbrel gives EasyArr access to the graphics chip automatically when your computer has one.
