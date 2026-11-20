// GSM-7, the default SMS alphabet. Anything outside it (emoji, curly quotes, most
// accented letters) makes the whole message UCS-2, which fits far fewer per text.
const GSM_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
// These take two characters' room (an escape plus the character).
const GSM_EXTENDED = '^{}\\[~]|€\f';

/**
 * How many texts (segments) a message body goes out as. A long message is split
 * into parts that phones join back up, and each part is billed as one text.
 */
export function countSegments(body: string): number {
  if (!body) return 0;
  let gsmLength = 0;
  let isGsm = true;
  for (const ch of body) {
    if (GSM_BASIC.includes(ch)) gsmLength += 1;
    else if (GSM_EXTENDED.includes(ch)) gsmLength += 2;
    else {
      isGsm = false;
      break;
    }
  }
  if (isGsm) return gsmLength <= 160 ? 1 : Math.ceil(gsmLength / 153);
  // UCS-2 counts UTF-16 code units, so an emoji takes two.
  return body.length <= 70 ? 1 : Math.ceil(body.length / 67);
}
