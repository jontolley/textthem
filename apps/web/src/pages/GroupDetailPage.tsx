import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { LoadingLabel, Skeleton, SkeletonTableRows } from '@/components/Loading';
import { MemberListCard } from '@/components/MemberList';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody } from '@/components/ui/table';
import { useDeleteGroup, useGroup } from '@/lib/hooks';
import { ApiError } from '@/lib/api';

export function GroupDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data: group, isLoading } = useGroup(id);
  const deleteGroup = useDeleteGroup();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function handleDelete() {
    try {
      await deleteGroup.mutateAsync(id);
      toast.success('Group deleted');
      navigate('/');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to delete group');
    }
  }

  if (isLoading) return <GroupDetailSkeleton />;
  if (!group) return <p className="text-sm text-destructive">Group not found.</p>;

  const memberCount = group.memberCount ?? 0;

  return (
    <div className="space-y-6">
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
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
        <div className="flex flex-wrap justify-end gap-2">
          <Button asChild size="sm">
            <Link to={`/message?group=${id}`}>
              <Send className="h-4 w-4" /> Send a message
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmingDelete(true)}
            disabled={deleteGroup.isPending}
          >
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </div>
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

      <MemberListCard
        id="member-list"
        title="Members"
        groupId={id}
        status="subscribed"
        // Open: with the send form gone, the members are what this page is for.
        defaultOpen
        fallbackCount={memberCount}
        empty={
          <p className="text-sm text-muted-foreground">
            No subscribers yet. Share the keyword{' '}
            <span className="font-mono font-medium">{group.keyword}</span> for people to text in.
          </p>
        }
        dateColumns={[{ label: 'Subscribed', sort: 'subscribed', value: (m) => m.subscribedAt }]}
      />

      {/* Shown once someone has left. Collapsed by default: it's looked at now and then. */}
      <MemberListCard
        id="left-group-list"
        title="Left the group"
        groupId={id}
        status="unsubscribed"
        defaultOpen={false}
        hideWhenEmpty
        intro={
          <p className="text-sm text-muted-foreground">
            People who texted STOP. STOP takes them out of every group and they get no more texts.
            To rejoin, they text START and then the group&rsquo;s keyword.
          </p>
        }
        dateColumns={[
          { label: 'Joined', sort: 'subscribed', value: (m) => m.subscribedAt },
          { label: 'Left', sort: 'left', value: (m) => m.unsubscribedAt },
        ]}
      />
    </div>
  );
}

/** The page's shape while the group loads: its heading, then the Members card. */
function GroupDetailSkeleton() {
  return (
    <div className="space-y-6">
      <LoadingLabel />
      <Skeleton className="h-4 w-28" />
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-48" />
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <Table>
            <TableBody>
              <SkeletonTableRows columns={3} />
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
