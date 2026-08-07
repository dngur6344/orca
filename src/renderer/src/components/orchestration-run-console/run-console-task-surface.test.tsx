// @vitest-environment happy-dom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  OrchestrationRunConsoleSnapshot,
  OrchestrationRunConsoleTask,
  OrchestrationRunConsoleWorker
} from '../../../../shared/orchestration-run-console'
import { RunConsoleTaskInspector } from './RunConsoleTaskInspector'
import { RunConsoleTaskSurface } from './RunConsoleTaskSurface'
import { resolveRunConsoleWorkerTerminalTarget } from './open-run-console-worker-terminal'
import { readRunConsoleWorkerOutput } from './run-console-worker-output'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

vi.mock('./run-console-worker-output', () => {
  return {
    readRunConsoleWorkerOutput: vi.fn(),
    formatRunConsoleWorkerOutput: vi.fn(() => 'worker output')
  }
})

vi.mock('@/components/ui/tabs', async () => {
  const ReactModule = await import('react')
  const Context = ReactModule.createContext({ value: '', onValueChange: (_value: string) => {} })
  function Tabs({
    value,
    onValueChange,
    children,
    ...props
  }: React.ComponentProps<'div'> & {
    value: string
    onValueChange: (value: string) => void
  }): React.JSX.Element {
    const contextValue = ReactModule.useMemo(
      () => ({ value, onValueChange }),
      [onValueChange, value]
    )
    return (
      <Context.Provider value={contextValue}>
        <div {...props}>{children}</div>
      </Context.Provider>
    )
  }
  return {
    Tabs,
    TabsList: ({ children, ...props }: React.ComponentProps<'div'>) => (
      <div {...props}>{children}</div>
    ),
    TabsTrigger: ({
      value,
      children,
      ...props
    }: React.ComponentProps<'button'> & { value: string }) => {
      const context = ReactModule.useContext(Context)
      return (
        <button
          {...props}
          data-state={context.value === value ? 'active' : 'inactive'}
          onClick={() => context.onValueChange(value)}
        >
          {children}
        </button>
      )
    },
    TabsContent: ({
      value,
      children,
      ...props
    }: React.ComponentProps<'div'> & { value: string }) => {
      const context = ReactModule.useContext(Context)
      return context.value === value ? <div {...props}>{children}</div> : null
    }
  }
})

const roots: Root[] = []

function task(id: string, dependencyIds: string[] = []): OrchestrationRunConsoleTask {
  return {
    id,
    runId: 'run-1',
    parentId: null,
    title: `Task ${id}`,
    displayName: null,
    spec: `Implement ${id}`,
    status: id === 'd' ? 'completed' : 'pending',
    dependencyIds,
    dependenciesValid: true,
    result: id === 'd' ? 'Done' : null,
    createdAt: `2026-08-07T00:00:0${id.charCodeAt(0) - 96}Z`,
    completedAt: id === 'd' ? '2026-08-07T00:01:00Z' : null
  }
}

function snapshot(): OrchestrationRunConsoleSnapshot {
  const tasks = [task('a'), task('b', ['a']), task('c', ['a']), task('d', ['b', 'c'])]
  return {
    run: {
      id: 'run-1',
      objective: 'Ship the console',
      legacyReadOnly: false,
      state: 'active',
      counts: {
        tasks: 4,
        terminalTasks: 1,
        activeTasks: 3,
        pendingQuestions: 0,
        pendingGates: 0,
        failedTasks: 0,
        circuitBrokenDispatches: 0,
        resourceDecisions: 0
      },
      createdAt: '2026-08-07T00:00:00Z',
      updatedAt: '2026-08-07T00:01:00Z'
    },
    tasks,
    dispatches: [
      {
        id: 'dispatch-a-old',
        runId: 'run-1',
        taskId: 'a',
        contractVersion: 1,
        assigneeHandle: 'term-a-old',
        status: 'failed',
        failureCount: 1,
        lastFailure: 'Timed out',
        dispatchedAt: '2026-08-07T00:00:00Z',
        completedAt: '2026-08-07T00:00:01Z',
        createdAt: '2026-08-07T00:00:00Z',
        lastHeartbeatAt: null
      },
      {
        id: 'dispatch-a',
        runId: 'run-1',
        taskId: 'a',
        contractVersion: 1,
        assigneeHandle: 'term-a',
        status: 'dispatched',
        failureCount: 0,
        lastFailure: null,
        dispatchedAt: '2026-08-07T00:00:01Z',
        completedAt: null,
        createdAt: '2026-08-07T00:00:01Z',
        lastHeartbeatAt: null
      }
    ],
    questions: [],
    gates: [],
    messages: [],
    workers: [worker()],
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

function worker(): OrchestrationRunConsoleWorker {
  return {
    dispatchId: 'dispatch-a',
    taskId: 'a',
    runId: 'run-1',
    workerState: 'running',
    dispatchStatus: 'dispatched',
    agentTerminalHandle: 'term-a',
    terminalState: 'running',
    resource: null,
    federation: null,
    createdAt: '2026-08-07T00:00:01Z'
  }
}

async function render(node: React.ReactNode): Promise<HTMLDivElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () => root.render(node))
  return container
}

afterEach(async () => {
  vi.clearAllMocks()
  await act(async () => roots.splice(0).forEach((root) => root.unmount()))
  document.body.innerHTML = ''
})

describe('Run Console task surface', () => {
  it('renders presentation-only edges and supports toggle and arrow-key task focus', async () => {
    const onSelectTask = vi.fn()
    const onViewModeChange = vi.fn()
    const container = await render(
      <RunConsoleTaskSurface
        snapshot={snapshot()}
        selectedTaskId="a"
        viewMode="graph"
        target={{ kind: 'local' }}
        targetLabel="Local runtime"
        onSelectTask={onSelectTask}
        onViewModeChange={onViewModeChange}
      />
    )

    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
    const firstTask = container.querySelector<HTMLButtonElement>('[data-run-console-task-id="a"]')!
    firstTask.focus()
    await act(async () => fireEvent.keyDown(firstTask, { key: 'ArrowRight' }))
    expect(onSelectTask).toHaveBeenCalledWith('b')
    expect(document.activeElement).toBe(container.querySelector('[data-run-console-task-id="b"]'))

    const outline = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Outline'
    )!
    await act(async () => outline.click())
    expect(onViewModeChange).toHaveBeenCalledWith('outline')
  })

  it('loads heavy worker output only after the Worker tab is opened', async () => {
    vi.mocked(readRunConsoleWorkerOutput).mockResolvedValue({
      dispatchId: 'dispatch-a',
      source: 'terminal',
      sourceIdentity: 'term-a',
      terminal: {
        handle: 'term-a',
        status: 'running',
        tail: ['worker output'],
        truncated: false,
        nextCursor: null
      },
      cursor: null,
      status: { worker: 'running', terminal: 'running' },
      fallbackReason: null,
      warnings: []
    })
    const runSnapshot = snapshot()
    const container = await render(
      <RunConsoleTaskInspector
        snapshot={runSnapshot}
        task={runSnapshot.tasks[0]}
        target={{ kind: 'local' }}
        targetLabel="Local runtime"
      />
    )

    expect(readRunConsoleWorkerOutput).not.toHaveBeenCalled()
    const workerTab = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Worker'
    )!
    await act(async () => {
      fireEvent.click(workerTab)
    })
    await act(async () => {
      await new Promise<void>((resolve) => queueMicrotask(resolve))
    })
    expect(workerTab.getAttribute('data-state')).toBe('active')
    expect(readRunConsoleWorkerOutput).toHaveBeenCalledWith(
      { kind: 'local' },
      'dispatch-a',
      expect.any(AbortSignal)
    )
    expect(container.textContent).toContain('worker output')

    const attemptsTab = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Attempts'
    )!
    await act(async () => fireEvent.click(attemptsTab))
    expect(container.textContent).toContain('dispatch-a-old')
    expect(container.textContent).toContain('dispatch-a')
  })

  it('routes a federated worker to its exact remote terminal', () => {
    const federated = {
      ...worker(),
      federation: {
        environmentId: 'env-worker',
        environmentName: 'Worker host',
        remoteWorktreeId: 'wt-remote',
        remoteTerminalHandle: 'term-remote'
      }
    }
    expect(resolveRunConsoleWorkerTerminalTarget({ kind: 'local' }, federated)).toEqual({
      target: { kind: 'environment', environmentId: 'env-worker' },
      environmentId: 'env-worker',
      handle: 'term-remote'
    })
  })
})
