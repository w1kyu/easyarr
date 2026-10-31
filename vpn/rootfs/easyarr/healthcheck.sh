#!/bin/sh
# Docker health check: "healthy" means the wrapper runs and the kill switch is in place — not that
# the VPN is connected (the dashboard reports that). Dependent services wait for this, so they never
# start before the default-deny rules exist (D-040).
RUN_DIR=/run/easyarr
# shellcheck source=vpn/rootfs/easyarr/lib.sh
. /easyarr/lib.sh
# shellcheck source=vpn/rootfs/easyarr/firewall.sh
. /easyarr/firewall.sh
[ -f "$RUN_DIR/firewall.env" ] || exit 1
# shellcheck disable=SC1091 # written by firewall_init
. "$RUN_DIR/firewall.env"
pgrep -f /easyarr/wrapper.sh >/dev/null 2>&1 || exit 1
deny_is_active || exit 1
exit 0
