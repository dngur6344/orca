import type {
  OrchestrationRunConsoleAttentionItem,
  OrchestrationRunConsoleCounts,
  OrchestrationRunConsoleDispatch,
  OrchestrationRunConsoleGate,
  OrchestrationRunConsoleQuestion,
  OrchestrationRunConsoleRunState,
  OrchestrationRunConsoleTask,
  OrchestrationRunConsoleWorker
} from './orchestration-run-console'

export type OrchestrationRunConsoleDependencyIssues = {
  invalidTaskIds: string[]
  missingDependencyIds: string[]
  cyclicTaskIds: string[]
}

export function deriveOrchestrationRunConsoleState(
  counts: OrchestrationRunConsoleCounts,
  legacyReadOnly = false
): OrchestrationRunConsoleRunState {
  if (legacyReadOnly) {
    return 'unknown'
  }
  if (
    counts.pendingQuestions > 0 ||
    counts.pendingGates > 0 ||
    counts.failedTasks > 0 ||
    counts.circuitBrokenDispatches > 0 ||
    counts.resourceDecisions > 0
  ) {
    return 'needs_attention'
  }
  if (counts.tasks > 0 && counts.terminalTasks === counts.tasks) {
    return 'completed'
  }
  return 'active'
}

export function parseOrchestrationTaskDependencies(raw: string): {
  dependencyIds: string[]
  valid: boolean
} {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed) || !parsed.every((value) => typeof value === 'string')) {
      return { dependencyIds: [], valid: false }
    }
    return { dependencyIds: [...new Set(parsed)], valid: true }
  } catch {
    return { dependencyIds: [], valid: false }
  }
}

export function inspectOrchestrationRunConsoleDependencies(
  tasks: readonly Pick<OrchestrationRunConsoleTask, 'id' | 'dependencyIds' | 'dependenciesValid'>[]
): OrchestrationRunConsoleDependencyIssues {
  const taskIds = new Set(tasks.map((task) => task.id))
  const missingDependencyIds = new Set<string>()
  const invalidTaskIds = tasks
    .filter((task) => !task.dependenciesValid)
    .map((task) => task.id)
    .sort()
  const indegree = new Map(tasks.map((task) => [task.id, 0]))
  const dependents = new Map<string, string[]>()
  for (const task of tasks) {
    for (const dependencyId of task.dependencyIds) {
      if (!taskIds.has(dependencyId)) {
        missingDependencyIds.add(dependencyId)
        continue
      }
      indegree.set(task.id, (indegree.get(task.id) ?? 0) + 1)
      dependents.set(dependencyId, [...(dependents.get(dependencyId) ?? []), task.id])
    }
  }
  const ready = [...indegree.entries()]
    .filter(([, count]) => count === 0)
    .map(([id]) => id)
    .sort()
  for (let index = 0; index < ready.length; index += 1) {
    const completedId = ready[index]!
    for (const dependentId of dependents.get(completedId) ?? []) {
      const next = (indegree.get(dependentId) ?? 0) - 1
      indegree.set(dependentId, next)
      if (next === 0) {
        ready.push(dependentId)
      }
    }
  }
  return {
    invalidTaskIds,
    missingDependencyIds: [...missingDependencyIds].sort(),
    cyclicTaskIds: [...indegree.entries()]
      .filter(([, count]) => count > 0)
      .map(([id]) => id)
      .sort()
  }
}

export function parseOrchestrationConsoleOptions(raw: string | null): string[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? '[]')
    return Array.isArray(parsed) && parsed.every((value) => typeof value === 'string') ? parsed : []
  } catch {
    return []
  }
}

export function buildOrchestrationRunConsoleAttention(args: {
  tasks: readonly OrchestrationRunConsoleTask[]
  dispatches: readonly OrchestrationRunConsoleDispatch[]
  questions: readonly OrchestrationRunConsoleQuestion[]
  gates: readonly OrchestrationRunConsoleGate[]
  workers: readonly OrchestrationRunConsoleWorker[]
}): OrchestrationRunConsoleAttentionItem[] {
  const items: OrchestrationRunConsoleAttentionItem[] = []
  for (const question of args.questions) {
    if (question.status === 'pending') {
      items.push({
        id: `question:${question.messageId}`,
        kind: 'question',
        runId: question.runId,
        taskId: question.taskId,
        dispatchId: question.dispatchId,
        createdAt: question.createdAt
      })
    }
  }
  for (const gate of args.gates) {
    if (gate.status === 'pending') {
      items.push({
        id: `gate:${gate.id}`,
        kind: 'gate',
        runId: gate.runId,
        taskId: gate.taskId,
        dispatchId: null,
        createdAt: gate.createdAt
      })
    }
  }
  const failedTaskIds = new Set<string>()
  for (const task of args.tasks) {
    if (task.status === 'failed') {
      failedTaskIds.add(task.id)
      items.push({
        id: `failure:task:${task.id}`,
        kind: 'failure',
        runId: task.runId,
        taskId: task.id,
        dispatchId: null,
        createdAt: task.completedAt ?? task.createdAt
      })
    }
  }
  for (const dispatch of args.dispatches) {
    if (dispatch.status === 'circuit_broken' && !failedTaskIds.has(dispatch.taskId)) {
      items.push({
        id: `failure:dispatch:${dispatch.id}`,
        kind: 'failure',
        runId: dispatch.runId,
        taskId: dispatch.taskId,
        dispatchId: dispatch.id,
        createdAt: dispatch.completedAt ?? dispatch.createdAt
      })
    }
  }
  for (const worker of args.workers) {
    if (
      worker.resource?.ownershipState === 'owned' &&
      (worker.resource.releaseState === 'not_requested' ||
        worker.resource.releaseState === 'unknown')
    ) {
      items.push({
        id: `resource:${worker.resource.id}`,
        kind: 'resource',
        runId: worker.runId,
        taskId: worker.taskId,
        dispatchId: worker.dispatchId,
        createdAt: worker.createdAt
      })
    }
  }
  const rank = { question: 0, gate: 1, failure: 2, resource: 3 } as const
  return items.sort(
    (left, right) =>
      rank[left.kind] - rank[right.kind] ||
      left.createdAt.localeCompare(right.createdAt) ||
      left.id.localeCompare(right.id)
  )
}
