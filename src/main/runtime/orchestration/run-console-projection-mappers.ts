import type {
  OrchestrationRunConsoleCounts,
  OrchestrationRunConsoleDispatch,
  OrchestrationRunConsoleGate,
  OrchestrationRunConsoleOperatorAction,
  OrchestrationRunConsoleQuestion,
  OrchestrationRunConsoleRunSummary,
  OrchestrationRunConsoleTask
} from '../../../shared/orchestration-run-console'
import {
  deriveOrchestrationRunConsoleState,
  parseOrchestrationConsoleOptions,
  parseOrchestrationTaskDependencies
} from '../../../shared/orchestration-run-console-derived-state'
import { buildOrchestrationTaskDisplayMetadata } from '../../../shared/orchestration-task-display'
import type { OperatorActionRow } from './types'
import type { RunConsoleQuestionRow, RunConsoleSummaryCountRow } from './db'

const EMPTY_COUNTS: OrchestrationRunConsoleCounts = {
  tasks: 0,
  terminalTasks: 0,
  activeTasks: 0,
  pendingQuestions: 0,
  pendingGates: 0,
  failedTasks: 0,
  circuitBrokenDispatches: 0,
  resourceDecisions: 0
}

export function buildRunSummary(
  run: {
    id: string
    objective: string
    legacy: number
    created_at: string
    updated_at: string
  },
  countRow: RunConsoleSummaryCountRow | undefined
): OrchestrationRunConsoleRunSummary {
  const counts = countRow ? mapCounts(countRow) : { ...EMPTY_COUNTS }
  const legacyReadOnly = run.legacy === 1
  return {
    id: run.id,
    objective: run.objective,
    legacyReadOnly,
    state: deriveOrchestrationRunConsoleState(counts, legacyReadOnly),
    counts,
    createdAt: run.created_at,
    updatedAt: run.updated_at
  }
}

export function mapTask(task: {
  id: string
  run_id: string
  parent_id: string | null
  task_title: string | null
  display_name: string | null
  spec: string
  status: OrchestrationRunConsoleTask['status']
  deps: string
  result: string | null
  created_at: string
  completed_at: string | null
}): OrchestrationRunConsoleTask {
  const display = buildOrchestrationTaskDisplayMetadata({
    spec: task.spec,
    taskTitle: task.task_title,
    displayName: task.display_name
  })
  const dependencies = parseOrchestrationTaskDependencies(task.deps)
  return {
    id: task.id,
    runId: task.run_id,
    parentId: task.parent_id,
    title: display.taskTitle,
    displayName: display.displayName,
    spec: task.spec,
    status: task.status,
    dependencyIds: dependencies.dependencyIds,
    dependenciesValid: dependencies.valid,
    result: task.result,
    createdAt: task.created_at,
    completedAt: task.completed_at
  }
}

export function mapDispatch(dispatch: {
  id: string
  run_id: string
  task_id: string
  contract_version: number
  assignee_handle: string | null
  status: OrchestrationRunConsoleDispatch['status']
  failure_count: number
  last_failure: string | null
  dispatched_at: string | null
  completed_at: string | null
  created_at: string
  last_heartbeat_at: string | null
}): OrchestrationRunConsoleDispatch {
  return {
    id: dispatch.id,
    runId: dispatch.run_id,
    taskId: dispatch.task_id,
    contractVersion: dispatch.contract_version,
    assigneeHandle: dispatch.assignee_handle,
    status: dispatch.status,
    failureCount: dispatch.failure_count,
    lastFailure: dispatch.last_failure,
    dispatchedAt: dispatch.dispatched_at,
    completedAt: dispatch.completed_at,
    createdAt: dispatch.created_at,
    lastHeartbeatAt: dispatch.last_heartbeat_at
  }
}

export function mapGate(gate: {
  id: string
  run_id: string
  task_id: string
  question: string
  options: string
  status: OrchestrationRunConsoleGate['status']
  resolution: string | null
  created_at: string
  resolved_at: string | null
}): OrchestrationRunConsoleGate {
  return {
    id: gate.id,
    runId: gate.run_id,
    taskId: gate.task_id,
    question: gate.question,
    options: parseOrchestrationConsoleOptions(gate.options),
    status: gate.status,
    resolution: gate.resolution,
    createdAt: gate.created_at,
    resolvedAt: gate.resolved_at
  }
}

export function mapQuestion(question: RunConsoleQuestionRow): OrchestrationRunConsoleQuestion {
  const payload = parseQuestionPayload(question.question_payload)
  return {
    messageId: question.message_id,
    runId: question.run_id,
    taskId: question.task_id,
    dispatchId: question.dispatch_id,
    prompt: question.prompt ?? '',
    options: payload.options,
    status: question.status,
    createdAt: question.created_at,
    answeredAt: question.answered_at
  }
}

export function mapOperatorAction(
  action: OperatorActionRow
): OrchestrationRunConsoleOperatorAction {
  return {
    id: action.id,
    requestId: action.request_id,
    action: action.action,
    state: action.state,
    runId: action.run_id,
    taskId: action.task_id,
    dispatchId: action.dispatch_id,
    actorFingerprint: action.actor_fingerprint,
    errorCode: action.error_code,
    replayCount: action.replay_count,
    createdAt: action.created_at,
    updatedAt: action.updated_at
  }
}

function mapCounts(row: RunConsoleSummaryCountRow): OrchestrationRunConsoleCounts {
  return {
    tasks: row.tasks,
    terminalTasks: row.terminal_tasks,
    activeTasks: row.active_tasks,
    pendingQuestions: row.pending_questions,
    pendingGates: row.pending_gates,
    failedTasks: row.failed_tasks,
    circuitBrokenDispatches: row.circuit_broken_dispatches,
    resourceDecisions: row.resource_decisions
  }
}

function parseQuestionPayload(raw: string | null): { options: string[] } {
  try {
    const payload: unknown = JSON.parse(raw ?? '{}')
    const options =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as { options?: unknown }).options
        : undefined
    return { options: parseOrchestrationConsoleOptions(JSON.stringify(options ?? [])) }
  } catch {
    return { options: [] }
  }
}
