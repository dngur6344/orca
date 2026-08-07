export type AgentHealthProvider = 'claude' | 'codex'

export type AgentHealthState = 'healthy' | 'degraded' | 'unhealthy' | 'unknown'

export type AgentCliStatus = 'available' | 'unavailable'

export type AgentHealthCheckId = 'cli' | 'authentication' | 'provider' | 'websocket'

export type AgentHealthCheckStatus = 'ok' | 'warning' | 'failed'

export type AgentHealthCheck = {
  id: AgentHealthCheckId
  status: AgentHealthCheckStatus
}

export type AgentHealthSnapshot = {
  provider: AgentHealthProvider
  cliStatus: AgentCliStatus
  health: AgentHealthState
  version: string | null
  durationMs: number
  checkedAt: number
  checks: AgentHealthCheck[]
}
