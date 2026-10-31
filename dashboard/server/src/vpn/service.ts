import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import {
  buildVpnEnv,
  getVpnProvider,
  parseWireguardConf,
  serializeVpnEnv,
  validateVpnConfig,
  vpnConfigInputSchema,
  VPN_FIELDS,
  type PortForwardingView,
  type VpnConfigInput,
  type VpnConfigView,
  type VpnFieldId,
  type VpnProblemCode,
  type VpnStatusView,
  type VpnTestView,
} from '@easyarr/shared';
import type { Logger } from 'pino';
import { ApiError, type Issue } from '../http-errors.js';
import { registerSecrets } from '../logger.js';
import { secretsStore, stateStore, type State, type VpnTestResult } from '../state/index.js';
import type { Mutex } from '../state/mutex.js';
import { diagnoseGluetunLog } from './errors.js';
import { CONTAINER_EASYARR_DIR, CUSTOM_OVPN_NAME, type VpnFiles } from './files.js';
import type { GluetunClient } from './gluetun.js';

export class VpnError extends ApiError {
  constructor(status: 400 | 409, code: string, issues: Issue[] = []) {
    super(status, code, issues);
  }
}

/** Problems that won't fix themselves by waiting (shown right away, no need to wait for the timeout). */
const FATAL: readonly VpnProblemCode[] = [
  'wrongKey',
  'authFailed',
  'noServer',
  'invalidSettings',
  'certificate',
  'system',
];

export interface VpnServiceOptions {
  stateDir: string;
  files: VpnFiles;
  gluetun: GluetunClient;
  lock: Mutex;
  homeIpUrls: string[];
  log?: Logger;
  /** Resolves a hostname to an IPv4 address (custom WireGuard endpoints). */
  resolve?: (host: string) => Promise<string>;
  now?: () => Date;
  /** Seconds before "still connecting" becomes an error. */
  connectTimeoutSec?: number;
  /** test(): how long to wait for a connection that is still being set up. */
  testWaitMs?: number;
  pollMs?: number;
}

const defaultResolve = async (host: string) => (await lookup(host, { family: 4 })).address;

export class VpnService {
  private readonly now: () => Date;

  constructor(private readonly opts: VpnServiceOptions) {
    this.now = opts.now ?? (() => new Date());
  }

  private async load() {
    const [state, secrets] = await Promise.all([
      stateStore(this.opts.stateDir).load(),
      secretsStore(this.opts.stateDir).load(),
    ]);
    return { state: state.value, secrets: secrets.value };
  }

  async configView(): Promise<VpnConfigView | null> {
    const { state, secrets } = await this.load();
    return toConfigView(state, secrets.vpn?.fields ?? {});
  }

  /** POST /api/vpn/config: validate, write Gluetun's settings for the wrapper, remember them. */
  async save(body: unknown): Promise<VpnConfigView> {
    const parsed = vpnConfigInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new VpnError(
        400,
        'invalid',
        parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      );
    }
    const input = parsed.data;
    return this.opts.lock.run(async () => {
      const state = stateStore(this.opts.stateDir);
      const secrets = secretsStore(this.opts.stateDir);
      const [{ value: st }, { value: sec }] = await Promise.all([state.load(), secrets.load()]);
      const same =
        st.vpn?.provider === input.provider && st.vpn.protocol === input.protocol ? st.vpn : null;
      const saved = same ? { ...same.fields, ...(sec.vpn?.fields ?? {}) } : {};
      const result = validateVpnConfig(input, saved as Partial<Record<VpnFieldId, string>>);
      if (!result.ok) throw new VpnError(400, 'invalid', result.issues);
      const fields = result.fields;

      // Custom WireGuard: Gluetun needs the endpoint as an IP address.
      let resolvedEndpointIp: string | undefined;
      if (input.provider === 'custom' && input.protocol === 'wireguard') {
        const conf = parseWireguardConf(fields.wgConfig ?? '');
        if (conf.ok && !isIP(conf.conf.endpointHost)) {
          try {
            resolvedEndpointIp = await (this.opts.resolve ?? defaultResolve)(
              conf.conf.endpointHost,
            );
          } catch {
            throw new VpnError(400, 'invalid', [
              { path: 'fields.wgConfig', message: 'vpn.error.endpointResolve' },
            ]);
          }
        }
      }

      const env = buildVpnEnv(input, fields, {
        customOvpnPath: `${CONTAINER_EASYARR_DIR}/${CUSTOM_OVPN_NAME}`,
        ...(resolvedEndpointIp ? { resolvedEndpointIp } : {}),
      });
      if (input.provider === 'custom' && input.protocol === 'openvpn' && fields.ovpnConfig) {
        await this.opts.files.writeCustomOvpn(fields.ovpnConfig);
      } else {
        await this.opts.files.removeCustomOvpn();
      }
      const secretValues: Record<string, string> = {};
      const plainValues: Record<string, string> = {};
      for (const [id, value] of Object.entries(fields)) {
        if (VPN_FIELDS[id as VpnFieldId].secret) secretValues[id] = value;
        else plainValues[id] = value;
      }
      registerSecrets(Object.values(env).filter((v) => v.length >= 6 && secretish(env, v)));
      registerSecrets(Object.values(secretValues));

      // Taken before writing: the wrapper restarts Gluetun as soon as vpn.env changes, and status()
      // treats a Gluetun started before this moment as still running the old settings.
      const configuredAt = this.now().toISOString();
      await this.opts.files.writeEnv(serializeVpnEnv(env));
      await secrets.save({ ...sec, vpn: { fields: secretValues } });
      const vpn: NonNullable<State['vpn']> = {
        provider: input.provider,
        protocol: input.protocol,
        locations: input.locations,
        portForwarding: input.portForwarding,
        forwardedPort: input.portForwarding ? input.forwardedPort : null,
        freePlan: input.freePlan,
        fields: plainValues,
        configuredAt,
        lastTest: null,
      };
      const next = { ...st, vpn };
      await state.save(next);
      this.opts.log?.info(
        {
          provider: input.provider,
          protocol: input.protocol,
          portForwarding: input.portForwarding,
        },
        'VPN settings saved',
      );
      return toConfigView(next, secretValues) as VpnConfigView;
    });
  }

  async reconnect(): Promise<void> {
    const { state } = await this.load();
    if (!state.vpn) throw new VpnError(409, 'not_configured');
    await this.opts.files.requestReload();
  }

  async status(): Promise<VpnStatusView> {
    const { state } = await this.load();
    return this.statusFor(state);
  }

  private async statusFor(state: State): Promise<VpnStatusView> {
    const st = state.vpn;
    const wrapper = await this.opts.files.readStatus();
    const nowSec = Math.floor(this.now().getTime() / 1000);
    const base: VpnStatusView = {
      connection: 'not_configured',
      provider: st?.provider ?? null,
      protocol: st?.protocol ?? null,
      wrapper: wrapper?.state ?? null,
      runningFor: wrapper?.state === 'running' ? Math.max(0, nowSec - wrapper.since) : null,
      publicIp: null,
      portForwarding: { mode: 'off', port: null, state: 'off' },
      problem: null,
    };
    if (!st) return base;
    const provider = getVpnProvider(st.provider);
    const pfMode: PortForwardingView['mode'] =
      !st.portForwarding || !provider || provider.portForwarding === 'none'
        ? 'off'
        : provider.portForwarding;
    base.portForwarding = { mode: pfMode, port: null, state: pfMode === 'off' ? 'off' : 'waiting' };

    if (!wrapper) {
      return { ...base, connection: 'unknown', problem: { code: 'vpnContainer', line: null } };
    }
    const logLines = await this.opts.files.readLogTail();
    const diagnosis = diagnoseGluetunLog(logLines);
    const configuredAt = Math.floor(Date.parse(st.configuredAt) / 1000);

    if (wrapper.state === 'crashed' || wrapper.state === 'stopped') {
      return {
        ...base,
        connection: 'error',
        problem: diagnosis ?? { code: 'unknown', line: null },
      };
    }
    // The wrapper picks up new settings within a second; until then the old Gluetun may still run.
    if (wrapper.state !== 'running' || wrapper.since < configuredAt - 1) {
      return { ...base, connection: 'connecting' };
    }
    const runningFor = base.runningFor ?? 0;
    const timeout = this.opts.connectTimeoutSec ?? 90;
    try {
      const [vpnStatus, ip] = await Promise.all([
        this.opts.gluetun.vpnStatus(),
        this.opts.gluetun.publicIp(),
      ]);
      if (vpnStatus === 'running' && ip.ip) {
        const pf = await this.portForwarding(st, pfMode);
        return {
          ...base,
          connection: 'connected',
          publicIp: { ip: ip.ip, country: ip.country, city: ip.city },
          portForwarding: pf,
        };
      }
    } catch {
      if (runningFor > timeout) {
        return {
          ...base,
          connection: 'error',
          problem:
            diagnosis && FATAL.includes(diagnosis.code)
              ? diagnosis
              : { code: 'controlServer', line: null },
        };
      }
      return { ...base, connection: 'connecting' };
    }
    if (diagnosis && FATAL.includes(diagnosis.code)) {
      return { ...base, connection: 'error', problem: diagnosis };
    }
    if (runningFor > timeout) {
      return {
        ...base,
        connection: 'error',
        problem: diagnosis ?? { code: 'unreachable', line: null },
      };
    }
    return { ...base, connection: 'connecting' };
  }

  private async portForwarding(
    st: NonNullable<State['vpn']>,
    mode: PortForwardingView['mode'],
  ): Promise<PortForwardingView> {
    if (mode === 'off') return { mode, port: null, state: 'off' };
    if (mode === 'static') {
      return { mode, port: st.forwardedPort, state: st.forwardedPort ? 'active' : 'waiting' };
    }
    try {
      const [port] = await this.opts.gluetun.forwardedPorts();
      return port ? { mode, port, state: 'active' } : { mode, port: null, state: 'waiting' };
    } catch {
      return { mode, port: null, state: 'waiting' };
    }
  }

  /** The port qBittorrent should listen on, or null when there's nothing to sync (port-sync.ts). */
  async desiredListenPort(): Promise<number | null> {
    const status = await this.status();
    if (status.connection !== 'connected') return null;
    return status.portForwarding.state === 'active' ? status.portForwarding.port : null;
  }

  /**
   * POST /api/vpn/test (SPEC §9.1 step 4): connected? VPN IP + country, home IP hidden, port
   * forwarding. Waits a little if the connection is still being set up.
   */
  async test(): Promise<VpnTestView> {
    const { state } = await this.load();
    if (!state.vpn) throw new VpnError(409, 'not_configured');
    const deadline = Date.now() + (this.opts.testWaitMs ?? 25_000);
    let status = await this.statusFor(state);
    while (status.connection === 'connecting' && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, this.opts.pollMs ?? 2000));
      status = await this.statusFor(state);
    }
    const at = this.now().toISOString();
    let result: VpnTestView;
    if (status.connection !== 'connected' || !status.publicIp) {
      result = {
        ok: false,
        at,
        code: status.problem?.code ?? 'unreachable',
        publicIp: null,
        country: null,
        homeIpHidden: null,
        portForwarding: status.portForwarding,
        problemLine: status.problem?.line ?? null,
      };
    } else {
      const home = await this.homeIp();
      const hidden = home === null ? null : home !== status.publicIp.ip;
      result = {
        ok: hidden !== false,
        at,
        code: hidden === false ? 'homeIpVisible' : null,
        publicIp: status.publicIp.ip,
        country: status.publicIp.country,
        homeIpHidden: hidden,
        portForwarding: status.portForwarding,
        problemLine: null,
      };
    }
    await this.opts.lock.run(async () => {
      const store = stateStore(this.opts.stateDir);
      const { value } = await store.load();
      // Only record it for the settings that were tested.
      if (value.vpn && value.vpn.configuredAt === state.vpn?.configuredAt) {
        const lastTest: VpnTestResult = {
          ok: result.ok,
          at: result.at,
          code: result.code,
          publicIp: result.publicIp,
          country: result.country,
          homeIpHidden: result.homeIpHidden,
        };
        await store.save({ ...value, vpn: { ...value.vpn, lastTest } });
      }
    });
    this.opts.log?.info({ ok: result.ok, code: result.code }, 'VPN test finished');
    return result;
  }

  /** Our public IP outside the VPN (the dashboard isn't in the VPN namespace, D-003). */
  private async homeIp(): Promise<string | null> {
    for (const url of this.opts.homeIpUrls) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) continue;
        const text = (await res.text()).trim();
        let ip = text;
        if (text.startsWith('{')) ip = String((JSON.parse(text) as { ip?: string }).ip ?? '');
        if (isIP(ip)) return ip;
      } catch {
        // try the next one
      }
    }
    return null;
  }
}

/** Values in Gluetun's env that are secrets (keys, users, passwords, certificates). */
function secretish(env: Record<string, string>, value: string): boolean {
  return Object.entries(env).some(
    ([k, v]) => v === value && /KEY|PASSWORD|USER|CERT|PASSPHRASE/.test(k),
  );
}

function toConfigView(state: State, secretFields: Record<string, string>): VpnConfigView | null {
  const st = state.vpn;
  if (!st) return null;
  const t = st.lastTest;
  return {
    provider: st.provider,
    protocol: st.protocol,
    locations: st.locations,
    portForwarding: st.portForwarding,
    forwardedPort: st.forwardedPort,
    freePlan: st.freePlan,
    fields: st.fields as VpnConfigView['fields'],
    savedSecrets: Object.keys(secretFields).filter((k) => secretFields[k]) as VpnFieldId[],
    lastTest: t
      ? {
          ok: t.ok,
          at: t.at,
          code: t.code as VpnTestView['code'],
          publicIp: t.publicIp,
          country: t.country,
          homeIpHidden: t.homeIpHidden,
          portForwarding: { mode: 'off', port: null, state: 'off' },
          problemLine: null,
        }
      : null,
  };
}

export type { VpnConfigInput };
