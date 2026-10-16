/**
 * Organization details shown on the public Privacy Policy and Terms pages.
 * Edit these to match your program before submitting URLs to Twilio / carriers.
 */
export const ORG = {
  /** Your program / organization name as recipients know it. */
  name: 'Opportunity EQ',
  /** The registered A2P 10DLC Brand name (must appear on the Privacy Policy). */
  brandName: 'Jon Tolley',
  /** The software platform the program runs on (not the sender). */
  platformName: 'Text Them',
  /** A monitored support inbox for privacy and program questions. */
  supportEmail: 'info@textthem.app',
  /** The phone number people text keywords to (display format is fine). */
  smsNumber: '+1 (509) 479-2928',
  /** Keyword shown as the example call-to-action on the public Join page. */
  exampleKeyword: 'EQMEMBER',
} as const;

/** Update whenever you change the legal pages. */
export const LAST_UPDATED = 'October 15, 2026';
