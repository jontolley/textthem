import { cn } from '@/lib/utils';

/**
 * The Text Them app icon (the same artwork as the favicon) for use as a logo.
 * Decorative: always shown next to the "Text Them" or org name text.
 */
export function AppIcon({ className }: { className?: string }) {
  return (
    <img
      src="/favicon.svg"
      alt=""
      aria-hidden="true"
      width={28}
      height={28}
      className={cn('h-7 w-7 shrink-0 rounded-[6px]', className)}
    />
  );
}
