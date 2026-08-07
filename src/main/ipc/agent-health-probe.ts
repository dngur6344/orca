import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type {
  AgentHealthCheck,
  AgentHealthCheckId,
  AgentHealthCheckStatus,
  AgentHealthProvider,
  AgentHealthSnapshot,
  AgentHealthState
} from '../../shared/agent-health'
import { resolveClaudeCommand, resolveCodexCommand } from '../../shared/node-cli-command-resolution'
import { getSpawnArgsForWindows } from '../win32-utils'
import { buildLocalPreflightEnv } from './preflight-local-env'
import { getPreflightWslTarget, type PreflightRuntimeContext } from './preflight-runtime-target'
import { runPreflightCommandInWsl } from './preflight-wsl-command'
import { shellQuote, type PreflightCommandResult } from './preflight-command-exec'

const execFileAsync = promisify(execFile)
const AGENT_HEALTH_TIMEOUT_MS = 12_000
const VERSION_PATTERN = /\d+\.\d+(?:\.\d+)?(?:[-+][\w.-]+)?/

const CODEX_CHECK_IDS: Partial<Record<string, AgentHealthCheckId>> = {
  'auth.credentials': 'authentication',
  'network.provider_reachability': 'provider',
  'network.websocket_reachability': 'websocket'
}

type CommandRunner = (
  provider: AgentHealthProvider,
  args: string[],
  context?: PreflightRuntimeContext
) => Promise<PreflightCommandResult>

type AgentHealthProbeDependencies = {
  runCommand?: CommandRunner
  now?: () => number
}

function healthFromChecks(checks: readonly AgentHealthCheck[]): AgentHealthState {
  if (checks.some((check) => check.status === 'failed')) {
    return 'unhealthy'
  }
  if (checks.some((check) => check.status === 'warning')) {
    return 'degraded'
  }
  return checks.length > 0 ? 'healthy' : 'unknown'
}

function normalizedCheckStatus(value: unknown): AgentHealthCheckStatus | null {
  if (value === 'ok') {
    return 'ok'
  }
  if (value === 'warning') {
    return 'warning'
  }
  return value === 'fail' ? 'failed' : null
}

export function parseCodexDoctorChecks(output: string): AgentHealthCheck[] | null {
  try {
    const report = JSON.parse(output) as { checks?: { id?: unknown; status?: unknown }[] }
    if (!Array.isArray(report.checks)) {
      return null
    }
    return report.checks.flatMap((check) => {
      const id = typeof check.id === 'string' ? CODEX_CHECK_IDS[check.id] : undefined
      const status = normalizedCheckStatus(check.status)
      return id && status ? [{ id, status }] : []
    })
  } catch {
    return null
  }
}

function versionFromOutput(result: PreflightCommandResult): string | null {
  const line = `${result.stdout}\n${result.stderr}`
    .split(/\r?\n/)
    .map((value) => value.trim())
    .find(Boolean)
  return line?.match(VERSION_PATTERN)?.[0] ?? null
}

function commandOutputFromError(error: unknown): string | null {
  if (!error || typeof error !== 'object') {
    return null
  }
  const stdout = 'stdout' in error && typeof error.stdout === 'string' ? error.stdout : ''
  return stdout.trim() ? stdout : null
}

async function runLocalCommand(
  provider: AgentHealthProvider,
  args: string[]
): Promise<PreflightCommandResult> {
  const env = buildLocalPreflightEnv()
  const pathEnv = env?.PATH ?? env?.Path ?? process.env.PATH ?? process.env.Path
  const command =
    provider === 'codex' ? resolveCodexCommand({ pathEnv }) : resolveClaudeCommand({ pathEnv })
  const { spawnCmd, spawnArgs } = getSpawnArgsForWindows(command, args)
  return execFileAsync(spawnCmd, spawnArgs, {
    encoding: 'utf-8',
    timeout: AGENT_HEALTH_TIMEOUT_MS,
    windowsHide: true,
    ...(env ? { env } : {})
  }) as Promise<PreflightCommandResult>
}

async function runAgentHealthCommand(
  provider: AgentHealthProvider,
  args: string[],
  context?: PreflightRuntimeContext
): Promise<PreflightCommandResult> {
  const wslTarget = getPreflightWslTarget(context)
  if (!wslTarget) {
    return runLocalCommand(provider, args)
  }
  const command = [provider, ...args].map(shellQuote).join(' ')
  return runPreflightCommandInWsl(wslTarget, command, AGENT_HEALTH_TIMEOUT_MS)
}

async function probeProvider(
  provider: AgentHealthProvider,
  context: PreflightRuntimeContext | undefined,
  runCommand: CommandRunner,
  now: () => number
): Promise<AgentHealthSnapshot> {
  const startedAt = now()
  let version: string | null = null
  try {
    version = versionFromOutput(await runCommand(provider, ['--version'], context))
  } catch {
    const checkedAt = now()
    return {
      provider,
      cliStatus: 'unavailable',
      health: 'unhealthy',
      version: null,
      durationMs: Math.max(0, checkedAt - startedAt),
      checkedAt,
      checks: [{ id: 'cli', status: 'failed' }]
    }
  }

  const checks: AgentHealthCheck[] = [{ id: 'cli', status: 'ok' }]
  if (provider === 'codex') {
    try {
      const result = await runCommand(provider, ['doctor', '--json'], context)
      checks.push(...(parseCodexDoctorChecks(result.stdout) ?? []))
    } catch (error) {
      const output = commandOutputFromError(error)
      checks.push(...(output ? (parseCodexDoctorChecks(output) ?? []) : []))
    }
  }

  const checkedAt = now()
  return {
    provider,
    cliStatus: 'available',
    health: healthFromChecks(checks),
    version,
    durationMs: Math.max(0, checkedAt - startedAt),
    checkedAt,
    checks
  }
}

export function probeAgentHealth(
  context?: PreflightRuntimeContext,
  dependencies: AgentHealthProbeDependencies = {}
): Promise<AgentHealthSnapshot[]> {
  const runCommand = dependencies.runCommand ?? runAgentHealthCommand
  const now = dependencies.now ?? Date.now
  return Promise.all(
    (['claude', 'codex'] as const).map((provider) =>
      probeProvider(provider, context, runCommand, now)
    )
  )
}
