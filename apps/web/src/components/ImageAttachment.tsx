import { useRef, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { useUploadMedia } from '@/lib/hooks';
import { ImageError, prepareImage } from '@/lib/image';

/**
 * Attaches one image to a broadcast. Picking one resizes it and uploads it
 * right away, so sending doesn't wait on it; `value` is the uploaded URL.
 */
export function ImageAttachment({
  value,
  onChange,
  onUploadingChange,
}: {
  value?: string;
  onChange: (mediaUrl: string | undefined) => void;
  /** So the form can hold off sending until the upload finishes. */
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const upload = useUploadMedia();
  // The URL whose image has finished loading (or failed to). Until then it stays
  // hidden behind "Attaching…", since it has no size yet and only the X would show.
  const [shownUrl, setShownUrl] = useState<string>();
  const showing = Boolean(value) && shownUrl === value;
  const attaching = upload.isPending || (Boolean(value) && !showing);

  async function handlePick(file: File | undefined) {
    if (!file) return;
    onUploadingChange?.(true);
    try {
      const image = await prepareImage(file);
      onChange(await upload.mutateAsync(image));
    } catch (err) {
      toast.error(
        err instanceof ImageError || err instanceof ApiError
          ? err.message
          : "The image couldn't be attached",
      );
    } finally {
      onUploadingChange?.(false);
      // Lets the same file be picked again after removing it.
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={input}
        type="file"
        // HEIC is what iPhones take; Safari can decode it, and it's re-encoded as JPEG.
        accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif"
        className="hidden"
        onChange={(e) => handlePick(e.target.files?.[0])}
      />
      {value && (
        // Rendered while hidden too, so the image loads.
        <div className={showing ? 'relative inline-block' : 'hidden'}>
          <img
            src={value}
            alt="Attached image"
            className="max-h-40 max-w-full rounded-md border object-contain"
            onLoad={() => setShownUrl(value)}
            // Show it broken rather than spin forever; the X can still remove it.
            onError={() => setShownUrl(value)}
          />
          <Button
            type="button"
            variant="secondary"
            size="icon"
            aria-label="Remove image"
            className="absolute right-1 top-1 h-7 w-7 rounded-full shadow"
            onClick={() => onChange(undefined)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
      {!showing && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => input.current?.click()}
          disabled={attaching}
        >
          {attaching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ImagePlus className="h-4 w-4" />
          )}
          {attaching ? 'Attaching…' : 'Add image'}
        </Button>
      )}
      {showing && (
        <p className="text-xs text-muted-foreground">
          Sends as a picture message (MMS), which costs about three times a text.
        </p>
      )}
    </div>
  );
}
