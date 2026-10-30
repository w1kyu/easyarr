import path from 'node:path';
import { JsonStore } from './json-store.js';
import { secretsMigrations, stateMigrations } from './migrations.js';
import {
  defaultSecrets,
  defaultState,
  SECRETS_SCHEMA_VERSION,
  secretsSchema,
  STATE_SCHEMA_VERSION,
  stateSchema,
  type Secrets,
  type State,
} from './schema.js';

export * from './schema.js';
export { JsonStore } from './json-store.js';

export function stateStore(stateDir: string): JsonStore<State> {
  return new JsonStore({
    file: path.join(stateDir, 'state.json'),
    schema: stateSchema,
    version: STATE_SCHEMA_VERSION,
    migrations: stateMigrations,
    defaults: () => defaultState(),
  });
}

export function secretsStore(stateDir: string): JsonStore<Secrets> {
  return new JsonStore({
    file: path.join(stateDir, 'secrets.json'),
    schema: secretsSchema,
    version: SECRETS_SCHEMA_VERSION,
    migrations: secretsMigrations,
    defaults: defaultSecrets,
  });
}
