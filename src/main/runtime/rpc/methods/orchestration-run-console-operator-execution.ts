import type { OperatorActionRow } from '../../orchestration/types'
import { OrchestrationError } from '../../orchestration/orchestration-error'
import type { RpcContext } from '../core'
import { ORCHESTRATION_WORKER_METHODS } from './orchestration-worker-methods'

export type OperatorActionName =
  | 'reply'
  | 'resolve_gate'
  | 'send_followup'
  | 'stop_worker'
  | 'abandon_worker'
  | 'release_worker'
  | 'retain_worker'

export async function executeOperatorAction(
  ctx: RpcContext,
  target: {
    runId: string
    taskId?: string | null
    dispatchId?: string | null
    action: OperatorActionName
  },
  invoke: (actorFingerprint: string) => Promise<unknown> | unknown
): Promise<unknown> {
  const identity = requireOperatorIdentity(ctx)
  const db = ctx.runtime.getOrchestrationDb()
  db.beginOperatorAction({
    requestId: identity.requestId,
    actorFingerprint: identity.actorFingerprint,
    runId: target.runId,
    taskId: target.taskId,
    dispatchId: target.dispatchId,
    action: target.action
  })
  try {
    const result = await invoke(identity.actorFingerprint)
    const state = isOutcomeUnknown(result) ? 'outcome_unknown' : 'completed'
    const action = settleOperatorAction(ctx, identity, state)
    return attachOperatorAction(result, action)
  } catch (error) {
    settleOperatorAction(ctx, identity, 'failed', operatorErrorCode(error))
    throw error
  }
}

export function assertMutableRun(ctx: RpcContext, runId: string): void {
  const run = ctx.runtime.getOrchestrationDb().getRun(runId)
  if (!run) {
    throw new OrchestrationError('run_not_found', `Run ${runId} was not found.`)
  }
  if (run.legacy === 1) {
    throw new OrchestrationError(
      'legacy_read_only',
      `Run ${runId} is inspect-only and cannot accept operator actions.`
    )
  }
}

export function assertDispatchInRun(ctx: RpcContext, runId: string, dispatchId: string): void {
  const dispatch = ctx.runtime.getOrchestrationDb().getDispatchContextById(dispatchId)
  if (!dispatch || dispatch.run_id !== runId) {
    throw new OrchestrationError(
      'dispatch_not_found',
      `Dispatch ${dispatchId} was not found in Run ${runId}.`
    )
  }
}

export function invokeWorkerMethod(
  name: string,
  dispatch: string,
  ctx: RpcContext
): Promise<unknown> | unknown {
  const method = ORCHESTRATION_WORKER_METHODS.find((candidate) => candidate.name === name)
  if (!method) {
    throw new Error(`Worker method not found: ${name}`)
  }
  return method.handler({ dispatch }, ctx)
}

function requireOperatorIdentity(ctx: RpcContext): {
  actorFingerprint: string
  requestId: string
} {
  if (ctx.clientKind === 'mobile') {
    throw new OrchestrationError(
      'forbidden',
      'Run Console operator actions are unavailable to mobile clients.'
    )
  }
  const mutation = ctx.orchestrationMutation
  if (
    !mutation ||
    !ctx.authenticatedCallerFingerprint ||
    mutation.callerFingerprint !== ctx.authenticatedCallerFingerprint
  ) {
    throw new OrchestrationError(
      'durable_request_required',
      'Run Console operator actions require an authenticated durable request ID.'
    )
  }
  return {
    actorFingerprint: ctx.authenticatedCallerFingerprint,
    requestId: mutation.requestId
  }
}

function settleOperatorAction(
  ctx: RpcContext,
  identity: { actorFingerprint: string; requestId: string },
  state: 'completed' | 'failed' | 'outcome_unknown',
  errorCode?: string
): OperatorActionRow {
  try {
    return ctx.runtime.getOrchestrationDb().settleOperatorAction({
      ...identity,
      state,
      errorCode
    })
  } catch (error) {
    throw new OrchestrationError(
      'operation_unknown',
      `Operator action ${identity.requestId} may have completed but its audit outcome could not be recorded.`,
      {
        requestId: identity.requestId,
        cause: error instanceof Error ? error.message : String(error)
      }
    )
  }
}

function isOutcomeUnknown(result: unknown): boolean {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return false
  }
  const value = result as { state?: unknown; processAction?: unknown }
  return (
    (typeof value.state === 'string' && value.state.endsWith('_unknown')) ||
    value.processAction === 'unknown'
  )
}

function operatorErrorCode(error: unknown): string {
  return error instanceof OrchestrationError ? error.code : 'internal_error'
}

function attachOperatorAction(result: unknown, action: OperatorActionRow): unknown {
  const operatorAction = {
    id: action.id,
    requestId: action.request_id,
    state: action.state,
    replayCount: action.replay_count
  }
  return result && typeof result === 'object' && !Array.isArray(result)
    ? { ...(result as Record<string, unknown>), operatorAction }
    : { result, operatorAction }
}
