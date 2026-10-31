/**
 * Formats an E.164 number for display: "+15092097297" → "(509) 209-7297".
 * The app is US-only, so +1 is left off. Anything that isn't a US/Canada (+1)
 * number comes back unchanged, so a foreign sender still shows their country code.
 */
export function formatPhoneNumber(e164: string): string {
  const match = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return match ? `(${match[1]}) ${match[2]}-${match[3]}` : e164;
}
