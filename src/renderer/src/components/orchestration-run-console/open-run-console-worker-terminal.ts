import type { OrchestrationRunConsoleWorker } from '../../../../shared/orchestration-run-console'
import { focusRendererTerminalHandle } from '@/components/terminal-pane/terminal-handle-links'
import { callRuntimeRpc, type RuntimeClientTarget } from '@/runtime/runtime-rpc-client'

export type RunConsoleWorkerTerminalTarget = {
  target: RuntimeClientTarget
  environmentId: string | null
  handle: string
}

export function resolveRunConsoleWorkerTerminalTarget(
  homeTarget: RuntimeClientTarget,
  worker: OrchestrationRunConsoleWorker
): RunConsoleWorkerTerminalTarget | null {
  const federatedHandle = worker.federation?.remoteTerminalHandle?.trim()
  if (federatedHandle && worker.federation) {
    return {
      target: { kind: 'environment', environmentId: worker.federation.environmentId },
      environmentId: worker.federation.environmentId,
      handle: federatedHandle
    }
  }
  const handle = worker.agentTerminalHandle?.trim()
  if (!handle) {
    return null
  }
  return {
    target: homeTarget,
    environmentId: homeTarget.kind === 'environment' ? homeTarget.environmentId : null,
    handle
  }
}

export async function openRunConsoleWorkerTerminal(
  homeTarget: RuntimeClientTarget,
  worker: OrchestrationRunConsoleWorker
): Promise<void> {
  const resolved = resolveRunConsoleWorkerTerminalTarget(homeTarget, worker)
  if (!resolved) {
    throw new Error('This worker has no terminal to open.')
  }
  if (focusRendererTerminalHandle(resolved.handle, resolved.environmentId)) {
    return
  }
  await callRuntimeRpc(resolved.target, 'terminal.focus', {
    terminal: resolved.handle,
    navigation: 'host'
  })
}
