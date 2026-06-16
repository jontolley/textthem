import { LegalLayout } from '@/components/LegalLayout';
import { ORG } from '@/config/org';

export function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy">
      <p>
        This Privacy Policy explains how {ORG.name} (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or
        &ldquo;our&rdquo;) collects, uses, and protects information in connection with our SMS
        text messaging program (the &ldquo;Program&rdquo;). By opting in to the Program, you agree
        to the collection and use of information as described here.
      </p>

      <h2>Information We Collect</h2>
      <p>We collect only the information needed to operate the Program, including:</p>
      <ul>
        <li>
          <strong>Your mobile phone number</strong>, which you provide by texting a keyword to our
          number to opt in.
        </li>
        <li>
          <strong>The messages you send us</strong>, such as the keyword you text to join a group
          and any STOP, HELP, or other replies.
        </li>
        <li>
          <strong>Program activity and delivery records</strong>, such as which groups you have
          subscribed to, opt-in and opt-out timestamps, and message delivery status.
        </li>
      </ul>
      <p>
        We do not collect sensitive personal information, payment information, or location data
        through the Program.
      </p>

      <h2>How We Use Your Information</h2>
      <p>We use the information we collect solely to operate the Program, specifically to:</p>
      <ul>
        <li>Deliver the group text messages you have opted in to receive;</li>
        <li>Process your subscription, opt-in, and opt-out (STOP) requests;</li>
        <li>Respond to your HELP requests and support inquiries;</li>
        <li>Maintain records of consent and comply with applicable laws and carrier requirements.</li>
      </ul>
      <p>We do not use your information for any purpose unrelated to the Program.</p>

      <h2>We Do Not Sell or Share Your Mobile Information</h2>
      <p>
        <strong>
          We do not sell, rent, lease, or share your mobile phone number, SMS opt-in data, or
          consent with any third parties for their own marketing or promotional purposes.
        </strong>{' '}
        Your mobile information and the consent you provide to receive messages stay within the
        Program. No mobile opt-in data is shared with third parties or affiliates for marketing.
      </p>

      <h2>Service Providers</h2>
      <p>
        We use a third-party messaging provider (Twilio) strictly to transmit the text messages you
        have requested. This provider processes your phone number and message content only as
        necessary to deliver our messages on our behalf, and is not permitted to use your
        information for its own purposes. Sharing information with such a provider for the sole
        purpose of delivering the Program&rsquo;s messages is not a sale or marketing disclosure of
        your information.
      </p>

      <h2>How We Protect Your Information</h2>
      <p>
        We take reasonable administrative, technical, and organizational measures to protect your
        information against unauthorized access, disclosure, alteration, or destruction. These
        measures include restricting access to authorized personnel, transmitting data over
        encrypted connections, and storing data with access controls. No method of transmission or
        storage is completely secure, but we work to safeguard your information consistent with
        industry practices.
      </p>

      <h2>Data Retention</h2>
      <p>
        We retain your phone number and consent records for as long as you remain subscribed and as
        needed to comply with our legal and recordkeeping obligations. When you opt out, we retain a
        minimal record of your opt-out to honor your request and demonstrate compliance.
      </p>

      <h2>Your Choices and Opting Out</h2>
      <p>
        You can opt out of the Program at any time by replying <strong>STOP</strong> to any message.
        After you opt out, you will no longer receive messages unless you opt back in. Reply{' '}
        <strong>HELP</strong> at any time for assistance, or contact us using the details below.
      </p>

      <h2>Children&rsquo;s Privacy</h2>
      <p>
        The Program is not directed to individuals under the age of 13, and we do not knowingly
        collect information from children.
      </p>

      <h2>Changes to This Policy</h2>
      <p>
        We may update this Privacy Policy from time to time. Changes are effective when posted on
        this page, and we will update the &ldquo;Last updated&rdquo; date above.
      </p>

      <h2>Contact Us</h2>
      <p>
        If you have questions about this Privacy Policy or your information, contact us at{' '}
        <a href={`mailto:${ORG.supportEmail}`}>{ORG.supportEmail}</a>.
      </p>
    </LegalLayout>
  );
}
