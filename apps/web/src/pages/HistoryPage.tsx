import { Link } from 'react-router-dom';
import { BroadcastListCard, OutcomeSummary, useGroupName } from '@/components/BroadcastList';
import { Card, CardContent } from '@/components/ui/card';
import { useMessageList } from '@/lib/hooks';

export function HistoryPage() {
  // The card fetches its own list; this (shared through the query cache) decides the page's state.
  const past = useMessageList('history');
  const groupName = useGroupName();
  const pastTotal = past.data?.pages[0]?.total;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Message history</h1>
        <p className="text-sm text-muted-foreground">
          Messages you&apos;ve sent to your groups. Scheduled ones wait on the{' '}
          <Link to="/message" className="text-link underline-offset-4 hover:underline">
            Message
          </Link>{' '}
          page until they go.
        </p>
      </div>

      {past.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {pastTotal === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No messages sent yet.
          </CardContent>
        </Card>
      )}

      <BroadcastListCard
        id="history-list"
        title="History"
        list="history"
        fill
        whenLabel="Sent"
        lastLabel="Delivery"
        groupName={groupName}
        renderLast={(m) => <OutcomeSummary message={m} />}
      />
    </div>
  );
}
