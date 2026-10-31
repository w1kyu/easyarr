#!/bin/sh
# Unit tests for the VPN wrapper's shell helpers. Runs under any POSIX sh (CI: busybox ash + dash).
#   sh vpn/test/lib.test.sh
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$HERE/../rootfs/easyarr
# shellcheck source=vpn/rootfs/easyarr/lib.sh
. "$ROOT/lib.sh"

T=$(mktemp -d "${TMPDIR:-/tmp}/easyarr-vpn-test.XXXXXX")
trap 'rm -rf "$T"' EXIT
fails=0
pass() { printf 'ok   %s\n' "$1"; }
fail() {
  printf 'FAIL %s\n' "$1"
  [ $# -gt 1 ] && printf '     got: %s\n' "$2"
  fails=$((fails + 1))
}
eq() { if [ "$2" = "$3" ]; then pass "$1"; else fail "$1" "$2 (expected $3)"; fi; }

# --- vpn_env_lines ------------------------------------------------------------------------------
printf '%s\n' \
  '# comment' \
  '' \
  'VPN_SERVICE_PROVIDER=protonvpn' \
  'VPN_TYPE=wireguard' \
  'WIREGUARD_PRIVATE_KEY=abc=+/def=' \
  'FIREWALL_OUTBOUND_SUBNETS=0.0.0.0/0' \
  'FIREWALL_ENABLED_DISABLING_IT_SHOOTS_YOU_IN_YOUR_FOOT=off' \
  'HTTP_CONTROL_SERVER_AUTH_DEFAULT_ROLE={"auth":"none"}' \
  'OPENVPN_FLAGS=--up /bin/sh' \
  'no equals sign' \
  'lowercase=1' \
  'OPENVPN_CUSTOM_CONFIG=/gluetun/easyarr/custom/my.ovpn' \
  'SERVER_COUNTRIES=Netherlands,Switzerland' >"$T/vpn.env"
printf 'OPENVPN_PASSWORD=tab\there\n' >>"$T/vpn.env"
printf 'OPENVPN_USER=last-line-without-newline' >>"$T/vpn.env"
out=$(vpn_env_lines "$T/vpn.env" /gluetun/easyarr 2>/dev/null)
expected='VPN_SERVICE_PROVIDER=protonvpn
VPN_TYPE=wireguard
WIREGUARD_PRIVATE_KEY=abc=+/def=
OPENVPN_CUSTOM_CONFIG=/gluetun/easyarr/custom/my.ovpn
SERVER_COUNTRIES=Netherlands,Switzerland
OPENVPN_USER=last-line-without-newline'
eq "vpn.env: only allowed keys, no control chars, last line without newline" "$out" "$expected"

for bad in /etc/passwd /gluetun/easyarr/../auth/config.toml /gluetun/easyarrX/a.ovpn; do
  printf 'OPENVPN_CUSTOM_CONFIG=%s\n' "$bad" >"$T/p.env"
  eq "custom config path outside the folder is ignored ($bad)" "$(vpn_env_lines "$T/p.env" /gluetun/easyarr 2>/dev/null)" ""
done

# --- export_vpn_env: values are taken literally -------------------------------------------------
# shellcheck disable=SC2016 # the $(...) must stay literal
printf '%s\n' \
  'OPENVPN_PASSWORD=$(touch '"$T"'/pwned) `touch '"$T"'/pwned2` * ; rm -rf /' \
  'OPENVPN_USER=  spaced  user  ' \
  'SERVER_COUNTRIES=a=b=c' >"$T/evil.env"
(
  cd "$T" || exit 1
  touch decoy1 decoy2
  export_vpn_env "$T/evil.env" /gluetun/easyarr 2>/dev/null
  printf '%s' "$OPENVPN_PASSWORD" >"$T/got-password"
  printf '%s' "$OPENVPN_USER" >"$T/got-user"
  printf '%s' "$SERVER_COUNTRIES" >"$T/got-countries"
  env | grep -q '^OPENVPN_PASSWORD=' && touch "$T/exported"
)
# shellcheck disable=SC2016
eq "export: no command substitution or globbing" "$(cat "$T/got-password")" '$(touch '"$T"'/pwned) `touch '"$T"'/pwned2` * ; rm -rf /'
eq "export: whitespace kept" "$(cat "$T/got-user")" '  spaced  user  '
eq "export: '=' inside values kept" "$(cat "$T/got-countries")" 'a=b=c'
if [ -e "$T/pwned" ] || [ -e "$T/pwned2" ]; then fail "export: nothing was executed"; else pass "export: nothing was executed"; fi
if [ -e "$T/exported" ]; then pass "export: variables reach child processes"; else fail "export: variables reach child processes"; fi

# --- fingerprint ----------------------------------------------------------------------------------
fp0=$(fingerprint "$T/f.env" "$T/reload")
printf 'A=1\n' >"$T/f.env"
fp1=$(fingerprint "$T/f.env" "$T/reload")
printf 'A=2\n' >"$T/f.env"
fp2=$(fingerprint "$T/f.env" "$T/reload")
touch "$T/reload"
fp3=$(fingerprint "$T/f.env" "$T/reload")
fp3b=$(fingerprint "$T/f.env" "$T/reload")
rm "$T/f.env"
fp4=$(fingerprint "$T/f.env" "$T/reload")
if [ "$fp0" != "$fp1" ] && [ "$fp1" != "$fp2" ] && [ "$fp2" != "$fp3" ] && [ "$fp3" != "$fp4" ]; then
  pass "fingerprint changes on create, edit (same size), reload touch and delete"
else
  fail "fingerprint changes on create, edit (same size), reload touch and delete"
fi
eq "fingerprint is stable without changes" "$fp3b" "$fp3"

# --- backoff ----------------------------------------------------------------------------------------
seq=''
for n in 1 2 3 4 5 6 7 20; do seq="$seq $(backoff_seconds "$n")"; done
eq "backoff 2,4,8,16,32,60,60,60" "$seq" " 2 4 8 16 32 60 60 60"

# --- write_status -----------------------------------------------------------------------------------
GLUETUN_PID=123 CONFIG_FP=x write_status "$T/status.json" crashed 2 3 1700000000
json=$(cat "$T/status.json")
case $json in
  '{"state":"crashed","since":'*',"pid":123,"exitCode":2,"restarts":3,"retryAt":1700000000,"configFingerprint":"'*'"}') pass "status.json shape" ;;
  *) fail "status.json shape" "$json" ;;
esac
GLUETUN_PID='' write_status "$T/status.json" unconfigured
case $(cat "$T/status.json") in
  *'"state":"unconfigured"'*'"pid":null,"exitCode":null,"restarts":0,"retryAt":null'*) pass "status.json nulls" ;;
  *) fail "status.json nulls" "$(cat "$T/status.json")" ;;
esac
eq "status.json is world-readable (dashboard runs as 1000)" "$(stat -c %a "$T/status.json")" "644"

# --- iptables-guard -----------------------------------------------------------------------------
mkdir -p "$T/real" "$T/shim"
# shellcheck disable=SC2016 # literal script
printf '#!/bin/sh\necho "$0 $*"\n' >"$T/real/iptables"
chmod +x "$T/real/iptables"
ln -s "$ROOT/iptables-guard" "$T/shim/iptables"
guard() { EASYARR_GUARD_SEARCH="$T/real" "$T/shim/iptables" "$@" 2>/dev/null; }
eq "guard: passes normal rules through" "$(guard -A OUTPUT -o wg0 -j ACCEPT)" "$T/real/iptables -A OUTPUT -o wg0 -j ACCEPT"
eq "guard: OUTPUT ACCEPT policy becomes DROP" "$(guard --policy OUTPUT ACCEPT)" "$T/real/iptables --policy OUTPUT DROP"
eq "guard: FORWARD ACCEPT policy becomes DROP" "$(guard -P FORWARD ACCEPT)" "$T/real/iptables -P FORWARD DROP"
eq "guard: INPUT policy untouched (inbound is not a leak)" "$(guard --policy INPUT ACCEPT)" "$T/real/iptables --policy INPUT ACCEPT"
eq "guard: DROP policy untouched" "$(guard -P OUTPUT DROP)" "$T/real/iptables -P OUTPUT DROP"
eq "guard: -t filter prefix" "$(guard -t filter -P OUTPUT ACCEPT)" "$T/real/iptables -t filter -P OUTPUT DROP"
eq "guard: ACCEPT targets are not policies" "$(guard -A OUTPUT -j ACCEPT)" "$T/real/iptables -A OUTPUT -j ACCEPT"
eq "guard: arguments with spaces survive" "$(guard -A OUTPUT -m comment --comment 'a b' -j ACCEPT)" "$T/real/iptables -A OUTPUT -m comment --comment a b -j ACCEPT"

echo
if [ "$fails" -gt 0 ]; then
  echo "$fails test(s) failed"
  exit 1
fi
echo "all VPN wrapper unit tests passed"
