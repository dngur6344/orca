import type { AgentHealthSnapshot } from '../../../../shared/agent-health'
import type {
  AgentProviderReadiness,
  AgentReadinessProvider,
  AgentReadinessState
} from './agent-readiness'

const STATE_PRIORITY: Record<AgentReadinessState, number> = {
  ready: 0,
  unknown: 1,
  checking: 2,
  degraded: 3,
  unavailable: 4,
  'action-required': 5
}

export function getAgentHealthSnapshot(
  snapshots: readonly AgentHealthSnapshot[],
  provider: AgentReadinessProvider
): AgentHealthSnapshot | null {
  return snapshots.find((snapshot) => snapshot.provider === provider) ?? null
}

function snapshotConnectionState(snapshot: AgentHealthSnapshot): AgentReadinessState {
  if (snapshot.cliStatus === 'unavailable') {
    return 'unavailable'
  }
  if (snapshot.checks.some((check) => check.id === 'authentication' && check.status === 'failed')) {
    return 'action-required'
  }
  if (snapshot.health === 'unhealthy' || snapshot.health === 'degraded') {
    return 'degraded'
  }
  return snapshot.health === 'healthy' ? 'ready' : 'unknown'
}

export function getProviderConnectionState(
  provider: AgentProviderReadiness,
  snapshot: AgentHealthSnapshot | null,
  healthPending: boolean
): AgentReadinessState {
  if (!snapshot && !healthPending) {
    return provider.state
  }
  const healthState = snapshot
    ? snapshotConnectionState(snapshot)
    : healthPending
      ? 'checking'
      : 'unknown'
  return STATE_PRIORITY[healthState] > STATE_PRIORITY[provider.state] ? healthState : provider.state
}

export function getOverallAgentConnectionState(
  providers: readonly AgentProviderReadiness[],
  snapshots: readonly AgentHealthSnapshot[],
  healthPending: boolean
): AgentReadinessState {
  return providers.reduce<AgentReadinessState>((current, provider) => {
    const state = getProviderConnectionState(
      provider,
      getAgentHealthSnapshot(snapshots, provider.provider),
      healthPending
    )
    return STATE_PRIORITY[state] > STATE_PRIORITY[current] ? state : current
  }, 'ready')
}
