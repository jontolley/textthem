import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ListFilter } from 'lucide-react';
import { toast } from 'sonner';
import type { GroupMember, MemberSortKey, SubscriptionStatus } from '@text-them/shared';
import { SortableHead } from '@/components/BroadcastListControls';
import { CollapsibleToggle } from '@/components/CollapsibleToggle';
import { LoadMoreRow, STICKY_HEAD, useScrollingList } from '@/components/ScrollingList';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ApiError } from '@/lib/api';
import { useGroupMembers, useUpdateMemberName } from '@/lib/hooks';
import { formatPhoneNumber } from '@/lib/phone';
import { cn } from '@/lib/utils';

/** How long after the last keystroke a member's name saves. */
const NAME_SAVE_DELAY_MS = 2000;
/** How long after the last keystroke the filter applies. */
const FILTER_DELAY_MS = 300;

type Dir = 'asc' | 'desc';
const SORT_KEYS: MemberSortKey[] = ['name', 'phone', 'subscribed', 'left'];
// Names and numbers read A to Z; dates most recent first.
const defaultDir = (key: MemberSortKey): Dir =>
  key === 'name' || key === 'phone' ? 'asc' : 'desc';

/**
 * A member list's sort, kept in the page address under `<prefix>.sort` and
 * `<prefix>.dir` like History's lists, so it survives a reload. The default
 * (name, A to Z) is left out of the address.
 */
function useMemberSort(prefix: string) {
  const [params, setParams] = useSearchParams();
  const rawSort = params.get(`${prefix}.sort`) as MemberSortKey | null;
  const sort: MemberSortKey = rawSort && SORT_KEYS.includes(rawSort) ? rawSort : 'name';
  const rawDir = params.get(`${prefix}.dir`);
  const dir: Dir = rawDir === 'asc' || rawDir === 'desc' ? rawDir : defaultDir(sort);

  /** Sorts by `key`, or reverses it if it's already the sort. */
  const sortBy = (key: MemberSortKey) => {
    const nextDir = key === sort ? (dir === 'asc' ? 'desc' : 'asc') : defaultDir(key);
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (key === 'name') next.delete(`${prefix}.sort`);
        else next.set(`${prefix}.sort`, key);
        if (nextDir === defaultDir(key)) next.delete(`${prefix}.dir`);
        else next.set(`${prefix}.dir`, nextDir);
        return next;
      },
      { replace: true },
    );
  };

  return { sort, dir, sortBy };
}

/**
 * A collapsible card listing a group's members or the people who left. It
 * shows about ten rows and scrolls, fetching more as the bottom comes into
 * view. The filter button opens a box that matches names and phone numbers.
 * Column headings sort the list (by name, A to Z, to start).
 */
export function MemberListCard({
  id,
  title,
  groupId,
  status,
  defaultOpen,
  fallbackCount = 0,
  hideWhenEmpty = false,
  intro,
  empty,
  dateColumns,
}: {
  id: string;
  title: string;
  groupId: string;
  status: SubscriptionStatus;
  defaultOpen: boolean;
  /** The count to show until the list loads. */
  fallbackCount?: number;
  /** Render nothing while the list (unfiltered) is empty. */
  hideWhenEmpty?: boolean;
  intro?: React.ReactNode;
  /** Shown instead of the table when nobody is in the list. */
  empty?: React.ReactNode;
  dateColumns: {
    label: string;
    sort: MemberSortKey;
    value: (m: GroupMember) => string | undefined;
  }[];
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [q, setQ] = useState('');
  const { sort, dir, sortBy } = useMemberSort(status === 'subscribed' ? 'members' : 'left');

  useEffect(() => {
    const timer = setTimeout(() => setQ(filterText.trim()), FILTER_DELAY_MS);
    return () => clearTimeout(timer);
  }, [filterText]);

  const { data, hasNextPage, isFetchingNextPage, fetchNextPage } = useGroupMembers(
    groupId,
    status,
    q,
    sort,
    dir,
  );
  const firstPage = data?.pages[0];
  const total = firstPage?.total ?? fallbackCount;
  const matched = firstPage?.matched ?? 0;
  // Pages are fetched by offset, so a member who joins or leaves mid-scroll can show up twice.
  const rows = useMemo(() => {
    const seen = new Set<string>();
    return (data?.pages ?? [])
      .flatMap((p) => p.members)
      .filter((m) => !seen.has(m.memberId) && seen.add(m.memberId));
  }, [data]);

  const { scroller, sentinel, maxHeight } = useScrollingList({
    rowCount: rows.length,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    enabled: open,
  });

  function closeFilter() {
    setFilterOpen(false);
    setFilterText('');
    setQ('');
  }

  if (hideWhenEmpty && total === 0) return null;

  const columnCount = 2 + dateColumns.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <CollapsibleToggle
              id={id}
              title={title}
              count={total}
              open={open}
              onToggle={() => setOpen((v) => !v)}
            />
          </div>
          {total > 0 && (
            <Button
              type="button"
              variant={filterOpen ? 'secondary' : 'ghost'}
              size="icon"
              className="h-8 w-8"
              aria-label={`Filter ${title.toLowerCase()}`}
              aria-pressed={filterOpen}
              onClick={() => {
                if (filterOpen) {
                  closeFilter();
                } else {
                  setOpen(true);
                  setFilterOpen(true);
                }
              }}
            >
              <ListFilter className="h-4 w-4" />
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      {open && (
        <CardContent id={id} className="space-y-3">
          {intro}
          {filterOpen && (
            <div className="space-y-1">
              <Input
                autoFocus
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') closeFilter();
                }}
                placeholder="Filter by name or phone number"
                aria-label={`Filter ${title.toLowerCase()} by name or phone number`}
              />
              {q && firstPage && (
                <p className="text-xs text-muted-foreground" aria-live="polite">
                  {matched} of {total} match
                </p>
              )}
            </div>
          )}
          {total === 0 && empty}
          {total > 0 && q && firstPage && matched === 0 && (
            <p className="text-sm text-muted-foreground">No one matches &ldquo;{q}&rdquo;.</p>
          )}
          {total > 0 && rows.length > 0 && (
            <Table containerRef={scroller} containerStyle={{ maxHeight }}>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <SortableHead
                    label="Phone number"
                    active={sort === 'phone'}
                    dir={dir}
                    onSort={() => sortBy('phone')}
                    className={cn(STICKY_HEAD, 'whitespace-nowrap')}
                  />
                  <SortableHead
                    label="Name"
                    active={sort === 'name'}
                    dir={dir}
                    onSort={() => sortBy('name')}
                    className={STICKY_HEAD}
                  />
                  {dateColumns.map((c) => (
                    <SortableHead
                      key={c.label}
                      label={c.label}
                      active={sort === c.sort}
                      dir={dir}
                      onSort={() => sortBy(c.sort)}
                      className={STICKY_HEAD}
                    />
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((m) => (
                  <TableRow key={m.memberId} className="group">
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {formatPhoneNumber(m.phoneNumber)}
                    </TableCell>
                    <TableCell className="w-full py-1">
                      <MemberNameInput memberId={m.memberId} name={m.name} />
                    </TableCell>
                    {dateColumns.map((c) => (
                      <TableCell key={c.label} className="text-muted-foreground">
                        {formatDate(c.value(m))}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                {hasNextPage && (
                  <LoadMoreRow
                    sentinel={sentinel}
                    columns={columnCount}
                    loading={isFetchingNextPage}
                  />
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function formatDate(iso: string | undefined): string {
  return iso ? new Date(iso).toLocaleDateString() : '—';
}

/**
 * A member's name, edited in place: it looks like plain text until clicked, and
 * saves a couple of seconds after typing stops, or straight away on blur or
 * Enter. Escape puts back the saved name. Its row needs the `group` class, which
 * reveals the "Add a name" hint on hover.
 */
function MemberNameInput({ memberId, name }: { memberId: string; name?: string }) {
  const updateName = useUpdateMemberName();
  const saved = name ?? '';
  const [value, setValue] = useState(saved);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const focused = useRef(false);
  // What the server has (or is about to have), so unchanged text isn't resaved.
  const lastSaved = useRef(saved);
  const valueRef = useRef(value);
  valueRef.current = value;

  // Take a name changed elsewhere (e.g. another open dashboard), unless it's being edited here.
  useEffect(() => {
    lastSaved.current = saved;
    if (!focused.current && timer.current === undefined) setValue(saved);
  }, [saved]);

  const save = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    const next = valueRef.current.trim();
    const previous = lastSaved.current;
    if (next === previous) return;
    lastSaved.current = next;
    setStatus('saving');
    updateName.mutate(
      { id: memberId, name: next },
      {
        onSuccess: () => {
          setStatus('saved');
          setTimeout(() => setStatus((s) => (s === 'saved' ? 'idle' : s)), 2000);
        },
        onError: (err) => {
          lastSaved.current = previous;
          setStatus('idle');
          toast.error(err instanceof ApiError ? err.message : 'Failed to save name');
        },
      },
    );
  }, [memberId, updateName]);

  // Don't lose a pending edit when leaving the page.
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(
    () => () => {
      if (timer.current !== undefined) saveRef.current();
    },
    [],
  );

  return (
    <div className="flex items-center gap-2">
      <Input
        value={value}
        maxLength={80}
        placeholder="Add a name"
        aria-label="Member name"
        // The "Add a name" hint shows only while the row is hovered or the field is focused.
        className="h-8 border-transparent px-2 shadow-none placeholder:text-transparent hover:border-input focus-visible:border-input focus-visible:placeholder:text-muted-foreground group-hover:placeholder:text-muted-foreground"
        onFocus={() => {
          focused.current = true;
        }}
        onChange={(e) => {
          setValue(e.target.value);
          setStatus('idle');
          clearTimeout(timer.current);
          timer.current = setTimeout(save, NAME_SAVE_DELAY_MS);
        }}
        onBlur={() => {
          focused.current = false;
          save();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            clearTimeout(timer.current);
            timer.current = undefined;
            setValue(lastSaved.current);
            valueRef.current = lastSaved.current;
            e.currentTarget.blur();
          }
        }}
      />
      <span className="w-12 shrink-0 text-xs text-muted-foreground" aria-live="polite">
        {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : ''}
      </span>
    </div>
  );
}
