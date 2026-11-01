import { ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/** A section title that folds its contents away when clicked, with a count beside it. */
export function CollapsibleToggle({
  id,
  title,
  count,
  open,
  onToggle,
}: {
  id: string;
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={id}
      className="-m-1 flex w-full items-center gap-2 rounded-md p-1 text-left hover:text-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ChevronDown
        className={cn('h-4 w-4 shrink-0 transition-transform', !open && '-rotate-90')}
        aria-hidden
      />
      {title}
      <Badge variant="secondary" className="font-medium tabular-nums">
        {count}
      </Badge>
    </button>
  );
}
