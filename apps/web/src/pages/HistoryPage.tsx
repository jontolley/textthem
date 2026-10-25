import { useState } from 'react';
import { CalendarClock, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import type { BroadcastMessage } from '@text-them/shared';
import { ConfirmDialog } from '@/components/ConfirmDialog';
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
import { formatDateTime, toLocalInputValue } from '@/lib/datetime';
import {
  useCancelScheduledBroadcast,
  useGroups,
  useMessages,
  useUpdateScheduledBroadcast,
} from '@/lib/hooks';

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
function OutcomeSummary({ message: m }: { message: BroadcastMessage }) {
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
          <div className="text-xs text-muted-foreground">Server was down at send time; not sent</div>
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
  const [body, setBody] = useState(message.body);
  const [sendAt, setSendAt] = useState(() =>
    toLocalInputValue(new Date(message.scheduledFor ?? Date.now())),
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await update.mutateAsync({
        id: message.id,
        body: { body: body.trim(), sendAt: new Date(sendAt).toISOString() },
      });
      toast.success('Scheduled broadcast updated');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update broadcast');
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit scheduled broadcast</DialogTitle>
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
                required
              />
            </div>
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
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ScheduledCard({
  messages,
  groupName,
}: {
  messages: BroadcastMessage[];
  groupName: (id: string) => string;
}) {
  const cancel = useCancelScheduledBroadcast();
  const [editing, setEditing] = useState<BroadcastMessage | null>(null);
  const [canceling, setCanceling] = useState<BroadcastMessage | null>(null);

  async function handleCancel(m: BroadcastMessage) {
    try {
      await cancel.mutateAsync(m.id);
      toast.success('Scheduled broadcast canceled');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to cancel broadcast');
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5" /> Scheduled
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sends</TableHead>
              <TableHead>Group</TableHead>
              <TableHead>Message</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {messages.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="whitespace-nowrap font-medium">
                  {m.scheduledFor && formatDateTime(m.scheduledFor)}
                </TableCell>
                <TableCell>{groupName(m.groupId)}</TableCell>
                <TableCell className="max-w-md truncate">{m.body}</TableCell>
                <TableCell className="whitespace-nowrap text-right">
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
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
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
          title="Cancel this scheduled broadcast?"
          description={`It won't be sent to ${groupName(canceling.groupId)}${
            canceling.scheduledFor ? ` on ${formatDateTime(canceling.scheduledFor)}` : ''
          }. This can't be undone.`}
          confirmLabel="Cancel broadcast"
          pendingLabel="Canceling…"
          cancelLabel="Keep it"
          onConfirm={() => handleCancel(canceling)}
        />
      )}
    </Card>
  );
}

export function HistoryPage() {
  const { data: messages, isLoading } = useMessages();
  const { data: groups } = useGroups();
  const groupName = (id: string) => groups?.find((g) => g.id === id)?.name ?? 'Unknown group';

  const upcoming = messages?.filter((m) => m.status === 'scheduled') ?? [];
  const past = messages?.filter((m) => m.status !== 'scheduled') ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Broadcast history</h1>
        <p className="text-sm text-muted-foreground">
          Messages you&apos;ve sent or scheduled for your groups.
        </p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {messages && messages.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No broadcasts sent yet.
          </CardContent>
        </Card>
      )}

      {upcoming.length > 0 && <ScheduledCard messages={upcoming} groupName={groupName} />}

      {past.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sent</TableHead>
                  <TableHead>Group</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead className="text-right">Delivery</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {past.map((m) => {
                  // Unsent broadcasts (canceled, missed) show when they were due.
                  const when = m.sentAt ?? m.scheduledFor;
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {when ? formatDateTime(when) : '—'}
                      </TableCell>
                      <TableCell>{groupName(m.groupId)}</TableCell>
                      <TableCell className="max-w-md truncate">{m.body}</TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        <OutcomeSummary message={m} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
