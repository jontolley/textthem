/**
 * Gets a picked image ready to send as an MMS. Twilio takes up to 5 MB, but
 * carriers often shrink or drop anything much over ~600 KB, so photos are
 * scaled down and re-encoded as JPEG to fit under that.
 */

/** What carriers deliver reliably. */
const TARGET_BYTES = 600 * 1024;
/** Twilio's (and the API's) limit. */
const MAX_BYTES = 5 * 1024 * 1024;
/** Longest side after scaling; phones show MMS images far smaller than this. */
const MAX_SIDE = 1600;

export class ImageError extends Error {}

export async function prepareImage(file: File): Promise<Blob> {
  // Re-encoding a GIF would drop its animation, so it goes as is.
  if (file.type === 'image/gif') {
    if (file.size > MAX_BYTES) throw new ImageError('That GIF is over 5 MB. Try a smaller one.');
    return file;
  }

  let bitmap: ImageBitmap;
  try {
    // Decodes whatever the browser can (JPEG, PNG, WebP, HEIC on Safari, …).
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImageError("That file couldn't be read as an image. Try a JPEG or PNG.");
  }

  try {
    const fitsAlready =
      (file.type === 'image/jpeg' || file.type === 'image/png') &&
      file.size <= TARGET_BYTES &&
      Math.max(bitmap.width, bitmap.height) <= MAX_SIDE;
    if (fitsAlready) return file;

    // Shrink until it fits: first by quality, then by size.
    for (const side of [MAX_SIDE, 1200, 900]) {
      for (const quality of [0.85, 0.7, 0.55]) {
        const blob = await encodeJpeg(bitmap, side, quality);
        if (blob.size <= TARGET_BYTES) return blob;
      }
    }
    // Still big (a very detailed image): the smallest try still beats sending the original.
    return await encodeJpeg(bitmap, 900, 0.55);
  } finally {
    bitmap.close();
  }
}

function encodeJpeg(bitmap: ImageBitmap, maxSide: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ImageError("This browser can't resize images.");
  // JPEG has no transparency, so transparent PNG areas come out white rather than black.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new ImageError("The image couldn't be resized."))),
      'image/jpeg',
      quality,
    ),
  );
}
