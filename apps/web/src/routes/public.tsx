import type { RouteObject } from 'react-router-dom';
import { OrgRoute } from '@/components/OrgRoute';
import { ORGS, groupJoinPath, orgPath } from '@/config/org';
import { JoinIndexPage } from '@/pages/JoinIndexPage';
import { JoinPage } from '@/pages/JoinPage';
import { PrivacyPage } from '@/pages/PrivacyPage';
import { TermsPage } from '@/pages/TermsPage';

/**
 * Public per-org pages: reachable without signing in (carrier review), and
 * prerendered to static HTML at build time (src/prerender.tsx).
 */
export const publicRoutes: RouteObject[] = [
  {
    path: '/:orgSlug/join',
    element: (
      <OrgRoute>
        <JoinIndexPage />
      </OrgRoute>
    ),
  },
  {
    path: '/:orgSlug/:keyword/join',
    element: (
      <OrgRoute>
        <JoinPage />
      </OrgRoute>
    ),
  },
  {
    path: '/:orgSlug/privacy',
    element: (
      <OrgRoute>
        <PrivacyPage />
      </OrgRoute>
    ),
  },
  {
    path: '/:orgSlug/terms',
    element: (
      <OrgRoute>
        <TermsPage />
      </OrgRoute>
    ),
  },
];

/** Every public URL, one per page to prerender. */
export function publicPaths(): string[] {
  return ORGS.flatMap((org) => [
    orgPath(org, 'join'),
    ...org.groups.map((group) => groupJoinPath(org, group)),
    orgPath(org, 'privacy'),
    orgPath(org, 'terms'),
  ]);
}
