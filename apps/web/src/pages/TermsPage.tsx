import { Link } from 'react-router-dom';
import { LegalLayout } from '@/components/LegalLayout';
import { ORG } from '@/config/org';

export function TermsPage() {
  return (
    <LegalLayout title="Messaging Terms &amp; Conditions">
      <p>
        These Terms &amp; Conditions (&ldquo;Terms&rdquo;) govern your participation in the{' '}
        {ORG.name} SMS text messaging program (the &ldquo;Program&rdquo;). By opting in, you agree
        to these Terms.
      </p>

      <h2>Program Description</h2>
      <p>
        The Program sends group text messages to subscribers who have opted in. You join a group by
        texting that group&rsquo;s keyword to {ORG.smsNumber}. Once subscribed, you will receive
        recurring text messages from that group until you opt out.
      </p>

      <h2>Consent to Receive Messages</h2>
      <p>
        By texting a keyword to join, you consent to receive recurring automated marketing and
        informational text messages from the Program at the mobile number you used to opt in.
        Consent to receive messages is not a condition of any purchase.
      </p>

      <h2>Message Frequency</h2>
      <p>
        Message frequency varies depending on the groups you join and the activity of the Program.
        You may receive messages on an irregular or recurring basis.
      </p>

      <h2>Cost</h2>
      <p>
        <strong>Message and data rates may apply.</strong> The Program is offered at no additional
        cost from us, but your mobile carrier&rsquo;s standard message and data rates apply to all
        messages sent and received. Contact your wireless provider for details about your plan.
      </p>

      <h2>How to Opt Out</h2>
      <p>
        You can cancel at any time by replying <strong>STOP</strong> to any message. After you send
        STOP, we will send a one-time confirmation and you will no longer receive messages from the
        Program. To rejoin, text a group keyword again.
      </p>

      <h2>How to Get Help</h2>
      <p>
        Reply <strong>HELP</strong> to any message for assistance, or contact us at{' '}
        <a href={`mailto:${ORG.supportEmail}`}>{ORG.supportEmail}</a>.
      </p>

      <h2>Carrier Disclaimer</h2>
      <p>
        Carriers are not liable for delayed or undelivered messages. Delivery of messages is subject
        to effective transmission by your wireless carrier and is not guaranteed.
      </p>

      <h2>Eligibility</h2>
      <p>
        You must be the account holder of, or have authorization to use, the mobile number you
        enroll, and you must be old enough to consent to receive these messages. The Program is
        intended for recipients with mobile numbers in the United States.
      </p>

      <h2>Privacy</h2>
      <p>
        Your use of the Program is also governed by our{' '}
        <Link to="/privacy">Privacy Policy</Link>, which explains how we collect, use, and protect
        your information and confirms that we do not sell or share your mobile information with third
        parties for marketing.
      </p>

      <h2>Changes to These Terms</h2>
      <p>
        We may update these Terms from time to time. Changes are effective when posted on this page,
        and we will update the &ldquo;Last updated&rdquo; date above. Your continued participation
        after changes are posted constitutes acceptance of the updated Terms.
      </p>

      <h2>Contact Us</h2>
      <p>
        Questions about these Terms? Contact us at{' '}
        <a href={`mailto:${ORG.supportEmail}`}>{ORG.supportEmail}</a>.
      </p>
    </LegalLayout>
  );
}
