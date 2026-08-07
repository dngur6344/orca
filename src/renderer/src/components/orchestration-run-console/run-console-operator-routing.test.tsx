// @vitest-environment happy-dom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  OrchestrationRunConsoleDispatch,
  OrchestrationRunConsoleGate,
  OrchestrationRunConsoleTask,
  OrchestrationRunConsoleWorker
} from '../../../../shared/orchestration-run-console'
import { RunConsoleGateAction } from './RunConsoleGateAction'
import { RunConsoleWorkerActions } from './RunConsoleWorkerActions'
import type { RunConsoleOperatorCall } from './run-console-operator-types'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const roots: Root[] = []

afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()))
  document.body.innerHTML = ''
})

describe('Run Console operator routing', () => {
  it('routes every confirmed worker action to its exact RPC', async () => {
    const cases = [
      ['Stop', 'Stop worker', 'orchestration.consoleStopWorker'],
      ['Abandon', 'Abandon worker', 'orchestration.consoleAbandonWorker'],
      ['Release', 'Release resource', 'orchestration.consoleReleaseWorker'],
      ['Retain', 'Retain resource', 'orchestration.consoleRetainWorker']
    ] as const

    for (const [buttonLabel, confirmLabel, method] of cases) {
      const call = vi.fn().mockResolvedValue({ operatorAction: { state: 'completed' } })
      const container = await render(
        <RunConsoleWorkerActions
          runId="run-exact"
          task={task()}
          dispatch={dispatch()}
          worker={worker()}
          targetLabel="Connected host"
          legacyReadOnly={false}
          staleIdentity={false}
          callOperator={call as RunConsoleOperatorCall}
        />
      )
      await act(async () => button(container, buttonLabel).click())
      expect(document.body.textContent).toContain('Connected host')
      expect(document.body.textContent).toContain('task-exact')
      await act(async () => button(document.body, confirmLabel).click())
      expect(call).toHaveBeenCalledWith(
        method,
        { run: 'run-exact', dispatch: 'dispatch-exact' },
        expect.any(String)
      )
    }
  })

  it('resolves only a selected gate option and disables legacy runs', async () => {
    const call = vi.fn().mockResolvedValue({ operatorAction: { state: 'completed' } })
    const container = await render(
      <RunConsoleGateAction
        gate={gate()}
        runId="run-exact"
        targetLabel="Connected host"
        disabled={false}
        callOperator={call as RunConsoleOperatorCall}
      />
    )
    const resolve = button(container, 'Resolve gate')
    expect(resolve.disabled).toBe(true)
    await act(async () => button(container, 'Allow').click())
    await act(async () => resolve.click())
    expect(call).toHaveBeenCalledWith(
      'orchestration.consoleResolveGate',
      { run: 'run-exact', gate: 'gate-exact', resolution: 'Allow' },
      expect.any(String)
    )

    const legacy = await render(
      <RunConsoleGateAction
        gate={gate()}
        runId="run-exact"
        targetLabel="Connected host"
        disabled={true}
        callOperator={call as RunConsoleOperatorCall}
      />
    )
    expect(button(legacy, 'Allow').disabled).toBe(true)
    expect(legacy.textContent).toContain('Action unavailable')
  })
})

async function render(node: React.ReactNode): Promise<HTMLDivElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () => root.render(node))
  return container
}

function button(root: ParentNode, label: string): HTMLButtonElement {
  return Array.from(root.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim() === label
  )!
}

function task(): OrchestrationRunConsoleTask {
  return {
    id: 'task-exact',
    runId: 'run-exact',
    parentId: null,
    title: 'Exact task',
    displayName: null,
    spec: 'Work',
    status: 'dispatched',
    dependencyIds: [],
    dependenciesValid: true,
    result: null,
    createdAt: '2026-08-07T00:00:00Z',
    completedAt: null
  }
}

function dispatch(): OrchestrationRunConsoleDispatch {
  return {
    id: 'dispatch-exact',
    runId: 'run-exact',
    taskId: 'task-exact',
    contractVersion: 1,
    assigneeHandle: 'term-exact',
    status: 'dispatched',
    failureCount: 0,
    lastFailure: null,
    dispatchedAt: '2026-08-07T00:00:01Z',
    completedAt: null,
    createdAt: '2026-08-07T00:00:01Z',
    lastHeartbeatAt: null
  }
}

function worker(): OrchestrationRunConsoleWorker {
  return {
    dispatchId: 'dispatch-exact',
    taskId: 'task-exact',
    runId: 'run-exact',
    workerState: 'ready',
    dispatchStatus: 'dispatched',
    agentTerminalHandle: 'term-exact',
    terminalState: 'running',
    resource: {
      id: 'resource-exact',
      worktreeId: 'wt-exact',
      terminalHandle: 'term-exact',
      ownershipState: 'orchestration',
      releaseState: 'active',
      retainedReason: null
    },
    federation: null,
    createdAt: '2026-08-07T00:00:01Z'
  }
}

function gate(): OrchestrationRunConsoleGate {
  return {
    id: 'gate-exact',
    runId: 'run-exact',
    taskId: 'task-exact',
    question: 'Allow this action?',
    options: ['Allow', 'Reject'],
    status: 'pending',
    resolution: null,
    createdAt: '2026-08-07T00:00:02Z',
    resolvedAt: null
  }
}
