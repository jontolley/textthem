import { TableCell, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

/**
 * Loading indicators, used together:
 * - Skeletons stand in for a list's rows the first time it loads, in the shape the
 *   data will take, so nothing jumps when it arrives.
 * - The loading bar runs along the top of a card whose rows are reloading (a new
 *   sort or filter), while the old rows stay on screen dimmed by `RELOADING`.
 */

/** A gray block that pulses where content will go. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-md bg-foreground/10', className)} />;
}

/** Widths for skeleton lines, varied so the rows don't look like stripes. */
const WIDTHS = ['w-4/5', 'w-3/5', 'w-2/3', 'w-1/2', 'w-3/4'];

/**
 * Placeholder rows for a table that's loading for the first time. `cellClassNames`
 * gives each column the classes its real cells use (widths, hiding on phones).
 */
export function SkeletonTableRows({
  columns,
  rows = 5,
  cellClassNames = [],
}: {
  columns: number;
  rows?: number;
  cellClassNames?: string[];
}) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <TableRow key={r} className="hover:bg-transparent">
          {Array.from({ length: columns }, (_, c) => (
            <TableCell key={c} className={cellClassNames[c]}>
              <Skeleton className={cn('h-4', WIDTHS[(r + c) % WIDTHS.length])} />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

/** Tells screen readers a section is loading; the skeletons themselves are hidden from them. */
export function LoadingLabel({ children = 'Loading…' }: { children?: React.ReactNode }) {
  return (
    <span role="status" className="sr-only">
      {children}
    </span>
  );
}

/**
 * A thin bar sliding along the top edge of its card while `active`. The card
 * needs `relative overflow-hidden` (see `LOADING_CARD`).
 */
export function LoadingBar({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 overflow-hidden">
      <div className="h-full w-2/5 animate-loading-bar bg-primary" />
      <LoadingLabel>Updating…</LoadingLabel>
    </div>
  );
}

/** Classes for a card that can show a `LoadingBar`. */
export const LOADING_CARD = 'relative overflow-hidden';

/** Classes for rows that are on screen while their replacement loads. */
export function reloadingClass(reloading: boolean) {
  return cn('transition-opacity', reloading && 'opacity-50');
}
