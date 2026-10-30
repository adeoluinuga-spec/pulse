import type { ReactNode } from 'react';
import type { LearningActivity } from '@/lib/learning';
import { groupLearningSessions } from '@/lib/learningSessions';
import s from './learning.module.css';

export function SessionSelect({ value, onChange, disabled, label = 'Session' }: {
  value?: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
  label?: string;
}) {
  return <label className={s.field}>
    {label}
    <select aria-label={label} value={value ?? ''} disabled={disabled} onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}>
      <option value="">Not assigned to a session</option>
      {Array.from({ length: 50 }, (_, i) => <option key={i + 1} value={i + 1}>Session {i + 1}</option>)}
    </select>
  </label>;
}

export default function LearningSessions({ activities, renderActivity, isComplete }: {
  activities: LearningActivity[];
  renderActivity: (activity: LearningActivity) => ReactNode;
  isComplete?: (activity: LearningActivity) => boolean;
}) {
  // Existing programmes without sessions retain their simple list.
  if (!activities.some(a => a.session_number != null))
    return <div className={s.list}>{activities.map(renderActivity)}</div>;
  return <div className={s.list}>
    {groupLearningSessions(activities).map(group => {
      const done = isComplete ? group.activities.filter(isComplete).length : 0;
      return <details className={s.sessionGroup} key={group.session ?? 'unassigned'} open>
        <summary>
          <strong>{group.label}</strong>
          <span className={s.muted}>{isComplete ? `${done} of ${group.activities.length} complete` : `${group.activities.length} activities`}</span>
        </summary>
        {isComplete ? <progress className={s.progress} max={group.activities.length} value={done} aria-label={`${group.label} progress`} /> : null}
        <div className={s.list}>{group.activities.map(renderActivity)}</div>
      </details>;
    })}
  </div>;
}
