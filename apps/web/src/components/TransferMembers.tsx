import { useEffect, useState } from 'react';
import { Copy, MoveRight, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Group, TransferMembersResponse } from '@text-them/shared';
import { Select } from '@/components/BroadcastListControls';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api';
import { useGroups, useTransferMembers } from '@/lib/hooks';

/** Which members of a group's list are checked: some by id, or every current member. */
export type MemberSelection = { all: true } | { all: false; ids: Set<string> };

export const NO_SELECTION: MemberSelection = { all: false, ids: new Set() };

export type TransferMode = 'copy' | 'move';

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Shown in the member list's header while members are checked. */
export function SelectionBar({
  count,
  onCopy,
  onMove,
  onClear,
}: {
  count: number;
  onCopy: () => void;
  onMove: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 text-sm font-normal">
      <span className="text-muted-foreground" aria-live="polite">
        {count} selected
      </span>
      <Button size="sm" variant="outline" className="h-8" onClick={onCopy}>
        <Copy className="h-4 w-4" /> Copy to…
      </Button>
      <Button size="sm" variant="outline" className="h-8" onClick={onMove}>
        <MoveRight className="h-4 w-4" /> Move to…
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8"
        onClick={onClear}
        aria-label="Clear selection"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

/** What happened, for the toast after a copy or move. */
function summarize(mode: TransferMode, target: string, r: TransferMembersResponse): string {
  const parts = [
    `${mode === 'move' ? 'Moved' : 'Added'} ${plural(r.added, 'member')} to ${target}`,
  ];
  if (r.alreadyInGroup) parts.push(`${r.alreadyInGroup} already there`);
  if (r.skippedOptedOut) {
    parts.push(`${r.skippedOptedOut} skipped (they'd texted STOP to that group)`);
  }
  if (mode === 'move' && r.removed !== r.added) {
    parts.push(`${plural(r.removed, 'member')} taken out of this group`);
  }
  return parts.join(' · ');
}

/**
 * Picks another group of the same organization and copies or moves the
 * selected members there. Only groups of the source group's org are offered;
 * the API refuses any other.
 */
export function TransferMembersDialog({
  mode,
  onOpenChange,
  source,
  selection,
  count,
  onDone,
}: {
  /** Open when set. */
  mode: TransferMode | null;
  onOpenChange: (open: boolean) => void;
  source: Group;
  selection: MemberSelection;
  count: number;
  onDone: () => void;
}) {
  const { data: groups } = useGroups();
  const transfer = useTransferMembers();
  const [targetId, setTargetId] = useState('');

  const targets = (groups ?? [])
    .filter((g) => g.orgId === source.orgId && g.id !== source.id)
    .sort((a, b) => a.name.localeCompare(b.name));

  // Start each opening with nothing picked.
  useEffect(() => {
    if (mode) setTargetId('');
  }, [mode]);

  if (!mode) return null;
  const verb = mode === 'move' ? 'Move' : 'Copy';
  const target = targets.find((g) => g.id === targetId);

  async function handleSubmit() {
    if (!mode || !target) return;
    try {
      const result = await transfer.mutateAsync({
        id: source.id,
        body: {
          targetGroupId: target.id,
          mode,
          ...(selection.all ? { all: true } : { memberIds: [...selection.ids] }),
        },
      });
      toast.success(summarize(mode, target.name, result));
      onDone();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : `Failed to ${mode} members`);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !transfer.isPending && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {verb} {plural(count, 'member')}
          </DialogTitle>
          <DialogDescription>
            {mode === 'move'
              ? `They'll be added to the group you pick and taken out of ${source.name}.`
              : `They'll be added to the group you pick and stay in ${source.name}.`}
          </DialogDescription>
        </DialogHeader>

        {targets.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            There are no other groups in this organization to {mode} them to.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="transfer-target">Group</Label>
              <div>
                <Select
                  id="transfer-target"
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  disabled={transfer.isPending}
                >
                  <option value="" disabled>
                    Pick a group
                  </option>
                  {targets.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.keyword}){g.active ? '' : ' (inactive)'}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              They didn&rsquo;t text this group&rsquo;s keyword themselves, so only add people
              who&rsquo;ve agreed to hear from it. They aren&rsquo;t sent a text about it. Anyone
              who texted STOP to that group is skipped.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={transfer.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!target || transfer.isPending}>
            {transfer.isPending ? `${verb === 'Move' ? 'Moving' : 'Copying'}…` : verb}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
