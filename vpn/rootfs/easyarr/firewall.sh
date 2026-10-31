# shellcheck shell=sh
# EasyArr VPN wrapper — kill switch (SPEC §5.2). Sourced by wrapper.sh and healthcheck.sh.
#
# While Gluetun isn't running, these rules allow only loopback and the Docker network
# (FIREWALL_OUTBOUND_SUBNETS): the dashboard can always reach the services, nothing reaches the
# internet. When Gluetun starts it appends its own rules (it never flushes on start), and every rule
# here is a subset of what Gluetun allows anyway, so both rule sets coexist (D-040).

RUN_DIR=${RUN_DIR:-/run/easyarr}
FW_ENV=$RUN_DIR/firewall.env
WG_TABLE=51820 # Gluetun's WireGuard fwmark + routing table
DOCKER_DNS=127.0.0.11 # Docker's embedded DNS server inside every container

# Real binaries, skipping the guard shims in /usr/local/sbin.
real_bin() {
  for _d in /usr/sbin /sbin /usr/bin /bin; do
    if [ -x "$_d/$1" ]; then
      echo "$_d/$1"
      return 0
    fi
  done
  return 1
}

# Same choice and order as Gluetun (internal/firewall/support.go): the first variant that can add and
# delete a rule and list INPUT. Using the same backend matters: rules in the other backend would
# still apply and could block the tunnel.
detect_iptables() {
  for _name in "$1" "$1-nft" "$1-legacy"; do
    _bin=$(real_bin "$_name") || continue
    _t="easyarrt$$"
    if "$_bin" -A OUTPUT -o "$_t" -j DROP 2>/dev/null; then
      "$_bin" -D OUTPUT -o "$_t" -j DROP 2>/dev/null || return 1
      if "$_bin" -nL INPUT >/dev/null 2>&1; then
        echo "$_bin"
        return 0
      fi
    fi
  done
  return 1
}

# Called once at start: pick backends, find the Docker-network interface, remember it all.
firewall_init() {
  mkdir -p "$RUN_DIR"
  IPT4=$(detect_iptables iptables) || {
    log "no working iptables found (is NET_ADMIN set?)"
    return 1
  }
  IPT6=$(detect_iptables ip6tables) || IPT6=''
  NET_IF=$(ip -4 route show default 2>/dev/null | awk '{for (i = 1; i < NF; i++) if ($i == "dev") { print $(i + 1); exit }}')
  [ -n "$NET_IF" ] || NET_IF=eth0
  NET_IP=$(ip -4 -o addr show dev "$NET_IF" 2>/dev/null | awk '{split($4, a, "/"); print a[1]; exit}')
  if [ -z "$NET_IP" ]; then
    log "no IPv4 address on $NET_IF"
    return 1
  fi
  OUTBOUND_SUBNETS=$(printf '%s' "${FIREWALL_OUTBOUND_SUBNETS:-}" | tr ',' ' ')
  {
    echo "IPT4='$IPT4'"
    echo "IPT6='$IPT6'"
    echo "NET_IF='$NET_IF'"
    echo "NET_IP='$NET_IP'"
  } >"$FW_ENV"
  log "firewall: $IPT4${IPT6:+ + $IPT6}, network interface $NET_IF ($NET_IP), local subnets: ${OUTBOUND_SUBNETS:-none}"
}

_ipt() {
  "$IPT4" "$@" || log "iptables $* failed"
}

_ip6t() {
  [ -n "$IPT6" ] || return 0
  "$IPT6" "$@" 2>/dev/null || log "ip6tables $* failed"
}

# Guard: packets that leave the Docker interface must carry its own address. This drops packets of
# connections that were opened through the tunnel and would otherwise be routed out unencrypted when
# the tunnel goes away (Gluetun accepts ESTABLISHED traffic on every interface).
# It lives in the mangle table (POSTROUTING sees the final interface and source), which Gluetun never
# reads or changes. In the filter table it broke Gluetun: Gluetun parses `iptables -L` to delete its
# own outdated rules and can't read a negated address ("!10.21.0.16"), so old VPN-server rules piled
# up on every reconnect (D-044). Rule set here = only what Gluetun's parser understands.
apply_guard() {
  "$IPT4" -t mangle -C POSTROUTING -o "$NET_IF" ! -s "$NET_IP" -j DROP 2>/dev/null ||
    _ipt -t mangle -I POSTROUTING 1 -o "$NET_IF" ! -s "$NET_IP" -j DROP
}

# Default-deny egress. DROP policies come first, so there is no moment where traffic is allowed.
# Only the filter table is flushed: the nat table holds Docker's embedded-DNS rules, mangle the guard.
apply_deny() {
  for _c in INPUT FORWARD OUTPUT; do _ipt -P "$_c" DROP; done
  apply_guard
  _ipt -F
  _ipt -X
  # Docker's embedded DNS (127.0.0.11, reached over loopback) answers by asking the host's resolver,
  # i.e. outside the VPN: every name an app looks up would be visible to the internet provider. It is
  # blocked for good (D-043); with Gluetun running, apps use Gluetun's DNS on 127.0.0.1 instead.
  _ipt -A OUTPUT -d "$DOCKER_DNS" -j DROP
  _ipt -A INPUT -i lo -j ACCEPT
  _ipt -A OUTPUT -o lo -j ACCEPT
  for _s in $OUTBOUND_SUBNETS; do
    _ipt -A INPUT -i "$NET_IF" -s "$_s" -j ACCEPT
    _ipt -A OUTPUT -o "$NET_IF" -d "$_s" -j ACCEPT
  done
  for _c in INPUT FORWARD OUTPUT; do _ip6t -P "$_c" DROP; done
  _ip6t -F
  _ip6t -X
  _ip6t -A INPUT -i lo -j ACCEPT
  _ip6t -A OUTPUT -o lo -j ACCEPT
}

# Is the kill switch in place? (policy DROP on OUTPUT, the Docker-DNS block and the guard rule)
deny_is_active() {
  _rules=$("$IPT4" -S OUTPUT 2>/dev/null) || return 1
  printf '%s\n' "$_rules" | grep -qx -- '-P OUTPUT DROP' || return 1
  # Option order in `-S` output differs between iptables versions, so match each part.
  printf '%s\n' "$_rules" | grep -F -- "-d $DOCKER_DNS/32" | grep -qF -- '-j DROP' || return 1
  _rules=$("$IPT4" -t mangle -S POSTROUTING 2>/dev/null) || return 1
  printf '%s\n' "$_rules" | grep -F -- "! -s $NET_IP/32" | grep -F -- "-o $NET_IF" | grep -qF -- '-j DROP' || return 1
}

# What a crashed Gluetun can leave behind: tunnel interfaces and WireGuard policy routing.
cleanup_network() {
  for _i in wg0 tun0 ${WIREGUARD_INTERFACE:-} ${VPN_INTERFACE:-}; do
    ip link del "$_i" 2>/dev/null || true
  done
  _n=0
  while ip rule del table "$WG_TABLE" 2>/dev/null && [ $_n -lt 20 ]; do _n=$((_n + 1)); done
  _n=0
  while ip -6 rule del table "$WG_TABLE" 2>/dev/null && [ $_n -lt 20 ]; do _n=$((_n + 1)); done
  ip route flush table "$WG_TABLE" 2>/dev/null || true
  ip -6 route flush table "$WG_TABLE" 2>/dev/null || true
}

# Gluetun points /etc/resolv.conf at its own DNS server and reads the original (Docker's 127.0.0.11)
# only when it starts, to resolve container names. Keep the original and put it back in place
# (rewrite, not rename: the file is bind-mounted) before every start and after every stop.
save_resolv_conf() {
  if grep -q '^nameserver' /etc/resolv.conf 2>/dev/null && ! grep -q '^nameserver 127\.0\.0\.1$' /etc/resolv.conf; then
    cp /etc/resolv.conf "$RUN_DIR/resolv.conf"
  fi
}

restore_resolv_conf() {
  [ -f "$RUN_DIR/resolv.conf" ] && cat "$RUN_DIR/resolv.conf" >/etc/resolv.conf 2>/dev/null
  return 0
}
