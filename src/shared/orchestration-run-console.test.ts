import { describe, expect, it } from 'vitest'
import type {
  OrchestrationRunConsoleCounts,
  OrchestrationRunConsoleDispatch,
  OrchestrationRunConsoleTask,
  OrchestrationRunConsoleWorker
} from './orchestration-run-console'
import {
  buildOrchestrationRunConsoleAttention,
  deriveOrchestrationRunConsoleState,
  inspectOrchestrationRunConsoleDependencies,
  parseOrchestrationTaskDependencies
} from './orchestration-run-console-derived-state'

const EMPTY_COUNTS: OrchestrationRunConsoleCounts = {
  tasks: 0,
  terminalTasks: 0,
  activeTasks: 0,
  pendingQuestions: 0,
  pendingGates: 0,
  failedTasks: 0,
  circuitBrokenDispatches: 0,
  resourceDecisions: 0
}

function task(
  id: string,
  dependencyIds: string[] = [],
  overrides: Partial<OrchestrationRunConsoleTask> = {}
): OrchestrationRunConsoleTask {
  return {
    id,
    runId: 'run_1',
    parentId: null,
    title: id,
    displayName: id,
    spec: id,
    status: 'ready',
    dependencyIds,
    dependenciesValid: true,
    result: null,
    createdAt: '2026-08-07T00:00:00Z',
    completedAt: null,
    ...overrides
  }
}

describe('orchestration run console projections', () => {
  it('derives attention, active, completed, and legacy states deterministically', () => {
    expect(deriveOrchestrationRunConsoleState(EMPTY_COUNTS)).toBe('active')
    expect(
      deriveOrchestrationRunConsoleState({
        ...EMPTY_COUNTS,
        tasks: 2,
        terminalTasks: 2
      })
    ).toBe('completed')
    expect(
      deriveOrchestrationRunConsoleState({
        ...EMPTY_COUNTS,
        pendingQuestions: 1
      })
    ).toBe('needs_attention')
    expect(deriveOrchestrationRunConsoleState(EMPTY_COUNTS, true)).toBe('unknown')
  })

  it('parses dependencies defensively and reports missing and cyclic edges', () => {
    expect(parseOrchestrationTaskDependencies('["a","a","b"]')).toEqual({
      dependencyIds: ['a', 'b'],
      valid: true
    })
    expect(parseOrchestrationTaskDependencies('{"a":true}')).toEqual({
      dependencyIds: [],
      valid: false
    })
    expect(
      inspectOrchestrationRunConsoleDependencies([
        task('a', ['b']),
        task('b', ['a']),
        task('c', ['missing']),
        task('invalid', [], { dependenciesValid: false })
      ])
    ).toEqual({
      invalidTaskIds: ['invalid'],
      missingDependencyIds: ['missing'],
      cyclicTaskIds: ['a', 'b']
    })
  })

  it('orders actionable questions, gates, failures, and resources without duplicates', () => {
    const failedTask = task('failed', [], {
      status: 'failed',
      completedAt: '2026-08-07T00:03:00Z'
    })
    const dispatch: OrchestrationRunConsoleDispatch = {
      id: 'dispatch_1',
      runId: 'run_1',
      taskId: failedTask.id,
      contractVersion: 1,
      assigneeHandle: 'worker',
      status: 'circuit_broken',
      failureCount: 3,
      lastFailure: 'failed',
      dispatchedAt: '2026-08-07T00:00:00Z',
      completedAt: '2026-08-07T00:04:00Z',
      createdAt: '2026-08-07T00:00:00Z',
      lastHeartbeatAt: null
    }
    const worker: OrchestrationRunConsoleWorker = {
      dispatchId: dispatch.id,
      taskId: failedTask.id,
      runId: 'run_1',
      workerState: 'failed',
      dispatchStatus: 'circuit_broken',
      agentTerminalHandle: 'worker',
      terminalState: 'reclaimable',
      resource: {
        id: 'resource_1',
        worktreeId: 'worktree_1',
        terminalHandle: 'worker',
        ownershipState: 'owned',
        releaseState: 'not_requested',
        retainedReason: null
      },
      federation: null,
      createdAt: '2026-08-07T00:00:00Z'
    }
    const items = buildOrchestrationRunConsoleAttention({
      tasks: [failedTask],
      dispatches: [dispatch],
      questions: [
        {
          messageId: 'question_1',
          runId: 'run_1',
          taskId: failedTask.id,
          dispatchId: dispatch.id,
          prompt: 'Proceed?',
          options: [],
          status: 'pending',
          createdAt: '2026-08-07T00:02:00Z',
          answeredAt: null
        }
      ],
      gates: [
        {
          id: 'gate_1',
          runId: 'run_1',
          taskId: failedTask.id,
          question: 'Choose',
          options: [],
          status: 'pending',
          resolution: null,
          createdAt: '2026-08-07T00:01:00Z',
          resolvedAt: null
        }
      ],
      workers: [worker]
    })

    expect(items.map((item) => item.kind)).toEqual(['question', 'gate', 'failure', 'resource'])
    expect(items.filter((item) => item.kind === 'failure')).toHaveLength(1)
  })
})
