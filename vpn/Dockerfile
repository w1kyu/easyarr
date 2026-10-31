# syntax=docker/dockerfile:1
# EasyArr VPN image: Gluetun + a wrapper that keeps the kill switch closed whenever Gluetun isn't
# running and reloads VPN settings without restarting the container (SPEC §5.2–5.3, D-013, D-040).
# Build from the repo root:  docker build -f vpn/Dockerfile .
ARG GLUETUN_IMAGE=qmcgaw/gluetun:v3.41.3@sha256:fa19cc76b2af13d57a8d3dc3066f2ada061b1c761b8aecf989b3877c0486e027
FROM ${GLUETUN_IMAGE}

ARG VERSION=0.0.0-dev
LABEL org.opencontainers.image.title="EasyArr VPN" \
      org.opencontainers.image.description="Gluetun with a leak-proof kill switch and live reload for EasyArr" \
      org.opencontainers.image.source="https://github.com/w1kyu/easyarr" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="${VERSION}"

# tini reaps zombies (OpenVPN children of a killed Gluetun) and forwards signals to the wrapper.
RUN apk add --no-cache tini

COPY vpn/rootfs/ /
COPY LICENSE /licenses/EasyArr-LICENSE
# The guard shadows every iptables variant Gluetun may pick (D-040); /usr/local/sbin must come first
# in PATH for Gluetun's exec lookups.
ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
RUN chmod 755 /easyarr/*.sh /easyarr/iptables-guard \
 && mkdir -p /usr/local/sbin \
 && for n in iptables iptables-nft iptables-legacy ip6tables ip6tables-nft ip6tables-legacy; do \
      ln -sf /easyarr/iptables-guard "/usr/local/sbin/$n"; \
    done \
 && echo "iptables -> $(command -v iptables)" \
 && [ "$(command -v iptables)" = /usr/local/sbin/iptables ]

ENV EASYARR_VPN_DIR=/gluetun/easyarr \
    EASYARR_VPN_VERSION=${VERSION}
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=3 CMD ["/easyarr/healthcheck.sh"]
ENTRYPOINT ["/sbin/tini", "--", "/easyarr/wrapper.sh"]
