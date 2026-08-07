import { useCallback, useEffect, useRef, useState } from 'react'
import type { AgentHealthSnapshot } from '../../../../shared/agent-health'
import { useAppStore } from '../../store'
import { getLocalAgentPreflightContext } from '@/lib/local-preflight-context'
import { callRuntimeRpc, RuntimeRpcCallError } from '@/runtime/runtime-rpc-client'

const AGENT_HEALTH_POLL_MS = 15 * 60_000

type AgentHealthProbeState = {
  snapshots: AgentHealthSnapshot[]
  isProbing: boolean
  loadError: boolean
  refresh: () => Promise<AgentHealthSnapshot[]>
}

async function requestAgentHealth(environmentId: string | null): Promise<AgentHealthSnapshot[]> {
  if (!environmentId) {
    return window.api.preflight.probeAgentHealth(
      getLocalAgentPreflightContext(useAppStore.getState())
    )
  }
  try {
    return await callRuntimeRpc<AgentHealthSnapshot[]>(
      { kind: 'environment', environmentId },
      'preflight.probeAgentHealth',
      undefined,
      { timeoutMs: 15_000 }
    )
  } catch (error) {
    if (error instanceof RuntimeRpcCallError && error.code === 'method_not_found') {
      return []
    }
    throw error
  }
}

export function useAgentHealth(
  environmentId: string | null,
  enabled = true
): AgentHealthProbeState {
  const [snapshots, setSnapshots] = useState<AgentHealthSnapshot[]>([])
  const [isProbing, setIsProbing] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const targetKey = environmentId ? `runtime:${environmentId}` : 'local'
  const targetKeyRef = useRef(targetKey)
  const pendingRef = useRef<{
    key: string
    promise: Promise<AgentHealthSnapshot[]>
  } | null>(null)
  const mountedRef = useRef(true)
  targetKeyRef.current = targetKey

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const refresh = useCallback((): Promise<AgentHealthSnapshot[]> => {
    if (!enabled) {
      return Promise.resolve([])
    }
    if (pendingRef.current?.key === targetKey) {
      return pendingRef.current.promise
    }
    setIsProbing(true)
    const pending = requestAgentHealth(environmentId)
      .then((next) => {
        if (mountedRef.current && targetKeyRef.current === targetKey) {
          setSnapshots(next)
          setLoadError(false)
        }
        return next
      })
      .catch((error) => {
        if (mountedRef.current && targetKeyRef.current === targetKey) {
          setLoadError(true)
        }
        throw error
      })
      .finally(() => {
        if (pendingRef.current?.promise === pending) {
          pendingRef.current = null
        }
        if (mountedRef.current && targetKeyRef.current === targetKey) {
          setIsProbing(false)
        }
      })
    pendingRef.current = { key: targetKey, promise: pending }
    return pending
  }, [enabled, environmentId, targetKey])

  useEffect(() => {
    setSnapshots([])
    setLoadError(false)
    if (!enabled) {
      return
    }
    void refresh().catch(() => {})
    const interval = window.setInterval(() => void refresh().catch(() => {}), AGENT_HEALTH_POLL_MS)
    return () => window.clearInterval(interval)
  }, [enabled, refresh])

  return { snapshots, isProbing, loadError, refresh }
}
