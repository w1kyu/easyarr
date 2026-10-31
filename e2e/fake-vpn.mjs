// Stand-ins for the VPN side during local e2e runs (no Docker, no real VPN):
// - a "wrapper" that watches vpn.env like vpn/rootfs/easyarr/wrapper.sh and writes status.json +
//   gluetun.log,
// - Gluetun's control server (/v1/vpn/status, /v1/publicip/ip, /v1/portforward),
// - a "what's my IP" service for the home-IP check.
// Behaviour: OPENVPN_PASSWORD=wrong-password → Gluetun "crashes" with AUTH_FAILED; anything else
// connects with VPN IP 185.159.157.10 (Netherlands); port forwarding gives port 51413.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';

export const FAKE_VPN_IP = '185.159.157.10';
export const FAKE_HOME_IP = '203.0.113.50';

function listen(handler) {
  return new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, '127.0.0.1', () =>
      resolve({ server, url: `http://127.0.0.1:${server.address().port}` }),
    );
  });
}

export async function startFakeVpn(vpnDir) {
  const dir = path.join(vpnDir, 'easyarr');
  mkdirSync(path.join(dir, 'custom'), { recursive: true });
  const state = { connected: false, portForwarding: false, env: null };
  const now = () => Math.floor(Date.now() / 1000);
  const status = (s, extra = {}) =>
    writeFileSync(
      path.join(dir, 'status.json'),
      JSON.stringify({
        state: s,
        since: now(),
        pid: 4242,
        exitCode: null,
        restarts: 0,
        retryAt: null,
        ...extra,
      }),
    );
  status('unconfigured');

  const apply = (env) => {
    state.env = env;
    state.portForwarding = /^VPN_PORT_FORWARDING=on$/m.test(env);
    const ts = new Date().toISOString();
    if (/^OPENVPN_PASSWORD=wrong-password$/m.test(env)) {
      state.connected = false;
      writeFileSync(
        path.join(dir, 'gluetun.log'),
        `${ts} INFO [openvpn] OpenVPN 2.6.14\n${ts} ERROR [openvpn] AUTH: Received control message: AUTH_FAILED\n`,
      );
      status('crashed', { exitCode: 1 });
    } else {
      state.connected = true;
      writeFileSync(
        path.join(dir, 'gluetun.log'),
        `${ts} INFO [ip getter] Public IP address is ${FAKE_VPN_IP}\n`,
      );
      status('running');
    }
  };
  const timer = setInterval(() => {
    let env = null;
    try {
      env = readFileSync(path.join(dir, 'vpn.env'), 'utf8');
    } catch {
      return;
    }
    let reload = null;
    try {
      reload = readFileSync(path.join(dir, 'reload'), 'utf8');
    } catch {
      // no reload requested
    }
    const key = `${env}\n${reload}`;
    if (key !== state.key) {
      state.key = key;
      // Like the real wrapper: a short gap while Gluetun restarts.
      status('stopping');
      setTimeout(() => apply(env), 600);
    }
  }, 200);

  const json = (res, body, code = 200) => {
    res.writeHead(code, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const gluetun = await listen((req, res) => {
    if (req.url === '/v1/vpn/status')
      return json(res, { status: state.connected ? 'running' : 'stopped' });
    if (req.url === '/v1/publicip/ip') {
      return json(
        res,
        state.connected
          ? { public_ip: FAKE_VPN_IP, country: 'Netherlands', city: 'Amsterdam' }
          : {},
      );
    }
    if (req.url === '/v1/portforward') {
      const port = state.connected && state.portForwarding ? 51413 : 0;
      return json(res, { port, ports: port ? [port] : [] });
    }
    return json(res, { error: 'not found' }, 404);
  });
  const home = await listen((_req, res) => json(res, { ip: FAKE_HOME_IP }));

  return {
    env: {
      EASYARR_VPN_DIR: vpnDir,
      EASYARR_GLUETUN_URL: gluetun.url,
      EASYARR_HOME_IP_URLS: home.url,
      // Nothing listens here: the port sync just logs a warning.
      EASYARR_QBITTORRENT_URL: 'http://127.0.0.1:9',
    },
    stop() {
      clearInterval(timer);
      gluetun.server.close();
      home.server.close();
    },
  };
}
