import { Link } from 'react-router-dom';
import { LegalLayout } from '@/components/LegalLayout';
import { SmsDisclosures } from '@/components/SmsDisclosures';
import { groupJoinPath } from '@/config/org';
import { useOrg } from '@/lib/org-context';

/** Public list of an org's groups (/:orgSlug/join), linking to each group's Join page. */
export function JoinIndexPage() {
  const org = useOrg();
  const title = `Get ${org.name} Text Updates`;

  return (
    <LegalLayout title={title} documentTitle={title}>
      <p>
        {org.name} sends text messages to the groups below. Join a group by texting its keyword to{' '}
        {org.smsNumber} from your own mobile phone. Joining is optional, and each group&rsquo;s page
        has a QR code and a tap-to-text button.
      </p>

      <div className="mt-6 space-y-3">
        {org.groups.map((group) => (
          <div key={group.keyword} className="rounded-lg border p-4">
            <p className="!mt-0 font-semibold !text-foreground">{group.name}</p>
            <p className="!mt-1">{group.description}</p>
            <p className="!mt-2">
              Text <strong className="font-mono">{group.keyword}</strong> to {org.smsNumber}{' '}
              &middot; <Link to={groupJoinPath(org, group)}>Join page</Link>
            </p>
          </div>
        ))}
      </div>

      <SmsDisclosures />
    </LegalLayout>
  );
}
