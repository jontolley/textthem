import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Group, InboundMessage } from '@text-them/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { formatDateTime } from '@/lib/datetime';
import { useGroups, useInboundMessages } from '@/lib/hooks';
import { formatPhoneNumber } from '@/lib/phone';
import { cn } from '@/lib/utils';

type View = 'replies' | 'all';

/** What a keyword text did; plain messages (`unknown`) get no label. */
function actionLabel(m: InboundMessage): string | null {
  switch (m.action) {
    case 'join':
      return `Joined ${m.matchedKeyword ?? 'a group'}`;
    case 'stop':
      return 'Opted out';
    case 'start':
      return 'Opted back in';
    case 'help':
      return 'Asked for help';
    default:
      return null;
  }
}

function ViewToggle({ view, onChange }: { view: View; onChange: (view: View) => void }) {
  const option = (value: View, label: string) => (
    <button
      type="button"
      onClick={() => onChange(value)}
      aria-pressed={view === value}
      className={cn(
        'rounded px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        view === value
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
    </button>
  );
  return (
    <div className="inline-flex gap-1 rounded-md bg-muted p-1">
      {option('replies', 'Replies')}
      {option('all', 'All texts')}
    </div>
  );
}

/** The groups a sender is in now, linked, or a note that they're in none. */
function SenderGroups({ groups }: { groups: Group[] }) {
  if (groups.length === 0) return <span>Not in a group</span>;
  return (
    <>
      {groups.map((g, i) => (
        <span key={g.id}>
          {i > 0 && ', '}
          <Link to={`/groups/${g.id}`} className="hover:text-link hover:underline">
            {g.name}
          </Link>
        </span>
      ))}
    </>
  );
}

export function RepliesPage() {
  const { data: messages, isLoading } = useInboundMessages();
  const { data: groups } = useGroups();
  const [view, setView] = useState<View>('replies');

  const shown = view === 'replies' ? messages?.filter((m) => m.action === 'unknown') : messages;
  const groupsOf = (m: InboundMessage) =>
    m.groupIds.flatMap((id) => groups?.filter((g) => g.id === id) ?? []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Replies</h1>
          <p className="text-sm text-muted-foreground">
            {view === 'replies'
              ? 'Texts people sent your number that weren’t a keyword. Nobody is notified when one arrives.'
              : 'Every text your number received, including keywords, STOP, and HELP.'}
          </p>
        </div>
        <ViewToggle view={view} onChange={setView} />
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {shown && shown.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {view === 'replies' ? 'No replies yet.' : 'No texts received yet.'}
          </CardContent>
        </Card>
      )}

      {shown && shown.length > 0 && (
        <Card>
          <CardContent className="py-2">
            <ul className="divide-y">
              {shown.map((m) => {
                const label = actionLabel(m);
                return (
                  <li key={m.id} className="space-y-1 py-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <div className="text-sm">
                        {/* A named sender leads with the name; the number steps back to gray. */}
                        {m.fromName ? (
                          <>
                            <span className="font-medium">{m.fromName}</span>{' '}
                            <span className="tabular-nums text-muted-foreground">
                              {formatPhoneNumber(m.fromNumber)}
                            </span>
                          </>
                        ) : (
                          <span className="font-medium tabular-nums">
                            {formatPhoneNumber(m.fromNumber)}
                          </span>
                        )}
                        <span className="text-muted-foreground">
                          {' · '}
                          <SenderGroups groups={groupsOf(m)} />
                        </span>
                      </div>
                      <time dateTime={m.receivedAt} className="text-xs text-muted-foreground">
                        {formatDateTime(m.receivedAt)}
                      </time>
                    </div>
                    <div className="whitespace-pre-wrap break-words">
                      {m.body}
                      {label && (
                        <Badge variant="secondary" className="ml-2 align-middle font-medium">
                          {label}
                        </Badge>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
