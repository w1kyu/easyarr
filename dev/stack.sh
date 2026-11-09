#!/usr/bin/env bash
# Run the EasyArr Umbrel stack on a normal Docker host (laptop or CI).
#
#   dev/stack.sh up         install package files like umbrelOS does, then start the stack
#   dev/stack.sh wait [s]   wait until every service with a healthcheck is healthy (vpn excluded)
#   dev/stack.sh leaktest   kill-switch + reachability checks (SPEC §5.2)
#   dev/stack.sh wiretest   finish the wizard through the API, run the wiring engine against the
#                           real services, check the result and that a second run changes nothing
#   dev/stack.sh ps|logs    docker compose ps / logs
#   dev/stack.sh down       stop and remove containers (keeps dev/data)
#   dev/stack.sh reset      down + delete dev/data (uses Docker to remove root-owned files)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_ID="w1kyu-easyarr"
PACKAGE_DIR="${ROOT}/umbrel/${APP_ID}"
DEV_DATA="${ROOT}/dev/data"
BUSYBOX="busybox:1.38.0@sha256:a46257e06c82ad85242d0d38077d0a52d9896389ca60a1a59d3463db586e5fa4"

# Umbrel-like environment (see PROGRESS.md → Verified facts).
export UMBREL_ROOT="${DEV_DATA}/umbrel"
export APP_DATA_DIR="${UMBREL_ROOT}/app-data/${APP_ID}"
export NETWORK_IP="10.21.0.0"
export DEVICE_HOSTNAME="localhost"
export DEVICE_DOMAIN_NAME="localhost"
export APP_PROXY_PORT="39000"

compose() {
  docker compose -p "${APP_ID}" \
    -f "${PACKAGE_DIR}/docker-compose.yml" \
    -f "${ROOT}/dev/docker-compose.dev.yml" "$@"
}

c() { echo "${APP_ID}_$1_1"; }

install_package() {
  # umbrelOS copies the package into app-data, drops .gitkeep files and owns it as 1000:1000.
  mkdir -p "${APP_DATA_DIR}"
  (cd "${PACKAGE_DIR}" && find data -type d) | while read -r dir; do
    mkdir -p "${APP_DATA_DIR}/${dir}"
  done
  docker run --rm -v "${DEV_DATA}:/dev-data" "${BUSYBOX}" chown -R 1000:1000 /dev-data/umbrel/app-data
}

wait_healthy() {
  local timeout="${1:-600}" start
  start=$(date +%s)
  while true; do
    local pending=()
    for id in $(compose ps -aq); do
      local name state health
      name=$(docker inspect -f '{{.Name}}' "$id" | sed 's#^/##')
      state=$(docker inspect -f '{{.State.Status}}' "$id")
      health=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$id")
      # init is a one-shot. vpn is healthy when its kill switch is in place (no VPN account needed, D-040).
      [[ "$name" == "$(c init)" ]] && continue
      if [[ "$state" != "running" ]]; then pending+=("$name=$state"); continue; fi
      [[ "$health" == "healthy" || "$health" == "none" ]] || pending+=("$name=$health")
    done
    if [[ ${#pending[@]} -eq 0 ]]; then echo "All services running and healthy."; return 0; fi
    if (($(date +%s) - start > timeout)); then
      echo "Timed out waiting for: ${pending[*]}" >&2
      return 1
    fi
    sleep 10
  done
}

fail=0
check() { # check <description> <expect: ok|fail> <command...>
  local desc="$1" expect="$2" got
  shift 2
  if "$@" >/dev/null 2>"${TMPDIR:-/tmp}/easyarr-check.err"; then got=ok; else got=fail; fi
  if [[ "$got" == "$expect" ]]; then
    echo "PASS  $desc"
  else
    echo "FAIL  $desc (expected $expect, got $got)"
    if [[ "$expect" == ok ]]; then sed 's/^/      /' "${TMPDIR:-/tmp}/easyarr-check.err" | tail -5; fi
    fail=1
  fi
}

init_is_idempotent() {
  local out
  out=$(compose run --rm --no-deps init 2>&1)
  grep -q 'everything already in place' <<<"$out" || {
    echo "$out" | tail -5 >&2
    return 1
  }
}
dashboard_serves_app() { url_has http://localhost:39000/ 'id="root"'; }

# Retries a command for up to N seconds.
wait_for() {
  local secs=$1
  shift
  for _ in $(seq 1 "$secs"); do
    "$@" >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}

# Saves a custom WireGuard config whose endpoint is TEST-NET-1 (RFC 5737, never routed). The keys are
# Gluetun's public documentation examples, not secrets.
save_dead_end_vpn() {
  local conf='[Interface]\nPrivateKey = wOEI9rqqbDwnN8/Bpp22sVz48T71vJ4fYmFWujulwUU=\nAddress = 10.64.222.21/32\n[Peer]\nPublicKey = wAUaJMhAq3NFutLHIdF8AN0B5WG8RndfQKLPTEDHal0=\nEndpoint = 192.0.2.1:51820\n'
  curl -fsS -m 10 -o /dev/null -X POST -H 'content-type: application/json' \
    -d "{\"provider\":\"custom\",\"protocol\":\"wireguard\",\"fields\":{\"wgConfig\":\"$conf\"}}" \
    http://localhost:39000/api/vpn/config
}

leaktest() {
  local probe=(docker run --rm --network umbrel_main_network "${BUSYBOX}")

  echo "== Control: internet works outside the VPN namespace"
  check "outside container fetches http://example.com" ok "${probe[@]}" wget -q -O /dev/null -T 10 http://example.com

  echo "== Kill switch: nothing inside the VPN namespace reaches the internet"
  for svc in qbittorrent sonarr; do
    # Guard: a missing tool would also "fail" and hide a leak.
    check "$svc has curl + getent" ok docker exec "$(c "$svc")" sh -c 'command -v curl && command -v getent'
    check "$svc -> https://1.1.1.1 (by IP)" fail docker exec "$(c "$svc")" curl -sS -m 8 -o /dev/null https://1.1.1.1
    check "$svc -> http://example.com (DNS + HTTP)" fail docker exec "$(c "$svc")" curl -sS -m 8 -o /dev/null http://example.com
    check "$svc resolves example.com" fail docker exec "$(c "$svc")" getent hosts example.com
  done

  echo "== With VPN settings that can never connect (TEST-NET endpoint), saved through the dashboard"
  check "dashboard saves VPN settings (via the Umbrel-like gateway)" ok save_dead_end_vpn
  check "wrapper started Gluetun with them" ok wait_for 60 sh -c \
    "docker exec $(c vpn) cat /gluetun/easyarr/status.json | grep -q '\"state\":\"running\"'"
  check "dashboard does not claim the VPN is connected" ok sh -c \
    "curl -fsS -m 10 http://localhost:39000/api/vpn/status | grep -vq '\"connection\":\"connected\"'"
  for svc in qbittorrent sonarr; do
    check "$svc -> https://1.1.1.1 while Gluetun tries to connect" fail docker exec "$(c "$svc")" curl -sS -m 8 -o /dev/null https://1.1.1.1
    check "$svc resolves example.com while Gluetun tries to connect" fail docker exec "$(c "$svc")" timeout 10 getent hosts example.com
  done
  check "dashboard asks for a reconnect" ok curl -fsS -m 10 -o /dev/null -X POST -H 'content-type: application/json' -d '{}' http://localhost:39000/api/vpn/reconnect
  check "qbittorrent -> https://1.1.1.1 during the reload" fail docker exec "$(c qbittorrent)" curl -sS -m 5 -o /dev/null https://1.1.1.1
  check "vpn container is still healthy (kill switch in place)" ok wait_for 30 sh -c \
    "[ \"\$(docker inspect -f '{{.State.Health.Status}}' $(c vpn))\" = healthy ]"

  echo "== Access control (D-041)"
  check "other apps on the Docker network can't use the dashboard API" fail "${probe[@]}" wget -q -O /dev/null -T 10 "http://$(c dashboard):3000/api/wizard"
  check "Gluetun's control server refuses requests without the key" fail "${probe[@]}" wget -q -O /dev/null -T 10 "http://$(c vpn):8000/v1/publicip/ip"

  echo "== Inside the VPN namespace, services reach each other on localhost"
  check "qbittorrent -> sonarr via localhost:8989" ok \
    docker exec "$(c qbittorrent)" curl -fsS -m 8 -o /dev/null http://localhost:8989/ping

  echo "== The dashboard reaches the services via $(c vpn)"
  local dash=(docker exec "$(c dashboard)")
  check "dashboard has wget (guards the next checks)" ok "${dash[@]}" sh -c 'command -v wget'
  for port_path in 8090/ 9696/ping 8191/ 8989/ping 7878/ping 8686/ping 6767/apps/bazarr/api/system/ping 11011/apps/cleanuparr/health; do
    check "dashboard -> http://$(c vpn):${port_path}" ok "${dash[@]}" wget -q -O /dev/null -T 10 "http://$(c vpn):${port_path}"
  done
  # SABnzbd answers 403 to unknown Host headers until its host_whitelist is seeded (phase 05),
  # so only check that it answers over HTTP at all.
  check "dashboard -> http://$(c vpn):8080/ answers (SABnzbd)" ok "${dash[@]}" sh -c \
    "wget -S -O /dev/null -T 10 http://$(c vpn):8080/ 2>&1 | grep -q 'HTTP/1'"
  check "sonarr answers under its url base /apps/sonarr" ok "${dash[@]}" wget -q -O /dev/null -T 10 "http://$(c vpn):8989/apps/sonarr/ping"

  echo "== Only the dashboard and the request page may connect to the services (D-046)"
  check "dashboard wrote the allowed-clients list" ok wait_for 60 docker exec "$(c vpn)" grep -q '^[0-9]' /gluetun/easyarr/allowed-clients
  check "request page (Jellyseerr) -> sonarr" ok wait_for 30 docker exec "$(c jellyseerr)" wget -q -O /dev/null -T 5 "http://$(c vpn):8989/ping"
  check "another app on the Docker network -> sonarr is refused" fail "${probe[@]}" wget -q -O /dev/null -T 8 "http://$(c vpn):8989/ping"
  check "another app on the Docker network -> qbittorrent is refused" fail "${probe[@]}" wget -q -O /dev/null -T 8 "http://$(c vpn):8090/"
  check "another app on the Docker network -> flaresolverr is refused" fail "${probe[@]}" wget -q -O /dev/null -T 8 "http://$(c vpn):8191/"

  echo "== Service UIs through the dashboard proxy (D-045)"
  check "/apps/sonarr/ via :39000" ok curl -fsS -m 15 -o /dev/null http://localhost:39000/apps/sonarr/
  check "/apps/qbittorrent/ via :39000" ok curl -fsS -m 15 -o /dev/null http://localhost:39000/apps/qbittorrent/
  check "/apps/* refuses other apps" fail "${probe[@]}" wget -q -O /dev/null -T 8 "http://$(c dashboard):3000/apps/sonarr/"

  echo "== Init seeded the service configs (UrlBase) and the dashboard API is up"
  check "dashboard /api/health" ok "${probe[@]}" wget -q -O /dev/null -T 10 "http://$(c dashboard):3000/api/health"
  check "init is idempotent (second run changes nothing)" ok init_is_idempotent

  echo "== Published ports"
  check "dashboard web app on :39000" ok dashboard_serves_app
  check "Jellyfin on :39096" ok curl -fsS -m 10 -o /dev/null http://localhost:39096/health
  check "Jellyseerr on :39055" ok curl -fsS -m 10 -o /dev/null http://localhost:39055/api/v1/status

  echo "== Storage: one /data mount, hardlinks work"
  for d in downloads/torrents/movies downloads/usenet/complete/tv media/music backups; do
    check "/data/$d exists" ok docker exec "$(c sonarr)" test -d "/data/$d"
  done
  check "hardlink downloads -> media as UID 1000" ok \
    docker exec -u 1000:1000 "$(c sonarr)" sh -c \
    'touch /data/downloads/.t && ln /data/downloads/.t /data/media/.t && rm /data/downloads/.t /data/media/.t'

  if [[ $fail -ne 0 ]]; then
    echo "LEAK TEST FAILED"
    return 1
  fi
  echo "LEAK TEST PASSED"
}

# One wiring run over the API; prints one line per step, leaves the SSE stream in $1.
wiring_run() {
  curl -sS -N -m 1500 -X POST -H 'content-type: application/json' -d '{}' \
    http://localhost:39000/api/wiring/run >"$1"
  python3 - "$1" <<'PY'
import json, sys
for line in open(sys.argv[1]):
    if not line.startswith("data: "):
        continue
    e = json.loads(line[6:])
    if e.get("type") == "step" and e["state"] in ("done", "failed"):
        err = e.get("error", {})
        extra = " — ".join([err.get("message", ""), *err.get("details", [])]) if e["state"] == "failed" else f"changes={e.get('changes')} notes={len(e.get('notes', []))}"
        print(f"   {e['state']:6} {e['step']:28} {extra}")
    elif e.get("type") in ("end", "error"):
        print(f"   {e}")
PY
}

# Steps that may fail in CI: Recyclarr downloads the TRaSH guides, and CI has no real VPN.
# The language steps need the profile recyclarr.sync makes (D-066), so they fail along with it.
OFFLINE_STEPS='recyclarr.sync sonarr.languages radarr.languages'

wiring_failed_steps() {
  python3 - "$1" "$OFFLINE_STEPS" <<'PY'
import json, sys
allowed = set(sys.argv[2].split())
for line in open(sys.argv[1]):
    if line.startswith("data: "):
        e = json.loads(line[6:])
        if e.get("type") == "step" and e["state"] == "failed" and e["step"] not in allowed:
            print(e["step"])
PY
}

wiring_changes() {
  python3 - "$1" "$OFFLINE_STEPS" <<'PY'
import json, sys
allowed = set(sys.argv[2].split())
n = 0
for line in open(sys.argv[1]):
    if line.startswith("data: "):
        e = json.loads(line[6:])
        if e.get("type") == "step" and e["state"] == "done" and e["step"] not in allowed:
            n += e.get("changes", 0)
print(n)
PY
}

# GET inside a VPN-side container with that app's API key from its config.xml.
arr_get() {
  local app=$1 port=$2 path=$3
  # shellcheck disable=SC2016 # expanded inside the container
  docker exec "$(c "$app")" sh -c \
    'k=$(sed -n "s:.*<ApiKey>\(.*\)</ApiKey>.*:\1:p" /config/config.xml); curl -fsS -m 15 -H "X-Api-Key: $k" "http://localhost:$0/apps/$1$2"' \
    "$port" "$app" "$path"
}

# Capture first: with pipefail, `curl | grep -q` fails when grep exits early and curl gets SIGPIPE.
arr_has() {
  local out
  out="$(arr_get "$1" "$2" "$3")"
  grep -q -- "$4" <<<"$out"
}
sonarr_has_both_clients() {
  local list
  list="$(arr_get sonarr 8989 /api/v3/downloadclient)"
  grep -q QBittorrent <<<"$list" && grep -q Sabnzbd <<<"$list"
}
prowlarr_has_three_apps() {
  [[ "$(arr_get prowlarr 9696 /api/v1/applications | grep -oE '"implementation": *"(Sonarr|Radarr|Lidarr)"' | sort -u | wc -l)" -eq 3 ]]
}
qbittorrent_has_categories() {
  local cats
  cats="$(docker exec "$(c qbittorrent)" curl -fsS -m 10 http://localhost:8090/api/v2/torrents/categories)"
  grep -q '"tv"' <<<"$cats" && grep -q '"movies"' <<<"$cats" && grep -q '"music"' <<<"$cats"
}
# Cleanuparr trusts loopback once the wiring set disableAuthForLocalAddresses → no key needed.
cleanuparr_has() {
  local out
  out="$(docker exec "$(c cleanuparr)" curl -fsS -m 10 "http://localhost:11011/apps/cleanuparr/api$1")"
  grep -qE -- "$2" <<<"$out"
}
# Seerr's "Open in Radarr" link: the external URL must be the dashboard proxy, not the container.
seerr_radarr_link_ok() {
  local key out
  key="$(docker exec "$(c dashboard)" node -p "require('/easyarr/secrets.json').apiKeys.jellyseerr")"
  out="$(curl -fsS -m 10 -H "X-Api-Key: $key" http://localhost:39055/api/v1/settings/radarr)"
  grep -qE '"externalUrl": *"http://[^"]+:39000/apps/radarr"' <<<"$out"
}
url_has() {
  local out
  out="$(curl -fsS -m 10 "$1")"
  grep -q -- "$2" <<<"$out"
}

# DELETE inside a VPN-side container with that app's API key.
arr_delete() {
  local app=$1 port=$2 path=$3
  # shellcheck disable=SC2016 # expanded inside the container
  docker exec "$(c "$app")" sh -c \
    'k=$(sed -n "s:.*<ApiKey>\(.*\)</ApiKey>.*:\1:p" /config/config.xml); curl -fsS -m 15 -X DELETE -H "X-Api-Key: $k" "http://localhost:$0/apps/$1$2"' \
    "$port" "$app" "$path"
}
sonarr_qbittorrent_id() {
  arr_get sonarr 8989 /api/v3/downloadclient |
    python3 -c 'import json,sys; print(next((c["id"] for c in json.load(sys.stdin) if c["implementation"] == "QBittorrent"), ""))'
}
sonarr_has_qbittorrent() { [[ -n "$(sonarr_qbittorrent_id)" ]]; }
stream_has_note() { grep -q "\"code\":\"$2\"" "$1"; }

wiretest() {
  local api=http://localhost:39000/api first second
  first="$(mktemp)"
  second="$(mktemp)"
  json_post() { curl -fsS -m 20 -H 'content-type: application/json' -d "$2" "$api/$1" >/dev/null; }

  echo "== Wizard answers through the API"
  # The wizard e2e may have created the account (and set up Jellyfin with it) already: keep it.
  local wizard
  wizard="$(curl -fsS -m 20 "$api/wizard")"
  if grep -q '"account":null' <<<"$wizard"; then
    check "account" ok json_post wizard/account '{"username":"easyarr","password":"Tidy-Kettle-Orbit-42"}'
  else
    echo "  (account from the wizard e2e kept)"
  fi
  check "download method: both" ok json_post wizard/download '{"method":"both"}'

  echo "== First wiring run (real services)"
  wiring_run "$first"
  local failed
  failed="$(wiring_failed_steps "$first")"
  check "every step worked (except offline: $OFFLINE_STEPS)" ok test -z "$failed"
  [[ -z "$failed" ]] || echo "      failed: $failed"

  echo "== The services really are connected"
  check "sonarr has qBittorrent + SABnzbd" ok sonarr_has_both_clients
  check "radarr root folder /data/media/movies" ok arr_has radarr 7878 /api/v3/rootfolder '/data/media/movies'
  check "lidarr root folder /data/media/music" ok arr_has lidarr 8686 /api/v1/rootfolder '/data/media/music'
  check "prowlarr knows sonarr, radarr, lidarr" ok prowlarr_has_three_apps
  check "qBittorrent has the tv/movies/music categories" ok qbittorrent_has_categories
  check "Jellyfin's first-run wizard is done" ok url_has http://localhost:39096/System/Info/Public '"StartupWizardCompleted":true'
  check "the request page is set up" ok url_has http://localhost:39055/api/v1/settings/public '"initialized":true'
  check "Seerr links to Radarr through the dashboard" ok seerr_radarr_link_ok
  check "the dashboard status sees Sonarr running" ok url_has http://localhost:39000/api/status '"id":"sonarr","state":"ok"'
  check "the dashboard status reads Jellyfin's library" ok url_has http://localhost:39000/api/status '"recent":\['
  check "Cleanuparr's Queue Cleaner is on (metadata strikes 3)" ok cleanuparr_has /configuration/queue_cleaner '"downloadingMetadataMaxStrikes": *3'
  check "Cleanuparr has EasyArr's stall rule" ok cleanuparr_has /queue-rules/stall 'EasyArr'
  check "Cleanuparr searches proactively" ok cleanuparr_has /configuration/seeker '"proactiveSearchEnabled": *true'

  echo "== Second run changes nothing"
  wiring_run "$second"
  check "no failed steps" ok test -z "$(wiring_failed_steps "$second")"
  check "zero changes" ok test "$(wiring_changes "$second")" -eq 0

  echo "== What you delete stays deleted; \"Repair\" puts it back (SPEC §10.2)"
  local third fourth id
  third="$(mktemp)"
  fourth="$(mktemp)"
  id="$(sonarr_qbittorrent_id)"
  check "delete Sonarr's qBittorrent connection" ok arr_delete sonarr 8989 "/api/v3/downloadclient/${id}"
  wiring_run "$third"
  check "a normal run leaves it deleted" fail sonarr_has_qbittorrent
  check "... and says so" ok stream_has_note "$third" deleted_by_user
  curl -sS -N -m 1500 -X POST -H 'content-type: application/json' -d '{}' \
    http://localhost:39000/api/wiring/repair >"$fourth"
  check "repair puts it back" ok sonarr_has_qbittorrent
  check "... and says so" ok stream_has_note "$fourth" recreated

  rm -f "$first" "$second" "$third" "$fourth"
  if [[ $fail -ne 0 ]]; then
    echo "WIRING TEST FAILED"
    return 1
  fi
  echo "WIRING TEST PASSED"
}

case "${1:-}" in
  up)
    install_package
    compose up -d
    ;;
  wait) wait_healthy "${2:-600}" ;;
  leaktest) leaktest ;;
  wiretest) wiretest ;;
  ps) compose ps -a ;;
  logs)
    shift
    compose logs "$@"
    ;;
  down) compose down ;;
  reset)
    compose down -v || true
    docker run --rm -v "${ROOT}/dev:/dev-root" "${BUSYBOX}" rm -rf /dev-root/data
    ;;
  *)
    sed -n '2,9p' "$0"
    exit 2
    ;;
esac
