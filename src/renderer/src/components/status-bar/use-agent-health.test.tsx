// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  probeAgentHealth: vi.fn(async () => []),
  updateAgent: vi.fn(async () => ({
    provider: 'codex' as const,
    outcome: 'updated' as const,
    previousVersion: '0.146.1',
    currentVersion: '0.147.0'
  })),
  getState: vi.fn(() => ({}))
}))

vi.mock('../../store', () => ({
  useAppStore: Object.assign(vi.fn(), { getState: mocks.getState })
}))
vi.mock('@/lib/local-preflight-context', () => ({
  getLocalAgentPreflightContext: () => undefined
}))
vi.mock('@/runtime/runtime-rpc-client', () => ({
  callRuntimeRpc: vi.fn(),
  RuntimeRpcCallError: class extends Error {}
}))

import { useAgentHealth } from './use-agent-health'

function Harness({ enabled = true }: { enabled?: boolean }): React.JSX.Element {
  const health = useAgentHealth(null, enabled)
  return (
    <>
      <span>{health.isProbing ? 'probing' : health.snapshots.length}</span>
      <span data-testid="update-state">{health.updateStates.codex?.status ?? ''}</span>
      <button type="button" onClick={() => void health.update('codex')}>
        Update
      </button>
    </>
  )
}

describe('useAgentHealth', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.useFakeTimers()
    mocks.probeAgentHealth.mockClear()
    mocks.updateAgent.mockClear()
    window.api = {
      preflight: {
        probeAgentHealth: mocks.probeAgentHealth,
        updateAgent: mocks.updateAgent
      }
    } as never
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  it('probes immediately and then every 15 minutes', async () => {
    await act(async () => root.render(<Harness />))
    expect(mocks.probeAgentHealth).toHaveBeenCalledOnce()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15 * 60_000)
    })

    expect(mocks.probeAgentHealth).toHaveBeenCalledTimes(2)
  })

  it('waits until the settings target is ready', async () => {
    await act(async () => root.render(<Harness enabled={false} />))

    expect(mocks.probeAgentHealth).not.toHaveBeenCalled()
  })

  it('updates the selected local agent and refreshes its health', async () => {
    await act(async () => root.render(<Harness />))
    mocks.probeAgentHealth.mockClear()

    await act(async () => {
      container.querySelector('button')?.click()
    })

    expect(mocks.updateAgent).toHaveBeenCalledWith({ provider: 'codex' })
    expect(container.querySelector('[data-testid="update-state"]')?.textContent).toBe('updated')
    expect(mocks.probeAgentHealth).toHaveBeenCalledOnce()
  })
})
