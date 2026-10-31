#!/bin/sh
# EasyArr VPN wrapper (SPEC §5.3, D-013, D-040). Runs under tini as the container's main process.
#
# The container owns the network namespace every download/search service shares, so it must never
# stop just because the VPN changes. Instead this script:
#   1. closes the kill switch (default-deny egress) before anything else,
#   2. waits until the dashboard has written vpn.env,
#   3. runs Gluetun with exactly those settings,
#   4. restarts only the Gluetun process when vpn.env or the reload file changes,
#   5. closes the kill switch again whenever Gluetun is not running (reload, crash, shutdown),
#   6. reports what it's doing in status.json for the dashboard.
set -u

# shellcheck source=vpn/rootfs/easyarr/lib.sh
. /easyarr/lib.sh
# shellcheck source=vpn/rootfs/easyarr/firewall.sh
. /easyarr/firewall.sh

DIR=${EASYARR_VPN_DIR:-/gluetun/easyarr}
ENV_FILE=$DIR/vpn.env
RELOAD_FILE=$DIR/reload
STATUS_FILE=$DIR/status.json
LOG_FILE=$DIR/gluetun.log
AUTH_FILE=${HTTP_CONTROL_SERVER_AUTH_CONFIG_FILEPATH:-/gluetun/auth/config.toml}
GLUETUN_BIN=${GLUETUN_BIN:-/gluetun-entrypoint}
STOP_TIMEOUT=${EASYARR_STOP_TIMEOUT:-20}
STABLE_AFTER=300 # seconds of running before the crash counter resets
LOG_MAX_BYTES=5000000

# --- 1. Kill switch first ------------------------------------------------------------------------
if ! firewall_init; then
  log "FATAL: cannot set up the kill switch; exiting so Docker restarts the container"
  exit 1
fi
apply_deny
deny_is_active || log "WARNING: kill switch check failed right after applying it"
log "kill switch closed (default-deny egress)"

mkdir -p "$DIR"
save_resolv_conf

# The control server must never be open without authentication. The dashboard's key is written by
# EasyArr's init; if it's missing, lock every route with a random key instead of Gluetun's defaults.
if [ ! -s "$AUTH_FILE" ]; then
  mkdir -p "$(dirname "$AUTH_FILE")"
  key=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
  printf '[[roles]]\nname = "locked"\nauth = "apikey"\napikey = "%s"\nroutes = ["GET /v1/version"]\n' "$key" >"$AUTH_FILE"
  chmod 600 "$AUTH_FILE"
  log "control server auth config was missing; locked it with a random key"
fi

touch "$LOG_FILE"
chmod 640 "$LOG_FILE"
chown 1000:1000 "$LOG_FILE" 2>/dev/null || true
# Mirror Gluetun's log to the container log (docker logs / Umbrel's log viewer).
tail -n 0 -F "$LOG_FILE" 2>/dev/null &
TAIL_PID=$!

GLUETUN_PID=''
# shellcheck disable=SC2034 # read by write_status (lib.sh)
CONFIG_FP=''
LAST_FP=''
CRASHES=0
RETRY_AT=0
STARTED_AT=0
STOPPING=0
trap 'STOPPING=1' TERM INT

alive() {
  [ -n "$1" ] && [ -r "/proc/$1/status" ] && ! grep -q '^State:[[:space:]]*Z' "/proc/$1/status"
}

start_gluetun() {
  restore_resolv_conf
  if [ -s "$LOG_FILE" ]; then
    cp "$LOG_FILE" "$LOG_FILE.1" 2>/dev/null
    chmod 640 "$LOG_FILE.1" 2>/dev/null
    chown 1000:1000 "$LOG_FILE.1" 2>/dev/null || true
  fi
  : >"$LOG_FILE"
  (
    export_vpn_env "$ENV_FILE" "$DIR"
    # Fixed by EasyArr, never taken from vpn.env.
    export HTTP_CONTROL_SERVER_ADDRESS=':8000'
    export HTTP_CONTROL_SERVER_AUTH_CONFIG_FILEPATH="$AUTH_FILE"
    export HTTP_CONTROL_SERVER_AUTH_DEFAULT_ROLE='{}'
    exec "$GLUETUN_BIN"
  ) >>"$LOG_FILE" 2>&1 &
  GLUETUN_PID=$!
  STARTED_AT=$(date +%s)
  log "started Gluetun (pid $GLUETUN_PID)"
  write_status "$STATUS_FILE" running '' "$CRASHES"
}

# Stop Gluetun gracefully (it tears the tunnel down), then close the kill switch and clean up.
stop_gluetun() {
  if [ -n "$GLUETUN_PID" ]; then
    write_status "$STATUS_FILE" stopping '' "$CRASHES"
    kill -TERM "$GLUETUN_PID" 2>/dev/null
    _i=0
    while alive "$GLUETUN_PID" && [ "$_i" -lt $((STOP_TIMEOUT * 10)) ]; do
      sleep 0.1
      _i=$((_i + 1))
    done
    if alive "$GLUETUN_PID"; then
      log "Gluetun didn't stop within ${STOP_TIMEOUT}s, killing it"
      kill -KILL "$GLUETUN_PID" 2>/dev/null
    fi
    wait "$GLUETUN_PID" 2>/dev/null
    GLUETUN_PID=''
  fi
  apply_deny
  cleanup_network
  restore_resolv_conf
}

if [ -f "$ENV_FILE" ]; then
  log "found $ENV_FILE"
else
  log "VPN not configured yet; waiting for $ENV_FILE (downloads stay blocked)"
  write_status "$STATUS_FILE" unconfigured
fi

while [ "$STOPPING" = 0 ]; do
  fp=$(fingerprint "$ENV_FILE" "$RELOAD_FILE")
  now=$(date +%s)
  if [ "$fp" != "$LAST_FP" ]; then
    # --- 4. Settings changed (or first start) -----------------------------------------------------
    [ -n "$LAST_FP" ] && log "VPN settings changed, reloading"
    LAST_FP=$fp
    stop_gluetun
    CRASHES=0
    RETRY_AT=0
    if [ -f "$ENV_FILE" ]; then
      CONFIG_FP=$fp
      start_gluetun
    else
      CONFIG_FP=''
      write_status "$STATUS_FILE" unconfigured
    fi
  elif [ -n "$GLUETUN_PID" ] && ! alive "$GLUETUN_PID"; then
    # --- 5. Gluetun exited on its own (bad settings, crash) ----------------------------------------
    wait "$GLUETUN_PID" 2>/dev/null
    code=$?
    GLUETUN_PID=''
    apply_deny
    cleanup_network
    restore_resolv_conf
    CRASHES=$((CRASHES + 1))
    delay=$(backoff_seconds "$CRASHES")
    RETRY_AT=$((now + delay))
    log "Gluetun stopped unexpectedly (exit code $code); kill switch closed; retrying in ${delay}s"
    write_status "$STATUS_FILE" crashed "$code" "$CRASHES" "$RETRY_AT"
  elif [ -z "$GLUETUN_PID" ] && [ "$RETRY_AT" -gt 0 ] && [ "$now" -ge "$RETRY_AT" ] && [ -f "$ENV_FILE" ]; then
    RETRY_AT=0
    start_gluetun
  elif [ -n "$GLUETUN_PID" ] && [ "$CRASHES" -gt 0 ] && [ $((now - STARTED_AT)) -ge "$STABLE_AFTER" ]; then
    CRASHES=0
    write_status "$STATUS_FILE" running '' 0
  fi

  # Keep Gluetun's log from filling the disk.
  size=$(stat -c %s "$LOG_FILE" 2>/dev/null || echo 0)
  if [ "$size" -gt "$LOG_MAX_BYTES" ]; then
    tail -c 1000000 "$LOG_FILE" >"$LOG_FILE.1" 2>/dev/null
    : >"$LOG_FILE"
  fi

  # Sleep in the background so TERM is handled right away.
  sleep 1 &
  wait $! 2>/dev/null
done

# --- Shutdown (docker stop) ------------------------------------------------------------------------
log "shutting down"
stop_gluetun
write_status "$STATUS_FILE" stopped
kill "$TAIL_PID" 2>/dev/null
exit 0
