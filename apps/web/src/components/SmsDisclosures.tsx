import { Link } from 'react-router-dom';
import { orgPath } from '@/config/org';
import { useOrg } from '@/lib/org-context';

/**
 * The SMS disclosures carriers expect next to every call to action. Renders
 * inside <LegalLayout>, which styles the plain h2 / ul / p.
 */
export function SmsDisclosures({ keyword }: { keyword?: string }) {
  const org = useOrg();
  return (
    <>
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
        By texting {keyword ? <strong>{keyword}</strong> : 'a group keyword'} to {org.smsNumber},
        you agree to receive recurring automated text messages from {org.name} and to our{' '}
        <Link to={orgPath(org, 'terms')}>Terms of Service</Link> and{' '}
        <Link to={orgPath(org, 'privacy')}>Privacy Policy</Link>.
      </p>
    </>
  );
}
