import { Fragment, useMemo, useState } from 'react';
import { Check, ChevronRight, Copy, Image as ImageIcon, ListFilter, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import type { BroadcastMessage } from '@text-them/shared';
import { BroadcastFilterBar, SortableHead, useListView } from '@/components/BroadcastListControls';
import { CollapsibleToggle } from '@/components/CollapsibleToggle';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ImageAttachments } from '@/components/ImageAttachments';
import { LoadMoreRow, STICKY_HEAD, useScrollingList } from '@/components/ScrollingList';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api';
import { formatDateTime, formatShortDateTime, toLocalInputValue } from '@/lib/datetime';
import { cn } from '@/lib/utils';
import {
  useCancelScheduledBroadcast,
  useGroups,
  useMe,
  useMessageList,
  useUpdateScheduledBroadcast,
} from '@/lib/hooks';

/** Looks up a group's name by id, for the broadcast lists' Group column. */
export function useGroupName() {
  const { data: groups } = useGroups();
  return (id: string) => groups?.find((g) => g.id === id)?.name ?? 'Unknown group';
}

/** Delivered vs. undelivered as reported by Twilio's status callbacks. */
function DeliverySummary({ message: m }: { message: BroadcastMessage }) {
  const failedToSend = m.failedCount > 0 && (
    <div className="text-xs text-destructive">{m.failedCount} failed to send</div>
  );

  // Sent before delivery tracking: all we know is what Twilio accepted.
  if (!m.delivery) {
    return (
      <>
        <div>
          {m.acceptedCount}/{m.recipientCount} accepted
        </div>
        <div className="text-xs text-muted-foreground">Delivery not tracked</div>
        {failedToSend}
      </>
    );
  }

  const { delivered, undelivered, pending, topErrorCode } = m.delivery;
  return (
    <>
      <div>
        {delivered}/{m.recipientCount} delivered
      </div>
      {undelivered > 0 && (
        <div className="text-xs text-destructive">
          {undelivered} undelivered
          {topErrorCode && (
            <>
              {' · '}
              <a
                href={`https://www.twilio.com/docs/api/errors/${topErrorCode}`}
                target="_blank"
                rel="noreferrer"
                title="Most common Twilio error code"
                className="underline underline-offset-2"
              >
                error {topErrorCode}
              </a>
            </>
          )}
        </div>
      )}
      {pending > 0 && <div className="text-xs text-muted-foreground">{pending} pending</div>}
      {failedToSend}
    </>
  );
}

/** Outcome column: delivery stats once sent, otherwise where the broadcast stands. */
export function OutcomeSummary({ message: m }: { message: BroadcastMessage }) {
  switch (m.status) {
    case 'sent':
      return <DeliverySummary message={m} />;
    case 'sending':
      return <div className="text-muted-foreground">Sending…</div>;
    case 'canceled':
      return <div className="text-muted-foreground">Canceled</div>;
    case 'missed':
      return (
        <>
          <div className="text-destructive">Missed</div>
          <div className="text-xs text-muted-foreground">
            Server was down at send time; not sent
          </div>
        </>
      );
    case 'interrupted':
      return (
        <>
          <div className="text-destructive">Interrupted</div>
          <div className="text-xs text-muted-foreground">Some members may not have gotten it</div>
        </>
      );
    default:
      return null;
  }
}

function EditScheduledDialog({
  message,
  onOpenChange,
}: {
  message: BroadcastMessage;
  onOpenChange: (open: boolean) => void;
}) {
  const update = useUpdateScheduledBroadcast();
  const { data: me } = useMe();
  const [body, setBody] = useState(message.body);
  const [mediaUrls, setMediaUrls] = useState(message.mediaUrls ?? []);
  const [uploading, setUploading] = useState(false);
  const [sendAt, setSendAt] = useState(() =>
    toLocalInputValue(new Date(message.scheduledFor ?? Date.now())),
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await update.mutateAsync({
        id: message.id,
        body: {
          body: body.trim(),
          // Only when they changed; empty removes them all.
          ...(mediaUrls.join() !== (message.mediaUrls ?? []).join() ? { mediaUrls } : {}),
          sendAt: new Date(sendAt).toISOString(),
        },
      });
      toast.success('Scheduled message updated');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update message');
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit scheduled message</DialogTitle>
            <DialogDescription>
              It goes to whoever is subscribed at the send time, in your time zone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-body">Message</Label>
              <Textarea
                id="edit-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={1600}
                rows={4}
                required={!mediaUrls.length}
              />
            </div>
            {/* Images it already has stay removable even if new uploads are off. */}
            {(me?.canAttachImages || mediaUrls.length > 0) && (
              <ImageAttachments
                value={mediaUrls}
                onChange={setMediaUrls}
                onUploadingChange={setUploading}
              />
            )}
            <div className="space-y-2">
              <Label htmlFor="edit-send-at">Send at</Label>
              <Input
                id="edit-send-at"
                type="datetime-local"
                value={sendAt}
                min={toLocalInputValue(new Date())}
                onChange={(e) => setSendAt(e.target.value)}
                className="w-auto"
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={update.isPending || uploading}>
              {update.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Flattens a paged list, dropping repeats (offset pages can overlap as broadcasts come and go). */
function useRows(pages: { messages: BroadcastMessage[] }[] | undefined) {
  return useMemo(() => {
    const seen = new Set<string>();
    return (pages ?? [])
      .flatMap((p) => p.messages)
      .filter((m) => !seen.has(m.id) && seen.add(m.id));
  }, [pages]);
}

/**
 * Column widths shared by the Scheduled and History tables, so their first
 * four columns line up. The message column takes what's left. Phones show
 * only the date (with a one-line preview under it) and the group.
 */
const COLUMNS = {
  // On phones it takes all the room the group leaves (the load-more row's span
  // would otherwise share it out to the hidden columns).
  when: 'w-full md:w-64',
  group: 'w-28 md:w-40',
  // On phones only the date and group show; the rest moves to the opened row's details.
  sentBy: 'hidden w-36 md:table-cell',
  message: 'hidden md:table-cell',
  last: 'hidden w-64 text-right md:table-cell',
};

/**
 * One of a list's broadcasts, as a table and its paging: five rows show, the
 * rest scroll. The card folds away behind its title, which shows the full count.
 * The date and group headings sort it; the filter button opens search, group,
 * sender and date filters. Both are kept in the page address.
 */
export function BroadcastListCard({
  id,
  title,
  list,
  defaultOpen,
  whenLabel,
  lastLabel,
  groupName,
  renderLast,
  fill = false,
}: {
  id: string;
  title: string;
  list: 'scheduled' | 'history';
  /** Ignored with `fill`, which is always open. */
  defaultOpen?: boolean;
  whenLabel: string;
  lastLabel: string;
  groupName: (id: string) => string;
  /** The last column: actions for scheduled broadcasts, delivery for the rest. */
  renderLast: (m: BroadcastMessage) => React.ReactNode;
  /**
   * The page's only list: it can't fold away, and it fills the window down to
   * its bottom, loading more as it scrolls.
   */
  fill?: boolean;
}) {
  const [openState, setOpen] = useState(defaultOpen ?? false);
  const open = fill || openState;
  const listView = useListView(list, list === 'scheduled' ? 'asc' : 'desc');
  const [filterOpen, setFilterOpen] = useState(listView.filtering);
  const { data, hasNextPage, isFetchingNextPage, fetchNextPage } = useMessageList(
    list,
    listView.view,
  );
  const messages = useRows(data?.pages);
  const firstPage = data?.pages[0];
  const total = firstPage?.total ?? 0;
  const matched = firstPage?.matched ?? 0;
  const { scroller, sentinel, maxHeight } = useScrollingList({
    rowCount: messages.length,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    enabled: open,
    visibleRows: 5,
    fill,
  });
  // Rows opened to show their whole message.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const toggle = (messageId: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(messageId)) next.add(messageId);
      return next;
    });

  if (total === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            {fill ? (
              <span className="flex items-center gap-2">
                {title}
                <Badge variant="secondary" className="font-medium tabular-nums">
                  {total}
                </Badge>
              </span>
            ) : (
              <CollapsibleToggle
                id={id}
                title={title}
                count={total}
                open={open}
                onToggle={() => setOpen((v) => !v)}
              />
            )}
          </div>
          <Button
            type="button"
            variant={filterOpen ? 'secondary' : 'ghost'}
            size="icon"
            className="h-8 w-8"
            aria-label={`Filter ${title.toLowerCase()}`}
            aria-pressed={filterOpen}
            onClick={() => {
              if (filterOpen) {
                listView.clearFilters();
                setFilterOpen(false);
              } else {
                setOpen(true);
                setFilterOpen(true);
              }
            }}
          >
            <ListFilter className="h-4 w-4" />
          </Button>
        </CardTitle>
      </CardHeader>
      {open && (
        <CardContent id={id} className="space-y-3">
          {filterOpen && (
            <div className="space-y-1">
              <BroadcastFilterBar
                label={title.toLowerCase()}
                values={listView.values}
                set={listView.set}
                onClear={listView.clearFilters}
              />
              {listView.filtering && firstPage && (
                <p className="text-xs text-muted-foreground" aria-live="polite">
                  {matched} of {total} match
                </p>
              )}
            </div>
          )}
          {firstPage && matched === 0 && (
            <p className="text-sm text-muted-foreground">No messages match these filters.</p>
          )}
          {messages.length > 0 && (
            <Table className="table-fixed" containerRef={scroller} containerStyle={{ maxHeight }}>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <SortableHead
                    label={whenLabel}
                    active={listView.sort === 'when'}
                    dir={listView.dir}
                    onSort={() => listView.sortBy('when')}
                    className={cn(STICKY_HEAD, COLUMNS.when)}
                  />
                  <SortableHead
                    label="Group"
                    active={listView.sort === 'group'}
                    dir={listView.dir}
                    onSort={() => listView.sortBy('group')}
                    className={cn(STICKY_HEAD, COLUMNS.group)}
                  />
                  <TableHead className={cn(STICKY_HEAD, COLUMNS.sentBy)}>Sent by</TableHead>
                  <TableHead className={cn(STICKY_HEAD, COLUMNS.message)}>Message</TableHead>
                  <TableHead className={cn(STICKY_HEAD, COLUMNS.last)}>{lastLabel}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {messages.map((m) => {
                  // Scheduled ones show when they'll go; unsent ones (canceled, missed) when they were due.
                  const when = list === 'scheduled' ? m.scheduledFor : (m.sentAt ?? m.scheduledFor);
                  const rowOpen = expanded.has(m.id);
                  return (
                    <Fragment key={m.id}>
                      {/* Click (or Enter/Space) shows the whole message; again folds it back. */}
                      <TableRow
                        tabIndex={0}
                        aria-expanded={rowOpen}
                        // Cells stay vertically centered when it opens, so a short message doesn't shift.
                        // On phones its details row follows, so the line between them goes.
                        className={cn(
                          'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                          rowOpen && 'border-b-0 md:border-b',
                        )}
                        onClick={(e) => {
                          // Links and buttons in the row (Twilio errors, Edit, Cancel, Copy) do their own thing.
                          if ((e.target as HTMLElement).closest('a, button')) return;
                          // Letting go after selecting text isn't a click to fold the row.
                          if (window.getSelection()?.toString()) return;
                          toggle(m.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.target !== e.currentTarget) return;
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggle(m.id);
                          }
                        }}
                      >
                        <TableCell className="overflow-hidden text-muted-foreground">
                          <div className="truncate">
                            <ChevronRight
                              className={cn(
                                'mr-1 inline h-4 w-4 align-[-3px] transition-transform',
                                rowOpen && 'rotate-90',
                              )}
                              aria-hidden
                            />
                            {when ? (
                              <>
                                <span className="hidden md:inline">{formatDateTime(when)}</span>
                                {/* Phones: short enough to fit beside the group. */}
                                <span className="md:hidden">{formatShortDateTime(when)}</span>
                              </>
                            ) : (
                              '—'
                            )}
                          </div>
                          {!rowOpen && (
                            <div className="mt-1 truncate pl-5 text-foreground md:hidden">
                              <MessagePreview message={m} />
                            </div>
                          )}
                        </TableCell>
                        <TableCell>{groupName(m.groupId)}</TableCell>
                        <TableCell className={cn('truncate', COLUMNS.sentBy)}>
                          {m.sentByName ?? '—'}
                        </TableCell>
                        <TableCell
                          className={cn(
                            COLUMNS.message,
                            rowOpen ? 'cursor-text whitespace-pre-wrap break-words' : 'truncate',
                          )}
                        >
                          {rowOpen ? <MessageBody message={m} /> : <MessagePreview message={m} />}
                        </TableCell>
                        <TableCell className={cn('whitespace-nowrap', COLUMNS.last)}>
                          {renderLast(m)}
                        </TableCell>
                      </TableRow>
                      {/* Phones: the opened row's message and details, full width under it. */}
                      {rowOpen && (
                        <TableRow data-detail className="hover:bg-transparent md:hidden">
                          <TableCell colSpan={2} className="pt-0">
                            <div className="space-y-3 pl-5">
                              <div className="whitespace-pre-wrap break-words">
                                <MessageBody message={m} />
                              </div>
                              <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-4 gap-y-2">
                                <dt className="text-muted-foreground">Sent by</dt>
                                <dd>{m.sentByName ?? '—'}</dd>
                                <dt className="text-muted-foreground">{lastLabel}</dt>
                                <dd>{renderLast(m)}</dd>
                              </dl>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
                {hasNextPage && (
                  <LoadMoreRow sentinel={sentinel} columns={5} loading={isFetchingNextPage} />
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      )}
    </Card>
  );
}

/** Broadcasts still to go out, soonest first, each with Edit and Cancel. */
export function ScheduledCard({ groupName }: { groupName: (id: string) => string }) {
  const cancel = useCancelScheduledBroadcast();
  const [editing, setEditing] = useState<BroadcastMessage | null>(null);
  const [canceling, setCanceling] = useState<BroadcastMessage | null>(null);

  async function handleCancel(m: BroadcastMessage) {
    try {
      await cancel.mutateAsync(m.id);
      toast.success('Scheduled message canceled');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to cancel message');
    }
  }

  return (
    <>
      <BroadcastListCard
        id="scheduled-list"
        title="Scheduled"
        list="scheduled"
        // Folded by default: its count says what's waiting, and the send form stays the focus.
        defaultOpen={false}
        whenLabel="Sends"
        lastLabel="Actions"
        groupName={groupName}
        renderLast={(m) => (
          <>
            <Button variant="ghost" size="sm" onClick={() => setEditing(m)}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCanceling(m)}
              disabled={cancel.isPending}
            >
              <X className="h-4 w-4" /> Cancel
            </Button>
          </>
        )}
      />
      {editing && (
        <EditScheduledDialog
          key={editing.id}
          message={editing}
          onOpenChange={(open) => !open && setEditing(null)}
        />
      )}
      {canceling && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setCanceling(null)}
          title="Cancel this scheduled message?"
          description={`It won't be sent to ${groupName(canceling.groupId)}${
            canceling.scheduledFor ? ` on ${formatDateTime(canceling.scheduledFor)}` : ''
          }. This can't be undone.`}
          confirmLabel="Cancel message"
          pendingLabel="Canceling…"
          cancelLabel="Keep it"
          onConfirm={() => handleCancel(canceling)}
        />
      )}
    </>
  );
}

/** A message on one line: an image icon when it has images, and its text (or "Image" alone). */
function MessagePreview({ message: m }: { message: BroadcastMessage }) {
  const images = m.mediaUrls?.length ?? 0;
  return (
    <>
      {images > 0 && (
        <ImageIcon
          className="mr-1.5 inline h-4 w-4 align-[-3px] text-muted-foreground"
          aria-label={images === 1 ? 'Has an image' : `Has ${images} images`}
        />
      )}
      {m.body || (
        <span className="text-muted-foreground">{images === 1 ? 'Image' : `${images} images`}</span>
      )}
    </>
  );
}

/** An opened message: its whole text with a Copy button, then its images. */
function MessageBody({ message: m }: { message: BroadcastMessage }) {
  const images = m.mediaUrls ?? [];
  return (
    <>
      {m.body}
      {m.body && <CopyButton text={m.body} />}
      {images.length > 0 && (
        <div className={cn('flex flex-wrap gap-2 whitespace-normal', m.body && 'mt-2')}>
          {images.map((url, i) => (
            <a key={url} href={url} target="_blank" rel="noreferrer">
              <img
                src={url}
                alt={`Image ${i + 1} sent with this message`}
                loading="lazy"
                className="max-h-48 max-w-full rounded-md border object-contain"
              />
            </a>
          ))}
        </div>
      )}
    </>
  );
}

/** Copies an opened message's text, so it needn't be selected by hand. */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy the message");
    }
  }

  return (
    <div className="mt-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 gap-1.5 px-2 text-xs"
        onClick={copy}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? 'Copied' : 'Copy text'}
      </Button>
    </div>
  );
}
