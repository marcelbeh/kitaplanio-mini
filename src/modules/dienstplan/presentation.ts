import type { KitaSetup } from '../kita/setup'
import type { Shift } from './schedule'
export type ShiftPeriod = { kind: 'early' | 'core' | 'late' | 'special'; label: string }
// Display labels only: no planning, pause placement, or staffing calculation.
export function shiftPeriods(shift: Shift, setup: KitaSetup | null): ShiftPeriod[] {
  if (!setup?.completed) return []
  const day = new Date(`${shift.date}T00:00:00Z`).getUTCDay()
  const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  if (!(setup.careDays ?? ['mon', 'tue', 'wed', 'thu', 'fri']).some(item => item === days[day])) return [{ kind: 'special', label: 'Sonderdienst' }]
  const periods = [{ kind: 'early', label: 'Früh', start: setup.early.start, end: setup.early.end }, { kind: 'core', label: 'Kern', start: setup.early.end, end: setup.late.start }, { kind: 'late', label: 'Spät', start: setup.late.start, end: setup.late.end }] as const
  const matches = periods.filter(period => /^\d{2}:\d{2}$/.test(period.start) && period.start < period.end && shift.start < period.end && shift.end > period.start)
  return matches.length ? [...matches] : [{ kind: 'special', label: 'Sonderdienst' }]
}
