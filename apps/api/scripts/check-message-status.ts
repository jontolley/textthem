/**
 * Fetches the latest delivery status for a Twilio message SID.
 * Run: node --env-file=.env --import tsx apps/api/scripts/check-message-status.ts <messageSid>
 */
import twilio from 'twilio';

const sid = process.argv[2];
if (!sid) {
  console.error('Usage: ... check-message-status.ts <messageSid>');
  process.exit(1);
}

const client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
const msg = await client.messages(sid).fetch();

console.log(`status:     ${msg.status}`);
console.log(`errorCode:  ${msg.errorCode ?? '(none)'}`);
console.log(`errorMsg:   ${msg.errorMessage ?? '(none)'}`);
