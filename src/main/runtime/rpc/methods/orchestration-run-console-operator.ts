import { z } from 'zod'
import { sendExactDispatchControlMessage } from '../../orchestration/dispatch-control-message'
import { OrchestrationError } from '../../orchestration/orchestration-error'
import { defineMethod, type RpcMethod } from '../core'
import { requiredString } from '../schemas'
import {
  assertDispatchInRun,
  assertMutableRun,
  executeOperatorAction,
  invokeWorkerMethod,
  type OperatorActionName
} from './orchestration-run-console-operator-execution'

const ConsoleReplyParams = z.object({
  run: requiredString('Missing --run'),
  question: requiredString('Missing --question'),
  body: requiredString('Missing --body')
})

const ConsoleResolveGateParams = z.object({
  run: requiredString('Missing --run'),
  gate: requiredString('Missing --gate'),
  resolution: requiredString('Missing --resolution')
})

const ConsoleFollowupParams = z.object({
  run: requiredString('Missing --run'),
  dispatch: requiredString('Missing --dispatch'),
  body: requiredString('Missing --body')
})

const ConsoleWorkerParams = z.object({
  run: requiredString('Missing --run'),
  dispatch: requiredString('Missing --dispatch')
})

export const ORCHESTRATION_RUN_CONSOLE_OPERATOR_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'orchestration.consoleReply',
    params: ConsoleReplyParams,
    handler: (params, ctx) => {
      const question = ctx.runtime.getOrchestrationDb().getQuestion(params.question)
      return executeOperatorAction(
        ctx,
        {
          runId: params.run,
          taskId: question
            ? ctx.runtime.getOrchestrationDb().getDispatchContextById(question.dispatch_id)?.task_id
            : null,
          dispatchId: question?.dispatch_id,
          action: 'reply'
        },
        () => {
          const db = ctx.runtime.getOrchestrationDb()
          assertMutableRun(ctx, params.run)
          if (!question || question.run_id !== params.run) {
            throw new OrchestrationError(
              'question_not_found',
              `Question ${params.question} was not found in Run ${params.run}.`
            )
          }
          const answered = db.answerQuestionAsOperator({
            messageId: params.question,
            runId: params.run,
            body: params.body
          })
          ctx.runtime.notifyMessageArrived(`dispatch:${question.dispatch_id}`, 'status')
          return answered
        }
      )
    }
  }),
  defineMethod({
    name: 'orchestration.consoleResolveGate',
    params: ConsoleResolveGateParams,
    handler: (params, ctx) => {
      const gate = ctx.runtime.getOrchestrationDb().getGate(params.gate)
      return executeOperatorAction(
        ctx,
        {
          runId: params.run,
          taskId: gate?.task_id,
          action: 'resolve_gate'
        },
        () => {
          const db = ctx.runtime.getOrchestrationDb()
          assertMutableRun(ctx, params.run)
          if (!gate || gate.run_id !== params.run) {
            throw new OrchestrationError(
              'gate_not_found',
              `Gate ${params.gate} was not found in Run ${params.run}.`
            )
          }
          const resolved = db.resolveGate(params.gate, params.resolution)
          if (!resolved) {
            throw new OrchestrationError(
              'gate_not_found',
              `Gate ${params.gate} was not found in Run ${params.run}.`
            )
          }
          return { gate: resolved }
        }
      )
    }
  }),
  defineMethod({
    name: 'orchestration.consoleSendFollowup',
    params: ConsoleFollowupParams,
    handler: (params, ctx) => {
      const dispatch = ctx.runtime.getOrchestrationDb().getDispatchContextById(params.dispatch)
      return executeOperatorAction(
        ctx,
        {
          runId: params.run,
          taskId: dispatch?.task_id,
          dispatchId: params.dispatch,
          action: 'send_followup'
        },
        async (actorFingerprint) => {
          assertMutableRun(ctx, params.run)
          assertDispatchInRun(ctx, params.run, params.dispatch)
          return sendExactDispatchControlMessage({
            runtime: ctx.runtime,
            runId: params.run,
            dispatchId: params.dispatch,
            from: `operator:${actorFingerprint.slice(0, 12)}`,
            subject: 'Operator follow-up',
            body: params.body,
            type: 'status',
            priority: 'normal',
            requireActive: true
          })
        }
      )
    }
  }),
  ...workerOperatorMethod(
    'orchestration.consoleStopWorker',
    'stop_worker',
    'orchestration.workerStop'
  ),
  ...workerOperatorMethod(
    'orchestration.consoleAbandonWorker',
    'abandon_worker',
    'orchestration.workerAbandon'
  ),
  ...workerOperatorMethod(
    'orchestration.consoleReleaseWorker',
    'release_worker',
    'orchestration.workerRelease'
  ),
  ...workerOperatorMethod(
    'orchestration.consoleRetainWorker',
    'retain_worker',
    'orchestration.workerRetain'
  )
]

function workerOperatorMethod(
  name: string,
  action: OperatorActionName,
  workerMethodName: string
): RpcMethod[] {
  return [
    defineMethod({
      name,
      params: ConsoleWorkerParams,
      handler: (params, ctx) => {
        const dispatch = ctx.runtime.getOrchestrationDb().getDispatchContextById(params.dispatch)
        return executeOperatorAction(
          ctx,
          {
            runId: params.run,
            taskId: dispatch?.task_id,
            dispatchId: params.dispatch,
            action
          },
          () => {
            assertMutableRun(ctx, params.run)
            assertDispatchInRun(ctx, params.run, params.dispatch)
            return invokeWorkerMethod(workerMethodName, params.dispatch, ctx)
          }
        )
      }
    })
  ]
}
