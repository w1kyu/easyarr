/**
 * Single source of truth for the product name and identity (SPEC §4, CLAUDE.md).
 * Never hard-code the app name anywhere else — import it from here.
 */
export const APP_NAME = 'EasyArr';
export const APP_ID = 'w1kyu-easyarr';
export const STORE_ID = 'w1kyu';
export const GITHUB_OWNER = 'w1kyu';
export const REPO_URL = 'https://github.com/w1kyu/easyarr';
export const DOCS_URL = `${REPO_URL}/tree/main/docs`;
export const ISSUES_URL = `${REPO_URL}/issues`;

export const brand = {
  appName: APP_NAME,
  appId: APP_ID,
  storeId: STORE_ID,
  githubOwner: GITHUB_OWNER,
  repoUrl: REPO_URL,
  docsUrl: DOCS_URL,
  issuesUrl: ISSUES_URL,
} as const;

export type Brand = typeof brand;
