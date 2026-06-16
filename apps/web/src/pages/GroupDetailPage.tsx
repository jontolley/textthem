import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { useBroadcast, useDeleteGroup, useGroup, useGroupMembers } from '@/lib/hooks';
import { ApiError } from '@/lib/api';

const MAX_LENGTH = 1600;

export function GroupDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data: group, isLoading } = useGroup(id);
  const { data: members } = useGroupMembers(id);
  const broadcast = useBroadcast(id);
  const deleteGroup = useDeleteGroup();
  const [body, setBody] = useState('');

  async function handleBroadcast(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await broadcast.mutateAsync(body.trim());
      toast.success(`Sent to ${res.message.acceptedCount} of ${res.message.recipientCount} members`);
      setBody('');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to send broadcast');
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${group?.name}"? This removes the group and its subscriptions.`)) return;
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
        <Button variant="outline" size="sm" onClick={handleDelete} disabled={deleteGroup.isPending}>
          <Trash2 className="h-4 w-4" /> Delete
        </Button>
      </div>

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
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {body.length}/{MAX_LENGTH}
              </span>
              <Button type="submit" disabled={broadcast.isPending || memberCount === 0}>
                <Send className="h-4 w-4" />
                {broadcast.isPending ? 'Sending…' : `Send to ${memberCount}`}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent>
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
                    <TableCell className="font-mono">{m.phoneNumber}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {m.subscribedAt ? new Date(m.subscribedAt).toLocaleDateString() : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
