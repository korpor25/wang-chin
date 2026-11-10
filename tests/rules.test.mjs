import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_PARAMS,
  breedingBlockers,
  goldenPeriod,
  nextHeatWindow,
  semenTone,
  tasksAfterCalving,
  tasksAfterInsemination,
  tasksAfterPregnancy,
} from '../src/domain/rules.ts'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

test('calving creates tasks at the configured offsets and assigns the expected roles', () => {
  const calvedAt = Date.UTC(2026, 0, 1)
  const tasks = tasksAfterCalving(calvedAt, DEFAULT_PARAMS)

  assert.deepEqual(tasks.map((task) => task.activityCode), ['ก-03', 'ก-12', 'ก-13', 'ก-04', 'ก-05', 'ก-07'])
  assert.deepEqual(tasks.map((task) => task.dueAt), [
    calvedAt,
    calvedAt + 12 * HOUR,
    calvedAt + 14 * DAY,
    calvedAt + DEFAULT_PARAMS.uterusCheckDays * DAY,
    calvedAt + DEFAULT_PARAMS.readinessCheckDays * DAY,
    calvedAt + DEFAULT_PARAMS.voluntaryWaitDays * DAY,
  ])
  assert.equal(tasks[1].assignedRole, 'farmer')
})

test('insemination and pregnancy schedules use configured day counts', () => {
  const bredAt = Date.UTC(2026, 0, 1)
  const insemination = tasksAfterInsemination(bredAt, DEFAULT_PARAMS)
  const pregnancy = tasksAfterPregnancy(bredAt, DEFAULT_PARAMS)

  assert.deepEqual(insemination.map((task) => task.dueAt), [
    bredAt + DEFAULT_PARAMS.estrusCycleDays * DAY,
    bredAt + DEFAULT_PARAMS.pregnancyCheckDays * DAY,
  ])
  assert.equal(pregnancy[1].dueAt, bredAt + (DEFAULT_PARAMS.gestationDays - 7) * DAY)
  assert.equal(pregnancy[2].dueAt, bredAt + DEFAULT_PARAMS.gestationDays * DAY)
})

test('golden period boundaries and next heat window are inclusive and centered correctly', () => {
  const heatAt = Date.UTC(2026, 0, 1)
  const from = heatAt + DEFAULT_PARAMS.goldenPeriodFromHours * HOUR
  const to = heatAt + DEFAULT_PARAMS.goldenPeriodToHours * HOUR

  assert.equal(goldenPeriod(heatAt, DEFAULT_PARAMS, from - 1).state, 'before')
  assert.equal(goldenPeriod(heatAt, DEFAULT_PARAMS, from).state, 'now')
  assert.equal(goldenPeriod(heatAt, DEFAULT_PARAMS, to).state, 'now')
  assert.equal(goldenPeriod(heatAt, DEFAULT_PARAMS, to + 1).state, 'passed')
  assert.deepEqual(nextHeatWindow(heatAt, DEFAULT_PARAMS), {
    from: heatAt + (DEFAULT_PARAMS.estrusCycleDays - 2) * DAY,
    center: heatAt + DEFAULT_PARAMS.estrusCycleDays * DAY,
    to: heatAt + (DEFAULT_PARAMS.estrusCycleDays + 2) * DAY,
  })
})

test('semen thresholds and breeding blockers honor the configured parameters', () => {
  assert.equal(semenTone(DEFAULT_PARAMS.semenCritStraws, DEFAULT_PARAMS), 'crit')
  assert.equal(semenTone(DEFAULT_PARAMS.semenWarnStraws, DEFAULT_PARAMS), 'warn')
  assert.equal(semenTone(DEFAULT_PARAMS.semenWarnStraws + 1, DEFAULT_PARAMS), 'ok')

  const blockers = breedingBlockers({
    sex: 'female',
    stage: 'waiting',
    withdrawalUntil: Date.UTC(2026, 0, 2),
    lastBcs: DEFAULT_PARAMS.bcsMinBeforeBreeding - 1,
    lastCalvingAt: Date.UTC(2026, 0, 1),
  }, DEFAULT_PARAMS, Date.UTC(2026, 0, 2) - 1)

  assert.equal(blockers.length, 3)
})
