import { Link } from 'react-router-dom';
import { LegalLayout } from '@/components/LegalLayout';
import {
  ORGS,
  PLATFORM_CONTACT_EMAIL,
  PLATFORM_NAME,
  PLATFORM_OPERATOR,
  orgPath,
} from '@/config/org';

/**
 * Text Them's own Terms of Service (/terms) for organizers using the dashboard,
 * as opposed to each program's messaging terms for members (/:orgSlug/terms).
 */
export function PlatformTermsPage() {
  return (
    <LegalLayout title="Terms of Service">
      <p>
        These Terms govern your use of {PLATFORM_NAME} (textthem.app), group texting software owned
        and operated by {PLATFORM_OPERATOR} (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or
        &ldquo;our&rdquo;). By signing in to the {PLATFORM_NAME} dashboard, you agree to these
        Terms.
      </p>
      <p>
        If you receive texts from a program that uses {PLATFORM_NAME}, that program&rsquo;s own
        messaging terms apply to you:{' '}
        {ORGS.map((org, i) => (
          <span key={org.slug}>
            {i > 0 && ', '}
            <Link to={orgPath(org, 'terms')}>{org.name} Terms</Link>
          </span>
        ))}
        .
      </p>

      <h2>Who Can Use {PLATFORM_NAME}</h2>
      <p>
        Organizer accounts are by invitation only. Keep your sign-in secure. You are responsible for
        activity under your account, and you should tell us right away if you think someone else has
        used it.
      </p>

      <h2>Rules for Sending Messages</h2>
      <p>When you send messages with {PLATFORM_NAME}, you agree to:</p>
      <ul>
        <li>
          Text only people who joined your group themselves by texting its keyword. Do not add or
          import phone numbers, and do not use purchased or shared lists.
        </li>
        <li>
          Send only the kinds of messages your group was told to expect, such as announcements and
          reminders, and identify your program in your messages.
        </li>
        <li>
          Follow the laws that apply to text messaging, including the U.S. Telephone Consumer
          Protection Act, and wireless carrier rules.
        </li>
        <li>
          Not send content that is illegal, harassing, hateful, sexually explicit, or deceptive;
          spam or phishing; or content that carriers prohibit, such as promotions for alcohol,
          firearms, tobacco, or cannabis.
        </li>
        <li>
          Not try to get around access controls, overload the service, or use it for anything other
          than messaging your own groups.
        </li>
      </ul>

      <h2>Opt-Outs and Help</h2>
      <p>
        {PLATFORM_NAME} automatically handles <strong>STOP</strong> and <strong>HELP</strong>{' '}
        replies. Anyone who replies STOP stops receiving texts from your program; do not try to
        reach them again by other means through {PLATFORM_NAME}.
      </p>

      <h2>Your Messages</h2>
      <p>
        You are responsible for the messages you send. We may review messages and delivery records
        to operate {PLATFORM_NAME}, investigate problems or complaints, or comply with the law or
        carrier requirements.
      </p>

      <h2>Availability</h2>
      <p>
        {PLATFORM_NAME} is provided &ldquo;as is&rdquo; and &ldquo;as available.&rdquo; Wireless
        carriers can delay or decline to deliver texts, and scheduled messages may not go out if the
        service is unavailable. We do not guarantee that the service will be uninterrupted or that
        every message will be delivered.
      </p>

      <h2>Limitation of Liability</h2>
      <p>
        To the fullest extent permitted by law, {PLATFORM_OPERATOR} is not liable for any indirect,
        incidental, special, or consequential damages, or for messages that are delayed, not
        delivered, or lost, arising from your use of {PLATFORM_NAME}.
      </p>

      <h2>Suspension and Ending Access</h2>
      <p>
        We may suspend or remove access to {PLATFORM_NAME} at any time, including if these Terms are
        broken or if a carrier or our messaging provider requires it. You can stop using{' '}
        {PLATFORM_NAME} at any time and ask us to delete your account.
      </p>

      <h2>Privacy</h2>
      <p>
        Our <Link to="/privacy">Privacy Policy</Link> explains what information we collect and how
        we use it.
      </p>

      <h2>Changes to These Terms</h2>
      <p>
        We may update these Terms from time to time. Changes take effect when posted on this page,
        and we will update the &ldquo;Last updated&rdquo; date above. Continuing to use{' '}
        {PLATFORM_NAME} after a change means you accept the updated Terms.
      </p>

      <h2>Contact Us</h2>
      <p>
        Questions about these Terms? Contact {PLATFORM_OPERATOR} at{' '}
        <a href={`mailto:${PLATFORM_CONTACT_EMAIL}`}>{PLATFORM_CONTACT_EMAIL}</a>.
      </p>
    </LegalLayout>
  );
}
