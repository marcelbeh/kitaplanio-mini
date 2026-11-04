import type { PlanIssue } from './checks'
import type { Shift } from './schedule'

export function planningTask(issue: PlanIssue): string {
  if (issue.id.startsWith('missing-pause:')) return 'Pausendauer ausdrücklich erfassen'
  if (issue.id.startsWith('pause:')) return 'Pausenlage im Team abstimmen'
  if (issue.id.startsWith('staff:')) return 'Fehlende Besetzung prüfen und Dienste ergänzen'
  if (issue.id.startsWith('half:')) return 'Halbtägige Abwesenheit zeitlich klären'
  if (issue.id.startsWith('demand:')) return 'Konkreten Personalbedarf klären'
  if (issue.id.startsWith('hours:')) return 'Geplanten Wochenumfang prüfen'
  return issue.kind === 'conflict' ? 'Konflikt im Plan prüfen' : 'Hinweis fachlich prüfen'
}
// Resolve only exact existing identifiers, never employee names or a split on ':' (IDs may contain it).
// Multiple affected shifts require a day view, rather than opening an arbitrary editor.
export function issueShift(issue: PlanIssue, shifts: Shift[]): Shift | null {
  const matches = shifts.filter(shift => shift.date === issue.date && (
    ['pause', 'long', 'availability', 'group', 'duplicate'].some(prefix => issue.id === `${prefix}:${shift.id}`) ||
    ['missing-pause', 'absence', 'half', 'fixed', 'wish'].some(prefix => issue.id === `${prefix}:${shift.employeeId}:${shift.date}`)
  ))
  return matches.length === 1 ? matches[0] : null
}
export function shiftAnchor(id: string, mobile: boolean): string {
  return `schedule-shift-${mobile ? 'mobile' : 'desktop'}-${encodeURIComponent(id)}`
}

export function cockpitTasks(issues: PlanIssue[], limit = 5): PlanIssue[] {
  const sorted = [...issues].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'conflict' ? -1 : 1) || a.date.localeCompare(b.date))
  const representatives = ['staff:', 'missing-pause:', 'pause:'].flatMap(prefix => { const issue = sorted.find(item => item.id.startsWith(prefix)); return issue ? [issue] : [] })
  return [...new Map([...representatives, ...sorted].map(issue => [issue.id, issue])).values()].slice(0, limit)
}
