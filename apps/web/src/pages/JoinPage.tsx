import { MessageSquare } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Link, useParams } from 'react-router-dom';
import { LegalLayout } from '@/components/LegalLayout';
import { NotFound } from '@/components/NotFound';
import { SmsDisclosures } from '@/components/SmsDisclosures';
import { buttonVariants } from '@/components/ui/button';
import { findGroup, orgPath, smsLink } from '@/config/org';
import { useOrg } from '@/lib/org-context';
import { cn } from '@/lib/utils';

/**
 * Public opt-in call-to-action for one group (/:orgSlug/:keyword/join). Carriers
 * review this page as proof of how people are invited to join, so it must carry
 * the full set of SMS disclosures.
 */
export function JoinPage() {
  const org = useOrg();
  const group = findGroup(org, useParams().keyword);
  if (!group) return <NotFound />;

  const link = smsLink(org, group);
  return (
    <LegalLayout title={`Join ${group.name}`} documentTitle={`Join ${group.name} by Text`}>
      <p>{group.description}</p>

      <div className="mt-6 flex flex-col items-center gap-6 rounded-lg border border-primary/20 bg-primary/5 p-6 text-center sm:flex-row sm:text-left">
        <div className="shrink-0 rounded-md bg-white p-3">
          <QRCodeSVG
            value={link}
            size={160}
            marginSize={0}
            title={`Scan to text ${group.keyword} to ${org.smsNumber}`}
          />
        </div>
        <div className="space-y-4">
          <p className="!mt-0 text-lg !text-foreground">
            Text <strong className="font-mono text-2xl">{group.keyword}</strong> to{' '}
            <strong className="whitespace-nowrap">{org.smsNumber}</strong> to join.
          </p>
          <p className="!mt-0 text-sm">
            Scan the code with your phone&rsquo;s camera, or if you&rsquo;re on your phone, tap the
            button. Your messaging app opens with the text ready &mdash; just tap send.
          </p>
          <a
            href={link}
            className={cn(buttonVariants({ size: 'lg' }), '!text-primary-foreground !no-underline')}
          >
            <MessageSquare className="h-4 w-4" />
            Text {group.keyword} to join
          </a>
        </div>
      </div>

      <h2>How It Works</h2>
      <p>
        Joining is optional. Text <strong>{group.keyword}</strong> to {org.smsNumber} from your own
        mobile phone; that is the only way to join, and no one can sign you up on your behalf.
        You&rsquo;ll receive a confirmation text right away, and then recurring messages from{' '}
        {group.name} until you opt out.
      </p>
      <p>
        Looking for a different group? See all{' '}
        <Link to={orgPath(org, 'join')}>{org.name} groups</Link>.
      </p>

      <SmsDisclosures keyword={group.keyword} />
    </LegalLayout>
  );
}
