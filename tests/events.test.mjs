import test from 'node:test'
import assert from 'node:assert/strict'
import { EVENTS_KEY, newEvent, validateEvent, occurrences, listOccurrences, conflictHints, loadEvents, saveEvent, deleteEvent } from '../src/modules/termine/events.ts'
const entry = (patch = {}) => ({ ...newEvent('event-1'), title: 'Teamrunde', date: '2026-01-31', start: '10:00', end: '11:00', wholeTeam: true, ...patch })
function memory() { const data = new Map([['kitaplanio-lite:employees:v1', 'unverändert']]); return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) } }

test('Wiederholungen, Schaltjahr, inklusive Grenzen und chronologischer Filter', () => {
  assert.deepEqual(occurrences(entry({ recurrence: 'monthly', until: '2026-05-31' })).map(item => item.date), ['2026-01-31', '2026-03-31', '2026-05-31'])
  assert.deepEqual(occurrences(entry({ date: '2024-01-29', recurrence: 'monthly', until: '2024-03-29' })).map(item => item.date), ['2024-01-29', '2024-02-29', '2024-03-29'])
  const weekly = entry({ date: '2026-11-03', recurrence: 'weekly', until: '2026-11-17' })
  assert.deepEqual(listOccurrences([weekly, entry({ id: 'earlier', date: '2026-11-09' })], '2026-11-09', '2026-11-17').map(item => item.date), ['2026-11-09', '2026-11-10', '2026-11-17'])
  assert.deepEqual(listOccurrences([weekly], '2026-12-01', '2026-11-01'), [])
  for (const patch of [{ date: '2026-02-30' }, { start: '11:00' }, { recurrence: 'weekly' }, { wholeTeam: false }, { recurrence: 'monthly', until: '2026-01-30' }]) assert.ok(validateEvent(entry(patch)).length)
})

test('Konflikte beachten Gruppen, Personen und Abwesenheiten; angrenzende Zeiten sind frei', () => {
  const employees = [{ id: 'a', groupId: 'g' }, { id: 'b', groupId: 'h' }]
  const own = entry({ wholeTeam: false, groupIds: ['g'], recurrence: 'weekly', until: '2026-02-07' })
  const other = entry({ id: 'other', wholeTeam: false, employeeIds: ['a'], date: '2026-02-07' })
  const absence = { employeeId: 'a', employeeName: 'Anna', startDate: '2026-02-07', endDate: '2026-02-07', portion: 'am' }
  assert.equal(conflictHints(own, [own, other], [absence], employees).length, 2)
  assert.equal(conflictHints(own, [{ ...other, start: '11:00', end: '12:00' }], [], employees).length, 0)
  assert.equal(conflictHints(own, [{ ...other, employeeIds: ['b'] }], [], employees).length, 0)
  assert.match(conflictHints(own, [], [absence], employees)[0], /halbtags/)
})

test('CRUD schützt andere Speicher, beschädigte Daten und IDs; Konflikte blockieren nicht', () => {
  const s = memory()
  saveEvent(s, entry(), 'create')
  saveEvent(s, entry({ id: 'overlap' }), 'create')
  assert.equal(loadEvents(s).length, 2)
  saveEvent(s, entry({ title: 'Geändert' }), 'update')
  assert.equal(loadEvents(s)[0].title, 'Geändert')
  assert.throws(() => saveEvent(s, entry(), 'create'), /vergeben/)
  deleteEvent(s, 'event-1')
  assert.throws(() => saveEvent(s, entry(), 'update'), /entfernt/)
  assert.equal(s.data.get('kitaplanio-lite:employees:v1'), 'unverändert')
  for (const raw of ['broken', '{"version":2,"events":[]}', '{"version":1,"events":[{}]}']) {
    s.data.set(EVENTS_KEY, raw)
    assert.throws(() => saveEvent(s, entry(), 'create'))
    assert.throws(() => deleteEvent(s, 'overlap'))
    assert.equal(s.data.get(EVENTS_KEY), raw)
  }
})
