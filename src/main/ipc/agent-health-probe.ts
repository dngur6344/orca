import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type {
  AgentHealthCheck,
  AgentHealthCheckId,
  AgentHealthCheckStatus,
  AgentHealthProvider,
  AgentHealthSnapshot,
  AgentHealthState,
  AgentUpdateAvailability,
  AgentUpdateResult
} from '../../shared/agent-health'
import { compareAppVersions, isValidAppVersion } from '../../shared/app-version'
import { resolveClaudeCommand, resolveCodexCommand } from '../../shared/node-cli-command-resolution'
import { getSpawnArgsForWindows } from '../win32-utils'
import { buildLocalPreflightEnv } from './preflight-local-env'
import { getPreflightWslTarget, type PreflightRuntimeContext } from './preflight-runtime-target'
import { runPreflightCommandInWsl } from './preflight-wsl-command'
import { shellQuote, type PreflightCommandResult } from './preflight-command-exec'

const execFileAsync = promisify(execFile)
const AGENT_HEALTH_TIMEOUT_MS = 12_000
const AGENT_UPDATE_TIMEOUT_MS = 5 * 60_000
const VERSION_PATTERN = /\d+\.\d+(?:\.\d+)?(?:[-+][\w.-]+)?/

const CODEX_CHECK_IDS: Partial<Record<string, AgentHealthCheckId>> = {
  'auth.credentials': 'authentication',
  'network.provider_reachability': 'provider',
  'network.websocket_reachability': 'websocket'
}

type CommandRunner = (
  provider: AgentHealthProvider,
  args: string[],
  context: PreflightRuntimeContext | undefined,
  timeoutMs: number
) => Promise<PreflightCommandResult>

type AgentCommandDependencies = {
  runCommand?: CommandRunner
  now?: () => number
}

type CodexDoctorReport = {
  checks: AgentHealthCheck[]
  latestVersion: string | null
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

function parseCodexDoctorReport(output: string): CodexDoctorReport | null {
  try {
    const report = JSON.parse(output) as {
      checks?: { id?: unknown; status?: unknown; details?: unknown }[]
    }
    if (!Array.isArray(report.checks)) {
      return null
    }
    const checks = report.checks.flatMap((check) => {
      const id = typeof check.id === 'string' ? CODEX_CHECK_IDS[check.id] : undefined
      const status = normalizedCheckStatus(check.status)
      return id && status ? [{ id, status }] : []
    })
    const updateDetails = report.checks.find((check) => check.id === 'updates.status')?.details
    const rawLatestVersion =
      updateDetails && typeof updateDetails === 'object' && 'latest version' in updateDetails
        ? updateDetails['latest version']
        : null
    const latestVersion =
      typeof rawLatestVersion === 'string'
        ? (rawLatestVersion.match(VERSION_PATTERN)?.[0] ?? null)
        : null
    return { checks, latestVersion }
  } catch {
    return null
  }
}

export function parseCodexDoctorChecks(output: string): AgentHealthCheck[] | null {
  return parseCodexDoctorReport(output)?.checks ?? null
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
  args: string[],
  timeoutMs: number
): Promise<PreflightCommandResult> {
  const env = buildLocalPreflightEnv()
  const pathEnv = env?.PATH ?? env?.Path ?? process.env.PATH ?? process.env.Path
  const command =
    provider === 'codex' ? resolveCodexCommand({ pathEnv }) : resolveClaudeCommand({ pathEnv })
  const { spawnCmd, spawnArgs } = getSpawnArgsForWindows(command, args)
  return execFileAsync(spawnCmd, spawnArgs, {
    encoding: 'utf-8',
    timeout: timeoutMs,
    windowsHide: true,
    ...(env ? { env } : {})
  }) as Promise<PreflightCommandResult>
}

async function runAgentCommand(
  provider: AgentHealthProvider,
  args: string[],
  context: PreflightRuntimeContext | undefined,
  timeoutMs: number
): Promise<PreflightCommandResult> {
  const wslTarget = getPreflightWslTarget(context)
  if (!wslTarget) {
    return runLocalCommand(provider, args, timeoutMs)
  }
  const command = [provider, ...args].map(shellQuote).join(' ')
  return runPreflightCommandInWsl(wslTarget, command, timeoutMs)
}

function updateAvailability(
  version: string | null,
  latestVersion: string | null
): AgentUpdateAvailability {
  if (
    !version ||
    !latestVersion ||
    !isValidAppVersion(version) ||
    !isValidAppVersion(latestVersion)
  ) {
    return 'unknown'
  }
  return compareAppVersions(version, latestVersion) < 0 ? 'available' : 'current'
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
    version = versionFromOutput(
      await runCommand(provider, ['--version'], context, AGENT_HEALTH_TIMEOUT_MS)
    )
  } catch {
    const checkedAt = now()
    return {
      provider,
      cliStatus: 'unavailable',
      health: 'unhealthy',
      version: null,
      durationMs: Math.max(0, checkedAt - startedAt),
      checkedAt,
      checks: [{ id: 'cli', status: 'failed' }],
      latestVersion: null,
      updateAvailability: 'unknown',
      updateSupported: false
    }
  }

  const checks: AgentHealthCheck[] = [{ id: 'cli', status: 'ok' }]
  let latestVersion: string | null = null
  const updateSupportPromise = runCommand(
    provider,
    ['update', '--help'],
    context,
    AGENT_HEALTH_TIMEOUT_MS
  )
  if (provider === 'codex') {
    const [doctorAttempt, updateSupportAttempt] = await Promise.allSettled([
      runCommand(provider, ['doctor', '--json'], context, AGENT_HEALTH_TIMEOUT_MS),
      updateSupportPromise
    ])
    const doctorOutput =
      doctorAttempt.status === 'fulfilled'
        ? doctorAttempt.value.stdout
        : commandOutputFromError(doctorAttempt.reason)
    const report = doctorOutput ? parseCodexDoctorReport(doctorOutput) : null
    if (report) {
      checks.push(...report.checks)
      latestVersion = report.latestVersion
    }
    const checkedAt = now()
    return {
      provider,
      cliStatus: 'available',
      health: healthFromChecks(checks),
      version,
      durationMs: Math.max(0, checkedAt - startedAt),
      checkedAt,
      checks,
      latestVersion,
      updateAvailability: updateAvailability(version, latestVersion),
      updateSupported: updateSupportAttempt.status === 'fulfilled'
    }
  }

  const updateSupported = await updateSupportPromise.then(
    () => true,
    () => false
  )
  const checkedAt = now()
  return {
    provider,
    cliStatus: 'available',
    health: healthFromChecks(checks),
    version,
    durationMs: Math.max(0, checkedAt - startedAt),
    checkedAt,
    checks,
    latestVersion: null,
    updateAvailability: 'unknown',
    updateSupported
  }
}

export function probeAgentHealth(
  context?: PreflightRuntimeContext,
  dependencies: AgentCommandDependencies = {}
): Promise<AgentHealthSnapshot[]> {
  const runCommand = dependencies.runCommand ?? runAgentCommand
  const now = dependencies.now ?? Date.now
  return Promise.all(
    (['claude', 'codex'] as const).map((provider) =>
      probeProvider(provider, context, runCommand, now)
    )
  )
}

export async function updateAgent(
  provider: AgentHealthProvider,
  context?: PreflightRuntimeContext,
  dependencies: AgentCommandDependencies = {}
): Promise<AgentUpdateResult> {
  const runCommand = dependencies.runCommand ?? runAgentCommand
  const before = versionFromOutput(
    await runCommand(provider, ['--version'], context, AGENT_HEALTH_TIMEOUT_MS)
  )
  if (!before) {
    throw new Error('Agent version unavailable before update')
  }
  await runCommand(provider, ['update'], context, AGENT_UPDATE_TIMEOUT_MS)
  const after = versionFromOutput(
    await runCommand(provider, ['--version'], context, AGENT_HEALTH_TIMEOUT_MS)
  )
  if (!after) {
    throw new Error('Agent version unavailable after update')
  }
  return {
    provider,
    outcome: before === after ? 'current' : 'updated',
    previousVersion: before,
    currentVersion: after
  }
}
