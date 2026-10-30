#!/usr/bin/env bash
# Copy the Umbrel app definition into the w1kyu/umbrel-app-store repo and push it.
#
#   scripts/sync-store.sh [path-to-store-clone]
#
# The store folder is generated: never edit w1kyu-easyarr/ in the store repo by hand.
# Automated by the release workflow in Phase 11.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_ID="w1kyu-easyarr"
STORE_DIR="${1:-${ROOT}/../projects/umbrel-app-store}"
SRC="${ROOT}/umbrel/${APP_ID}"

if [[ ! -f "${STORE_DIR}/umbrel-app-store.yml" ]]; then
  echo "Not a store clone: ${STORE_DIR} (expected umbrel-app-store.yml)" >&2
  exit 1
fi
if [[ -n "$(git -C "${ROOT}" status --porcelain -- "umbrel/${APP_ID}")" ]]; then
  echo "umbrel/${APP_ID} has uncommitted changes; commit them first." >&2
  exit 1
fi

git -C "${STORE_DIR}" pull --ff-only --quiet
rm -rf "${STORE_DIR:?}/${APP_ID}"
cp -R "${SRC}" "${STORE_DIR}/${APP_ID}"

SHA="$(git -C "${ROOT}" rev-parse --short HEAD)"
VERSION="$(sed -n 's/^version: *//p' "${SRC}/umbrel-app.yml" | tr -d "\"' ")"

git -C "${STORE_DIR}" add -A "${APP_ID}"
if git -C "${STORE_DIR}" diff --cached --quiet; then
  echo "Store already up to date."
  exit 0
fi
git -C "${STORE_DIR}" commit --quiet -m "feat(${APP_ID}): sync v${VERSION} from w1kyu/easyarr@${SHA}"
git -C "${STORE_DIR}" push --quiet
echo "Synced ${APP_ID} v${VERSION} (easyarr@${SHA}) to the store."
