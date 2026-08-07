import { describe, expect, it, vi } from 'vitest'
import type {
  OrchestrationRunConsoleListResult,
  OrchestrationRunConsoleSnapshot
} from '../../../../shared/orchestration-run-console'
import { ORCHESTRATION_RUN_CONSOLE_RUNTIME_CAPABILITY } from '../../../../shared/protocol-version'
import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import {
  OrchestrationRunConsoleClient,
  type RunConsoleClientDependencies
} from './orchestration-run-console-client'

const LOCAL: RuntimeClientTarget = { kind: 'local' }
const REMOTE: RuntimeClientTarget = { kind: 'environment', environmentId: 'remote-1' }

function catalog(runId = 'run-1'): OrchestrationRunConsoleListResult {
  return {
    runs: [
      {
        id: runId,
        objective: 'Ship console',
        legacyReadOnly: false,
        state: 'active',
        counts: {
          tasks: 1,
          terminalTasks: 0,
          activeTasks: 1,
          pendingQuestions: 0,
          pendingGates: 0,
          failedTasks: 0,
          circuitBrokenDispatches: 0,
          resourceDecisions: 0
        },
        createdAt: '2026-08-07 00:00:00',
        updatedAt: '2026-08-07 00:00:00'
      }
    ],
    nextCursor: null
  }
}

function snapshot(runId = 'run-1'): OrchestrationRunConsoleSnapshot {
  return {
    run: catalog(runId).runs[0],
    tasks: [],
    dispatches: [],
    questions: [],
    gates: [],
    messages: [],
    workers: [],
    operatorActions: [],
    attention: [],
    truncated: {
      tasks: false,
      dispatches: false,
      questions: false,
      gates: false,
      messages: false,
      workers: false,
      operatorActions: false
    }
  }
}

function dependencies(
  overrides: Partial<RunConsoleClientDependencies> = {}
): RunConsoleClientDependencies {
  return {
    getCapabilities: vi.fn().mockResolvedValue([ORCHESTRATION_RUN_CONSOLE_RUNTIME_CAPABILITY]),
    listRuns: vi.fn().mockResolvedValue(catalog()),
    getSnapshot: vi.fn().mockResolvedValue(snapshot()),
    callOperator: vi.fn().mockResolvedValue({ ok: true }),
    installInterval: vi.fn(() => vi.fn()),
    ...overrides
  }
}

async function flush(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('OrchestrationRunConsoleClient', () => {
  it('gates old runtimes before console reads or mutations', async () => {
    const deps = dependencies({ getCapabilities: vi.fn().mockResolvedValue([]) })
    const client = new OrchestrationRunConsoleClient(vi.fn(), deps)

    await client.refreshNow()

    expect(client.getState().capability).toBe('unsupported')
    expect(deps.listRuns).not.toHaveBeenCalled()
    await expect(
      client.callOperator('orchestration.consoleReply', {}, 'request-1')
    ).rejects.toThrow('orchestration.run-console.v1')
    expect(deps.callOperator).not.toHaveBeenCalled()
  })

  it('ignores a slow response after switching runtime targets', async () => {
    let resolveLocal!: (value: OrchestrationRunConsoleListResult) => void
    const listRuns = vi.fn((target: RuntimeClientTarget) =>
      target.kind === 'local'
        ? new Promise<OrchestrationRunConsoleListResult>((resolve) => {
            resolveLocal = resolve
          })
        : Promise.resolve(catalog('remote-run'))
    )
    const deps = dependencies({ listRuns })
    const client = new OrchestrationRunConsoleClient(vi.fn(), deps)
    const localRefresh = client.refreshNow()
    await flush()

    client.setTarget(REMOTE)
    await flush()
    resolveLocal(catalog('local-run'))
    await localRefresh
    await flush()

    expect(client.getState().target).toEqual(REMOTE)
    expect(client.getState().catalog?.runs[0].id).toBe('remote-run')
  })

  it('keeps the last good snapshot stale during a transient failure', async () => {
    const deps = dependencies()
    const client = new OrchestrationRunConsoleClient(vi.fn(), deps)
    client.selectRun('run-1')
    await client.refreshNow()
    vi.mocked(deps.listRuns).mockRejectedValueOnce(new Error('SSH disconnected'))

    await client.refreshNow()

    expect(client.getState()).toMatchObject({
      stale: true,
      error: 'SSH disconnected',
      snapshot: { run: { id: 'run-1' } }
    })
  })

  it('uses visibility-aware polling and slows completed snapshots', async () => {
    let intervalArgs: Parameters<RunConsoleClientDependencies['installInterval']>[0] | undefined
    const deps = dependencies({
      getSnapshot: vi.fn().mockResolvedValue({
        ...snapshot(),
        run: { ...snapshot().run, state: 'completed' }
      }),
      installInterval: vi.fn((args) => {
        intervalArgs = args
        return vi.fn()
      })
    })
    const client = new OrchestrationRunConsoleClient(vi.fn(), deps)
    client.selectRun('run-1')
    await client.refreshNow()
    vi.mocked(deps.getSnapshot).mockClear()
    client.start()

    intervalArgs?.run()
    intervalArgs?.run()
    intervalArgs?.run()
    await flush()
    expect(deps.getSnapshot).not.toHaveBeenCalled()
    intervalArgs?.run()
    await flush()
    expect(deps.getSnapshot).toHaveBeenCalledTimes(1)
  })

  it('refreshes immediately after a durable operator mutation', async () => {
    const deps = dependencies()
    const client = new OrchestrationRunConsoleClient(vi.fn(), deps)
    client.selectRun('run-1')
    await client.refreshNow()
    vi.mocked(deps.listRuns).mockClear()
    vi.mocked(deps.getSnapshot).mockClear()

    await client.callOperator(
      'orchestration.consoleSendFollowup',
      { run: 'run-1', dispatch: 'dispatch-1', body: 'Check tests' },
      'stable-request-1'
    )

    expect(deps.callOperator).toHaveBeenCalledWith(
      LOCAL,
      'orchestration.consoleSendFollowup',
      expect.any(Object),
      'stable-request-1'
    )
    expect(deps.listRuns).toHaveBeenCalledTimes(1)
    expect(deps.getSnapshot).toHaveBeenCalledTimes(1)
  })

  it('routes reads and mutations through one environment without workspace metadata', async () => {
    const deps = dependencies()
    const client = new OrchestrationRunConsoleClient(vi.fn(), deps, REMOTE)
    client.selectRun('run-1')

    await client.refreshNow()
    await client.callOperator(
      'orchestration.consoleResolveGate',
      { run: 'run-1', gate: 'gate-1', resolution: 'approved' },
      'remote-request-1'
    )

    expect(deps.getCapabilities).toHaveBeenCalledWith(REMOTE, expect.any(AbortSignal))
    expect(deps.listRuns).toHaveBeenCalledWith(REMOTE, expect.any(AbortSignal))
    expect(deps.getSnapshot).toHaveBeenCalledWith(REMOTE, 'run-1', expect.any(AbortSignal))
    expect(deps.callOperator).toHaveBeenCalledWith(
      REMOTE,
      'orchestration.consoleResolveGate',
      { run: 'run-1', gate: 'gate-1', resolution: 'approved' },
      'remote-request-1'
    )
  })

  it('does not apply a previous target mutation response after a target switch', async () => {
    let resolveMutation!: (value: { operatorAction: { state: string } }) => void
    const callOperator = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveMutation = resolve
        })
    ) as unknown as RunConsoleClientDependencies['callOperator']
    const deps = dependencies({
      listRuns: vi.fn((target: RuntimeClientTarget) =>
        Promise.resolve(catalog(target.kind === 'local' ? 'local-run' : 'remote-run'))
      ),
      callOperator
    })
    const client = new OrchestrationRunConsoleClient(vi.fn(), deps)
    await client.refreshNow()
    const mutation = client.callOperator('orchestration.consoleStopWorker', {}, 'request-local')

    client.setTarget(REMOTE)
    await flush()
    resolveMutation({ operatorAction: { state: 'completed' } })
    await mutation
    await flush()

    expect(deps.callOperator).toHaveBeenCalledWith(
      LOCAL,
      'orchestration.consoleStopWorker',
      {},
      'request-local'
    )
    expect(client.getState().target).toEqual(REMOTE)
    expect(client.getState().catalog?.runs[0].id).toBe('remote-run')
  })

  it('appends bounded catalog pages without duplicate runs', async () => {
    const deps = dependencies({
      listRuns: vi
        .fn()
        .mockResolvedValueOnce({ ...catalog('run-1'), nextCursor: 'cursor-2' })
        .mockResolvedValueOnce({
          runs: [catalog('run-1').runs[0], catalog('run-2').runs[0]],
          nextCursor: null
        })
    })
    const client = new OrchestrationRunConsoleClient(vi.fn(), deps)
    await client.refreshNow()

    await client.loadMoreRuns()

    expect(deps.listRuns).toHaveBeenLastCalledWith(LOCAL, expect.any(AbortSignal), 'cursor-2')
    expect(client.getState().catalog?.runs.map((entry) => entry.id)).toEqual(['run-1', 'run-2'])
  })
})
