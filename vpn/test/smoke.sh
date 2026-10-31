#!/usr/bin/env bash
# Smoke + kill-switch test for the EasyArr VPN image on its own (no stack, no real VPN).
#   vpn/test/smoke.sh <image>
# Needs Docker. Used by .github/workflows/vpn-image.yml before the image is pushed.
set -euo pipefail
IMAGE=${1:?usage: smoke.sh <image>}
NET=easyarr-vpn-smoke
SUBNET=10.99.0.0/16
BUSYBOX="busybox:1.38.0@sha256:a46257e06c82ad85242d0d38077d0a52d9896389ca60a1a59d3463db586e5fa4"
DATA=$(mktemp -d)
fail=0

cleanup() {
  docker rm -f ea-vpn ea-inside >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  sudo rm -rf "$DATA" 2>/dev/null || rm -rf "$DATA"
}
trap cleanup EXIT

check() { # check <description> <ok|fail> <command...>
  local desc=$1 expect=$2 got
  shift 2
  if "$@" >/dev/null 2>&1; then got=ok; else got=fail; fi
  if [[ $got == "$expect" ]]; then echo "PASS  $desc"; else
    echo "FAIL  $desc (expected $expect, got $got)"
    fail=1
  fi
}
health() { docker inspect -f '{{.State.Health.Status}}' ea-vpn; }
status() { docker exec ea-vpn cat /gluetun/easyarr/status.json 2>/dev/null || true; }
wait_for() { # wait_for <seconds> <command...>
  local t=$1
  shift
  for _ in $(seq 1 "$t"); do "$@" >/dev/null 2>&1 && return 0; sleep 1; done
  return 1
}
egress() { docker run --rm --network container:ea-vpn "$BUSYBOX" wget -q -T 5 -O /dev/null "$1"; }

docker network create --subnet "$SUBNET" "$NET" >/dev/null
docker run -d --name ea-vpn --network "$NET" --cap-add NET_ADMIN --device /dev/net/tun \
  -e FIREWALL_OUTBOUND_SUBNETS="$SUBNET" -e EASYARR_STOP_TIMEOUT=10 \
  -v "$DATA:/gluetun" "$IMAGE" >/dev/null

echo "== Start-up"
check "becomes healthy (kill switch in place) within 60s" ok wait_for 60 sh -c "[ \"\$(docker inspect -f '{{.State.Health.Status}}' ea-vpn)\" = healthy ]"
check "status.json says unconfigured" ok sh -c "docker exec ea-vpn cat /gluetun/easyarr/status.json | grep -q '\"state\":\"unconfigured\"'"
check "Gluetun is not running yet" fail docker exec ea-vpn pgrep -f gluetun-entrypoint
check "iptables resolves to the guard" ok sh -c "[ \"\$(docker exec ea-vpn sh -c 'command -v iptables')\" = /usr/local/sbin/iptables ]"
check "control server auth config was created (locked)" ok docker exec ea-vpn grep -q 'auth = "apikey"' /gluetun/auth/config.toml

echo "== Kill switch while unconfigured"
check "control: internet works outside the namespace" ok docker run --rm --network "$NET" "$BUSYBOX" wget -q -T 10 -O /dev/null http://example.com
check "inside: busybox wget exists (guards the next checks)" ok docker run --rm --network container:ea-vpn "$BUSYBOX" which wget
check "inside -> http://1.1.1.1 blocked" fail egress http://1.1.1.1
check "inside -> http://example.com blocked" fail egress http://example.com
# Serves /etc, so /passwd is a file that exists (a directory would give 404).
docker run -d --name ea-inside --network container:ea-vpn "$BUSYBOX" httpd -f -p 8989 -h /etc >/dev/null
check "Docker network -> service port inside works" ok wait_for 10 docker run --rm --network "$NET" "$BUSYBOX" wget -q -T 5 -O /dev/null http://ea-vpn:8989/passwd
# A closed port on the gateway answers "refused" when allowed; a blocked packet would time out.
check "inside -> Docker network works" ok docker run --rm --network container:ea-vpn "$BUSYBOX" sh -c "wget -T 5 -O /dev/null http://10.99.0.1:1/ 2>&1 | grep -q refused"

echo "== The guard keeps the kill switch closed"
docker exec ea-vpn iptables -P OUTPUT ACCEPT 2>/dev/null || true
check "'iptables -P OUTPUT ACCEPT' leaves the policy at DROP" ok sh -c "docker exec ea-vpn iptables -S OUTPUT | grep -qx -- '-P OUTPUT DROP'"
check "still blocked after the attempt" fail egress http://1.1.1.1

echo "== Invalid settings: Gluetun exits, kill switch stays closed"
docker exec ea-vpn sh -c 'printf "VPN_SERVICE_PROVIDER=custom\nVPN_TYPE=wireguard\nWIREGUARD_PRIVATE_KEY=not-a-key\nWIREGUARD_ADDRESSES=10.2.0.2/32\nWIREGUARD_PUBLIC_KEY=x\nVPN_ENDPOINT_IP=192.0.2.1\nVPN_ENDPOINT_PORT=51820\n" > /gluetun/easyarr/vpn.env'
check "wrapper reports crashed" ok wait_for 30 sh -c "docker exec ea-vpn cat /gluetun/easyarr/status.json | grep -q '\"state\":\"crashed\"'"
check "Gluetun's error is in gluetun.log" ok wait_for 10 docker exec ea-vpn grep -qi 'key is not valid' /gluetun/easyarr/gluetun.log
check "inside -> http://1.1.1.1 blocked" fail egress http://1.1.1.1
check "still healthy (kill switch in place)" ok sh -c "[ \"\$(docker inspect -f '{{.State.Health.Status}}' ea-vpn)\" = healthy ]"
check "Docker network -> service port inside still works" ok docker run --rm --network "$NET" "$BUSYBOX" wget -q -T 5 -O /dev/null http://ea-vpn:8989/passwd

echo "== Removing vpn.env goes back to unconfigured"
docker exec ea-vpn rm /gluetun/easyarr/vpn.env
check "status unconfigured" ok wait_for 10 sh -c "docker exec ea-vpn cat /gluetun/easyarr/status.json | grep -q '\"state\":\"unconfigured\"'"

echo "== Shutdown"
start=$(date +%s)
docker stop -t 30 ea-vpn >/dev/null
code=$(docker inspect -f '{{.State.ExitCode}}' ea-vpn)
check "docker stop exits cleanly (code $code) in $(($(date +%s) - start))s" ok test "$code" = 0

if [[ $fail -ne 0 ]]; then
  echo "--- container log"
  docker logs ea-vpn 2>&1 | tail -60
  echo "VPN SMOKE TEST FAILED"
  exit 1
fi
echo "VPN SMOKE TEST PASSED"
