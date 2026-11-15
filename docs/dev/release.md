# Releasing a new version

A release puts a new version of the Umbrel app into the
[w1kyu/umbrel-app-store](https://github.com/w1kyu/umbrel-app-store) repo, where every Umbrel that
added the store finds it within about 5 minutes. Images are pinned by digest, so a release is
always: build the images, pin them, test the exact pinned stack, then sync the store.

> **What you'll need**
>
> - Push access to `w1kyu/easyarr` and `w1kyu/umbrel-app-store`, and `gh` logged in.
> - A clone of the store repo next to this one (`../umbrel-app-store`).
> - No Docker needed: images are built and the stack is tested in GitHub Actions.

## The workflows

| Workflow | Runs on | What it does |
| -------- | ------- | ------------ |
| `CI` (`ci.yml`) | every push | lint (incl. Markdown and docs links), typecheck, unit tests, build, Playwright e2e |
| `Image` (`image.yml`) | changes under `dashboard/`, bundled `docs/`, lockfile | builds `ghcr.io/w1kyu/easyarr` for amd64 + arm64, tags `sha-<short>` |
| `VPN image` (`vpn-image.yml`) | changes under `vpn/` | builds `ghcr.io/w1kyu/easyarr-vpn`, runs the image leak test |
| `Umbrel app` (`umbrel-app.yml`) | changes under `umbrel/`, `dev/`, `e2e/` | Umbrel's app linter, then the full stack on amd64 + arm64: leak test, wizard e2e, wiring against the real services, backup and restore |
| `Links` (`links.yml`) | docs changes, weekly | checks external links in the docs (doesn't block a release) |

## Steps

1. **Push the code change** to `main` and wait until `CI` and `Image` are green for that commit:

   ```sh
   gh run list --commit <sha>
   gh run watch <run-id> --exit-status
   ```

   If `vpn/` changed, wait for `VPN image` too.

2. **Get the image digest** of the new build (no Docker needed):

   ```sh
   TOKEN=$(curl -s "https://ghcr.io/token?scope=repository:w1kyu/easyarr:pull" | jq -r .token)
   curl -sI -H "Authorization: Bearer $TOKEN" \
     -H "Accept: application/vnd.oci.image.index.v1+json" \
     https://ghcr.io/v2/w1kyu/easyarr/manifests/sha-<short> | grep -i docker-content-digest
   ```

3. **Pin it** in `umbrel/w1kyu-easyarr/docker-compose.yml`, for **both** `init` and `dashboard`:
   `ghcr.io/w1kyu/easyarr:sha-<short>@sha256:<digest>`. Same for `easyarr-vpn` if it changed.

4. **Bump the version** in `umbrel/w1kyu-easyarr/umbrel-app.yml` (`version:` and `releaseNotes:`).
   Release notes are for users: one or two plain sentences per change, no internals.

5. **Commit and push** (`release: vX.Y.Z (pin sha-<short>: …)`), then wait for `Umbrel app` to be
   green on both architectures. A leak in the leak test blocks the release until it's fixed.

6. **Sync the store:**

   ```sh
   scripts/sync-store.sh            # or: scripts/sync-store.sh path/to/umbrel-app-store
   ```

   It copies `umbrel/w1kyu-easyarr/` into the store repo and pushes. Never edit the app folder in
   the store repo by hand.

7. **Test on a real Umbrel:** update from the previous version (settings must stay), and follow
   the owner checklist in `PROGRESS.md`. See [Test on a real Umbrel](development.md#4-test-on-a-real-umbrel).

## Keep code and pins in separate commits

The `Umbrel app` workflow tests the images **pinned in the compose file**. If a code commit also
touches `umbrel/`, the stack test runs against the old image and fails for the wrong reason. Push
the code first, pin in a second commit.

## Versions

SemVer. `0.0.x` are test releases. `umbrel-app.yml` is the only place the version lives: the
dashboard shows Umbrel's `APP_VERSION` (D-065), and the update check compares it with the store's
`umbrel-app.yml`.
