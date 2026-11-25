import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarClock, Send } from 'lucide-react';
import { toast } from 'sonner';
import { ScheduledCard, useGroupName } from '@/components/BroadcastList';
import { Select } from '@/components/BroadcastListControls';
import { ImageAttachments } from '@/components/ImageAttachments';
import { TextPreview } from '@/components/TextPreview';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api';
import { defaultSendTime, formatDateTime, toLocalInputValue } from '@/lib/datetime';
import { useBroadcast, useGroups, useMe } from '@/lib/hooks';

const MAX_LENGTH = 1600;

/** Compose a broadcast to one group, and manage the ones scheduled to go out. */
export function MessagePage() {
  const groupName = useGroupName();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Message</h1>
        <p className="text-sm text-muted-foreground">
          Send a message to a group now, or schedule it for later.
        </p>
      </div>
      <SendBroadcastCard />
      <ScheduledCard groupName={groupName} />
    </div>
  );
}

function SendBroadcastCard() {
  const { data: groups, isLoading } = useGroups();
  const { data: me } = useMe();
  const broadcast = useBroadcast();
  // A group page's "Send a message" link picks its group with ?group=<id>.
  const [searchParams, setSearchParams] = useSearchParams();
  const groupId = searchParams.get('group') ?? '';
  const group = groups?.find((g) => g.id === groupId);
  const [body, setBody] = useState('');
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [scheduleLater, setScheduleLater] = useState(false);
  // Local wall-clock time from the datetime-local input, e.g. "2026-10-25T09:00".
  const [sendAt, setSendAt] = useState(() => toLocalInputValue(defaultSendTime()));

  const memberCount = group?.memberCount ?? 0;

  function selectGroup(id: string) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set('group', id);
        else next.delete('group');
        return next;
      },
      { replace: true },
    );
  }

  async function handleBroadcast(e: React.FormEvent) {
    e.preventDefault();
    if (!group) return;
    try {
      const { message } = await broadcast.mutateAsync({
        groupId: group.id,
        body: {
          body: body.trim(),
          mediaUrls,
          // A datetime-local value without an offset parses as the browser's local time.
          sendAt: scheduleLater ? new Date(sendAt).toISOString() : undefined,
        },
      });
      toast.success(
        message.status === 'scheduled' && message.scheduledFor
          ? `Scheduled for ${formatDateTime(message.scheduledFor)}. You can edit or cancel it below.`
          : `Queued ${message.acceptedCount} of ${message.recipientCount} texts. Delivery status shows in History.`,
      );
      setBody('');
      setMediaUrls([]);
      setScheduleLater(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to send message');
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Send a message</CardTitle>
      </CardHeader>
      <CardContent>
        {/* The preview sits beside the form on wide screens and under it on phones. */}
        <form
          onSubmit={handleBroadcast}
          className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_22rem] lg:grid-cols-[minmax(0,1fr)_26rem]"
        >
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <Label htmlFor="broadcast-group">Group</Label>
              <Select
                id="broadcast-group"
                value={group ? group.id : ''}
                onChange={(e) => selectGroup(e.target.value)}
                required
                disabled={isLoading}
              >
                <option value="" disabled>
                  {isLoading ? 'Loading groups…' : 'Choose a group'}
                </option>
                {groups?.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.memberCount ?? 0} subscribed)
                  </option>
                ))}
              </Select>
              {groups && groups.length === 0 && (
                <p className="w-full text-xs text-muted-foreground">
                  No groups yet. Create one on the Groups page first.
                </p>
              )}
            </div>
            <Textarea
              aria-label="Message"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={MAX_LENGTH}
              placeholder={
                group
                  ? `Message to all ${memberCount} subscribed members of ${group.name}…`
                  : 'Message…'
              }
              rows={4}
              // Grows with the message (where supported) so long ones are readable whole.
              className="max-h-96 min-h-28 [field-sizing:content]"
              // An image can go on its own.
              required={!mediaUrls.length}
            />
            {me?.canAttachImages && (
              <ImageAttachments
                value={mediaUrls}
                onChange={setMediaUrls}
                onUploadingChange={setUploading}
              />
            )}
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
                cancel it below until then.
              </p>
            )}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {body.length}/{MAX_LENGTH}
              </span>
              <Button
                type="submit"
                disabled={
                  !group ||
                  broadcast.isPending ||
                  uploading ||
                  (!scheduleLater && memberCount === 0)
                }
              >
                {scheduleLater ? (
                  <CalendarClock className="h-4 w-4" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {scheduleLater
                  ? broadcast.isPending
                    ? 'Scheduling…'
                    : 'Schedule'
                  : broadcast.isPending
                    ? 'Sending…'
                    : group
                      ? `Send to ${memberCount}`
                      : 'Send'}
              </Button>
            </div>
          </div>
          <TextPreview body={body} mediaUrls={mediaUrls} />
        </form>
      </CardContent>
    </Card>
  );
}
