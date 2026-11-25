import { useRef, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { MAX_BROADCAST_IMAGES } from '@text-them/shared';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { useUploadMedia } from '@/lib/hooks';
import { ImageError, MAX_IMAGE_BYTES, prepareImage } from '@/lib/image';

/**
 * Attaches up to `MAX_BROADCAST_IMAGES` images to a broadcast. Picking some
 * resizes and uploads them right away, so sending doesn't wait on them;
 * `value` is the uploaded URLs, in the order they were picked.
 */
export function ImageAttachments({
  value,
  onChange,
  onUploadingChange,
}: {
  value: string[];
  onChange: (mediaUrls: string[]) => void;
  /** So the form can hold off sending until the uploads finish. */
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const upload = useUploadMedia();
  // Uploads finish after the user may have removed others, so they add to the latest list.
  const latest = useRef(value);
  latest.current = value;
  // Sizes of images uploaded here, for the one-message total. Images a scheduled
  // broadcast already had aren't known, so they don't count.
  const sizes = useRef(new Map<string, number>());
  const [pending, setPending] = useState(0);
  const room = MAX_BROADCAST_IMAGES - value.length - pending;

  async function handlePick(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (input.current) input.current.value = ''; // Lets the same files be picked again.
    if (!files.length) return;
    if (files.length > room) {
      toast.error(`A message can have up to ${MAX_BROADCAST_IMAGES} images.`);
      return;
    }

    setPending((n) => n + files.length);
    onUploadingChange?.(true);
    try {
      const images = await Promise.all(files.map(prepareImage));
      const used = latest.current.reduce((sum, url) => sum + (sizes.current.get(url) ?? 0), 0);
      const adding = images.reduce((sum, image) => sum + image.size, 0);
      if (used + adding > MAX_IMAGE_BYTES) {
        throw new ImageError(
          'Together these images are over 5 MB, the most one picture message can carry. Try fewer.',
        );
      }
      // In parallel, but added in the order they were picked.
      const urls = await Promise.all(images.map((image) => upload.mutateAsync(image)));
      urls.forEach((url, i) => sizes.current.set(url, images[i].size));
      onChange([...latest.current, ...urls]);
    } catch (err) {
      toast.error(
        err instanceof ImageError || err instanceof ApiError
          ? err.message
          : "The images couldn't be attached",
      );
    } finally {
      setPending((n) => n - files.length);
      onUploadingChange?.(false);
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={input}
        type="file"
        multiple
        // HEIC is what iPhones take; Safari can decode it, and it's re-encoded as JPEG.
        accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif"
        className="hidden"
        onChange={(e) => handlePick(e.target.files)}
      />
      {(value.length > 0 || pending > 0) && (
        <div className="flex flex-wrap gap-2">
          {value.map((url, i) => (
            <Thumbnail
              key={url}
              url={url}
              index={i}
              onRemove={() => onChange(value.filter((u) => u !== url))}
            />
          ))}
          {Array.from({ length: pending }, (_, i) => (
            <div
              key={`pending-${i}`}
              className="flex h-24 w-24 items-center justify-center rounded-md border bg-muted"
            >
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {room > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => input.current?.click()}
            disabled={pending > 0}
          >
            {pending > 0 ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ImagePlus className="h-4 w-4" />
            )}
            {pending > 0 ? 'Attaching…' : value.length ? 'Add more' : 'Add images'}
          </Button>
        )}
        {value.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Sends as one picture message (MMS), which costs about three times a text.
          </p>
        )}
      </div>
    </div>
  );
}

/** One attached image, with a spinner until it has loaded so a blank box never shows. */
function Thumbnail({ url, index, onRemove }: { url: string; index: number; onRemove: () => void }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="relative h-24 w-24 overflow-hidden rounded-md border bg-muted">
      {!loaded && (
        <Loader2 className="absolute inset-0 m-auto h-5 w-5 animate-spin text-muted-foreground" />
      )}
      <img
        src={url}
        alt={`Attached image ${index + 1}`}
        className="h-full w-full object-cover"
        onLoad={() => setLoaded(true)}
        // Show it broken rather than spin forever; the X can still remove it.
        onError={() => setLoaded(true)}
      />
      <Button
        type="button"
        variant="secondary"
        size="icon"
        aria-label={`Remove image ${index + 1}`}
        className="absolute right-1 top-1 h-6 w-6 rounded-full shadow"
        onClick={onRemove}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
