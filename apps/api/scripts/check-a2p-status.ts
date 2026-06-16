/**
 * Diagnoses A2P 10DLC readiness for the configured Messaging Service:
 * whether a number is in the pool, and the brand/campaign registration status.
 * Run: node --env-file=.env --import tsx apps/api/scripts/check-a2p-status.ts
 */
import twilio from 'twilio';

const client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
const serviceSid = process.env.TWILIO_MESSAGING_SERVICE_SID!;

const numbers = await client.messaging.v1.services(serviceSid).phoneNumbers.list();
console.log(`Numbers in sender pool: ${numbers.length || 0}`);
numbers.forEach((n) => console.log(`  - ${n.phoneNumber}`));

const campaigns = await client.messaging.v1.services(serviceSid).usAppToPerson.list();
if (campaigns.length === 0) {
  console.log('\nA2P Campaign: NONE registered on this Messaging Service.');
} else {
  campaigns.forEach((c) => {
    console.log('\nA2P Campaign:');
    console.log(`  campaignStatus: ${c.campaignStatus}`);
    console.log(`  usecase:        ${c.usAppToPersonUsecase}`);
    console.log(`  brandSid:       ${c.brandRegistrationSid}`);
  });
}

const brands = await client.messaging.v1.brandRegistrations.list({ limit: 5 });
console.log(`\nBrand registrations on account: ${brands.length}`);
brands.forEach((b) => console.log(`  - ${b.sid}: status=${b.status}`));
