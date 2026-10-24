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
 * Text Them's own Privacy Policy (/privacy), as opposed to each program's SMS
 * policy (/:orgSlug/privacy). Google's OAuth review reads this page, so it must
 * keep explaining how "Sign in with Google" data is used.
 */
export function PlatformPrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy">
      <p>
        {PLATFORM_NAME} is group texting software at textthem.app, owned and operated by{' '}
        {PLATFORM_OPERATOR} (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;). Organizers
        use it to send announcements and reminders to people who joined their group by text message.
        This policy explains what information {PLATFORM_NAME} collects and how it is used, including
        the information we receive when you sign in with Google.
      </p>
      <p>
        Each program that uses {PLATFORM_NAME} also has its own privacy policy for the people who
        receive its texts:{' '}
        {ORGS.map((org, i) => (
          <span key={org.slug}>
            {i > 0 && ', '}
            <Link to={orgPath(org, 'privacy')}>{org.name} Privacy Policy</Link>
          </span>
        ))}
        .
      </p>

      <h2>Information We Collect</h2>
      <p>
        <strong>Organizers</strong> (people invited to sign in to the {PLATFORM_NAME} dashboard):
      </p>
      <ul>
        <li>
          Your name, email address, and profile picture. If you sign in with Google, we receive
          these from your Google account. We do not request access to your Gmail, contacts,
          calendar, files, or any other Google data.
        </li>
        <li>Sign-in records, such as when you signed in, kept to secure your account.</li>
        <li>The messages you send or schedule, and which groups they went to.</li>
      </ul>
      <p>
        <strong>Members</strong> (people who join a group by texting its keyword): their mobile
        phone number, the keywords they text, their group memberships, opt-in and opt-out times, the
        texts sent to them, and whether those texts were delivered. Each program&rsquo;s privacy
        policy describes this in more detail.
      </p>
      <p>
        <strong>Website visitors:</strong> our hosting provider processes standard technical
        information, such as IP address and browser type, to deliver and protect the site. We use
        Cloudflare Web Analytics to count page views; it does not use cookies or track you across
        sites. The site loads its fonts from Google Fonts, so your browser sends a request to Google
        when you visit. The only cookies we set are the ones that keep organizers signed in.
      </p>

      <h2>How We Use Google User Data</h2>
      <p>
        When you sign in with Google, {PLATFORM_NAME} receives your name, email address, and profile
        picture. We use this information only to:
      </p>
      <ul>
        <li>create and identify your organizer account;</li>
        <li>let you sign in securely; and</li>
        <li>show you which account you are signed in with.</li>
      </ul>
      <p>
        We do not use Google user data for advertising, we do not sell it, and we do not use it to
        train artificial intelligence or machine learning models. We do not share it with anyone
        except our sign-in provider, Clerk, which processes it only to provide sign-in on our
        behalf.
      </p>
      <p>
        {PLATFORM_NAME}&rsquo;s use and transfer of information received from Google APIs adheres to
        the{' '}
        <a href="https://developers.google.com/terms/api-services-user-data-policy">
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements. You can remove {PLATFORM_NAME}&rsquo;s access at
        any time from your{' '}
        <a href="https://myaccount.google.com/connections">Google Account connections page</a>.
      </p>

      <h2>How We Use Information</h2>
      <p>We use the information we collect only to operate {PLATFORM_NAME}, specifically to:</p>
      <ul>
        <li>deliver the group texts that members signed up for;</li>
        <li>process opt-outs (STOP) and requests for help (HELP);</li>
        <li>show organizers what was sent and whether it was delivered;</li>
        <li>secure organizer accounts and keep the service running; and</li>
        <li>comply with the law and with wireless carrier requirements.</li>
      </ul>
      <p>
        <strong>
          We do not sell, rent, or share personal information, including mobile phone numbers and
          SMS opt-in data, with third parties for their marketing purposes.
        </strong>
      </p>

      <h2>Service Providers</h2>
      <p>
        We rely on these providers, which process information only to provide their services to us:
      </p>
      <ul>
        <li>Clerk, for organizer sign-in and accounts;</li>
        <li>Google, for &ldquo;Sign in with Google&rdquo; and web fonts;</li>
        <li>Twilio, for sending and receiving text messages;</li>
        <li>MongoDB Atlas, for database hosting;</li>
        <li>Fly.io, for hosting the {PLATFORM_NAME} service; and</li>
        <li>Cloudflare, for website hosting, DNS, and page-view counts.</li>
      </ul>

      <h2>Data Retention</h2>
      <ul>
        <li>
          Organizer account information, including Google sign-in data, is kept while you have
          access and deleted when you ask us to or when your access is removed.
        </li>
        <li>
          Member information is kept while they are subscribed and as needed to keep records of
          consent and opt-outs.
        </li>
        <li>
          Broadcast history is kept so organizers can see what was sent, and is deleted on request.
        </li>
      </ul>

      <h2>Your Choices</h2>
      <p>
        Organizers can ask for a copy of their account information, or for it to be deleted, by
        emailing us. You can also remove {PLATFORM_NAME}&rsquo;s access to your Google account at
        any time, as described above. Members can stop all texts by replying <strong>STOP</strong>,
        and can contact their program with other requests.
      </p>

      <h2>How We Protect Information</h2>
      <p>
        All connections to {PLATFORM_NAME} are encrypted. The dashboard is available only to invited
        organizers, and data is stored with access controls. No method of transmission or storage is
        completely secure, but we work to protect your information.
      </p>

      <h2>Children&rsquo;s Privacy</h2>
      <p>
        {PLATFORM_NAME} is not directed to children under 13, and we do not knowingly collect
        information from them.
      </p>

      <h2>Changes to This Policy</h2>
      <p>
        We may update this policy from time to time. Changes take effect when posted on this page,
        and we will update the &ldquo;Last updated&rdquo; date above.
      </p>

      <h2>Contact Us</h2>
      <p>
        Questions about this policy or your information? Contact {PLATFORM_OPERATOR} at{' '}
        <a href={`mailto:${PLATFORM_CONTACT_EMAIL}`}>{PLATFORM_CONTACT_EMAIL}</a>.
      </p>
    </LegalLayout>
  );
}
