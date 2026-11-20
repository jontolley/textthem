import { Fragment } from 'react';
import { countSegments } from '@/lib/sms';

// Phones turn these into links, so the preview does too.
const URL_PATTERN = /(https?:\/\/[^\s]+)/g;

/**
 * Shows a broadcast the way it lands on a phone: the images first (one on its
 * own, several in a grid), then the text, as phones show a picture message.
 */
export function TextPreview({ body, mediaUrls }: { body: string; mediaUrls: string[] }) {
  const text = body.trim();
  const segments = countSegments(text);
  const empty = !text && !mediaUrls.length;

  return (
    <div className="space-y-2 md:sticky md:top-4" aria-label="Message preview">
      {/* Long messages scroll inside the preview rather than stretching the card.
          The label is inside, so the panel's top lines up with the text box. */}
      <div className="flex max-h-[32rem] min-h-32 flex-col gap-1 overflow-y-auto rounded-xl border bg-muted/40 p-3">
        <span className="mb-1 shrink-0 text-center text-xs font-medium text-muted-foreground">
          Preview
        </span>
        {empty ? (
          <p className="m-auto px-4 text-center text-xs text-muted-foreground">
            Your message shows here as members will see it.
          </p>
        ) : (
          <>
            {/* shrink-0: otherwise a long message squashes the images to fit the panel. */}
            {mediaUrls.length === 1 && (
              <img
                src={mediaUrls[0]}
                alt=""
                className="max-h-64 max-w-[75%] shrink-0 self-start rounded-2xl"
              />
            )}
            {mediaUrls.length > 1 && (
              <div className="grid w-[75%] shrink-0 grid-cols-2 gap-1 self-start">
                {mediaUrls.map((url) => (
                  <img
                    key={url}
                    src={url}
                    alt=""
                    className="aspect-square w-full rounded-xl object-cover"
                  />
                ))}
              </div>
            )}
            {text && (
              <p className="max-w-[85%] shrink-0 self-start whitespace-pre-wrap rounded-2xl rounded-bl-md bg-card px-3 py-2 text-sm leading-snug text-card-foreground shadow-sm [overflow-wrap:anywhere]">
                <Linkified text={text} />
              </p>
            )}
          </>
        )}
      </div>
      {!empty && (
        <p className="text-xs text-muted-foreground">
          {mediaUrls.length
            ? 'Sends as 1 picture message'
            : `Sends as ${segments} ${segments === 1 ? 'text' : 'texts'}`}{' '}
          per member
        </p>
      )}
    </div>
  );
}

/** The text with its URLs styled as links (not clickable: it's a preview). */
function Linkified({ text }: { text: string }) {
  return (
    <>
      {text.split(URL_PATTERN).map((part, i) =>
        // split with a capture group puts the matches at odd indexes.
        i % 2 === 1 ? (
          <span key={i} className="text-link underline underline-offset-2">
            {part}
          </span>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}
