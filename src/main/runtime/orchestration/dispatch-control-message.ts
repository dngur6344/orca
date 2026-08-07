import { ORCHESTRATION_FEDERATION_CONTROL_MAIL_PROTOCOL_VERSION } from '../../../shared/protocol-version'
import type { MessageDeliveryContract, MessagePriority, MessageType } from './types'
import { encodeFederatedControlMessage } from './federation-control-message'
import { OrchestrationError } from './orchestration-error'
import type { OrcaRuntimeService } from '../orca-runtime'

export async function sendExactDispatchControlMessage(args: {
  runtime: OrcaRuntimeService
  runId: string
  dispatchId: string
  from: string
  subject: string
  body?: string
  type?: MessageType
  priority?: MessagePriority
  threadId?: string
  payload?: string
  senderPaneKey?: string
  deliveryContract?: MessageDeliveryContract
  requireActive: boolean
}): Promise<unknown> {
  const db = args.runtime.getOrchestrationDb()
  const dispatch = db.getDispatchContextById(args.dispatchId)
  if (!dispatch || dispatch.run_id !== args.runId) {
    throw new OrchestrationError(
      'dispatch_not_found',
      `Dispatch ${args.dispatchId} was not found in Run ${args.runId}.`
    )
  }
  if (args.requireActive && dispatch.status !== 'pending' && dispatch.status !== 'dispatched') {
    throw new OrchestrationError(
      'dispatch_inactive',
      `Dispatch ${args.dispatchId} is not active in Run ${args.runId}.`
    )
  }
  const federated = db.getFederatedDispatch(args.dispatchId)
  if (federated) {
    if (federated.protocol_version < ORCHESTRATION_FEDERATION_CONTROL_MAIL_PROTOCOL_VERSION) {
      throw new OrchestrationError(
        'capability_unsupported',
        `Federated Dispatch ${args.dispatchId} does not support coordinator control mail; start a fresh worker after updating its Orca server.`
      )
    }
    if (db.getWorkerDispatch(args.dispatchId)?.state !== 'ready') {
      throw new OrchestrationError(
        'dispatch_inactive',
        `Federated Dispatch ${args.dispatchId} is not active.`
      )
    }
    const relay = db.enqueueFederationRelay({
      dispatchId: args.dispatchId,
      direction: 'to_worker',
      kind: 'control_message',
      payload: encodeFederatedControlMessage({
        from: args.from,
        subject: args.subject,
        body: args.body ?? '',
        type: args.type ?? 'status',
        priority: args.priority ?? 'normal',
        threadId: args.threadId ?? null,
        payload: args.payload ?? null
      })
    })
    args.runtime.ensureOrchestrationFederationRelay(args.runId)
    return {
      relay: {
        messageId: relay.message_id,
        sequence: relay.sequence,
        dispatchId: relay.dispatch_id,
        destination: 'worker',
        accepted: true
      }
    }
  }
  const message = db.insertMessage({
    from: args.from,
    to: `dispatch:${args.dispatchId}`,
    subject: args.subject,
    body: args.body,
    type: args.type,
    priority: args.priority,
    threadId: args.threadId,
    payload: args.payload,
    senderPaneKey: args.senderPaneKey,
    runId: args.runId,
    deliveryContract: args.deliveryContract
  })
  args.runtime.notifyMessageArrived(message.to_handle, message.type)
  return { message }
}
