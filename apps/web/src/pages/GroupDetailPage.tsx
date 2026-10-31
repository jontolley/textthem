import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarClock, ChevronDown, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { BroadcastMessage } from '@text-them/shared';
import {
  useBroadcast,
  useDeleteGroup,
  useGroup,
  useGroupMembers,
  useMessages,
} from '@/lib/hooks';
import { ApiError } from '@/lib/api';
import { defaultSendTime, formatDateTime, toLocalInputValue } from '@/lib/datetime';
import { formatPhoneNumber } from '@/lib/phone';
import { cn } from '@/lib/utils';

const MAX_LENGTH = 1600;

export function GroupDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data: group, isLoading } = useGroup(id);
  const { data: memberLists } = useGroupMembers(id);
  const members = memberLists?.members;
  const leftGroup = memberLists?.unsubscribed ?? [];
  const { data: messages } = useMessages();
  // The API lists scheduled broadcasts soonest first.
  const scheduled = messages?.filter((m) => m.groupId === id && m.status === 'scheduled') ?? [];
  const broadcast = useBroadcast(id);
  const deleteGroup = useDeleteGroup();
  const [body, setBody] = useState('');
  const [scheduleLater, setScheduleLater] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Local wall-clock time from the datetime-local input, e.g. "2026-10-25T09:00".
  const [sendAt, setSendAt] = useState(() => toLocalInputValue(defaultSendTime()));

  async function handleBroadcast(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await broadcast.mutateAsync({
        body: body.trim(),
        // A datetime-local value without an offset parses as the browser's local time.
        sendAt: scheduleLater ? new Date(sendAt).toISOString() : undefined,
      });
      const { message } = res;
      toast.success(
        message.status === 'scheduled' && message.scheduledFor
          ? `Scheduled for ${formatDateTime(message.scheduledFor)}. You can edit or cancel it in History.`
          : `Queued ${message.acceptedCount} of ${message.recipientCount} texts. Delivery status shows in History.`,
      );
      setBody('');
      setScheduleLater(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to send broadcast');
    }
  }

  async function handleDelete() {
    try {
      await deleteGroup.mutateAsync(id);
      toast.success('Group deleted');
      navigate('/');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to delete group');
    }
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!group) return <p className="text-sm text-destructive">Group not found.</p>;

  const memberCount = members?.length ?? group.memberCount ?? 0;

  return (
    <div className="space-y-6">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to groups
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{group.name}</h1>
            {!group.active && <Badge variant="secondary">Inactive</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            Keyword <span className="font-mono font-medium">{group.keyword}</span> · {memberCount}{' '}
            subscribed
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setConfirmingDelete(true)}
          disabled={deleteGroup.isPending}
        >
          <Trash2 className="h-4 w-4" /> Delete
        </Button>
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title={`Delete "${group.name}"?`}
        description="This deletes the group and its record of who joined and left. Its members stay in their other groups. This can't be undone."
        confirmLabel="Delete group"
        pendingLabel="Deleting…"
        onConfirm={handleDelete}
      />

      <Card>
        <CardHeader>
          <CardTitle>Send a broadcast</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleBroadcast} className="space-y-3">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={MAX_LENGTH}
              placeholder={`Message to all ${memberCount} subscribed members…`}
              rows={4}
              required
            />
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={scheduleLater}
                  onChange={(e) => setScheduleLater(e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                Schedule for later
              </label>
              {scheduleLater && (
                <Input
                  type="datetime-local"
                  aria-label="Send at"
                  value={sendAt}
                  min={toLocalInputValue(new Date())}
                  onChange={(e) => setSendAt(e.target.value)}
                  className="w-auto"
                  required
                />
              )}
            </div>
            {scheduleLater && (
              <p className="text-xs text-muted-foreground">
                It goes to whoever is subscribed at that time, in your time zone. You can edit or
                cancel it from History until then.
              </p>
            )}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {body.length}/{MAX_LENGTH}
              </span>
              <Button
                type="submit"
                disabled={broadcast.isPending || (!scheduleLater && memberCount === 0)}
              >
                {scheduleLater ? <CalendarClock className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                {scheduleLater
                  ? broadcast.isPending
                    ? 'Scheduling…'
                    : 'Schedule'
                  : broadcast.isPending
                    ? 'Sending…'
                    : `Send to ${memberCount}`}
              </Button>
            </div>
          </form>
          {scheduled.length > 0 && <ScheduledList messages={scheduled} />}
        </CardContent>
      </Card>

      <CollapsibleCard id="member-list" title="Members" count={memberCount} defaultOpen>
        {memberCount === 0 ? (
          <p className="text-sm text-muted-foreground">
            No subscribers yet. Share the keyword{' '}
            <span className="font-mono font-medium">{group.keyword}</span> for people to text in.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Phone number</TableHead>
                <TableHead>Subscribed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members?.map((m) => (
                <TableRow key={m.memberId}>
                  <TableCell className="tabular-nums">{formatPhoneNumber(m.phoneNumber)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(m.subscribedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CollapsibleCard>

      {/* Shown once someone has left. Collapsed by default: it's looked at now and then. */}
      {leftGroup.length > 0 && (
        <CollapsibleCard
          id="left-group-list"
          title="Left the group"
          count={leftGroup.length}
          defaultOpen={false}
        >
          <p className="text-sm text-muted-foreground">
            People who texted STOP. STOP takes them out of every group and they get no more texts.
            To rejoin, they text START and then the group&rsquo;s keyword.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Phone number</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Left</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leftGroup.map((m) => (
                <TableRow key={m.memberId}>
                  <TableCell className="tabular-nums">{formatPhoneNumber(m.phoneNumber)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(m.subscribedAt)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(m.unsubscribedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CollapsibleCard>
      )}
    </div>
  );
}

function formatDate(iso: string | undefined): string {
  return iso ? new Date(iso).toLocaleDateString() : '—';
}

/** This group's broadcasts waiting to go out, under the send form. */
function ScheduledList({ messages }: { messages: BroadcastMessage[] }) {
  const [open, setOpen] = useState(true);

  return (
    <div className="mt-6 space-y-3 border-t pt-4">
      <h3 className="text-sm font-semibold">
        <CollapsibleToggle
          id="scheduled-list"
          title="Scheduled"
          count={messages.length}
          open={open}
          onToggle={() => setOpen((v) => !v)}
        />
      </h3>
      {open && (
        <div id="scheduled-list" className="space-y-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sends</TableHead>
                <TableHead>Message</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {messages.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap font-medium">
                    {m.scheduledFor && formatDateTime(m.scheduledFor)}
                  </TableCell>
                  {/* Fills the space left and ends in "…" rather than widening the table. */}
                  <TableCell className="w-full max-w-0 truncate">{m.body}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-xs text-muted-foreground">
            Edit or cancel them in{' '}
            <Link to="/history" className="text-link underline-offset-4 hover:underline">
              History
            </Link>
            .
          </p>
        </div>
      )}
    </div>
  );
}

/** A section title that folds its contents away when clicked, with a count beside it. */
function CollapsibleToggle({
  id,
  title,
  count,
  open,
  onToggle,
}: {
  id: string;
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={id}
      className="-m-1 flex w-full items-center gap-2 rounded-md p-1 text-left hover:text-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ChevronDown
        className={cn('h-4 w-4 shrink-0 transition-transform', !open && '-rotate-90')}
        aria-hidden
      />
      {title}
      <Badge variant="secondary" className="font-medium tabular-nums">
        {count}
      </Badge>
    </button>
  );
}

/** A card whose contents fold away behind its title, which shows a count. */
function CollapsibleCard({
  id,
  title,
  count,
  defaultOpen,
  children,
}: {
  id: string;
  title: string;
  count: number;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <CollapsibleToggle
            id={id}
            title={title}
            count={count}
            open={open}
            onToggle={() => setOpen((v) => !v)}
          />
        </CardTitle>
      </CardHeader>
      {open && (
        <CardContent id={id} className="space-y-3">
          {children}
        </CardContent>
      )}
    </Card>
  );
}
