/**
 * Organization details shown on the public Privacy Policy and Terms pages.
 * Edit these to match your program before submitting URLs to Twilio / carriers.
 */
export const ORG = {
  /** Your program / organization name as recipients know it. */
  name: 'Text Them',
  /** A monitored support inbox for privacy and program questions. */
  supportEmail: 'info@textthem.app',
  /** The phone number people text keywords to (display format is fine). */
  smsNumber: '+1 (509) 479-2928',
} as const;

/** Update whenever you change the legal pages. */
export const LAST_UPDATED = 'June 16, 2026';
