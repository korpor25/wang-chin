import assert from 'node:assert/strict'
import test, { beforeEach } from 'node:test'
import 'fake-indexeddb/auto'
import { db } from '../src/data/db.ts'
import {
  claimLegacyOutbox,
  countLegacyOutbox,
  discardLegacyOutbox,
  enqueue,
  resolveQueueConflict,
  runSync,
} from '../src/data/sync.ts'
import { useSession } from '../src/state/session.ts'

const account = (userId) => ({
  userId,
  name: userId,
  role: 'coop',
  phone: '0800000000',
  readOnly: false,
  isAdmin: false,
  farmIds: [],
  active: true,
  token: '',
})

Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { onLine: true },
})

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()))
  useSession.setState({ account: account('user-a') })
})

test('sync sends only outbox items owned by the active account', async () => {
  await enqueue('tasks', 'create', 'task-a', 10)
  useSession.setState({ account: account('user-b') })
  await enqueue('tasks', 'create', 'task-b', 10)
  const originalRandom = Math.random
  Math.random = () => 0.5

  try {
    const outcome = await runSync(10, true)
    const remaining = await db.outbox.toArray()

    assert.equal(outcome.succeeded, 1)
    assert.deepEqual(remaining.map((item) => item.refLocalId), ['task-a'])
    assert.equal(remaining[0].ownerUserId, 'user-a')
  } finally {
    Math.random = originalRandom
  }
})

test('a task conflict is retained in the outbox and paused for manual resolution', async () => {
  await enqueue('tasks', 'create', 'task-conflict', 10)
  const originalRandom = Math.random
  let calls = 0
  Math.random = () => (++calls === 1 ? 0.5 : 0.1)

  try {
    const outcome = await runSync(10, true)
    const [item] = await db.outbox.toArray()

    assert.equal(outcome.conflicts, 1)
    assert.equal(item.refLocalId, 'task-conflict')
    assert.equal(item.status, 'conflict')
    assert.equal(await resolveQueueConflict(item.id, 'retry'), true)
    const retried = await db.outbox.get(item.id)
    assert.equal(retried.status, undefined)
    assert.equal(retried.attempts, 0)
  } finally {
    Math.random = originalRandom
  }
})

test('overlapping sync calls share one pass instead of sending the same item twice', async () => {
  await enqueue('tasks', 'create', 'task-once', 10)
  const originalRandom = Math.random
  let calls = 0
  Math.random = () => {
    calls++
    return 0.5
  }

  try {
    const [first, second] = await Promise.all([runSync(10, true), runSync(10, true)])

    assert.equal(first.succeeded, 1)
    assert.deepEqual(second, first)
    assert.equal(calls, 2)
    assert.equal(await db.outbox.count(), 0)
  } finally {
    Math.random = originalRandom
  }
})

test('legacy queue claiming changes only undefined owners, not explicitly unowned items', async () => {
  await enqueue('tasks', 'create', 'owned', 10)
  await db.outbox.add({
    localId: 'legacy',
    table: 'tasks',
    op: 'create',
    refLocalId: 'legacy-task',
    bytes: 10,
    attempts: 0,
    nextAttemptAt: Date.now(),
    lastError: null,
    createdAt: Date.now(),
  })
  await db.outbox.add({
    localId: 'explicit-null',
    ownerUserId: null,
    table: 'tasks',
    op: 'create',
    refLocalId: 'null-task',
    bytes: 10,
    attempts: 0,
    nextAttemptAt: Date.now(),
    lastError: null,
    createdAt: Date.now(),
  })

  assert.equal(await countLegacyOutbox(), 1)
  assert.equal(await claimLegacyOutbox('user-a'), 1)
  assert.equal(await countLegacyOutbox(), 0)
  assert.equal(
    (await db.outbox.where('localId').equals('explicit-null').first())?.ownerUserId,
    null,
  )
})

test('discarding legacy queue preserves local records and marks them unsynced', async () => {
  const at = Date.now()
  await db.records.add({
    localId: 'legacy-record',
    serverId: null,
    activityCode: 'ก-01',
    animalId: null,
    farmId: null,
    occurredAt: at,
    payload: {},
    photoIds: [],
    note: '',
    recordedBy: 'ผู้ใช้เดิม',
    recordedRole: 'coop',
    lastModified: at,
    syncStatus: 'pending',
    retries: 0,
  })
  await db.outbox.add({
    localId: 'legacy-record-outbox',
    table: 'records',
    op: 'create',
    refLocalId: 'legacy-record',
    bytes: 10,
    attempts: 0,
    nextAttemptAt: at,
    lastError: null,
    createdAt: at,
  })
  await db.counters.bulkPut([
    { key: 'outbox.size', value: 1 },
    { key: 'records.pending', value: 1 },
    { key: 'records.failed', value: 0 },
  ])

  assert.equal(await discardLegacyOutbox(), 1)
  assert.equal(await db.outbox.count(), 0)
  assert.equal((await db.records.where('localId').equals('legacy-record').first())?.syncStatus, 'failed')
  assert.equal((await db.counters.get('records.pending'))?.value, 0)
  assert.equal((await db.counters.get('records.failed'))?.value, 1)
})
