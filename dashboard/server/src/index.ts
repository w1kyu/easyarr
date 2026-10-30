#!/usr/bin/env node
import { loadInitConfig, loadServeConfig } from './config.js';
import { createLogger } from './logger.js';
import { runInit } from './init/run.js';
import { startServer } from './server.js';

export { buildApp } from './app.js';
export { runInit } from './init/run.js';

async function main(argv: string[]): Promise<void> {
  const command = argv[2] ?? 'serve';
  if (command === 'init') {
    const cfg = loadInitConfig();
    const log = createLogger(cfg.logLevel);
    await runInit(cfg, log);
    return;
  }
  if (command === 'serve') {
    await startServer(loadServeConfig());
    return;
  }
  throw new Error(`Unknown command "${command}". Use "serve" or "init".`);
}

const isEntry = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isEntry) {
  main(process.argv).catch((err: unknown) => {
    const log = createLogger('error');
    log.error({ err }, 'fatal');
    process.exit(1);
  });
}
