/**
 * Organizations whose public Join, Privacy Policy, and Terms pages are served at
 * /<slug>/join, /<slug>/privacy, and /<slug>/terms. Each org's A2P 10DLC campaign
 * points at its own pages, so edit an org's details before submitting its URLs to
 * Twilio / carriers.
 */
export interface OrgConfig {
  /** URL path segment: lowercase letters, digits, and hyphens. */
  slug: string;
  /** Your program / organization name as recipients know it. */
  name: string;
  /** The registered A2P 10DLC Brand name (must appear on the Privacy Policy). */
  brandName: string;
  /** A monitored support inbox for privacy and program questions. */
  supportEmail: string;
  /** The phone number people text keywords to (display format is fine). */
  smsNumber: string;
  /** The same number in E.164, used for sms: links and the Join page QR code. */
  smsNumberE164: string;
  /** Keyword shown as the example call-to-action on the public Join page. */
  exampleKeyword: string;
  /** Update whenever you change this org's legal pages. */
  lastUpdated: string;
}

/** The software platform the programs run on (not the sender). */
export const PLATFORM_NAME = 'Text Them';

export const ORGS: readonly OrgConfig[] = [
  {
    slug: 'opportunity-eq',
    name: 'Opportunity EQ',
    brandName: 'Jon Tolley',
    supportEmail: 'info@textthem.app',
    smsNumber: '+1 (509) 479-2928',
    smsNumberE164: '+15094792928',
    exampleKeyword: 'EQMEMBER',
    lastUpdated: 'October 16, 2026',
  },
];

export function findOrg(slug: string | undefined): OrgConfig | undefined {
  return ORGS.find((org) => org.slug === slug);
}

export function orgPath(org: OrgConfig, page: 'join' | 'privacy' | 'terms'): string {
  return `/${org.slug}/${page}`;
}
