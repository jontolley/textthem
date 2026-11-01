import { clerkClient } from '@clerk/fastify';
import type { FastifyBaseLogger } from 'fastify';

/**
 * Looks up display names for Clerk user ids. Ids it can't resolve are left out
 * of the map, so callers fall back to showing nothing.
 */
export type UserDirectory = (userIds: string[]) => Promise<Map<string, string>>;

/** How long a looked-up name is reused before Clerk is asked again. */
const CACHE_MS = 60 * 60 * 1000;

/**
 * Names come from Clerk rather than our database, so they stay current when
 * an organizer changes theirs. Each user is fetched at most once an hour; a
 * failed lookup is logged and the page shows no names instead of failing.
 */
export function clerkUserDirectory(log: FastifyBaseLogger): UserDirectory {
  const cache = new Map<string, { name: string; at: number }>();

  return async (userIds) => {
    const now = Date.now();
    const missing = [...new Set(userIds)].filter((id) => {
      const hit = cache.get(id);
      return !hit || now - hit.at > CACHE_MS;
    });
    if (missing.length > 0) {
      try {
        const { data } = await clerkClient.users.getUserList({ userId: missing, limit: 100 });
        for (const user of data) {
          const name =
            user.fullName ?? user.username ?? user.primaryEmailAddress?.emailAddress ?? user.id;
          cache.set(user.id, { name, at: now });
        }
      } catch (err) {
        log.warn({ err }, 'Could not look up user names in Clerk');
      }
    }
    const names = new Map<string, string>();
    for (const id of userIds) {
      const hit = cache.get(id);
      if (hit) names.set(id, hit.name);
    }
    return names;
  };
}
