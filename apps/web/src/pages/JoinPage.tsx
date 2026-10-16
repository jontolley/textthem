import { MessageSquare } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Link } from 'react-router-dom';
import { LegalLayout } from '@/components/LegalLayout';
import { buttonVariants } from '@/components/ui/button';
import { orgPath } from '@/config/org';
import { useOrg } from '@/lib/org-context';
import { cn } from '@/lib/utils';

/**
 * Public opt-in call-to-action. Carriers review this page as proof of how people
 * are invited to join, so it must carry the full set of SMS disclosures.
 */
export function JoinPage() {
  const org = useOrg();
  // Opens the phone's messaging app with the number and keyword pre-filled. The
  // `?&body=` form is understood by both iOS and Android.
  const smsLink = `sms:${org.smsNumberE164}?&body=${encodeURIComponent(org.exampleKeyword)}`;

  return (
    <LegalLayout title={`Get ${org.name} Text Updates`}>
      <p>
        Get activity reminders, schedule changes, and announcements from your {org.name} group by
        text message.
      </p>

      <div className="mt-6 flex flex-col items-center gap-6 rounded-lg border bg-muted/40 p-6 text-center sm:flex-row sm:text-left">
        <div className="shrink-0 rounded-md bg-white p-3">
          <QRCodeSVG
            value={smsLink}
            size={160}
            marginSize={0}
            title={`Scan to text ${org.exampleKeyword} to ${org.smsNumber}`}
          />
        </div>
        <div className="space-y-4">
          <p className="!mt-0 text-lg !text-foreground">
            Text <strong className="font-mono text-2xl">{org.exampleKeyword}</strong> to{' '}
            <strong className="whitespace-nowrap">{org.smsNumber}</strong> to join.
          </p>
          <p className="!mt-0 text-sm">
            Scan the code with your phone&rsquo;s camera, or if you&rsquo;re on your phone, tap the
            button. Your messaging app opens with the text ready &mdash; just tap send.
          </p>
          <a
            href={smsLink}
            className={cn(buttonVariants({ size: 'lg' }), '!text-primary-foreground !no-underline')}
          >
            <MessageSquare className="h-4 w-4" />
            Text {org.exampleKeyword} to join
          </a>
        </div>
      </div>

      <h2>How It Works</h2>
      <p>
        Each group has its own keyword, shared by the group&rsquo;s organizer. Text the keyword to{' '}
        {org.smsNumber} to join that group. You&rsquo;ll receive a confirmation text right away, and
        then recurring messages from that group until you opt out.
      </p>

      <h2>Message Details</h2>
      <ul>
        <li>Message frequency varies.</li>
        <li>Msg &amp; data rates may apply.</li>
        <li>
          Reply <strong>HELP</strong> for help or contact{' '}
          <a href={`mailto:${org.supportEmail}`}>{org.supportEmail}</a>.
        </li>
        <li>
          Reply <strong>STOP</strong> at any time to unsubscribe from all messages.
        </li>
        <li>Consent to receive messages is not a condition of any purchase.</li>
      </ul>

      <p>
        By texting a keyword, you agree to receive recurring automated text messages from {org.name}{' '}
        and to our <Link to={orgPath(org, 'terms')}>Terms of Service</Link> and{' '}
        <Link to={orgPath(org, 'privacy')}>Privacy Policy</Link>.
      </p>
    </LegalLayout>
  );
}
