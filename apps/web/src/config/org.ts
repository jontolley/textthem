/**
 * Organizations whose public pages are served at /<slug>/join (all groups),
 * /<slug>/<keyword>/join (one group), /<slug>/privacy, and /<slug>/terms. Each
 * org's A2P 10DLC campaign points at its own pages, so edit an org's details
 * before submitting its URLs to Twilio / carriers. The pages are prerendered to
 * static HTML at build time, so changes here need a web deploy.
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
  /** The same number in E.164, used for sms: links and the Join page QR codes. */
  smsNumberE164: string;
  /**
   * Groups people can join, each with its own public Join page. Keep these in
   * step with the groups in the dashboard and the keywords on the campaign.
   */
  groups: readonly OrgGroup[];
  /** Update whenever you change this org's public pages. */
  lastUpdated: string;
}

export interface OrgGroup {
  /** Opt-in keyword exactly as set in the dashboard (uppercase). */
  keyword: string;
  /** Group name as members know it (match the dashboard). */
  name: string;
  /** One sentence on what members get, shown at the top of the group's Join page. */
  description: string;
}

/** The software platform the programs run on (not the sender). */
export const PLATFORM_NAME = 'Text Them';
/** Who owns and operates the platform (shown on the signed-out landing page). */
export const PLATFORM_OPERATOR = 'Jon Tolley';
/** Contact for Text Them itself (privacy and terms questions, account deletion). */
export const PLATFORM_CONTACT_EMAIL = 'info@textthem.app';
/** Update whenever Text Them's own Privacy Policy or Terms change. */
export const PLATFORM_LEGAL_UPDATED = 'October 24, 2026';

export const ORGS: readonly OrgConfig[] = [
  {
    slug: 'opportunity-eq',
    name: 'Opportunity EQ',
    brandName: 'Jon Tolley',
    supportEmail: 'opportunityeq@textthem.app',
    smsNumber: '+1 (509) 479-2928',
    smsNumberE164: '+15094792928',
    groups: [
      {
        keyword: 'EQMEMBER',
        name: 'Opportunity EQ Members',
        description: 'Announcements and updates for Opportunity EQ members, sent by text message.',
      },
      {
        keyword: 'EQACTIVITIES',
        name: 'Opportunity EQ Activities',
        description:
          'Reminders and schedule changes for Opportunity EQ activities, sent by text message.',
      },
    ],
    lastUpdated: 'October 21, 2026',
  },
];

export function findOrg(slug: string | undefined): OrgConfig | undefined {
  return ORGS.find((org) => org.slug === slug);
}

/** Matches a URL keyword segment (any case) to one of the org's groups. */
export function findGroup(org: OrgConfig, keyword: string | undefined): OrgGroup | undefined {
  return org.groups.find((g) => g.keyword.toLowerCase() === keyword?.toLowerCase());
}

export function orgPath(org: OrgConfig, page: 'join' | 'privacy' | 'terms'): string {
  return `/${org.slug}/${page}`;
}

export function groupJoinPath(org: OrgConfig, group: OrgGroup): string {
  return `/${org.slug}/${group.keyword.toLowerCase()}/join`;
}

/**
 * Opens the phone's messaging app with the number and keyword pre-filled. The
 * `?&body=` form is understood by both iOS and Android.
 */
export function smsLink(org: OrgConfig, group: OrgGroup): string {
  return `sms:${org.smsNumberE164}?&body=${encodeURIComponent(group.keyword)}`;
}
