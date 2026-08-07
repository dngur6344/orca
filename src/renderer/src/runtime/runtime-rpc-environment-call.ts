import { callAbortableRuntimeEnvironment } from './abortable-runtime-environment-call'

export async function callRuntimeEnvironmentWithRevision(args: {
  environmentId: string
  method: string
  params: unknown
  timeoutMs?: number
  signal?: AbortSignal
  orchestrationRequestId?: string
  expectedEnvironmentPairingRevision?: number
}): Promise<unknown> {
  if (args.signal && !args.orchestrationRequestId) {
    return callAbortableRuntimeEnvironment(
      args.environmentId,
      args.method,
      args.params,
      args.timeoutMs,
      args.signal,
      args.expectedEnvironmentPairingRevision
    )
  }
  return window.api.runtimeEnvironments.call({
    selector: args.environmentId,
    method: args.method,
    params: args.params,
    timeoutMs: args.timeoutMs,
    orchestrationRequestId: args.orchestrationRequestId,
    expectedEnvironmentPairingRevision: args.expectedEnvironmentPairingRevision
  })
}
