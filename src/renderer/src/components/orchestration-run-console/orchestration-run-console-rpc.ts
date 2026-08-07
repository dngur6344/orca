import type {
  OrchestrationRunConsoleListResult,
  OrchestrationRunConsoleSnapshot
} from '../../../../shared/orchestration-run-console'
import type { RuntimeCapability } from '../../../../shared/protocol-version'
import type { RuntimeStatus } from '../../../../shared/runtime-types'
import { installWindowVisibilityInterval } from '@/lib/window-visibility-interval'
import { callRuntimeRpc, type RuntimeClientTarget } from '@/runtime/runtime-rpc-client'

export type RunConsoleClientDependencies = {
  getCapabilities: (
    target: RuntimeClientTarget,
    signal: AbortSignal
  ) => Promise<readonly RuntimeCapability[]>
  listRuns: (
    target: RuntimeClientTarget,
    signal: AbortSignal,
    cursor?: string
  ) => Promise<OrchestrationRunConsoleListResult>
  getSnapshot: (
    target: RuntimeClientTarget,
    runId: string,
    signal: AbortSignal
  ) => Promise<OrchestrationRunConsoleSnapshot>
  callOperator: <TResult>(
    target: RuntimeClientTarget,
    method: string,
    params: Record<string, unknown>,
    requestId: string
  ) => Promise<TResult>
  installInterval: typeof installWindowVisibilityInterval
}

export const DEFAULT_RUN_CONSOLE_CLIENT_DEPENDENCIES: RunConsoleClientDependencies = {
  getCapabilities: async (target, signal) => {
    const status = await callRuntimeRpc<RuntimeStatus>(target, 'status.get', undefined, {
      signal,
      timeoutMs: 15_000
    })
    return status.capabilities ?? []
  },
  listRuns: (target, signal, cursor) =>
    callRuntimeRpc(target, 'orchestration.consoleList', cursor ? { cursor } : {}, {
      signal,
      timeoutMs: 15_000
    }),
  getSnapshot: (target, runId, signal) =>
    callRuntimeRpc(
      target,
      'orchestration.consoleSnapshot',
      { run: runId },
      { signal, timeoutMs: 15_000 }
    ),
  callOperator: (target, method, params, requestId) =>
    callRuntimeRpc(target, method, params, {
      orchestrationRequestId: requestId,
      timeoutMs: 30_000
    }),
  installInterval: installWindowVisibilityInterval
}
