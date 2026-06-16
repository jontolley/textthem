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
                  <TableHead className="text-right">Delivered</TableHead>
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
                    <TableCell className="text-right">
                      {m.acceptedCount}/{m.recipientCount}
                      {m.failedCount > 0 && (
                        <span className="text-destructive"> ({m.failedCount} failed)</span>
                      )}
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
