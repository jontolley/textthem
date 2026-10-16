import { useParams } from 'react-router-dom';
import { findOrg } from '@/config/org';
import { OrgContext } from '@/lib/org-context';

/**
 * Resolves the :orgSlug route param to an org and provides it to the page. An
 * unknown slug renders "not found" rather than falling back to another org's
 * policies.
 */
export function OrgRoute({ children }: { children: React.ReactNode }) {
  const { orgSlug } = useParams();
  const org = findOrg(orgSlug);

  if (!org) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-background">
        <h1 className="text-2xl font-bold">Page not found</h1>
        <p className="text-sm text-muted-foreground">
          Check the link you were given and try again.
        </p>
      </div>
    );
  }

  return <OrgContext.Provider value={org}>{children}</OrgContext.Provider>;
}
