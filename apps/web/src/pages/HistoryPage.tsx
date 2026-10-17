import type { BroadcastMessage } from '@text-them/shared';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useGroups, useMessages } from '@/lib/hooks';

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

export function HistoryPage() {
  const { data: messages, isLoading } = useMessages();
  const { data: groups } = useGroups();
  const groupName = (id: string) => groups?.find((g) => g.id === id)?.name ?? 'Unknown group';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Broadcast history</h1>
        <p className="text-sm text-muted-foreground">Messages you&apos;ve sent to your groups.</p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {messages && messages.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No broadcasts sent yet.
          </CardContent>
        </Card>
      )}

      {messages && messages.length > 0 && (
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
                {messages.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {new Date(m.sentAt).toLocaleString()}
                    </TableCell>
                    <TableCell>{groupName(m.groupId)}</TableCell>
                    <TableCell className="max-w-md truncate">{m.body}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      <DeliverySummary message={m} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
