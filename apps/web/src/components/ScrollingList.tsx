import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { TableCell, TableRow } from '@/components/ui/table';

/** How many rows a scrolling list shows before it scrolls, unless it asks for another number. */
const DEFAULT_VISIBLE_ROWS = 10;

/**
 * For a table that loads a page at a time: caps its height at `visibleRows` (so
 * the rest scrolls under a sticky header) and fetches the next page when its
 * last row scrolls into view. Pass `scroller` as the Table's `containerRef`,
 * `maxHeight` as its container style, and render `<LoadMoreRow sentinel={sentinel}>`
 * last while there's more to fetch.
 */
export function useScrollingList({
  rowCount,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  enabled = true,
  visibleRows = DEFAULT_VISIBLE_ROWS,
}: {
  rowCount: number;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => unknown;
  /** False while the list is hidden (e.g. a collapsed card). */
  enabled?: boolean;
  /** Rows shown before it scrolls (10 by default). */
  visibleRows?: number;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLTableRowElement>(null);
  const [maxHeight, setMaxHeight] = useState<number>();

  // Measured rather than fixed, since rows differ in height from table to table.
  // Only remeasured as rows load, so opening a row doesn't grow the box.
  useLayoutEffect(() => {
    const measure = () => {
      const box = scroller.current;
      const rows = box?.querySelectorAll('tbody > tr:not([data-load-more])');
      const head = box?.querySelector('thead');
      if (!box || !rows || !head || rows.length <= visibleRows) return setMaxHeight(undefined);
      const bottom = rows[visibleRows - 1].getBoundingClientRect().bottom;
      setMaxHeight(Math.ceil(bottom - head.getBoundingClientRect().top));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [rowCount, enabled, visibleRows]);

  useEffect(() => {
    if (!enabled || !hasNextPage || isFetchingNextPage || !sentinel.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void fetchNextPage();
      },
      { root: scroller.current, rootMargin: '0px 0px 120px 0px' },
    );
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [enabled, hasNextPage, isFetchingNextPage, fetchNextPage, rowCount]);

  return { scroller, sentinel, maxHeight };
}

/** The last row of a scrolling list while more can load; reaching it fetches the next page. */
export function LoadMoreRow({
  sentinel,
  columns,
  loading,
}: {
  sentinel: React.Ref<HTMLTableRowElement>;
  columns: number;
  loading: boolean;
}) {
  return (
    <TableRow ref={sentinel} data-load-more className="hover:bg-transparent">
      <TableCell colSpan={columns} className="text-xs text-muted-foreground">
        {loading ? 'Loading more…' : ''}
      </TableCell>
    </TableRow>
  );
}

/** Classes for a sticky header cell, so it stays put while the rows scroll. */
export const STICKY_HEAD = 'sticky top-0 z-10 bg-card';
