import type { LearningActivity } from './learning.ts';

export function validateLearningSession(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 50)
    throw new Error('Choose a session from 1 to 50, or leave it unassigned.');
  return value;
}

export function groupLearningSessions(activities: LearningActivity[]) {
  const groups = new Map<number | null, LearningActivity[]>();
  for (const activity of activities) {
    const session = activity.session_number ?? null;
    groups.set(session, [...(groups.get(session) ?? []), activity]);
  }
  return [...groups].sort(([a], [b]) => (a ?? 51) - (b ?? 51)).map(([session, entries]) => ({
    session,
    label: session === null ? 'Unassigned activities' : `Session ${session}`,
    activities: [...entries].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)),
  }));
}
