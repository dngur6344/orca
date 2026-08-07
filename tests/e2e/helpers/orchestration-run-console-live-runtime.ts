import type { Page } from '@stablyai/playwright-test'
import { expect } from '@stablyai/playwright-test'
import type { RuntimeClient } from '../../../src/cli/runtime-client'
import type { OrchestrationRunConsoleSnapshot } from '../../../src/shared/orchestration-run-console'
import {
  isRunConsoleProcessAlive,
  readDispatchCapability,
  readRunConsoleSpawnPids
} from './orchestration-run-console-process-fixture'

export type LiveRunConsoleWorker = {
  taskId: string
  dispatchId: string
  handle: string
  pid: number
  capability: string
}

export async function callDesktopOperator<TResult>(
  page: Page,
  method: string,
  params: Record<string, unknown>,
  orchestrationRequestId: string
): Promise<TResult> {
  return page.evaluate(
    async ({ method, params, orchestrationRequestId }) => {
      const response = await window.api.runtime.call({
        method,
        params,
        orchestrationRequestId
      })
      if (!response.ok) {
        throw new Error(`${response.error.code}: ${response.error.message}`)
      }
      return response.result
    },
    { method, params, orchestrationRequestId }
  ) as Promise<TResult>
}

export async function startLiveRunConsoleWorker(
  client: RuntimeClient,
  runId: string,
  coordinatorHandle: string,
  label: string,
  expectedSpawnCount: number
): Promise<LiveRunConsoleWorker> {
  const created = await client.call<{ task: { id: string } }>('orchestration.taskCreate', {
    spec: `${label}: remain alive until the operator acts`,
    taskTitle: label,
    run: runId,
    callerTerminalHandle: coordinatorHandle
  })
  const started = await client.call<{
    dispatchId: string
    state: string
    effects: { kind: string; role?: string; id?: string }[]
  }>('orchestration.workerStart', {
    task: created.result.task.id,
    from: coordinatorHandle,
    run: runId,
    agent: 'codex',
    timeoutMs: 15_000
  })
  const handle = started.result.effects.find(
    (effect) => effect.kind === 'terminal' && effect.role === 'agent'
  )?.id
  if (started.result.state !== 'ready' && handle) {
    const read = await client.call<{ terminal: { tail: string[] } }>('terminal.read', {
      terminal: handle,
      limit: 200
    })
    throw new Error(
      JSON.stringify({ receipt: started.result, terminalTail: read.result.terminal.tail }, null, 2)
    )
  }
  expect(started.result, JSON.stringify(started.result, null, 2)).toMatchObject({ state: 'ready' })
  expect(handle).toBeTruthy()
  await expect.poll(readRunConsoleSpawnPids).toHaveLength(expectedSpawnCount)
  const pid = readRunConsoleSpawnPids()[expectedSpawnCount - 1]
  let capability: string | null = null
  await expect
    .poll(() => {
      capability = readDispatchCapability(pid)
      return capability
    })
    .toMatch(/^dcap_/)
  expect(isRunConsoleProcessAlive(pid)).toBe(true)
  return {
    taskId: created.result.task.id,
    dispatchId: started.result.dispatchId,
    handle: handle as string,
    pid,
    capability: capability as string
  }
}

export async function readRunConsoleSnapshot(
  client: RuntimeClient,
  runId: string
): Promise<OrchestrationRunConsoleSnapshot> {
  return (
    await client.call<OrchestrationRunConsoleSnapshot>('orchestration.consoleSnapshot', {
      run: runId
    })
  ).result
}
