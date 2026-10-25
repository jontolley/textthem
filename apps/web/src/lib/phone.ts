/**
 * Formats an E.164 number for display: "+15092097297" → "+1 (509) 209-7297".
 * Anything that isn't a US/Canada (+1) number comes back unchanged.
 */
export function formatPhoneNumber(e164: string): string {
  const match = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return match ? `+1 (${match[1]}) ${match[2]}-${match[3]}` : e164;
}
