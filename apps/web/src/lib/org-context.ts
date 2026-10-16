import { createContext, useContext } from 'react';
import type { OrgConfig } from '@/config/org';

export const OrgContext = createContext<OrgConfig | null>(null);

/** The org for the current public page. Only valid inside <OrgRoute>. */
export function useOrg(): OrgConfig {
  const org = useContext(OrgContext);
  if (!org) throw new Error('useOrg must be used inside <OrgRoute>');
  return org;
}
