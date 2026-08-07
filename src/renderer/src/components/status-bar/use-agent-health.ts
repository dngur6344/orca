import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AgentHealthProvider,
  AgentHealthSnapshot,
  AgentUpdateResult
} from '../../../../shared/agent-health'
import { useAppStore } from '../../store'
import { getLocalAgentPreflightContext } from '@/lib/local-preflight-context'
import { callRuntimeRpc, RuntimeRpcCallError } from '@/runtime/runtime-rpc-client'

const AGENT_HEALTH_POLL_MS = 15 * 60_000
const AGENT_HEALTH_TIMEOUT_MS = 35_000
const AGENT_UPDATE_TIMEOUT_MS = 5 * 60_000 + 15_000

type AgentHealthProbeState = {
  snapshots: AgentHealthSnapshot[]
  isProbing: boolean
  loadError: boolean
  updateStates: Partial<Record<AgentHealthProvider, AgentUpdateUiState>>
  refresh: () => Promise<AgentHealthSnapshot[]>
  update: (provider: AgentHealthProvider) => Promise<AgentUpdateResult | null>
}

export type AgentUpdateUiState = {
  status: 'updating' | 'updated' | 'current' | 'failed'
  version: string | null
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
      { timeoutMs: AGENT_HEALTH_TIMEOUT_MS }
    )
  } catch (error) {
    if (error instanceof RuntimeRpcCallError && error.code === 'method_not_found') {
      return []
    }
    throw error
  }
}

async function requestAgentUpdate(
  environmentId: string | null,
  provider: AgentHealthProvider
): Promise<AgentUpdateResult> {
  if (!environmentId) {
    const context = getLocalAgentPreflightContext(useAppStore.getState())
    return window.api.preflight.updateAgent({ ...context, provider })
  }
  return callRuntimeRpc<AgentUpdateResult>(
    { kind: 'environment', environmentId },
    'preflight.updateAgent',
    { provider },
    { timeoutMs: AGENT_UPDATE_TIMEOUT_MS }
  )
}

export function useAgentHealth(
  environmentId: string | null,
  enabled = true
): AgentHealthProbeState {
  const [snapshots, setSnapshots] = useState<AgentHealthSnapshot[]>([])
  const [isProbing, setIsProbing] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [updateStates, setUpdateStates] = useState<
    Partial<Record<AgentHealthProvider, AgentUpdateUiState>>
  >({})
  const targetKey = environmentId ? `runtime:${environmentId}` : 'local'
  const targetKeyRef = useRef(targetKey)
  const pendingRef = useRef<{
    key: string
    promise: Promise<AgentHealthSnapshot[]>
  } | null>(null)
  const mountedRef = useRef(true)
  const updatePendingRef = useRef(new Map<string, Promise<AgentUpdateResult | null>>())
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

  const update = useCallback(
    (provider: AgentHealthProvider): Promise<AgentUpdateResult | null> => {
      const updateKey = `${targetKey}:${provider}`
      const existing = updatePendingRef.current.get(updateKey)
      if (existing) {
        return existing
      }
      setUpdateStates((states) => ({
        ...states,
        [provider]: { status: 'updating', version: null }
      }))
      const pending = requestAgentUpdate(environmentId, provider)
        .then((result) => {
          if (mountedRef.current && targetKeyRef.current === targetKey) {
            setUpdateStates((states) => ({
              ...states,
              [provider]: { status: result.outcome, version: result.currentVersion }
            }))
            void refresh().catch(() => {})
          }
          return result
        })
        .catch(() => {
          if (mountedRef.current && targetKeyRef.current === targetKey) {
            setUpdateStates((states) => ({
              ...states,
              [provider]: { status: 'failed', version: null }
            }))
          }
          return null
        })
        .finally(() => updatePendingRef.current.delete(updateKey))
      updatePendingRef.current.set(updateKey, pending)
      return pending
    },
    [environmentId, refresh, targetKey]
  )

  useEffect(() => {
    setSnapshots([])
    setLoadError(false)
    setUpdateStates({})
    if (!enabled) {
      return
    }
    void refresh().catch(() => {})
    const interval = window.setInterval(() => void refresh().catch(() => {}), AGENT_HEALTH_POLL_MS)
    return () => window.clearInterval(interval)
  }, [enabled, refresh])

  return { snapshots, isProbing, loadError, updateStates, refresh, update }
}
