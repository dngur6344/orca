// @vitest-environment happy-dom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  OrchestrationRunConsoleDispatch,
  OrchestrationRunConsoleQuestion,
  OrchestrationRunConsoleTask,
  OrchestrationRunConsoleWorker
} from '../../../../shared/orchestration-run-console'
import { RuntimeRpcCallError } from '@/runtime/runtime-rpc-client'
import { RunConsoleQuestionAction } from './RunConsoleQuestionAction'
import {
  getRunConsoleWorkerActionAvailability,
  RunConsoleWorkerActions
} from './RunConsoleWorkerActions'
import type { RunConsoleOperatorCall } from './run-console-operator-types'
import {
  isRunConsoleOperatorOutcomeUnknown,
  useRunConsoleOperatorSubmit
} from './use-run-console-operator-submit'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const roots: Root[] = []

async function render(node: React.ReactNode): Promise<HTMLDivElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () => root.render(node))
  return container
}

afterEach(async () => {
  vi.restoreAllMocks()
  await act(async () => roots.splice(0).forEach((root) => root.unmount()))
  document.body.innerHTML = ''
})

describe('Run Console operator actions', () => {
  it('prevents double submits and reuses the request ID after an unknown outcome', async () => {
    let rejectFirst!: (error: Error) => void
    const first = new Promise<never>((_resolve, reject) => {
      rejectFirst = reject
    })
    const call = vi
      .fn()
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce({ operatorAction: { state: 'completed', replayCount: 1 } })
      .mockResolvedValueOnce({
        operatorAction: { state: 'completed', replayCount: 0 }
      }) as RunConsoleOperatorCall
    const container = await render(<SubmitHarness callOperator={call} />)
    const submit = button(container, 'Submit')

    await act(async () => {
      submit.click()
      submit.click()
    })
    expect(call).toHaveBeenCalledTimes(1)
    const firstRequestId = vi.mocked(call).mock.calls[0][2]
    await act(async () => rejectFirst(new Error('SSH connection closed')))
    expect(container.textContent).toContain('unknown')

    await act(async () => button(container, 'Retry').click())
    expect(vi.mocked(call).mock.calls[1][2]).toBe(firstRequestId)
    expect(container.textContent).toContain('success')

    await act(async () => submit.click())
    expect(vi.mocked(call).mock.calls[2][2]).not.toBe(firstRequestId)
  })

  it('classifies durable runtime failures separately from uncertain transport failures', () => {
    const definite = new RuntimeRpcCallError({
      id: 'rpc-1',
      ok: false,
      error: { code: 'dispatch_not_found', message: 'Gone' },
      _meta: { runtimeId: 'runtime-1' }
    })
    const unknown = new RuntimeRpcCallError({
      id: 'rpc-2',
      ok: false,
      error: { code: 'operation_unknown', message: 'Unknown' },
      _meta: { runtimeId: 'runtime-1' }
    })
    expect(isRunConsoleOperatorOutcomeUnknown(definite)).toBe(false)
    expect(isRunConsoleOperatorOutcomeUnknown(unknown)).toBe(true)
    expect(isRunConsoleOperatorOutcomeUnknown(new Error('socket closed'))).toBe(true)
  })

  it('validates question text and routes the exact run and question', async () => {
    const call = vi.fn().mockResolvedValue({ operatorAction: { state: 'completed' } })
    const container = await render(
      <RunConsoleQuestionAction
        question={question()}
        runId="run-1"
        targetLabel="Local runtime"
        disabled={false}
        callOperator={call as RunConsoleOperatorCall}
      />
    )
    const send = button(container, 'Send answer')
    expect(send.disabled).toBe(true)
    const textarea = container.querySelector('textarea')!
    await act(async () => fireEvent.change(textarea, { target: { value: '  Proceed  ' } }))
    expect(send.disabled).toBe(false)
    await act(async () => send.click())
    expect(call).toHaveBeenCalledWith(
      'orchestration.consoleReply',
      { run: 'run-1', question: 'question-1', body: 'Proceed' },
      expect.any(String)
    )
  })

  it('fails closed for stale, legacy, terminal, and federated worker states', () => {
    const base = {
      worker: worker(),
      dispatch: dispatch(),
      legacyReadOnly: false,
      staleIdentity: false
    }
    expect(getRunConsoleWorkerActionAvailability(base)).toEqual({
      followup: true,
      stop: true,
      abandon: true,
      release: true,
      retain: true
    })
    expect(getRunConsoleWorkerActionAvailability({ ...base, staleIdentity: true })).toEqual({
      followup: false,
      stop: false,
      abandon: false,
      release: false,
      retain: false
    })
    const federated = {
      ...worker(),
      federation: {
        environmentId: 'env-1',
        environmentName: 'Worker',
        remoteWorktreeId: 'wt-1',
        remoteTerminalHandle: 'term-remote'
      }
    }
    expect(getRunConsoleWorkerActionAvailability({ ...base, worker: federated }).release).toBe(
      false
    )
    expect(
      getRunConsoleWorkerActionAvailability({
        ...base,
        worker: { ...worker(), workerState: 'succeeded' }
      })
    ).toMatchObject({ followup: false, stop: false, abandon: false })
  })

  it('confirms exact identity, restores focus on cancel, and submits once', async () => {
    let resolveCall!: (value: unknown) => void
    const call = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveCall = resolve
      })
    )
    const container = await render(
      <RunConsoleWorkerActions
        runId="run-1"
        task={task()}
        dispatch={dispatch()}
        worker={worker()}
        targetLabel="SSH worker host"
        legacyReadOnly={false}
        staleIdentity={false}
        callOperator={call as RunConsoleOperatorCall}
      />
    )
    const stop = button(container, 'Stop')
    stop.focus()
    await act(async () => stop.click())
    expect(document.body.textContent).toContain('SSH worker host')
    expect(document.body.textContent).toContain('dispatch-1')
    await act(async () => button(document.body, 'Cancel').click())
    await flushMicrotask()
    expect(document.activeElement).toBe(stop)

    await act(async () => stop.click())
    const confirm = button(document.body, 'Stop worker')
    await act(async () => {
      confirm.click()
      confirm.click()
    })
    expect(call).toHaveBeenCalledTimes(1)
    expect(call).toHaveBeenCalledWith(
      'orchestration.consoleStopWorker',
      { run: 'run-1', dispatch: 'dispatch-1' },
      expect.any(String)
    )
    await act(async () => resolveCall({ operatorAction: { state: 'completed' } }))
  })
})

function SubmitHarness({
  callOperator
}: {
  callOperator: RunConsoleOperatorCall
}): React.JSX.Element {
  const action = useRunConsoleOperatorSubmit('run-1:dispatch-1', callOperator)
  return (
    <div>
      <span>{action.phase}</span>
      <button onClick={() => void action.submit('method', { run: 'run-1' })}>Submit</button>
      <button onClick={() => void action.retry()}>Retry</button>
    </div>
  )
}

function button(root: ParentNode, label: string): HTMLButtonElement {
  return Array.from(root.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim() === label
  )!
}

async function flushMicrotask(): Promise<void> {
  await act(async () => new Promise<void>((resolve) => queueMicrotask(resolve)))
}

function task(): OrchestrationRunConsoleTask {
  return {
    id: 'task-1',
    runId: 'run-1',
    parentId: null,
    title: 'Task',
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
    id: 'dispatch-1',
    runId: 'run-1',
    taskId: 'task-1',
    contractVersion: 1,
    assigneeHandle: 'term-1',
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
    dispatchId: 'dispatch-1',
    taskId: 'task-1',
    runId: 'run-1',
    workerState: 'ready',
    dispatchStatus: 'dispatched',
    agentTerminalHandle: 'term-1',
    terminalState: 'running',
    resource: {
      id: 'resource-1',
      worktreeId: 'wt-1',
      terminalHandle: 'term-1',
      ownershipState: 'orchestration',
      releaseState: 'active',
      retainedReason: null
    },
    federation: null,
    createdAt: '2026-08-07T00:00:01Z'
  }
}

function question(): OrchestrationRunConsoleQuestion {
  return {
    messageId: 'question-1',
    runId: 'run-1',
    taskId: 'task-1',
    dispatchId: 'dispatch-1',
    prompt: 'Proceed?',
    options: ['Proceed', 'Hold'],
    status: 'pending',
    createdAt: '2026-08-07T00:00:02Z',
    answeredAt: null
  }
}
