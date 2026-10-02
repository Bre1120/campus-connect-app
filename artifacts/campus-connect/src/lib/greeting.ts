export type DaypartGreeting = 'Good morning' | 'Good afternoon' | 'Good evening';

export function getDaypartGreeting(hour: number): DaypartGreeting {
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) {
    throw new RangeError('Hour must be a number from 0 through 23.');
  }

  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}