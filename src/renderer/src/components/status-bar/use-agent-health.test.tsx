// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  probeAgentHealth: vi.fn(async () => []),
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
  return <span>{health.isProbing ? 'probing' : health.snapshots.length}</span>
}

describe('useAgentHealth', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.useFakeTimers()
    mocks.probeAgentHealth.mockClear()
    window.api = { preflight: { probeAgentHealth: mocks.probeAgentHealth } } as never
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
})
