import { Link } from 'react-router-dom';
import { LegalLayout } from '@/components/LegalLayout';
import { ORG } from '@/config/org';

/**
 * Public opt-in call-to-action. Carriers review this page as proof of how people
 * are invited to join, so it must carry the full set of SMS disclosures.
 */
export function JoinPage() {
  return (
    <LegalLayout title={`Get ${ORG.name} Text Updates`}>
      <p>
        Get activity reminders, schedule changes, and announcements from your {ORG.name} group by
        text message.
      </p>

      <div className="mt-6 rounded-lg border bg-muted/40 p-6 text-center">
        <p className="!mt-0 text-lg !text-foreground">
          Text <strong className="font-mono text-2xl">{ORG.exampleKeyword}</strong> to{' '}
          <strong className="whitespace-nowrap">{ORG.smsNumber}</strong> to join.
        </p>
      </div>

      <h2>How It Works</h2>
      <p>
        Each group has its own keyword, shared by the group&rsquo;s organizer. Text the keyword to{' '}
        {ORG.smsNumber} to join that group. You&rsquo;ll receive a confirmation text right away, and
        then recurring messages from that group until you opt out.
      </p>

      <h2>Message Details</h2>
      <ul>
        <li>Message frequency varies.</li>
        <li>Msg &amp; data rates may apply.</li>
        <li>
          Reply <strong>HELP</strong> for help or contact{' '}
          <a href={`mailto:${ORG.supportEmail}`}>{ORG.supportEmail}</a>.
        </li>
        <li>
          Reply <strong>STOP</strong> at any time to unsubscribe from all messages.
        </li>
        <li>Consent to receive messages is not a condition of any purchase.</li>
      </ul>

      <p>
        By texting a keyword, you agree to receive recurring automated text messages from {ORG.name}{' '}
        and to our <Link to="/terms">Terms of Service</Link> and{' '}
        <Link to="/privacy">Privacy Policy</Link>.
      </p>
    </LegalLayout>
  );
}
