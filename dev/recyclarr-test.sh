#!/usr/bin/env bash
# jq filters are single-quoted on purpose; the directive before the first command covers the file.
# shellcheck disable=SC2016
# EasyArr's Recyclarr config against the real Recyclarr, Radarr and Sonarr images from the Umbrel
# compose (outside the VPN, so Recyclarr can fetch the TRaSH guides — the stack test can't).
#
#   dev/recyclarr-test.sh      needs Docker, jq and `pnpm build`
#
# Checks per quality preset: the profiles Recyclarr makes have LQ as a last resort (D-055), the
# Balanced movie profile has one 1080p group, a second sync changes nothing, and a v0.0.8 install
# (profiles made with the old config) is converted by the new one.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE="${ROOT}/umbrel/w1kyu-easyarr/docker-compose.yml"
GEN="${ROOT}/dashboard/server/scripts/recyclarr-config.mjs"
img() { grep -E "image: .*/$1:" "${COMPOSE}" | head -1 | sed -E 's/.*image: //'; }
RADARR_IMG="$(img radarr)"
SONARR_IMG="$(img sonarr)"
RECYCLARR_IMG="$(img recyclarr)"
NET="easyarr-recyclarr-test"
BUSYBOX="busybox:1.38.0@sha256:a46257e06c82ad85242d0d38077d0a52d9896389ca60a1a59d3463db586e5fa4"
WORK="$(mktemp -d)"
FAILED=0

cleanup() {
  docker rm -f rt-radarr rt-sonarr >/dev/null 2>&1 || true
  docker network rm "${NET}" >/dev/null 2>&1 || true
  docker run --rm -v "${WORK}:/w" "${BUSYBOX}" rm -rf /w/radarr /w/sonarr >/dev/null 2>&1 || true
  rm -rf "${WORK}"
}
trap cleanup EXIT

pass() { echo "PASS $*"; }
fail() {
  echo "FAIL $*"
  FAILED=1
}
check() { # check <name> <jq filter that must print true> <json>
  local out
  out="$(jq -r "$2" <<<"$3")"
  if [ "${out}" = "true" ]; then pass "$1"; else fail "$1 (got: ${out})"; fi
}

docker network create "${NET}" >/dev/null
mkdir -p "${WORK}/radarr" "${WORK}/sonarr" "${WORK}/recyclarr"
docker run -d --name rt-radarr --network "${NET}" -p 127.0.0.1:17878:7878 \
  -e PUID="$(id -u)" -e PGID="$(id -g)" -v "${WORK}/radarr:/config" "${RADARR_IMG}" >/dev/null
docker run -d --name rt-sonarr --network "${NET}" -p 127.0.0.1:18989:8989 \
  -e PUID="$(id -u)" -e PGID="$(id -g)" -v "${WORK}/sonarr:/config" "${SONARR_IMG}" >/dev/null

api_key() { sed -n 's:.*<ApiKey>\(.*\)</ApiKey>.*:\1:p' "${WORK}/$1/config.xml" 2>/dev/null || true; }
for app in radarr sonarr; do
  port=17878
  [ "${app}" = sonarr ] && port=18989
  for _ in $(seq 1 90); do
    key="$(api_key "${app}")"
    if [ -n "${key}" ] && curl -fsS -m 5 -o /dev/null -H "X-Api-Key: ${key}" \
      "http://127.0.0.1:${port}/api/v3/system/status"; then
      break
    fi
    sleep 2
  done
  [ -n "$(api_key "${app}")" ] || {
    echo "${app} did not start"
    docker logs "rt-${app}" | tail -30
    exit 1
  }
done
RK="$(api_key radarr)"
SK="$(api_key sonarr)"
radarr() { curl -fsS -m 20 -H "X-Api-Key: ${RK}" "http://127.0.0.1:17878/api/v3/$1"; }
sonarr() { curl -fsS -m 20 -H "X-Api-Key: ${SK}" "http://127.0.0.1:18989/api/v3/$1"; }

sync() { # sync <preset> [--v0.0.8]
  local flag=()
  [ -n "${2:-}" ] && flag=("$2")
  node "${GEN}" "$1" http://rt-radarr:7878 "${RK}" http://rt-sonarr:8989 "${SK}" "${flag[@]}" \
    >"${WORK}/recyclarr/recyclarr.yml"
  if ! docker run --rm --network "${NET}" --user "$(id -u):$(id -g)" \
    -v "${WORK}/recyclarr:/config" --entrypoint recyclarr "${RECYCLARR_IMG}" \
    sync --log info >"${WORK}/sync.log" 2>&1; then
    fail "recyclarr sync $1 ${2:-}"
    tail -40 "${WORK}/sync.log"
    exit 1
  fi
  grep -E -i "warn|error" "${WORK}/sync.log" | head -20 || true
  [ -n "${RT_VERBOSE:-}" ] && sed 's/^/   | /' "${WORK}/sync.log"
  return 0
}

profile() { # profile <app> <name>
  "$1" qualityprofile | jq --arg n "$2" '.[] | select(.name == $n)'
}

check_profile() { # check_profile <app> <preset label>
  local app="$1" name="EasyArr ($2)" p
  p="$(profile "${app}" "${name}")"
  check "${app} ${name}: exists" 'type == "object"' "${p:-null}"
  check "${app} ${name}: minimum score -20" '.minFormatScore == -20' "${p}"
  check "${app} ${name}: LQ formats score -10" \
    '[.formatItems[] | select(.name == "LQ" or .name == "LQ (Release Title)") | .score] == [-10, -10]' "${p}"
  check "${app} ${name}: nothing else between -20 and 0" \
    '[.formatItems[] | select(.score < 0 and .score >= -20 and (.name | startswith("LQ") | not))] == []' "${p}"
  check "${app} ${name}: other unwanted formats still blocked" \
    '[.formatItems[] | select(.name == "BR-DISK") | .score] == [-10000]' "${p}"
}

check_sizes() { # check_sizes <app>: small LQ encodes pass the minimum size (D-063)
  local defs
  defs="$("$1" qualitydefinition)"
  echo "   $1 sizes: $(jq -c '[.[] | select(.quality.name | test("^(WEBDL|WEBRip|Bluray|HDTV)-(720|1080)p$")) | {(.quality.name): .minSize}] | add' <<<"${defs}")"
  check "$1: minimum sizes lowered (720p 5, 1080p 10, 2160p 20 MB/min)" \
    '[.[] | select(.quality.name | test("^(WEBDL|WEBRip|Bluray)-(720|1080|2160)p$")) | {(.quality.name): .minSize}] | add == {"WEBDL-720p":5,"WEBRip-720p":5,"Bluray-720p":5,"WEBDL-1080p":10,"WEBRip-1080p":10,"Bluray-1080p":10,"WEBDL-2160p":20,"WEBRip-2160p":20,"Bluray-2160p":20}' "${defs}"
  check "$1: other minimums stay as the guide has them" \
    '[.[] | select(.quality.name == "HDTV-1080p") | .minSize > 10] == [true]' "${defs}"
}

check_balanced_radarr() {
  local p
  p="$(profile radarr 'EasyArr (Balanced)')"
  check "radarr Balanced: one 1080p group with Bluray + WEB" \
    '[.items[] | select(.name == "Bluray/WEB 1080p" and .allowed) | [.items[].quality.name] | sort] == [["Bluray-1080p","WEBDL-1080p","WEBRip-1080p"]]' "${p}"
  check "radarr Balanced: allowed = the 1080p group + Bluray-720p" \
    '[.items[] | select(.allowed) | (.name // .quality.name)] == ["Bluray-720p","Bluray/WEB 1080p"]' "${p}"
  check "radarr Balanced: cutoff is the 1080p group" \
    '(.cutoff as $c | [.items[] | select(.id == $c) | .name]) == ["Bluray/WEB 1080p"]' "${p}"
  check "radarr Balanced: upgrades on, until score 10000" \
    '.upgradeAllowed == true and .cutoffFormatScore == 10000' "${p}"
}

echo "== upgrade from a v0.0.8 install (Balanced: old config first, then the new one on top)"
RT_VERBOSE=1 sync balanced --v0.0.8
old="$(profile radarr 'EasyArr (Balanced)')"
check "v0.0.8 config: LQ blocked (as before)" \
  '[.formatItems[] | select(.name == "LQ") | .score] == [-10000]' "${old}"
RT_VERBOSE=1 sync balanced
check_profile radarr Balanced
check_profile sonarr Balanced
check_balanced_radarr
check_sizes radarr
check_sizes sonarr

# YTS is what public sites mostly have; it must count as LQ.
title='Night.of.the.Living.Dead.1968.1080p.BluRay.x264-YTS'
check "radarr: a YTS release matches LQ" '[.customFormats[]?.name] | index("LQ") != null' \
  "$(radarr "parse?title=${title}")"

echo "== second sync changes nothing"
before="$(radarr qualityprofile | jq -S .)$(sonarr qualityprofile | jq -S .)"
sync balanced
after="$(radarr qualityprofile | jq -S .)$(sonarr qualityprofile | jq -S .)"
if [ "${before}" = "${after}" ]; then pass "idempotent"; else
  fail "second sync changed the profiles"
  diff <(echo "${before}") <(echo "${after}") | head -40
fi

for preset in best:'Best quality' small:'Save space'; do
  echo "== ${preset%%:*}"
  sync "${preset%%:*}"
  check_profile radarr "${preset#*:}"
  check_profile sonarr "${preset#*:}"
  check_sizes radarr
  check_sizes sonarr
done

if [ "${FAILED}" -ne 0 ]; then
  echo "RECYCLARR TEST FAILED"
  exit 1
fi
echo "RECYCLARR TEST PASSED"
