import {
  ORCHESTRATION_RUN_CONSOLE_DISPATCH_LIMIT,
  ORCHESTRATION_RUN_CONSOLE_GATE_LIMIT,
  ORCHESTRATION_RUN_CONSOLE_MESSAGE_LIMIT,
  ORCHESTRATION_RUN_CONSOLE_OPERATOR_ACTION_LIMIT,
  ORCHESTRATION_RUN_CONSOLE_QUESTION_LIMIT,
  ORCHESTRATION_RUN_CONSOLE_TASK_LIMIT,
  ORCHESTRATION_RUN_CONSOLE_WORKER_LIMIT,
  type OrchestrationRunConsoleListResult,
  type OrchestrationRunConsoleSnapshot,
  type OrchestrationRunConsoleWorker
} from '../../../shared/orchestration-run-console'
import { buildOrchestrationRunConsoleAttention } from '../../../shared/orchestration-run-console-derived-state'
import type { OrchestrationDb } from './db'
import {
  buildRunSummary,
  mapDispatch,
  mapGate,
  mapOperatorAction,
  mapQuestion,
  mapTask
} from './run-console-projection-mappers'

export function listOrchestrationRunConsoleRuns(
  db: OrchestrationDb,
  params: { limit?: number; cursor?: string }
): OrchestrationRunConsoleListResult {
  const page = db.listRuns(params)
  const countByRun = new Map(
    db.getRunConsoleSummaryCounts(page.runs.map((run) => run.id)).map((row) => [row.run_id, row])
  )
  return {
    runs: page.runs.map((run) => buildRunSummary(run, countByRun.get(run.id))),
    nextCursor: page.nextCursor
  }
}

export function getOrchestrationRunConsoleSnapshot(
  db: OrchestrationDb,
  runId: string
): OrchestrationRunConsoleSnapshot | undefined {
  const run = db.getRun(runId)
  if (!run) {
    return undefined
  }
  const countRow = db.getRunConsoleSummaryCounts([runId])[0]
  const tasks = db.listRunConsoleTasks(runId, ORCHESTRATION_RUN_CONSOLE_TASK_LIMIT).map(mapTask)
  const dispatches = db
    .listRunConsoleDispatches(runId, ORCHESTRATION_RUN_CONSOLE_DISPATCH_LIMIT)
    .map(mapDispatch)
  const dispatchById = new Map(dispatches.map((dispatch) => [dispatch.id, dispatch]))
  const questions = db
    .listRunConsoleQuestions(runId, ORCHESTRATION_RUN_CONSOLE_QUESTION_LIMIT)
    .map(mapQuestion)
  const gates = db.listRunConsoleGates(runId, ORCHESTRATION_RUN_CONSOLE_GATE_LIMIT).map(mapGate)
  const messages = db
    .listRunConsoleMessages(runId, ORCHESTRATION_RUN_CONSOLE_MESSAGE_LIMIT)
    .map((message) => ({
      id: message.id,
      runId: message.run_id,
      fromHandle: message.from_handle,
      toHandle: message.to_handle,
      subject: message.subject,
      type: message.type,
      priority: message.priority,
      threadId: message.thread_id,
      createdAt: message.created_at
    }))
  const workers = db
    .listWorkerTerminalResources({ runId, limit: ORCHESTRATION_RUN_CONSOLE_WORKER_LIMIT })
    .map((worker): OrchestrationRunConsoleWorker => {
      const federation = db.getFederatedDispatch(worker.dispatchId)
      const dispatch = dispatchById.get(worker.dispatchId)
      return {
        dispatchId: worker.dispatchId,
        taskId: worker.taskId,
        runId: worker.runId,
        workerState: worker.workerState,
        dispatchStatus: worker.dispatchStatus,
        agentTerminalHandle: worker.agentTerminalHandle,
        terminalState: worker.terminalState,
        resource: worker.resource
          ? {
              id: worker.resource.id,
              worktreeId: worker.resource.worktree_id,
              terminalHandle: worker.resource.terminal_handle,
              ownershipState: worker.resource.ownership_state,
              releaseState: worker.resource.release_state,
              retainedReason: worker.resource.retained_reason
            }
          : null,
        federation: federation
          ? {
              environmentId: federation.environment_id,
              environmentName: federation.environment_name,
              remoteWorktreeId: federation.remote_worktree_id,
              remoteTerminalHandle: federation.remote_terminal_handle
            }
          : null,
        createdAt: dispatch?.createdAt ?? run.created_at
      }
    })
  const operatorActions = db
    .listRunConsoleOperatorActions(runId, ORCHESTRATION_RUN_CONSOLE_OPERATOR_ACTION_LIMIT)
    .map(mapOperatorAction)
  const runSummary = buildRunSummary(run, countRow)
  return {
    run: runSummary,
    tasks,
    dispatches,
    questions,
    gates,
    messages,
    workers,
    operatorActions,
    attention: buildOrchestrationRunConsoleAttention({
      tasks,
      dispatches,
      questions,
      gates,
      workers
    }),
    truncated: {
      tasks: runSummary.counts.tasks > tasks.length,
      dispatches: dispatches.length === ORCHESTRATION_RUN_CONSOLE_DISPATCH_LIMIT,
      questions: questions.length === ORCHESTRATION_RUN_CONSOLE_QUESTION_LIMIT,
      gates: gates.length === ORCHESTRATION_RUN_CONSOLE_GATE_LIMIT,
      messages: messages.length === ORCHESTRATION_RUN_CONSOLE_MESSAGE_LIMIT,
      workers: workers.length === ORCHESTRATION_RUN_CONSOLE_WORKER_LIMIT,
      operatorActions: operatorActions.length === ORCHESTRATION_RUN_CONSOLE_OPERATOR_ACTION_LIMIT
    }
  }
}
