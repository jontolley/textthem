import { RefreshCw } from 'lucide-react';
import type { VersionInfo } from '@text-them/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ORGS, groupJoinPath } from '@/config/org';
import { formatDateTime } from '@/lib/datetime';
import { useApiVersion } from '@/lib/hooks';
import { WEB_VERSION, commitUrl, shortCommit } from '@/lib/version';

const ERROR_CODES: [code: string, meaning: string][] = [
  ['30003', 'Phone is off or out of coverage.'],
  ['30005', "Number doesn't exist or is no longer active."],
  ['30006', "Landline, or a carrier that can't receive texts."],
  ['30007', 'Carrier filtered the message as spam.'],
  ['30008', 'Unknown carrier error.'],
  [
    '30034',
    'Sender not registered for business texting (A2P 10DLC). Should no longer happen now that the campaign is approved.',
  ],
];

/** One build's commit (linked) and build time, or why there isn't one. */
function BuildLine({ info, unstamped }: { info: VersionInfo; unstamped: string }) {
  if (!info.commit) return <span className="text-muted-foreground">{unstamped}</span>;
  return (
    <span>
      <a
        href={commitUrl(info.commit)}
        target="_blank"
        rel="noreferrer"
        className="font-mono underline underline-offset-2"
      >
        {shortCommit(info.commit)}
      </a>
      {info.builtAt && (
        <span className="text-muted-foreground"> · built {formatDateTime(info.builtAt)}</span>
      )}
    </span>
  );
}

function VersionsCard() {
  const { data: api, isLoading, isError, refetch, isFetching } = useApiVersion();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Versions</CardTitle>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className="h-4 w-4" /> Check again
        </Button>
      </CardHeader>
      <CardContent className="text-sm">
        {/* They often differ: the API only redeploys when its own code changes. */}
        <div className="grid grid-cols-[6rem_1fr] gap-y-2">
          <span className="font-medium">Dashboard</span>
          <BuildLine info={WEB_VERSION} unstamped="Development server (not a build)" />
          <span className="font-medium">API</span>
          {isLoading ? (
            <span className="text-muted-foreground">Checking…</span>
          ) : isError || !api ? (
            <span className="text-destructive">Couldn&apos;t reach the API</span>
          ) : (
            <BuildLine info={api} unstamped="Local build (not stamped with a commit)" />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground [&_a]:text-primary [&_a]:underline [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
        {children}
      </CardContent>
    </Card>
  );
}

export function HelpPage() {
  const origin = window.location.origin;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Help</h1>
        <p className="text-sm text-muted-foreground">
          What&apos;s running, and a quick reference for running your groups.
        </p>
      </div>

      <VersionsCard />

      <Section title="How people join">
        <p>
          People join a group by texting its keyword from their own phone. There&apos;s no way to
          add numbers for them. Share a group&apos;s Join page link or its QR code:
        </p>
        {ORGS.map((org) => (
          <ul key={org.slug}>
            {org.groups.map((group) => {
              const url = `${origin}${groupJoinPath(org, group)}`;
              return (
                <li key={group.keyword}>
                  <strong>{group.name}</strong> (<span className="font-mono">{group.keyword}</span>
                  ):{' '}
                  <a href={url} target="_blank" rel="noreferrer">
                    {url}
                  </a>
                </li>
              );
            })}
          </ul>
        ))}
        <p>
          New groups also need an entry in the org config (<span className="font-mono">
            apps/web/src/config/org.ts
          </span>
          ) to get a Join page.
        </p>
      </Section>

      <Section title="Stopping and rejoining">
        <ul>
          <li>
            <strong>STOP</strong> (or UNSUBSCRIBE, QUIT, and similar) removes the person from every
            group, and Twilio then blocks all texts to them.
          </li>
          <li>
            To come back, they text <strong>START</strong> (or UNSTOP) to lift Twilio&apos;s block,
            then a group keyword to rejoin. The reply to START tells them this.
          </li>
          <li>
            <strong>HELP</strong> replies with how to join, how to stop, and the support email.
          </li>
        </ul>
      </Section>

      <Section title="Scheduled broadcasts">
        <ul>
          <li>Times are in your time zone. It sends within about 30 seconds of the time you set.</li>
          <li>It goes to whoever is subscribed at send time, not when you scheduled it.</li>
          <li>You can edit or cancel it in History until it sends.</li>
          <li>
            <strong>Missed</strong>: the server was down for over an hour past the send time, so it
            wasn&apos;t sent late. Send it again if it still matters.
          </li>
          <li>
            <strong>Interrupted</strong>: sending stopped partway (e.g. a restart). Some members may
            have gotten it, so it isn&apos;t retried automatically.
          </li>
        </ul>
      </Section>

      <Section title="Delivery results in History">
        <ul>
          <li>
            <strong>Delivered</strong>: the carrier confirmed it reached the phone.
          </li>
          <li>
            <strong>Undelivered</strong>: Twilio accepted it but the carrier didn&apos;t deliver it.
            History shows the most common error code; see below.
          </li>
          <li>
            <strong>Pending</strong>: no final status yet. Usually clears within seconds.
          </li>
          <li>
            <strong>Failed to send</strong>: Twilio refused it outright, most often because that
            person texted STOP.
          </li>
        </ul>
        <table className="w-full text-left">
          <tbody>
            {ERROR_CODES.map(([code, meaning]) => (
              <tr key={code} className="border-t align-top">
                <td className="py-1.5 pr-4 font-mono">
                  <a
                    href={`https://www.twilio.com/docs/api/errors/${code}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {code}
                  </a>
                </td>
                <td className="py-1.5">{meaning}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}
