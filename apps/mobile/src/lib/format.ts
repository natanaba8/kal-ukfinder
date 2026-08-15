/** Small display helpers shared across screens. */

export const relativeTime = (iso: string): string => {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';

  const minutes = Math.round((Date.now() - then) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 31) return `${Math.round(days / 7)} week${days < 14 ? '' : 's'} ago`;

  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

export const fullDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

export const money = (value: number | null | undefined): string =>
  value === null || value === undefined ? '' : `£${Math.round(value).toLocaleString('en-GB')}`;

export const contractLabel = (contractType: string | null | undefined): string => {
  switch (contractType) {
    case 'full_time':
      return 'Full time';
    case 'part_time':
      return 'Part time';
    case 'apprenticeship':
      return 'Apprenticeship';
    case 'graduate':
      return 'Graduate';
    case 'term_time':
      return 'Term time';
    case 'training':
      return 'Training place';
    case 'contract':
      return 'Contract';
    default:
      return '';
  }
};

export const hourLabel = (hour: number): string => {
  const clamped = ((hour % 24) + 24) % 24;
  const suffix = clamped < 12 ? 'am' : 'pm';
  const display = clamped % 12 === 0 ? 12 : clamped % 12;
  return `${display}${suffix}`;
};

export const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'K';
