import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** The shadcn class helper: merge conditional classes, last Tailwind class wins. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const relativeTime = (iso: string | null | undefined): string => {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'never';

  const minutes = Math.round((Date.now() - then) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;

  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

export const fullDateTime = (iso: string | null | undefined): string =>
  iso
    ? new Date(iso).toLocaleString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

export const compactNumber = (value: number): string =>
  new Intl.NumberFormat('en-GB', { notation: value >= 10_000 ? 'compact' : 'standard' }).format(value);
