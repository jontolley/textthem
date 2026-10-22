import { useParams } from 'react-router-dom';
import { findOrg } from '@/config/org';
import { OrgContext } from '@/lib/org-context';
import { NotFound } from './NotFound';

/**
 * Resolves the :orgSlug route param to an org and provides it to the page. An
 * unknown slug renders "not found" rather than falling back to another org's
 * policies.
 */
export function OrgRoute({ children }: { children: React.ReactNode }) {
  const { orgSlug } = useParams();
  const org = findOrg(orgSlug);

  if (!org) return <NotFound />;

  return <OrgContext.Provider value={org}>{children}</OrgContext.Provider>;
}
