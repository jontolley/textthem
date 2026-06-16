/**
 * One-off live test of the outbound broadcast path. Sends a real SMS to TEST_PHONE
 * using the same Twilio call the broadcast feature makes (Messaging Service if set,
 * otherwise the from-number).
 *
 * Run (Node 22+ reads the env file natively):
 *   node --env-file=apps/api/.env.local --import tsx apps/api/scripts/send-test-broadcast.ts
 *
 * Required env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TEST_PHONE,
 *   and one of TWILIO_FROM_NUMBER | TWILIO_MESSAGING_SERVICE_SID.
 */
import twilio from 'twilio';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

const accountSid = required('TWILIO_ACCOUNT_SID');
const authToken = required('TWILIO_AUTH_TOKEN');
const to = required('TEST_PHONE');
const fromNumber = process.env.TWILIO_FROM_NUMBER;
const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

if (!fromNumber && !messagingServiceSid) {
  console.error('Set TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID');
  process.exit(1);
}

const sender = messagingServiceSid ? { messagingServiceSid } : { from: fromNumber };
const body = process.env.TEST_BODY ?? 'text-them test broadcast ✅ — if you got this, sending works.';

const client = twilio(accountSid, authToken);

console.log(`Sending to ${to} via ${messagingServiceSid ? 'Messaging Service' : `from ${fromNumber}`}…`);
try {
  const msg = await client.messages.create({ to, body, ...sender });
  console.log(`✅ Accepted by Twilio. SID=${msg.sid} status=${msg.status}`);
  console.log('Check your phone. (On a trial account the body is prefixed and the number must be verified.)');
} catch (err) {
  const e = err as { code?: number; message?: string; moreInfo?: string };
  console.error(`❌ Send failed: [${e.code}] ${e.message}`);
  if (e.moreInfo) console.error(`   ${e.moreInfo}`);
  process.exit(1);
}
