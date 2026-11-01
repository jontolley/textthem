import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TableHead } from '@/components/ui/table';
import { useGroups, useSenders, type MessageListView } from '@/lib/hooks';
import { cn } from '@/lib/utils';

/** How long after the last keystroke the text search applies. */
const SEARCH_DELAY_MS = 300;

const FIELDS = ['sort', 'dir', 'q', 'group', 'by', 'from', 'to'] as const;
type Field = (typeof FIELDS)[number];
export type ListViewValues = Record<Field, string>;

export type SortKey = 'when' | 'group';
type Dir = 'asc' | 'desc';

const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Midnight at the start of a YYYY-MM-DD day in the browser's time zone, plus `days`. */
function localDay(date: string, days = 0): string {
  const d = new Date(`${date}T00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

/**
 * A broadcast list's sort and filters, kept in the page address under
 * `<prefix>.<field>` (e.g. `?history.group=…`), so they survive a reload and
 * can be bookmarked. Defaults are left out of the address.
 */
export function useListView(prefix: string, naturalDir: Dir) {
  const [params, setParams] = useSearchParams();
  const values = Object.fromEntries(
    FIELDS.map((f) => [f, params.get(`${prefix}.${f}`) ?? '']),
  ) as ListViewValues;

  const set = useCallback(
    (patch: Partial<ListViewValues>) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [field, value] of Object.entries(patch)) {
            if (value) next.set(`${prefix}.${field}`, value);
            else next.delete(`${prefix}.${field}`);
          }
          return next;
        },
        { replace: true },
      ),
    [prefix, setParams],
  );

  const sort: SortKey = values.sort === 'group' ? 'group' : 'when';
  // Times read in the list's natural order; group names A to Z.
  const defaultDir = (key: SortKey): Dir => (key === 'when' ? naturalDir : 'asc');
  const dir: Dir = values.dir === 'asc' || values.dir === 'desc' ? values.dir : defaultDir(sort);

  /** Sorts by `key`, or reverses it if it's already the sort. */
  const sortBy = (key: SortKey) => {
    const nextDir = key === sort ? (dir === 'asc' ? 'desc' : 'asc') : defaultDir(key);
    set({ sort: key === 'when' ? '' : key, dir: nextDir === defaultDir(key) ? '' : nextDir });
  };

  const { q, group, by, from, to } = values;
  const view = useMemo<MessageListView>(
    () => ({
      sort,
      dir,
      q: q || undefined,
      groupId: group || undefined,
      sentBy: by || undefined,
      from: isDate(from) ? localDay(from) : undefined,
      // The "to" day is included, so the range ends at the start of the next day.
      to: isDate(to) ? localDay(to, 1) : undefined,
    }),
    [sort, dir, q, group, by, from, to],
  );
  const filtering = Boolean(q || group || by || from || to);
  const clearFilters = () => set({ q: '', group: '', by: '', from: '', to: '' });

  return { values, set, sort, dir, sortBy, view, filtering, clearFilters };
}

/** A column heading that sorts the list when clicked, with an arrow for the direction. */
export function SortableHead({
  label,
  active,
  dir,
  onSort,
  className,
}: {
  label: string;
  active: boolean;
  dir: Dir;
  onSort: () => void;
  className?: string;
}) {
  const Icon = !active ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <TableHead
      className={className}
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={onSort}
        className={cn(
          '-mx-1 inline-flex items-center gap-1 rounded px-1 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          active && 'text-foreground',
        )}
      >
        {label}
        <Icon className={cn('h-3.5 w-3.5', !active && 'opacity-40')} aria-hidden />
      </button>
    </TableHead>
  );
}

/**
 * A dropdown drawn with our own arrow, set in from the right edge; the
 * browser's own arrow sits too close to the border.
 */
function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative inline-flex">
      <select
        {...props}
        className="h-9 appearance-none rounded-md border border-input bg-background pl-3 pr-9 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
    </span>
  );
}

/** Search, group, sender and date-range filters for a broadcast list. */
export function BroadcastFilterBar({
  label,
  values,
  set,
  onClear,
}: {
  /** The list's name, for screen readers ("Filter scheduled …"). */
  label: string;
  values: ListViewValues;
  set: (patch: Partial<ListViewValues>) => void;
  onClear: () => void;
}) {
  const { data: groups } = useGroups();
  const { data: senders } = useSenders();
  const sortedGroups = useMemo(
    () => [...(groups ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [groups],
  );

  // The search box applies a moment after typing stops.
  const [text, setText] = useState(values.q);
  // Follow the address (e.g. Clear, or the back button) without undoing a space mid-typing.
  useEffect(() => setText((t) => (t.trim() === values.q ? t : values.q)), [values.q]);
  useEffect(() => {
    if (text.trim() === values.q) return;
    const timer = setTimeout(() => set({ q: text.trim() }), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text, values.q, set]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Search messages"
        aria-label={`Search ${label} messages`}
        className="min-w-48 flex-1"
      />
      <Select
        value={values.group}
        onChange={(e) => set({ group: e.target.value })}
        aria-label={`Filter ${label} by group`}
      >
        <option value="">All groups</option>
        {sortedGroups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </Select>
      <Select
        value={values.by}
        onChange={(e) => set({ by: e.target.value })}
        aria-label={`Filter ${label} by sender`}
      >
        <option value="">Anyone</option>
        {senders?.map((s) => (
          <option key={s.userId} value={s.userId}>
            {s.name ?? 'Unknown'}
          </option>
        ))}
      </Select>
      <label className="flex items-center gap-1 text-sm text-muted-foreground">
        From
        <Input
          type="date"
          value={values.from}
          max={values.to || undefined}
          onChange={(e) => set({ from: e.target.value })}
          className="w-auto"
        />
      </label>
      <label className="flex items-center gap-1 text-sm text-muted-foreground">
        To
        <Input
          type="date"
          value={values.to}
          min={values.from || undefined}
          onChange={(e) => set({ to: e.target.value })}
          className="w-auto"
        />
      </label>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          setText('');
          onClear();
        }}
      >
        Clear
      </Button>
    </div>
  );
}
