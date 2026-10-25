import type { LiveStatus } from '@/lib/live';
import { cn } from '@/lib/utils';

const STATES: Record<LiveStatus, { label: string; hint: string; dot: string }> = {
  live: {
    label: 'Live',
    hint: 'Connected. Changes show up here as they happen.',
    dot: 'bg-emerald-300',
  },
  connecting: {
    label: 'Connecting…',
    hint: 'Connecting for live updates.',
    dot: 'bg-white/50',
  },
  reconnecting: {
    label: 'Reconnecting…',
    hint: 'Lost the live connection and trying again. This page may be out of date until it reconnects.',
    dot: 'bg-amber-300',
  },
};

/** The header's Live dot: whether changes are showing up without a refresh. */
export function LiveIndicator({ status }: { status: LiveStatus }) {
  const { label, hint, dot } = STATES[status];
  return (
    <div
      role="status"
      title={hint}
      className="flex items-center gap-2 text-xs font-medium text-white/90"
    >
      <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', dot)} aria-hidden />
      {/* The dot alone on phones, where the header is tight. */}
      <span className="sr-only sm:not-sr-only">{label}</span>
    </div>
  );
}
