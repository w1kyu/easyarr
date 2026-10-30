#!/usr/bin/env bash
# Run the EasyArr Umbrel stack on a normal Docker host (laptop or CI).
#
#   dev/stack.sh up         install package files like umbrelOS does, then start the stack
#   dev/stack.sh wait [s]   wait until every service with a healthcheck is healthy (vpn excluded)
#   dev/stack.sh leaktest   kill-switch + reachability checks (SPEC §5.2)
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
      # init is a one-shot; vpn stays unhealthy until a real VPN is configured (Phase 04).
      [[ "$name" == "$(c init)" || "$name" == "$(c vpn)" ]] && continue
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
  if "$@" >/dev/null 2>&1; then got=ok; else got=fail; fi
  if [[ "$got" == "$expect" ]]; then
    echo "PASS  $desc"
  else
    echo "FAIL  $desc (expected $expect, got $got)"
    fail=1
  fi
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

  echo "== Inside the VPN namespace, services reach each other on localhost"
  check "qbittorrent -> sonarr via localhost:8989" ok \
    docker exec "$(c qbittorrent)" curl -fsS -m 8 -o /dev/null http://localhost:8989/ping

  echo "== From the Docker network (where the dashboard lives) via $(c vpn)"
  for port_path in 8090/ 8080/ 9696/ping 8191/ 8989/ping 7878/ping 8686/ping 6767/ 11011/health; do
    check "http://$(c vpn):${port_path}" ok "${probe[@]}" wget -q -O /dev/null -T 10 "http://$(c vpn):${port_path}"
  done

  echo "== Published ports"
  check "dashboard placeholder on :39000" ok curl -fsS -m 10 -o /dev/null http://localhost:39000/
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

case "${1:-}" in
  up)
    install_package
    compose up -d
    ;;
  wait) wait_healthy "${2:-600}" ;;
  leaktest) leaktest ;;
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
