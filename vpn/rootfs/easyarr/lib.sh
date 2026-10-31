# shellcheck shell=sh
# EasyArr VPN wrapper — helper functions (POSIX sh / busybox ash). Sourced by wrapper.sh and the
# tests in vpn/test/. No side effects on load.

# Keys the dashboard may set in vpn.env. Everything else is ignored, so a broken or tampered file can't
# turn off Gluetun's firewall, change its control server or run commands (D-040).
VPN_ENV_ALLOWED='^(VPN_SERVICE_PROVIDER|VPN_TYPE|VPN_ENDPOINT_IP|VPN_ENDPOINT_PORT|VPN_PORT_FORWARDING|VPN_PORT_FORWARDING_PROVIDER|WIREGUARD_(PRIVATE_KEY|PRESHARED_KEY|PUBLIC_KEY|ADDRESSES|ENDPOINT_IP|ENDPOINT_PORT|ALLOWED_IPS|MTU|PERSISTENT_KEEPALIVE_INTERVAL|IMPLEMENTATION)|OPENVPN_(USER|PASSWORD|PROTOCOL|CUSTOM_CONFIG|CERT|KEY|ENCRYPTED_KEY|KEY_PASSPHRASE|ENDPOINT_PORT|VERSION)|SERVER_(COUNTRIES|REGIONS|CITIES|HOSTNAMES|NAMES|CATEGORIES)|PORT_FORWARD_ONLY|FREE_ONLY|STREAM_ONLY|SECURE_CORE_ONLY|OWNED_ONLY|FIREWALL_VPN_INPUT_PORTS|HEALTH_TARGET_ADDRESSES|HEALTH_ICMP_TARGET_IPS|PRIVATE_INTERNET_ACCESS_OPENVPN_ENCRYPTION_PRESET)$'

log() {
  printf '%s easyarr-vpn: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2
}

# vpn_env_lines FILE CUSTOM_DIR
# Prints the allowed KEY=VALUE lines of FILE (one per line), skipping comments, blank lines, unknown
# keys, values with control characters and custom-config paths outside CUSTOM_DIR.
vpn_env_lines() {
  file=$1
  custom_dir=$2
  # Read even if the last line has no newline.
  while IFS= read -r line || [ -n "$line" ]; do
    case $line in '' | '#'*) continue ;; esac
    key=${line%%=*}
    if [ "$key" = "$line" ]; then
      log "vpn.env: ignoring a line without '='"
      continue
    fi
    value=${line#*=}
    if ! printf '%s' "$key" | grep -Eq "$VPN_ENV_ALLOWED"; then
      log "vpn.env: ignoring unsupported key $key"
      continue
    fi
    # Tabs/escape/other control characters are never valid in these settings.
    if printf '%s' "$value" | LC_ALL=C grep -q '[[:cntrl:]]'; then
      log "vpn.env: ignoring $key (control characters)"
      continue
    fi
    if [ "$key" = OPENVPN_CUSTOM_CONFIG ]; then
      case $value in
        "$custom_dir"/*) case $value in *..*) log "vpn.env: ignoring $key (path)"; continue ;; esac ;;
        *) log "vpn.env: ignoring $key (must be inside $custom_dir)"; continue ;;
      esac
    fi
    printf '%s\n' "$line"
  done <"$file"
}

# export_vpn_env FILE CUSTOM_DIR — exports the allowed settings into the current shell.
# `export "$line"` assigns the value literally: no globbing, word splitting or command substitution.
export_vpn_env() {
  _lines=$(vpn_env_lines "$1" "$2") || return 1
  # Split on newlines only.
  _old_ifs=$IFS
  IFS='
'
  for _line in $_lines; do
    # shellcheck disable=SC2163
    export "$_line"
  done
  IFS=$_old_ifs
}

# fingerprint FILE... — changes whenever any file's content, size or mtime changes (or it appears/goes).
fingerprint() {
  for f in "$@"; do
    if [ -e "$f" ]; then
      printf '%s:%s:%s;' "$f" "$(stat -c '%Y.%s' "$f" 2>/dev/null)" "$(cksum <"$f" 2>/dev/null)"
    else
      printf '%s:missing;' "$f"
    fi
  done
}

# write_status FILE STATE [EXIT_CODE] [RESTARTS] [RETRY_AT]
# Small JSON status for the dashboard (SPEC §5.3). Values are numbers or fixed words — no escaping needed.
write_status() {
  _file=$1
  _tmp="$_file.tmp.$$"
  {
    printf '{"state":"%s","since":%s,"pid":%s,"exitCode":%s,"restarts":%s,"retryAt":%s,"configFingerprint":"%s"}\n' \
      "$2" "$(date +%s)" "${GLUETUN_PID:-null}" "${3:-null}" "${4:-0}" "${5:-null}" \
      "$(printf '%s' "${CONFIG_FP:-}" | cksum | cut -d' ' -f1)"
  } >"$_tmp" && chmod 644 "$_tmp" && mv -f "$_tmp" "$_file"
}

# backoff_seconds N — 2, 4, 8, 16, 32, 60, 60, … for the N-th consecutive crash (N ≥ 1).
backoff_seconds() {
  _n=$1
  _s=2
  while [ "$_n" -gt 1 ] && [ "$_s" -lt 60 ]; do
    _s=$((_s * 2))
    _n=$((_n - 1))
  done
  [ "$_s" -gt 60 ] && _s=60
  echo "$_s"
}
