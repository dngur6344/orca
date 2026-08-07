// @vitest-environment happy-dom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  OrchestrationRunConsoleRunSummary,
  OrchestrationRunConsoleSnapshot
} from '../../../../shared/orchestration-run-console'
import { RunConsoleAttentionQueue } from './RunConsoleAttentionQueue'
import { RunConsoleRunList } from './RunConsoleRunList'
import { getRunConsoleBlockingState } from './run-console-page-state'
import { groupRunConsoleRuns } from './run-console-run-groups'

const roots: Root[] = []

function run(
  id: string,
  state: OrchestrationRunConsoleRunSummary['state'],
  legacyReadOnly = false
): OrchestrationRunConsoleRunSummary {
  return {
    id,
    objective: `Objective ${id}`,
    legacyReadOnly,
    state,
    counts: {
      tasks: 2,
      terminalTasks: state === 'completed' ? 2 : 0,
      activeTasks: state === 'active' ? 1 : 0,
      pendingQuestions: state === 'needs_attention' ? 1 : 0,
      pendingGates: 0,
      failedTasks: 0,
      circuitBrokenDispatches: 0,
      resourceDecisions: 0
    },
    createdAt: '2026-08-07T00:00:00Z',
    updatedAt: '2026-08-07T00:00:00Z'
  }
}

function snapshot(): OrchestrationRunConsoleSnapshot {
  const selectedRun = run('run-attention', 'needs_attention')
  return {
    run: selectedRun,
    tasks: [
      {
        id: 'task-question',
        runId: selectedRun.id,
        parentId: null,
        title: 'Choose approach',
        displayName: null,
        spec: 'Choose',
        status: 'blocked',
        dependencyIds: [],
        dependenciesValid: true,
        result: null,
        createdAt: '2026-08-07T00:00:00Z',
        completedAt: null
      }
    ],
    dispatches: [],
    questions: [
      {
        messageId: 'question-1',
        runId: selectedRun.id,
        taskId: 'task-question',
        dispatchId: 'dispatch-1',
        prompt: 'Which approach?',
        options: [],
        status: 'pending',
        createdAt: '2026-08-07T00:00:00Z',
        answeredAt: null
      }
    ],
    gates: [],
    messages: [],
    workers: [],
    operatorActions: [],
    attention: [
      {
        id: 'question:question-1',
        kind: 'question',
        runId: selectedRun.id,
        taskId: 'task-question',
        dispatchId: 'dispatch-1',
        createdAt: '2026-08-07T00:00:00Z'
      }
    ],
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

async function render(node: React.ReactNode): Promise<HTMLDivElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () => root.render(node))
  return container
}

afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()))
  document.body.innerHTML = ''
})

describe('Run Console shell', () => {
  it('groups and filters runs while keeping legacy runs explicitly read-only', async () => {
    const runs = [
      run('attention', 'needs_attention'),
      run('active', 'active'),
      run('legacy', 'unknown', true),
      run('completed', 'completed')
    ]
    expect(groupRunConsoleRuns(runs, '', 'all').map((group) => group.runs.length)).toEqual([
      1, 2, 1
    ])
    expect(groupRunConsoleRuns(runs, 'completed', 'all')[2].runs[0].id).toBe('completed')
    const onSelect = vi.fn()
    const container = await render(
      <RunConsoleRunList
        runs={runs}
        selectedRunId="active"
        loading={false}
        loadingMore={false}
        hasMore={false}
        onSelect={onSelect}
        onLoadMore={vi.fn()}
      />
    )

    expect(container.textContent).toContain('Read-only')
    const completedButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Objective completed')
    )!
    completedButton.focus()
    expect(document.activeElement).toBe(completedButton)
    await act(async () => completedButton.click())
    expect(onSelect).toHaveBeenCalledWith('completed')

    const search = container.querySelector('input[aria-label="Search runs"]')!
    await act(async () => fireEvent.change(search, { target: { value: 'legacy' } }))
    expect(container.textContent).toContain('Objective legacy')
    expect(container.textContent).not.toContain('Objective active')
  })

  it('selects the exact task from the attention queue', async () => {
    const onSelectTask = vi.fn()
    const container = await render(
      <RunConsoleAttentionQueue
        snapshot={snapshot()}
        selectedTaskId={null}
        onSelectTask={onSelectTask}
      />
    )

    const question = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Which approach?')
    )!
    await act(async () => question.click())
    expect(onSelectTask).toHaveBeenCalledWith('task-question')
  })

  it('distinguishes setup, old-runtime, unavailable, and stale-capable states', () => {
    const base = { capability: 'supported' as const, catalog: null, error: null }
    expect(getRunConsoleBlockingState(false, base)).toBe('no_setup')
    expect(getRunConsoleBlockingState(true, { ...base, capability: 'unsupported' })).toBe(
      'update_required'
    )
    expect(getRunConsoleBlockingState(true, { ...base, error: 'offline' })).toBe('unavailable')
    expect(
      getRunConsoleBlockingState(true, {
        ...base,
        catalog: { runs: [], nextCursor: null },
        error: 'offline'
      })
    ).toBeNull()
  })
})
