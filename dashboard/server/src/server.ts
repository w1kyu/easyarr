import type { ServeConfig } from './config.js';
import { buildApp } from './app.js';
import { createLogger, registerSecrets } from './logger.js';
import { secretsStore, stateStore } from './state/index.js';

export async function startServer(config: ServeConfig): Promise<void> {
  const log = createLogger(config.logLevel);
  // Load state early so a broken file is reported at startup, and so secrets get redacted.
  await stateStore(config.stateDir).load();
  const secrets = await secretsStore(config.stateDir).load();
  registerSecrets(Object.values(secrets.value.apiKeys));
  if (secrets.value.account) registerSecrets([secrets.value.account.password]);

  const app = await buildApp({ config, logger: log });
  const close = async (signal: string) => {
    log.info({ signal }, 'shutting down');
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void close('SIGTERM'));
  process.on('SIGINT', () => void close('SIGINT'));

  await app.listen({ host: config.host, port: config.port });
  log.info({ port: config.port, version: config.version }, 'dashboard listening');
}
