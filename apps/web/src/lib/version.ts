import type { VersionInfo } from '@text-them/shared';

/** Where commit links on the Help page point. */
export const REPO_URL = 'https://github.com/jontolley/textthem';

/** This dashboard build, stamped by vite.config.ts. */
export const WEB_VERSION: VersionInfo = { commit: __APP_COMMIT__, builtAt: __APP_BUILT_AT__ };

export function shortCommit(commit: string): string {
  return commit.slice(0, 7);
}

export function commitUrl(commit: string): string {
  return `${REPO_URL}/commit/${commit}`;
}
