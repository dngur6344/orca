import { afterEach, describe, expect, it } from 'vitest'
import type Database from '../../../sqlite/sync-database'
import { ORCHESTRATION_LEGACY_RUN_ID } from '../../../../shared/orchestration-rpc-contract'
import type {
  OrchestrationRunConsoleListResult,
  OrchestrationRunConsoleSnapshot
} from '../../../../shared/orchestration-run-console'
import { OrcaRuntimeService } from '../../orca-runtime'
import { OrchestrationDb } from '../../orchestration/db'
import { ORCHESTRATION_RUN_CONSOLE_METHODS } from './orchestration-run-console'

function sqliteFor(db: OrchestrationDb): Database.Database {
  return (db as unknown as { db: Database.Database }).db
}

describe('orchestration run console RPC', () => {
  let db: OrchestrationDb | undefined

  afterEach(() => db?.close())

  function setup(): { db: OrchestrationDb; runtime: OrcaRuntimeService } {
    db = new OrchestrationDb(':memory:')
    const runtime = new OrcaRuntimeService()
    runtime.setOrchestrationDb(db)
    return { db, runtime }
  }

  async function call(
    runtime: OrcaRuntimeService,
    name: string,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const method = ORCHESTRATION_RUN_CONSOLE_METHODS.find((candidate) => candidate.name === name)
    if (!method) {
      throw new Error(`Method not found: ${name}`)
    }
    return method.handler(method.params?.parse(params), { runtime })
  }

  it('paginates summaries with deterministic derived states and run isolation', async () => {
    const { db: d, runtime } = setup()
    const attentionRun = d.createRun({
      objective: 'Attention',
      coordinatorHandle: 'coordinator_a',
      coordinatorPaneKey: 'tab_a:11111111-1111-4111-8111-111111111111'
    })
    const completedRun = d.createRun({
      objective: 'Completed',
      coordinatorHandle: 'coordinator_b',
      coordinatorPaneKey: 'tab_b:22222222-2222-4222-8222-222222222222'
    })
    const questionTask = d.createTask({ spec: 'Ask for input', runId: attentionRun.id })
    const questionDispatch = d.createDispatchContext(questionTask.id, 'worker_a')
    d.createQuestion({
      runId: attentionRun.id,
      dispatchId: questionDispatch.id,
      askerHandle: 'worker_a',
      question: 'Which option?',
      options: ['A', 'B']
    })
    const gateTask = d.createTask({ spec: 'Wait for gate', runId: attentionRun.id })
    d.createGate({ taskId: gateTask.id, question: 'Approve?', options: ['yes', 'no'] })
    const completedTask = d.createTask({ spec: 'Done', runId: completedRun.id })
    d.updateTaskStatus(completedTask.id, 'completed', 'ok')

    const first = (await call(runtime, 'orchestration.consoleList', {
      limit: 1
    })) as OrchestrationRunConsoleListResult
    expect(first.runs).toHaveLength(1)
    expect(first.nextCursor).not.toBeNull()
    const second = (await call(runtime, 'orchestration.consoleList', {
      limit: 1,
      cursor: first.nextCursor
    })) as OrchestrationRunConsoleListResult
    expect(second.runs[0]?.id).not.toBe(first.runs[0]?.id)

    const all = (await call(
      runtime,
      'orchestration.consoleList',
      {}
    )) as OrchestrationRunConsoleListResult
    expect(all.runs.find((run) => run.id === attentionRun.id)).toMatchObject({
      state: 'needs_attention',
      counts: { pendingQuestions: 1, pendingGates: 1 }
    })
    expect(all.runs.find((run) => run.id === completedRun.id)).toMatchObject({
      state: 'completed',
      counts: { tasks: 1, terminalTasks: 1 }
    })
    expect(all.runs.find((run) => run.id === ORCHESTRATION_LEGACY_RUN_ID)).toMatchObject({
      legacyReadOnly: true,
      state: 'unknown'
    })
  })

  it('returns one bounded snapshot without message bodies and tolerates cyclic dependencies', async () => {
    const { db: d, runtime } = setup()
    const run = d.createRun({
      objective: 'Inspect',
      coordinatorHandle: 'coordinator',
      coordinatorPaneKey: 'tab:33333333-3333-4333-8333-333333333333'
    })
    const firstTask = d.createTask({ spec: 'First', runId: run.id })
    const secondTask = d.createTask({ spec: 'Second', runId: run.id })
    sqliteFor(d)
      .prepare('UPDATE tasks SET deps = ? WHERE id = ?')
      .run(JSON.stringify([secondTask.id]), firstTask.id)
    sqliteFor(d)
      .prepare('UPDATE tasks SET deps = ? WHERE id = ?')
      .run(JSON.stringify([firstTask.id]), secondTask.id)
    const dispatch = d.createDispatchContext(firstTask.id, 'worker')
    d.createQuestion({
      runId: run.id,
      dispatchId: dispatch.id,
      askerHandle: 'worker',
      question: 'Continue?',
      options: ['continue']
    })

    const snapshot = (await call(runtime, 'orchestration.consoleSnapshot', {
      run: run.id
    })) as OrchestrationRunConsoleSnapshot

    expect(snapshot.tasks).toHaveLength(2)
    expect(snapshot.tasks.every((task) => task.runId === run.id)).toBe(true)
    expect(snapshot.tasks.find((task) => task.id === firstTask.id)?.dependencyIds).toEqual([
      secondTask.id
    ])
    expect(snapshot.questions[0]).toMatchObject({
      prompt: 'Continue?',
      options: ['continue'],
      taskId: firstTask.id
    })
    expect(snapshot.messages.every((message) => message.runId === run.id)).toBe(true)
    expect(snapshot.messages[0]).not.toHaveProperty('body')
    expect(snapshot.operatorActions).toEqual([])
    expect(snapshot.attention.map((item) => item.kind)).toContain('question')
  })

  it('rejects an unknown run without exposing another run', async () => {
    const { runtime } = setup()
    await expect(
      call(runtime, 'orchestration.consoleSnapshot', { run: 'run_missing' })
    ).rejects.toMatchObject({ code: 'run_not_found' })
  })
})
