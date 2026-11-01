import { promises as fs } from 'node:fs';
import path from 'node:path';
import { serviceUrl, type ServiceId, type SystemInfo } from '@easyarr/shared';
import type { Logger } from 'pino';
import { secretsStore, stateStore } from '../state/index.js';
import type { Mutex } from '../state/mutex.js';
import { WiringEngine } from './engine.js';
import { ServiceError } from './http.js';
import { StateLedgerStore } from './ledger.js';
import type { GpuVendor } from './services/jellyfin.js';
import { RecyclarrFiles } from './services/recyclarr.js';
import { buildSteps, type StepDeps } from './steps.js';

export interface WiringOptions {
  stateDir: string;
  /** The Recyclarr container's /config (shared with its runner loop, D-048). */
  recyclarrDir: string;
  lock: Mutex;
  serviceUrls?: Partial<Record<ServiceId, string>>;
  collectSystemInfo: () => Promise<SystemInfo>;
  /** /sys, to tell Intel from AMD render devices. */
  sysDir?: string;
  log?: Logger;
}

const PCI_VENDOR: Record<string, GpuVendor> = {
  '0x8086': 'intel',
  '0x1002': 'amd',
  '0x10de': 'nvidia',
};

/** GPU vendor of a /dev/dri/renderD* device, from sysfs (unknown → VA-API, the generic choice). */
export async function gpuVendor(device: string, sysDir = '/sys'): Promise<GpuVendor> {
  try {
    const id = (
      await fs.readFile(
        path.join(sysDir, 'class/drm', path.basename(device), 'device/vendor'),
        'utf8',
      )
    ).trim();
    return PCI_VENDOR[id] ?? 'other';
  } catch {
    return 'other';
  }
}

export function createWiring(opts: WiringOptions): WiringEngine {
  const secrets = secretsStore(opts.stateDir);
  const deps: StepDeps = {
    url: (id) => opts.serviceUrls?.[id] ?? serviceUrl(id),
    keys: async () => (await secrets.load()).value.apiKeys,
    saveKey: (name, value) =>
      opts.lock.run(async () => {
        const { value: s } = await secrets.load();
        if (s.apiKeys[name] === value) return;
        await secrets.save({ ...s, apiKeys: { ...s.apiKeys, [name]: value } });
      }),
    account: async () => {
      const { value: state } = await stateStore(opts.stateDir).load();
      const password = (await secrets.load()).value.account?.password;
      if (!state.account || !password) {
        throw new ServiceError('easyarr', 'rejected', 'the wizard account is missing', 409, [
          'wizard_incomplete',
        ]);
      }
      return { username: state.account.username, password };
    },
    gpu: async () => {
      const { gpu } = await opts.collectSystemInfo();
      const device = gpu.devices[0];
      if (gpu.kind === 'nvidia') return { vendor: 'nvidia', device: device ?? '' };
      if (gpu.kind === 'dri' && device)
        return { vendor: await gpuVendor(device, opts.sysDir), device };
      return null;
    },
    recyclarr: new RecyclarrFiles(opts.recyclarrDir),
  };
  const { steps, health } = buildSteps(deps);
  return new WiringEngine({
    steps,
    health,
    store: new StateLedgerStore(opts.stateDir, opts.lock),
    ...(opts.log ? { log: opts.log } : {}),
  });
}
